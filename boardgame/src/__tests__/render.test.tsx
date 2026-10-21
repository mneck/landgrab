/** The board renders for every faction, mid-game, from that faction's own view. */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Board } from '../components/Board';
import { getMap } from '../game/maps';
import { createInitialState } from '../game/setup';
import { applyAction, controller, respond } from '../game/engine';
import { viewFor } from '../game/view';
import { getAIMove } from '../ai';
import { loadMaps } from '../../playtesting/engineSim';

describe('Board render', () => {
  it('renders each seat at the start and mid-game', () => {
    const [id] = loadMaps();
    const map = getMap(id)!;
    const G = createInitialState(map, ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'], { seed: 5 });
    const noop = () => {};
    const moves = new Proxy({}, { get: () => noop }) as never;
    for (const round of [1, 6]) {
      while (G.turn.round < round && !G.winner) {
        const p = controller(G);
        const d = getAIMove(G, p)!;
        if (d.type === 'respond') respond(G, p, d.response);
        else applyAction(G, p, d.action);
      }
      for (let me = 0; me < 4; me++) {
        const html = renderToString(<Board map={map} G={viewFor(G, me)} me={me} moves={moves} aiSeats={[]} />);
        expect(html).toContain('lg-board');
        expect(html).toContain(G.players[me].type);
      }
    }
    // A pending reaction renders the prompt for its reactor.
    G.reaction = { kind: 'waive', reactor: 0, payer: 3, amount: { coins: 2 }, reason: 'test' };
    expect(renderToString(<Board map={map} G={viewFor(G, 0)} me={0} moves={moves} aiSeats={[]} />)).toContain('Waive');
  }, 60_000);
});
