import {
  PLAYER_RADIUS, PLAYER_SPEED,
  PLAYER_COLOR, PLAYER_BORDER,
  PLAYER_MAX_HP,
  PLAYER_MASS,
} from './constants.js';
import { inputState } from './inputState.js';
import { canMoveTo, findSafeSpawnPosition } from './map.js';
import { hotbar } from './petals.js';
import { PETAL_TYPES } from './petalTypes.js';
import { settings } from './settings.js';
import { mousePos } from './ui.js';
import { camera, zoom } from './camera.js';
import { inventoryOpen } from './inventory.js';
import { isSettingsOpen } from './uiManager.js';

// Find safe spawn position for player
const safeSpawn = findSafeSpawnPosition(PLAYER_RADIUS);

export let isMoving = false;

export const player = {
  x:         safeSpawn.x,
  y:         safeSpawn.y,
  radius:    PLAYER_RADIUS,
  speed:     PLAYER_SPEED,
  color:     PLAYER_COLOR,
  border:    PLAYER_BORDER,
  hp:        PLAYER_MAX_HP,
  maxHp:     PLAYER_MAX_HP,
  dead:      false,
  mass:      PLAYER_MASS,
  vx:        0,
  vy:        0,
  moveAngle: 0,   // last WASD direction in radians — used for eye tracking
  smoothRotation: 0,   // smoothed rotation for centipede legs
  legPhase:  0,   // animation phase for centipede legs accessory
  name:      'Unnamed',
  _soilHpBonus: 0,  // cached sum of maxHpBonus from equipped soil petals
};

export function updatePlayer() {
  // ── Accessory bonuses from hotbar ────────────────────────────────────────
  let speedBonus = 0;
  let soilBonus  = 0;
  for (const typeId of hotbar) {
    if (!typeId) continue;
    const pt = PETAL_TYPES[typeId];
    if (pt?.walkSpeedBonus) speedBonus += pt.walkSpeedBonus;
    if (pt?.maxHpBonus)     soilBonus  += pt.maxHpBonus;
  }
  player.speed = PLAYER_SPEED + speedBonus;

  // Update maxHp when soil bonus changes; clamp hp on unequip
  if (soilBonus !== player._soilHpBonus) {
    player._soilHpBonus = soilBonus;
    player.maxHp = PLAYER_MAX_HP + soilBonus;
    player.hp    = Math.min(player.hp, player.maxHp);
  }

  let dx = 0, dy = 0;
  if (inputState.up)    dy -= 1;
  if (inputState.down)  dy += 1;
  if (inputState.left)  dx -= 1;
  if (inputState.right) dx += 1;

  // Normalize diagonal WASD movement
  if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

  // Mouse movement: move toward mouse cursor when enabled and no WASD held
  // Blocked while any GUI panel is open (inventory, settings)
  const guiOpen = inventoryOpen || isSettingsOpen();
  if (settings.mouseMovement && !guiOpen && dx === 0 && dy === 0) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Convert mouse screen pos to world pos
    const worldMX = (mousePos.x - W / 2) / zoom + camera.x;
    const worldMY = (mousePos.y - H / 2) / zoom + camera.y;
    const distX = worldMX - player.x;
    const distY = worldMY - player.y;
    const dist  = Math.hypot(distX, distY);
    // Only move if mouse is far enough away (dead zone = 10 world units)
    if (dist > 10) {
      dx = distX / dist;
      dy = distY / dist;
    }
  }

  // Update eye direction whenever a WASD key is held
  isMoving = dx !== 0 || dy !== 0;
  if (isMoving) {
    player.moveAngle = Math.atan2(dy, dx);
  }

  // Decay knockback velocity (friction)
  player.vx *= 0.78;
  player.vy *= 0.78;

  const newX = player.x + dx * player.speed + player.vx;
  const newY = player.y + dy * player.speed + player.vy;

  if (canMoveTo(newX, newY, player.radius)) {
    player.x = newX;
    player.y = newY;
    // Animate centipede legs only when actually moving
    if (isMoving) {
      player.legPhase += 0.14;
    }
  } else {
    player.vx = 0;
    player.vy = 0;
  }
}