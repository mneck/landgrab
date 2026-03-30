import { useEffect, useRef, useCallback } from 'react';
import type { LandgrabState } from '../game/types';
import { getAIMove } from './aiStrategy';

const AI_MOVE_DELAY_MS = 400;

interface UseAIPlayerOptions {
  G: LandgrabState;
  ctx: { currentPlayer: string; turn: number; numPlayers: number };
  moves: Record<string, (...args: any[]) => any>;
  aiPlayerIndices: number[];
}

export function useAIPlayer({ G, ctx, moves, aiPlayerIndices }: UseAIPlayerOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const currentPlayerIndex = parseInt(ctx.currentPlayer);
  const isAITurn = aiPlayerIndices.includes(currentPlayerIndex);

  const executeAIMove = useCallback(() => {
    if (G.winner) return;
    if (!isAITurn) return;
    if (processingRef.current) return;

    processingRef.current = true;

    const aiMove = getAIMove(G, currentPlayerIndex);
    if (!aiMove) {
      processingRef.current = false;
      return;
    }

    const moveFn = moves[aiMove.move];
    if (moveFn) {
      moveFn(...aiMove.args);
    }

    processingRef.current = false;
  }, [G, currentPlayerIndex, isAITurn, moves]);

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
