/**
 * The boardgame.io wiring the UI uses: one client per seat over Local,
 * bots driving every seat through `act` / `respond`, reaction stages,
 * turn hand-over, and per-player views.
 */
import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { LandgrabGame } from '../game/Game';
import type { LandgrabState, PlayerType } from '../game/types';
import { getAIMove } from '../ai';
import { loadMaps } from '../../playtesting/engineSim';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function playLocal(roster: PlayerType[], seed: number, maxSteps = 4000) {
  const [mapId] = loadMaps();
  const game = { ...LandgrabGame, setup: (ctx: Parameters<NonNullable<typeof LandgrabGame.setup>>[0]) => LandgrabGame.setup!(ctx, { mapId, roster, seed }) };
  const mp = Local();
  const clients = roster.map((_, i) => {
    const c = Client({ game, numPlayers: roster.length, multiplayer: mp, playerID: String(i), matchID: `t${seed}` });
    c.start();
    return c;
  });
  await flush();
  let steps = 0;
  let reactions = 0;
  while (steps < maxSteps) {
    const s0 = clients[0].getState()!;
    const G0 = s0.G as LandgrabState;
    if (s0.ctx.gameover) break;
    const p = G0.reaction ? G0.reaction.reactor : G0.turn.player;
    const mine = clients[p].getState()!;
    expect(mine.ctx.currentPlayer).toBe(String(G0.turn.player));
    if (G0.reaction) {
      reactions++;
      expect(mine.ctx.activePlayers?.[String(p)]).toBe('react');
    }
    const d = getAIMove(mine.G as LandgrabState, p)!;
    const before = mine._stateID;
    if (d.type === 'respond') clients[p].moves.respond(d.response);
    else clients[p].moves.act(d.action);
    await flush();
    if (clients[p].getState()!._stateID === before) clients[p].moves.act({ kind: 'endTurn' });
    await flush();
    steps++;
  }
  const end = clients[0].getState()!;
  clients.forEach((c) => c.stop());
  return { end, steps, reactions, views: clients.map((c) => c.getState()!.G as LandgrabState) };
}

describe('boardgame.io integration', () => {
  it('plays a 4-player bot game to the end through Local clients', async () => {
    const { end, views } = await playLocal(['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'], 7);
    expect(end.ctx.gameover?.winner).toBeTruthy();
    // Views hide what each seat may not know.
    const hotelier = views[0];
    const chief = views[2];
    expect(hotelier.cells.some((c) => c.fog && c.terrain === 'Unknown')).toBe(true);
    expect(chief.cells.every((c) => c.terrain !== 'Unknown')).toBe(true);
    expect(hotelier.politicsDeck.every((c) => c === 'Hidden')).toBe(true);
    for (const s of hotelier.sites) if (!s.revealed) expect(s.significance).toBe(0);
    expect(Object.keys(hotelier.scouted).every((k) => k === 'Hotelier')).toBe(true);
  }, 120_000);

  it('plays a 2-player game to the end', async () => {
    const { end } = await playLocal(['Hotelier', 'Industrialist'], 3);
    expect(end.ctx.gameover?.winner).toBeTruthy();
  }, 120_000);
});
