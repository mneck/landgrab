import { useState, useCallback } from "react";
import { HexMap } from "./components/HexMap";
import { PlayerPanel } from "./components/PlayerPanel";
import { GameActions } from "./components/GameActions";
import type {
  GameState,
  BuildingType,
  CardType,
  PersonnelCard,
  EventCard,
} from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import { createInitialGameState } from "./types/game";
import { hexDistance, hexKey, hexNeighbors } from "./utils/hexGrid";
import type { TileType } from "./types/game";

const REVEALED_TERRAIN_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand", "Water"];

function pickRevealedTileType(hex: HexCoord): TileType {
  const idx = (hex.q * 7 + hex.r * 13) % REVEALED_TERRAIN_TYPES.length;
  return REVEALED_TERRAIN_TYPES[Math.abs(idx)];
}

import "./App.css";

type PlacementMode = "charter" | null;

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

  switch (building) {
    case "Village":
      return ["Fog", "Field", "Sand", "Forest", "Mountain"].includes(tile.type);
    case "Resort":
    case "IndustrialZone":
    case "Infrastructure":
      return ["Field", "Sand"].includes(tile.type);
    default:
      return false;
  }
}

/** Personnel cards add an event card to hand and go to discard */
const PERSONNEL_TO_EVENT: Record<PersonnelCard, EventCard | null> = {
  Builder: "Build",
  Elder: "Reserve",
  Liaison: "Procurement",
  Cartographer: "Expedition",
};

const PERSONNEL_CARDS: PersonnelCard[] = [
  "Builder",
  "Elder",
  "Liaison",
  "Cartographer",
];

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function App() {
  const [game, setGame] = useState<GameState>(() =>
    createInitialGameState(["Hotelier", "Industrialist"])
  );
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);

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
        actionsRemaining: g.actionsRemaining - 1,
      }));
      setPlacementMode(null);
      setSelectedHex(null);
      return;
    }
    setSelectedHex(hex);
  }

  const consumeAction = useCallback(
    (updater: (g: GameState) => GameState) => {
      setGame((g) => ({
        ...updater(g),
        actionsRemaining: g.actionsRemaining - 1,
      }));
    },
    []
  );

  function handlePlayCharter() {
    if (!currentPlayer.hand.includes("Charter") || game.actionsRemaining < 1)
      return;
    setPlacementMode("charter");
  }

  function handlePlayPersonnel(card: PersonnelCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;
    const eventCard = PERSONNEL_TO_EVENT[card];
    if (!eventCard) return;

    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? {
              ...p,
              hand: [...p.hand.filter((c) => c !== card), eventCard],
              discardPile: [...p.discardPile, card],
            }
          : p
      ),
    }));
  }

  function handlePlayEventCard(card: EventCard) {
    if (!currentPlayer.hand.includes(card) || game.actionsRemaining < 1) return;
    // Event cards are trashed (removed from game)
    consumeAction((g) => ({
      ...g,
      players: g.players.map((p, i) =>
        i === g.currentPlayerIndex
          ? { ...p, hand: p.hand.filter((c) => c !== card) }
          : p
      ),
    }));
  }

  function buildPlayableCards() {
    if (game.actionsRemaining < 1) return [];
    const result: { card: CardType; onPlay: () => void }[] = [];
    for (const card of currentPlayer.hand) {
      if (card === "Charter") {
        result.push({ card, onPlay: handlePlayCharter });
      } else if (PERSONNEL_CARDS.includes(card as PersonnelCard)) {
        result.push({
          card,
          onPlay: () => handlePlayPersonnel(card as PersonnelCard),
        });
      } else {
        // Event cards: Build, Procurement, Expedition, Reserve
        result.push({
          card,
          onPlay: () => handlePlayEventCard(card as EventCard),
        });
      }
    }
    return result;
  }

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
  }

  return (
    <div className="game-container">
      <header className="game-header">
        <h1>Landgrab</h1>
        <p className="subtitle">Strategy prototype</p>
      </header>

      <main className="game-main">
        <aside className="players-sidebar">
          {game.players.map((player, i) => (
            <PlayerPanel
              key={player.type}
              player={player}
              isCurrent={i === game.currentPlayerIndex}
            />
          ))}
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
        </section>

        <aside className="actions-sidebar">
          <GameActions
            actionsRemaining={game.actionsRemaining}
            placementMode={placementMode === "charter"}
            playableCards={buildPlayableCards()}
            canDraw={
              game.actionsRemaining > 0 &&
              (currentPlayer.drawPile.length > 0 ||
                currentPlayer.discardPile.length > 0)
            }
            onDraw={handleDraw}
            onCancelPlacement={
              placementMode === "charter"
                ? () => {
                    setPlacementMode(null);
                    setSelectedHex(null);
                  }
                : undefined
            }
            onEndTurn={handleEndTurn}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
