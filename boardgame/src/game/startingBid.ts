import { INVALID_MOVE } from 'boardgame.io/core';
import type { LandgrabState } from './types';

type CtxShape = {
  numPlayers: number;
  playOrder: string[];
};

type StartingBidMoveArgs = {
  G: LandgrabState;
  ctx: CtxShape;
  playerID: string;
  events: { endPhase: () => void };
  random: { Shuffle: <T>(arr: T[]) => T[] };
};

/**
 * Simultaneous blind bid for first player: highest unique bid pays that many coins and goes first;
 * on a tie for highest, random first player and no one pays.
 */
export function submitStartingBid({ G, ctx, playerID, events, random }: StartingBidMoveArgs, amount: number) {
  const phase = G.startingBidPhase;
  if (!phase || phase.resolved) return INVALID_MOVE;

  const idx = parseInt(playerID, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= ctx.numPlayers) return INVALID_MOVE;

  if (phase.amounts[idx] !== null) return INVALID_MOVE;
  if (!Number.isInteger(amount) || amount < 0) return INVALID_MOVE;
  if (amount > G.players[idx].resources.coins) return INVALID_MOVE;

  phase.amounts[idx] = amount;

  if (phase.amounts.some((a) => a === null)) return;

  const bids = phase.amounts as number[];
  let maxBid = -1;
  for (const b of bids) {
    maxBid = Math.max(maxBid, b);
  }

  const tiedIndices: string[] = [];
  for (let i = 0; i < ctx.numPlayers; i++) {
    if (bids[i] === maxBid) tiedIndices.push(String(i));
  }

  let firstPid: string;
  if (tiedIndices.length === 1) {
    firstPid = tiedIndices[0];
    G.players[parseInt(firstPid, 10)].resources.coins -= maxBid;
  } else {
    const shuffled = random.Shuffle([...tiedIndices]);
    firstPid = shuffled[0]!;
  }

  const rest: string[] = [];
  for (let i = 0; i < ctx.numPlayers; i++) {
    const pid = String(i);
    if (pid !== firstPid) rest.push(pid);
  }
  rest.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  G.startingPlayOrder = [firstPid, ...rest];
  phase.resolved = true;
  events.endPhase();
}
