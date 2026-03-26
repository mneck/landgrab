import type { Game } from 'boardgame.io';
import type { LandgrabState } from './types';
import { createInitialState } from './setup';
import { moves } from './moves';

export const LandgrabGame: Game<LandgrabState> = {
  name: 'landgrab',

  setup: ({ ctx }) => createInitialState(ctx.numPlayers),

  moves: moves,

  turn: {
    onBegin: ({ G, ctx }) => {
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
  },

  endIf: ({ G }) => {
    if (G.winner) return { winner: G.winner };
  },
};
