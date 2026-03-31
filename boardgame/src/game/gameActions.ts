import type { LandgrabState, ResourceTrack } from './types';
import { MANDATE_INTERVALS, MANDATE_RECURRING_INTERVAL } from './types';

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function countFog(tiles: LandgrabState["tiles"]): number {
  return Object.values(tiles).filter((t) => t.type === "Fog").length;
}

export function updateFogCount(G: LandgrabState): void {
  const currentFog = countFog(G.tiles);
  G.fogRevealed = G.totalFog - currentFog;
  if (!G.thresholdReached && G.fogRevealed >= Math.floor(G.totalFog / 2) + 1) {
    G.thresholdReached = true;
    G.politicsRow[3] = "Mandate";
  }
}

function getMandateMilestone(intervalIndex: number): number {
  if (intervalIndex < MANDATE_INTERVALS.length) {
    return MANDATE_INTERVALS.slice(0, intervalIndex + 1).reduce((a: number, b: number) => a + b, 0);
  }
  const base = MANDATE_INTERVALS.reduce((a: number, b: number) => a + b, 0);
  return base + (intervalIndex - MANDATE_INTERVALS.length + 1) * MANDATE_RECURRING_INTERVAL;
}

/**
 * Politics cards eligible for the random slot after a Mandate (matches setup pool minus Mandate/Graft —
 * Graft is always injected first so players can convert coins to votes).
 */
const POST_MANDATE_RANDOM_EVENT_CANDIDATES: string[] = [
  'Bribe',
  'Zoning',
  'Conservation',
  'UrbanPlanning',
  'Dividends',
  'NGOBacking',
  'Propaganda',
  'LocalElections',
  'Reorganization',
  'Import',
  'Export',
  'Logging',
  'Forestry',
  'LandClaims',
  'Subsidy',
  'Boycotting',
  'Protests',
  'Taxation',
  'Levy',
  'Expropriation',
  'Airstrip',
  'Fisheries',
];

/**
 * After a Mandate leaves the politics row (purchased with Liaison or rotated off at end of round),
 * prepend Graft then a random event to the top of the politics deck so upcoming draws keep offering
 * coin→vote and other events before the next Mandate cycle.
 */
export function injectPostMandateVoteFunnel(G: LandgrabState): void {
  if (POST_MANDATE_RANDOM_EVENT_CANDIDATES.length === 0) return;
  const idx = Math.floor(Math.random() * POST_MANDATE_RANDOM_EVENT_CANDIDATES.length);
  const randomEvent = POST_MANDATE_RANDOM_EVENT_CANDIDATES[idx]!;
  G.politicsDeck.unshift(randomEvent);
  G.politicsDeck.unshift('Graft');
}

/**
 * After a Politics Event is taken from slotIndex (Liaison votes or Bribe coin),
 * remove that card, shift remaining cards toward the cheaper slots, draw one replacement into the most expensive slot.
 */
export function shiftPoliticsRowAfterPurchase(G: LandgrabState, slotIndex: number): void {
  if (slotIndex < 0 || slotIndex > 3) return;
  G.politicsRow.splice(slotIndex, 1);
  const drawn = G.politicsDeck.shift() ?? null;
  G.politicsRow.push(drawn);
}

/** End-of-round rotation: remove Slot 0, shift left, draw 1 into Slot 3 */
export function rotatePoliticsEndOfRound(G: LandgrabState): void {
  const removed = G.politicsRow[0];
  const [, ...rest] = G.politicsRow;
  let drawn = G.politicsDeck.shift() ?? null;
  G.politicsRow = [
    rest[0] ?? null,
    rest[1] ?? null,
    rest[2] ?? null,
    drawn,
  ];

  if (removed === 'Mandate') {
    G.politicsDeck.push('Mandate');
    injectPostMandateVoteFunnel(G);
  }

  if (G.thresholdReached) {
    G.revealedPoliticsSinceThreshold += 1;
    const milestone = getMandateMilestone(G.mandateIntervalIndex);
    if (G.revealedPoliticsSinceThreshold >= milestone) {
      const mandateAlreadyVisible = G.politicsRow.some(c => c === 'Mandate');
      if (!mandateAlreadyVisible) {
        if (drawn !== null) G.politicsDeck.unshift(drawn);
        G.politicsRow[3] = 'Mandate';
      } else {
        G.politicsDeck.push('Mandate');
      }
      G.mandateIntervalIndex += 1;
    }
  }
}
/** Buy cheapest available resources from a market track */
export function buyFromMarket(
  track: ResourceTrack,
  count: number
): { newTrack: ResourceTrack; totalCost: number } | null {
  const newTrack = [...track] as ResourceTrack;
  let totalCost = 0;
  let bought = 0;
  for (let i = 0; i < 4 && bought < count; i++) {
    if (newTrack[i] > 0) {
      newTrack[i] = 0;
      totalCost += i + 1;
      bought++;
    }
  }
  if (bought < count) return null;
  return { newTrack, totalCost };
}

/** Sell resources to highest-priced empty slots first */
export function sellToMarket(
  track: ResourceTrack,
  count: number
): { newTrack: ResourceTrack; totalGain: number } | null {
  const newTrack = [...track] as ResourceTrack;
  let totalGain = 0;
  let sold = 0;
  for (let i = 3; i >= 0 && sold < count; i--) {
    if (newTrack[i] === 0) {
      newTrack[i] = 1;
      totalGain += i + 1;
      sold++;
    }
  }
  if (sold < count) return null;
  return { newTrack, totalGain };
}
