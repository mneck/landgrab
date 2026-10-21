/**
 * Paying, gaining, win currencies and the Mandate price (spec 3.5).
 */
import { BALANCE } from './balance';
import { standing } from './board';
import type { LandgrabState, PlayerState, PlayerType, ResourceKey, Resources } from './types';

export const RESOURCE_KEYS: ResourceKey[] = ['coins', 'wood', 'ore', 'votes'];

export function canAfford(r: Resources, cost: Partial<Resources>): boolean {
  return RESOURCE_KEYS.every((k) => r[k] >= (cost[k] ?? 0));
}

export function pay(r: Resources, cost: Partial<Resources>): void {
  for (const k of RESOURCE_KEYS) r[k] -= cost[k] ?? 0;
}

export function gain(r: Resources, amount: Partial<Resources>): void {
  for (const k of RESOURCE_KEYS) r[k] += amount[k] ?? 0;
}

export function totalOf(amount: Partial<Resources>): number {
  return RESOURCE_KEYS.reduce((s, k) => s + (amount[k] ?? 0), 0);
}

/** The faction's win currency as a number (tie-breaker and bot scoring). */
export function winCurrency(G: LandgrabState, playerIndex: number): number {
  const p = G.players[playerIndex];
  switch (p.type) {
    case 'Hotelier': return p.resources.coins;
    case 'Industrialist': return p.resources.wood + p.resources.ore;
    case 'Bureaucrat': return p.resources.votes;
    case 'Chieftain': return standing(G);
  }
}

/** Resources that count as each faction's own currency when paying. */
export const OWN_CURRENCY: Record<PlayerType, ResourceKey[]> = {
  Hotelier: ['coins'],
  Industrialist: ['wood', 'ore'],
  Bureaucrat: ['votes'],
  Chieftain: [],
};

/**
 * Takes `amount` units of the faction's own currency (wood before ore for the
 * Industrialist, whichever is larger first). Returns the spend or null.
 */
export function ownCurrencySpend(p: PlayerState, amount: number): Partial<Resources> | null {
  const keys = OWN_CURRENCY[p.type];
  if (!keys.length) return amount === 0 ? {} : null;
  const avail = { ...p.resources };
  const spend: Partial<Resources> = {};
  let left = amount;
  while (left > 0) {
    const k = keys.reduce((a, b) => (avail[b] > avail[a] ? b : a));
    if (avail[k] <= 0) return null;
    avail[k] -= 1;
    spend[k] = (spend[k] ?? 0) + 1;
    left--;
  }
  return spend;
}

export interface MandatePlan {
  spend: Resources;
  /** Chieftain: Standing that must be held (not spent). */
  standingRequired: number;
  endorsementsUsed: number;
}

export function mandateBaseCost(p: PlayerState): number {
  return BALANCE.mandateBase[p.type] + BALANCE.mandatePerSeat[p.type] * p.seats;
}

/**
 * Price of the Mandate in `slot`. The base cost is in the faction's own
 * currency (Chieftain: Standing, held not spent). The slot surcharge is paid
 * either in votes or in own currency at the faction's rate. Endorsements in the
 * tableau each let up to 3 units of a shortfall be paid with other resources.
 */
export function planMandate(
  G: LandgrabState,
  playerIndex: number,
  slot: number,
  payInVotes: boolean
): MandatePlan | null {
  const p = G.players[playerIndex];
  const avail = { ...p.resources };
  const spend: Resources = { coins: 0, wood: 0, ore: 0, votes: 0 };
  const take = (k: ResourceKey, n: number) => {
    avail[k] -= n;
    spend[k] += n;
  };

  // Slot surcharge.
  if (payInVotes) {
    if (avail.votes < slot) return null;
    take('votes', slot);
  }
  const surchargeOwn = payInVotes ? 0 : slot * BALANCE.mandateSlotRate[p.type];

  let shortfall = 0;
  let standingRequired = 0;
  if (p.type === 'Chieftain') {
    standingRequired = mandateBaseCost(p) + surchargeOwn;
    shortfall = Math.max(0, standingRequired - standing(G));
  } else {
    let need = mandateBaseCost(p) + surchargeOwn;
    // Spend the larger pile first (the Industrialist's wood/ore mix).
    while (need > 0) {
      const keys = OWN_CURRENCY[p.type];
      const k = keys.reduce((a, b) => (avail[b] > avail[a] ? b : a));
      if (avail[k] <= 0) break;
      take(k, 1);
      need--;
    }
    shortfall = need;
  }

  let endorsementsUsed = 0;
  if (shortfall > 0) {
    const endorsements = p.tableau.filter((c) => c.cardType === 'Endorsement').length;
    if (shortfall > endorsements * BALANCE.endorsementCover) return null;
    endorsementsUsed = Math.ceil(shortfall / BALANCE.endorsementCover);
    const others = (['coins', 'wood', 'ore', 'votes'] as ResourceKey[]).filter(
      (k) => !OWN_CURRENCY[p.type].includes(k)
    );
    while (shortfall > 0) {
      const k = others.reduce((a, b) => (avail[b] > avail[a] ? b : a));
      if (avail[k] <= 0) return null;
      take(k, 1);
      shortfall--;
    }
  }
  if (p.type === 'Chieftain') standingRequired = Math.min(standingRequired, standing(G));
  return { spend, standingRequired, endorsementsUsed };
}
