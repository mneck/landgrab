/**
 * Chieftain: spread Presence to grow the largest connected claim, Survey for
 * coins, hold Grievance unless spending it protects or gains Standing (spec 6).
 */
import { BALANCE } from '../game/balance';
import { hasClaim, standing, villageCount } from '../game/board';
import type { LandgrabState } from '../game/types';
import { commonValue } from './common';
import type { Policy } from './shared';

export const chieftainPolicy: Policy = {
  faction: 'Chieftain',
  evaluate: (G: LandgrabState, p: number) => {
    const r = G.players[p].resources;
    const claims = G.cells.filter(hasClaim).length;
    return (
      commonValue(G, p) +
      standing(G) * 1.5 +
      claims * 0.2 +
      villageCount(G) * 0.5 +
      r.votes * 0.6 +
      Math.min(r.coins, 8) * 0.4 +
      G.grievance * 0.8
    );
  },
  react: (G, _p, options) => {
    const r = G.reaction!;
    if (r.kind === 'interrupt') {
      const c = G.cells[r.cell];
      // Stop placements that would eat claimed land; let others through while Grievance is scarce.
      const eatsClaim = !!c.presence;
      const threatensVillage = c.neighbors.some((n) => G.cells[n].village);
      if ((eatsClaim || threatensVillage) && G.grievance >= BALANCE.interruptCost) return 'interrupt';
      if (G.grievance >= BALANCE.grievanceCap) return 'interrupt';
      return 'allow';
    }
    if (r.kind === 'objectionResponse') return options.includes('pay') ? 'pay' : 'abandon';
    return options.includes('accept') ? 'accept' : options[options.length - 1];
  },
};
