import { CARDS, cardName } from '../game/cards';
import type { Action, LandgrabState } from '../game/types';

interface Props {
  G: LandgrabState;
  me: number;
  legal: Action[];
  selected: { card: string; option: string } | null;
  onSelect: (card: string, option: string) => void;
  myTurn: boolean;
}

export function Tableau({ G, me, legal, selected, onSelect, myTurn }: Props) {
  const used = new Set(G.turn.player === me ? G.turn.usedCards : []);
  return (
    <div className="lg-tableau">
      {G.players[me].tableau.map((c) => {
        const def = CARDS[c.cardType];
        const isUsed = used.has(c.instanceId);
        return (
          <div key={c.instanceId} className={`lg-card ${def?.category === 'Event' ? 'lg-card--event' : ''} ${isUsed ? 'lg-card--used' : ''}`}>
            <div className="lg-card__head">
              <span className="lg-card__icon">{def?.icon}</span>
              <span className="lg-card__name">{cardName(c.cardType)}</span>
              <span className="lg-card__kind">{def?.passive ? 'passive' : def?.category === 'Event' ? 'single use' : ''}</span>
            </div>
            <div className="lg-card__text">{def?.text}</div>
            {!def?.passive && (
              <div className="lg-card__options">
                {def?.options.map((o) => {
                  const n = legal.filter((a) => a.card === c.instanceId && a.option === o.id).length;
                  const isSel = selected?.card === c.instanceId && selected.option === o.id;
                  return (
                    <button
                      key={o.id}
                      className={`lg-opt ${isSel ? 'lg-opt--sel' : ''}`}
                      disabled={!myTurn || isUsed || n === 0}
                      title={o.text}
                      onClick={() => onSelect(c.instanceId, o.id)}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
            {isUsed && <div className="lg-card__token">●</div>}
          </div>
        );
      })}
    </div>
  );
}
