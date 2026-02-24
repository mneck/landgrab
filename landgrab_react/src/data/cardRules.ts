import type { PersonnelCard, EventCard, PoliticsCard } from "../types/game";

/** Personnel cards that add an event card to hand when played; Builder/Liaison/Explorer take their action directly instead */
export const PERSONNEL_TO_EVENT: Record<PersonnelCard, EventCard | PoliticsCard | null> = {
  Builder: null,
  Elder: null,
  Liaison: null,
  Explorer: null,
  Fixer: "Graft",
  Broker: null,
  Forester: null,
  Consultant: "Reorganization",
  Advocate: "Taxation",
};

/** Elder choice: add Contact (convert Fog + Village) or Reserve */
export const ELDER_EVENT_OPTIONS: (EventCard | PoliticsCard)[] = ["Contact", "Reserve"];

/** Broker choice: add Import or Export */
export const BROKER_EVENT_OPTIONS: PoliticsCard[] = ["Import", "Export"];

/** Forester choice: add Logging or Forestry */
export const FORESTER_EVENT_OPTIONS: PoliticsCard[] = ["Logging", "Forestry"];

export const PERSONNEL_CARDS: PersonnelCard[] = [
  "Builder",
  "Elder",
  "Liaison",
  "Explorer",
  "Fixer",
  "Broker",
  "Forester",
  "Consultant",
  "Advocate",
];

export const POLITICS_COSTS = [1, 2, 3, 4] as const;
/** Vote cost per Politics slot: Slot 0 = 0, Slots 1–3 = 1 */
export const POLITICS_VOTE_COSTS = [0, 1, 1, 1] as const;
