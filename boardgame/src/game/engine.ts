/**
 * The rules engine: legal actions, applying them, reactions, and turn/round flow.
 * Pure functions over `LandgrabState`, used by boardgame.io moves (Game.ts),
 * the bots, and the headless harness alike.
 */
import { BALANCE } from './balance';
import {
  erode,
  factionOf,
  hasClaim,
  indexOfFaction,
  isDeveloped,
  log,
  scarClusters,
  scarCount,
  standing,
} from './board';
import { CARDS } from './cards';
import type { OptionDef } from './cardTypes';
import { winCurrency } from './economy';
import { restockMarket, rotateRows } from './markets';
import { doReclaim, reclaimTargets, spreadTargets } from './moves/map';
import { canInterrupt, canObject, openInterrupt, openObjection, resolveReaction } from './reactions';
import type { Action, EndReason, LandgrabState } from './types';

// ---------------------------------------------------------------------------
// Who acts
// ---------------------------------------------------------------------------

/** The player whose decision the game is waiting on. */
export function controller(G: LandgrabState): number {
  return G.reaction ? G.reaction.reactor : G.turn.player;
}

export function isOver(G: LandgrabState): boolean {
  return G.winner !== undefined;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

function optionOf(G: LandgrabState, p: number, a: Action): { option: OptionDef; category: 'Personnel' | 'Event'; cardType: string } | string {
  const card = G.players[p].tableau.find((c) => c.instanceId === a.card);
  if (!card) return 'no such card';
  const def = CARDS[card.cardType];
  if (!def) return 'unknown card';
  if (def.passive) return 'passive card';
  const option = def.options.find((o) => o.id === a.option);
  if (!option) return 'no such option';
  return { option, category: def.category, cardType: card.cardType };
}

/** Why `a` is illegal for player `p` right now, or null. */
export function checkAction(G: LandgrabState, p: number, a: Action): string | null {
  if (isOver(G)) return 'game over';
  if (G.reaction) return 'waiting for a reaction';
  if (p !== G.turn.player) return 'not your turn';
  switch (a.kind) {
    case 'endTurn':
      return null;
    case 'spread':
      if (factionOf(G, p) !== 'Chieftain') return 'only the Chieftain spreads Presence';
      if (G.turn.spreadDone) return 'already spread this turn';
      return a.cell !== undefined && spreadTargets(G).includes(a.cell) ? null : 'cannot spread there';
    case 'reclaim':
      if (factionOf(G, p) !== 'Chieftain') return 'only the Chieftain reclaims';
      if (G.turn.reclaimDone) return 'already reclaimed this turn';
      return a.cell !== undefined && reclaimTargets(G).includes(a.cell) ? null : 'cannot reclaim there';
    case 'use': {
      if (G.turn.actionsLeft <= 0) return 'no actions left';
      if (!a.card || G.turn.usedCards.includes(a.card)) return 'card already used this turn';
      const found = optionOf(G, p, a);
      if (typeof found === 'string') return found;
      if (found.option.firstActionOnly?.(G, a) && G.turn.actionsTaken > 0) return 'a Mandate must be your first action';
      return found.option.legal(G, p, a);
    }
  }
  return 'unknown action';
}

/** Every legal action for the player in control (an empty list during someone else's reaction). */
export function legalActions(G: LandgrabState, p: number): Action[] {
  if (isOver(G) || G.reaction || p !== G.turn.player) return [];
  const out: Action[] = [{ kind: 'endTurn' }];
  const me = factionOf(G, p);
  if (me === 'Chieftain') {
    if (!G.turn.spreadDone) for (const cell of spreadTargets(G)) out.push({ kind: 'spread', cell });
    if (!G.turn.reclaimDone) for (const cell of reclaimTargets(G)) out.push({ kind: 'reclaim', cell });
  }
  if (G.turn.actionsLeft <= 0) return out;
  for (const card of G.players[p].tableau) {
    if (G.turn.usedCards.includes(card.instanceId)) continue;
    const def = CARDS[card.cardType];
    if (!def || def.passive) continue;
    for (const option of def.options) {
      const base: Action = { kind: 'use', card: card.instanceId, option: option.id };
      const cands = option.candidates ? option.candidates(G, p) : [{}];
      for (const extra of cands) {
        const a: Action = { ...base, ...extra };
        if (option.firstActionOnly?.(G, a) && G.turn.actionsTaken > 0) continue;
        if (option.legal(G, p, a) === null) out.push(a);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

function execute(G: LandgrabState, p: number, a: Action): void {
  const found = optionOf(G, p, a);
  if (typeof found === 'string') return;
  const { option, category, cardType } = found;
  // Re-check: a reaction may have changed the board (e.g. resources spent).
  if (option.legal(G, p, a) !== null) {
    log(G, p, `${option.label} could no longer be carried out`);
    return;
  }
  if (category === 'Event') {
    G.players[p].tableau = G.players[p].tableau.filter((c) => c.instanceId !== a.card);
  }
  const played = G.stats.played[p];
  played[cardType] = (played[cardType] ?? 0) + 1;
  const key = `${cardType}.${option.id}`;
  G.stats.options[p][key] = (G.stats.options[p][key] ?? 0) + 1;
  option.resolve(G, p, a);
}

/**
 * Validates and applies an action for player `p`. Returns an error string,
 * or null on success. Opens a reaction window instead of resolving when the
 * Chieftain may interrupt a placement or the Bureaucrat may object.
 */
export function applyAction(G: LandgrabState, p: number, a: Action): string | null {
  const err = checkAction(G, p, a);
  if (err) return err;
  switch (a.kind) {
    case 'endTurn':
      endTurn(G);
      return null;
    case 'spread': {
      G.stats.options[p]['Presence.Spread'] = (G.stats.options[p]['Presence.Spread'] ?? 0) + 1;
      const c = G.cells[a.cell!];
      c.presence = true;
      G.presenceRemaining -= 1;
      G.turn.spreadDone = true;
      log(G, p, 'Presence spreads');
      return null;
    }
    case 'reclaim':
      G.stats.options[p]['Grievance.Reclaim'] = (G.stats.options[p]['Grievance.Reclaim'] ?? 0) + 1;
      G.turn.reclaimDone = true;
      doReclaim(G, p, a.cell!);
      return null;
    case 'use': {
      const { option } = optionOf(G, p, a) as { option: OptionDef };
      G.turn.usedCards.push(a.card!);
      G.turn.actionsLeft -= 1;
      G.turn.actionsTaken += 1;
      const cell = option.placement?.(G, a);
      if (option.placement && canInterrupt(G, p, cell)) {
        openInterrupt(G, p, a, cell!);
        return null;
      }
      if (option.acquisition && canObject(G, p)) {
        openObjection(G, p, a);
        return null;
      }
      execute(G, p, a);
      return null;
    }
  }
  return 'unknown action';
}

/** A reactor's answer to the open window. */
export function respond(G: LandgrabState, p: number, response: string): string | null {
  if (isOver(G)) return 'game over';
  const out = resolveReaction(G, p, response);
  if (out === 'invalid') return 'invalid response';
  if (out.run) execute(G, out.run.actor, out.run.action);
  return null;
}

// ---------------------------------------------------------------------------
// Turn and round flow
// ---------------------------------------------------------------------------

/** Passive income at the start of a turn (spec 3.1, 3.4). */
function turnStartIncome(G: LandgrabState, p: number): void {
  const me = factionOf(G, p);
  const r = G.players[p].resources;
  if (me === 'Bureaucrat') {
    let adj = 0;
    let zoned = 0;
    for (const c of G.cells) {
      if (!c.building || c.building === 'PublicWork') continue;
      if (c.neighbors.some((n) => G.cells[n].building === 'PublicWork')) adj++;
      if (c.designation === 'Zoned' && c.designatedBy === 'Bureaucrat' && c.zonedFor === c.buildingOwner) zoned++;
    }
    const listed = G.sites.filter((s) => s.status === 'Listed').length;
    const votes = adj + zoned + listed;
    if (votes) {
      r.votes += votes;
      log(G, p, `Registry income: ${votes} votes (${adj} by Public Works, ${zoned} zoned, ${listed} listed)`);
    }
  }
  if (me === 'Chieftain') {
    let votes = 0;
    for (const c of G.cells) {
      if (c.village && c.neighbors.some((n) => isDeveloped(G.cells[n]))) votes++;
    }
    if (votes) {
      r.votes += votes;
      log(G, p, `Villages raise ${votes} votes`);
    }
  }
}

export function startTurn(G: LandgrabState): void {
  const p = G.order[G.turn.seat];
  G.turn.player = p;
  G.turn.actionsLeft = BALANCE.actionsPerTurn;
  G.turn.usedCards = [];
  G.turn.actionsTaken = 0;
  const chief = factionOf(G, p) === 'Chieftain';
  G.turn.spreadDone = !chief;
  G.turn.reclaimDone = !chief;
  if (G.landClaims === p) G.landClaims = undefined;
  turnStartIncome(G, p);
}

export function endTurn(G: LandgrabState): void {
  if (isOver(G)) return;
  G.turn.seat += 1;
  if (G.turn.seat >= G.order.length) {
    endRound(G);
    if (isOver(G)) return;
    G.turn.seat = 0;
    G.turn.round += 1;
  }
  startTurn(G);
}

function endRound(G: LandgrabState): void {
  const before = G.lastSeasonEndsAfterRound;
  erode(G);
  if (before === undefined && G.lastSeasonEndsAfterRound !== undefined) {
    // Triggered by erosion after the round was over: one more round is played.
    G.lastSeasonEndsAfterRound = G.turn.round + 1;
  }
  G.stats.scarsByRound.push(scarCount(G));
  G.stats.clustersByRound.push(scarClusters(G).filter((c) => c.size >= BALANCE.erosionMinCluster).length);
  rotateRows(G);
  restockMarket(G);
  G.objectionUsedThisRound = false;

  const round = G.turn.round;
  let reason: EndReason | null = null;
  if (G.lastSeasonEndsAfterRound !== undefined && G.lastSeasonEndsAfterRound <= round) reason = 'last_season';
  else if (G.mandatesExhaustedRound !== undefined && G.mandatesExhaustedRound <= round) reason = 'mandates_exhausted';
  else if (round >= G.roundCap) reason = 'round_cap';
  if (reason) finishGame(G, reason);
}

/** Most Seats wins; ties broken by win-currency total, then by later seat (spec 5.3). */
export function finishGame(G: LandgrabState, reason: EndReason): void {
  let best = -1;
  let bestKey: [number, number, number] = [-1, -1, -1];
  for (const [seat, p] of G.order.entries()) {
    const key: [number, number, number] = [G.players[p].seats, winCurrency(G, p), seat];
    if (key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
      best = p;
      bestKey = key;
    }
  }
  G.winner = G.players[best].type;
  G.endReason = reason;
  log(G, best, `Game over (${reason.replace('_', ' ')}): the ${G.winner} wins`);
}

// ---------------------------------------------------------------------------
// Convenience for UIs and bots
// ---------------------------------------------------------------------------

export function chieftainStanding(G: LandgrabState): number {
  return indexOfFaction(G, 'Chieftain') >= 0 ? standing(G) : 0;
}

export function claimedCells(G: LandgrabState): number {
  return G.cells.filter(hasClaim).length;
}
