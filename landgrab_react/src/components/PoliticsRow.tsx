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
  /** Slot 0–3: vote cost (top label), then coin cost (bottom label) */
  voteCosts?: readonly [number, number, number, number];
  coinCosts?: readonly [number, number, number, number];
}

export function PoliticsRow({ slots, onCardClick, selectedSlot, voteCosts, coinCosts }: PoliticsRowProps) {
  return (
    <div className="market-row politics-row">
      <h3 className="market-row__title">Politics</h3>
      <p className="market-row__subtitle">
        {onCardClick ? "Click a card to see what it does" : "Event cards (Vote + Coin cost per slot)"}
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
            {(voteCosts || coinCosts) && (
              <div className="market-slot__prices">
                {voteCosts && (
                  <div className="market-slot__price market-slot__price--vote">
                    {voteCosts[i] === 0 ? "—" : `${voteCosts[i]} ${voteCosts[i] === 1 ? "Vote" : "Votes"}`}
                  </div>
                )}
                {coinCosts && (
                  <div className="market-slot__price market-slot__price--coin">
                    {coinCosts[i]} {coinCosts[i] === 1 ? "Coin" : "Coins"}
                  </div>
                )}
              </div>
            )}
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
