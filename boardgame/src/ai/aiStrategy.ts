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

/** Politics cards that add or convert to votes — take with Liaison before random events when votes < 4. */
const VOTE_FUNNEL_POLITICS = new Set<string>(['Graft', 'LocalElections', 'NGOBacking', 'Propaganda']);

/** Stop endless Builder market micro-trades when resources are already high (buys only once stockpile handling runs). */
const MARKET_WIND_DOWN_THRESHOLD = 45;

/**
 * Bots should pursue Mandate (politics / activation) before any resource climbs this high.
 * Stays below the playtest hoard guard and the design target of ~20.
 */
const MANDATE_RESOURCE_ALERT = 15;
const CRITICAL_HOARD_ALERT = 24;

type AIPhase =
  | 'play_mandate_now'
  | 'get_vote_for_mandate'
  | 'free_tableau_space'
  | 'anti_hoard'
  | 'acquire_mandate';

function maxResourceValue(player: LandgrabState['players'][0]): number {
  const r = player.resources;
  return Math.max(r.coins, r.wood, r.ore, r.votes);
}

/** True when the player is stockpiling any resource — switch from engine building to Mandate / politics / dumps. */
function mandateStockpileRisk(player: LandgrabState['players'][0]): boolean {
  return maxResourceValue(player) >= MANDATE_RESOURCE_ALERT;
}

/**
 * Prefer Builder→market before building when wood/ore are climbing. Liaison generate can add many units in
 * one action; waiting until max≥15 (mandateStockpileRisk) lets resources jump from ~12 to 150+ in a turn.
 */
function builderShouldPreferMarketBeforeBuild(player: LandgrabState['players'][0]): boolean {
  if (mandateStockpileRisk(player)) return true;
  if (maxResourceValue(player) >= 10) return true;
  const { wood, ore } = player.resources;
  return wood >= 8 || ore >= 8;
}

/** Coins are the top resource — build to spend them instead of looping on market buys/sells. */
function builderShouldSinkCoinsViaBuild(player: LandgrabState['players'][0], canBuild: boolean): boolean {
  if (!canBuild) return false;
  const r = player.resources;
  return r.coins >= 120 && r.coins === maxResourceValue(player);
}

/** Wood/ore are very high — build to consume them; market churn cannot keep up with Liaison generate. */
function builderShouldBuildToConsumeCommodities(player: LandgrabState['players'][0], canBuild: boolean): boolean {
  if (!canBuild) return false;
  const { wood, ore } = player.resources;
  return wood >= 55 || ore >= 55;
}

function hasMandateInTableau(player: LandgrabState['players'][0]): boolean {
  return player.tableau.some(c => c.cardType === 'Mandate');
}

function deriveAIPhase(G: LandgrabState, playerIndex: number): AIPhase {
  const player = G.players[playerIndex];
  const hasMandate = hasMandateInTableau(player);
  const canPlayMandateNow = hasMandate && player.resources.votes >= 1 && canAffordMandate(G.tiles, player);

  if (canPlayMandateNow) return 'play_mandate_now';
  if (hasMandate && player.resources.votes < 1) return 'get_vote_for_mandate';
  if (player.tableau.length >= 8) return 'free_tableau_space';
  if (maxResourceValue(player) >= CRITICAL_HOARD_ALERT) return 'anti_hoard';
  return 'acquire_mandate';
}

/**
 * Do not take Import (or Broker→Import) while already rich or when votes are needed to play Mandate / take politics.
 */
function shouldBlockImport(G: LandgrabState, playerIndex: number): boolean {
  const p = G.players[playerIndex];
  if (mandateStockpileRisk(p)) return true;
  if (p.resources.votes >= 1) return false;
  return hasMandateInTableau(p) || politicsRowHasMandate(G);
}

/**
 * Broker is reusable personnel; when Import is blocked we only add Export. Do not re-activate Broker
 * while an Export from a prior Broker is still in the tableau — play those first or the AI loops forever.
 */
function shouldSkipBrokerUntilExportsCleared(G: LandgrabState, playerIndex: number): boolean {
  if (!shouldBlockImport(G, playerIndex)) return false;
  return G.players[playerIndex].tableau.some(c => c.cardType === 'Export');
}

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

// ---- Card selection (simple win path) ----
//
// 1. Charter → open the board
// 2. Builder + Liaison generate → resources
// 3. Liaison politics when Mandate is on the row OR vote-funnel cards (Graft, …) are affordable (votes < 4)
// 4. Graft → votes when needed for that Mandate
// 5. Play Mandate for a seat; repeat from (2)
// Personnel that only add more cards to the tableau (Broker, Guide, …) stay last.

function canActivateBribe(G: LandgrabState, player: LandgrabState['players'][0]): boolean {
  if (player.resources.coins < 1) return false;
  return G.politicsRow.some(c => c !== null && c !== 'Mandate');
}

function canActivateElder(G: LandgrabState): boolean {
  const hasFog = Object.values(G.tiles).some(t => t.type === 'Fog');
  if (hasFog) return pickFogHex(G) !== null;
  return pickReserveHex(G) !== null;
}

function politicsRowHasMandate(G: LandgrabState): boolean {
  return G.politicsRow.some(c => c === 'Mandate');
}

/** True if Mandate is on the politics track but this player lacks the votes for its slot. */
function votesShortForMandatePolitics(G: LandgrabState, playerIndex: number): boolean {
  const player = G.players[playerIndex];
  const VOTE_COSTS = [0, 1, 2, 3];
  for (let i = 0; i < 4; i++) {
    if (G.politicsRow[i] !== 'Mandate') continue;
    const cost = VOTE_COSTS[i] ?? 0;
    if (player.resources.votes < cost) return true;
  }
  return false;
}

function votesShortForTableauMandate(G: LandgrabState, playerIndex: number): boolean {
  const player = G.players[playerIndex];
  return hasMandateInTableau(player) && player.resources.votes < 1;
}

function isVoteFunnelCard(card: string | null): boolean {
  return !!card && VOTE_FUNNEL_POLITICS.has(card);
}

function canTakePoliticsForCurrentPhase(G: LandgrabState, playerIndex: number, phase: AIPhase): boolean {
  const player = G.players[playerIndex];
  if (player.tableau.length >= 8) return false;
  const slot = pickBestPoliticsSlot(G, playerIndex);
  if (slot === null) return false;
  const card = G.politicsRow[slot];
  if (!card) return false;
  if (phase === 'get_vote_for_mandate') {
    return card === 'Mandate' || isVoteFunnelCard(card);
  }
  if (phase === 'anti_hoard') {
    // Avoid filling tableau with random events when already hoarding.
    if (player.tableau.length >= 7) return card === 'Mandate' || isVoteFunnelCard(card);
    return true;
  }
  return true;
}

/** Affordable vote-funnel card on the politics row (for Liaison politics before Mandate appears). */
function liaisonShouldTakePoliticsForVotePath(G: LandgrabState, playerIndex: number): boolean {
  const player = G.players[playerIndex];
  if (player.resources.votes >= 4) return false;
  const VOTE_COSTS = [0, 1, 2, 3];
  for (let i = 0; i < 4; i++) {
    const card = G.politicsRow[i];
    if (!card || !VOTE_FUNNEL_POLITICS.has(card)) continue;
    const cost = VOTE_COSTS[i] ?? 0;
    if (player.resources.votes >= cost) return true;
  }
  return false;
}

/** Network / recruit personnel — lowest priority; bots should not spam these before the engine + Mandate path. */
function isCardAcquisitionPersonnel(cardType: CardType): boolean {
  return (
    cardType === 'Broker' ||
    cardType === 'Forester' ||
    cardType === 'Guide' ||
    cardType === 'Consultant' ||
    cardType === 'Advocate' ||
    cardType === 'Fixer'
  );
}

/** Higher = play first. Single ladder: Mandate → Charter → (take Mandate / votes) → Builder → Liaison generate → events → recruiters last. */
function simpleFlowPriority(G: LandgrabState, playerIndex: number, c: TableauCard): number {
  const player = G.players[playerIndex];
  const phase = deriveAIPhase(G, playerIndex);

  if (c.cardType === 'Mandate' && player.resources.votes >= 1 && canAffordMandate(G.tiles, player)) {
    return 100_000;
  }

  if (c.cardType === 'Charter') {
    return 90_000;
  }

  const mandateOnRow = politicsRowHasMandate(G);
  const votePathPolitics =
    mandateOnRow ||
    votesShortForTableauMandate(G, playerIndex) ||
    liaisonShouldTakePoliticsForVotePath(G, playerIndex);
  const stockpilePolitics = mandateStockpileRisk(player);
  const canTakePolitics = canTakePoliticsForCurrentPhase(G, playerIndex, phase);
  const hasBuildings = Object.values(G.tiles).some(t => t.buildingOwner === player.type);
  const tableauOk = votesShortForTableauMandate(G, playerIndex)
    ? player.tableau.length < 8
    : player.tableau.length < 7;
  const fogRemains = Object.values(G.tiles).some(t => t.type === 'Fog');

  if (
    c.cardType === 'Guide' &&
    !G.thresholdReached &&
    fogRemains &&
    hasBuildings
  ) {
    return 84_000;
  }

  if (c.cardType === 'Liaison' && (votePathPolitics || stockpilePolitics) && hasBuildings && tableauOk && canTakePolitics) {
    return 85_000;
  }

  if (
    c.cardType === 'Graft' &&
    mandateOnRow &&
    votesShortForMandatePolitics(G, playerIndex) &&
    player.resources.coins >= 1
  ) {
    return 82_000;
  }

  if (
    c.cardType === 'Graft' &&
    votesShortForTableauMandate(G, playerIndex) &&
    player.resources.coins >= 1
  ) {
    return 86_000;
  }

  if (phase === 'get_vote_for_mandate') {
    if (c.cardType === 'Liaison' && canTakePolitics && hasBuildings && tableauOk) return 85_500;
    if (c.cardType === 'Builder') return 60_000;
  }

  if (phase === 'anti_hoard') {
    if (c.cardType === 'Liaison' && canTakePolitics && hasBuildings && tableauOk) return 85_100;
    if (c.cardType === 'Liaison' && !canTakePolitics) return 35_000;
    if (c.cardType === 'Builder') return 65_000;
    if (c.cardType === 'Guide') return 30_000;
  }

  if (c.cardType === 'Builder') {
    return 80_000;
  }

  if (c.cardType === 'Elder' && canActivateElder(G)) {
    return 79_000;
  }

  if (c.cardType === 'Liaison') {
    return 75_000;
  }

  if (c.cardType === 'Graft' && player.resources.coins >= 1) {
    return 70_000;
  }

  if (c.category === 'Event') {
    return 60_000;
  }

  if (isCardAcquisitionPersonnel(c.cardType)) {
    return 1_000;
  }

  return 5_000;
}

function pickCardToActivate(G: LandgrabState, playerIndex: number): TableauCard | null {
  const player = G.players[playerIndex];
  const phase = deriveAIPhase(G, playerIndex);
  const usable = player.tableau.filter(c => {
    if (NON_ACTIVATABLE.has(c.cardType)) return false;
    if (G.tokensUsedThisTurn.includes(c.instanceId)) return false;
    if (c.cardType === 'Mandate') {
      return player.resources.votes >= 1 && canAffordMandate(G.tiles, player);
    }
    if (c.cardType === 'Airstrip' && !canActivateAirstrip(G, player)) return false;
    if (c.cardType === 'Fisheries' && !canActivateFisheries(G, playerIndex)) return false;
    if (c.cardType === 'Import' && player.resources.coins < 1) return false;
    if (c.cardType === 'Import' && shouldBlockImport(G, playerIndex)) return false;
    if (c.cardType === 'Broker' && shouldSkipBrokerUntilExportsCleared(G, playerIndex)) return false;
    /** matches moves.activateCard → event_export_choose (must sell ≥1 wood or ore) */
    if (c.cardType === 'Export' && player.resources.wood < 1 && player.resources.ore < 1) return false;
    if (c.cardType === 'UrbanPlanning' && pickUrbanPlanningHex(G, player.type, player.resources) === null) {
      return false;
    }
    if (c.cardType === 'Taxation' && pickTaxationHex(G, player.type) === null) return false;
    if (c.cardType === 'Logging' && pickLoggingHex(G) === null) return false;
    if (c.cardType === 'Forestry' && pickForestryHex(G) === null) return false;
    if (c.cardType === 'Conservation' && pickConservationHex(G) === null) return false;
    if (c.cardType === 'Zoning' && pickZoningHex(G, player.type) === null) return false;
    if (c.cardType === 'Bribe' && !canActivateBribe(G, player)) return false;
    if (c.cardType === 'Elder' && !canActivateElder(G)) return false;
    if (
      phase === 'free_tableau_space' &&
      c.cardType !== 'Mandate' &&
      c.cardType !== 'Restructuring' &&
      c.cardType !== 'Reorganization'
    ) {
      return false;
    }
    if (c.cardType === 'Guide') {
      const hasFog = Object.values(G.tiles).some(t => t.type === 'Fog');
      if (hasFog && pickRevealHex(G) === null) return false;
    }
    return true;
  });

  if (usable.length === 0) return null;

  usable.sort(
    (a, b) => simpleFlowPriority(G, playerIndex, b) - simpleFlowPriority(G, playerIndex, a)
  );

  for (const card of usable) {
    if (card.cardType === 'Builder') {
      const canBuild =
        hasAnyValidBuildHex(G.tiles, player.type, G.landClaimsUntilPlayer !== undefined) &&
        player.resources.wood >= 1 &&
        player.resources.ore >= 1 &&
        player.resources.coins >= 1;
      /** matches builder_choose → market when !canBuild; skip if market has no action (avoids cancel loop) */
      if (!canBuild && pickMarketAction(G, playerIndex) === null) continue;
    }
    return card;
  }

  return null;
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
      const marketMove = pickMarketAction(G, playerIndex);
      const shouldTrimStockpile =
        builderShouldPreferMarketBeforeBuild(player) &&
        marketMove !== null &&
        !builderShouldSinkCoinsViaBuild(player, canBuild) &&
        !builderShouldBuildToConsumeCommodities(player, canBuild);
      if (shouldTrimStockpile) {
        return { move: 'chooseOption', args: ['market'] };
      }
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
      const phase = deriveAIPhase(G, playerIndex);
      const hasBuildings = Object.values(G.tiles).some(t => t.buildingOwner === player.type);
      const politicsSlot = pickBestPoliticsSlot(G, playerIndex);
      const tableauHasRoomForPolitics = votesShortForTableauMandate(G, playerIndex)
        ? player.tableau.length < 8
        : player.tableau.length < 7;
      const phaseAllowsPolitics = canTakePoliticsForCurrentPhase(G, playerIndex, phase);
      const takePolitics =
        hasBuildings &&
        tableauHasRoomForPolitics &&
        politicsSlot !== null &&
        phaseAllowsPolitics &&
        (
          politicsRowHasMandate(G) ||
          votesShortForTableauMandate(G, playerIndex) ||
          liaisonShouldTakePoliticsForVotePath(G, playerIndex) ||
          mandateStockpileRisk(player)
        );
      if (takePolitics) {
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
      const networkSlot = pickNetworkSlot(G);
      const canTakeNetwork = networkSlot !== null && player.resources.coins >= 2;
      if (hasFog) return { move: 'chooseOption', args: ['reveal'] };
      if (canTakeNetwork) return { move: 'chooseOption', args: ['network'] };
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
      if (shouldBlockImport(G, playerIndex)) return { move: 'cancelAction', args: [] };
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

    case 'event_graft_choose': {
      if (
        politicsRowHasMandate(G) &&
        votesShortForMandatePolitics(G, playerIndex) &&
        player.resources.coins >= 1
      ) {
        return { move: 'chooseOption', args: ['coin_to_vote'] };
      }
      if (mandateStockpileRisk(player) && player.resources.coins >= 1) {
        return { move: 'chooseOption', args: ['coin_to_vote'] };
      }
      if (player.resources.coins < 1 && player.resources.votes < 1) {
        return { move: 'cancelAction', args: [] };
      }
      if (player.resources.coins < 1) {
        return { move: 'chooseOption', args: ['vote_to_coin'] };
      }
      if (player.resources.votes < 1) {
        return { move: 'chooseOption', args: ['coin_to_vote'] };
      }
      return {
        move: 'chooseOption',
        args: [player.resources.coins > player.resources.votes ? 'coin_to_vote' : 'vote_to_coin'],
      };
    }

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
        simpleFlowPriority(G, playerIndex, a) < simpleFlowPriority(G, playerIndex, b) ? a : b
      );
      return { move: 'chooseRestructuringTarget', args: [least.instanceId] };
    }

    case 'event_stimulus_choose': {
      const res = pickStimulusResource(player.type, player.resources);
      return { move: 'chooseStimulusResource', args: [res] };
    }

    case 'broker_choose': {
      if (shouldBlockImport(G, playerIndex)) {
        return { move: 'chooseOption', args: ['export'] };
      }
      return { move: 'chooseOption', args: ['import'] };
    }

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
  const maxR = Math.max(res.coins, res.wood, res.ore, res.votes);
  const stockpileRisk = maxR >= MANDATE_RESOURCE_ALERT;
  const windDown = maxR >= MARKET_WIND_DOWN_THRESHOLD;

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

  /** Selling adds coins; when coins already meet/exceed both commodities, never sell (also covers low maxR with huge ore). */
  const skipCommoditySells =
    res.coins >= 120 && res.coins >= res.wood && res.coins >= res.ore;

  // Dump wood/ore when elevated — old logic returned null for *any* high resource and blocked ore dumps (hoard abort).
  const woodOreElevated =
    res.wood >= MANDATE_RESOURCE_ALERT || res.ore >= MANDATE_RESOURCE_ALERT;
  if (stockpileRisk || windDown) {
    // When coins tie maxR but wood/ore do not, selling would push coins past the hoard cap — sink coins first.
    const commodityAtMax = res.wood === maxR || res.ore === maxR;
    const coinsAtMax = res.coins === maxR;
    if (!commodityAtMax && coinsAtMax && res.coins >= MANDATE_RESOURCE_ALERT) {
      if (canBuyWood() && canBuyOre()) return res.wood <= res.ore ? 'buy_wood' : 'buy_ore';
      if (canBuyWood()) return 'buy_wood';
      if (canBuyOre()) return 'buy_ore';
    }
    if (!skipCommoditySells) {
      if (res.wood > 3 && canSellWood() && res.ore > 3 && canSellOre()) {
        return res.wood >= res.ore ? 'sell_wood' : 'sell_ore';
      }
      if (res.wood > 3 && canSellWood()) return 'sell_wood';
      if (res.ore > 3 && canSellOre()) return 'sell_ore';
      // Trim 1–3 wood/ore only when wood/ore (not coins/votes) are what triggered the alert
      if (stockpileRisk && woodOreElevated) {
        if (res.wood >= res.ore && res.wood >= 1 && canSellWood()) return 'sell_wood';
        if (res.ore >= res.wood && res.ore >= 1 && canSellOre()) return 'sell_ore';
        if (res.wood >= 1 && canSellWood()) return 'sell_wood';
        if (res.ore >= 1 && canSellOre()) return 'sell_ore';
      }
    }
    if (windDown) {
      // High maxR from coins alone used to return null here — no sells apply, so coins climb to the hoard cap.
      if (canBuyWood() && canBuyOre()) return res.wood <= res.ore ? 'buy_wood' : 'buy_ore';
      if (canBuyWood()) return 'buy_wood';
      if (canBuyOre()) return 'buy_ore';
      return null;
    }
  }

  // Coins (or votes) triggered stockpileRisk but wood/ore are not elevated — sink coins into commodities.
  if (stockpileRisk && res.coins >= MANDATE_RESOURCE_ALERT && !woodOreElevated) {
    if (canBuyWood() && canBuyOre()) return res.wood <= res.ore ? 'buy_wood' : 'buy_ore';
    if (canBuyWood()) return 'buy_wood';
    if (canBuyOre()) return 'buy_ore';
  }

  if (stockpileRisk) {
    return null;
  }

  if (res.wood < 1 && canBuyWood()) return 'buy_wood';
  if (res.ore < 1 && canBuyOre()) return 'buy_ore';
  if (!skipCommoditySells) {
    if (res.wood > 3 && canSellWood()) return 'sell_wood';
    if (res.ore > 3 && canSellOre()) return 'sell_ore';
  }
  if (res.coins >= 2) {
    if (canBuyWood() && canBuyOre()) return res.wood <= res.ore ? 'buy_wood' : 'buy_ore';
    if (canBuyWood()) return 'buy_wood';
    if (canBuyOre()) return 'buy_ore';
  }
  if (!skipCommoditySells) {
    if (canSellWood() && canSellOre()) return res.wood >= res.ore ? 'sell_wood' : 'sell_ore';
    if (canSellWood()) return 'sell_wood';
    if (canSellOre()) return 'sell_ore';
  }
  if (canBuyWood()) return 'buy_wood';
  if (canBuyOre()) return 'buy_ore';
  return null;
}

function pickBestPoliticsSlot(G: LandgrabState, playerIndex: number): number | null {
  const player = G.players[playerIndex];
  const VOTE_COSTS = [0, 1, 2, 3];

  if (player.tableau.length >= 8) return null;

  for (let i = 0; i < 4; i++) {
    const card = G.politicsRow[i];
    if (card !== 'Mandate') continue;
    const cost = VOTE_COSTS[i] ?? 0;
    if (player.resources.votes >= cost) return i;
  }

  if (player.resources.votes < 4) {
    for (let i = 0; i < 4; i++) {
      const card = G.politicsRow[i];
      if (!card || !VOTE_FUNNEL_POLITICS.has(card)) continue;
      const cost = VOTE_COSTS[i] ?? 0;
      if (player.resources.votes >= cost) return i;
    }
  }

  for (let i = 0; i < 4; i++) {
    const card = G.politicsRow[i];
    if (!card) continue;
    const cost = VOTE_COSTS[i] ?? 0;
    if (player.resources.votes >= cost) return i;
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
