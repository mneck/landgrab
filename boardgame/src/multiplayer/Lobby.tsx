import { useState, useEffect, useCallback, useRef } from 'react';
import { LobbyClient } from 'boardgame.io/client';

const PLAYER_TYPES: Record<number, string[]> = {
  2: ['Hotelier', 'Industrialist'],
  3: ['Hotelier', 'Industrialist', 'Chieftain'],
  4: ['Hotelier', 'Industrialist', 'Chieftain', 'Bureaucrat'],
};

const PLAYER_ICONS: Record<string, string> = {
  Hotelier: '\u{1F3E8}',
  Industrialist: '\u{1F3ED}',
  Chieftain: '\u{1F3D5}\uFE0F',
  Bureaucrat: '\u{1F3DB}\uFE0F',
};

interface MatchPlayer {
  id: number;
  name?: string;
}

interface MatchInfo {
  matchID: string;
  players: MatchPlayer[];
  createdAt: number;
  updatedAt: number;
  gameName: string;
}

interface LobbyProps {
  serverURL: string;
  onJoinMatch: (info: {
    matchID: string;
    playerID: string;
    credentials: string;
    numPlayers: number;
  }) => void;
  onBack: () => void;
}

type LobbyView = 'list' | 'create' | 'waiting';

export function Lobby({ serverURL, onJoinMatch, onBack }: LobbyProps) {
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('landgrab_playerName') || '',
  );
  const [view, setView] = useState<LobbyView>('list');
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [createPlayers, setCreatePlayers] = useState<number>(2);
  const [waitingMatch, setWaitingMatch] = useState<{
    matchID: string;
    playerID: string;
    credentials: string;
    numPlayers: number;
  } | null>(null);
  const [matchDetail, setMatchDetail] = useState<MatchInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lobbyRef = useRef(
    new LobbyClient({ server: serverURL || undefined }),
  );

  useEffect(() => {
    if (playerName) localStorage.setItem('landgrab_playerName', playerName);
  }, [playerName]);

  const refreshMatches = useCallback(async () => {
    try {
      const result = await lobbyRef.current.listMatches('landgrab');
      setMatches(result.matches as MatchInfo[]);
    } catch {
      // server might not be running yet
    }
  }, []);

  useEffect(() => {
    refreshMatches();
    const id = setInterval(refreshMatches, 3000);
    return () => clearInterval(id);
  }, [refreshMatches]);

  useEffect(() => {
    if (!waitingMatch) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const match = await lobbyRef.current.getMatch(
          'landgrab',
          waitingMatch.matchID,
        );
        if (cancelled) return;
        setMatchDetail(match as MatchInfo);

        const allJoined = (match.players as MatchPlayer[]).every(
          (p) => p.name,
        );
        if (allJoined) {
          onJoinMatch(waitingMatch);
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [waitingMatch, onJoinMatch]);

  const handleCreateMatch = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { matchID } = await lobbyRef.current.createMatch('landgrab', {
        numPlayers: createPlayers,
      });
      const resp = await lobbyRef.current.joinMatch('landgrab', matchID, {
        playerName: playerName.trim(),
      });
      setWaitingMatch({
        matchID,
        playerID: String(resp.playerID ?? '0'),
        credentials: resp.playerCredentials,
        numPlayers: createPlayers,
      });
      setView('waiting');
    } catch (e: any) {
      setError(e.message || 'Failed to create match');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMatch = async (matchID: string, numPlayers: number) => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await lobbyRef.current.joinMatch('landgrab', matchID, {
        playerName: playerName.trim(),
      });
      setWaitingMatch({
        matchID,
        playerID: String(resp.playerID ?? '0'),
        credentials: resp.playerCredentials,
        numPlayers,
      });
      setView('waiting');
    } catch (e: any) {
      setError(e.message || 'Failed to join match');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveMatch = async () => {
    if (!waitingMatch) return;
    try {
      await lobbyRef.current.leaveMatch('landgrab', waitingMatch.matchID, {
        playerID: waitingMatch.playerID,
        credentials: waitingMatch.credentials,
      });
    } catch {
      /* ignore */
    }
    setWaitingMatch(null);
    setMatchDetail(null);
    setView('list');
    refreshMatches();
  };

  // ── Waiting Room ──
  if (view === 'waiting' && waitingMatch) {
    const factions = PLAYER_TYPES[waitingMatch.numPlayers] || [];
    return (
      <div className="start-screen">
        <div className="start-screen__content">
          <h2 className="lobby__title">Waiting for Players</h2>

          <div className="lobby__match-id">
            Match ID: <code className="lobby__code">{waitingMatch.matchID}</code>
          </div>

          <div className="lobby__seats">
            {(matchDetail?.players ?? []).map((p, i) => (
              <div
                key={i}
                className={`lobby__seat ${p.name ? 'lobby__seat--filled' : 'lobby__seat--empty'}`}
              >
                <span className="lobby__seat-icon">
                  {PLAYER_ICONS[factions[i]] || '?'}
                </span>
                <div className="lobby__seat-info">
                  <span className="lobby__seat-faction">{factions[i]}</span>
                  <span className="lobby__seat-name">
                    {p.name
                      ? `${p.name}${p.id.toString() === waitingMatch.playerID ? ' (you)' : ''}`
                      : 'Waiting...'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="lobby__hint">
            Share the match ID with friends so they can join from the lobby.
          </p>

          <button
            className="start-screen__btn start-screen__btn--back"
            onClick={handleLeaveMatch}
          >
            Leave Match
          </button>
        </div>
      </div>
    );
  }

  // ── Create Match ──
  if (view === 'create') {
    return (
      <div className="start-screen">
        <div className="start-screen__content">
          <h2 className="lobby__title">Create Match</h2>

          <div className="start-screen__options">
            {[2, 3, 4].map((n) => (
              <button
                key={n}
                className={`start-screen__btn start-screen__option-btn ${createPlayers === n ? 'start-screen__option-btn--selected' : ''}`}
                onClick={() => setCreatePlayers(n)}
              >
                <span className="start-screen__option-icons">
                  {'👤'.repeat(n)}
                </span>
                <span className="start-screen__option-label">
                  {n} Players
                </span>
                <span className="start-screen__option-detail">
                  {PLAYER_TYPES[n].join(' · ')}
                </span>
              </button>
            ))}
          </div>

          <button
            className="start-screen__btn start-screen__btn--primary"
            onClick={handleCreateMatch}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Match'}
          </button>

          {error && <p className="lobby__error">{error}</p>}

          <button
            className="start-screen__btn start-screen__btn--back"
            onClick={() => {
              setView('list');
              setError(null);
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Match List ──
  const joinable = matches.filter((m) => m.players.some((p) => !p.name));

  return (
    <div className="start-screen">
      <div className="start-screen__content lobby__content">
        <h2 className="lobby__title">Online Lobby</h2>

        <div className="lobby__name-row">
          <label className="lobby__label" htmlFor="lobby-name">
            Your Name
          </label>
          <input
            id="lobby-name"
            className="lobby__input"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            maxLength={20}
          />
        </div>

        {error && <p className="lobby__error">{error}</p>}

        <button
          className="start-screen__btn start-screen__btn--primary"
          onClick={() => {
            setError(null);
            setView('create');
          }}
          disabled={!playerName.trim()}
        >
          Create New Match
        </button>

        <div className="lobby__section">
          <h3 className="lobby__section-title">Open Matches</h3>

          {joinable.length === 0 ? (
            <p className="lobby__empty">
              No open matches. Create one to get started!
            </p>
          ) : (
            <div className="lobby__match-list">
              {joinable.map((m) => {
                const joined = m.players.filter((p) => p.name).length;
                const total = m.players.length;
                const factions = PLAYER_TYPES[total] || [];
                return (
                  <div key={m.matchID} className="lobby__match-card">
                    <div className="lobby__match-meta">
                      <span className="lobby__match-count">
                        {joined}/{total} players
                      </span>
                      <span className="lobby__match-factions">
                        {factions.map((f) => PLAYER_ICONS[f]).join(' ')}
                      </span>
                    </div>
                    <button
                      className="lobby__join-btn"
                      onClick={() => handleJoinMatch(m.matchID, total)}
                      disabled={loading || !playerName.trim()}
                    >
                      Join
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          className="start-screen__btn start-screen__btn--back"
          onClick={onBack}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}
