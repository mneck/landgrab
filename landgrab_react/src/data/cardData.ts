/** Cards use emojis for prototyping (per LAN-13) */

export interface CardInfo {
  title: string;
  description: string;
  icon: string;
  image: string;
}

export const CARD_INFO: Record<string, CardInfo> = {
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
    icon: "👷🏼",
    image: "",
  },
  Elder: {
    title: "Elder",
    description:
      "Convert Fog to terrain and place Village, or add Reserve to hand.",
    icon: "👲🏾",
    image: "",
  },
  Liaison: {
    title: "Liaison",
    description: "Add a Procurement card to your hand; discard this card.",
    icon: "👩🏻‍💼",
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
  /* Politics-specific cards */
  Bribe: {
    title: "Bribe",
    description: "Pay 1 Coin and remove 1 card from the Politics market.",
    icon: "💵",
    image: "",
  },
  Zoning: {
    title: "Zoning",
    description:
      "Place a Zoning marker on a Sand or Field hex adjacent to your building.",
    icon: "📋",
    image: "",
  },
  UrbanPlanning: {
    title: "Urban Planning",
    description: "Place an additional building on a hex you control; double production.",
    icon: "🏙️",
    image: "",
  },
  Dividends: {
    title: "Dividends",
    description: "Gain 1 Coin per Building you control.",
    icon: "📈",
    image: "",
  },
  NGOBacking: {
    title: "NGO Backing",
    description: "Chieftain gains 1 Coin per Village.",
    icon: "🌍",
    image: "",
  },
  Propaganda: {
    title: "Propaganda",
    description: "Pay 1 Coin and remove 1 Vote from the Bureaucrat.",
    icon: "📢",
    image: "",
  },
};
