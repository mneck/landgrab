import { generateCellMap, makeRng } from '../utils/cellMap';

export type PlayerType = "Hotelier" | "Industrialist" | "Bureaucrat" | "Chieftain";
export type TileType = "Fog" | "Field" | "Mountain" | "Water" | "Forest" | "Sand";
export type BuildingType =
  | "Village"
  | "Resort"
  | "Housing"
  | "IndustrialZone"
  | "Farm"
  | "Fisheries"
  | "Infrastructure"
  | "CivicOffice"
  | "Reserve";

export type PersonnelCardType =
  | "Builder"
  | "Guide"
  | "Liaison"
  | "Elder"
  | "Fixer"
  | "Broker"
  | "Forester"
  | "Consultant"
  | "Advocate";

export type EventCardType =
  | "Charter"
  | "Mandate"
  | "Restructuring"
  | "Stimulus"
  | "Seat"
  | "Dividends"
  | "Bribe"
  | "Zoning"
  | "Conservation"
  | "UrbanPlanning"
  | "NGOBacking"
  | "Propaganda"
  | "Graft"
  | "LocalElections"
  | "Reorganization"
  | "Import"
  | "Export"
  | "Logging"
  | "Forestry"
  | "LandClaims"
  | "Subsidy"
  | "Boycotting"
  | "Protests"
  | "Taxation"
  | "Levy"
  | "Expropriation"
  | "Airstrip"
  | "Fisheries"
  | "Endorsement";

export type CardType = PersonnelCardType | EventCardType;

export interface TableauCard {
  instanceId: string;
  cardType: CardType;
  category: 'Personnel' | 'Event';
}

export interface Tile {
  /** Cell id; also this tile's key in `LandgrabState.tiles`. */
  id: string;
  /** Ids of edge-sharing cells. Adjacency rules use only this. */
  neighbors: string[];
  /** Hex-ring equivalent distance from the center (0 = center, mapRadius = water rim). */
  ring: number;
  type: TileType;
  building?: BuildingType;
  buildingOwner?: PlayerType;
  zoningOwner?: PlayerType;
  hasUrbanPlanning?: boolean;
  hasConservation?: boolean;
}

export interface PlayerResources {
  coins: number;
  wood: number;
  ore: number;
  votes: number;
}

export interface PlayerState {
  type: PlayerType;
  tableau: TableauCard[];
  resources: PlayerResources;
  seats: number;
}

export type ResourceTrack = [number, number, number, number];
export type PoliticsSlot = string | null;
export type NetworkSlot = string | null;

export type PendingAction =
  | { type: 'charter_place'; instanceId: string }
  | { type: 'builder_choose'; instanceId: string }
  | { type: 'builder_build_type'; instanceId: string }
  | { type: 'builder_build_hex'; instanceId: string; buildingType: BuildingType }
  | { type: 'builder_market_choose'; instanceId: string }
  | { type: 'builder_market_buy'; instanceId: string; resource: 'wood' | 'ore'; amount: number }
  | { type: 'builder_market_sell'; instanceId: string; resource: 'wood' | 'ore'; amount: number }
  | { type: 'liaison_choose'; instanceId: string }
  | { type: 'liaison_politics'; instanceId: string }
  | { type: 'guide_choose'; instanceId: string }
  | { type: 'guide_reveal_hex'; instanceId: string }
  | { type: 'guide_network'; instanceId: string }
  | { type: 'elder_choose'; instanceId: string }
  | { type: 'elder_village_hex'; instanceId: string }
  | { type: 'elder_reserve_hex'; instanceId: string }
  | { type: 'event_bribe'; instanceId: string }
  | { type: 'event_zoning_hex'; instanceId: string }
  | { type: 'event_conservation_hex'; instanceId: string }
  | { type: 'event_logging_hex'; instanceId: string }
  | { type: 'event_forestry_hex'; instanceId: string }
  | { type: 'event_import_choose'; instanceId: string }
  | { type: 'event_export_choose'; instanceId: string; amount?: number }
  | { type: 'event_taxation_hex'; instanceId: string }
  | { type: 'event_graft_choose'; instanceId: string }
  | { type: 'event_urbanplanning_hex'; instanceId: string }
  | { type: 'event_airstrip_hex'; instanceId: string }
  | { type: 'event_fisheries_hex'; instanceId: string }
  | { type: 'event_restructuring_choose'; instanceId: string }
  | { type: 'event_stimulus_choose'; instanceId: string; remaining: number }
  | { type: 'broker_choose'; instanceId: string }
  | { type: 'forester_choose'; instanceId: string }
  | { type: 'network_bid'; instanceId: string; slotIndex: number; initiatorPlayerIndex: number; bids: Record<string, number | null> };

export interface LandgrabState {
  tiles: Record<string, Tile>;
  /**
   * Seed the cell map was generated from. Polygon geometry is not stored in
   * state (it doubled per-move cost); clients rebuild it with
   * `generateCellMap({ mapRadius, rng: makeRng(mapSeed) })`.
   */
  mapSeed: number;
  mapRadius: number;
  fogRadius: number;
  totalFog: number;
  fogRevealed: number;
  thresholdReached: boolean;
  revealedPoliticsSinceThreshold: number;
  mandateIntervalIndex: number;

  players: PlayerState[];

  tokensUsedThisTurn: string[];
  actionsRemainingThisTurn: number;
  pendingAction: PendingAction | null;

  networkRow: NetworkSlot[];
  networkDeck: PersonnelCardType[];
  politicsRow: PoliticsSlot[];
  politicsDeck: string[];
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;

  landClaimsUntilPlayer?: number;
  boycottEffect?: { boycotterType: PlayerType; targetPlayerIndex: number };

  /** Seats required to win (default {@link SEATS_TO_WIN}; playtests may use 1 for shorter games). */
  winSeatThreshold: number;

  winner?: PlayerType;

  /**
   * Blind bid for first player (phase `startingBid`). `amounts[i]` null until player i submits.
   * Removed after resolution when normal play begins.
   */
  startingBidPhase?: {
    amounts: (number | null)[];
    resolved?: boolean;
  };

  /** Turn order after blind bid; index 0 goes first. Initialized in setup, overwritten when bids resolve. */
  startingPlayOrder: string[];
}

// ---- generateIsland (adapted from landgrab_react) ----

export const MANDATE_INTERVALS = [4, 3, 3] as const;
export const MANDATE_RECURRING_INTERVAL = 3;
export const SEATS_TO_WIN = 2;

function shuffleLocal<T>(array: T[], rng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateIsland(
  mapRadius: number,
  fogRadius: number,
  mapSeed: number
): Record<string, Tile> {
  // generateCellMap must draw first from a fresh rng so the client's rebuild
  // (same seed, same call) yields the same cells.
  const rng = makeRng(mapSeed);
  const cells = generateCellMap({ mapRadius, rng });
  const coastlineDist = fogRadius + 1;

  const coastlineCells = Object.values(cells).filter((c) => c.ring === coastlineDist);

  const fixedAssignments: TileType[] = [
    "Mountain", "Mountain", "Forest", "Forest", "Water", "Water",
  ];
  const shuffledCoastline = shuffleLocal(coastlineCells, rng);
  const coastlineTypes = new Map<string, TileType>();

  for (let i = 0; i < shuffledCoastline.length; i++) {
    const k = shuffledCoastline[i].id;
    if (i < 6) {
      coastlineTypes.set(k, fixedAssignments[i]);
    } else {
      coastlineTypes.set(k, rng() < 0.5 ? "Field" : "Sand");
    }
  }

  function isWaterCell(id: string): boolean {
    const d = cells[id].ring;
    if (d > coastlineDist) return true;
    if (d === coastlineDist) return coastlineTypes.get(id) === "Water";
    return false;
  }

  const tiles: Record<string, Tile> = {};
  for (const cell of Object.values(cells)) {
    const dist = cell.ring;
    const k = cell.id;
    let type: TileType;
    if (dist < fogRadius) {
      type = "Fog";
    } else if (dist === fogRadius) {
      const adjacentToWater = cell.neighbors.some((nb) => isWaterCell(nb));
      type = adjacentToWater ? "Field" : "Fog";
    } else if (dist === coastlineDist) {
      type = coastlineTypes.get(k) ?? "Field";
    } else {
      type = "Water";
    }
    tiles[k] = { id: cell.id, neighbors: cell.neighbors, ring: cell.ring, type };
  }
  return tiles;
}
