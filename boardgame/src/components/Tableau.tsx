import type { PlayerState, PendingAction } from '../game/types';
import { Card } from './Card';

interface TableauProps {
  player: PlayerState;
  isCurrentPlayer: boolean;
  tokensUsedThisTurn: string[];
  pendingAction: PendingAction | null;
  actionsRemaining: number;
  selectedCardId: string | null;
  onSelectCard: (instanceId: string) => void;
}

export function Tableau({
  player,
  isCurrentPlayer,
  tokensUsedThisTurn,
  pendingAction,
  actionsRemaining,
  selectedCardId,
  onSelectCard,
}: TableauProps) {
  return (
    <div className="tableau">
      <div className="tableau-header">
        <span className="tableau-label">Tableau</span>
        <span className="tableau-count">{player.tableau.length}/8</span>
        {isCurrentPlayer && (
          <span className="tableau-actions">
            Actions left: <strong>{actionsRemaining}</strong>
          </span>
        )}
      </div>
      <div className="tableau-cards">
        {player.tableau.map((card) => {
          const isUsed = tokensUsedThisTurn.includes(card.instanceId);
          const isSelected = selectedCardId === card.instanceId;
          const canClick =
            isCurrentPlayer &&
            !isUsed &&
            !pendingAction &&
            actionsRemaining > 0;

          return (
            <Card
              key={card.instanceId}
              card={card}
              isUsed={isUsed}
              isActive={isCurrentPlayer}
              isSelectable={canClick}
              isSelected={isSelected}
              onClick={() => onSelectCard(card.instanceId)}
            />
          );
        })}
        {player.tableau.length === 0 && (
          <div className="tableau-empty">No cards in tableau</div>
        )}
      </div>
    </div>
  );
}
