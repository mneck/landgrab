/**
 * Evaluation terms every faction shares.
 */
import { BALANCE } from '../game/balance';
import { hasClaim } from '../game/board';
import type { LandgrabState } from '../game/types';
import { BUILDABLE } from '../game/types';
import { tableauValue } from './shared';

/** Mandates appear only after half the fog lifts, so everyone values revealing up to that point. */
export function fogProgress(G: LandgrabState): number {
  const known = G.landCount - (G.totalFog - G.fogRevealed);
  const need = Math.max(1, G.landCount * BALANCE.mandateFogThreshold);
  return Math.min(known, need) * 0.15;
}

/**
 * Room to grow that fog is blocking: open buildable cells next to my pieces
 * that cannot be built on because they touch Fog, plus fogged cells next to
 * my pieces. Nothing may be built next to Fog.
 */
export function fogPressure(G: LandgrabState, p: number): number {
  const me = G.players[p].type;
  const mine = (id: number) => {
    const c = G.cells[id];
    return c.buildingOwner === me || c.holding === me || (me === 'Chieftain' && hasClaim(c));
  };
  let n = 0;
  for (const c of G.cells) {
    if (!c.neighbors.some(mine)) continue;
    if (c.fog) n += 1;
    else if (!c.building && BUILDABLE.has(c.terrain) && c.neighbors.some((x) => G.cells[x].fog)) n += 1;
  }
  return n;
}

export function commonValue(G: LandgrabState, p: number): number {
  const pl = G.players[p];
  return pl.seats * 30 + tableauValue(G, p) * 0.5 + fogProgress(G) - fogPressure(G, p) * 0.4;
}
