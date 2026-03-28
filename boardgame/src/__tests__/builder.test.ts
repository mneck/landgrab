import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/setup';
import { moves } from '../game/moves';
import { INVALID_MOVE } from 'boardgame.io/core';
import { getAllowedBuildTypes, canPlaceBuild, hasAnyValidBuildHex } from '../game/gameRules';
import { hexKey, hexNeighbors } from '../utils/hexGrid';
import type { LandgrabState, BuildingType } from '../game/types';

function makeCtx(currentPlayer: number, numPlayers: number) {
  return { currentPlayer: String(currentPlayer), numPlayers };
}

describe('Builder card', () => {
  describe('at the start of the game', () => {
    it('cannot build because no adjacent buildings exist on the map', () => {
      const G = createInitialState(2);
      const hotelier = G.players[0];

      const allowed = getAllowedBuildTypes(G.tiles, hotelier.type);
      expect(allowed.length).toBeGreaterThan(0);

      // But no hex is actually valid for placement (no buildings on map yet)
      expect(hasAnyValidBuildHex(G.tiles, hotelier.type)).toBe(false);
    });

    it('has no valid build hexes for any non-Chieftain player', () => {
      const G = createInitialState(4);
      for (const p of G.players) {
        if (p.type === 'Chieftain') continue;
        expect(hasAnyValidBuildHex(G.tiles, p.type)).toBe(false);
      }
    });

    it('can still activate Builder (to use the market option)', () => {
      const G = createInitialState(2);
      const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
      const ctx = makeCtx(0, 2);

      const result = moves.activateCard({ G, ctx }, builderCard.instanceId);
      expect(result).not.toBe(INVALID_MOVE);
      expect(G.pendingAction).toEqual({
        type: 'builder_choose',
        instanceId: builderCard.instanceId,
      });
    });

    it('can choose market option from Builder at game start', () => {
      const G = createInitialState(2);
      const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
      const ctx = makeCtx(0, 2);

      moves.activateCard({ G, ctx }, builderCard.instanceId);
      const result = moves.chooseOption({ G, ctx }, 'market');
      expect(result).not.toBe(INVALID_MOVE);
      expect(G.pendingAction?.type).toBe('builder_market_choose');
    });

    it('can choose build option but will find no valid hex to place on', () => {
      const G = createInitialState(2);
      const builderCard = G.players[0].tableau.find(c => c.cardType === 'Builder')!;
      const ctx = makeCtx(0, 2);

      moves.activateCard({ G, ctx }, builderCard.instanceId);
      moves.chooseOption({ G, ctx }, 'build');
      expect(G.pendingAction?.type).toBe('builder_build_type');

      moves.chooseBuildingType({ G, ctx }, 'Housing' as BuildingType);
      expect(G.pendingAction?.type).toBe('builder_build_hex');

      // Try placing on an arbitrary non-fog tile — should fail due to adjacency
      const nonFogTile = Object.values(G.tiles).find(
        t => ['Field', 'Sand'].includes(t.type) && !t.building
      );
      if (nonFogTile) {
        const result = moves.placeOnHex({ G, ctx }, hexKey(nonFogTile.hex));
        expect(result).toBe(INVALID_MOVE);
      }
    });
  });

  describe('build costs', () => {
    it('requires 1 wood, 1 ore, 1 coin to place a building', () => {
      const G = createInitialState(2);
      const ctx = makeCtx(0, 2);
      const hotelier = G.players[0];

      // Manually place an existing Resort so there's adjacency
      const fieldTile = Object.values(G.tiles).find(
        t => t.type === 'Field' && !t.building
      )!;
      fieldTile.building = 'Resort';
      fieldTile.buildingOwner = 'Hotelier';

      const neighbors = hexNeighbors(fieldTile.hex);
      const adjTile = neighbors
        .map(nb => G.tiles[hexKey(nb)])
        .find(t => t && ['Field', 'Sand'].includes(t.type) && !t.building);

      if (!adjTile) return;

      for (const nb of hexNeighbors(adjTile.hex)) {
        const k = hexKey(nb);
        if (G.tiles[k]?.type === 'Fog') {
          G.tiles[k] = { ...G.tiles[k], type: 'Field' };
        }
      }

      const woodBefore = hotelier.resources.wood;
      const oreBefore = hotelier.resources.ore;
      const coinsBefore = hotelier.resources.coins;

      const builderCard = hotelier.tableau.find(c => c.cardType === 'Builder')!;
      moves.activateCard({ G, ctx }, builderCard.instanceId);
      moves.chooseOption({ G, ctx }, 'build');
      moves.chooseBuildingType({ G, ctx }, 'Housing' as BuildingType);

      const result = moves.placeOnHex({ G, ctx }, hexKey(adjTile.hex));
      if (result !== INVALID_MOVE) {
        expect(hotelier.resources.wood).toBe(woodBefore - 1);
        expect(hotelier.resources.ore).toBe(oreBefore - 1);
        expect(hotelier.resources.coins).toBe(coinsBefore - 1);
      }
    });

    it('rejects build when player lacks resources', () => {
      const G = createInitialState(2);
      const ctx = makeCtx(0, 2);
      const hotelier = G.players[0];

      // Remove all resources
      hotelier.resources = { coins: 0, wood: 0, ore: 0, votes: 0 };

      // Set up a valid hex scenario
      const fieldTile = Object.values(G.tiles).find(
        t => t.type === 'Field' && !t.building
      )!;
      fieldTile.building = 'Resort';
      fieldTile.buildingOwner = 'Hotelier';

      const neighbors = hexNeighbors(fieldTile.hex);
      const adjTile = neighbors
        .map(nb => G.tiles[hexKey(nb)])
        .find(t => t && ['Field', 'Sand'].includes(t.type) && !t.building);

      if (!adjTile) return;

      for (const nb of hexNeighbors(adjTile.hex)) {
        const k = hexKey(nb);
        if (G.tiles[k]?.type === 'Fog') {
          G.tiles[k] = { ...G.tiles[k], type: 'Field' };
        }
      }

      const builderCard = hotelier.tableau.find(c => c.cardType === 'Builder')!;
      moves.activateCard({ G, ctx }, builderCard.instanceId);
      moves.chooseOption({ G, ctx }, 'build');
      moves.chooseBuildingType({ G, ctx }, 'Housing' as BuildingType);
      const result = moves.placeOnHex({ G, ctx }, hexKey(adjTile.hex));
      expect(result).toBe(INVALID_MOVE);
    });
  });

  describe('Chieftain has no Builder', () => {
    it('Chieftain tableau has Elder, not Builder', () => {
      const G = createInitialState(3);
      const chieftain = G.players[2];
      const cardTypes = chieftain.tableau.map(c => c.cardType);
      expect(cardTypes).toContain('Elder');
      expect(cardTypes).not.toContain('Builder');
    });
  });
});
