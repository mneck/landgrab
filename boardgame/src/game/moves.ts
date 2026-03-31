import { INVALID_MOVE } from 'boardgame.io/core';
import type { LandgrabState, BuildingType, EventCardType, PersonnelCardType } from './types';
import {
  getCharterBuilding,
  canPlaceCharter,
  canPlaceBuild,
  canPlaceReserve,
  canPlaceConservation,
  canPlaceAirstrip,
  canPlaceFisheries,
  getAllowedBuildTypes,
  revealAdjacentFog,
  pickRevealedTileType,
  runProcurementForPlayer,
  canAffordMandate as canAffordMandateCheck,
  getPresenceScore,
} from './gameRules';
import {
  updateFogCount,
  rotatePoliticsEndOfRound,
  shiftPoliticsRowAfterPurchase,
  buyFromMarket,
  sellToMarket,
} from './gameActions';
import { hexFromKey, hexKey, hexNeighbors } from '../utils/hexGrid';

// ---- Helpers ----

function removeFromTableau(G: LandgrabState, playerIndex: number, instanceId: string): void {
  G.players[playerIndex].tableau = G.players[playerIndex].tableau.filter(
    (c) => c.instanceId !== instanceId
  );
}

function checkWinCondition(G: LandgrabState): void {
  const need = G.winSeatThreshold;
  for (const p of G.players) {
    if (p.seats >= need) {
      G.winner = p.type;
    }
  }
}

function resolveDividends(G: LandgrabState, playerIndex: number, instanceId: string): void {
  const player = G.players[playerIndex];
  const productionBuildings = ['IndustrialZone', 'Resort', 'Village', 'Infrastructure'];
  let count = 0;
  for (const t of Object.values(G.tiles)) {
    if (t.buildingOwner === player.type && productionBuildings.includes(t.building ?? '')) {
      count++;
    }
  }
  player.resources.coins += count;
  removeFromTableau(G, playerIndex, instanceId);
}

function resolveSubsidy(G: LandgrabState, playerIndex: number, instanceId: string): void {
  const player = G.players[playerIndex];
  let count = 0;
  for (const t of Object.values(G.tiles)) {
    if (t.building === 'Reserve' && t.buildingOwner === player.type) count++;
  }
  player.resources.coins += count;
  removeFromTableau(G, playerIndex, instanceId);
}

function resolveNGOBacking(G: LandgrabState, playerIndex: number, instanceId: string): void {
  const player = G.players[playerIndex];
  if (player.type !== 'Chieftain') {
    removeFromTableau(G, playerIndex, instanceId);
    return;
  }
  let villages = 0;
  for (const t of Object.values(G.tiles)) {
    if (t.building === 'Village' && t.buildingOwner === 'Chieftain') villages++;
  }
  player.resources.coins += villages;
  removeFromTableau(G, playerIndex, instanceId);
}

function resolveLocalElections(G: LandgrabState, playerIndex: number, instanceId: string): void {
  const player = G.players[playerIndex];
  if (player.type !== 'Chieftain') {
    removeFromTableau(G, playerIndex, instanceId);
    return;
  }
  let villages = 0;
  for (const t of Object.values(G.tiles)) {
    if (t.building === 'Village' && t.buildingOwner === 'Chieftain') villages++;
  }
  player.resources.votes += villages;
  removeFromTableau(G, playerIndex, instanceId);
}

function resolveLandClaims(G: LandgrabState, playerIndex: number, instanceId: string): void {
  // Land claims active until this player's next turn
  G.landClaimsUntilPlayer = playerIndex;
  removeFromTableau(G, playerIndex, instanceId);
}

function payMandateCost(G: LandgrabState, playerIndex: number): boolean {
  const player = G.players[playerIndex];
  if (!canAffordMandateCheck(G.tiles, player)) return false;
  const cost = 10 + player.seats;
  switch (player.type) {
    case 'Hotelier':
      player.resources.coins -= cost;
      return true;
    case 'Industrialist': {
      let remaining = cost;
      const woodSpend = Math.min(player.resources.wood, remaining);
      player.resources.wood -= woodSpend;
      remaining -= woodSpend;
      player.resources.ore -= remaining;
      return true;
    }
    case 'Bureaucrat':
      player.resources.votes -= cost;
      return true;
    case 'Chieftain':
      return true;
  }
}

/** Initiator first, then rest of play order. */
function networkBiddingOrder(playOrder: string[], initiatorPlayerIndex: number): string[] {
  const initiator = String(initiatorPlayerIndex);
  const idx = playOrder.indexOf(initiator);
  if (idx < 0) return [...playOrder];
  return [...playOrder.slice(idx), ...playOrder.slice(0, idx)];
}

function resolveNetworkAuction(
  G: LandgrabState,
  playOrder: string[],
  pa: { slotIndex: number; bids: Record<string, number | null> }
): void {
  const card = G.networkRow[pa.slotIndex];
  if (!card) {
    G.pendingAction = null;
    return;
  }

  let maxBid = -1;
  for (const pid of playOrder) {
    const amt = pa.bids[pid];
    if (amt !== null && amt !== undefined && amt >= 1) {
      maxBid = Math.max(maxBid, amt);
    }
  }

  if (maxBid < 1) {
    G.pendingAction = null;
    return;
  }

  const tied = playOrder.filter(pid => pa.bids[pid] === maxBid);
  let winner = tied[0];
  for (const pid of playOrder) {
    if (tied.includes(pid)) {
      winner = pid;
      break;
    }
  }

  const wIdx = parseInt(winner, 10);
  G.players[wIdx].resources.coins -= maxBid;
  G.players[wIdx].tableau.push({
    instanceId: `${card}_${wIdx}_${Date.now()}`,
    cardType: card as PersonnelCardType,
    category: 'Personnel',
  });
  G.networkRow[pa.slotIndex] = G.networkDeck.shift() ?? null;
  G.pendingAction = null;
}

function activateMandate(G: LandgrabState, playerIndex: number, instanceId: string): boolean {
  const player = G.players[playerIndex];
  if (player.resources.votes < 1) return false;
  if (!payMandateCost(G, playerIndex)) return false;
  player.resources.votes -= 1;

  player.tableau = player.tableau.filter(c => c.category !== 'Event');

  player.seats++;

  if (player.tableau.length < 8) {
    player.tableau.push({
      instanceId: `Seat_${playerIndex}_${Date.now()}`,
      cardType: 'Seat' as EventCardType,
      category: 'Event',
    });
  }
  if (player.tableau.length < 8) {
    player.tableau.push({
      instanceId: `Restructuring_${playerIndex}_${Date.now()}`,
      cardType: 'Restructuring' as EventCardType,
      category: 'Event',
    });
  }

  checkWinCondition(G);
  return true;
}

// ---- Moves ----

type CtxShape = {
  currentPlayer: string;
  numPlayers: number;
  playOrder: string[];
  activePlayers?: null | Record<string, string>;
};

type MoveArgs = {
  G: LandgrabState;
  ctx: CtxShape;
  events?: {
    endTurn: () => void;
    setActivePlayers: (arg: unknown) => void;
  };
};

type StageMoveArgs = MoveArgs & { playerID: string };

export const moves = {
  activateCard: ({ G, ctx }: MoveArgs, instanceId: string) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    const player = G.players[playerIndex];
    const card = player.tableau.find(c => c.instanceId === instanceId);
    if (!card) return INVALID_MOVE;
    if (G.tokensUsedThisTurn.includes(instanceId)) return INVALID_MOVE;
    if (G.pendingAction) return INVALID_MOVE;
    if (G.actionsRemainingThisTurn === 0) return INVALID_MOVE;
    if (card.cardType === 'Mandate' && G.tokensUsedThisTurn.length > 0) return INVALID_MOVE;

    G.tokensUsedThisTurn.push(instanceId);
    G.actionsRemainingThisTurn -= 1;

    switch (card.cardType) {
      case 'Builder':
        G.pendingAction = { type: 'builder_choose', instanceId };
        break;
      case 'Guide':
        G.pendingAction = { type: 'guide_choose', instanceId };
        break;
      case 'Liaison':
        G.pendingAction = { type: 'liaison_choose', instanceId };
        break;
      case 'Elder':
        G.pendingAction = { type: 'elder_choose', instanceId };
        break;
      case 'Fixer': {
        player.tableau.push({
          instanceId: `Graft_${playerIndex}_${Date.now()}`,
          cardType: 'Graft' as EventCardType,
          category: 'Event',
        });
        break;
      }
      case 'Broker':
        G.pendingAction = { type: 'broker_choose', instanceId };
        break;
      case 'Forester':
        G.pendingAction = { type: 'forester_choose', instanceId };
        break;
      case 'Consultant': {
        player.tableau.push({
          instanceId: `Reorganization_${playerIndex}_${Date.now()}`,
          cardType: 'Reorganization' as EventCardType,
          category: 'Event',
        });
        break;
      }
      case 'Advocate': {
        player.tableau.push({
          instanceId: `Taxation_${playerIndex}_${Date.now()}`,
          cardType: 'Taxation' as EventCardType,
          category: 'Event',
        });
        break;
      }
      case 'Charter':
        removeFromTableau(G, playerIndex, instanceId);
        G.pendingAction = { type: 'charter_place', instanceId };
        break;
      case 'Airstrip': {
        const p = G.players[playerIndex];
        if (p.resources.coins < 1 || p.resources.wood < 1 || p.resources.ore < 1) return INVALID_MOVE;
        removeFromTableau(G, playerIndex, instanceId);
        G.pendingAction = { type: 'event_airstrip_hex', instanceId };
        break;
      }
      case 'Fisheries': {
        removeFromTableau(G, playerIndex, instanceId);
        G.pendingAction = { type: 'event_fisheries_hex', instanceId };
        break;
      }
      case 'Dividends':
        resolveDividends(G, playerIndex, instanceId);
        break;
      case 'Import':
        G.pendingAction = { type: 'event_import_choose', instanceId };
        break;
      case 'Export':
        G.pendingAction = { type: 'event_export_choose', instanceId };
        break;
      case 'Bribe':
        G.pendingAction = { type: 'event_bribe', instanceId };
        break;
      case 'Zoning':
        G.pendingAction = { type: 'event_zoning_hex', instanceId };
        break;
      case 'Conservation':
        G.pendingAction = { type: 'event_conservation_hex', instanceId };
        break;
      case 'Logging':
        G.pendingAction = { type: 'event_logging_hex', instanceId };
        break;
      case 'Forestry':
        G.pendingAction = { type: 'event_forestry_hex', instanceId };
        break;
      case 'Taxation':
        G.pendingAction = { type: 'event_taxation_hex', instanceId };
        break;
      case 'Graft':
        G.pendingAction = { type: 'event_graft_choose', instanceId };
        break;
      case 'UrbanPlanning':
        G.pendingAction = { type: 'event_urbanplanning_hex', instanceId };
        break;
      case 'Subsidy':
        resolveSubsidy(G, playerIndex, instanceId);
        break;
      case 'NGOBacking':
        resolveNGOBacking(G, playerIndex, instanceId);
        break;
      case 'LocalElections':
        resolveLocalElections(G, playerIndex, instanceId);
        break;
      case 'LandClaims':
        resolveLandClaims(G, playerIndex, instanceId);
        break;
      case 'Mandate':
        if (!activateMandate(G, playerIndex, instanceId)) return INVALID_MOVE;
        break;
      case 'Restructuring':
        G.pendingAction = { type: 'event_restructuring_choose', instanceId };
        break;
      case 'Stimulus':
        G.pendingAction = { type: 'event_stimulus_choose', instanceId, remaining: 4 };
        break;
      case 'Seat':
        return INVALID_MOVE;
      default:
        removeFromTableau(G, playerIndex, instanceId);
        break;
    }
  },

  chooseOption: ({ G, ctx }: MoveArgs, option: string) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction) return INVALID_MOVE;
    const { type } = G.pendingAction;

    if (type === 'builder_choose') {
      if (option === 'build') {
        G.pendingAction = { type: 'builder_build_type', instanceId: G.pendingAction.instanceId };
      } else if (option === 'market') {
        G.pendingAction = { type: 'builder_market_choose', instanceId: G.pendingAction.instanceId };
      } else return INVALID_MOVE;
    }
    else if (type === 'liaison_choose') {
      const instanceId = G.pendingAction.instanceId;
      if (option === 'generate') {
        const player = G.players[playerIndex];
        player.resources = runProcurementForPlayer(
          G.tiles,
          player.type,
          player.resources,
          G.boycottEffect,
          playerIndex
        );
        if (G.boycottEffect?.targetPlayerIndex === playerIndex) {
          G.boycottEffect = undefined;
        }
        G.pendingAction = null;
      } else if (option === 'politics') {
        G.pendingAction = { type: 'liaison_politics', instanceId };
      } else return INVALID_MOVE;
    }
    else if (type === 'guide_choose') {
      if (option === 'reveal') {
        G.pendingAction = { type: 'guide_reveal_hex', instanceId: G.pendingAction.instanceId };
      } else if (option === 'network') {
        G.pendingAction = { type: 'guide_network', instanceId: G.pendingAction.instanceId };
      } else return INVALID_MOVE;
    }
    else if (type === 'elder_choose') {
      if (option === 'village') {
        G.pendingAction = { type: 'elder_village_hex', instanceId: G.pendingAction.instanceId };
      } else if (option === 'reserve') {
        G.pendingAction = { type: 'elder_reserve_hex', instanceId: G.pendingAction.instanceId };
      } else return INVALID_MOVE;
    }
    else if (type === 'builder_market_choose') {
      const instanceId = G.pendingAction.instanceId;
      if (option === 'buy_wood') {
        G.pendingAction = { type: 'builder_market_buy', instanceId, resource: 'wood', amount: 1 };
      } else if (option === 'buy_ore') {
        G.pendingAction = { type: 'builder_market_buy', instanceId, resource: 'ore', amount: 1 };
      } else if (option === 'sell_wood') {
        G.pendingAction = { type: 'builder_market_sell', instanceId, resource: 'wood', amount: 1 };
      } else if (option === 'sell_ore') {
        G.pendingAction = { type: 'builder_market_sell', instanceId, resource: 'ore', amount: 1 };
      } else return INVALID_MOVE;
    }
    else if (type === 'builder_market_buy') {
      const instanceId = G.pendingAction.instanceId;
      const resource = G.pendingAction.resource;
      const market = resource === 'wood' ? G.woodMarket : G.oreMarket;
      const result = buyFromMarket(market, 1);
      if (!result) return INVALID_MOVE;
      if (G.players[playerIndex].resources.coins < result.totalCost) return INVALID_MOVE;
      G.players[playerIndex].resources.coins -= result.totalCost;
      G.players[playerIndex].resources[resource] += 1;
      if (resource === 'wood') G.woodMarket = result.newTrack;
      else G.oreMarket = result.newTrack;
      // Ask if want to do another buy/sell or done
      if (option === 'done') {
        G.pendingAction = null;
      } else {
        G.pendingAction = { type: 'builder_market_choose', instanceId };
      }
    }
    else if (type === 'builder_market_sell') {
      const instanceId = G.pendingAction.instanceId;
      const resource = G.pendingAction.resource;
      if (G.players[playerIndex].resources[resource] < 1) return INVALID_MOVE;
      const market = resource === 'wood' ? G.woodMarket : G.oreMarket;
      const result = sellToMarket(market, 1);
      if (!result) return INVALID_MOVE;
      G.players[playerIndex].resources[resource] -= 1;
      G.players[playerIndex].resources.coins += result.totalGain;
      if (resource === 'wood') G.woodMarket = result.newTrack;
      else G.oreMarket = result.newTrack;
      if (option === 'done') {
        G.pendingAction = null;
      } else {
        G.pendingAction = { type: 'builder_market_choose', instanceId };
      }
    }
    else if (type === 'broker_choose') {
      if (option !== 'import' && option !== 'export') return INVALID_MOVE;
      const cardType = option === 'import' ? 'Import' : 'Export';
      G.players[playerIndex].tableau.push({
        instanceId: `${cardType}_${playerIndex}_${Date.now()}`,
        cardType: cardType as EventCardType,
        category: 'Event',
      });
      G.pendingAction = null;
    }
    else if (type === 'forester_choose') {
      if (option !== 'logging' && option !== 'forestry') return INVALID_MOVE;
      const cardType = option === 'logging' ? 'Logging' : 'Forestry';
      G.players[playerIndex].tableau.push({
        instanceId: `${cardType}_${playerIndex}_${Date.now()}`,
        cardType: cardType as EventCardType,
        category: 'Event',
      });
      G.pendingAction = null;
    }
    else if (type === 'event_import_choose') {
      const instanceId = G.pendingAction.instanceId;
      if (option !== 'wood' && option !== 'ore') return INVALID_MOVE;
      if (G.players[playerIndex].resources.coins < 1) return INVALID_MOVE;
      G.players[playerIndex].resources.coins -= 1;
      G.players[playerIndex].resources[option] += 1;
      removeFromTableau(G, playerIndex, instanceId);
      G.pendingAction = null;
    }
    else if (type === 'event_export_choose') {
      const instanceId = G.pendingAction.instanceId;
      if (option !== 'wood' && option !== 'ore') return INVALID_MOVE;
      if (G.players[playerIndex].resources[option] < 1) return INVALID_MOVE;
      G.players[playerIndex].resources[option] -= 1;
      G.players[playerIndex].resources.coins += 1;
      removeFromTableau(G, playerIndex, instanceId);
      G.pendingAction = null;
    }
    else if (type === 'event_graft_choose') {
      const instanceId = G.pendingAction.instanceId;
      if (option === 'coin_to_vote') {
        if (G.players[playerIndex].resources.coins < 1) return INVALID_MOVE;
        G.players[playerIndex].resources.coins -= 1;
        G.players[playerIndex].resources.votes += 1;
      } else if (option === 'vote_to_coin') {
        if (G.players[playerIndex].resources.votes < 1) return INVALID_MOVE;
        G.players[playerIndex].resources.votes -= 1;
        G.players[playerIndex].resources.coins += 1;
      } else return INVALID_MOVE;
      removeFromTableau(G, playerIndex, instanceId);
      G.pendingAction = null;
    }
    else if (type === 'event_bribe') {
      // option is slotIndex as string
      const instanceId = G.pendingAction.instanceId;
      const slotIndex = parseInt(option);
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 3) return INVALID_MOVE;
      const card = G.politicsRow[slotIndex];
      if (!card || card === 'Mandate') return INVALID_MOVE;
      if (G.players[playerIndex].resources.coins < 1) return INVALID_MOVE;
      G.players[playerIndex].resources.coins -= 1;
      shiftPoliticsRowAfterPurchase(G, slotIndex);
      removeFromTableau(G, playerIndex, instanceId);
      G.pendingAction = null;
    }
    else {
      return INVALID_MOVE;
    }
  },

  chooseBuildingType: ({ G, ctx }: MoveArgs, buildingType: BuildingType) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'builder_build_type') return INVALID_MOVE;
    const allowed = getAllowedBuildTypes(G.tiles, G.players[playerIndex].type);
    if (!allowed.includes(buildingType)) return INVALID_MOVE;
    G.pendingAction = { type: 'builder_build_hex', instanceId: G.pendingAction.instanceId, buildingType };
  },

  placeOnHex: ({ G, ctx }: MoveArgs, targetHexKey: string) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    const pa = G.pendingAction;
    if (!pa) return INVALID_MOVE;
    const player = G.players[playerIndex];
    const playerType = player.type;

    if (pa.type === 'charter_place') {
      const building = getCharterBuilding(playerType);
      if (!canPlaceCharter(G.tiles, hexFromKey(targetHexKey), playerType, building)) return INVALID_MOVE;
      G.tiles[targetHexKey].building = building;
      G.tiles[targetHexKey].buildingOwner = playerType;
      G.tiles = revealAdjacentFog(G.tiles, hexFromKey(targetHexKey), G.fogRadius);
      updateFogCount(G);
      G.pendingAction = null;
    }
    else if (pa.type === 'builder_build_hex') {
      if (!canPlaceBuild(G.tiles, hexFromKey(targetHexKey), playerType, pa.buildingType, G.landClaimsUntilPlayer !== undefined)) return INVALID_MOVE;
      if (player.resources.wood < 1 || player.resources.ore < 1 || player.resources.coins < 1) return INVALID_MOVE;
      player.resources.wood -= 1;
      player.resources.ore -= 1;
      player.resources.coins -= 1;
      G.tiles[targetHexKey].building = pa.buildingType;
      G.tiles[targetHexKey].buildingOwner = playerType;
      G.pendingAction = null;
    }
    else if (pa.type === 'elder_village_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.type !== 'Fog') return INVALID_MOVE;
      tile.type = pickRevealedTileType(hexFromKey(targetHexKey));
      if (['Water'].includes(tile.type)) tile.type = 'Field';
      tile.building = 'Village';
      tile.buildingOwner = 'Chieftain';
      G.tiles = revealAdjacentFog(G.tiles, hexFromKey(targetHexKey), G.fogRadius);
      updateFogCount(G);
      G.pendingAction = null;
    }
    else if (pa.type === 'elder_reserve_hex') {
      if (!canPlaceReserve(G.tiles, hexFromKey(targetHexKey))) return INVALID_MOVE;
      G.tiles[targetHexKey].building = 'Reserve';
      G.tiles[targetHexKey].buildingOwner = 'Chieftain';
      G.pendingAction = null;
    }
    else if (pa.type === 'guide_reveal_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.type === 'Fog') return INVALID_MOVE;
      G.tiles = revealAdjacentFog(G.tiles, hexFromKey(targetHexKey), G.fogRadius);
      updateFogCount(G);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_zoning_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || !['Field', 'Sand'].includes(tile.type) || tile.zoningOwner) return INVALID_MOVE;
      const adj = hexNeighbors(hexFromKey(targetHexKey));
      const hasAdj = adj.some(nb => {
        const nt = G.tiles[hexKey(nb)];
        return nt?.buildingOwner === playerType;
      });
      if (!hasAdj) return INVALID_MOVE;
      G.tiles[targetHexKey].zoningOwner = playerType;
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_conservation_hex') {
      if (!canPlaceConservation(G.tiles, hexFromKey(targetHexKey))) return INVALID_MOVE;
      G.tiles[targetHexKey].hasConservation = true;
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_logging_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.type !== 'Forest' || tile.hasConservation) return INVALID_MOVE;
      tile.type = 'Field';
      player.resources.wood += 1;
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_forestry_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.type !== 'Field' || tile.building) return INVALID_MOVE;
      tile.type = 'Forest';
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_taxation_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.building !== 'Reserve' || tile.buildingOwner !== playerType) return INVALID_MOVE;
      let coins = 0;
      for (const nb of hexNeighbors(hexFromKey(targetHexKey))) {
        const nt = G.tiles[hexKey(nb)];
        if (nt?.building && nt.buildingOwner !== playerType) coins++;
      }
      player.resources.coins += coins;
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else if (pa.type === 'event_airstrip_hex') {
      if (!canPlaceAirstrip(G.tiles, hexFromKey(targetHexKey))) return INVALID_MOVE;
      if (player.resources.wood < 1 || player.resources.ore < 1 || player.resources.coins < 1) return INVALID_MOVE;
      player.resources.wood -= 1;
      player.resources.ore -= 1;
      player.resources.coins -= 1;
      G.tiles[targetHexKey].building = 'Infrastructure';
      G.pendingAction = null;
    }
    else if (pa.type === 'event_fisheries_hex') {
      if (!canPlaceFisheries(G.tiles, hexFromKey(targetHexKey), playerType)) return INVALID_MOVE;
      G.tiles[targetHexKey].building = 'Fisheries';
      G.tiles[targetHexKey].buildingOwner = playerType;
      G.pendingAction = null;
    }
    else if (pa.type === 'event_urbanplanning_hex') {
      const tile = G.tiles[targetHexKey];
      if (!tile || tile.buildingOwner !== playerType) return INVALID_MOVE;
      if (!['Resort', 'IndustrialZone', 'Infrastructure', 'Village'].includes(tile.building ?? '')) return INVALID_MOVE;
      if (player.resources.wood < 1 || player.resources.ore < 1 || player.resources.coins < 1) return INVALID_MOVE;
      player.resources.wood -= 1;
      player.resources.ore -= 1;
      player.resources.coins -= 1;
      G.tiles[targetHexKey].hasUrbanPlanning = true;
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
    else {
      return INVALID_MOVE;
    }
  },

  selectPoliticsCard: ({ G, ctx }: MoveArgs, slotIndex: number) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'liaison_politics') return INVALID_MOVE;

    const card = G.politicsRow[slotIndex];
    if (!card) return INVALID_MOVE;

    const VOTE_COSTS = [0, 1, 2, 3];
    const voteCost = VOTE_COSTS[slotIndex] ?? 0;

    const player = G.players[playerIndex];
    if (player.resources.votes < voteCost) return INVALID_MOVE;
    if (player.tableau.length >= 8) return INVALID_MOVE;

    player.resources.votes -= voteCost;

    player.tableau.push({
      instanceId: `${card}_${playerIndex}_${Date.now()}`,
      cardType: card as EventCardType,
      category: 'Event',
    });

    if (voteCost > 0) {
      const bureaucratIdx = G.players.findIndex(p => p.type === 'Bureaucrat');
      if (bureaucratIdx >= 0 && bureaucratIdx !== playerIndex) {
        G.players[bureaucratIdx].resources.votes += voteCost;
      }
    }

    shiftPoliticsRowAfterPurchase(G, slotIndex);

    G.pendingAction = null;
  },

  selectNetworkCard: ({ G, ctx, events }: MoveArgs, slotIndex: number) => {
    const playerIndex = parseInt(ctx.currentPlayer, 10);
    if (!G.pendingAction || G.pendingAction.type !== 'guide_network') return INVALID_MOVE;
    const card = G.networkRow[slotIndex];
    if (!card) return INVALID_MOVE;
    if (!events?.setActivePlayers) return INVALID_MOVE;

    const bids: Record<string, number | null> = {};
    for (let i = 0; i < ctx.numPlayers; i++) {
      bids[String(i)] = null;
    }

    G.pendingAction = {
      type: 'network_bid',
      instanceId: G.pendingAction.instanceId,
      slotIndex,
      initiatorPlayerIndex: playerIndex,
      bids,
    };

    const order = networkBiddingOrder(ctx.playOrder, playerIndex);
    const first = order[0];
    events.setActivePlayers({
      value: { [first]: 'networkBid' },
      minMoves: 1,
      maxMoves: 1,
    });
  },

  marketBuy: ({ G, ctx }: MoveArgs, resource: 'wood' | 'ore', amount: number) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'builder_market_choose') return INVALID_MOVE;
    const market = resource === 'wood' ? G.woodMarket : G.oreMarket;
    const result = buyFromMarket(market, amount);
    if (!result) return INVALID_MOVE;
    if (G.players[playerIndex].resources.coins < result.totalCost) return INVALID_MOVE;
    G.players[playerIndex].resources.coins -= result.totalCost;
    G.players[playerIndex].resources[resource] += amount;
    if (resource === 'wood') G.woodMarket = result.newTrack;
    else G.oreMarket = result.newTrack;
    G.pendingAction = null;
  },

  marketSell: ({ G, ctx }: MoveArgs, resource: 'wood' | 'ore', amount: number) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'builder_market_choose') return INVALID_MOVE;
    if (G.players[playerIndex].resources[resource] < amount) return INVALID_MOVE;
    const market = resource === 'wood' ? G.woodMarket : G.oreMarket;
    const result = sellToMarket(market, amount);
    if (!result) return INVALID_MOVE;
    G.players[playerIndex].resources[resource] -= amount;
    G.players[playerIndex].resources.coins += result.totalGain;
    if (resource === 'wood') G.woodMarket = result.newTrack;
    else G.oreMarket = result.newTrack;
    G.pendingAction = null;
  },

  chooseRestructuringTarget: ({ G, ctx }: MoveArgs, targetInstanceId: string) => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'event_restructuring_choose') return INVALID_MOVE;
    const instanceId = G.pendingAction.instanceId;
    const player = G.players[playerIndex];
    const target = player.tableau.find(c => c.instanceId === targetInstanceId && c.category === 'Personnel');
    if (!target) return INVALID_MOVE;

    removeFromTableau(G, playerIndex, targetInstanceId);

    if (player.tableau.length < 8) {
      player.tableau.push({
        instanceId: `Stimulus_${playerIndex}_${Date.now()}`,
        cardType: 'Stimulus' as EventCardType,
        category: 'Event',
      });
    }

    removeFromTableau(G, playerIndex, instanceId);
    G.pendingAction = null;
  },

  chooseStimulusResource: ({ G, ctx }: MoveArgs, resource: 'coins' | 'wood' | 'ore' | 'votes') => {
    const playerIndex = parseInt(ctx.currentPlayer);
    if (!G.pendingAction || G.pendingAction.type !== 'event_stimulus_choose') return INVALID_MOVE;
    const pa = G.pendingAction;

    if (!['coins', 'wood', 'ore', 'votes'].includes(resource)) return INVALID_MOVE;
    G.players[playerIndex].resources[resource] += 1;
    pa.remaining -= 1;

    if (pa.remaining <= 0) {
      removeFromTableau(G, playerIndex, pa.instanceId);
      G.pendingAction = null;
    }
  },

  cancelAction: ({ G, ctx }: MoveArgs) => {
    if (!G.pendingAction) return INVALID_MOVE;

    const NON_CANCELLABLE = new Set(['builder_market_buy', 'builder_market_sell']);
    if (NON_CANCELLABLE.has(G.pendingAction.type)) return INVALID_MOVE;
    if (G.pendingAction.type === 'network_bid') return INVALID_MOVE;
    if (G.pendingAction.type === 'event_stimulus_choose' && G.pendingAction.remaining < 4) return INVALID_MOVE;

    const playerIndex = parseInt(ctx.currentPlayer);
    const instanceId = G.pendingAction.instanceId;

    if (G.pendingAction.type === 'charter_place') {
      G.players[playerIndex].tableau.push({
        instanceId,
        cardType: 'Charter',
        category: 'Event',
      });
    }

    if (G.pendingAction.type === 'event_airstrip_hex') {
      G.players[playerIndex].tableau.push({
        instanceId,
        cardType: 'Airstrip',
        category: 'Event',
      });
    }

    if (G.pendingAction.type === 'event_fisheries_hex') {
      G.players[playerIndex].tableau.push({
        instanceId,
        cardType: 'Fisheries',
        category: 'Event',
      });
    }

    G.tokensUsedThisTurn = G.tokensUsedThisTurn.filter(id => id !== instanceId);
    G.actionsRemainingThisTurn += 1;
    G.pendingAction = null;
  },

  endTurn: ({ G, ctx, events }: MoveArgs) => {
    if (G.pendingAction) return INVALID_MOVE;
    const isLastPlayerInRound = parseInt(ctx.currentPlayer) === ctx.numPlayers - 1;
    if (isLastPlayerInRound) {
      rotatePoliticsEndOfRound(G);
    }
    events?.endTurn();
  },
};

/** Stage-only move: each player submits a blind bid in order (initiator first). */
export const networkBidMoves = {
  submitNetworkBid({ G, ctx, events, playerID }: StageMoveArgs, amount: number) {
    if (!G.pendingAction || G.pendingAction.type !== 'network_bid') return INVALID_MOVE;
    if (!events?.setActivePlayers) return INVALID_MOVE;

    const pa = G.pendingAction;
    if (pa.bids[playerID] !== null) return INVALID_MOVE;

    const initiatorPid = String(pa.initiatorPlayerIndex);
    if (playerID === initiatorPid) {
      if (amount < 1) return INVALID_MOVE;
    } else {
      if (amount < 0) return INVALID_MOVE;
    }

    const player = G.players[parseInt(playerID, 10)];
    if (amount > 0 && player.resources.coins < amount) return INVALID_MOVE;

    pa.bids[playerID] = amount;

    const order = networkBiddingOrder(ctx.playOrder, pa.initiatorPlayerIndex);
    const idx = order.indexOf(playerID);
    const nextPid = idx >= 0 ? order[idx + 1] : undefined;

    if (nextPid !== undefined) {
      events.setActivePlayers({
        value: { [nextPid]: 'networkBid' },
        minMoves: 1,
        maxMoves: 1,
      });
    } else {
      resolveNetworkAuction(G, ctx.playOrder, pa);
      events.setActivePlayers({ revert: true });
    }
  },
};
