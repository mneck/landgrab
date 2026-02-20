import type { PersonnelCard, EventCard, PoliticsCard } from "../types/game";

/** Personnel cards add an event card to hand and go to discard */
export const PERSONNEL_TO_EVENT: Record<PersonnelCard, EventCard | PoliticsCard | null> = {
  Builder: "Build",
  Elder: null,
  Liaison: "Procurement",
  Explorer: "Expedition",
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
