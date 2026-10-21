/**
 * boardgame.io wrapper around the engine.
 *
 * Every player is active all game (Stage.NULL) so negotiation can happen out
 * of turn; the engine decides whose action is legal. Reaction windows
 * (interrupt, objection, waive) put the reactor in the `react` stage until
 * they answer, the same pattern the v2 `networkBid` stage used.
 */
import type { Ctx, Game } from 'boardgame.io';

// boardgame.io/core's two constants, inlined: Node 26 cannot resolve that
// legacy subpath when the server runs under tsx (Vite and Vitest can).
const INVALID_MOVE = 'INVALID_MOVE' as const;
const Stage = { NULL: null as unknown as string };
import { applyAction, respond as engineRespond } from './engine';
import { getMap, registeredMapIds } from './maps';
import { answerProposal, dropFavor, propose, show, tell, withdrawProposal } from './negotiation';
import { DEFAULT_ROSTERS, createInitialState } from './setup';
import type { Action, CellId, LandgrabState, PlayerType, Resources } from './types';
import { viewFor } from './view';

export interface LandgrabSetupData {
  mapId?: string;
  roster?: PlayerType[];
  seed?: number;
  seatsToWin?: number;
}

type Events = {
  endTurn: (arg?: { next: string }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setActivePlayers: (arg: any) => void;
};

interface MoveArgs {
  G: LandgrabState;
  ctx: Ctx;
  playerID: string;
  events: Events;
}

function pid(playerID: string | undefined | null): number {
  const n = Number(playerID);
  return Number.isInteger(n) ? n : -1;
}

/** Keeps boardgame.io's turn and stages in step with the engine. */
function sync(G: LandgrabState, ctx: Ctx, events: Events): void {
  if (G.winner) return;
  if (String(G.turn.player) !== ctx.currentPlayer) {
    events.endTurn({ next: String(G.turn.player) });
    return;
  }
  if (G.reaction) {
    events.setActivePlayers({ all: Stage.NULL, value: { [String(G.reaction.reactor)]: 'react' } });
  } else if (ctx.activePlayers && Object.values(ctx.activePlayers).includes('react')) {
    events.setActivePlayers({ all: Stage.NULL });
  }
}

const negotiationMoves = {
  propose: {
    move: ({ G, playerID }: MoveArgs, to: number, give: Partial<Resources>, want: Partial<Resources>, note?: string) =>
      propose(G, pid(playerID), to, give, want, note) ? INVALID_MOVE : undefined,
    client: false,
  },
  answerProposal: {
    move: ({ G, playerID }: MoveArgs, id: string, accept: boolean) =>
      answerProposal(G, pid(playerID), id, accept) ? INVALID_MOVE : undefined,
    client: false,
  },
  withdrawProposal: {
    move: ({ G, playerID }: MoveArgs, id: string) => (withdrawProposal(G, pid(playerID), id) ? INVALID_MOVE : undefined),
    client: false,
  },
  tell: {
    move: ({ G, playerID }: MoveArgs, to: number | null, text: string) => (tell(G, pid(playerID), to, text) ? INVALID_MOVE : undefined),
    client: false,
  },
  show: {
    move: ({ G, playerID }: MoveArgs, to: number, cell: CellId) => (show(G, pid(playerID), to, cell) ? INVALID_MOVE : undefined),
    client: false,
  },
  dropFavor: {
    move: ({ G, playerID }: MoveArgs, id: string) => (dropFavor(G, pid(playerID), id) ? INVALID_MOVE : undefined),
    client: false,
  },
};

const respondMove = {
  move: ({ G, ctx, playerID, events }: MoveArgs, response: string) => {
    if (engineRespond(G, pid(playerID), response)) return INVALID_MOVE;
    sync(G, ctx, events);
  },
  client: false,
};

export const moves = {
  act: {
    move: ({ G, ctx, playerID, events }: MoveArgs, action: Action) => {
      if (!action || typeof action !== 'object') return INVALID_MOVE;
      if (applyAction(G, pid(playerID), action)) return INVALID_MOVE;
      sync(G, ctx, events);
    },
    client: false,
  },
  ...negotiationMoves,
};

function pickMapId(setupData: LandgrabSetupData | undefined, seed: number): string {
  if (setupData?.mapId) return setupData.mapId;
  const ids = registeredMapIds();
  if (!ids.length) throw new Error('No maps registered: call registerMap() before creating a match');
  return ids[Math.abs(seed) % ids.length];
}

export const LandgrabGame: Game<LandgrabState, Record<string, unknown>, LandgrabSetupData> = {
  name: 'landgrab',
  minPlayers: 2,
  maxPlayers: 4,

  setup: ({ ctx }, setupData) => {
    const seed = setupData?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const mapId = pickMapId(setupData, seed);
    const map = getMap(mapId);
    if (!map) throw new Error(`Map ${mapId} is not registered`);
    const roster = setupData?.roster ?? DEFAULT_ROSTERS[ctx.numPlayers as 2 | 3 | 4];
    return createInitialState(map, roster, { seed, seatsToWin: setupData?.seatsToWin });
  },

  validateSetupData: (setupData, numPlayers) => {
    if (setupData?.roster && setupData.roster.length !== numPlayers) return 'roster length must match numPlayers';
    if (setupData?.mapId && !getMap(setupData.mapId)) return `unknown map ${setupData.mapId}`;
    return undefined;
  },

  moves,

  turn: {
    order: {
      first: ({ G }) => G.turn.player,
      next: ({ G }) => G.turn.player,
    },
    activePlayers: { all: Stage.NULL },
    stages: {
      react: { moves: { respond: respondMove, ...negotiationMoves } },
    },
  },

  playerView: ({ G, playerID }) => viewFor(G, playerID === null || playerID === undefined ? null : pid(playerID)),

  endIf: ({ G }) => (G.winner ? { winner: G.winner, reason: G.endReason } : undefined),
};
