# Landgrab Hex Grid — Implementation notes

## Current codebase (this repo)

The playable client lives under **`boardgame/`** (TypeScript, Vite, React). Hex math and map generation are implemented in:

| Concern | File |
|---------|------|
| Axial/cube coordinates, neighbors, distance, hex shape | `boardgame/src/utils/hexGrid.ts` |
| Island layout (Fog interior, coastline ring, Water rim) | `boardgame/src/game/types.ts` — `generateIsland()` |
| Fog reveal adjacent to a hex | `boardgame/src/game/gameRules.ts` — `revealAdjacentFog()` |

Orientation is **pointy-top**, consistent with the formulas commonly used from [Red Blob Games: Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/).

The interactive reference **`Hexagonal_Grids.html`** (and `Hexagonal_Grids_files/`) in this folder remains a useful external visual/algorithms reference; algorithms there are not automatically wired to the game — the **source of truth** for runtime behavior is **`boardgame/src`**.

---

## Coordinate system (conceptual)

- Storage: **axial** `(q, r)` with `s = -q - r` for cube-style algorithms.
- **Center** hex: `(0, 0)` in game generation.

---

## Tile layers (game map)

From center outward (see `generateIsland`):

1. **Fog** — interior unexplored hexes  
2. **Coastline ring** — Field, Mountain, Forest, Sand, Water (fixed mix on first 6 hexes, then random Field/Sand)  
3. **Water** — outer rim  

Expedition/Guide reveal turns **Fog** neighbors into Field/Mountain/Forest/Sand/Water per `pickRevealedTileType` and outer-ring rules in `revealAdjacentFog`.

---

## Optional: Godot / GDScript sketch

The sections below were originally written as a **Godot** port sketch. They are kept as supplemental math examples only; they are **not** the active implementation path for this repository.

### Axial ↔ cube (illustrative)

```gdscript
func axial_to_cube(q: int, r: int) -> Vector3i:
    return Vector3i(q, r, -q - r)
```

### Pointy-top `hex_to_pixel` (illustrative)

See Red Blob Games for full rounding and pixel conversion; match conventions with `hexGrid.ts` if porting.

---

## Game integration (mechanics)

- **Guide / reveal:** Select a non-Fog hex; neighbors that are Fog become terrain — see `revealAdjacentFog` in `gameRules.ts`.
- **Build adjacency:** `canPlaceBuild`, `BUILD_ADJACENCY`, cadence rules in `gameRules.ts`.

---

*Coordinate formulas and Red Blob Games reference: [Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/).*
