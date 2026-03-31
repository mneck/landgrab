# Landgrab — Implementation status (`boardgame/`)

This note tracks what the **Vite + React + boardgame.io** client implements today. It replaces older notes that referred to a separate `landgrab_react` tree and obsolete victory conditions.

**Rules reference:** [`boardgame/rules/rules_bg.md`](../boardgame/rules/rules_bg.md)

---

## Map & hex core

| Area | Location |
|------|----------|
| Axial/cube hex math, shape generation, pixel helpers | `boardgame/src/utils/hexGrid.ts` |
| Island generation (Fog ring, coastline, Water rim) | `boardgame/src/game/types.ts` → `generateIsland()` |
| Tile / building types (includes **Fisheries** on Water) | `boardgame/src/game/types.ts` |
| Placement & procurement rules | `boardgame/src/game/gameRules.ts` |

---

## Game flow

| Feature | Notes |
|---------|--------|
| Turn structure | 2 actions/tokens; tokens cannot repeat the same card in one turn |
| Tableau | Personnel + Events; max 8 cards; Mandate activation strips Events |
| Starting hands | Builder/Elder + Guide + Liaison + Charter; starting resources 5/1/1/1 |
| Win condition | Default **2 Seats** (`SEATS_TO_WIN`); `winSeatThreshold` can be overridden in setup |
| Mandate scheduling | Fog threshold + intervals `[4,3,3]` then recurring `3` — see `gameActions.ts` |
| Politics | 4 slots, costs **0–3 🗳️**; Bureaucrat receives 🗳️ paid by others |
| Network auctions | Blind **💰** bids; `networkBid` stage in `moves.ts` |
| Resource market | Buy/sell via Builder; tracks `woodMarket` / `oreMarket` |
| AI | `boardgame/src/ai/aiStrategy.ts` |

---

## Documentation map

| File | Role |
|------|------|
| `documentation/rules.md` | Short summary + pointer to canonical rules |
| `documentation/PlayerRuleBook.md` | Player-facing quick reference |
| `documentation/Hex_Grid_Info.md` | Hex math + link to in-repo implementation |
| `boardgame/rules/rules_bg.md` | Full rules text for current mechanics |

---

*Last reviewed against the `boardgame` package structure in March 2026.*
