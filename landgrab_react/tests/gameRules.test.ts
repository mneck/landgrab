import { describe, it, expect } from "vitest";
import { canPlaceCharter, revealAdjacentFog } from "../src/gameRules";
import { hexKey, hexNeighbors } from "../src/utils/hexGrid";
import type { GameState } from "../src/types/game";

function makeTile(hex: { q: number; r: number }, type: GameState["tiles"][string]["type"]): GameState["tiles"][string] {
  return { hex, type };
}

describe("Charter placement - ignore adjacent Fog rule", () => {
  it("allows placing Charter on a valid hex that has adjacent Fog (Charter ignores no-building-adjacent-to-Fog)", () => {
    const placeHex = { q: 0, r: 0 };
    const tiles: GameState["tiles"] = {
      [hexKey(placeHex)]: makeTile(placeHex, "Field"),
    };
    for (const neighbor of hexNeighbors(placeHex)) {
      tiles[hexKey(neighbor)] = makeTile(neighbor, "Fog");
    }

    expect(canPlaceCharter(tiles, placeHex, "Hotelier", "Resort")).toBe(true);
    expect(canPlaceCharter(tiles, placeHex, "Chieftain", "Village")).toBe(true);
  });

  it("still rejects placement when the placement hex itself is Fog", () => {
    const placeHex = { q: 0, r: 0 };
    const tiles: GameState["tiles"] = {
      [hexKey(placeHex)]: makeTile(placeHex, "Fog"),
    };

    expect(canPlaceCharter(tiles, placeHex, "Hotelier", "Resort")).toBe(false);
  });

  it("rejects invalid terrain for the building type", () => {
    const placeHex = { q: 0, r: 0 };
    const tiles: GameState["tiles"] = {
      [hexKey(placeHex)]: makeTile(placeHex, "Water"),
    };

    expect(canPlaceCharter(tiles, placeHex, "Hotelier", "Resort")).toBe(false);
  });
});

describe("revealAdjacentFog", () => {
  it("reveals adjacent Fog hexes when placing (e.g. with Charter)", () => {
    const centerHex = { q: 0, r: 0 };
    const fogRadius = 4;
    const tiles: GameState["tiles"] = {
      [hexKey(centerHex)]: makeTile(centerHex, "Field"),
    };
    for (const neighbor of hexNeighbors(centerHex)) {
      tiles[hexKey(neighbor)] = makeTile(neighbor, "Fog");
    }

    const result = revealAdjacentFog(tiles, centerHex, fogRadius);

    for (const neighbor of hexNeighbors(centerHex)) {
      const nk = hexKey(neighbor);
      expect(result[nk]?.type).not.toBe("Fog");
    }
  });

  it("does not modify the placement hex", () => {
    const centerHex = { q: 0, r: 0 };
    const fogRadius = 4;
    const tiles: GameState["tiles"] = {
      [hexKey(centerHex)]: makeTile(centerHex, "Field"),
    };

    const result = revealAdjacentFog(tiles, centerHex, fogRadius);

    expect(result[hexKey(centerHex)]?.type).toBe("Field");
  });
});
