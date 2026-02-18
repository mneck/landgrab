interface GameActionsProps {
  actionsRemaining: number;
  placementMode?: boolean;
  onPlayCharter?: () => void;
  onCancelPlacement?: () => void;
  onEndTurn?: () => void;
}

export function GameActions({
  actionsRemaining,
  placementMode,
  onPlayCharter,
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
          onPlayCharter && (
            <button type="button" onClick={onPlayCharter}>
              Play Charter (place building)
            </button>
          )
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
