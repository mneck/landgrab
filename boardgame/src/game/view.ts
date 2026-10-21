/**
 * What one player is allowed to know (spec 7.4). Used as boardgame.io's
 * `playerView` and by the bots, so neither a client nor a bot can read
 * Scout results, unrevealed Site significance, fogged terrain, private
 * messages or deck order that belong to someone else.
 */
import type { LandgrabState, PlayerType } from './types';

export function viewFor(G: LandgrabState, viewer: number | null): LandgrabState {
  const me: PlayerType | null = viewer !== null && G.players[viewer] ? G.players[viewer].type : null;
  const chieftain = me === 'Chieftain';
  const known = new Set(me ? (G.scouted[me] ?? []) : []);

  const cells = G.cells.map((c) => {
    if (!c.fog || chieftain || known.has(c.id)) return c;
    const hidden = { ...c, terrain: 'Unknown' as const, elevation: 0 };
    delete hidden.siteId;
    return hidden;
  });

  const sites = G.sites.map((s) => {
    const visibleCells = chieftain ? s.cells : s.cells.filter((id) => cells[id].siteId !== undefined);
    return {
      ...s,
      cells: visibleCells,
      significance: s.revealed ? s.significance : (0 as const),
    };
  });

  const scouted: LandgrabState['scouted'] = {};
  if (me && G.scouted[me]) scouted[me] = [...G.scouted[me]!];

  return {
    ...G,
    cells,
    sites,
    scouted,
    personnelDeck: G.personnelDeck.map(() => 'Hidden'),
    politicsDeck: G.politicsDeck.map(() => 'Hidden'),
    messages: G.messages.filter((m) => m.to === null || m.to === viewer || m.from === viewer),
    proposals: G.proposals.filter((p) => p.to === viewer || p.from === viewer),
  };
}
