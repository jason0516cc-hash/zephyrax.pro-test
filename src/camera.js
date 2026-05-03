import { CAMERA_LAG, PETAL_ORIGIN_LAG } from './constants.js';

export const camera = { x: 0, y: 0 };
export let zoom = 1;

// Default zoom limits
export const DEFAULT_MIN_ZOOM = 0.56;  // most zoomed out (default)
export const MAX_ZOOM_IN      = 1.61;  // most zoomed in

// The current minimum zoom (may be lowered by antennae vision bonus)
export let minZoom = DEFAULT_MIN_ZOOM;

export function setMinZoom(z) {
  minZoom = z;
  // Re-clamp current zoom in case the new limit is more permissive
  zoom = Math.max(minZoom, Math.min(MAX_ZOOM_IN, zoom));
}

export function setZoom(z) {
  zoom = Math.max(minZoom, Math.min(MAX_ZOOM_IN, z));
}

// Petals orbit this point, which lags behind the player
export const petalOrigin = { x: 0, y: 0 };

export function initCamera(playerX, playerY) {
  camera.x       = playerX;
  camera.y       = playerY;
  petalOrigin.x  = playerX;
  petalOrigin.y  = playerY;
}

export function updateCamera(playerX, playerY) {
  camera.x      += (playerX - camera.x)      * CAMERA_LAG;
  camera.y      += (playerY - camera.y)      * CAMERA_LAG;
  petalOrigin.x += (playerX - petalOrigin.x) * PETAL_ORIGIN_LAG;
  petalOrigin.y += (playerY - petalOrigin.y) * PETAL_ORIGIN_LAG;
}

// Convert a world position to screen-space given canvas dimensions.
export function toScreen(wx, wy, canvasW, canvasH) {
  return {
    sx: (wx - camera.x) * zoom + canvasW  / 2,
    sy: (wy - camera.y) * zoom + canvasH / 2,
  };
}
