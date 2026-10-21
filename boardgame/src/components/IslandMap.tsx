import React, { useMemo } from 'react';
import type { Tile, PendingAction, PlayerType } from '../game/types';
import { CellTile, CellClipDef, CELL_SCALE } from './CellTile';
import { generateCellMap, makeRng } from '../utils/cellMap';
import {
  canPlaceCharter,
  getCharterBuilding,
  canPlaceBuild,
  canPlaceReserve,
  canPlaceConservation,
  canPlaceAirstrip,
  canPlaceFisheries,
  getAllowedBuildTypes,
} from '../game/gameRules';

interface IslandMapProps {
  tiles: Record<string, Tile>;
  mapSeed: number;
  mapRadius: number;
  pendingAction: PendingAction | null;
  playerType: PlayerType;
  landClaimsActive: boolean;
  onHexClick: (hexKey: string) => void;
  selectedHex?: string | null;
}

const PADDING = 20;

function computeValidCells(
  tiles: Record<string, Tile>,
  pendingAction: PendingAction | null,
  playerType: PlayerType,
  landClaimsActive: boolean
): Set<string> {
  const valid = new Set<string>();
  if (!pendingAction) return valid;

  const allKeys = Object.keys(tiles);

  switch (pendingAction.type) {
    case 'charter_place': {
      const building = getCharterBuilding(playerType);
      for (const k of allKeys) {
        if (canPlaceCharter(tiles, k, playerType, building)) valid.add(k);
      }
      break;
    }
    case 'builder_build_hex': {
      const bt = pendingAction.buildingType;
      for (const k of allKeys) {
        if (canPlaceBuild(tiles, k, playerType, bt, landClaimsActive)) valid.add(k);
      }
      break;
    }
    case 'builder_build_type': {
      // Show all valid cells for any of the allowed building types
      const allowed = getAllowedBuildTypes(tiles, playerType);
      for (const k of allKeys) {
        for (const bt of allowed) {
          if (canPlaceBuild(tiles, k, playerType, bt, landClaimsActive)) {
            valid.add(k);
            break;
          }
        }
      }
      break;
    }
    case 'elder_village_hex': {
      for (const k of allKeys) {
        if (tiles[k].type === 'Fog') valid.add(k);
      }
      break;
    }
    case 'elder_reserve_hex': {
      for (const k of allKeys) {
        if (canPlaceReserve(tiles, k)) valid.add(k);
      }
      break;
    }
    case 'guide_reveal_hex': {
      for (const k of allKeys) {
        if (tiles[k].type !== 'Fog') valid.add(k);
      }
      break;
    }
    case 'event_conservation_hex': {
      for (const k of allKeys) {
        if (canPlaceConservation(tiles, k)) valid.add(k);
      }
      break;
    }
    case 'event_logging_hex': {
      for (const k of allKeys) {
        const t = tiles[k];
        if (t.type === 'Forest' && !t.hasConservation) valid.add(k);
      }
      break;
    }
    case 'event_forestry_hex': {
      for (const k of allKeys) {
        const t = tiles[k];
        if (t.type === 'Field' && !t.building) valid.add(k);
      }
      break;
    }
    case 'event_zoning_hex': {
      for (const k of allKeys) {
        const t = tiles[k];
        if (!['Field', 'Sand'].includes(t.type) || t.zoningOwner) continue;
        // Adjacent to player building
        if (t.neighbors.some(nb => tiles[nb]?.buildingOwner === playerType)) {
          valid.add(k);
        }
      }
      break;
    }
    case 'event_taxation_hex': {
      for (const k of allKeys) {
        const t = tiles[k];
        if (t.building === 'Reserve' && t.buildingOwner === playerType) valid.add(k);
      }
      break;
    }
    case 'event_airstrip_hex': {
      for (const k of allKeys) {
        if (canPlaceAirstrip(tiles, k)) valid.add(k);
      }
      break;
    }
    case 'event_fisheries_hex': {
      for (const k of allKeys) {
        if (canPlaceFisheries(tiles, k, playerType)) valid.add(k);
      }
      break;
    }
    case 'event_urbanplanning_hex': {
      const productionBuildings = ['Resort', 'IndustrialZone', 'Infrastructure', 'Village'];
      for (const k of allKeys) {
        const t = tiles[k];
        if (t.buildingOwner === playerType && productionBuildings.includes(t.building ?? '')) {
          valid.add(k);
        }
      }
      break;
    }
    default:
      break;
  }
  return valid;
}

export const IslandMap: React.FC<IslandMapProps> = ({
  tiles,
  mapSeed,
  mapRadius,
  pendingAction,
  playerType,
  landClaimsActive,
  onHexClick,
  selectedHex,
}) => {
  const tileEntries = Object.entries(tiles);
  // Same call as generateIsland, so ids and shapes match the server's map.
  const cells = useMemo(
    () => generateCellMap({ mapRadius, rng: makeRng(mapSeed) }),
    [mapSeed, mapRadius]
  );

  const { minX, minY, maxX, maxY } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cell of Object.values(cells)) {
      for (const c of cell.corners) {
        minX = Math.min(minX, c.x * CELL_SCALE);
        minY = Math.min(minY, c.y * CELL_SCALE);
        maxX = Math.max(maxX, c.x * CELL_SCALE);
        maxY = Math.max(maxY, c.y * CELL_SCALE);
      }
    }
    return { minX, minY, maxX, maxY };
  }, [cells]);

  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;
  const origin = { x: -minX + PADDING, y: -minY + PADDING };

  const validHexes = useMemo(
    () => computeValidCells(tiles, pendingAction, playerType, landClaimsActive),
    [tiles, pendingAction, playerType, landClaimsActive]
  );

  return (
    <div className="hex-map-container">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
      >
        <defs>
          {tileEntries.map(([k]) => (
            <CellClipDef key={k} cell={cells[k]} origin={origin} />
          ))}
        </defs>
        {tileEntries.map(([k, tile]) => (
          <CellTile
            key={k}
            tile={tile}
            cell={cells[k]}
            origin={origin}
            isHighlighted={validHexes.has(k)}
            isSelected={selectedHex === k}
            onClick={() => onHexClick(k)}
          />
        ))}
      </svg>
    </div>
  );
};
