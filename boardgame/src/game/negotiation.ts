/**
 * Negotiation (spec 7). None of this costs an action and none of it is
 * enforced: proposals are offers either side may refuse, Tell may be a lie,
 * Show is the only verifiable trade, and Favours carry no rules text.
 */
import { factionOf, knowsCell, log, newId } from './board';
import { RESOURCE_KEYS, canAfford, gain, pay } from './economy';
import type { CellId, LandgrabState, Resources, TerrainType } from './types';

const MAX_PROPOSALS = 20;
const MAX_MESSAGES = 120;
const MAX_TEXT = 280;

function clean(amount: Partial<Resources> | undefined): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const v = Math.floor(Number(amount?.[k] ?? 0));
    if (v > 0) out[k] = Math.min(v, 99);
  }
  return out;
}

function pushMessage(G: LandgrabState, m: Omit<LandgrabState['messages'][number], 'id' | 'round'>): void {
  G.messages.push({ ...m, id: newId(G, 'msg'), round: G.turn.round });
  if (G.messages.length > MAX_MESSAGES) G.messages.splice(0, G.messages.length - MAX_MESSAGES);
}

export function propose(
  G: LandgrabState,
  from: number,
  to: number,
  give: Partial<Resources>,
  want: Partial<Resources>,
  note?: string
): string | null {
  if (from === to || !G.players[to]) return 'choose another player';
  const g = clean(give);
  const w = clean(want);
  if (!Object.keys(g).length && !Object.keys(w).length && !note) return 'empty proposal';
  if (!canAfford(G.players[from].resources, g)) return 'you cannot afford what you offer';
  if (G.proposals.length >= MAX_PROPOSALS) return 'too many open proposals';
  G.proposals.push({ id: newId(G, 'prop'), from, to, give: g, want: w, note: note?.slice(0, MAX_TEXT) });
  return null;
}

export function answerProposal(G: LandgrabState, p: number, id: string, accept: boolean): string | null {
  const prop = G.proposals.find((x) => x.id === id);
  if (!prop || prop.to !== p) return 'no such proposal';
  G.proposals = G.proposals.filter((x) => x.id !== id);
  if (!accept) return null;
  const a = G.players[prop.from].resources;
  const b = G.players[prop.to].resources;
  if (!canAfford(a, prop.give)) return `the ${factionOf(G, prop.from)} can no longer pay`;
  if (!canAfford(b, prop.want)) return 'you cannot pay what they asked';
  pay(a, prop.give);
  gain(b, prop.give);
  pay(b, prop.want);
  gain(a, prop.want);
  log(G, p, `Deal: the ${factionOf(G, prop.from)} and the ${factionOf(G, prop.to)} trade`);
  return null;
}

export function withdrawProposal(G: LandgrabState, p: number, id: string): string | null {
  const prop = G.proposals.find((x) => x.id === id);
  if (!prop || prop.from !== p) return 'no such proposal';
  G.proposals = G.proposals.filter((x) => x.id !== id);
  return null;
}

/** Free text to one player (or everyone). Unverifiable; may be a lie. */
export function tell(G: LandgrabState, from: number, to: number | null, text: string): string | null {
  const t = String(text ?? '').trim().slice(0, MAX_TEXT);
  if (!t) return 'empty message';
  if (to !== null && (!G.players[to] || to === from)) return 'choose another player';
  pushMessage(G, { from, to, kind: 'tell', text: t });
  return null;
}

/** Reveal a cell you know to one named player. Verifiable: they now know it too. */
export function show(G: LandgrabState, from: number, to: number, cell: CellId): string | null {
  if (!G.players[to] || to === from) return 'choose another player';
  const c = G.cells[cell];
  if (!c) return 'no such cell';
  const me = factionOf(G, from);
  if (!c.fog) return 'everyone can already see that cell';
  if (!knowsCell(G, me, cell)) return 'you do not know that cell';
  const them = factionOf(G, to);
  const list = (G.scouted[them] ??= []);
  if (!list.includes(cell)) list.push(cell);
  pushMessage(G, { from, to, kind: 'show', text: `shows you a cell`, cell, shownTerrain: c.terrain as TerrainType });
  return null;
}

/** Favours are a memory aid: either party may tear one up. */
export function dropFavor(G: LandgrabState, p: number, id: string): string | null {
  const me = factionOf(G, p);
  const f = G.favors.find((x) => x.id === id);
  if (!f || (f.from !== me && f.to !== me)) return 'no such favour';
  G.favors = G.favors.filter((x) => x.id !== id);
  return null;
}
