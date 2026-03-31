import type { LandgrabState, BuildingType, PlayerType, TileType } from './types';
import type { HexCoord } from '../utils/hexGrid';
import { hexDistance, hexKey, hexFromKey, hexNeighbors } from '../utils/hexGrid';

const REVEALED_TERRAIN_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand", "Water"];

export function pickRevealedTileType(hex: HexCoord): TileType {
  const idx = (hex.q * 7 + hex.r * 13) % REVEALED_TERRAIN_TYPES.length;
  return REVEALED_TERRAIN_TYPES[Math.abs(idx)];
}

export function getCharterBuilding(playerType: string): BuildingType {
  switch (playerType) {
    case "Hotelier": return "Resort";
    case "Industrialist": return "IndustrialZone";
    case "Bureaucrat": return "Infrastructure";
    case "Chieftain": return "Village";
    default: return "Village";
  }
}

export function canPlaceCharter(
  tiles: LandgrabState["tiles"],
  hex: HexCoord,
  _playerType: string,
  building: BuildingType
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile) return false;
  if (tile.type === "Fog") return false;
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
  tiles: LandgrabState["tiles"],
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

const PRODUCTION_SUPPORT: Record<string, { production: BuildingType; support: BuildingType }> = {
  Industrialist: { production: "IndustrialZone", support: "Farm" },
  Hotelier: { production: "Resort", support: "Housing" },
  Bureaucrat: { production: "Infrastructure", support: "CivicOffice" },
};

export function countProductionAndSupport(
  tiles: LandgrabState["tiles"],
  playerType: string
): { production: number; support: number } {
  const ps = PRODUCTION_SUPPORT[playerType];
  if (!ps) return { production: 0, support: 0 };
  let production = 0;
  let support = 0;
  for (const t of Object.values(tiles)) {
    if (t.buildingOwner !== playerType) continue;
    if (t.building === ps.production) production++;
    else if (t.building === ps.support) support++;
  }
  return { production, support };
}

export function getAllowedBuildTypes(tiles: LandgrabState["tiles"], playerType: string): BuildingType[] {
  const options = BUILD_OPTIONS[playerType];
  if (!options) return [];
  const ps = PRODUCTION_SUPPORT[playerType];
  if (!ps) return options;
  const { production, support } = countProductionAndSupport(tiles, playerType);
  const maxProduction = 2 * support + 1;
  return options.filter((b) => {
    if (b === ps.support) return true;
    if (b === ps.production) return production < maxProduction;
    return true;
  });
}

export function hasAnyValidBuildHex(
  tiles: LandgrabState["tiles"],
  playerType: string,
  landClaimsActive?: boolean
): boolean {
  const allowed = getAllowedBuildTypes(tiles, playerType);
  if (allowed.length === 0) return false;
  for (const k of Object.keys(tiles)) {
    for (const bt of allowed) {
      if (canPlaceBuild(tiles, hexFromKey(k), playerType, bt, landClaimsActive)) return true;
    }
  }
  return false;
}

export function canPlaceBuild(
  tiles: LandgrabState["tiles"],
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
  tiles: LandgrabState["tiles"],
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

export function countReserves(tiles: LandgrabState["tiles"], playerType: string): number {
  return Object.values(tiles).filter(
    (t) => t.building === "Reserve" && t.buildingOwner === playerType
  ).length;
}

export function canPlaceAirstrip(
  tiles: LandgrabState["tiles"],
  hex: HexCoord
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand"].includes(tile.type)) return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }
  return true;
}

/** Fisheries building: Water hex, empty, adjacent to any building you own; no Fog neighbor on this hex. */
export function canPlaceFisheries(
  tiles: LandgrabState["tiles"],
  hex: HexCoord,
  playerType: PlayerType
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.type !== "Water" || tile.building) return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }
  return hexNeighbors(hex).some((nb) => {
    const nt = tiles[hexKey(nb)];
    return !!(nt?.building && nt.buildingOwner === playerType);
  });
}

export function canPlaceConservation(
  tiles: LandgrabState["tiles"],
  hex: HexCoord
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.type !== "Forest" || tile.building || tile.hasConservation) return false;
  return true;
}

export function revealAdjacentFog(
  tiles: Record<string, LandgrabState["tiles"][string]>,
  hex: HexCoord,
  fogRadius: number
): Record<string, LandgrabState["tiles"][string]> {
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

export function getPresenceScore(tiles: LandgrabState["tiles"]): number {
  let score = 0;
  const reserves: HexCoord[] = [];
  for (const t of Object.values(tiles)) {
    if (t.building === "Reserve" && t.buildingOwner === "Chieftain") {
      score++;
      reserves.push(t.hex);
    }
  }
  const counted = new Set<string>();
  for (const rHex of reserves) {
    for (const nb of hexNeighbors(rHex)) {
      const k = hexKey(nb);
      const nt = tiles[k];
      if (nt?.building === "Village" && nt.buildingOwner === "Chieftain" && !counted.has(k)) {
        counted.add(k);
        score++;
      }
    }
  }
  return score;
}

export function canAffordMandate(tiles: LandgrabState["tiles"], player: LandgrabState["players"][0]): boolean {
  const cost = 10 + player.seats;
  switch (player.type) {
    case "Hotelier":
      return player.resources.coins >= cost;
    case "Industrialist":
      return (player.resources.wood + player.resources.ore) >= cost;
    case "Bureaucrat":
      return player.resources.votes >= cost;
    case "Chieftain":
      return getPresenceScore(tiles) >= cost;
  }
}

export function getMandateCostLabel(player: LandgrabState["players"][0]): string {
  const cost = 10 + player.seats;
  switch (player.type) {
    case "Hotelier": return `${cost} 💰`;
    case "Industrialist": return `${cost} 🪵/⚙️`;
    case "Bureaucrat": return `${cost} 🗳️`;
    case "Chieftain": return `Presence ≥ ${cost}`;
  }
}

// Procurement helper - count buildings for resource generation
function getProcurementMultiplier(tile: { hasUrbanPlanning?: boolean }): number {
  return tile.hasUrbanPlanning ? 2 : 1;
}

function isBuildingBoycotted(
  tiles: LandgrabState["tiles"],
  buildingHexKey: string,
  boycotterType: PlayerType
): boolean {
  const tile = tiles[buildingHexKey];
  if (!tile) return false;
  for (const nb of hexNeighbors(tile.hex)) {
    const nt = tiles[hexKey(nb)];
    if (
      nt?.buildingOwner === boycotterType &&
      (nt.building === "Reserve" || nt.building === "Village")
    )
      return true;
  }
  return false;
}

export function runProcurementForPlayer(
  tiles: LandgrabState["tiles"],
  playerType: PlayerType,
  currentResources: LandgrabState["players"][0]["resources"],
  boycottEffect?: LandgrabState["boycottEffect"],
  playerIndex?: number
): LandgrabState["players"][0]["resources"] {
  const res = { ...currentResources };
  const boycotter =
    boycottEffect !== undefined && boycottEffect.targetPlayerIndex === playerIndex
      ? boycottEffect.boycotterType
      : undefined;

  if (playerType === "Hotelier") {
    for (const t of Object.values(tiles)) {
      if (t.building === "Resort" && t.buildingOwner === "Hotelier") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let prod = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (!nt || nt.building === "Reserve") continue;
          if (["Forest", "Water", "Mountain"].includes(nt.type)) prod += 1;
          if (
            nt.building === "IndustrialZone" ||
            nt.building === "Infrastructure" ||
            nt.building === "Fisheries"
          )
            prod -= 1;
        }
        if (t.type === "Sand") {
          for (const nb of hexNeighbors(t.hex)) {
            const nt = tiles[hexKey(nb)];
            if (nt?.type === "Water" && nt.building !== "Reserve") { prod += 1; break; }
          }
        }
        res.coins += Math.max(0, prod) * getProcurementMultiplier(t);
      }
    }
  } else if (playerType === "Industrialist") {
    for (const t of Object.values(tiles)) {
      if (t.building === "IndustrialZone" && t.buildingOwner === "Industrialist") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let wood = 0, ore = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (!nt || nt.building === "Reserve") continue;
          if (nt.type === "Forest") wood += 1;
          if (nt.type === "Mountain") ore += 1;
        }
        const mult = getProcurementMultiplier(t);
        res.wood += wood * mult;
        res.ore += ore * mult;
      }
    }
  } else if (playerType === "Bureaucrat") {
    const countedHexes = new Set<string>();
    for (const t of Object.values(tiles)) {
      if (t.building === "Infrastructure" && t.buildingOwner === "Bureaucrat") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let votes = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const k = hexKey(nb);
          const nt = tiles[k];
          if (
            nt?.building &&
            nt.building !== "Reserve" &&
            ["Resort", "Village", "IndustrialZone", "Farm", "Housing"].includes(nt.building) &&
            !countedHexes.has(k)
          ) {
            countedHexes.add(k);
            votes += 1;
          }
        }
        res.votes += votes * getProcurementMultiplier(t);
      }
    }
  } else if (playerType === "Chieftain") {
    for (const t of Object.values(tiles)) {
      if (t.building === "Reserve" && t.buildingOwner === "Chieftain") {
        let adjOtherBuilding = false;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (nt?.buildingOwner && nt.buildingOwner !== "Chieftain")
            adjOtherBuilding = true;
        }
        if (!adjOtherBuilding)
          res.coins += 1 * getProcurementMultiplier(t);
      }
    }
  }

  return res;
}
