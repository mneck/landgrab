import { describe, it, expect } from 'vitest';
import { runBotGame } from './simulator';

describe('playtesting smoke', () => {
  it('completes a 2-player bot game with a winner', async () => {
    const r = await runBotGame({ numPlayers: 2, fastWin: true });
    expect(r.ok, r.error).toBe(true);
    expect(r.winner).toBeDefined();
  }, 600_000);
});
