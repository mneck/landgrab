import { cardName, CARDS } from '../game/cards';
import { planMandate } from '../game/economy';
import { MANDATE } from '../game/markets';
import type { LandgrabState } from '../game/types';
import { formatAmount } from '../ui/describe';

function Row({ title, unit, row, G, me }: { title: string; unit: string; row: (string | null)[]; G: LandgrabState; me: number }) {
  return (
    <div className="lg-market">
      <div className="lg-market__title">{title}</div>
      <div className="lg-market__slots">
        {row.map((card, slot) => {
          const def = card ? CARDS[card] : undefined;
          let cost = `${slot} ${unit}`;
          if (card === MANDATE) {
            const plan = planMandate(G, me, slot, false);
            cost = plan ? `you pay ${formatAmount(plan.spend)}${plan.standingRequired ? ` · Standing ${plan.standingRequired}` : ''}` : 'you cannot afford it yet';
          }
          return (
            <div key={slot} className={`lg-slot ${card === MANDATE ? 'lg-slot--mandate' : ''}`} title={def?.text ?? (card === MANDATE ? 'Mandate: +1 Seat and a Stimulus. Must be your first action; ends your turn.' : '')}>
              <div className="lg-slot__cost">{cost}</div>
              <div className="lg-slot__name">{card === MANDATE ? '🪑 Mandate' : card ? `${def?.icon ?? ''} ${cardName(card)}` : '—'}</div>
              {def && <div className="lg-slot__text">{def.text}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Markets({ G, me }: { G: LandgrabState; me: number }) {
  const track = (t: boolean[]) => t.map((v, i) => <span key={i} className={`lg-unit ${v ? 'lg-unit--full' : ''}`}>{i + 1}</span>);
  return (
    <div className="lg-markets">
      <Row title="Personnel Row (Guide → Hire)" unit="💰" row={G.personnelRow} G={G} me={me} />
      <Row title="Politics Track (Liaison → Policy)" unit="🗳️" row={G.politicsRow} G={G} me={me} />
      <div className="lg-market">
        <div className="lg-market__title">Resource Market (Liaison → Market) · price in 💰</div>
        <div className="lg-resmarket">
          <div>🪵 {track(G.woodMarket)}</div>
          <div>⚙️ {track(G.oreMarket)}</div>
        </div>
      </div>
    </div>
  );
}
