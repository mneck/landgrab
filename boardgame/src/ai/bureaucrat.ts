/**
 * Bureaucrat: Public Works where they touch most buildings, Zone cells
 * others are about to build on, object against whoever is closest to a
 * Mandate (spec 6).
 */
import { winCurrency } from '../game/economy';
import { MANDATE } from '../game/markets';
import type { LandgrabState } from '../game/types';
import { BUILDABLE } from '../game/types';
import { commonValue } from './common';
import type { Policy } from './shared';

/** Votes the Bureaucrat will collect at the start of each turn. */
export function registryIncome(G: LandgrabState): number {
  let n = 0;
  for (const c of G.cells) {
    if (!c.building || c.building === 'PublicWork') continue;
    if (c.neighbors.some((x) => G.cells[x].building === 'PublicWork')) n++;
    if (c.designation === 'Zoned' && c.designatedBy === 'Bureaucrat' && c.zonedFor === c.buildingOwner) n++;
  }
  return n + G.sites.filter((s) => s.status === 'Listed').length;
}

/** Zoned cells sitting next to the faction they are zoned for: likely future income. */
function zonedPotential(G: LandgrabState): number {
  let n = 0;
  for (const c of G.cells) {
    if (c.designation !== 'Zoned' || c.designatedBy !== 'Bureaucrat' || c.building) continue;
    if (!BUILDABLE.has(c.terrain)) continue;
    if (c.neighbors.some((x) => G.cells[x].buildingOwner === c.zonedFor || G.cells[x].holding === c.zonedFor)) n++;
  }
  return n;
}

export const bureaucratPolicy: Policy = {
  faction: 'Bureaucrat',
  evaluate: (G, p) => {
    const r = G.players[p].resources;
    return (
      commonValue(G, p) +
      r.votes +
      Math.min(r.coins, 6) * 0.4 +
      (r.wood + r.ore) * 0.2 +
      registryIncome(G) * 3 +
      Math.min(zonedPotential(G), 4) * 0.6
    );
  },
  react: (G, p, options) => {
    const r = G.reaction!;
    if (r.kind === 'objection') {
      // Object to Mandates, and to anyone well ahead on the way to one.
      const a = r.action;
      const isMandate = a.option === 'Policy' && a.slot !== undefined && G.politicsRow[a.slot] === MANDATE;
      const actor = G.players[r.actor];
      const leading = actor.seats > G.players[p].seats || winCurrency(G, r.actor) > 10 + actor.seats * 3;
      return (isMandate || leading) && options.includes('object') ? 'object' : 'pass';
    }
    if (r.kind === 'objectionResponse') return options.includes('pay') ? 'pay' : 'abandon';
    return options.includes('accept') ? 'accept' : options[options.length - 1];
  },
};
