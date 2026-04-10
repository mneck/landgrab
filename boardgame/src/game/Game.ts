import type { Game } from 'boardgame.io';
import { TurnOrder } from 'boardgame.io/core';
import type { LandgrabState } from './types';
import { createInitialState } from './setup';
import { moves, networkBidMoves } from './moves';
import { submitStartingBid } from './startingBid';

const playPhaseTurn = {
  stages: {
    networkBid: {
      moves: networkBidMoves,
    },
  },
  onBegin: ({ G, ctx }: { G: LandgrabState; ctx: { currentPlayer: string } }) => {
    if (G.startingBidPhase?.resolved) {
      delete G.startingBidPhase;
    }
    G.tokensUsedThisTurn = [];
    G.actionsRemainingThisTurn = 2;
    G.pendingAction = null;
    if (G.landClaimsUntilPlayer === parseInt(ctx.currentPlayer)) {
      G.landClaimsUntilPlayer = undefined;
    }
    if (G.boycottEffect?.targetPlayerIndex === parseInt(ctx.currentPlayer)) {
      G.boycottEffect = undefined;
    }
  },
  order: TurnOrder.CUSTOM_FROM('startingPlayOrder'),
};

export const LandgrabGame: Game<LandgrabState> = {
  name: 'landgrab',

  setup: ({ ctx }) => createInitialState(ctx.numPlayers),

  moves,

  turn: playPhaseTurn,

  phases: {
    startingBid: {
      start: true,
      next: 'play',
      turn: {
        activePlayers: {
          all: 'startingBid',
          minMoves: 1,
          maxMoves: 1,
        },
        stages: {
          startingBid: {
            moves: { submitStartingBid },
          },
        },
      },
    },
    play: {
      moves,
      turn: playPhaseTurn,
    },
  },

  playerView: ({ G, ctx, playerID }) => {
    const phase = G.startingBidPhase;
    if (!phase || phase.resolved) return G;
    if (playerID === null || playerID === undefined || playerID === '') return G;

    const my = parseInt(String(playerID), 10);
    if (Number.isNaN(my) || my < 0 || my >= ctx.numPlayers) return G;

    const amounts = [...phase.amounts];
    for (let i = 0; i < ctx.numPlayers; i++) {
      if (i !== my && amounts[i] !== null) {
        amounts[i] = -1;
      }
    }
    return {
      ...G,
      startingBidPhase: {
        ...phase,
        amounts,
      },
    };
  },

  endIf: ({ G }) => {
    if (G.winner) return { winner: G.winner };
  },
};
