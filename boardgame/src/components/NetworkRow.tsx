import { useState } from 'react';
import type { NetworkSlot, PendingAction } from '../game/types';
import { CARD_INFO } from '../data/cardData';

interface NetworkRowProps {
  networkRow: NetworkSlot[];
  pendingAction: PendingAction | null;
  isCurrentPlayerTurn: boolean;
  playerCoins: number;
  onSelectSlot: (slotIndex: number) => void;
  onPlaceBid: (amount: number) => void;
}

export function NetworkRow({
  networkRow,
  pendingAction,
  isCurrentPlayerTurn,
  playerCoins,
  onSelectSlot,
  onPlaceBid,
}: NetworkRowProps) {
  const [bidAmount, setBidAmount] = useState(1);
  const isNetworkPhase = pendingAction?.type === 'guide_network';
  const isBidPhase = pendingAction?.type === 'network_bid';

  return (
    <div className="market-row">
      <h4 className="market-row__title">Network</h4>
      <p className="market-row__subtitle">Personnel Market</p>
      <div className="network-row">
        {networkRow.map((card, i) => {
          const info = card ? CARD_INFO[card] : null;
          const canSelect = isNetworkPhase && isCurrentPlayerTurn && !!card;

          return (
            <div
              key={i}
              className={[
                'network-slot',
                !card ? 'slot-empty' : '',
                canSelect ? 'slot-selectable' : '',
              ].join(' ')}
              onClick={canSelect ? () => onSelectSlot(i) : undefined}
            >
              {card ? (
                <>
                  <div className="slot-icon">{info?.icon ?? '?'}</div>
                  <div className="slot-name">{info?.title ?? card}</div>
                  <div className="slot-badge">Personnel</div>
                </>
              ) : (
                <div className="slot-empty-label">—</div>
              )}
            </div>
          );
        })}
      </div>

      {isBidPhase && isCurrentPlayerTurn && pendingAction && pendingAction.type === 'network_bid' && (
        <div className="bid-panel">
          <span>Bid for <strong>{networkRow[pendingAction.slotIndex]}</strong>:</span>
          <input
            type="number"
            min={pendingAction.highestBid + 1}
            max={playerCoins}
            value={bidAmount}
            onChange={e => setBidAmount(parseInt(e.target.value) || 1)}
            className="bid-input"
          />
          <button
            className="action-buttons"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg-dark)',
              border: 'none',
              padding: '0.35rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => onPlaceBid(bidAmount)}
            disabled={bidAmount <= pendingAction.highestBid || bidAmount > playerCoins}
          >
            Place Bid ({bidAmount} coins)
          </button>
          <span className="bid-info">You have {playerCoins} coins</span>
        </div>
      )}
    </div>
  );
}
