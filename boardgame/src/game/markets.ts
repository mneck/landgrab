/**
 * Personnel Row and Politics Track (spec 4.2) share one slide-and-refill
 * mechanism: four slots priced 0..3, a bought card leaves a gap, cheaper
 * cards stay, dearer cards slide down, and the top slot refills from the deck.
 * The resource market keeps the v2 four-slot price tracks.
 */
import { BALANCE } from './balance';
import { log } from './board';
import type { LandgrabState, MarketRow, ResourceTrack } from './types';

export const MANDATE = 'Mandate';

function slideAndRefill(row: MarketRow, draw: () => string | null): void {
  const kept = row.filter((c): c is string => c !== null);
  while (kept.length < BALANCE.marketSlots) {
    const next = draw();
    if (next === null) break;
    kept.push(next);
  }
  for (let i = 0; i < BALANCE.marketSlots; i++) row[i] = kept[i] ?? null;
}

export function drawPersonnel(G: LandgrabState): string | null {
  return G.personnelDeck.shift() ?? null;
}

function mandateDue(G: LandgrabState): boolean {
  if (!G.mandateTriggered || G.mandatesInDeck <= 0) return false;
  if (G.politicsRow.includes(MANDATE)) return false;
  const intervals = BALANCE.mandateIntervals;
  const due = G.mandateIntervalIndex < intervals.length
    ? intervals[G.mandateIntervalIndex]
    : BALANCE.mandateRecurringInterval;
  return G.politicsDrawsSinceMandate >= due;
}

export function drawPolitics(G: LandgrabState): string | null {
  if (mandateDue(G)) {
    G.mandatesInDeck -= 1;
    G.politicsDrawsSinceMandate = 0;
    G.mandateIntervalIndex += 1;
    log(G, G.turn.player, 'A Mandate enters the Politics Track');
    return MANDATE;
  }
  const card = G.politicsDeck.shift() ?? null;
  if (card !== null) G.politicsDrawsSinceMandate += 1;
  else if (G.mandateTriggered && G.mandatesInDeck > 0 && !G.politicsRow.includes(MANDATE)) {
    // Deck exhausted: Mandates still come out so the game can end.
    G.mandatesInDeck -= 1;
    return MANDATE;
  }
  return card;
}

export function takeFromPersonnelRow(G: LandgrabState, slot: number): string | null {
  const card = G.personnelRow[slot];
  if (!card) return null;
  G.personnelRow[slot] = null;
  slideAndRefill(G.personnelRow, () => drawPersonnel(G));
  return card;
}

export function takeFromPoliticsRow(G: LandgrabState, slot: number): string | null {
  const card = G.politicsRow[slot];
  if (!card) return null;
  G.politicsRow[slot] = null;
  slideAndRefill(G.politicsRow, () => drawPolitics(G));
  return card;
}

/** Discards a non-Mandate Politics card (Bribe). */
export function discardPolitics(G: LandgrabState, slot: number): boolean {
  const card = G.politicsRow[slot];
  if (!card || card === MANDATE) return false;
  G.politicsDeck.push(card);
  G.politicsRow[slot] = null;
  slideAndRefill(G.politicsRow, () => drawPolitics(G));
  return true;
}

/**
 * End of round: the cheapest card in each row is discarded so both rows keep
 * moving. A Mandate is never discarded; the cheapest other card goes instead.
 * The Politics Track also gets a chance to surface a due Mandate.
 */
export function rotateRows(G: LandgrabState): void {
  const p = G.personnelRow.findIndex((c) => c !== null);
  if (p >= 0) {
    const card = G.personnelRow[p]!;
    G.personnelRow[p] = null;
    G.personnelDeck.push(card);
    slideAndRefill(G.personnelRow, () => drawPersonnel(G));
  }
  const q = G.politicsRow.findIndex((c) => c !== null && c !== MANDATE);
  if (q >= 0) {
    G.politicsDeck.push(G.politicsRow[q]!);
    G.politicsRow[q] = null;
    slideAndRefill(G.politicsRow, () => drawPolitics(G));
  }
  if (mandateDue(G)) {
    // Make room at the top for a due Mandate by dropping the cheapest card.
    const r = G.politicsRow.findIndex((c) => c !== null && c !== MANDATE);
    if (r >= 0 && !G.politicsRow.includes(null)) {
      G.politicsDeck.push(G.politicsRow[r]!);
      G.politicsRow[r] = null;
    }
    slideAndRefill(G.politicsRow, () => drawPolitics(G));
  }
}

// ---------------------------------------------------------------------------
// Resource market: slot i holds one unit priced i+1 coins.
// ---------------------------------------------------------------------------

export function trackFor(G: LandgrabState, res: 'wood' | 'ore'): ResourceTrack {
  return res === 'wood' ? G.woodMarket : G.oreMarket;
}

export function buyCost(track: ResourceTrack, amount: number): number | null {
  let cost = 0;
  let n = 0;
  for (let i = 0; i < track.length && n < amount; i++) {
    if (track[i]) {
      cost += i + 1;
      n++;
    }
  }
  return n === amount ? cost : null;
}

export function sellValue(track: ResourceTrack, amount: number): number | null {
  let value = 0;
  let n = 0;
  for (let i = track.length - 1; i >= 0 && n < amount; i--) {
    if (!track[i]) {
      value += i + 1;
      n++;
    }
  }
  return n === amount ? value : null;
}

export function applyBuy(track: ResourceTrack, amount: number): void {
  let n = 0;
  for (let i = 0; i < track.length && n < amount; i++) {
    if (track[i]) {
      track[i] = false;
      n++;
    }
  }
}

export function applySell(track: ResourceTrack, amount: number): void {
  let n = 0;
  for (let i = track.length - 1; i >= 0 && n < amount; i--) {
    if (!track[i]) {
      track[i] = true;
      n++;
    }
  }
}

/** End of round import: one unit enters the dearest empty slot. Slower from Last Season stage 1. */
export function restockMarket(G: LandgrabState): void {
  if (G.lastSeasonStage >= 1 && G.turn.round % 2 === 1) return;
  for (const track of [G.woodMarket, G.oreMarket]) {
    for (let i = track.length - 1; i >= 0; i--) {
      if (!track[i]) {
        track[i] = true;
        break;
      }
    }
  }
}
