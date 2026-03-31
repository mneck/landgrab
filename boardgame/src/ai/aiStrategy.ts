import type { LandgrabState, PendingAction, BuildingType, TableauCard, PlayerType, CardType } from '../game/types';
import { hexFromKey, hexKey, hexNeighbors, hexDistance } from '../utils/hexGrid';
import type { HexCoord } from '../utils/hexGrid';
import {
  canPlaceCharter, getCharterBuilding, canPlaceBuild, canPlaceReserve,
  canPlaceConservation, canPlaceAirstrip, canPlaceFisheries, getAllowedBuildTypes, hasAnyValidBuildHex,
  canAffordMandate,
} from '../game/gameRules';
import { buyFromMarket, sellToMarket } from '../game/gameActions';

export interface AIMove {
  move: string;
  args: any[];
}

const NON_ACTIVATABLE: Set<CardType> = new Set(['Seat']);

export function getAIMove(G: LandgrabState, playerIndex: number): AIMove | null {
  const player = G.players[playerIndex];
  const pa = G.pendingAction;

  if (pa) return resolvePendingAction(G, playerIndex, pa);

  if (G.actionsRemainingThisTurn <= 0) {
    return { move: 'endTurn', args: [] };
  }

  const card = pickCardToActivate(G, playerIndex);
  if (!card) return { move: 'endTurn', args: [] };

  return { move: 'activateCard', args: [card.instanceId] };
}

// ---- Card selection ----

const CARD_PRIORITY: Record<string, number> = {
  Charter: 100,
  Mandate: 90,
  Dividends: 80, Subsidy: 80, NGOBacking: 80, LocalElections: 80,
  LandClaims: 75, Boycotting: 75, Protests: 75, Levy: 75, Expropriation: 75,
  Graft: 70, Import: 70, Export: 70,
  Airstrip: 68,
  Fisheries: 67,
  Logging: 65, Forestry: 65, Conservation: 65,
  Zoning: 60, UrbanPlanning: 60, Taxation: 60, Bribe: 60,
  Propaganda: 55,
  Restructuring: 50, Stimulus: 50,
  Liaison: 40,
  Builder: 30,
  Elder: 25,
  Guide: 20,
  Broker: 15, Forester: 15, Fixer: 15, Consultant: 15, Advocate: 15,
  Reorganization: 10,
};

function pickCardToActivate(G: LandgrabState, playerIndex: number): TableauCard | null {
  const player = G.players[playerIndex];
  const usable = player.tableau.filter(c => {
    if (NON_ACTIVATABLE.has(c.cardType)) return false;
    if (G.tokensUsedThisTurn.includes(c.instanceId)) return false;
    if (c.cardType === 'Mandate' && G.tokensUsedThisTurn.length > 0) return false;
    if (c.cardType === 'Mandate') {
      return player.resources.votes >= 1 && canAffordMandate(G.tiles, player);
    }
    if (c.cardType === 'Airstrip' && !canActivateAirstrip(G, player)) return false;
    if (c.cardType === 'Fisheries' && !canActivateFisheries(G, playerIndex)) return false;
    if (c.cardType === 'Import' && player.resources.coins < 1) return false;
    /** matches moves.activateCard → event_export_choose (must sell ≥1 wood or ore) */
    if (c.cardType === 'Export' && player.resources.wood < 1 && player.resources.ore < 1) return false;
    if (c.cardType === 'UrbanPlanning' && pickUrbanPlanningHex(G, player.type, player.resources) === null) {
      return false;
    }
    return true;
  });

  if (usable.length === 0) return null;

  usable.sort((a, b) => (CARD_PRIORITY[b.cardType] ?? 0) - (CARD_PRIORITY[a.cardType] ?? 0));

  for (const card of usable) {
    if (card.cardType === 'Builder') {
      const canBuild = hasAnyValidBuildHex(G.tiles, player.type, G.landClaimsUntilPlayer !== undefined)
        && player.resources.wood >= 1 && player.resources.ore >= 1 && player.resources.coins >= 1;
      if (!canBuild && player.resources.coins < 1) continue;
    }
    return card;
  }

  return usable[0] ?? null;
}

// ---- Pending action resolution ----

function resolvePendingAction(G: LandgrabState, playerIndex: number, pa: PendingAction): AIMove | null {
  const player = G.players[playerIndex];

  switch (pa.type) {
    case 'charter_place': {
      const hex = pickBestCharterHex(G, player.type);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'builder_choose': {
      const canBuild = hasAnyValidBuildHex(G.tiles, player.type, G.landClaimsUntilPlayer !== undefined)
        && player.resources.wood >= 1 && player.resources.ore >= 1 && player.resources.coins >= 1;
      return { move: 'chooseOption', args: [canBuild ? 'build' : 'market'] };
    }

    case 'builder_build_type': {
      const allowed = getAllowedBuildTypes(G.tiles, player.type);
      const production = allowed.find(b => ['Resort', 'IndustrialZone', 'Infrastructure'].includes(b));
      return { move: 'chooseBuildingType', args: [production ?? allowed[0]] };
    }

    case 'builder_build_hex': {
      const hex = pickBestBuildHex(G, playerIndex, pa.buildingType);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'builder_market_choose': {
      const action = pickMarketAction(G, playerIndex);
      return action
        ? { move: 'chooseOption', args: [action] }
        : { move: 'cancelAction', args: [] };
    }

    case 'builder_market_buy':
    case 'builder_market_sell':
      return { move: 'chooseOption', args: ['done'] };

    case 'liaison_choose': {
      const hasBuildings = Object.values(G.tiles).some(t => t.buildingOwner === player.type);
      const politicsSlot = pickBestPoliticsSlot(G, playerIndex);
      if (hasBuildings && player.tableau.length < 7 && politicsSlot !== null) {
        return { move: 'chooseOption', args: ['politics'] };
      }
      return { move: 'chooseOption', args: ['generate'] };
    }

    case 'liaison_politics': {
      const slot = pickBestPoliticsSlot(G, playerIndex);
      return slot !== null ? { move: 'selectPoliticsCard', args: [slot] } : { move: 'cancelAction', args: [] };
    }

    case 'guide_choose': {
      const hasFog = Object.values(G.tiles).some(t => t.type === 'Fog');
      if (hasFog) return { move: 'chooseOption', args: ['reveal'] };
      if (player.resources.coins >= 2) return { move: 'chooseOption', args: ['network'] };
      return { move: 'chooseOption', args: ['reveal'] };
    }

    case 'guide_reveal_hex': {
      const hex = pickRevealHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'guide_network': {
      const slot = pickNetworkSlot(G);
      return slot !== null ? { move: 'selectNetworkCard', args: [slot] } : { move: 'cancelAction', args: [] };
    }

    case 'network_bid': {
      const initiator = pa.initiatorPlayerIndex === playerIndex;
      const coins = player.resources.coins;
      if (!initiator && coins < 1) {
        return { move: 'submitNetworkBid', args: [0] };
      }
      const bid = initiator
        ? Math.min(Math.max(1, Math.floor(coins / 4)), coins)
        : Math.min(Math.max(0, Math.floor(coins / 5)), coins);
      return { move: 'submitNetworkBid', args: [Math.max(initiator ? 1 : 0, bid)] };
    }

    case 'elder_choose': {
      const hasFog = Object.values(G.tiles).some(t => t.type === 'Fog');
      if (hasFog) return { move: 'chooseOption', args: ['village'] };
      return { move: 'chooseOption', args: ['reserve'] };
    }

    case 'elder_village_hex': {
      const hex = pickFogHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'elder_reserve_hex': {
      const hex = pickReserveHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_bribe': {
      for (let i = 0; i < 4; i++) {
        const card = G.politicsRow[i];
        if (card && card !== 'Mandate' && player.resources.coins >= 1) {
          return { move: 'chooseOption', args: [i.toString()] };
        }
      }
      return { move: 'cancelAction', args: [] };
    }

    case 'event_zoning_hex': {
      const hex = pickZoningHex(G, player.type);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_conservation_hex': {
      const hex = pickConservationHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_logging_hex': {
      const hex = pickLoggingHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_forestry_hex': {
      const hex = pickForestryHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_airstrip_hex': {
      const hex = pickAirstripHex(G);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_fisheries_hex': {
      const hex = pickFisheriesHex(G, playerIndex);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_import_choose': {
      if (player.resources.coins < 1) return { move: 'cancelAction', args: [] };
      const pick: 'wood' | 'ore' =
        player.resources.wood <= player.resources.ore ? 'wood' : 'ore';
      return { move: 'chooseOption', args: [pick] };
    }

    case 'event_export_choose': {
      const { wood, ore } = player.resources;
      if (wood < 1 && ore < 1) return { move: 'cancelAction', args: [] };
      let pick: 'wood' | 'ore' = wood >= ore ? 'wood' : 'ore';
      if (player.resources[pick] < 1) pick = pick === 'wood' ? 'ore' : 'wood';
      return { move: 'chooseOption', args: [pick] };
    }

    case 'event_graft_choose':
      return { move: 'chooseOption', args: [player.resources.coins > player.resources.votes ? 'coin_to_vote' : 'vote_to_coin'] };

    case 'event_taxation_hex': {
      const hex = pickTaxationHex(G, player.type);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_urbanplanning_hex': {
      const hex = pickUrbanPlanningHex(G, player.type, player.resources);
      return hex ? { move: 'placeOnHex', args: [hex] } : { move: 'cancelAction', args: [] };
    }

    case 'event_restructuring_choose': {
      const personnel = player.tableau.filter(c => c.category === 'Personnel');
      if (personnel.length === 0) return { move: 'cancelAction', args: [] };
      const least = personnel.reduce((a, b) =>
        (CARD_PRIORITY[a.cardType] ?? 0) < (CARD_PRIORITY[b.cardType] ?? 0) ? a : b
      );
      return { move: 'chooseRestructuringTarget', args: [least.instanceId] };
    }

    case 'event_stimulus_choose': {
      const res = pickStimulusResource(player.type, player.resources);
      return { move: 'chooseStimulusResource', args: [res] };
    }

    case 'broker_choose':
      return { move: 'chooseOption', args: ['import'] };

    case 'forester_choose':
      return { move: 'chooseOption', args: ['logging'] };

    default:
      return { move: 'endTurn', args: [] };
  }
}

// ---- Hex scoring helpers ----

function scoreCharterHex(G: LandgrabState, k: string, playerType: PlayerType): number {
  const tile = G.tiles[k];
  if (!tile) return -1;
  const hex = hexFromKey(k);
  let score = 0;

  const center = { q: 0, r: 0 };
  score += Math.max(0, 5 - hexDistance(hex, center));

  for (const nb of hexNeighbors(hex)) {
    const nt = G.tiles[hexKey(nb)];
    if (!nt) continue;
    if (nt.type === 'Fog') score += 1;
    if (playerType === 'Hotelier') {
      if (['Forest', 'Water', 'Mountain'].includes(nt.type)) score += 2;
      if (nt.type === 'Sand' && tile.type === 'Sand') score += 1;
    } else if (playerType === 'Industrialist') {
      if (nt.type === 'Forest') score += 2;
      if (nt.type === 'Mountain') score += 2;
    } else if (playerType === 'Bureaucrat') {
      if (nt.building && nt.buildingOwner !== playerType) score += 3;
    }
  }

  return score;
}

function pickBestCharterHex(G: LandgrabState, playerType: PlayerType): string | null {
  const building = getCharterBuilding(playerType);
  let bestKey: string | null = null;
  let bestScore = -1;

  for (const k of Object.keys(G.tiles)) {
    if (!canPlaceCharter(G.tiles, hexFromKey(k), playerType, building)) continue;
    const score = scoreCharterHex(G, k, playerType);
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

function scoreBuildHex(G: LandgrabState, k: string, playerType: PlayerType, buildingType: BuildingType): number {
  const hex = hexFromKey(k);
  let score = 0;
  const center = { q: 0, r: 0 };
  score += Math.max(0, 4 - hexDistance(hex, center));

  for (const nb of hexNeighbors(hex)) {
    const nt = G.tiles[hexKey(nb)];
    if (!nt) continue;

    if (buildingType === 'Resort') {
      if (['Forest', 'Water', 'Mountain'].includes(nt.type)) score += 2;
      if (
        nt.building === 'IndustrialZone' ||
        nt.building === 'Infrastructure' ||
        nt.building === 'Fisheries'
      )
        score -= 1;
    } else if (buildingType === 'IndustrialZone') {
      if (nt.type === 'Forest') score += 2;
      if (nt.type === 'Mountain') score += 2;
      if (nt.building === 'Reserve') score -= 2;
    } else if (buildingType === 'Infrastructure') {
      if (nt.building && nt.buildingOwner !== playerType) score += 3;
    } else if (buildingType === 'Reserve') {
      if (nt.building === 'Village' && nt.buildingOwner === playerType) score += 3;
      if (nt.building && nt.buildingOwner !== playerType) score -= 1;
    }
  }
  return score;
}

function pickBestBuildHex(G: LandgrabState, playerIndex: number, buildingType: BuildingType): string | null {
  const playerType = G.players[playerIndex].type;
  let bestKey: string | null = null;
  let bestScore = -Infinity;

  for (const k of Object.keys(G.tiles)) {
    if (!canPlaceBuild(G.tiles, hexFromKey(k), playerType, buildingType, G.landClaimsUntilPlayer !== undefined)) continue;
    const score = scoreBuildHex(G, k, playerType, buildingType);
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

function pickMarketAction(G: LandgrabState, playerIndex: number): string | null {
  const res = G.players[playerIndex].resources;

  const canBuyWood = (): boolean => {
    const r = buyFromMarket(G.woodMarket, 1);
    return r !== null && res.coins >= r.totalCost;
  };
  const canBuyOre = (): boolean => {
    const r = buyFromMarket(G.oreMarket, 1);
    return r !== null && res.coins >= r.totalCost;
  };
  const canSellWood = (): boolean =>
    res.wood >= 1 && sellToMarket(G.woodMarket, 1) !== null;
  const canSellOre = (): boolean =>
    res.ore >= 1 && sellToMarket(G.oreMarket, 1) !== null;

  if (res.wood < 1 && canBuyWood()) return 'buy_wood';
  if (res.ore < 1 && canBuyOre()) return 'buy_ore';
  if (res.wood > 3 && canSellWood()) return 'sell_wood';
  if (res.ore > 3 && canSellOre()) return 'sell_ore';
  if (res.coins >= 2) {
    if (canBuyWood() && canBuyOre()) return res.wood <= res.ore ? 'buy_wood' : 'buy_ore';
    if (canBuyWood()) return 'buy_wood';
    if (canBuyOre()) return 'buy_ore';
  }
  if (canSellWood() && canSellOre()) return res.wood >= res.ore ? 'sell_wood' : 'sell_ore';
  if (canSellWood()) return 'sell_wood';
  if (canSellOre()) return 'sell_ore';
  if (canBuyWood()) return 'buy_wood';
  if (canBuyOre()) return 'buy_ore';
  return null;
}

function pickBestPoliticsSlot(G: LandgrabState, playerIndex: number): number | null {
  const player = G.players[playerIndex];
  const VOTE_COSTS = [0, 1, 2, 3];

  for (let i = 0; i < 4; i++) {
    const card = G.politicsRow[i];
    if (!card) continue;
    const cost = VOTE_COSTS[i] ?? 0;
    if (player.resources.votes >= cost && player.tableau.length < 8) return i;
  }
  return null;
}

function pickRevealHex(G: LandgrabState): string | null {
  let bestKey: string | null = null;
  let bestFogCount = -1;

  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.type === 'Fog') continue;
    const hex = hexFromKey(k);
    let fogCount = 0;
    for (const nb of hexNeighbors(hex)) {
      const nt = G.tiles[hexKey(nb)];
      if (nt?.type === 'Fog') fogCount++;
    }
    if (fogCount > bestFogCount) {
      bestFogCount = fogCount;
      bestKey = k;
    }
  }
  return bestKey;
}

function pickNetworkSlot(G: LandgrabState): number | null {
  for (let i = 0; i < G.networkRow.length; i++) {
    if (G.networkRow[i]) return i;
  }
  return null;
}

function pickFogHex(G: LandgrabState): string | null {
  const center = { q: 0, r: 0 };
  let bestKey: string | null = null;
  let bestDist = Infinity;

  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.type !== 'Fog') continue;
    const dist = hexDistance(tile.hex, center);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = k;
    }
  }
  return bestKey;
}

function pickReserveHex(G: LandgrabState): string | null {
  let bestKey: string | null = null;
  let bestScore = -Infinity;

  for (const k of Object.keys(G.tiles)) {
    if (!canPlaceReserve(G.tiles, hexFromKey(k))) continue;
    const score = scoreBuildHex(G, k, 'Chieftain', 'Reserve');
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

function pickZoningHex(G: LandgrabState, playerType: PlayerType): string | null {
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (!['Field', 'Sand'].includes(tile.type) || tile.building || tile.zoningOwner) continue;
    const adj = hexNeighbors(hexFromKey(k));
    if (adj.some(nb => G.tiles[hexKey(nb)]?.buildingOwner === playerType)) return k;
  }
  return null;
}

function pickConservationHex(G: LandgrabState): string | null {
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (canPlaceConservation(G.tiles, hexFromKey(k))) return k;
  }
  return null;
}

function pickLoggingHex(G: LandgrabState): string | null {
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.type === 'Forest' && !tile.hasConservation && !tile.building) return k;
  }
  return null;
}

function pickForestryHex(G: LandgrabState): string | null {
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.type === 'Field' && !tile.building) return k;
  }
  return null;
}

function pickTaxationHex(G: LandgrabState, playerType: PlayerType): string | null {
  let bestKey: string | null = null;
  let bestCount = 0;

  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.building !== 'Reserve' || tile.buildingOwner !== playerType) continue;
    let count = 0;
    for (const nb of hexNeighbors(hexFromKey(k))) {
      const nt = G.tiles[hexKey(nb)];
      if (nt?.building && nt.buildingOwner !== playerType) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestKey = k;
    }
  }
  return bestKey;
}

function pickUrbanPlanningHex(G: LandgrabState, playerType: PlayerType, resources: LandgrabState['players'][0]['resources']): string | null {
  if (resources.wood < 1 || resources.ore < 1 || resources.coins < 1) return null;
  const productionTypes: BuildingType[] = ['Resort', 'IndustrialZone', 'Infrastructure', 'Village'];
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.buildingOwner === playerType && productionTypes.includes(tile.building!) && !tile.hasUrbanPlanning) return k;
  }
  return null;
}

function pickFisheriesHex(G: LandgrabState, playerIndex: number): string | null {
  const playerType = G.players[playerIndex].type;
  const center = { q: 0, r: 0 };
  let bestKey: string | null = null;
  let bestScore = -Infinity;

  for (const k of Object.keys(G.tiles)) {
    if (!canPlaceFisheries(G.tiles, hexFromKey(k), playerType)) continue;
    const hex = hexFromKey(k);
    let score = Math.max(0, 5 - hexDistance(hex, center));
    for (const nb of hexNeighbors(hex)) {
      const nt = G.tiles[hexKey(nb)];
      if (nt?.building === 'Resort' && nt.buildingOwner !== playerType) score += 6;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

function canActivateFisheries(G: LandgrabState, playerIndex: number): boolean {
  return pickFisheriesHex(G, playerIndex) !== null;
}

function pickAirstripHex(G: LandgrabState): string | null {
  const center = { q: 0, r: 0 };
  let bestKey: string | null = null;
  let bestScore = -Infinity;

  for (const k of Object.keys(G.tiles)) {
    if (!canPlaceAirstrip(G.tiles, hexFromKey(k))) continue;
    const hex = hexFromKey(k);
    let score = Math.max(0, 5 - hexDistance(hex, center));
    for (const nb of hexNeighbors(hex)) {
      const nt = G.tiles[hexKey(nb)];
      if (!nt) continue;
      if (['Field', 'Sand'].includes(nt.type) && !nt.building) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

/**
 * True iff `activateCard` would accept Airstrip now: resource cost in moves.ts and at least one
 * Field/Sand hex with no Fog neighbor (same predicate as pickAirstripHex).
 */
function canActivateAirstrip(G: LandgrabState, player: LandgrabState['players'][0]): boolean {
  if (player.resources.coins < 1 || player.resources.wood < 1 || player.resources.ore < 1) return false;
  return pickAirstripHex(G) !== null;
}

function pickStimulusResource(playerType: PlayerType, resources: LandgrabState['players'][0]['resources']): 'coins' | 'wood' | 'ore' | 'votes' {
  switch (playerType) {
    case 'Hotelier': return 'coins';
    case 'Industrialist': return resources.wood <= resources.ore ? 'wood' : 'ore';
    case 'Bureaucrat': return 'votes';
    case 'Chieftain': return 'coins';
  }
}
