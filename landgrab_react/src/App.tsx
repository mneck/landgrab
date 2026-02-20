import { useState, useCallback } from "react";
import { HexMap } from "./components/HexMap";
import { PlayerPanel } from "./components/PlayerPanel";
import { GameActions } from "./components/GameActions";
import { ConferenceRow } from "./components/ConferenceRow";
import { PoliticsRow } from "./components/PoliticsRow";
import { ResourceMarket } from "./components/ResourceMarket";
import { CARD_INFO } from "./data/cardData";
import {
  PERSONNEL_TO_EVENT,
  ELDER_EVENT_OPTIONS,
  BROKER_EVENT_OPTIONS,
  FORESTER_EVENT_OPTIONS,
  PERSONNEL_CARDS,
  POLITICS_COSTS,
} from "./data/cardRules";
import {
  pickRevealedTileType,
  getCharterBuilding,
  canPlaceCharter,
  canPlaceBuild,
  canPlaceReserve,
  countReserves,
  revealAdjacentFog,
  BUILD_OPTIONS,
} from "./gameRules";
import type { PlacementMode } from "./gameRules";
import {
  shuffle,
  runProcurement,
  purchasePoliticsCard,
  removePoliticsSlot,
} from "./gameActions";
import type {
  GameState,
  BuildingType,
  CardType,
  PersonnelCard,
  EventCard,
  PoliticsCard,
} from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import {
  createInitialGameState,
  decrementActionsRemaining,
} from "./types/game";
import { hexDistance, hexKey, hexNeighbors } from "./utils/hexGrid";

import "./App.css";

function App() {
  const [game, setGame] = useState<GameState>(() =>
    createInitialGameState(["Hotelier", "Industrialist"])
  );
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [pendingEventCard, setPendingEventCard] = useState<EventCard | PoliticsCard | null>(null);
  const [buildBuildingChoice, setBuildBuildingChoice] = useState<
    BuildingType | null
  >(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [procurementChoosing, setProcurementChoosing] = useState(false);

  const currentPlayer = game.players[game.currentPlayerIndex];

  function handleHexClick(hex: HexCoord) {
    if (placementMode === "charter") {
      const building = getCharterBuilding(currentPlayer.type);
      if (!canPlaceCharter(game.tiles, hex, currentPlayer.type, building)) return;

      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (tile?.building) return;

      const newTiles = revealAdjacentFog(game.tiles, hex, game.fogRadius);
      newTiles[key] = {
        ...tile!,
        building,
        buildingOwner: currentPlayer.type,
      };

      setGame((g) => ({
        ...g,
        tiles: newTiles,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Charter"),
              }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setSelectedHex(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "expedition" && pendingEventCard === "Expedition") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.type === "Fog") return;

      const newTiles = revealAdjacentFog(game.tiles, hex, game.fogRadius);

      setGame((g) => ({
        ...g,
        tiles: newTiles,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Expedition") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "contact" && pendingEventCard === "Contact") {
      if (currentPlayer.type !== "Chieftain") return;
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.type !== "Fog") return;

      const isOuterFogRing = hexDistance(hex, { q: 0, r: 0 }) === game.fogRadius;
      const newTiles = { ...game.tiles };
      newTiles[key] = {
        ...tile,
        type: isOuterFogRing ? "Field" : pickRevealedTileType(hex),
        building: "Village",
        buildingOwner: "Chieftain",
      };

      setGame((g) => ({
        ...g,
        tiles: newTiles,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Contact") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "reserve" && pendingEventCard === "Reserve") {
      if (currentPlayer.type !== "Chieftain") return;
      if (!canPlaceReserve(game.tiles, hex)) return;

      const reservesPlaced = countReserves(game.tiles, "Chieftain");
      const cost = reservesPlaced + 1;
      if (currentPlayer.resources.coins < cost) return;

      const key = hexKey(hex);
      const tile = game.tiles[key]!;

      setGame((g) => ({
        ...g,
        tiles: {
          ...g.tiles,
          [key]: {
            ...tile,
            building: "Reserve",
            buildingOwner: "Chieftain",
          },
        },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Reserve"),
                resources: {
                  ...p.resources,
                  coins: p.resources.coins - cost,
                },
              }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (
      placementMode === "build" &&
      pendingEventCard === "Build" &&
      buildBuildingChoice
    ) {
      if (
        currentPlayer.type === "Chieftain" ||
        !canPlaceBuild(game.tiles, hex, currentPlayer.type, buildBuildingChoice, game.landClaimsUntilPlayer != null)
      )
        return;

      const { wood, ore, coins } = currentPlayer.resources;
      if (wood < 1 || ore < 1 || coins < 1) return;

      const key = hexKey(hex);
      const tile = game.tiles[key]!;

      setGame((g) => ({
        ...g,
        tiles: {
          ...g.tiles,
          [key]: {
            ...tile,
            building: buildBuildingChoice,
            buildingOwner: g.players[g.currentPlayerIndex].type,
          },
        },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Build"),
                resources: {
                  ...p.resources,
                  wood: p.resources.wood - 1,
                  ore: p.resources.ore - 1,
                  coins: p.resources.coins - 1,
                },
              }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setBuildBuildingChoice(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "zoning" && pendingEventCard === "Zoning") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.building || !["Sand", "Field"].includes(tile.type))
        return;
      if (tile.zoningOwner) return;
      // Must be adjacent to current player's building
      let adjacentToMyBuilding = false;
      for (const nb of hexNeighbors(hex)) {
        const nt = game.tiles[hexKey(nb)];
        if (nt?.buildingOwner === currentPlayer.type) adjacentToMyBuilding = true;
      }
      if (!adjacentToMyBuilding) return;

      setGame((g) => ({
        ...g,
        tiles: {
          ...g.tiles,
          [key]: {
            ...tile!,
            zoningOwner: currentPlayer.type,
          },
        },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Zoning") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "urbanplanning" && pendingEventCard === "UrbanPlanning") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || !tile.building || tile.buildingOwner !== currentPlayer.type)
        return;
      if (tile.hasUrbanPlanning) return;
      // Must be Resort, Industrial Zone, or Infrastructure per rules
      if (!["Resort", "IndustrialZone", "Infrastructure"].includes(tile.building))
        return;

      setGame((g) => ({
        ...g,
        tiles: {
          ...g.tiles,
          [key]: {
            ...tile!,
            hasUrbanPlanning: true,
          },
        },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "UrbanPlanning") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "taxation" && pendingEventCard === "Taxation") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.building !== "Reserve" || tile.buildingOwner !== currentPlayer.type)
        return;

      let coins = 0;
      for (const nb of hexNeighbors(hex)) {
        const nt = game.tiles[hexKey(nb)];
        if (nt?.buildingOwner && nt.buildingOwner !== currentPlayer.type && nt.building)
          coins += 1;
      }

      setGame((g) => ({
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Taxation"),
                resources: { ...p.resources, coins: p.resources.coins + coins },
              }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "logging" && pendingEventCard === "Logging") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.type !== "Forest") return;

      setGame((g) => ({
        ...g,
        tiles: { ...g.tiles, [key]: { ...tile, type: "Field" as const } },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Logging") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "forestry" && pendingEventCard === "Forestry") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.type !== "Field") return;
      if (tile.building) return;

      setGame((g) => ({
        ...g,
        tiles: { ...g.tiles, [key]: { ...tile, type: "Forest" as const } },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Forestry") }
            : p
        ),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
      setPlacementMode(null);
      setPendingEventCard(null);
      setSelectedCard(null);
      return;
    }

    setSelectedHex(hex);
  }

  const consumeAction = useCallback(
    (updater: (g: GameState) => GameState) => {
      setGame((g) => ({
        ...updater(g),
        actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
      }));
    },
    []
  );

  function handlePlayCharter() {
    if (!currentPlayer.hand.includes("Charter") || game.actionsRemaining < 1)
      return;
    setPlacementMode("charter");
  }

  function handlePlayPersonnel(card: PersonnelCard, eventCard?: EventCard | PoliticsCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;
    const resolvedEvent =
      eventCard ?? PERSONNEL_TO_EVENT[card];
    if (!resolvedEvent) return;

    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? {
              ...p,
              hand: [...p.hand.filter((c) => c !== card), resolvedEvent],
              discardPile: [...p.discardPile, card],
            }
          : p
      ),
    }));
  }

  function handlePlayEventCard(card: EventCard | PoliticsCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;
    if (card === "Charter") return; // Charter has its own handler

    if (card === "Procurement") {
      setProcurementChoosing(true);
      setSelectedCard(null);
      return;
    }

    if (card === "Expedition") {
      setPendingEventCard("Expedition");
      setPlacementMode("expedition");
      return;
    }

    if (card === "Contact") {
      if (currentPlayer.type !== "Chieftain") return;
      setPendingEventCard("Contact");
      setPlacementMode("contact");
      return;
    }

    if (card === "Reserve") {
      if (currentPlayer.type !== "Chieftain") return;
      const cost = countReserves(game.tiles, "Chieftain") + 1;
      if (currentPlayer.resources.coins < cost) return;
      setPendingEventCard("Reserve");
      setPlacementMode("reserve");
      return;
    }

    if (card === "Build") {
      if (currentPlayer.type === "Chieftain") return;
      const { wood, ore, coins } = currentPlayer.resources;
      if (wood < 1 || ore < 1 || coins < 1) return;
      setPendingEventCard("Build");
      setPlacementMode("build");
      setBuildBuildingChoice(null);
      return;
    }

    /* Politics cards */
    if (card === "Bribe") {
      if (currentPlayer.resources.coins < 1) return;
      const firstSlotWithCard = game.politics.findIndex((c) => c !== null);
      if (firstSlotWithCard < 0) return;
      consumeAction((g) => {
        const { politics, politicsDeck } = removePoliticsSlot(g, firstSlotWithCard);
        return {
          ...g,
          politics,
          politicsDeck,
          players: g.players.map((p, i) =>
            i === g.currentPlayerIndex
              ? {
                  ...p,
                  hand: p.hand.filter((c) => c !== "Bribe"),
                  resources: { ...p.resources, coins: p.resources.coins - 1 },
                }
              : p
          ),
        };
      });
      return;
    }

    if (card === "Zoning") {
      setPendingEventCard("Zoning");
      setPlacementMode("zoning");
      return;
    }

    if (card === "UrbanPlanning") {
      setPendingEventCard("UrbanPlanning");
      setPlacementMode("urbanplanning");
      return;
    }

    if (card === "Dividends") {
      let coins = 0;
      for (const t of Object.values(game.tiles)) {
        if (
          t.buildingOwner === currentPlayer.type &&
          ["IndustrialZone", "Resort", "Infrastructure"].includes(t.building ?? "")
        )
          coins += 1;
      }
      consumeAction((g) => ({
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Dividends"),
                resources: {
                  ...p.resources,
                  coins: p.resources.coins + coins,
                },
              }
            : p
        ),
      }));
      return;
    }

    if (card === "NGOBacking") {
      if (currentPlayer.type !== "Chieftain") return;
      const villages = Object.values(game.tiles).filter(
        (t) => t.building === "Village" && t.buildingOwner === "Chieftain"
      ).length;
      consumeAction((g) => ({
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "NGOBacking"),
                resources: {
                  ...p.resources,
                  coins: p.resources.coins + villages,
                },
              }
            : p
        ),
      }));
      return;
    }

    if (card === "Propaganda") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Graft") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "LocalElections") {
      if (currentPlayer.type !== "Chieftain") return;
      const villages = Object.values(game.tiles).filter(
        (t) => t.building === "Village" && t.buildingOwner === "Chieftain"
      ).length;
      consumeAction((g) => ({
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "LocalElections"),
                resources: {
                  ...p.resources,
                  votes: p.resources.votes + villages,
                },
              }
            : p
        ),
      }));
      return;
    }

    if (card === "Subsidy") {
      const reserves = countReserves(game.tiles, currentPlayer.type);
      consumeAction((g) => ({
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Subsidy"),
                resources: {
                  ...p.resources,
                  coins: p.resources.coins + reserves,
                },
              }
            : p
        ),
      }));
      return;
    }

    if (card === "Logging") {
      setPendingEventCard("Logging");
      setPlacementMode("logging");
      return;
    }

    if (card === "Forestry") {
      setPendingEventCard("Forestry");
      setPlacementMode("forestry");
      return;
    }

    if (card === "LandClaims") {
      consumeAction((g) => ({
        ...g,
        landClaimsUntilPlayer: g.currentPlayerIndex,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "LandClaims") }
            : p
        ),
      }));
      return;
    }

    if (card === "Taxation") {
      setPendingEventCard("Taxation");
      setPlacementMode("taxation");
      return;
    }

    if (card === "Boycotting") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Protests") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Levy") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Embargo") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Reorganization") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Import") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }

    if (card === "Export") {
      // Handled via getPlayOptionsForCard (multi-option)
      return;
    }
  }

  function handlePlayPropaganda(coinsToPay: number) {
    if (
      !currentPlayer.hand.includes("Propaganda") ||
      game.actionsRemaining < 1 ||
      currentPlayer.resources.coins < coinsToPay
    )
      return;
    consumeAction((g) => {
      let remaining = coinsToPay;
      const newPlayers = g.players.map((p, i) => {
        if (i === g.currentPlayerIndex) return p; // updated below
        if (remaining <= 0 || p.resources.votes < 1) return p;
        remaining -= 1;
        return {
          ...p,
          resources: { ...p.resources, votes: p.resources.votes - 1 },
        };
      });
      const votesCollected = coinsToPay - remaining;
      return {
        ...g,
        players: newPlayers.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Propaganda"),
                resources: {
                  ...p.resources,
                  coins: p.resources.coins - coinsToPay,
                  votes: p.resources.votes + votesCollected,
                },
              }
            : p
        ),
      };
    });
  }

  function handlePlayGraft(
    targetPlayerIndex: number,
    direction: "coinForVote" | "voteForCoin"
  ) {
    if (
      !currentPlayer.hand.includes("Graft") ||
      game.actionsRemaining < 1
    )
      return;
    const target = game.players[targetPlayerIndex];
    if (direction === "coinForVote") {
      if (currentPlayer.resources.coins < 1 || target.resources.votes < 1) return;
    } else {
      if (currentPlayer.resources.votes < 1 || target.resources.coins < 1) return;
    }
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) => {
        if (i === g.currentPlayerIndex) {
          return {
            ...p,
            hand: p.hand.filter((c) => c !== "Graft"),
            resources:
              direction === "coinForVote"
                ? {
                    ...p.resources,
                    coins: p.resources.coins - 1,
                    votes: p.resources.votes + 1,
                  }
                : {
                    ...p.resources,
                    coins: p.resources.coins + 1,
                    votes: p.resources.votes - 1,
                  },
          };
        }
        if (i === targetPlayerIndex) {
          return {
            ...p,
            resources:
              direction === "coinForVote"
                ? {
                    ...p.resources,
                    coins: p.resources.coins + 1,
                    votes: p.resources.votes - 1,
                  }
                : {
                    ...p.resources,
                    coins: p.resources.coins - 1,
                    votes: p.resources.votes + 1,
                  },
          };
        }
        return p;
      }),
    }));
  }

  function handlePlayLevy(targetPlayerIndex: number) {
    if (
      !currentPlayer.hand.includes("Levy") ||
      game.actionsRemaining < 1
    )
      return;
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) => {
        if (i === g.currentPlayerIndex) {
          return { ...p, hand: p.hand.filter((c) => c !== "Levy") };
        }
        if (i === targetPlayerIndex) {
          return {
            ...p,
            resources: {
              ...p.resources,
              coins: Math.max(0, p.resources.coins - 2),
            },
          };
        }
        return p;
      }),
    }));
  }

  function handlePlayEmbargo(targetPlayerIndex: number) {
    if (
      !currentPlayer.hand.includes("Embargo") ||
      game.actionsRemaining < 1
    )
      return;
    consumeAction((g) => ({
      ...g,
      embargoTargetPlayer: targetPlayerIndex,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? { ...p, hand: p.hand.filter((c) => c !== "Embargo") }
          : p
      ),
    }));
  }

  function handlePlayBoycotting(targetPlayerIndex: number) {
    if (
      !currentPlayer.hand.includes("Boycotting") ||
      game.actionsRemaining < 1
    )
      return;
    consumeAction((g) => ({
      ...g,
      boycottEffect: {
        boycotterType: currentPlayer.type,
        targetPlayerIndex,
      },
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? { ...p, hand: p.hand.filter((c) => c !== "Boycotting") }
          : p
      ),
    }));
  }

  function handlePlayProtests(targetPlayerIndex: number) {
    if (
      !currentPlayer.hand.includes("Protests") ||
      game.actionsRemaining < 1
    )
      return;
    const villages = Object.values(game.tiles).filter(
      (t) => t.building === "Village" && t.buildingOwner === currentPlayer.type
    ).length;
    const voteLoss = Math.min(villages, 3);
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) => {
        if (i === g.currentPlayerIndex) {
          return { ...p, hand: p.hand.filter((c) => c !== "Protests") };
        }
        if (i === targetPlayerIndex) {
          return {
            ...p,
            resources: {
              ...p.resources,
              votes: Math.max(0, p.resources.votes - voteLoss),
            },
          };
        }
        return p;
      }),
    }));
  }

  function handlePlayImport(resource: "wood" | "ore") {
    if (
      !currentPlayer.hand.includes("Import") ||
      game.actionsRemaining < 1 ||
      currentPlayer.resources.coins < 1
    )
      return;
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? {
              ...p,
              hand: p.hand.filter((c) => c !== "Import"),
              resources: {
                ...p.resources,
                coins: p.resources.coins - 1,
                [resource]: p.resources[resource] + 1,
              },
            }
          : p
      ),
    }));
  }

  function handlePlayExport(woodToSell: number, oreToSell: number) {
    const total = woodToSell + oreToSell;
    if (
      !currentPlayer.hand.includes("Export") ||
      game.actionsRemaining < 1 ||
      total < 1 ||
      total > 3 ||
      currentPlayer.resources.wood < woodToSell ||
      currentPlayer.resources.ore < oreToSell
    )
      return;
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? {
              ...p,
              hand: p.hand.filter((c) => c !== "Export"),
              resources: {
                ...p.resources,
                wood: p.resources.wood - woodToSell,
                ore: p.resources.ore - oreToSell,
                coins: p.resources.coins + total,
              },
            }
          : p
      ),
    }));
  }

  function handlePlayReorganization(
    option1: "trash" | "action" | "draw",
    option2: "trash" | "action" | "draw",
    trashCard?: PersonnelCard
  ) {
    if (
      !currentPlayer.hand.includes("Reorganization") ||
      game.actionsRemaining < 1
    )
      return;
    consumeAction((g) => {
      let newState = {
        ...g,
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Reorganization") }
            : p
        ),
      };
      const opts = [option1, option2];
      for (const opt of opts) {
        if (opt === "trash" && trashCard) {
          newState = {
            ...newState,
            players: newState.players.map((p, i) =>
              i === g.currentPlayerIndex
                ? { ...p, hand: p.hand.filter((c) => c !== trashCard) }
                : p
            ),
          };
        } else if (opt === "action") {
          newState = {
            ...newState,
            actionsRemaining: newState.actionsRemaining + 1,
          };
        } else if (opt === "draw") {
          const p = newState.players[g.currentPlayerIndex];
          let newDraw = [...p.drawPile];
          let newDiscard = [...p.discardPile];
          if (newDraw.length === 0 && newDiscard.length > 0) {
            newDraw = shuffle(newDiscard);
            newDiscard = [];
          }
          if (newDraw.length > 0) {
            const drawn = newDraw.shift()!;
            newState = {
              ...newState,
              players: newState.players.map((pl, i) =>
                i === g.currentPlayerIndex
                  ? {
                      ...pl,
                      hand: [...pl.hand, drawn],
                      drawPile: newDraw,
                      discardPile: newDiscard,
                    }
                  : pl
              ),
            };
          }
        }
      }
      return newState;
    });
  }

  function handleProcurementGenerate() {
    if (!currentPlayer.hand.includes("Procurement") || game.actionsRemaining < 1)
      return;
    consumeAction((g) =>
      runProcurement(
        {
          ...g,
          players: g.players.map((p, i) =>
            i === g.currentPlayerIndex
              ? { ...p, hand: p.hand.filter((c) => c !== "Procurement") }
              : p
          ),
        },
        currentPlayer.type
      )
    );
    setProcurementChoosing(false);
    setSelectedCard(null);
  }

  function handleProcurementPurchase(slotIndex: number) {
    if (!currentPlayer.hand.includes("Procurement") || game.actionsRemaining < 1)
      return;
    const cost = POLITICS_COSTS[slotIndex];
    const card = game.politics[slotIndex];
    if (!card || currentPlayer.resources.coins < cost) return;
    consumeAction((g) =>
      purchasePoliticsCard(
        {
          ...g,
          players: g.players.map((p, i) =>
            i === g.currentPlayerIndex
              ? { ...p, hand: p.hand.filter((c) => c !== "Procurement") }
              : p
          ),
        },
        slotIndex,
        g.currentPlayerIndex
      )
    );
    setProcurementChoosing(false);
    setSelectedCard(null);
  }

  function getPlayOptionsForCard(card: string): {
    info: { title: string; description: string };
    playOptions: { label: string; onPlay: () => void; disabled?: boolean }[];
  } | null {
    if (!currentPlayer.hand.includes(card as CardType)) return null;
    const info = CARD_INFO[card] ?? {
      title: card,
      description: "",
    };
    const hasActions = game.actionsRemaining >= 1;
    const playOptions: { label: string; onPlay: () => void; disabled?: boolean }[] = [];

    if (card === "Charter") {
      playOptions.push({
        label: card,
        onPlay: () => {
          handlePlayCharter();
        },
        disabled: !hasActions,
      });
    } else if (PERSONNEL_CARDS.includes(card as PersonnelCard)) {
      const personnel = card as PersonnelCard;
      if (personnel === "Elder") {
        for (const eventCard of ELDER_EVENT_OPTIONS) {
          playOptions.push({
            label: eventCard,
            onPlay: () => {
              handlePlayPersonnel(personnel, eventCard);
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
      } else if (personnel === "Broker") {
        for (const eventCard of BROKER_EVENT_OPTIONS) {
          playOptions.push({
            label: eventCard,
            onPlay: () => {
              handlePlayPersonnel(personnel, eventCard);
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
      } else if (personnel === "Forester") {
        for (const eventCard of FORESTER_EVENT_OPTIONS) {
          playOptions.push({
            label: eventCard,
            onPlay: () => {
              handlePlayPersonnel(personnel, eventCard);
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
      } else {
        playOptions.push({
          label: card,
          onPlay: () => {
            handlePlayPersonnel(personnel);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      }
    } else if (card === "Import") {
      const canAfford = currentPlayer.resources.coins >= 1;
      playOptions.push({
        label: "Import 1 🪵 (pay 1 💰)",
        onPlay: () => { handlePlayImport("wood"); setSelectedCard(null); },
        disabled: !hasActions || !canAfford,
      });
      playOptions.push({
        label: "Import 1 ⛏️ (pay 1 💰)",
        onPlay: () => { handlePlayImport("ore"); setSelectedCard(null); },
        disabled: !hasActions || !canAfford,
      });
    } else if (card === "Export") {
      const w = currentPlayer.resources.wood;
      const o = currentPlayer.resources.ore;
      const combos: [number, number][] = [];
      for (let wSell = 0; wSell <= Math.min(3, w); wSell++) {
        for (let oSell = 0; oSell <= Math.min(3 - wSell, o); oSell++) {
          const total = wSell + oSell;
          if (total >= 1 && total <= 3) combos.push([wSell, oSell]);
        }
      }
      for (const [ws, os] of combos) {
        const parts: string[] = [];
        if (ws > 0) parts.push(`${ws} 🪵`);
        if (os > 0) parts.push(`${os} ⛏️`);
        playOptions.push({
          label: `Sell ${parts.join(" + ")} → ${ws + os} 💰`,
          onPlay: () => { handlePlayExport(ws, os); setSelectedCard(null); },
          disabled: !hasActions,
        });
      }
      if (combos.length === 0) {
        playOptions.push({ label: "No resources to sell", onPlay: () => {}, disabled: true });
      }
    } else if (card === "Reorganization") {
      const personnelInHand = currentPlayer.hand.filter((c) =>
        PERSONNEL_CARDS.includes(c as PersonnelCard)
      ) as PersonnelCard[];
      const hasDraw =
        currentPlayer.drawPile.length > 0 || currentPlayer.discardPile.length > 0;
      for (const pc of personnelInHand) {
        playOptions.push({
          label: `Trash ${pc} + Extra Action`,
          onPlay: () => {
            handlePlayReorganization("trash", "action", pc);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
        if (hasDraw) {
          playOptions.push({
            label: `Trash ${pc} + Draw Card`,
            onPlay: () => {
              handlePlayReorganization("trash", "draw", pc);
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
      }
      if (hasDraw) {
        playOptions.push({
          label: "Extra Action + Draw Card",
          onPlay: () => {
            handlePlayReorganization("action", "draw");
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      }
      if (playOptions.length === 0) {
        playOptions.push({
          label: "Extra Action × 2",
          onPlay: () => {
            handlePlayReorganization("action", "action");
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      }
    } else if (card === "Propaganda") {
      const otherPlayersWithVotes = game.players.filter(
        (p, i) => i !== game.currentPlayerIndex && p.resources.votes > 0
      ).length;
      const maxSpend = Math.min(3, currentPlayer.resources.coins, otherPlayersWithVotes);
      for (let n = 1; n <= maxSpend; n++) {
        const coins = n;
        playOptions.push({
          label: `Pay ${coins} 💰 → take ${coins} 🗳️`,
          onPlay: () => {
            handlePlayPropaganda(coins);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      }
      if (maxSpend === 0) {
        playOptions.push({
          label: "No valid targets",
          onPlay: () => {},
          disabled: true,
        });
      }
    } else if (card === "Graft") {
      game.players.forEach((target, ti) => {
        if (ti === game.currentPlayerIndex) return;
        if (currentPlayer.resources.coins >= 1 && target.resources.votes >= 1) {
          playOptions.push({
            label: `Give 1 💰 to ${target.type}, take 1 🗳️`,
            onPlay: () => {
              handlePlayGraft(ti, "coinForVote");
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
        if (currentPlayer.resources.votes >= 1 && target.resources.coins >= 1) {
          playOptions.push({
            label: `Give 1 🗳️ to ${target.type}, take 1 💰`,
            onPlay: () => {
              handlePlayGraft(ti, "voteForCoin");
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
      });
      if (playOptions.length === 0) {
        playOptions.push({
          label: "No valid exchanges",
          onPlay: () => {},
          disabled: true,
        });
      }
    } else if (card === "Levy") {
      game.players.forEach((target, ti) => {
        if (ti === game.currentPlayerIndex) return;
        const loss = Math.min(2, target.resources.coins);
        playOptions.push({
          label: `Levy ${target.type} (−${loss} 💰)`,
          onPlay: () => {
            handlePlayLevy(ti);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      });
    } else if (card === "Embargo") {
      game.players.forEach((target, ti) => {
        if (ti === game.currentPlayerIndex) return;
        playOptions.push({
          label: `Embargo ${target.type}`,
          onPlay: () => {
            handlePlayEmbargo(ti);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      });
    } else if (card === "Boycotting") {
      game.players.forEach((target, ti) => {
        if (ti === game.currentPlayerIndex) return;
        playOptions.push({
          label: `Boycott ${target.type}`,
          onPlay: () => {
            handlePlayBoycotting(ti);
            setSelectedCard(null);
          },
          disabled: !hasActions,
        });
      });
    } else if (card === "Protests") {
      const villages = Object.values(game.tiles).filter(
        (t) => t.building === "Village" && t.buildingOwner === currentPlayer.type
      ).length;
      const voteLoss = Math.min(villages, 3);
      game.players.forEach((target, ti) => {
        if (ti === game.currentPlayerIndex) return;
        const actualLoss = Math.min(voteLoss, target.resources.votes);
        playOptions.push({
          label: `Protest ${target.type} (−${actualLoss} 🗳️)`,
          onPlay: () => {
            handlePlayProtests(ti);
            setSelectedCard(null);
          },
          disabled: !hasActions || voteLoss === 0,
        });
      });
      if (villages === 0) {
        playOptions.push({
          label: "No Villages — no effect",
          onPlay: () => {},
          disabled: true,
        });
      }
    } else {
      playOptions.push({
        label: card,
        onPlay: () => {
          handlePlayEventCard(card as EventCard);
          setSelectedCard(null);
        },
        disabled: !hasActions,
      });
    }
    return { info, playOptions };
  }

  function handleCardClick(card: string) {
    setSelectedCard((prev) => (prev === card ? null : card));
  }

  const selectedCardData = selectedCard
    ? getPlayOptionsForCard(selectedCard)
    : null;

  function handleDraw() {
    if (game.actionsRemaining < 1) return;
    const { drawPile, discardPile } = currentPlayer;
    const hasCardsToDraw = drawPile.length > 0 || discardPile.length > 0;
    if (!hasCardsToDraw) return;

    consumeAction((g) => {
      const p = g.players[g.currentPlayerIndex];
      let newDraw = [...p.drawPile];
      let newDiscard = [...p.discardPile];
      if (newDraw.length === 0 && newDiscard.length > 0) {
        newDraw = shuffle(newDiscard);
        newDiscard = [];
      }
      const drawn = newDraw.shift()!;
      return {
        ...g,
        players: g.players.map((pl, i) =>
          i === g.currentPlayerIndex
            ? {
                ...pl,
                hand: [...pl.hand, drawn],
                drawPile: newDraw,
                discardPile: newDiscard,
              }
            : pl
        ),
      };
    });
  }

  function handleEndTurn() {
    setGame((g) => {
      const nextPlayer = (g.currentPlayerIndex + 1) % g.players.length;
      return {
        ...g,
        currentPlayerIndex: nextPlayer,
        actionsRemaining: 2,
        landClaimsUntilPlayer:
          g.landClaimsUntilPlayer === nextPlayer
            ? undefined
            : g.landClaimsUntilPlayer,
      };
    });
    setPlacementMode(null);
    setSelectedHex(null);
    setSelectedCard(null);
    setProcurementChoosing(false);
  }

  return (
    <div className="game-container">
      <header className="game-header">
        <h1>Landgrab</h1>
        <p className="subtitle">Strategy prototype</p>
      </header>

      <main className="game-main">
        <div className="game-content">
        <aside className="players-sidebar">
          {game.players.map((player, i) => (
            <PlayerPanel
              key={player.type}
              player={player}
              isCurrent={i === game.currentPlayerIndex}
              selectedCard={i === game.currentPlayerIndex ? selectedCard : null}
              onCardClick={
                i === game.currentPlayerIndex ? handleCardClick : undefined
              }
            />
          ))}
        </aside>

        <div className="map-and-markets">
          <div className="map-row">
          <aside className="actions-bar">
            <GameActions
              currentPlayerType={currentPlayer.type}
              actionsRemaining={game.actionsRemaining}
              placementMode={placementMode !== null}
              selectedCard={selectedCard}
              selectedCardInfo={
                selectedCardData
                  ? {
                      title: selectedCardData.info.title,
                      description: selectedCardData.info.description,
                    }
                  : null
              }
              playOptions={selectedCardData?.playOptions ?? []}
              canDraw={
                game.actionsRemaining > 0 &&
                (currentPlayer.drawPile.length > 0 ||
                  currentPlayer.discardPile.length > 0)
              }
              onDraw={handleDraw}
              onCancelPlacement={
                placementMode !== null
                  ? () => {
                      setPlacementMode(null);
                      setSelectedHex(null);
                      setPendingEventCard(null);
                      setBuildBuildingChoice(null);
                      setSelectedCard(null);
                    }
                  : undefined
              }
              onEndTurn={handleEndTurn}
              buildOptions={
                placementMode === "build" && !buildBuildingChoice
                  ? (BUILD_OPTIONS[currentPlayer.type] ?? [])
                  : undefined
              }
              onBuildChoice={setBuildBuildingChoice}
              procurementChoosing={procurementChoosing}
              procurementPurchaseOptions={
                procurementChoosing
                  ? game.politics
                      .map((card, i) =>
                        card && currentPlayer.resources.coins >= POLITICS_COSTS[i]
                          ? {
                              slotIndex: i,
                              cost: POLITICS_COSTS[i],
                              card,
                              onPurchase: () => handleProcurementPurchase(i),
                            }
                          : null
                      )
                      .filter((o): o is NonNullable<typeof o> => o !== null)
                  : []
              }
              onProcurementGenerate={
                procurementChoosing ? handleProcurementGenerate : undefined
              }
              onProcurementCancel={
                procurementChoosing
                  ? () => setProcurementChoosing(false)
                  : undefined
              }
            />
          </aside>
            <section className="map-section">
            <HexMap
              tiles={game.tiles}
              mapRadius={game.mapRadius}
              selectedHex={selectedHex}
              onHexClick={handleHexClick}
            />
            {placementMode === "charter" && (
              <p className="placement-hint">
                Click a valid hex to place your{" "}
                {getCharterBuilding(currentPlayer.type)}
              </p>
            )}
            {placementMode === "expedition" && (
              <p className="placement-hint">
                Click a non-Fog hex to reveal adjacent Fog
              </p>
            )}
            {placementMode === "contact" && (
              <p className="placement-hint">
                Click a Fog hex to convert and place a Village
              </p>
            )}
            {placementMode === "reserve" && (
              <p className="placement-hint">
                Click a valid hex adjacent to Village or Reserve (cost:{" "}
                {countReserves(game.tiles, "Chieftain") + 1} coins)
              </p>
            )}
            {placementMode === "build" && (
              <p className="placement-hint">
                {buildBuildingChoice
                  ? `Click a valid hex to place your ${buildBuildingChoice}`
                  : "Choose a building type first"}
              </p>
            )}
            {placementMode === "zoning" && (
              <p className="placement-hint">
                Click a Sand or Field hex adjacent to your building to place Zoning
              </p>
            )}
            {placementMode === "urbanplanning" && (
              <p className="placement-hint">
                Click your Resort, Industrial Zone, or Infrastructure to add Urban Planning (double production)
              </p>
            )}
            {placementMode === "taxation" && (
              <p className="placement-hint">
                Click one of your Reserves to collect taxes from adjacent opponent buildings
              </p>
            )}
            {placementMode === "logging" && (
              <p className="placement-hint">
                Click a Forest hex to convert it to Field
              </p>
            )}
            {placementMode === "forestry" && (
              <p className="placement-hint">
                Click an empty Field hex to convert it to Forest
              </p>
            )}
          </section>
          </div>

          <section className="markets-section">
            <ConferenceRow slots={game.conference} />
            <PoliticsRow slots={game.politics} />
            <ResourceMarket
              woodMarket={game.woodMarket}
              oreMarket={game.oreMarket}
            />
          </section>
        </div>
        </div>
      </main>
    </div>
  );
}

export default App;
