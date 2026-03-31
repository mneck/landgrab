/**
 * Headless batch runner (via Vitest so Vite resolves boardgame.io the same as the app).
 *
 *   PLAYTEST_GAMES=200 PLAYTEST_PLAYERS=3 npm run playtest
 *   PLAYTEST_GAMES=1 PLAYTEST_PLAYERS=2 npm run playtest   # quick smoke
 *
 * Env:
 *   PLAYTEST_GAMES   (default 100)
 *   PLAYTEST_PLAYERS 2 | 3 | 4 (default 2)
 *   PLAYTEST_MAX_STEPS per game (omit or "Infinity" for no cap; use a number for batch safety)
 */

import { describe, it } from 'vitest';
import { runBatch } from './simulator';

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envMaxSteps(): number {
  const v = process.env.PLAYTEST_MAX_STEPS;
  if (v === undefined || v === '' || v === 'Infinity' || v === 'unlimited') {
    return Number.POSITIVE_INFINITY;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

describe('playtest CLI', () => {
  it('runs batch (configure via env)', async () => {
    const games = envInt('PLAYTEST_GAMES', 100);
    const maxSteps = envMaxSteps();
    const p = envInt('PLAYTEST_PLAYERS', 2);
    const numPlayers = (p === 3 ? 3 : p === 4 ? 4 : 2) as 2 | 3 | 4;

    const started = Date.now();
    const summary = await runBatch(numPlayers, games, {
      maxSteps,
      onProgress(done, total) {
        if (done === total || done % Math.max(1, Math.ceil(total / 20)) === 0) {
          process.stderr.write(`\r  Progress: ${done}/${total}`);
        }
      },
    });
    process.stderr.write('\n');

    const elapsed = (Date.now() - started) / 1000;
    // eslint-disable-next-line no-console -- CLI output
    console.log(JSON.stringify({ ...summary, elapsedSeconds: elapsed }, null, 2));

    if (summary.failed > 0) {
      throw new Error(
        `Playtest failures: ${summary.failed} (ok=${summary.ok}, aborted=${summary.aborted}). See errors in JSON above.`,
      );
    }
  }, 3_600_000);
});
