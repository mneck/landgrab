# Landgrab — Rules (summary)

This folder holds human-readable rules notes. The **authoritative rules text** for the current digital implementation is maintained alongside the app:

**→ [`boardgame/rules/rules_bg.md`](../boardgame/rules/rules_bg.md)**

The sections below summarize how the **boardgame** client behaves today so this file does not drift from code. If anything disagrees with `rules_bg.md` or the implementation, trust the app and `rules_bg.md` first.

---

## What changed vs. older drafts

- **Personnel:** **Guide** replaced **Explorer** (reveal Fog next to a hex, or bid on the Network row).
- **Turn model:** Players use **2 Action Tokens** per turn on **2 different cards** in a **Tableau** (not a separate draw pile / hand in the classic sense). Tableau size is capped at **8** cards.
- **Victory:** **2 Seats** wins by default (`SEATS_TO_WIN` in code; playtests may override).
- **Mandate follow-up:** Activating a Mandate clears your Events and adds **Seat** + **Restructuring** (not “Promotion” + Dividends). **Restructuring** removes a Personnel and adds **Stimulus** (pick 4 resources in any mix).
- **Conference → Network:** Hiring Personnel uses a **Network** row and **blind coin bids** initiated from **Guide** (not clockwise multi-resource counter-bids).
- **Politics:** Cards are bought with **Votes** per slot (0–3 🗳️), not Coins. When a **non-Bureaucrat** pays Votes for a card, those Votes go to the **Bureaucrat** (if present).
- **Starting Politics row** (implementation): Graft, Import, Airstrip, Expropriation (deck is shuffled; Mandates are inserted on a schedule after the fog threshold).
- **3-player lineup:** Hotelier, Industrialist, **Chieftain** (not a choice with Bureaucrat).

---

## Core loop (digital)

1. Each player starts with **5 💰, 1 🪵, 1 ⚙️, 1 🗳️** and a tableau of **Builder, Guide, Liaison, Charter** (Chieftain: **Elder** instead of Builder).
2. **First player:** blind bid 0–5 💰; high bid pays and goes first (ties resolved in code).
3. Each turn: place **two tokens on two different cards**; resolve each card.
4. **Builder:** build (1 🪵 + 1 ⚙️ + 1 💰) **or** buy/sell Wood/Ore on the Resource Market.
5. **Liaison:** **Procurement** (generate from buildings) **or** **Politics** (buy one track card with 🗳️).
6. **Guide:** reveal Fog adjacent to a chosen non-Fog hex **or** start a **Network** auction (blind 💰 bids).
7. **Elder (Chieftain):** place Village on Fog (reveals terrain) **or** place Reserve per Reserve rules.

---

## Mandates & Seats

- After enough **Fog** is revealed (~half the fog hexes), a **Mandate** can enter the Politics track, then further Mandates follow a **4 → 3 → 3 → then every 3** “cards since threshold” schedule (see `MANDATE_INTERVALS` / `gameActions.ts`).
- **Acquire** a Mandate via **Liaison → Politics** like any Event (pay the slot’s 🗳️ cost).
- **Activate** Mandate only as the **first action** of a turn: pay **1 🗳️** plus your faction’s **10 + Seat#** cost (Chieftain: **Presence ≥ 10 + Seat#**). This **removes all Events** from your tableau, increases **Seats**, and adds **Seat** + **Restructuring** if there is room.

---

## Markets

- **Resource Market:** four price slots (1–4 💰) each for Wood and Ore; starts **half full** in code (`[0,0,1,1]` per track). Emergency restock to slot 4 if a row is empty at end of turn.
- **Network row (starting):** Broker, Forester, Fixer, Advocate; refill from a shuffled deck.

---

## Newer buildings & events (non-exhaustive)

- **Fisheries** (Event): place on **Water** adjacent to your building; adjacent to a **Resort** it reduces that Resort’s procurement like Industrial Zoned pressure in code.
- **Airstrip** (Event): pay resources to place **Infrastructure** on Sand/Field with relaxed adjacency (see card text in app).

For full card lists and edge cases, see **`boardgame/rules/rules_bg.md`** and **`boardgame/src/data/cardData.ts`**.
