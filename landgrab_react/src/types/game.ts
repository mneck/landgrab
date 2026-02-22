import type { HexCoord } from "../utils/hexGrid";
import { hexDistance, hexKey, hexNeighbors, makeHexagonalShape } from "../utils/hexGrid";

export type PlayerType = "Hotelier" | "Industrialist" | "Bureaucrat" | "Chieftain";

export type TileType = "Fog" | "Field" | "Mountain" | "Water" | "Forest" | "Sand";

export type BuildingType =
  | "Village"
  | "Resort"
  | "Housing"
  | "IndustrialZone"
  | "Farm"
  | "Infrastructure"
  | "CivicOffice"
  | "Reserve";

export type PersonnelCard = "Builder" | "Elder" | "Liaison" | "Explorer" | "Fixer" | "Broker" | "Forester" | "Consultant" | "Advocate";

export type EventCard =
  | "Charter"
  | "Build"
  | "Procurement"
  | "Expedition"
  | "Reserve"
  | "Contact"
  | "Mandate"
  | "Promotion"
  | "Seat";

/** Politics row: slots 0-2 cost 1–3 Coins; slot 3 is always Mandate */
export type PoliticsCard =
  | EventCard
  | "Bribe"
  | "Zoning"
  | "Conservation"
  | "UrbanPlanning"
  | "Dividends"
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
  | "Expropriation";
export type PoliticsSlot = PoliticsCard | null;

/** Hand can hold personnel + all event/politics cards */
export type CardType = PersonnelCard | PoliticsCard;

export interface Tile {
  hex: HexCoord;
  type: TileType;
  building?: BuildingType;
  buildingOwner?: PlayerType;
  /** Zoning: only zoningOwner can build here */
  zoningOwner?: PlayerType;
  /** Urban Planning: hex has extra building; double production in Procurement */
  hasUrbanPlanning?: boolean;
  /** Conservation: hex cannot be converted or zoned; only Reserve may be placed */
  hasConservation?: boolean;
}

export interface Player {
  type: PlayerType;
  hand: CardType[];
  discardPile: CardType[];
  drawPile: CardType[];
  resources: {
    wood: number;
    ore: number;
    coins: number;
    votes: number;
  };
  seats: number;
}

/** Conference row: 4 Personnel cards at costs 1–4 Coins */
export type ConferenceSlot = PersonnelCard | null;

/** Resource market: 4 price slots (1–4 Coins), each slot holds count of that resource */
export type ResourceTrack = [number, number, number, number];

/** Decrement actions remaining, clamped to never go below 0 */
export function decrementActionsRemaining(current: number): number {
  return Math.max(0, current - 1);
}

export interface GameState {
  mapRadius: number;
  fogRadius: number;
  tiles: Record<string, Tile>;
  players: Player[];
  currentPlayerIndex: number;
  actionsRemaining: number;
  /** Conference: 4 Personnel slots at costs 1–4 */
  conference: [ConferenceSlot, ConferenceSlot, ConferenceSlot, ConferenceSlot];
  conferenceDeck: PersonnelCard[];
  /** Politics: 4 Event slots at costs 1–4 */
  politics: [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot];
  politicsDeck: PoliticsCard[];
  /** Wood and Ore market tracks; each has 4 slots for prices 1–4 */
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;
  /** LandClaims: player index whose next turn clears the effect */
  landClaimsUntilPlayer?: number;
  /** Boycotting: buildings adjacent to boycotter's Reserves/Villages skip production */
  boycottEffect?: {
    boycotterType: PlayerType;
    targetPlayerIndex: number;
  };
  /** Set when a player reaches SEATS_TO_WIN */
  winner?: PlayerType;
}

/** Number of Seats required to win the game */
export const SEATS_TO_WIN = 3;

function shuffle<T>(array: T[]): T[] {
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
    "Mountain",
    "Mountain",
    "Forest",
    "Forest",
    "Water",
    "Water",
  ];
  const shuffledCoastline = shuffle(coastlineHexes);
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

  /** True if this hex is Water (coastline or outer ring) */
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

/**
 * Interleave Mandate cards into a shuffled politics deck.
 * Gaps before each Mandate: 5, 4, 3, 2, then 2 repeating.
 */
function buildPoliticsDeck(shuffled: PoliticsCard[]): PoliticsCard[] {
  const result: PoliticsCard[] = [];
  let srcIdx = 0;
  const gaps = [5, 4, 3, 2];
  for (let gapNum = 0; srcIdx < shuffled.length; gapNum++) {
    const gap = gapNum < gaps.length ? gaps[gapNum] : 2;
    for (let j = 0; j < gap && srcIdx < shuffled.length; j++) {
      result.push(shuffled[srcIdx++]);
    }
    result.push("Mandate");
  }
  return result;
}

export function createInitialGameState(
  playerTypes: PlayerType[] = ["Hotelier", "Industrialist"]
): GameState {
  const mapRadius = 6;
  const fogRadius = 4; // Fog covers interior; fogRadius+1 is the single coastline ring

  const players: Player[] = playerTypes.map((type) => ({
    type,
    hand:
      type === "Chieftain"
        ? (["Elder", "Liaison", "Explorer", "Charter", "Import"] as CardType[])
        : (["Builder", "Liaison", "Explorer", "Charter", "Import"] as CardType[]),
    discardPile: [],
    drawPile: [],
    resources: { wood: 1, ore: 1, coins: 1, votes: 0 },
    seats: 0,
  }));

  /* Conference: first 4 always Broker, Forester, Fixer, Advocate; deck has no Liaison, Builder, Explorer */
  const conference: [ConferenceSlot, ConferenceSlot, ConferenceSlot, ConferenceSlot] = [
    "Broker",
    "Forester",
    "Fixer",
    "Advocate",
  ];
  const conferenceDeckPool: PersonnelCard[] = [
    "Elder",
    "Fixer",
    "Broker",
    "Forester",
    "Consultant",
    "Advocate",
    "Elder",
    "Fixer",
    "Broker",
    "Forester",
    "Consultant",
    "Advocate",
  ];
  const conferenceDeck: PersonnelCard[] = shuffle(conferenceDeckPool);

  /* Politics: first 4 always Graft, Import, Import, Logging; deck excludes Procurement, Build, Reserve, Contact, Expedition */
  const politics: [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot] = [
    "Graft",
    "Import",
    "Import",
    "Logging",
  ];
  const politicsPool: PoliticsCard[] = [
    "Bribe",
    "Zoning",
    "Conservation",
    "UrbanPlanning",
    "Dividends",
    "NGOBacking",
    "Propaganda",
    "Graft",
    "LocalElections",
    "Reorganization",
    "Import",
    "Export",
    "Logging",
    "Forestry",
    "LandClaims",
    "Subsidy",
    "Boycotting",
    "Protests",
    "Taxation",
    "Levy",
    "Expropriation",
  ];
  const politicsDeck = buildPoliticsDeck(shuffle([...politicsPool, ...politicsPool]));

  return {
    mapRadius,
    fogRadius,
    tiles: generateIsland(mapRadius, fogRadius),
    players,
    currentPlayerIndex: 0,
    actionsRemaining: 2,
    conference,
    conferenceDeck,
    politics,
    politicsDeck,
    woodMarket: [0, 0, 1, 1],
    oreMarket: [0, 0, 1, 1],
  };
}
