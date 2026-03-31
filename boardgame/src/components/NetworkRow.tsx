import { useEffect, useState } from 'react';
import type { NetworkSlot, PendingAction } from '../game/types';
import { CARD_INFO } from '../data/cardData';

interface NetworkRowProps {
  networkRow: NetworkSlot[];
  pendingAction: PendingAction | null;
  isCurrentPlayerTurn: boolean;
  activeNetworkBidder: string | null;
  bidderCoins: number;
  onSelectSlot: (slotIndex: number) => void;
  onSubmitBid: (amount: number) => void;
}

export function NetworkRow({
  networkRow,
  pendingAction,
  isCurrentPlayerTurn,
  activeNetworkBidder,
  bidderCoins,
  onSelectSlot,
  onSubmitBid,
}: NetworkRowProps) {
  const [bidAmount, setBidAmount] = useState(1);
  const isNetworkPhase = pendingAction?.type === 'guide_network';
  const isBidPhase = pendingAction?.type === 'network_bid';

  const initiatorIndex =
    pendingAction?.type === 'network_bid' ? pendingAction.initiatorPlayerIndex : -1;
  const bidderIsInitiator =
    isBidPhase &&
    activeNetworkBidder !== null &&
    parseInt(activeNetworkBidder, 10) === initiatorIndex;

  const minBid = bidderIsInitiator ? 1 : 0;
  const maxBid = bidderCoins;

  useEffect(() => {
    if (isBidPhase) {
      setBidAmount(bidderIsInitiator ? 1 : 0);
    }
  }, [isBidPhase, bidderIsInitiator, activeNetworkBidder]);

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
                'market-slot-hoverable',
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

      {isBidPhase && isCurrentPlayerTurn && pendingAction && pendingAction.type === 'network_bid' && (
        <div className="bid-panel">
          <span>
            Blind bid — <strong>{networkRow[pendingAction.slotIndex]}</strong>
            {activeNetworkBidder != null && (
              <span className="bid-turn-hint">
                {' '}(Player {parseInt(activeNetworkBidder, 10) + 1}
                {bidderIsInitiator ? ', must bid ≥1' : ' — pass or bid'})
              </span>
            )}
            :
          </span>
          <input
            type="number"
            min={minBid}
            max={maxBid}
            value={bidAmount}
            onChange={e => setBidAmount(Math.max(minBid, parseInt(e.target.value, 10) || minBid))}
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
            onClick={() => onSubmitBid(bidAmount)}
            disabled={bidAmount < minBid || bidAmount > maxBid || (bidAmount > 0 && bidAmount > bidderCoins)}
          >
            Submit bid ({bidAmount} coins)
          </button>
          {!bidderIsInitiator && (
            <button
              type="button"
              className="btn-secondary"
              style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}
              onClick={() => onSubmitBid(0)}
            >
              Pass
            </button>
          )}
          <span className="bid-info">You have {bidderCoins} coins</span>
        </div>
      )}
    </div>
  );
}
