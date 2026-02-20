import type { Player } from "../types/game";
import { Card } from "./Card";

interface PlayerPanelProps {
  player: Player;
  isCurrent: boolean;
  selectedCard?: string | null;
  onCardClick?: (card: string) => void;
}

export function PlayerPanel({
  player,
  isCurrent,
  selectedCard,
  onCardClick,
}: PlayerPanelProps) {
  return (
    <div
      className={`player-panel ${isCurrent ? "current" : ""}`}
      data-player={player.type}
    >
      <h3>{player.type}</h3>
      <div className="resources">
        <span title="Wood">🪵 {player.resources.wood}</span>
        <span title="Ore">⚙️ {player.resources.ore}</span>
        <span title="Coins">💰 {player.resources.coins}</span>
        <span title="Votes">🗳️ {player.resources.votes}</span>
        <span title="Seats">💺 {player.seats}/4</span>
      </div>
      <div className="hand">
        <span className="label">Hand:</span>
        <div className="cards">
          {player.hand.map((card, i) => {
            const isSelected = selectedCard === card;
            const clickable = isCurrent && onCardClick;
            return (
              <div
                key={`${card}-${i}`}
                className={`card-wrapper ${clickable ? "card-wrapper--clickable" : ""} ${isSelected ? "card-wrapper--selected" : ""}`}
                onClick={() => clickable && onCardClick?.(card)}
                onKeyDown={(e) =>
                  clickable &&
                  (e.key === "Enter" || e.key === " ") &&
                  onCardClick?.(card)
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
              >
                <Card card={card} compact />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
