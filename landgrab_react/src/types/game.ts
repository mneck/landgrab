import type { HexCoord } from "../utils/hexGrid";
import { hexDistance, hexKey, makeHexagonalShape } from "../utils/hexGrid";

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

export type PersonnelCard = "Builder" | "Elder" | "Liaison" | "Explorer";

export type EventCard =
  | "Charter"
  | "Build"
  | "Procurement"
  | "Expedition"
  | "Reserve"
  | "Contact";

export type CardType = PersonnelCard | EventCard;

export interface Tile {
  hex: HexCoord;
  type: TileType;
  building?: BuildingType;
  buildingOwner?: PlayerType;
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
  victoryProgress: number; // coins, VP, votes, or reserves depending on type
}

export interface GameState {
  mapRadius: number;
  fogRadius: number;
  tiles: Record<string, Tile>;
  players: Player[];
  currentPlayerIndex: number;
  actionsRemaining: number;
}

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

  const tiles: Record<string, Tile> = {};
  for (const hex of hexes) {
    const dist = hexDistance(hex, center);
    const k = hexKey(hex);
    let type: TileType;
    if (dist < fogRadius) {
      type = "Fog";
    } else if (dist === fogRadius) {
      type = "Field";
    } else if (dist === coastlineDist) {
      type = coastlineTypes.get(k) ?? "Field";
    } else {
      type = "Water";
    }
    tiles[k] = { hex, type };
  }
  return tiles;
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
        ? (["Elder", "Liaison", "Explorer", "Charter"] as CardType[])
        : (["Builder", "Liaison", "Explorer", "Charter"] as CardType[]),
    discardPile: [],
    drawPile: [],
    resources: { wood: 0, ore: 0, coins: 0, votes: 0 },
    victoryProgress: 0,
  }));

  return {
    mapRadius,
    fogRadius,
    tiles: generateIsland(mapRadius, fogRadius),
    players,
    currentPlayerIndex: 0,
    actionsRemaining: 2,
  };
}
