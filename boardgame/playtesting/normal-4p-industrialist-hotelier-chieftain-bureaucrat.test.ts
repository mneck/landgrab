/**
 * Full rules, 4 bots: Industrialist → Hotelier → Chieftain → Bureaucrat (P0..P3).
 *
 *   npm run playtest:normal-4p-ihcb
 */

import { describe, it, expect } from 'vitest';
import { runBotGame } from './simulator';
import type { PlayerType } from '../src/game/types';

const ROSTER: PlayerType[] = ['Industrialist', 'Hotelier', 'Chieftain', 'Bureaucrat'];

describe('playthrough 4p Industrialist-Hotelier-Chieftain-Bureaucrat', () => {
  it('runs LandgrabGame to win or hoard cap', async () => {
    const r = await runBotGame({
      numPlayers: 4,
      playerTypes: ROSTER,
      fastWin: false,
      verbose: true,
      label: '4p-IHCB',
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
