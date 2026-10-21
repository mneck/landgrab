/**
 * Negotiation (spec 7): offers, Tell (may be a lie), Show (verifiable) and
 * Favour tokens. Nothing here costs an action; nothing is enforced.
 */
import { useState } from 'react';
import type { CellId, LandgrabState, Resources } from '../game/types';
import { formatAmount } from '../ui/describe';
import { FACTION_COLOR, RESOURCE_ICON } from '../ui/theme';
import type { Moves } from '../ui/useLocalGame';

const KEYS = Object.keys(RESOURCE_ICON) as (keyof Resources)[];

function AmountInputs({ value, onChange }: { value: Partial<Resources>; onChange: (v: Partial<Resources>) => void }) {
  return (
    <div className="lg-amounts">
      {KEYS.map((k) => (
        <label key={k}>
          {RESOURCE_ICON[k]}
          <input
            type="number"
            min={0}
            max={99}
            value={value[k] ?? 0}
            onChange={(e) => onChange({ ...value, [k]: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      ))}
    </div>
  );
}

interface Props {
  G: LandgrabState;
  me: number;
  moves: Moves;
  aiSeats: number[];
  /** Ask the board to let the player pick a cell to Show. */
  pickShowCell: (to: number) => void;
  showPick: { to: number } | null;
  cancelShowPick: () => void;
}

export function Negotiation({ G, me, moves, aiSeats, pickShowCell, showPick, cancelShowPick }: Props) {
  const others = G.players.map((_, i) => i).filter((i) => i !== me);
  const [to, setTo] = useState<number>(others[0] ?? 0);
  const [give, setGive] = useState<Partial<Resources>>({});
  const [want, setWant] = useState<Partial<Resources>>({});
  const [note, setNote] = useState('');
  const [tellTo, setTellTo] = useState<string>('all');
  const [text, setText] = useState('');
  const myType = G.players[me].type;

  const incoming = G.proposals.filter((p) => p.to === me);
  const outgoing = G.proposals.filter((p) => p.from === me);
  const name = (i: number) => <span style={{ color: FACTION_COLOR[G.players[i].type] }}>{G.players[i].type}</span>;

  return (
    <div className="lg-nego">
      <div className="lg-section-title">Deals</div>
      <p className="lg-muted lg-small">Offers cost no action and either side may refuse. {aiSeats.length > 0 && 'Bots never trade.'}</p>
      {incoming.map((p) => (
        <div key={p.id} className="lg-offer">
          {name(p.from)} offers {formatAmount(p.give)} for {formatAmount(p.want)}
          {p.note && <em> “{p.note}”</em>}
          <div className="lg-row">
            <button className="lg-btn lg-btn--primary" onClick={() => moves.answerProposal(p.id, true)}>Accept</button>
            <button className="lg-btn" onClick={() => moves.answerProposal(p.id, false)}>Decline</button>
          </div>
        </div>
      ))}
      {outgoing.map((p) => (
        <div key={p.id} className="lg-offer lg-offer--out">
          To {name(p.to)}: {formatAmount(p.give)} for {formatAmount(p.want)}
          <button className="lg-btn lg-btn--small" onClick={() => moves.withdrawProposal(p.id)}>Withdraw</button>
        </div>
      ))}
      <details>
        <summary>Make an offer</summary>
        <div className="lg-form">
          <label>
            To{' '}
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {others.map((i) => <option key={i} value={i}>{G.players[i].type}</option>)}
            </select>
          </label>
          <div>You give</div>
          <AmountInputs value={give} onChange={setGive} />
          <div>You want</div>
          <AmountInputs value={want} onChange={setWant} />
          <input placeholder="Note (optional promise, request…)" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
          <button
            className="lg-btn lg-btn--primary"
            onClick={() => {
              moves.propose(to, give, want, note || undefined);
              setGive({});
              setWant({});
              setNote('');
            }}
          >
            Send offer
          </button>
        </div>
      </details>

      <div className="lg-section-title">Information</div>
      <div className="lg-form">
        <div className="lg-row">
          <select value={tellTo} onChange={(e) => setTellTo(e.target.value)}>
            <option value="all">Everyone</option>
            {others.map((i) => <option key={i} value={i}>{G.players[i].type}</option>)}
          </select>
          <input placeholder="Tell (unverifiable — may be a lie)" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} />
          <button
            className="lg-btn"
            disabled={!text.trim()}
            onClick={() => {
              moves.tell(tellTo === 'all' ? null : Number(tellTo), text);
              setText('');
            }}
          >
            Tell
          </button>
        </div>
        <div className="lg-row">
          {showPick ? (
            <>
              <span>Click a fogged cell you know to show the {G.players[showPick.to].type}.</span>
              <button className="lg-btn lg-btn--small" onClick={cancelShowPick}>Cancel</button>
            </>
          ) : (
            others.map((i) => (
              <button key={i} className="lg-btn lg-btn--small" onClick={() => pickShowCell(i)}>
                Show a cell to the {G.players[i].type}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg-messages">
        {[...G.messages].reverse().slice(0, 30).map((m) => (
          <div key={m.id} className="lg-msg">
            <span className="lg-muted">R{m.round}</span> {name(m.from)}
            {m.to === null ? ' to all' : <> to {name(m.to)}</>}:{' '}
            {m.kind === 'show' ? <strong>shows cell {m.cell} — {m.shownTerrain} (verified)</strong> : <span>“{m.text}”</span>}
          </div>
        ))}
      </div>

      <div className="lg-section-title">Favours</div>
      {G.favors.filter((f) => f.from === myType || f.to === myType).length === 0 && (
        <p className="lg-muted lg-small">Waive a payment owed to you and the payer owes you a Favour. Favours have no rules; they are a memory aid.</p>
      )}
      {G.favors
        .filter((f) => f.from === myType || f.to === myType)
        .map((f) => (
          <div key={f.id} className="lg-offer">
            {f.to === myType ? <>The {f.from} owes you a Favour</> : <>You owe the {f.to} a Favour</>}
            <button className="lg-btn lg-btn--small" onClick={() => moves.dropFavor(f.id)}>Tear up</button>
          </div>
        ))}
    </div>
  );
}

export type { CellId };
