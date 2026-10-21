/**
 * Shared bot machinery (spec 6): legal-move enumeration, a cheap per-option
 * prefilter, simulation on a private copy of the bot's own view, and card values.
 *
 * Bots only ever see `viewFor(G, me)`, so they cannot read Scout results,
 * hidden Site significance or fogged terrain that belongs to someone else.
 */
import { BALANCE } from '../game/balance';
import { hotelValue, isDeveloped, knowsCell } from '../game/board';
import { applyAction, legalActions, respond } from '../game/engine';
import { legalResponses } from '../game/reactions';
import type { Action, LandgrabState, PlayerType } from '../game/types';
import { BUILDABLE } from '../game/types';

export type Decision = { type: 'act'; action: Action } | { type: 'respond'; response: string };

export interface Policy {
  faction: PlayerType;
  /** How good the state is for player `p` (bigger is better). */
  evaluate: (G: LandgrabState, p: number) => number;
  /** Cheap score used to shortlist cell targets before simulating. */
  prefilter?: (G: LandgrabState, p: number, a: Action) => number;
  /**
   * Heuristic nudge added to the simulated value change: the faction habits
   * the spec describes (extract every turn, expand before targets run out...)
   * that a one-move lookahead cannot see for itself.
   */
  bonus?: (before: LandgrabState, after: LandgrabState, p: number, a: Action) => number;
  /** Answer to an open reaction window. */
  react: (G: LandgrabState, p: number, options: string[]) => string;
}

/** Bot-local RNG so bots never touch the game's stream. */
export function makeRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Copy for simulation. Cells are copied shallowly and share their `neighbors`
 * arrays, which the engine never mutates; this is ~20x cheaper than
 * structuredClone on a 700-cell map.
 */
export function clone(G: LandgrabState): LandgrabState {
  return {
    ...G,
    cells: G.cells.map((c) => ({ ...c })),
    sites: G.sites.map((s) => ({ ...s })),
    players: G.players.map((p) => ({ ...p, resources: { ...p.resources }, tableau: [...p.tableau] })),
    turn: { ...G.turn, usedCards: [...G.turn.usedCards] },
    scouted: Object.fromEntries(Object.entries(G.scouted).map(([k, v]) => [k, [...(v ?? [])]])),
    favors: [...G.favors],
    personnelRow: [...G.personnelRow],
    personnelDeck: [...G.personnelDeck],
    politicsRow: [...G.politicsRow],
    politicsDeck: [...G.politicsDeck],
    woodMarket: [...G.woodMarket] as LandgrabState['woodMarket'],
    oreMarket: [...G.oreMarket] as LandgrabState['oreMarket'],
    reaction: G.reaction ? structuredClone(G.reaction) : null,
    proposals: [...G.proposals],
    messages: G.messages,
    log: [],
    stats: {
      ...G.stats,
      surveyRevealed: [],
      acquired: G.stats.acquired.map((x) => ({ ...x })),
      played: G.stats.played.map((x) => ({ ...x })),
      options: G.stats.options.map((x) => ({ ...x })),
      mandateRounds: G.stats.mandateRounds.map((x) => [...x]),
    },
  };
}

/** Plays `a` on a copy, letting any reaction window through, and returns the copy (or null if illegal). */
export function simulate(G: LandgrabState, p: number, a: Action): LandgrabState | null {
  const S = clone(G);
  // The bot's own view of the future: no erosion lottery, no turn hand-over.
  if (a.kind === 'endTurn') return S;
  if (applyAction(S, p, a)) return null;
  for (let guard = 0; S.reaction && guard < 4; guard++) {
    const r = S.reaction;
    const pass = r.kind === 'interrupt' ? 'allow' : r.kind === 'objection' ? 'pass' : r.kind === 'objectionResponse' ? 'pay' : 'accept';
    const ok = legalResponses(S, r.reactor);
    respond(S, r.reactor, ok.includes(pass) ? pass : ok[ok.length - 1]);
  }
  return S;
}

/** Group key: actions that differ only in their target share an option. */
export function optionKey(a: Action): string {
  return a.kind === 'use' ? `${a.card}:${a.option}` : a.kind;
}

/** Is this cell's terrain known to the bot and good for building? */
export function knownBuildable(G: LandgrabState, me: PlayerType, id: number): boolean {
  return knowsCell(G, me, id) && BUILDABLE.has(G.cells[id].terrain);
}

/** Value of a card the bot might acquire, before slot cost. */
export const CARD_VALUE: Record<PlayerType, Record<string, number>> = {
  Hotelier: {
    Contractor: 2.5, HousingScheme: 2, Windfall: 2, Dividends: 2.5, Broker: 2.5, Import: 1.5, Surveyor: 1.5,
    SurveyGrant: 1.5, Endorsement: 2, Taxation: 1.5, ZoningPermit: 1.2, EminentDomain: 0.5, Consultant: 0.3,
    Lobbying: 0.8, Bribe: 0.6, Levy: 0.8, LandClaims: 0.5, Replanting: 0.8, Conservation: 0.4,
  },
  Industrialist: {
    Prospector: 3, Clearance: 2, Broker: 1.5, Import: 1.5, Endorsement: 2, ZoningPermit: 1.2, Surveyor: 1.2,
    SurveyGrant: 1.2, Dividends: 1, Windfall: 0.8, Lobbying: 0.6, Levy: 0.5, Consultant: 0.3,
  },
  Bureaucrat: {
    Lobbying: 2.5, Advocate: 1.5, Fixer: 1.5, LocalElections: 1.5, ZoningPermit: 1.5, Endorsement: 2,
    Surveyor: 1, SurveyGrant: 1, RemediationGrant: 1, Protests: 1, Levy: 0.6, HousingScheme: 1, Contractor: 1.2,
    Bribe: 1, Windfall: 0.8, Consultant: 0.3, Conservation: 0.6,
  },
  Chieftain: {
    Agitator: 2, LocalElections: 2, Advocate: 2, Lobbying: 2, Forester: 1.5, RemediationGrant: 1.5,
    Protests: 1.2, LandClaims: 1.5, Conservation: 1.2, Replanting: 0.8, Endorsement: 2.5, Surveyor: 1.5,
    SurveyGrant: 2, Taxation: 1, Windfall: 1, Fixer: 0.8, Bribe: 0.6, Consultant: 0.2,
  },
};

/** Sum of card values in a tableau (unused Events and Personnel) for evaluation. */
export function tableauValue(G: LandgrabState, p: number): number {
  const table = CARD_VALUE[G.players[p].type];
  let v = 0;
  for (const c of G.players[p].tableau) v += table[c.cardType] ?? 0;
  // Restructuring has value only as a way out of a full tableau.
  return v;
}

/** Progress toward the next Mandate in own currency, 0..1. */
export function mandateProgress(G: LandgrabState, p: number, currency: number): number {
  const pl = G.players[p];
  const need = BALANCE.mandateBase[pl.type] + BALANCE.mandatePerSeat[pl.type] * pl.seats;
  return Math.min(1, currency / need);
}

export function openHotelSpots(G: LandgrabState, me: PlayerType): number[] {
  return G.cells.filter((c) => c.holding === me && !isDeveloped(c)).map((c) => c.id);
}

export function projectedHotel(G: LandgrabState, id: number): number {
  return hotelValue(G, id);
}

export { legalActions, legalResponses };
