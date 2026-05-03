import { zoom } from './camera.js';

// ── Map dimensions ────────────────────────────────────────────────────────────
// 3 columns × 5 rows of zones, each cell 7000 × 7000 world units
export const MAP_W = 52500;
export const MAP_H = 87500;

export const MAP_WALL_COLOR = '#1a0e05';

const ZONE_COLS = 3;
const ZONE_ROWS = 5;
const CELL_W    = MAP_W / ZONE_COLS;   // 7000
const CELL_H    = MAP_H / ZONE_ROWS;   // 7000

// ── Zone configuration (row-major: id = row*3 + col) ─────────────────────────
//
//  Row 0 │ Common (0)    │ Unusual (1)   │ Rare (2)          │  ← easiest
//  Row 1 │ Mythic (3)    │ Legendary (4) │ Epic (5)          │
//  Row 2 │ Ultra (6)     │ Super (7)     │ Radiant (8)       │
//  Row 3 │ Seraphic (9)  │ Runic (10)    │ Mystitic (11)     │
//  Row 4 │ Umbral (12)   │ Impract. (13) │ ??? / Void (14)   │  ← hardest
//
// tier = global rarity index (Common=0 … Impracticality=13)
// The void cell (14) has tier=-1; mobs that enter are despawned immediately.
export const ZONE_CONFIG = [
  // ── Row 0 ─────────────────────────────────────────────────────────────────
  { name: 'Common',          rarity: 'Common',          tier:  0, floor: '#4db85c', tint: 'rgba(30,120,50,0.10)'   },
  { name: 'Unusual',         rarity: 'Unusual',         tier:  1, floor: '#9acc44', tint: 'rgba(100,170,30,0.10)'  },
  { name: 'Rare',            rarity: 'Rare',            tier:  2, floor: '#4477cc', tint: 'rgba(20,80,200,0.12)'   },
  // ── Row 1 ─────────────────────────────────────────────────────────────────
  { name: 'Mythic',          rarity: 'Mythical',        tier:  5, floor: '#2299bb', tint: 'rgba(10,130,170,0.14)'  },
  { name: 'Legendary',       rarity: 'Legendary',       tier:  4, floor: '#991a20', tint: 'rgba(130,10,15,0.14)'   },
  { name: 'Epic',            rarity: 'Epic',            tier:  3, floor: '#7733bb', tint: 'rgba(100,20,170,0.14)'  },
  // ── Row 2 ─────────────────────────────────────────────────────────────────
  { name: 'Ultra',           rarity: 'Ultra',           tier:  6, floor: '#cc2277', tint: 'rgba(200,10,100,0.14)'  },
  { name: 'Super',           rarity: 'Super',           tier:  7, floor: '#009966', tint: 'rgba(0,140,90,0.14)'    },
  { name: 'Radiant',         rarity: 'Radiant',         tier:  8, floor: '#cc9900', tint: 'rgba(200,150,0,0.14)'   },
  // ── Row 3 ─────────────────────────────────────────────────────────────────
  { name: 'Seraphic',        rarity: 'Seraphic',        tier: 11, floor: '#c0d8ee', tint: 'rgba(200,220,255,0.25)' },
  { name: 'Runic',           rarity: 'Runic',           tier: 10, floor: '#2d0066', tint: 'rgba(50,0,120,0.20)'    },
  { name: 'Mystitic',        rarity: 'Mystitic',        tier:  9, floor: '#009988', tint: 'rgba(0,150,130,0.16)'   },
  // ── Row 4 ─────────────────────────────────────────────────────────────────
  { name: 'Umbral',          rarity: 'Umbral',          tier: 12, floor: '#060610', tint: 'rgba(0,0,20,0.50)'      },
  { name: 'Impracticality',  rarity: 'Impracticality',  tier: 13, floor: '#330033', tint: 'rgba(80,0,80,0.30)'     },
  { name: '???',             rarity: null,              tier: -1, floor: '#080808', tint: 'rgba(0,0,0,0.60)'       },
];


// ── Zone wall segments (interior walls blocking non-path crossings) ────────────
// The map uses a snake path: Row0 L→R, Row1 R→L, Row2 L→R, Row3 R→L, Row4 L→R
// All vertical (column) boundaries are OPEN (free lateral movement within a row).
// Only specific horizontal (row) boundaries are walled to enforce the snake path.
//
// Open horizontal crossings (part of the path):
//   Row0→1: col2 only (Rare → Epic)
//   Row1→2: col0 only (Mythic → Ultra)
//   Row2→3: col2 only (Radiant → Mystitic)
//   Row3→4: col0 only (Seraphic → Umbral)
const WALL_T  = 80;          // horizontal wall thickness (world units)
const WALL_H  = WALL_T / 2;  // half-thickness
const VSTUB_T = 80;          // vertical stub wall thickness
const VSTUB_L = CELL_H / 2;  // stub extends halfway into a zone

// Snake path open passages (one per row boundary, at the turn column):
//   Row0→1 open at col2  (x = 2*CELL_W .. 3*CELL_W)
//   Row1→2 open at col0  (x = 0        ..   CELL_W)
//   Row2→3 open at col2  (x = 2*CELL_W .. 3*CELL_W)
//   Row3→4 open at col0  (x = 0        ..   CELL_W)
export const ZONE_WALLS = [
  // ── Row 0→1 horizontal boundary: col0 and col1 fully walled ─────────────
  { x: 0,        y: CELL_H - WALL_H, w: CELL_W,   h: WALL_T },  // Common ↔ Mythic
  { x: CELL_W,   y: CELL_H - WALL_H, w: CELL_W,   h: WALL_T },  // Unusual ↔ Legendary
  // Passage is in col2 (x: 2*CELL_W..3*CELL_W).
  // Left edge stub (at x=2*CELL_W): half into row0 above, half into row1 below
  { x: 2*CELL_W - VSTUB_T/2, y: CELL_H - VSTUB_L, w: VSTUB_T, h: VSTUB_L },
  { x: 2*CELL_W - VSTUB_T/2, y: CELL_H,            w: VSTUB_T, h: VSTUB_L },
  // Right edge is the map border — no stub needed there

  // ── Row 1→2 horizontal boundary: col1 and col2 fully walled ─────────────
  { x: CELL_W,   y: 2*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Legendary ↔ Super
  { x: 2*CELL_W, y: 2*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Epic ↔ Radiant
  // Passage is in col0 (x: 0..CELL_W).
  // Right edge stub (at x=CELL_W): half into row1 above, half into row2 below
  { x: CELL_W - VSTUB_T/2, y: 2*CELL_H - VSTUB_L, w: VSTUB_T, h: VSTUB_L },
  { x: CELL_W - VSTUB_T/2, y: 2*CELL_H,            w: VSTUB_T, h: VSTUB_L },
  // Left edge is the map border — no stub needed

  // ── Row 2→3 horizontal boundary: col0 and col1 fully walled ─────────────
  { x: 0,        y: 3*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Ultra ↔ Seraphic
  { x: CELL_W,   y: 3*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Super ↔ Runic
  // Passage is in col2 (x: 2*CELL_W..3*CELL_W).
  // Left edge stub (at x=2*CELL_W)
  { x: 2*CELL_W - VSTUB_T/2, y: 3*CELL_H - VSTUB_L, w: VSTUB_T, h: VSTUB_L },
  { x: 2*CELL_W - VSTUB_T/2, y: 3*CELL_H,            w: VSTUB_T, h: VSTUB_L },

  // ── Row 3→4 horizontal boundary: col1 and col2 fully walled ─────────────
  { x: CELL_W,   y: 4*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Runic ↔ Impracticality
  { x: 2*CELL_W, y: 4*CELL_H - WALL_H, w: CELL_W, h: WALL_T },  // Mystitic ↔ Void
  // Passage is in col0 (x: 0..CELL_W).
  // Right edge stub (at x=CELL_W)
  { x: CELL_W - VSTUB_T/2, y: 4*CELL_H - VSTUB_L, w: VSTUB_T, h: VSTUB_L },
  { x: CELL_W - VSTUB_T/2, y: 4*CELL_H,            w: VSTUB_T, h: VSTUB_L },
];

// ── Zone helpers ──────────────────────────────────────────────────────────────
export function getZoneId(x, y) {
  const col = Math.max(0, Math.min(ZONE_COLS - 1, Math.floor(x / CELL_W)));
  const row = Math.max(0, Math.min(ZONE_ROWS - 1, Math.floor(y / CELL_H)));
  return row * ZONE_COLS + col;
}

export function getZoneTier(zoneId) {
  return ZONE_CONFIG[zoneId]?.tier ?? 99;
}

export function getZoneBounds(zoneId) {
  const col = zoneId % ZONE_COLS;
  const row = Math.floor(zoneId / ZONE_COLS);
  return {
    x0: col * CELL_W,
    y0: row * CELL_H,
    x1: (col + 1) * CELL_W,
    y1: (row + 1) * CELL_H,
  };
}

// ── Spawn chance picker ───────────────────────────────────────────────────────
// Rules:
//   • 65% own tier, 30% one below, 5% one above
//   • No tier below  → 95% own, 5% above     (e.g. Common)
//   • No tier above  → 70% own, 30% below     (e.g. Impracticality)
export function pickSpawnRarity(zoneTier, RARITIES) {
  const maxTier = RARITIES.length - 1;
  const roll    = Math.random();
  if (zoneTier <= 0)       return roll < 0.95 ? RARITIES[0]         : RARITIES[1];
  if (zoneTier >= maxTier) return roll < 0.70 ? RARITIES[maxTier]   : RARITIES[maxTier - 1];
  if (roll < 0.65)         return RARITIES[zoneTier];
  if (roll < 0.95)         return RARITIES[zoneTier - 1];
  return RARITIES[zoneTier + 1];
}

// ── Collision / movement ──────────────────────────────────────────────────────
export function canMoveTo(x, y, radius = 22) {
  if (x - radius < 0 || x + radius > MAP_W ||
      y - radius < 0 || y + radius > MAP_H) return false;
  // Check interior zone walls
  for (const w of ZONE_WALLS) {
    if (x + radius > w.x && x - radius < w.x + w.w &&
        y + radius > w.y && y - radius < w.y + w.h) return false;
  }
  return true;
}

// ── Player safe-spawn (Common zone) ──────────────────────────────────────────
export function findSafeSpawnPosition(radius = 22, playerX, playerY, safeRadius = 350) {
  const b = getZoneBounds(0);
  for (let i = 0; i < 150; i++) {
    const x = b.x0 + radius + Math.random() * (b.x1 - b.x0 - 2 * radius);
    const y = b.y0 + radius + Math.random() * (b.y1 - b.y0 - 2 * radius);
    if (playerX !== undefined && Math.hypot(x - playerX, y - playerY) < safeRadius) continue;
    return { x, y };
  }
  return { x: CELL_W / 2, y: CELL_H / 2 };
}

// ── Mob spawn inside a specific zone (no overlap with existing mobs or walls) ──
export function findSpawnInZone(zoneId, radius = 18, playerX, playerY, existingMobs, safeRadius = 350) {
  const b = getZoneBounds(zoneId);
  for (let i = 0; i < 300; i++) {
    const x = b.x0 + radius + Math.random() * (b.x1 - b.x0 - 2 * radius);
    const y = b.y0 + radius + Math.random() * (b.y1 - b.y0 - 2 * radius);
    if (playerX !== undefined && Math.hypot(x - playerX, y - playerY) < safeRadius) continue;
    // Must be in a valid (non-wall) position
    if (!canMoveTo(x, y, radius + 4)) continue;
    let clear = true;
    for (const m of existingMobs) {
      if (m.dead) continue;
      if (Math.hypot(x - m.x, y - m.y) < radius + m.radius + 12) { clear = false; break; }
    }
    if (clear) return { x, y };
  }
  return null;
}

// ── Background triangle decorations ──────────────────────────────────────────
function seededRng(seed) {
  let s = seed | 0;
  return () => { s = Math.imul(1664525, s) + 1013904223 | 0; return (s >>> 0) / 0xFFFFFFFF; };
}

// World units. Reference shows large soft shapes visible at normal zoom.
// Player radius = 22wu. These are roughly 5-18x player size.
const TRI_MIN_R = 120;
const TRI_MAX_R = 380;
const TRI_TARGET = 2000;
const TRI_ALPHA  = 0.09;

function insideWall(wx, wy, pad) {
  for (const w of ZONE_WALLS) {
    if (wx > w.x - pad && wx < w.x + w.w + pad &&
        wy > w.y - pad && wy < w.y + w.h + pad) return true;
  }
  return false;
}

const BG_TRIANGLES = (() => {
  const rng  = seededRng(0xBEEF1234);
  const tris = [];
  let attempts = 0;
  while (tris.length < TRI_TARGET && attempts < TRI_TARGET * 6) {
    attempts++;
    const x   = rng() * MAP_W;
    const y   = rng() * MAP_H;
    const r   = TRI_MIN_R + rng() * (TRI_MAX_R - TRI_MIN_R);
    const rot = rng() * Math.PI * 2;
    const cr  = r * (0.25 + rng() * 0.15);
    const bow = 0.04 + rng() * 0.08;
    if (insideWall(x, y, r + 80)) continue;
    tris.push({ x, y, r, rot, cr, bow });
  }
  return tris;
})();

// Rounded-corner triangle with gently bowed sides — matches the reference image.
// cr  = corner radius in screen px (already zoom-scaled by caller)
// bow = fraction of edge length to push inward (subtle, 0.04-0.12)
function drawSoftTriangle(ctx, cx, cy, r, rot, cr, bow) {
  const vx = [0,1,2].map(i => cx + Math.cos(rot + i * Math.PI * 2 / 3) * r);
  const vy = [0,1,2].map(i => cy + Math.sin(rot + i * Math.PI * 2 / 3) * r);

  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const ex = vx[j] - vx[i], ey = vy[j] - vy[i];
    const edgeLen = Math.hypot(ex, ey);
    const ux = ex / edgeLen, uy = ey / edgeLen;
    const nx = -uy, ny = ux;  // inward normal (points toward triangle centre)

    const t  = Math.min(cr, edgeLen * 0.42);
    const ax = vx[i] + ux * t, ay = vy[i] + uy * t;  // arc start
    const bx = vx[j] - ux * t, by = vy[j] - uy * t;  // arc end

    if (i === 0) ctx.moveTo(ax, ay);
    else         ctx.lineTo(ax, ay);

    // Bowed side: quadratic bezier, control point nudged inward
    const mx  = (ax + bx) / 2, my = (ay + by) / 2;
    const cpx = mx + nx * bow * edgeLen;
    const cpy = my + ny * bow * edgeLen;
    ctx.quadraticCurveTo(cpx, cpy, bx, by);

    // Soft corner arc at vertex j using the next edge's direction
    const nj  = (j + 1) % 3;
    const e2x = vx[nj] - vx[j], e2y = vy[nj] - vy[j];
    const e2l = Math.hypot(e2x, e2y);
    const t2  = Math.min(cr, e2l * 0.42);
    ctx.quadraticCurveTo(vx[j], vy[j],
      vx[j] + (e2x / e2l) * t2,
      vy[j] + (e2y / e2l) * t2);
  }
  ctx.closePath();
}

// ── World-space map drawing ───────────────────────────────────────────────────
export function drawMap(ctx, cameraX, cameraY, canvasW, canvasH) {
  const hw = canvasW / 2, hh = canvasH / 2;
  const wx2sx = wx => (wx - cameraX) * zoom + hw;
  const wy2sy = wy => (wy - cameraY) * zoom + hh;

  const mapLeft   = wx2sx(0),    mapTop    = wy2sy(0);
  const mapRight  = wx2sx(MAP_W), mapBottom = wy2sy(MAP_H);
  const mapSW     = mapRight - mapLeft, mapSH = mapBottom - mapTop;

  // Dark outside
  ctx.fillStyle = '#12100a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ── Zone cells ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#4db85c';
  ctx.fillRect(mapLeft, mapTop, mapSW, mapSH);

  // ── Background triangle decorations ──────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapLeft, mapTop, mapSW, mapSH);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,' + TRI_ALPHA + ')';
  for (const t of BG_TRIANGLES) {
    const sx = wx2sx(t.x), sy = wy2sy(t.y);
    const sr = t.r * zoom, scr = t.cr * zoom;
    if (sx + sr < 0 || sx - sr > canvasW || sy + sr < 0 || sy - sr > canvasH) continue;
    drawSoftTriangle(ctx, sx, sy, sr, t.rot, scr, t.bow);
    ctx.fill();
  }
  ctx.restore();


  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth   = Math.max(2, 3 * zoom);
  ctx.setLineDash([14 * zoom, 8 * zoom]);
  for (let c = 1; c < ZONE_COLS; c++) {
    const sx = wx2sx(c * CELL_W);
    if (sx < -50 || sx > canvasW + 50) continue;
    ctx.beginPath(); ctx.moveTo(sx, mapTop); ctx.lineTo(sx, mapBottom); ctx.stroke();
  }
  for (let r = 1; r < ZONE_ROWS; r++) {
    const sy = wy2sy(r * CELL_H);
    if (sy < -50 || sy > canvasH + 50) continue;
    ctx.beginPath(); ctx.moveTo(mapLeft, sy); ctx.lineTo(mapRight, sy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Zone name labels ──────────────────────────────────────────────────────
  const labelSz = Math.max(10, Math.min(28, 18 * zoom));
  ctx.font = `bold ${labelSz}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let id = 0; id < ZONE_CONFIG.length; id++) {
    const col = id % ZONE_COLS, row = Math.floor(id / ZONE_COLS);
    const sx  = wx2sx((col + 0.5) * CELL_W), sy = wy2sy((row + 0.5) * CELL_H);
    if (sx < -200 || sx > canvasW + 200 || sy < -80 || sy > canvasH + 80) continue;
    const cfg = ZONE_CONFIG[id];
    // Seraphic uses dark text; Umbral/void use light
    const col0 = (id === 11) ? 'rgba(0,0,0,0.55)'   : 'rgba(0,0,0,0.50)';
    const col1 = (id === 11) ? 'rgba(30,30,60,0.90)' : 'rgba(255,255,255,0.75)';
    ctx.fillStyle = col0; ctx.fillText(cfg.name, sx + 1, sy + 1);
    ctx.fillStyle = col1; ctx.fillText(cfg.name, sx, sy);
  }

  // ── Interior zone walls ────────────────────────────────────────────────────
  ctx.fillStyle = MAP_WALL_COLOR;
  for (const wall of ZONE_WALLS) {
    const wsx = wx2sx(wall.x);
    const wsy = wy2sy(wall.y);
    const wsw = wall.w * zoom;
    const wsh = wall.h * zoom;
    ctx.fillRect(wsx, wsy, wsw, wsh);
  }

  // ── Border walls ──────────────────────────────────────────────────────────
  const wt = Math.max(3, 8 * zoom);
  ctx.fillStyle = MAP_WALL_COLOR;
  ctx.fillRect(mapLeft,        mapTop - wt,   mapSW, wt);
  ctx.fillRect(mapLeft,        mapBottom,      mapSW, wt);
  ctx.fillRect(mapLeft - wt,   mapTop - wt,   wt, mapSH + wt * 2);
  ctx.fillRect(mapRight,       mapTop - wt,   wt, mapSH + wt * 2);
}