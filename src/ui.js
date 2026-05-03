/**
 * ui.js — UI event handling
 * Routes mouse/keyboard events to the hotbar and inventory.
 */
import { hotbar, rebuildPetals }                          from './petals.js';
import { toggleInventory, addToInventory, removeFromInventory } from './inventory.js';
import { onHotbarMouseDown, onHotbarMouseMove, onHotbarMouseUp, drag, onSwapKey, onSwapAll, toggleCraftingPanel } from './uiManager.js';
import { settings } from './settings.js';

// ── Mouse tracking ────────────────────────────────────────────────────────────
export const mousePos = { x: 0, y: 0 };
export let uiConsumedLastMouseDown = false;

export function handleMouseMove(x, y) {
  mousePos.x = x;
  mousePos.y = y;
  onHotbarMouseMove(x, y, window.innerWidth, window.innerHeight);
}

export function handleMouseDown(x, y, canvasW, canvasH, button) {
  uiConsumedLastMouseDown = false;
  if (button === 0) {
    const consumed = onHotbarMouseDown(x, y, canvasW, canvasH);
    if (consumed) {
      uiConsumedLastMouseDown = true;
      return true;
    }
  }
  return false;
}

export function handleMouseUp(x, y, canvasW, canvasH) {
  onHotbarMouseUp(x, y, canvasW, canvasH);
}

export function handleKeyDown(key) {
  if (key === 'x' || key === 'X') {
    toggleInventory();
    return;
  }
  // K: toggle mouse movement
  if (key === 'k' || key === 'K') {
    settings.mouseMovement = !settings.mouseMovement;
    return;
  }
  if (key === 'c' || key === 'C') {
    toggleCraftingPanel();
    return;
  }
  // R: swap all slots at once
  if (key === 'r' || key === 'R') {
    onSwapAll();
    return;
  }
  // 1-5 keybinds: swap top↔bench for that slot
  const digit = parseInt(key, 10);
  if (digit >= 1 && digit <= 5) {
    onSwapKey(digit - 1); // 0-indexed
  }
}
