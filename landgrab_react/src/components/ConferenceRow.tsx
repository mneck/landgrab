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
  onCardClick?: (slotIndex: number) => void;
  highlightSlot?: number;
}

export function ConferenceRow({ slots, onCardClick, highlightSlot }: ConferenceRowProps) {
  return (
    <div className="market-row conference-row">
      <h3 className="market-row__title">Conference</h3>
      <p className="market-row__subtitle">
        {onCardClick
          ? "Click a card to start a bid"
          : "Personnel cards (bid via Personnel card)"}
      </p>
      <div className="market-row__header">
        {COSTS.map((c) => (
          <span key={c} className="market-slot__cost">
            {c} 💰
          </span>
        ))}
      </div>
      <div className="market-row__slots">
        {slots.map((card, i) => (
          <div
            key={i}
            className={`market-slot${onCardClick && card ? " market-slot--clickable" : ""}${highlightSlot === i ? " market-slot--highlight" : ""}`}
            onClick={() => onCardClick && card && onCardClick(i)}
            role={onCardClick && card ? "button" : undefined}
            tabIndex={onCardClick && card ? 0 : undefined}
            onKeyDown={(e) =>
              onCardClick && card && (e.key === "Enter" || e.key === " ") && onCardClick(i)
            }
          >
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
