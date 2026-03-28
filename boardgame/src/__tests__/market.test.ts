import { describe, it, expect } from 'vitest';
import { buyFromMarket, sellToMarket } from '../game/gameActions';
import type { ResourceTrack } from '../game/types';

describe('buyFromMarket', () => {
  it('buys the cheapest available resource', () => {
    const track: ResourceTrack = [0, 0, 1, 1];
    const result = buyFromMarket(track, 1);
    expect(result).not.toBeNull();
    expect(result!.totalCost).toBe(3); // slot index 2 → cost 3
    expect(result!.newTrack).toEqual([0, 0, 0, 1]);
  });

  it('buys multiple resources in order of cheapest', () => {
    const track: ResourceTrack = [1, 1, 1, 1];
    const result = buyFromMarket(track, 2);
    expect(result).not.toBeNull();
    expect(result!.totalCost).toBe(3); // slot 0 (cost 1) + slot 1 (cost 2) = 3
    expect(result!.newTrack).toEqual([0, 0, 1, 1]);
  });

  it('returns null when not enough resources on market', () => {
    const track: ResourceTrack = [0, 0, 0, 1];
    const result = buyFromMarket(track, 2);
    expect(result).toBeNull();
  });

  it('returns null when market is empty', () => {
    const track: ResourceTrack = [0, 0, 0, 0];
    const result = buyFromMarket(track, 1);
    expect(result).toBeNull();
  });
});

describe('sellToMarket', () => {
  it('sells to the highest-priced empty slot first', () => {
    const track: ResourceTrack = [1, 1, 0, 0];
    const result = sellToMarket(track, 1);
    expect(result).not.toBeNull();
    expect(result!.totalGain).toBe(4); // slot 3 (highest empty) → gain 4
    expect(result!.newTrack).toEqual([1, 1, 0, 1]);
  });

  it('sells multiple resources in order of highest empty slot', () => {
    const track: ResourceTrack = [1, 0, 0, 0];
    const result = sellToMarket(track, 2);
    expect(result).not.toBeNull();
    expect(result!.totalGain).toBe(7); // slot 3 (4) + slot 2 (3) = 7
    expect(result!.newTrack).toEqual([1, 0, 1, 1]);
  });

  it('returns null when no empty slots', () => {
    const track: ResourceTrack = [1, 1, 1, 1];
    const result = sellToMarket(track, 1);
    expect(result).toBeNull();
  });

  it('returns null when not enough empty slots', () => {
    const track: ResourceTrack = [1, 1, 1, 0];
    const result = sellToMarket(track, 2);
    expect(result).toBeNull();
  });
});
