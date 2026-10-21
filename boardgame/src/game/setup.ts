/**
 * Initial state from a map file (spec 1.4, 2) and a seat roster.
 */
import { BALANCE } from './balance';
import { hotelValue, random, shuffleInPlace } from './board';
import { withinHops } from '../utils/cellGraph';
import { FACTION_PERSONNEL, deckList } from './cards';
import { startTurn } from './engine';
import type { MapFile } from './maps';
import { drawPersonnel, drawPolitics } from './markets';
import type { Cell, CellId, GameOptions, LandgrabState, PlayerState, PlayerType, Site } from './types';
import { BUILDABLE, SEA, WATER } from './types';

const FOUNDING_RADIUS = 2;

/**
 * Where a faction founds its first building: the best buildable cell within
 * two hops of its landing. The Industrialist wants land to extract next door,
 * the Hotelier the best sale value; the Bureaucrat and Chieftain stay put.
 */
function foundingCell(G: LandgrabState, start: CellId, type: PlayerType, taken: Set<CellId>): CellId {
  if (type === 'Bureaucrat' || type === 'Chieftain') return start;
  let best = start;
  let bestScore = -Infinity;
  for (const id of [...withinHops(G, start, FOUNDING_RADIUS)].sort((a, b) => a - b)) {
    const c = G.cells[id];
    if (!BUILDABLE.has(c.terrain) || c.siteId !== undefined || taken.has(id)) continue;
    let score: number;
    if (type === 'Industrialist') {
      score = c.neighbors.filter((n) => ['Rainforest', 'Hills', 'Mountain'].includes(G.cells[n].terrain)).length;
    } else {
      score = hotelValue(G, id);
    }
    score -= id === start ? 0 : 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export const DEFAULT_ROSTERS: Record<2 | 3 | 4, PlayerType[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

export const DEFAULT_OPTIONS: GameOptions = {
  erosionByElevation: false,
  pressCoverage: false,
  clearanceYield: 1,
  chieftainSurveyIncome: 1,
};

export interface SetupOptions {
  /** Seed for shuffles and erosion. */
  seed?: number;
  options?: Partial<GameOptions>;
  seatsToWin?: number;
  roundCap?: number;
  /** Replace the drafted decks (balance experiments). */
  personnelDeck?: string[];
  politicsDeck?: string[];
}

export function createInitialState(map: MapFile, roster: PlayerType[], setup: SetupOptions = {}): LandgrabState {
  if (roster.length < 2 || roster.length > 4) throw new Error('createInitialState: 2-4 players');
  if (new Set(roster).size !== roster.length) throw new Error('createInitialState: duplicate faction');
  const options: GameOptions = { ...DEFAULT_OPTIONS, ...setup.options };

  const cells: Cell[] = map.cells.map((mc) => ({
    id: mc.id,
    neighbors: [...mc.neighbors],
    terrain: mc.terrain,
    elevation: mc.elevation,
    fog: false,
    ...(mc.siteId !== undefined ? { siteId: mc.siteId } : {}),
  }));

  // The coastal rim starts revealed; everything inland is Fog (spec 4.1).
  for (const c of cells) {
    if (SEA.has(c.terrain)) continue;
    const rim = c.neighbors.some((n) => SEA.has(cells[n].terrain));
    c.fog = !rim;
  }

  const sites: Site[] = map.sites.map((s) => ({
    id: s.id,
    cells: [...s.cells],
    significance: s.significance,
    revealed: false,
    status: 'Untouched',
  }));

  const players: PlayerState[] = roster.map((type, i) => ({
    type,
    tableau: [FACTION_PERSONNEL[type], 'Guide', 'Liaison', 'Restructuring'].map((cardType, k) => ({
      instanceId: `${cardType}#p${i}c${k}`,
      cardType,
    })),
    resources: { ...BALANCE.startingResources[type] },
    seats: 0,
  }));

  const G: LandgrabState = {
    mapId: map.id,
    cells,
    sites,
    totalFog: 0,
    fogRevealed: 0,
    landCount: 0,
    mandateTriggered: false,
    players,
    order: roster.map((_, i) => i),
    turn: { seat: 0, player: 0, round: 1, actionsLeft: 0, usedCards: [], actionsTaken: 0, spreadDone: true, reclaimDone: true },
    grievance: 0,
    holdingsRemaining: BALANCE.holdingSupply,
    presenceRemaining: BALANCE.presenceSupply,
    scouted: {},
    favors: [],
    lastSeasonStage: 0,
    objectionUsedThisRound: false,
    personnelRow: [null, null, null, null],
    personnelDeck: [],
    politicsRow: [null, null, null, null],
    politicsDeck: [],
    woodMarket: [false, false, true, true],
    oreMarket: [false, false, true, true],
    mandatesRemaining: roster.length * BALANCE.mandatesPerPlayer + BALANCE.mandateExtra,
    mandatesInDeck: roster.length * BALANCE.mandatesPerPlayer + BALANCE.mandateExtra,
    politicsDrawsSinceMandate: 0,
    mandateIntervalIndex: 0,
    reaction: null,
    proposals: [],
    messages: [],
    log: [],
    seatsToWin: setup.seatsToWin ?? BALANCE.seatsToWin,
    roundCap: setup.roundCap ?? BALANCE.roundCap,
    options,
    rng: (setup.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    nextId: 0,
    stats: {
      surveys: 0,
      surveyRevealed: [],
      scarsByRound: [],
      clustersByRound: [],
      reclamations: 0,
      interrupts: 0,
      objections: 0,
      erosionScars: 0,
      fogAdjacentBuilds: 0,
      acquired: roster.map(() => ({})),
      played: roster.map(() => ({})),
      options: roster.map(() => ({})),
      mandateRounds: roster.map(() => []),
    },
  };
  random(G); // decorrelate from the raw seed

  // Starting positions: each faction lands at its own map start (spec 1.1)
  // and founds its first building on the best cell within two hops.
  const taken = new Set<number>();
  for (const [i, type] of roster.entries()) {
    const start = map.starts.find((s) => s.faction === type);
    if (!start) throw new Error(`Map ${map.id} has no start for ${type}`);
    const cell = G.cells[foundingCell(G, start.cell, type, taken)];
    for (const id of withinHops(G, cell.id, 1)) {
      taken.add(id);
      G.cells[id].fog = false;
    }
    for (const id of withinHops(G, start.cell, 1)) G.cells[id].fog = false;
    switch (type) {
      case 'Industrialist':
        cell.building = 'IndustrialZone';
        cell.buildingOwner = 'Industrialist';
        break;
      case 'Hotelier':
        cell.building = 'Hotel';
        cell.buildingOwner = 'Hotelier';
        cell.holding = 'Hotelier';
        G.holdingsRemaining -= 1;
        break;
      case 'Bureaucrat':
        cell.building = 'PublicWork';
        break;
      case 'Chieftain':
        cell.village = true;
        break;
    }
    void i;
  }
  // Water never stays fogged once the land around it is known; lakes inland stay hidden.
  for (const c of G.cells) if (WATER.has(c.terrain) && SEA.has(c.terrain)) c.fog = false;

  G.totalFog = G.cells.filter((c) => c.fog).length;
  G.landCount = G.cells.filter((c) => !SEA.has(c.terrain)).length;

  G.personnelDeck = shuffleInPlace(G, setup.personnelDeck ? [...setup.personnelDeck] : deckList('personnel', options));
  G.politicsDeck = shuffleInPlace(G, setup.politicsDeck ? [...setup.politicsDeck] : deckList('politics', options));
  for (let i = 0; i < 4; i++) {
    G.personnelRow[i] = drawPersonnel(G);
    G.politicsRow[i] = drawPolitics(G);
  }

  startTurn(G);
  return G;
}
