import { CARD_INFO } from "../data/cardData";

interface CardProps {
  /** Card identifier (CardType or PoliticsCard, etc.) */
  card: string;
  /** Optional: make card compact for hand display */
  compact?: boolean;
}

export function Card({ card, compact = false }: CardProps) {
  const info = CARD_INFO[card] ?? {
    title: card,
    description: "",
    icon: "❓",
    image: "",
  };

  const renderArt = () => (
    <div className="card__art">
      {info.image ? (
        <>
          <img
            src={info.image}
            alt=""
            className="card__art-image"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) (fallback as HTMLElement).style.display = "inline";
            }}
          />
          <span
            className="card__art-icon"
            style={{ display: "none" }}
            aria-hidden
          >
            {info.icon}
          </span>
        </>
      ) : (
        <span className="card__art-icon" aria-hidden>
          {info.icon}
        </span>
      )}
    </div>
  );

  if (compact) {
    return (
      <div
        className="card card--compact"
        data-card={card}
        title={info.description}
      >
        <div className="card__header">
          <span className="card__icon">{info.icon}</span>
          <span className="card__title">{info.title}</span>
        </div>
        {renderArt()}
      </div>
    );
  }

  return (
    <div className="card card--handheld" data-card={card}>
      <div className="card__title-bar">{info.title}</div>
      {renderArt()}
      <div className="card__description">{info.description}</div>
    </div>
  );
}
