import { useState, useEffect, useRef, useCallback } from 'react';
import { Client as BGClient } from 'boardgame.io/client';
import { LandgrabGame } from './game/Game';
import { Board } from './components/Board';
import { Lobby } from './multiplayer/Lobby';
import { OnlineGameView } from './multiplayer/OnlineGameView';
import type { LandgrabState, PlayerType } from './game/types';
import './App.css';

type NumPlayers = 2 | 3 | 4;

const ALL_PLAYER_TYPES: PlayerType[] = ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'];

const PLAYER_TYPES: Record<NumPlayers, PlayerType[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

const PLAYER_ICONS: Record<PlayerType, string> = {
  Hotelier: '🏨',
  Industrialist: '🏭',
  Chieftain: '🏕️',
  Bureaucrat: '🏛️',
};

const STORAGE_KEY = 'landgrab_save';

interface SavedGame {
  numPlayers: NumPlayers;
  state: Record<string, any>;
  aiPlayerIndices?: number[];
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

function usePersistedGame(numPlayers: NumPlayers, restoreSave: boolean, aiPlayerIndices: number[]) {
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
          (client.store.dispatch as Function)({
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
          aiPlayerIndices,
          state: { G: state.G, ctx: state.ctx, plugins: state.plugins, _stateID: state._stateID, _undo: state._undo ?? [], _redo: state._redo ?? [] },
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

function GameView({ numPlayers, restoreSave, aiPlayerIndices }: { numPlayers: NumPlayers; restoreSave: boolean; aiPlayerIndices: number[] }) {
  const { gameState, moves } = usePersistedGame(numPlayers, restoreSave, aiPlayerIndices);

  if (!gameState || !moves) return null;

  return (
    <Board
      G={gameState.G}
      ctx={gameState.ctx}
      moves={moves}
      aiPlayerIndices={aiPlayerIndices}
    />
  );
}

type GameMode = 'menu' | 'solo-setup' | 'hotseat-select' | 'online-lobby' | 'online-game';

const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER || '';

interface OnlineSession {
  matchID: string;
  playerID: string;
  credentials: string;
  numPlayers: number;
}

export default function App() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [numPlayers, setNumPlayers] = useState<NumPlayers | null>(null);
  const [started, setStarted] = useState(false);
  const [restoreSave, setRestoreSave] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [savedGame, setSavedGame] = useState(() => loadSavedGame());
  const [aiPlayerIndices, setAiPlayerIndices] = useState<number[]>([]);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);

  const [soloFaction, setSoloFaction] = useState<PlayerType | null>(null);
  const [soloOpponents, setSoloOpponents] = useState<1 | 2 | 3>(2);

  const handleNewGame = useCallback(() => {
    clearSavedGame();
    setSavedGame(null);
    setStarted(false);
    setNumPlayers(null);
    setRestoreSave(false);
    setGameMode('menu');
    setAiPlayerIndices([]);
    setSoloFaction(null);
    setOnlineSession(null);
    setGameKey(k => k + 1);
  }, []);

  const handleContinue = useCallback(() => {
    if (!savedGame) return;
    setNumPlayers(savedGame.numPlayers);
    setAiPlayerIndices(savedGame.aiPlayerIndices ?? []);
    setRestoreSave(true);
    setStarted(true);
  }, [savedGame]);

  const handleStartHotseat = useCallback(() => {
    clearSavedGame();
    setRestoreSave(false);
    setAiPlayerIndices([]);
    setStarted(true);
  }, []);

  const handleStartSolo = useCallback(() => {
    if (!soloFaction) return;
    const totalPlayers = (soloOpponents + 1) as NumPlayers;
    const factionOrder = PLAYER_TYPES[totalPlayers];
    const humanIndex = factionOrder.indexOf(soloFaction);
    if (humanIndex < 0) return;

    const aiIndices = factionOrder.map((_, i) => i).filter(i => i !== humanIndex);
    setNumPlayers(totalPlayers);
    setAiPlayerIndices(aiIndices);
    clearSavedGame();
    setRestoreSave(false);
    setStarted(true);
  }, [soloFaction, soloOpponents]);

  if (gameMode === 'online-game' && onlineSession) {
    return (
      <OnlineGameView
        key={`online-${onlineSession.matchID}`}
        matchID={onlineSession.matchID}
        playerID={onlineSession.playerID}
        credentials={onlineSession.credentials}
        serverURL={GAME_SERVER_URL}
        onLeave={handleNewGame}
      />
    );
  }

  if (gameMode === 'online-lobby') {
    return (
      <Lobby
        serverURL={GAME_SERVER_URL}
        onJoinMatch={(info) => {
          setOnlineSession(info);
          setGameMode('online-game');
        }}
        onBack={() => setGameMode('menu')}
      />
    );
  }

  if (started && numPlayers) {
    return (
      <div className="game-container">
        <div className="game-header">
          <h1>Landgrab</h1>
          <div className="game-header__actions">
            <button className="game-header__btn" onClick={handleNewGame}>
              New Game
            </button>
          </div>
        </div>
        <GameView key={gameKey} numPlayers={numPlayers} restoreSave={restoreSave} aiPlayerIndices={aiPlayerIndices} />
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
              {(savedGame.aiPlayerIndices?.length ?? 0) > 0 && ' · vs AI'}
            </span>
          </button>
        )}

        {gameMode === 'menu' && (
          <div className="start-screen__options">
            <button
              className="start-screen__btn start-screen__option-btn"
              onClick={() => setGameMode('solo-setup')}
            >
              <span className="start-screen__option-icons">👤🤖</span>
              <span className="start-screen__option-label">Solo vs AI</span>
              <span className="start-screen__option-detail">Play against AI opponents</span>
            </button>
            <button
              className="start-screen__btn start-screen__option-btn"
              onClick={() => setGameMode('online-lobby')}
            >
              <span className="start-screen__option-icons">🌐</span>
              <span className="start-screen__option-label">Online Multiplayer</span>
              <span className="start-screen__option-detail">Play with friends over the network</span>
            </button>
            <button
              className="start-screen__btn start-screen__option-btn"
              onClick={() => setGameMode('hotseat-select')}
            >
              <span className="start-screen__option-icons">👤👤</span>
              <span className="start-screen__option-label">Hot Seat</span>
              <span className="start-screen__option-detail">Pass-and-play multiplayer</span>
            </button>
          </div>
        )}

        {gameMode === 'solo-setup' && (
          <div className="start-screen__solo-setup">
            <h3 className="start-screen__section-title">Choose your faction</h3>
            <div className="start-screen__options start-screen__options--grid">
              {ALL_PLAYER_TYPES.map(pt => (
                <button
                  key={pt}
                  className={`start-screen__btn start-screen__option-btn ${soloFaction === pt ? 'start-screen__option-btn--selected' : ''}`}
                  onClick={() => setSoloFaction(pt)}
                >
                  <span className="start-screen__option-icons">{PLAYER_ICONS[pt]}</span>
                  <span className="start-screen__option-label">{pt}</span>
                </button>
              ))}
            </div>

            {soloFaction && (
              <>
                <h3 className="start-screen__section-title">Number of AI opponents</h3>
                <div className="start-screen__options">
                  {([1, 2, 3] as const).map(n => {
                    const total = (n + 1) as NumPlayers;
                    const factions = PLAYER_TYPES[total];
                    if (!factions.includes(soloFaction)) return null;
                    return (
                      <button
                        key={n}
                        className={`start-screen__btn start-screen__option-btn ${soloOpponents === n ? 'start-screen__option-btn--selected' : ''}`}
                        onClick={() => setSoloOpponents(n)}
                      >
                        <span className="start-screen__option-icons">{'🤖'.repeat(n)}</span>
                        <span className="start-screen__option-label">{n} Opponent{n > 1 ? 's' : ''}</span>
                        <span className="start-screen__option-detail">
                          {factions.filter(f => f !== soloFaction).join(' · ')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button className="start-screen__btn start-screen__btn--primary" onClick={handleStartSolo}>
                  Start Game
                </button>
              </>
            )}

            <button className="start-screen__btn start-screen__btn--back" onClick={() => { setGameMode('menu'); setSoloFaction(null); }}>
              Back
            </button>
          </div>
        )}

        {gameMode === 'hotseat-select' && (
          <>
            <div className="start-screen__options">
              {([2, 3, 4] as NumPlayers[]).map((n) => (
                <button
                  key={n}
                  className={`start-screen__btn start-screen__option-btn ${numPlayers === n ? 'start-screen__option-btn--selected' : ''}`}
                  onClick={() => setNumPlayers(n)}
                >
                  <span className="start-screen__option-icons">{'👤'.repeat(n)}</span>
                  <span className="start-screen__option-label">{n} Players</span>
                  <span className="start-screen__option-detail">
                    {PLAYER_TYPES[n].join(' · ')}
                  </span>
                </button>
              ))}
            </div>

            {numPlayers && (
              <button className="start-screen__btn start-screen__btn--primary" onClick={handleStartHotseat}>
                Start New Game
              </button>
            )}

            <button className="start-screen__btn start-screen__btn--back" onClick={() => { setGameMode('menu'); setNumPlayers(null); }}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
