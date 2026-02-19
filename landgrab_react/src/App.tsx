import { useState, useCallback } from "react";
import { HexMap } from "./components/HexMap";
import { PlayerPanel } from "./components/PlayerPanel";
import { GameActions } from "./components/GameActions";
import { ConferenceRow } from "./components/ConferenceRow";
import { PoliticsRow } from "./components/PoliticsRow";
import { ResourceMarket } from "./components/ResourceMarket";
import { CARD_INFO } from "./data/cardData";
import type {
  GameState,
  BuildingType,
  CardType,
  PersonnelCard,
  EventCard,
} from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import {
  createInitialGameState,
  decrementActionsRemaining,
} from "./types/game";
import { hexDistance, hexKey, hexNeighbors } from "./utils/hexGrid";
import type { TileType } from "./types/game";

const REVEALED_TERRAIN_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand", "Water"];

function pickRevealedTileType(hex: HexCoord): TileType {
  const idx = (hex.q * 7 + hex.r * 13) % REVEALED_TERRAIN_TYPES.length;
  return REVEALED_TERRAIN_TYPES[Math.abs(idx)];
}

import "./App.css";

type PlacementMode =
  | "charter"
  | "expedition"
  | "contact"
  | "reserve"
  | "build"
  | null;

function getCharterBuilding(playerType: string): BuildingType {
  switch (playerType) {
    case "Hotelier":
      return "Resort";
    case "Industrialist":
      return "IndustrialZone";
    case "Bureaucrat":
      return "Infrastructure";
    case "Chieftain":
      return "Village";
    default:
      return "Village";
  }
}

function canPlaceCharter(
  tiles: GameState["tiles"],
  hex: HexCoord,
  _playerType: string,
  building: BuildingType
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile) return false;

  // No building on or adjacent to Fog (Charter/Build); Village on Fog is Contact-only
  if (tile.type === "Fog") return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }

  switch (building) {
    case "Village":
      return ["Field", "Sand", "Forest", "Mountain"].includes(tile.type);
    case "Resort":
    case "IndustrialZone":
    case "Infrastructure":
      return ["Field", "Sand"].includes(tile.type);
    default:
      return false;
  }
}

function hasAdjacent(
  tiles: GameState["tiles"],
  hex: HexCoord,
  buildingTypes: BuildingType[]
): boolean {
  for (const neighbor of hexNeighbors(hex)) {
    const t = tiles[hexKey(neighbor)];
    if (t?.building && buildingTypes.includes(t.building)) return true;
  }
  return false;
}

const BUILD_ADJACENCY: Record<string, BuildingType[]> = {
  Industrialist: ["Farm", "IndustrialZone", "Infrastructure"],
  Hotelier: ["Resort", "Housing", "Infrastructure"],
  Bureaucrat: ["Village", "Farm", "Housing", "IndustrialZone", "Resort", "CivicOffice"],
};

const BUILD_OPTIONS: Record<string, BuildingType[]> = {
  Industrialist: ["Farm", "IndustrialZone"],
  Hotelier: ["Housing", "Resort"],
  Bureaucrat: ["CivicOffice", "Infrastructure"],
};

function canPlaceBuild(
  tiles: GameState["tiles"],
  hex: HexCoord,
  playerType: string,
  _building: BuildingType
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand"].includes(tile.type)) return false;

  const adj = BUILD_ADJACENCY[playerType];
  if (!adj || !hasAdjacent(tiles, hex, adj)) return false;

  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }
  return true;
}

function canPlaceReserve(
  tiles: GameState["tiles"],
  hex: HexCoord
): boolean {
  const key = hexKey(hex);
  const tile = tiles[key];
  if (!tile || tile.building) return false;
  if (!["Field", "Sand", "Forest", "Mountain"].includes(tile.type)) return false;
  for (const neighbor of hexNeighbors(hex)) {
    const nt = tiles[hexKey(neighbor)];
    if (nt?.type === "Fog") return false;
  }
  return hasAdjacent(tiles, hex, ["Village", "Reserve"]);
}

function countReserves(tiles: GameState["tiles"], playerType: string): number {
  return Object.values(tiles).filter(
    (t) => t.building === "Reserve" && t.buildingOwner === playerType
  ).length;
}

/** Personnel cards add an event card to hand and go to discard */
const PERSONNEL_TO_EVENT: Record<PersonnelCard, EventCard | null> = {
  Builder: "Build",
  Elder: null, // Elder adds Contact OR Reserve (player chooses)
  Liaison: "Procurement",
  Explorer: "Expedition",
};

/** Elder choice: add Contact (convert Fog + Village) or Reserve */
const ELDER_EVENT_OPTIONS: EventCard[] = ["Contact", "Reserve"];

const PERSONNEL_CARDS: PersonnelCard[] = [
  "Builder",
  "Elder",
  "Liaison",
  "Explorer",
];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function runProcurement(g: GameState, playerType: string): GameState {
  const tiles = g.tiles;
  const res = { ...g.players[g.currentPlayerIndex].resources };

  if (playerType === "Hotelier") {
    for (const t of Object.values(tiles)) {
      if (t.building === "Resort" && t.buildingOwner === "Hotelier") {
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (nt && ["Forest", "Water", "Mountain"].includes(nt.type))
            res.coins += 1;
        }
      }
    }
  } else if (playerType === "Industrialist") {
    for (const t of Object.values(tiles)) {
      if (t.building === "IndustrialZone" && t.buildingOwner === "Industrialist") {
        for (const nb of hexNeighbors(t.hex)) {
          const nt = tiles[hexKey(nb)];
          if (nt?.type === "Forest") res.wood += 1;
          if (nt?.type === "Mountain") res.ore += 1;
        }
      }
    }
  } else if (playerType === "Bureaucrat") {
    const countedHexes = new Set<string>();
    for (const t of Object.values(tiles)) {
      if (t.building === "Infrastructure" && t.buildingOwner === "Bureaucrat") {
        for (const nb of hexNeighbors(t.hex)) {
          const k = hexKey(nb);
          const nt = tiles[k];
          if (
            nt?.building &&
            ["Resort", "Village", "IndustrialZone", "Farm", "Housing"].includes(
              nt.building
            ) &&
            !countedHexes.has(k)
          ) {
            countedHexes.add(k);
            res.votes += 1;
          }
        }
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
        if (!adjOtherBuilding) res.coins += 1;
      }
    }
  }

  return {
    ...g,
    players: g.players.map((p, i) =>
      i === g.currentPlayerIndex ? { ...p, resources: res } : p
    ),
  };
}

function App() {
  const [game, setGame] = useState<GameState>(() =>
    createInitialGameState(["Hotelier", "Industrialist"])
  );
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [pendingEventCard, setPendingEventCard] = useState<EventCard | null>(null);
  const [buildBuildingChoice, setBuildBuildingChoice] = useState<
    BuildingType | null
  >(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const currentPlayer = game.players[game.currentPlayerIndex];

  function handleHexClick(hex: HexCoord) {
    if (placementMode === "charter") {
      const building = getCharterBuilding(currentPlayer.type);
      if (!canPlaceCharter(game.tiles, hex, currentPlayer.type, building)) return;

      const key = hexKey(hex);
      const tile = game.tiles[key];
      if (tile?.building) return;

      // Reveal adjacent Fog hexes per Charter rules
      const newTiles = { ...game.tiles };
      const center = { q: 0, r: 0 };
      for (const neighbor of hexNeighbors(hex)) {
        const nk = hexKey(neighbor);
        const nt = newTiles[nk];
        if (nt?.type === "Fog") {
          const isOuterFogRing = hexDistance(neighbor, center) === game.fogRadius;
          newTiles[nk] = {
            ...nt,
            type: isOuterFogRing ? "Field" : pickRevealedTileType(neighbor),
          };
        }
      }
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

      const center = { q: 0, r: 0 };
      const newTiles = { ...game.tiles };
      for (const neighbor of hexNeighbors(hex)) {
        const nk = hexKey(neighbor);
        const nt = newTiles[nk];
        if (nt?.type === "Fog") {
          const isOuterFogRing = hexDistance(neighbor, center) === game.fogRadius;
          newTiles[nk] = {
            ...nt,
            type: isOuterFogRing ? "Field" : pickRevealedTileType(neighbor),
          };
        }
      }

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

      const center = { q: 0, r: 0 };
      const isOuterFogRing = hexDistance(hex, center) === game.fogRadius;
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
        !canPlaceBuild(game.tiles, hex, currentPlayer.type, buildBuildingChoice)
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

  function handlePlayPersonnel(card: PersonnelCard, eventCard?: EventCard) {
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

  function handlePlayEventCard(card: EventCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;
    if (card === "Charter") return; // Charter has its own handler

    if (card === "Procurement") {
      consumeAction((g) =>
        runProcurement(
          {
            ...g,
            players: g.players.map((p, i) =>
              i === g.currentPlayerIndex
                ? { ...p, hand: p.hand.filter((c) => c !== card) }
                : p
            ),
          },
          currentPlayer.type
        )
      );
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
    setGame((g) => ({
      ...g,
      currentPlayerIndex: (g.currentPlayerIndex + 1) % g.players.length,
      actionsRemaining: 2,
    }));
    setPlacementMode(null);
    setSelectedHex(null);
    setSelectedCard(null);
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
