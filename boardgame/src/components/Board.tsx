import React, { useState } from 'react';
import type { BoardProps } from 'boardgame.io/react';
import type { LandgrabState, BuildingType } from '../game/types';
import { PlayerPanel } from './PlayerPanel';
import { HexMap } from './HexMap';
import { PoliticsRow } from './PoliticsRow';
import { NetworkRow } from './NetworkRow';
import { ResourceMarket } from './ResourceMarket';
import { CARD_INFO } from '../data/cardData';
import { getAllowedBuildTypes } from '../game/gameRules';

export function Board({ G, ctx, moves, playerID }: BoardProps<LandgrabState>) {
  const [selectedHex, setSelectedHex] = useState<string | null>(null);

  const currentPlayerIndex = parseInt(ctx.currentPlayer);
  // In local mode, the active player is whoever's turn it is
  const myPlayerIndex = playerID !== undefined && playerID !== null
    ? parseInt(playerID)
    : currentPlayerIndex;
  const isMyTurn = myPlayerIndex === currentPlayerIndex;
  const currentPlayer = G.players[currentPlayerIndex];

  function handleHexClick(hexKey: string) {
    const pa = G.pendingAction;
    if (!pa || !isMyTurn) return;

    const hexPlacingActions = [
      'charter_place', 'builder_build_hex', 'elder_village_hex', 'elder_reserve_hex',
      'guide_reveal_hex', 'event_zoning_hex', 'event_conservation_hex',
      'event_logging_hex', 'event_forestry_hex', 'event_taxation_hex', 'event_urbanplanning_hex',
    ];

    if (hexPlacingActions.includes(pa.type)) {
      moves.placeOnHex(hexKey);
      setSelectedHex(null);
    }
  }

  function handleActivateCard(instanceId: string) {
    if (!isMyTurn) return;
    moves.activateCard(instanceId);
  }

  function handleEndTurn() {
    if (!isMyTurn || G.pendingAction) return;
    moves.endTurn();
  }

  function renderPendingActionUI() {
    const pa = G.pendingAction;
    if (!pa || !isMyTurn) return null;

    switch (pa.type) {
      case 'builder_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Builder: Choose an action</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('build')}>
                Build (1🪙 + 1🪵 + 1⛏️)
              </button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('market')}>
                Resource Market
              </button>
            </div>
          </div>
        );

      case 'builder_build_type': {
        const allowed = getAllowedBuildTypes(G.tiles, currentPlayer.type);
        return (
          <div className="action-panel">
            <div className="action-prompt">Choose building type, then click a hex</div>
            <div className="action-buttons">
              {allowed.map(bt => (
                <button
                  key={bt}
                  className="btn btn-primary"
                  onClick={() => moves.chooseBuildingType(bt as BuildingType)}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>
        );
      }

      case 'builder_build_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Click a valid hex to place <strong>{pa.buildingType}</strong>
              <span className="cost-badge">Cost: 1🪙 + 1🪵 + 1⛏️</span>
            </div>
          </div>
        );

      case 'builder_market_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Resource Market: Choose action</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('buy_wood')}>Buy Wood</button>
              <button className="btn btn-primary" onClick={() => moves.chooseOption('buy_ore')}>Buy Ore</button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('sell_wood')}>Sell Wood</button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('sell_ore')}>Sell Ore</button>
            </div>
          </div>
        );

      case 'builder_market_buy':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Buying 1 {pa.resource}... <button className="btn btn-sm" onClick={() => moves.chooseOption('done')}>Done with market</button>
            </div>
          </div>
        );

      case 'builder_market_sell':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Selling 1 {pa.resource}... <button className="btn btn-sm" onClick={() => moves.chooseOption('done')}>Done with market</button>
            </div>
          </div>
        );

      case 'guide_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Guide: Choose an action</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('reveal')}>
                Reveal Fog (click a non-fog hex)
              </button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('network')}>
                Bid on Network card
              </button>
            </div>
          </div>
        );

      case 'guide_reveal_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click any non-Fog hex to reveal adjacent Fog tiles</div>
          </div>
        );

      case 'guide_network':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a Network card to start bidding</div>
          </div>
        );

      case 'liaison_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Liaison: Choose an action</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('generate')}>
                Generate Resources
              </button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('politics')}>
                Acquire Politics Card
              </button>
            </div>
          </div>
        );

      case 'liaison_politics':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a Politics card to acquire it (costs coins + votes)</div>
          </div>
        );

      case 'elder_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Elder: Choose an action</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('village')}>
                Place Village (on Fog hex)
              </button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('reserve')}>
                Place Reserve (adjacent to Village/Reserve)
              </button>
            </div>
          </div>
        );

      case 'elder_village_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a Fog hex to reveal it and place a Village</div>
          </div>
        );

      case 'elder_reserve_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a valid hex adjacent to Village/Reserve to place a Reserve</div>
          </div>
        );

      case 'charter_place':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Charter: Click a valid hex to place your first building
              <span className="cost-badge">Free!</span>
            </div>
          </div>
        );

      case 'event_import_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Import: Choose a resource to acquire for 1🪙</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('wood')}>Wood 🪵</button>
              <button className="btn btn-primary" onClick={() => moves.chooseOption('ore')}>Ore ⛏️</button>
            </div>
          </div>
        );

      case 'event_graft_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Graft: Choose an exchange</div>
            <div className="action-buttons">
              <button className="btn btn-primary" onClick={() => moves.chooseOption('coin_to_vote')}>
                Give 1🪙 → Get 1🗳️
              </button>
              <button className="btn btn-secondary" onClick={() => moves.chooseOption('vote_to_coin')}>
                Give 1🗳️ → Get 1🪙
              </button>
            </div>
          </div>
        );

      case 'event_bribe':
        return (
          <div className="action-panel">
            <div className="action-prompt">Bribe: Click a Politics card to remove it (costs 1🪙)</div>
          </div>
        );

      case 'event_zoning_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Zoning: Click a Field/Sand hex adjacent to your building to zone it</div>
          </div>
        );

      case 'event_conservation_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Conservation: Click a Forest hex to protect it</div>
          </div>
        );

      case 'event_logging_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Logging: Click a Forest hex to convert it to Field (+1🪵)</div>
          </div>
        );

      case 'event_forestry_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Forestry: Click an empty Field hex to convert it to Forest</div>
          </div>
        );

      case 'event_taxation_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Taxation: Click one of your Reserves to collect coins from adjacent opponent buildings</div>
          </div>
        );

      case 'event_urbanplanning_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Urban Planning: Click one of your production buildings (Cost: 1🪙 + 1🪵 + 1⛏️) to double its output
            </div>
          </div>
        );

      case 'network_bid':
        return (
          <div className="action-panel">
            <div className="action-prompt">Use the Network panel below to place your bid</div>
          </div>
        );

      default:
        return null;
    }
  }

  const SEATS_TO_WIN = 3;

  if (G.winner) {
    return (
      <div className="game-over">
        <h1>Game Over!</h1>
        <p className="winner-announce">{G.winner} wins with {SEATS_TO_WIN} Seats!</p>
        <p>Congratulations!</p>
      </div>
    );
  }

  return (
    <div className="board-layout">
      {/* Top bar: all player panels */}
      <div className="players-bar">
        {G.players.map((player, i) => (
          <PlayerPanel
            key={i}
            player={player}
            playerIndex={i}
            isCurrentPlayer={i === currentPlayerIndex}
            tokensUsedThisTurn={G.tokensUsedThisTurn}
            pendingAction={G.pendingAction}
            actionsRemaining={G.actionsRemainingThisTurn}
            onActivateCard={handleActivateCard}
          />
        ))}
      </div>

      {/* Fog progress bar */}
      <div className="fog-progress-bar-container">
        <div className="fog-progress-label">
          Fog Revealed: {G.fogRevealed}/{G.totalFog}
          {G.thresholdReached && <span className="threshold-badge">Mandate Phase Active</span>}
        </div>
        <div className="fog-progress-bar">
          <div
            className="fog-progress-fill"
            style={{ width: `${(G.fogRevealed / Math.max(G.totalFog, 1)) * 100}%` }}
          />
          <div
            className="fog-threshold-mark"
            style={{ left: `${((Math.floor(G.totalFog / 2) + 1) / Math.max(G.totalFog, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Center: map + action panel */}
      <div className="center-area">
        <div className="map-area">
          {renderPendingActionUI()}
          <HexMap
            tiles={G.tiles}
            pendingAction={G.pendingAction}
            playerType={currentPlayer.type}
            landClaimsActive={G.landClaimsUntilPlayer !== undefined}
            onHexClick={handleHexClick}
            selectedHex={selectedHex}
          />
        </div>
      </div>

      {/* Bottom: markets + turn control */}
      <div className="bottom-area">
        <PoliticsRow
          politicsRow={G.politicsRow}
          pendingAction={G.pendingAction}
          isCurrentPlayerTurn={isMyTurn}
          onSelectSlot={(slotIndex) => {
            if (G.pendingAction?.type === 'liaison_politics') {
              moves.selectPoliticsCard(slotIndex);
            } else if (G.pendingAction?.type === 'event_bribe') {
              moves.chooseOption(slotIndex.toString());
            }
          }}
        />

        <NetworkRow
          networkRow={G.networkRow}
          pendingAction={G.pendingAction}
          isCurrentPlayerTurn={isMyTurn}
          playerCoins={currentPlayer.resources.coins}
          onSelectSlot={(slotIndex) => moves.selectNetworkCard(slotIndex)}
          onPlaceBid={(amount) => moves.placeBid(amount)}
        />

        <ResourceMarket woodMarket={G.woodMarket} oreMarket={G.oreMarket} />

        <div className="turn-control">
          <div className="turn-info">
            <span className="turn-player">
              Current Turn: <strong>{currentPlayer.type}</strong> (P{currentPlayerIndex + 1})
            </span>
            <span className="turn-round">Round {ctx.turn}</span>
          </div>
          {isMyTurn && !G.pendingAction && (
            <button className="btn btn-end-turn" onClick={handleEndTurn}>
              End Turn
            </button>
          )}
          {G.pendingAction && (
            <span className="pending-label">Resolve current action first</span>
          )}
        </div>
      </div>
    </div>
  );
}
