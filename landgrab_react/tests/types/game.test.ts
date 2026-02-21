import { describe, it, expect } from "vitest";
import {
  generateIsland,
  createInitialGameState,
  decrementActionsRemaining,
} from "../../src/types/game";
import type { PoliticsCard, PersonnelCard } from "../../src/types/game";
import { hexDistance, hexKey, hexNeighbors } from "../../src/utils/hexGrid";

const POLITICS_EXCLUDED: PoliticsCard[] = [
  "Procurement",
  "Build",
  "Reserve",
  "Contact",
  "Expedition",
];
const CONFERENCE_EXCLUDED: PersonnelCard[] = ["Liaison", "Builder", "Explorer"];

describe("actionsRemaining", () => {
  it("createInitialGameState has actionsRemaining >= 0", () => {
    const state = createInitialGameState();
    expect(state.actionsRemaining).toBeGreaterThanOrEqual(0);
  });

  it("decrementActionsRemaining never returns negative", () => {
    expect(decrementActionsRemaining(2)).toBe(1);
    expect(decrementActionsRemaining(1)).toBe(0);
    expect(decrementActionsRemaining(0)).toBe(0);
    expect(decrementActionsRemaining(-1)).toBe(0);
    expect(decrementActionsRemaining(-10)).toBe(0);
  });
});

describe("generateIsland - fog ring at distance 4", () => {
  it("hexes at dist === fogRadius are Fog except adjacent to Water (then Field)", () => {
    const mapRadius = 6;
    const fogRadius = 4;
    const center = { q: 0, r: 0 };

    for (let run = 0; run < 20; run++) {
      const tiles = generateIsland(mapRadius, fogRadius);
      const tilesByKey = Object.fromEntries(
        Object.values(tiles).map((t) => [hexKey(t.hex), t])
      );

      for (const tile of Object.values(tiles)) {
        const dist = hexDistance(tile.hex, center);
        if (dist === fogRadius) {
          expect(
            tile.type === "Fog" || tile.type === "Field",
            `Hex ${hexKey(tile.hex)} at dist ${fogRadius} should be Fog or Field`
          ).toBe(true);
          const hasWaterNeighbor = hexNeighbors(tile.hex).some((nb) => {
            const t = tilesByKey[hexKey(nb)];
            return t?.type === "Water";
          });
          if (tile.type === "Field") {
            expect(hasWaterNeighbor, `Dist-4 Field ${hexKey(tile.hex)} should be adjacent to Water`).toBe(true);
          } else {
            expect(hasWaterNeighbor, `Dist-4 Fog ${hexKey(tile.hex)} should not be adjacent to Water`).toBe(false);
          }
        }
      }
    }
  });

  it("no Fog hex should be adjacent to any Water hex in the starting map", () => {
    const mapRadius = 6;
    const fogRadius = 4;
    const center = { q: 0, r: 0 };

    for (let run = 0; run < 20; run++) {
      const tiles = generateIsland(mapRadius, fogRadius);
      const fogKeys = new Set(
        Object.values(tiles)
          .filter((t) => t.type === "Fog")
          .map((t) => hexKey(t.hex))
      );
      const waterKeys = new Set(
        Object.values(tiles)
          .filter((t) => t.type === "Water")
          .map((t) => hexKey(t.hex))
      );

      for (const fogKey of fogKeys) {
        const [q, r] = fogKey.split(",").map(Number);
        for (const neighbor of hexNeighbors({ q, r })) {
          const neighborKey = hexKey(neighbor);
          expect(
            waterKeys.has(neighborKey),
            `Fog hex ${fogKey} should not be adjacent to Water hex ${neighborKey}`
          ).toBe(false);
        }
      }
    }
  });
});

describe("createInitialGameState - market and deck rules", () => {
  it("initial Politics row is always Graft, Import, Import, Logging in that order", () => {
    for (let i = 0; i < 10; i++) {
      const state = createInitialGameState();
      expect(state.politics[0]).toBe("Graft");
      expect(state.politics[1]).toBe("Import");
      expect(state.politics[2]).toBe("Import");
      expect(state.politics[3]).toBe("Logging");
    }
  });

  it("Politics deck never contains Procurement, Build, Reserve, Contact, or Expedition", () => {
    for (let i = 0; i < 5; i++) {
      const state = createInitialGameState();
      for (const card of state.politicsDeck) {
        expect(
          POLITICS_EXCLUDED,
          `politicsDeck should not contain ${card}`
        ).not.toContain(card);
      }
      for (const card of state.politics) {
        if (card) {
          expect(
            POLITICS_EXCLUDED,
            `politics row should not contain ${card}`
          ).not.toContain(card);
        }
      }
    }
  });

  it("initial Conference row is always Broker, Forester, Fixer, Advocate in that order", () => {
    for (let i = 0; i < 10; i++) {
      const state = createInitialGameState();
      expect(state.conference[0]).toBe("Broker");
      expect(state.conference[1]).toBe("Forester");
      expect(state.conference[2]).toBe("Fixer");
      expect(state.conference[3]).toBe("Advocate");
    }
  });

  it("Conference deck never contains Liaison, Builder, or Explorer", () => {
    for (let i = 0; i < 5; i++) {
      const state = createInitialGameState();
      for (const card of state.conferenceDeck) {
        expect(
          CONFERENCE_EXCLUDED,
          `conferenceDeck should not contain ${card}`
        ).not.toContain(card);
      }
      for (const card of state.conference) {
        if (card) {
          expect(
            CONFERENCE_EXCLUDED,
            `conference row should not contain ${card}`
          ).not.toContain(card);
        }
      }
    }
  });
});
