/**
 * A local game: one boardgame.io client per seat over the in-process Local
 * transport, so each seat sees only its own view (Scout results, fog) and any
 * seat can answer a reaction window. Bots drive their seats from their own view.
 */
import { useEffect, useRef, useState } from 'react';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import type { Ctx } from 'boardgame.io';
import { LandgrabGame } from '../game/Game';
import { fetchMap, fetchMapIndex } from '../game/maps';
import type { MapFile } from '../game/maps';
import type { LandgrabState, PlayerType } from '../game/types';
import { getAIMove } from '../ai';
import { legalResponses } from '../game/reactions';

export type Moves = Record<string, (...args: unknown[]) => void>;
export interface SeatState {
  G: LandgrabState;
  ctx: Ctx;
  stateID: number;
}

type BGClient = ReturnType<typeof Client>;

export function useLocalGame(roster: PlayerType[], aiSeats: number[]) {
  const [map, setMap] = useState<MapFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<(SeatState | null)[]>(() => roster.map(() => null));
  const clients = useRef<BGClient[]>([]);

  useEffect(() => {
    let cancelled = false;
    const subs: (() => void)[] = [];
    (async () => {
      try {
        const index = await fetchMapIndex();
        const pick = index.maps[Math.floor(Math.random() * index.maps.length)];
        const m = await fetchMap(pick.id);
        if (cancelled) return;
        const seed = Math.floor(Math.random() * 2 ** 31);
        const game = {
          ...LandgrabGame,
          setup: (ctx: Parameters<NonNullable<typeof LandgrabGame.setup>>[0]) =>
            LandgrabGame.setup!(ctx, { mapId: m.id, roster, seed }),
        };
        const mp = Local();
        const matchID = `local-${seed}`;
        clients.current = roster.map((_, i) => {
          const c = Client({ game, numPlayers: roster.length, multiplayer: mp, playerID: String(i), matchID });
          c.start();
          subs.push(
            c.subscribe((s) => {
              if (!s || cancelled) return;
              setSeats((prev) => {
                const next = [...prev];
                next[i] = { G: s.G as LandgrabState, ctx: s.ctx, stateID: s._stateID };
                return next;
              });
            })
          );
          return c;
        });
        setMap(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      subs.forEach((u) => u());
      clients.current.forEach((c) => c.stop());
      clients.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const movesFor = (seat: number): Moves | null =>
    (clients.current[seat]?.moves as Moves | undefined) ?? null;

  useBots(seats, aiSeats, movesFor);

  return { map, error, seats, movesFor };
}

const BOT_DELAY_MS = 450;

/** Plays every bot seat whose decision the game is waiting on. */
function useBots(seats: (SeatState | null)[], aiSeats: number[], movesFor: (seat: number) => Moves | null) {
  const any = seats.find((s) => s !== null);
  const G = any?.G;
  const controllerSeat = G ? (G.reaction ? G.reaction.reactor : G.turn.player) : -1;
  const isBot = aiSeats.includes(controllerSeat);
  const seat = isBot ? seats[controllerSeat] : null;
  const key = seat ? `${controllerSeat}:${seat.stateID}` : '';
  const latest = useRef(key);
  latest.current = key;

  useEffect(() => {
    if (!seat || seat.G.winner || seat.ctx.gameover) return;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      const moves = movesFor(controllerSeat);
      if (!moves) return;
      const d = getAIMove(seat.G, controllerSeat);
      if (!d) return;
      if (d.type === 'respond') moves.respond(d.response);
      else moves.act(d.action);
      // A bot decides on its own view; if the server refused the move, do something always legal.
      fallback = setTimeout(() => {
        if (latest.current !== key) return;
        if (seat.G.reaction) moves.respond(legalResponses(seat.G, controllerSeat)[0]);
        else moves.act({ kind: 'endTurn' });
      }, 1500);
    }, BOT_DELAY_MS);
    return () => {
      clearTimeout(t);
      if (fallback) clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
