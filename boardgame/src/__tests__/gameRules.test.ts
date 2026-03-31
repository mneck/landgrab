import { describe, it, expect } from 'vitest';
import {
  getAllowedBuildTypes,
  canPlaceBuild,
  canPlaceCharter,
  canPlaceReserve,
  canPlaceConservation,
  canPlaceFisheries,
  getCharterBuilding,
  countProductionAndSupport,
  canAffordMandate,
  runProcurementForPlayer,
  BUILD_OPTIONS,
} from '../game/gameRules';
import { rotatePoliticsEndOfRound } from '../game/gameActions';
import { hexKey, hexNeighbors } from '../utils/hexGrid';
import { createInitialState } from '../game/setup';
import type { LandgrabState, Tile } from '../game/types';

function findFieldTileWithNoFogNeighbors(tiles: LandgrabState['tiles']): Tile | undefined {
  return Object.values(tiles).find(t => {
    if (t.type !== 'Field' || t.building) return false;
    return hexNeighbors(t.hex).every(nb => {
      const nt = tiles[hexKey(nb)];
      return !nt || nt.type !== 'Fog';
    });
  });
}

describe('getAllowedBuildTypes', () => {
  it('returns Housing and Resort for Hotelier', () => {
    const G = createInitialState(2);
    const allowed = getAllowedBuildTypes(G.tiles, 'Hotelier');
    expect(allowed).toContain('Housing');
    expect(allowed).toContain('Resort');
  });

  it('returns Farm and IndustrialZone for Industrialist', () => {
    const G = createInitialState(2);
    const allowed = getAllowedBuildTypes(G.tiles, 'Industrialist');
    expect(allowed).toContain('Farm');
    expect(allowed).toContain('IndustrialZone');
  });

  it('returns CivicOffice and Infrastructure for Bureaucrat', () => {
    const G = createInitialState(4);
    const allowed = getAllowedBuildTypes(G.tiles, 'Bureaucrat');
    expect(allowed).toContain('CivicOffice');
    expect(allowed).toContain('Infrastructure');
  });

  it('returns empty array for Chieftain (not in BUILD_OPTIONS)', () => {
    const G = createInitialState(3);
    const allowed = getAllowedBuildTypes(G.tiles, 'Chieftain');
    expect(allowed).toEqual([]);
  });

  it('caps production buildings when no support buildings exist', () => {
    const G = createInitialState(2);
    // Hotelier: can build at most 1 Resort without any Housing (maxProduction = 2*0 + 1 = 1)
    const tile1 = Object.values(G.tiles).find(t => t.type === 'Field' && !t.building)!;
    tile1.building = 'Resort';
    tile1.buildingOwner = 'Hotelier';

    const allowed = getAllowedBuildTypes(G.tiles, 'Hotelier');
    // Already has 1 Resort and 0 Housing → maxProduction = 1, so Resort should be disallowed
    expect(allowed).toContain('Housing');
    expect(allowed).not.toContain('Resort');
  });

  it('allows more production buildings when support buildings exist', () => {
    const G = createInitialState(2);
    const tiles = Object.values(G.tiles).filter(t => t.type === 'Field' && !t.building);

    // Place 1 Housing (support) for Hotelier
    tiles[0].building = 'Housing';
    tiles[0].buildingOwner = 'Hotelier';

    // With 1 Housing: maxProduction = 2*1 + 1 = 3 → can build up to 3 Resorts
    const allowed = getAllowedBuildTypes(G.tiles, 'Hotelier');
    expect(allowed).toContain('Resort');
    expect(allowed).toContain('Housing');
  });
});

describe('canPlaceBuild', () => {
  it('rejects placement on Fog tiles', () => {
    const G = createInitialState(2);
    const fogTile = Object.values(G.tiles).find(t => t.type === 'Fog');
    if (!fogTile) return;
    expect(canPlaceBuild(G.tiles, fogTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });

  it('rejects placement on Water tiles', () => {
    const G = createInitialState(2);
    const waterTile = Object.values(G.tiles).find(t => t.type === 'Water');
    if (!waterTile) return;
    expect(canPlaceBuild(G.tiles, waterTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });

  it('rejects placement on Mountain tiles', () => {
    const G = createInitialState(2);
    const mountainTile = Object.values(G.tiles).find(t => t.type === 'Mountain');
    if (!mountainTile) return;
    expect(canPlaceBuild(G.tiles, mountainTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });

  it('rejects placement on a tile that already has a building', () => {
    const G = createInitialState(2);
    const fieldTile = Object.values(G.tiles).find(t => t.type === 'Field')!;
    fieldTile.building = 'Resort';
    fieldTile.buildingOwner = 'Hotelier';
    expect(canPlaceBuild(G.tiles, fieldTile.hex, 'Hotelier', 'Housing')).toBe(false);
  });

  it('rejects placement without adjacent friendly buildings', () => {
    const G = createInitialState(2);
    const fieldTile = findFieldTileWithNoFogNeighbors(G.tiles);
    if (!fieldTile) return;
    expect(canPlaceBuild(G.tiles, fieldTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });

  it('rejects placement adjacent to Fog', () => {
    const G = createInitialState(2);
    // Find a Field tile that IS adjacent to fog
    const fieldNearFog = Object.values(G.tiles).find(t => {
      if (t.type !== 'Field' || t.building) return false;
      return hexNeighbors(t.hex).some(nb => {
        const nt = G.tiles[hexKey(nb)];
        return nt?.type === 'Fog';
      });
    });
    if (!fieldNearFog) return;

    // Even with adjacent buildings, fog adjacency should block
    const nbs = hexNeighbors(fieldNearFog.hex);
    for (const nb of nbs) {
      const k = hexKey(nb);
      if (G.tiles[k] && G.tiles[k].type !== 'Fog') {
        G.tiles[k].building = 'Resort';
        G.tiles[k].buildingOwner = 'Hotelier';
        break;
      }
    }
    expect(canPlaceBuild(G.tiles, fieldNearFog.hex, 'Hotelier', 'Housing')).toBe(false);
  });

  it('rejects placement when zoning belongs to another player', () => {
    const G = createInitialState(2);
    const tile = findFieldTileWithNoFogNeighbors(G.tiles);
    if (!tile) return;
    tile.zoningOwner = 'Industrialist';
    expect(canPlaceBuild(G.tiles, tile.hex, 'Hotelier', 'Resort')).toBe(false);
  });
});

describe('canPlaceCharter', () => {
  it('rejects placement on Fog', () => {
    const G = createInitialState(2);
    const fogTile = Object.values(G.tiles).find(t => t.type === 'Fog');
    if (!fogTile) return;
    expect(canPlaceCharter(G.tiles, fogTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });

  it('allows Resort on Field', () => {
    const G = createInitialState(2);
    const fieldTile = Object.values(G.tiles).find(t => t.type === 'Field');
    if (!fieldTile) return;
    expect(canPlaceCharter(G.tiles, fieldTile.hex, 'Hotelier', 'Resort')).toBe(true);
  });

  it('allows Village on Forest', () => {
    const G = createInitialState(2);
    const forestTile = Object.values(G.tiles).find(t => t.type === 'Forest');
    if (!forestTile) return;
    expect(canPlaceCharter(G.tiles, forestTile.hex, 'Chieftain', 'Village')).toBe(true);
  });

  it('rejects Resort on Forest (only Village allowed on Forest)', () => {
    const G = createInitialState(2);
    const forestTile = Object.values(G.tiles).find(t => t.type === 'Forest');
    if (!forestTile) return;
    expect(canPlaceCharter(G.tiles, forestTile.hex, 'Hotelier', 'Resort')).toBe(false);
  });
});

describe('getCharterBuilding', () => {
  it('returns Resort for Hotelier', () => {
    expect(getCharterBuilding('Hotelier')).toBe('Resort');
  });

  it('returns IndustrialZone for Industrialist', () => {
    expect(getCharterBuilding('Industrialist')).toBe('IndustrialZone');
  });

  it('returns Infrastructure for Bureaucrat', () => {
    expect(getCharterBuilding('Bureaucrat')).toBe('Infrastructure');
  });

  it('returns Village for Chieftain', () => {
    expect(getCharterBuilding('Chieftain')).toBe('Village');
  });
});

describe('canPlaceConservation', () => {
  it('allows placement on a Forest tile', () => {
    const G = createInitialState(2);
    const forest = Object.values(G.tiles).find(t => t.type === 'Forest' && !t.building);
    if (!forest) return;
    expect(canPlaceConservation(G.tiles, forest.hex)).toBe(true);
  });

  it('rejects placement on non-Forest tile', () => {
    const G = createInitialState(2);
    const field = Object.values(G.tiles).find(t => t.type === 'Field');
    if (!field) return;
    expect(canPlaceConservation(G.tiles, field.hex)).toBe(false);
  });

  it('rejects placement on Forest that already has conservation', () => {
    const G = createInitialState(2);
    const forest = Object.values(G.tiles).find(t => t.type === 'Forest' && !t.building);
    if (!forest) return;
    forest.hasConservation = true;
    expect(canPlaceConservation(G.tiles, forest.hex)).toBe(false);
  });
});

describe('countProductionAndSupport', () => {
  it('returns 0/0 when no buildings placed', () => {
    const G = createInitialState(2);
    expect(countProductionAndSupport(G.tiles, 'Hotelier')).toEqual({
      production: 0,
      support: 0,
    });
  });

  it('counts Resorts as production and Housing as support for Hotelier', () => {
    const G = createInitialState(2);
    const fields = Object.values(G.tiles).filter(t => t.type === 'Field' && !t.building);

    fields[0].building = 'Resort';
    fields[0].buildingOwner = 'Hotelier';
    fields[1].building = 'Housing';
    fields[1].buildingOwner = 'Hotelier';
    fields[2].building = 'Resort';
    fields[2].buildingOwner = 'Hotelier';

    expect(countProductionAndSupport(G.tiles, 'Hotelier')).toEqual({
      production: 2,
      support: 1,
    });
  });

  it('ignores buildings belonging to other players', () => {
    const G = createInitialState(2);
    const fields = Object.values(G.tiles).filter(t => t.type === 'Field' && !t.building);

    fields[0].building = 'Resort';
    fields[0].buildingOwner = 'Industrialist';

    expect(countProductionAndSupport(G.tiles, 'Hotelier')).toEqual({
      production: 0,
      support: 0,
    });
  });
});

describe('Fisheries', () => {
  it('can be placed on Water adjacent to a building you own', () => {
    const G = createInitialState(2);
    let fieldKey: string | null = null;
    let waterKey: string | null = null;
    for (const [k, t] of Object.entries(G.tiles)) {
      if (t.type !== 'Field' || t.building) continue;
      for (const nb of hexNeighbors(t.hex)) {
        const wk = hexKey(nb);
        const wt = G.tiles[wk];
        if (wt?.type === 'Water' && !wt.building) {
          fieldKey = k;
          waterKey = wk;
          break;
        }
      }
      if (fieldKey) break;
    }
    expect(fieldKey && waterKey).toBeTruthy();
    G.tiles[fieldKey!].building = 'Resort';
    G.tiles[fieldKey!].buildingOwner = 'Hotelier';
    expect(canPlaceFisheries(G.tiles, G.tiles[waterKey!].hex, 'Hotelier')).toBe(true);
  });

  it('reduces Resort procurement by 1 when adjacent Water has Fisheries', () => {
    const G = createInitialState(2);
    let resortKey: string | null = null;
    let waterKey: string | null = null;
    for (const [k, t] of Object.entries(G.tiles)) {
      if (t.type !== 'Field' || t.building) continue;
      for (const nb of hexNeighbors(t.hex)) {
        const wk = hexKey(nb);
        const wt = G.tiles[wk];
        if (wt?.type === 'Water' && !wt.building) {
          resortKey = k;
          waterKey = wk;
          break;
        }
      }
      if (resortKey) break;
    }
    expect(resortKey && waterKey).toBeTruthy();
    G.tiles[resortKey!].building = 'Resort';
    G.tiles[resortKey!].buildingOwner = 'Hotelier';

    const base = { coins: 0, wood: 0, ore: 0, votes: 0 };
    const before = runProcurementForPlayer(G.tiles, 'Hotelier', base, undefined, 0);

    G.tiles[waterKey!].building = 'Fisheries';
    G.tiles[waterKey!].buildingOwner = 'Industrialist';

    const after = runProcurementForPlayer(G.tiles, 'Hotelier', base, undefined, 0);
    expect(after.coins).toBe(before.coins - 1);
  });
});

describe('canAffordMandate', () => {
  it('Hotelier needs 10 coins for first Mandate', () => {
    const G = createInitialState(2);
    G.players[0].resources.coins = 10;
    expect(canAffordMandate(G.tiles, G.players[0])).toBe(true);
    G.players[0].resources.coins = 9;
    expect(canAffordMandate(G.tiles, G.players[0])).toBe(false);
  });

  it('Hotelier needs 11 for second Mandate (10 + 1 seat)', () => {
    const G = createInitialState(2);
    G.players[0].seats = 1;
    G.players[0].resources.coins = 11;
    expect(canAffordMandate(G.tiles, G.players[0])).toBe(true);
    G.players[0].resources.coins = 10;
    expect(canAffordMandate(G.tiles, G.players[0])).toBe(false);
  });

  it('Industrialist can pay with wood+ore mix', () => {
    const G = createInitialState(2);
    G.players[1].resources.wood = 5;
    G.players[1].resources.ore = 5;
    expect(canAffordMandate(G.tiles, G.players[1])).toBe(true);
    G.players[1].resources.ore = 4;
    expect(canAffordMandate(G.tiles, G.players[1])).toBe(false);
  });
});

describe('rotatePoliticsEndOfRound', () => {
  it('Mandate rotates off track and returns to bottom of deck', () => {
    const G = createInitialState(2);
    G.politicsRow = ['Mandate', 'Bribe', 'Graft', 'Import'];
    G.politicsDeck = ['Export', 'Zoning'];

    rotatePoliticsEndOfRound(G);

    expect(G.politicsRow[0]).toBe('Bribe');
    expect(G.politicsRow[3]).not.toBeNull();
    expect(G.politicsDeck[G.politicsDeck.length - 1]).toBe('Mandate');
  });

  it('does not place duplicate Mandate if one is already visible', () => {
    const G = createInitialState(2);
    G.thresholdReached = true;
    G.revealedPoliticsSinceThreshold = 3;
    G.mandateIntervalIndex = 0;
    G.politicsRow = ['Bribe', 'Mandate', 'Graft', 'Import'];
    G.politicsDeck = ['Export', 'Zoning'];

    rotatePoliticsEndOfRound(G);

    const mandateCount = G.politicsRow.filter(c => c === 'Mandate').length;
    expect(mandateCount).toBeLessThanOrEqual(1);
  });
});
