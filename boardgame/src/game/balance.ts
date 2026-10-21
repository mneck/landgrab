/**
 * Every tunable number in one place. The spec calls these "untested guesses";
 * values marked (spec) come straight from IMPLEMENTATION_SPEC.md, the rest
 * were set by the bot harness and are recorded in rules/rules_v3_implemented.md.
 */
import type { PlayerType, Resources } from './types';

export const BALANCE = {
  actionsPerTurn: 2,
  tableauCap: 8,
  seatsToWin: 3,
  roundCap: 40,

  startingResources: {
    Hotelier: { coins: 6, wood: 1, ore: 1, votes: 1 },
    Industrialist: { coins: 4, wood: 1, ore: 1, votes: 1 },
    Bureaucrat: { coins: 4, wood: 0, ore: 0, votes: 3 },
    Chieftain: { coins: 2, wood: 0, ore: 0, votes: 1 },
  } as Record<PlayerType, Resources>,

  // --- Chieftain (spec 3.1) ---
  grievanceCap: 4,
  maxVillages: 4,
  presenceSupply: 18,
  interruptCost: 1,
  counselCost: 1,
  counselVotes: 2,
  reclamationCost: 3,
  grievance: {
    buildingNearPresence: 1,
    extractionNearPresence: 1,
    villageDisplaced: 2,
    siteExcavated: 3,
    erosionNearPresence: 1,
  },

  // --- Industrialist (spec 3.2) ---
  extractYield: 2,
  excavateYield: 3,
  zoneCost: { coins: 1, wood: 1, ore: 1 } as Partial<Resources>,

  // --- Hotelier (spec 3.3) ---
  holdingSupply: 6,
  hotelCost: { wood: 1 } as Partial<Resources>,
  museumCoinsPerSignificance: 2,

  // --- Bureaucrat (spec 3.4) ---
  publicWorkCost: { votes: 2 } as Partial<Resources>,
  designateCost: { votes: 1 } as Partial<Resources>,
  compulsoryPurchasePayment: 2,
  objectionCost: 1,
  objectionPenalty: 2,

  // --- Mandates (spec 3.5) ---
  /** Base cost in the faction's own currency; Chieftain: Standing required. */
  mandateBase: { Hotelier: 10, Industrialist: 12, Bureaucrat: 12, Chieftain: 12 } as Record<PlayerType, number>,
  mandatePerSeat: { Hotelier: 3, Industrialist: 3, Bureaucrat: 3, Chieftain: 5 } as Record<PlayerType, number>,
  /** Own-currency units per vote of slot surcharge (spec 3.5). */
  mandateSlotRate: { Hotelier: 2, Industrialist: 2, Bureaucrat: 1, Chieftain: 1 } as Record<PlayerType, number>,
  mandatesPerPlayer: 2,
  mandateExtra: 1,
  mandateIntervals: [3, 3, 2],
  mandateRecurringInterval: 2,
  /** Fraction of non-sea cells that must be revealed before Mandates appear (spec 4.1). */
  mandateFogThreshold: 0.5,
  stimulusAmount: 4,
  endorsementCover: 3,

  // --- Erosion and Last Season (spec 5) ---
  erosionMinCluster: 3,
  lastSeasonThresholds: [8, 16, 24] as const,
  stage2HotelPenalty: 1,

  // --- Markets ---
  marketSlots: 4,
} as const;

export const WIN_CURRENCY_LABEL: Record<PlayerType, string> = {
  Hotelier: 'coins',
  Industrialist: 'wood + ore',
  Bureaucrat: 'votes',
  Chieftain: 'Standing',
};
