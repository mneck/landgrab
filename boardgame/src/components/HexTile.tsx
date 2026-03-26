import type { Tile, PlayerType } from '../game/types';
import type { HexCoord } from '../utils/hexGrid';
import { hexToPixel, hexCornerPoints } from '../utils/hexGrid';
import { HEX_ASSETS, BUILDING_ASSETS } from '../constants/assets';
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
  const clipId = `hex-clip-${hex.q}-${hex.r}`;

  const terrainSrc = HEX_ASSETS[tile.type] ?? HEX_ASSETS.Fog;
  const buildingSrc = tile.building ? BUILDING_ASSETS[tile.building] : undefined;
  const ownerColor = tile.buildingOwner ? PLAYER_COLORS[tile.buildingOwner] : undefined;

  const stroke = isSelected
    ? '#facc15'
    : isHighlighted
    ? '#f59e0b'
    : '#374151';
  const strokeWidth = isSelected ? 3 : isHighlighted ? 2.5 : 1;

  const hexWidth = HEX_SIZE * 2;
  const hexHeight = HEX_SIZE * Math.sqrt(3);

  return (
    <g
      className="hex-tile"
      onClick={onClick}
      style={{ cursor: isHighlighted || tile.type !== 'Fog' ? 'pointer' : 'default' }}
    >
      {/* Terrain image clipped to hex */}
      <g clipPath={`url(#${clipId})`}>
        <image
          href={terrainSrc}
          x={center.x - hexWidth}
          y={center.y - hexHeight}
          width={hexWidth * 2}
          height={hexHeight * 2}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      {/* Hex outline */}
      <polygon
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* Highlight overlay */}
      {isHighlighted && !isSelected && (
        <polygon
          points={points}
          fill="rgba(245,158,11,0.15)"
          stroke="#f59e0b"
          strokeWidth={2.5}
        />
      )}
      {isSelected && (
        <polygon
          points={points}
          fill="rgba(250,204,21,0.2)"
          stroke="#facc15"
          strokeWidth={3}
        />
      )}

      {/* Building disc overlay */}
      {buildingSrc && (() => {
        const buildingSize = HEX_SIZE * 1.4;
        return (
          <image
            href={buildingSrc}
            x={center.x - buildingSize / 2}
            y={center.y - buildingSize / 2}
            width={buildingSize}
            height={buildingSize}
            preserveAspectRatio="xMidYMid meet"
          />
        );
      })()}

      {/* Building without image: colored circle + label */}
      {tile.building && !buildingSrc && (
        <>
          <circle
            cx={center.x}
            cy={center.y}
            r={HEX_SIZE * 0.35}
            fill={ownerColor ?? '#888'}
            stroke="#fff"
            strokeWidth={1.5}
            opacity={0.85}
          />
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
        </>
      )}

      {/* Owner ring */}
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

      {/* Urban planning ring */}
      {tile.hasUrbanPlanning && (
        <circle
          cx={center.x}
          cy={center.y}
          r={HEX_SIZE * 0.48}
          fill="none"
          stroke="#facc15"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.8}
        />
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
