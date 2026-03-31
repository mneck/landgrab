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
  /**
   * Log each move (throttled after {@link verboseStepLimit}) to stderr so you can see
   * where a run stops (INVALID_MOVE, null AI, maxSteps).
   */
  verbose?: boolean;
  /** Max lines of per-step detail before switching to every-`verboseStride` progress (default 400). */
  verboseStepLimit?: number;
  /** After `verboseStepLimit`, log one line every this many steps (default 1000). */
  verboseStride?: number;
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
function playtestLog(
  verbose: boolean | undefined,
  msg: string,
  ...args: unknown[]
): void {
  if (!verbose) return;
  if (args.length) console.error('[playtest]', msg, ...args);
  else console.error('[playtest]', msg);
}

export async function runBotGame(options: RunBotGameOptions): Promise<BotGameResult> {
  const {
    numPlayers,
    maxSteps = 50_000,
    fastWin,
    verbose,
    verboseStepLimit = 400,
    verboseStride = 1000,
  } = options;
  const v = verbose === true;
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

  playtestLog(
    v,
    `start matchID=${matchID} numPlayers=${numPlayers} fastWin=${Boolean(fastWin)} maxSteps=${maxSteps} game=${fastWin ? 'LandgrabPlaytestGame' : 'LandgrabGame'}`
  );

  let steps = 0;
  let lastStateId = -1;

  try {
    while (steps < maxSteps) {
      const ref = clients[0];
      const state = ref.getState();
      if (!state) {
        playtestLog(v, `STOP: null state at step ${steps}`);
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
        playtestLog(v, `END: ctx.gameover winner=${go.winner} steps=${steps} ctx.turn=${state.ctx.turn}`);
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
        playtestLog(v, `END: G.winner=${g.winner} steps=${steps} ctx.turn=${state.ctx.turn}`);
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
        playtestLog(
          v,
          `STOP: getAIMove returned null at step ${steps} turn=${state.ctx.turn} pid=${pid} pending=${g.pendingAction?.type ?? 'none'} actions=${g.actionsRemainingThisTurn}`
        );
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
        playtestLog(
          v,
          `STOP: unknown move "${aiMove.move}" at step ${steps} pid=${pid} (network stage?)`
        );
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

      const pendingBefore = g.pendingAction?.type ?? null;
      const detail =
        steps < verboseStepLimit ||
        (verboseStride > 0 && steps > 0 && steps % verboseStride === 0);
      if (v && detail) {
        const shortArgs =
          aiMove.args.length > 0
            ? JSON.stringify(aiMove.args).slice(0, 120)
            : '';
        playtestLog(
          v,
          `step ${steps} turn=${state.ctx.turn} pid=${pid} P${g.players[pid]?.type} ${aiMove.move}(${shortArgs}) pending=${pendingBefore} actions=${g.actionsRemainingThisTurn}`
        );
      }

      moveFn(...aiMove.args);
      steps++;

      const after = ref.getState();
      const sid = after?._stateID ?? -1;
      if (sid === lastStateId && aiMove.move !== 'endTurn') {
        playtestLog(
          v,
          `STOP: state did not advance (INVALID_MOVE?) after step ${steps} move=${aiMove.move} args=${JSON.stringify(aiMove.args)} sid=${sid} lastSid=${lastStateId}`
        );
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

    playtestLog(v, `STOP: maxSteps (${maxSteps}) reached steps=${steps} lastTurn=${clients[0].getState()?.ctx.turn ?? '?'}`);
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
    playtestLog(v, `STOP: exception at step ${steps}`, e);
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
  options?: {
    maxSteps?: number;
    fastWin?: boolean;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<BatchSummary> {
  const results: BotGameResult[] = [];
  const errors: string[] = [];
  for (let i = 0; i < games; i++) {
    const r = await runBotGame({
      numPlayers,
      maxSteps: options?.maxSteps,
      fastWin: options?.fastWin,
    });
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
