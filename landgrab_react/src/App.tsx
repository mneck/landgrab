import { useState, useCallback } from "react";
import { HexMap } from "./components/HexMap";
import { PlayerPanel } from "./components/PlayerPanel";
import { GameActions } from "./components/GameActions";
import { ConferenceRow } from "./components/ConferenceRow";
import { RulebookView } from "./components/RulebookView";
import { PoliticsRow } from "./components/PoliticsRow";
import { Card } from "./components/Card";
import { ResourceMarket } from "./components/ResourceMarket";
import { CARD_INFO } from "./data/cardData";
import {
  PERSONNEL_TO_EVENT,
  ELDER_EVENT_OPTIONS,
  BROKER_EVENT_OPTIONS,
  FORESTER_EVENT_OPTIONS,
  PERSONNEL_CARDS,
  POLITICS_COSTS,
  POLITICS_VOTE_COSTS,
} from "./data/cardRules";
import {
  pickRevealedTileType,
  getCharterBuilding,
  canPlaceCharter,
  canPlaceBuild,
  canPlaceReserve,
  canPlaceConservation,
  calculatePresenceScore,
  countReserves,
  revealAdjacentFog,
  getAllowedBuildTypes,
} from "./gameRules";
import type { PlacementMode } from "./gameRules";
import {
  shuffle,
  runProcurement,
  purchasePoliticsCard,
  removePoliticsSlot,
  checkFogThresholdAndInsertMandate,
  rotatePoliticsEndOfRound,
  addToMarket,
  buyFromMarket,
  sellToMarket,
} from "./gameActions";
import type {
  GameState,
  BuildingType,
  CardType,
  PersonnelCard,
  EventCard,
  PoliticsCard,
  Player,
  PlayerType,
} from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import {
  createInitialGameState,
  decrementActionsRemaining,
  SEATS_TO_WIN,
} from "./types/game";
import { hexDistance, hexKey, hexNeighbors } from "./utils/hexGrid";
import { saveGameState, loadGameState, clearGameState } from "./saveGame";

import "./App.css";

type ConferenceBid = { coins: number; wood: number; ore: number; votes: number };

type AuctionState =
  | { phase: "selectPersonnel"; conferenceSlot: number }
  | {
      phase: "setOpeningBid";
      conferenceSlot: number;
      personnelCard: PersonnelCard;
      /** Opening bid draft: minimum 1 Coin + optional Wood/Ore/Votes */
      openingBid: ConferenceBid;
    }
  | {
      phase: "counterBid";
      conferenceSlot: number;
      personnelCard: PersonnelCard;
      initiatingPlayerIndex: number;
      currentBid: ConferenceBid;
      currentWinnerIndex: number;
      pendingBidders: number[];
    };

function describeBid(bid: { coins: number; wood: number; ore: number; votes: number }): string {
  const parts: string[] = [];
  if (bid.coins > 0) parts.push(`${bid.coins} 💰`);
  if (bid.wood > 0) parts.push(`${bid.wood} 🪵`);
  if (bid.ore > 0) parts.push(`${bid.ore} ⚙️`);
  if (bid.votes > 0) parts.push(`${bid.votes} 🗳️`);
  return parts.join(" + ") || "nothing";
}

function canAffordRaise(
  resources: { coins: number; wood: number; ore: number; votes: number },
  bid: { coins: number; wood: number; ore: number; votes: number },
  addResource: "coins" | "wood" | "ore" | "votes"
): boolean {
  const raised = { ...bid, [addResource]: bid[addResource] + 1 };
  return (
    resources.coins >= raised.coins &&
    resources.wood >= raised.wood &&
    resources.ore >= raised.ore &&
    resources.votes >= raised.votes
  );
}

/** When Promotion is drawn, it auto-plays: trash Promotion, discard rest of hand, add Dividends to discard */
function applyPromotionIfPresent(player: Player): Player {
  if (!player.hand.includes("Promotion" as CardType)) return player;
  const handWithoutPromo = player.hand.filter((c) => c !== "Promotion");
  return {
    ...player,
    hand: [],
    discardPile: [...player.discardPile, ...handWithoutPromo, "Dividends" as CardType],
  };
}

function getMandateCost(_playerType: string, seats: number): number {
  return 10 + seats;
}

function canAffordMandate(player: Player, tiles: GameState["tiles"]): boolean {
  const cost = getMandateCost(player.type, player.seats);
  const slot3Vote = 1;
  switch (player.type) {
    case "Hotelier":
      return player.resources.coins >= cost && player.resources.votes >= slot3Vote;
    case "Industrialist":
      return player.resources.wood + player.resources.ore >= cost && player.resources.votes >= slot3Vote;
    case "Bureaucrat":
      return player.resources.votes >= cost + slot3Vote;
    case "Chieftain":
      return calculatePresenceScore(tiles) >= cost && player.resources.votes >= slot3Vote;
    default:
      return false;
  }
}

function deductMandateCost(player: Player, _tiles: GameState["tiles"]): Player["resources"] {
  const cost = getMandateCost(player.type, player.seats);
  const res = { ...player.resources };
  const slot3Vote = 1;
  switch (player.type) {
    case "Hotelier":
      res.coins -= cost;
      res.votes -= slot3Vote;
      break;
    case "Industrialist": {
      const woodDeduct = Math.min(res.wood, cost);
      res.wood -= woodDeduct;
      res.ore -= cost - woodDeduct;
      res.votes -= slot3Vote;
      break;
    }
    case "Bureaucrat":
      res.votes -= cost + slot3Vote;
      break;
    case "Chieftain":
      res.votes -= slot3Vote;
      break;
  }
  return res;
}

/** Remove one instance of a card from the hand (for when multiple copies can be present). */
function removeOneFromHand(hand: CardType[], card: CardType): CardType[] {
  const i = hand.indexOf(card);
  if (i === -1) return hand;
  return [...hand.slice(0, i), ...hand.slice(i + 1)];
}

type Screen = "title" | "pickPlayers" | "pick3rd" | "game";

const PLAYER_DESCRIPTIONS: Record<PlayerType, { tagline: string; icon: string }> = {
  Hotelier: { tagline: "From paradise to parking lots!", icon: "🏨" },
  Industrialist: { tagline: "You see a forest? I see Ikea furniture.", icon: "🏭" },
  Bureaucrat: { tagline: "You'll need a permit for that.", icon: "🏛️" },
  Chieftain: { tagline: "Go away.", icon: "🛖" },
};

function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    loadGameState() ? "game" : "title"
  );
  const [game, setGame] = useState<GameState>(() =>
    loadGameState() ?? createInitialGameState(["Hotelier", "Industrialist"])
  );
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [pendingEventCard, setPendingEventCard] = useState<EventCard | PoliticsCard | null>(null);
  const [buildBuildingChoice, setBuildBuildingChoice] = useState<
    BuildingType | null
  >(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [procurementChoosing, setProcurementChoosing] = useState(false);
  /** When open: did we get here by playing a Procurement card or by playing Liaison? */
  const [procurementSource, setProcurementSource] = useState<"card" | "liaison" | null>(null);
  /** If a personnel card (Builder/Liaison/Explorer) is powering a pending action, track it so we can discard only on success. */
  const [pendingPersonnelSource, setPendingPersonnelSource] = useState<PersonnelCard | null>(null);
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [rulebookOpen, setRulebookOpen] = useState(false);
  const [selectedMarketSlot, setSelectedMarketSlot] = useState<
    { row: "politics"; slotIndex: number } | { row: "conference"; slotIndex: number } | null
  >(null);

  const [reorderInProgress, setReorderInProgress] = useState(false);
  const [pendingReorder, setPendingReorder] = useState<GameState["politics"] | null>(null);

  function startGame(playerTypes: PlayerType[]) {
    setGame(createInitialGameState(playerTypes));
    setSelectedHex(null);
    setPlacementMode(null);
    setPendingEventCard(null);
    setBuildBuildingChoice(null);
    setSelectedCard(null);
    setProcurementChoosing(false);
    setProcurementSource(null);
    setAuction(null);
    setSelectedMarketSlot(null);
    setReorderInProgress(false);
    setPendingReorder(null);
    setScreen("game");
  }

  function handleQuit() {
    clearGameState();
    setScreen("title");
    setSelectedHex(null);
    setPlacementMode(null);
    setPendingEventCard(null);
    setBuildBuildingChoice(null);
    setSelectedCard(null);
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setAuction(null);
    setSelectedMarketSlot(null);
    setReorderInProgress(false);
    setPendingReorder(null);
  }

  if (screen !== "game") {
    if (screen === "title") {
      return (
        <div className="start-screen">
          <div className="start-screen__content">
            <h1 className="start-screen__title">Landgrab</h1>
            <p className="start-screen__subtitle">A strategy game of settlement, industry, and politics</p>
            <button
              className="start-screen__btn start-screen__btn--primary"
              type="button"
              onClick={() => setScreen("pickPlayers")}
            >
              Start Game
            </button>
          </div>
        </div>
      );
    }

    if (screen === "pickPlayers") {
      return (
        <div className="start-screen">
          <div className="start-screen__content">
            <h1 className="start-screen__title">Landgrab</h1>
            <p className="start-screen__subtitle">Choose number of players</p>
            <div className="start-screen__options">
              <button
                className="start-screen__btn start-screen__option-btn"
                type="button"
                onClick={() => startGame(["Hotelier", "Industrialist"])}
              >
                <span className="start-screen__option-icons">🏨 vs 🏭</span>
                <span className="start-screen__option-label">2 Players</span>
                <span className="start-screen__option-detail">Hotelier + Industrialist</span>
              </button>
              <button
                className="start-screen__btn start-screen__option-btn"
                type="button"
                onClick={() => setScreen("pick3rd")}
              >
                <span className="start-screen__option-icons">🏨 🏭 + ?</span>
                <span className="start-screen__option-label">3 Players</span>
                <span className="start-screen__option-detail">Choose a third faction</span>
              </button>
              <button
                className="start-screen__btn start-screen__option-btn"
                type="button"
                onClick={() => startGame(["Hotelier", "Industrialist", "Bureaucrat", "Chieftain"])}
              >
                <span className="start-screen__option-icons">🏨 🏭 🏛️ 🛖</span>
                <span className="start-screen__option-label">4 Players</span>
                <span className="start-screen__option-detail">All factions</span>
              </button>
            </div>
            <button
              className="start-screen__back"
              type="button"
              onClick={() => setScreen("title")}
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="start-screen">
        <div className="start-screen__content">
          <h1 className="start-screen__title">Landgrab</h1>
          <p className="start-screen__subtitle">Choose the third faction</p>
          <div className="start-screen__options">
            {(["Bureaucrat", "Chieftain"] as PlayerType[]).map((type) => (
              <button
                key={type}
                className="start-screen__btn start-screen__option-btn"
                type="button"
                onClick={() => startGame(["Hotelier", "Industrialist", type])}
              >
                <span className="start-screen__option-icons">{PLAYER_DESCRIPTIONS[type].icon}</span>
                <span className="start-screen__option-label">{type}</span>
                <span className="start-screen__option-detail">{PLAYER_DESCRIPTIONS[type].tagline}</span>
              </button>
            ))}
          </div>
          <button
            className="start-screen__back"
            type="button"
            onClick={() => setScreen("pickPlayers")}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

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

      setGame((g) => {
        const afterFog = checkFogThresholdAndInsertMandate(g, newTiles);
        return {
          ...afterFog,
          players: afterFog.players.map((p, i) =>
            i === g.currentPlayerIndex
              ? { ...p, hand: p.hand.filter((c) => c !== "Charter") }
              : p
          ),
        };
      });
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

      setGame((g) => {
        const afterFog = checkFogThresholdAndInsertMandate(g, newTiles);
        return {
          ...afterFog,
          players: afterFog.players.map((p, i) => {
            if (i !== g.currentPlayerIndex) return p;
            let updated: Player = {
              ...p,
              hand: p.hand.filter((c) => c !== "Expedition"),
            };
            if (pendingPersonnelSource === "Explorer") {
              const newHand = removeOneFromHand(updated.hand, "Explorer");
              updated = {
                ...updated,
                hand: newHand,
                discardPile: [...updated.discardPile, "Explorer"],
              };
            }
            return updated;
          }),
          actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
        };
      });
      setPlacementMode(null);
      setPendingEventCard(null);
      setPendingPersonnelSource(null);
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

      setGame((g) => {
        const afterFog = checkFogThresholdAndInsertMandate(g, newTiles);
        return {
          ...afterFog,
          players: afterFog.players.map((p, i) =>
            i === g.currentPlayerIndex
              ? { ...p, hand: p.hand.filter((c) => c !== "Contact") }
              : p
          ),
          actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
        };
      });
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

      setGame((g) => {
        const p = g.players[g.currentPlayerIndex]!;
        const { wood: w, ore: o, coins: c } = p.resources;
        if (w < 1 || o < 1 || c < 1) return g;
        return {
          ...g,
          tiles: {
            ...g.tiles,
            [key]: {
              ...tile,
              building: buildBuildingChoice,
              buildingOwner: p.type,
            },
          },
          players: g.players.map((pl, i) => {
            if (i !== g.currentPlayerIndex) return pl;
            let updated: Player = {
              ...pl,
              hand: pl.hand.filter((c) => c !== "Build"),
              resources: {
                ...pl.resources,
                wood: pl.resources.wood - 1,
                ore: pl.resources.ore - 1,
                coins: pl.resources.coins - 1,
              },
            };
            if (pendingPersonnelSource === "Builder") {
              const newHand = removeOneFromHand(updated.hand, "Builder");
              updated = {
                ...updated,
                hand: newHand,
                discardPile: [...updated.discardPile, "Builder"],
              };
            }
            return updated;
          }),
          actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
        };
      });
      setPlacementMode(null);
      setPendingEventCard(null);
      setBuildBuildingChoice(null);
      setPendingPersonnelSource(null);
      setSelectedCard(null);
      return;
    }

    if (placementMode === "zoning" && pendingEventCard === "Zoning") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.building || !["Sand", "Field"].includes(tile.type))
        return;
      if (tile.zoningOwner || tile.hasConservation) return;
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
      if (!["Resort", "IndustrialZone", "Infrastructure"].includes(tile.building))
        return;
      const { wood, ore, coins } = currentPlayer.resources;
      if (wood < 1 || ore < 1 || coins < 1) return;

      setGame((g) => {
        const p = g.players[g.currentPlayerIndex]!;
        const { wood: w, ore: o, coins: c } = p.resources;
        if (w < 1 || o < 1 || c < 1) return g;
        return {
          ...g,
          tiles: {
            ...g.tiles,
            [key]: {
              ...tile!,
              hasUrbanPlanning: true,
            },
          },
          players: g.players.map((pl, i) =>
            i === g.currentPlayerIndex
              ? {
                  ...pl,
                  hand: pl.hand.filter((c) => c !== "UrbanPlanning"),
                  resources: {
                    ...pl.resources,
                    wood: pl.resources.wood - 1,
                    ore: pl.resources.ore - 1,
                    coins: pl.resources.coins - 1,
                  },
                }
              : pl
          ),
          actionsRemaining: decrementActionsRemaining(g.actionsRemaining),
        };
      });
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
      if (!tile || tile.type !== "Forest" || tile.hasConservation) return;

      setGame((g) => ({
        ...g,
        tiles: { ...g.tiles, [key]: { ...tile, type: "Field" as const } },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? {
                ...p,
                hand: p.hand.filter((c) => c !== "Logging"),
                resources: { ...p.resources, wood: p.resources.wood + 1 },
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

    if (placementMode === "forestry" && pendingEventCard === "Forestry") {
      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (!tile || tile.type !== "Field") return;
      if (tile.building || tile.hasConservation) return;

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

    if (placementMode === "conservation" && pendingEventCard === "Conservation") {
      if (!canPlaceConservation(game.tiles, hex)) return;
      const key = hexKey(hex);
      const tile = game.tiles[key]!;

      setGame((g) => ({
        ...g,
        tiles: { ...g.tiles, [key]: { ...tile, hasConservation: true } },
        players: g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Conservation") }
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
    // Spend 1 action when Charter is played; placement itself is free
    consumeAction((g) => g);
    setPlacementMode("charter");
  }

  function handlePlayPersonnel(card: PersonnelCard, eventCard?: EventCard | PoliticsCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;

    if (card === "Builder") {
      if (currentPlayer.type === "Chieftain") return;
      const { wood, ore, coins } = currentPlayer.resources;
      if (wood < 1 || ore < 1 || coins < 1) return;
      setPendingPersonnelSource("Builder");
      setPendingEventCard("Build");
      setPlacementMode("build");
      setBuildBuildingChoice(null);
      setSelectedCard(null);
      return;
    }

    if (card === "Liaison") {
      setPendingPersonnelSource("Liaison");
      setProcurementSource("liaison");
      setProcurementChoosing(true);
      setSelectedCard(null);
      return;
    }

    if (card === "Explorer") {
      setPendingPersonnelSource("Explorer");
      setPendingEventCard("Expedition");
      setPlacementMode("expedition");
      setSelectedCard(null);
      return;
    }

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
      setPendingPersonnelSource(null);
      setProcurementSource("card");
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
      const firstSlotWithCard = game.politics.findIndex((c) => c !== null && c !== "Mandate");
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
      const { wood, ore, coins } = currentPlayer.resources;
      if (wood < 1 || ore < 1 || coins < 1) return;
      setPendingEventCard("UrbanPlanning");
      setPlacementMode("urbanplanning");
      return;
    }

    if (card === "Dividends") {
      let coins = 0;
      for (const t of Object.values(game.tiles)) {
        if (
          t.buildingOwner === currentPlayer.type &&
          ["IndustrialZone", "Resort", "Village", "Infrastructure"].includes(t.building ?? "")
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

    if (card === "Conservation") {
      setPendingEventCard("Conservation");
      setPlacementMode("conservation");
      return;
    }

    if (card === "Seat") {
      consumeAction((g) => {
        const newSeats = currentPlayer.seats + 1;
        const newPlayers = g.players.map((p, i) =>
          i === g.currentPlayerIndex
            ? { ...p, hand: p.hand.filter((c) => c !== "Seat"), seats: newSeats }
            : p
        );
        return {
          ...g,
          players: newPlayers,
          winner: newSeats >= SEATS_TO_WIN ? currentPlayer.type : g.winner,
        };
      });
      return;
    }

    if (card === "Expropriation") {
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
      return;
    }

    if (card === "Protests") {
      return;
    }

    if (card === "Levy") {
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

  function handlePlayExpropriation(woodToAdd: number, oreToAdd: number) {
    if (
      !currentPlayer.hand.includes("Expropriation") ||
      game.actionsRemaining < 1
    )
      return;
    const industrialistIdx = game.players.findIndex((p) => p.type === "Industrialist");
    if (industrialistIdx < 0) return;
    const ind = game.players[industrialistIdx];
    if (ind.resources.wood < woodToAdd || ind.resources.ore < oreToAdd) return;
    const total = woodToAdd + oreToAdd;
    if (total < 1 || total > 3) return;

    consumeAction((g) => ({
      ...g,
      woodMarket: addToMarket(g.woodMarket, woodToAdd),
      oreMarket: addToMarket(g.oreMarket, oreToAdd),
      players: g.players.map((p, i) => {
        if (i === g.currentPlayerIndex) {
          return { ...p, hand: p.hand.filter((c) => c !== "Expropriation") };
        }
        if (i === industrialistIdx) {
          return {
            ...p,
            resources: {
              ...p.resources,
              wood: p.resources.wood - woodToAdd,
              ore: p.resources.ore - oreToAdd,
              coins: p.resources.coins + 1,
            },
          };
        }
        return p;
      }),
    }));
  }

  function handleProcurementMandate() {
    const mandateSlot = game.politics.findIndex((c) => c === "Mandate");
    if (
      mandateSlot < 0 ||
      (!currentPlayer.hand.includes("Procurement") && procurementSource !== "liaison") ||
      game.actionsRemaining < 2 ||
      !canAffordMandate(currentPlayer, game.tiles)
    )
      return;

    setGame((g) => {
      const player = g.players[g.currentPlayerIndex];
      const newResources = deductMandateCost(player, g.tiles);
      const mandateSlot = g.politics.findIndex((c) => c === "Mandate");
      if (mandateSlot < 0) return g;
      const rawSlots = [...g.politics] as (PoliticsCard | null)[];
      rawSlots[mandateSlot] = null;
      const nextDeck = [...g.politicsDeck];
      const drawn = nextDeck.shift() ?? null;
      rawSlots[mandateSlot] = drawn;
      const politics = rawSlots as [typeof g.politics[0], typeof g.politics[1], typeof g.politics[2], typeof g.politics[3]];
      let newPlayers = g.players.map((p, i) => {
        if (i !== g.currentPlayerIndex) return p;
        let updated: Player = {
          ...p,
          hand: procurementSource === "card" ? removeOneFromHand(p.hand, "Procurement") : p.hand,
          discardPile: [
            ...p.discardPile,
            "Promotion" as CardType,
            "Seat" as CardType,
          ],
          resources: newResources,
        };
        if (procurementSource === "liaison") {
          const newHand = removeOneFromHand(updated.hand, "Liaison");
          updated = {
            ...updated,
            hand: newHand,
            discardPile: [...updated.discardPile, "Liaison"],
          };
        }
        return updated;
      });
      const slot3Vote = 1;
      const bureaucratIdx = newPlayers.findIndex((p) => p.type === "Bureaucrat");
      if (slot3Vote > 0 && bureaucratIdx >= 0 && g.currentPlayerIndex !== bureaucratIdx) {
        newPlayers = newPlayers.map((p, i) =>
          i === bureaucratIdx
            ? { ...p, resources: { ...p.resources, votes: p.resources.votes + slot3Vote } }
            : p
        );
      }
      return {
        ...g,
        politics,
        politicsDeck: nextDeck,
        players: newPlayers,
        actionsRemaining: 0,
      };
    });
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setSelectedCard(null);
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
            let updatedPlayer: Player = {
              ...p,
              hand: [...p.hand, drawn],
              drawPile: newDraw,
              discardPile: newDiscard,
            };
            updatedPlayer = applyPromotionIfPresent(updatedPlayer);
            newState = {
              ...newState,
              players: newState.players.map((pl, i) =>
                i === g.currentPlayerIndex ? updatedPlayer : pl
              ),
            };
          }
        }
      }
      return newState;
    });
  }

  function handleProcurementGenerate() {
    if (
      (!currentPlayer.hand.includes("Procurement") && procurementSource !== "liaison") ||
      game.actionsRemaining < 1
    )
      return;
    consumeAction((g) =>
      runProcurement(
        {
          ...g,
          players: g.players.map((p, i) => {
            if (i !== g.currentPlayerIndex) return p;
            let updated: Player =
              procurementSource === "card"
                ? { ...p, hand: removeOneFromHand(p.hand, "Procurement") }
                : p;
            if (procurementSource === "liaison") {
              const newHand = removeOneFromHand(updated.hand, "Liaison");
              updated = {
                ...updated,
                hand: newHand,
                discardPile: [...updated.discardPile, "Liaison"],
              };
            }
            return updated;
          }),
        },
        currentPlayer.type
      )
    );
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setSelectedCard(null);
  }

  function handleProcurementPurchase(slotIndex: number) {
    if (
      (!currentPlayer.hand.includes("Procurement") && procurementSource !== "liaison") ||
      game.actionsRemaining < 1
    )
      return;
    const cost = POLITICS_COSTS[slotIndex];
    const card = game.politics[slotIndex];
    if (!card || currentPlayer.resources.coins < cost) return;
    consumeAction((g) =>
      purchasePoliticsCard(
        {
          ...g,
          players: g.players.map((p, i) => {
            if (i !== g.currentPlayerIndex) return p;
            let updated: Player =
              procurementSource === "card"
                ? { ...p, hand: removeOneFromHand(p.hand, "Procurement") }
                : p;
            if (procurementSource === "liaison") {
              const newHand = removeOneFromHand(updated.hand, "Liaison");
              updated = {
                ...updated,
                hand: newHand,
                discardPile: [...updated.discardPile, "Liaison"],
              };
            }
            return updated;
          }),
        },
        slotIndex,
        g.currentPlayerIndex
      )
    );
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setSelectedCard(null);
  }

  function handleProcurementMarketBuy(resource: "wood" | "ore", count: number) {
    if (
      (!currentPlayer.hand.includes("Procurement") && procurementSource !== "liaison") ||
      game.actionsRemaining < 1
    )
      return;
    const track = resource === "wood" ? game.woodMarket : game.oreMarket;
    const result = buyFromMarket(track, count);
    if (!result || currentPlayer.resources.coins < result.totalCost) return;
    const marketKey = resource === "wood" ? "woodMarket" : "oreMarket";
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) => {
        if (i !== g.currentPlayerIndex) return p;
        let updated: Player = {
          ...p,
          hand: procurementSource === "card" ? removeOneFromHand(p.hand, "Procurement") : p.hand,
          resources: {
            ...p.resources,
            [resource]: p.resources[resource as keyof typeof p.resources] + count,
            coins: p.resources.coins - result.totalCost,
          },
        };
        if (procurementSource === "liaison") {
          const newHand = removeOneFromHand(updated.hand, "Liaison");
          updated = {
            ...updated,
            hand: newHand,
            discardPile: [...updated.discardPile, "Liaison"],
          };
        }
        return updated;
      }),
      [marketKey]: result.newTrack,
    }));
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setSelectedCard(null);
  }

  function handleProcurementMarketSell(resource: "wood" | "ore", count: number) {
    if (
      (!currentPlayer.hand.includes("Procurement") && procurementSource !== "liaison") ||
      game.actionsRemaining < 1
    )
      return;
    if (currentPlayer.resources[resource] < count) return;
    const track = resource === "wood" ? game.woodMarket : game.oreMarket;
    const result = sellToMarket(track, count);
    if (!result) return;
    const marketKey = resource === "wood" ? "woodMarket" : "oreMarket";
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) => {
        if (i !== g.currentPlayerIndex) return p;
        let updated: Player = {
          ...p,
          hand: procurementSource === "card" ? removeOneFromHand(p.hand, "Procurement") : p.hand,
          resources: {
            ...p.resources,
            [resource]: p.resources[resource as keyof typeof p.resources] - count,
            coins: p.resources.coins + result.totalGain,
          },
        };
        if (procurementSource === "liaison") {
          const newHand = removeOneFromHand(updated.hand, "Liaison");
          updated = {
            ...updated,
            hand: newHand,
            discardPile: [...updated.discardPile, "Liaison"],
          };
        }
        return updated;
      }),
      [marketKey]: result.newTrack,
    }));
    setProcurementChoosing(false);
    setProcurementSource(null);
    setPendingPersonnelSource(null);
    setSelectedCard(null);
  }

  function handleConferenceCardClick(slotIndex: number) {
    if (auction || procurementChoosing) return;
    if (game.actionsRemaining < 1) return;
    const hasPersonnel = currentPlayer.hand.some((c) =>
      PERSONNEL_CARDS.includes(c as PersonnelCard)
    );
    if (!hasPersonnel || currentPlayer.resources.coins < 1) return;
    if (!game.conference[slotIndex]) return;
    setAuction({ phase: "selectPersonnel", conferenceSlot: slotIndex });
    setSelectedCard(null);
  }

  function handleAuctionOpeningBid(bid: ConferenceBid) {
    if (!auction || auction.phase !== "setOpeningBid") return;
    if (bid.coins < 1) return;
    const r = currentPlayer.resources;
    if (
      r.coins < bid.coins ||
      r.wood < bid.wood ||
      r.ore < bid.ore ||
      r.votes < bid.votes
    )
      return;
    const pendingBidders: number[] = [];
    for (let offset = 1; offset < game.players.length; offset++) {
      pendingBidders.push(
        (game.currentPlayerIndex + offset) % game.players.length
      );
    }
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? {
              ...p,
              hand: p.hand.filter((c) => c !== auction.personnelCard),
              discardPile: [...p.discardPile, auction.personnelCard],
            }
          : p
      ),
    }));
    setAuction({
      phase: "counterBid",
      conferenceSlot: auction.conferenceSlot,
      personnelCard: auction.personnelCard,
      initiatingPlayerIndex: game.currentPlayerIndex,
      currentBid: bid,
      currentWinnerIndex: game.currentPlayerIndex,
      pendingBidders,
    });
  }

  function handleSetOpeningBidAdd(resource: keyof ConferenceBid) {
    if (!auction || auction.phase !== "setOpeningBid") return;
    const draft = auction.openingBid;
    const next = { ...draft, [resource]: draft[resource] + 1 };
    const r = currentPlayer.resources;
    if (
      next.coins > r.coins ||
      next.wood > r.wood ||
      next.ore > r.ore ||
      next.votes > r.votes
    )
      return;
    setAuction({ ...auction, openingBid: next });
  }

  function handleSetOpeningBidSubtract(resource: keyof ConferenceBid) {
    if (!auction || auction.phase !== "setOpeningBid") return;
    const draft = auction.openingBid;
    if (resource === "coins" && draft.coins <= 1) return;
    const next = { ...draft, [resource]: Math.max(0, draft[resource] - 1) };
    setAuction({ ...auction, openingBid: next });
  }

  function handleAuctionCounterBid(resourceType: "coins" | "wood" | "ore" | "votes") {
    if (!auction || auction.phase !== "counterBid" || auction.pendingBidders.length === 0) return;
    const bidderIndex = auction.pendingBidders[0];
    const bidder = game.players[bidderIndex];
    if (!canAffordRaise(bidder.resources, auction.currentBid, resourceType)) return;
    const newBid = { ...auction.currentBid, [resourceType]: auction.currentBid[resourceType] + 1 };
    const remaining = auction.pendingBidders.slice(1);
    if (remaining.length === 0) {
      resolveAuction(auction.conferenceSlot, newBid, bidderIndex);
    } else {
      setAuction({
        ...auction,
        currentBid: newBid,
        currentWinnerIndex: bidderIndex,
        pendingBidders: remaining,
      });
    }
  }

  function handleAuctionPass() {
    if (!auction || auction.phase !== "counterBid" || auction.pendingBidders.length === 0) return;
    const remaining = auction.pendingBidders.slice(1);
    if (remaining.length === 0) {
      resolveAuction(auction.conferenceSlot, auction.currentBid, auction.currentWinnerIndex);
    } else {
      setAuction({ ...auction, pendingBidders: remaining });
    }
  }

  function resolveAuction(
    conferenceSlot: number,
    finalBid: { coins: number; wood: number; ore: number; votes: number },
    winnerIndex: number
  ) {
    setGame((g) => {
      const confCard = g.conference[conferenceSlot];
      if (!confCard) return g;
      return {
        ...g,
        players: g.players.map((p, i) =>
          i === winnerIndex
            ? {
                ...p,
                discardPile: [...p.discardPile, confCard],
                resources: {
                  coins: p.resources.coins - finalBid.coins,
                  wood: p.resources.wood - finalBid.wood,
                  ore: p.resources.ore - finalBid.ore,
                  votes: p.resources.votes - finalBid.votes,
                },
              }
            : p
        ),
        conference: g.conference.map((c, i) =>
          i === conferenceSlot ? null : c
        ) as typeof g.conference,
      };
    });
    setAuction(null);
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
    } else if (card === "Expropriation") {
      const industrialistIdx = game.players.findIndex((p) => p.type === "Industrialist");
      if (industrialistIdx < 0) {
        playOptions.push({ label: "No Industrialist in game", onPlay: () => {}, disabled: true });
      } else {
        const ind = game.players[industrialistIdx];
        const w = ind.resources.wood;
        const o = ind.resources.ore;
        const emptyWood = game.woodMarket.filter((s) => s === 0).length;
        const emptyOre = game.oreMarket.filter((s) => s === 0).length;
        const combos: [number, number][] = [];
        for (let wAdd = 0; wAdd <= Math.min(3, w, emptyWood); wAdd++) {
          for (let oAdd = 0; oAdd <= Math.min(3 - wAdd, o, emptyOre); oAdd++) {
            if (wAdd + oAdd >= 1 && wAdd + oAdd <= 3) combos.push([wAdd, oAdd]);
          }
        }
        for (const [wa, oa] of combos) {
          const parts: string[] = [];
          if (wa > 0) parts.push(`${wa} 🪵`);
          if (oa > 0) parts.push(`${oa} ⛏️`);
          playOptions.push({
            label: `Add ${parts.join(" + ")} to market → Ind. gets 1 💰`,
            onPlay: () => {
              handlePlayExpropriation(wa, oa);
              setSelectedCard(null);
            },
            disabled: !hasActions,
          });
        }
        if (combos.length === 0) {
          playOptions.push({ label: "No resources or market full", onPlay: () => {}, disabled: true });
        }
      }
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
    if (auction?.phase === "selectPersonnel") {
      if (PERSONNEL_CARDS.includes(card as PersonnelCard)) {
        setAuction({
          phase: "setOpeningBid",
          conferenceSlot: auction.conferenceSlot,
          personnelCard: card as PersonnelCard,
          openingBid: { coins: 1, wood: 0, ore: 0, votes: 0 },
        });
      }
      return;
    }
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
      let updatedPlayer: Player = {
        ...p,
        hand: [...p.hand, drawn],
        drawPile: newDraw,
        discardPile: newDiscard,
      };
      updatedPlayer = applyPromotionIfPresent(updatedPlayer);
      return {
        ...g,
        players: g.players.map((pl, i) =>
          i === g.currentPlayerIndex ? updatedPlayer : pl
        ),
      };
    });
  }

  function handleEndTurn() {
    setGame((g) => {
      const nextPlayer = (g.currentPlayerIndex + 1) % g.players.length;
      const isNewRound = nextPlayer === 0;

      let woodMkt = g.woodMarket;
      let oreMkt = g.oreMarket;
      if (woodMkt.every((v) => v === 0)) woodMkt = [0, 0, 0, 1];
      if (oreMkt.every((v) => v === 0)) oreMkt = [0, 0, 0, 1];

      let conf = g.conference;
      let confDeck = g.conferenceDeck;

      if (isNewRound) {
        const deck = [...confDeck];
        conf = conf.map((slot) =>
          slot !== null ? slot : (deck.shift() ?? null)
        ) as typeof conf;
        confDeck = deck;

        const rotated = rotatePoliticsEndOfRound(g);
        const hasBureaucrat = g.players.some((p) => p.type === "Bureaucrat");
        return {
          ...rotated,
          currentPlayerIndex: nextPlayer,
          actionsRemaining: 2,
          woodMarket: woodMkt,
          oreMarket: oreMkt,
          conference: conf,
          conferenceDeck: confDeck,
          bureaucratReorderPhase: hasBureaucrat ? true : undefined,
          landClaimsUntilPlayer:
            g.landClaimsUntilPlayer === nextPlayer
              ? undefined
              : g.landClaimsUntilPlayer,
        };
      }

      return {
        ...g,
        currentPlayerIndex: nextPlayer,
        actionsRemaining: 2,
        woodMarket: woodMkt,
        oreMarket: oreMkt,
        conference: conf,
        conferenceDeck: confDeck,
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
    setProcurementSource(null);
    setAuction(null);
  }

  const auctionUI = (() => {
    if (!auction) return undefined;
    const confCard = game.conference[auction.conferenceSlot];
    const confCardName = confCard ?? "???";
    type AuctionUIType = { lines: string[]; buttons: { label: string; onClick: () => void; disabled?: boolean }[] };

    if (auction.phase === "selectPersonnel") {
      const personnelInHand = currentPlayer.hand.filter((c) =>
        PERSONNEL_CARDS.includes(c as PersonnelCard)
      );
      return {
        lines: [
          `Conference Bid: ${confCardName}`,
          "Select a Personnel card from your hand to discard.",
        ],
        buttons: [
          ...personnelInHand.map((card) => ({
            label: `Discard ${card}`,
            onClick: () =>
              setAuction({
                phase: "setOpeningBid" as const,
                conferenceSlot: auction.conferenceSlot,
                personnelCard: card as PersonnelCard,
                openingBid: { coins: 1, wood: 0, ore: 0, votes: 0 },
              }),
          })),
          { label: "Cancel", onClick: () => setAuction(null) },
        ],
      } satisfies AuctionUIType;
    }

    if (auction.phase === "setOpeningBid") {
      const draft = auction.openingBid;
      const r = currentPlayer.resources;
      const canAdd = (key: keyof ConferenceBid) => draft[key] < r[key];
      const canSub = (key: keyof ConferenceBid) =>
        key === "coins" ? draft.coins > 1 : draft[key] > 0;
      const resourceKeys: (keyof ConferenceBid)[] = ["coins", "wood", "ore", "votes"];
      const icons: Record<keyof ConferenceBid, string> = {
        coins: "💰",
        wood: "🪵",
        ore: "⚙️",
        votes: "🗳️",
      };
      const line2 = `Opening bid: ${describeBid(draft)} (min 1 💰, add resources)`;
      const addButtons = resourceKeys.map((key) => ({
        label: `+1 ${icons[key]}`,
        onClick: () => handleSetOpeningBidAdd(key),
        disabled: !canAdd(key),
      }));
      const subButtons = resourceKeys.map((key) => ({
        label: `−1 ${icons[key]}`,
        onClick: () => handleSetOpeningBidSubtract(key),
        disabled: !canSub(key),
      }));
      const canSubmit =
        draft.coins >= 1 &&
        r.coins >= draft.coins &&
        r.wood >= draft.wood &&
        r.ore >= draft.ore &&
        r.votes >= draft.votes;
      return {
        lines: [
          `Conference Bid: ${confCardName}`,
          `Discarding: ${auction.personnelCard}`,
          line2,
        ],
        buttons: [
          ...addButtons,
          ...subButtons,
          {
            label: "Submit opening bid",
            onClick: () => handleAuctionOpeningBid(draft),
            disabled: !canSubmit,
          },
          { label: "Cancel", onClick: () => setAuction(null) },
        ],
      } satisfies AuctionUIType;
    }

    if (auction.phase === "counterBid") {
      if (auction.pendingBidders.length === 0) return undefined;
      const bidderIndex = auction.pendingBidders[0];
      const bidder = game.players[bidderIndex];
      const winnerName = game.players[auction.currentWinnerIndex].type;
      const resourceTypes = ["coins", "wood", "ore", "votes"] as const;
      const icons: Record<string, string> = { coins: "💰", wood: "🪵", ore: "⚙️", votes: "🗳️" };
      return {
        lines: [
          `Conference Bid: ${confCardName}`,
          `Current bid: ${describeBid(auction.currentBid)} (by ${winnerName})`,
          `${bidder.type}: raise or pass?`,
        ],
        buttons: [
          ...resourceTypes.map((rt) => ({
            label: `Match + 1 ${icons[rt]}`,
            onClick: () => handleAuctionCounterBid(rt),
            disabled: !canAffordRaise(bidder.resources, auction.currentBid, rt),
          })),
          { label: "Pass", onClick: handleAuctionPass },
        ],
      } satisfies AuctionUIType;
    }

    return undefined;
  })();

  return (
    <div className="game-container">
      {game.winner && (
        <div className="victory-banner">
          {game.winner} wins with {SEATS_TO_WIN} Seats!
        </div>
      )}
      <header className="game-header">
        <div>
          <h1>Landgrab</h1>
          <p className="subtitle">Strategy prototype</p>
        </div>
        <div className="game-header__actions">
          <button
            type="button"
            className="game-header__btn"
            onClick={handleQuit}
          >
            Quit
          </button>
          <button
            type="button"
            className="game-header__btn"
            onClick={() => saveGameState(game)}
          >
            Save
          </button>
          <button
            type="button"
            className="game-header__rules-btn"
            onClick={() => setRulebookOpen(true)}
          >
            Rules
          </button>
        </div>
      </header>
      {rulebookOpen && (
        <RulebookView onClose={() => setRulebookOpen(false)} />
      )}

      {game.bureaucratReorderPhase && (
        <div className="bureaucrat-reorder-panel">
          {currentPlayer.type === "Bureaucrat" ? (
            !reorderInProgress ? (
              <>
                <p>Reorder the Politics Market? (Slot prices stay fixed; only cards move.)</p>
                <div className="bureaucrat-reorder-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setGame((g) => ({ ...g, bureaucratReorderPhase: undefined }));
                    }}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    disabled={currentPlayer.resources.votes < 1}
                    onClick={() => {
                      setGame((g) => {
                        const bi = g.players.findIndex((p) => p.type === "Bureaucrat");
                        if (bi < 0 || g.players[bi].resources.votes < 1) return g;
                        return {
                          ...g,
                          players: g.players.map((p, i) =>
                            i === bi
                              ? { ...p, resources: { ...p.resources, votes: p.resources.votes - 1 } }
                              : p
                          ),
                        };
                      });
                      setPendingReorder([...game.politics]);
                      setReorderInProgress(true);
                    }}
                  >
                    Pay 1 Vote to reorder
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Swap slots to reorder. Slot 0 = 1 Coin, Slot 3 = 4 Coins + 1 Vote.</p>
                <div className="bureaucrat-reorder-slots">
                  {(pendingReorder ?? game.politics).map((card, i) => (
                    <div key={i} className="market-slot">
                      <span className="market-slot__label">Slot {i}</span>
                      {card ? <Card card={card} compact /> : <span>—</span>}
                    </div>
                  ))}
                </div>
                <div className="bureaucrat-reorder-swaps">
                  {[0, 1, 2, 3].flatMap((a) =>
                    [1, 2, 3].filter((b) => b > a).map((b) => (
                      <button
                        key={`${a}-${b}`}
                        type="button"
                        onClick={() => {
                          const p = pendingReorder ?? [...game.politics];
                          const next = [...p] as GameState["politics"];
                          [next[a], next[b]] = [next[b], next[a]];
                          setPendingReorder(next);
                        }}
                      >
                        Swap {a}↔{b}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const order = pendingReorder ?? game.politics;
                    setGame((g) => ({ ...g, politics: order, bureaucratReorderPhase: undefined }));
                    setReorderInProgress(false);
                    setPendingReorder(null);
                  }}
                >
                  Confirm order
                </button>
              </>
            )
          ) : (
            <p>Waiting for Bureaucrat to reorder or skip…</p>
          )}
        </div>
      )}

      <main className="game-main">
        <div className="game-content">
        <aside className="players-sidebar">
          {(() => {
            const cur = game.currentPlayerIndex;
            const reordered = [
              ...game.players.slice(cur),
              ...game.players.slice(0, cur),
            ];
            return reordered.map((player, displayIndex) => {
              const originalIndex = (cur + displayIndex) % game.players.length;
              return (
                <PlayerPanel
                  key={player.type}
                  player={player}
                  isCurrent={displayIndex === 0}
                  selectedCard={
                    originalIndex === game.currentPlayerIndex
                      ? selectedCard
                      : null
                  }
                  onCardClick={
                    originalIndex === game.currentPlayerIndex
                      ? handleCardClick
                      : undefined
                  }
                />
              );
            });
          })()}
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
                      setPendingPersonnelSource(null);
                    }
                  : undefined
              }
              onEndTurn={handleEndTurn}
              buildOptions={
                placementMode === "build" && !buildBuildingChoice
                  ? getAllowedBuildTypes(game.tiles, currentPlayer.type)
                  : undefined
              }
              onBuildChoice={setBuildBuildingChoice}
              procurementChoosing={procurementChoosing}
              procurementPurchaseOptions={
                procurementChoosing
                  ? game.politics
                      .map((card, i) =>
                        card && card !== "Mandate" && currentPlayer.resources.coins >= POLITICS_COSTS[i] && currentPlayer.resources.votes >= POLITICS_VOTE_COSTS[i]
                          ? {
                              slotIndex: i,
                              cost: POLITICS_COSTS[i],
                              voteCost: POLITICS_VOTE_COSTS[i],
                              card,
                              onPurchase: () => handleProcurementPurchase(i),
                            }
                          : null
                      )
                      .filter((o): o is NonNullable<typeof o> => o !== null)
                  : []
              }
              procurementResourceOptions={
                procurementChoosing
                  ? (() => {
                      const opts: { label: string; onAction: () => void; disabled?: boolean }[] = [];
                      for (const res of ["wood", "ore"] as const) {
                        const track = res === "wood" ? game.woodMarket : game.oreMarket;
                        const icon = res === "wood" ? "🪵" : "⚙️";
                        const available = track.filter((v) => v > 0).length;
                        for (let n = 1; n <= available; n++) {
                          const r = buyFromMarket(track, n);
                          if (r) {
                            const count = n;
                            opts.push({
                              label: `Buy ${n} ${icon} (${r.totalCost} 💰)`,
                              onAction: () => handleProcurementMarketBuy(res, count),
                              disabled: currentPlayer.resources.coins < r.totalCost,
                            });
                          }
                        }
                        const emptySlots = track.filter((v) => v === 0).length;
                        const maxSell = Math.min(currentPlayer.resources[res], emptySlots);
                        for (let n = 1; n <= maxSell; n++) {
                          const r = sellToMarket(track, n);
                          if (r) {
                            const count = n;
                            opts.push({
                              label: `Sell ${n} ${icon} → ${r.totalGain} 💰`,
                              onAction: () => handleProcurementMarketSell(res, count),
                            });
                          }
                        }
                      }
                      return opts;
                    })()
                  : []
              }
              mandateOption={
                procurementChoosing && game.politics.includes("Mandate")
                  ? {
                      label: (() => {
                        const cost = getMandateCost(currentPlayer.type, currentPlayer.seats);
                        switch (currentPlayer.type) {
                          case "Hotelier": return `Buy Mandate (${cost} 💰 + 1 🗳️)`;
                          case "Industrialist": return `Buy Mandate (${cost} 🪵+⛏️ + 1 🗳️)`;
                          case "Bureaucrat": return `Buy Mandate (${cost + 1} 🗳️)`;
                          case "Chieftain": return `Buy Mandate (Presence ≥ ${cost} + 1 🗳️)`;
                          default: return "Buy Mandate";
                        }
                      })(),
                      onPurchase: handleProcurementMandate,
                      disabled:
                        game.actionsRemaining < 2 ||
                        !canAffordMandate(currentPlayer, game.tiles),
                    }
                  : undefined
              }
              onProcurementGenerate={
                procurementChoosing ? handleProcurementGenerate : undefined
              }
              onProcurementCancel={
                procurementChoosing
                  ? () => {
                      setProcurementChoosing(false);
                      setProcurementSource(null);
                    }
                  : undefined
              }
              auctionUI={auctionUI}
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
                Place your <strong>{getCharterBuilding(currentPlayer.type)}</strong>. Charter ignores the rule that buildings cannot be placed adjacent to Fog; any adjacent Fog tiles will be revealed when you place.
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
            {placementMode === "conservation" && (
              <p className="placement-hint">
                Click a Forest hex to place Conservation (blocks conversion &amp; zoning; only Reserve may be placed)
              </p>
            )}
          </section>
          </div>

          <section className="markets-section">
            {selectedMarketSlot && (() => {
              const card =
                selectedMarketSlot.row === "politics"
                  ? game.politics[selectedMarketSlot.slotIndex]
                  : game.conference[selectedMarketSlot.slotIndex];
              const info = card ? CARD_INFO[card] : null;
              const canStartBid =
                selectedMarketSlot.row === "conference" &&
                card &&
                !auction &&
                !procurementChoosing &&
                game.actionsRemaining > 0 &&
                currentPlayer.hand.some((c) =>
                  PERSONNEL_CARDS.includes(c as PersonnelCard)
                ) &&
                currentPlayer.resources.coins >= 1;
              const generatedEvents: string[] =
                selectedMarketSlot.row === "conference" && card && PERSONNEL_CARDS.includes(card as PersonnelCard)
                  ? (() => {
                      const single = PERSONNEL_TO_EVENT[card as PersonnelCard];
                      if (single) return [single];
                      if (card === "Broker") return [...BROKER_EVENT_OPTIONS];
                      if (card === "Forester") return [...FORESTER_EVENT_OPTIONS];
                      if (card === "Elder") return [...ELDER_EVENT_OPTIONS];
                      return [];
                    })()
                  : [];
              return (
                <div className="market-card-detail" style={{ gridColumn: "1 / -1" }}>
                  {info ? (
                    <>
                      <div className="market-card-detail__header">
                        <span className="market-card-detail__title">
                          {info.icon} {info.title}
                        </span>
                        <button
                          type="button"
                          className="market-card-detail__close"
                          onClick={() => setSelectedMarketSlot(null)}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="market-card-detail__description">
                        {info.description}
                      </p>
                      {generatedEvents.length > 0 && (
                        <div className="market-card-detail__generates">
                          <span className="market-card-detail__generates-label">
                            {generatedEvents.length === 1 ||
                            new Set(generatedEvents).size === 1
                              ? "Adds to hand:"
                              : "Adds one to hand (your choice):"}
                          </span>
                          {generatedEvents.map((eventId) => {
                            const eventInfo = CARD_INFO[eventId];
                            return eventInfo ? (
                              <div key={eventId} className="market-card-detail__event">
                                <span className="market-card-detail__event-title">
                                  {eventInfo.icon} {eventInfo.title}
                                </span>
                                <p className="market-card-detail__event-description">
                                  {eventInfo.description}
                                </p>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                      {canStartBid && (
                        <button
                          type="button"
                          className="market-card-detail__action"
                          onClick={() => {
                            handleConferenceCardClick(selectedMarketSlot.slotIndex);
                            setSelectedMarketSlot(null);
                          }}
                        >
                          Start bid
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedMarketSlot(null)}
                    >
                      Close
                    </button>
                  )}
                </div>
              );
            })()}
            <ConferenceRow
              slots={game.conference}
              onCardClick={(slotIndex) => setSelectedMarketSlot({ row: "conference", slotIndex })}
              highlightSlot={
                auction ? auction.conferenceSlot : selectedMarketSlot?.row === "conference" ? selectedMarketSlot.slotIndex : undefined
              }
            />
            <PoliticsRow
              slots={game.politics}
              voteCosts={POLITICS_VOTE_COSTS}
              coinCosts={POLITICS_COSTS}
              onCardClick={(slotIndex: number) => setSelectedMarketSlot({ row: "politics", slotIndex })}
              selectedSlot={selectedMarketSlot?.row === "politics" ? selectedMarketSlot.slotIndex : undefined}
            />
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
