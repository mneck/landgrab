/**
 * Irregular polygon map for Landgrab.
 *
 * Cells come from a Voronoi diagram over a jittered hex lattice, then short
 * sides are collapsed (merging their endpoints) and over-connected cells have
 * their shortest side collapsed until no cell has more than `maxSides` sides.
 * The result has 4-6 sided cells whose adjacency is a shared edge, so game
 * rules only need `neighbors` and never coordinates.
 *
 * Only +, -, *, / and sqrt are used on coordinates (all exactly rounded per
 * IEEE 754), so a seed yields identical geometry on every machine. Game state
 * keeps just the seed and topology; clients rebuild corners for drawing.
 *
 * Why a shared vertex pool: each Voronoi vertex belongs to ~3 cells. Storing
 * cells as index lists into one vertex array and merging vertices with
 * union-find keeps every cell touching a collapsed edge watertight.
 *
 * Ported from edge_collapse.py (collapse + cap_degree).
 */

import { Delaunay } from 'd3-delaunay';
import { hexDistance, hexToPixel, makeHexagonalShape } from './hexGrid';

export interface Point {
  x: number;
  y: number;
}

export interface MapCell {
  id: string;
  /** Polygon centroid, in lattice units (neighboring cell centers ~1 apart). */
  center: Point;
  /** Polygon corners in order, in lattice units. */
  corners: Point[];
  /** Ids of cells sharing an edge. Symmetric. */
  neighbors: string[];
  /**
   * Hex-ring equivalent: the outermost layer of cells is `mapRadius`, the next
   * layer in is `mapRadius - 1`, and so on, clamped at 0. Measured as graph
   * distance from the sea, so it follows the irregular coastline.
   */
  ring: number;
}

export interface CellMapOptions {
  /** Number of lattice rings; the outermost one becomes the water rim. */
  mapRadius: number;
  rng?: () => number;
  /** Max seed displacement as a fraction of lattice spacing. */
  jitter?: number;
  /** Lloyd relaxation passes; evens out cell sizes after jitter. */
  relaxPasses?: number;
  /** No side shorter than this times the cell's longest side. */
  minSideRatio?: number;
  /** Upper bound on side count (and so neighbor count). */
  maxSides?: number;
  /** A collapse never drops a cell below this many sides. */
  minSides?: number;
}

/** Deterministic PRNG (mulberry32) for reproducible maps. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class DSU {
  private p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    this.p[Math.max(ra, rb)] = Math.min(ra, rb);
    return true;
  }
}

/** Drop consecutive repeats, including wraparound. */
function dedupe(seq: number[]): number[] {
  return seq.filter((v, i) => v !== seq[(i - 1 + seq.length) % seq.length]);
}

function polygonCentroid(pts: Point[]): Point {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Voronoi cells of the first `nReal` points as index lists into a shared
 * vertex array (one vertex per Delaunay triangle circumcenter). Every real
 * point must be interior, which the ghost rings guarantee.
 */
function voronoiMesh(points: Point[], nReal: number): { vertices: Point[]; regions: number[][] } {
  const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
  const { triangles, halfedges, inedges } = delaunay;
  const nTri = triangles.length / 3;
  const vertices: Point[] = [];
  for (let t = 0; t < nTri; t++) {
    const a = points[triangles[3 * t]], b = points[triangles[3 * t + 1]], c = points[triangles[3 * t + 2]];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    vertices.push({
      x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
      y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
    });
  }

  const regions: number[][] = [];
  for (let i = 0; i < nReal; i++) {
    const e0 = inedges[i];
    if (e0 === -1) throw new Error(`cellMap: point ${i} is coincident`);
    const region: number[] = [];
    let e = e0;
    do {
      region.push(Math.floor(e / 3));
      e = e % 3 === 2 ? e - 2 : e + 1;
      e = halfedges[e];
    } while (e !== e0 && e !== -1);
    if (e === -1) throw new Error(`cellMap: real point ${i} lies on the hull`);
    regions.push(region);
  }
  return { vertices, regions };
}

/**
 * Repeatedly collapse one edge per cell, chosen by `pick`, until no cell
 * wants a collapse. Each pass touches a cell at most once (either as the
 * picker or as the cell across the edge), so no cell loses two sides at once,
 * and a collapse is skipped if either cell would drop below `minSides`.
 */
function collapsePasses(
  vertices: Point[],
  regions: number[][],
  minSides: number,
  pick: (pts: Point[], seg: number[]) => number | null,
  maxPasses = 40
): { vertices: Point[]; regions: number[][] } {
  const dsu = new DSU(vertices.length);

  const positions = (): Point[] => {
    const sums = vertices.map(() => ({ x: 0, y: 0, n: 0 }));
    vertices.forEach((v, i) => {
      const r = sums[dsu.find(i)];
      r.x += v.x; r.y += v.y; r.n += 1;
    });
    return sums.map((s) => (s.n ? { x: s.x / s.n, y: s.y / s.n } : { x: 0, y: 0 }));
  };
  const current = () => regions.map((r) => dedupe(r.map((v) => dsu.find(v))));

  for (let pass = 0; pass < maxPasses; pass++) {
    const pos = positions();
    const cur = current();
    const edgeOwners = new Map<string, number[]>();
    cur.forEach((idx, c) => {
      idx.forEach((v, k) => {
        const w = idx[(k + 1) % idx.length];
        const key = v < w ? `${v},${w}` : `${w},${v}`;
        const list = edgeOwners.get(key);
        if (list) list.push(c);
        else edgeOwners.set(key, [c]);
      });
    });

    const touched = new Set<number>();
    let merged = 0;
    cur.forEach((idx, c) => {
      if (touched.has(c) || idx.length <= minSides) return;
      const pts = idx.map((v) => pos[v]);
      const seg = pts.map((p, k) => {
        const q = pts[(k + 1) % pts.length];
        return Math.sqrt((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
      });
      const k = pick(pts, seg);
      if (k === null) return;
      const a = idx[k], b = idx[(k + 1) % idx.length];
      const owners = edgeOwners.get(a < b ? `${a},${b}` : `${b},${a}`) ?? [c];
      if (owners.some((o) => touched.has(o) || cur[o].length <= minSides)) return;
      if (dsu.union(a, b)) {
        merged++;
        owners.forEach((o) => touched.add(o));
      }
    });
    if (merged === 0) break;
  }

  const pos = positions();
  const remap = new Map<number, number>();
  const outVertices: Point[] = [];
  const outRegions = current().map((idx) =>
    idx.map((v) => {
      if (!remap.has(v)) {
        remap.set(v, outVertices.length);
        outVertices.push(pos[v]);
      }
      return remap.get(v)!;
    })
  );
  return { vertices: outVertices, regions: outRegions };
}

/** Short-side rule: collapse the shortest side if it is below `ratio` × longest. */
export function collapseShortSides(vertices: Point[], regions: number[][], ratio: number, minSides: number) {
  return collapsePasses(vertices, regions, minSides, (_pts, seg) => {
    const max = Math.max(...seg);
    if (max <= 0) return null;
    const k = seg.indexOf(Math.min(...seg));
    return seg[k] < ratio * max ? k : null;
  });
}

/** Degree cap: collapse the shortest side of any cell with more than `maxSides`. */
export function capSides(vertices: Point[], regions: number[][], maxSides: number, minSides: number) {
  return collapsePasses(vertices, regions, minSides, (pts, seg) =>
    pts.length > maxSides ? seg.indexOf(Math.min(...seg)) : null
  );
}

export function generateCellMap(opts: CellMapOptions): Record<string, MapCell> {
  const {
    mapRadius,
    rng = Math.random,
    jitter = 0.42,
    relaxPasses = 1,
    // 0.2 leaves interior cells ~60% six-sided, ~36% five, ~4% four.
    minSideRatio = 0.2,
    maxSides = 6,
    minSides = 4,
  } = opts;
  if (mapRadius < 2) throw new Error('mapRadius must be >= 2');

  // Lattice with spacing 1. Two ghost rings outside the map keep every real
  // cell bounded and give the coastline its irregular edge; they are dropped.
  const origin = { q: 0, r: 0 };
  const SIZE = 1 / Math.sqrt(3);
  const lattice = makeHexagonalShape(mapRadius + 2)
    .map((h) => ({ h, d: hexDistance(h, origin) }))
    .sort((a, b) => (a.d > mapRadius ? 1 : 0) - (b.d > mapRadius ? 1 : 0));
  const nReal = lattice.filter((l) => l.d <= mapRadius).length;

  const points: Point[] = lattice.map(({ h, d }) => {
    const p = hexToPixel(h, SIZE);
    const j = d <= mapRadius ? jitter : d === mapRadius + 1 ? jitter * 0.35 : 0;
    // Uniform point in a disc by rejection, avoiding trig so every JS engine
    // rebuilds bit-identical geometry from the same seed.
    let dx: number, dy: number;
    do {
      dx = rng() * 2 - 1;
      dy = rng() * 2 - 1;
    } while (dx * dx + dy * dy > 1);
    return { x: p.x + dx * j, y: p.y + dy * j };
  });

  let mesh = voronoiMesh(points, nReal);
  for (let i = 0; i < relaxPasses; i++) {
    for (let c = 0; c < nReal; c++) {
      points[c] = polygonCentroid(mesh.regions[c].map((v) => mesh.vertices[v]));
    }
    mesh = voronoiMesh(points, nReal);
  }

  mesh = collapseShortSides(mesh.vertices, mesh.regions, minSideRatio, minSides);
  mesh = capSides(mesh.vertices, mesh.regions, maxSides, minSides);
  const { vertices, regions } = mesh;

  // Adjacency by shared edge (two consecutive corners), not shared corners,
  // so cells that touch only at a merged point are not neighbors.
  const edgeOwners = new Map<string, number[]>();
  regions.forEach((idx, c) => {
    idx.forEach((v, k) => {
      const w = idx[(k + 1) % idx.length];
      const key = v < w ? `${v},${w}` : `${w},${v}`;
      const list = edgeOwners.get(key);
      if (list) list.push(c);
      else edgeOwners.set(key, [c]);
    });
  });
  const nbrs: Set<number>[] = regions.map(() => new Set());
  const onCoast = new Set<number>();
  for (const owners of edgeOwners.values()) {
    if (owners.length === 1) onCoast.add(owners[0]);
    for (const a of owners) for (const b of owners) if (a !== b) nbrs[a].add(b);
  }

  // Depth from the sea: cells with an unshared edge border the dropped ghosts.
  const depth = new Array<number>(nReal).fill(Infinity);
  const queue = [...onCoast];
  queue.forEach((c) => (depth[c] = 1));
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const n of nbrs[c]) {
      if (depth[n] === Infinity) {
        depth[n] = depth[c] + 1;
        queue.push(n);
      }
    }
  }

  const id = (c: number) => `c${c}`;
  const cells: Record<string, MapCell> = {};
  regions.forEach((idx, c) => {
    const corners = idx.map((v) => vertices[v]);
    if (polygonArea(corners) < 0) corners.reverse();
    cells[id(c)] = {
      id: id(c),
      center: polygonCentroid(corners),
      corners,
      neighbors: [...nbrs[c]].sort((a, b) => a - b).map(id),
      ring: Math.max(0, mapRadius + 1 - depth[c]),
    };
  });
  return cells;
}
