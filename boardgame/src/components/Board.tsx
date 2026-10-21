/**
 * The game screen for one viewer. Every action is picked from the engine's own
 * legal-action list: choose a card option, then a target on the map or in the
 * chooser, and the fully specified action goes to the `act` move.
 */
import { useMemo, useState } from 'react';
import { BALANCE } from '../game/balance';
import { CARDS } from '../game/cards';
import { revealedLandFraction, scarCount, standing } from '../game/board';
import { legalActions } from '../game/engine';
import type { MapFile } from '../game/maps';
import type { Action, CellId, LandgrabState } from '../game/types';
import { variantLabel } from '../ui/describe';
import { FACTION_BLURB, FACTION_COLOR, FACTION_ICON } from '../ui/theme';
import type { Moves } from '../ui/useLocalGame';
import { GameLog } from './GameLog';
import { IslandMap } from './IslandMap';
import { Markets } from './Markets';
import { Negotiation } from './Negotiation';
import { PlayerPanels } from './PlayerPanels';
import { ReactionPrompt } from './ReactionPrompt';
import { Tableau } from './Tableau';

interface BoardProps {
  map: MapFile;
  G: LandgrabState;
  me: number;
  moves: Moves;
  aiSeats: number[];
  /** Hot seat: a note that the screen now belongs to another player. */
  seatNote?: string;
}

type Free = 'spread' | 'reclaim';

export function Board({ map, G, me, moves, aiSeats, seatNote }: BoardProps) {
  const [sel, setSel] = useState<{ card: string; option: string } | null>(null);
  const [free, setFree] = useState<Free | null>(null);
  const [pending, setPending] = useState<Action[] | null>(null);
  const [showPick, setShowPick] = useState<{ to: number } | null>(null);
  const [tab, setTab] = useState<'deals' | 'log'>('log');

  const myTurn = !G.winner && !G.reaction && G.turn.player === me;
  const legal = useMemo(() => (myTurn ? legalActions(G, me) : []), [G, me, myTurn]);

  // Reset the selection whenever the state moves on.
  const stamp = `${G.turn.round}:${G.turn.player}:${G.turn.actionsLeft}:${G.turn.usedCards.length}:${G.reaction?.kind ?? ''}:${G.turn.spreadDone}:${G.turn.reclaimDone}`;
  const [lastStamp, setLastStamp] = useState(stamp);
  if (stamp !== lastStamp) {
    setLastStamp(stamp);
    setSel(null);
    setFree(null);
    setPending(null);
  }

  const variants = useMemo(() => {
    if (free) return legal.filter((a) => a.kind === free);
    if (!sel) return [];
    return legal.filter((a) => a.kind === 'use' && a.card === sel.card && a.option === sel.option);
  }, [legal, sel, free]);

  const cellVariants = variants.filter((a) => a.cell !== undefined);
  const targets = useMemo(() => {
    if (showPick) return new Set(G.cells.filter((c) => c.fog && c.terrain !== 'Unknown').map((c) => c.id));
    if (pending) return new Set<CellId>();
    return new Set(cellVariants.map((a) => a.cell!));
  }, [showPick, pending, cellVariants, G]);

  const act = (a: Action) => {
    moves.act(a);
    setSel(null);
    setFree(null);
    setPending(null);
  };

  const onCellClick = (id: CellId) => {
    if (showPick) {
      moves.show(showPick.to, id);
      setShowPick(null);
      return;
    }
    const vs = cellVariants.filter((a) => a.cell === id);
    if (vs.length === 1) act(vs[0]);
    else if (vs.length > 1) setPending(vs);
  };

  const onSelect = (card: string, option: string) => {
    setFree(null);
    setPending(null);
    if (sel?.card === card && sel.option === option) {
      setSel(null);
      return;
    }
    const vs = legal.filter((a) => a.card === card && a.option === option);
    // Options with nothing to choose resolve straight away.
    if (vs.length === 1 && vs[0].cell === undefined && vs[0].slot === undefined && !vs[0].choice && vs[0].player === undefined && !vs[0].trade && !vs[0].target) {
      act(vs[0]);
      return;
    }
    setSel({ card, option });
  };

  const chooser = pending ?? (sel && cellVariants.length === 0 ? variants : null);
  const optionDef = sel ? CARDS[G.players[me].tableau.find((c) => c.instanceId === sel.card)?.cardType ?? '']?.options.find((o) => o.id === sel.option) : undefined;
  const canSpread = legal.some((a) => a.kind === 'spread');
  const canReclaim = legal.some((a) => a.kind === 'reclaim');
  const meType = G.players[me].type;
  const landPct = Math.round(revealedLandFraction(G) * 100);
  const scars = scarCount(G);
  const [s1, s2, s3] = BALANCE.lastSeasonThresholds;

  return (
    <div className="lg-board">
      <div className="lg-status">
        <span className="lg-status__me" style={{ color: FACTION_COLOR[meType] }}>
          {FACTION_ICON[meType]} You are the {meType}
        </span>
        <span>Round {G.turn.round}</span>
        <span>
          {G.winner ? 'Game over' : G.reaction ? `${G.players[G.reaction.reactor].type} is deciding` : `${G.players[G.turn.player].type}'s turn · ${G.turn.actionsLeft} action${G.turn.actionsLeft === 1 ? '' : 's'} left`}
        </span>
        <span title="Mandates enter the Politics Track once half the land is known">
          Land known {landPct}% {G.mandateTriggered ? '· Mandates active' : `/ ${Math.round(BALANCE.mandateFogThreshold * 100)}% for Mandates`}
        </span>
        <span title={`${s1}: market restocks slower · ${s2}: Hotels −1 · ${s3}: Last Season`}>
          Scars {scars}/{s3}{G.lastSeasonStage >= 3 ? ' · LAST SEASON' : G.lastSeasonStage === 2 ? ' · Hotels −1' : G.lastSeasonStage === 1 ? ' · slow market' : ''}
        </span>
        <span>Mandates left {G.mandatesRemaining}</span>
        {G.players.some((p) => p.type === 'Chieftain') && <span>Standing {standing(G)} · Grievance {G.grievance}</span>}
      </div>
      {seatNote && <div className="lg-banner">{seatNote}</div>}

      <div className="lg-main">
        <div className="lg-left">
          <IslandMap map={map} G={G} me={me} targets={targets} onCellClick={onCellClick} targetColor={showPick ? '#7fd3ff' : '#ffd84d'} />

          <div className="lg-actions">
            {myTurn ? (
              <>
                {sel && optionDef && (
                  <div className="lg-prompt">
                    <strong>{optionDef.label}:</strong> {optionDef.text}{' '}
                    {cellVariants.length > 0 && !pending && <em>Click a highlighted cell.</em>}
                    <button className="lg-btn lg-btn--small" onClick={() => { setSel(null); setPending(null); }}>Cancel</button>
                  </div>
                )}
                {free && (
                  <div className="lg-prompt">
                    {free === 'spread' ? 'Spread Presence: click a highlighted cell next to your Presence or a Village.' : 'Reclamation (3 Grievance): click a building or Site next to your claim to take it back.'}
                    <button className="lg-btn lg-btn--small" onClick={() => setFree(null)}>Cancel</button>
                  </div>
                )}
                {chooser && chooser.length > 0 && (
                  <div className="lg-chooser">
                    {chooser.map((a, i) => (
                      <button key={i} className="lg-btn" onClick={() => act(a)}>{variantLabel(G, me, a)}</button>
                    ))}
                  </div>
                )}
                <div className="lg-row">
                  {canSpread && <button className="lg-btn lg-btn--free" onClick={() => { setSel(null); setFree('spread'); }}>Spread Presence (free)</button>}
                  {canReclaim && <button className="lg-btn lg-btn--free" onClick={() => { setSel(null); setFree('reclaim'); }}>Reclamation (3 Grievance)</button>}
                  <button
                    className="lg-btn lg-btn--end"
                    onClick={() => {
                      if (G.turn.actionsLeft > 0 && !window.confirm(`End your turn with ${G.turn.actionsLeft} action(s) unused?`)) return;
                      act({ kind: 'endTurn' });
                    }}
                  >
                    End turn
                  </button>
                </div>
              </>
            ) : (
              !G.winner && !G.reaction && <div className="lg-muted">Waiting for the {G.players[G.turn.player].type}…</div>
            )}
          </div>

          <div className="lg-section-title">Your tableau <span className="lg-muted lg-small">— place 2 tokens per turn on different cards</span></div>
          <Tableau G={G} me={me} legal={legal} selected={sel} onSelect={onSelect} myTurn={myTurn} />
          <p className="lg-muted lg-small">{FACTION_BLURB[meType]}</p>
        </div>

        <div className="lg-right">
          <PlayerPanels G={G} me={me} aiSeats={aiSeats} />
          <Markets G={G} me={me} />
          <div className="lg-tabs">
            <button className={tab === 'log' ? 'lg-tab lg-tab--on' : 'lg-tab'} onClick={() => setTab('log')}>Log</button>
            <button className={tab === 'deals' ? 'lg-tab lg-tab--on' : 'lg-tab'} onClick={() => setTab('deals')}>
              Deals &amp; info{G.proposals.some((p) => p.to === me) ? ' •' : ''}
            </button>
          </div>
          {tab === 'log' ? (
            <GameLog G={G} />
          ) : (
            <Negotiation
              G={G}
              me={me}
              moves={moves}
              aiSeats={aiSeats}
              showPick={showPick}
              pickShowCell={(to) => setShowPick({ to })}
              cancelShowPick={() => setShowPick(null)}
            />
          )}
        </div>
      </div>

      <ReactionPrompt G={G} me={me} respond={(r) => moves.respond(r)} />

      {G.winner && (
        <div className="lg-modal">
          <div className="lg-modal__card">
            <h2>{FACTION_ICON[G.winner]} The {G.winner} wins</h2>
            <p>
              {G.endReason === 'seats' && 'Reached the Seats needed.'}
              {G.endReason === 'last_season' && 'Last Season ended the game: most Seats wins.'}
              {G.endReason === 'mandates_exhausted' && 'The Mandates ran out: most Seats wins.'}
              {G.endReason === 'round_cap' && 'The round limit was reached: most Seats wins.'}
            </p>
            <table className="lg-table">
              <tbody>
                {G.players.map((p, i) => (
                  <tr key={i}>
                    <td>{FACTION_ICON[p.type]} {p.type}</td>
                    <td>{p.seats} Seats</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
