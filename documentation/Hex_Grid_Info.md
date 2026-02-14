# Landgrab Hex Grid Implementation Plan

## Overview

This document outlines the plan for implementing the hex map grid for **Landgrab** — a strategy game where players place Farms, Settlements, and other structures on island maps. The game uses Godot with GDScript. The first version targets **local multiplayer** (same computer) for playtesting with friends.

---

## 1. Coordinate System

### 1.1 Cube/Axial Coordinates (from Red Blob Games)

We use the **cube coordinate system** — a slice of 3D cartesian space where `q + r + s = 0`. This system provides:

- **Standard vector operations**: add/subtract coordinates, multiply/divide by scalar
- **Reusable algorithms**: distance, rotation, reflection, line drawing, screen conversion
- **No parity headaches**: unlike offset coordinates, movement is consistent everywhere

**Center hex**: `(0, 0, 0)` — the origin of the map.

**Storage**: Use **axial coordinates** `(q, r)` for storage; compute `s = -q - r` when needed for algorithms.

### 1.2 Axial ↔ Cube Conversion (GDScript)

```gdscript
# Axial stores (q, r); s is derived
func axial_to_cube(q: int, r: int) -> Vector3i:
    return Vector3i(q, r, -q - r)

func cube_to_axial(cube: Vector3i) -> Vector2i:
    return Vector2i(cube.x, cube.y)  # q, r
```

### 1.3 Hex Layout

- **Orientation**: Pointy-top (hex point faces up) — common for board games
- **Directions**: 6 neighbors; direction vectors (pointy-top, axial):

```gdscript
const AXIAL_DIRECTIONS = [
    Vector2i(1, 0),   # E
    Vector2i(1, -1),  # NE
    Vector2i(0, -1),  # NW
    Vector2i(-1, 0),  # W
    Vector2i(-1, 1),  # SW
    Vector2i(0, 1),  # SE
]
```

---

## 2. Hex-to-Pixel Conversion (Godot)

### 2.1 Pointy-Top Formulas

From [Red Blob Games](https://www.redblobgames.com/grids/hexagons/):

```gdscript
# size = hex radius (distance from center to corner)
# For flat hex: width = sqrt(3) * size, height = 2 * size
# For pointy hex: width = 2 * size, height = sqrt(3) * size

func hex_to_pixel(q: int, r: int, size: float) -> Vector2:
    var x = size * (sqrt(3.0) * q + sqrt(3.0) / 2.0 * r)
    var y = size * (3.0 / 2.0 * r)
    return Vector2(x, y)

func pixel_to_hex(pixel: Vector2, size: float) -> Vector2i:
    var q = (sqrt(3.0) / 3.0 * pixel.x - 1.0 / 3.0 * pixel.y) / size
    var r = (2.0 / 3.0 * pixel.y) / size
    return hex_round(q, r)
```

### 2.2 Hex Rounding (Fractional → Integer Hex)

```gdscript
func hex_round(q: float, r: float) -> Vector2i:
    var s = -q - r
    var rq = roundi(q)
    var rr = roundi(r)
    var rs = roundi(s)
    var q_diff = abs(rq - q)
    var r_diff = abs(rr - r)
    var s_diff = abs(rs - s)
    if q_diff > r_diff and q_diff > s_diff:
        rq = -rr - rs
    elif r_diff > s_diff:
        rr = -rq - rs
    return Vector2i(rq, rr)
```

---

## 3. Map Structure: Island Layout

### 3.1 Layer Hierarchy (Center → Edge)

1. **Fog** (gray) — center tiles, unexplored
2. **Coastline** — border around Fog: Field, Mountain, Desert (Sand), Forest
3. **Water** — tiles surrounding the coastline; each hex map is an island

### 3.2 Tile Types (from README)

| Tile   | Color/Style | Game Use |
|--------|-------------|----------|
| Fog    | Gray        | Unexplored; Expedition reveals adjacent |
| Field  | Green/grass | Farms, IZs, RTs |
| Mountain| Brown/gray  | +Ore for Industry; +Revenue for Tourism |
| Desert/Sand| Tan    | RTs (with Water); IZs |
| Forest | Dark green  | +Wood for Industry |
| Water  | Blue        | +Revenue for Tourism; Aquaculture (later) |

### 3.3 Island Shape Generation

**Approach**: Use a **hexagonal shape** with radius N (from `makeHexagonalShape` in hex-algorithms.js):

- All hexes where `|q| + |r| + |s| <= N` (cube) or equivalently `len(hex) <= N`
- Center = (0,0,0)
- Inner radius `FOG_RADIUS`: Fog tiles
- Middle ring: Coastline (Field, Mountain, Desert, Forest)
- Outer ring: Water (optional; can be 1+ hexes thick)

**Algorithm** (from hex-algorithms.js):

```gdscript
func make_hexagonal_shape(radius: int) -> Array[Vector2i]:
    var result: Array[Vector2i] = []
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            var s = -q - r
            if abs(q) + abs(r) + abs(s) <= 2 * radius:  # cube length
                result.append(Vector2i(q, r))
    return result
```

**Simpler**: Hex distance from center `(0,0,0)`:

```gdscript
func hex_distance(a: Vector2i, b: Vector2i) -> int:
    var ac = axial_to_cube(a.x, a.y)
    var bc = axial_to_cube(b.x, b.y)
    return (abs(ac.x - bc.x) + abs(ac.y - bc.y) + abs(ac.z - bc.z)) / 2
```

### 3.4 Map Zoning Rules

- **Distance 0**: Center hex — Fog or special (e.g. start tile)
- **Distance 1..FOG_RADIUS**: Fog
- **Distance FOG_RADIUS+1**: Coastline (mix of Field, Mountain, Desert, Forest)
- **Distance > FOG_RADIUS+1**: Water

Coastline tiles can be assigned randomly or by pattern (e.g., segments of terrain type).

---

## 4. GDScript Implementation Checklist

### 4.1 Core Scripts

1. **`HexCoord` (Resource or class)**
   - `q`, `r` (int)
   - `axial_to_cube()` → Vector3i
   - `hex_distance(from, to)` → int
   - `hex_neighbor(hex, direction)` → Vector2i
   - `hex_to_pixel(q, r, size)` → Vector2
   - `pixel_to_hex(pixel, size)` → Vector2i
   - `hex_round(q, r)` → Vector2i

2. **`HexMap` (Node or RefCounted)**
   - `tiles: Dictionary` keyed by `Vector2i` or `"q,r"` string
   - `get_tile(hex)` → TileType
   - `set_tile(hex, type)`
   - `get_neighbors(hex)` → Array
   - `generate_island(radius, fog_radius)`

3. **`HexTile` (Node2D or Sprite)**
   - Visual representation of one hex
   - Tile type → texture/color
   - Position from `hex_to_pixel`

### 4.2 Scene Structure

```
HexMap (Node2D)
├── HexTileContainer (Node2D)
│   ├── HexTile (for each hex)
│   └── ...
└── (optional) HexGrid (Line2D for debug)
```

### 4.3 Generation Pseudocode

```gdscript
func generate_island(map_radius: int, fog_radius: int) -> void:
    tiles.clear()
    for q in range(-map_radius, map_radius + 1):
        for r in range(-map_radius, map_radius + 1):
            var hex = Vector2i(q, r)
            var dist = hex_distance(hex, Vector2i.ZERO)
            if dist > map_radius:
                continue
            var tile_type: TileType
            if dist <= fog_radius:
                tile_type = TileType.FOG
            elif dist == fog_radius + 1:
                tile_type = _pick_coastline_tile(hex)  # Field/Mountain/Desert/Forest
            else:
                tile_type = TileType.WATER
            set_tile(hex, tile_type)
```

---

## 5. Reference: Hexagonal_Grids.html

Key sections in `documentation/Hexagonal_Grids.html`:

- **Lines 734–740**: Cube coordinates as slice of 3D grid; benefits for algorithms
- **Coordinates**: Cube, Axial, Offset (we use Axial/Cube)
- **Neighbors**: Direction vectors for cube/axial
- **Conversions**: hex_to_pixel, pixel_to_hex (with size)
- **Map storage**: `makeHexagonalShape(N)` for radial maps

Supporting algorithms in `documentation/Hexagonal_Grids_files/hex-algorithms.js`:
- `makeHexagonalShape(N)`, `hexRing(radius)`, `breadthFirstSearch`, `hexLineFractional`

---

## 6. Godot Project Structure (Suggested)

```
landgrab_gd/
├── project.godot
├── scenes/
│   ├── main.tscn              # Game root
│   ├── hex_map.tscn            # HexMap scene
│   └── hex_tile.tscn           # Single hex tile
├── scripts/
│   ├── hex_coord.gd            # Coordinate math
│   ├── hex_map.gd              # Map logic & generation
│   └── hex_tile.gd             # Tile rendering
├── resources/
│   ├── tile_types.gd           # TileType enum
│   └── textures/               # Tile sprites (or use ColorRect for MVP)
└── documentation/
    ├── Hex_Grid_Info.md        # This file
    └── Hexagonal_Grids.html    # External reference
```

---

## 7. Next Steps (Implementation Order)

1. Create `HexCoord` / coordinate utilities in GDScript
2. Implement `hex_to_pixel` and `pixel_to_hex`; verify with a simple grid
3. Create `HexTile` scene (polygon or sprite) and position tiles
4. Implement `HexMap` with `generate_island`
5. Add tile type visuals (colors for MVP: gray=Fog, green=Field, blue=Water, etc.)
6. Implement input: click/pixel → hex; highlight selected hex
7. Integrate with game logic (Expedition, Build, etc. from README)

---

## 8. Game Mechanics Integration (from README)

- **Expedition**: Select a tile; adjacent Fog tiles convert to another type
- **Build**: Place Farm/Settlement on Field or Sand, adjacent to player-owned tile
- **Adjacency**: Use `get_neighbors(hex)` for revenue, resources, and build rules

---

*Plan created for Landgrab hex grid implementation. Coordinate system and formulas based on [Red Blob Games: Hexagonal Grids](https://www.redblobgames.com/grids/hexagons/).*
