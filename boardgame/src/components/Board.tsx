import { useState } from 'react';
import type { LandgrabState, BuildingType } from '../game/types';
import { CARD_INFO } from '../data/cardData';
import { PlayerPanel } from './PlayerPanel';
import { HexMap } from './HexMap';
import { PoliticsRow } from './PoliticsRow';
import { NetworkRow } from './NetworkRow';
import { ResourceMarket } from './ResourceMarket';
import { getAllowedBuildTypes, hasAnyValidBuildHex } from '../game/gameRules';
import { useAIPlayer } from '../ai/aiRunner';

export interface LandgrabBoardProps {
  G: LandgrabState;
  ctx: { currentPlayer: string; turn: number; numPlayers: number };
  moves: Record<string, (...args: any[]) => any>;
  playerID?: string | null;
  aiPlayerIndices?: number[];
}

export function Board({ G, ctx, moves, playerID, aiPlayerIndices = [] }: LandgrabBoardProps) {
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const currentPlayerIndex = parseInt(ctx.currentPlayer);
  const myPlayerIndex = playerID !== undefined && playerID !== null
    ? parseInt(playerID)
    : currentPlayerIndex;
  const isMyTurn = myPlayerIndex === currentPlayerIndex;
  const currentPlayer = G.players[currentPlayerIndex];

  const { isAITurn } = useAIPlayer({ G, ctx, moves, aiPlayerIndices });
  const humanCanAct = isMyTurn && !isAITurn;

  function handleHexClick(hexKey: string) {
    const pa = G.pendingAction;
    if (!pa || !humanCanAct) return;

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

  function handleSelectCard(instanceId: string) {
    if (!humanCanAct) return;
    setSelectedCardId(prev => prev === instanceId ? null : instanceId);
  }

  function handleConfirmCard() {
    if (!humanCanAct || !selectedCardId) return;
    moves.activateCard(selectedCardId);
    setSelectedCardId(null);
  }

  function handleEndTurn() {
    if (!humanCanAct || G.pendingAction) return;
    setSelectedCardId(null);
    moves.endTurn();
  }

  const NON_CANCELLABLE = new Set([
    'builder_market_buy',
    'builder_market_sell',
  ]);

  function handleCancelAction() {
    if (!humanCanAct || !G.pendingAction) return;
    moves.cancelAction();
  }

  function renderPendingActionUI() {
    const pa = G.pendingAction;
    if (!pa || !humanCanAct) return null;

    switch (pa.type) {
      case 'builder_choose': {
        const canBuild = hasAnyValidBuildHex(G.tiles, currentPlayer.type, G.landClaimsUntilPlayer !== undefined);
        return (
          <div className="action-panel">
            <div className="action-prompt">Builder: Choose an action</div>
            <div className="action-buttons">
              <button
                onClick={() => moves.chooseOption('build')}
                disabled={!canBuild}
                title={canBuild ? undefined : 'No valid build locations — place your Charter first'}
              >
                Build (1 coin + 1 wood + 1 ore)
              </button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('market')}>
                Resource Market
              </button>
            </div>
          </div>
        );
      }

      case 'builder_build_type': {
        const allowed = getAllowedBuildTypes(G.tiles, currentPlayer.type);
        return (
          <div className="action-panel">
            <div className="action-prompt">Choose building type</div>
            <div className="action-buttons">
              {allowed.map(bt => (
                <button
                  key={bt}
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
              <span className="cost-badge">1 coin + 1 wood + 1 ore</span>
            </div>
          </div>
        );

      case 'builder_market_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Resource Market</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('buy_wood')}>Buy Wood</button>
              <button onClick={() => moves.chooseOption('buy_ore')}>Buy Ore</button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('sell_wood')}>Sell Wood</button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('sell_ore')}>Sell Ore</button>
            </div>
          </div>
        );

      case 'builder_market_buy':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Buying 1 {pa.resource}...
              <button onClick={() => moves.chooseOption('done')}>Done</button>
            </div>
          </div>
        );

      case 'builder_market_sell':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Selling 1 {pa.resource}...
              <button onClick={() => moves.chooseOption('done')}>Done</button>
            </div>
          </div>
        );

      case 'guide_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Guide: Choose an action</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('reveal')}>
                Reveal Fog
              </button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('network')}>
                Bid on Network card
              </button>
            </div>
          </div>
        );

      case 'guide_reveal_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a non-Fog hex to reveal adjacent Fog tiles</div>
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
              <button onClick={() => moves.chooseOption('generate')}>
                Generate Resources
              </button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('politics')}>
                Acquire Politics Card
              </button>
            </div>
          </div>
        );

      case 'liaison_politics':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a Politics card to acquire it</div>
          </div>
        );

      case 'elder_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Elder: Choose an action</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('village')}>
                Place Village (on Fog)
              </button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('reserve')}>
                Place Reserve
              </button>
            </div>
          </div>
        );

      case 'elder_village_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a Fog hex to reveal and place Village</div>
          </div>
        );

      case 'elder_reserve_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Click a hex adjacent to Village/Reserve</div>
          </div>
        );

      case 'charter_place':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Charter: Click a valid hex for your starting building
              <span className="cost-badge">Free</span>
            </div>
          </div>
        );

      case 'event_import_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Import: Choose a resource (1 coin)</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('wood')}>Wood</button>
              <button onClick={() => moves.chooseOption('ore')}>Ore</button>
            </div>
          </div>
        );

      case 'event_graft_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Graft: Choose an exchange</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('coin_to_vote')}>
                1 Coin to 1 Vote
              </button>
              <button className="btn-secondary" onClick={() => moves.chooseOption('vote_to_coin')}>
                1 Vote to 1 Coin
              </button>
            </div>
          </div>
        );

      case 'event_bribe':
        return (
          <div className="action-panel">
            <div className="action-prompt">Bribe: Click a Politics card to remove (1 coin)</div>
          </div>
        );

      case 'event_zoning_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Zoning: Click a Field/Sand hex adjacent to your building</div>
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
            <div className="action-prompt">Logging: Click a Forest hex to convert (+1 wood)</div>
          </div>
        );

      case 'event_forestry_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Forestry: Click a Field hex to convert to Forest</div>
          </div>
        );

      case 'event_taxation_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">Taxation: Click your Reserve to collect</div>
          </div>
        );

      case 'event_urbanplanning_hex':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Urban Planning: Click a production building (1 coin + 1 wood + 1 ore)
            </div>
          </div>
        );

      case 'broker_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Broker: Choose an event card to add</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('import')}>Import</button>
              <button onClick={() => moves.chooseOption('export')}>Export</button>
            </div>
          </div>
        );

      case 'forester_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">Forester: Choose an event card to add</div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseOption('logging')}>Logging</button>
              <button onClick={() => moves.chooseOption('forestry')}>Forestry</button>
            </div>
          </div>
        );

      case 'event_restructuring_choose': {
        const personnelCards = currentPlayer.tableau.filter(c => c.category === 'Personnel');
        return (
          <div className="action-panel">
            <div className="action-prompt">Restructuring: Choose a Personnel card to remove</div>
            <div className="action-buttons">
              {personnelCards.map(c => {
                const info = CARD_INFO[c.cardType];
                return (
                  <button key={c.instanceId} onClick={() => moves.chooseRestructuringTarget(c.instanceId)}>
                    {info?.icon ?? '?'} {info?.title ?? c.cardType}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      case 'event_stimulus_choose':
        return (
          <div className="action-panel">
            <div className="action-prompt">
              Stimulus: Pick {pa.remaining} more resource{pa.remaining !== 1 ? 's' : ''} (any mix of 4)
            </div>
            <div className="action-buttons">
              <button onClick={() => moves.chooseStimulusResource('coins')}>💰 Coin</button>
              <button onClick={() => moves.chooseStimulusResource('wood')}>🪵 Wood</button>
              <button onClick={() => moves.chooseStimulusResource('ore')}>⚙️ Ore</button>
              <button onClick={() => moves.chooseStimulusResource('votes')}>🗳️ Vote</button>
            </div>
          </div>
        );

      case 'network_bid':
        return (
          <div className="action-panel">
            <div className="action-prompt">Place your bid in the Network panel</div>
          </div>
        );

      default:
        return null;
    }
  }

  const SEATS_TO_WIN = 2;

  if (G.winner) {
    return (
      <div className="game-over">
        <h1>Game Over</h1>
        <p className="winner-announce">{G.winner} wins with {SEATS_TO_WIN} Seats!</p>
      </div>
    );
  }

  return (
    <div className="board-layout">
      <div className="game-content">
        {/* Left sidebar: players, current player first */}
        <div className="players-sidebar">
          {(() => {
            const indices = G.players.map((_, i) => i);
            const sorted = [
              currentPlayerIndex,
              ...indices.filter(i => i !== currentPlayerIndex),
            ];
            return sorted.map(i => (
              <PlayerPanel
                key={i}
                player={G.players[i]}
                playerIndex={i}
                isCurrentPlayer={i === currentPlayerIndex}
                tokensUsedThisTurn={G.tokensUsedThisTurn}
                pendingAction={G.pendingAction}
                actionsRemaining={G.actionsRemainingThisTurn}
                selectedCardId={i === currentPlayerIndex ? selectedCardId : null}
                onSelectCard={handleSelectCard}
              />
            ));
          })()}
        </div>

        {/* Center: map + markets */}
        <div className="map-and-markets">
          <div className="map-row">
            {/* Action panel (left of map) */}
            <div className="actions-bar">
              <div className="game-actions">
                <div className="actions-left">
                  Actions: {G.actionsRemainingThisTurn}/2
                </div>

                {renderPendingActionUI()}

                {isAITurn && (
                  <div className="ai-thinking-indicator">
                    <span className="ai-thinking-spinner" />
                    AI is thinking ({G.players[currentPlayerIndex].type})...
                  </div>
                )}

                {humanCanAct && G.pendingAction && !NON_CANCELLABLE.has(G.pendingAction.type)
                  && !(G.pendingAction.type === 'event_stimulus_choose' && G.pendingAction.remaining < 4)
                  && (
                  <button className="btn-cancel" onClick={handleCancelAction}>
                    Cancel Action
                  </button>
                )}

                {humanCanAct && !G.pendingAction && selectedCardId && (() => {
                  const card = currentPlayer.tableau.find(c => c.instanceId === selectedCardId);
                  if (!card) return null;
                  const info = CARD_INFO[card.cardType];
                  const isUsed = G.tokensUsedThisTurn.includes(card.instanceId);
                  const canActivate = !isUsed && G.actionsRemainingThisTurn > 0
                    && card.cardType !== 'Seat'
                    && (card.cardType !== 'Mandate' || G.tokensUsedThisTurn.length === 0);
                  return (
                    <div className="card-preview">
                      <div className="card-preview__header">
                        <span className="card-preview__icon">{info?.icon ?? '?'}</span>
                        <span className="card-preview__title">{info?.title ?? card.cardType}</span>
                        {card.category === 'Event' && <span className="card-event-badge">EVENT</span>}
                      </div>
                      <div className="card-preview__desc">{info?.description ?? ''}</div>
                      <div className="card-preview__actions">
                        <button
                          onClick={handleConfirmCard}
                          disabled={!canActivate}
                          title={isUsed ? 'Already used this turn' : undefined}
                        >
                          Take Action
                        </button>
                        <button className="btn-secondary" onClick={() => setSelectedCardId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {humanCanAct && !G.pendingAction && !selectedCardId && (
                  <>
                    <div className="select-card-hint">Select a card from your Tableau</div>
                    <button className="btn-end-turn" onClick={handleEndTurn}>
                      End Turn
                    </button>
                  </>
                )}

                <div className="turn-round" style={{ marginTop: '0.5rem' }}>
                  Round {ctx.turn}
                </div>
              </div>

              {/* Fog bar */}
              <div className="fog-progress-bar-container">
                <div className="fog-progress-label">
                  Fog: {G.fogRevealed}/{G.totalFog}
                  {G.thresholdReached && <span className="threshold-badge">Mandate Active</span>}
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
            </div>

            {/* Map */}
            <div className="map-section">
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

          {/* Markets (3-column) */}
          <div className="markets-section">
            <PoliticsRow
              politicsRow={G.politicsRow}
              pendingAction={G.pendingAction}
              isCurrentPlayerTurn={humanCanAct}
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
              isCurrentPlayerTurn={humanCanAct}
              playerCoins={currentPlayer.resources.coins}
              onSelectSlot={(slotIndex) => moves.selectNetworkCard(slotIndex)}
              onPlaceBid={(amount) => moves.placeBid(amount)}
            />

            <ResourceMarket woodMarket={G.woodMarket} oreMarket={G.oreMarket} />
          </div>
        </div>
      </div>
    </div>
  );
}
