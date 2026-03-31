# Landgrab — Player Rulebook

Quick reference aligned with the **boardgame** client. Full detail: [`boardgame/rules/rules_bg.md`](../boardgame/rules/rules_bg.md).

---

## Goal

Be the first to earn **2 Seats** (default win threshold in the app) by activating **Mandate** cards.

---

## Your Turn

You have **2 Action Tokens** per turn. Each token is placed on a **different card** in your **Tableau** (max **8** cards). You **do not** “draw two cards” as a separate action type—drawing is only what specific Event text allows (e.g. Reorganization options).

| Action | What you do |
|--------|-------------|
| Place a token on a **Personnel** card | Resolve that card’s ability; Personnel **stay** in the Tableau. |
| Place a token on a **one-shot Event** | Resolve it, then **remove** it unless the card says otherwise. |

---

## Starting Tableau

| Player | Cards |
|--------|--------|
| Hotelier, Industrialist, Bureaucrat | Builder, **Guide**, Liaison, Charter |
| Chieftain | Elder, **Guide**, Liaison, Charter |

**Starting resources:** 5 💰, 1 🪵, 1 ⚙️, 1 🗳️.

---

## Personnel (stay in Tableau)

| Card | Role |
|------|------|
| **Builder** | Build (1 🪵 + 1 ⚙️ + 1 💰) **or** Resource Market buy/sell |
| **Guide** | **Reveal:** pick a non-Fog hex → reveal adjacent Fog **or** **Network:** blind **💰** auction for one Network card |
| **Liaison** | **Procurement** (income from buildings) **or** **Politics** (buy one track card with 🗳️) |
| **Elder** (Chieftain) | Village on Fog **or** place Reserve |
| **Broker, Forester, Fixer, Advocate, Consultant** | Acquired from Network; each adds or chooses Events per card text |

---

## Events (usually leave the Tableau when resolved)

Core patterns:

- **Charter** — First free placement; removes Charter from Tableau.
- **Mandate** — Bought via Politics; **activate** only as **first action** of a turn (see below).
- **Restructuring** — Added when you activate a Mandate; remove one Personnel, then gain **Stimulus**.
- **Stimulus** — Gain **4 resources** in any mix (💰 🪵 ⚙️ 🗳️), then discard Stimulus.
- **Seat** — Passive marker of progress; **cannot** be “played” for an effect.

Politics track uses **Vote** costs per slot (**0, 1, 2, 3** 🗳️ from left to right). If you are **not** the Bureaucrat and you pay **1+ 🗳️** for a card, those **🗳️ are paid to the Bureaucrat** (if in the game).

---

## Winning: Mandate → Seat (+ Restructuring)

1. **Buy** a Mandate with **Liaison → Politics** like any Event (pay the slot’s 🗳️).
2. On a later turn, as your **first** action, activate Mandate: pay **1 🗳️** plus your faction cost (**10 + seats already held** in 💰, 🪵/⚙️, or 🗳️, or **Presence** threshold for Chieftain — see full rules).
3. **All Events** are removed from your Tableau; your **Seat** count goes up; you add **Seat** + **Restructuring** if there is room.
4. **2 Seats** → win (default).

---

## Network (Guide)

1. Choose **Network** on Guide, then choose a slot.
2. **Blind bid** in **💰** only (minimum 1 for participants); highest bid wins; ties broken per app.
3. Winner pays **💰**; card goes to your Tableau; slot refills from the Network deck.

---

## Resource Market

Four slots per resource (prices 1–4 💰). Buy from cheapest filled slots; sell into highest empty slots. If a row is **empty** at **end of turn**, add one token to the **4 💰** slot (emergency import).

---

## Player counts (implementation)

| Players | Roles |
|---------|--------|
| 2 | Hotelier, Industrialist |
| 3 | Hotelier, Industrialist, Chieftain |
| 4 | Hotelier, Industrialist, Chieftain, Bureaucrat |

---

## Where to read more

- Full rules: [`boardgame/rules/rules_bg.md`](../boardgame/rules/rules_bg.md)
- Card wording: [`boardgame/src/data/cardData.ts`](../boardgame/src/data/cardData.ts)
