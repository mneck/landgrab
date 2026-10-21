#!/usr/bin/env python3
"""
Edge collapse for Landgrab maps
===============================

Enforces a per-cell shape rule: no side shorter than `min_ratio` times that
cell's longest side. Short sides are not deleted -- they are *collapsed*,
merging their two endpoints into one point. That keeps the tiling watertight
(no gaps, no overlaps), which plain deletion would not.

Why a shared vertex pool matters
--------------------------------
In a Voronoi diagram every vertex is shared by (generically) three cells and
every edge by two. If each cell owns a private copy of its corners, collapsing
an edge in one cell tears it away from its neighbours. So the mesh is stored
once -- a global vertex array plus per-cell index lists -- and a collapse is
a union-find merge over that array. Every cell touching those corners follows
automatically.

The iteration
-------------
Collapsing an edge moves its neighbours' endpoints, which changes their
lengths, which can create a new violation. So it runs in passes until no cell
violates the rule, or until a pass changes nothing. To stop a small cell from
imploding, each pass collapses only the single worst edge per cell.
"""

import numpy as np


class DSU:
    """Union-find. Each cluster of merged vertices becomes one point."""

    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        self.p[max(ra, rb)] = min(ra, rb)
        return True


def _dedupe(seq):
    """Drop consecutive repeats, including wraparound."""
    out = [v for i, v in enumerate(seq) if v != seq[i - 1]]
    return out


def collapse(vertices, regions, min_ratio=0.5, max_passes=40, verbose=False):
    """
    vertices : (V,2) float array -- the shared pool
    regions  : list of lists of vertex indices, one per cell, in order
    returns  : (new_vertices, new_regions, report)
    """
    dsu = DSU(len(vertices))
    V = np.asarray(vertices, dtype=float)

    def cluster_positions():
        """Average each merged cluster to a single point."""
        roots = np.array([dsu.find(i) for i in range(len(V))])
        sums = np.zeros_like(V)
        counts = np.zeros(len(V))
        np.add.at(sums, roots, V)
        np.add.at(counts, roots, 1.0)
        counts[counts == 0] = 1
        return sums / counts[:, None], roots

    report = dict(passes=0, collapsed=0, per_pass=[])

    for p in range(max_passes):
        pos, roots = cluster_positions()
        to_merge = []

        for region in regions:
            idx = _dedupe([roots[v] for v in region])
            if len(idx) < 3:
                continue
            pts = pos[idx]
            seg = np.hypot(*(np.roll(pts, -1, axis=0) - pts).T)
            if seg.max() <= 0:
                continue
            limit = min_ratio * seg.max()
            # only the single worst offender per cell, so a small cell
            # cannot have all its sides collapsed at once
            k = int(seg.argmin())
            if seg[k] < limit:
                to_merge.append((idx[k], idx[(k + 1) % len(idx)]))

        if not to_merge:
            break

        merged = sum(dsu.union(a, b) for a, b in to_merge)
        report["per_pass"].append(merged)
        report["collapsed"] += merged
        report["passes"] = p + 1
        if verbose:
            print(f"  pass {p+1}: {len(to_merge)} violations, {merged} merges")
        if merged == 0:
            break

    # finalise
    pos, roots = cluster_positions()
    new_regions, remap, new_V = [], {}, []
    for region in regions:
        idx = _dedupe([roots[v] for v in region])
        out = []
        for v in idx:
            if v not in remap:
                remap[v] = len(new_V)
                new_V.append(pos[v])
            out.append(remap[v])
        new_regions.append(out)

    report["degenerate_cells"] = sum(1 for r in new_regions if len(r) < 3)
    return np.array(new_V), new_regions, report


def cap_degree(vertices, regions, n_cells, max_degree=6, max_passes=30,
               protect_below=4, verbose=False):
    """Collapse the shortest edge of any cell with too many neighbours.

    Aimed at a different target than `collapse`: that rule is about short
    sides and only lowers degree as a side effect. This goes straight at the
    upper tail, which is what unbalances adjacency scoring -- a 9-neighbour
    cell earns nearly twice what a 5-neighbour one does under any flat
    per-neighbour bonus.

    Collapsing can only remove edges, never add them, so degree falls
    monotonically and the loop always terminates. Cells already at or below
    `protect_below` are never touched, so nothing gets whittled to nothing.
    """
    dsu = DSU(len(vertices))
    V = np.asarray(vertices, dtype=float)

    def positions():
        roots = np.array([dsu.find(i) for i in range(len(V))])
        sums = np.zeros_like(V)
        counts = np.zeros(len(V))
        np.add.at(sums, roots, V)
        np.add.at(counts, roots, 1.0)
        counts[counts == 0] = 1
        return sums / counts[:, None], roots

    report = dict(passes=0, collapsed=0)

    for p in range(max_passes):
        pos, roots = positions()
        current = [_dedupe([roots[v] for v in r]) for r in regions]
        nbrs, _ = adjacency_from_mesh(current, n_cells)

        to_merge = []
        for i in range(n_cells):
            if len(nbrs[i]) <= max_degree:
                continue
            idx = current[i]
            if len(idx) <= protect_below:
                continue
            pts = pos[idx]
            seg = np.hypot(*(np.roll(pts, -1, axis=0) - pts).T)
            k = int(seg.argmin())
            to_merge.append((idx[k], idx[(k + 1) % len(idx)]))

        if not to_merge:
            break
        merged = sum(dsu.union(a, b) for a, b in to_merge)
        report["passes"] = p + 1
        report["collapsed"] += merged
        if verbose:
            print(f"  pass {p+1}: {len(to_merge)} over-degree cells, {merged} merges")
        if merged == 0:
            break

    pos, roots = positions()
    new_regions, remap, new_V = [], {}, []
    for region in regions:
        idx = _dedupe([roots[v] for v in region])
        out = []
        for v in idx:
            if v not in remap:
                remap[v] = len(new_V)
                new_V.append(pos[v])
            out.append(remap[v])
        new_regions.append(out)
    return np.array(new_V), new_regions, report


def side_ratios(vertices, regions, mask=None):
    """Per-cell longest-side / shortest-side."""
    out = []
    for i, region in enumerate(regions):
        if mask is not None and not mask[i]:
            continue
        if len(region) < 3:
            continue
        pts = np.asarray(vertices)[region]
        seg = np.hypot(*(np.roll(pts, -1, axis=0) - pts).T)
        seg = seg[seg > 1e-9]
        if len(seg) < 3:
            continue
        out.append(seg.max() / seg.min())
    return np.array(out)


def adjacency_from_mesh(regions, n_cells):
    """Two cells are neighbours when they share two or more corners, i.e.
    a whole edge. After collapsing, cells that met only at a hairline now
    share a single point and correctly stop being neighbours."""
    owners = {}
    for i, region in enumerate(regions[:n_cells]):
        for v in region:
            owners.setdefault(v, []).append(i)

    shared = {}
    for v, cells in owners.items():
        for a_i in range(len(cells)):
            for b_i in range(a_i + 1, len(cells)):
                a, b = sorted((cells[a_i], cells[b_i]))
                shared[(a, b)] = shared.get((a, b), 0) + 1

    nbrs = [[] for _ in range(n_cells)]
    edges = []
    for (a, b), count in shared.items():
        if count >= 2:
            nbrs[a].append(b)
            nbrs[b].append(a)
            edges.append((a, b))
    return nbrs, edges
