/**
 * Market verbs: Guide → Hire, Liaison → Policy | Market | Subsist (spec 4.2, 4.3)
 * and Mandate purchase (spec 3.5).
 */
import { BALANCE } from '../balance';
import { factionOf, log, newId, standing } from '../board';
import type { OptionDef } from '../cardTypes';
import { pay, planMandate } from '../economy';
import {
  MANDATE,
  applyBuy,
  applySell,
  buyCost,
  sellValue,
  takeFromPersonnelRow,
  takeFromPoliticsRow,
  trackFor,
} from '../markets';
import type { Action, LandgrabState } from '../types';

export function addCard(G: LandgrabState, p: number, cardType: string): void {
  G.players[p].tableau.push({ instanceId: newId(G, cardType), cardType });
  const acq = G.stats.acquired[p];
  acq[cardType] = (acq[cardType] ?? 0) + 1;
}

export function tableauFull(G: LandgrabState, p: number): boolean {
  return G.players[p].tableau.length >= BALANCE.tableauCap;
}

export const hireOption: OptionDef = {
  id: 'Hire',
  label: 'Hire',
  text: 'Take a Personnel card from the Personnel Row, paying its slot price (0–3 coins).',
  target: 'slot',
  acquisition: true,
  candidates: () => [0, 1, 2, 3].map((slot) => ({ slot })),
  legal: (G, p, a) => {
    if (a.slot === undefined || !G.personnelRow[a.slot]) return 'empty slot';
    if (tableauFull(G, p)) return 'tableau full';
    if (G.players[p].resources.coins < a.slot) return 'cannot afford';
    return null;
  },
  resolve: (G, p, a) => {
    G.players[p].resources.coins -= a.slot!;
    const card = takeFromPersonnelRow(G, a.slot!)!;
    addCard(G, p, card);
    log(G, p, `Hired ${card} for ${a.slot} coins`);
  },
};

function mandateLegal(G: LandgrabState, p: number, a: Action): string | null {
  return planMandate(G, p, a.slot!, !!a.payInVotes) ? null : 'cannot meet the Mandate cost';
}

/** Mandate (spec 3.5): +1 Seat, a Stimulus card, and the turn ends. */
function buyMandate(G: LandgrabState, p: number, a: Action): void {
  const plan = planMandate(G, p, a.slot!, !!a.payInVotes)!;
  pay(G.players[p].resources, plan.spend);
  takeFromPoliticsRow(G, a.slot!);
  const player = G.players[p];
  player.seats += 1;
  G.mandatesRemaining -= 1;
  (G.stats.mandateRounds[p] ??= []).push(G.turn.round);
  const acq = G.stats.acquired[p];
  acq[MANDATE] = (acq[MANDATE] ?? 0) + 1;
  for (let i = 0; i < plan.endorsementsUsed; i++) {
    const played = G.stats.played[p];
    played.Endorsement = (played.Endorsement ?? 0) + 1;
  }
  addCard(G, p, 'Stimulus');
  const paid = Object.entries(plan.spend).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ');
  const extra = player.type === 'Chieftain' ? ` with Standing ${standing(G)}` : '';
  log(G, p, `Bought a Mandate (${paid || 'no payment'}${extra}): Seat ${player.seats}`);
  G.turn.actionsLeft = 0;
  if (player.seats >= G.seatsToWin) {
    G.winner = player.type;
    G.endReason = 'seats';
  } else if (G.mandatesRemaining <= 0 && G.mandatesExhaustedRound === undefined) {
    G.mandatesExhaustedRound = G.turn.round;
    log(G, p, 'The last Mandate is gone: the game ends with this round');
  }
}

export const policyOption: OptionDef = {
  id: 'Policy',
  label: 'Policy',
  text: 'Take a card from the Politics Track, paying its slot price (0–3 votes) to the bank. A Mandate costs your own currency.',
  target: 'slot',
  acquisition: true,
  candidates: (G) => {
    const out: Partial<Action>[] = [];
    for (let slot = 0; slot < 4; slot++) {
      if (G.politicsRow[slot] === MANDATE) {
        out.push({ slot, payInVotes: false });
        if (slot > 0) out.push({ slot, payInVotes: true });
      } else out.push({ slot });
    }
    return out;
  },
  firstActionOnly: (G, a) => a.slot !== undefined && G.politicsRow[a.slot] === MANDATE,
  legal: (G, p, a) => {
    if (a.slot === undefined || !G.politicsRow[a.slot]) return 'empty slot';
    if (G.politicsRow[a.slot] === MANDATE) return mandateLegal(G, p, a);
    if (tableauFull(G, p)) return 'tableau full';
    // Votes paid for Politics cards go to the bank, never to the Bureaucrat (spec 3.4).
    if (G.players[p].resources.votes < a.slot) return 'cannot afford';
    return null;
  },
  resolve: (G, p, a) => {
    if (G.politicsRow[a.slot!] === MANDATE) {
      buyMandate(G, p, a);
      return;
    }
    G.players[p].resources.votes -= a.slot!;
    const card = takeFromPoliticsRow(G, a.slot!)!;
    addCard(G, p, card);
    log(G, p, `Took ${card} for ${a.slot} votes`);
  },
};

const TRADES: { wood?: number; ore?: number }[] = [];
for (let w = -3; w <= 3; w++) for (let o = -3; o <= 3; o++) if (w || o) TRADES.push({ wood: w, ore: o });

export function tradeCost(G: LandgrabState, trade: { wood?: number; ore?: number }): number | null {
  let net = 0;
  for (const res of ['wood', 'ore'] as const) {
    const n = trade[res] ?? 0;
    const track = trackFor(G, res);
    if (n > 0) {
      const c = buyCost(track, n);
      if (c === null) return null;
      net += c;
    } else if (n < 0) {
      const v = sellValue(track, -n);
      if (v === null) return null;
      net -= v;
    }
  }
  return net;
}

export const marketOption: OptionDef = {
  id: 'Market',
  label: 'Market',
  text: 'Buy and/or sell wood and ore at the Resource Market (cheapest units first; sales fill the dearest empty slots).',
  target: 'trade',
  candidates: () => TRADES.map((trade) => ({ trade })),
  legal: (G, p, a) => {
    const t = a.trade;
    if (!t || (!t.wood && !t.ore)) return 'no trade';
    const r = G.players[p].resources;
    if ((t.wood ?? 0) < 0 && r.wood < -(t.wood ?? 0)) return 'not enough wood';
    if ((t.ore ?? 0) < 0 && r.ore < -(t.ore ?? 0)) return 'not enough ore';
    const cost = tradeCost(G, t);
    if (cost === null) return 'market cannot fill it';
    if (cost > r.coins) return 'cannot afford';
    return null;
  },
  resolve: (G, p, a) => {
    const t = a.trade!;
    const r = G.players[p].resources;
    const cost = tradeCost(G, t)!;
    for (const res of ['wood', 'ore'] as const) {
      const n = t[res] ?? 0;
      if (n > 0) applyBuy(trackFor(G, res), n);
      if (n < 0) applySell(trackFor(G, res), -n);
      r[res] += n;
    }
    r.coins -= cost;
    log(G, p, `Market: ${t.wood ? `${t.wood > 0 ? 'bought' : 'sold'} ${Math.abs(t.wood)} wood ` : ''}${t.ore ? `${t.ore > 0 ? 'bought' : 'sold'} ${Math.abs(t.ore)} ore ` : ''}(${cost >= 0 ? `paid ${cost}` : `got ${-cost}`} coins)`);
  },
};

/** Subsist (spec 4.3): a deliberately weak fallback. */
export const subsistOption: OptionDef = {
  id: 'Subsist',
  label: 'Subsist',
  text: 'Hotelier 1 coin; Industrialist 1 wood/ore (needs a Zone next to Rainforest or Mountain); Bureaucrat or Chieftain 1 vote.',
  target: 'none',
  legal: (G, p) => {
    if (factionOf(G, p) !== 'Industrialist') return null;
    return subsistResource(G, p) ? null : 'needs a Zone next to Rainforest or Mountain';
  },
  resolve: (G, p) => {
    const me = factionOf(G, p);
    const r = G.players[p].resources;
    if (me === 'Hotelier') r.coins += 1;
    else if (me === 'Industrialist') r[subsistResource(G, p)!] += 1;
    else r.votes += 1;
    log(G, p, 'Subsist');
  },
};

function subsistResource(G: LandgrabState, p: number): 'wood' | 'ore' | null {
  let ore = false;
  for (const c of G.cells) {
    if (c.building !== 'IndustrialZone' || c.buildingOwner !== 'Industrialist') continue;
    for (const n of c.neighbors) {
      if (G.cells[n].terrain === 'Rainforest') return 'wood';
      if (G.cells[n].terrain === 'Mountain') ore = true;
    }
  }
  void p;
  return ore ? 'ore' : null;
}
