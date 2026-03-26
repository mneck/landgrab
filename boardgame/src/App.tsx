import React, { useState } from 'react';
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

function createGameClient(numPlayers: NumPlayers) {
  return Client({
    game: LandgrabGame,
    board: Board,
    multiplayer: Local(),
    debug: false,
    numPlayers,
  });
}

export default function App() {
  const [numPlayers, setNumPlayers] = useState<NumPlayers | null>(null);
  const [started, setStarted] = useState(false);

  if (started && numPlayers) {
    const GameClient = createGameClient(numPlayers);
    const matchID = 'local-game';
    const playerTypes = PLAYER_TYPES[numPlayers];

    return (
      <div className="game-wrapper">
        <div className="game-title-bar">
          <span className="game-title-small">LANDGRAB</span>
          <button className="btn btn-sm btn-danger" onClick={() => { setStarted(false); setNumPlayers(null); }}>
            New Game
          </button>
        </div>
        {playerTypes.map((type, i) => (
          <div key={i} className="client-instance" data-player={type}>
            <div className="client-label">Player {i + 1}: {type}</div>
            <GameClient
              playerID={String(i)}
              matchID={matchID}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="title-screen">
      <div className="title-card">
        <h1 className="game-logo">LANDGRAB</h1>
        <p className="game-subtitle">A Tableau-Based Territory Game</p>

        <div className="setup-section">
          <h2>Select Number of Players</h2>
          <div className="player-count-buttons">
            {([2, 3, 4] as NumPlayers[]).map((n) => (
              <button
                key={n}
                className={`btn btn-player-count ${numPlayers === n ? 'selected' : ''}`}
                onClick={() => setNumPlayers(n)}
              >
                <span className="count-number">{n}</span>
                <span className="count-label">Players</span>
              </button>
            ))}
          </div>

          {numPlayers && (
            <div className="player-preview">
              <h3>Factions</h3>
              <div className="faction-list">
                {PLAYER_TYPES[numPlayers].map((type, i) => (
                  <div key={i} className={`faction-item faction-${type.toLowerCase()}`}>
                    <span className="faction-number">P{i + 1}</span>
                    <span className="faction-name">{type}</span>
                  </div>
                ))}
              </div>
              <div className="rules-summary">
                <h4>Quick Rules</h4>
                <ul>
                  <li>Each turn: place <strong>2 Action Tokens</strong> on your Tableau cards</li>
                  <li>Personnel cards (Builder, Guide, Liaison) stay in your Tableau</li>
                  <li>Event cards (Charter, etc.) are removed after use</li>
                  <li>Win by acquiring <strong>3 Seats</strong> via Mandate cards</li>
                </ul>
              </div>
            </div>
          )}

          <button
            className="btn btn-start"
            disabled={!numPlayers}
            onClick={() => setStarted(true)}
          >
            Start Game
          </button>
        </div>
      </div>
    </div>
  );
}
