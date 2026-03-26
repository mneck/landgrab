import type { PlayerState, PendingAction } from '../game/types';
import { Tableau } from './Tableau';

interface PlayerPanelProps {
  player: PlayerState;
  playerIndex: number;
  isCurrentPlayer: boolean;
  tokensUsedThisTurn: string[];
  pendingAction: PendingAction | null;
  actionsRemaining: number;
  selectedCardId: string | null;
  onSelectCard: (instanceId: string) => void;
}

export function PlayerPanel({
  player,
  playerIndex,
  isCurrentPlayer,
  tokensUsedThisTurn,
  pendingAction,
  actionsRemaining,
  selectedCardId,
  onSelectCard,
}: PlayerPanelProps) {
  return (
    <div
      className={`player-panel ${isCurrentPlayer ? 'current' : ''}`}
      data-player={player.type}
    >
      <h3>{player.type} (P{playerIndex + 1})</h3>
      <div className="player-resources">
        <span title="Coins">💰 {player.resources.coins}</span>
        <span title="Wood">🪵 {player.resources.wood}</span>
        <span title="Ore">⚙️ {player.resources.ore}</span>
        <span title="Votes">🗳️ {player.resources.votes}</span>
      </div>
      <div className="player-seats">
        💺 {player.seats}/2
      </div>

      <Tableau
        player={player}
        isCurrentPlayer={isCurrentPlayer}
        tokensUsedThisTurn={tokensUsedThisTurn}
        pendingAction={pendingAction}
        actionsRemaining={actionsRemaining}
        selectedCardId={selectedCardId}
        onSelectCard={onSelectCard}
      />
    </div>
  );
}
