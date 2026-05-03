/**
 * petalDrawing.js — Math-based petal shape drawing.
 *
 * All petals are drawn with canvas 2D primitives — no images or spritesheets.
 * Each petal type has its own draw function keyed by spriteIndex so petalTypes.js
 * can stay unchanged.
 *
 * drawPetalShape(ctx, typeId, cx, cy, r)
 *   — used by the world renderer (orbiting petals, world drops)
 *
 * drawInventoryIcon(canvasEl, typeId)
 *   — used by the UI (hotbar + inventory icon canvases)
 *   — canvas must already be sized correctly (CSS size × DPR for physical px)
 *
 * Size scaling:
 *   DRAW_SCALE[spriteIndex] multiplies the incoming r before drawing.
 *   This lets light (~0.50) and faster (~0.60) appear visually smaller than
 *   basic (1.0) in both the world and the UI without touching petalTypes.js.
 *   basic  = 1.00  →  full radius
 *   faster = 0.60  →  20% bigger than light
 *   light  = 0.50  →  ~50% of basic
 *   all others = 1.0
 */

import { PETAL_TYPES } from './petalTypes.js';

// ── Icon overrides (inv / hotbar / drops only — world drawing is unaffected) ──
// rot   : rotation in degrees applied to the petal drawing
// scale : multiplier on top of DRAW_SCALE (1.0 = no extra change)
// ox/oy : pixel offset of the petal centre from the canvas centre (in CSS px,
//         automatically scaled by DPR inside drawInventoryIcon)
// nameSize : unused at runtime but kept for reference / future use
const ICON_OVERRIDES = {
  "Basic":          { rot:   0, scale: 0.68, ox:  0, oy:  -5, nameSize: 2.00 },
  "Faster":         { rot:   0, scale: 0.82, ox:  0, oy:  -4, nameSize: 2.00 },
  "Light":          { rot:   0, scale: 0.55, ox:  0, oy:  -5, nameSize: 2.00 },
  "Pollen":         { rot:   0, scale: 0.82, ox:  0, oy:  -4, nameSize: 2.00 },
  "Rose":           { rot:   0, scale: 0.82, ox:  0, oy:  -3, nameSize: 2.00 },
  "Stinger":        { rot:   0, scale: 0.50, ox:  0, oy:  -6, nameSize: 2.00 },
  "Web":            { rot:   0, scale: 1.00, ox:  0, oy:  -1, nameSize: 2.00 },
  "Poison":         { rot:   0, scale: 1.00, ox:  0, oy:  -4, nameSize: 2.00 },
  "Leaf":           { rot:  15, scale: 0.54, ox:  5, oy:  -1, nameSize: 2.00 },
  "Centipede Legs": { rot:   0, scale: 0.78, ox:  0, oy:  -2, nameSize: 2.00 },
  "Peas":           { rot: -29, scale: 0.47, ox:  0, oy:  -5, nameSize: 2.00 },
  "Third Eye":      { rot:   0, scale: 0.43, ox:  0, oy:   0, nameSize: 2.00 },
  "Clover":         { rot:  51, scale: 0.71, ox:  5, oy:  -4, nameSize: 2.00 },
  "Wing":           { rot:   0, scale: 0.85, ox:  2, oy:  -5, nameSize: 2.00 },
  "Rice":           { rot:   0, scale: 1.00, ox:  0, oy:  -4, nameSize: 2.00 },
  "Ant Egg":        { rot:   0, scale: 0.75, ox:  0, oy:  -6, nameSize: 2.00 },
  "Disc":           { rot:   0, scale: 0.90, ox:  0, oy: -14, nameSize: 2.00 },
  "Cutter":         { rot:   0, scale: 0.87, ox:  0, oy:  -3, nameSize: 2.00 },
  "Digger Egg":     { rot:   0, scale: 0.70, ox:  0, oy:  -2, nameSize: 2.00 },
  "Soil":           { rot:  36, scale: 0.81, ox:  0, oy:  -5, nameSize: 2.00 },
  "Magnet":         { rot:   0, scale: 0.62, ox:  4, oy:  -3, nameSize: 2.00 },
  "Honey":          { rot:   0, scale: 0.79, ox:  0, oy:  -3, nameSize: 2.00 },
  "Bee Egg":        { rot:   0, scale: 0.65, ox:  0, oy:  -2, nameSize: 2.00 },
  "Honeycomb":      { rot:   0, scale: 0.90, ox:  0, oy:  -7, nameSize: 2.00 },
  "Antennae":       { rot:   0, scale: 1.11, ox:  0, oy:  36, nameSize: 2.00 },
  "Orange":         { rot:  -2, scale: 0.24, ox: -2, oy: -11, nameSize: 2.00 },
  "Missile":        { rot: 315, scale: 0.55, ox:  0, oy:   0, flipX: true, nameSize: 2.00 },
};

// ── Visual size scale per spriteIndex ─────────────────────────────────────────
// 1.0 = use the full r passed in. Tune only where visuals should differ from
// the physics radius.
const DRAW_SCALE = [
  1.00, // ✅0 basic
  0.75, // ✅1 faster  
  0.95, // ✅2 light   
  0.95, // ✅3 pollen  
  0.80, // ✅4 rose    
  1.00, // ✅5 stinger
  1.00, // ✅6 web
  0.90, // ✅7 poison
  2.00, // ✅8 leaf
  1.00, // ✅9 centipede_legs
  1.50, // ✅10 peas
  1.00, // ✅11 third_eye
  1.50, // ✅12 clover
  1.00, // ✅13 wing
  1.00, // ✅14 rice
  1.00, // ✅15 ant_egg
  1.00, // ✅16 disc
  1.00, // ✅17 cutter
  1.00, // ✅18 digger_egg
  1.00, // ✅19 soil
  2.00, // ✅20 magnet
  1.00, // ✅21 honey
  1.00, // ✅22 bee_egg
  1.00, // ✅23 honeycomb
  1.00, // ✅24 antennae
  1.75, // ✅25 orange
  2.00, // ✅26 missile
];

// ── Per-type draw functions ───────────────────────────────────────────────────
// Each receives (ctx, cx, cy, r) where r is already scaled by DRAW_SCALE.

function drawBasic(ctx, cx, cy, r) {
  // White fill, soft gray stroke — matches the in-game sprite.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawFaster(ctx, cx, cy, r) {
  // White fill like basic, stroke with slight orange tint
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#d8c8c8'; // Gray with slight orange tint
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawLight(ctx, cx, cy, r) {
  // Same colors as basic but half the size
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawPollen(ctx, cx, cy, r) {
  // Solid yellow circle with a darker orange-yellow stroke — matches sprite.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#f5c932';
  ctx.fill();
  ctx.strokeStyle = '#c8920a';
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawRose(ctx, cx, cy, r) {
  // Solid bright magenta/pink circle with a deeper pink stroke — matches sprite.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#f0287a';
  ctx.fill();
  ctx.strokeStyle = '#a0005a';
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();
}

function drawStinger(ctx, cx, cy, r) {
  // Pure right-pointing triangle — no circle body.
  // Tip at cx+r, flat base on the left.
  const tipX  = cx + r;
  const baseX = cx - r * 0.7;
  const halfH = r * 0.85;

  ctx.beginPath();
  ctx.moveTo(tipX,  cy);
  ctx.lineTo(baseX, cy - halfH);
  ctx.lineTo(baseX, cy + halfH);
  ctx.closePath();

  ctx.fillStyle   = '#181818';
  ctx.fill();
  ctx.strokeStyle = '#666666';
  ctx.lineWidth   = Math.max(1, r * 0.14);
  ctx.lineJoin    = 'round';
  ctx.stroke();
}

function drawWeb(ctx, cx, cy, r) {
  // 5-pointed concave star with ~15 silk lines radiating inward to a small center circle.
  const N      = 5;
  const bulge  = r * 0.40;
  const rotate = -Math.PI / 2 - (Math.PI * 2 * 0.05);
  const innerR = r * 0.10;

  function tip(i) {
    const a = rotate + (Math.PI * 2 / N) * i;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }
  function concavePoint(i) {
    const a = rotate + (Math.PI * 2 / N) * i + Math.PI / N;
    return [cx + Math.cos(a) * (r - bulge), cy + Math.sin(a) * (r - bulge)];
  }

  // Build star path helper (reused for fill + clip)
  function starPath() {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const [x0, y0] = tip(i);
      const [x1, y1] = tip((i + 1) % N);
      const [cpx, cpy] = concavePoint(i);
      if (i === 0) ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cpx, cpy, x1, y1);
    }
    ctx.closePath();
  }

  // Fill star
  starPath();
  ctx.fillStyle   = '#e0e0e0';
  ctx.fill();
  ctx.strokeStyle = '#b0b0b0';
  ctx.lineWidth   = Math.max(1, r * 0.07);
  ctx.stroke();

  // Clip silk lines to star interior
  ctx.save();
  starPath();
  ctx.clip();

  ctx.lineCap     = 'round';
  ctx.strokeStyle = 'rgba(130,130,130,0.60)';
  ctx.lineWidth   = Math.max(0.6, r * 0.045);

  // ~20 source points: tips + concave points + 2 extras per segment
  const sources = [];
  for (let i = 0; i < N; i++) {
    sources.push(tip(i));
    sources.push(concavePoint(i));
    const ha1 = rotate + (Math.PI * 2 / N) * i + Math.PI / N * 0.5;
    const ha2 = rotate + (Math.PI * 2 / N) * i + Math.PI / N * 1.5;
    sources.push([cx + Math.cos(ha1) * r * 0.80, cy + Math.sin(ha1) * r * 0.80]);
    sources.push([cx + Math.cos(ha2) * r * 0.80, cy + Math.sin(ha2) * r * 0.80]);
  }

  for (const [sx, sy] of sources) {
    const angle = Math.atan2(sy - cy, sx - cx);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.stroke();
  }

  ctx.restore();

  // Small center circle
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle   = '#d0d0d0';
  ctx.fill();
  ctx.strokeStyle = '#999999';
  ctx.lineWidth   = Math.max(0.6, r * 0.04);
  ctx.stroke();
}

function drawClover(ctx, cx, cy, r) {
  // Three hearts with tips meeting at center, stem below.
  // Geometry ported from SVG (viewBox 680×340, cluster center 340,160).
  // All coords are normalized: subtract (340,160), then scale by r/50.
  const S = r / 50;

  // Draws one heart using its SVG matrix transform, origin shifted to (340,160).
  function drawHeart(mat) {
    const [a, b, c, d, e, f] = mat;
    const pt = (x, y) => [cx + (a * x + c * y + e) * S, cy + (b * x + d * y + f) * S];

    const [mx, my] = pt(11.22, 0);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    let p;
    p = [...pt(5.576,0), ...pt(0.192,4.775), ...pt(0.005,12.257)];
    ctx.bezierCurveTo(...p);
    p = [...pt(-0.182,19.764), ...pt(4.867,29.87), ...pt(20.13,40.173)];
    ctx.bezierCurveTo(...p);
    p = [...pt(35.401,29.879), ...pt(40.402,19.764), ...pt(40.165,12.257)];
    ctx.bezierCurveTo(...p);
    p = [...pt(39.913,4.301), ...pt(36.403,0.098), ...pt(27.753,0.098)];
    ctx.bezierCurveTo(...p);
    p = [...pt(22.801,0.098), ...pt(21.05,3.557), ...pt(20.032,5.994)];
    ctx.bezierCurveTo(...p);
    p = [...pt(19.022,3.557), ...pt(16.856,0), ...pt(11.22,0)];
    ctx.bezierCurveTo(...p);
    ctx.closePath();
  }

  // SVG matrices with origin shifted to cluster center (340, 160)
  const mats = [
    [-0.8192, -0.5736,  0.5736, -0.8192, 333.44 - 340, 204.24 - 160],
    [ 0.9063, -0.4226,  0.4226,  0.9063, 304.97 - 340, 132.20 - 160],
    [-0.0872,  0.9962, -0.9962, -0.0872, 381.59 - 340, 143.56 - 160],
  ];

  // Stem (polyline) — drawn first so hearts layer on top
  const stemPts = [
    [0, 0], [6.39, 8.36], [11.31, 17.22], [12.79, 28.04],
    [11.81, 38.86], [6.89, 48.2], [0.98, 56.57],
  ];
  ctx.beginPath();
  ctx.moveTo(cx + stemPts[0][0] * S, cy + stemPts[0][1] * S);
  for (let i = 1; i < stemPts.length; i++) {
    ctx.lineTo(cx + stemPts[i][0] * S, cy + stemPts[i][1] * S);
  }
  ctx.strokeStyle = '#689a10';
  ctx.lineWidth   = Math.max(0.5, r * 0.10);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'miter';
  ctx.stroke();

  // Hearts — fill then stroke
  for (const mat of mats) {
    drawHeart(mat);
    ctx.fillStyle = '#83b925';
    ctx.fill();
    ctx.strokeStyle = '#689a10';
    ctx.lineWidth   = Math.max(1, r * 0.05);
    ctx.lineCap     = 'round';
    ctx.stroke();
  }
}

function drawWing(ctx, cx, cy, r) {
  // Wing drawn from the SVG path.
  // Bounding box of path: x[133.84, 350.02], y[97.10, 331.82]
  // True visual centre: x=241.93, y=214.46
  const SVG_CX = 241.93;
  const SVG_CY = 214.46;
  const SVG_SCALE = 90; // px per "r" unit

  const s = r / SVG_SCALE;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ctx._wingRot ?? 0);
  ctx.scale(s, s);

  // The single wing outline path, translated so its visual centre is at origin.
  const ox = -SVG_CX;
  const oy = -SVG_CY;

  ctx.beginPath();
  ctx.moveTo(133.83716 + ox, 281.13037 + oy);
  ctx.bezierCurveTo(
    133.83716 + ox, 281.13037 + oy,
    204.63279 + ox, 282.84173 + oy,
    250.06760 + ox, 225.92091 + oy
  );
  ctx.bezierCurveTo(
    296.50852 + ox, 167.73961 + oy,
    282.03097 + ox,  97.09884 + oy,
    282.03097 + ox,  97.09884 + oy
  );
  ctx.bezierCurveTo(
    282.03097 + ox,  97.09884 + oy,
    350.02443 + ox, 177.17357 + oy,
    299.46554 + ox, 248.19842 + oy
  );
  ctx.bezierCurveTo(
    239.94121 + ox, 331.81785 + oy,
    133.83716 + ox, 281.13037 + oy,
    133.83716 + ox, 281.13037 + oy
  );
  ctx.closePath();

  ctx.fillStyle = 'rgba(227, 213, 186, 0.55)';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 4.5;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawRice(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-20 * Math.PI / 180);

  const rx = r;       // half-length of the grain
  const ry = r * 0.42; // control point vertical offset (belly height)

  ctx.beginPath();
  ctx.moveTo(-rx, 0);
  // Top arc
  ctx.bezierCurveTo(-rx * 0.98, -ry,  rx * 0.98, -ry,  rx, 0);
  // Bottom arc
  ctx.bezierCurveTo( rx * 0.98,  ry, -rx * 0.98,  ry, -rx, 0);
  ctx.closePath();

  ctx.fillStyle   = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#a0a0a0';
  ctx.lineWidth   = Math.max(0.5, r * 0.13);
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawAntEgg(ctx, cx, cy, r) {
  const eggR  = r * 0.62;
  const dist  = r * 0.47;
  const eggs  = [
    [cx,        cy + dist], // east   (bottom layer)
    [cx,        cy - dist], // south  — wait, order: east bottom, south, west, north top
  ];

  // positions: north, west, south, east
  const N = [cx,        cy - dist];
  const W = [cx - dist, cy       ];
  const S = [cx,        cy + dist];
  const E = [cx + dist, cy       ];

  // draw order: east first (bottom), then south, west, north (top)
  const order = [E, S, W, N];

  for (const [px, py] of order) {
    // black border circle
    ctx.beginPath();
    ctx.arc(px, py, eggR + eggR * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
    // cream fill
    ctx.beginPath();
    ctx.arc(px, py, eggR, 0, Math.PI * 2);
    ctx.fillStyle = '#fffcec';
    ctx.fill();
  }
}

function drawDisc(ctx, cx, cy, r) {
  // Disc accessory — handled via player.border color change, no separate rendering
}

function drawCutter(ctx, cx, cy, r) {
  // Saw ring with filled body and teeth — unlike disc which is outline only
  ctx.save();
  ctx.translate(cx, cy);

  const rot = ctx._cutterRot ?? 0;

  const ringR     = r * 1.0;
  const ringThick = r * 0.11;
  const innerR    = ringR - ringThick;
  const toothCount = 14;
  const toothH    = r * 0.18;
  const toothHW   = (2 * Math.PI * ringR / toothCount) * 0.36;

  ctx.save();
  ctx.rotate(rot);
  for (let i = 0; i < toothCount; i++) {
    const a   = (i / toothCount) * Math.PI * 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    const px  = -sin, py = cos;

    const bl  = [cos * ringR - px * toothHW, sin * ringR - py * toothHW];
    const br  = [cos * ringR + px * toothHW, sin * ringR + py * toothHW];
    const tip = [cos * (ringR + toothH),     sin * (ringR + toothH)];

    ctx.beginPath();
    ctx.moveTo(bl[0], bl[1]);
    ctx.lineTo(br[0], br[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.closePath();
    ctx.fillStyle   = '#111111';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = Math.max(0.5, r * 0.025);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.arc(0, 0, innerR, 0, Math.PI * 2, true);
  ctx.fillStyle = '#111111';
  ctx.fill('evenodd');

  ctx.restore();
}

function drawBeeEgg(ctx, cx, cy, r) {
  const rx = r * 0.66;
  const ry = r;
  const bw = Math.max(1, r * 0.13);

  ctx.save();
  ctx.translate(cx, cy);

  // Short stinger — drawn first (behind body)
  const tipR  = r * 0.06;
  const tipCY = ry + r * 0.28;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, ry - r * 0.05);
  ctx.quadraticCurveTo(-r * 0.08, ry + r * 0.18, -tipR, tipCY);
  ctx.arc(0, tipCY, tipR, Math.PI, 0, true);
  ctx.quadraticCurveTo(r * 0.08, ry + r * 0.18, r * 0.22, ry - r * 0.05);
  ctx.closePath();
  ctx.fill();

  // Border ring
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + bw, ry + bw, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c8960a';
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f5cf4b';
  ctx.fill();

  // 4 stripes clipped to body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  for (const sy of [-ry * 0.65, -ry * 0.22, ry * 0.22, ry * 0.65]) {
    ctx.fillRect(-rx - 2, sy - ry * 0.13, (rx + 2) * 2, ry * 0.26);
  }
  ctx.restore();

  // Antennae drawn last — queen bee style
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = Math.max(1, r * 0.12);
  ctx.lineCap     = 'round';

  ctx.beginPath();
  ctx.moveTo(-r * 0.18, -ry + r * 0.1);
  ctx.quadraticCurveTo(-r * 0.08, -ry - r * 0.32, -r * 0.52, -r * 0.52 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.52, -r * 0.52 - ry, r * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(r * 0.18, -ry + r * 0.1);
  ctx.quadraticCurveTo(r * 0.08, -ry - r * 0.32, r * 0.52, -r * 0.52 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.52, -r * 0.52 - ry, r * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.restore();
}

function drawMagnet(ctx, cx, cy, r) {
  // Rotate the whole magnet around its centre to face outward from orbit.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ctx._magnetAngle ?? 0);
  ctx.translate(-cx, -cy);
  // Replicates the SVG magnet exactly — curved bar with red (+) and blue (-)
  // halves, black outline, white seam divider, and +/- labels at the tips.
  //
  // The SVG was designed in a 300×300 viewBox. We scale everything so the
  // magnet fits inside the given radius r, centred on (cx, cy).
  const S  = r / 115;   // 115 ≈ half the diagonal extent of the 300×300 shape
  const OX = cx - 150 * S; // map SVG x=150 → cx
  const OY = cy - 150 * S; // map SVG y=150 → cy

  // Transform an SVG-space point to canvas space.
  const T = (x, y) => [OX + x * S, OY + y * S];

  // Apply a 2-D matrix (a,b,c,d,e,f) to a local point and map to canvas.
  function applyMat(x, y, a, b, c, d, e, f) {
    return T(a * x + c * y + e, b * x + d * y + f);
  }

  // Build a canvas Path2D from a list of [x,y] canvas-space points (moveTo first,
  // then lineTo), closed at the end.
  function polyPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  // ── Helper: draw one SVG path piece with a given fill/stroke ────────────────
  // Each piece is defined by its matrix and a draw callback that builds the path
  // in SVG local coordinates using ctx primitives mapped through applyMat.

  function drawPiece(a, b, c, d, e, f, fillColor, strokeColor, strokeWidth, buildPath) {
    ctx.save();
    ctx.beginPath();
    buildPath(a, b, c, d, e, f);
    ctx.fillStyle   = fillColor;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth   = strokeWidth * S;
      ctx.lineJoin    = 'round';
      ctx.lineCap     = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Outline pass (drawn first, slightly fatter) ──────────────────────────────
  // We draw each piece twice: once as a fat black outline, once with its colour.

  const outlineW = 10;

  // Shared path builders for each of the 6 SVG pieces:

  // 1. Red arc
  function redArcPath(a, b, c, d, e, f) {
    const p = (x, y) => applyMat(x, y, a, b, c, d, e, f);
    const [mx, my] = p(126.8, 25.648);
    ctx.moveTo(mx, my);
    // bezier approximating the SVG arc curve
    const [c1x,c1y] = p(139.74, 41.068);
    const [c2x,c2y] = p(145.611, 61.213);
    const [ex1,ey1] = p(142.984, 81.171);
    ctx.bezierCurveTo(c1x,c1y, c2x,c2y, ex1,ey1);
    const [c3x,c3y] = p(140.356, 101.129);
    const [c4x,c4y] = p(129.471, 119.067);
    const [ex2,ey2] = p(112.981, 130.613);
    ctx.bezierCurveTo(c3x,c3y, c4x,c4y, ex2,ey2);
    const [lx,ly]   = p(92.39, 101.206);
    ctx.lineTo(lx, ly);
    const [c5x,c5y] = p(100.635, 95.433);
    const [c6x,c6y] = p(106.078, 86.464);
    const [ex3,ey3] = p(107.392, 76.485);
    ctx.bezierCurveTo(c5x,c5y, c6x,c6y, ex3,ey3);
    const [c7x,c7y] = p(108.705, 66.506);
    const [c8x,c8y] = p(105.77, 56.434);
    const [ex4,ey4] = p(99.3, 48.723);
    ctx.bezierCurveTo(c7x,c7y, c8x,c8y, ex4,ey4);
    ctx.closePath();
  }

  // 2. Blue arc
  function blueArcPath(a, b, c, d, e, f) {
    const p = (x, y) => applyMat(x, y, a, b, c, d, e, f);
    const [mx, my] = p(126.767, 25.641);
    ctx.moveTo(mx, my);
    const [c1x,c1y] = p(139.703, 41.057);
    const [c2x,c2y] = p(145.573, 61.197);
    const [ex1,ey1] = p(142.946, 81.149);
    ctx.bezierCurveTo(c1x,c1y, c2x,c2y, ex1,ey1);
    const [c3x,c3y] = p(140.319, 101.102);
    const [c4x,c4y] = p(129.437, 119.036);
    const [ex2,ey2] = p(112.952, 130.579);
    ctx.bezierCurveTo(c3x,c3y, c4x,c4y, ex2,ey2);
    const [lx,ly]   = p(92.366, 101.18);
    ctx.lineTo(lx, ly);
    const [c5x,c5y] = p(100.609, 95.408);
    const [c6x,c6y] = p(106.05, 86.441);
    const [ex3,ey3] = p(107.363, 76.465);
    ctx.bezierCurveTo(c5x,c5y, c6x,c6y, ex3,ey3);
    const [c7x,c7y] = p(108.677, 66.488);
    const [c8x,c8y] = p(105.742, 56.419);
    const [ex4,ey4] = p(99.274, 48.71);
    ctx.bezierCurveTo(c7x,c7y, c8x,c8y, ex4,ey4);
    ctx.closePath();
  }

  // 3. Blue cap (pie wedge)
  function blueCapPath(a, b, c, d, e, f) {
    const p = (x, y) => applyMat(x, y, a, b, c, d, e, f);
    const scale = 0.83; // scale to match body width
    const [mx, my] = p(18.057 * scale + 0.2, 18.057 * scale);
    ctx.moveTo(mx, my);
    const [lx, ly] = p(18.057 * scale + 0.2, 0);
    ctx.lineTo(lx, ly);
    // arc: centre (18.057,18.057), r=18.057, from 270° to 0° in local
    // approximate with bezier
    const [c1x,c1y] = p(28.029 * scale + 0.2, 0);
    const [c2x,c2y] = p(36.113 * scale + 0.2, 8.084 * scale);
    const [ex1,ey1] = p(36.113 * scale + 0.2, 18.057 * scale);
    ctx.bezierCurveTo(c1x,c1y, c2x,c2y, ex1,ey1);
    const [c3x,c3y] = p(36.113 * scale + 0.2, 32.029 * scale);
    const [c4x,c4y] = p(26.029 * scale + 0.2, 44.113 * scale);
    const [ex2,ey2] = p(18.057 * scale + 0.2, 44.113 * scale);
    ctx.bezierCurveTo(c3x,c3y, c4x,c4y, ex2,ey2);
    ctx.closePath();
  }

  // 4. Red cap (pie wedge)
  function redCapPath(a, b, c, d, e, f) {
    const p = (x, y) => applyMat(x, y, a, b, c, d, e, f);
    const scale = 0.83; // scale to match body width
    const [mx, my] = p(18.057 * scale + 0.2, 18.057 * scale);
    ctx.moveTo(mx, my);
    const [lx, ly] = p(18.057 * scale + 0.2, 0);
    ctx.lineTo(lx, ly);
    const [c1x,c1y] = p(28.029 * scale + 0.2, 0);
    const [c2x,c2y] = p(36.113 * scale + 0.2, 8.084 * scale);
    const [ex1,ey1] = p(36.113 * scale + 0.2, 18.057 * scale);
    ctx.bezierCurveTo(c1x,c1y, c2x,c2y, ex1,ey1);
    const [c3x,c3y] = p(36.113 * scale + 0.2, 32.029 * scale);
    const [c4x,c4y] = p(26.029 * scale + 0.2, 44.113 * scale);
    const [ex2,ey2] = p(18.057 * scale + 0.2, 44.113 * scale);
    ctx.bezierCurveTo(c3x,c3y, c4x,c4y, ex2,ey2);
    ctx.closePath();
  }

  // 5 & 6. Rectangles — just 4 corners
  function rectPath(a, b, c, d, e, f, w, h) {
    const p = (x, y) => applyMat(x, y, a, b, c, d, e, f);
    const pts = [p(0,0), p(w,0), p(w,h), p(0,h)];
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.lineTo(pts[3][0], pts[3][1]);
    ctx.closePath();
  }

  // SVG matrices for each piece
  const RAm = [0.6058201566434469,0.7956016200363757,-0.795601620036376,0.6058201566434471,156.89454327115595,46.749948457235675];
  const BAm = [-0.8568887533689644,0.5155013718214356,-0.5155013718214356,-0.8568887533689644,241.78908279438832,171.87833947112847];
  const BCm = [0.3425501732458624,-0.7321554814027983,0.8832551114123374,0.4132444530154866,91.43810713359254,86.81832512217552];
  const RCm = [0.18458233186494152,-0.7969022324791276,0.9685275498643307,0.22433501418767698,185.33429480906224,121.98402587640474];
  const BRm = [0.9667070473457006,0.4317048276444321,-0.2860203535920907,0.6404790352020735,97.1318190302078,74.51857262355892];
  const RRm = [1.0332037768762286,0.2310444308959815,-0.15307544782607974,0.6845355684514638,188.5887146670764,108.73010957209424];

  // ── Draw black outlines first ─────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = outlineW * S;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';

  ctx.beginPath(); redArcPath(...RAm);  ctx.stroke();
  ctx.beginPath(); blueArcPath(...BAm); ctx.stroke();
  ctx.beginPath(); blueCapPath(...BCm); ctx.stroke();
  ctx.beginPath(); redCapPath(...RCm);  ctx.stroke();
  ctx.beginPath(); rectPath(...BRm, 33.918, 69.251); ctx.stroke();
  ctx.beginPath(); rectPath(...RRm, 33.918, 69.251); ctx.stroke();
  ctx.restore();

  // ── Draw filled colour pieces ─────────────────────────────────────────────
  const RED  = '#ff3737';
  const BLUE = '#074dff';

  ctx.save();
  ctx.fillStyle = RED;  ctx.beginPath(); redArcPath(...RAm);  ctx.fill();
  ctx.fillStyle = BLUE; ctx.beginPath(); blueArcPath(...BAm); ctx.fill();
  ctx.fillStyle = BLUE; ctx.beginPath(); blueCapPath(...BCm); ctx.fill();
  ctx.fillStyle = RED;  ctx.beginPath(); redCapPath(...RCm);  ctx.fill();
  ctx.fillStyle = BLUE; ctx.beginPath(); rectPath(...BRm, 33.918, 69.251); ctx.fill();
  ctx.fillStyle = RED;  ctx.beginPath(); rectPath(...RRm, 33.918, 69.251); ctx.fill();
  ctx.restore();


  // ── White seam divider ────────────────────────────────────────────────────
  ctx.save();
  const [sx1,sy1] = T(132.0, 181.4);
  const [sx2,sy2] = T(120.7, 215.5);
  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 3 * S;
  ctx.lineCap     = 'round';
  ctx.stroke();
  ctx.restore();

  // ── +/- labels (drawn last) ───────────────────────────────────────────────
  const fontSize = Math.max(6, 22 * S);
  ctx.save();
  ctx.font         = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle    = '#ffffff';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // + on red tip: SVG pos (208,116), rotation -1°
  const [px, py] = T(208, 116);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-1 * Math.PI / 180);
  ctx.fillText('+', 0, 0);
  ctx.restore();

  // − on blue tip: SVG pos (110,83), rotation 32°
  const [mx2, my2] = T(110, 83);
  ctx.save();
  ctx.translate(mx2, my2);
  ctx.rotate(32 * Math.PI / 180);
  ctx.fillText('−', 0, 0);
  ctx.restore();

  ctx.restore(); // inner label save
  ctx.restore(); // outer rotate wrapper
}

function drawHoney(ctx, cx, cy, r) {
  const sides = 6;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#F9D71C';
  ctx.fill();
  ctx.strokeStyle = '#C8A51D';
  ctx.lineWidth = Math.max(0.5, r * 0.18);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawSoil(ctx, cx, cy, r) {
  const sides = 7;
  const jitter  = [0, 0.04, -0.05, 0.03, -0.03, 0.05, -0.02];
  const rJitter = [1, 0.95,  0.98, 0.96,  0.99, 0.94,  0.97];

  // Border
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a  = (Math.PI * 2 / sides) * i - Math.PI / 2 + jitter[i];
    const rr = (r + r * 0.18) * rJitter[i];
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
            : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#4c3713';
  ctx.fill();

  // Fill
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a  = (Math.PI * 2 / sides) * i - Math.PI / 2 + jitter[i];
    const rr = r * rJitter[i];
    i === 0 ? ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
            : ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#664b1d';
  ctx.fill();
}

// Map spriteIndex → draw function  (matches petalTypes.js spriteIndex values)

function drawLeaf(ctx, cx, cy, r) {
  // Leaf drawn from SVG path (original viewBox origin 231.803,166.494,
  // size 15.379×26.687). Visual centre of leaf body ≈ SVG (239.5, 179.5).
  // Scale so the leaf fits within radius r.
  const SVG_CX = 7.7;   // centre in normalised coords (subtract origin first)
  const SVG_CY = 13.0;
  const SVG_SCALE = 13; // normalised units per r

  const s = r / SVG_SCALE;

  // All path coords are already relative to the SVG origin (231.803, 166.494).
  // We shift by (-SVG_CX, -SVG_CY) so the leaf centres on (cx, cy).
  const ox = -SVG_CX;
  const oy = -SVG_CY;
  function p(x, y) { return [cx + (x + ox) * s, cy + (y + oy) * s]; }

  const outlineWidth = 8.0 / SVG_SCALE;            // 8px screen → local units
  const veinWidth    = 7.5 / SVG_SCALE;            // 7.5px screen → local units
  const stemWidth    = Math.max(1, r * 0.15);       // scales with zoom like the rest of the leaf

  ctx.save();

  // ── Stem (drawn first, behind leaf) ────────────────────────────────────
  const [stemSX, stemSY] = p(4.418, 20.366);
  const [stemEX, stemEY] = p(0.374 - 0.8, 26.488);
  ctx.beginPath();
  ctx.moveTo(stemSX, stemSY);
  ctx.bezierCurveTo(
    cx + (3.5  + ox) * s, cy + (22.0 + oy) * s,
    cx + (2.2  + ox) * s, cy + (24.0 + oy) * s,
    stemEX, stemEY
  );
  ctx.strokeStyle = '#008000';
  ctx.lineWidth   = stemWidth;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // ── Leaf body ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(...p(4.061, 19.702));
  ctx.bezierCurveTo(...p(4.061,19.702), ...p(2.552,18.441), ...p(1.579,16.494));
  ctx.bezierCurveTo(...p(1.540,16.417), ...p(1.127,16.149), ...p(1.090,16.069));
  ctx.bezierCurveTo(...p(1.062,16.009), ...p(1.381,16.138), ...p(1.355,16.076));
  ctx.bezierCurveTo(...p(0.923,15.085), ...p(0.652,13.941), ...p(0.775,12.711));
  ctx.bezierCurveTo(...p(0.793,12.535), ...p(0.519,11.251), ...p(0.545,11.079));
  ctx.bezierCurveTo(...p(0.581,10.835), ...p(0.920,11.706), ...p(0.971,11.472));
  ctx.bezierCurveTo(...p(1.268,10.101), ...p(1.798, 8.908), ...p(2.396, 7.909));
  ctx.bezierCurveTo(...p(2.483, 7.764), ...p(2.529, 6.773), ...p(2.618, 6.636));
  ctx.bezierCurveTo(...p(2.693, 6.522), ...p(2.809, 7.261), ...p(2.885, 7.152));
  ctx.bezierCurveTo(...p(3.579, 6.154), ...p(4.303, 5.403), ...p(4.827, 4.918));
  ctx.bezierCurveTo(...p(4.920, 4.832), ...p(5.335, 3.943), ...p(5.462, 3.848));
  ctx.bezierCurveTo(...p(5.618, 3.731), ...p(5.495, 4.407), ...p(5.693, 4.281));
  ctx.bezierCurveTo(...p(6.462, 3.791), ...p(7.509, 3.241), ...p(8.543, 2.734));
  ctx.bezierCurveTo(...p(8.667, 2.673), ...p(9.102, 1.965), ...p(9.226, 1.905));
  ctx.bezierCurveTo(...p(9.406, 1.818), ...p(9.273, 2.381), ...p(9.448, 2.299));
  ctx.bezierCurveTo(...p(10.986, 1.573), ...p(12.287, 1.022), ...p(12.287, 1.022));
  ctx.bezierCurveTo(...p(12.287, 1.022), ...p(12.656, 2.345), ...p(13.057, 3.981));
  ctx.bezierCurveTo(...p(13.089, 4.110), ...p(13.476, 3.686), ...p(13.508, 3.818));
  ctx.bezierCurveTo(...p(13.545, 3.971), ...p(13.263, 4.680), ...p(13.299, 4.836));
  ctx.bezierCurveTo(...p(13.477, 5.597), ...p(13.651, 6.385), ...p(13.790, 7.114));
  ctx.bezierCurveTo(...p(13.840, 7.378), ...p(14.222, 7.004), ...p(14.262, 7.249));
  ctx.bezierCurveTo(...p(14.285, 7.390), ...p(13.971, 8.157), ...p(13.990, 8.290));
  ctx.bezierCurveTo(...p(14.143, 9.366), ...p(14.220,10.398), ...p(14.149,11.402));
  ctx.bezierCurveTo(...p(14.135,11.600), ...p(14.661,11.167), ...p(14.635,11.363));
  ctx.bezierCurveTo(...p(14.615,11.517), ...p(14.045,12.299), ...p(14.017,12.451));
  ctx.bezierCurveTo(...p(13.821,13.514), ...p(13.427,14.553), ...p(12.747,15.587));
  ctx.bezierCurveTo(...p(12.615,15.787), ...p(13.377,15.313), ...p(13.223,15.513));
  ctx.bezierCurveTo(...p(13.083,15.696), ...p(12.029,16.554), ...p(11.869,16.737));
  ctx.bezierCurveTo(...p(11.349,17.332), ...p(10.802,17.822), ...p(10.261,18.226));
  ctx.bezierCurveTo(...p(10.190,18.278), ...p(10.662,18.474), ...p(10.591,18.524));
  ctx.bezierCurveTo(...p(10.475,18.607), ...p(9.817,18.540), ...p(9.702,18.615));
  ctx.bezierCurveTo(...p(7.819,19.835), ...p(6.150,20.050), ...p(6.150,20.050));
  ctx.bezierCurveTo(...p(6.150,20.050), ...p(4.061,19.702), ...p(4.061,19.702));
  ctx.closePath();
  ctx.fillStyle   = '#00C800';
  ctx.fill();
  ctx.strokeStyle = '#008000';
  ctx.lineWidth   = outlineWidth * s;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();

  // ── Central midrib ──────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(...p(10.745, 4.958));
  ctx.bezierCurveTo(
    ...p(10.745, 4.958),
    ...p(8.003,  9.534),
    ...p(8.003, 11.534)
  );
  ctx.bezierCurveTo(
    ...p(8.003, 13.534),
    ...p(5.256, 15.079),
    ...p(5.256, 17.079)
  );
  ctx.strokeStyle = '#008000';
  ctx.lineWidth   = veinWidth * s;
  ctx.lineCap     = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawCentipedeLegs(ctx, cx, cy, r) {
  // Draws animated centipede feet that rotate in movement direction.
  // Used as an accessory on the player.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ctx._legRotation ?? 0);

  const legR    = r * 0.32;    // matches mob
  const legDist = r * 1.08;    // matches mob
  const offsets = [-0.48, 0.48]; // matches mob
  const legPhase = ctx._legPhase ?? 0;

  [-1, 1].forEach(side => {
    offsets.forEach((off, i) => {
      const baseAngle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      const nudge = Math.sin(legPhase + i * 1.6 + (side > 0 ? Math.PI : 0)) * 0.13;
      const a  = baseAngle + off + nudge;
      const lx = Math.cos(a) * legDist;
      const ly = Math.sin(a) * legDist;

      // foot
      ctx.beginPath();
      ctx.arc(lx, ly, legR, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
    });
  });

  // Outline only in icon view, not on player
  if (ctx._isIcon) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPeas(ctx, cx, cy, r) {
  // Four plain circles in a tight 2×2 grid, no highlights.
  const peaR = r * 0.43;
  const off  = peaR * 1.4; // spread spacing

  const positions = [
    [-off, -off],
    [ off, -off],
    [-off,  off],
    [ off,  off],
  ];

  for (const [px, py] of positions) {
    // border
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, peaR + peaR * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#2e7d32';
    ctx.fill();
    // fill
    ctx.beginPath();
    ctx.arc(cx + px, cy + py, peaR, 0, Math.PI * 2);
    ctx.fillStyle = '#66bb6a';
    ctx.fill();
  }
}

function drawPoison(ctx, cx, cy, r) {
  // Dark green circle with toxic bubble dots
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle   = '#2e8b1a';
  ctx.fill();
  ctx.strokeStyle = '#1a5510';
  ctx.lineWidth   = Math.max(1, r * 0.18);
  ctx.stroke();

  // Three bubble highlights
  const dots = [[-0.30, -0.28], [0.22, -0.32], [-0.05, 0.30]];
  for (const [ox, oy] of dots) {
    ctx.beginPath();
    ctx.arc(cx + ox * r, cy + oy * r, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(160, 255, 100, 0.70)';
    ctx.fill();
  }
}


function drawThirdEye(ctx, cx, cy, r) {
  // Black vertical lens with sharp top/bottom points and centered white oval.
  const lensH = r * 2;  // half-height (tip to center)
  const lensW = r;      // control point horizontal bulge

  // Outer black lens — tips at top and bottom, bulges left/right
  ctx.beginPath();
  ctx.moveTo(cx, cy - lensH);
  ctx.bezierCurveTo(cx + lensW, cy - lensH * 0.5, cx + lensW, cy + lensH * 0.5, cx, cy + lensH);
  ctx.bezierCurveTo(cx - lensW, cy + lensH * 0.5, cx - lensW, cy - lensH * 0.5, cx, cy - lensH);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.fill();

  // Centered white oval
  const ovalRy = r * 0.55;
  const ovalRx = ovalRy * 0.71;
  ctx.beginPath();
  ctx.ellipse(cx, cy, ovalRx, ovalRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

export function drawThirdEyeAccessory(ctx, sx, sy, r) {
  // Third eye on forehead - smaller than regular eyes, positioned above eyebrows
  const thirdEyeRx = r * 0.078;  // smaller than normal eyes
  const thirdEyeRy = r * 0.178;  // smaller than normal eyes
  const thirdEyePupilR = r * 0.075;
  const eyeOffsetY = r * 0.21;
  const eyeRy = r * 0.249;
  const browBaseY = sy - eyeOffsetY - eyeRy - r * 0.05;
  
  // Position: center X, above the eyebrow (further up on forehead)
  const teX = sx;
  const teY = browBaseY - r * 0.10//;  // well above the eyebrow

  // Dark iris
  ctx.beginPath();
  ctx.ellipse(teX, teY, thirdEyeRx, thirdEyeRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#212219';
  ctx.fill();
  ctx.closePath();

  // White pupil (centered, doesn't move)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(teX, teY, thirdEyeRx, thirdEyeRy, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(teX, teY, thirdEyePupilR, 0, Math.PI * 2);
  ctx.fillStyle = '#eeeeee';
  ctx.fill();
  ctx.closePath();
  ctx.restore();
}

function drawDiggerEgg(ctx, cx, cy, r) {
  const rx = r * 0.66;
  const ry = r;
  const bw = Math.max(1, r * 0.13);

  const toothCount = 14;
  const toothH  = r * 0.32;
  const toothHW = r * 0.20;

  // Arc-length-uniform t params so teeth are evenly spaced around the ellipse perimeter
  const steps = 3000;
  const lens = [0];
  for (let i = 1; i <= steps; i++) {
    const tm = ((i - 0.5) / steps) * Math.PI * 2;
    lens.push(lens[lens.length - 1] + Math.hypot(-rx * Math.sin(tm), ry * Math.cos(tm)) * (Math.PI * 2 / steps));
  }
  const total = lens[steps];
  const baseParams = [];
  for (let i = 0; i < toothCount; i++) {
    const target = (i / toothCount) * total;
    let lo = 0, hi = steps;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; lens[mid] < target ? lo = mid : hi = mid; }
    const frac = (target - lens[lo]) / ((lens[hi] - lens[lo]) || 1);
    baseParams.push(((lo + frac) / steps) * Math.PI * 2);
  }

  // Rotation driven by ctx._diggerEggRot (set per-frame by world renderer). 0 for static icons.
  const rot = ctx._diggerEggRot ?? 0;

  ctx.save();
  ctx.translate(cx, cy);

  // Teeth — drawn first, behind egg body
  for (const t of baseParams.map(t => t + rot)) {
    const ex =  rx * Math.cos(t);
    const ey =  ry * Math.sin(t);
    const tx_ = -rx * Math.sin(t);
    const ty_ =  ry * Math.cos(t);
    const tLen = Math.hypot(tx_, ty_);
    const tnx = tx_ / tLen;
    const tny = ty_ / tLen;
    let onx =  tny, ony = -tnx;
    if (onx * ex + ony * ey < 0) { onx = -onx; ony = -ony; }

    ctx.beginPath();
    ctx.moveTo(ex - tnx * toothHW, ey - tny * toothHW);
    ctx.lineTo(ex + tnx * toothHW, ey + tny * toothHW);
    ctx.lineTo(ex + onx * toothH,  ey + ony * toothH);
    ctx.closePath();
    ctx.fillStyle = '#000000';
    ctx.fill();
  }

  // Black border ring
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + bw, ry + bw, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();

  // Egg body — digger gray (#8c8c8c matches drawDigger body)
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8c8c8c';
  ctx.fill();

  ctx.restore();
}

function drawHoneycomb(ctx, cx, cy, r) {
  const cellR   = r * 0.52;
  const W       = Math.sqrt(3) * cellR;
  const H       = 2 * cellR;
  const colStep = W;
  const rowStep = H * 0.75;
  const positions = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      positions.push({ x: col * colStep + (row % 2) * (colStep / 2), y: row * rowStep });
    }
  }
  const xs = positions.map(p => p.x);
  const ys = positions.map(p => p.y);
  const groupW = Math.max(...xs) - Math.min(...xs) + W;
  const groupH = Math.max(...ys) - Math.min(...ys) + H;
  const offX = cx - groupW / 2 + W / 2 - Math.min(...xs);
  const offY = cy - groupH / 2 + H / 2 - Math.min(...ys);
  function hex(hcx, hcy, hr) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (Math.PI / 3) * i;
      i === 0 ? ctx.moveTo(hcx + Math.cos(a) * hr, hcy + Math.sin(a) * hr)
              : ctx.lineTo(hcx + Math.cos(a) * hr, hcy + Math.sin(a) * hr);
    }
    ctx.closePath();
  }
  for (const { x, y } of positions) {
    const hcx = x + offX, hcy = y + offY;
    hex(hcx, hcy, cellR);         ctx.fillStyle = '#9a6200'; ctx.fill();
    hex(hcx, hcy, cellR * 0.88); ctx.fillStyle = '#d08800'; ctx.fill();
    hex(hcx, hcy, cellR * 0.68); ctx.fillStyle = '#ffba04'; ctx.fill();
    hex(hcx, hcy, cellR * 0.46); ctx.fillStyle = '#d08800'; ctx.fill();
    hex(hcx, hcy, cellR * 0.30); ctx.fillStyle = '#ffba04'; ctx.fill();
  }
}

function drawAntennae(ctx, cx, cy, r) {
  const antennaR      = r * 0.10;
  const antennaLength = r * 0.85;
  ctx.save();
  ctx.translate(cx, cy - r * 0.6);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = antennaR * 1.2;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(-antennaR * 2, -antennaR * 2);
  ctx.quadraticCurveTo(-antennaLength * 0.6, -antennaLength * 0.8, -antennaLength, -antennaLength * 1.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(antennaR * 2, -antennaR * 2);
  ctx.quadraticCurveTo(antennaLength * 0.6, -antennaLength * 0.8, antennaLength, -antennaLength * 1.2);
  ctx.stroke();
  ctx.fillStyle = '#3d3d3d';
  ctx.beginPath(); ctx.arc(-antennaLength, -antennaLength * 1.2, antennaR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( antennaLength, -antennaLength * 1.2, antennaR, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawOrange(ctx, cx, cy, r) {
  const oranges = [
    { x: cx + r * 0.80, y: cy - r * 0.75, r: r * 0.52 },
    { x: cx - r * 0.55, y: cy + r * 0.25, r: r * 0.52 },
    { x: cx + r * 0.85, y: cy + r * 1.05, r: r * 0.52 },
  ];
  let leafRotations = [-0.5, 0.7, -0.4];
  let leafIndex = 0;
  for (const o of oranges) {
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r + o.r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#a06820';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = '#e8a030';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = Math.max(0.5, o.r * 0.07);
    ctx.stroke();
    // Draw leaf on each orange pellet
    ctx.save();
    ctx.translate(o.x, o.y - o.r * 0.85);
    ctx.rotate(leafRotations[leafIndex]);
    ctx.beginPath();
    ctx.ellipse(0, 0, o.r * 0.42, o.r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e6612';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, o.r * 0.34, o.r * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3db830';
    ctx.fill();
    ctx.restore();
    leafIndex++;
  }
  function drawLeaf(lx, ly, angle, size) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.42, size, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e6612';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.34, size * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3db830';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.75);
    ctx.lineTo(0, size * 0.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = size * 0.07;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
  drawLeaf(cx - r * 0.10, cy - r * 1.00, -0.5, r * 0.30);
  drawLeaf(cx - r * 0.85, cy + r * 0.30,  0.7, r * 0.28);
  drawLeaf(cx + r * 0.70, cy + r * 0.55, -0.4, r * 0.26);
}

function drawMissile(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ctx._missileAngle ?? 0);

  const s = r / 100;

  ctx.beginPath();
  ctx.moveTo(0,    70 * s);
  ctx.lineTo(-55 * s, -50 * s);
  ctx.quadraticCurveTo(0, -70 * s, 55 * s, -50 * s);
  ctx.closePath();

  ctx.fillStyle   = '#cccccc';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = Math.max(1, r * 0.05);
  ctx.lineJoin    = 'round';
  ctx.stroke();

  ctx.restore();
}

export const DRAW_FNS = [
  drawBasic,          // 0
  drawFaster,         // 1
  drawLight,          // 2
  drawPollen,         // 3
  drawRose,           // 4
  drawStinger,        // 5
  drawWeb,            // 6
  drawPoison,         // 7
  drawLeaf,           // 8
  drawCentipedeLegs,  // 9
  drawPeas,           // 10
  drawThirdEye,       // 11
  drawClover,         // 12
  drawWing,           // 13
  drawRice,           // 14
  drawAntEgg,         // 15
  drawDisc,           // 16
  drawCutter,         // 17
  drawDiggerEgg,      // 18
  drawSoil,           // 19
  drawMagnet,         // 20
  drawHoney,          // 21
  drawBeeEgg,         // 22
  drawHoneycomb,      // 23
  drawAntennae,       // 24
  drawOrange,         // 25
  drawMissile,        // 26
];

// ── Individual piece draw functions ───────────────────────────────────────────
// Used when multi-piece petals (ant_egg, orange, peas) are split into
// independent piece-petal entities. Each draws one circle at (cx, cy, r).

function drawAntEggPiece(ctx, cx, cy, r) {
  // Black border ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();
  // Cream fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fffcec';
  ctx.fill();
}

function drawOrangePiece(ctx, cx, cy, r) {
  // Dark border ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#a06820';
  ctx.fill();
  // Orange fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#e8a030';
  ctx.fill();
  // Subtle stroke
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = Math.max(0.5, r * 0.07);
  ctx.stroke();
  // Leaf on piece
  ctx.save();
  ctx.translate(cx, cy - r * 0.85);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.42, r, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1e6612';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.34, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3db830';
  ctx.fill();
  ctx.restore();
}

function drawPeaPiece(ctx, cx, cy, r) {
  // Dark border ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = '#2e7d32';
  ctx.fill();
  // Green fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#66bb6a';
  ctx.fill();
}

/**
 * Draw a single piece-petal circle for multi-piece types.
 * Called by the world renderer when petal.isPiece === true.
 */
export function drawPieceShape(ctx, typeId, cx, cy, r) {
  const pt = PETAL_TYPES[typeId];
  const idx = pt?.spriteIndex ?? 0;
  const scaledR = r * (DRAW_SCALE[idx] ?? 1.0);
  ctx.save();
  const pieceShape = pt?.pieceShape ?? typeId;
  switch (pieceShape) {
    case 'ant_egg': drawAntEggPiece(ctx, cx, cy, scaledR); break;
    case 'orange':  drawOrangePiece(ctx, cx, cy, scaledR); break;
    case 'peas':    drawPeaPiece(ctx, cx, cy, scaledR);    break;
    default:        drawBasic(ctx, cx, cy, scaledR);        break; // safe fallback
  }
  ctx.restore();
}



/**
 * Draw a petal in world-space (orbiting petals, world drops).
 * ctx is the main game canvas 2D context.
 * (cx, cy) is the centre in screen pixels, r is the display radius.
 */
export function drawPetalShape(ctx, typeId, cx, cy, r) {
  const pt = PETAL_TYPES[typeId];
  if (!pt) return;
  const idx = pt.spriteIndex;
  const fn  = DRAW_FNS[idx];
  if (!fn) return;
  ctx.save();
  fn(ctx, cx, cy, r * (DRAW_SCALE[idx] ?? 1.0));
  ctx.restore();
}

/**
 * Draw a petal icon into a <canvas> element for the UI.
 * canvasEl must already have .width / .height set to the physical pixel size
 * (CSS size × devicePixelRatio).
 */
export function drawInventoryIcon(canvasEl, typeId) {
  const pt = PETAL_TYPES[typeId];
  if (!pt) return;

  const pw  = canvasEl.width;
  const ph  = canvasEl.height;
  const ctx = canvasEl.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, pw, ph);

  const idx = pt.spriteIndex;
  const fn  = DRAW_FNS[idx];
  if (!fn) return;

  const cx = pw / 2;

  // Look up per-petal icon overrides (inv / hotbar / drops only).
  // World drawing (drawPetalShape) is completely unaffected.
  const ov      = ICON_OVERRIDES[pt.name] ?? {};
  const ovScale = ov.scale ?? 1.0;
  const ovRot   = (ov.rot ?? 0) * Math.PI / 180;
  // ox/oy are in logical CSS-like units; scale by pw/100 so they feel
  // consistent regardless of the physical canvas resolution.
  const ovOX    = (ov.ox ?? 0) * (pw / 100);
  const ovOY    = (ov.oy ?? 0) * (pw / 100);

  // Measure the name label so we know exactly how much vertical space it takes.
  let fontSize = Math.round(pw * 0.24);
  fontSize = Math.max(8, Math.min(fontSize, 26));
  ctx.font = `bold ${fontSize}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  const textW = ctx.measureText(pt.name).width;
  if (textW > pw - 6) {
    fontSize = Math.max(7, Math.floor(fontSize * (pw - 6) / textW));
    ctx.font = `bold ${fontSize}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  }
  // textTop = y where the name label begins (baseline = ph-1, ascent ≈ fontSize*0.8)
  const textTop  = ph - 1 - fontSize * 0.8;
  const gap      = ph * 0.04;   // small breathing room between petal and name

  // Radius: fill the space above the name, leaving a small gap.
  const availH   = textTop - gap;
  const baseR    = Math.min(pw * 0.46, availH * 0.46) * (DRAW_SCALE[idx] ?? 1.0);
  const r        = baseR * ovScale;

  // Default petal centre: vertically centred in the available space, horizontally centred.
  // Global nudge: shift all petals down toward the name.
  const petalNudgeDown = ph * 0.08;
  const petalCX  = cx + ovOX;
  const petalCY  = availH / 2 + ovOY + petalNudgeDown;

  const ovFlipX = ov.flipX ?? false;

  ctx.save();
  ctx._isIcon = true;  // flag for drawing functions (e.g., centipede_legs)
  if (ovRot !== 0 || ovFlipX) {
    // Transform around the petal's own centre so ox/oy positioning is preserved.
    ctx.translate(petalCX, petalCY);
    if (ovRot !== 0) ctx.rotate(ovRot);
    if (ovFlipX)    ctx.scale(-1, 1);
    ctx.translate(-petalCX, -petalCY);
  }
  fn(ctx, petalCX, petalCY, r);
  ctx._isIcon = false;
  ctx.restore();

  // Name text — font was already computed above; just render it.
  // Global nudge: raise names up from the very bottom edge.
  const nameNudgeUp = ph * 0.10;
  ctx.save();
  ctx.font         = `bold ${fontSize}px "UbuntuCustom", "Ubuntu", Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(pt.name, cx + 0.5, ph - 1 - nameNudgeUp + 0.5);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pt.name, cx, ph - 1 - nameNudgeUp);
  ctx.restore();
}