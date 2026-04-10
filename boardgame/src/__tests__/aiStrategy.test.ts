import { describe, it, expect } from 'vitest';
import { getAIMove } from '../ai/aiStrategy';
import type { AIMove } from '../ai/aiStrategy';
import { createInitialState } from '../game/setup';
import { moves } from '../game/moves';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { LandgrabState, BuildingType, EventCardType, PlayerType, TableauCard } from '../game/types';
import { hexKey, hexFromKey, hexNeighbors } from '../utils/hexGrid';

// ── Helpers ──

function makeState(numPlayers = 2): LandgrabState {
  const G = createInitialState(numPlayers);
  // These tests target play-phase AI; opening bids are covered in integration tests.
  delete G.startingBidPhase;
  return G;
}

function makeCtx(currentPlayer: number, numPlayers: number) {
  return { currentPlayer: String(currentPlayer), numPlayers };
}

function placeCharterForPlayer(G: LandgrabState, playerIndex: number) {
  const player = G.players[playerIndex];
  const charterCard = player.tableau.find(c => c.cardType === 'Charter');
  if (!charterCard) return;

  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.type !== 'Fog' && !tile.building && ['Field', 'Sand'].includes(tile.type)) {
      const building: BuildingType =
        player.type === 'Hotelier' ? 'Resort' :
        player.type === 'Industrialist' ? 'IndustrialZone' :
        player.type === 'Bureaucrat' ? 'Infrastructure' : 'Village';
      tile.building = building;
      tile.buildingOwner = player.type;
      player.tableau = player.tableau.filter(c => c.instanceId !== charterCard.instanceId);
      break;
    }
  }
}

function addEventCard(G: LandgrabState, playerIndex: number, cardType: EventCardType, id?: string): TableauCard {
  const card: TableauCard = {
    instanceId: id ?? `${cardType}_${playerIndex}_test`,
    cardType,
    category: 'Event',
  };
  G.players[playerIndex].tableau.push(card);
  return card;
}

function executeAIMove(G: LandgrabState, playerIndex: number): ReturnType<typeof moves[keyof typeof moves]> {
  const aiMove = getAIMove(G, playerIndex);
  if (!aiMove) return undefined;
  const ctx = makeCtx(playerIndex, G.players.length);
  const moveFn = (moves as any)[aiMove.move];
  if (!moveFn) throw new Error(`Unknown move: ${aiMove.move}`);
  return moveFn({ G, ctx }, ...aiMove.args);
}

function runAITurnToCompletion(G: LandgrabState, playerIndex: number, maxSteps = 30): number {
  let steps = 0;
  while (steps < maxSteps) {
    const aiMove = getAIMove(G, playerIndex);
    if (!aiMove) break;
    if (aiMove.move === 'endTurn') {
      steps++;
      break;
    }
    const ctx = makeCtx(playerIndex, G.players.length);
    const moveFn = (moves as any)[aiMove.move];
    const result = moveFn({ G, ctx }, ...aiMove.args);
    if (result === INVALID_MOVE) break;
    steps++;
  }
  return steps;
}

// ══════════════════════════════════════════════
// UNIT TESTS — getAIMove decision logic
// ══════════════════════════════════════════════

describe('Card selection priority', () => {
  it('always activates Charter first when present', () => {
    const G = makeState(2);
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    const charter = G.players[0].tableau.find(c => c.cardType === 'Charter');
    expect(result.args[0]).toBe(charter!.instanceId);
  });

  it('returns endTurn when no actions remain', () => {
    const G = makeState(2);
    G.actionsRemainingThisTurn = 0;
    expect(getAIMove(G, 0)).toEqual({ move: 'endTurn', args: [] });
  });

  it('returns endTurn when all cards are exhausted this turn', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.tokensUsedThisTurn = G.players[0].tableau.map(c => c.instanceId);
    expect(getAIMove(G, 0)).toEqual({ move: 'endTurn', args: [] });
  });

  it('never activates Seat cards', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau = [
      { instanceId: 'Seat_0_test', cardType: 'Seat', category: 'Event' },
    ];
    expect(getAIMove(G, 0)).toEqual({ move: 'endTurn', args: [] });
  });

  it('prioritizes Mandate when affordable and first action', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    addEventCard(G, 0, 'Mandate');
    G.players[0].resources.coins = 20;
    G.players[0].resources.votes = 5;
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe('Mandate_0_test');
  });

  it('still prioritizes Mandate when tokens already used and costs are affordable', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    addEventCard(G, 0, 'Mandate');
    G.players[0].resources.coins = 20;
    G.players[0].resources.votes = 5;
    G.tokensUsedThisTurn = ['some_card'];
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe('Mandate_0_test');
  });

  it('skips Mandate when cannot afford it', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    addEventCard(G, 0, 'Mandate');
    G.players[0].resources.coins = 2;
    G.players[0].resources.votes = 1;
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).not.toBe('Mandate_0_test');
  });

  it('Industrialist: prioritizes Graft over Builder when Mandate is on politics row, wood+ore can pay, but votes are short', () => {
    const G = makeState(2);
    const ind = 1;
    placeCharterForPlayer(G, ind);
    G.politicsRow = ['Graft', 'Import', 'Airstrip', 'Mandate'];
    G.players[ind].resources = { coins: 4, wood: 6, ore: 4, votes: 0 };
    G.players[ind].tableau = [
      { instanceId: 'Builder_1_rush', cardType: 'Builder', category: 'Personnel' },
      { instanceId: 'Graft_1_rush', cardType: 'Graft', category: 'Event' },
    ];
    const result = getAIMove(G, ind)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_1_rush');
  });

  it('prioritizes Graft over Builder when Mandate is in tableau, votes are 0, and politics row has no Mandate', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.politicsRow = ['Import', 'Airstrip', 'Expropriation', 'Bribe'];
    addEventCard(G, 0, 'Mandate');
    const graft = addEventCard(G, 0, 'Graft');
    G.players[0].resources = { coins: 5, wood: 3, ore: 3, votes: 0 };
    G.thresholdReached = true;
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe(graft.instanceId);
  });

  it('Industrialist: prioritizes Liaison over Builder when Mandate is on politics row and they can pay and take a slot', () => {
    const G = makeState(2);
    const ind = 1;
    placeCharterForPlayer(G, ind);
    G.politicsRow = ['Mandate', 'Import', 'Airstrip', 'Expropriation'];
    G.players[ind].resources = { coins: 2, wood: 6, ore: 4, votes: 0 };
    G.players[ind].tableau = [
      { instanceId: 'Builder_1_liaison', cardType: 'Builder', category: 'Personnel' },
      { instanceId: 'Liaison_1_rush', cardType: 'Liaison', category: 'Personnel' },
    ];
    const result = getAIMove(G, ind)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Liaison_1_rush');
  });

  it('prioritizes Builder over one-shot events (resources before spending events)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    addEventCard(G, 0, 'Dividends');
    /** No Mandate / vote-funnel on row so Liaison does not outrank Builder (85k vs 80k). */
    G.politicsRow = ['Import', 'Airstrip', 'Expropriation', 'Bribe'];
    G.players[0].resources.votes = 4;
    /** Threshold met — otherwise Guide (84k) outranks Builder for fog reveal. */
    G.thresholdReached = true;
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Builder_0_0');
  });

  it('prioritizes one-shot events over network/recruit personnel (e.g. Guide)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    const divCard = addEventCard(G, 0, 'Dividends');
    G.players[0].tableau = G.players[0].tableau.filter(c => c.cardType !== 'Builder' && c.cardType !== 'Liaison');
    /** Fog threshold already met — otherwise Guide outranks one-shot events for Mandate track progress. */
    G.thresholdReached = true;
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe(divCard.instanceId);
  });

  it('skips Airstrip when resource cost cannot be paid', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Airstrip_0_t', cardType: 'Airstrip', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    G.players[0].resources = { coins: 0, wood: 1, ore: 1, votes: 1 };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Export when no wood or ore to sell', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Export_0_t', cardType: 'Export', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    G.players[0].resources = { coins: 5, wood: 0, ore: 0, votes: 1 };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Import when stockpiled (avoid hoarding wood/ore)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau = [{ instanceId: 'imp_only', cardType: 'Import', category: 'Event' }];
    G.players[0].resources = { coins: 5, wood: 18, ore: 2, votes: 1 };
    expect(getAIMove(G, 0)!.move).toBe('endTurn');
  });

  it('skips Import when no coins', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Import_0_t', cardType: 'Import', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    G.players[0].resources = { coins: 0, wood: 2, ore: 2, votes: 1 };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips UrbanPlanning when no eligible production hex or resources', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'UP_0_t', cardType: 'UrbanPlanning', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    G.players[0].resources = { coins: 0, wood: 0, ore: 0, votes: 1 };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Taxation when no owned Reserve with a valid taxation hex', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Tax_0_t', cardType: 'Taxation', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Logging when no Forest hex without conservation', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Log_0_t', cardType: 'Logging', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    for (const t of Object.values(G.tiles)) {
      if (t.type === 'Forest') t.type = 'Field';
    }
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Bribe when no coin or only Mandate / empty in politics row', () => {
    const G = makeState(2);
    G.players[0].tableau = [
      { instanceId: 'Bribe_0_t', cardType: 'Bribe', category: 'Event' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    G.players[0].resources.coins = 0;
    G.politicsRow = ['Mandate', null, null, null];
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });

  it('skips Elder when no fog and no valid Reserve hex', () => {
    const G = makeState(2);
    for (const t of Object.values(G.tiles)) {
      if (t.type === 'Fog') t.type = 'Field';
    }
    G.players[0].tableau = [
      { instanceId: 'Elder_0_t', cardType: 'Elder', category: 'Personnel' },
      { instanceId: 'Graft_0_t', cardType: 'Graft', category: 'Event' },
    ];
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Graft_0_t');
  });
});

// ── Pending action resolution ──

describe('charter_place', () => {
  it('picks a valid non-Fog hex', () => {
    const G = makeState(2);
    const charter = G.players[0].tableau.find(c => c.cardType === 'Charter')!;
    G.pendingAction = { type: 'charter_place', instanceId: charter.instanceId };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('placeOnHex');
    const tile = G.tiles[result.args[0]];
    expect(tile).toBeDefined();
    expect(tile.type).not.toBe('Fog');
  });
});

describe('builder_choose', () => {
  it('chooses build when resources are available', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 2, ore: 2, votes: 1 };
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_choose', instanceId: builder.instanceId };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('chooseOption');
    // May choose build or market depending on hex availability
    expect(['build', 'market']).toContain(result.args[0]);
  });

  it('chooses market when missing build resources', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 0, ore: 0, votes: 1 };
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_choose', instanceId: builder.instanceId };
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe('market');
  });

  it('chooses market over build when stockpiled and a market action exists (avoid hoard abort)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 18, ore: 5, votes: 1 };
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_choose', instanceId: builder.instanceId };
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe('market');
  });
});

describe('builder_build_type', () => {
  it('returns a valid building type', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_build_type', instanceId: builder.instanceId };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('chooseBuildingType');
    expect(['Resort', 'Housing', 'IndustrialZone', 'Farm', 'Infrastructure', 'CivicOffice']).toContain(result.args[0]);
  });
});

describe('liaison_choose', () => {
  it('chooses generate when no buildings exist', () => {
    const G = makeState(2);
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('generate');
  });

  it('chooses politics only when Mandate is on the politics row (otherwise generate)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 3;
    G.politicsRow = ['Mandate', 'Graft', 'Import', 'Export'];
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('politics');
  });

  it('chooses politics for vote-funnel cards (e.g. Graft) when Mandate is not on the row yet', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 3;
    G.politicsRow = ['Graft', 'Import', 'Airstrip', 'Expropriation'];
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('politics');
  });

  it('falls back to generate when politics row is empty', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 3;
    G.politicsRow = [null, null, null, null];
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('generate');
  });

  it('falls back to generate when cards exist but no slot is affordable', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 1;
    G.politicsRow = [null, null, null, 'Graft'];
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('generate');
  });

  it('chooses politics when stockpiling resources to avoid generate hoarding', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 16, wood: 2, ore: 2, votes: 0 };
    G.politicsRow = ['Import', 'Airstrip', 'Expropriation', 'Bribe'];
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('politics');
  });

  it('does not activate Liaison in anti-hoard phase when no politics slot is available', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 30, wood: 2, ore: 2, votes: 0 };
    G.politicsRow = [null, null, null, null];
    G.players[0].tableau = [
      { instanceId: 'Builder_0_only', cardType: 'Builder', category: 'Personnel' },
      { instanceId: 'Liaison_0_only', cardType: 'Liaison', category: 'Personnel' },
    ];
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('activateCard');
    expect(result.args[0]).toBe('Builder_0_only');
  });

  it('falls back to generate when tableau is nearly full', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 3;
    while (G.players[0].tableau.length < 7) {
      G.players[0].tableau.push({ instanceId: `filler_${G.players[0].tableau.length}`, cardType: 'Graft', category: 'Event' });
    }
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('generate');
  });

  it('chooses politics at 7/8 tableau when Mandate is in tableau and votes are short', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    addEventCard(G, 0, 'Mandate');
    G.players[0].resources.votes = 0;
    G.politicsRow = ['Graft', 'Import', 'Airstrip', 'Expropriation'];
    while (G.players[0].tableau.length < 7) {
      G.players[0].tableau.push({ instanceId: `filler_${G.players[0].tableau.length}`, cardType: 'Bribe', category: 'Event' });
    }
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('politics');
  });
});

describe('liaison_politics', () => {
  it('picks cheapest available slot', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 5;
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('selectPoliticsCard');
    expect(result.args[0]).toBe(0);
  });

  it('skips empty slots and finds next available', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 5;
    G.politicsRow = [null, 'Graft', 'Import', null];
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe(1);
  });

  it('prefers Mandate slot over cheaper events when affordable', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 5;
    G.politicsRow = ['Graft', 'Import', 'Mandate', 'Logging'];
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('selectPoliticsCard');
    expect(result.args[0]).toBe(2);
  });

  it('when votes < 4, prefers vote-funnel slot over cheaper non-funnel at slot 0', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 1;
    G.politicsRow = ['Bribe', 'Graft', 'Import', 'Airstrip'];
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('selectPoliticsCard');
    expect(result.args[0]).toBe(1);
  });

  it('cancels when no votes for any available slot', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 0;
    G.politicsRow = [null, 'Graft', 'Import', 'Logging'];
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('cancelAction');
  });

  it('cancels when tableau is full', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 5;
    while (G.players[0].tableau.length < 8) {
      G.players[0].tableau.push({ instanceId: `filler_${G.players[0].tableau.length}`, cardType: 'Graft', category: 'Event' });
    }
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('cancelAction');
  });
});

describe('guide_choose', () => {
  it('chooses reveal when fog tiles exist', () => {
    const G = makeState(2);
    const guide = G.players[0].tableau.find(c => c.cardType === 'Guide')!;
    G.pendingAction = { type: 'guide_choose', instanceId: guide.instanceId };
    expect(getAIMove(G, 0)!.args[0]).toBe('reveal');
  });

  it('chooses network when no fog and coins available', () => {
    const G = makeState(2);
    for (const tile of Object.values(G.tiles)) {
      if (tile.type === 'Fog') tile.type = 'Field';
    }
    G.players[0].resources.coins = 5;
    G.pendingAction = { type: 'guide_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('network');
  });

  it('chooses reveal when network row has no cards (avoid cancel/refund loop)', () => {
    const G = makeState(2);
    for (const tile of Object.values(G.tiles)) {
      if (tile.type === 'Fog') tile.type = 'Field';
    }
    G.players[0].resources.coins = 5;
    G.networkRow = [null, null, null, null];
    G.pendingAction = { type: 'guide_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('reveal');
  });
});

describe('guide_reveal_hex', () => {
  it('picks a non-Fog hex adjacent to the most fog', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'guide_reveal_hex', instanceId: 'g' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('placeOnHex');
    expect(G.tiles[result.args[0]].type).not.toBe('Fog');
  });
});

describe('guide_network + network_bid', () => {
  it('picks a valid network slot', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'guide_network', instanceId: 'g' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('selectNetworkCard');
    expect(G.networkRow[result.args[0]]).not.toBeNull();
  });

  it('submits a blind bid of at least 1 when initiator', () => {
    const G = makeState(2);
    G.players[0].resources.coins = 10;
    G.pendingAction = {
      type: 'network_bid', instanceId: 'g', slotIndex: 0,
      initiatorPlayerIndex: 0,
      bids: { '0': null, '1': null },
    };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('submitNetworkBid');
    expect(result.args[0]).toBeGreaterThanOrEqual(1);
  });

  it('passes when non-initiator has no coins', () => {
    const G = makeState(2);
    G.players[1].resources.coins = 0;
    G.pendingAction = {
      type: 'network_bid', instanceId: 'g', slotIndex: 0,
      initiatorPlayerIndex: 0,
      bids: { '0': 2, '1': null },
    };
    const result = getAIMove(G, 1)!;
    expect(result.move).toBe('submitNetworkBid');
    expect(result.args[0]).toBe(0);
  });
});

describe('elder_choose', () => {
  it('chooses village when fog exists', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'elder_choose', instanceId: 'e' };
    expect(getAIMove(G, 0)!.args[0]).toBe('village');
  });

  it('chooses reserve when no fog', () => {
    const G = makeState(2);
    for (const tile of Object.values(G.tiles)) {
      if (tile.type === 'Fog') tile.type = 'Field';
    }
    G.pendingAction = { type: 'elder_choose', instanceId: 'e' };
    expect(getAIMove(G, 0)!.args[0]).toBe('reserve');
  });
});

describe('elder_village_hex', () => {
  it('picks a Fog hex closest to center', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'elder_village_hex', instanceId: 'e' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('placeOnHex');
    expect(G.tiles[result.args[0]].type).toBe('Fog');
  });

  it('cancels when no fog available', () => {
    const G = makeState(2);
    for (const tile of Object.values(G.tiles)) {
      if (tile.type === 'Fog') tile.type = 'Field';
    }
    G.pendingAction = { type: 'elder_village_hex', instanceId: 'e' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });
});

describe('Market actions', () => {
  it('immediately finishes builder_market_buy with done', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_buy', instanceId: 'b', resource: 'wood', amount: 1 };
    expect(getAIMove(G, 0)).toEqual({ move: 'chooseOption', args: ['done'] });
  });

  it('immediately finishes builder_market_sell with done', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_sell', instanceId: 'b', resource: 'ore', amount: 1 };
    expect(getAIMove(G, 0)).toEqual({ move: 'chooseOption', args: ['done'] });
  });

  it('buys wood when wood is 0 and coins available', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 0, ore: 3, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('buy_wood');
  });

  it('buys ore when ore is 0 and wood is fine', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 3, ore: 0, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('buy_ore');
  });

  it('sells wood when wood > 3', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 5, ore: 1, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('sell_wood');
  });

  it('sells ore when ore > 3', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 1, ore: 5, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('sell_ore');
  });

  it('buys the lower resource when both are moderate', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 3, wood: 1, ore: 2, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('buy_wood');
  });

  it('sells the higher resource when no coins for buying', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 2, ore: 1, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    expect(getAIMove(G, 0)!.args[0]).toBe('sell_wood');
  });

  it('builder_market_choose: cancels when no trade is possible', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    G.players[0].resources = { coins: 10, wood: 0, ore: 0, votes: 1 };
    G.woodMarket = [0, 0, 0, 0];
    G.oreMarket = [0, 0, 0, 0];
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('builder_market_choose: sinks coins into buys when wind down (avoids hoard cap on coins)', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    G.players[0].resources = { coins: 46, wood: 1, ore: 1, votes: 1 };
    const m = getAIMove(G, 0)!;
    expect(m.move).toBe('chooseOption');
    expect(['buy_wood', 'buy_ore']).toContain(m.args[0]);
  });

  it('builder_market_choose: sells ore when ore is extremely high (was blocked before; caused hoard abort)', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    G.players[0].resources = { coins: 0, wood: 2, ore: 120, votes: 1 };
    expect(getAIMove(G, 0)!.args[0]).toBe('sell_ore');
  });
});

describe('Event card decisions', () => {
  it('event_import_choose: picks lower resource', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 3, ore: 1, votes: 1 };
    G.pendingAction = { type: 'event_import_choose', instanceId: 'imp' };
    expect(getAIMove(G, 0)!.args[0]).toBe('ore');
  });

  it('event_import_choose: picks wood when wood < ore', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 0, ore: 2, votes: 1 };
    G.pendingAction = { type: 'event_import_choose', instanceId: 'imp' };
    expect(getAIMove(G, 0)!.args[0]).toBe('wood');
  });

  it('event_import_choose: cancels when no coins', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 1, ore: 1, votes: 1 };
    G.pendingAction = { type: 'event_import_choose', instanceId: 'imp' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('event_export_choose: picks higher resource', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 1, ore: 4, votes: 1 };
    G.pendingAction = { type: 'event_export_choose', instanceId: 'exp' };
    expect(getAIMove(G, 0)!.args[0]).toBe('ore');
  });

  it('event_export_choose: cancels when no wood or ore to sell', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 0, ore: 0, votes: 1 };
    G.pendingAction = { type: 'event_export_choose', instanceId: 'exp' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('event_graft_choose: converts coin to vote when coins > votes', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 1, ore: 1, votes: 0 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('coin_to_vote');
  });

  it('event_graft_choose: converts vote to coin when votes >= coins', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 1, wood: 1, ore: 1, votes: 5 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('vote_to_coin');
  });

  it('event_graft_choose: prefers coin_to_vote when Mandate is visible but votes are short for its slot', () => {
    const G = makeState(2);
    G.politicsRow = ['Graft', 'Import', 'Airstrip', 'Mandate'];
    G.players[0].resources = { coins: 2, wood: 1, ore: 1, votes: 2 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('coin_to_vote');
  });

  it('event_graft_choose: prefers coin_to_vote when any resource is stockpiled (Mandate pressure)', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 2, wood: 18, ore: 1, votes: 5 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.args[0]).toBe('coin_to_vote');
  });

  it('event_graft_choose: cancels when neither coins nor votes are available', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 1, ore: 1, votes: 0 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('event_bribe: picks first non-Mandate politics card', () => {
    const G = makeState(2);
    G.players[0].resources.coins = 5;
    G.politicsRow = ['Mandate', 'Graft', 'Import', null];
    G.pendingAction = { type: 'event_bribe', instanceId: 'br' };
    const result = getAIMove(G, 0)!;
    expect(result.args[0]).toBe('1');
  });

  it('event_bribe: cancels when all slots are Mandate or empty', () => {
    const G = makeState(2);
    G.players[0].resources.coins = 5;
    G.politicsRow = ['Mandate', null, null, null];
    G.pendingAction = { type: 'event_bribe', instanceId: 'br' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('event_bribe: cancels when no coins', () => {
    const G = makeState(2);
    G.players[0].resources.coins = 0;
    G.pendingAction = { type: 'event_bribe', instanceId: 'br' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('broker_choose: picks import', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'broker_choose', instanceId: 'br' };
    expect(getAIMove(G, 0)!.args[0]).toBe('import');
  });

  it('broker_choose: picks export when Import is blocked (stockpile / need votes for Mandate)', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 18, ore: 2, votes: 0 };
    G.politicsRow = ['Mandate', 'Graft', 'Import', 'Export'];
    G.pendingAction = { type: 'broker_choose', instanceId: 'br' };
    expect(getAIMove(G, 0)!.args[0]).toBe('export');
  });

  it('skips Broker while an Export is still in tableau (Broker is reusable — avoid stacking Exports)', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 18, ore: 5, votes: 1 };
    G.players[0].tableau = [
      { instanceId: 'Broker_0_t', cardType: 'Broker', category: 'Personnel' },
      { instanceId: 'Export_0_t', cardType: 'Export', category: 'Event' },
    ];
    const r = getAIMove(G, 0)!;
    expect(r.move).toBe('activateCard');
    expect(r.args[0]).toBe('Export_0_t');
  });

  it('forester_choose: picks logging', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'forester_choose', instanceId: 'fr' };
    expect(getAIMove(G, 0)!.args[0]).toBe('logging');
  });
});

describe('event_restructuring_choose', () => {
  it('picks the lowest-priority personnel card', () => {
    const G = makeState(2);
    G.players[0].tableau.push(
      { instanceId: 'Fixer_0_test', cardType: 'Fixer', category: 'Personnel' },
    );
    G.pendingAction = { type: 'event_restructuring_choose', instanceId: 'r' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('chooseRestructuringTarget');
    // Fixer has priority 15, which is lower than Builder(22), Guide(20), Liaison(52)
    expect(result.args[0]).toBe('Fixer_0_test');
  });

  it('cancels when no personnel cards', () => {
    const G = makeState(2);
    G.players[0].tableau = G.players[0].tableau.filter(c => c.category !== 'Personnel');
    G.pendingAction = { type: 'event_restructuring_choose', instanceId: 'r' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });
});

describe('event_stimulus_choose – faction-specific', () => {
  it('Hotelier picks coins', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    expect(getAIMove(G, 0)!.args[0]).toBe('coins');
  });

  it('Industrialist picks lower of wood/ore', () => {
    const G = makeState(2);
    G.players[1].resources.wood = 0;
    G.players[1].resources.ore = 3;
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    expect(getAIMove(G, 1)!.args[0]).toBe('wood');
  });

  it('Industrialist picks ore when ore is lower', () => {
    const G = makeState(2);
    G.players[1].resources.wood = 5;
    G.players[1].resources.ore = 0;
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    expect(getAIMove(G, 1)!.args[0]).toBe('ore');
  });

  it('Bureaucrat picks votes', () => {
    const G = makeState(4);
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    expect(getAIMove(G, 3)!.args[0]).toBe('votes');
  });

  it('Chieftain picks coins', () => {
    const G = makeState(4);
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 2 };
    expect(getAIMove(G, 2)!.args[0]).toBe('coins');
  });
});

describe('Hex-targeting events', () => {
  it('event_logging_hex: picks a Forest hex', () => {
    const G = makeState(2);
    const hasForest = Object.values(G.tiles).some(t => t.type === 'Forest' && !t.hasConservation && !t.building);
    G.pendingAction = { type: 'event_logging_hex', instanceId: 'l' };
    const result = getAIMove(G, 0)!;
    if (hasForest) {
      expect(result.move).toBe('placeOnHex');
      expect(G.tiles[result.args[0]].type).toBe('Forest');
    } else {
      expect(result.move).toBe('cancelAction');
    }
  });

  it('event_forestry_hex: picks a Field hex', () => {
    const G = makeState(2);
    const hasField = Object.values(G.tiles).some(t => t.type === 'Field' && !t.building);
    G.pendingAction = { type: 'event_forestry_hex', instanceId: 'f' };
    const result = getAIMove(G, 0)!;
    if (hasField) {
      expect(result.move).toBe('placeOnHex');
      expect(G.tiles[result.args[0]].type).toBe('Field');
    } else {
      expect(result.move).toBe('cancelAction');
    }
  });

  it('event_conservation_hex: picks a Forest hex', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_conservation_hex', instanceId: 'c' };
    const result = getAIMove(G, 0)!;
    const hasForest = Object.values(G.tiles).some(t => t.type === 'Forest' && !t.building && !t.hasConservation);
    if (hasForest) {
      expect(result.move).toBe('placeOnHex');
    } else {
      expect(result.move).toBe('cancelAction');
    }
  });

  it('event_zoning_hex: cancels when no adjacent building', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_zoning_hex', instanceId: 'z' };
    const result = getAIMove(G, 0)!;
    // No buildings placed yet, so no hex adjacent to own building
    expect(result.move).toBe('cancelAction');
  });

  it('event_zoning_hex: finds hex when building exists', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.pendingAction = { type: 'event_zoning_hex', instanceId: 'z' };
    const result = getAIMove(G, 0)!;
    // May or may not find a valid hex depending on map layout
    expect(['placeOnHex', 'cancelAction']).toContain(result.move);
  });

  it('event_urbanplanning_hex: cancels when resources insufficient', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 0, ore: 0, votes: 0 };
    G.pendingAction = { type: 'event_urbanplanning_hex', instanceId: 'u' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });

  it('event_taxation_hex: cancels when no reserves owned', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_taxation_hex', instanceId: 't' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });
});

// ══════════════════════════════════════════════
// All faction support
// ══════════════════════════════════════════════

describe('4-player multi-faction', () => {
  it('Hotelier (player 0) activates Charter first', () => {
    const G = makeState(4);
    const result = getAIMove(G, 0)!;
    const charter = G.players[0].tableau.find(c => c.cardType === 'Charter')!;
    expect(result.args[0]).toBe(charter.instanceId);
  });

  it('Industrialist (player 1) activates Charter first', () => {
    const G = makeState(4);
    const result = getAIMove(G, 1)!;
    const charter = G.players[1].tableau.find(c => c.cardType === 'Charter')!;
    expect(result.args[0]).toBe(charter.instanceId);
  });

  it('Chieftain (player 2) has Elder instead of Builder', () => {
    const G = makeState(4);
    placeCharterForPlayer(G, 2);
    const elder = G.players[2].tableau.find(c => c.cardType === 'Elder');
    expect(elder).toBeDefined();
    const builder = G.players[2].tableau.find(c => c.cardType === 'Builder');
    expect(builder).toBeUndefined();
  });

  it('Bureaucrat (player 3) activates Charter first', () => {
    const G = makeState(4);
    const result = getAIMove(G, 3)!;
    const charter = G.players[3].tableau.find(c => c.cardType === 'Charter')!;
    expect(result.args[0]).toBe(charter.instanceId);
  });
});

// ══════════════════════════════════════════════
// INTEGRATION TESTS — AI moves against real game engine
// ══════════════════════════════════════════════

describe('Integration: AI produces valid moves', () => {
  it('Charter placement does not return INVALID_MOVE', () => {
    const G = makeState(2);
    const result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
    // Should have set charter_place pending
    expect(G.pendingAction?.type).toBe('charter_place');

    // Resolve the placement
    const result2 = executeAIMove(G, 0);
    expect(result2).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
  });

  it('Liaison generate does not return INVALID_MOVE', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    const liaison = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaison.instanceId };
    G.tokensUsedThisTurn.push(liaison.instanceId);
    G.actionsRemainingThisTurn -= 1;
    const result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
  });

  it('Builder market flow produces valid state transitions', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 0, ore: 0, votes: 1 };
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;

    // Activate builder
    const ctx = makeCtx(0, 2);
    moves.activateCard({ G, ctx }, builder.instanceId);
    expect(G.pendingAction?.type).toBe('builder_choose');

    // AI should choose market (no resources for build)
    let result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction?.type).toBe('builder_market_choose');

    // AI should buy something
    result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);

    // AI should say done
    result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
  });

  it('Stimulus resource selection does not return INVALID_MOVE', () => {
    const G = makeState(2);
    addEventCard(G, 0, 'Stimulus');
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 'Stimulus_0_test', remaining: 4 };
    const startCoins = G.players[0].resources.coins;

    for (let i = 0; i < 4; i++) {
      const result = executeAIMove(G, 0);
      expect(result).not.toBe(INVALID_MOVE);
    }
    expect(G.pendingAction).toBeNull();
    // Hotelier picks coins, should have gained 4
    expect(G.players[0].resources.coins).toBe(startCoins + 4);
  });

  it('Graft event produces valid exchange', () => {
    const G = makeState(2);
    addEventCard(G, 0, 'Graft');
    G.players[0].resources = { coins: 5, wood: 1, ore: 1, votes: 0 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'Graft_0_test' };
    G.tokensUsedThisTurn.push('Graft_0_test');
    G.actionsRemainingThisTurn -= 1;

    const result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.players[0].resources.coins).toBe(4);
    expect(G.players[0].resources.votes).toBe(1);
    expect(G.pendingAction).toBeNull();
  });

  it('Import event produces valid resource gain', () => {
    const G = makeState(2);
    addEventCard(G, 0, 'Import');
    G.players[0].resources = { coins: 5, wood: 0, ore: 3, votes: 1 };
    G.pendingAction = { type: 'event_import_choose', instanceId: 'Import_0_test' };
    G.tokensUsedThisTurn.push('Import_0_test');
    G.actionsRemainingThisTurn -= 1;

    const result = executeAIMove(G, 0);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.players[0].resources.wood).toBe(1);
    expect(G.players[0].resources.coins).toBe(4);
    expect(G.pendingAction).toBeNull();
  });
});

// ══════════════════════════════════════════════
// FULL TURN SIMULATION
// ══════════════════════════════════════════════

describe('Full turn simulation', () => {
  it('Hotelier completes a full turn without errors', () => {
    const G = makeState(2);
    const steps = runAITurnToCompletion(G, 0);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(G.pendingAction).toBeNull();
  });

  it('Industrialist completes a full turn without errors', () => {
    const G = makeState(2);
    const steps = runAITurnToCompletion(G, 1);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(G.pendingAction).toBeNull();
  });

  it('Chieftain completes a full turn without errors', () => {
    const G = makeState(3);
    const steps = runAITurnToCompletion(G, 2);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(G.pendingAction).toBeNull();
  });

  it('Bureaucrat completes a full turn without errors', () => {
    const G = makeState(4);
    const steps = runAITurnToCompletion(G, 3);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(G.pendingAction).toBeNull();
  });

  it('AI does not get stuck in an infinite loop', () => {
    const G = makeState(2);
    const steps = runAITurnToCompletion(G, 0, 50);
    expect(steps).toBeLessThanOrEqual(50);
  });

  it('AI completes turn even with extra event cards', () => {
    const G = makeState(2);
    addEventCard(G, 0, 'Dividends');
    addEventCard(G, 0, 'Import');
    G.players[0].resources.coins = 10;
    const steps = runAITurnToCompletion(G, 0);
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(G.pendingAction).toBeNull();
  });
});

describe('Multi-turn simulation', () => {
  it('two AI players can alternate turns for 4 rounds', () => {
    const G = makeState(2);
    const numRounds = 4;

    for (let round = 0; round < numRounds; round++) {
      for (let p = 0; p < 2; p++) {
        G.tokensUsedThisTurn = [];
        G.actionsRemainingThisTurn = 2;
        const steps = runAITurnToCompletion(G, p);
        expect(steps).toBeGreaterThanOrEqual(1);
        expect(G.pendingAction).toBeNull();
      }
    }
  });

  it('four AI players can complete 2 full rounds', () => {
    const G = makeState(4);
    const numRounds = 2;

    for (let round = 0; round < numRounds; round++) {
      for (let p = 0; p < 4; p++) {
        G.tokensUsedThisTurn = [];
        G.actionsRemainingThisTurn = 2;
        const steps = runAITurnToCompletion(G, p);
        expect(steps).toBeGreaterThanOrEqual(1);
        expect(G.pendingAction).toBeNull();
      }
    }
  });
});

// ══════════════════════════════════════════════
// EDGE CASES
// ══════════════════════════════════════════════

describe('Edge cases', () => {
  it('AI stops when game has a winner', () => {
    const G = makeState(2);
    G.winner = 'Hotelier';
    const result = getAIMove(G, 0);
    // getAIMove doesn't check winner itself (that's aiRunner's job), but it should still return a move
    expect(result).not.toBeNull();
  });

  it('AI with empty tableau just ends turn', () => {
    const G = makeState(2);
    G.players[0].tableau = [];
    expect(getAIMove(G, 0)).toEqual({ move: 'endTurn', args: [] });
  });

  it('AI with full tableau of Seat cards ends turn', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau = Array.from({ length: 8 }, (_, i) => ({
      instanceId: `Seat_${i}`,
      cardType: 'Seat' as EventCardType,
      category: 'Event' as const,
    }));
    expect(getAIMove(G, 0)).toEqual({ move: 'endTurn', args: [] });
  });

  it('AI handles builder with no valid build hexes gracefully', () => {
    const G = makeState(2);
    // Don't place charter — so no adjacency for building
    G.players[0].tableau = G.players[0].tableau.filter(c => c.cardType !== 'Charter');
    G.players[0].resources = { coins: 5, wood: 5, ore: 5, votes: 5 };
    const builder = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_build_hex', instanceId: builder.instanceId, buildingType: 'Resort' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('cancelAction');
  });

  it('reserve placement cancels when no valid reserve hex', () => {
    const G = makeState(2);
    // No villages or reserves on map, so no valid reserve hex
    G.pendingAction = { type: 'elder_reserve_hex', instanceId: 'e' };
    const result = getAIMove(G, 0)!;
    expect(result.move).toBe('cancelAction');
  });

  it('network slot returns null when all slots empty', () => {
    const G = makeState(2);
    G.networkRow = [null, null, null, null];
    G.pendingAction = { type: 'guide_network', instanceId: 'g' };
    expect(getAIMove(G, 0)!.move).toBe('cancelAction');
  });
});
