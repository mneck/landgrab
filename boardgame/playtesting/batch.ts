/**
 * Batch statistics over headless bot games: the numbers every phase gate in
 * IMPLEMENTATION_SPEC.md asks for.
 */
import type { GameSpec, GameResult } from './engineSim';
import { rotations, runGame } from './engineSim';
import type { PlayerType } from '../src/game/types';

export interface BatchOptions {
  games: number;
  roster: PlayerType[];
  /** Rotate seat order through every rotation of the roster (spec 3 gate). */
  rotate?: boolean;
  /** Factions played by the random-legal-move baseline (spec 6 gate). */
  randomFactions?: PlayerType[];
  seedBase?: number;
  options?: GameSpec['options'];
  onProgress?: (done: number, total: number) => void;
}

export interface FactionStats {
  games: number;
  wins: number;
  winsBySeat: number[];
  gamesBySeat: number[];
  meanSeats: number;
  meanCurrency: number;
  cards: Record<string, { acquiredGames: number; playedGames: number; plays: number; winsWhenPlayed: number }>;
}

export interface BatchSummary {
  label: string;
  players: number;
  roster: PlayerType[];
  rotate: boolean;
  randomFactions: PlayerType[];
  games: number;
  finished: number;
  errors: number;
  aborted: number;
  invalidDecisions: number;
  errorMessages: string[];
  endReasons: Record<string, number>;
  rounds: { median: number; p25: number; p75: number; min: number; max: number; histogram: Record<number, number> };
  lastSeason: { fired: number; medianRound: number | null; rounds: number[] };
  scarsByRound: number[];
  clustersByRound: number[];
  survey: { count: number; meanRevealed: number; min: number; max: number; perGame: number };
  reclamationsPerGame: number;
  interruptsPerGame: number;
  objectionsPerGame: number;
  erosionScarsPerGame: number;
  fogAdjacentBuilds: number;
  mandatesPerGame: number;
  firstMandateRound: number | null;
  fogRevealedPct: number;
  factions: Partial<Record<PlayerType, FactionStats>>;
  elapsedSeconds: number;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

export function summarise(results: GameResult[], opts: BatchOptions, elapsedSeconds: number): BatchSummary {
  const randomFactions = opts.randomFactions ?? [];
  const finished = results.filter((r) => r.ok);
  const rounds = finished.map((r) => r.rounds).sort((a, b) => a - b);
  const histogram: Record<number, number> = {};
  for (const r of rounds) histogram[r] = (histogram[r] ?? 0) + 1;
  const endReasons: Record<string, number> = {};
  for (const r of results) endReasons[r.endReason] = (endReasons[r.endReason] ?? 0) + 1;

  const lsRounds = finished.filter((r) => r.endReason === 'last_season' && r.lastSeasonRound !== null).map((r) => r.lastSeasonRound!).sort((a, b) => a - b);
  const maxLen = Math.max(0, ...finished.map((r) => r.stats.scarsByRound.length));
  const scarsByRound: number[] = [];
  const clustersByRound: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const s = finished.filter((r) => r.stats.scarsByRound.length > i);
    scarsByRound.push(s.reduce((a, r) => a + r.stats.scarsByRound[i], 0) / Math.max(1, s.length));
    clustersByRound.push(s.reduce((a, r) => a + r.stats.clustersByRound[i], 0) / Math.max(1, s.length));
  }
  const reveals = finished.flatMap((r) => r.stats.surveyRevealed);
  const mandateFirst = finished
    .map((r) => Math.min(...r.stats.mandateRounds.flat(), Infinity))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);

  const factions: Partial<Record<PlayerType, FactionStats>> = {};
  for (const r of finished) {
    r.players.forEach((pl, i) => {
      if (pl.random) return;
      const f = (factions[pl.type] ??= {
        games: 0, wins: 0, winsBySeat: [], gamesBySeat: [], meanSeats: 0, meanCurrency: 0, cards: {},
      });
      const won = r.winner === pl.type;
      f.games++;
      if (won) f.wins++;
      f.gamesBySeat[pl.seat] = (f.gamesBySeat[pl.seat] ?? 0) + 1;
      f.winsBySeat[pl.seat] = (f.winsBySeat[pl.seat] ?? 0) + (won ? 1 : 0);
      f.meanSeats += pl.seats;
      f.meanCurrency += pl.currency;
      const acq = r.stats.acquired[i] ?? {};
      const played = r.stats.played[i] ?? {};
      for (const card of new Set([...Object.keys(acq), ...Object.keys(played)])) {
        const u = (f.cards[card] ??= { acquiredGames: 0, playedGames: 0, plays: 0, winsWhenPlayed: 0 });
        if (acq[card]) u.acquiredGames++;
        if (played[card]) {
          u.playedGames++;
          u.plays += played[card];
          if (won) u.winsWhenPlayed++;
        }
      }
    });
  }
  for (const f of Object.values(factions)) {
    f!.meanSeats /= Math.max(1, f!.games);
    f!.meanCurrency /= Math.max(1, f!.games);
  }

  const n = Math.max(1, finished.length);
  const sum = (fn: (r: GameResult) => number) => finished.reduce((a, r) => a + fn(r), 0);
  return {
    label: `${opts.roster.length}p ${opts.roster.join('/')}${opts.rotate ? ' (rotated seats)' : ''}${randomFactions.length ? ` random=${randomFactions.join(',')}` : ''}`,
    players: opts.roster.length,
    roster: opts.roster,
    rotate: !!opts.rotate,
    randomFactions,
    games: results.length,
    finished: finished.length,
    errors: results.filter((r) => r.endReason === 'error').length,
    aborted: results.filter((r) => r.endReason === 'aborted').length,
    invalidDecisions: results.reduce((a, r) => a + r.invalid, 0),
    errorMessages: [...new Set(results.filter((r) => r.error).map((r) => r.error!))].slice(0, 20),
    endReasons,
    rounds: {
      median: quantile(rounds, 0.5),
      p25: quantile(rounds, 0.25),
      p75: quantile(rounds, 0.75),
      min: rounds[0] ?? 0,
      max: rounds[rounds.length - 1] ?? 0,
      histogram,
    },
    lastSeason: { fired: lsRounds.length, medianRound: lsRounds.length ? quantile(lsRounds, 0.5) : null, rounds: lsRounds },
    scarsByRound,
    clustersByRound,
    survey: {
      count: reveals.length,
      meanRevealed: reveals.length ? reveals.reduce((a, b) => a + b, 0) / reveals.length : 0,
      min: reveals.length ? Math.min(...reveals) : 0,
      max: reveals.length ? Math.max(...reveals) : 0,
      perGame: reveals.length / n,
    },
    reclamationsPerGame: sum((r) => r.stats.reclamations) / n,
    interruptsPerGame: sum((r) => r.stats.interrupts) / n,
    objectionsPerGame: sum((r) => r.stats.objections) / n,
    erosionScarsPerGame: sum((r) => r.stats.erosionScars) / n,
    fogAdjacentBuilds: sum((r) => r.stats.fogAdjacentBuilds),
    mandatesPerGame: sum((r) => r.mandatesBought) / n,
    firstMandateRound: mandateFirst.length ? quantile(mandateFirst, 0.5) : null,
    fogRevealedPct: sum((r) => r.fogRevealedPct) / n,
    factions,
    elapsedSeconds,
  };
}

export function runBatch(opts: BatchOptions): BatchSummary {
  const started = Date.now();
  const rosters = opts.rotate ? rotations(opts.roster) : [opts.roster];
  const results: GameResult[] = [];
  const seedBase = opts.seedBase ?? 1;
  for (let g = 0; g < opts.games; g++) {
    const roster = rosters[g % rosters.length];
    const randomSeats = roster.map((f, i) => ((opts.randomFactions ?? []).includes(f) ? i : -1)).filter((i) => i >= 0);
    results.push(runGame({ roster, seed: seedBase + g, randomSeats, options: opts.options }));
    opts.onProgress?.(g + 1, opts.games);
  }
  return summarise(results, opts, (Date.now() - started) / 1000);
}
