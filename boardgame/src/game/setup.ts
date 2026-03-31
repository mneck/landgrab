import type { LandgrabState, PlayerState, TableauCard, CardType, PersonnelCardType, PlayerType } from './types';
import { generateIsland } from './types';
import { shuffle } from './gameActions';

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

export function createInitialState(numPlayers: number): LandgrabState {
  const mapRadius = 2 + numPlayers;
  const fogRadius = mapRadius - 2;

  const defaultPlayerTypes: PlayerType[][] = [
    [],
    [],
    ["Hotelier", "Industrialist"],
    ["Hotelier", "Industrialist", "Chieftain"],
    ["Hotelier", "Industrialist", "Chieftain", "Bureaucrat"],
  ];
  const playerTypes = defaultPlayerTypes[numPlayers] ?? defaultPlayerTypes[2];

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

  const politicsRow = ['Graft', 'Import', 'Airstrip', 'Expropriation'];
  const politicsPool: string[] = [
    'Bribe', 'Zoning', 'Conservation', 'UrbanPlanning', 'Dividends',
    'NGOBacking', 'Propaganda', 'Graft', 'LocalElections', 'Reorganization',
    'Import', 'Export', 'Logging', 'Forestry', 'LandClaims', 'Subsidy',
    'Boycotting', 'Protests', 'Taxation', 'Levy', 'Expropriation', 'Airstrip',
  ];
  const politicsDeck = shuffle([...politicsPool, ...politicsPool]);

  const tiles = generateIsland(mapRadius, fogRadius);
  const totalFog = Object.values(tiles).filter(t => t.type === 'Fog').length;

  return {
    tiles,
    mapRadius,
    fogRadius,
    totalFog,
    fogRevealed: 0,
    thresholdReached: false,
    revealedPoliticsSinceThreshold: 0,
    mandateIntervalIndex: 0,
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
  };
}
