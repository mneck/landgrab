import type { GameState } from "./types/game";

const SAVE_KEY = "landgrab_game_state";

/**
 * Persists game state to sessionStorage.
 * Saved state is cleared when the tab is closed or on hard reload (clear site data).
 */
export function saveGameState(game: GameState): void {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch (e) {
    console.warn("Failed to save game:", e);
  }
}

/**
 * Returns saved game state from sessionStorage, or null if none or invalid.
 */
export function loadGameState(): GameState | null {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (
      parsed &&
      typeof parsed.mapRadius === "number" &&
      Array.isArray(parsed.players) &&
      typeof parsed.tiles === "object"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearGameState(): void {
  try {
    sessionStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.warn("Failed to clear game:", e);
  }
}
