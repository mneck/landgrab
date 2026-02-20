import type { GameState, PlayerType, PoliticsCard, PoliticsSlot } from "./types/game";
import { hexKey, hexNeighbors } from "./utils/hexGrid";
import { POLITICS_COSTS } from "./data/cardRules";

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
    embargoTargetPlayer:
      g.embargoTargetPlayer === g.currentPlayerIndex
        ? undefined
        : g.embargoTargetPlayer,
  };
}

/** Purchase a Politics card from slot, refill market, apply Bureaucrat vote if applicable */
export function purchasePoliticsCard(
  g: GameState,
  slotIndex: number,
  playerIndex: number
): GameState {
  const cost = POLITICS_COSTS[slotIndex];
  const player = g.players[playerIndex];
  const card = g.politics[slotIndex];
  if (!card || player.resources.coins < cost) return g;

  const newPolitics = [...g.politics] as (PoliticsCard | null)[];
  newPolitics[slotIndex] = null;
  const filtered = newPolitics.filter((c): c is PoliticsCard => c !== null);
  let nextDeck = [...g.politicsDeck];
  while (filtered.length < 4 && nextDeck.length > 0) {
    filtered.push(nextDeck.shift()!);
  }
  const finalSlots: [PoliticsSlot, PoliticsSlot, PoliticsSlot, PoliticsSlot] = [
    filtered[0] ?? null,
    filtered[1] ?? null,
    filtered[2] ?? null,
    filtered[3] ?? null,
  ];

  let newPlayers = g.players.map((p, i) =>
    i === playerIndex
      ? {
          ...p,
          hand: [...p.hand, card],
          resources: { ...p.resources, coins: p.resources.coins - cost },
        }
      : p
  );

  const buyerType = player.type;
  if (buyerType !== "Bureaucrat" && (cost === 3 || cost === 4)) {
    const bureaucratIdx = newPlayers.findIndex((p) => p.type === "Bureaucrat");
    if (bureaucratIdx >= 0) {
      newPlayers = newPlayers.map((p, i) =>
        i === bureaucratIdx
          ? {
              ...p,
              resources: {
                ...p.resources,
                votes: p.resources.votes + 1,
              },
            }
          : p
      );
    }
  }

  return {
    ...g,
    politics: finalSlots,
    politicsDeck: nextDeck,
    players: newPlayers,
  };
}

/** Shift politics market left and refill from deck (used by Bribe) */
export function removePoliticsSlot(
  g: GameState,
  slotIndex: number
): { politics: typeof g.politics; politicsDeck: PoliticsCard[] } {
  const newPolitics = [...g.politics] as (PoliticsCard | null)[];
  newPolitics[slotIndex] = null;
  const filtered = newPolitics.filter((c): c is PoliticsCard => c !== null);
  let nextDeck = [...g.politicsDeck];
  while (filtered.length < 4 && nextDeck.length > 0) {
    filtered.push(nextDeck.shift()!);
  }
  return {
    politics: [
      filtered[0] ?? null,
      filtered[1] ?? null,
      filtered[2] ?? null,
      filtered[3] ?? null,
    ],
    politicsDeck: nextDeck,
  };
}
