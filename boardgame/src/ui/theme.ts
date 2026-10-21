import type { BuildingType, PlayerType, VisibleTerrain } from '../game/types';

export const FACTION_COLOR: Record<PlayerType, string> = {
  Hotelier: '#e67e22',
  Industrialist: '#3d8fd1',
  Bureaucrat: '#9b59b6',
  Chieftain: '#2ecc71',
};

export const FACTION_ICON: Record<PlayerType, string> = {
  Hotelier: '🏨',
  Industrialist: '🏭',
  Chieftain: '🏕️',
  Bureaucrat: '🏛️',
};

export const FACTION_BLURB: Record<PlayerType, string> = {
  Hotelier: 'Buys Holdings, builds Hotels and sells them. Wins with coins.',
  Industrialist: 'Builds Zones and extracts wood and ore, scarring the land. Wins with wood + ore.',
  Bureaucrat: 'Builds Public Works, designates land and collects votes from everyone’s buildings.',
  Chieftain: 'Spreads Presence and Villages; Standing is the largest connected claim. Spends Grievance to push back.',
};

export const TERRAIN_COLOR: Record<VisibleTerrain, string> = {
  Ocean: '#1f4a63',
  CoastalWater: '#3a7e9e',
  CraterLake: '#4e9ec0',
  Beach: '#e4d5a8',
  Plains: '#b9c984',
  Rainforest: '#5d8a51',
  Hills: '#9c9769',
  Mountain: '#8b837a',
  Scar: '#5a3a2e',
  Unknown: '#2b2b33',
};

export const BUILDING_ICON: Record<BuildingType, string> = {
  Hotel: '🏨',
  IndustrialZone: '🏭',
  PublicWork: '⛲',
  Housing: '🏠',
  Museum: '🏺',
};

export const RESOURCE_ICON = { coins: '💰', wood: '🪵', ore: '⚙️', votes: '🗳️' } as const;
