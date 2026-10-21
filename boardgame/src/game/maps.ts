/**
 * Map files (IMPLEMENTATION_SPEC.md section 1.2) and the module-level cache.
 *
 * Maps are generated offline by `tools/mapgen/build_maps.py` into
 * `public/maps/`. Game setup reads gameplay fields from a registered map;
 * components read polygons and centroids from the same cache. Geometry never
 * enters `LandgrabState`.
 */
import type { CellId, PlayerType, TerrainType } from './types';

export interface MapCell {
  id: number;
  polygon: number[];
  centroid: [number, number];
  neighbors: number[];
  terrain: TerrainType;
  elevation: number;
  siteId?: number;
}

export interface MapSite {
  id: number;
  cells: number[];
  significance: 1 | 2 | 3;
}

export interface MapFile {
  schema: 'landgrab.map/3';
  id: string;
  seed: number;
  bbox: [number, number, number, number];
  vertices: [number, number][];
  cells: MapCell[];
  sites: MapSite[];
  starts: { faction: PlayerType; cell: CellId }[];
}

export interface MapIndex {
  schema: 'landgrab.maps/1';
  maps: { id: string; seed: number; cells: number; land: number; bytes: number }[];
}

const registry = new Map<string, MapFile>();

export function registerMap(map: MapFile): void {
  if (map.schema !== 'landgrab.map/3') {
    throw new Error(`registerMap: unsupported schema ${String((map as { schema?: string }).schema)}`);
  }
  registry.set(map.id, map);
}

export function getMap(id: string): MapFile | undefined {
  return registry.get(id);
}

export function registeredMapIds(): string[] {
  return [...registry.keys()].sort();
}

/** Browser: fetch one map from `public/maps/` and register it. */
export async function fetchMap(id: string, base = '/maps'): Promise<MapFile> {
  const cached = registry.get(id);
  if (cached) return cached;
  const res = await fetch(`${base}/${id}.json`);
  if (!res.ok) throw new Error(`Could not load map ${id} (${res.status})`);
  const map = (await res.json()) as MapFile;
  map.id = map.id ?? id;
  registerMap(map);
  return map;
}

export async function fetchMapIndex(base = '/maps'): Promise<MapIndex> {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) throw new Error(`Could not load map index (${res.status})`);
  return (await res.json()) as MapIndex;
}

/** Polygon points for drawing, resolved from the shared vertex pool. */
export function cellPolygon(map: MapFile, id: CellId): [number, number][] {
  return map.cells[id].polygon.map((v) => map.vertices[v]);
}
