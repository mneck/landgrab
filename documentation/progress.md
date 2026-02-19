# Landgrab Development Progress

## 1. Map Mechanics

### Implemented ✓

| Feature | Status | Location |
|---------|--------|----------|
| **Hex grid system** | Done | `utils/hexGrid.ts` – axial coordinates, pointy-top, distance, neighbors, shape generation |
| **Pixel ↔ hex conversion** | Done | `hexToPixel`, `pixelToHex`, `hexCornerPoints` for rendering and click detection |
| **Island generation** | Done | `generateIsland()` in `types/game.ts` – fog interior, coastline ring, water rim |
| **Tile types** | Done | Fog, Field, Mountain, Water, Forest, Sand – all defined and rendered |
| **Building types** | Done | Village, Resort, Housing, IndustrialZone, Farm, Infrastructure, CivicOffice, Reserve |
| **HexMap rendering** | Done | `HexMap.tsx` – SVG map with hexes, click handling |
| **HexTile rendering** | Done | `HexTile.tsx` – terrain images, building overlays, selection highlight |
| **Charter placement** | Done | Places initial building by player type (Village/Resort/IndustrialZone/Infrastructure) on valid hexes |
| **Charter fog reveal** | Done | Adjacent Fog hexes reveal when placing Charter; outer fog ring→Field, inner→random Field/Mountain/Forest/Sand |
| **Hex selection** | Done | Selected hex highlight, placement mode with cancel |

### Not Yet Implemented

- **Expedition event** – Select any non-Fog tile; adjacent Fog tiles reveal (Mountain/Forest/Field/Sand/Water)
- **Elder (Chieftain)** – Convert Fog to tile + place Village, or add Reserve card to hand
- **Build placement rules** – Adjacency requirements per player type (e.g., IndustrialZone adjacent to Farm/IndustrialZone/Infrastructure)
- **Build restriction** – Buildings cannot be placed adjacent to Fog (Expedition must reveal first)
- **Reserve placement** – Adjacent to Village or Reserve; escalating coin cost

---

## 2. Player and Game Mechanics

### Implemented ✓

| Feature | Status | Location |
|---------|--------|----------|
| **Player types** | Done | Hotelier, Industrialist, Bureaucrat, Chieftain |
| **Player state** | Done | `hand`, `resources` (wood, ore, coins, votes), `victoryProgress` |
| **Card types** | Done | Personnel: Builder, Elder, Liaison, Explorer; Event: Charter, Build, Procurement, Expedition, Reserve |
| **Initial game state** | Done | 2-player default (Hotelier, Industrialist), initial hands per type |
| **Turn structure** | Done | `currentPlayerIndex`, `actionsRemaining` (2 per turn) |
| **End turn** | Done | Advances player, resets actions to 2 |
| **Charter play** | Done | Consumes 1 action, removes Charter from hand, places building |
| **PlayerPanel UI** | Done | Player type, resources, hand display |
| **GameActions UI** | Done | Actions remaining, Play Charter, Cancel placement, End Turn |

### Not Yet Implemented

- **Draw card action** – Second action type (draw vs. play)
- **Personnel → Event flow** – Builder→Build, Liaison→Procurement, Explorer→Expedition, Elder→Village/Reserve
- **Build event** – Cost 1 Wood, 1 Ore, 1 Coin; adjacency rules; no Fog-adjacent placement
- **Procurement event** – Market buy/sell (1–4 Wood/Ore) OR resource generation:
  - Resort: 1 Coin per adjacent Forest, Water, Mountain
  - IndustrialZone: 1 Wood per Forest, 1 Ore per Mountain
  - Infrastructure: 1 Vote per adjacent building (Resort, Village, etc.)
- **Reserve event (Chieftain)** – Cost 1+reserves already placed; adjacency to Village/Reserve
- **Victory conditions** – Hotelier 12 Coins, Industrialist 10 VP, Bureaucrat 10 Votes, Chieftain 6 Reserves
- **Resource Market** – 4 price slots (1–4) per Wood/Ore; half-full at start; buy/sell via Procurement
- **Conference** – 4 Personnel cards; bidding for recruits
- **Politics market** – 4 Event cards; Bureaucrat sets prices; purchase via Procurement

---

## 3. Next Steps for Implementation

### Phase 1: Core Turn Loop and Card Play

1. **Add Draw action** – Allow "Draw a card" as an action (alongside "Play a card"). Define a draw pile / discard pile model.
2. **Wire up Personnel cards** – Builder, Liaison, Explorer put Build, Procurement, Expedition into hand (and go to discard). Elder has dual options.
3. **Implement Expedition** – UI to select a non-Fog hex; reveal all adjacent Fog hexes with random revealed types.

### Phase 2: Build and Procurement

4. **Build event** – Cost validation (1W, 1O, 1 Coin); adjacency rules per player type; block placement adjacent to Fog; update tiles and deduct resources.
5. **Procurement – resource generation** – On play, compute Coins (Resort), Wood/Ore (IndustrialZone), Votes (Infrastructure) from adjacencies; add to player resources.
6. **Resource Market** – Add market state (Wood/Ore slots at 1–4); Procurement can buy/sell 1–4 Wood or Ore per action.

### Phase 3: Chieftain and Victory

7. **Reserve event** – Chieftain placement with escalating cost; adjacency to Village or Reserve.
8. **Victory check** – After each action/turn, check Hotelier (12 Coins), Industrialist (10 VP), Bureaucrat (10 Votes), Chieftain (6 Reserves); end game on win.

### Phase 4: Auxiliary Systems

9. **Conference** – 4 Personnel cards; bid with Coins; replenish at end of Bureaucrat turn.
10. **Politics market** – 4 Event cards; Bureaucrat sets costs; purchase via Procurement; Bureaucrat gains Vote when non-Bureaucrat buys at 3–4 Coins.

---

## File Reference

| Path | Purpose |
|------|---------|
| `landgrab_react/src/types/game.ts` | Game types, `generateIsland`, `createInitialGameState` |
| `landgrab_react/src/utils/hexGrid.ts` | Hex math, pixel conversion, shape generation |
| `landgrab_react/src/App.tsx` | Game state, Charter placement, turn handling |
| `landgrab_react/src/components/HexMap.tsx` | Map container, click handling |
| `landgrab_react/src/components/HexTile.tsx` | Tile rendering, terrain + building assets |
| `landgrab_react/src/components/PlayerPanel.tsx` | Player display |
| `landgrab_react/src/components/GameActions.tsx` | Action buttons |
| `documentation/Rules.md` | Game rules reference |
