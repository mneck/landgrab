import type { LandgrabState, ResourceTrack } from './types';
import { MANDATE_INTERVALS } from './types';

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
  return 10 + (intervalIndex - MANDATE_INTERVALS.length);
}

/** End-of-round rotation: remove Slot 0, shift left, draw 1 into Slot 3 */
export function rotatePoliticsEndOfRound(G: LandgrabState): void {
  const [, ...rest] = G.politicsRow;
  const drawn = G.politicsDeck.shift() ?? null;
  G.politicsRow = [
    rest[0] ?? null,
    rest[1] ?? null,
    rest[2] ?? null,
    drawn,
  ];

  if (G.thresholdReached) {
    G.revealedPoliticsSinceThreshold += 1;
    const milestone = getMandateMilestone(G.mandateIntervalIndex);
    if (G.revealedPoliticsSinceThreshold >= milestone) {
      G.politicsRow[3] = "Mandate";
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
