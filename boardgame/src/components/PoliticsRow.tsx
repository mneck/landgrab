import React from 'react';
import type { PoliticsSlot, PendingAction } from '../game/types';
import { CARD_INFO } from '../data/cardData';
import { POLITICS_COSTS, POLITICS_VOTE_COSTS } from '../data/cardRules';

interface PoliticsRowProps {
  politicsRow: PoliticsSlot[];
  pendingAction: PendingAction | null;
  isCurrentPlayerTurn: boolean;
  onSelectSlot: (slotIndex: number) => void;
}

export const PoliticsRow: React.FC<PoliticsRowProps> = ({
  politicsRow,
  pendingAction,
  isCurrentPlayerTurn,
  onSelectSlot,
}) => {
  const isPoliticsPhase = pendingAction?.type === 'liaison_politics';
  const isBribePhase = pendingAction?.type === 'event_bribe';
  const isSelectable = isPoliticsPhase || isBribePhase;

  return (
    <div className="market-section">
      <div className="market-title">Politics Track</div>
      <div className="politics-row">
        {politicsRow.map((card, i) => {
          const info = card && card !== 'Mandate' ? CARD_INFO[card] : null;
          const isMandate = card === 'Mandate';
          const voteCost = POLITICS_VOTE_COSTS[i] ?? 1;
          const coinCost = POLITICS_COSTS[i] ?? 4;
          const canSelect = isSelectable && isCurrentPlayerTurn && !!card && !isMandate;

          return (
            <div
              key={i}
              className={[
                'politics-slot',
                !card ? 'slot-empty' : '',
                isMandate ? 'slot-mandate' : '',
                canSelect ? 'slot-selectable' : '',
              ].join(' ')}
              onClick={canSelect ? () => onSelectSlot(i) : undefined}
            >
              <div className="slot-cost">
                {coinCost}🪙 {voteCost > 0 ? `+${voteCost}🗳️` : ''}
              </div>
              {card ? (
                <>
                  <div className="slot-icon">{isMandate ? '🔖' : (info?.icon ?? '?')}</div>
                  <div className="slot-name">{isMandate ? 'Mandate' : (info?.title ?? card)}</div>
                </>
              ) : (
                <div className="slot-empty-label">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
