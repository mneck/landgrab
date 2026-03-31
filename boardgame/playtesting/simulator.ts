/**
 * Headless bot-vs-bot games using boardgame.io Local transport + existing AI (getAIMove).
 */

import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { LandgrabGame } from '../src/game/Game';
import { LandgrabPlaytestGame } from './playtestGame';
import type { LandgrabState } from '../src/game/types';
import type { PlayerType } from '../src/game/types';
import { getAIMove } from '../src/ai/aiStrategy';

export interface RunBotGameOptions {
  numPlayers: 2 | 3 | 4;
  /** Abort if no winner after this many move attempts (safety). */
  maxSteps?: number;
  /** Optional label for logging. */
  label?: string;
  /**
   * When true, one Mandate completes the game (see {@link LandgrabPlaytestGame}).
   * Default false uses normal 2-seat win — for batch balance runs.
   */
  fastWin?: boolean;
}

export interface BotGameResult {
  ok: boolean;
  winner: PlayerType | null;
  /** ctx.turn at end */
  turns: number;
  /** Total move attempts (steps). */
  steps: number;
  /** Set when maxSteps hit without gameover.winner */
  aborted: boolean;
  error?: string;
}

type BGClient = ReturnType<typeof Client>;

function getG(c: BGClient): LandgrabState {
  const s = c.getState();
  if (!s) throw new Error('No state');
  return s.G as LandgrabState;
}

function getCtx(c: BGClient) {
  const s = c.getState();
  if (!s) throw new Error('No state');
  return s.ctx as {
    currentPlayer: string;
    turn: number;
    numPlayers: number;
    activePlayers?: null | Record<string, string>;
    gameover?: { winner: PlayerType };
  };
}

/** Who is allowed to make the next move (current turn player, or active network bidder). */
function controllingPlayerIndex(ctx: {
  currentPlayer: string;
  activePlayers?: null | Record<string, string>;
}): number {
  const ap = ctx.activePlayers;
  if (ap) {
    const net = Object.entries(ap).find(([, stage]) => stage === 'networkBid');
    if (net) return parseInt(net[0], 10);
  }
  return parseInt(ctx.currentPlayer, 10);
}

let matchSeq = 0;

/**
 * Run one full game: all seats use the same getAIMove strategy.
 */
export async function runBotGame(options: RunBotGameOptions): Promise<BotGameResult> {
  const { numPlayers, maxSteps = 50_000, fastWin } = options;
  const game = fastWin ? LandgrabPlaytestGame : LandgrabGame;
  const mp = Local();
  const matchID = `playtest-${++matchSeq}-${Date.now()}`;
  const clients: BGClient[] = [];
  for (let i = 0; i < numPlayers; i++) {
    clients.push(
      Client({
        game,
        multiplayer: mp,
        playerID: String(i),
        matchID,
      }),
    );
  }
  clients.forEach((c) => c.start());

  let steps = 0;
  let lastStateId = -1;

  try {
    while (steps < maxSteps) {
      const ref = clients[0];
      const state = ref.getState();
      if (!state) {
        return {
          ok: false,
          winner: null,
          turns: 0,
          steps,
          aborted: false,
          error: 'Null state',
        };
      }

      const go = (state.ctx as { gameover?: { winner: PlayerType } }).gameover;
      if (go?.winner) {
        clients.forEach((c) => c.stop());
        return {
          ok: true,
          winner: go.winner,
          turns: state.ctx.turn,
          steps,
          aborted: false,
        };
      }

      const g = state.G as LandgrabState;
      if (g.winner) {
        clients.forEach((c) => c.stop());
        return {
          ok: true,
          winner: g.winner,
          turns: state.ctx.turn,
          steps,
          aborted: false,
        };
      }

      const ctxFull = getCtx(ref);
      const pid = controllingPlayerIndex(ctxFull);
      const aiMove = getAIMove(g, pid);
      if (!aiMove) {
        clients.forEach((c) => c.stop());
        return {
          ok: false,
          winner: null,
          turns: state.ctx.turn,
          steps,
          aborted: false,
          error: 'getAIMove returned null',
        };
      }

      const mover = clients[pid];
      const moveFn = (mover.moves as Record<string, (...a: unknown[]) => unknown>)[aiMove.move];
      if (typeof moveFn !== 'function') {
        clients.forEach((c) => c.stop());
        return {
          ok: false,
          winner: null,
          turns: state.ctx.turn,
          steps,
          aborted: false,
          error: `Unknown move: ${aiMove.move}`,
        };
      }

      moveFn(...aiMove.args);
      steps++;

      const after = ref.getState();
      const sid = after?._stateID ?? -1;
      if (sid === lastStateId && aiMove.move !== 'endTurn') {
        // Possible INVALID_MOVE no-op; still allow endTurn idempotency quirks
        clients.forEach((c) => c.stop());
        return {
          ok: false,
          winner: null,
          turns: after?.ctx.turn ?? state.ctx.turn,
          steps,
          aborted: false,
          error: `State did not advance after ${aiMove.move} (possible INVALID_MOVE)`,
        };
      }
      lastStateId = sid;
    }

    clients.forEach((c) => c.stop());
    return {
      ok: false,
      winner: null,
      turns: clients[0].getState()?.ctx.turn ?? 0,
      steps,
      aborted: true,
      error: `maxSteps (${maxSteps}) exceeded`,
    };
  } catch (e) {
    clients.forEach((c) => c.stop());
    return {
      ok: false,
      winner: null,
      turns: 0,
      steps,
      aborted: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface BatchSummary {
  games: number;
  numPlayers: 2 | 3 | 4;
  wins: Partial<Record<PlayerType, number>>;
  ok: number;
  failed: number;
  aborted: number;
  avgSteps: number;
  avgTurns: number;
  errors: string[];
}

export async function runBatch(
  numPlayers: 2 | 3 | 4,
  games: number,
  options?: { maxSteps?: number; onProgress?: (done: number, total: number) => void }
): Promise<BatchSummary> {
  const results: BotGameResult[] = [];
  const errors: string[] = [];
  for (let i = 0; i < games; i++) {
    const r = await runBotGame({ numPlayers, maxSteps: options?.maxSteps });
    results.push(r);
    if (!r.ok && r.error) errors.push(r.error);
    options?.onProgress?.(i + 1, games);
  }

  const wins: Partial<Record<PlayerType, number>> = {};
  let ok = 0;
  let failed = 0;
  let aborted = 0;
  let stepsSum = 0;
  let turnsSum = 0;

  for (const r of results) {
    if (r.ok && r.winner) {
      ok++;
      wins[r.winner] = (wins[r.winner] ?? 0) + 1;
    } else if (r.aborted) {
      aborted++;
      failed++;
    } else {
      failed++;
    }
    stepsSum += r.steps;
    turnsSum += r.turns;
  }

  const n = results.length || 1;

  return {
    games,
    numPlayers,
    wins,
    ok,
    failed,
    aborted,
    avgSteps: stepsSum / n,
    avgTurns: turnsSum / n,
    errors: [...new Set(errors)].slice(0, 50),
  };
}
