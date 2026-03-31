import { useEffect, useRef, useCallback } from 'react';
import type { LandgrabState } from '../game/types';
import { getAIMove } from './aiStrategy';

const AI_MOVE_DELAY_MS = 400;

interface UseAIPlayerOptions {
  G: LandgrabState;
  ctx: {
    currentPlayer: string;
    turn: number;
    numPlayers: number;
    activePlayers?: null | Record<string, string>;
  };
  moves: Record<string, (...args: any[]) => any>;
  aiPlayerIndices: number[];
  activeNetworkBidder: string | null;
}

export function useAIPlayer({
  G,
  ctx,
  moves,
  aiPlayerIndices,
  activeNetworkBidder,
}: UseAIPlayerOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const currentPlayerIndex = parseInt(ctx.currentPlayer, 10);

  const aiPlayerIndexForMove =
    G.pendingAction?.type === 'network_bid' && activeNetworkBidder !== null
      ? parseInt(activeNetworkBidder, 10)
      : currentPlayerIndex;

  const isAITurn = aiPlayerIndices.includes(aiPlayerIndexForMove);

  const executeAIMove = useCallback(() => {
    if (G.winner) return;
    if (!isAITurn) return;
    if (processingRef.current) return;

    processingRef.current = true;

    const aiMove = getAIMove(G, aiPlayerIndexForMove);
    if (!aiMove) {
      processingRef.current = false;
      return;
    }

    const moveFn = moves[aiMove.move];
    if (moveFn) {
      moveFn(...aiMove.args);
    }

    processingRef.current = false;
  }, [G, isAITurn, moves, aiPlayerIndexForMove]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isAITurn || G.winner) return;

    timerRef.current = setTimeout(executeAIMove, AI_MOVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAITurn, G, executeAIMove]);

  return { isAITurn };
}
