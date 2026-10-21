/**
 * Faction and card balance report from bot-vs-bot games.
 *
 *   npm run balance                                   # 4 players, 200 games
 *   BALANCE_PLAYERS=3 BALANCE_GAMES=300 npm run balance
 *   BALANCE_ADD=NGOBacking:2,Subsidy:2 npm run balance   # extra copies in the Politics deck
 *   BALANCE_REMOVE=Levy,Protests npm run balance         # drop every copy
 *   BALANCE_OUT=out.json npm run balance                 # also write the raw summary
 *
 * Env:
 *   BALANCE_PLAYERS 2 | 3 | 4 (default 4)
 *   BALANCE_GAMES   games to play (default 200)
 *   BALANCE_ROSTER  comma-separated seat order (default: design roster for the player count)
 *   BALANCE_ADD     Card:count pairs added to the default two-copy deck
 *   BALANCE_REMOVE  cards removed from the deck and opening row
 *   BALANCE_OUT     path for the JSON summary
 *
 * Card numbers are for these bots, which buy the cheapest affordable Politics
 * card rather than the one that suits them; treat them as "cards as the AI
 * plays them", not as a ceiling on what a card can do.
 */

import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { runBatch } from './simulator';
import type { BatchSummary } from './simulator';
import { DEFAULT_POLITICS_POOL, DEFAULT_POLITICS_ROW } from '../src/game/setup';
import type { PlayerType } from '../src/game/types';

const DEFAULT_ROSTERS: Record<2 | 3 | 4, PlayerType[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Wilson score interval, so small samples don't read as certainties. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

const pct = (x: number) => `${(100 * x).toFixed(0)}%`.padStart(4);

function report(summary: BatchSummary, label: string): string {
  const lines = [`\n=== ${label} ===`];
  lines.push(
    `games ${summary.games}  finished ${summary.ok}  hoard ${summary.stopReasons.hoard_abort}  step-limit ${summary.stopReasons.step_limit_abort}  invalid ${summary.stopReasons.invalid_move_abort}  avg turns ${summary.avgTurns.toFixed(1)}`
  );
  lines.push('\nFaction        win%   95% CI');
  for (const [type, f] of Object.entries(summary.factions)) {
    const [lo, hi] = wilson(f!.wins, f!.games);
    lines.push(`${type.padEnd(14)} ${pct(f!.wins / f!.games)}   ${pct(lo)}–${pct(hi)}`);
  }
  for (const [type, f] of Object.entries(summary.factions)) {
    const base = f!.wins / f!.games;
    lines.push(`\n${type} (base win ${pct(base)}) — card: acquired% played% win%-when-played (n)`);
    const rows = Object.entries(f!.cards)
      .map(([card, u]) => ({ card, ...u! }))
      .sort((a, b) => b.playedGames - a.playedGames || b.acquiredGames - a.acquiredGames);
    for (const r of rows) {
      const winWhen = r.playedGames ? pct(r.winsWhenPlayed / r.playedGames) : '   -';
      lines.push(
        `  ${r.card.padEnd(16)} ${pct(r.acquiredGames / f!.games)} ${pct(r.playedGames / f!.games)} ${winWhen} (${r.playedGames})`
      );
    }
  }
  return lines.join('\n');
}

describe('balance report', () => {
  it('runs', async () => {
    const numPlayers = Number(process.env.BALANCE_PLAYERS ?? 4) as 2 | 3 | 4;
    const games = Number(process.env.BALANCE_GAMES ?? 200);
    const roster = (list('BALANCE_ROSTER') as PlayerType[]).length
      ? (list('BALANCE_ROSTER') as PlayerType[])
      : DEFAULT_ROSTERS[numPlayers];

    const removed = new Set(list('BALANCE_REMOVE'));
    const added = list('BALANCE_ADD').flatMap((pair) => {
      const [card, count = '1'] = pair.split(':');
      return Array(Number(count)).fill(card);
    });
    const politicsDeck = [...DEFAULT_POLITICS_POOL, ...DEFAULT_POLITICS_POOL, ...added].filter(
      (c) => !removed.has(c)
    );
    // Removed cards in the opening row are swapped for Graft so the row stays full.
    const politicsRow = DEFAULT_POLITICS_ROW.map((c) => (removed.has(c) ? 'Graft' : c));

    const summary = await runBatch(numPlayers, games, {
      playerTypes: roster,
      setupOverrides: { politicsDeck, politicsRow },
      onProgress: (done, total) => {
        if (done % 25 === 0) process.stdout.write(`  ${done}/${total}`);
      },
    });

    const label = `${numPlayers}p ${roster.join('/')}  add=[${list('BALANCE_ADD').join(' ')}] remove=[${[...removed].join(' ')}]`;
    console.log(report(summary, label));
    if (process.env.BALANCE_OUT) {
      writeFileSync(process.env.BALANCE_OUT, JSON.stringify({ label, ...summary }, null, 2));
    }
  }, 3_600_000);
});
