import type { PersonnelCard } from "../types/game";
import { Card } from "./Card";

const COSTS = [1, 2, 3, 4] as const;

interface ConferenceRowProps {
  slots: [
    PersonnelCard | null,
    PersonnelCard | null,
    PersonnelCard | null,
    PersonnelCard | null
  ];
}

export function ConferenceRow({ slots }: ConferenceRowProps) {
  return (
    <div className="market-row conference-row">
      <h3 className="market-row__title">Conference</h3>
      <p className="market-row__subtitle">Personnel cards (cost in Coins)</p>
      <div className="market-row__header">
        {COSTS.map((c) => (
          <span key={c} className="market-slot__cost">
            {c} 💰
          </span>
        ))}
      </div>
      <div className="market-row__slots">
        {slots.map((card, i) => (
          <div key={i} className="market-slot">
            {card ? (
              <Card card={card} compact />
            ) : (
              <div className="market-slot__empty">—</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
