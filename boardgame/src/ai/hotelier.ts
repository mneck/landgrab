/**
 * Hotelier: buy where sale value is high, develop, and sell (spec 6).
 */
import { fogAdjacent, hotelValue, isDeveloped } from '../game/board';
import type { LandgrabState } from '../game/types';
import { BUILDABLE } from '../game/types';
import { mandateBaseCost } from '../game/economy';
import { commonValue } from './common';
import type { Policy } from './shared';

export const hotelierPolicy: Policy = {
  faction: 'Hotelier',
  evaluate: (G: LandgrabState, p: number) => {
    const me = G.players[p];
    const r = me.resources;
    let v = commonValue(G, p) + r.coins + r.votes * 0.3 + G.holdingsRemaining * 0.3;
    let developable = 0;
    const hotels: number[] = [];
    for (const c of G.cells) {
      if (c.building === 'Hotel' && c.buildingOwner === 'Hotelier' && !c.sold) hotels.push(hotelValue(G, c.id));
    }
    // Hold Hotels while they appreciate; sell when the sale funds a Mandate.
    const need = mandateBaseCost(me);
    const canFund = r.coins + hotels.reduce((a, b) => a + b, 0) >= need;
    for (const h of hotels) v += canFund ? h * 0.9 : h * 1.05;
    for (const c of G.cells) {
      if (c.building === 'Hotel' && c.buildingOwner === 'Hotelier' && !c.sold) {
        continue;
      } else if (c.holding === 'Hotelier' && !isDeveloped(c)) {
        // A Holding is worth part of the Hotel it can become.
        const potential = BUILDABLE.has(c.terrain) ? hotelValue(G, c.id) : 0;
        v += 0.6 * Math.max(0, potential - 3);
        if (potential > 0 && !c.fog && !fogAdjacent(G, c.id)) developable++;
      }
    }
    // Wood and ore are worth their replacement price while a Holding waits for them.
    const woodNeed = Math.min(developable, 2);
    v += Math.min(r.wood, woodNeed) * 2 + Math.max(0, r.wood - woodNeed) * 0.8;
    v += r.ore * 0.8;
    return v;
  },
  react: (G, _p, options) => {
    const r = G.reaction!;
    if (r.kind === 'objectionResponse') return options.includes('pay') ? 'pay' : 'abandon';
    return options.includes('accept') ? 'accept' : options[options.length - 1];
  },
};
