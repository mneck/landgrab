import { describe, it, expect } from 'vitest';
import { createInitialState } from '../game/setup';
import { moves } from '../game/moves';
import {
  planMandatePayment,
  canAffordMandate,
  runProcurementForPlayer,
  ENDORSEMENT_COVER,
} from '../game/gameRules';
import type { LandgrabState, PlayerState, TableauCard } from '../game/types';

function endorsements(n: number): TableauCard[] {
  return Array.from({ length: n }, (_, i) => ({
    instanceId: `Endorsement_${i}`,
    cardType: 'Endorsement',
    category: 'Event',
  }));
}

function withPlayer(type: PlayerState['type'], resources: PlayerState['resources'], extra: TableauCard[] = []) {
  const G = createInitialState(4, { mapSeed: 1 });
  const player = G.players.find((p) => p.type === type)!;
  player.resources = resources;
  player.tableau.push(...extra);
  return { G, player };
}

describe('planMandatePayment', () => {
  it('pays in faction currency plus the 1-vote fee without Endorsements', () => {
    const { G, player } = withPlayer('Hotelier', { coins: 10, wood: 0, ore: 0, votes: 1 });
    expect(planMandatePayment(G.tiles, player)?.spend).toEqual({ coins: 10, wood: 0, ore: 0, votes: 1 });
  });

  it('cannot pay a shortfall without Endorsements', () => {
    const { G, player } = withPlayer('Hotelier', { coins: 8, wood: 5, ore: 5, votes: 5 });
    expect(canAffordMandate(G.tiles, player)).toBe(false);
  });

  it('lets each Endorsement cover up to 3 with other resources, and they stack', () => {
    const one = withPlayer('Hotelier', { coins: 5, wood: 5, ore: 5, votes: 1 }, endorsements(1));
    expect(canAffordMandate(one.G.tiles, one.player)).toBe(false);

    const two = withPlayer('Hotelier', { coins: 5, wood: 5, ore: 5, votes: 1 }, endorsements(2));
    const plan = planMandatePayment(two.G.tiles, two.player)!;
    expect(plan.endorsementsUsed).toBe(2);
    expect(plan.spend.coins).toBe(5);
    expect(plan.spend.wood + plan.spend.ore).toBe(10 - 5);
    expect(plan.spend.votes).toBe(1);
    expect(ENDORSEMENT_COVER).toBe(3);
  });

  it('keeps the vote fee separate from a Bureaucrat paying in votes', () => {
    // Previously 10 votes passed the check and left the Bureaucrat at -1.
    const { G, player } = withPlayer('Bureaucrat', { coins: 0, wood: 0, ore: 0, votes: 10 });
    expect(canAffordMandate(G.tiles, player)).toBe(false);
    player.resources.votes = 11;
    expect(canAffordMandate(G.tiles, player)).toBe(true);
  });

  it('lets a Chieftain cover missing presence with any resources', () => {
    const { G, player } = withPlayer('Chieftain', { coins: 4, wood: 0, ore: 0, votes: 3 }, endorsements(4));
    // No presence on the board: the whole 10 needs covering (4 Endorsements = 12).
    expect(canAffordMandate(G.tiles, player)).toBe(false); // only 4 coins + 2 spare votes = 6
    player.resources.coins = 8;
    const plan = planMandatePayment(G.tiles, player)!;
    expect(plan.spend.coins + plan.spend.votes).toBe(11);
    expect(plan.endorsementsUsed).toBe(4);
  });

  it('spends the planned resources when the Mandate is played', () => {
    const { G, player } = withPlayer('Hotelier', { coins: 7, wood: 2, ore: 1, votes: 2 }, endorsements(1));
    const idx = G.players.indexOf(player);
    player.tableau.push({ instanceId: 'Mandate_x', cardType: 'Mandate', category: 'Event' });
    delete G.startingBidPhase;
    moves.activateCard({ G, ctx: { currentPlayer: String(idx), numPlayers: 4, playOrder: ['0', '1', '2', '3'] } } as never, 'Mandate_x');
    expect(player.seats).toBe(1);
    expect(player.resources).toEqual({ coins: 0, wood: 0, ore: 0, votes: 1 });
    expect(player.tableau.some((c) => c.cardType === 'Endorsement')).toBe(false);
  });
});

describe('Industrialist extraction bonus', () => {
  it('adds 1 to the main output of each producing Industrial Zone', () => {
    const G: LandgrabState = createInitialState(2, { mapSeed: 3 });
    const zone = Object.values(G.tiles).find((t) => t.ring > 0 && t.ring < G.mapRadius)!;
    zone.type = 'Field';
    zone.building = 'IndustrialZone';
    zone.buildingOwner = 'Industrialist';
    const [a, b, ...rest] = zone.neighbors;
    G.tiles[a].type = 'Forest';
    G.tiles[b].type = 'Mountain';
    for (const k of rest) G.tiles[k].type = 'Field';

    const res = runProcurementForPlayer(G.tiles, 'Industrialist', { coins: 0, wood: 0, ore: 0, votes: 0 });
    // 1 Forest + 1 Mountain, tie goes to wood: 2 wood, 1 ore.
    expect(res).toEqual({ coins: 0, wood: 2, ore: 1, votes: 0 });
  });

  it('gives nothing extra to a zone with no Forest or Mountain', () => {
    const G: LandgrabState = createInitialState(2, { mapSeed: 3 });
    const zone = Object.values(G.tiles).find((t) => t.ring > 0 && t.ring < G.mapRadius)!;
    zone.building = 'IndustrialZone';
    zone.buildingOwner = 'Industrialist';
    for (const k of zone.neighbors) G.tiles[k].type = 'Field';
    const res = runProcurementForPlayer(G.tiles, 'Industrialist', { coins: 0, wood: 0, ore: 0, votes: 0 });
    expect(res.wood + res.ore).toBe(0);
  });
});
