import type { LandgrabState, PlayerState, TableauCard, CardType, PersonnelCardType, PlayerType } from './types';
import { SEATS_TO_WIN } from './types';
import { generateIsland } from './types';
import { shuffle } from './gameActions';

export const DEFAULT_POLITICS_ROW: string[] = ['Graft', 'Import', 'Airstrip', 'Expropriation'];

/** One copy of each Politics card; the deck holds two copies. */
export const DEFAULT_POLITICS_POOL: string[] = [
  'Bribe', 'Zoning', 'Conservation', 'UrbanPlanning', 'Dividends',
  'NGOBacking', 'Propaganda', 'Graft', 'LocalElections', 'Reorganization',
  'Import', 'Export', 'Logging', 'Forestry', 'LandClaims', 'Subsidy',
  'Boycotting', 'Protests', 'Taxation', 'Levy', 'Expropriation', 'Airstrip',
  'Fisheries',
];

function createStartingTableau(type: PlayerType, playerIdx: number): TableauCard[] {
  const base: CardType[] = type === 'Chieftain'
    ? ['Elder', 'Guide', 'Liaison', 'Charter']
    : ['Builder', 'Guide', 'Liaison', 'Charter'];
  return base.map((cardType, idx) => ({
    instanceId: `${cardType}_${playerIdx}_${idx}`,
    cardType: cardType as CardType,
    category: cardType === 'Charter' ? 'Event' : 'Personnel',
  }));
}

export function createInitialState(
  numPlayers: number,
  options?: {
    winSeatThreshold?: number;
    playerTypes?: PlayerType[];
    mapSeed?: number;
    /** Unshuffled Politics deck (default: two copies of {@link DEFAULT_POLITICS_POOL}). For balance playtests. */
    politicsDeck?: string[];
    /** Opening Politics row (default {@link DEFAULT_POLITICS_ROW}). For balance playtests. */
    politicsRow?: string[];
  }
): LandgrabState {
  const mapRadius = 2 + numPlayers;
  const fogRadius = mapRadius - 2;

  const defaultPlayerTypes: PlayerType[][] = [
    [],
    [],
    ["Hotelier", "Industrialist"],
    ["Hotelier", "Industrialist", "Chieftain"],
    ["Hotelier", "Industrialist", "Chieftain", "Bureaucrat"],
  ];
  const playerTypes =
    options?.playerTypes ?? (defaultPlayerTypes[numPlayers] ?? defaultPlayerTypes[2]);
  if (playerTypes.length !== numPlayers) {
    throw new Error(
      `createInitialState: playerTypes.length (${playerTypes.length}) must equal numPlayers (${numPlayers})`
    );
  }

  const players: PlayerState[] = playerTypes.map((type, i) => ({
    type,
    tableau: createStartingTableau(type, i),
    resources: { coins: 5, wood: 1, ore: 1, votes: 1 },
    seats: 0,
  }));

  const networkRow = ['Broker', 'Forester', 'Fixer', 'Advocate'];
  const networkDeckPool: PersonnelCardType[] = [
    'Elder', 'Fixer', 'Broker', 'Forester', 'Consultant', 'Advocate',
    'Elder', 'Fixer', 'Broker', 'Forester', 'Consultant', 'Advocate',
  ];
  const networkDeck = shuffle([...networkDeckPool]);

  const politicsRow = [...(options?.politicsRow ?? DEFAULT_POLITICS_ROW)];
  const politicsDeck = shuffle([
    ...(options?.politicsDeck ?? [...DEFAULT_POLITICS_POOL, ...DEFAULT_POLITICS_POOL]),
  ]);

  const mapSeed = options?.mapSeed ?? Math.floor(Math.random() * 2 ** 31);
  const tiles = generateIsland(mapRadius, fogRadius, mapSeed);
  const totalFog = Object.values(tiles).filter(t => t.type === 'Fog').length;

  const startingPlayOrder = playerTypes.map((_, i) => String(i));

  return {
    tiles,
    mapSeed,
    mapRadius,
    fogRadius,
    totalFog,
    fogRevealed: 0,
    thresholdReached: false,
    revealedPoliticsSinceThreshold: 0,
    mandateIntervalIndex: 0,
    winSeatThreshold: options?.winSeatThreshold ?? SEATS_TO_WIN,
    players,
    tokensUsedThisTurn: [],
    actionsRemainingThisTurn: 2,
    pendingAction: null,
    networkRow,
    networkDeck,
    politicsRow,
    politicsDeck,
    woodMarket: [0, 0, 1, 1],
    oreMarket: [0, 0, 1, 1],
    startingBidPhase: {
      amounts: playerTypes.map(() => null),
    },
    startingPlayOrder,
  };
}
