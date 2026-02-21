import type { PoliticsCard } from "../types/game";
import { Card } from "./Card";

interface PoliticsRowProps {
  slots: [
    PoliticsCard | null,
    PoliticsCard | null,
    PoliticsCard | null,
    PoliticsCard | null
  ];
  onCardClick?: (slotIndex: number) => void;
  selectedSlot?: number;
}

export function PoliticsRow({ slots, onCardClick, selectedSlot }: PoliticsRowProps) {
  return (
    <div className="market-row politics-row">
      <h3 className="market-row__title">Politics</h3>
      <p className="market-row__subtitle">
        {onCardClick ? "Click a card to see what it does" : "Event cards (1–4 Coins)"}
      </p>
      <div className="market-row__slots">
        {slots.map((card, i) => (
          <div
            key={i}
            className={`market-slot${onCardClick && card ? " market-slot--clickable" : ""}${selectedSlot === i ? " market-slot--highlight" : ""}`}
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
