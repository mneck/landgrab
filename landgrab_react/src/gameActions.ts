import type { GameState, PlayerType, ResourceTrack, PoliticsCard, PoliticsSlot } from "./types/game";
import { hexKey, hexNeighbors } from "./utils/hexGrid";
import { POLITICS_COSTS, POLITICS_VOTE_COSTS } from "./data/cardRules";
import { MANDATE_INTERVALS } from "./types/game";

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getProcurementMultiplier(tile: { hasUrbanPlanning?: boolean }): number {
  return tile.hasUrbanPlanning ? 2 : 1;
}

function isBuildingBoycotted(
  tiles: GameState["tiles"],
  buildingHexKey: string,
  boycotterType: PlayerType
): boolean {
  const tile = tiles[buildingHexKey];
  if (!tile) return false;
  for (const nb of hexNeighbors(tile.hex)) {
    const nt = tiles[hexKey(nb)];
    if (
      nt?.buildingOwner === boycotterType &&
      (nt.building === "Reserve" || nt.building === "Village")
    )
      return true;
  }
  return false;
}

export function runProcurement(g: GameState, playerType: string): GameState {
  const tiles = g.tiles;
  const res = { ...g.players[g.currentPlayerIndex].resources };
  const boycotter =
    g.boycottEffect?.targetPlayerIndex === g.currentPlayerIndex
      ? g.boycottEffect.boycotterType
      : undefined;

  if (playerType === "Hotelier") {
    for (const t of Object.values(tiles)) {
      if (t.building === "Resort" && t.buildingOwner === "Hotelier") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let prod = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (!nt || nt.building === "Reserve") continue;
          if (["Forest", "Water", "Mountain"].includes(nt.type)) prod += 1;
        }
        if (t.type === "Sand") {
          for (const nb of hexNeighbors(t.hex)) {
            const nt = tiles[hexKey(nb)];
            if (nt?.type === "Water" && nt.building !== "Reserve") { prod += 1; break; }
          }
        }
        res.coins += prod * getProcurementMultiplier(t);
      }
    }
  } else if (playerType === "Industrialist") {
    for (const t of Object.values(tiles)) {
      if (t.building === "IndustrialZone" && t.buildingOwner === "Industrialist") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let wood = 0, ore = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (!nt || nt.building === "Reserve") continue;
          if (nt.type === "Forest") wood += 1;
          if (nt.type === "Mountain") ore += 1;
        }
        const mult = getProcurementMultiplier(t);
        res.wood += wood * mult;
        res.ore += ore * mult;
      }
    }
  } else if (playerType === "Bureaucrat") {
    const countedHexes = new Set<string>();
    for (const t of Object.values(tiles)) {
      if (t.building === "Infrastructure" && t.buildingOwner === "Bureaucrat") {
        const tk = hexKey(t.hex);
        if (boycotter && isBuildingBoycotted(tiles, tk, boycotter)) continue;
        let votes = 0;
        for (const nb of hexNeighbors(t.hex)) {
          const k = hexKey(nb);
          const nt = tiles[k];
          if (
            nt?.building &&
            nt.building !== "Reserve" &&
            ["Resort", "Village", "IndustrialZone", "Farm", "Housing"].includes(
              nt.building
            ) &&
            !countedHexes.has(k)
          ) {
            countedHexes.add(k);
            votes += 1;
          }
        }
        res.votes += votes * getProcurementMultiplier(t);
      }
    }
  } else if (playerType === "Chieftain") {
    for (const t of Object.values(tiles)) {
      if (t.building === "Reserve" && t.buildingOwner === "Chieftain") {
        let adjOtherBuilding = false;
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (nt?.buildingOwner && nt.buildingOwner !== "Chieftain")
            adjOtherBuilding = true;
        }
        if (!adjOtherBuilding)
          res.coins += 1 * getProcurementMultiplier(t);
      }
    }
  }

  return {
    ...g,
    players: g.players.map((p, i) =>
      i === g.currentPlayerIndex ? { ...p, resources: res } : p
    ),
    boycottEffect:
      g.boycottEffect?.targetPlayerIndex === g.currentPlayerIndex
        ? undefined
        : g.boycottEffect,
  };
}

/** Count Fog hexes in tiles */
export function countFog(tiles: GameState["tiles"]): number {
  return Object.values(tiles).filter((t) => t.type === "Fog").length;
}

/** After revealing fog: update fogRevealed; if threshold crossed, set thresholdReached and insert Mandate into Slot 3. */
export function checkFogThresholdAndInsertMandate(
  g: GameState,
  newTiles: GameState["tiles"]
): GameState {
  if (typeof g.totalFog !== "number") return { ...g, tiles: newTiles };
  const currentFog = countFog(newTiles);
  const fogRevealed = g.totalFog - currentFog;
  let state: GameState = { ...g, tiles: newTiles, fogRevealed };
  if (!state.thresholdReached && fogRevealed >= Math.floor(g.totalFog / 2) + 1) {
    state = { ...state, thresholdReached: true };
    state = insertMandateIntoSlot3(state);
  }
  return state;
}

/**
 * Fill a single politics slot by drawing one card from the deck (used after purchase).
 * Deck has no Mandate; Mandates are inserted by game rules.
 */
export function refillOnePoliticsSlot(
  g: GameState,
  slotIndex: number
): { politics: typeof g.politics; politicsDeck: PoliticsCard[] } {
  const nextDeck = [...g.politicsDeck];
  const drawn = nextDeck.shift() ?? null;
  const politics = [...g.politics] as (PoliticsSlot)[];
  politics[slotIndex] = drawn;
  return {
    politics: [politics[0], politics[1], politics[2], politics[3]],
    politicsDeck: nextDeck,
  };
}

/**
 * Shift non-null cards left and fill empty slots from deck (used by Bribe).
 * Kept for compatibility; deck has no Mandate.
 */
export function refillPoliticsSlots(
  slots: (PoliticsCard | null)[],
  deck: PoliticsCard[]
): { politics: [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot]; politicsDeck: PoliticsCard[] } {
  const filled = slots.filter((c): c is PoliticsCard => c !== null);
  const nextDeck = [...deck];
  while (filled.length < 4 && nextDeck.length > 0) {
    filled.push(nextDeck.shift()!);
  }
  return {
    politics: [filled[0] ?? null, filled[1] ?? null, filled[2] ?? null, filled[3] ?? null],
    politicsDeck: nextDeck,
  };
}

/** Insert Mandate into Slot 3; replace and discard current Slot 3 card. */
export function insertMandateIntoSlot3(g: GameState): GameState {
  const politics = [...g.politics] as [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot];
  politics[3] = "Mandate";
  return { ...g, politics };
}

function getMandateMilestone(intervalIndex: number): number {
  if (intervalIndex < MANDATE_INTERVALS.length) {
    return MANDATE_INTERVALS.slice(0, intervalIndex + 1).reduce((a, b) => a + b, 0);
  }
  return 10 + (intervalIndex - MANDATE_INTERVALS.length);
}

/** End-of-round rotation: remove Slot 0, shift left, draw 1 into Slot 3. Then check mandate schedule. */
export function rotatePoliticsEndOfRound(g: GameState): GameState {
  const [_, ...rest] = g.politics;
  const nextDeck = [...g.politicsDeck];
  const drawn = nextDeck.shift() ?? null;
  let politics: [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot] = [
    rest[0] ?? null,
    rest[1] ?? null,
    rest[2] ?? null,
    drawn,
  ];
  let state: GameState = {
    ...g,
    politics,
    politicsDeck: nextDeck,
  };
  if (g.thresholdReached) {
    state = {
      ...state,
      revealedPoliticsSinceThreshold: state.revealedPoliticsSinceThreshold + 1,
    };
    const milestone = getMandateMilestone(state.mandateIntervalIndex);
    if (state.revealedPoliticsSinceThreshold >= milestone) {
      state = insertMandateIntoSlot3(state);
      state = { ...state, mandateIntervalIndex: state.mandateIntervalIndex + 1 };
    }
  }
  return state;
}

/** Purchase a non-Mandate Politics card: pay coin + vote; votes go to Bureaucrat if present. Refill bought slot from deck. */
export function purchasePoliticsCard(
  g: GameState,
  slotIndex: number,
  playerIndex: number
): GameState {
  const coinCost = POLITICS_COSTS[slotIndex];
  const voteCost = POLITICS_VOTE_COSTS[slotIndex];
  const player = g.players[playerIndex];
  const card = g.politics[slotIndex];
  if (!card || card === "Mandate") return g;
  if (player.resources.coins < coinCost || player.resources.votes < voteCost) return g;

  const nextDeck = [...g.politicsDeck];
  const drawn = nextDeck.shift() ?? null;
  const politics = [...g.politics] as [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot];
  politics[slotIndex] = drawn;

  let newPlayers = g.players.map((p, i) =>
    i === playerIndex
      ? {
          ...p,
          hand: [...p.hand, card],
          resources: {
            ...p.resources,
            coins: p.resources.coins - coinCost,
            votes: p.resources.votes - voteCost,
          },
        }
      : p
  );

  const bureaucratIdx = newPlayers.findIndex((p) => p.type === "Bureaucrat");
  if (voteCost > 0 && bureaucratIdx >= 0) {
    newPlayers = newPlayers.map((p, i) =>
      i === bureaucratIdx
        ? {
            ...p,
            resources: { ...p.resources, votes: p.resources.votes + voteCost },
          }
        : p
    );
  }

  return {
    ...g,
    politics,
    politicsDeck: nextDeck,
    players: newPlayers,
  };
}

/** Remove a non-Mandate card from a politics slot and refill (used by Bribe) */
export function removePoliticsSlot(
  g: GameState,
  slotIndex: number
): { politics: typeof g.politics; politicsDeck: PoliticsCard[] } {
  const card = g.politics[slotIndex];
  if (!card || card === "Mandate") return { politics: g.politics, politicsDeck: [...g.politicsDeck] };
  const rawSlots = [...g.politics] as (PoliticsCard | null)[];
  rawSlots[slotIndex] = null;
  return refillPoliticsSlots(rawSlots, g.politicsDeck);
}

/** Add resources to a market track, filling cheapest empty slots first. Returns updated track. */
export function addToMarket(market: ResourceTrack, count: number): ResourceTrack {
  const m = [...market] as ResourceTrack;
  let remaining = count;
  for (let i = 0; i < 4 && remaining > 0; i++) {
    if (m[i] === 0) { m[i] = 1; remaining--; }
  }
  return m;
}

/** Buy cheapest available resources from a market track. Returns null if not enough available. */
export function buyFromMarket(
  track: ResourceTrack,
  count: number
): { newTrack: ResourceTrack; totalCost: number } | null {
  const newTrack = [...track] as ResourceTrack;
  let totalCost = 0;
  let bought = 0;
  for (let i = 0; i < 4 && bought < count; i++) {
    if (newTrack[i] > 0) {
      newTrack[i] = 0;
      totalCost += i + 1;
      bought++;
    }
  }
  if (bought < count) return null;
  return { newTrack, totalCost };
}

/** Sell resources to highest-priced empty slots first (working downward). Returns null if not enough empty slots. */
export function sellToMarket(
  track: ResourceTrack,
  count: number
): { newTrack: ResourceTrack; totalGain: number } | null {
  const newTrack = [...track] as ResourceTrack;
  let totalGain = 0;
  let sold = 0;
  for (let i = 3; i >= 0 && sold < count; i--) {
    if (newTrack[i] === 0) {
      newTrack[i] = 1;
      totalGain += i + 1;
      sold++;
    }
  }
  if (sold < count) return null;
  return { newTrack, totalGain };
}
