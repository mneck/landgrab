import React from 'react';
import type { TableauCard } from '../game/types';
import { CARD_INFO } from '../data/cardData';

interface CardProps {
  card: TableauCard;
  isUsed: boolean;
  isActive: boolean;         // It's this player's turn
  isSelectable: boolean;     // Can be clicked
  onClick?: () => void;
  showTooltip?: boolean;
}

export const Card: React.FC<CardProps> = ({
  card,
  isUsed,
  isActive,
  isSelectable,
  onClick,
}) => {
  const info = CARD_INFO[card.cardType];
  const isEvent = card.category === 'Event';

  return (
    <div
      className={[
        'tableau-card',
        isEvent ? 'card-event' : 'card-personnel',
        isUsed ? 'card-used' : '',
        isSelectable && isActive ? 'card-selectable' : '',
        isActive && !isUsed ? 'card-active' : '',
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
};
