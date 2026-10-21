import type { Tile } from '../game/types';
import type { MapCell, Point } from '../utils/cellMap';
import { polygonArea } from '../utils/cellMap';
import { HEX_ASSETS, BUILDING_ASSETS } from '../constants/assets';
import { PLAYER_COLORS } from '../data/cardRules';

/** Pixels per lattice unit (distance between neighboring cell centers). */
export const CELL_SCALE = 76;

/** Circumradius of a regular hex with unit center spacing; area √3/2. */
const UNIT_HEX_AREA = Math.sqrt(3) / 2;
const UNIT_HEX_SIZE = CELL_SCALE / Math.sqrt(3);

/**
 * The terrain PNGs are a pointy-top hex in the middle of a square image whose
 * textured interior spans ~28% of the image width as an inscribed radius.
 * Sizing the image to (cell circumradius / 0.28) keeps the texture covering
 * the whole polygon without showing the art's own hex border.
 */
const TEXTURE_INNER_RADIUS = 0.28;

function toPixel(p: Point, origin: Point): Point {
  return { x: p.x * CELL_SCALE + origin.x, y: p.y * CELL_SCALE + origin.y };
}

function pointsAttr(pts: Point[]): string {
  return pts.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
}

interface CellTileProps {
  tile: Tile;
  /** Geometry rebuilt from the map seed; game state holds only topology. */
  cell: MapCell;
  origin: Point;
  isHighlighted: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export const CellTile: React.FC<CellTileProps> = ({
  tile,
  cell,
  origin,
  isHighlighted,
  isSelected,
  onClick,
}) => {
  const center = toPixel(cell.center, origin);
  const corners = cell.corners.map((c) => toPixel(c, origin));
  const points = pointsAttr(corners);
  const clipId = `cell-clip-${tile.id}`;

  // Size of the regular hex with this cell's area; scales markers so small
  // cells don't spill their building disc into neighbors.
  const size = UNIT_HEX_SIZE * Math.sqrt(polygonArea(cell.corners) / UNIT_HEX_AREA);
  const circumradius = Math.max(...corners.map((c) => Math.hypot(c.x - center.x, c.y - center.y)));
  const textureSize = circumradius / TEXTURE_INNER_RADIUS;

  const terrainSrc = HEX_ASSETS[tile.type] ?? HEX_ASSETS.Fog;
  const buildingSrc = tile.building ? BUILDING_ASSETS[tile.building] : undefined;
  const ownerColor = tile.buildingOwner ? PLAYER_COLORS[tile.buildingOwner] : undefined;

  const stroke = isSelected
    ? '#facc15'
    : isHighlighted
    ? '#f59e0b'
    : '#374151';
  const strokeWidth = isSelected ? 3 : isHighlighted ? 2.5 : 1;

  return (
    <g
      className="hex-tile"
      onClick={onClick}
      style={{ cursor: isHighlighted || tile.type !== 'Fog' ? 'pointer' : 'default' }}
    >
      {/* Terrain image clipped to the cell polygon */}
      <g clipPath={`url(#${clipId})`}>
        <image
          href={terrainSrc}
          x={center.x - textureSize / 2}
          y={center.y - textureSize / 2}
          width={textureSize}
          height={textureSize}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      {/* Cell outline */}
      <polygon
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />

      {/* Highlight overlay */}
      {isHighlighted && !isSelected && (
        <polygon
          points={points}
          fill="rgba(245,158,11,0.15)"
          stroke="#f59e0b"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
      {isSelected && (
        <polygon
          points={points}
          fill="rgba(250,204,21,0.2)"
          stroke="#facc15"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      )}

      {/* Building disc overlay */}
      {buildingSrc && (() => {
        const buildingSize = size * 1.4;
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
            r={size * 0.35}
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
          r={size * 0.42}
          fill="none"
          stroke={ownerColor}
          strokeWidth={2.5}
          opacity={0.7}
        />
      )}

      {/* Zoning marker */}
      {tile.zoningOwner && (
        <text
          x={center.x + size * 0.42}
          y={center.y - size * 0.3}
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
          x={center.x - size * 0.42}
          y={center.y - size * 0.3}
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
          r={size * 0.48}
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

// Clip path defs for cell tiles (rendered once in IslandMap)
export const CellClipDef: React.FC<{ cell: MapCell; origin: Point }> = ({ cell, origin }) => (
  <clipPath id={`cell-clip-${cell.id}`}>
    <polygon points={pointsAttr(cell.corners.map((c) => toPixel(c, origin)))} />
  </clipPath>
);
