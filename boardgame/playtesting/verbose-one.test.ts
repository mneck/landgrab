/**
 * Manual / CI-optional: one normal-rules game with move-by-move logs on stderr.
 *
 *   npm run playtest:verbose-one
 */

import { describe, it } from 'vitest';
import { runBotGame } from './simulator';

describe('verbose one-game debug', () => {
  it('runs 1 LandgrabGame with logging', async () => {
    const r = await runBotGame({
      numPlayers: 2,
      fastWin: false,
      verbose: true,
    });
    console.log('\n--- RESULT ---\n', JSON.stringify(r, null, 2));
    // Do not assert ok — goal is to inspect logs when games abort or fail.
  }, 600_000);
});
