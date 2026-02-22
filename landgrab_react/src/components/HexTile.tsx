import type { Tile } from "../types/game";
import { hexCornerPoints, hexToPixel } from "../utils/hexGrid";
import { assets } from "../constants/assets";

/** Terrain tile types -> nature_tiles PNG files (from @assets) */
const TERRAIN_IMAGES: Record<string, string> = {
  Fog: assets.hexes.nature("fog_hex.png"),
  Field: assets.hexes.nature("field_hex.png"),
  Mountain: assets.hexes.nature("mountains_hex.png"),
  Water: assets.hexes.nature("water_hex.png"),
  Forest: assets.hexes.nature("forest_hex.png"),
  Sand: assets.hexes.nature("desert_hex.png"),
};

/** Building types -> asset PNG files (disc overlays, from @assets) */
const BUILDING_IMAGES: Record<string, string> = {
  Village: assets.hexes.indigenous("indigenous_disc.png"),
  Resort: assets.hexes.resort("resort_disc.png"),
  Housing: assets.hexes.resort("resort_homes_disc.png"),
  IndustrialZone: assets.hexes.industry("industry_disc.png"),
  Farm: assets.hexes.industry("industry_farm_disc.png"),
  Infrastructure: assets.hexes.government("infrastructure_disc.png"),
  CivicOffice: assets.hexes.government("civic_offices_disc.png"),
  Reserve: assets.hexes.indigenous("reserve.png"),
};

interface HexTileProps {
  tile: Tile;
  size: number;
  origin: { x: number; y: number };
  selected?: boolean;
  onClick?: () => void;
}

export function HexTile({ tile, size, origin, selected, onClick }: HexTileProps) {
  const points = hexCornerPoints(tile.hex, size, origin);
  const clipId = `hex-clip-${tile.hex.q}-${tile.hex.r}`;
  const terrainSrc = TERRAIN_IMAGES[tile.type] ?? TERRAIN_IMAGES.Fog;
  const stroke = selected ? "#facc15" : "#374151";
  const strokeWidth = selected ? 3 : 1;

  // Hex image bounds - scale to cover the hex (2*size for width, sqrt(3)*size for height in pointy)
  const hexWidth = size * 2;
  const hexHeight = size * Math.sqrt(3);
  const center = hexToPixel(tile.hex, size, origin);

  return (
    <g
      className="hex-tile"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>
      {/* Terrain image clipped to hex shape */}
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
      {/* Building overlay (disc image centered on hex) */}
      {tile.building && (() => {
        const buildingSrc = BUILDING_IMAGES[tile.building];
        const buildingSize = size * 1.4; // Disc slightly smaller than hex
        if (!buildingSrc) return null;
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
    </g>
  );
}
