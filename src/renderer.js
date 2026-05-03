import { toScreen, petalOrigin, zoom } from './camera.js';
import { player, isMoving }              from './player.js';
import { petalInstances, currentOrbitR, orbitAngle, hotbar } from './petals.js';
import { PETAL_TYPES }                  from './petalTypes.js';
import { mobs, missiles, getPetLeashDist }               from './mobs.js';
import { worldDrops, webFields, pollenEntities, honeycombEntities, SPAWN_DUR } from './drops.js';
import { drawMap, getZoneId, ZONE_CONFIG }       from './map.js';
import { drawMob, drawSpider, drawBee, drawQueenBee, drawLadybug, drawCentipedeHead, drawCentipedeBody, drawHornet, drawMissile,
         drawSoldierAnt, drawWorkerAnt, drawBabyAnt, drawQueenAnt, drawAntEgg, drawAntHole, drawDigger, drawBeekeeper, drawHive,
         soldierAntOffsetX } from './mobDrawing.js';
import { updateHotbar, updateInventory, updateSettingsCog } from './uiManager.js';
import { drawPetalShape, drawPieceShape, drawThirdEyeAccessory, drawInventoryIcon } from './petalDrawing.js';
import { RARITY_COLORS, RARITY_BG, RARITY_BORDER, RARITY_TEXT, rarityTier } from './constants.js';
import { inputState }                   from './inputState.js';
import { wingState }                    from './wingState.js';
import { drawMobTooltip }               from './mobTooltip.js';
import { drawPetalTooltip }              from './petalTooltip.js';
import { drawDamagePopups } from './damagePopups.js';
import { settings } from './settings.js';

const GRID = 60;

// ── Hitbox debug overlay ──────────────────────────────────────────────────────
export let showHitboxes = false;
let cutterRot = 0;
let cutterSpeed = 0.0012;     // current rotation speed per ms
const CUTTER_DEFAULT_SPEED = 0.0012;  // default speed when not attacking
const CUTTER_MAX_SPEED = 0.005;       // max speed when attacking
const CUTTER_ACCEL = 0.000008;        // acceleration when starting attack
const CUTTER_DECEL = 0.000003;        // deceleration when stopping attack

// ── Petal animation state ─────────────────────────────────────────────────────
let diggerEggRot = 0;                  // cutter ring rotation (rad)
const DIGGER_EGG_ROT_SPEED = 0.0018;  // rad/ms

let wingRot = 0;                       // wing spin angle (rad)
const WING_SPIN_SPEED  = 0.004;      // rad/ms — moderate continuous 360° spin
const WING_EXTRA_R     = 84;          // game-units pushed outward during attack (matches petals.js)

window.addEventListener('keydown', e => { if (e.key === 'F' || e.key === 'f') showHitboxes = !showHitboxes; });

// ── Low-level helpers ─────────────────────────────────────────────────────────
export function circle(ctx, sx, sy, r, fill, stroke, lw = 2.5, zoomScale = 1) {
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle   = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = lw * zoomScale;
  ctx.stroke();
}

// Abbreviate numbers >= 10 000
function abbrev(n) {
  n = Math.max(0, Math.floor(n));
  if (n >= 1_000_000_000_000_000) return (n / 1_000_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'Q';
  if (n >= 1_000_000_000_000)     return (n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')     + 'T';
  if (n >= 1_000_000_000)         return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')         + 'B';
  if (n >= 1_000_000)             return (n / 1_000_000).toFixed(1).replace(/\.0$/, '')             + 'M';
  if (n >= 10_000)                return (n / 1_000).toFixed(1).replace(/\.0$/, '')                 + 'k';
  return String(n);
}

// ── Entity label + HP pill ────────────────────────────────────────────────────
// Base sizes at zoom=1. Everything multiplies by zoom so the label
// scales with the world exactly like the entity body does.
const PILL_W  = 64;
const PILL_H  = 12;
const NAME_SZ = 11;
const HP_SZ   = 8;
const RAR_SZ  = 10;
const GAP     = 2;

function drawEntityLabel(ctx, sx, sy, scaledR, name, hp, maxHp, rarity, rarityColor) {
  // Raw world radius of the entity
  const radius = scaledR / zoom;

  // Scale factor: grows with mob size and zoom, but both dampened via sqrt
  // so a 4x bigger mob → 2x bigger bar, and 4x zoom → 2x bigger bar.
  // Base radius of 22 (player) = scale 1.0 at zoom 1.
  const BASE_R = 22;
  const s = Math.sqrt(radius / BASE_R) * Math.sqrt(zoom);

  const pw     = PILL_W  * s;
  const ph     = PILL_H  * s;
  const pr     = ph / 2;
  const gap    = GAP     * s;
  const nameSz = NAME_SZ * s;
  const hpSz   = HP_SZ   * s;
  const rarSz  = RAR_SZ  * s;

  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const hpFill  = hpRatio > 0.5
    ? 'rgba(30, 210, 90, 0.90)'
    : hpRatio > 0.25
    ? 'rgba(220, 175, 0, 0.90)'
    : 'rgba(215, 45, 45, 0.90)';

  ctx.save();

  let y = sy + scaledR + 4 * s;

  // ── Name ──────────────────────────────────────────────────────────────────
  ctx.font         = `bold ${nameSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(0,0,0,0.65)';
  ctx.fillText(name, sx + 0.5, y + 0.5);
  ctx.fillStyle    = '#ffffff';
  ctx.fillText(name, sx, y);

  // ── HP pill ───────────────────────────────────────────────────────────────
  y += nameSz + gap;
  const px = sx - pw / 2;
  const py = y;

  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, pr);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();

  if (hpRatio > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, pr);
    ctx.clip();
    ctx.fillStyle = hpFill;
    ctx.fillRect(px, py, pw * hpRatio, ph);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, pr);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth   = s;
  ctx.stroke();

  ctx.font         = `bold ${hpSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const hpText = `${abbrev(hp)}/${abbrev(maxHp)}`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(hpText, sx + 0.5, py + ph / 2 + 0.5);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(hpText, sx, py + ph / 2);

  // ── Rarity (mobs only) ────────────────────────────────────────────────────
  if (rarity && rarityColor) {
    y += ph + gap;
    ctx.font         = `bold ${rarSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = 'rgba(0,0,0,0.55)';
    ctx.fillText(rarity, sx + 0.5, y + 0.5);
    ctx.fillStyle    = rarityColor;
    ctx.fillText(rarity, sx, y);
  }

  ctx.restore();
}

// ── Drop icon cache (same system as hotbar icon cache) ────────────────────────
const dropIconCache = new Map();

function getDropIcon(typeId, physSize) {
  const key = `${typeId}__${physSize}`;
  if (dropIconCache.has(key)) return dropIconCache.get(key);
  const cv  = document.createElement('canvas');
  cv.width  = physSize;
  cv.height = physSize;
  drawInventoryIcon(cv, typeId);
  dropIconCache.set(key, cv);
  return cv;
}

// ── Drop rendering ────────────────────────────────────────────────────────────

function drawDrops(ctx, W, H) {
  const dpr = window.devicePixelRatio || 1;

  for (const drop of worldDrops) {
    const pt = PETAL_TYPES[drop.typeId];
    if (!pt) continue;

    // Full world-space position (ox/oy are world offsets) → screen
    const { sx, sy } = toScreen(drop.x + drop.ox, drop.y + drop.oy, W, H);

    // Size scales with zoom like every other world object, plus gentle pulse
    const pulse = 1 + 0.07 * Math.sin(drop.bobTimer);
    const sz    = drop.size * zoom * pulse;
    const cr    = sz * 0.18;

    const bg  = RARITY_BG[pt.rarity]     || '#1d55cc';
    const brd = RARITY_BORDER[pt.rarity] || '#0a2a70';

    // Spawn pop-in (back-elastic scale)
    const t  = Math.min(1, drop.spawnTimer / SPAWN_DUR);
    const c1 = 1.70158, c3 = c1 + 1;
    const spawnScale = t >= 1 ? 1
      : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    const spinExtra = (1 - t) * Math.PI * 3;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(drop.rotation + spinExtra);
    ctx.scale(spawnScale, spawnScale);

    const hx = -sz / 2;
    const hy = -sz / 2;

    // ── Box fill — identical two-pass style to hotbar/inv/mob-HUD ────────────
    if (pt.rarity === 'Impracticality') {
      const grad = ctx.createLinearGradient(hx, hy, hx + sz, hy + sz);
      grad.addColorStop(0.00, '#ff0000'); grad.addColorStop(0.17, '#ff8800');
      grad.addColorStop(0.33, '#ffff00'); grad.addColorStop(0.50, '#00cc44');
      grad.addColorStop(0.67, '#0088ff'); grad.addColorStop(0.83, '#8800ff');
      grad.addColorStop(1.00, '#ff00cc');
      ctx.beginPath();
      ctx.roundRect(hx, hy, sz, sz, cr);
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect(hx, hy, sz, sz, cr);
      ctx.fillStyle = '#0d1020';
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(hx, hy, sz, sz, cr);
      ctx.fillStyle    = bg;
      ctx.globalAlpha *= 0.42;
      ctx.fill();
      ctx.globalAlpha /= 0.42;
    }

    // Border
    ctx.beginPath();
    ctx.roundRect(hx, hy, sz, sz, cr);
    ctx.strokeStyle = brd || '#3a3f5a';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Inner highlight
    ctx.beginPath();
    ctx.roundRect(hx + 2.5, hy + 2.5, sz - 5, sz - 5, cr * 0.65);
    ctx.strokeStyle = 'rgba(255,255,255,0.11)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Skip drawing if too small to render (prevents negative-radius arc errors)
    if (sz < 8) { ctx.restore(); continue; }

    // ── Petal icon — round to nearest 4px so cache stays small ──────────────
    const physSize = Math.round(sz * dpr / 4) * 4;
    const icon     = getDropIcon(drop.typeId, Math.max(4, physSize));
    ctx.drawImage(icon, hx, hy, sz, sz);

    ctx.restore();
  }
}

function drawPollenEntities(ctx, W, H) {
  for (const pe of pollenEntities) {
    if (pe.dead) continue;
    const { sx, sy } = toScreen(pe.x, pe.y, W, H);
    const r = pe.radius * zoom;
    // Fade out in the last 1.5s of its 6s life
    const alpha = Math.min(1, pe.timer / 1500);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Body
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#d8e786';
    ctx.fill();
    ctx.strokeStyle = '#9aa83d';
    ctx.lineWidth   = Math.max(1.5, r * 0.18);
    ctx.stroke();

    // Small inner highlight
    ctx.beginPath();
    ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fill();

    ctx.restore();
  }
}


function drawHoneycombEntities(ctx, W, H) {
  for (const hc of honeycombEntities) {
    if (hc.dead) continue;
    const { sx, sy } = toScreen(hc.x, hc.y, W, H);
    const r = hc.radius * zoom;

    // Fade out in the last 2s of its 10s life
    const alpha = Math.min(1, hc.timer / 2000);
    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw attract range ring (subtle, desaturated)
    const rangeR = hc.attractRange * zoom;
    ctx.beginPath();
    ctx.arc(sx, sy, rangeR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 186, 4, 0.12)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Shadow / glow base
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 130, 0, 0.35)';
    ctx.fill();

    // Hexagon body (honeycomb shape approximated as filled hex)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = sx + Math.cos(a) * r;
      const py = sy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle   = '#ffba04';
    ctx.fill();
    ctx.strokeStyle = '#9a6200';
    ctx.lineWidth   = Math.max(1.5, r * 0.12);
    ctx.stroke();

    // Inner cell grid lines
    ctx.strokeStyle = 'rgba(154, 98, 0, 0.5)';
    ctx.lineWidth   = Math.max(0.8, r * 0.06);
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * r * 0.9, sy + Math.sin(a) * r * 0.9);
      ctx.stroke();
    }

    // HP bar
    const barW = r * 2.2;
    const barH = Math.max(3, r * 0.22);
    const barX = sx - barW / 2;
    const barY = sy - r * 1.6;
    const hpFrac = Math.max(0, hc.hp / hc.maxHp);
    ctx.beginPath();
    ctx.rect(barX, barY, barW, barH);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.rect(barX, barY, barW * hpFrac, barH);
    ctx.fillStyle = hpFrac > 0.5 ? '#2ecc40' : hpFrac > 0.2 ? '#ffdc00' : '#ff4136';
    ctx.fill();

    ctx.restore();
  }
}

function drawWebFields(ctx, W, H) {
  for (const web of webFields) {
    const { sx, sy } = toScreen(web.x, web.y, W, H);
    const alpha = Math.max(0, web.timer / (web.maxTimer ?? 5000)) * 0.35;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, web.radius * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#82c2e8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,190,230,0.9)';
    ctx.lineWidth = 2 * zoom;
    ctx.stroke();
    ctx.restore();
  }
}

// ── World-space petal rendering ───────────────────────────────────────────────
function drawPetalsWorld(ctx, W, H) {
  if (petalInstances.length === 0) return;

  // Orbit ring — visual guide, always 1 ring regardless of piece count
  const { sx: ox, sy: oy } = toScreen(petalOrigin.x, petalOrigin.y, W, H);
  ctx.beginPath();
  ctx.arc(ox, oy, currentOrbitR * zoom, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = zoom;
  ctx.stroke();

  // ── Ant egg leash range overlay (shown when F / hitbox-debug is on) ───────
  if (showHitboxes) {
    // Mirror the formula from getPetLeashDist in mobs.js:
    //   RADIUS_SCALE per tier → antBaseRadius = 20 * scale → leash = max(900, antR * 9)
    const RENDERER_RADIUS_SCALE = [1.2,1.0,1.2,1.83,3.0,5.96,14.55,22.73,30.0,40.0,55.0,75.0,100.0,140.0];
    const leashTiers = new Set();
    for (const p of petalInstances) {
      if (PETAL_TYPES[p.typeId]?.isAntEgg) leashTiers.add(Math.max(0, Math.min(13, PETAL_TYPES[p.typeId].tier ?? 0)));
    }
    if (leashTiers.size > 0) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      for (const tier of leashTiers) {
        const leashDist = getPetLeashDist(tier);
        const leashR = leashDist * zoom;
        ctx.beginPath();
        ctx.arc(ox, oy, leashR, 0, Math.PI * 2);
        // Blue tint that deepens slightly with tier
        const b = Math.round(220 - tier * 6);
        ctx.strokeStyle = `rgba(40,100,${b},0.65)`;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Digger egg leash range overlay (same F toggle) ─────────────────────────
    const diggerLeashTiers = new Set();
    for (const p of petalInstances) {
      if (PETAL_TYPES[p.typeId]?.isDiggerEgg) diggerLeashTiers.add(Math.max(0, Math.min(13, PETAL_TYPES[p.typeId].tier ?? 0)));
    }
    if (diggerLeashTiers.size > 0) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      for (const tier of diggerLeashTiers) {
        const leashDist = getPetLeashDist(tier);
        const leashR = leashDist * zoom;
        ctx.beginPath();
        ctx.arc(ox, oy, leashR, 0, Math.PI * 2);
        // Gray tint matching digger body color
        const v = Math.round(160 - tier * 5);
        ctx.strokeStyle = `rgba(${v},${v},${v},0.70)`;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Bee egg leash range overlay (same F toggle) ──────────────────────────
    const beeLeashTiers = new Set();
    for (const p of petalInstances) {
      if (PETAL_TYPES[p.typeId]?.isBeeEgg) beeLeashTiers.add(Math.max(0, Math.min(13, PETAL_TYPES[p.typeId].tier ?? 0)));
    }
    if (beeLeashTiers.size > 0) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      for (const tier of beeLeashTiers) {
        const leashDist = getPetLeashDist(tier);
        const leashR = leashDist * zoom;
        ctx.beginPath();
        ctx.arc(ox, oy, leashR, 0, Math.PI * 2);
        // Amber tint that deepens with tier — matches bee colour
        const g = Math.round(160 - tier * 5);
        ctx.strokeStyle = `rgba(220,${g},20,0.65)`;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  for (const p of petalInstances) {
    // Use the world position already computed by updatePetals (includes cluster offset)
    const { sx, sy } = toScreen(p.worldX, p.worldY, W, H);
    const displayR   = p.radius * zoom;

    // Choose draw function: piece-petals draw a single circle; normal petals
    // draw their full shape (cluster icons remain correct in inventory).
    const drawFn = p.isPiece
      ? (c, t, x, y, r) => drawPieceShape(c, t, x, y, r)
      : (c, t, x, y, r) => drawPetalShape(c, t, x, y, r);

    // ── Per-type animation — set ctx props, compute visual draw position ──────
    let drawSx = sx, drawSy = sy;
    const outAngle = Math.atan2(p.worldY - petalOrigin.y, p.worldX - petalOrigin.x);
    ctx._diggerEggRot = undefined;
    ctx._missileAngle = undefined;
    ctx._magnetAngle  = undefined;
    ctx._wingRot      = undefined;
    const _pt_draw = PETAL_TYPES[p.typeId];
    switch (p.typeId) {
      case 'digger_egg':
        ctx._diggerEggRot = diggerEggRot;
        break;
      case 'magnet':
        // open end of horseshoe points outward
        ctx._magnetAngle = outAngle + Math.PI / 2;
        break;
      default:
        if (_pt_draw?.isMissilePetal) {
          // When flying: tip points in direction of travel
          // When orbiting: tip points outward from player
          ctx._missileAngle = (p.state === 'flying' ? (p.flyAngle ?? outAngle) : outAngle) - Math.PI / 2;
        } else if (_pt_draw?.isWing) {
          ctx._wingRot = wingRot;
        }
        break;
    }

    if (p.state === 'reloading') {
      // Ghost silhouette
      ctx.save();
      ctx.globalAlpha = 0.22;
      drawFn(ctx, p.typeId, drawSx, drawSy, displayR);
      ctx.restore();

      // Per-piece reload arc — each piece reloads independently
      const progress = 1 - p.reloadTimer / PETAL_TYPES[p.typeId].reloadTime;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(sx, sy, (p.radius + 4) * zoom, -Math.PI / 2,
              -Math.PI / 2 + progress * Math.PI * 2);
      ctx.strokeStyle = 'rgba(150,230,255,0.9)';
      ctx.lineWidth   = 2.5;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      drawFn(ctx, p.typeId, drawSx, drawSy, displayR);
      ctx.restore();
    }

    // ── Petal hitbox overlay (toggle with F, same key as mob hitboxes) ────────
    if (showHitboxes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(80, 180, 255, 0.9)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, p.radius * zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

// ── Face animation state ──────────────────────────────────────────────────────
// attackT / defendT lerp 0→1 for smooth expression blending.
// eyeAngle smoothly follows player.moveAngle via shortest-path lerp.
const face = {
  attackT:  0,
  defendT:  0,
  eyeAngle: 0,
};

// Per-ms lerp factor — ~120ms to fully transition
const FACE_SPEED = 0.012;

function updateFace(dt, moveAngle, isAttacking, isDefending, moving) {
  const k = 1 - Math.pow(1 - FACE_SPEED, dt);

  face.attackT += ((isAttacking ? 1 : 0) - face.attackT) * k;
  face.defendT += ((isDefending ? 1 : 0) - face.defendT) * k;

  // Shortest-path angle lerp so pupils don't spin the long way
  // Only update when moving; stay in place when stopped
  if (moving) {
    let da = moveAngle - face.eyeAngle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    face.eyeAngle += da * k;
  }
}

// ── Player face drawing ───────────────────────────────────────────────────────
// Exported so homescreen can reuse the exact same draw calls with its own state.
export function drawFlowerFaceParams(ctx, sx, sy, r, attackT, defendT, eyeAngle, zoomScale = 1) {
  const at = attackT;
  const dt = defendT;

  const eyeOffsetX = r * 0.285;
  const eyeOffsetY = r * 0.21;
  const eyeRx      = r * 0.128;
  const eyeRy      = r * 0.249;
  const pupilR     = r * 0.124;

  const horizontalDrift = r * 0.11;
  const upDrift         = r * 0.13;
  const downDrift       = r * 0.18;
  const verticalDrift   = Math.sin(eyeAngle) < 0 ? upDrift : downDrift;
  const pdx = Math.cos(eyeAngle) * horizontalDrift;
  const pdy = Math.sin(eyeAngle) * verticalDrift;

  const eyes = [
    { cx: sx - eyeOffsetX, cy: sy - eyeOffsetY, browSign: -1 },
    { cx: sx + eyeOffsetX, cy: sy - eyeOffsetY, browSign:  1 },
  ];

  for (const eye of eyes) {
    // Dark iris oval
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#212219';
    ctx.fill();
    ctx.closePath();

    // White pupil clipped inside oval
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(eye.cx + pdx, eye.cy + pdy, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = '#eeeeee';
    ctx.fill();
    ctx.closePath();
    ctx.restore();
  }

  // ── Eyebrow (angry only, like digger) ──────────────────────────────────────
  // Single downward-pointing triangle that starts above eyes and slides down
  // Slower easing: square root for a more gradual, sustained animation
  const browEase = at < 1 
    ? Math.sqrt(at)  // square root: slower, more sustained motion
    : 1;
  
  if (browEase > 0.001) {
    const browBaseY = sy - eyeOffsetY - eyeRy - r * 0.05;  // Just above eyes
    const slideDown = browEase * r * 0.25;  // Slides down covering iris
    const browY = browBaseY + slideDown;

    ctx.save();
    ctx.globalAlpha = 1;  // Stay fully opaque, just move
    ctx.fillStyle = '#ffe840';

    // Single downward-pointing triangle in the middle
    const browW = r * 0.40;
    const browH = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(sx - browW, browY - browH);      // left top
    ctx.lineTo(sx + browW, browY - browH);       // right top
    ctx.lineTo(sx, browY + browH);               // point down
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Mouth ─────────────────────────────────────────────────────────────────
  // neutral   → slight smile  (cpY below mouthY, canvas Y-down so + = lower)
  // attacking → angry frown   (cpY above mouthY, deeper)
  // defending → sad frown     (cpY above mouthY, gentler)
  const smileCP =  r * 0.14;   // neutral: below endpoints
  const angryCP = -r * 0.20;   // attacking: above endpoints, sharp
  const sadCP   = -r * 0.13;   // defending: above endpoints, gentle

  const cpOffset = smileCP
    + (angryCP - smileCP) * at
    + (sadCP   - smileCP) * dt;

  const mouthY  = sy + r * 0.38;
  const mouthHW = r * 0.25;
  const cpY     = mouthY + cpOffset;

  ctx.save();
  ctx.strokeStyle = '#212219';
  ctx.lineWidth   = r * 0.072 * zoomScale;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - mouthHW, mouthY);
  ctx.quadraticCurveTo(sx, cpY, sx + mouthHW, mouthY);
  ctx.stroke();
  ctx.restore();
}

function drawFlowerFace(ctx, sx, sy, r) {
  drawFlowerFaceParams(ctx, sx, sy, r, face.attackT, face.defendT, face.eyeAngle, zoom);
}

// ── Zone Mob Icon HUD ─────────────────────────────────────────────────────────
const HUD_BOX          = 58;    // box size in px (perfect square)
const HUD_GAP          = 7;     // gap between boxes
const HUD_PAD_TOP      = 5;     // screen top padding
const HUD_DIE_MS       = 420;   // exit animation duration (ms)
const HUD_ENTER_MS     = 300;   // enter animation duration (ms)
const HUD_COUNT_BOUNCE = 380;   // count badge bounce duration (ms)
const NE_FACING   = -Math.PI / 4;  // facing direction = northeast

// key -> { typeId, rarity, tier, count, cx, cy, targetCx, targetCy, enterT }
const hudLive = new Map();
// [ { typeId, rarity, count, cx, cy, t } ] — t: 0→1 = dying progress
const hudDying = [];

function computeHUDLayout(entries, W, startY) {
  // Sort ascending: lowest tier → left, highest tier → right
  const sorted = [...entries].sort((a, b) => a.tier - b.tier);

  let rows;
  if (sorted.length <= 7) {
    rows = [sorted];            // single row — lowest tier left, highest right
  } else {
    // Fill top row first (up to 7 lower-tier entries), overflow to bottom row
    const topItems    = sorted.slice(0, 7);   // first 7 = lower tiers
    const bottomItems = sorted.slice(7);      // remainder = higher tiers
    rows = [topItems, bottomItems];
  }

  const result = new Map();
  rows.forEach((row, ri) => {
    const totalW = row.length * HUD_BOX + (row.length - 1) * HUD_GAP;
    const startX = W / 2 - totalW / 2 + HUD_BOX / 2;
    const cy = startY + HUD_BOX / 2 + ri * (HUD_BOX + HUD_GAP);
    row.forEach((e, ci) => {
      result.set(e.key, {
        targetCx: startX + ci * (HUD_BOX + HUD_GAP),
        targetCy: cy,
      });
    });
  });
  return result;
}

function drawSingleMobBox(ctx, typeId, rarity, count, cx, cy, scaleAmt, spinAng, alpha, countBounceT = 1) {
  const S    = HUD_BOX * scaleAmt;
  const half = S / 2;
  if (S < 1) return;

  ctx.save();
  ctx.globalAlpha = (alpha ?? 1);
  ctx.translate(cx, cy);
  ctx.rotate(spinAng ?? 0);

  // ── Box background — identical two-pass style to hotbar/inv petal boxes ────
  const cr = S * 0.16;
  if (rarity === 'Impracticality') {
    const grad = ctx.createLinearGradient(-half, -half, half, half);
    grad.addColorStop(0.00, '#ff0000'); grad.addColorStop(0.17, '#ff8800');
    grad.addColorStop(0.33, '#ffff00'); grad.addColorStop(0.50, '#00cc44');
    grad.addColorStop(0.67, '#0088ff'); grad.addColorStop(0.83, '#8800ff');
    grad.addColorStop(1.00, '#ff00cc');
    ctx.beginPath();
    ctx.roundRect(-half, -half, S, S, cr);
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    // Pass 1: dark base
    ctx.beginPath();
    ctx.roundRect(-half, -half, S, S, cr);
    ctx.fillStyle = '#0d1020';
    ctx.fill();
    // Pass 2: rarity tint at 42%
    ctx.beginPath();
    ctx.roundRect(-half, -half, S, S, cr);
    ctx.fillStyle    = RARITY_BG[rarity] || '#333';
    ctx.globalAlpha *= 0.42;
    ctx.fill();
    ctx.globalAlpha /= 0.42;
  }
  // Border
  ctx.beginPath();
  ctx.roundRect(-half, -half, S, S, cr);
  ctx.strokeStyle = RARITY_BORDER[rarity] || '#3a3f5a';
  ctx.lineWidth   = 2.5;
  ctx.stroke();
  // Inner highlight
  ctx.beginPath();
  ctx.roundRect(-half + 2.5, -half + 2.5, S - 5, S - 5, cr * 0.65);
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  // ── Mob icon — clipped to inside of box ────────────────────────────────────
  const iconR = S * 0.175;   // keeps every mob safely inside the square

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-half + 3, -half + 3, S - 6, S - 6, cr * 0.65);
  ctx.clip();

  switch (typeId) {
    case 'bee':
      drawBee(ctx, 0, 0, iconR, NE_FACING, 0);
      break;
    case 'queen_bee':
      drawQueenBee(ctx, 0, 0, iconR * 0.9, NE_FACING, 0);
      break;
    case 'beehive':
      drawHive(ctx, 0, 0, iconR * 1.125);
      break;
    case 'hornet':
      // Full stinger shown in HUD icon (stingerProgress=1)
      drawHornet(ctx, 0, 0, iconR, NE_FACING, 0, 1);
      break;
    case 'ladybug':
      drawLadybug(ctx, 0, 0, iconR, NE_FACING, []);
      break;
    case 'spider':
      drawSpider(ctx, 0, 0, iconR, NE_FACING, 0, 0);
      break;
    case 'centipede_head': {
      // Body segment trails behind the head at NE_FACING + PI
      const bodyR = iconR * 0.9;
      const bAngle = NE_FACING + Math.PI; // body trails behind head
      const bx = Math.cos(bAngle) * iconR * 1.55;
      const by = Math.sin(bAngle) * iconR * 1.55;
      // Draw body segment WITH legs (segIndex=1 for the first body segment)
      drawCentipedeBody(ctx, bx, by, bodyR, NE_FACING, 0, 1);
      drawCentipedeHead(ctx, 0, 0, iconR, NE_FACING);
      break;
    }
    case 'soldier_ant':
    case 'worker_ant':
    case 'baby_ant':
    case 'queen_ant': {
      // Draw to an offscreen canvas first so we can measure the actual pixel
      // bounding box and re-centre it exactly — avoids all hardcoded guess offsets.
      const OC_SIZE = 256;
      const oc   = new OffscreenCanvas(OC_SIZE, OC_SIZE);
      const octx = oc.getContext('2d');
      const mid  = OC_SIZE / 2;
      // Scale iconR up to offscreen space for enough pixel resolution to sample
      const ocScale = (OC_SIZE * 0.35) / iconR;
      const ocIconR = iconR * ocScale;
      
      // Animation phases for soldier ant HUD icon — slow 1-2 sec cycle
      const antAnimPhase = (Date.now() * 0.0015) % (Math.PI * 2);

      octx.clearRect(0, 0, OC_SIZE, OC_SIZE);
      if (typeId === 'soldier_ant') {
        const offsetScale = ocIconR / 22;
        drawSoldierAnt(octx, mid - soldierAntOffsetX * offsetScale, mid, ocIconR, NE_FACING, antAnimPhase, antAnimPhase);
      } else if (typeId === 'worker_ant') {
        drawWorkerAnt(octx, mid, mid, ocIconR, NE_FACING, antAnimPhase);
      } else if (typeId === 'baby_ant') {
        drawBabyAnt(octx, mid, mid, ocIconR, NE_FACING, antAnimPhase);
      } else if (typeId === 'queen_ant') {
        drawQueenAnt(octx, mid, mid, ocIconR * 0.72, NE_FACING, 0, 0);
      }

      // Find the bounding box of drawn pixels
      const imgData = octx.getImageData(0, 0, OC_SIZE, OC_SIZE);
      const pd = imgData.data;
      let minX = OC_SIZE, maxX = 0, minY = OC_SIZE, maxY = 0;
      for (let py = 0; py < OC_SIZE; py++) {
        for (let px = 0; px < OC_SIZE; px++) {
          if (pd[(py * OC_SIZE + px) * 4 + 3] > 8) {
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
      }

      if (maxX > minX && maxY > minY) {
        // Visual centre in offscreen space → shift needed to land at box (0,0)
        const visCX  = (minX + maxX) / 2;
        const visCY  = (minY + maxY) / 2;
        const shiftX = (mid - visCX) / ocScale;
        const shiftY = (mid - visCY) / ocScale;

        if (typeId === 'soldier_ant') {
          const offsetScale = iconR / 22;
          drawSoldierAnt(ctx, shiftX - soldierAntOffsetX * offsetScale - iconR * 0.8 + iconR * 0.5, shiftY, iconR, NE_FACING, antAnimPhase, antAnimPhase);
        } else if (typeId === 'worker_ant') {
          drawWorkerAnt(ctx, shiftX, shiftY, iconR, NE_FACING, antAnimPhase);
        } else if (typeId === 'baby_ant') {
          drawBabyAnt(ctx, shiftX, shiftY, iconR, NE_FACING, antAnimPhase);
        } else if (typeId === 'queen_ant') {
          drawQueenAnt(ctx, shiftX, shiftY, iconR * 0.72, NE_FACING, 0, 0);
        }
      }
      break;
    }
    case 'ant_egg':
      drawAntEgg(ctx, 0, 0, iconR);
      break;
    case 'ant_hole':
      drawAntHole(ctx, 0, 0, iconR);
      break;
    case 'digger': {
      // Neutral face, animated cutter using wall-clock time so it spins in the HUD
      const hudCutterRot = (Date.now() * 0.0012) % (Math.PI * 2);
      drawDigger(ctx, 0, 0, iconR, 'neutral', hudCutterRot, 0, null);
      break;
    }
    case 'beekeeper': {
      // Neutral face, animated cutter using wall-clock time so it spins in the HUD
      const hudCutterRot = (Date.now() * 0.0012) % (Math.PI * 2);
      drawBeekeeper(ctx, 0, 0, iconR * 1.5, 'neutral', hudCutterRot, 0, null);
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, iconR, 0, Math.PI * 2);
      ctx.fillStyle = '#aaaaaa';
      ctx.strokeStyle = '#555555';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── Mob name — white text at bottom of box, shrunk to fit if needed ────────
  const MOB_DISPLAY_NAMES = {
    centipede_head: 'Centipede',
    soldier_ant:    'Soldier Ant',
    worker_ant:     'Worker Ant',
    baby_ant:       'Baby Ant',
    queen_ant:      'Queen Ant',
    ant_egg:        'Ant Egg',
    ant_hole:       'Ant Hole',
    queen_bee:      'Queen Bee',
    beehive:        'Beehive',
  };
  const mobName   = MOB_DISPLAY_NAMES[typeId] ?? (typeId.charAt(0).toUpperCase() + typeId.slice(1));
  const maxNameW  = S - 6;   // 3px padding each side
  let nameSz      = Math.max(7, S * 0.185);
  ctx.font        = `bold ${nameSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  // Shrink font until text fits within the box width
  while (nameSz > 6 && ctx.measureText(mobName).width > maxNameW) {
    nameSz -= 0.5;
    ctx.font = `bold ${nameSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  }
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  const nameY = half - 5;   // 5 px gap from the bottom edge
  ctx.fillStyle    = 'rgba(0,0,0,0.65)';
  ctx.fillText(mobName, 0.6, nameY + 0.6);
  ctx.fillStyle    = '#ffffff';
  ctx.fillText(mobName, 0, nameY);

  // ── Count badge — top-right corner, text rotated NE (45°) ─────────────────
  if (count > 1) {
    const bx = half - 5;
    const by = -half + 5;
    // Bounce scale: sin-based pop when count changes (countBounceT 0→1)
    const bounce = countBounceT < 1
      ? 1 + 0.55 * Math.sin(countBounceT * Math.PI) * Math.pow(1 - countBounceT, 0.5)
      : 1;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(Math.PI / 4);  // 45° = northeast tilt
    ctx.scale(bounce, bounce);
    ctx.font         = `bold ${Math.max(7, S * 0.20)}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // drop-shadow
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(`x${count}`, 0.7, 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`x${count}`, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Update HUD state and draw all mob icon boxes.
 * Returns the Y pixel where the zone text should start (below the boxes).
 */
function drawZoneMobHUD(ctx, W, playerX, playerY, dt, startY = 8) {
  const zoneId = getZoneId(playerX, playerY);

  // ── Gather mobs currently in the player's zone ────────────────────────────
  const groups = new Map(); // key -> { key, typeId, rarity, tier, count }
  for (const mob of mobs) {
    if (getZoneId(mob.x, mob.y) !== zoneId) continue;
    const rarity = mob.rarity || 'Common';
    // Centipede bodies display under the same card as the head
    const displayTypeId = mob.typeId === 'centipede_body' ? 'centipede_head' : mob.typeId;
    const key    = `${displayTypeId}_${rarity}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        typeId: displayTypeId,
        rarity,
        tier:  rarityTier(rarity),
        count: 0,
      });
    }
    groups.get(key).count++;
  }

  // ── Compute desired layout ────────────────────────────────────────────────
  const layout = computeHUDLayout([...groups.values()], W, startY);

  // ── Retire live boxes whose mob group vanished → dying animation ──────────
  for (const [key, box] of hudLive) {
    if (!groups.has(key)) {
      hudDying.push({ typeId: box.typeId, rarity: box.rarity, count: box.count,
                      cx: box.cx, cy: box.cy, t: 0 });
      hudLive.delete(key);
    }
  }

  // ── Add new boxes / update existing ones ──────────────────────────────────
  for (const [key, grp] of groups) {
    const pos = layout.get(key);
    if (hudLive.has(key)) {
      const box = hudLive.get(key);
      // Detect count change → restart badge bounce
      if (grp.count !== box.prevCount) {
        box.countBounceT = 0;
        box.prevCount    = grp.count;
      }
      box.count     = grp.count;
      box.targetCx  = pos.targetCx;
      box.targetCy  = pos.targetCy;
      box.tier      = grp.tier;
    } else {
      hudLive.set(key, {
        typeId:  grp.typeId,
        rarity:  grp.rarity,
        tier:    grp.tier,
        count:   grp.count,
        cx:      pos.targetCx,
        cy:      pos.targetCy,
        targetCx: pos.targetCx,
        targetCy: pos.targetCy,
        enterT:       0,
        prevCount:    grp.count,
        countBounceT: 0,   // pop-in bounce on first appearance
      });
    }
  }

  // ── Animate live boxes (position lerp + enter scale + count bounce) ────────
  const lerpK = 1 - Math.pow(0.88, dt / 16.67);  // smooth position slide
  for (const box of hudLive.values()) {
    box.cx           += (box.targetCx - box.cx) * lerpK;
    box.cy           += (box.targetCy - box.cy) * lerpK;
    box.enterT        = Math.min(1, box.enterT + dt / HUD_ENTER_MS);
    box.countBounceT  = Math.min(1, (box.countBounceT ?? 1) + dt / HUD_COUNT_BOUNCE);
  }

  // ── Advance dying animations, remove finished ─────────────────────────────
  for (let i = hudDying.length - 1; i >= 0; i--) {
    hudDying[i].t += dt / HUD_DIE_MS;
    if (hudDying[i].t >= 1) hudDying.splice(i, 1);
  }

  // ── Draw dying boxes (spin + shrink + fade) ───────────────────────────────
  for (const d of hudDying) {
    const scaleAmt = 1 - d.t;
    const spin     = d.t * Math.PI * 2.5;
    const alpha    = 1 - d.t;
    drawSingleMobBox(ctx, d.typeId, d.rarity, d.count, d.cx, d.cy, scaleAmt, spin, alpha, 1);
  }

  // ── Draw live boxes (with bounce-in scale) ────────────────────────────────
  for (const box of hudLive.values()) {
    const t  = box.enterT;
    const c1 = 1.70158, c3 = c1 + 1;
    const scaleAmt = t >= 1 ? 1 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    drawSingleMobBox(ctx, box.typeId, box.rarity, box.count, box.cx, box.cy, scaleAmt, 0, 1, box.countBounceT ?? 1);
  }

  // ── Return the Y pixel directly below the boxes ───────────────────────────
  if (hudLive.size === 0 && hudDying.length === 0) return startY;
  const numRows = groups.size <= 7 ? 1 : 2;
  return startY + numRows * HUD_BOX + (numRows - 1) * HUD_GAP + 6;
}

// ── Zone HUD ─────────────────────────────────────────────────────────────────
function drawZoneHUD(ctx, W, H, playerX, playerY, topY = 8) {
  const zoneId = getZoneId(playerX, playerY);
  const zone   = ZONE_CONFIG[zoneId];
  if (!zone) return;

  const zoneName  = zone.name;
  const zoneColor = RARITY_TEXT[zone.rarity] || '#ffffff';

  ctx.save();
  ctx.font         = 'bold 32px "UbuntuCustom", "Ubuntu", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';

  const prefix = 'You are in ';
  const suffix = ' zone';
  const pw = ctx.measureText(prefix).width;
  const nw = ctx.measureText(zoneName).width;
  const sw = ctx.measureText(suffix).width;
  const totalW = pw + nw + sw;
  const startX = W / 2 - totalW / 2;
  const y = topY;

  // Shadow pass
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillText(prefix + zoneName + suffix, startX + 1.5, y + 1.5);

  // White "You are in "
  ctx.fillStyle = '#ffffff';
  ctx.fillText(prefix, startX, y);

  // Coloured zone name
  ctx.fillStyle = zoneColor;
  ctx.fillText(zoneName, startX + pw, y);

  // White " zone"
  ctx.fillStyle = '#ffffff';
  ctx.fillText(suffix, startX + pw + nw, y);

  ctx.restore();
  return y + 38;  // bottom of the 32px text + small gap → where boxes start
}

// ── Main render entry ─────────────────────────────────────────────────────────
export function render(ctx, W, H, cameraX, cameraY, dt = 16) {
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Smooth centipede legs rotation
  const ROTATION_SMOOTHING = 0.15;  // How quickly to lerp to target angle
  let diff = player.moveAngle - player.smoothRotation;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  player.smoothRotation += diff * ROTATION_SMOOTHING;

  // Smooth cutter speed transitions
  if (inputState.expand) {
    // Attacking: accelerate smoothly to max speed
    cutterSpeed = Math.min(cutterSpeed + CUTTER_ACCEL * dt, CUTTER_MAX_SPEED);
  } else {
    // Not attacking: decelerate smoothly to default speed
    cutterSpeed = Math.max(cutterSpeed - CUTTER_DECEL * dt, CUTTER_DEFAULT_SPEED);
  }
  cutterRot += cutterSpeed * dt;

  // Petal animations
  diggerEggRot += DIGGER_EGG_ROT_SPEED * dt;
  wingRot      += WING_SPIN_SPEED * dt;

  drawMap(ctx, cameraX, cameraY, W, H);

  drawDrops(ctx, W, H);
  drawWebFields(ctx, W, H);
  drawPollenEntities(ctx, W, H);
  drawHoneycombEntities(ctx, W, H);

  // ── Mobs ──────────────────────────────────────────────────────────────────
  for (const mob of mobs) {
    const { sx, sy } = toScreen(mob.x, mob.y, W, H);
    const scaledR    = (mob.drawRadius ?? mob.radius) * zoom;

    if (mob.typeId === 'spider') {
      drawSpider(ctx, sx, sy, scaledR, mob.facing ?? 0, mob.legPhase ?? 0, mob.speed);
    } else {
      drawMob(ctx, mob, sx, sy, scaledR);
    }

    // ── Hitbox debug overlay (toggle with F) ────────────────────────────────
    if (showHitboxes) {
      const _hAngle = (mob.facing || 0) + Math.PI / 2;
      const _hOx = (mob.hitOffsetX||0) * Math.cos(_hAngle) - (mob.hitOffsetY||0) * Math.sin(_hAngle);
      const _hOy = (mob.hitOffsetX||0) * Math.sin(_hAngle) + (mob.hitOffsetY||0) * Math.cos(_hAngle);
      const hitSX = sx + _hOx * zoom;
      const hitSY = sy + _hOy * zoom;
      const hitR  = mob.radius * zoom;
      ctx.save();
      ctx.strokeStyle = mob.isFriendlyPet ? 'rgba(50, 220, 80, 0.9)' : 'rgba(255, 40, 40, 0.85)';
      ctx.lineWidth   = 1.5;   // fixed screen-space width — never scales with zoom
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(hitSX, hitSY, hitR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Skip health label for undamaged centipede body segments
    const skipLabel = mob.typeId === 'centipede_body' && mob.hp >= mob.maxHp;
    if (!skipLabel) {
      drawEntityLabel(
        ctx, sx, sy, scaledR,
        mob.name, mob.hp, mob.maxHp,
        mob.rarity || null,
        mob.rarity ? RARITY_COLORS[mob.rarity] : null
      );
    }
  }

  drawPetalsWorld(ctx, W, H);

  // ── Missiles (hornet stingers) ────────────────────────────────────────────
  for (const m of missiles) {
    if (m.dead) continue;
    const { sx, sy } = toScreen(m.x, m.y, W, H);
    // Use stingerR (the hornet's radius) so missile proportions match the stinger exactly
    const scaledMobR = (m.stingerR ?? m.radius) * zoom;
    drawMissile(ctx, sx, sy, scaledMobR, m.angle ?? 0);

    if (showHitboxes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 160, 40, 0.9)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, m.radius * zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ── Player ────────────────────────────────────────────────────────────────
  const { sx, sy } = toScreen(player.x, player.y, W, H);
  const scaledR    = player.radius * zoom;

  // ── Centipede legs accessory — draws under flower ────────────────────────────
  if (hotbar.some(id => id?.startsWith('centipede_legs'))) {
    ctx._legPhase = player.legPhase;
    ctx._legRotation = player.smoothRotation;
    ctx._isIcon = false;  // drawing in world, not icon
    drawPetalShape(ctx, 'centipede_legs', sx, sy, scaledR);
    ctx._legPhase = 0;
    ctx._legRotation = 0;
    ctx._isIcon = false;
  }

  // Disc makes the flower stroke black
  const borderColor = hotbar.some(id => id?.startsWith('disc')) ? '#000000' : player.border;
  circle(ctx, sx, sy, scaledR, player.color, borderColor, 3, zoom);

  // ── Cutter accessory — animated saw ring around the flower body ─────────────
  if (hotbar.some(id => id?.startsWith('cutter'))) {
    ctx._cutterRot = cutterRot;
    drawPetalShape(ctx, 'cutter', sx, sy, scaledR * 1.14);
    ctx._cutterRot = 0;
  }

  // expand (Space/LMB) = attacking -> sad face
  // retract (Shift/RMB) = defending -> angry face
  updateFace(dt, player.moveAngle ?? 0, inputState.expand, inputState.retract, isMoving);
  drawFlowerFace(ctx, sx, sy, scaledR);

  // ── Third eye accessory — on forehead ─────────────────────────────────────────
  if (hotbar.some(id => id?.startsWith('third_eye'))) {
    drawThirdEyeAccessory(ctx, sx, sy, scaledR);
  }

  // ── Accessory petals — drawn on flower body, not in orbit ──────────────────
  if (hotbar.some(id => id && (id === 'antennae' || id.startsWith('antennae_')))) {
    drawPetalShape(ctx, 'antennae', sx, sy, scaledR);
  }

  // ── Player hitbox overlay ────────────────────────────────────────────────
  if (showHitboxes) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 180, 255, 0.9)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, player.radius * zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawEntityLabel(ctx, sx, sy, scaledR, player.name, player.hp, player.maxHp, null, null);

  const boxStartY = drawZoneHUD(ctx, W, H, player.x, player.y, HUD_PAD_TOP);
  if (settings.statBoxes) {
    drawZoneMobHUD(ctx, W, player.x, player.y, dt, boxStartY);
  }
  drawMobTooltip(ctx, W, H, hudLive, HUD_BOX, dt);
  drawPetalTooltip(ctx, W, H, dt);
  drawDamagePopups(ctx, W, H);
  updateHotbar(ctx, W, H);
  updateInventory();
  updateSettingsCog(performance.now());

}