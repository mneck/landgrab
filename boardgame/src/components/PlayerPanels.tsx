import { BALANCE, WIN_CURRENCY_LABEL } from '../game/balance';
import { standing } from '../game/board';
import { winCurrency } from '../game/economy';
import type { LandgrabState } from '../game/types';
import { FACTION_COLOR, FACTION_ICON, RESOURCE_ICON } from '../ui/theme';

export function PlayerPanels({ G, me, aiSeats }: { G: LandgrabState; me: number; aiSeats: number[] }) {
  const controller = G.reaction ? G.reaction.reactor : G.turn.player;
  return (
    <div className="lg-players">
      {G.players.map((p, i) => {
        const active = i === controller;
        const favorsHeld = G.favors.filter((f) => f.to === p.type).length;
        const favorsOwed = G.favors.filter((f) => f.from === p.type).length;
        return (
          <div
            key={i}
            className={`lg-player ${active ? 'lg-player--active' : ''} ${i === me ? 'lg-player--me' : ''}`}
            style={{ borderColor: FACTION_COLOR[p.type] }}
          >
            <div className="lg-player__head">
              <span>{FACTION_ICON[p.type]}</span>
              <strong style={{ color: FACTION_COLOR[p.type] }}>{p.type}</strong>
              {i === me && <span className="lg-tag">you</span>}
              {aiSeats.includes(i) && <span className="lg-tag">bot</span>}
              {active && <span className="lg-tag lg-tag--hot">{G.reaction ? 'deciding' : 'turn'}</span>}
            </div>
            <div className="lg-player__seats">
              {'🪑'.repeat(p.seats)}<span className="lg-muted">{'·'.repeat(Math.max(0, G.seatsToWin - p.seats))}</span>{' '}
              <span className="lg-muted">Seats {p.seats}/{G.seatsToWin}</span>
            </div>
            <div className="lg-player__res">
              {(Object.keys(RESOURCE_ICON) as (keyof typeof RESOURCE_ICON)[]).map((k) => (
                <span key={k}>{RESOURCE_ICON[k]} {p.resources[k]}</span>
              ))}
            </div>
            <div className="lg-player__meta">
              <span title={`Win currency: ${WIN_CURRENCY_LABEL[p.type]}`}>Currency {winCurrency(G, i)}</span>
              {p.type === 'Chieftain' && <span>Standing {standing(G)} · Grievance {G.grievance}/{BALANCE.grievanceCap}</span>}
              {p.type === 'Hotelier' && <span>Holdings in supply {G.holdingsRemaining}</span>}
              {p.type === 'Chieftain' && <span>Presence in supply {G.presenceRemaining}</span>}
              <span>{p.tableau.length}/{BALANCE.tableauCap} cards</span>
              {(favorsHeld > 0 || favorsOwed > 0) && <span>Favours held {favorsHeld} · owed {favorsOwed}</span>}
            </div>
            {i !== me && (
              <div className="lg-player__cards lg-muted">{p.tableau.map((c) => c.cardType).join(', ')}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
