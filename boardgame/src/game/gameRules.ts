import type { LandgrabState, BuildingType, PlayerType, TileType } from './types';

const REVEALED_TERRAIN_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand", "Water"];

/** Deterministic terrain for a revealed Fog cell, from a hash of its key. */
export function pickRevealedTileType(key: string): TileType {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return REVEALED_TERRAIN_TYPES[(h >>> 0) % REVEALED_TERRAIN_TYPES.length];
}

/** Edge-sharing neighbor keys of a tile; empty if the key is not on the map. */
export function neighborKeys(tiles: LandgrabState["tiles"], key: string): string[] {
  return tiles[key]?.neighbors ?? [];
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
  key: string,
  _playerType: string,
  building: BuildingType
): boolean {
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
  key: string,
  buildingTypes: BuildingType[]
): boolean {
  for (const neighbor of neighborKeys(tiles, key)) {
    const t = tiles[neighbor];
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
      if (canPlaceBuild(tiles, k, playerType, bt, landClaimsActive)) return true;
    }
  }
  return false;
}

export function canPlaceBuild(
  tiles: LandgrabState["tiles"],
  key: string,
  playerType: string,
  _building: BuildingType,
  landClaimsActive?: boolean
): boolean {
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand"].includes(tile.type)) return false;
  if (tile.zoningOwner && tile.zoningOwner !== playerType) return false;

  const adj = BUILD_ADJACENCY[playerType];
  if (!adj || !hasAdjacent(tiles, key, adj)) return false;

  for (const neighbor of neighborKeys(tiles, key)) {
    const nt = tiles[neighbor];
    if (nt?.type === "Fog") return false;
    if (landClaimsActive && nt?.building === "Reserve") return false;
  }
  return true;
}

export function canPlaceReserve(
  tiles: LandgrabState["tiles"],
  key: string
): boolean {
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand", "Forest", "Mountain"].includes(tile.type)) return false;
  for (const neighbor of neighborKeys(tiles, key)) {
    const nt = tiles[neighbor];
    if (nt?.type === "Fog") return false;
  }
  return hasAdjacent(tiles, key, ["Village", "Reserve"]);
}

export function countReserves(tiles: LandgrabState["tiles"], playerType: string): number {
  return Object.values(tiles).filter(
    (t) => t.building === "Reserve" && t.buildingOwner === playerType
  ).length;
}

export function canPlaceAirstrip(
  tiles: LandgrabState["tiles"],
  key: string
): boolean {
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand"].includes(tile.type)) return false;
  for (const neighbor of neighborKeys(tiles, key)) {
    const nt = tiles[neighbor];
    if (nt?.type === "Fog") return false;
  }
  return true;
}

/** Fisheries building: Water hex, empty, adjacent to any building you own; no Fog neighbor on this hex. */
export function canPlaceFisheries(
  tiles: LandgrabState["tiles"],
  key: string,
  playerType: PlayerType
): boolean {
  const tile = tiles[key];
  if (!tile || tile.type !== "Water" || tile.building) return false;
  for (const neighbor of neighborKeys(tiles, key)) {
    const nt = tiles[neighbor];
    if (nt?.type === "Fog") return false;
  }
  return neighborKeys(tiles, key).some((nb) => {
    const nt = tiles[nb];
    return !!(nt?.building && nt.buildingOwner === playerType);
  });
}

export function canPlaceConservation(
  tiles: LandgrabState["tiles"],
  key: string
): boolean {
  const tile = tiles[key];
  if (!tile || tile.type !== "Forest" || tile.building || tile.hasConservation) return false;
  return true;
}

export function revealAdjacentFog(
  tiles: Record<string, LandgrabState["tiles"][string]>,
  key: string,
  fogRadius: number
): Record<string, LandgrabState["tiles"][string]> {
  const newTiles = { ...tiles };
  for (const nk of neighborKeys(tiles, key)) {
    const nt = newTiles[nk];
    if (nt?.type === "Fog") {
      const isOuterFogRing = nt.ring === fogRadius;
      newTiles[nk] = {
        ...nt,
        type: isOuterFogRing ? "Field" : pickRevealedTileType(nk),
      };
    }
  }
  return newTiles;
}

export function getPresenceScore(tiles: LandgrabState["tiles"]): number {
  let score = 0;
  const reserves: string[] = [];
  for (const t of Object.values(tiles)) {
    if (t.building === "Reserve" && t.buildingOwner === "Chieftain") {
      score++;
      reserves.push(t.id);
    }
  }
  const counted = new Set<string>();
  for (const rKey of reserves) {
    for (const nb of neighborKeys(tiles, rKey)) {
      const k = nb;
      const nt = tiles[k];
      if (nt?.building === "Village" && nt.buildingOwner === "Chieftain" && !counted.has(k)) {
        counted.add(k);
        score++;
      }
    }
  }
  return score;
}

/**
 * Resource amount required to play Mandate (faction-specific resource: coins / wood+ore / votes / presence).
 * Industrialist pays 2 less wood+ore total than the baseline `10 + seats` (balance vs Hotelier coin engine).
 */
export function getMandateResourceCost(player: LandgrabState["players"][0]): number {
  const base = 10 + player.seats;
  if (player.type === "Industrialist") return Math.max(0, base - 2);
  return base;
}

/** Mandate cost each Endorsement in the tableau may cover with non-faction resources. */
export const ENDORSEMENT_COVER = 3;

type ResourceKey = "coins" | "wood" | "ore" | "votes";

/** Resources a faction's Mandate is normally paid in (Chieftain pays in presence, which isn't spent). */
const MANDATE_CURRENCY: Record<PlayerType, ResourceKey[]> = {
  Hotelier: ["coins"],
  Industrialist: ["wood", "ore"],
  Bureaucrat: ["votes"],
  Chieftain: [],
};

export interface MandatePayment {
  /** Everything spent, including the 1-vote Mandate fee. */
  spend: Record<ResourceKey, number>;
  /** Endorsements needed to cover the shortfall (all Events leave the tableau on a Mandate anyway). */
  endorsementsUsed: number;
}

/**
 * How a player would pay for a Mandate right now, or null if they can't.
 * Faction currency (or Chieftain presence) is used first; each Endorsement
 * then covers up to {@link ENDORSEMENT_COVER} of the remainder with any other
 * resources. The 1-vote fee is reserved before anything else.
 */
export function planMandatePayment(
  tiles: LandgrabState["tiles"],
  player: LandgrabState["players"][0]
): MandatePayment | null {
  const avail = { ...player.resources };
  const spend: Record<ResourceKey, number> = { coins: 0, wood: 0, ore: 0, votes: 0 };
  if (avail.votes < 1) return null;
  avail.votes -= 1;
  spend.votes += 1;

  let remaining = getMandateResourceCost(player);
  if (player.type === "Chieftain") remaining -= Math.min(remaining, getPresenceScore(tiles));
  for (const r of MANDATE_CURRENCY[player.type]) {
    const used = Math.min(avail[r], remaining);
    avail[r] -= used;
    spend[r] += used;
    remaining -= used;
  }
  if (remaining === 0) return { spend, endorsementsUsed: 0 };

  const endorsements = player.tableau.filter((c) => c.cardType === "Endorsement").length;
  if (remaining > endorsements * ENDORSEMENT_COVER) return null;
  const endorsementsUsed = Math.ceil(remaining / ENDORSEMENT_COVER);

  // Substitute from the most plentiful other resource first.
  const others = (["coins", "wood", "ore", "votes"] as ResourceKey[]).filter(
    (r) => !MANDATE_CURRENCY[player.type].includes(r)
  );
  while (remaining > 0) {
    const r = others.reduce((a, b) => (avail[b] > avail[a] ? b : a));
    if (avail[r] === 0) return null;
    avail[r] -= 1;
    spend[r] += 1;
    remaining -= 1;
  }
  return { spend, endorsementsUsed };
}

export function canAffordMandate(tiles: LandgrabState["tiles"], player: LandgrabState["players"][0]): boolean {
  return planMandatePayment(tiles, player) !== null;
}

export function getMandateCostLabel(player: LandgrabState["players"][0]): string {
  const cost = getMandateResourceCost(player);
  switch (player.type) {
    case "Hotelier": return `${cost} 💰`;
    case "Industrialist": return `${cost} 🪵/⚙️`;
    case "Bureaucrat": return `${cost} 🗳️`;
    case "Chieftain": return `Presence ≥ ${cost}`;
  }
}

/** Extra wood/ore each producing Industrial Zone yields per Procurement. */
export const INDUSTRIALIST_EXTRACTION_BONUS = 1;

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
  for (const nb of tile.neighbors) {
    const nt = tiles[nb];
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
        const tk = t.id;
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let prod = 0;
        for (const nb of t.neighbors) {
          const nt = tiles[nb];
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
          for (const nb of t.neighbors) {
            const nt = tiles[nb];
            if (nt?.type === "Water" && nt.building !== "Reserve") { prod += 1; break; }
          }
        }
        res.coins += Math.max(0, prod) * getProcurementMultiplier(t);
      }
    }
  } else if (playerType === "Industrialist") {
    for (const t of Object.values(tiles)) {
      if (t.building === "IndustrialZone" && t.buildingOwner === "Industrialist") {
        const tk = t.id;
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let wood = 0, ore = 0;
        for (const nb of t.neighbors) {
          const nt = tiles[nb];
          if (!nt || nt.building === "Reserve") continue;
          if (nt.type === "Forest") wood += 1;
          if (nt.type === "Mountain") ore += 1;
        }
        // Extraction bonus: a zone that extracts anything yields +1 more of its main output.
        if (wood + ore > 0) {
          if (wood >= ore) wood += INDUSTRIALIST_EXTRACTION_BONUS;
          else ore += INDUSTRIALIST_EXTRACTION_BONUS;
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
        const tk = t.id;
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let votes = 0;
        for (const nb of t.neighbors) {
          const k = nb;
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
        for (const nb of t.neighbors) {
          const nt = tiles[nb];
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
