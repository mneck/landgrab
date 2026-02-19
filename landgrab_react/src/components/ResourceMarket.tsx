import type { ResourceTrack } from "../types/game";

interface ResourceMarketProps {
  woodMarket: ResourceTrack;
  oreMarket: ResourceTrack;
}

const PRICES = [1, 2, 3, 4] as const;

function TrackRow({
  label,
  icon,
  track,
}: {
  label: string;
  icon: string;
  track: ResourceTrack;
}) {
  return (
    <div className="resource-track">
      <span className="resource-track__label">
        {icon} {label}
      </span>
      <div className="resource-track__slots">
        {PRICES.map((price, i) => (
          <div key={price} className="resource-track__slot">
            <span className="resource-track__price">{price} 💰</span>
            <span className="resource-track__count" title={`${track[i]} available`}>
              {track[i] > 0 ? "●".repeat(Math.min(track[i], 4)) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResourceMarket({ woodMarket, oreMarket }: ResourceMarketProps) {
  return (
    <div className="resource-market">
      <h3 className="market-row__title">Resource Market</h3>
      <p className="market-row__subtitle">
        Wood & Ore (buy 1–4 at price; sell to empty slots)
      </p>
      <TrackRow label="Wood" icon="🪵" track={woodMarket} />
      <TrackRow label="Ore" icon="⚙️" track={oreMarket} />
    </div>
  );
}
