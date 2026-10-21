import type { LandgrabState } from '../game/types';
import { FACTION_COLOR } from '../ui/theme';

export function GameLog({ G }: { G: LandgrabState }) {
  const entries = [...G.log].reverse().slice(0, 60);
  return (
    <div className="lg-log">
      {entries.map((e, i) => (
        <div key={i} className="lg-log__line">
          <span className="lg-muted">R{e.round}</span>{' '}
          <span style={{ color: FACTION_COLOR[G.players[e.player]?.type ?? 'Hotelier'] }}>{G.players[e.player]?.type}</span>: {e.text}
        </div>
      ))}
    </div>
  );
}
