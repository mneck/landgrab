import type { CardType } from "../types/game";

interface GameActionsProps {
  actionsRemaining: number;
  placementMode?: boolean;
  /** Cards that can be played; each maps to an onClick handler */
  playableCards: { card: CardType; onPlay: () => void }[];
  canDraw: boolean;
  onDraw?: () => void;
  onCancelPlacement?: () => void;
  onEndTurn?: () => void;
}

export function GameActions({
  actionsRemaining,
  placementMode,
  playableCards,
  canDraw,
  onDraw,
  onCancelPlacement,
  onEndTurn,
}: GameActionsProps) {
  return (
    <div className="game-actions">
      <div className="actions-left">
        Actions: <strong>{actionsRemaining}</strong>
      </div>
      <div className="action-buttons">
        {placementMode ? (
          onCancelPlacement && (
            <button type="button" onClick={onCancelPlacement}>
              Cancel placement
            </button>
          )
        ) : (
          <>
            {playableCards.map(({ card, onPlay }, i) => (
              <button key={`${card}-${i}`} type="button" onClick={onPlay}>
                Play {card}
              </button>
            ))}
            {canDraw && onDraw && (
              <button type="button" onClick={onDraw}>
                Draw a card
              </button>
            )}
          </>
        )}
        {onEndTurn && (
          <button type="button" onClick={onEndTurn}>
            End Turn
          </button>
        )}
      </div>
    </div>
  );
}
