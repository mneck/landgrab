import type { HexCoord } from '../utils/hexGrid';
import { hexDistance, hexKey, hexNeighbors, makeHexagonalShape } from '../utils/hexGrid';

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
  | "Fisheries";

export type CardType = PersonnelCardType | EventCardType;

export interface TableauCard {
  instanceId: string;
  cardType: CardType;
  category: 'Personnel' | 'Event';
}

export interface Tile {
  hex: HexCoord;
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
}

// ---- generateIsland (adapted from landgrab_react) ----

export const MANDATE_INTERVALS = [4, 3, 3] as const;
export const MANDATE_RECURRING_INTERVAL = 3;
export const SEATS_TO_WIN = 2;

function shuffleLocal<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function generateIsland(
  mapRadius: number,
  fogRadius: number
): Record<string, Tile> {
  const center = { q: 0, r: 0 };
  const hexes = makeHexagonalShape(mapRadius);
  const coastlineDist = fogRadius + 1;

  const coastlineHexes = hexes.filter(
    (h) => hexDistance(h, center) === coastlineDist
  );

  const fixedAssignments: TileType[] = [
    "Mountain", "Mountain", "Forest", "Forest", "Water", "Water",
  ];
  const shuffledCoastline = shuffleLocal(coastlineHexes);
  const coastlineTypes = new Map<string, TileType>();

  for (let i = 0; i < shuffledCoastline.length; i++) {
    const h = shuffledCoastline[i];
    const k = hexKey(h);
    if (i < 6) {
      coastlineTypes.set(k, fixedAssignments[i]);
    } else {
      coastlineTypes.set(k, Math.random() < 0.5 ? "Field" : "Sand");
    }
  }

  function isWaterHex(h: HexCoord): boolean {
    const d = hexDistance(h, center);
    if (d > coastlineDist) return true;
    if (d === coastlineDist) return coastlineTypes.get(hexKey(h)) === "Water";
    return false;
  }

  const tiles: Record<string, Tile> = {};
  for (const hex of hexes) {
    const dist = hexDistance(hex, center);
    const k = hexKey(hex);
    let type: TileType;
    if (dist < fogRadius) {
      type = "Fog";
    } else if (dist === fogRadius) {
      const adjacentToWater = hexNeighbors(hex).some((nb) => isWaterHex(nb));
      type = adjacentToWater ? "Field" : "Fog";
    } else if (dist === coastlineDist) {
      type = coastlineTypes.get(k) ?? "Field";
    } else {
      type = "Water";
    }
    tiles[k] = { hex, type };
  }
  return tiles;
}
