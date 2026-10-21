/**
 * Out-of-turn decision windows. Each one names a single reactor; Game.ts puts
 * that player in a boardgame.io stage until they answer (spec 3.1, 3.4, 7.1).
 */
import { BALANCE } from './balance';
import { chieftainIndex, factionOf, indexOfFaction, log, nearPresence, newId } from './board';
import { canAfford, gain, pay } from './economy';
import type { Action, CellId, LandgrabState, Reaction, Resources } from './types';

export function canInterrupt(G: LandgrabState, actor: number, cell: CellId | undefined): boolean {
  if (cell === undefined) return false;
  const chief = chieftainIndex(G);
  if (chief < 0 || chief === actor) return false;
  if (G.grievance < BALANCE.interruptCost) return false;
  return nearPresence(G, cell);
}

export function canObject(G: LandgrabState, actor: number): boolean {
  const b = indexOfFaction(G, 'Bureaucrat');
  if (b < 0 || b === actor) return false;
  if (G.objectionUsedThisRound) return false;
  return G.players[b].resources.coins >= BALANCE.objectionCost;
}

export function openInterrupt(G: LandgrabState, actor: number, action: Action, cell: CellId): void {
  G.reaction = { kind: 'interrupt', reactor: chieftainIndex(G), actor, action, cell };
}

export function openObjection(G: LandgrabState, actor: number, action: Action): void {
  G.reaction = { kind: 'objection', reactor: indexOfFaction(G, 'Bureaucrat'), actor, action };
}

/**
 * A payment between two players. The payer's coins are held in escrow until
 * the recipient accepts or waives; waiving hands the recipient a Favour token
 * owed by the payer (spec 7.1). Favours have no rules text.
 */
export function requestPayment(
  G: LandgrabState,
  payer: number,
  recipient: number,
  amount: Partial<Resources>,
  reason: string
): void {
  if (recipient < 0 || recipient === payer) return;
  const r = G.players[payer].resources;
  const afford: Partial<Resources> = {};
  for (const k of Object.keys(amount) as (keyof Resources)[]) afford[k] = Math.min(amount[k] ?? 0, r[k]);
  pay(r, afford);
  G.reaction = { kind: 'waive', reactor: recipient, payer, amount: afford, reason };
}

export const RESPONSES: Record<Reaction['kind'], string[]> = {
  interrupt: ['interrupt', 'allow'],
  objection: ['object', 'pass'],
  objectionResponse: ['pay', 'abandon'],
  waive: ['accept', 'waive'],
};

export function legalResponses(G: LandgrabState, reactor: number): string[] {
  const r = G.reaction;
  if (!r || r.reactor !== reactor) return [];
  if (r.kind === 'objectionResponse') {
    return objectionPenaltyAffordable(G, reactor) ? ['pay', 'abandon'] : ['abandon'];
  }
  return RESPONSES[r.kind];
}

function objectionPenaltyAffordable(G: LandgrabState, p: number): boolean {
  return objectionPenaltyFor(G, p) !== null;
}

export function objectionPenaltyFor(G: LandgrabState, p: number): Partial<Resources> | null {
  const player = G.players[p];
  const n = BALANCE.objectionPenalty;
  if (player.type === 'Chieftain') return player.resources.votes >= n ? { votes: n } : null;
  if (player.type === 'Hotelier') return player.resources.coins >= n ? { coins: n } : null;
  if (player.type === 'Bureaucrat') return player.resources.votes >= n ? { votes: n } : null;
  const { wood, ore } = player.resources;
  if (wood + ore < n) return null;
  const w = Math.min(wood, n);
  return { wood: w, ore: n - w };
}

/**
 * Applies a reactor's answer. Returns the action to execute now (when the
 * window let it through), or null. Throws nothing; returns 'invalid' on a bad answer.
 */
export function resolveReaction(
  G: LandgrabState,
  reactor: number,
  response: string
): { run?: { actor: number; action: Action } } | 'invalid' {
  const r = G.reaction;
  if (!r || r.reactor !== reactor) return 'invalid';
  if (!legalResponses(G, reactor).includes(response)) return 'invalid';
  G.reaction = null;
  switch (r.kind) {
    case 'interrupt':
      if (response === 'interrupt') {
        G.grievance -= BALANCE.interruptCost;
        G.stats.interrupts += 1;
        log(G, reactor, `Interrupt: the ${factionOf(G, r.actor)}'s placement is stopped`);
        return {};
      }
      return { run: { actor: r.actor, action: r.action } };
    case 'objection':
      if (response === 'object') {
        G.players[reactor].resources.coins -= BALANCE.objectionCost;
        G.objectionUsedThisRound = true;
        G.stats.objections += 1;
        log(G, reactor, `Objection to the ${factionOf(G, r.actor)}'s acquisition`);
        G.reaction = { kind: 'objectionResponse', reactor: r.actor, bureaucrat: reactor, action: r.action };
        return {};
      }
      return { run: { actor: r.actor, action: r.action } };
    case 'objectionResponse':
      if (response === 'pay') {
        const cost = objectionPenaltyFor(G, reactor)!;
        if (!canAfford(G.players[reactor].resources, cost)) return 'invalid';
        pay(G.players[reactor].resources, cost);
        log(G, reactor, 'Paid through the Objection');
        return { run: { actor: reactor, action: r.action } };
      }
      log(G, reactor, 'Abandoned the acquisition');
      return {};
    case 'waive':
      if (response === 'accept') {
        gain(G.players[reactor].resources, r.amount);
      } else {
        gain(G.players[r.payer].resources, r.amount);
        G.favors.push({ id: newId(G, 'favor'), from: factionOf(G, r.payer), to: factionOf(G, reactor) });
        log(G, reactor, `Waived the ${r.reason} payment: the ${factionOf(G, r.payer)} owes a Favour`);
      }
      return {};
  }
}
