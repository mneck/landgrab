import { describe, it, expect } from 'vitest';
import { getAIMove } from '../ai/aiStrategy';
import { createInitialState } from '../game/setup';
import type { LandgrabState, PendingAction, BuildingType, EventCardType } from '../game/types';
import { hexKey } from '../utils/hexGrid';

function makeState(numPlayers = 2): LandgrabState {
  return createInitialState(numPlayers);
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

describe('getAIMove – no pending action', () => {
  it('returns a move to activate a card when actions are available', () => {
    const G = makeState(2);
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('activateCard');
    expect(result!.args).toHaveLength(1);
  });

  it('prioritizes Charter over other cards', () => {
    const G = makeState(2);
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    const charter = G.players[0].tableau.find(c => c.cardType === 'Charter');
    expect(result!.args[0]).toBe(charter!.instanceId);
  });

  it('returns endTurn when no actions remain', () => {
    const G = makeState(2);
    G.actionsRemainingThisTurn = 0;
    const result = getAIMove(G, 0);
    expect(result).toEqual({ move: 'endTurn', args: [] });
  });

  it('returns endTurn when all cards are used this turn', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.tokensUsedThisTurn = G.players[0].tableau.map(c => c.instanceId);
    const result = getAIMove(G, 0);
    expect(result).toEqual({ move: 'endTurn', args: [] });
  });

  it('prioritizes Mandate when affordable and first action', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau.push({
      instanceId: 'Mandate_test_0',
      cardType: 'Mandate',
      category: 'Event',
    });
    G.players[0].resources.coins = 20;
    G.players[0].resources.votes = 5;
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.args[0]).toBe('Mandate_test_0');
  });

  it('skips Mandate if not first action (tokensUsed > 0)', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau.push({
      instanceId: 'Mandate_test_0',
      cardType: 'Mandate',
      category: 'Event',
    });
    G.players[0].resources.coins = 20;
    G.players[0].resources.votes = 5;
    G.tokensUsedThisTurn = ['some_card'];
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.args[0]).not.toBe('Mandate_test_0');
  });
});

describe('getAIMove – charter_place', () => {
  it('returns a placeOnHex move for charter placement', () => {
    const G = makeState(2);
    const charterCard = G.players[0].tableau.find(c => c.cardType === 'Charter')!;
    G.pendingAction = { type: 'charter_place', instanceId: charterCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('placeOnHex');
    expect(result!.args).toHaveLength(1);
    expect(typeof result!.args[0]).toBe('string');
  });
});

describe('getAIMove – builder_choose', () => {
  it('chooses build when resources and hexes are available', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 2, ore: 2, votes: 1 };
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_choose', instanceId: builderCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseOption');
  });

  it('chooses market when no resources for building', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources = { coins: 5, wood: 0, ore: 0, votes: 1 };
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_choose', instanceId: builderCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('market');
  });
});

describe('getAIMove – builder_build_type', () => {
  it('returns a valid building type from allowed options', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    G.pendingAction = { type: 'builder_build_type', instanceId: builderCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseBuildingType');
    const allowed = ['Resort', 'Housing', 'IndustrialZone', 'Farm', 'Infrastructure', 'CivicOffice'];
    expect(allowed).toContain(result!.args[0]);
  });
});

describe('getAIMove – liaison_choose', () => {
  it('chooses generate when no buildings exist', () => {
    const G = makeState(2);
    const liaisonCard = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaisonCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('generate');
  });

  it('chooses politics when buildings exist and votes available', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].resources.votes = 3;
    const liaisonCard = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;
    G.pendingAction = { type: 'liaison_choose', instanceId: liaisonCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('politics');
  });
});

describe('getAIMove – guide_choose', () => {
  it('chooses reveal when fog tiles exist', () => {
    const G = makeState(2);
    const guideCard = G.players[0].tableau.find(c => c.cardType === 'Guide')!;
    G.pendingAction = { type: 'guide_choose', instanceId: guideCard.instanceId };
    const result = getAIMove(G, 0);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('reveal');
  });
});

describe('getAIMove – market actions', () => {
  it('completes builder_market_buy with done', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_buy', instanceId: 'b', resource: 'wood', amount: 1 };
    const result = getAIMove(G, 0);
    expect(result).toEqual({ move: 'chooseOption', args: ['done'] });
  });

  it('completes builder_market_sell with done', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'builder_market_sell', instanceId: 'b', resource: 'ore', amount: 1 };
    const result = getAIMove(G, 0);
    expect(result).toEqual({ move: 'chooseOption', args: ['done'] });
  });

  it('buys wood when wood is low', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 0, ore: 3, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    const result = getAIMove(G, 0);
    expect(result!.args[0]).toBe('buy_wood');
  });

  it('sells wood when wood is high', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 0, wood: 5, ore: 1, votes: 1 };
    G.pendingAction = { type: 'builder_market_choose', instanceId: 'b' };
    const result = getAIMove(G, 0);
    expect(result!.args[0]).toBe('sell_wood');
  });
});

describe('getAIMove – event cards', () => {
  it('handles event_import_choose by picking lower resource', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 3, ore: 1, votes: 1 };
    G.pendingAction = { type: 'event_import_choose', instanceId: 'imp' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('ore');
  });

  it('handles event_graft_choose', () => {
    const G = makeState(2);
    G.players[0].resources = { coins: 5, wood: 1, ore: 1, votes: 0 };
    G.pendingAction = { type: 'event_graft_choose', instanceId: 'g' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('coin_to_vote');
  });

  it('handles event_stimulus_choose', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseStimulusResource');
    expect(['coins', 'wood', 'ore', 'votes']).toContain(result!.args[0]);
  });

  it('handles event_restructuring_choose by picking least-priority personnel', () => {
    const G = makeState(2);
    G.players[0].tableau.push(
      { instanceId: 'Fixer_0_test', cardType: 'Fixer', category: 'Personnel' },
    );
    G.pendingAction = { type: 'event_restructuring_choose', instanceId: 'r' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseRestructuringTarget');
    expect(typeof result!.args[0]).toBe('string');
  });

  it('handles broker_choose', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'broker_choose', instanceId: 'br' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('import');
  });

  it('handles forester_choose', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'forester_choose', instanceId: 'fr' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('chooseOption');
    expect(result!.args[0]).toBe('logging');
  });
});

describe('getAIMove – elder actions', () => {
  it('chooses village when fog exists', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'elder_choose', instanceId: 'e' };
    const result = getAIMove(G, 0);
    expect(result!.args[0]).toBe('village');
  });

  it('picks a fog hex for elder_village_hex', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'elder_village_hex', instanceId: 'e' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('placeOnHex');
    const tile = G.tiles[result!.args[0]];
    expect(tile.type).toBe('Fog');
  });
});

describe('getAIMove – politics slot', () => {
  it('picks first free politics slot for liaison_politics', () => {
    const G = makeState(2);
    G.players[0].resources.votes = 5;
    G.pendingAction = { type: 'liaison_politics', instanceId: 'l' };
    const result = getAIMove(G, 0);
    expect(result!.move).toBe('selectPoliticsCard');
    expect(typeof result!.args[0]).toBe('number');
    expect(result!.args[0]).toBeGreaterThanOrEqual(0);
    expect(result!.args[0]).toBeLessThan(4);
  });
});

describe('getAIMove – Seat card is never activated', () => {
  it('skips Seat cards in tableau', () => {
    const G = makeState(2);
    placeCharterForPlayer(G, 0);
    G.players[0].tableau = [
      { instanceId: 'Seat_0_test', cardType: 'Seat', category: 'Event' },
    ];
    const result = getAIMove(G, 0);
    expect(result).toEqual({ move: 'endTurn', args: [] });
  });
});

describe('getAIMove – 4-player game', () => {
  it('handles Chieftain AI (player 2)', () => {
    const G = makeState(4);
    const result = getAIMove(G, 2);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('activateCard');
    const charter = G.players[2].tableau.find(c => c.cardType === 'Charter');
    expect(result!.args[0]).toBe(charter!.instanceId);
  });

  it('handles Bureaucrat AI (player 3)', () => {
    const G = makeState(4);
    const result = getAIMove(G, 3);
    expect(result).not.toBeNull();
    expect(result!.move).toBe('activateCard');
    const charter = G.players[3].tableau.find(c => c.cardType === 'Charter');
    expect(result!.args[0]).toBe(charter!.instanceId);
  });
});

describe('getAIMove – stimulus resource selection by faction', () => {
  it('Hotelier picks coins', () => {
    const G = makeState(2);
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    const result = getAIMove(G, 0);
    expect(result!.args[0]).toBe('coins');
  });

  it('Industrialist picks lower of wood/ore', () => {
    const G = makeState(2);
    G.players[1].resources.wood = 0;
    G.players[1].resources.ore = 3;
    G.pendingAction = { type: 'event_stimulus_choose', instanceId: 's', remaining: 4 };
    const result = getAIMove(G, 1);
    expect(result!.args[0]).toBe('wood');
  });
});
