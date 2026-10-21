/**
 * Human-readable labels for actions and reactions.
 */
import { cardName } from '../game/cards';
import { MANDATE } from '../game/markets';
import { planMandate } from '../game/economy';
import type { Action, LandgrabState, Reaction, Resources } from '../game/types';
import { RESOURCE_ICON } from './theme';

export function formatAmount(r: Partial<Resources>): string {
  const parts = (Object.keys(RESOURCE_ICON) as (keyof Resources)[])
    .filter((k) => (r[k] ?? 0) > 0)
    .map((k) => `${r[k]} ${RESOURCE_ICON[k]}`);
  return parts.join(' ') || 'nothing';
}

const CHOICE_LABEL: Record<string, string> = {
  wood: 'wood', ore: 'ore',
  wood3: '3 wood', wood2ore1: '2 wood + 1 ore', wood1ore2: '1 wood + 2 ore', ore3: '3 ore',
  Protected: 'Protect (nobody builds or extracts)',
  Listed: 'List the Site',
};

export function choiceLabel(choice: string): string {
  if (CHOICE_LABEL[choice]) return CHOICE_LABEL[choice];
  if (choice.startsWith('Zoned:')) return `Zone for the ${choice.slice(6)}`;
  let m = /^(wood|ore)([123])$/.exec(choice);
  if (m) return `${m[2]} ${m[1]}`;
  m = /^(coins|wood|ore|votes)4$/.exec(choice);
  if (m) return `4 ${m[1]}`;
  m = /^(coins|wood|ore|votes)2(coins|wood|ore|votes)2$/.exec(choice);
  if (m) return `2 ${m[1]} + 2 ${m[2]}`;
  return choice;
}

/** What distinguishes this action from its siblings (same card and option). */
export function variantLabel(G: LandgrabState, me: number, a: Action): string {
  const bits: string[] = [];
  if (a.slot !== undefined) {
    const row = a.option === 'Hire' ? G.personnelRow : G.politicsRow;
    const card = row[a.slot];
    if (card === MANDATE) {
      const plan = planMandate(G, me, a.slot, !!a.payInVotes);
      bits.push(`Mandate — pay ${plan ? formatAmount(plan.spend) : '?'}${plan?.standingRequired ? `, Standing ${plan.standingRequired} needed` : ''}`);
    } else if (card) {
      const unit = a.option === 'Hire' ? RESOURCE_ICON.coins : a.option === 'Policy' ? RESOURCE_ICON.votes : '';
      bits.push(`${cardName(card)}${unit ? ` (${a.slot} ${unit})` : ''}`);
    }
  }
  if (a.trade) {
    const t: string[] = [];
    for (const res of ['wood', 'ore'] as const) {
      const n = a.trade[res] ?? 0;
      if (n > 0) t.push(`buy ${n} ${res}`);
      if (n < 0) t.push(`sell ${-n} ${res}`);
    }
    bits.push(t.join(', '));
  }
  if (a.choice) bits.push(choiceLabel(a.choice));
  if (a.player !== undefined) bits.push(`the ${G.players[a.player].type}`);
  if (a.target) {
    const c = G.players[me].tableau.find((x) => x.instanceId === a.target);
    bits.push(`remove ${c ? cardName(c.cardType) : a.target}`);
  }
  if (a.cells?.length) bits.push(`move the Village from cell ${a.cells[0]}`);
  if (a.cell !== undefined && !bits.length) bits.push(`cell ${a.cell}`);
  return bits.join(' · ') || 'Confirm';
}

export function reactionText(G: LandgrabState, r: Reaction): string {
  const who = (i: number) => `the ${G.players[i].type}`;
  switch (r.kind) {
    case 'interrupt':
      return `${who(r.actor)} is building next to your Presence (${r.action.option} on cell ${r.cell}). Spend 1 Grievance to stop it?`;
    case 'objection':
      return `${who(r.actor)} is acquiring a card (${r.action.option}). Pay 1 💰 to object? They must then pay 2 of their own currency or abandon it.`;
    case 'objectionResponse':
      return `${who(r.bureaucrat)} objects to your acquisition. Pay 2 of your currency to proceed, or abandon it (refunded)?`;
    case 'waive':
      return `${who(r.payer)} owes you ${formatAmount(r.amount)} (${r.reason}). Accept it, or waive it and hold a Favour token?`;
  }
}

export const RESPONSE_LABEL: Record<string, string> = {
  interrupt: 'Interrupt (1 Grievance)',
  allow: 'Let it happen',
  object: 'Object (1 💰)',
  pass: 'No objection',
  pay: 'Pay and proceed',
  abandon: 'Abandon',
  accept: 'Accept payment',
  waive: 'Waive (take a Favour)',
};
