/**
 * Industrialist: build Zones where there is most to extract, extract every
 * turn, expand before targets run out (spec 6).
 */
import { isDeveloped } from '../game/board';
import { zoneLegal } from '../game/moves/map';
import type { Action, Cell, LandgrabState } from '../game/types';
import { commonValue } from './common';
import type { Policy } from './shared';

/**
 * How likely a cell is to be something to extract: 1 for known Rainforest,
 * Hills or Mountain; about two thirds of hidden land is one of those, so
 * fogged cells count for less.
 */
function targetWeight(m: Cell): number {
  if (isDeveloped(m) || m.siteId !== undefined) return 0;
  if (m.designation === 'Protected' || m.designation === 'Listed') return 0;
  if (m.holding && m.holding !== 'Industrialist') return 0;
  if (m.terrain === 'Unknown') return m.fog ? 0.3 : 0.6;
  if (m.fog) return 0;
  return m.terrain === 'Rainforest' || m.terrain === 'Hills' || m.terrain === 'Mountain' ? 1 : 0;
}

function zones(G: LandgrabState): number[] {
  return G.cells.filter((c) => c.building === 'IndustrialZone' && c.buildingOwner === 'Industrialist').map((c) => c.id);
}

export function industrialTargets(G: LandgrabState, zs = zones(G)): number {
  const seen = new Set<number>();
  let w = 0;
  for (const z of zs) {
    for (const n of G.cells[z].neighbors) {
      if (seen.has(n)) continue;
      seen.add(n);
      w += targetWeight(G.cells[n]);
    }
  }
  return w;
}

/** Hops from the nearest Zone to the nearest cell worth extracting (capped at 6). */
function distanceToTargets(G: LandgrabState, zs: number[]): number {
  const seen = new Set<number>(zs);
  let frontier = [...zs];
  for (let d = 1; d <= 5; d++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const n of G.cells[id].neighbors) {
        if (seen.has(n)) continue;
        seen.add(n);
        const c = G.cells[n];
        // Known targets only: Zones can never sit next to Fog, so fog cannot pull them along.
        if (!c.fog && targetWeight(c) >= 0.6) return d;
        if (c.terrain !== 'Ocean' && c.terrain !== 'CoastalWater') next.push(n);
      }
    }
    frontier = next;
  }
  return 6;
}

/**
 * Where a new Zone could go right now (ignoring cost), weighted by what it
 * would reach. Surveys that clear Fog from the frontier raise this.
 */
function zoneSpots(G: LandgrabState, p: number): number {
  let v = 0;
  const near = new Set<number>();
  for (const c of G.cells) {
    if (c.building === 'IndustrialZone' && c.buildingOwner === 'Industrialist' || c.building === 'PublicWork') {
      for (const n of c.neighbors) near.add(n);
    }
  }
  for (const id of near) {
    if (zoneLegal(G, p, id)) continue;
    let w = 0;
    for (const n of G.cells[id].neighbors) w += targetWeight(G.cells[n]);
    v += Math.min(1, w / 2);
  }
  return v;
}

const EXTRACTING = new Set(['Extract', 'Excavate', 'Prospect', 'Clearance']);

export const industrialistPolicy: Policy = {
  faction: 'Industrialist',
  evaluate: (G, p) => {
    const r = G.players[p].resources;
    const zs = zones(G);
    return (
      commonValue(G, p) +
      r.wood + r.ore +
      Math.min(r.coins, 2) * 1.2 + Math.max(0, Math.min(r.coins, 8) - 2) * 0.4 +
      r.votes * 0.3 +
      Math.min(industrialTargets(G, zs), 8) * 0.5 +
      Math.min(zoneSpots(G, p), 4) * 0.6 +
      zs.length * 0.3 -
      Math.max(0, distanceToTargets(G, zs) - 1) * 0.5
    );
  },
  bonus: (before, after, _p, a: Action) => {
    if (a.kind !== 'use') return 0;
    // Extraction is the Industrialist's income: do it every turn.
    if (a.option && EXTRACTING.has(a.option)) return 1.5;
    if (a.option === 'Survey' || a.option === 'SurveyGrant') {
      // Clearing Fog off the frontier opens new Zone sites.
      return Math.max(0, zoneSpots(after, _p) - zoneSpots(before, _p)) * 1.0;
    }
    if (a.option === 'Establish') {
      const zb = zones(before);
      const tb = industrialTargets(before, zb);
      const gained = Math.max(0, industrialTargets(after) - tb);
      const closer = Math.max(0, distanceToTargets(before, zb) - distanceToTargets(after, zones(after)));
      // Expand before targets run out, toward the most to extract.
      return Math.min(gained, 4) * 1.5 + (tb <= 2 ? 1.5 + closer * 2 : 0);
    }
    return 0;
  },
  react: (G, _p, options) => {
    const r = G.reaction!;
    if (r.kind === 'objectionResponse') return options.includes('pay') ? 'pay' : 'abandon';
    return options.includes('accept') ? 'accept' : options[options.length - 1];
  },
};
