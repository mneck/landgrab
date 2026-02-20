import type { BuildingType } from "../types/game";

export interface PlayOption {
  label: string;
  onPlay: () => void;
  disabled?: boolean;
}

export interface ProcurementPurchaseOption {
  slotIndex: number;
  cost: number;
  card: string;
  onPurchase: () => void;
}

interface GameActionsProps {
  currentPlayerType: string;
  actionsRemaining: number;
  placementMode?: boolean;
  /** When a card is selected, show its info and play options */
  selectedCard?: string | null;
  selectedCardInfo?: { title: string; description: string } | null;
  playOptions?: PlayOption[];
  canDraw: boolean;
  onDraw?: () => void;
  onCancelPlacement?: () => void;
  onEndTurn?: () => void;
  /** When in Build mode, show these building type options */
  buildOptions?: BuildingType[];
  onBuildChoice?: (building: BuildingType) => void;
  /** When choosing Procurement: generate vs purchase Politics card */
  procurementChoosing?: boolean;
  procurementPurchaseOptions?: ProcurementPurchaseOption[];
  onProcurementGenerate?: () => void;
  onProcurementCancel?: () => void;
}

export function GameActions({
  currentPlayerType,
  actionsRemaining,
  placementMode,
  selectedCard,
  selectedCardInfo,
  playOptions = [],
  canDraw,
  onDraw,
  onCancelPlacement,
  onEndTurn,
  buildOptions,
  onBuildChoice,
  procurementChoosing,
  procurementPurchaseOptions = [],
  onProcurementGenerate,
  onProcurementCancel,
}: GameActionsProps) {
  return (
    <div className="game-actions">
      <div className="actions-turn">
        {currentPlayerType} — your turn
      </div>
      <div className="actions-left">
        Actions: <strong>{actionsRemaining}</strong>
      </div>
      <div className="action-buttons">
        {procurementChoosing ? (
          <>
            <p className="card-detail__description">
              Procurement: choose one
            </p>
            {onProcurementGenerate && (
              <button type="button" onClick={onProcurementGenerate}>
                Generate resources
              </button>
            )}
            {procurementPurchaseOptions.map(({ slotIndex, cost, card, onPurchase }) => (
              <button
                key={slotIndex}
                type="button"
                onClick={onPurchase}
              >
                Buy {card} ({cost} 💰)
              </button>
            ))}
            {onProcurementCancel && (
              <button type="button" onClick={onProcurementCancel}>
                Cancel
              </button>
            )}
          </>
        ) : placementMode ? (
          <>
            {buildOptions && buildOptions.length > 0 && onBuildChoice ? (
              buildOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onBuildChoice(b)}
                >
                  Place {b.replace(/([A-Z])/g, " $1").trim()}
                </button>
              ))
            ) : null}
            {onCancelPlacement && (
              <button type="button" onClick={onCancelPlacement}>
                Cancel placement
              </button>
            )}
          </>
        ) : selectedCard && selectedCardInfo ? (
          <>
            <div className="card-detail">
              <div className="card-detail__title">{selectedCardInfo.title}</div>
              <div className="card-detail__description">
                {selectedCardInfo.description}
              </div>
            </div>
            {playOptions.map(({ label, onPlay, disabled }, i) => (
              <button
                key={`${label}-${i}`}
                type="button"
                onClick={onPlay}
                disabled={disabled}
              >
                Play {label}
              </button>
            ))}
            {canDraw && onDraw && (
              <button type="button" onClick={onDraw}>
                Draw a card
              </button>
            )}
          </>
        ) : (
          <>
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
