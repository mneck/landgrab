import { useState, useEffect, useRef, useCallback } from 'react';
import { Client as BGClient } from 'boardgame.io/client';
import { LandgrabGame } from './game/Game';
import { Board } from './components/Board';
import type { LandgrabState } from './game/types';
import './App.css';

type NumPlayers = 2 | 3 | 4;

const PLAYER_TYPES: Record<NumPlayers, string[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

const STORAGE_KEY = 'landgrab_save';

interface SavedGame {
  numPlayers: NumPlayers;
  state: {
    G: LandgrabState;
    ctx: { currentPlayer: string; turn: number; numPlayers: number };
    plugins: Record<string, unknown>;
    _stateID: number;
  };
}

function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved?.numPlayers && saved?.state?.G && saved?.state?.ctx) {
      return saved as SavedGame;
    }
  } catch { /* corrupt save */ }
  return null;
}

function clearSavedGame() {
  localStorage.removeItem(STORAGE_KEY);
}

function usePersistedGame(numPlayers: NumPlayers, restoreSave: boolean) {
  const clientRef = useRef<ReturnType<typeof BGClient> | null>(null);
  const [gameState, setGameState] = useState<{
    G: LandgrabState;
    ctx: { currentPlayer: string; turn: number; numPlayers: number };
  } | null>(null);

  useEffect(() => {
    const client = BGClient({ game: LandgrabGame, numPlayers });
    clientRef.current = client;
    client.start();

    if (restoreSave) {
      const saved = loadSavedGame();
      if (saved && saved.numPlayers === numPlayers && saved.state) {
        try {
          client.store.dispatch({
            type: 'SYNC',
            state: saved.state,
            log: [],
            initialState: saved.state,
          });
        } catch {
          // Fall through to fresh game if restore fails
        }
      }
    }

    const unsubscribe = client.subscribe((state: any) => {
      if (!state) return;
      setGameState({ G: state.G, ctx: state.ctx });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          numPlayers,
          state: { G: state.G, ctx: state.ctx, plugins: state.plugins, _stateID: state._stateID },
        }));
      } catch { /* quota exceeded, ignore */ }
    });

    setGameState(() => {
      const s = client.getState();
      return s ? { G: s.G, ctx: s.ctx } : null;
    });

    return () => {
      unsubscribe?.();
      client.stop();
      clientRef.current = null;
    };
  }, [numPlayers, restoreSave]);

  const moves = clientRef.current?.moves as Record<string, (...args: any[]) => any> | undefined;
  return { gameState, moves };
}

function GameView({ numPlayers, restoreSave }: { numPlayers: NumPlayers; restoreSave: boolean }) {
  const { gameState, moves } = usePersistedGame(numPlayers, restoreSave);

  if (!gameState || !moves) return null;

  return (
    <Board
      G={gameState.G}
      ctx={gameState.ctx}
      moves={moves}
    />
  );
}

export default function App() {
  const [numPlayers, setNumPlayers] = useState<NumPlayers | null>(null);
  const [started, setStarted] = useState(false);
  const [restoreSave, setRestoreSave] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [savedGame, setSavedGame] = useState(() => loadSavedGame());

  const handleNewGame = useCallback(() => {
    clearSavedGame();
    setSavedGame(null);
    setStarted(false);
    setNumPlayers(null);
    setRestoreSave(false);
    setGameKey(k => k + 1);
  }, []);

  const handleContinue = useCallback(() => {
    if (!savedGame) return;
    setNumPlayers(savedGame.numPlayers);
    setRestoreSave(true);
    setStarted(true);
  }, [savedGame]);

  const handleStartFresh = useCallback(() => {
    clearSavedGame();
    setRestoreSave(false);
    setStarted(true);
  }, []);

  if (started && numPlayers) {
    return (
      <div className="game-container">
        <div className="game-header">
          <h1>Landgrab</h1>
          <div className="game-header__actions">
            <button
              className="game-header__btn"
              onClick={handleNewGame}
            >
              New Game
            </button>
          </div>
        </div>
        <GameView key={gameKey} numPlayers={numPlayers} restoreSave={restoreSave} />
      </div>
    );
  }

  return (
    <div className="start-screen">
      <div className="start-screen__content">
        <h1 className="start-screen__title">Landgrab</h1>
        <p className="start-screen__subtitle">
          A tableau-based territory game for 2–4 players
        </p>

        {savedGame && (
          <button
            className="start-screen__btn start-screen__btn--continue"
            onClick={handleContinue}
          >
            Continue Game
            <span className="start-screen__option-detail">
              {savedGame.numPlayers} players · Round {savedGame.state.ctx.turn}
            </span>
          </button>
        )}

        <div className="start-screen__options">
          {([2, 3, 4] as NumPlayers[]).map((n) => (
            <button
              key={n}
              className={`start-screen__btn start-screen__option-btn ${numPlayers === n ? 'start-screen__option-btn--selected' : ''}`}
              onClick={() => setNumPlayers(n)}
            >
              <span className="start-screen__option-icons">
                {'👤'.repeat(n)}
              </span>
              <span className="start-screen__option-label">{n} Players</span>
              <span className="start-screen__option-detail">
                {PLAYER_TYPES[n].join(' · ')}
              </span>
            </button>
          ))}
        </div>

        {numPlayers && (
          <button
            className="start-screen__btn start-screen__btn--primary"
            onClick={handleStartFresh}
          >
            Start New Game
          </button>
        )}
      </div>
    </div>
  );
}
