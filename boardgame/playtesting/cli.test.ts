/**
 * Headless batch runner (via Vitest so Vite resolves boardgame.io the same as the app).
 *
 *   PLAYTEST_GAMES=200 PLAYTEST_PLAYERS=3 npm run playtest
 *   PLAYTEST_GAMES=1 PLAYTEST_PLAYERS=2 npm run playtest   # quick smoke
 *   PLAYTEST_PLAYERS=3 PLAYTEST_PLAYER_TYPES=Industrialist,Hotelier,Chieftain npm run playtest
 *
 * Env:
 *   PLAYTEST_GAMES   (default 100)
 *   PLAYTEST_PLAYERS 2 | 3 | 4 (default 2)
 *   PLAYTEST_MAX_STEPS per game (default 1400; set "Infinity" for no cap)
 *   PLAYTEST_PLAYER_TYPES optional comma-separated roster (length must match PLAYTEST_PLAYERS).
 *     Valid: Hotelier, Industrialist, Bureaucrat, Chieftain
 */

import { describe, it } from 'vitest';
import { runBatch } from './simulator';
import type { PlayerType } from '../src/game/types';

const VALID_PLAYER_TYPES: PlayerType[] = ['Hotelier', 'Industrialist', 'Bureaucrat', 'Chieftain'];

function envPlayerTypes(numPlayers: number): PlayerType[] | undefined {
  const raw = process.env.PLAYTEST_PLAYER_TYPES?.trim();
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length !== numPlayers) {
    throw new Error(
      `PLAYTEST_PLAYER_TYPES must have ${numPlayers} comma-separated types; got ${parts.length}: ${raw}`
    );
  }
  for (const p of parts) {
    if (!VALID_PLAYER_TYPES.includes(p as PlayerType)) {
      throw new Error(
        `PLAYTEST_PLAYER_TYPES: invalid type "${p}". Use: ${VALID_PLAYER_TYPES.join(', ')}`
      );
    }
  }
  return parts as PlayerType[];
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envMaxSteps(): number {
  const v = process.env.PLAYTEST_MAX_STEPS;
  if (v === undefined || v === '') {
    return 1400;
  }
  if (v === 'Infinity' || v === 'unlimited') {
    return Number.POSITIVE_INFINITY;
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 1400;
}

describe('playtest CLI', () => {
  it('runs batch (configure via env)', async () => {
    const games = envInt('PLAYTEST_GAMES', 100);
    const maxSteps = envMaxSteps();
    const p = envInt('PLAYTEST_PLAYERS', 2);
    const numPlayers = (p === 3 ? 3 : p === 4 ? 4 : 2) as 2 | 3 | 4;
    const playerTypes = envPlayerTypes(numPlayers);

    const started = Date.now();
    const summary = await runBatch(numPlayers, games, {
      maxSteps,
      playerTypes,
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
