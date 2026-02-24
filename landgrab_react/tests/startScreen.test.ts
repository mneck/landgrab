import { describe, it, expect } from "vitest";
import { createInitialGameState } from "../src/types/game";
import type { PlayerType, CardType, PoliticsCard } from "../src/types/game";
import { refillPoliticsSlots } from "../src/gameActions";

/**
 * Tests for the start screen player selection logic.
 *
 * The start screen offers three configurations:
 *   2 players => Hotelier + Industrialist
 *   3 players => Hotelier + Industrialist + (Bureaucrat | Chieftain)
 *   4 players => Hotelier + Industrialist + Bureaucrat + Chieftain
 */

const CONFIGS: { label: string; types: PlayerType[] }[] = [
  { label: "2-player", types: ["Hotelier", "Industrialist"] },
  { label: "3-player (Bureaucrat)", types: ["Hotelier", "Industrialist", "Bureaucrat"] },
  { label: "3-player (Chieftain)", types: ["Hotelier", "Industrialist", "Chieftain"] },
  { label: "4-player", types: ["Hotelier", "Industrialist", "Bureaucrat", "Chieftain"] },
];

describe("createInitialGameState — player selection", () => {
  for (const { label, types } of CONFIGS) {
    describe(label, () => {
      const state = createInitialGameState(types);

      it("creates the correct number of players", () => {
        expect(state.players).toHaveLength(types.length);
      });

      it("assigns the correct player types in order", () => {
        expect(state.players.map((p) => p.type)).toEqual(types);
      });

      it("gives every player 5 starting cards in hand", () => {
        for (const player of state.players) {
          expect(player.hand).toHaveLength(5);
        }
      });

      it("gives non-Chieftain players Builder, Liaison, Explorer, Charter, Import", () => {
        const expected: CardType[] = ["Builder", "Liaison", "Explorer", "Charter", "Import"];
        for (const player of state.players) {
          if (player.type !== "Chieftain") {
            expect(player.hand).toEqual(expected);
          }
        }
      });

      it("gives the Chieftain Elder, Liaison, Explorer, Charter, Import", () => {
        const expected: CardType[] = ["Elder", "Liaison", "Explorer", "Charter", "Import"];
        for (const player of state.players) {
          if (player.type === "Chieftain") {
            expect(player.hand).toEqual(expected);
          }
        }
      });

      it("starts every player with 1 Wood, 1 Ore, 1 Coin, 0 Votes", () => {
        for (const player of state.players) {
          expect(player.resources).toEqual({ wood: 1, ore: 1, coins: 1, votes: 0 });
        }
      });

      it("starts every player with 0 seats", () => {
        for (const player of state.players) {
          expect(player.seats).toBe(0);
        }
      });

      it("starts every player with empty draw and discard piles", () => {
        for (const player of state.players) {
          expect(player.drawPile).toHaveLength(0);
          expect(player.discardPile).toHaveLength(0);
        }
      });
    });
  }
});

describe("createInitialGameState — initial game state", () => {
  const state = createInitialGameState(["Hotelier", "Industrialist"]);

  it("starts on player 0 with 2 actions", () => {
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(2);
  });

  it("has no winner at start", () => {
    expect(state.winner).toBeUndefined();
  });

  it("initialises the resource markets half-full", () => {
    expect(state.woodMarket).toEqual([0, 0, 1, 1]);
    expect(state.oreMarket).toEqual([0, 0, 1, 1]);
  });
});

describe("createInitialGameState — Politics deck Mandate schedule", () => {
  it("does not place Mandate in the initial 4 politics slots (Mandates are inserted by fog threshold and reveal schedule)", () => {
    for (let i = 0; i < 20; i++) {
      const state = createInitialGameState(["Hotelier", "Industrialist"]);
      for (const slot of state.politics) {
        expect(slot).not.toBe("Mandate");
      }
    }
  });

  it("politics deck has no Mandate (Mandates are inserted by game rules, not drawn)", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    const allCards = [...state.politics, ...state.politicsDeck];
    expect(allCards).not.toContain("Mandate");
  });

  it("has mandate-tracking state: totalFog, fogRevealed, thresholdReached, revealedPoliticsSinceThreshold, mandateIntervalIndex", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    expect(state.totalFog).toBeGreaterThan(0);
    expect(state.fogRevealed).toBe(0);
    expect(state.thresholdReached).toBe(false);
    expect(state.revealedPoliticsSinceThreshold).toBe(0);
    expect(state.mandateIntervalIndex).toBe(0);
  });
});

describe("refillPoliticsSlots — fill empty slots from deck", () => {
  it("fills one empty slot from deck (deck has no Mandate)", () => {
    const deck: PoliticsCard[] = ["Build", "Procurement", "Bribe"];
    const slots: (PoliticsCard | null)[] = ["Zoning", "Logging", "Graft", null];
    const { politics, politicsDeck } = refillPoliticsSlots(slots, deck);
    expect(politics[3]).toBe("Build");
    expect(politicsDeck).toHaveLength(2);
  });

  it("never places two Mandates in the market simultaneously (initial state has no Mandate)", () => {
    for (let i = 0; i < 20; i++) {
      const state = createInitialGameState(["Hotelier", "Industrialist"]);
      const mandatesInMarket = state.politics.filter((c) => c === "Mandate").length;
      expect(mandatesInMarket).toBeLessThanOrEqual(1);
    }
  });
});

describe("createInitialGameState — Conference market", () => {
  it("fills all 4 conference slots with personnel cards", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    for (let i = 0; i < 4; i++) {
      expect(state.conference[i]).not.toBeNull();
    }
  });

  it("draws conference cards from the conference deck (full pool shuffled, 12 cards)", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    expect(state.conferenceDeck).toHaveLength(12);
  });
});

describe("createInitialGameState — default params", () => {
  it("defaults to 2-player (Hotelier + Industrialist) when called with no args", () => {
    const state = createInitialGameState();
    expect(state.players).toHaveLength(2);
    expect(state.players[0].type).toBe("Hotelier");
    expect(state.players[1].type).toBe("Industrialist");
  });
});
