import type { Game } from 'boardgame.io';
import { LandgrabGame } from '../src/game/Game';
import type { LandgrabState } from '../src/game/types';
import { createInitialState } from '../src/game/setup';

/**
 * Headless smoke: `winSeatThreshold` is 1, and player 0 starts with Mandate plus
 * resources (Charter removed) so the bot can win in a small number of moves without
 * relying on politics RNG.
 */
function createPlaytestSmokeState(numPlayers: number): LandgrabState {
  const G = createInitialState(numPlayers, { winSeatThreshold: 1 });
  const p0 = G.players[0];
  p0.tableau = p0.tableau.filter(c => c.cardType !== 'Charter');
  p0.tableau.push({
    instanceId: 'Mandate_playtest_smoke',
    cardType: 'Mandate',
    category: 'Event',
  });
  p0.resources.coins = Math.max(p0.resources.coins, 15);
  p0.resources.votes = Math.max(p0.resources.votes, 5);
  return G;
}

/**
 * Same rules as {@link LandgrabGame}; setup tuned for fast, deterministic smoke wins.
 */
export const LandgrabPlaytestGame: Game<LandgrabState> = {
  ...LandgrabGame,
  setup: ({ ctx }) => createPlaytestSmokeState(ctx.numPlayers),
};
