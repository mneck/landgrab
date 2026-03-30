import { useState, useEffect, useRef } from 'react';
import { Client as BGClient } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { LandgrabGame } from '../game/Game';
import { Board } from '../components/Board';
import type { LandgrabState } from '../game/types';

interface OnlineGameViewProps {
  matchID: string;
  playerID: string;
  credentials: string;
  serverURL: string;
  onLeave: () => void;
}

export function OnlineGameView({
  matchID,
  playerID,
  credentials,
  serverURL,
  onLeave,
}: OnlineGameViewProps) {
  const clientRef = useRef<ReturnType<typeof BGClient> | null>(null);
  const [gameState, setGameState] = useState<{
    G: LandgrabState;
    ctx: { currentPlayer: string; turn: number; numPlayers: number };
  } | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    const client = BGClient({
      game: LandgrabGame,
      multiplayer: SocketIO({ server: serverURL || undefined }),
      matchID,
      playerID,
      credentials,
    });

    clientRef.current = client;
    client.start();

    let receivedState = false;
    const timeout = setTimeout(() => {
      if (!receivedState) setConnectionError(true);
    }, 10_000);

    const unsubscribe = client.subscribe((state: any) => {
      if (!state) return;
      receivedState = true;
      setConnectionError(false);
      setGameState({ G: state.G, ctx: state.ctx });
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe?.();
      client.stop();
      clientRef.current = null;
    };
  }, [matchID, playerID, credentials, serverURL]);

  if (connectionError && !gameState) {
    return (
      <div className="online-status">
        <div className="online-status__card">
          <h2>Connection Failed</h2>
          <p>Could not connect to the game server. Make sure the server is running.</p>
          <button className="start-screen__btn start-screen__btn--primary" onClick={onLeave}>
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="online-status">
        <div className="online-status__card">
          <div className="online-status__spinner" />
          <h2>Connecting to game...</h2>
          <p>Match: {matchID}</p>
        </div>
      </div>
    );
  }

  const moves = clientRef.current?.moves as Record<
    string,
    (...args: any[]) => any
  >;

  return (
    <div className="game-container">
      <div className="game-header">
        <h1>Landgrab</h1>
        <div className="game-header__actions">
          <span className="online-badge">Online</span>
          <button className="game-header__btn" onClick={onLeave}>
            Leave Game
          </button>
        </div>
      </div>
      <Board
        G={gameState.G}
        ctx={gameState.ctx}
        moves={moves}
        playerID={playerID}
      />
    </div>
  );
}
