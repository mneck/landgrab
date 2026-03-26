import React from 'react';
import type { Tile, PlayerType } from '../game/types';
import type { HexCoord } from '../utils/hexGrid';
import { hexToPixel, hexCornerPoints } from '../utils/hexGrid';
import { HEX_ASSETS, BUILDING_ASSETS, TILE_COLORS, TILE_OUTLINE_COLORS } from '../constants/assets';
import { PLAYER_COLORS } from '../data/cardRules';

const HEX_SIZE = 44;

interface HexTileProps {
  hex: HexCoord;
  tile: Tile;
  origin: { x: number; y: number };
  isHighlighted: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export const HexTile: React.FC<HexTileProps> = ({
  hex,
  tile,
  origin,
  isHighlighted,
  isSelected,
  onClick,
}) => {
  const center = hexToPixel(hex, HEX_SIZE, origin);
  const points = hexCornerPoints(hex, HEX_SIZE, origin);

  const imgSrc = HEX_ASSETS[tile.type];
  const buildingImgSrc = tile.building ? BUILDING_ASSETS[tile.building] : undefined;
  const ownerColor = tile.buildingOwner ? PLAYER_COLORS[tile.buildingOwner] : undefined;
  const fillColor = TILE_COLORS[tile.type] ?? '#888';
  const strokeColor = isSelected
    ? '#ffff00'
    : isHighlighted
    ? '#00ff88'
    : TILE_OUTLINE_COLORS[tile.type] ?? '#555';

  const strokeWidth = isSelected ? 3 : isHighlighted ? 2.5 : 1;

  return (
    <g
      onClick={onClick}
      style={{ cursor: isHighlighted || tile.type !== 'Fog' ? 'pointer' : 'default' }}
    >
      {/* Base polygon */}
      <polygon
        points={points}
        fill={imgSrc ? 'transparent' : fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />

      {/* Terrain image via foreignObject clip */}
      {imgSrc && (
        <image
          href={imgSrc}
          x={center.x - HEX_SIZE * 1.05}
          y={center.y - HEX_SIZE * 1.05}
          width={HEX_SIZE * 2.1}
          height={HEX_SIZE * 2.1}
          clipPath={`url(#hex-clip-${hex.q}-${hex.r})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Building overlay */}
      {buildingImgSrc && (
        <image
          href={buildingImgSrc}
          x={center.x - HEX_SIZE * 0.55}
          y={center.y - HEX_SIZE * 0.55}
          width={HEX_SIZE * 1.1}
          height={HEX_SIZE * 1.1}
          opacity={0.95}
        />
      )}

      {/* Building without image: colored circle */}
      {tile.building && !buildingImgSrc && (
        <circle
          cx={center.x}
          cy={center.y}
          r={HEX_SIZE * 0.35}
          fill={ownerColor ?? '#888'}
          stroke="#fff"
          strokeWidth={1.5}
          opacity={0.85}
        />
      )}

      {/* Owner color ring */}
      {tile.building && ownerColor && (
        <circle
          cx={center.x}
          cy={center.y}
          r={HEX_SIZE * 0.42}
          fill="none"
          stroke={ownerColor}
          strokeWidth={2.5}
          opacity={0.7}
        />
      )}

      {/* Zoning marker */}
      {tile.zoningOwner && (
        <text
          x={center.x + HEX_SIZE * 0.42}
          y={center.y - HEX_SIZE * 0.3}
          fontSize={12}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          Z
        </text>
      )}

      {/* Conservation marker */}
      {tile.hasConservation && (
        <text
          x={center.x - HEX_SIZE * 0.42}
          y={center.y - HEX_SIZE * 0.3}
          fontSize={13}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          🌿
        </text>
      )}

      {/* Urban planning double ring */}
      {tile.hasUrbanPlanning && (
        <circle
          cx={center.x}
          cy={center.y}
          r={HEX_SIZE * 0.48}
          fill="none"
          stroke="#ffd700"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.8}
        />
      )}

      {/* Highlight overlay */}
      {isHighlighted && (
        <polygon
          points={points}
          fill="rgba(0,255,136,0.18)"
          stroke="#00ff88"
          strokeWidth={2.5}
        />
      )}
      {isSelected && (
        <polygon
          points={points}
          fill="rgba(255,255,0,0.2)"
          stroke="#ffff00"
          strokeWidth={3}
        />
      )}

      {/* Building label (fallback text) */}
      {tile.building && !buildingImgSrc && (
        <text
          x={center.x}
          y={center.y}
          fontSize={9}
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
        >
          {tile.building.slice(0, 3).toUpperCase()}
        </text>
      )}
    </g>
  );
};

// Clip path defs for hex tiles (rendered once in HexMap)
export const HexClipDef: React.FC<{ hex: HexCoord; origin: { x: number; y: number } }> = ({ hex, origin }) => {
  const points = hexCornerPoints(hex, HEX_SIZE - 0.5, origin);
  return (
    <clipPath id={`hex-clip-${hex.q}-${hex.r}`}>
      <polygon points={points} />
    </clipPath>
  );
};

export { HEX_SIZE };
