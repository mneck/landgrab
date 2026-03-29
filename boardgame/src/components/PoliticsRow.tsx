import type { PoliticsSlot, PendingAction } from '../game/types';
import { CARD_INFO } from '../data/cardData';
import { POLITICS_VOTE_COSTS } from '../data/cardRules';

interface PoliticsRowProps {
  politicsRow: PoliticsSlot[];
  pendingAction: PendingAction | null;
  isCurrentPlayerTurn: boolean;
  onSelectSlot: (slotIndex: number) => void;
}

export function PoliticsRow({
  politicsRow,
  pendingAction,
  isCurrentPlayerTurn,
  onSelectSlot,
}: PoliticsRowProps) {
  const isPoliticsPhase = pendingAction?.type === 'liaison_politics';
  const isBribePhase = pendingAction?.type === 'event_bribe';
  const isSelectable = isPoliticsPhase || isBribePhase;

  return (
    <div className="market-row">
      <h4 className="market-row__title">Politics</h4>
      <p className="market-row__subtitle">Events &amp; Mandates</p>
      <div className="politics-row">
        {politicsRow.map((card, i) => {
          const info = card ? CARD_INFO[card] : null;
          const isMandate = card === 'Mandate';
          const voteCost = POLITICS_VOTE_COSTS[i] ?? 0;
          const canSelect = isSelectable && isCurrentPlayerTurn && !!card && !isMandate;

          return (
            <div
              key={i}
              className={[
                'politics-slot',
                'market-slot-hoverable',
                !card ? 'slot-empty' : '',
                isMandate ? 'slot-mandate' : '',
                canSelect ? 'slot-selectable' : '',
              ].join(' ')}
              onClick={canSelect ? () => onSelectSlot(i) : undefined}
            >
              <div className="slot-cost">
                {voteCost > 0 ? `${voteCost} 🗳️` : 'Free'}
              </div>
              {card ? (
                <>
                  <div className="slot-icon">{isMandate ? '🔖' : (info?.icon ?? '?')}</div>
                  <div className="slot-name">{isMandate ? 'Mandate' : (info?.title ?? card)}</div>
                  {info?.description && (
                    <div className="slot-tooltip">
                      <div className="slot-tooltip__title">{info.icon} {info.title}</div>
                      <div className="slot-tooltip__desc">{info.description}</div>
                    </div>
                  )}
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
}
