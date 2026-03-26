import React from 'react';
import type { PlayerState, PendingAction } from '../game/types';
import { Tableau } from './Tableau';
import { PLAYER_COLORS, PLAYER_BG_COLORS } from '../data/cardRules';

interface PlayerPanelProps {
  player: PlayerState;
  playerIndex: number;
  isCurrentPlayer: boolean;
  tokensUsedThisTurn: string[];
  pendingAction: PendingAction | null;
  actionsRemaining: number;
  onActivateCard: (instanceId: string) => void;
}

const ResourceIcon: Record<string, string> = {
  coins: '🪙',
  wood: '🪵',
  ore: '⛏️',
  votes: '🗳️',
};

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  player,
  playerIndex,
  isCurrentPlayer,
  tokensUsedThisTurn,
  pendingAction,
  actionsRemaining,
  onActivateCard,
}) => {
  const color = PLAYER_COLORS[player.type] ?? '#fff';
  const bgColor = PLAYER_BG_COLORS[player.type] ?? 'rgba(255,255,255,0.05)';

  return (
    <div
      className={`player-panel ${isCurrentPlayer ? 'player-panel-active' : ''}`}
      style={{
        borderColor: color,
        backgroundColor: bgColor,
      }}
    >
      <div className="player-header" style={{ borderBottomColor: color }}>
        <span className="player-name" style={{ color }}>
          {player.type}
        </span>
        <span className="player-index">P{playerIndex + 1}</span>
        {isCurrentPlayer && <span className="player-turn-badge">YOUR TURN</span>}
        <span className="player-seats">
          {'💺'.repeat(player.seats)}
          {player.seats === 0 && <span style={{ opacity: 0.4 }}>no seats</span>}
        </span>
      </div>

      <div className="player-resources">
        {(['coins', 'wood', 'ore', 'votes'] as const).map((res) => (
          <div key={res} className="resource-pill">
            <span className="resource-icon">{ResourceIcon[res]}</span>
            <span className="resource-value">{player.resources[res]}</span>
          </div>
        ))}
      </div>

      <Tableau
        player={player}
        isCurrentPlayer={isCurrentPlayer}
        tokensUsedThisTurn={tokensUsedThisTurn}
        pendingAction={pendingAction}
        actionsRemaining={actionsRemaining}
        onActivateCard={onActivateCard}
      />
    </div>
  );
};
