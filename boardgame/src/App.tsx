import { useCallback, useState } from 'react';
import { Board } from './components/Board';
import { Lobby } from './multiplayer/Lobby';
import { OnlineGameView } from './multiplayer/OnlineGameView';
import type { PlayerType } from './game/types';
import { useLocalGame } from './ui/useLocalGame';
import { FACTION_BLURB } from './ui/theme';
import './App.css';
import './ui/board.css';

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

/**
 * A local game. Solo: the screen always shows the human seat. Hot seat: the
 * screen follows whoever the game is waiting on (turn player or reactor).
 */
function GameView({ numPlayers, aiPlayerIndices }: { numPlayers: NumPlayers; aiPlayerIndices: number[] }) {
  const roster = PLAYER_TYPES[numPlayers];
  const { map, error, seats, movesFor } = useLocalGame(roster, aiPlayerIndices);
  if (error) return <div className="online-status"><div className="online-status__card"><h2>Could not start</h2><p>{error}</p></div></div>;
  const any = seats.find((s) => s !== null);
  if (!map || !any) return <div className="online-status"><div className="online-status__card"><div className="online-status__spinner" /><h2>Loading the island…</h2></div></div>;
  const humans = roster.map((_, i) => i).filter((i) => !aiPlayerIndices.includes(i));
  const controller = any.G.reaction ? any.G.reaction.reactor : any.G.turn.player;
  const me = humans.length === 1 ? humans[0] : humans.includes(controller) ? controller : humans[0];
  const view = seats[me];
  const moves = movesFor(me);
  if (!view || !moves) return null;
  const seatNote = humans.length > 1 ? `Hot seat: pass the screen to the ${roster[me]}.` : undefined;
  return <Board key={me} map={map} G={view.G} me={me} moves={moves} aiSeats={aiPlayerIndices} seatNote={seatNote} />;
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
  const [gameKey, setGameKey] = useState(0);
  const [aiPlayerIndices, setAiPlayerIndices] = useState<number[]>([]);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);

  const [soloFaction, setSoloFaction] = useState<PlayerType | null>(null);
  const [soloOpponents, setSoloOpponents] = useState<1 | 2 | 3>(2);

  const handleNewGame = useCallback(() => {
    setStarted(false);
    setNumPlayers(null);
    setGameMode('menu');
    setAiPlayerIndices([]);
    setSoloFaction(null);
    setOnlineSession(null);
    setGameKey(k => k + 1);
  }, []);

  const handleStartHotseat = useCallback(() => {
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
        <GameView key={gameKey} numPlayers={numPlayers} aiPlayerIndices={aiPlayerIndices} />
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
                  <span className="start-screen__option-detail">{FACTION_BLURB[pt]}</span>
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
