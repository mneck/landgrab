import type { GameState, BuildingType } from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import type { TileType } from "./types/game";
import { hexDistance, hexKey, hexNeighbors } from "./utils/hexGrid";

const REVEALED_TERRAIN_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand", "Water"];

export function pickRevealedTileType(hex: HexCoord): TileType {
  const idx = (hex.q * 7 + hex.r * 13) % REVEALED_TERRAIN_TYPES.length;
  return REVEALED_TERRAIN_TYPES[Math.abs(idx)];
}

export type PlacementMode =
  | "charter"
  | "expedition"
  | "contact"
  | "reserve"
  | "build"
  | "zoning"
  | "urbanplanning"
  | "logging"
  | "forestry"
  | "taxation"
  | null;

export function getCharterBuilding(playerType: string): BuildingType {
  switch (playerType) {
    case "Hotelier":
      return "Resort";
    case "Industrialist":
      return "IndustrialZone";
    case "Bureaucrat":
      return "Infrastructure";
    case "Chieftain":
      return "Village";
    default:
      return "Village";
  }
}

export function canPlaceCharter(
  tiles: GameState["tiles"],
  hex: HexCoord,
  _playerType: string,
  building: BuildingType
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile) return false;

  if (tile.type === "Fog") return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }

  switch (building) {
    case "Village":
      return ["Field", "Sand", "Forest", "Mountain"].includes(tile.type);
    case "Resort":
    case "IndustrialZone":
    case "Infrastructure":
      return ["Field", "Sand"].includes(tile.type);
    default:
      return false;
  }
}

export function hasAdjacent(
  tiles: GameState["tiles"],
  hex: HexCoord,
  buildingTypes: BuildingType[]
): boolean {
  for (const neighbor of hexNeighbors(hex)) {
    const t = tiles[hexKey(neighbor)];
    if (t?.building && buildingTypes.includes(t.building)) return true;
  }
  return false;
}

export const BUILD_ADJACENCY: Record<string, BuildingType[]> = {
  Industrialist: ["Farm", "IndustrialZone", "Infrastructure"],
  Hotelier: ["Resort", "Housing", "Infrastructure"],
  Bureaucrat: ["Village", "Farm", "Housing", "IndustrialZone", "Resort", "CivicOffice"],
};

export const BUILD_OPTIONS: Record<string, BuildingType[]> = {
  Industrialist: ["Farm", "IndustrialZone"],
  Hotelier: ["Housing", "Resort"],
  Bureaucrat: ["CivicOffice", "Infrastructure"],
};

export function canPlaceBuild(
  tiles: GameState["tiles"],
  hex: HexCoord,
  playerType: string,
  _building: BuildingType,
  landClaimsActive?: boolean
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand"].includes(tile.type)) return false;
  if (tile.zoningOwner && tile.zoningOwner !== playerType) return false;

  const adj = BUILD_ADJACENCY[playerType];
  if (!adj || !hasAdjacent(tiles, hex, adj)) return false;

  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
    if (landClaimsActive && nt?.building === "Reserve") return false;
  }
  return true;
}

export function canPlaceReserve(
  tiles: GameState["tiles"],
  hex: HexCoord
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand", "Forest", "Mountain"].includes(tile.type)) return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }
  return hasAdjacent(tiles, hex, ["Village", "Reserve"]);
}

export function countReserves(tiles: GameState["tiles"], playerType: string): number {
  return Object.values(tiles).filter(
    (t) => t.building === "Reserve" && t.buildingOwner === playerType
  ).length;
}

/** Reveal adjacent Fog hexes around a target hex, returning updated tiles */
export function revealAdjacentFog(
  tiles: Record<string, GameState["tiles"][string]>,
  hex: HexCoord,
  fogRadius: number
): Record<string, GameState["tiles"][string]> {
  const center = { q: 0, r: 0 };
  const newTiles = { ...tiles };
  for (const neighbor of hexNeighbors(hex)) {
    const nk = hexKey(neighbor);
    const nt = newTiles[nk];
    if (nt?.type === "Fog") {
      const isOuterFogRing = hexDistance(neighbor, center) === fogRadius;
      newTiles[nk] = {
        ...nt,
        type: isOuterFogRing ? "Field" : pickRevealedTileType(neighbor),
      };
    }
  }
  return newTiles;
}
