import { useEffect, useState } from 'react';
import { legalResponses } from '../game/reactions';
import type { LandgrabState } from '../game/types';
import { RESPONSE_LABEL, reactionText } from '../ui/describe';

/** Interrupts and objections time out (spec 3.1, 3.4): the default lets the action through. */
const TIMEOUT_S = 30;

export function ReactionPrompt({ G, me, respond }: { G: LandgrabState; me: number; respond: (r: string) => void }) {
  const r = G.reaction;
  const mine = !!r && r.reactor === me;
  const timed = mine && (r!.kind === 'interrupt' || r!.kind === 'objection');
  const [left, setLeft] = useState(TIMEOUT_S);
  const key = r ? `${r.kind}:${r.reactor}:${JSON.stringify((r as { action?: unknown }).action ?? '')}` : '';

  useEffect(() => {
    setLeft(TIMEOUT_S);
    if (!timed) return;
    const id = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(id);
  }, [key, timed]);

  useEffect(() => {
    if (timed && left <= 0) respond(r!.kind === 'interrupt' ? 'allow' : 'pass');
  }, [left, timed, r, respond]);

  if (!r) return null;
  if (!mine) {
    return (
      <div className="lg-banner">Waiting for the {G.players[r.reactor].type} to decide…</div>
    );
  }
  return (
    <div className="lg-modal">
      <div className="lg-modal__card">
        <h3>Your decision</h3>
        <p>{reactionText(G, r)}</p>
        <div className="lg-row">
          {legalResponses(G, me).map((opt) => (
            <button key={opt} className="lg-btn lg-btn--primary" onClick={() => respond(opt)}>
              {RESPONSE_LABEL[opt] ?? opt}
            </button>
          ))}
        </div>
        {timed && <p className="lg-muted">Lets it through automatically in {left}s.</p>}
      </div>
    </div>
  );
}
