/**
 * Board rules shared by every faction: legality, scoring, fog, erosion.
 * All functions mutate or read `G` directly (boardgame.io gives moves an Immer draft).
 */
import { BALANCE } from './balance';
import type {
  BuildingType,
  Cell,
  CellId,
  LandgrabState,
  PlayerType,
  Site,
} from './types';
import { BUILDABLE, SEA, WATER } from './types';
import { components, largestComponent, nearest } from '../utils/cellGraph';

// ---------------------------------------------------------------------------
// Randomness: a mulberry32 stream kept in state so games replay identically.
// ---------------------------------------------------------------------------

export function random(G: LandgrabState): number {
  G.rng = (G.rng + 0x6d2b79f5) | 0;
  let t = G.rng;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffleInPlace<T>(G: LandgrabState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(G) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newId(G: LandgrabState, prefix: string): string {
  G.nextId += 1;
  return `${prefix}#${G.nextId}`;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function indexOfFaction(G: LandgrabState, type: PlayerType): number {
  return G.players.findIndex((p) => p.type === type);
}

export function factionOf(G: LandgrabState, playerIndex: number): PlayerType {
  return G.players[playerIndex].type;
}

export function log(G: LandgrabState, player: number, text: string): void {
  G.log.push({ round: G.turn.round, player, text });
  if (G.log.length > 200) G.log.splice(0, G.log.length - 200);
}

// ---------------------------------------------------------------------------
// Cell predicates
// ---------------------------------------------------------------------------

export const isWater = (c: Cell) => WATER.has(c.terrain);
export const isLand = (c: Cell) => !WATER.has(c.terrain);
export const isDeveloped = (c: Cell) => c.building !== undefined;
export const isScar = (c: Cell) => c.terrain === 'Scar';
/** Land that is not built on and not a Scar. Holdings, Presence and Villages count as undeveloped. */
export const isOpenLand = (c: Cell) => isLand(c) && !isScar(c) && !isDeveloped(c);
export const hasClaim = (c: Cell) => !!c.presence || !!c.village;

export function nearPresence(G: LandgrabState, id: CellId): boolean {
  const c = G.cells[id];
  if (hasClaim(c)) return true;
  return c.neighbors.some((nb) => hasClaim(G.cells[nb]));
}

export function fogAdjacent(G: LandgrabState, id: CellId): boolean {
  return G.cells[id].neighbors.some((nb) => G.cells[nb].fog);
}

/** Whether `viewer` may see the true terrain of a cell. The Chieftain knows the whole island. */
export function knowsCell(G: LandgrabState, viewer: PlayerType, id: CellId): boolean {
  const c = G.cells[id];
  if (!c.fog) return true;
  if (viewer === 'Chieftain') return true;
  return (G.scouted[viewer] ?? []).includes(id);
}

export function siteOf(G: LandgrabState, id: CellId): Site | undefined {
  const sid = G.cells[id].siteId;
  return sid === undefined ? undefined : G.sites[sid];
}

// ---------------------------------------------------------------------------
// Grievance and Standing (spec 3.1)
// ---------------------------------------------------------------------------

export function chieftainIndex(G: LandgrabState): number {
  return indexOfFaction(G, 'Chieftain');
}

export function addGrievance(G: LandgrabState, n: number, why: string): void {
  const chief = chieftainIndex(G);
  if (chief < 0 || n <= 0) return;
  const before = G.grievance;
  G.grievance = Math.min(BALANCE.grievanceCap, G.grievance + n);
  if (G.grievance !== before) log(G, chief, `+${G.grievance - before} Grievance (${why})`);
}

/**
 * Standing: size of the largest connected group of claimed cells (Presence or
 * Village). Claimed cells are always undeveloped and never Scars: building or
 * scarring removes the claim. Holdings may share a cell with Presence.
 */
export function standing(G: LandgrabState): number {
  return largestComponent(G, (c) => hasClaim(c) && !isScar(c) && !isDeveloped(c)).size;
}

export function villageCount(G: LandgrabState): number {
  return G.cells.filter((c) => c.village).length;
}

// ---------------------------------------------------------------------------
// Hotel sale value (spec 3.3) — water counts as scenic.
// ---------------------------------------------------------------------------

export function hotelValue(G: LandgrabState, id: CellId, opts?: { asIfTerrain?: Cell['terrain'] }): number {
  const c = G.cells[id];
  const terrain = opts?.asIfTerrain ?? c.terrain;
  let v = 0;
  const nbs = c.neighbors.map((n) => G.cells[n]);
  if (terrain === 'Beach' && nbs.some(isWater)) v += 2;
  for (const n of nbs) {
    if (n.terrain === 'CoastalWater' || n.terrain === 'CraterLake' || n.terrain === 'Mountain' || n.terrain === 'Rainforest') v += 1;
    if (n.building === 'Hotel' || n.building === 'Housing' || n.building === 'PublicWork') v += 1;
    const site = n.siteId !== undefined ? G.sites[n.siteId] : undefined;
    if (site?.status === 'Listed') v += 1;
    if (n.building === 'Museum' || site?.status === 'Museum') v += 2;
    if (n.building === 'IndustrialZone') v -= 1;
    if (n.terrain === 'Scar') v -= 2;
  }
  if (G.lastSeasonStage >= 2) v -= BALANCE.stage2HotelPenalty;
  return Math.max(0, v);
}

// ---------------------------------------------------------------------------
// Placement legality
// ---------------------------------------------------------------------------

/**
 * Shared rules for putting a building on a cell. Faction-specific adjacency
 * is checked by the caller. Returns a reason when illegal.
 */
export function buildBlocker(
  G: LandgrabState,
  playerIndex: number,
  id: CellId,
  building: BuildingType,
  opts?: { allowOwnHolding?: boolean; allowSite?: boolean }
): string | null {
  const c = G.cells[id];
  const me = factionOf(G, playerIndex);
  if (c.fog) return 'fogged';
  if (!BUILDABLE.has(c.terrain)) return 'terrain';
  if (c.building) return 'occupied';
  if (c.village) return 'village';
  if (c.holding && !(opts?.allowOwnHolding && c.holding === me)) return 'holding';
  if (building === 'Hotel' || building === 'Museum') {
    if (c.holding !== me) return 'needs your holding';
  }
  if (c.designation === 'Protected' || c.designation === 'Listed') return 'designated';
  if (c.designation === 'Zoned' && c.zonedFor !== me) return 'zoned for another faction';
  if (c.siteId !== undefined && !opts?.allowSite) return 'site';
  if (fogAdjacent(G, id)) return 'next to fog';
  if (G.landClaims !== undefined && G.landClaims !== playerIndex) {
    const claimant = factionOf(G, G.landClaims);
    if (c.neighbors.some((nb) => ownsPiece(G, claimant, nb))) return 'land claims';
  }
  return null;
}

/** Any piece a faction has on a cell: building, Holding, Presence or Village. */
export function ownsPiece(G: LandgrabState, type: PlayerType, id: CellId): boolean {
  const c = G.cells[id];
  if (c.buildingOwner === type) return true;
  if (c.holding === type) return true;
  if (type === 'Chieftain' && hasClaim(c)) return true;
  return false;
}

export function ownsBuildingAdjacent(G: LandgrabState, type: PlayerType, id: CellId, kinds?: BuildingType[]): boolean {
  return G.cells[id].neighbors.some((nb) => {
    const n = G.cells[nb];
    return n.buildingOwner === type && (!kinds || (n.building !== undefined && kinds.includes(n.building)));
  });
}

export function adjacentToPublicWork(G: LandgrabState, id: CellId): boolean {
  return G.cells[id].neighbors.some((nb) => G.cells[nb].building === 'PublicWork');
}

// ---------------------------------------------------------------------------
// Placing and removing
// ---------------------------------------------------------------------------

/** Puts a building down and applies the Chieftain's reactions to it. */
export function placeBuilding(
  G: LandgrabState,
  playerIndex: number | null,
  id: CellId,
  building: BuildingType
): void {
  const c = G.cells[id];
  if (fogAdjacent(G, id)) G.stats.fogAdjacentBuilds += 1;
  const grieves = nearPresence(G, id) && playerIndex !== chieftainIndex(G);
  c.building = building;
  c.buildingOwner = building === 'PublicWork' || playerIndex === null ? undefined : factionOf(G, playerIndex);
  if (building !== 'Hotel' && building !== 'Museum') delete c.holding;
  if (c.presence) {
    delete c.presence;
    G.presenceRemaining += 1;
  }
  if (grieves) addGrievance(G, BALANCE.grievance.buildingNearPresence, `${building} next to Presence`);
  checkDisplacement(G);
}

/** Removes whatever is built on a cell. A Hotel's or Museum's Holding marker goes back to its owner (sold or not). */
export function clearBuilding(G: LandgrabState, id: CellId): void {
  const c = G.cells[id];
  if (!c.building) return;
  if ((c.building === 'Hotel' || c.building === 'Museum') && c.holding) {
    G.holdingsRemaining += 1;
  }
  delete c.holding;
  delete c.building;
  delete c.buildingOwner;
  delete c.sold;
}

/** A Village whose every land neighbour is developed (or a Scar) moves to the nearest open cell. */
export function checkDisplacement(G: LandgrabState): void {
  for (const c of G.cells) {
    if (!c.village) continue;
    const land = c.neighbors.map((n) => G.cells[n]).filter(isLand);
    if (land.length === 0) continue;
    if (land.every((n) => isDeveloped(n) || isScar(n))) displaceVillage(G, c.id);
  }
}

export function displaceVillage(G: LandgrabState, id: CellId): void {
  const c = G.cells[id];
  delete c.village;
  const dest = nearest(
    G,
    id,
    (n) => isOpenLand(n) && !n.village && !n.holding && n.siteId === undefined &&
      n.neighbors.some((m) => isOpenLand(G.cells[m]) && G.cells[m].id !== id)
  );
  if (dest !== null) {
    G.cells[dest].village = true;
    if (G.cells[dest].presence) {
      delete G.cells[dest].presence;
      G.presenceRemaining += 1;
    }
  }
  addGrievance(G, BALANCE.grievance.villageDisplaced, 'Village displaced');
}

/** Turns a cell to Scar, destroying what is on it (spec 5.1 step 3). */
export function scarCell(G: LandgrabState, id: CellId, cause: 'extraction' | 'excavation' | 'erosion'): void {
  const c = G.cells[id];
  if (c.terrain === 'Ocean' || c.terrain === 'CoastalWater') return;
  const wasNear = nearPresence(G, id);
  clearBuilding(G, id);
  if (c.holding) {
    G.holdingsRemaining += 1;
    delete c.holding;
  }
  if (c.presence) {
    delete c.presence;
    G.presenceRemaining += 1;
  }
  const hadVillage = !!c.village;
  c.terrain = 'Scar';
  if (c.designation === 'Zoned') {
    delete c.designation;
    delete c.zonedFor;
    delete c.designatedBy;
  }
  if (hadVillage) displaceVillage(G, id);
  if (cause === 'erosion' && wasNear) {
    addGrievance(G, BALANCE.grievance.erosionNearPresence, 'erosion near Presence');
  }
  checkDisplacement(G);
  updateLastSeason(G);
}

// ---------------------------------------------------------------------------
// Fog (spec 4.1)
// ---------------------------------------------------------------------------

/** Cells a Survey or Scout may target: fogged, next to a revealed cell. */
export function surveyTargets(G: LandgrabState): CellId[] {
  const out: CellId[] = [];
  for (const c of G.cells) {
    if (c.fog && c.neighbors.some((n) => !G.cells[n].fog)) out.push(c.id);
  }
  return out;
}

/** Reveals a cell and all its fogged neighbours. Returns how many cells were newly revealed. */
export function surveyReveal(G: LandgrabState, id: CellId): number {
  const cells = [id, ...G.cells[id].neighbors];
  let n = 0;
  for (const cid of cells) {
    const c = G.cells[cid];
    if (!c.fog) continue;
    c.fog = false;
    n++;
  }
  G.fogRevealed += n;
  checkMandateTrigger(G);
  return n;
}

/** Land revealed so far (coastal rim included), 0..1. */
export function revealedLandFraction(G: LandgrabState): number {
  return G.landCount ? (G.landCount - (G.totalFog - G.fogRevealed)) / G.landCount : 1;
}

/**
 * Mandates enter the Politics Track once half the island's land is revealed
 * (spec 4.1: the coastal rim starts revealed, so this takes a few dozen Surveys).
 */
export function checkMandateTrigger(G: LandgrabState): void {
  if (!G.mandateTriggered && revealedLandFraction(G) >= BALANCE.mandateFogThreshold) {
    G.mandateTriggered = true;
    log(G, G.turn.player, 'Half the island is known: Mandates now enter the Politics Track');
  }
}

export function scoutCells(G: LandgrabState, viewer: PlayerType, id: CellId): void {
  const list = (G.scouted[viewer] ??= []);
  for (const cid of [id, ...G.cells[id].neighbors]) {
    if (G.cells[cid].fog && !list.includes(cid)) list.push(cid);
  }
}

// ---------------------------------------------------------------------------
// Sites (spec 2)
// ---------------------------------------------------------------------------

/** First action on a Site resolves its hidden significance for everyone. */
export function revealSite(G: LandgrabState, site: Site): number {
  if (!site.revealed) {
    site.revealed = true;
    log(G, G.turn.player, `Site ${site.id} revealed: significance ${site.significance}`);
  }
  return site.significance;
}

// ---------------------------------------------------------------------------
// Erosion and Last Season (spec 5)
// ---------------------------------------------------------------------------

export function scarCount(G: LandgrabState): number {
  let n = 0;
  for (const c of G.cells) if (c.terrain === 'Scar') n++;
  return n;
}

export function scarClusters(G: LandgrabState): Set<CellId>[] {
  return components(G, isScar);
}

export function updateLastSeason(G: LandgrabState): void {
  const scars = scarCount(G);
  const [s1, s2, s3] = BALANCE.lastSeasonThresholds;
  const stage = scars >= s3 ? 3 : scars >= s2 ? 2 : scars >= s1 ? 1 : 0;
  if (stage > G.lastSeasonStage) {
    G.lastSeasonStage = stage as 0 | 1 | 2 | 3;
    const msg = ['', 'The Resource Market now restocks more slowly', 'Every Hotel loses 1 sale value', 'Last Season: the game ends when this round finishes'][stage];
    log(G, G.turn.player, `${scars} Scars. ${msg}`);
    if (stage === 3 && G.lastSeasonEndsAfterRound === undefined) {
      G.lastSeasonEndsAfterRound = G.turn.round;
    }
  }
}

/**
 * End-of-round erosion: each cluster of `erosionMinCluster`+ Scars spreads
 * once. The perimeter is open land (not sea, not developed); if there is none,
 * a developed neighbour is destroyed instead. Crater Lakes can be polluted.
 */
export function erode(G: LandgrabState): number {
  const clusters = scarClusters(G).filter((c) => c.size >= BALANCE.erosionMinCluster);
  let spread = 0;
  for (const cluster of clusters) {
    const perimeter = new Set<CellId>();
    const developed = new Set<CellId>();
    for (const id of cluster) {
      for (const nb of G.cells[id].neighbors) {
        const n = G.cells[nb];
        if (cluster.has(nb) || SEA.has(n.terrain) || n.terrain === 'Scar') continue;
        if (isDeveloped(n)) developed.add(nb);
        else perimeter.add(nb);
      }
    }
    const pool = perimeter.size ? [...perimeter] : [...developed];
    if (!pool.length) continue;
    pool.sort((a, b) => a - b);
    let pick: CellId;
    if (G.options.erosionByElevation) {
      pick = pool.reduce((best, id) => (G.cells[id].elevation < G.cells[best].elevation ? id : best), pool[0]);
    } else {
      pick = pool[Math.floor(random(G) * pool.length)];
    }
    // A cell already scarred this round by another cluster's spread is skipped.
    if (G.cells[pick].terrain === 'Scar') continue;
    scarCell(G, pick, 'erosion');
    G.stats.erosionScars += 1;
    spread++;
  }
  return spread;
}
