import { describe, it, expect } from "vitest";
import { generateIsland } from "../../src/types/game";
import { hexDistance, hexKey, hexNeighbors } from "../../src/utils/hexGrid";

describe("generateIsland - outermost fog ring becomes Field", () => {
  it("outermost fog hexes (dist === fogRadius) should always be Field", () => {
    const mapRadius = 6;
    const fogRadius = 4;
    const center = { q: 0, r: 0 };

    for (let run = 0; run < 20; run++) {
      const tiles = generateIsland(mapRadius, fogRadius);

      for (const tile of Object.values(tiles)) {
        const dist = hexDistance(tile.hex, center);
        if (dist === fogRadius) {
          expect(
            tile.type,
            `Outermost fog hex ${hexKey(tile.hex)} at dist ${fogRadius} should be Field`
          ).toBe("Field");
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
