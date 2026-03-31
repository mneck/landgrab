import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/setup';

describe('createInitialState', () => {
  describe('2-player game', () => {
    const state = createInitialState(2);

    it('creates exactly 2 players', () => {
      expect(state.players).toHaveLength(2);
    });

    it('assigns Hotelier and Industrialist', () => {
      expect(state.players[0].type).toBe('Hotelier');
      expect(state.players[1].type).toBe('Industrialist');
    });

    it('gives each player 5 coins, 1 wood, 1 ore, 1 vote', () => {
      for (const p of state.players) {
        expect(p.resources).toEqual({ coins: 5, wood: 1, ore: 1, votes: 1 });
      }
    });

    it('starts all players with 0 seats', () => {
      for (const p of state.players) {
        expect(p.seats).toBe(0);
      }
    });

    it('gives non-Chieftain players Builder, Guide, Liaison, Charter', () => {
      for (const p of state.players) {
        const cardTypes = p.tableau.map(c => c.cardType);
        expect(cardTypes).toEqual(['Builder', 'Guide', 'Liaison', 'Charter']);
      }
    });

    it('sets mapRadius to 4 (2 + numPlayers)', () => {
      expect(state.mapRadius).toBe(4);
    });
  });

  describe('3-player game', () => {
    const state = createInitialState(3);

    it('creates exactly 3 players', () => {
      expect(state.players).toHaveLength(3);
    });

    it('assigns Hotelier, Industrialist, Chieftain', () => {
      expect(state.players[0].type).toBe('Hotelier');
      expect(state.players[1].type).toBe('Industrialist');
      expect(state.players[2].type).toBe('Chieftain');
    });

    it('gives Chieftain Elder instead of Builder', () => {
      const chieftain = state.players[2];
      const cardTypes = chieftain.tableau.map(c => c.cardType);
      expect(cardTypes).toEqual(['Elder', 'Guide', 'Liaison', 'Charter']);
      expect(cardTypes).not.toContain('Builder');
    });

    it('gives non-Chieftain players Builder (not Elder)', () => {
      for (const p of state.players.filter(p => p.type !== 'Chieftain')) {
        const cardTypes = p.tableau.map(c => c.cardType);
        expect(cardTypes).toContain('Builder');
        expect(cardTypes).not.toContain('Elder');
      }
    });
  });

  describe('4-player game', () => {
    const state = createInitialState(4);

    it('creates exactly 4 players', () => {
      expect(state.players).toHaveLength(4);
    });

    it('assigns Hotelier, Industrialist, Chieftain, Bureaucrat', () => {
      expect(state.players.map(p => p.type)).toEqual([
        'Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat',
      ]);
    });

    it('sets mapRadius to 6 (2 + numPlayers)', () => {
      expect(state.mapRadius).toBe(6);
    });
  });

  describe('initial board state', () => {
    const state = createInitialState(2);

    it('starts with 2 actions per turn', () => {
      expect(state.actionsRemainingThisTurn).toBe(2);
    });

    it('starts with no pending action', () => {
      expect(state.pendingAction).toBeNull();
    });

    it('starts with empty tokensUsedThisTurn', () => {
      expect(state.tokensUsedThisTurn).toEqual([]);
    });

    it('has no winner at start', () => {
      expect(state.winner).toBeUndefined();
    });

    it('defaults winSeatThreshold to 2 seats', () => {
      expect(state.winSeatThreshold).toBe(2);
    });

    it('starts with no fog revealed', () => {
      expect(state.fogRevealed).toBe(0);
    });

    it('starts with fog threshold not reached', () => {
      expect(state.thresholdReached).toBe(false);
    });

    it('has 4 cards in the network row', () => {
      expect(state.networkRow).toHaveLength(4);
    });

    it('has 4 cards in the politics row', () => {
      expect(state.politicsRow).toHaveLength(4);
    });

    it('starts politics row as Graft, Import, Airstrip, Expropriation', () => {
      expect(state.politicsRow).toEqual(['Graft', 'Import', 'Airstrip', 'Expropriation']);
    });

    it('initialises wood and ore markets', () => {
      expect(state.woodMarket).toEqual([0, 0, 1, 1]);
      expect(state.oreMarket).toEqual([0, 0, 1, 1]);
    });

    it('generates tiles on the hex map', () => {
      const tileCount = Object.keys(state.tiles).length;
      expect(tileCount).toBeGreaterThan(0);
    });

    it('has no buildings on the map at start', () => {
      const buildings = Object.values(state.tiles).filter(t => t.building);
      expect(buildings).toHaveLength(0);
    });

    it('has fog tiles in the centre of the map', () => {
      const fogTiles = Object.values(state.tiles).filter(t => t.type === 'Fog');
      expect(fogTiles.length).toBeGreaterThan(0);
    });
  });

  describe('tableau card metadata', () => {
    const state = createInitialState(2);

    it('marks Charter as Event category', () => {
      const charter = state.players[0].tableau.find(c => c.cardType === 'Charter');
      expect(charter?.category).toBe('Event');
    });

    it('marks Builder as Personnel category', () => {
      const builder = state.players[0].tableau.find(c => c.cardType === 'Builder');
      expect(builder?.category).toBe('Personnel');
    });

    it('gives each card a unique instanceId', () => {
      const ids = state.players.flatMap(p => p.tableau.map(c => c.instanceId));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
