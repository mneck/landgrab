/**
 * Landgrab v3 state model (IMPLEMENTATION_SPEC.md sections 1.4 and 2).
 *
 * Polygon geometry is deliberately absent: it is render data, loaded once per
 * client from `public/maps/<mapId>.json` (see `maps.ts`). Everything here is
 * sent over the wire on every boardgame.io update.
 */

export type PlayerType = 'Hotelier' | 'Industrialist' | 'Bureaucrat' | 'Chieftain';
export const ALL_FACTIONS: PlayerType[] = ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'];

export type CellId = number;

export type TerrainType =
  | 'Ocean' | 'CoastalWater' | 'CraterLake'
  | 'Beach' | 'Plains' | 'Rainforest' | 'Hills' | 'Mountain'
  | 'Scar';

/** What a player who cannot see under the fog is shown instead of the terrain. */
export type VisibleTerrain = TerrainType | 'Unknown';

export type BuildingType = 'Hotel' | 'IndustrialZone' | 'PublicWork' | 'Housing' | 'Museum';

export type Designation = 'Zoned' | 'Protected' | 'Listed';

export interface Cell {
  id: CellId;
  neighbors: CellId[];
  terrain: VisibleTerrain;
  elevation: number;
  fog: boolean;

  building?: BuildingType;
  /** Owner of the building. Public Works are unowned. */
  buildingOwner?: PlayerType;
  /** A Hotel that has been Realised: its Holding marker went back to supply. */
  sold?: boolean;

  holding?: PlayerType;
  presence?: boolean;
  village?: boolean;
  designation?: Designation;
  zonedFor?: PlayerType;
  /** Who placed the designation (Bureaucrat scores Zoned cells it placed). */
  designatedBy?: PlayerType;

  siteId?: number;
}

export type SiteStatus = 'Untouched' | 'Excavated' | 'Museum' | 'Listed' | 'Reclaimed';

export interface Site {
  id: number;
  cells: CellId[];
  /** Hidden from everyone (Chieftain included) until `revealed`. 0 in a player view while hidden. */
  significance: 0 | 1 | 2 | 3;
  revealed: boolean;
  status: SiteStatus;
}

export type ResourceKey = 'coins' | 'wood' | 'ore' | 'votes';

export interface Resources {
  coins: number;
  wood: number;
  ore: number;
  votes: number;
}

export interface TableauCard {
  instanceId: string;
  cardType: string;
}

export interface PlayerState {
  type: PlayerType;
  tableau: TableauCard[];
  resources: Resources;
  seats: number;
}

/** Slot price = index (0..3). */
export type MarketRow = (string | null)[];

/** Resource market: `true` = a unit sits in the slot priced index+1 coins. */
export type ResourceTrack = [boolean, boolean, boolean, boolean];

export interface Favor {
  id: string;
  /** The player who owes (kept the payment that was waived). */
  from: PlayerType;
  /** The player who waived and holds the token. */
  to: PlayerType;
}

export interface Proposal {
  id: string;
  from: number;
  to: number;
  give: Partial<Resources>;
  want: Partial<Resources>;
  note?: string;
}

export interface Message {
  id: string;
  from: number;
  /** null = public. */
  to: number | null;
  kind: 'tell' | 'show' | 'system';
  text: string;
  cell?: CellId;
  /** Terrain shown by a Show (verifiable). */
  shownTerrain?: TerrainType;
  round: number;
}

/**
 * A fully specified player action. The client and the bots both build these;
 * `legalActions` enumerates them and `applyAction` validates and runs them.
 */
export interface Action {
  kind: 'use' | 'spread' | 'reclaim' | 'endTurn';
  /** Tableau instanceId (kind 'use'). */
  card?: string;
  /** Card option, e.g. 'Extract', 'Survey', 'Policy'. */
  option?: string;
  cell?: CellId;
  cells?: CellId[];
  /** Target player index. */
  player?: number;
  /** Market slot (Hire / Policy). */
  slot?: number;
  /** Generic choice: resource name, designation kind, faction, etc. */
  choice?: string;
  /** Resource exchange for the Market option: positive = buy, negative = sell. */
  trade?: { wood?: number; ore?: number };
  /** Tableau instanceId of a card to remove (Restructuring). */
  target?: string;
  /** How to pay a Mandate's slot surcharge. */
  payInVotes?: boolean;
}

/** Out-of-turn decision windows. Each is a boardgame.io stage for `reactor`. */
export type Reaction =
  | {
      kind: 'interrupt';
      reactor: number;
      actor: number;
      action: Action;
      cell: CellId;
    }
  | {
      kind: 'objection';
      reactor: number;
      actor: number;
      action: Action;
    }
  | {
      kind: 'objectionResponse';
      reactor: number;
      bureaucrat: number;
      action: Action;
    }
  | {
      kind: 'waive';
      reactor: number;
      payer: number;
      amount: Partial<Resources>;
      reason: string;
    };

export interface TurnState {
  /** Index into `order`. */
  seat: number;
  player: number;
  round: number;
  actionsLeft: number;
  usedCards: string[];
  actionsTaken: number;
  spreadDone: boolean;
  reclaimDone: boolean;
}

export interface GameLogEntry {
  round: number;
  player: number;
  text: string;
}

export type EndReason = 'seats' | 'last_season' | 'mandates_exhausted' | 'round_cap';

export interface LandgrabState {
  mapId: string;
  cells: Cell[];
  sites: Site[];
  totalFog: number;
  fogRevealed: number;
  /** Non-sea cells (land and crater lakes): the base for the Mandate trigger. */
  landCount: number;
  mandateTriggered: boolean;

  players: PlayerState[];
  order: number[];
  turn: TurnState;

  grievance: number;
  holdingsRemaining: number;
  presenceRemaining: number;
  scouted: Partial<Record<PlayerType, CellId[]>>;
  favors: Favor[];
  lastSeasonStage: 0 | 1 | 2 | 3;
  /** Round in which Last Season fired; the game ends when that round (or the next, see rules) finishes. */
  lastSeasonEndsAfterRound?: number;
  objectionUsedThisRound: boolean;
  /** Player index protected by Land Claims until their next turn starts. */
  landClaims?: number;

  personnelRow: MarketRow;
  personnelDeck: string[];
  politicsRow: MarketRow;
  politicsDeck: string[];
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;
  mandatesRemaining: number;
  /** Mandates not yet drawn into the Politics track. */
  mandatesInDeck: number;
  politicsDrawsSinceMandate: number;
  mandateIntervalIndex: number;
  /** Round when the last Mandate was bought; the game ends after this round. */
  mandatesExhaustedRound?: number;

  reaction: Reaction | null;
  proposals: Proposal[];
  messages: Message[];
  log: GameLogEntry[];

  seatsToWin: number;
  roundCap: number;
  options: GameOptions;
  rng: number;
  nextId: number;

  winner?: PlayerType;
  endReason?: EndReason;
  stats: GameStats;
}

export interface GameOptions {
  /** Spread erosion to the lowest perimeter cell instead of a random one (spec 5.1 alternative). */
  erosionByElevation: boolean;
  /** Open question 1: Press Coverage is built behind a flag. */
  pressCoverage: boolean;
  /** Open question 2: Clearance yield. */
  clearanceYield: 1 | 2;
  /** Open question 4: coins per cell the Chieftain reveals with their own Survey. */
  chieftainSurveyIncome: number;
}

/** Counters the bot harness reads. Kept in state so they survive boardgame.io. */
export interface GameStats {
  surveys: number;
  surveyRevealed: number[];
  scarsByRound: number[];
  clustersByRound: number[];
  reclamations: number;
  interrupts: number;
  objections: number;
  erosionScars: number;
  /** Placements refused because a neighbour was still fogged (should be 0: checked in legality). */
  fogAdjacentBuilds: number;
  /** Per player: cards acquired / played, by card type. */
  acquired: Record<string, number>[];
  played: Record<string, number>[];
  /** Per player: uses of each card option, keyed `Card.Option`. */
  options: Record<string, number>[];
  /** Round each Mandate was bought, by player index. */
  mandateRounds: number[][];
}

export const WATER: ReadonlySet<VisibleTerrain> = new Set(['Ocean', 'CoastalWater', 'CraterLake']);
export const SEA: ReadonlySet<VisibleTerrain> = new Set(['Ocean', 'CoastalWater']);
export const BUILDABLE: ReadonlySet<VisibleTerrain> = new Set(['Beach', 'Plains', 'Rainforest', 'Hills']);
