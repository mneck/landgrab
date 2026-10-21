/**
 * The island, drawn from map geometry (never from game state) with the
 * viewer's knowledge on top: fog, terrain, pieces, Sites and Scar clusters.
 */
import { memo, useMemo, useState } from 'react';
import { cellPolygon } from '../game/maps';
import type { MapFile } from '../game/maps';
import { components } from '../utils/cellGraph';
import type { Cell, CellId, LandgrabState } from '../game/types';
import { BUILDING_ICON, FACTION_COLOR, TERRAIN_COLOR } from '../ui/theme';

interface IslandMapProps {
  map: MapFile;
  G: LandgrabState;
  me: number;
  /** Cells the current selection may target (highlighted, clickable). */
  targets: Set<CellId>;
  /** Accent colour for targets. */
  targetColor?: string;
  onCellClick?: (id: CellId) => void;
}

function knowsUnder(G: LandgrabState, me: number, c: Cell): boolean {
  return !c.fog || c.terrain !== 'Unknown';
}

const CellShape = memo(function CellShape({
  points, fill, stroke, strokeWidth, dashed, onClick, onEnter, clickable,
}: {
  points: string; fill: string; stroke: string; strokeWidth: number; dashed: boolean;
  onClick?: () => void; onEnter?: () => void; clickable: boolean;
}) {
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashed ? '3 2' : undefined}
      onClick={onClick}
      onMouseEnter={onEnter}
      style={{ cursor: clickable ? 'pointer' : 'default' }}
    />
  );
});

export function IslandMap({ map, G, me, targets, targetColor = '#ffd84d', onCellClick }: IslandMapProps) {
  const [hover, setHover] = useState<CellId | null>(null);
  const [xmin, ymin, xmax, ymax] = map.bbox;

  const polys = useMemo(
    () => map.cells.map((c) => cellPolygon(map, c.id).map(([x, y]) => `${x},${y}`).join(' ')),
    [map]
  );

  // Scar clusters, labelled with their size: a cluster of 3+ spreads every round.
  const clusters = useMemo(() => components(G, (c) => c.terrain === 'Scar' && !c.fog), [G]);

  const hovered = hover !== null ? G.cells[hover] : null;
  const site = hovered?.siteId !== undefined ? G.sites[hovered.siteId] : undefined;

  return (
    <div className="lg-map">
      <svg viewBox={`${xmin - 5} ${ymin - 5} ${xmax - xmin + 10} ${ymax - ymin + 10}`} onMouseLeave={() => setHover(null)}>
        <rect x={xmin - 5} y={ymin - 5} width={xmax - xmin + 10} height={ymax - ymin + 10} fill={TERRAIN_COLOR.Ocean} />
        {G.cells.map((c) => {
          const known = knowsUnder(G, me, c);
          const fill = c.fog && !known ? TERRAIN_COLOR.Unknown : TERRAIN_COLOR[c.terrain];
          const isTarget = targets.has(c.id);
          return (
            <CellShape
              key={c.id}
              points={polys[c.id]}
              fill={fill}
              stroke={isTarget ? targetColor : c.fog ? '#3a3a44' : '#10131a'}
              strokeWidth={isTarget ? 3 : 0.7}
              dashed={c.fog && known}
              clickable={isTarget}
              onClick={isTarget && onCellClick ? () => onCellClick(c.id) : undefined}
              onEnter={() => setHover(c.id)}
            />
          );
        })}

        {/* Fog veil over cells the viewer knows (scouted or Chieftain) */}
        {G.cells.map((c) =>
          c.fog && c.terrain !== 'Unknown' ? (
            <polygon key={`v${c.id}`} points={polys[c.id]} fill="#14141a" opacity={0.45} pointerEvents="none" />
          ) : null
        )}

        {/* Pieces */}
        {G.cells.map((c) => {
          const [x, y] = map.cells[c.id].centroid;
          const out = [];
          if (c.designation) {
            const col = c.designation === 'Zoned' && c.zonedFor ? FACTION_COLOR[c.zonedFor] : c.designation === 'Protected' ? '#7fd3ff' : '#ffd84d';
            out.push(
              <polygon key="d" points={polys[c.id]} fill="none" stroke={col} strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />
            );
          }
          if (c.holding) {
            out.push(<circle key="h" cx={x} cy={y} r={10} fill="none" stroke={FACTION_COLOR[c.holding]} strokeWidth={2.5} />);
          }
          if (c.presence) out.push(<circle key="p" cx={x} cy={y} r={4.5} fill={FACTION_COLOR.Chieftain} stroke="#0b2a17" strokeWidth={1} />);
          if (c.village) out.push(<text key="v" x={x} y={y + 5} textAnchor="middle" fontSize={14}>🛖</text>);
          if (c.building) {
            out.push(
              <text key="b" x={x} y={y + 5} textAnchor="middle" fontSize={14} opacity={c.sold ? 0.55 : 1}>
                {BUILDING_ICON[c.building]}
              </text>
            );
          }
          if (c.siteId !== undefined && !c.building) {
            const s = G.sites[c.siteId];
            const label = s.revealed ? String(s.significance) : '?';
            const col = s.status === 'Listed' ? '#ffd84d' : s.status === 'Reclaimed' ? FACTION_COLOR.Chieftain : s.status === 'Excavated' ? '#a0522d' : '#e8dcc0';
            out.push(
              <g key="s" pointerEvents="none">
                <rect x={x - 6} y={y - 16} width={12} height={12} rx={2} fill={col} stroke="#2a2a2a" strokeWidth={1} />
                <text x={x} y={y - 7} textAnchor="middle" fontSize={9} fontWeight={700} fill="#222">{label}</text>
              </g>
            );
          }
          return out.length ? <g key={`o${c.id}`} pointerEvents="none">{out}</g> : null;
        })}

        {/* Scar cluster sizes */}
        {clusters.filter((k) => k.size >= 2).map((k, i) => {
          const ids = [...k];
          const cx = ids.reduce((a, id) => a + map.cells[id].centroid[0], 0) / ids.length;
          const cy = ids.reduce((a, id) => a + map.cells[id].centroid[1], 0) / ids.length;
          const spreading = k.size >= 3;
          return (
            <g key={`k${i}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={9} fill={spreading ? '#c0392b' : '#7a4b3a'} stroke="#fff" strokeWidth={1} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{k.size}</text>
            </g>
          );
        })}
      </svg>

      <div className="lg-map__hover">
        {hovered ? (
          <>
            <strong>Cell {hovered.id}</strong>{' '}
            {hovered.fog && hovered.terrain === 'Unknown' ? 'Fog (unknown)' : `${hovered.terrain}${hovered.fog ? ' (under fog — you know it)' : ''}`}
            {hovered.building && ` · ${hovered.building}${hovered.buildingOwner ? ` (${hovered.buildingOwner})` : ''}${hovered.sold ? ', sold' : ''}`}
            {hovered.holding && ` · ${hovered.holding} Holding`}
            {hovered.village && ' · Village'}
            {hovered.presence && ' · Presence'}
            {hovered.designation && ` · ${hovered.designation}${hovered.zonedFor ? ` for ${hovered.zonedFor}` : ''}`}
            {site && ` · Site ${site.id}: ${site.status}, significance ${site.revealed ? site.significance : 'hidden'}`}
          </>
        ) : (
          <span className="lg-muted">Hover a cell for details. Red numbers are Scar clusters; 3 or more spread each round.</span>
        )}
      </div>
    </div>
  );
}
