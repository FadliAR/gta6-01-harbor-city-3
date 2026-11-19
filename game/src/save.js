// NEON HARBOR — save / continue through localStorage. One slot holds the
// cash, the mission index, the player's position and the wanted level, so a
// returning player picks up where they left off from the title screen.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: state.cash,
      missionIndex: state.missionIndex,
      player: { x: state.player.x, z: state.player.z },
      wanted: state.wanted,
      health: state.health,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* storage unavailable */ }
}
