#!/usr/bin/env python3
"""
Landgrab map generator
======================

Generates an irregular-polygon island map: a planar graph of cells with
variable neighbour counts (mostly 5, 6 and 7 sides), terrain, buildability,
and contiguous fog regions.

Pipeline
--------
  1. scatter points            -> random seeds in a box
  2. Voronoi + Lloyd relax     -> irregular but evenly-sized convex cells
  3. island mask               -> land/water via a noisy radial function
  4. ocean flood fill          -> distinguish ocean from inland lakes
  5. elevation                 -> graph distance from coast + noise
  6. moisture                  -> graph distance from fresh water + noise
  7. terrain classification    -> elevation x moisture lookup
  8. buildability              -> derived flag per cell
  9. sites            -> Lost City (3 cells) and minor ruins, hidden significance
 10. start positions           -> farthest-point sampling over coastal cells
 11. validation                -> reject-and-retry on unfair maps

Outputs a JSON map file and SVG renders.

Usage:
    python3 landgrab_mapgen.py --cells 600 --players 4 --seed 7
    python3 landgrab_mapgen.py --relaxation-strip     # shows the regularity dial
"""

import argparse
import json
import math
from collections import deque

import numpy as np
from scipy.spatial import Voronoi

from edge_collapse import adjacency_from_mesh, cap_degree, collapse

# Map file names for the game client (src/game/types.ts TerrainType / PlayerType).
TS_TERRAIN = {
    "ocean": "Ocean", "coastal_water": "CoastalWater", "crater_lake": "CraterLake",
    "beach": "Beach", "plains": "Plains", "rainforest": "Rainforest",
    "hills": "Hills", "mountain": "Mountain",
}
TS_FACTION = {
    "hotelier": "Hotelier", "industrialist": "Industrialist",
    "bureaucrat": "Bureaucrat", "chieftain": "Chieftain",
}


# ---------------------------------------------------------------------------
# Terrain
# ---------------------------------------------------------------------------
# `buildable` is the only hard rule the generator enforces. `yields` are tags
# the game layer reads when scoring adjacency -- the generator does not care
# what a "forest" is worth, only that it is tagged.

TERRAIN = {
    #                      buildable  yields                       colour
    "ocean":         dict(buildable=False, yields=["water"],              color="#1f4a63"),
    "coastal_water": dict(buildable=False, yields=["water", "coast"],     color="#3a7e9e"),
    "crater_lake":   dict(buildable=False, yields=["water", "fresh"],     color="#4e9ec0"),
    "beach":         dict(buildable=True,  yields=["sand", "coast"],      color="#e4d5a8"),
    "plains":        dict(buildable=True,  yields=["soil"],               color="#b9c984"),
    "rainforest":    dict(buildable=True,  yields=["wood"],               color="#5d8a51"),
    "hills":         dict(buildable=True,  yields=["soil", "ore"],        color="#9c9769"),
    "mountain":      dict(buildable=False, yields=["ore", "stone"],       color="#8b837a"),
}

WATER = {"ocean", "coastal_water", "crater_lake"}

FACTIONS = ["hotelier", "industrialist", "bureaucrat", "chieftain"]

# A ruin's status is the three-way contest at the heart of the game.
RUIN_STATUS = ["untouched", "museum", "reclaimed", "razed"]


# ---------------------------------------------------------------------------
# Value noise (no external noise dependency)
# ---------------------------------------------------------------------------

class ValueNoise:
    """Multi-octave bilinear value noise over the unit square."""

    def __init__(self, rng, base_res=6, octaves=4):
        self.grids = [rng.random((base_res * 2 ** o + 1,) * 2) for o in range(octaves)]

    def sample(self, x, y):
        total = 0.0
        norm = 0.0
        amp = 1.0
        for g in self.grids:
            r = g.shape[0] - 1
            fx, fy = x * r, y * r
            x0 = min(int(fx), r - 1)
            y0 = min(int(fy), r - 1)
            tx, ty = fx - x0, fy - y0
            tx = tx * tx * (3 - 2 * tx)          # smoothstep
            ty = ty * ty * (3 - 2 * ty)
            top = g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx
            bot = g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx
            total += (top * (1 - ty) + bot * ty) * amp
            norm += amp
            amp *= 0.5
        return total / norm


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

def polygon_centroid(pts):
    """Area-weighted centroid of a simple polygon."""
    x, y = pts[:, 0], pts[:, 1]
    xn, yn = np.roll(x, -1), np.roll(y, -1)
    cross = x * yn - xn * y
    area = cross.sum() / 2.0
    if abs(area) < 1e-12:
        return pts.mean(axis=0)
    cx = ((x + xn) * cross).sum() / (6.0 * area)
    cy = ((y + yn) * cross).sum() / (6.0 * area)
    return np.array([cx, cy])


def bounded_voronoi(points, bbox):
    """Voronoi where every cell of the *original* points is finite.

    Trick: mirror the point set across each wall of the bounding box. The
    mirrored points push the unbounded regions outside, so regions belonging
    to the first N points come back closed and clipped to the box.
    """
    xmin, ymin, xmax, ymax = bbox
    mirrors = []
    for axis, val in ((0, xmin), (0, xmax), (1, ymin), (1, ymax)):
        m = points.copy()
        m[:, axis] = 2 * val - m[:, axis]
        mirrors.append(m)
    return Voronoi(np.vstack([points] + mirrors))


def lloyd_relax(points, bbox, iterations):
    """Move each seed to its cell's centroid. This is the regularity dial:
    0 iterations = chaotic organic blobs, 5+ = almost a hex grid."""
    n = len(points)
    for _ in range(iterations):
        vor = bounded_voronoi(points, bbox)
        moved = np.empty_like(points)
        for i in range(n):
            region = vor.regions[vor.point_region[i]]
            poly = vor.vertices[region]
            moved[i] = polygon_centroid(poly)
        points = moved
    return points


# ---------------------------------------------------------------------------
# The map
# ---------------------------------------------------------------------------

class Map:
    # Terrain mix, as fractions of land. These are the dials you actually
    # want when balancing: they set the *proportions* directly instead of
    # hoping an absolute threshold lands in the right place on every seed.
    MIX = dict(mountain=0.12, hills=0.20, rainforest=0.34)

    def __init__(self, n_cells, seed, relaxation=3, bbox=(0, 0, 1000, 760),
                 sliver_threshold=0.12, island_size=0.78, lake_count=5):
        self.rng = np.random.default_rng(seed)
        self.seed = seed
        self.bbox = bbox
        self.n = n_cells
        self.sliver_threshold = sliver_threshold
        self.island_size = island_size
        self.lake_count = lake_count
        self.relaxation = relaxation
        self.ruins = []
        self.ruin_of_cell = {}
        self.faction_of_start = {}

        xmin, ymin, xmax, ymax = bbox
        pts = self.rng.random((n_cells, 2)) * [xmax - xmin, ymax - ymin] + [xmin, ymin]
        pts = lloyd_relax(pts, bbox, relaxation)
        self.points = pts

        vor = bounded_voronoi(pts, bbox)
        # Shared vertex pool: cells hold indices into one array, so collapsing
        # an edge moves every cell that touches it and the tiling stays
        # watertight. Mirrored Voronoi cells already end exactly on the box
        # walls; the clip only removes float noise.
        pool = np.clip(np.asarray(vor.vertices, dtype=float), [xmin, ymin], [xmax, ymax])
        regions = [list(vor.regions[vor.point_region[i]]) for i in range(n_cells)]
        pool, regions, self.collapse_report = collapse(pool, regions, min_ratio=0.25)
        pool, regions, self.cap_report = cap_degree(pool, regions, n_cells, max_degree=6)
        self.vertices = pool
        self.regions = regions
        self.polys = []
        self.centroids = np.empty((n_cells, 2))
        for i in range(n_cells):
            poly = pool[regions[i]]
            self.polys.append(poly)
            self.centroids[i] = polygon_centroid(poly)

        self._build_adjacency_from_mesh()

        # per-cell attributes, filled in by the pipeline below
        self.terrain = ["deep_ocean"] * n_cells
        self.elevation = np.zeros(n_cells)
        self.moisture = np.zeros(n_cells)
        self.is_land = np.zeros(n_cells, dtype=bool)
        self.starts = []

    # -- adjacency ----------------------------------------------------------
    def _build_adjacency_from_mesh(self):
        """Neighbours share a whole edge (two corners) after collapse. Cells
        that met only at a hairline now share one point and are not
        neighbours, which is the point of collapsing."""
        nbrs, edges = adjacency_from_mesh(self.regions, self.n)
        self.neighbors = [sorted(set(int(x) for x in nb)) for nb in nbrs]
        self.edges = [dict(a=int(a), b=int(b)) for a, b in edges]

    def _build_adjacency(self, vor):
        """Neighbours come from Voronoi ridges. Ridges shorter than a fraction
        of the median are dropped: two cells meeting at a hairline sliver
        should not count as neighbours, or players will argue about it."""
        raw = []
        lengths = []
        for (a, b), rv in zip(vor.ridge_points, vor.ridge_vertices):
            if a >= self.n or b >= self.n:
                continue
            if -1 in rv:
                continue
            p, q = vor.vertices[rv[0]], vor.vertices[rv[1]]
            L = float(np.hypot(*(p - q)))
            raw.append((int(a), int(b)))
            lengths.append(L)

        lengths = np.array(lengths)
        cutoff = np.median(lengths) * self.sliver_threshold

        self.neighbors = [[] for _ in range(self.n)]
        self.edges = []
        for (a, b), L in zip(raw, lengths):
            if L < cutoff:
                continue
            self.neighbors[a].append(b)
            self.neighbors[b].append(a)
            self.edges.append(dict(a=a, b=b, length=round(L, 2)))

    # -- pipeline -----------------------------------------------------------
    def generate(self):
        self._island_mask()
        self._flood_ocean()
        self._elevation()
        self._carve_lakes()
        self._moisture()
        self._classify()
        self._place_ruins()
        self._pick_starts()
        self._assign_factions()
        return self

    def _island_mask(self):
        """Noisy radial function: land where normalised radius < a wobbling
        threshold. Harmonics in the angle give bays and peninsulas."""
        xmin, ymin, xmax, ymax = self.bbox
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        rx, ry = (xmax - xmin) / 2, (ymax - ymin) / 2

        # random phases and weights for a handful of angular harmonics
        # More/stronger harmonics = more bays and peninsulas = more coastline
        # per unit of land. If beachfront is the premium real estate in your
        # economy, this is the knob that sets how much of it exists.
        harmonics = [(k, self.rng.uniform(0, 2 * math.pi), w)
                     for k, w in ((2, 0.16), (3, 0.13), (5, 0.09), (8, 0.06), (11, 0.04))]
        blob = ValueNoise(self.rng, base_res=4, octaves=3)

        for i, (x, y) in enumerate(self.centroids):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            r = math.hypot(dx, dy)
            ang = math.atan2(dy, dx)
            thresh = self.island_size
            for k, phase, w in harmonics:
                thresh += w * math.sin(k * ang + phase)
            thresh += (blob.sample((x - xmin) / (xmax - xmin),
                                   (y - ymin) / (ymax - ymin)) - 0.5) * 0.30
            self.is_land[i] = r < thresh

        self._drop_tiny_islands()

    def _drop_tiny_islands(self, min_size=6):
        """Keep only landmasses above a size floor -- stray 1-cell specks in
        the ocean are noise, not islands."""
        seen = np.zeros(self.n, dtype=bool)
        for i in range(self.n):
            if not self.is_land[i] or seen[i]:
                continue
            comp, q = [], deque([i])
            seen[i] = True
            while q:
                c = q.popleft()
                comp.append(c)
                for nb in self.neighbors[c]:
                    if self.is_land[nb] and not seen[nb]:
                        seen[nb] = True
                        q.append(nb)
            if len(comp) < min_size:
                for c in comp:
                    self.is_land[c] = False

    def _flood_ocean(self):
        """Flood fill water from the map border. Water that the fill never
        reaches is an inland lake -- a different game object from the sea."""
        xmin, ymin, xmax, ymax = self.bbox
        self.is_ocean = np.zeros(self.n, dtype=bool)
        q = deque()
        for i in range(self.n):
            if self.is_land[i]:
                continue
            x, y = self.centroids[i]
            margin = 0.04 * (xmax - xmin)
            if x < xmin + margin or x > xmax - margin or y < ymin + margin or y > ymax - margin:
                self.is_ocean[i] = True
                q.append(i)
        while q:
            c = q.popleft()
            for nb in self.neighbors[c]:
                if not self.is_land[nb] and not self.is_ocean[nb]:
                    self.is_ocean[nb] = True
                    q.append(nb)
        self.is_lake = (~self.is_land) & (~self.is_ocean)

    def _bfs_distance(self, sources, through_land_only=True):
        dist = np.full(self.n, -1)
        q = deque()
        for s in sources:
            dist[s] = 0
            q.append(s)
        while q:
            c = q.popleft()
            for nb in self.neighbors[c]:
                if dist[nb] != -1:
                    continue
                if through_land_only and not self.is_land[nb]:
                    continue
                dist[nb] = dist[c] + 1
                q.append(nb)
        return dist

    def _elevation(self):
        """Base elevation = graph distance inland from the coast, so mountains
        land in the interior and beaches on the rim automatically."""
        coast = [i for i in range(self.n) if not self.is_land[i]]
        d = self._bfs_distance(coast)
        land_d = d[self.is_land]
        dmax = max(land_d.max(), 1) if len(land_d) else 1

        xmin, ymin, xmax, ymax = self.bbox
        noise = ValueNoise(self.rng, base_res=5, octaves=4)
        for i in range(self.n):
            if not self.is_land[i]:
                self.elevation[i] = 0.0
                continue
            base = (d[i] / dmax) ** 0.85
            x, y = self.centroids[i]
            nz = noise.sample((x - xmin) / (xmax - xmin), (y - ymin) / (ymax - ymin))
            self.elevation[i] = float(np.clip(base * (0.55 + 0.75 * nz), 0, 1))

    def _carve_lakes(self):
        """Lakes are placed rather than discovered: seed a few inland cells in
        low spots and grow small blobs. A lakeside cell is a different piece
        of real estate from a seaside one, so the game wants both."""
        coast_dist = self._bfs_distance([i for i in range(self.n) if not self.is_land[i]])
        cands = [i for i in range(self.n)
                 if self.is_land[i] and coast_dist[i] >= 3 and self.elevation[i] < 0.70]
        if not cands:
            return
        self.rng.shuffle(cands)
        placed = 0
        for seed in cands:
            if placed >= self.lake_count:
                break
            if not self.is_land[seed]:
                continue
            size = int(self.rng.integers(1, 5))
            blob, q = set(), deque([seed])
            while q and len(blob) < size:
                c = q.popleft()
                if not self.is_land[c]:
                    continue
                blob.add(c)
                nbs = [nb for nb in self.neighbors[c] if self.is_land[nb] and nb not in blob]
                self.rng.shuffle(nbs)
                q.extend(nbs[:2])
            # don't let a lake touch the sea -- that makes it a bay, not a lake
            if any(self.is_ocean[nb] for c in blob for nb in self.neighbors[c]):
                continue
            for c in blob:
                self.is_land[c] = False
                self.is_lake[c] = True
            placed += 1

    def _moisture(self):
        """Distance from fresh water, inverted, plus noise. Dry interior with
        no lake nearby is where wasteland becomes plausible."""
        fresh = [i for i in range(self.n) if self.is_lake[i]]
        if not fresh:
            fresh = [i for i in range(self.n) if self.is_ocean[i]]
        d = self._bfs_distance(fresh)
        xmin, ymin, xmax, ymax = self.bbox
        noise = ValueNoise(self.rng, base_res=4, octaves=3)
        for i in range(self.n):
            if not self.is_land[i]:
                self.moisture[i] = 1.0
                continue
            near = 1.0 / (1.0 + max(d[i], 0) * 0.35) if d[i] >= 0 else 0.0
            x, y = self.centroids[i]
            nz = noise.sample((x - xmin) / (xmax - xmin), (y - ymin) / (ymax - ymin))
            self.moisture[i] = float(np.clip(0.45 * near + 0.75 * nz, 0, 1))

    def _classify(self):
        """Assign terrain by *rank*, not by absolute threshold.

        Thresholds like `elevation > 0.78 -> mountain` drift wildly from seed
        to seed, because the elevation field's actual range changes with the
        island's shape. Sorting the land cells and slicing off a fixed
        fraction gives the same terrain mix on every map, which is what you
        want when balancing. MIX is the control panel.
        """
        for i in range(self.n):
            if self.is_lake[i]:
                self.terrain[i] = "crater_lake"
            elif self.is_ocean[i]:
                coastal = any(self.is_land[nb] for nb in self.neighbors[i])
                self.terrain[i] = "coastal_water" if coastal else "ocean"

        land = [i for i in range(self.n) if self.is_land[i]]
        L = len(land)
        if L == 0:
            return

        # beaches: the low-lying cells that actually touch the sea
        coastal = [i for i in land if any(self.is_ocean[nb] for nb in self.neighbors[i])]
        coastal.sort(key=lambda i: self.elevation[i])
        beaches = set(coastal[: int(len(coastal) * 0.55)])
        for i in beaches:
            self.terrain[i] = "beach"

        # relief: highest ground becomes mountain, then hills
        rest = [i for i in land if i not in beaches]
        rest.sort(key=lambda i: -self.elevation[i])
        n_mtn = min(int(self.MIX["mountain"] * L), len(rest))
        n_hill = min(int(self.MIX["hills"] * L), len(rest) - n_mtn)
        for i in rest[:n_mtn]:
            self.terrain[i] = "mountain"
        for i in rest[n_mtn:n_mtn + n_hill]:
            self.terrain[i] = "hills"

        # lowland: wettest becomes rainforest, the rest plains
        low = rest[n_mtn + n_hill:]
        low.sort(key=lambda i: self.moisture[i])
        n_forest = min(int(self.MIX["rainforest"] * L), len(low))
        for i in low[len(low) - n_forest:]:
            self.terrain[i] = "rainforest"
        for i in low[:len(low) - n_forest]:
            self.terrain[i] = "plains"

    def _place_ruins(self, minor=4):
        """Ruins are entities, not terrain. A cell points at a ruin; the ruin
        owns its own status, claim and significance. The lost city spans
        several contiguous cells so that no single player can quietly take
        all of it in one move."""
        self.ruins = []
        self.ruin_of_cell = {}
        coast_dist = self._bfs_distance([i for i in range(self.n) if not self.is_land[i]])
        cands = [i for i in range(self.n)
                 if self.is_land[i] and coast_dist[i] >= 2
                 and TERRAIN[self.terrain[i]]["buildable"]]
        if not cands:
            return

        def claim(cells, significance, name):
            rid = len(self.ruins)
            self.ruins.append(dict(
                id=rid, name=name, cells=sorted(int(c) for c in cells),
                significance=significance, status="untouched",
                claimed_by=None, revealed_to=[],
            ))
            for c in cells:
                self.ruin_of_cell[int(c)] = rid

        # the lost city: a contiguous blob, deep inland if possible
        deep = sorted(cands, key=lambda i: -coast_dist[i])[: max(8, len(cands) // 6)]
        seed = int(self.rng.choice(deep))
        blob, q = set(), deque([seed])
        while q and len(blob) < 3:
            c = q.popleft()
            if c in blob or not self.is_land[c] or c in self.ruin_of_cell:
                continue
            if not TERRAIN[self.terrain[c]]["buildable"]:
                continue
            blob.add(c)
            nbs = [nb for nb in self.neighbors[c] if nb not in blob]
            self.rng.shuffle(nbs)
            q.extend(nbs[:2])
        if blob:
            claim(blob, 3, "the Lost City")

        # minor sites, kept apart from each other and from the city
        pool = [i for i in cands if i not in self.ruin_of_cell]
        self.rng.shuffle(pool)
        placed = 0
        for c in pool:
            if placed >= minor:
                break
            if any(nb in self.ruin_of_cell for nb in self.neighbors[c]):
                continue
            claim([c], int(self.rng.integers(1, 3)), f"minor site {placed + 1}")
            placed += 1

    def _assign_factions(self):
        """The chieftain is already here, so they start at the lost city
        rather than on the shore. The arriving factions take coastal starts.
        This is a design statement encoded in the generator, not a detail."""
        self.faction_of_start = {}
        if not self.starts:
            return
        city = next((r for r in self.ruins if r["significance"] == 3), None)
        arriving = [f for f in FACTIONS if f != "chieftain"]

        if city:
            anchor = self.centroids[city["cells"][0]]
            chief = min(self.starts,
                        key=lambda s: float(np.hypot(*(self.centroids[s] - anchor))))
        else:
            chief = self.starts[0]
        self.faction_of_start[chief] = "chieftain"
        for s, f in zip([s for s in self.starts if s != chief], arriving):
            self.faction_of_start[s] = f

    def _pick_starts(self, players=4):
        """Farthest-point sampling over buildable coastal cells."""
        self.players = players
        cands = [i for i in range(self.n)
                 if TERRAIN[self.terrain[i]]["buildable"]
                 and any(not self.is_land[nb] for nb in self.neighbors[i])]
        if len(cands) < players:
            cands = [i for i in range(self.n) if TERRAIN[self.terrain[i]]["buildable"]]
        if not cands:
            self.starts = []
            return
        starts = [int(self.rng.choice(cands))]
        while len(starts) < players:
            best, bestd = None, -1
            for c in cands:
                if c in starts:
                    continue
                d = min(float(np.hypot(*(self.centroids[c] - self.centroids[s])))
                        for s in starts)
                if d > bestd:
                    best, bestd = c, d
            if best is None:
                break
            starts.append(best)
        self.starts = starts

    # -- validation ---------------------------------------------------------
    # Which yields a start must be able to reach, and how far it may be.
    # Splitting this into tiers matters: starts are coastal and ore is inland
    # by construction, so demanding ore "nearby" rejects almost every map.
    # What you actually want to guarantee is that ore is *reachable* and that
    # no player is further from it than the others.
    REACH = {"water": 2, "wood": 3, "soil": 3, "ore": 6}

    def validate(self, min_buildable_near=5, max_reach_spread=2):
        """Reject-and-retry beats correct-by-construction. Generate freely,
        then score the map and throw it away if it is unfair."""
        problems = []
        land_cells = int(self.is_land.sum())
        if land_cells < self.n * 0.22:
            problems.append(f"island too small ({land_cells} land cells)")

        buildable = sum(1 for i in range(self.n)
                        if self.is_land[i] and TERRAIN[self.terrain[i]]["buildable"])
        frac = buildable / max(land_cells, 1)
        # With wasteland gone, mountain and crater lakes are the only things
        # denying land, so the natural ceiling sits higher than it did.
        if not 0.45 <= frac <= 0.92:
            problems.append(f"buildable fraction off ({frac:.0%})")

        if len(self.starts) < getattr(self, "players", 4):
            problems.append("not enough viable start positions")

        reach_by_tag = {t: [] for t in self.REACH}
        for s in self.starts:
            near = self._ring(s, 2)
            n_build = sum(1 for c in near if TERRAIN[self.terrain[c]]["buildable"])
            if n_build < min_buildable_near:
                problems.append(f"start {s} has only {n_build} buildable cells within 2")

            for tag, limit in self.REACH.items():
                d = self._distance_to_tag(s, tag, limit)
                if d is None:
                    problems.append(f"start {s} cannot reach '{tag}' within {limit}")
                else:
                    reach_by_tag[tag].append(d)

        # The Lost City must be contested, not pre-owned: no Site may sit on or
        # next to the Chieftain's starting Village.
        chief = next((s for s, f in self.faction_of_start.items() if f == "chieftain"), None)
        if chief is not None:
            near_chief = {chief, *self.neighbors[chief]}
            for r in self.ruins:
                if near_chief.intersection(r["cells"]):
                    problems.append(f"site {r['id']} touches the chieftain start")
        # fairness: no player should be markedly further from a resource than
        # the rest. This is the check that actually stops lopsided maps.
        for tag, ds in reach_by_tag.items():
            if len(ds) == len(self.starts) and ds and max(ds) - min(ds) > max_reach_spread:
                problems.append(f"'{tag}' access uneven across starts (spread {max(ds) - min(ds)})")
        return problems

    def _distance_to_tag(self, origin, tag, limit):
        """Hops from `origin` to the nearest cell yielding `tag`, or None."""
        seen = {origin}
        frontier = [origin]
        for d in range(1, limit + 1):
            nxt = []
            for c in frontier:
                for nb in self.neighbors[c]:
                    if nb in seen:
                        continue
                    seen.add(nb)
                    if tag in TERRAIN[self.terrain[nb]]["yields"]:
                        return d
                    nxt.append(nb)
            frontier = nxt
            if not frontier:
                break
        return None

    def _ring(self, origin, radius):
        seen = {origin}
        frontier = [origin]
        for _ in range(radius):
            nxt = []
            for c in frontier:
                for nb in self.neighbors[c]:
                    if nb not in seen:
                        seen.add(nb)
                        nxt.append(nb)
            frontier = nxt
        seen.discard(origin)
        return seen

    # -- stats --------------------------------------------------------------
    def stats(self):
        land_ids = [i for i in range(self.n) if self.is_land[i]]
        degrees = [len(self.neighbors[i]) for i in land_ids]
        hist = {}
        for d in degrees:
            hist[d] = hist.get(d, 0) + 1
        sides = {}
        for i in land_ids:
            s = len(self.polys[i])
            sides[s] = sides.get(s, 0) + 1
        land = int(self.is_land.sum())
        counts = {}
        for i in range(self.n):
            counts[self.terrain[i]] = counts.get(self.terrain[i], 0) + 1
        return dict(
            cells=self.n,
            land_cells=land,
            mean_degree=round(float(np.mean(degrees)), 2) if degrees else 0,
            neighbour_count_histogram=dict(sorted(hist.items())),
            polygon_sides_histogram=dict(sorted(sides.items())),
            terrain_counts=dict(sorted(counts.items(), key=lambda kv: -kv[1])),
            max_degree=max(degrees) if degrees else 0,
            collapsed_edges=self.collapse_report["collapsed"] + self.cap_report["collapsed"],
            starts=self.starts,
        )

    # -- export -------------------------------------------------------------
    def to_dict(self):
        """landgrab.map/3 (IMPLEMENTATION_SPEC.md section 1.2). Cells reference a
        shared vertex pool; gameplay reads `neighbors`, never polygon sides."""
        used = sorted({v for i in range(self.n) for v in self.regions[i]})
        remap = {v: k for k, v in enumerate(used)}
        site_of = {c: r["id"] for r in self.ruins for c in r["cells"]}
        cells = []
        for i in range(self.n):
            cell = {
                "id": i,
                "polygon": [remap[v] for v in self.regions[i]],
                "centroid": [round(float(v), 1) for v in self.centroids[i]],
                "neighbors": [int(n) for n in self.neighbors[i]],
                "terrain": TS_TERRAIN[self.terrain[i]],
                "elevation": round(float(self.elevation[i]), 3),
            }
            if i in site_of:
                cell["siteId"] = site_of[i]
            cells.append(cell)
        return {
            "schema": "landgrab.map/3",
            "seed": int(self.seed),
            "bbox": [float(v) for v in self.bbox],
            "vertices": [[round(float(x), 1), round(float(y), 1)] for x, y in self.vertices[used]],
            "cells": cells,
            "sites": [{"id": r["id"], "cells": r["cells"], "significance": int(r["significance"])}
                      for r in self.ruins],
            "starts": [{"faction": TS_FACTION[self.faction_of_start[s]], "cell": int(s)}
                       for s in self.starts if s in self.faction_of_start],
        }


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

FOG = "#2b2b33"


def render_svg(m, path, fogged=False, show_starts=True, legend=True, title=None):
    xmin, ymin, xmax, ymax = m.bbox
    pad = 10
    W, H = xmax - xmin + pad * 2, ymax - ymin + pad * 2
    extra = 54 if legend else 0

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H + extra}" '
           f'width="{W}" height="{H + extra}" font-family="system-ui, sans-serif">']
    out.append(f'<rect width="{W}" height="{H + extra}" fill="#16181d"/>')
    out.append(f'<g transform="translate({pad - xmin},{pad - ymin})">')

    # which regions start revealed: the ones the players begin in, plus the
    # ocean rim. everything else is fog.
    rim = {i for i in range(m.n) if m.is_land[i]
           and any(not m.is_land[nb] for nb in m.neighbors[i])}

    for i in range(m.n):
        poly = m.polys[i]
        if len(poly) < 3:
            continue
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
        hidden = fogged and m.is_land[i] and i not in rim
        if hidden:
            fill, stroke, sw = FOG, "#3a3a44", 0.6
        else:
            fill = TERRAIN[m.terrain[i]]["color"]
            stroke = "#10131a"
            sw = 0.7
        out.append(f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    if show_starts:
        for n, s in enumerate(m.starts):
            x, y = m.centroids[s]
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="#ffffff" '
                       f'stroke="#16181d" stroke-width="2.5"/>')
            out.append(f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle" '
                       f'font-size="11" font-weight="700" fill="#16181d">{n + 1}</text>')

    out.append('</g>')

    if legend:
        keys = ["beach", "plains", "rainforest", "hills", "mountain",
                "crater_lake", "coastal_water"]
        x = pad
        y = H + 16
        for k in keys:
            c = TERRAIN[k]["color"]
            label = k.replace("_", " ")
            buildable = TERRAIN[k]["buildable"]
            out.append(f'<rect x="{x}" y="{y}" width="13" height="13" rx="2" fill="{c}"/>')
            if not buildable:
                out.append(f'<rect x="{x}" y="{y}" width="13" height="13" rx="2" '
                           f'fill="none" stroke="#e05a5a" stroke-width="2"/>')
            out.append(f'<text x="{x + 18}" y="{y + 11}" font-size="12" fill="#c9cdd6">{label}</text>')
            x += 22 + len(label) * 7.0
        out.append(f'<text x="{pad}" y="{H + 48}" font-size="11" fill="#6f7580">'
                   f'red outline = unbuildable (scores for neighbours, cannot be built on)</text>')

    if title:
        out.append(f'<text x="{W - pad}" y="{pad + 16}" text-anchor="end" font-size="14" '
                   f'font-weight="600" fill="#c9cdd6">{title}</text>')

    out.append('</svg>')
    with open(path, "w") as f:
        f.write("\n".join(out))


def render_relaxation_strip(path, n_cells=260, seed=11):
    """Three panels showing Lloyd relaxation as a single tuning dial."""
    panels = [(0, "relaxation 0 — organic"),
              (2, "relaxation 2 — balanced"),
              (6, "relaxation 6 — near-regular")]
    bbox = (0, 0, 420, 420)
    gap = 18
    W = 420 * 3 + gap * 4
    H = 420 + gap * 2 + 30

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'width="{W}" height="{H}" font-family="system-ui, sans-serif">']
    out.append(f'<rect width="{W}" height="{H}" fill="#16181d"/>')

    for idx, (relax, label) in enumerate(panels):
        m = Map(n_cells, seed, relaxation=relax, bbox=bbox).generate()
        ox = gap + idx * (420 + gap)
        out.append(f'<g transform="translate({ox},{gap})">')
        for i in range(m.n):
            poly = m.polys[i]
            if len(poly) < 3:
                continue
            pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
            fill = TERRAIN[m.terrain[i]]["color"]
            out.append(f'<polygon points="{pts}" fill="{fill}" stroke="#10131a" stroke-width="0.6"/>')
        out.append('</g>')
        deg = np.mean([len(nb) for nb in m.neighbors])
        out.append(f'<text x="{ox}" y="{gap + 420 + 20}" font-size="13" fill="#c9cdd6">'
                   f'{label}  ·  mean sides {deg:.2f}</text>')

    out.append('</svg>')
    with open(path, "w") as f:
        f.write("\n".join(out))


# ---------------------------------------------------------------------------

def generate_valid(n_cells, players, seed, relaxation, max_attempts=40, verbose=True):
    """Generate, validate, retry. The retry loop is what makes 'random' maps
    safe to ship."""
    for attempt in range(max_attempts):
        m = Map(n_cells, seed + attempt * 977, relaxation=relaxation)
        m._island_mask()
        m._flood_ocean()
        m._elevation()
        m._carve_lakes()
        m._moisture()
        m._classify()
        m._place_ruins()
        m._pick_starts(players)
        m._assign_factions()
        problems = m.validate()
        if not problems:
            if verbose:
                print(f"accepted on attempt {attempt + 1} (seed {m.seed})")
            return m, attempt + 1
        if verbose and attempt < 3:
            print(f"  attempt {attempt + 1} rejected: {problems[0]}")
    if verbose:
        print(f"no map passed validation in {max_attempts} attempts; returning last")
    return m, max_attempts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=int, default=650)
    ap.add_argument("--players", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--relaxation", type=int, default=3)
    ap.add_argument("--out", default="landgrab_map")
    ap.add_argument("--relaxation-strip", action="store_true")
    args = ap.parse_args()

    if args.relaxation_strip:
        render_relaxation_strip(f"{args.out}_relaxation.svg")
        print(f"wrote {args.out}_relaxation.svg")
        return

    m, attempts = generate_valid(args.cells, args.players, args.seed, args.relaxation)

    render_svg(m, f"{args.out}.svg", fogged=False, title="revealed")
    render_svg(m, f"{args.out}_fog.svg", fogged=True, title="turn 1 — fog of war")
    with open(f"{args.out}.json", "w") as f:
        json.dump(m.to_dict(), f, separators=(",", ":"))

    s = m.stats()
    print(json.dumps(s, indent=2))
    print(f"\nwrote {args.out}.svg, {args.out}_fog.svg, {args.out}.json")


if __name__ == "__main__":
    main()
