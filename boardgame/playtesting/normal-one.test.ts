/**
 * One normal-rules (non–fast-win) bot game (uses default max steps, currently 100k).
 *
 *   npm run playtest:normal-one
 */

import { describe, it } from 'vitest';
import { runBotGame } from './simulator';

describe('normal one-game playtest', () => {
  it('runs 2p LandgrabGame toward natural win', async () => {
    const r = await runBotGame({
      numPlayers: 2,
      fastWin: false,
      verbose: false,
    });
    // eslint-disable-next-line no-console -- intentional playtest output
    console.log('\n--- RESULT ---\n', JSON.stringify(r, null, 2));
  }, 600_000);
});
