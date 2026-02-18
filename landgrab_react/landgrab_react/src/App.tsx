import { useState } from "react";
import { HexMap } from "./components/HexMap";
import { PlayerPanel } from "./components/PlayerPanel";
import { GameActions } from "./components/GameActions";
import type { GameState, BuildingType } from "./types/game";
import type { HexCoord } from "./utils/hexGrid";
import { createInitialGameState } from "./types/game";
import { hexKey, hexNeighbors } from "./utils/hexGrid";
import type { TileType } from "./types/game";

const COASTLINE_TYPES: TileType[] = ["Field", "Mountain", "Forest", "Sand"];

function pickRevealedTileType(hex: HexCoord): TileType {
  const idx = (hex.q * 7 + hex.r * 13) % COASTLINE_TYPES.length;
  return COASTLINE_TYPES[Math.abs(idx)];
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
      for (const neighbor of hexNeighbors(hex)) {
        const nk = hexKey(neighbor);
        const nt = newTiles[nk];
        if (nt?.type === "Fog") {
          newTiles[nk] = {
            ...nt,
            type: pickRevealedTileType(neighbor),
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

  function handlePlayCharter() {
    if (!currentPlayer.hand.includes("Charter") || game.actionsRemaining < 1)
      return;
    setPlacementMode("charter");
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
            onCancelPlacement={
              placementMode === "charter"
                ? () => {
                    setPlacementMode(null);
                    setSelectedHex(null);
                  }
                : undefined
            }
            onPlayCharter={
              currentPlayer.hand.includes("Charter") && game.actionsRemaining > 0
                ? handlePlayCharter
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
