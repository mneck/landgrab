/**
 * Graph queries over the cell map (IMPLEMENTATION_SPEC.md section 1.3).
 * Adjacency is `Cell.neighbors`; nothing here looks at geometry.
 */
import type { Cell, CellId } from '../game/types';

interface HasCells {
  cells: Cell[];
}

export function neighbors(G: HasCells, id: CellId): CellId[] {
  return G.cells[id].neighbors;
}

export function withinHops(G: HasCells, origin: CellId, hops: number): Set<CellId> {
  const seen = new Set<CellId>([origin]);
  let frontier = [origin];
  for (let d = 0; d < hops && frontier.length; d++) {
    const next: CellId[] = [];
    for (const c of frontier) {
      for (const nb of G.cells[c].neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Hops between two cells, or Infinity when disconnected. */
export function hopDistance(G: HasCells, a: CellId, b: CellId): number {
  if (a === b) return 0;
  const seen = new Set<CellId>([a]);
  let frontier = [a];
  let d = 0;
  while (frontier.length) {
    d++;
    const next: CellId[] = [];
    for (const c of frontier) {
      for (const nb of G.cells[c].neighbors) {
        if (nb === b) return d;
        if (!seen.has(nb)) {
          seen.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** Cells reachable from `start` through cells that satisfy `pred` (start included only if it does). */
export function connectedComponent(
  G: HasCells,
  start: CellId,
  pred: (c: Cell) => boolean
): Set<CellId> {
  const out = new Set<CellId>();
  if (!pred(G.cells[start])) return out;
  out.add(start);
  const stack = [start];
  while (stack.length) {
    const c = stack.pop()!;
    for (const nb of G.cells[c].neighbors) {
      if (!out.has(nb) && pred(G.cells[nb])) {
        out.add(nb);
        stack.push(nb);
      }
    }
  }
  return out;
}

/** Every connected component of cells satisfying `pred`. */
export function components(G: HasCells, pred: (c: Cell) => boolean): Set<CellId>[] {
  const seen = new Set<CellId>();
  const out: Set<CellId>[] = [];
  for (const cell of G.cells) {
    if (seen.has(cell.id) || !pred(cell)) continue;
    const comp = connectedComponent(G, cell.id, pred);
    comp.forEach((c) => seen.add(c));
    out.push(comp);
  }
  return out;
}

export function largestComponent(G: HasCells, pred: (c: Cell) => boolean): Set<CellId> {
  let best = new Set<CellId>();
  for (const comp of components(G, pred)) {
    if (comp.size > best.size) best = comp;
  }
  return best;
}

/** Nearest cell (by hops, then lowest id) satisfying `pred`, excluding `origin`. */
export function nearest(G: HasCells, origin: CellId, pred: (c: Cell) => boolean): CellId | null {
  const seen = new Set<CellId>([origin]);
  let frontier = [origin];
  while (frontier.length) {
    const next: CellId[] = [];
    const hits: CellId[] = [];
    for (const c of frontier) {
      for (const nb of G.cells[c].neighbors) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        if (pred(G.cells[nb])) hits.push(nb);
        next.push(nb);
      }
    }
    if (hits.length) return Math.min(...hits);
    frontier = next;
  }
  return null;
}
