import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/setup';
import { moves } from '../game/moves';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { LandgrabState } from '../game/types';

function makeCtx(currentPlayer: number, numPlayers: number) {
  return { currentPlayer: String(currentPlayer), numPlayers };
}

describe('activateCard', () => {
  it('rejects activation of a card not in the player tableau', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const result = moves.activateCard({ G, ctx }, 'nonexistent_card_id');
    expect(result).toBe(INVALID_MOVE);
  });

  it('rejects activation when no actions remain', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    G.actionsRemainingThisTurn = 0;
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    const result = moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(result).toBe(INVALID_MOVE);
  });

  it('rejects activation when a pending action exists', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(G.pendingAction).not.toBeNull();

    // Try activating another card while pending
    const guideCard = G.players[0].tableau.find(c => c.cardType === 'Guide')!;
    const result = moves.activateCard({ G, ctx }, guideCard.instanceId);
    expect(result).toBe(INVALID_MOVE);
  });

  it('rejects activating the same card twice in one turn', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);

    // Cancel the pending action to allow next activation
    G.pendingAction = null;

    const result = moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(result).toBe(INVALID_MOVE);
  });

  it('decrements actionsRemainingThisTurn on successful activation', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    expect(G.actionsRemainingThisTurn).toBe(2);

    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(G.actionsRemainingThisTurn).toBe(1);
  });

  it('adds the card instanceId to tokensUsedThisTurn', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(G.tokensUsedThisTurn).toContain(builderCard.instanceId);
  });

  it('Mandate must be the first action of the turn', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    // Use an action first
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);
    G.pendingAction = null;

    // Add a Mandate card to the tableau
    G.players[0].tableau.push({
      instanceId: 'mandate_test',
      cardType: 'Mandate',
      category: 'Event',
    });

    const result = moves.activateCard({ G, ctx }, 'mandate_test');
    expect(result).toBe(INVALID_MOVE);
  });
});

describe('endTurn', () => {
  it('rejects ending turn when a pending action exists', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const endTurnCalled = { value: false };

    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);

    const result = moves.endTurn({
      G,
      ctx,
      events: { endTurn: () => { endTurnCalled.value = true; } },
    });
    expect(result).toBe(INVALID_MOVE);
    expect(endTurnCalled.value).toBe(false);
  });

  it('allows ending turn when no pending action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const endTurnCalled = { value: false };

    const result = moves.endTurn({
      G,
      ctx,
      events: { endTurn: () => { endTurnCalled.value = true; } },
    });
    expect(result).not.toBe(INVALID_MOVE);
    expect(endTurnCalled.value).toBe(true);
  });

  it('rotates politics at end of round (last player)', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(1, 2); // player 1 is last in 2-player game
    const originalRow = [...G.politicsRow];

    moves.endTurn({
      G,
      ctx,
      events: { endTurn: () => {} },
    });

    // Politics row should have shifted
    expect(G.politicsRow).not.toEqual(originalRow);
  });

  it('does not rotate politics for non-last player', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const originalRow = [...G.politicsRow];

    moves.endTurn({
      G,
      ctx,
      events: { endTurn: () => {} },
    });

    expect(G.politicsRow).toEqual(originalRow);
  });
});

describe('cancelAction', () => {
  it('cancels a pending Builder action and refunds the action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;

    moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(G.pendingAction?.type).toBe('builder_choose');
    expect(G.actionsRemainingThisTurn).toBe(1);
    expect(G.tokensUsedThisTurn).toContain(builderCard.instanceId);

    const result = moves.cancelAction({ G, ctx });
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
    expect(G.actionsRemainingThisTurn).toBe(2);
    expect(G.tokensUsedThisTurn).not.toContain(builderCard.instanceId);
  });

  it('allows reusing a card after canceling', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;

    moves.activateCard({ G, ctx }, builderCard.instanceId);
    moves.cancelAction({ G, ctx });

    // Should be able to activate the same card again
    const result = moves.activateCard({ G, ctx }, builderCard.instanceId);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction?.type).toBe('builder_choose');
  });

  it('rejects cancel when no pending action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const result = moves.cancelAction({ G, ctx });
    expect(result).toBe(INVALID_MOVE);
  });

  it('cancels charter_place and re-adds Charter to tableau', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const charterCard = G.players[0].tableau.find(c => c.cardType === 'Charter')!;

    moves.activateCard({ G, ctx }, charterCard.instanceId);
    expect(G.pendingAction?.type).toBe('charter_place');
    expect(G.players[0].tableau.find(c => c.cardType === 'Charter')).toBeUndefined();

    const result = moves.cancelAction({ G, ctx });
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
    expect(G.actionsRemainingThisTurn).toBe(2);

    const restoredCharter = G.players[0].tableau.find(c => c.cardType === 'Charter');
    expect(restoredCharter).toBeDefined();
    expect(restoredCharter!.instanceId).toBe(charterCard.instanceId);
  });

  it('cancels a mid-flow builder_build_type action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;

    moves.activateCard({ G, ctx }, builderCard.instanceId);
    moves.chooseOption({ G, ctx }, 'build');
    expect(G.pendingAction?.type).toBe('builder_build_type');

    const result = moves.cancelAction({ G, ctx });
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
    expect(G.actionsRemainingThisTurn).toBe(2);
  });

  it('cancels Guide, Liaison, and Elder choose states', () => {
    for (const cardType of ['Guide', 'Liaison'] as const) {
      const G = createInitialState(2);
      const ctx = makeCtx(0, 2);
      const card = G.players[0].tableau.find(c => c.cardType === cardType)!;

      moves.activateCard({ G, ctx }, card.instanceId);
      expect(G.pendingAction).not.toBeNull();

      const result = moves.cancelAction({ G, ctx });
      expect(result).not.toBe(INVALID_MOVE);
      expect(G.pendingAction).toBeNull();
      expect(G.actionsRemainingThisTurn).toBe(2);
    }

    // Elder for Chieftain
    const G3 = createInitialState(3);
    const ctx3 = makeCtx(2, 3);
    const elder = G3.players[2].tableau.find(c => c.cardType === 'Elder')!;
    moves.activateCard({ G: G3, ctx: ctx3 }, elder.instanceId);
    const result = moves.cancelAction({ G: G3, ctx: ctx3 });
    expect(result).not.toBe(INVALID_MOVE);
    expect(G3.pendingAction).toBeNull();
    expect(G3.actionsRemainingThisTurn).toBe(2);
  });
});

describe('chooseOption', () => {
  it('rejects chooseOption when no pending action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const result = moves.chooseOption({ G, ctx }, 'build');
    expect(result).toBe(INVALID_MOVE);
  });

  it('rejects invalid options for builder_choose', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.activateCard({ G, ctx }, builderCard.instanceId);

    const result = moves.chooseOption({ G, ctx }, 'invalid_option');
    expect(result).toBe(INVALID_MOVE);
  });
});

describe('Charter card', () => {
  it('removes Charter from tableau on activation', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const charterCard = G.players[0].tableau.find(c => c.cardType === 'Charter')!;

    moves.activateCard({ G, ctx }, charterCard.instanceId);

    const stillInTableau = G.players[0].tableau.find(c => c.instanceId === charterCard.instanceId);
    expect(stillInTableau).toBeUndefined();
    expect(G.pendingAction?.type).toBe('charter_place');
  });
});

describe('Guide card', () => {
  it('sets pending action to guide_choose', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const guideCard = G.players[0].tableau.find(c => c.cardType === 'Guide')!;

    moves.activateCard({ G, ctx }, guideCard.instanceId);
    expect(G.pendingAction?.type).toBe('guide_choose');
  });

  it('can choose reveal or network', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const guideCard = G.players[0].tableau.find(c => c.cardType === 'Guide')!;

    moves.activateCard({ G, ctx }, guideCard.instanceId);
    const r1 = moves.chooseOption({ G, ctx }, 'reveal');
    expect(r1).not.toBe(INVALID_MOVE);
    expect(G.pendingAction?.type).toBe('guide_reveal_hex');
  });
});

describe('Liaison card', () => {
  it('sets pending action to liaison_choose', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const liaisonCard = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;

    moves.activateCard({ G, ctx }, liaisonCard.instanceId);
    expect(G.pendingAction?.type).toBe('liaison_choose');
  });

  it('generate option runs procurement and clears pending action', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);
    const liaisonCard = G.players[0].tableau.find(c => c.cardType === 'Liaison')!;

    moves.activateCard({ G, ctx }, liaisonCard.instanceId);
    const result = moves.chooseOption({ G, ctx }, 'generate');
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction).toBeNull();
  });
});

describe('Elder card (Chieftain)', () => {
  it('sets pending action to elder_choose', () => {
    const G = createInitialState(3);
    const ctx = makeCtx(2, 3); // Chieftain is player 2
    const elderCard = G.players[2].tableau.find(c => c.cardType === 'Elder')!;

    moves.activateCard({ G, ctx }, elderCard.instanceId);
    expect(G.pendingAction?.type).toBe('elder_choose');
  });

  it('can choose village or reserve', () => {
    const G = createInitialState(3);
    const ctx = makeCtx(2, 3);
    const elderCard = G.players[2].tableau.find(c => c.cardType === 'Elder')!;

    moves.activateCard({ G, ctx }, elderCard.instanceId);
    const result = moves.chooseOption({ G, ctx }, 'village');
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction?.type).toBe('elder_village_hex');
  });
});

describe('player turn transitions', () => {
  it('Player 2 can activate cards on their turn', () => {
    const G = createInitialState(2);
    const ctx1 = makeCtx(1, 2);

    const player2Builder = G.players[1].tableau.find(c => c.cardType === 'Builder')!;
    const result = moves.activateCard({ G, ctx: ctx1 }, player2Builder.instanceId);
    expect(result).not.toBe(INVALID_MOVE);
    expect(G.pendingAction?.type).toBe('builder_choose');
    expect(G.actionsRemainingThisTurn).toBe(1);
  });

  it('Player 2 can end their turn', () => {
    const G = createInitialState(2);
    const ctx1 = makeCtx(1, 2);
    const endTurnCalled = { value: false };

    const result = moves.endTurn({
      G,
      ctx: ctx1,
      events: { endTurn: () => { endTurnCalled.value = true; } },
    });
    expect(result).not.toBe(INVALID_MOVE);
    expect(endTurnCalled.value).toBe(true);
  });

  it('all players in a 4-player game can activate cards on their respective turns', () => {
    const G = createInitialState(4);

    for (let i = 0; i < 4; i++) {
      G.tokensUsedThisTurn = [];
      G.actionsRemainingThisTurn = 2;
      G.pendingAction = null;

      const ctx = makeCtx(i, 4);
      const guide = G.players[i].tableau.find(c => c.cardType === 'Guide')!;
      const result = moves.activateCard({ G, ctx }, guide.instanceId);
      expect(result).not.toBe(INVALID_MOVE);
      expect(G.pendingAction?.type).toBe('guide_choose');
    }
  });
});

describe('win condition', () => {
  it('Seat card cannot be activated (it is permanent)', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].seats = 1;
    G.players[0].tableau.push({
      instanceId: 'seat_test',
      cardType: 'Seat',
      category: 'Event',
    });

    const result = moves.activateCard({ G, ctx }, 'seat_test');
    expect(result).toBe(INVALID_MOVE);
    expect(G.players[0].seats).toBe(1);
  });

  it('sets winner when Mandate activation reaches 2 seats', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].seats = 1;
    G.players[0].resources.votes = 5;
    G.players[0].resources.coins = 15;
    G.players[0].tableau.push({
      instanceId: 'mandate_test',
      cardType: 'Mandate',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'mandate_test');
    expect(G.players[0].seats).toBe(2);
    expect(G.winner).toBe('Hotelier');
  });

  it('does not set winner after first Mandate activation', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].seats = 0;
    G.players[0].resources.votes = 5;
    G.players[0].resources.coins = 15;
    G.players[0].tableau.push({
      instanceId: 'mandate_test',
      cardType: 'Mandate',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'mandate_test');
    expect(G.players[0].seats).toBe(1);
    expect(G.winner).toBeUndefined();
    expect(G.players[0].tableau.some(c => c.cardType === 'Seat')).toBe(true);
    expect(G.players[0].tableau.some(c => c.cardType === 'Restructuring')).toBe(true);
    // Faction cost deducted: 10 coins for Hotelier with 0 seats
    expect(G.players[0].resources.coins).toBe(5);
  });

  it('Mandate activation purges all Event cards from tableau', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].resources.votes = 5;
    G.players[0].resources.coins = 15;
    G.players[0].tableau.push(
      { instanceId: 'mandate_test', cardType: 'Mandate', category: 'Event' },
      { instanceId: 'div_test', cardType: 'Dividends', category: 'Event' },
      { instanceId: 'bribe_test', cardType: 'Bribe', category: 'Event' },
    );

    const personnelCount = G.players[0].tableau.filter(c => c.category === 'Personnel').length;
    moves.activateCard({ G, ctx }, 'mandate_test');

    const events = G.players[0].tableau.filter(c => c.category === 'Event');
    expect(events.every(c => c.cardType === 'Seat' || c.cardType === 'Restructuring')).toBe(true);
    expect(G.players[0].tableau.filter(c => c.category === 'Personnel').length).toBe(personnelCount);
  });

  it('Mandate activation fails without votes', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].resources.votes = 0;
    G.players[0].resources.coins = 15;
    G.players[0].tableau.push({
      instanceId: 'mandate_test',
      cardType: 'Mandate',
      category: 'Event',
    });

    const result = moves.activateCard({ G, ctx }, 'mandate_test');
    expect(result).toBe(INVALID_MOVE);
    expect(G.players[0].seats).toBe(0);
  });

  it('Mandate activation fails without faction cost', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].resources.votes = 5;
    G.players[0].resources.coins = 5;
    G.players[0].tableau.push({
      instanceId: 'mandate_test',
      cardType: 'Mandate',
      category: 'Event',
    });

    const result = moves.activateCard({ G, ctx }, 'mandate_test');
    expect(result).toBe(INVALID_MOVE);
    expect(G.players[0].seats).toBe(0);
  });
});

describe('Mandate acquisition via Liaison', () => {
  it('Mandate can be acquired from Politics track via Liaison', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.politicsRow[2] = 'Mandate';
    G.players[0].resources.votes = 5;
    G.pendingAction = { type: 'liaison_politics', instanceId: 'liaison_0' };

    moves.selectPoliticsCard({ G, ctx }, 2);
    expect(G.players[0].tableau.some(c => c.cardType === 'Mandate')).toBe(true);
    expect(G.players[0].resources.votes).toBe(3);
    expect(G.politicsRow[2]).not.toBe('Mandate');
  });

  it('Mandate costs the slot vote price (slot 3 = 3 votes)', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.politicsRow[3] = 'Mandate';
    G.players[0].resources.votes = 5;
    G.pendingAction = { type: 'liaison_politics', instanceId: 'liaison_0' };

    moves.selectPoliticsCard({ G, ctx }, 3);
    expect(G.players[0].resources.votes).toBe(2);
    expect(G.players[0].tableau.some(c => c.cardType === 'Mandate')).toBe(true);
  });

  it('Mandate at slot 0 is free (0 votes)', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.politicsRow[0] = 'Mandate';
    G.players[0].resources.votes = 1;
    G.pendingAction = { type: 'liaison_politics', instanceId: 'liaison_0' };

    moves.selectPoliticsCard({ G, ctx }, 0);
    expect(G.players[0].resources.votes).toBe(1);
    expect(G.players[0].tableau.some(c => c.cardType === 'Mandate')).toBe(true);
  });
});

describe('Restructuring', () => {
  it('opens personnel selection when activated', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push({
      instanceId: 'restructuring_test',
      cardType: 'Restructuring',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'restructuring_test');
    expect(G.pendingAction?.type).toBe('event_restructuring_choose');
  });

  it('removes chosen Personnel and adds Stimulus', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push({
      instanceId: 'restructuring_test',
      cardType: 'Restructuring',
      category: 'Event',
    });

    G.pendingAction = { type: 'event_restructuring_choose', instanceId: 'restructuring_test' };
    G.tokensUsedThisTurn = ['restructuring_test'];
    G.actionsRemainingThisTurn = 1;

    const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
    moves.chooseRestructuringTarget({ G, ctx }, builderCard.instanceId);

    expect(G.players[0].tableau.some(c => c.cardType === 'Builder')).toBe(false);
    expect(G.players[0].tableau.some(c => c.cardType === 'Stimulus')).toBe(true);
    expect(G.players[0].tableau.some(c => c.cardType === 'Restructuring')).toBe(false);
    expect(G.pendingAction).toBeNull();
  });

  it('rejects non-Personnel card as target', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push(
      { instanceId: 'restructuring_test', cardType: 'Restructuring', category: 'Event' },
      { instanceId: 'seat_test', cardType: 'Seat', category: 'Event' },
    );

    G.pendingAction = { type: 'event_restructuring_choose', instanceId: 'restructuring_test' };

    const result = moves.chooseRestructuringTarget({ G, ctx }, 'seat_test');
    expect(result).toBe(INVALID_MOVE);
  });
});

describe('Stimulus', () => {
  it('grants 4 resources chosen one at a time', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push({
      instanceId: 'stimulus_test',
      cardType: 'Stimulus',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'stimulus_test');
    expect(G.pendingAction?.type).toBe('event_stimulus_choose');

    const startCoins = G.players[0].resources.coins;
    const startWood = G.players[0].resources.wood;

    moves.chooseStimulusResource({ G, ctx }, 'coins');
    expect(G.players[0].resources.coins).toBe(startCoins + 1);
    expect(G.pendingAction).not.toBeNull();

    moves.chooseStimulusResource({ G, ctx }, 'wood');
    moves.chooseStimulusResource({ G, ctx }, 'coins');
    moves.chooseStimulusResource({ G, ctx }, 'votes');

    expect(G.pendingAction).toBeNull();
    expect(G.players[0].resources.coins).toBe(startCoins + 2);
    expect(G.players[0].resources.wood).toBe(startWood + 1);
    expect(G.players[0].tableau.some(c => c.cardType === 'Stimulus')).toBe(false);
  });

  it('cannot be cancelled after partially picking resources', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push({
      instanceId: 'stimulus_test',
      cardType: 'Stimulus',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'stimulus_test');
    moves.chooseStimulusResource({ G, ctx }, 'coins');

    const result = moves.cancelAction({ G, ctx });
    expect(result).toBe(INVALID_MOVE);
  });

  it('can be cancelled before picking any resources', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].tableau.push({
      instanceId: 'stimulus_test',
      cardType: 'Stimulus',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'stimulus_test');
    moves.cancelAction({ G, ctx });

    expect(G.pendingAction).toBeNull();
    expect(G.actionsRemainingThisTurn).toBe(2);
  });
});
