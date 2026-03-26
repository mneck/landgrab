/**
 * Hex grid utilities for Landgrab - based on Red Blob Games axial/cube coordinates
 * Pointy-top orientation
 */

export interface HexCoord {
  q: number;
  r: number;
}

export interface Point {
  x: number;
  y: number;
}

// Pointy-top axial directions (E, NE, NW, W, SW, SE)
const AXIAL_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

export function hexFromKey(key: string): HexCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const sA = -a.q - a.r;
  const sB = -b.q - b.r;
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(sA - sB)) / 2;
}

export function hexNeighbor(hex: HexCoord, direction: number): HexCoord {
  const dir = AXIAL_DIRECTIONS[direction % 6];
  return hexAdd(hex, dir);
}

export function hexNeighbors(hex: HexCoord): HexCoord[] {
  return AXIAL_DIRECTIONS.map((dir) => hexAdd(hex, dir));
}

/** Generate all hexes in a hexagonal shape with radius N (distance from center) */
export function makeHexagonalShape(N: number): HexCoord[] {
  const result: HexCoord[] = [];
  for (let q = -N; q <= N; q++) {
    for (let r = -N; r <= N; r++) {
      const s = -q - r;
      const len = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;
      if (len <= N) {
        result.push({ q, r });
      }
    }
  }
  return result;
}

/** Pointy-top hex to pixel conversion */
export function hexToPixel(
  hex: HexCoord,
  size: number,
  origin: Point = { x: 0, y: 0 }
): Point {
  const x = size * (Math.sqrt(3) * hex.q + (Math.sqrt(3) / 2) * hex.r);
  const y = size * ((3 / 2) * hex.r);
  return { x: x + origin.x, y: y + origin.y };
}

/** Pixel to hex (fractional), then round to nearest hex */
export function pixelToHex(
  pixel: Point,
  size: number,
  origin: Point = { x: 0, y: 0 }
): HexCoord {
  const pt = {
    x: (pixel.x - origin.x) / size,
    y: (pixel.y - origin.y) / size,
  };
  const q = (Math.sqrt(3) / 3) * pt.x - (1 / 3) * pt.y;
  const r = (2 / 3) * pt.y;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

/** Get polygon corners for a pointy-top hex (for SVG) */
export function hexCorners(
  hex: HexCoord,
  size: number,
  origin: Point = { x: 0, y: 0 }
): Point[] {
  const center = hexToPixel(hex, size, origin);
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * (i + 0.5); // pointy: start at 30deg
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}

export function hexCornerPoints(hex: HexCoord, size: number, origin: Point = { x: 0, y: 0 }): string {
  const corners = hexCorners(hex, size, origin);
  return corners.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
}
