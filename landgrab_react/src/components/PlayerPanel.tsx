import type { Player } from "../types/game";
import { Card } from "./Card";

interface PlayerPanelProps {
  player: Player;
  isCurrent: boolean;
}

export function PlayerPanel({ player, isCurrent }: PlayerPanelProps) {
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
      </div>
      <div className="hand">
        <span className="label">Hand:</span>
        <div className="cards">
          {player.hand.map((card, i) => (
            <Card key={`${card}-${i}`} card={card} compact />
          ))}
        </div>
      </div>
    </div>
  );
}
