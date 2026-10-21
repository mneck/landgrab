/**
 * getAIMove: dispatch to one of four faction policies (spec 6), or to the
 * random-legal-move baseline. Every policy works the same way: shortlist the
 * legal actions, simulate each on a copy of the bot's own view, and keep the
 * one the faction's evaluation likes best. Ending the turn scores 0.
 */
import { holdingCost } from '../game/moves/map';
import { hasClaim, hotelValue, isDeveloped, knowsCell } from '../game/board';
import type { Action, LandgrabState } from '../game/types';
import { BUILDABLE } from '../game/types';
import { viewFor } from '../game/view';
import { bureaucratPolicy } from './bureaucrat';
import { chieftainPolicy } from './chieftain';
import { hotelierPolicy } from './hotelier';
import { industrialistPolicy } from './industrialist';
import type { Decision, Policy } from './shared';
import { legalActions, legalResponses, makeRng, optionKey, simulate } from './shared';

export type { Decision } from './shared';

export const POLICIES: Record<string, Policy> = {
  Hotelier: hotelierPolicy,
  Industrialist: industrialistPolicy,
  Bureaucrat: bureaucratPolicy,
  Chieftain: chieftainPolicy,
};

const SHORTLIST = 6;
const GROUP_LIMIT = 10;

/** Cheap shared prefilter for cell-targeted options. */
export function basePrefilter(G: LandgrabState, p: number, a: Action): number {
  const me = G.players[p].type;
  const id = a.cell;
  if (id === undefined) return 0;
  const c = G.cells[id];
  const fogAround = [id, ...c.neighbors].filter((n) => G.cells[n].fog).length;
  const nearMine = c.neighbors.some((n) => {
    const m = G.cells[n];
    return m.buildingOwner === me || m.holding === me || (me === 'Chieftain' && hasClaim(m));
  });
  switch (a.option ?? a.kind) {
    case 'Acquire':
      if (!knowsCell(G, me, id) || !BUILDABLE.has(c.terrain)) return -99;
      return hotelValue(G, id, { asIfTerrain: c.terrain }) - 0.5 * holdingCost(G, id) - (fogAround ? 1 : 0);
    case 'Develop':
    case 'Realise':
      return hotelValue(G, id);
    case 'Establish':
      return c.neighbors.filter((n) => {
        const t = G.cells[n].terrain;
        return !G.cells[n].fog && !isDeveloped(G.cells[n]) && (t === 'Rainforest' || t === 'Hills' || t === 'Mountain');
      }).length;
    case 'PublicWorks':
      return c.neighbors.filter((n) => {
        const m = G.cells[n];
        return m.building && m.building !== 'PublicWork' && !m.neighbors.some((k) => G.cells[k].building === 'PublicWork');
      }).length;
    case 'Survey':
    case 'Scout':
    case 'SurveyGrant': {
      // Fog two hops from my pieces is what blocks my next building.
      const near2 = nearMine || c.neighbors.some((n) => G.cells[n].neighbors.some((k) => {
        const m = G.cells[k];
        return m.buildingOwner === me || m.holding === me || (me === 'Chieftain' && hasClaim(m));
      }));
      return fogAround + (nearMine ? 3 : near2 ? 2 : 0);
    }
    case 'Housing':
    case 'HousingScheme':
      return c.neighbors.filter((n) => G.cells[n].building === 'Hotel').length;
    case 'spread':
    case 'Settle':
      return c.neighbors.filter((n) => hasClaim(G.cells[n])).length;
    default:
      return nearMine ? 1 : 0;
  }
}

export interface AIOptions {
  /** Use the random-legal-move baseline instead of the faction policy. */
  random?: boolean;
  seed?: number;
  /** Debug: receives every scored candidate. */
  trace?: (a: Action, score: number) => void;
}

const rngs = new Map<string, () => number>();
function rngFor(key: string, seed: number): () => number {
  let r = rngs.get(key);
  if (!r) {
    r = makeRng(seed);
    rngs.set(key, r);
    if (rngs.size > 64) rngs.delete(rngs.keys().next().value!);
  }
  return r;
}

export function randomDecision(G: LandgrabState, p: number, rng: () => number): Decision | null {
  const view = viewFor(G, p);
  if (view.reaction) {
    if (view.reaction.reactor !== p) return null;
    const opts = legalResponses(view, p);
    return { type: 'respond', response: opts[Math.floor(rng() * opts.length)] };
  }
  const acts = legalActions(view, p).filter((a) => a.kind !== 'endTurn');
  if (!acts.length) return { type: 'act', action: { kind: 'endTurn' } };
  // Pick an option uniformly first, then a target, so options with many targets don't dominate.
  const groups = new Map<string, Action[]>();
  for (const a of acts) {
    const k = optionKey(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const keys = [...groups.keys()];
  const g = groups.get(keys[Math.floor(rng() * keys.length)])!;
  return { type: 'act', action: g[Math.floor(rng() * g.length)] };
}

interface Scored {
  a: Action;
  score: number;
  after: LandgrabState;
}

/** Simulate the shortlisted legal actions and score each against the faction's evaluation. */
function scoreActions(
  view: LandgrabState,
  p: number,
  policy: Policy,
  rng: () => number,
  shortlistSize: number,
  trace?: AIOptions['trace']
): Scored[] {
  const groups = new Map<string, Action[]>();
  for (const a of legalActions(view, p)) {
    if (a.kind === 'endTurn') continue;
    const k = optionKey(a);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(a);
  }
  const before = policy.evaluate(view, p);
  const out: Scored[] = [];
  for (const group of groups.values()) {
    let shortlist = group;
    if (group.length > GROUP_LIMIT || group.length > shortlistSize * 2) {
      const scored = group.map((a) => ({
        a,
        s: (policy.prefilter?.(view, p, a) ?? 0) + basePrefilter(view, p, a) + rng() * 0.01,
      }));
      scored.sort((x, y) => y.s - x.s);
      shortlist = scored.slice(0, shortlistSize).map((x) => x.a);
    }
    for (const a of shortlist) {
      const after = simulate(view, p, a);
      if (!after) continue;
      const score = policy.evaluate(after, p) - before + (policy.bonus?.(view, after, p, a) ?? 0) + rng() * 0.01;
      trace?.(a, score);
      out.push({ a, score, after });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

const SECOND_PLY = 5;

/** The bot's next decision for player `p`, or null when it is not their call. */
export function getAIMove(G: LandgrabState, p: number, opts: AIOptions = {}): Decision | null {
  if (G.winner) return null;
  const rng = rngFor(`${opts.random ? 'r' : 'p'}${p}:${opts.seed ?? 0}`, (opts.seed ?? 1) * 7919 + p);
  if (opts.random) return randomDecision(G, p, rng);

  const view = viewFor(G, p);
  const policy = POLICIES[view.players[p].type];
  if (view.reaction) {
    if (view.reaction.reactor !== p) return null;
    return { type: 'respond', response: policy.react(view, p, legalResponses(view, p)) };
  }
  if (view.turn.player !== p) return null;

  const first = scoreActions(view, p, policy, rng, SHORTLIST, opts.trace);
  // Two-step plans inside one turn (buy wood, then build): look one action further for the best few.
  let best: Action = { kind: 'endTurn' };
  let bestTotal = 0.05;
  for (const [i, s] of first.entries()) {
    let follow = 0;
    const t = s.after.turn;
    if (i < SECOND_PLY && t.player === p && t.actionsLeft > 0 && !s.after.reaction && !s.after.winner) {
      const second = scoreActions(s.after, p, policy, rng, 3);
      if (second.length) follow = Math.max(0, second[0].score) * 0.9;
    }
    const total = s.score + follow;
    if (total > bestTotal) {
      bestTotal = total;
      best = s.a;
    }
  }
  return { type: 'act', action: best };
}
