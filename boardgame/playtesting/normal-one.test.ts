/**
 * Full rules 2p game: no step limit; stops on win or resource hoard (>150 of one type).
 *
 *   npm run playtest:normal-one
 */

import { describe, it, expect } from 'vitest';
import { runBotGame } from './simulator';

describe('normal one-game playtest', () => {
  it('runs 2p LandgrabGame to win or hoard cap', async () => {
    const r = await runBotGame({
      numPlayers: 2,
      fastWin: false,
      /** Stream `[playtest] step …` lines to the terminal (first 400 steps, then every 1000th). */
      verbose: true,
    });
    // eslint-disable-next-line no-console -- intentional playtest output
    console.log('\n--- RESULT ---\n', JSON.stringify(r, null, 2));
    if (r.playerResourcesEnd?.length) {
      // eslint-disable-next-line no-console -- intentional playtest output
      console.log('\n--- END RESOURCES (per player) ---');
      for (const p of r.playerResourcesEnd) {
        const { coins, wood, ore, votes } = p.resources;
        // eslint-disable-next-line no-console -- intentional playtest output
        console.log(
          `  P${p.playerIndex} ${p.type}: coins=${coins} wood=${wood} ore=${ore} votes=${votes}`
        );
      }
    }
    // eslint-disable-next-line no-console -- intentional playtest output
    console.log('\n--- END SUMMARY ---');
    // eslint-disable-next-line no-console -- intentional playtest output
    console.log(
      `  ok=${r.ok}\n  winner=${r.winner ?? 'null'}\n  turns=${r.turns}\n  steps=${r.steps}\n  aborted=${r.aborted}`
    );
    if (r.playerResourcesEnd?.length) {
      // eslint-disable-next-line no-console -- intentional playtest output
      console.log('  per player (seats, tableau):');
      for (const p of r.playerResourcesEnd) {
        // eslint-disable-next-line no-console -- intentional playtest output
        console.log(`    P${p.playerIndex} ${p.type}: seats=${p.seats}  tableau: ${p.tableau.join(', ')}`);
      }
    }
    expect(r.error ?? '').not.toMatch(/maxSteps/i);
    if (r.aborted) {
      expect(r.error).toMatch(/Resource hoard|hoard/i);
    } else {
      expect(r.ok, r.error).toBe(true);
      expect(r.winner).toBeDefined();
    }
  }, 3_600_000);
});
