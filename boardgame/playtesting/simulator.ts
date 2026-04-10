/**
 * Headless bot-vs-bot games using boardgame.io Local transport + existing AI (getAIMove).
 */

import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { LandgrabGame } from '../src/game/Game';
import { LandgrabPlaytestGame, landgrabGameForRoster, landgrabPlaytestGameForRoster } from './playtestGame';
import type { LandgrabState, PlayerResources, PlayerType, CardType } from '../src/game/types';
import { getAIMove } from '../src/ai/aiStrategy';

/** Phase 1 default cap: keep batches bounded and reproducible. */
export const DEFAULT_PLAYTEST_MAX_STEPS = 1400;

/** Abort when any player has **more than** this many coins, wood, ore, or votes (degenerate hoarding). */
export const RESOURCE_HOARD_CAP = 100;

const MOVE_HISTORY_LEN = 40;

function anyPlayerOverResourceCap(G: LandgrabState, cap: number): boolean {
  for (const p of G.players) {
    const r = p.resources;
    if (r.coins > cap || r.wood > cap || r.ore > cap || r.votes > cap) return true;
  }
  return false;
}

/** Snapshot of each player’s resources at end of a playthrough (for playtest reports). */
export interface PlayerResourceSnapshot {
  playerIndex: number;
  type: PlayerType;
  resources: PlayerResources;
  seats: number;
  tableau: CardType[];
}

export function snapshotPlayerResources(G: LandgrabState): PlayerResourceSnapshot[] {
  return G.players.map((p, playerIndex) => ({
    playerIndex,
    type: p.type,
    resources: { ...p.resources },
    seats: p.seats,
    tableau: p.tableau.map((c) => c.cardType),
  }));
}

function formatLoopReview(params: {
  steps: number;
  maxSteps: number;
  G: LandgrabState;
  ctxTurn: number;
  currentPlayer: string;
  activePlayers: Record<string, string> | null | undefined;
  recentMoves: string[];
  /** Default: max-steps abort */
  headline?: string;
}): string {
  const { steps, maxSteps, G, ctxTurn, currentPlayer, activePlayers, recentMoves } = params;
  const limit =
    Number.isFinite(maxSteps) && maxSteps !== Number.POSITIVE_INFINITY
      ? `${maxSteps}`
      : 'no step limit';
  const headline =
    params.headline ??
    `[playtest] LOOP REVIEW: aborted after ${steps} actions (${limit}; likely stuck loop)`;
  const lines: string[] = [
    headline,
    `[playtest] ctx.turn=${ctxTurn} currentPlayer=${currentPlayer} activePlayers=${activePlayers ? JSON.stringify(activePlayers) : 'null'}`,
    `[playtest] pendingAction=${G.pendingAction ? JSON.stringify(G.pendingAction) : 'null'} actionsRemainingThisTurn=${G.actionsRemainingThisTurn}`,
  ];
  for (let i = 0; i < G.players.length; i++) {
    const p = G.players[i];
    lines.push(
      `[playtest] P${i} ${p.type} coins=${p.resources.coins} wood=${p.resources.wood} ore=${p.resources.ore} votes=${p.resources.votes} tableau=${p.tableau.length}`
    );
  }
  lines.push(`[playtest] Last ${recentMoves.length} moves (oldest → newest):`);
  for (const line of recentMoves) {
    lines.push(`[playtest]   ${line}`);
  }
  return lines.join('\n');
}

export interface RunBotGameOptions {
  numPlayers: 2 | 3 | 4;
  /**
   * Optional hard cap on move attempts (default: none — {@link DEFAULT_PLAYTEST_MAX_STEPS}).
   * Prefer {@link RESOURCE_HOARD_CAP} to catch degenerate games.
   */
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
  /**
   * Fixed seat order (P0, P1, …). Length must equal {@link numPlayers}.
   * Default uses the design roster for that player count.
   */
  playerTypes?: PlayerType[];
}

export interface BotGameResult {
  ok: boolean;
  winner: PlayerType | null;
  stopReason: 'winner' | 'hoard_abort' | 'step_limit_abort' | 'invalid_move_abort' | 'other_abort';
  /** ctx.turn at end */
  turns: number;
  /** Total move attempts (steps). */
  steps: number;
  /** Set when stopped without a winner (maxSteps, resource hoard, etc.). */
  aborted: boolean;
  error?: string;
  /** When aborted: snapshot + recent moves. */
  loopReview?: string;
  /** Per-player resources when the run ended (omitted if state was unavailable). */
  playerResourcesEnd?: PlayerResourceSnapshot[];
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

/** Who is allowed to make the next move (current turn player, active network bidder, or starting-bid submitter). */
function controllingPlayerIndex(
  ctx: {
    currentPlayer: string;
    activePlayers?: null | Record<string, string>;
  },
  G: LandgrabState
): number {
  const ap = ctx.activePlayers;
  if (ap) {
    const net = Object.entries(ap).find(([, stage]) => stage === 'networkBid');
    if (net) return parseInt(net[0], 10);
    const starting = Object.entries(ap).find(([, stage]) => stage === 'startingBid');
    if (starting && G.startingBidPhase && !G.startingBidPhase.resolved) {
      const pending = Object.keys(ap)
        .map((k) => parseInt(k, 10))
        .filter(
          (i) =>
            !Number.isNaN(i) &&
            ap[String(i)] === 'startingBid' &&
            G.startingBidPhase!.amounts[i] === null
        )
        .sort((a, b) => a - b);
      if (pending.length > 0) return pending[0];
    }
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
  if (args.length) console.log('[playtest]', msg, ...args);
  else console.log('[playtest]', msg);
}

export async function runBotGame(options: RunBotGameOptions): Promise<BotGameResult> {
  const {
    numPlayers,
    maxSteps = DEFAULT_PLAYTEST_MAX_STEPS,
    fastWin,
    verbose,
    verboseStepLimit = 400,
    verboseStride = 1000,
    playerTypes,
    label,
  } = options;
  const v = verbose === true;
  if (playerTypes && playerTypes.length !== numPlayers) {
    throw new Error(
      `runBotGame: playerTypes.length (${playerTypes.length}) must equal numPlayers (${numPlayers})`
    );
  }
  const game = playerTypes
    ? fastWin
      ? landgrabPlaytestGameForRoster(playerTypes)
      : landgrabGameForRoster(playerTypes)
    : fastWin
      ? LandgrabPlaytestGame
      : LandgrabGame;
  const mp = Local();
  const matchID = `playtest-${++matchSeq}-${Date.now()}`;
  const clients: BGClient[] = [];
  for (let i = 0; i < numPlayers; i++) {
    clients.push(
      Client({
        game,
        multiplayer: mp,
        numPlayers,
        playerID: String(i),
        matchID,
      }),
    );
  }
  clients.forEach((c) => c.start());

  const rosterLabel = playerTypes?.join('-') ?? 'default';
  playtestLog(
    v,
    `start matchID=${matchID} numPlayers=${numPlayers} roster=${rosterLabel} label=${label ?? ''} fastWin=${Boolean(fastWin)} maxSteps=${Number.isFinite(maxSteps) ? maxSteps : 'Infinity'} hoardCap=${RESOURCE_HOARD_CAP} game=${fastWin ? 'LandgrabPlaytestGame' : 'LandgrabGame'}`
  );

  let steps = 0;
  let lastStateId = -1;
  const recentMoves: string[] = [];

  try {
    while (steps < maxSteps) {
      const ref = clients[0];
      const state = ref.getState();
      if (!state) {
        playtestLog(v, `STOP: null state at step ${steps}`);
        return {
          ok: false,
          winner: null,
          stopReason: 'other_abort',
          turns: 0,
          steps,
          aborted: false,
          error: 'Null state',
        };
      }

      const go = (state.ctx as { gameover?: { winner: PlayerType } }).gameover;
      if (go?.winner) {
        playtestLog(v, `END: ctx.gameover winner=${go.winner} steps=${steps} ctx.turn=${state.ctx.turn}`);
        const gEnd = state.G as LandgrabState;
        clients.forEach((c) => c.stop());
        return {
          ok: true,
          winner: go.winner,
          stopReason: 'winner',
          turns: state.ctx.turn,
          steps,
          aborted: false,
          playerResourcesEnd: snapshotPlayerResources(gEnd),
        };
      }

      const g = state.G as LandgrabState;
      if (g.winner) {
        playtestLog(v, `END: G.winner=${g.winner} steps=${steps} ctx.turn=${state.ctx.turn}`);
        clients.forEach((c) => c.stop());
        return {
          ok: true,
          winner: g.winner,
          stopReason: 'winner',
          turns: state.ctx.turn,
          steps,
          aborted: false,
          playerResourcesEnd: snapshotPlayerResources(g),
        };
      }

      if (anyPlayerOverResourceCap(g, RESOURCE_HOARD_CAP)) {
        playtestLog(
          v,
          `STOP: resource hoard (>${RESOURCE_HOARD_CAP} of one type) steps=${steps} turn=${state.ctx.turn}`
        );
        const loopReview = formatLoopReview({
          steps,
          maxSteps,
          G: g,
          ctxTurn: state.ctx.turn,
          currentPlayer: (state.ctx as { currentPlayer: string }).currentPlayer,
          activePlayers: (state.ctx as { activePlayers?: null | Record<string, string> }).activePlayers,
          recentMoves,
          headline: `[playtest] HOARD REVIEW: aborted — a player has more than ${RESOURCE_HOARD_CAP} of one resource (steps=${steps})`,
        });
        console.log(loopReview);
        clients.forEach((c) => c.stop());
        return {
          ok: false,
          winner: null,
          stopReason: 'hoard_abort',
          turns: state.ctx.turn,
          steps,
          aborted: true,
          error: `Resource hoard: more than ${RESOURCE_HOARD_CAP} of one resource type`,
          loopReview,
          playerResourcesEnd: snapshotPlayerResources(g),
        };
      }

      const ctxFull = getCtx(ref);
      const pid = controllingPlayerIndex(ctxFull, g);
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
          stopReason: 'other_abort',
          turns: state.ctx.turn,
          steps,
          aborted: false,
          error: 'getAIMove returned null',
          playerResourcesEnd: snapshotPlayerResources(g),
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
          stopReason: 'invalid_move_abort',
          turns: state.ctx.turn,
          steps,
          aborted: false,
          error: `Unknown move: ${aiMove.move}`,
          playerResourcesEnd: snapshotPlayerResources(g),
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

      {
        const gAfter = getG(ref);
        const entry = `step ${steps - 1}→${steps} ${aiMove.move}(${JSON.stringify(aiMove.args).slice(0, 100)}) pending→${gAfter.pendingAction?.type ?? 'null'} actions=${gAfter.actionsRemainingThisTurn}`;
        recentMoves.push(entry);
        if (recentMoves.length > MOVE_HISTORY_LEN) recentMoves.shift();
      }

      const after = ref.getState();
      const sid = after?._stateID ?? -1;
      if (sid === lastStateId && aiMove.move !== 'endTurn') {
        playtestLog(
          v,
          `STOP: state did not advance (INVALID_MOVE?) after step ${steps} move=${aiMove.move} args=${JSON.stringify(aiMove.args)} sid=${sid} lastSid=${lastStateId}`
        );
        // Possible INVALID_MOVE no-op; still allow endTurn idempotency quirks
        clients.forEach((c) => c.stop());
        const gStuck = after?.G as LandgrabState | undefined;
        return {
          ok: false,
          winner: null,
          stopReason: 'invalid_move_abort',
          turns: after?.ctx.turn ?? state.ctx.turn,
          steps,
          aborted: false,
          error: `State did not advance after ${aiMove.move} (possible INVALID_MOVE)`,
          playerResourcesEnd: gStuck ? snapshotPlayerResources(gStuck) : undefined,
        };
      }
      lastStateId = sid;
    }

    const endState = clients[0].getState();
    const endG = endState ? (endState.G as LandgrabState) : null;
    const endCtx = endState?.ctx as
      | { turn: number; currentPlayer: string; activePlayers?: null | Record<string, string> }
      | undefined;
    playtestLog(
      v,
      `STOP: maxSteps (${Number.isFinite(maxSteps) ? maxSteps : 'Infinity'}) reached steps=${steps} lastTurn=${endCtx?.turn ?? '?'}`
    );
    const loopReview =
      endG && endCtx
        ? formatLoopReview({
            steps,
            maxSteps,
            G: endG,
            ctxTurn: endCtx.turn,
            currentPlayer: endCtx.currentPlayer,
            activePlayers: endCtx.activePlayers ?? null,
            recentMoves,
          })
        : `[playtest] LOOP REVIEW: state unavailable (steps=${steps})`;
    console.log(loopReview);
    clients.forEach((c) => c.stop());
    return {
      ok: false,
      winner: null,
      stopReason: 'step_limit_abort',
      turns: endCtx?.turn ?? 0,
      steps,
      aborted: true,
      error:
        Number.isFinite(maxSteps) && maxSteps !== Number.POSITIVE_INFINITY
          ? `maxSteps (${maxSteps}) exceeded`
          : 'maxSteps exceeded',
      loopReview,
      playerResourcesEnd: endG ? snapshotPlayerResources(endG) : undefined,
    };
  } catch (e) {
    console.log('[playtest] STOP: exception at step', steps, e);
    let playerResourcesEnd: PlayerResourceSnapshot[] | undefined;
    try {
      const s = clients[0]?.getState();
      if (s?.G) playerResourcesEnd = snapshotPlayerResources(s.G as LandgrabState);
    } catch {
      /* ignore */
    }
    clients.forEach((c) => c.stop());
    return {
      ok: false,
      winner: null,
      stopReason: 'other_abort',
      turns: 0,
      steps,
      aborted: false,
      error: e instanceof Error ? e.message : String(e),
      playerResourcesEnd,
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
  stopReasons: {
    winner: number;
    hoard_abort: number;
    step_limit_abort: number;
    invalid_move_abort: number;
  };
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
    playerTypes?: PlayerType[];
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
      playerTypes: options?.playerTypes,
    });
    results.push(r);
    if (!r.ok && r.error) errors.push(r.error);
    options?.onProgress?.(i + 1, games);
  }

  const wins: Partial<Record<PlayerType, number>> = {};
  let ok = 0;
  let failed = 0;
  let aborted = 0;
  const stopReasons = {
    winner: 0,
    hoard_abort: 0,
    step_limit_abort: 0,
    invalid_move_abort: 0,
  };
  let stepsSum = 0;
  let turnsSum = 0;

  for (const r of results) {
    if (r.stopReason === 'winner' && r.winner) {
      ok++;
      stopReasons.winner++;
      wins[r.winner] = (wins[r.winner] ?? 0) + 1;
    } else if (r.stopReason === 'hoard_abort') {
      stopReasons.hoard_abort++;
      aborted++;
      failed++;
    } else if (r.stopReason === 'step_limit_abort') {
      stopReasons.step_limit_abort++;
      aborted++;
      failed++;
    } else if (r.stopReason === 'invalid_move_abort') {
      stopReasons.invalid_move_abort++;
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
    stopReasons,
    avgSteps: stepsSum / n,
    avgTurns: turnsSum / n,
    errors: [...new Set(errors)].slice(0, 50),
  };
}
