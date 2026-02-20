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

## 4. Victory Mechanic: Mandate / Promotion / Seat

### Design Discussion (Feb 2026)

**Current mechanic:**

- **Mandate** (10 resources, any mix) — purchased from the 4-Coin Politics slot on the first action of a turn. Played immediately. Adds Promotion + Seat to discard pile. Ends your turn.
- **Promotion** — fires immediately when drawn. Discards entire hand. Adds Dividends to discard pile.
- **Seat** — play to gain 1 Seat. 4 Seats wins the game.
- **Dividends** updated to include Villages, so Chieftain also benefits from accumulating Dividends cards.

**Settled design decisions:**

1. **Promotion's forced trigger is intentional friction.** Players with Promotions in their deck have an incentive to play everything in hand before drawing, adding strategic tension that other players don't face. "More responsibility means bigger consequences for mistakes."
2. **Mandate cannot be Bribed or removed by Events.** Mandates only appear in the Politics track after the first ~10 Event cards cycle through the market.
3. **Interaction window is pre-purchase.** Once a Mandate enters the track, the game shifts focus to preventing any player from accumulating 10 resources — via Boycotting, Protests, Land Claims, etc. No direct counterplay once a Seat is in someone's deck.
4. **Dividends accumulation is intended.** Each Mandate cycle seeds more Dividends into a player's deck, making subsequent cycles slightly easier — a snowball reward for reaching the threshold.

**Asymmetric Mandate costs (working design):**

Each faction pays for Mandate using their signature resource, with escalating cost per Seat:

| Faction | Mandate cost | Currency | Totals across 4 Seats |
|---------|-------------|----------|----------------------|
| Industrialist | 10 + Seat# | Wood/Ore (any mix, spent) | 10 + 11 + 12 + 13 = 46 |
| Hotelier | 10 + Seat# | Coins (spent) | 10 + 11 + 12 + 13 = 46 |
| Bureaucrat | 10 + Seat# | Votes (spent) | 10 + 11 + 12 + 13 = 46 |
| Chieftain | TBD + Seat# | Presence Score (threshold, not spent) | TBD |

**Chieftain Presence Score:**

The Chieftain's Mandate cost is a board-state threshold, not a resource payment. Their people have always been on this island — the land isn't property to be traded. Victory comes from demonstrating an unbreakable presence.

```
Presence Score =
  +1 per Reserve
  +1 per Village adjacent to at least one Reserve (each Village counted once)
```

Design properties:
- A Reserve placed between 3 Villages contributes 4 to the score (1 + 3 adjacent Villages)
- Rewards natural Village-Reserve clustering into "heartland" territories
- Nothing is removed from the map — the Chieftain's board state is a requirement, not a payment
- Contact lets the Chieftain expand into Fog without Expedition, giving unique expansion speed
- Exact threshold numbers (base + Seat#) to be determined through playtesting

**Balancing levers:**

- **Bureaucrat passive income**: non-Bureaucrat Politics purchases at 3-4 cost give the Bureaucrat 1 Vote. Bureaucrat also controls Politics pricing. Expansion to 2-4 cost considered but deferred to playtesting.
- **Disruption cards targeting Hotelier/Industrialist**: Levy (drain 2 Coins from a player) and Embargo (block Resource market trades on next Procurement) added to balance against Boycotting/Protests which primarily pressure Votes.
- **Duplicate Event cards**: the Politics deck can contain more than 1 copy of a given Event card for balancing purposes (e.g., extra copies of Levy or Dividends to shift the meta).

**Status:** Asymmetric costs are the working design. Card data added for Mandate, Promotion, Seat, Levy, Embargo. Levy and Embargo have game logic. Mandate/Promotion/Seat logic not yet implemented.

---

## File Reference

| Path | Purpose |
|------|---------|
| `landgrab_react/src/types/game.ts` | Game types, `generateIsland`, `createInitialGameState` |
| `landgrab_react/src/utils/hexGrid.ts` | Hex math, pixel conversion, shape generation |
| `landgrab_react/src/App.tsx` | Game state, all card handlers, turn handling, UI |
| `landgrab_react/src/gameRules.ts` | Pure validation: placement rules, adjacency, fog reveal |
| `landgrab_react/src/gameActions.ts` | Pure state transforms: Procurement, Politics market, shuffle |
| `landgrab_react/src/data/cardData.ts` | Card display data: title, flavor, description, icon, category |
| `landgrab_react/src/data/cardRules.ts` | Card constants: Personnel→Event mappings, multi-option lists, costs |
| `landgrab_react/src/components/HexMap.tsx` | Map container, click handling |
| `landgrab_react/src/components/HexTile.tsx` | Tile rendering, terrain + building assets |
| `landgrab_react/src/components/PlayerPanel.tsx` | Player display |
| `landgrab_react/src/components/GameActions.tsx` | Action buttons, Procurement choice UI |
| `landgrab_react/src/components/ConferenceRow.tsx` | Conference market display |
| `landgrab_react/src/components/PoliticsRow.tsx` | Politics market display |
| `landgrab_react/src/components/ResourceMarket.tsx` | Wood/Ore market display |
| `documentation/Rules.md` | Game rules reference |
