import type { Tile } from "../types/game";
import type { HexCoord } from "../utils/hexGrid";
import { hexKey, makeHexagonalShape, pixelToHex } from "../utils/hexGrid";
import { HexTile } from "./HexTile";

interface HexMapProps {
  tiles: Record<string, Tile>;
  mapRadius: number;
  selectedHex: HexCoord | null;
  onHexClick?: (hex: HexCoord) => void;
}

const HEX_SIZE = 28;

export function HexMap({
  tiles,
  mapRadius,
  selectedHex,
  onHexClick,
}: HexMapProps) {
  const hexes = makeHexagonalShape(mapRadius);
  const width = HEX_SIZE * 2 * (mapRadius * Math.sqrt(3) + 1);
  const height = HEX_SIZE * 2 * (mapRadius * 1.5 + 1);
  const origin = { x: width / 2, y: height / 2 };

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onHexClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hex = pixelToHex({ x, y }, HEX_SIZE, origin);
    onHexClick(hex);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onClick={handleSvgClick}
      className="hex-map"
    >
      {hexes.map((hex) => {
        const key = hexKey(hex);
        const tile = tiles[key];
        if (!tile) return null;
        return (
          <HexTile
            key={key}
            tile={tile}
            size={HEX_SIZE}
            origin={origin}
            selected={
              selectedHex
                ? selectedHex.q === hex.q && selectedHex.r === hex.r
                : false
            }
            onClick={onHexClick ? () => onHexClick(hex) : undefined}
          />
        );
      })}
    </svg>
  );
}
