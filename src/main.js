/**
 * main.js — Game entry point.
 *
 * Import order matters:
 *  1. inputState  (no deps)
 *  2. input       (attaches window event listeners, imports ui.js)
 *  3. everything else
 */
import './input.js';                                  // side-effect: registers all listeners

import { player, updatePlayer }          from './player.js';
import { updatePetals, hotbar, rebuildPetals } from './petals.js';
import { initCamera, updateCamera,
         camera, petalOrigin,
         zoom, setZoom,
         setMinZoom, DEFAULT_MIN_ZOOM }  from './camera.js';
import { render }                        from './renderer.js';
import { initMobs, updateMobs }          from './mobs.js';
import { updateCombat }                  from './combat.js';
import { updateDrops, checkPickups }     from './drops.js';
import { updateDamagePopups } from './damagePopups.js';
import { addToInventory }                from './inventory.js';
import { initUI, notifyInventoryChanged,
         updateHotbar, updateInventory,
         updateSettingsCog }             from './uiManager.js';
import { setHomescreenMode }             from './HotbarUI.js';
import { initTooltip }                   from './mobTooltip.js';
import { PETAL_TYPES, SCALABLE_PETAL_IDS } from './petalTypes.js';
import { settings }                      from './settings.js';
import { linkSettings }                  from './inputState.js';
linkSettings(settings);
import { benchBar }                      from './petals.js';

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');

// Track CSS-pixel dimensions separately — render logic works in CSS pixels
let canvasW = window.innerWidth;
let canvasH = window.innerHeight;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvasW   = window.innerWidth;
  canvasH   = window.innerHeight;

  canvas.width        = Math.round(canvasW * dpr);
  canvas.height       = Math.round(canvasH * dpr);
  canvas.style.width  = canvasW + 'px';
  canvas.style.height = canvasH + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

// ── Scroll wheel zoom ─────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  setZoom(zoom * factor);
}, { passive: false });

// ── Early UI init — runs before play so panels exist on homescreen ────────────
for (let i = 0; i < 5; i++) addToInventory('basic');
initUI();
initTooltip(canvas);

// ── Homescreen hotbar canvas loop (exported for homescreen.js) ────────────────
let _homebar_raf = null;

export function startHomescreenHotbar() {
  setHomescreenMode(true);
  function frame() {
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    ctx.clearRect(0, 0, canvasW, canvasH);
    // Position the hotbar just below the name+play row
    // hbTop(virtualH) = virtualH - (HB_PAD_B + HS_SLOT_SIZE + HS_BENCH_ROW_GAP + HS_BENCH_SIZE)
    //                 = virtualH - (18 + 68 + 10 + 54) = virtualH - 150
    // So: virtualH = desiredHotbarTop + 150
    const homeContent = document.querySelector('.home-content');
    const rect = homeContent ? homeContent.getBoundingClientRect() : null;
    const hotbarGap = 28; // px gap between UI and hotbar
    const hotbarOffset = 18 + 68 + 10 + 54; // HB_PAD_B + HS_SLOT_SIZE + HS_BENCH_ROW_GAP + HS_BENCH_SIZE
    const desiredTop = rect ? rect.bottom + hotbarGap : canvasH * 0.65;
    const virtualH = desiredTop + hotbarOffset;
    updateHotbar(ctx, canvasW, virtualH);
    updateInventory();
    updateSettingsCog(performance.now());
    _homebar_raf = requestAnimationFrame(frame);
  }
  _homebar_raf = requestAnimationFrame(frame);
}

function stopHomescreenHotbar() {
  if (_homebar_raf) { cancelAnimationFrame(_homebar_raf); _homebar_raf = null; }
}

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();
let _lastMinZoom = DEFAULT_MIN_ZOOM;

function loop(now) {
  const dt = Math.min(now - lastTime, 100);
  lastTime = now;

  updatePlayer();
  updateCamera(player.x, player.y);
  updatePetals(dt, petalOrigin.x, petalOrigin.y);
  updateMobs(dt, player.x, player.y);
  updateCombat(dt);
  updateDrops(dt);
  updateDamagePopups(dt);

  // ── Antennae vision bonus ────────────────────────────────────────────────
  let totalVisionBonus = 0;
  for (const typeId of hotbar) {
    if (!typeId) continue;
    const pt = PETAL_TYPES[typeId];
    if (pt?.visionBonus) totalVisionBonus += pt.visionBonus;
  }
  const newMinZoom = DEFAULT_MIN_ZOOM / (1 + totalVisionBonus);
  if (Math.abs(newMinZoom - _lastMinZoom) > 0.0001) {
    const wasAtMin = Math.abs(zoom - _lastMinZoom) < 0.01;
    setMinZoom(newMinZoom);
    if (wasAtMin) setZoom(newMinZoom);
    _lastMinZoom = newMinZoom;
  }

  let pickupMult = 1;
  for (const typeId of hotbar) {
    if (!typeId) continue;
    const pt = PETAL_TYPES[typeId];
    if (pt?.pickupBonus) pickupMult += pt.pickupBonus;
  }

  checkPickups(player.x, player.y, typeId => {
    if (typeId === 'rose') {
      player.hp = Math.min(player.maxHp, player.hp + 22);
      return;
    }
    if (settings.equipDrops) {
      const emptyTop = hotbar.indexOf(null);
      if (emptyTop !== -1) {
        hotbar[emptyTop] = typeId;
        rebuildPetals();
        return;
      }
      const emptyBench = benchBar.indexOf(null);
      if (emptyBench !== -1) {
        benchBar[emptyBench] = typeId;
        return;
      }
    }
    addToInventory(typeId);
    notifyInventoryChanged();
  }, pickupMult);

  render(ctx, canvasW, canvasH, camera.x, camera.y, dt);

  requestAnimationFrame(loop);
}

// ── startGame — called by homescreen after play is clicked ───────────────────
async function startGame() {
  stopHomescreenHotbar();
  setHomescreenMode(false);
  initCamera(player.x, player.y);
  initMobs(player.x, player.y);
  requestAnimationFrame(loop);
}

window.startGame = startGame;
