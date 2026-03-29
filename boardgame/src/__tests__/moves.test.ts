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
  it('sets winner when a player reaches 2 seats via Seat card', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].seats = 1;
    G.players[0].tableau.push({
      instanceId: 'seat_test',
      cardType: 'Seat',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'seat_test');
    expect(G.players[0].seats).toBe(2);
    expect(G.winner).toBe('Hotelier');
  });

  it('does not set winner if seats < 2', () => {
    const G = createInitialState(2);
    const ctx = makeCtx(0, 2);

    G.players[0].seats = 0;
    G.players[0].tableau.push({
      instanceId: 'seat_test',
      cardType: 'Seat',
      category: 'Event',
    });

    moves.activateCard({ G, ctx }, 'seat_test');
    expect(G.players[0].seats).toBe(1);
    expect(G.winner).toBeUndefined();
  });
});
