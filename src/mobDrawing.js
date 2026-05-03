// ── Mob Drawing — florr.io style ─────────────────────────────────────────────
// All mobs are round/compact to match the game's aesthetic.
// SpiderLegs class is included here — you can delete spiderLegs.js.
import { PLAYER_COLOR, PLAYER_BORDER } from './constants.js';

// ── Spider ────────────────────────────────────────────────────────────────────
export function drawSpider(ctx, x, y, r, facing = 0, legPhase = 0, speed = 0) {
  const legLen  = r * 1.3;
  const legW    = r * 0.28;
  const spreads = [-0.55, -0.18, 0.18, 0.55];
  const sideAngle = facing + Math.PI / 2;

  ctx.lineCap = 'round';

  // Left legs — behind body
  spreads.forEach((spread, i) => {
    const ang  = sideAngle + Math.PI + spread;
    const anim = speed > 0.2 ? Math.sin(legPhase + i * 1.1) * 0.10 : 0;
    const a    = ang + anim;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r;
    const ex = x + Math.cos(a) * (r + legLen);
    const ey = y + Math.sin(a) * (r + legLen);
    const cx = (sx + ex) / 2 + Math.cos(a + Math.PI / 2) * r * 0.4;
    const cy = (sy + ey) / 2 + Math.sin(a + Math.PI / 2) * r * 0.4;
    ctx.strokeStyle = '#2a1505';
    ctx.lineWidth   = legW;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
  });

  // Right legs
  spreads.forEach((spread, i) => {
    const ang  = sideAngle + spread;
    const anim = speed > 0.2 ? Math.sin(legPhase * 1.1 + i * 1.1 + 2.0) * 0.10 : 0;
    const a    = ang + anim;
    const sx = x + Math.cos(a) * r;
    const sy = y + Math.sin(a) * r;
    const ex = x + Math.cos(a) * (r + legLen);
    const ey = y + Math.sin(a) * (r + legLen);
    const cx = (sx + ex) / 2 + Math.cos(a - Math.PI / 2) * r * 0.4;
    const cy = (sy + ey) / 2 + Math.sin(a - Math.PI / 2) * r * 0.4;
    ctx.strokeStyle = '#2a1505';
    ctx.lineWidth   = legW;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
  });

  // Body — drawn last so it sits on top of all legs
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle   = '#3d2008';
  ctx.strokeStyle = '#1a0a02';
  ctx.lineWidth   = r * 0.15;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#5a3010';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Bee ───────────────────────────────────────────────────────────────────────
// Oval yellow body with black stripes, antennae, stinger, and gentle wobble.
export function drawBee(ctx, x, y, r, facing = 0, wobblePhase = 0) {
  ctx.save();
  ctx.translate(x, y);

  // Facing: antennae point forward, stinger trails behind.
  // The bee is drawn "pointing up" (antennae at top = -PI/2),
  // so we rotate so that "up" aligns with the facing direction.
  ctx.rotate(facing + Math.PI / 2);

  // Gentle side-to-side wobble — ±15 degrees
  ctx.rotate(Math.sin(wobblePhase) * 0.26);

  const rx = r * 1.18;  // half-width
  const ry = r * 1.55;  // half-height — longer than before

  // Stinger — curved with rounded tip, drawn first so body covers the base
  const beeTipR  = r * 0.07;
  const beeTipCY = ry + r * 0.82 - beeTipR;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.46, ry - r * 0.1);
  ctx.quadraticCurveTo(-r * 0.18, ry + r * 0.55, -beeTipR, beeTipCY);
  ctx.arc(0, beeTipCY, beeTipR, Math.PI, 0, true);
  ctx.quadraticCurveTo( r * 0.18, ry + r * 0.55, r * 0.46, ry - r * 0.1);
  ctx.closePath();
  ctx.fill();

  // Body border
  ctx.fillStyle = '#c8960a';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + r * 0.18, ry + r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#f5cf4b';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3 stripes clipped to body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  const stripeOffsets = [-ry * 0.5, 0, ry * 0.5];
  const stripeH = ry * 0.26;
  for (const sy of stripeOffsets) {
    ctx.fillRect(-rx - 2, sy - stripeH / 2, (rx + 2) * 2, stripeH);
  }
  ctx.restore();

  // Left antenna
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = r * 0.224;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, -ry + r * 0.1);
  ctx.quadraticCurveTo(-r * 0.52, -ry - r * 0.44, -r * 0.656, -r * 0.656 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.656, -r * 0.656 - ry, r * 0.192, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Right antenna
  ctx.beginPath();
  ctx.moveTo(r * 0.22, -ry + r * 0.1);
  ctx.quadraticCurveTo(r * 0.52, -ry - r * 0.44, r * 0.656, -r * 0.656 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.656, -r * 0.656 - ry, r * 0.192, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Queen Bee ─────────────────────────────────────────────────────────────────
// Like drawBee but 1.5x size scaling, slightly bigger stinger, antennae curve inward then flare out.
export function drawQueenBee(ctx, x, y, r, facing = 0, wobblePhase = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);
  ctx.rotate(Math.sin(wobblePhase) * 0.26);

  const rx = r * 1.18;
  const ry = r * 1.55;

  // Stinger — curved, slightly bigger than regular bee
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.46, ry - r * 0.1);
  ctx.quadraticCurveTo(-r * 0.18, ry + r * 0.68, 0, ry + r * 1.05);
  ctx.quadraticCurveTo( r * 0.18, ry + r * 0.68, r * 0.46, ry - r * 0.1);
  ctx.closePath();
  ctx.fill();

  // Body border
  ctx.fillStyle = '#c8960a';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + r * 0.18, ry + r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#f5cf4b';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3 stripes clipped to body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  const stripeOffsets = [-ry * 0.5, 0, ry * 0.5];
  const stripeH = ry * 0.26;
  for (const sy of stripeOffsets) {
    ctx.fillRect(-rx - 2, sy - stripeH / 2, (rx + 2) * 2, stripeH);
  }
  ctx.restore();

  // Left antenna — curves inward then flares out to tip
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = r * 0.224;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.22, -ry + r * 0.1);
  ctx.quadraticCurveTo(-r * 0.10, -ry - r * 0.50, -r * 0.82, -r * 0.82 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.82, -r * 0.82 - ry, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Right antenna — curves inward then flares out to tip
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = r * 0.224;
  ctx.beginPath();
  ctx.moveTo(r * 0.22, -ry + r * 0.1);
  ctx.quadraticCurveTo(r * 0.10, -ry - r * 0.50, r * 0.82, -r * 0.82 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.82, -r * 0.82 - ry, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.restore();
}

// ── Hive ──────────────────────────────────────────────────────────────────────
// Flat-bottom pentagon, rotated 25°, 3 concentric rings + dark centre.
// Drawn at 1.75× the passed radius to appear larger than ant hole.
export function drawHive(ctx, x, y, r) {
  const R     = r * 1.75;      // hive is 1.75× ant hole size
  const sides = 5;
  const tilt  = -Math.PI / 2 + (25 * Math.PI / 180); // flat-bottom + 25° rotation

  function pentagon(radius) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a  = tilt + (i / sides) * Math.PI * 2;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  ctx.save();
  ctx.translate(x, y);

  // Outer ring
  pentagon(R);
  ctx.fillStyle = '#c07a10';
  ctx.fill();
  ctx.strokeStyle = '#3d2500';
  ctx.lineWidth   = R * 0.04;
  ctx.stroke();

  // Mid ring
  pentagon(R * 0.68);
  ctx.fillStyle = '#e8a020';
  ctx.fill();
  ctx.strokeStyle = '#3d2500';
  ctx.lineWidth   = R * 0.035;
  ctx.stroke();

  // Inner ring
  pentagon(R * 0.40);
  ctx.fillStyle = '#f5cf4b';
  ctx.fill();
  ctx.strokeStyle = '#3d2500';
  ctx.lineWidth   = R * 0.03;
  ctx.stroke();

  // Dark centre pentagon
  pentagon(R * 0.18);
  ctx.fillStyle = '#1e1000';
  ctx.fill();
  ctx.strokeStyle = '#3d2500';
  ctx.lineWidth   = R * 0.025;
  ctx.stroke();

  ctx.restore();
}

// ── Hornet ────────────────────────────────────────────────────────────────────
// Compact body — rx * ry proportions are balanced, not stretched.
// stingerProgress: 1 = full stinger, 0 = just fired (regrows 0→1)
export function drawHornet(ctx, x, y, r, facing = 0, wobblePhase = 0, stingerProgress = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);
  ctx.rotate(Math.sin(wobblePhase) * 0.18);

  const rx = r * 0.92;   // slightly slimmer than bee (bee = 1.18)
  const ry = r * 1.35;   // less elongated than before — more natural

  // Stinger — curved, grows out from body base as stingerProgress rises 0→1
  const sp = Math.max(0, Math.min(1, stingerProgress));
  if (sp > 0.02) {
    const hw  = r * 0.38 * sp;
    const tip = ry + r * 0.90 * sp;
    const tipRound = r * 0.04 * sp;  // rounded cap size
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(-hw, ry - r * 0.06);
    ctx.quadraticCurveTo(-hw * 0.38, (ry + tip) * 0.5, -hw * 0.05, tip - tipRound);
    ctx.quadraticCurveTo(0, tip, hw * 0.05, tip - tipRound);  // rounded cap
    ctx.quadraticCurveTo( hw * 0.38, (ry + tip) * 0.5, hw, ry - r * 0.06);
    ctx.closePath();
    ctx.fill();
  }

  // Body border
  ctx.fillStyle = '#c8960a';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx + r * 0.14, ry + r * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#f5cf4b';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3 stripes clipped to body
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  const stripeOffsets = [-ry * 0.48, 0, ry * 0.48];
  const stripeH = ry * 0.25;
  for (const so of stripeOffsets) {
    ctx.fillRect(-rx - 2, so - stripeH / 2, (rx + 2) * 2, stripeH);
  }
  ctx.restore();

  // Antennae
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = r * 0.18;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-r * 0.20, -ry + r * 0.1);
  ctx.quadraticCurveTo(-r * 0.46, -ry - r * 0.44, -r * 0.65, -r * 0.65 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.65, -r * 0.65 - ry, r * 0.155, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(r * 0.20, -ry + r * 0.1);
  ctx.quadraticCurveTo(r * 0.46, -ry - r * 0.44, r * 0.65, -r * 0.65 - ry);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.65, -r * 0.65 - ry, r * 0.155, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Hornet Missile (stinger projectile) ──────────────────────────────────────
// mobR  = the firing hornet's radius (world-scaled) — proportions match the stinger exactly.
// angle = direction of travel (atan2(vy, vx)).
// Tip is at (x,y); body trails behind in the opposite direction.
export function drawMissile(ctx, x, y, mobR, angle) {
  ctx.save();
  ctx.translate(x, y);
  // After rotation: local -y = travel direction (tip at origin, pointing forward)
  ctx.rotate(angle + Math.PI / 2);

  // Exact match to drawHornet stinger: hw = mobR*0.38, length = mobR*0.90
  const halfW = mobR * 0.38;
  const len   = mobR * 0.90;

  // Outer border/glow — curved with rounded tip
  const tipRadius = halfW * 0.15;  // rounded cap size
  ctx.fillStyle = '#3a2800';
  ctx.beginPath();
  ctx.moveTo(-halfW * 1.18, len * 1.06);
  ctx.quadraticCurveTo(-halfW * 0.45, len * 0.5, -halfW * 0.06, tipRadius);
  ctx.quadraticCurveTo(0, -tipRadius * 0.5, halfW * 0.06, tipRadius);  // rounded cap
  ctx.quadraticCurveTo( halfW * 0.45, len * 0.5, halfW * 1.18, len * 1.06);
  ctx.closePath();
  ctx.fill();

  // Main stinger body — curved, rounded tip at (0,0), base trails at (0, +len)
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(-halfW, len);
  ctx.quadraticCurveTo(-halfW * 0.38, len * 0.5, -halfW * 0.04, tipRadius * 0.8);
  ctx.quadraticCurveTo(0, -tipRadius * 0.3, halfW * 0.04, tipRadius * 0.8);  // rounded cap
  ctx.quadraticCurveTo( halfW * 0.38, len * 0.5, halfW, len);
  ctx.closePath();
  ctx.fill();

  // Subtle highlight
  ctx.fillStyle = 'rgba(255,215,60,0.28)';
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.28, len * 0.88);
  ctx.lineTo( halfW * 0.28, len * 0.88);
  ctx.lineTo(0, len * 0.10);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── Ladybug ───────────────────────────────────────────────────────────────────
// spots[] entries must be normalized fractions: { nx, ny, nr }
// where nx/ny are offsets relative to r, and nr is radius relative to r.
// Use makeLadybugSpots() to generate them once at spawn time.
export function makeLadybugSpots(count = 5, seed = Math.random()) {
  let s = seed * 0xffffffff | 0;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  const spots = [];
  const R = 0.92;
  const headCY = -R * 0.78;  // head center y
  const headR  = R * 0.36;   // head radius
  for (let attempt = 0; attempt < 400 && spots.length < count; attempt++) {
    const angle = rand() * Math.PI * 2;
    // bias toward outer area — minimum 35% of body radius out from center
    const dist  = (0.35 + rand() * 0.65) * R * 0.82;
    const nx    = Math.cos(angle) * dist;
    const ny    = Math.sin(angle) * dist + R * 0.08;
    const nr    = 0.15 + rand() * 0.11;
    // Center must be inside body
    if (Math.sqrt(nx * nx + ny * ny) > R * 0.88) continue;
    // Stay off the head
    if (ny < -R * 0.30) continue;
    // Avoid overlapping the head circle
    if (Math.sqrt(nx * nx + (ny - headCY) ** 2) < headR + nr + 0.08) continue;
    // No overlapping — minimum gap between spot edges
    if (spots.some(o => Math.sqrt((o.nx - nx) ** 2 + (o.ny - ny) ** 2) < o.nr + nr + 0.06)) continue;
    spots.push({ nx, ny, nr });
  }
  return spots;
}

export function drawLadybug(ctx, x, y, r, facing = 0, spots = []) {
  const R = r * 0.92;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);

  // Body border
  ctx.fillStyle = '#991010';
  ctx.beginPath();
  ctx.arc(0, 0, R + r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#e03030';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();

  // Dividing line clipped to body
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = '#991010';
  ctx.lineWidth = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(0, R);
  ctx.stroke();
  ctx.restore();

  // Spots — clipped to body so edge spots are cut off cleanly at the border
  // Supports normalized format { nx, ny, nr } only — use makeLadybugSpots()
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1a1a1a';
  for (const s of spots) {
    if (s.nx == null) continue; // skip malformed / old-format spots
    ctx.beginPath();
    ctx.arc(s.nx * r, s.ny * r, s.nr * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Head
  const headCY = -R * 0.78;
  const headR  = R * 0.36;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(0, headCY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Antennae — short stem from head, wide snail-shell spiral with visible ring spacing
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = 'round';

  [-1, 1].forEach(side => {
    // Stem base: sides of head top
    const bx = side * headR * 0.45;
    const by = headCY - headR * 0.6;

    // Short stem — doesn't go far before the spiral starts
    const stemTipX = bx + side * r * 0.18;
    const stemTipY = by - r * 0.30;

    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + side * r * 0.08, by - r * 0.18, stemTipX, stemTipY);
    ctx.stroke();

    // Snail-shell spiral: 1.5 turns — one full loop then half loop inward
    const turns      = 1.5;
    const maxRadius  = r * 0.28;          // outer radius
    const minRadius  = r * 0.03;          // ends near centre but doesn't close
    const steps      = 220;
    const totalAngle = Math.PI * 2 * turns;

    const entryAngle = side > 0 ? Math.PI * 0.75 : Math.PI * 0.25;
    const spiralCX   = stemTipX - Math.cos(entryAngle) * maxRadius;
    const spiralCY   = stemTipY - Math.sin(entryAngle) * maxRadius;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t     = i / steps;
      const angle = entryAngle + side * t * totalAngle;
      const rad   = maxRadius - (maxRadius - minRadius) * t;
      const px    = spiralCX + Math.cos(angle) * rad;
      const py    = spiralCY + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });

  ctx.restore();
}

// ── Centipede ─────────────────────────────────────────────────────────────────
// Two typeIds: 'centipede_head' and 'centipede_body'
// mob.legPhase increments each frame, mob.segIndex is the segment's position index.
export function drawCentipedeBody(ctx, x, y, r, facing = 0, legPhase = 0, segIndex = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);

  const legR    = r * 0.32;
  const legDist = r * 1.08;
  const offsets = [-0.48, 0.48];

  // 2 feet each side, drawn behind body
  [-1, 1].forEach(side => {
    offsets.forEach((off, i) => {
      const baseAngle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      const nudge = Math.sin(legPhase + segIndex * 0.9 + i * 1.6 + (side > 0 ? Math.PI : 0)) * 0.13;
      const a  = baseAngle + off + nudge;
      const lx = Math.cos(a) * legDist;
      const ly = Math.sin(a) * legDist;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(lx, ly, legR, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Body border
  ctx.fillStyle = '#3a6b1a';
  ctx.beginPath();
  ctx.arc(0, 0, r + r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // Body fill
  ctx.fillStyle = '#7ed62a';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawCentipedeHead(ctx, x, y, r, facing = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);

  // Body border + fill — no feet
  ctx.fillStyle = '#3a6b1a';
  ctx.beginPath();
  ctx.arc(0, 0, r + r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7ed62a';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Ram horns — base on front of head (+x = forward), sweep out and curve back
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineCap = 'round';
  [-1, 1].forEach(side => {
    const bx =  r * 0.72;
    const by =  side * r * 0.32;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.bezierCurveTo(
      bx + r * 0.55,  by + side * r * 0.60,
      bx + r * 0.20,  by + side * r * 1.10,
      bx - r * 0.30,  by + side * r * 1.05
    );
    ctx.stroke();
  });

  ctx.restore();
}

// ── Ant helpers (internal) ────────────────────────────────────────────────────

function antCircle(ctx, cx, cy, r, fill, strokeCol, sw) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (strokeCol) {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth   = sw;
    ctx.stroke();
  }
}

function antMandibles(ctx, headY, headR, pincerPhase = 0, color = '#1a1a1a') {
  const hR = headR * 0.82;
  ctx.strokeStyle = color;
  ctx.lineWidth   = headR * 0.32;
  ctx.lineCap     = 'round';
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.translate(side * hR * 0.39, headY - hR * 0.66);
    // Jittery chatter: high frequency, small amplitude
    ctx.rotate(side * (-0.23 + Math.sin(pincerPhase * 4.5) * 0.045));
    ctx.beginPath();
    ctx.moveTo(0,  hR * 0.18);
    ctx.lineTo(0, -hR * 0.62);
    ctx.stroke();
    ctx.restore();
  });
}

function antAntennae(ctx, headY, headR, color = '#1a1a1a') {
  const hR      = headR * 0.82;
  const SPREAD  =  1.02;
  const CURLX   = -0.05;
  const CURLY   =  0.18;
  ctx.strokeStyle = color;
  ctx.lineWidth   = headR * 0.09;
  ctx.lineCap     = 'round';
  [-1, 1].forEach(side => {
    const bx   = side * hR * 0.35;
    const by   = headY - hR * 0.55;
    const mc1x = side * hR * SPREAD * 0.9;
    const mc1y = headY - hR * 1.1;
    const tx   = side * hR * SPREAD;
    const ty   = headY - hR * 1.3;
    const cx2  = side * hR * (SPREAD + CURLX);
    const cy2  = headY - hR * (1.3 + CURLY);
    const ex   = side * hR * (SPREAD + CURLX * 0.5);
    const ey   = headY - hR * (1.3 + CURLY * 1.4);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(mc1x, mc1y, tx, ty);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(cx2, cy2, ex, ey);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ex, ey, headR * 0.10, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Soldier Ant ───────────────────────────────────────────────────────────────
export let soldierAntOffsetX = 0;    // visual aligned with hitbox
export let soldierAntSizeScale = 1;   // tuned size scale
export function setSoldierAntOffsetX(v) { soldierAntOffsetX = v; }
export function setSoldierAntSizeScale(v) { soldierAntSizeScale = v; }

export function drawSoldierAnt(ctx, x, y, r, facing = 0, pincerPhase = 0, wingPhase = 0, friendly = false) {
  // Head and body centered so the hitbox circle (centered at x,y) covers both.
  // hY negative = head forward, bYo positive = body back.
  // Midpoint of head-center and body-center should be ~0 for best hitbox fit.
  const hR  = r * 0.82;
  const hY  = -r * 0.50;   // was -r*0.71 — shifted toward center
  const bR  = r * 0.60;
  const bYo =  r * 0.32;   // was r*0.10 — shifted to keep midpoint ~0

  // Friendly pets use the same colour palette as the player
  const outerColor  = friendly ? PLAYER_BORDER  : '#3d3d3d';
  const outerBorder = friendly ? '#a88800'       : '#1a1a1a';  // slightly darker than PLAYER_BORDER
  const innerColor  = friendly ? PLAYER_COLOR    : '#606060';

  ctx.save();
  ctx.translate(x + soldierAntOffsetX, y);
  ctx.scale(soldierAntSizeScale, soldierAntSizeScale);
  ctx.rotate(facing + Math.PI / 2);

  antMandibles(ctx, hY, r, pincerPhase, outerColor, outerBorder);

  // Body
  antCircle(ctx, 0, bYo, bR, outerColor, outerBorder, r * 0.18);
  antCircle(ctx, 0, bYo, bR * 0.62, innerColor, null, 0);

  // Wings — rotate from attachment point on body sides for natural flapping
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = friendly ? '#ffe090' : '#c0c0c0';
  [-1, 1].forEach(side => {
    const flapAngle = -side * (0.21 + Math.sin(wingPhase) * 0.15);
    ctx.save();
    ctx.translate(side * bR * 0.43, r * 0.06);
    ctx.rotate(flapAngle);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 0.22, r * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // Head
  antCircle(ctx, 0, hY, hR, outerColor, outerBorder, r * 0.18);
  antCircle(ctx, 0, hY, hR * 0.62, innerColor, null, 0);

  antAntennae(ctx, hY, r, outerColor);

  ctx.restore();
}

// ── Worker Ant ────────────────────────────────────────────────────────────────
// Same as soldier ant but without wings.
export function drawWorkerAnt(ctx, x, y, r, facing = 0, pincerPhase = 0) {
  const hR  = r * 0.82;
  const hY  = -r * 0.71;
  const bR  = r * 0.60;
  const bYo = r * 0.10;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);

  antMandibles(ctx, hY, r, pincerPhase);

  // Body
  antCircle(ctx, 0, bYo, bR, '#3d3d3d', '#1a1a1a', r * 0.18);
  antCircle(ctx, 0, bYo, bR * 0.62, '#606060', null, 0);

  // Head
  antCircle(ctx, 0, hY, hR, '#3d3d3d', '#1a1a1a', r * 0.18);
  antCircle(ctx, 0, hY, hR * 0.62, '#606060', null, 0);

  antAntennae(ctx, hY, r);

  ctx.restore();
}

// ── Baby Ant ──────────────────────────────────────────────────────────────────
// Head and mandibles only — centered at origin so hitbox matches.
export function drawBabyAnt(ctx, x, y, r, facing = 0, pincerPhase = 0) {
  const hR = r * 0.82;
  const hY = 0; // centered at origin so hitbox aligns

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);

  antMandibles(ctx, hY, r, pincerPhase);

  // Head — solid, no inner highlight
  antCircle(ctx, 0, hY, hR, '#3d3d3d', '#1a1a1a', r * 0.18);

  ctx.restore();
}

// ── Queen Ant ─────────────────────────────────────────────────────────────────
// Three body segments (head, thorax, abdomen), wings between head and thorax.
// Values locked from editor: wingY=33, wingX=30, wingW=19, wingH=60 (base r=72).
export function drawQueenAnt(ctx, x, y, r, facing = 0, pincerPhase = 0, wingPhase = 0) {
  const scale = r / 72;
  const headY = -48 * scale;
  const headR =  43 * scale;
  const bodyY =   1 * scale;
  const bodyR =  53 * scale;
  const abdY  =  50 * scale;
  const abdR  =  63 * scale;
  const wingY =  33 * scale;
  const wingX =  30 * scale;
  const wingW =  19 * scale;
  const wingH =  60 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing + Math.PI / 2);

  // Abdomen (back, drawn first)
  antCircle(ctx, 0, abdY, abdR, '#3d3d3d', '#1a1a1a', 11 * scale);
  antCircle(ctx, 0, abdY, abdR * 0.64, '#606060', null, 0);

  // Thorax / body
  antCircle(ctx, 0, bodyY, bodyR, '#3d3d3d', '#1a1a1a', 11 * scale);
  antCircle(ctx, 0, bodyY, bodyR * 0.58, '#606060', null, 0);

  // Wings — attach at thorax sides, extend outward
  ctx.save();
  ctx.globalAlpha = 0.39;
  ctx.fillStyle = '#c0c0c0';
  [-1, 1].forEach(side => {
    const flapAngle = -side * (-0.35 + Math.sin(wingPhase) * 0.3);
    ctx.save();
    // Attach at thorax: X = 0.1 × bodyR (toward center), Y = -0.75 × bodyR (forward on thorax)
    ctx.translate(side * bodyR * 0.1, bodyR * -0.75);
    ctx.rotate(flapAngle);
    // Wing ellipse: width 55px, height 126px (for r=72), with taper
    const wingFullW = 55 * scale;
    const wingFullH = 126 * scale;
    const wingTaper = 0.73;
    ctx.beginPath();
    ctx.ellipse(0, 0, (wingFullW / 2) * wingTaper, wingFullH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // Mandibles — jittery chatter: high frequency, tiny amplitude
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 13 * scale;
  ctx.lineCap     = 'round';
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.translate(side * 15 * scale, -82 * scale);
    ctx.rotate(side * (-13.2 * Math.PI / 180 + Math.sin(pincerPhase * 4.5) * 0.045));
    ctx.beginPath();
    ctx.moveTo(0,  8 * scale);
    ctx.lineTo(0, -28 * scale);
    ctx.stroke();
    ctx.restore();
  });

  // Head — on top of wings
  antCircle(ctx, 0, headY, headR, '#3d3d3d', '#1a1a1a', 11 * scale);
  antCircle(ctx, 0, headY, headR * 0.63, '#606060', null, 0);

  // Antennae
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = 5 * scale;
  ctx.lineCap     = 'round';
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.moveTo(side * 14 * scale, -72 * scale);
    ctx.quadraticCurveTo(side * 38 * scale, -95 * scale, side * 44 * scale, -110 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 44 * scale, -110 * scale);
    ctx.quadraticCurveTo(side * 42 * scale, -120 * scale, side * 38 * scale, -126 * scale);
    ctx.stroke();
    antCircle(ctx, side * 38 * scale, -126 * scale, 5 * scale, '#1a1a1a', null, 0);
  });

  ctx.restore();
}

// ── Ant Egg ───────────────────────────────────────────────────────────────────
// Simple white circle with the ant double-circle style. No facing needed.
export function drawAntEgg(ctx, x, y, r) {
  antCircle(ctx, x, y, r,        '#e8e8e8', '#1a1a1a', r * 0.16);
  antCircle(ctx, x, y, r * 0.65, '#ffffff', null, 0);
}

// ── Ant Hole ──────────────────────────────────────────────────────────────────
// Three concentric brown rings, darkening toward the centre. No facing needed.
export function drawAntHole(ctx, x, y, r) {
  antCircle(ctx, x, y, r,        '#b8750a', null, 0);
  antCircle(ctx, x, y, r * 0.68, '#7a4d08', null, 0);
  antCircle(ctx, x, y, r * 0.38, '#3d2500', null, 0);
}

// ── Digger ────────────────────────────────────────────────────────────────────
// Circular body with rotating cutter ring and expressive face
export function drawDigger(ctx, x, y, r, state = 'neutral', cutterRot = 0, eyeAngle = 0, mob = null) {
  ctx.save();
  ctx.translate(x, y);

  // Digger is 15% bigger
  r = r * 1.15;

  const ringR = r * 1.42;
  const toothCount = 14;
  const toothH = r * 0.26;
  const toothHW = (2 * Math.PI * ringR / toothCount) * 0.38;

  // === CUTTER (draw FIRST so it's UNDER the ring) ===
  ctx.save();
  ctx.rotate(cutterRot);

  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(0.5, r * 0.02);

  for (let i = 0; i < toothCount; i++) {
    const a = (i / toothCount) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);

    ctx.beginPath();
    ctx.moveTo(-toothHW, -ringR);
    ctx.lineTo(toothHW, -ringR);
    ctx.lineTo(0, -(ringR + toothH));
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();

  // === RING (draw AFTER so it sits on top of triangles) ===
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2);
  ctx.arc(0, 0, ringR - r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#111';
  ctx.fill('evenodd');
  // Draw a crisp black ring outline to hide any seam between triangles and body
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();

  // === BODY (extended to reach cutter) ===
  const bodyR = ringR - r * 0.22; // Body reaches exactly to inner edge of ring
  ctx.beginPath();
  ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
  ctx.fillStyle = mob?.bodyColor ?? '#8c8c8c';
  // Fill body only (remove thick stroke to avoid gray outline/gap)
  ctx.fill();

  // === FACE ===
  // Use bodyR as the face reference radius so features scale with the visible
  // body circle, not the outer cutter ring (r). This also means the face never
  // changes size when the camera zooms because bodyR is already zoom-scaled.
  const faceR = bodyR;

  // Eye parameters — mirror player's drawFlowerFace proportions exactly
  const eyeOffsetX = faceR * 0.285;
  const eyeOffsetY = faceR * 0.21;   // eyes sit ABOVE centre (negative Y in canvas)
  const eyeRx      = faceR * 0.128;
  const eyeRy      = faceR * 0.249;
  const pupilR     = faceR * 0.124;
  const pupilDrift = faceR * 0.09;

  // Smooth animated pupil offset supplied by the mob update loop.
  // Values are stored in world units (proportional to mob.drawRadius), so we
  // must scale by zoom (r / drawRadius) to get correct screen-space offsets.
  const zoom      = (mob?.drawRadius && mob.drawRadius > 0) ? r / mob.drawRadius : 1;
  const animPdx      = (mob?.animPdx      ?? 0)             * zoom;
  const animPdy      = (mob?.animPdy      ?? 0)             * zoom;
  const animCpOffset = (mob?.animCpOffset != null ? mob.animCpOffset : faceR * 0.14) * zoom;

  // Eyes are above the body centre (negative Y) to match the player face
  const eyes = [
    { cx: -eyeOffsetX, cy: -eyeOffsetY },
    { cx:  eyeOffsetX, cy: -eyeOffsetY },
  ];

  // Draw eyes with smooth pupil movement
  for (const eye of eyes) {
    // Dark iris
    ctx.fillStyle = '#212219';
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // White pupil clipped inside iris
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#eeeeee';
    ctx.beginPath();
    ctx.arc(eye.cx + animPdx, eye.cy + animPdy, pupilR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Animated mouth — control point driven by mob.animCpOffset (set by update loop)
  const mouthY  =  faceR * 0.38;   // below centre
  const mouthHW =  faceR * 0.25;
  const cpY     =  mouthY + animCpOffset;

  ctx.strokeStyle = '#212219';
  ctx.lineWidth   = faceR / 15;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(-mouthHW, mouthY);
  ctx.quadraticCurveTo(0, cpY, mouthHW, mouthY);
  ctx.stroke();

  // === EYEBROWS (single downward-pointing triangle for angry look) ===
  // browT is smoothly animated 0→1 by the mob update loop (see mobs.js).
  // Fallback for HUD icon (mob=null): instant on/off based on state string.
  const browColor = mob?.bodyColor ?? '#8c8c8c';
  const browBaseY = -eyeOffsetY - eyeRy + faceR * 0.10;
  const browT     = (mob?.browT != null) ? mob.browT : (state === 'angry' ? 1 : 0);

  if (browT > 0.01) {
    // Slide down from faceR*0.22 above browBaseY → browBaseY as browT goes 0→1.
    // When fully down (browT=1), eyebrow covers the top of the eyes for angry expression.
    // Alpha also fades in simultaneously for a smooth appearance.
    const slideOffset = (1 - browT) * faceR * 0.22;
    const browY = browBaseY - slideOffset;

    ctx.save();
    ctx.globalAlpha = browT;
    ctx.fillStyle = browColor;

    // Single downward-pointing triangle in the middle
    const browW = faceR * 0.45;
    const browH = faceR * 0.18;
    ctx.beginPath();
    ctx.moveTo(-browW, browY - browH);      // left top
    ctx.lineTo(browW, browY - browH);       // right top
    ctx.lineTo(0, browY + browH);           // point down
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

// ── Beekeeper ─────────────────────────────────────────────────────────────────
// Round body with a rotating black saw cutter ring and expressive face.
// cutterRot = current rotation angle of the cutter (radians), updated each frame.
// Mouth animates from circle (neutral) to frown (angry) based on browT.
export function drawBeekeeper(ctx, x, y, r, state = 'neutral', cutterRot = 0, eyeAngle = 0, mob = null) {
  ctx.save();
  ctx.translate(x, y);

  const ringR      = r * 1.38;
  const ringThick  = r * 0.20;
  const bodyR      = ringR - ringThick;
  const toothCount = 14;
  const toothH     = r * 0.18;
  const toothHW    = (2 * Math.PI * ringR / toothCount) * 0.48;

  ctx.save();
  ctx.rotate(cutterRot);

  // Ring band as annulus (outer circle minus inner hole) — full black
  ctx.beginPath();
  ctx.arc(0, 0, ringR, 0, Math.PI * 2, false);
  ctx.arc(0, 0, bodyR, 0, Math.PI * 2, true);
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');

  // Teeth — base overlaps ring by 2px to eliminate any gap
  for (let i = 0; i < toothCount; i++) {
    const a = (i / toothCount) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-toothHW, -(ringR - ringThick * 0.12));
    ctx.lineTo( toothHW, -(ringR - ringThick * 0.12));
    ctx.lineTo(0, -(ringR + toothH));
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Body fill
  ctx.beginPath();
  ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
  ctx.fillStyle = '#F0A830';
  ctx.fill();

  // Body outline inset so it doesn't bleed into cutter ring
  ctx.beginPath();
  ctx.arc(0, 0, bodyR - r * 0.035, 0, Math.PI * 2);
  ctx.strokeStyle = '#A86820';
  ctx.lineWidth = r * 0.07;
  ctx.stroke();

  // Face
  const faceR    = bodyR;

  // Eye parameters — larger oval eyes for better visibility
  const eyeOffX  = faceR * 0.32;
  const eyeOffY  = faceR * 0.30;
  const eyeRx    = faceR * 0.30;
  const eyeRy    = faceR * 0.42;
  const pupilRx  = faceR * 0.12;
  const pupilRy  = faceR * 0.16;
  const mouthY   = faceR * 0.47;
  const mouthR   = faceR * 0.08;

  // Smooth animated pupil offsets (set by mobs.js AI loop, world units → screen)
  const zoom_    = (mob?.drawRadius && mob.drawRadius > 0) ? bodyR / mob.drawRadius : 1;
  const animPdx  = (mob?.animPdx ?? 0) * zoom_;
  const animPdy  = (mob?.animPdy ?? 0) * zoom_;

  const eyes = [
    { cx: -eyeOffX, cy: -eyeOffY },
    { cx:  eyeOffX, cy: -eyeOffY },
  ];

  for (const eye of eyes) {
    // Dark iris oval
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ellipse pupil clipped inside iris (can drift to the edge)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(eye.cx + animPdx, eye.cy + animPdy, pupilRx, pupilRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Mouth animation — dot fades OUT first, then frown fades IN
  // browT: 0 = neutral, 1 = fully angry (driven by mobs.js)
  const browT = (mob?.browT != null) ? mob.browT : (state === 'angry' ? 1 : 0);

  // Phase split: dot gone by browT=0.45, frown fully in by browT=1.0
  const dotAlpha   = Math.max(0, 1 - browT / 0.45);
  const frownAlpha = Math.max(0, (browT - 0.45) / 0.55);

  if (dotAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(0, mouthY, mouthR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (frownAlpha > 0) {
    const mouthHW  = faceR * 0.25;
    const cpOffset = -faceR * 0.20 * frownAlpha;   // deepen frown as it appears
    ctx.save();
    ctx.globalAlpha = frownAlpha;
    ctx.strokeStyle = '#111';
    ctx.lineWidth   = faceR * 0.072;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-mouthHW, mouthY);
    ctx.quadraticCurveTo(0, mouthY + cpOffset, mouthHW, mouthY);
    ctx.stroke();
    ctx.restore();
  }

  // ── Eyebrows — downward-pointing triangle, same colour as body (#F0A830)
  // Invisible when neutral (same colour = camouflaged), slides in when angry.
  // browT drives both the slide-down and the alpha so they appear together.
  if (browT > 0.01) {
    const browBaseY  = -eyeOffY - eyeRy + faceR * 0.10;
    const slideOff   = (1 - browT) * faceR * 0.22;
    const browY      = browBaseY - slideOff;
    const browW      = faceR * 0.45;
    const browH      = faceR * 0.18;

    ctx.save();
    ctx.globalAlpha = browT;
    ctx.fillStyle   = '#F0A830';   // same as body — camouflaged but still casts shadow
    ctx.beginPath();
    ctx.moveTo(-browW, browY - browH);   // left top
    ctx.lineTo( browW, browY - browH);   // right top
    ctx.lineTo(0,      browY + browH);   // point down (angry V)
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// ── Main dispatch ─────────────────────────────────────────────────────────────
// Call once per frame per mob.  dt = delta time in ms.
// For ladybugs: generate mob.spots once at spawn with makeLadybugSpots(count, seed).
// Spots are normalized (fractions of r) so they scale correctly with the mob.
export function drawMob(ctx, mob, x, y, scaledRadius = mob.radius) {
  const r = scaledRadius;
  switch (mob.typeId) {

    case 'bee':
      drawBee(ctx, x, y, r, mob.facing ?? 0, mob.wobblePhase ?? 0);
      break;

    case 'queen_bee':
      drawQueenBee(ctx, x, y, r * 1.5, mob.facing ?? 0, mob.wobblePhase ?? 0);
      break;

    case 'beehive':
      drawHive(ctx, x, y, r);
      break;

    case 'hornet':
      drawHornet(ctx, x, y, r, mob.facing ?? 0, mob.wobblePhase ?? 0, mob.stingerProgress ?? 1);
      break;

    case 'ladybug':
      if (!mob.spots || mob.spots.length === 0 || mob.spots[0].nx == null)
        mob.spots = makeLadybugSpots(5, mob.id ? mob.id * 0.0001 : Math.random());
      drawLadybug(ctx, x, y, r, mob.facing ?? 0, mob.spots);
      break;

    case 'centipede_head':
      drawCentipedeHead(ctx, x, y, r, mob.facing ?? 0);
      break;

    case 'centipede_body':
      drawCentipedeBody(ctx, x, y, r, mob.facing ?? 0, mob.legPhase ?? 0, mob.segIndex ?? 0);
      break;

    case 'spider':
      drawSpider(ctx, x, y, r, mob.facing ?? 0, mob.legPhase ?? 0, mob.speed);
      break;

    case 'soldier_ant':
      drawSoldierAnt(ctx, x, y, r, mob.facing ?? 0, mob.pincerPhase ?? 0, mob.wingPhase ?? 0, mob.isFriendlyPet ?? false);
      break;

    case 'worker_ant':
      drawWorkerAnt(ctx, x, y, r, mob.facing ?? 0, mob.pincerPhase ?? 0);
      break;

    case 'baby_ant':
      drawBabyAnt(ctx, x, y, r, mob.facing ?? 0, mob.pincerPhase ?? 0);
      break;

    case 'queen_ant':
      drawQueenAnt(ctx, x, y, r, mob.facing ?? 0, mob.pincerPhase ?? 0, mob.wingPhase ?? 0);
      break;

    case 'ant_egg':
      drawAntEgg(ctx, x, y, r);
      break;

    case 'ant_hole':
      drawAntHole(ctx, x, y, r);
      break;

    case 'beekeeper':
      drawBeekeeper(ctx, x, y, r, mob.state ?? 'neutral', mob.cutterRot ?? 0, mob.eyeAngle ?? 0, mob);
      break;

    case 'digger':
      drawDigger(ctx, x, y, r, mob.state ?? 'neutral', mob.cutterRot ?? 0, mob.eyeAngle ?? 0, mob);
      break;

    default:
      ctx.fillStyle   = mob.color   || '#aaa';
      ctx.strokeStyle = mob.border  || '#555';
      ctx.lineWidth   = r * 0.10;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
  }

}