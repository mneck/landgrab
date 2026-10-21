/**
 * Headless bot games driven straight through the engine (no boardgame.io
 * transport), so batches of hundreds of games run in minutes. The
 * boardgame.io wiring has its own smoke test (`bgio.test.ts`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAIMove } from '../src/ai';
import { BALANCE } from '../src/game/balance';
import { standing } from '../src/game/board';
import { winCurrency } from '../src/game/economy';
import { applyAction, controller, legalActions, respond } from '../src/game/engine';
import { getMap, registerMap, registeredMapIds } from '../src/game/maps';
import type { MapFile } from '../src/game/maps';
import { legalResponses } from '../src/game/reactions';
import { createInitialState } from '../src/game/setup';
import type { SetupOptions } from '../src/game/setup';
import type { EndReason, GameOptions, GameStats, LandgrabState, PlayerType } from '../src/game/types';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MAP_DIR = join(HERE, '..', 'public', 'maps');

let loaded = false;
export function loadMaps(dir = MAP_DIR): string[] {
  if (!loaded) {
    for (const f of readdirSync(dir)) {
      if (!/^map_\d+\.json$/.test(f)) continue;
      const map = JSON.parse(readFileSync(join(dir, f), 'utf8')) as MapFile;
      map.id = map.id ?? f.replace(/\.json$/, '');
      registerMap(map);
    }
    loaded = true;
  }
  return registeredMapIds();
}

export interface GameSpec {
  roster: PlayerType[];
  seed: number;
  mapId?: string;
  /** Seats (player indexes) driven by the random-legal-move baseline. */
  randomSeats?: number[];
  options?: Partial<GameOptions>;
  setup?: Omit<SetupOptions, 'seed' | 'options'>;
  maxDecisions?: number;
  /** Return the final state (for debugging and reports). */
  keepState?: boolean;
  /** Called after every applied decision with the full log so far. */
  onLog?: (line: string) => void;
}

export interface PlayerResult {
  type: PlayerType;
  seat: number;
  seats: number;
  currency: number;
  resources: LandgrabState['players'][number]['resources'];
  random: boolean;
}

export interface GameResult {
  ok: boolean;
  winner: PlayerType | null;
  endReason: EndReason | 'aborted' | 'error';
  rounds: number;
  decisions: number;
  invalid: number;
  mapId: string;
  seed: number;
  roster: PlayerType[];
  players: PlayerResult[];
  stats: GameStats;
  lastSeasonRound: number | null;
  finalScars: number;
  finalStanding: number;
  fogRevealedPct: number;
  mandatesBought: number;
  error?: string;
  final?: LandgrabState;
}

export function runGame(spec: GameSpec): GameResult {
  const ids = loadMaps();
  const mapId = spec.mapId ?? ids[Math.abs(spec.seed) % ids.length];
  const map = getMap(mapId)!;
  const G = createInitialState(map, spec.roster, { ...spec.setup, seed: spec.seed, options: spec.options });
  const randomSeats = new Set(spec.randomSeats ?? []);
  const maxDecisions = spec.maxDecisions ?? 6000;

  let decisions = 0;
  let invalid = 0;
  let error: string | undefined;
  try {
    while (!G.winner && decisions < maxDecisions) {
      const p = controller(G);
      const d = getAIMove(G, p, { random: randomSeats.has(p), seed: spec.seed });
      decisions++;
      if (!d) throw new Error(`no decision for player ${p}`);
      let err: string | null;
      if (d.type === 'respond') err = respond(G, p, d.response);
      else err = applyAction(G, p, d.action);
      if (err) {
        // A bot decided on its own view; the real board can disagree (e.g. a Holding on a fogged lake).
        invalid++;
        if (G.reaction) respond(G, p, legalResponses(G, p)[0]);
        else {
          const fallback = legalActions(G, p).find((a) => a.kind === 'endTurn')!;
          applyAction(G, p, fallback);
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const players: PlayerResult[] = G.players.map((pl, i) => ({
    type: pl.type,
    seat: G.order.indexOf(i),
    seats: pl.seats,
    currency: winCurrency(G, i),
    resources: { ...pl.resources },
    random: randomSeats.has(i),
  }));
  const aborted = !G.winner && !error;
  return {
    ok: !!G.winner && !error,
    winner: G.winner ?? null,
    endReason: error ? 'error' : aborted ? 'aborted' : G.endReason!,
    rounds: G.turn.round,
    decisions,
    invalid,
    mapId,
    seed: spec.seed,
    roster: spec.roster,
    players,
    stats: G.stats,
    lastSeasonRound: G.lastSeasonEndsAfterRound ?? null,
    finalScars: G.cells.filter((c) => c.terrain === 'Scar').length,
    finalStanding: G.players.some((p) => p.type === 'Chieftain') ? standing(G) : 0,
    fogRevealedPct: G.totalFog ? G.fogRevealed / G.totalFog : 0,
    mandatesBought: G.players.reduce((s, p) => s + p.seats, 0),
    error,
    final: spec.keepState ? G : undefined,
  };
}

/** Every rotation of a roster, so each faction sits in each seat equally often. */
export function rotations(roster: PlayerType[]): PlayerType[][] {
  return roster.map((_, k) => [...roster.slice(k), ...roster.slice(0, k)]);
}

export { BALANCE };
