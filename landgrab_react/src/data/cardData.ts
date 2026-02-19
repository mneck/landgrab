import type { CardType } from "../types/game";

/** Cards use emojis for prototyping (per LAN-13) */

export interface CardInfo {
  title: string;
  description: string;
  icon: string;
  image: string;
}

export const CARD_INFO: Record<CardType, CardInfo> = {
  Charter: {
    title: "Charter",
    description:
      "Place a Village, Infrastructure, Resort, or Industrial Zone. Reveal adjacent Fog hexes.",
    icon: "📜",
    image: "",
  },
  Builder: {
    title: "Builder",
    description: "Add a Build card to your hand; discard this card.",
    icon: "👷",
    image: "",
  },
  Elder: {
    title: "Elder",
    description:
      "Convert Fog to terrain and place Village, or add Reserve to hand.",
    icon: "👲",
    image: "",
  },
  Liaison: {
    title: "Liaison",
    description: "Add a Procurement card to your hand; discard this card.",
    icon: "👩‍💼",
    image: "",
  },
  Explorer: {
    title: "Explorer",
    description: "Add an Expedition card to your hand; discard this card.",
    icon: "🧗‍♀️",
    image: "",
  },
  Build: {
    title: "Build",
    description: "Pay 1 Wood, 1 Ore, 1 Coin to construct a building.",
    icon: "🏗️",
    image: "",
  },
  Procurement: {
    title: "Procurement",
    description: "Buy/sell resources or cards or generate resources from your buildings.",
    icon: "🧾",
    image: "",
  },
  Expedition: {
    title: "Expedition",
    description: "Reveal Fog hexes adjacent to a chosen tile. Cannot be used on a Fog tile.",
    icon: "🏕️",
    image: "",
  },
  Reserve: {
    title: "Reserve",
    description: "Place a Reserve on terrain adjacent to Village or Reserve.",
    icon: "🏞️",
    image: "",
  },
  Contact: {
    title: "Contact",
    description:
      "Convert a Fog hex to terrain and place a Village there (Chieftain only).",
    icon: "🤝",
    image: "",
  },
};
