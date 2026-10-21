import { describe, it, expect } from 'vitest';
import { generateCellMap, makeRng, polygonArea } from '../utils/cellMap';
import type { MapCell, Point } from '../utils/cellMap';
import { createInitialState } from '../game/setup';

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function isSimple(corners: Point[]): boolean {
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(corners[i], corners[i + 1], corners[j], corners[(j + 1) % n])) return false;
    }
  }
  return true;
}

function isConnected(cells: Record<string, MapCell>): boolean {
  const ids = Object.keys(cells);
  const seen = new Set([ids[0]]);
  const stack = [ids[0]];
  while (stack.length) {
    for (const n of cells[stack.pop()!].neighbors) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === ids.length;
}

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

describe('generateCellMap', () => {
  for (const mapRadius of [4, 5, 6]) {
    it(`produces a valid watertight mesh for radius ${mapRadius}`, () => {
      for (const seed of SEEDS) {
        const cells = generateCellMap({ mapRadius, rng: makeRng(seed) });
        expect(isConnected(cells)).toBe(true);
        for (const c of Object.values(cells)) {
          expect(c.corners.length).toBeGreaterThanOrEqual(4);
          expect(c.corners.length).toBeLessThanOrEqual(6);
          expect(polygonArea(c.corners)).toBeGreaterThan(0);
          expect(isSimple(c.corners)).toBe(true);
          expect(c.neighbors.length).toBeLessThanOrEqual(c.corners.length);
          for (const n of c.neighbors) {
            expect(cells[n].neighbors).toContain(c.id);
            // Rings are BFS layers, so neighbors are at most one ring apart.
            expect(Math.abs(cells[n].ring - c.ring)).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  }

  it('gives interior cells a mix of side counts', () => {
    const counts: Record<number, number> = {};
    for (const seed of SEEDS) {
      const cells = generateCellMap({ mapRadius: 5, rng: makeRng(seed) });
      for (const c of Object.values(cells)) {
        if (c.ring >= 5) continue;
        counts[c.neighbors.length] = (counts[c.neighbors.length] ?? 0) + 1;
      }
    }
    expect(counts[5]).toBeGreaterThan(0);
    expect(counts[6]).toBeGreaterThan(counts[4] ?? 0);
  });

  it('is deterministic for a given seed', () => {
    const a = generateCellMap({ mapRadius: 5, rng: makeRng(42) });
    const b = generateCellMap({ mapRadius: 5, rng: makeRng(42) });
    expect(a).toEqual(b);
  });
});

describe('generateIsland on a cell map', () => {
  for (const numPlayers of [2, 3, 4]) {
    it(`surrounds the island with water for ${numPlayers} players`, () => {
      for (const seed of SEEDS.slice(0, 10)) {
        const G = createInitialState(numPlayers, { mapSeed: seed });
        const tiles = Object.values(G.tiles);
        const coast = tiles.filter((t) => t.ring === G.fogRadius + 1);
        expect(coast.filter((t) => t.type === 'Mountain')).toHaveLength(2);
        expect(coast.filter((t) => t.type === 'Forest')).toHaveLength(2);
        expect(coast.filter((t) => t.type === 'Water')).toHaveLength(2);
        for (const t of tiles) {
          if (t.ring > G.fogRadius + 1) expect(t.type).toBe('Water');
          if (t.ring < G.fogRadius) expect(t.type).toBe('Fog');
          // Every coast cell touches the water rim.
          if (t.ring === G.fogRadius + 1) {
            expect(t.neighbors.some((n) => G.tiles[n].ring === G.mapRadius)).toBe(true);
          }
        }
        expect(G.totalFog).toBeGreaterThan(0);
      }
    });
  }

  it('lets clients rebuild geometry matching the stored topology', () => {
    const G = createInitialState(4, { mapSeed: 99 });
    const cells = generateCellMap({ mapRadius: G.mapRadius, rng: makeRng(G.mapSeed) });
    expect(Object.keys(cells).sort()).toEqual(Object.keys(G.tiles).sort());
    for (const [k, tile] of Object.entries(G.tiles)) {
      expect(cells[k].neighbors).toEqual(tile.neighbors);
      expect(cells[k].ring).toBe(tile.ring);
    }
  });

  it('reproduces the same island for the same mapSeed', () => {
    const a = createInitialState(3, { mapSeed: 7 });
    const b = createInitialState(3, { mapSeed: 7 });
    expect(a.tiles).toEqual(b.tiles);
  });
});
