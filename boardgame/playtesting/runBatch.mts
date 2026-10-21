/**
 * Bot batch from the command line (IMPLEMENTATION_SPEC.md acceptance gates).
 *
 *   npx tsx playtesting/runBatch.mts 100 4                 # 100 four-player games
 *   npx tsx playtesting/runBatch.mts 300 4 --rotate        # rotated seat order (Phase 3 gate)
 *   npx tsx playtesting/runBatch.mts 200 4 --random Hotelier   # one seat plays random legal moves (Phase 6 gate)
 *   npx tsx playtesting/runBatch.mts 100 3 --erosion elevation
 *   npx tsx playtesting/runBatch.mts 100 2 --json out.json
 *
 * Exits non-zero when any game errors or aborts.
 */
import { writeFileSync } from 'node:fs';
import { runBatch } from './batch';
import { formatSummary } from './report';
import { DEFAULT_ROSTERS } from '../src/game/setup';
import type { PlayerType } from '../src/game/types';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const games = Number(args[0] ?? 100);
const players = Number(args[1] ?? 4) as 2 | 3 | 4;
const roster = (flag('roster')?.split(',') as PlayerType[] | undefined) ?? DEFAULT_ROSTERS[players];
const summary = runBatch({
  games,
  roster,
  rotate: args.includes('--rotate'),
  randomFactions: (flag('random')?.split(',') ?? []) as PlayerType[],
  seedBase: Number(flag('seed') ?? 1),
  options: flag('erosion') === 'elevation' ? { erosionByElevation: true } : undefined,
  onProgress: (done, total) => {
    if (done === total || done % Math.max(1, Math.round(total / 10)) === 0) process.stderr.write(`\r  ${done}/${total}`);
  },
});
process.stderr.write('\n');
console.log(formatSummary(summary));
const out = flag('json');
if (out) writeFileSync(out, JSON.stringify(summary, null, 1));
if (summary.errors || summary.aborted) process.exit(1);
