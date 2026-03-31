import React, { useMemo } from 'react';
import type { Tile, PendingAction, PlayerType } from '../game/types';
import { HexTile, HexClipDef, HEX_SIZE } from './HexTile';
import { hexToPixel, hexFromKey, hexKey } from '../utils/hexGrid';
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

interface HexMapProps {
  tiles: Record<string, Tile>;
  pendingAction: PendingAction | null;
  playerType: PlayerType;
  landClaimsActive: boolean;
  onHexClick: (hexKey: string) => void;
  selectedHex?: string | null;
}

const PADDING = 20;

function computeValidHexes(
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
        if (canPlaceCharter(tiles, hexFromKey(k), playerType, building)) valid.add(k);
      }
      break;
    }
    case 'builder_build_hex': {
      const bt = pendingAction.buildingType;
      for (const k of allKeys) {
        if (canPlaceBuild(tiles, hexFromKey(k), playerType, bt, landClaimsActive)) valid.add(k);
      }
      break;
    }
    case 'builder_build_type': {
      // Show all valid hexes for any of the allowed building types
      const allowed = getAllowedBuildTypes(tiles, playerType);
      for (const k of allKeys) {
        for (const bt of allowed) {
          if (canPlaceBuild(tiles, hexFromKey(k), playerType, bt, landClaimsActive)) {
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
        if (canPlaceReserve(tiles, hexFromKey(k))) valid.add(k);
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
        if (canPlaceConservation(tiles, hexFromKey(k))) valid.add(k);
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
        const adj = hexFromKey(k);
        const nbKeys = [
          { q: adj.q + 1, r: adj.r },
          { q: adj.q + 1, r: adj.r - 1 },
          { q: adj.q, r: adj.r - 1 },
          { q: adj.q - 1, r: adj.r },
          { q: adj.q - 1, r: adj.r + 1 },
          { q: adj.q, r: adj.r + 1 },
        ];
        if (nbKeys.some(nb => tiles[hexKey(nb)]?.buildingOwner === playerType)) {
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
        if (canPlaceAirstrip(tiles, hexFromKey(k))) valid.add(k);
      }
      break;
    }
    case 'event_fisheries_hex': {
      for (const k of allKeys) {
        if (canPlaceFisheries(tiles, hexFromKey(k), playerType)) valid.add(k);
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

export const HexMap: React.FC<HexMapProps> = ({
  tiles,
  pendingAction,
  playerType,
  landClaimsActive,
  onHexClick,
  selectedHex,
}) => {
  const tileEntries = Object.entries(tiles);

  const { minX, minY, maxX, maxY } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [k] of tileEntries) {
      const p = hexToPixel(hexFromKey(k), HEX_SIZE, { x: 0, y: 0 });
      const hw = HEX_SIZE * Math.sqrt(3) / 2;
      const hh = HEX_SIZE;
      minX = Math.min(minX, p.x - hw);
      minY = Math.min(minY, p.y - hh);
      maxX = Math.max(maxX, p.x + hw);
      maxY = Math.max(maxY, p.y + hh);
    }
    return { minX, minY, maxX, maxY };
  }, [tileEntries]);

  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;
  const origin = { x: -minX + PADDING, y: -minY + PADDING };

  const validHexes = useMemo(
    () => computeValidHexes(tiles, pendingAction, playerType, landClaimsActive),
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
          {tileEntries.map(([k, tile]) => (
            <HexClipDef key={k} hex={tile.hex} origin={origin} />
          ))}
        </defs>
        {tileEntries.map(([k, tile]) => (
          <HexTile
            key={k}
            hex={tile.hex}
            tile={tile}
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
