import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import { LandgrabGame } from '../src/game/Game';
import { moves as baseMoves } from '../src/game/moves';
import type { LandgrabState, PlayerType, TableauCard } from '../src/game/types';
import { createInitialState } from '../src/game/setup';

/** Builder/Elder, Liaison, Guide, Charter — Mandate is granted after Charter is placed (see `grantMandateAfterCharter`). */
function smokeTableau(type: PlayerType, playerIdx: number): TableauCard[] {
  const opener: 'Builder' | 'Elder' = type === 'Chieftain' ? 'Elder' : 'Builder';
  const order: (typeof opener | 'Liaison' | 'Guide' | 'Charter')[] = [
    opener,
    'Liaison',
    'Guide',
    'Charter',
  ];
  return order.map((cardType, idx) => ({
    instanceId: `${cardType}_${playerIdx}_smoke_${idx}`,
    cardType,
    category: cardType === 'Charter' ? 'Event' : 'Personnel',
  })) as TableauCard[];
}

/**
 * After a legal Charter building placement, add Mandate to that player's tableau
 * (smoke harness only — avoids starting with Mandate, which would purge Charter on play).
 */
function grantMandateAfterCharter(
  ...args: Parameters<typeof baseMoves.placeOnHex>
): ReturnType<typeof baseMoves.placeOnHex> {
  const [moveArgs, targetHexKey] = args;
  const pa = moveArgs.G.pendingAction;
  const wasCharter = pa?.type === 'charter_place';
  const out = baseMoves.placeOnHex(moveArgs, targetHexKey);
  if (out === INVALID_MOVE) return out;
  if (wasCharter && moveArgs.G.pendingAction === null) {
    const playerIndex = parseInt(moveArgs.ctx.currentPlayer, 10);
    const p = moveArgs.G.players[playerIndex];
    if (p.tableau.length < 8) {
      p.tableau.push({
        instanceId: `Mandate_afterCharter_${playerIndex}_${Date.now()}`,
        cardType: 'Mandate',
        category: 'Event',
      });
    }
  }
  return out;
}

/**
 * Headless smoke: `winSeatThreshold` 1, full smoke tableaux, Mandate only after Charter is built.
 */
function createPlaytestSmokeState(numPlayers: number): LandgrabState {
  const G = createInitialState(numPlayers, { winSeatThreshold: 1 });
  for (let i = 0; i < G.players.length; i++) {
    const p = G.players[i];
    p.tableau = smokeTableau(p.type, i);
    p.resources.coins = Math.max(p.resources.coins, 15);
    p.resources.votes = Math.max(p.resources.votes, 15);
    p.resources.wood = Math.max(p.resources.wood, 5);
    p.resources.ore = Math.max(p.resources.ore, 5);
  }
  return G;
}

/**
 * Same rules as {@link LandgrabGame}; smoke setup + Mandate injected after Charter placement.
 */
export const LandgrabPlaytestGame: Game<LandgrabState> = {
  ...LandgrabGame,
  setup: ({ ctx }) => createPlaytestSmokeState(ctx.numPlayers),
  moves: {
    ...baseMoves,
    placeOnHex: grantMandateAfterCharter as typeof baseMoves.placeOnHex,
  },
};
