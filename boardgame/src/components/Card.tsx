import type { TableauCard } from '../game/types';
import { CARD_INFO } from '../data/cardData';

interface CardProps {
  card: TableauCard;
  isUsed: boolean;
  isActive: boolean;
  isSelectable: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

export function Card({
  card,
  isUsed,
  isActive,
  isSelectable,
  isSelected,
  onClick,
}: CardProps) {
  const info = CARD_INFO[card.cardType];
  const isEvent = card.category === 'Event';

  return (
    <div
      className={[
        'tableau-card',
        isEvent ? 'card-event' : 'card-personnel',
        isUsed ? 'card-used' : '',
        isSelectable && isActive ? 'card-selectable' : '',
        isSelected ? 'card-selected' : '',
      ].join(' ')}
      onClick={isSelectable && isActive && !isUsed ? onClick : undefined}
      title={info ? `${info.title}: ${info.description}` : card.cardType}
    >
      <div className="card-token-slot">
        {isUsed ? <span className="token-filled">●</span> : <span className="token-empty">○</span>}
      </div>
      <div className="card-icon">{info?.icon ?? '?'}</div>
      <div className="card-name">{info?.title ?? card.cardType}</div>
      {isEvent && <div className="card-event-badge">EVENT</div>}
    </div>
  );
}
