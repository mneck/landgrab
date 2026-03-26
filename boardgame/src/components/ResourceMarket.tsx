import type { ResourceTrack } from '../game/types';

interface ResourceMarketProps {
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;
}

function Track({ label, icon, track }: { label: string; icon: string; track: ResourceTrack }) {
  return (
    <div className="resource-track">
      <span className="resource-track__label">{icon} {label}</span>
      <div className="resource-track__slots">
        {track.map((filled, i) => (
          <div key={i} className="resource-track__slot">
            <div className="resource-track__price">{i + 1} 💰</div>
            <div className="resource-track__count">{filled ? '●' : '○'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResourceMarket({ woodMarket, oreMarket }: ResourceMarketProps) {
  return (
    <div className="resource-market">
      <h4 className="market-row__title">Resources</h4>
      <p className="market-row__subtitle">Buy cheapest filled · Sell most expensive empty</p>
      <Track label="Wood" icon="🪵" track={woodMarket} />
      <Track label="Ore" icon="⚙️" track={oreMarket} />
    </div>
  );
}
