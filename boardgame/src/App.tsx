import { useState, useMemo } from 'react';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';
import { LandgrabGame } from './game/Game';
import { Board } from './components/Board';
import './App.css';

type NumPlayers = 2 | 3 | 4;

const PLAYER_TYPES: Record<NumPlayers, string[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

function GameView({ numPlayers, matchID }: { numPlayers: NumPlayers; matchID: string }) {
  const GameClient = useMemo(() => Client({
    game: LandgrabGame,
    board: Board,
    multiplayer: Local(),
    debug: false,
    numPlayers,
  }), [numPlayers, matchID]);

  return (
    <GameClient
      playerID="0"
      matchID={matchID}
    />
  );
}

export default function App() {
  const [numPlayers, setNumPlayers] = useState<NumPlayers | null>(null);
  const [started, setStarted] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  function handleNewGame() {
    setStarted(false);
    setNumPlayers(null);
    setGameKey(k => k + 1);
  }

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
        <GameView key={gameKey} numPlayers={numPlayers} matchID={`game-${gameKey}`} />
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
            onClick={() => setStarted(true)}
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}
