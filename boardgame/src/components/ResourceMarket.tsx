import React from 'react';
import type { ResourceTrack } from '../game/types';

interface ResourceMarketProps {
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;
}

function MarketTrack({ label, icon, track }: { label: string; icon: string; track: ResourceTrack }) {
  return (
    <div className="market-track">
      <div className="market-track-label">{icon} {label}</div>
      <div className="market-track-slots">
        {track.map((filled, i) => (
          <div key={i} className={`market-slot ${filled ? 'slot-filled' : 'slot-available'}`}>
            <div className="market-slot-price">{i + 1}🪙</div>
            <div className="market-slot-indicator">{filled ? '●' : '○'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ResourceMarket: React.FC<ResourceMarketProps> = ({ woodMarket, oreMarket }) => {
  return (
    <div className="market-section">
      <div className="market-title">Resource Market</div>
      <div className="resource-markets">
        <MarketTrack label="Wood" icon="🪵" track={woodMarket} />
        <MarketTrack label="Ore" icon="⛏️" track={oreMarket} />
      </div>
      <div className="market-hint">
        Buy: cheapest filled slot | Sell: most expensive empty slot
      </div>
    </div>
  );
};
