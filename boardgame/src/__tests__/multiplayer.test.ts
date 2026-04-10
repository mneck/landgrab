import { describe, it, expect } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { LandgrabGame } from '../game/Game';
import { createInitialState } from '../game/setup';
import type { LandgrabState } from '../game/types';

const tick = () => new Promise<void>((r) => setTimeout(r, 50));

type BGClient = ReturnType<typeof Client>;

let matchSeq = 0;

/** Resolve blind opening bids (player 0 bids 1, others 0) so player 0 wins first. */
async function finishStartingBidsForClients(playerClients: BGClient[]) {
  for (let i = 0; i < playerClients.length; i++) {
    const c = playerClients[i];
    const submit = (c.moves as Record<string, (n: number) => void>).submitStartingBid;
    if (typeof submit === 'function') {
      submit(i === 0 ? 1 : 0);
      await tick();
    }
  }
}

function G(c: BGClient): LandgrabState {
  return c.getState()!.G as LandgrabState;
}

function currentPlayer(c: BGClient): string {
  return (c.getState()!.ctx as any).currentPlayer;
}

function createClients(playerCount: number) {
  const mp = Local();
  const matchID = `m-${++matchSeq}-${Date.now()}`;
  const clients: BGClient[] = [];
  for (let i = 0; i < playerCount; i++) {
    clients.push(
      Client({
        game: LandgrabGame,
        multiplayer: mp,
        playerID: String(i),
        matchID,
      }),
    );
  }
  async function finishStartingBids() {
    await finishStartingBidsForClients(clients);
  }
  return {
    clients,
    matchID,
    start: () => clients.forEach((c) => c.start()),
    stop: () => clients.forEach((c) => c.stop()),
    finishStartingBids,
  };
}

// ─── Game Definition Validation ──────────────────────────────────

describe('Game definition – multiplayer readiness', () => {
  it('exposes a game name for server routing', () => {
    expect(LandgrabGame.name).toBe('landgrab');
  });

  it('has a setup function', () => {
    expect(typeof LandgrabGame.setup).toBe('function');
  });

  it('registers the critical move set', () => {
    const names = Object.keys(LandgrabGame.moves!);
    expect(names).toContain('activateCard');
    expect(names).toContain('endTurn');
    expect(names).toContain('placeOnHex');
    expect(names).toContain('chooseOption');
    expect(names).toContain('cancelAction');
    expect(names).toContain('selectPoliticsCard');
    expect(LandgrabGame.turn?.stages?.networkBid?.moves?.submitNetworkBid).toBeDefined();
    expect(
      LandgrabGame.phases?.startingBid?.turn?.stages?.startingBid?.moves?.submitStartingBid,
    ).toBeDefined();
  });

  it('has turn.onBegin for per-turn reset', () => {
    expect(LandgrabGame.turn?.onBegin).toBeDefined();
  });

  it('has endIf for win detection', () => {
    expect(LandgrabGame.endIf).toBeDefined();
  });

  it('setup produces valid state for 2, 3, and 4 players', () => {
    for (const n of [2, 3, 4]) {
      const state = createInitialState(n);
      expect(state.players).toHaveLength(n);
      expect(state.actionsRemainingThisTurn).toBe(2);
      expect(state.pendingAction).toBeNull();
      expect(Object.keys(state.tiles).length).toBeGreaterThan(0);
      expect(state.networkRow).toHaveLength(4);
      expect(state.politicsRow).toHaveLength(4);
    }
  });

  it('setup assigns correct factions per player count', () => {
    expect(createInitialState(2).players.map((p) => p.type)).toEqual([
      'Hotelier',
      'Industrialist',
    ]);
    expect(createInitialState(3).players.map((p) => p.type)).toEqual([
      'Hotelier',
      'Industrialist',
      'Chieftain',
    ]);
    expect(createInitialState(4).players.map((p) => p.type)).toEqual([
      'Hotelier',
      'Industrialist',
      'Chieftain',
      'Bureaucrat',
    ]);
  });
});

// ─── Client Connection ───────────────────────────────────────────

describe('Local multiplayer – client connection', () => {
  it('both clients receive initial state', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    expect(clients[0].getState()).not.toBeNull();
    expect(clients[1].getState()).not.toBeNull();

    stop();
  });

  it('both clients see the same player list', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    expect(G(clients[0]).players).toHaveLength(2);
    expect(G(clients[1]).players).toHaveLength(2);

    stop();
  });

  it('game begins on player 0 turn for both clients', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    expect(currentPlayer(clients[0])).toBe('0');
    expect(currentPlayer(clients[1])).toBe('0');

    stop();
  });

  it('starting resources are identical across clients', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    for (let i = 0; i < 2; i++) {
      expect(G(clients[0]).players[i].resources).toEqual(
        G(clients[1]).players[i].resources,
      );
      expect(G(clients[0]).players[i].resources).toEqual({
        coins: 5,
        wood: 1,
        ore: 1,
        votes: 1,
      });
    }

    stop();
  });

  it('tile maps are identical across clients', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    const keys0 = Object.keys(G(clients[0]).tiles).sort();
    const keys1 = Object.keys(G(clients[1]).tiles).sort();
    expect(keys0).toEqual(keys1);
    expect(keys0.length).toBeGreaterThan(0);

    stop();
  });

  it('tableaux match across clients', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    for (let i = 0; i < 2; i++) {
      const t0 = G(clients[0]).players[i].tableau.map((c) => c.cardType);
      const t1 = G(clients[1]).players[i].tableau.map((c) => c.cardType);
      expect(t0).toEqual(t1);
    }

    stop();
  });

  it('market tracks match across clients', async () => {
    const { clients, start, stop } = createClients(2);
    start();
    await tick();

    expect(G(clients[0]).woodMarket).toEqual(G(clients[1]).woodMarket);
    expect(G(clients[0]).oreMarket).toEqual(G(clients[1]).oreMarket);

    stop();
  });
});

// ─── Turn Enforcement ────────────────────────────────────────────

describe('Turn enforcement', () => {
  it('player 0 can activate Charter on their turn', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    expect(charter).toBeDefined();

    clients[0].moves.activateCard(charter.instanceId);
    await tick();

    expect(G(clients[0]).pendingAction?.type).toBe('charter_place');

    stop();
  });

  it('player 1 cannot act when it is player 0 turn', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    expect(currentPlayer(clients[0])).toBe('0');

    const stateBefore = G(clients[0]).actionsRemainingThisTurn;
    const p1Builder = G(clients[1]).players[1].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;

    clients[1].moves.activateCard(p1Builder.instanceId);
    await tick();

    expect(G(clients[0]).actionsRemainingThisTurn).toBe(stateBefore);
    expect(currentPlayer(clients[0])).toBe('0');

    stop();
  });
});

// ─── State Propagation ───────────────────────────────────────────

describe('State propagation', () => {
  it('activateCard is visible to opponent', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();

    expect(G(clients[1]).pendingAction?.type).toBe('charter_place');

    stop();
  });

  it('cancelAction clears pending action for both clients', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();
    expect(G(clients[1]).pendingAction).not.toBeNull();

    clients[0].moves.cancelAction();
    await tick();

    expect(G(clients[0]).pendingAction).toBeNull();
    expect(G(clients[1]).pendingAction).toBeNull();

    stop();
  });

  it('Charter building appears on opponent map', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();

    const validHex = Object.entries(G(clients[0]).tiles).find(
      ([, tile]) =>
        (tile.type === 'Field' || tile.type === 'Sand') && !tile.building,
    );
    expect(validHex).toBeDefined();

    clients[0].moves.placeOnHex(validHex![0]);
    await tick();

    const p1Tile = G(clients[1]).tiles[validHex![0]];
    expect(p1Tile.building).toBeDefined();
    expect(p1Tile.buildingOwner).toBe('Hotelier');

    stop();
  });

  it('Builder market syncs resources across clients', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const builder = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;
    clients[0].moves.activateCard(builder.instanceId);
    await tick();
    clients[0].moves.chooseOption('market');
    await tick();
    clients[0].moves.chooseOption('buy_wood');
    await tick();

    expect(G(clients[0]).players[0].resources).toEqual(
      G(clients[1]).players[0].resources,
    );
    expect(G(clients[0]).woodMarket).toEqual(G(clients[1]).woodMarket);

    stop();
  });
});

// ─── Turn Transitions ────────────────────────────────────────────

describe('Turn transitions', () => {
  it('endTurn passes control to player 1', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    expect(currentPlayer(clients[0])).toBe('0');

    (clients[0] as any).events.endTurn();
    await tick();

    expect(currentPlayer(clients[0])).toBe('1');
    expect(currentPlayer(clients[1])).toBe('1');

    stop();
  });

  it('player 1 can act after receiving the turn', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    (clients[0] as any).events.endTurn();
    await tick();

    const charter = G(clients[1]).players[1].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[1].moves.activateCard(charter.instanceId);
    await tick();

    expect(G(clients[1]).pendingAction?.type).toBe('charter_place');

    stop();
  });

  it('turn.onBegin resets per-turn state on transition', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();
    clients[0].moves.cancelAction();
    await tick();

    (clients[0] as any).events.endTurn();
    await tick();

    expect(G(clients[1]).tokensUsedThisTurn).toEqual([]);
    expect(G(clients[1]).actionsRemainingThisTurn).toBe(2);
    expect(G(clients[1]).pendingAction).toBeNull();

    stop();
  });

  it('full round advances the turn counter', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const t0 = (clients[0].getState()!.ctx as any).turn;

    (clients[0] as any).events.endTurn();
    await tick();
    (clients[1] as any).events.endTurn();
    await tick();

    const t1 = (clients[0].getState()!.ctx as any).turn;
    expect(t1).toBeGreaterThan(t0);

    stop();
  });

  it('player 0 cannot act after turn passes to player 1', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    (clients[0] as any).events.endTurn();
    await tick();

    expect(currentPlayer(clients[0])).toBe('1');

    const builder = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;
    clients[0].moves.activateCard(builder.instanceId);
    await tick();

    expect(G(clients[0]).pendingAction).toBeNull();

    stop();
  });
});

// ─── Cancel / Restore ────────────────────────────────────────────

describe('Cancel action in multiplayer', () => {
  it('cancelling restores actionsRemainingThisTurn', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();
    expect(G(clients[0]).actionsRemainingThisTurn).toBe(1);

    clients[0].moves.cancelAction();
    await tick();
    expect(G(clients[0]).actionsRemainingThisTurn).toBe(2);

    stop();
  });

  it('cancel re-adds Charter to tableau', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(charter.instanceId);
    await tick();

    expect(
      G(clients[0]).players[0].tableau.filter((c) => c.cardType === 'Charter')
        .length,
    ).toBe(0);

    clients[0].moves.cancelAction();
    await tick();

    expect(
      G(clients[0]).players[0].tableau.filter((c) => c.cardType === 'Charter')
        .length,
    ).toBe(1);

    stop();
  });
});

// ─── Builder Flow in Multiplayer ─────────────────────────────────

describe('Builder flow in multiplayer', () => {
  it('activating Builder shows builder_choose', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const builder = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;
    clients[0].moves.activateCard(builder.instanceId);
    await tick();

    expect(G(clients[0]).pendingAction?.type).toBe('builder_choose');
    expect(G(clients[1]).pendingAction?.type).toBe('builder_choose');

    stop();
  });

  it('choosing market transitions to market choice', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const builder = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;
    clients[0].moves.activateCard(builder.instanceId);
    await tick();
    clients[0].moves.chooseOption('market');
    await tick();

    expect(G(clients[0]).pendingAction?.type).toBe('builder_market_choose');

    stop();
  });
});

// ─── Multi-move Sequences ────────────────────────────────────────

describe('Multi-move sequences across turns', () => {
  it('both players can place Charter buildings across turns', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    // Player 0: Charter
    const p0Charter = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[0].moves.activateCard(p0Charter.instanceId);
    await tick();

    const p0Hex = Object.entries(G(clients[0]).tiles).find(
      ([, t]) => (t.type === 'Field' || t.type === 'Sand') && !t.building,
    );
    expect(p0Hex).toBeDefined();
    clients[0].moves.placeOnHex(p0Hex![0]);
    await tick();

    expect(G(clients[0]).tiles[p0Hex![0]].buildingOwner).toBe('Hotelier');

    (clients[0] as any).events.endTurn();
    await tick();

    // Player 1: Charter
    const p1Charter = G(clients[1]).players[1].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    clients[1].moves.activateCard(p1Charter.instanceId);
    await tick();

    const p1Hex = Object.entries(G(clients[1]).tiles).find(
      ([key, t]) =>
        (t.type === 'Field' || t.type === 'Sand') &&
        !t.building &&
        key !== p0Hex![0],
    );
    expect(p1Hex).toBeDefined();
    clients[1].moves.placeOnHex(p1Hex![0]);
    await tick();

    expect(G(clients[1]).tiles[p1Hex![0]].buildingOwner).toBe(
      'Industrialist',
    );

    // Both buildings visible to both clients
    expect(G(clients[0]).tiles[p0Hex![0]].buildingOwner).toBe('Hotelier');
    expect(G(clients[0]).tiles[p1Hex![0]].buildingOwner).toBe(
      'Industrialist',
    );

    stop();
  });

  it('actions counter is independent per turn', async () => {
    const { clients, start, stop, finishStartingBids } = createClients(2);
    start();
    await tick();
    await finishStartingBids();

    const builder = G(clients[0]).players[0].tableau.find(
      (c) => c.cardType === 'Builder',
    )!;
    clients[0].moves.activateCard(builder.instanceId);
    await tick();
    expect(G(clients[0]).actionsRemainingThisTurn).toBe(1);

    clients[0].moves.cancelAction();
    await tick();

    (clients[0] as any).events.endTurn();
    await tick();

    expect(G(clients[1]).actionsRemainingThisTurn).toBe(2);

    (clients[1] as any).events.endTurn();
    await tick();

    expect(G(clients[0]).actionsRemainingThisTurn).toBe(2);

    stop();
  });
});

// ─── Spectator Mode ──────────────────────────────────────────────

describe('Spectator mode', () => {
  it('spectator (no playerID) receives initial state', async () => {
    const mp = Local();
    const mid = `spec-${++matchSeq}`;
    const player0 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '0',
      matchID: mid,
    });
    const player1 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '1',
      matchID: mid,
    });
    const spectator = Client({
      game: LandgrabGame,
      multiplayer: mp,
      matchID: mid,
    });

    player0.start();
    player1.start();
    spectator.start();
    await tick();
    await finishStartingBidsForClients([player0, player1]);

    expect(spectator.getState()).not.toBeNull();
    expect(G(spectator).players).toHaveLength(2);

    player0.stop();
    player1.stop();
    spectator.stop();
  });

  it('spectator sees moves made by players', async () => {
    const mp = Local();
    const mid = `spec-${++matchSeq}`;
    const player0 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '0',
      matchID: mid,
    });
    const player1 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '1',
      matchID: mid,
    });
    const spectator = Client({
      game: LandgrabGame,
      multiplayer: mp,
      matchID: mid,
    });

    player0.start();
    player1.start();
    spectator.start();
    await tick();
    await finishStartingBidsForClients([player0, player1]);

    const charter = G(spectator).players[0].tableau.find(
      (c) => c.cardType === 'Charter',
    )!;
    player0.moves.activateCard(charter.instanceId);
    await tick();

    expect(G(spectator).pendingAction?.type).toBe('charter_place');

    player0.stop();
    player1.stop();
    spectator.stop();
  });

  it('spectator sees turn transitions', async () => {
    const mp = Local();
    const mid = `spec-${++matchSeq}`;
    const player0 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '0',
      matchID: mid,
    });
    const player1 = Client({
      game: LandgrabGame,
      multiplayer: mp,
      playerID: '1',
      matchID: mid,
    });
    const spectator = Client({
      game: LandgrabGame,
      multiplayer: mp,
      matchID: mid,
    });

    player0.start();
    player1.start();
    spectator.start();
    await tick();
    await finishStartingBidsForClients([player0, player1]);

    expect(currentPlayer(spectator)).toBe('0');

    (player0 as any).events.endTurn();
    await tick();

    expect(currentPlayer(spectator)).toBe('1');

    player0.stop();
    player1.stop();
    spectator.stop();
  });
});
