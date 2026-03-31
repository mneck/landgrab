# Bot batch playtesting

This folder runs **headless bot-vs-bot** games using the same `getAIMove` strategy as solo AI, via `boardgame.io` **Local** multiplayer (same mechanism as `src/__tests__/multiplayer.test.ts`).

## Quick start

From `boardgame/`, batch playtesting is **`vitest run playtesting/cli.test.ts`** (see also `npm run playtest` and `npm run test:playtest-batch`). Configure with **environment variables** (not CLI flags):

```bash
PLAYTEST_GAMES=200 PLAYTEST_PLAYERS=3 npm run playtest
```

Quick smoke (one game per default env in `cli.test.ts`; set `PLAYTEST_GAMES=1` explicitly):

```bash
PLAYTEST_GAMES=1 PLAYTEST_PLAYERS=2 npm run playtest
```

Default **`npm test`** runs `playtesting/batch.test.ts` (single-game smoke) but **excludes** `cli.test.ts` so CI stays fast.

## What to look for

| Signal | What it might mean |
|--------|---------------------|
| High **failed** count | `INVALID_MOVE`, stuck state, or `getAIMove` returning null — possible **bugs** in rules or AI |
| High **aborted** (max steps) | Games not finishing — possible **infinite loop**, deadlock, or win condition not reachable |
| **avgSteps** / **avgTurns** drift after a rules change | **Balance** or pacing shift (compare before/after baselines) |
| Skewed **wins** by faction | **Faction balance** (same AI for all seats — differences come from rules, map, turn order) |
| Unique **errors** in JSON | Concrete strings to grep in `simulator.ts` / `moves.ts` / `aiStrategy.ts` |

## Limitations

- **Same bot for every seat** — measures mechanics and rule interactions, not strategic diversity.
- **Nondeterministic maps** — island and shuffles use `Math.random` unless you add a seeded RNG to `setup` later.
- **Flaky timing** — the runner uses `setTimeout(0)` to flush Local transport; if you see odd failures, try increasing the delay slightly in `simulator.ts`.
- **Secrets** — full `G` is visible to the test client; no human-style hidden information.

## Files

| File | Role |
|------|------|
| `simulator.ts` | `runBotGame`, `runBatch`, aggregates wins and errors |
| `batch.test.ts` | Single-game smoke; included in default `npm test` |
| `cli.test.ts` | Large batch via env vars; run with `npm run playtest` (excluded from default `npm test`) |
| `playtestGame.ts` | `LandgrabPlaytestGame` — smoke tableaux (Builder/Elder, Liaison, Guide, Charter); Mandate added to tableau after each Charter placement; 1-seat win; `runBotGame({ fastWin: true })` |
| `notes.md` | This file |

## Extending

- **Scenarios** — add named presets (e.g. mid-game fixture state) by exporting a function that builds `LandgrabState` and a small driver that hydrates clients (may require boardgame.io APIs or replay moves).
- **Seeds** — pass `LandgrabGame.seed` and thread a PRNG through `createInitialState` / `shuffle` for reproducible batches.
- **Metrics** — log Mandate timing, average resources at win, or politics purchases by writing hooks in `runBotGame` after each step.
- **Multiple policies** — fork `getAIMove` or pass a strategy id into a wrapper and run A/B batches.

## CI

Default `npm test` includes the **batch smoke** (`batch.test.ts`). For a larger batch, call the CLI test explicitly:

```bash
PLAYTEST_GAMES=20 PLAYTEST_PLAYERS=4 npm run test:playtest-batch
```

Exit code `1` if any game **failed** (see JSON stderr summary in `cli.test.ts`). Tune thresholds as needed.
