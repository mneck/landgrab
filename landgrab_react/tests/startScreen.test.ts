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

      it("gives every player 4 starting cards in hand", () => {
        for (const player of state.players) {
          expect(player.hand).toHaveLength(4);
        }
      });

      it("gives non-Chieftain players Builder, Liaison, Explorer, Charter", () => {
        const expected: CardType[] = ["Builder", "Liaison", "Explorer", "Charter"];
        for (const player of state.players) {
          if (player.type !== "Chieftain") {
            expect(player.hand).toEqual(expected);
          }
        }
      });

      it("gives the Chieftain Elder, Liaison, Explorer, Charter", () => {
        const expected: CardType[] = ["Elder", "Liaison", "Explorer", "Charter"];
        for (const player of state.players) {
          if (player.type === "Chieftain") {
            expect(player.hand).toEqual(expected);
          }
        }
      });

      it("starts every player with 0 resources", () => {
        for (const player of state.players) {
          expect(player.resources).toEqual({ wood: 0, ore: 0, coins: 0, votes: 0 });
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
  it("does not place Mandate in the initial 4 politics slots (first Mandate is after 5 cards)", () => {
    for (let i = 0; i < 20; i++) {
      const state = createInitialGameState(["Hotelier", "Industrialist"]);
      for (const slot of state.politics) {
        expect(slot).not.toBe("Mandate");
      }
    }
  });

  it("places the first Mandate after exactly 5 regular cards in the combined deck", () => {
    for (let i = 0; i < 20; i++) {
      const state = createInitialGameState(["Hotelier", "Industrialist"]);
      const allCards = [...state.politics, ...state.politicsDeck];
      const firstMandateIdx = allCards.indexOf("Mandate");
      expect(firstMandateIdx).toBe(5);
    }
  });

  it("spaces Mandates at 5, 4, 3, 2, 2… gaps in the full deck", () => {
    for (let run = 0; run < 10; run++) {
      const state = createInitialGameState(["Hotelier", "Industrialist"]);
      const allCards = [...state.politics, ...state.politicsDeck];
      const mandatePositions: number[] = [];
      allCards.forEach((c, i) => { if (c === "Mandate") mandatePositions.push(i); });

      expect(mandatePositions.length).toBeGreaterThanOrEqual(4);
      const gaps: number[] = [];
      let prev = -1;
      for (const pos of mandatePositions) {
        gaps.push(pos - prev - 1);
        prev = pos;
      }
      expect(gaps[0]).toBe(5);
      expect(gaps[1]).toBe(4);
      expect(gaps[2]).toBe(3);
      for (let g = 3; g < gaps.length; g++) {
        expect(gaps[g]).toBe(2);
      }
    }
  });

  it("interleaves Mandate cards into the politics deck (deck contains Mandate)", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    expect(state.politicsDeck).toContain("Mandate");
  });
});

describe("refillPoliticsSlots — Mandate duplicate rule", () => {
  it("places Mandate when none is already in the market", () => {
    const deck: PoliticsCard[] = ["Mandate", "Build", "Procurement"];
    const slots: (PoliticsCard | null)[] = ["Bribe", "Zoning", "Logging", null];
    const { politics } = refillPoliticsSlots(slots, deck);
    expect(politics).toContain("Mandate");
  });

  it("skips Mandate when one is already visible and draws the next card instead", () => {
    const deck: PoliticsCard[] = ["Mandate", "Build", "Procurement"];
    const slots: (PoliticsCard | null)[] = ["Mandate", "Bribe", "Zoning", null];
    const { politics, politicsDeck } = refillPoliticsSlots(slots, deck);
    expect(politics[3]).toBe("Mandate");
    expect(politics[2]).toBe("Build");
    expect(politicsDeck).toContain("Mandate");
  });

  it("puts the skipped Mandate at the bottom of the deck", () => {
    const deck: PoliticsCard[] = ["Mandate", "Build"];
    const slots: (PoliticsCard | null)[] = ["Mandate", "Bribe", "Zoning", null];
    const { politicsDeck } = refillPoliticsSlots(slots, deck);
    expect(politicsDeck[politicsDeck.length - 1]).toBe("Mandate");
  });

  it("never places two Mandates in the market simultaneously", () => {
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

  it("draws conference cards from the conference deck (total = 18 - 4 = 14 remaining)", () => {
    const state = createInitialGameState(["Hotelier", "Industrialist"]);
    expect(state.conferenceDeck).toHaveLength(14);
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
