import { petalInstances, damagePetal, hotbar } from './petals.js';
import { mobs, missiles, getMobStats, alertChainByMob }               from './mobs.js';
import { player }                                    from './player.js';
import { spawnDrop, spawnWebField, pollenEntities, spawnPollenEntity, honeycombEntities, spawnHoneycombEntity } from './drops.js';
import { PLAYER_MASS, PLAYER_RADIUS, PLAYER_BASE_BODY_DAMAGE, RARITIES } from './constants.js';
import { spawnDamage }                               from './damagePopups.js';
import { PETAL_TYPES }                               from './petalTypes.js';
import { inputState }                                from './inputState.js';
import { zoom }                                      from './camera.js';

// hitCooldowns removed: every collision now deals damage immediately
const poisonedMobs = new Map(); // mobId → { dps, timer }
// Player poison state
let playerPoison = { dps: 0, timer: 0 };
const COLLISION_EPS = 2.0; // allow small separation tolerance for contact checks (px)

/** Returns the total fraction of damage blocked by equipped disc tiers (capped at 1). */
function getDiscBlock() {
  let block = 0;
  for (const typeId of hotbar) {
    if (!typeId) continue;
    const pt = PETAL_TYPES[typeId];
    if (pt?.damageBlock) block += pt.damageBlock;
  }
  return Math.min(1, block);
}

/** Returns total player body DPS: base + sum of equipped cutter tier bonuses. */
function getPlayerBodyDamage() {
  let total = PLAYER_BASE_BODY_DAMAGE;
  for (const typeId of hotbar) {
    if (!typeId) continue;
    const pt = PETAL_TYPES[typeId];
    if (pt?.bodyDamage) total += pt.bodyDamage;
  }
  return total;
}

// ── Tiered drop rate system ──────────────────────────────────────────────────
// Each rate table is an array of 14 entries (one per mob tier 0..13).
// Each entry is an array of [petalTierIndex, weight] pairs — null means no drop.
// Weights are normalised during rolling so they don't need to sum to exactly 1.

// Standard slot-A rates (first listed petal for most mobs)
const DR_A = [
  [[0,70],[1,30]],               // 0 Common
  [[0,55],[1,45]],               // 1 Unusual
  [[0,10],[1,30],[2,60]],        // 2 Rare
  [[2,70],[3,30]],               // 3 Epic
  [[3,85],[4,15]],               // 4 Legendary
  [[4,35],[3,65]],               // 5 Mythical
  [[4,5],[5,92],[6,3]],          // 6 Ultra
  [[5,85],[6,15]],               // 7 Super
  [[6,28],[5,67]],               // 8 Radiant
  [[7,73],[6,27]],               // 9 Mystic
  [[8,60],[7,40]],               // 10 Runic
  [[9,44],[8,56]],               // 11 Seraphic
  [[10,32],[9,68]],              // 12 Umbral
  [[11,24],[10,76]],             // 13 Impracticality
];
// Standard slot-B (second petal, differs only at Ultra: 3/92/5)
const DR_B = DR_A.map((r,i) => i===6 ? [[4,3],[5,92],[6,5]] : r);
// Standard slot-C (third petal, differs only at Ultra: 4/92/4)
const DR_C = DR_A.map((r,i) => i===6 ? [[4,4],[5,92],[6,4]] : r);

// Bee Stinger — slightly tweaked values throughout
const DR_STINGER_BEE = [
  [[0,60],[1,40]],
  [[0,48],[1,47],[2,5]],
  [[0,8],[1,27],[2,65]],
  [[2,65],[3,35]],
  [[3,82],[4,18]],
  [[4,32],[3,68]],
  [[4,4],[5,91],[6,5]],
  [[5,83],[6,17]],
  [[6,25],[5,75]],
  [[7,70],[6,30]],
  [[8,57],[7,43]],
  [[9,42],[8,58]],
  [[10,30],[9,70]],
  [[11,22],[10,78]],
];

// Ant Egg from Queen Ant / Queen Bee
const DR_ANT_EGG_QUEEN = [
  [[0,50],[1,45],[2,5]],
  [[1,60],[2,35],[3,5]],
  [[2,65],[3,30],[4,5]],
  [[2,80],[3,20]],
  [[3,90],[4,10]],
  [[4,55],[3,45]],
  [[4,10],[5,88],[6,2]],
  [[5,90],[6,10]],
  [[6,20],[5,80]],
  [[7,80],[6,20]],
  [[8,68],[7,32]],
  [[9,52],[8,48]],
  [[10,40],[9,60]],
  [[10,45],[11,55]],
];

// Ant Egg from Ant Hole
const DR_ANT_EGG_HOLE = [
  [[0,55],[1,40],[2,5]],
  [[1,55],[2,38],[3,7]],
  [[2,60],[3,33],[4,7]],
  [[2,75],[3,22],[4,3]],
  [[3,87],[4,12],[5,1]],
  [[4,52],[3,48]],
  [[4,8],[5,90],[6,2]],
  [[5,88],[6,12]],
  [[6,22],[5,78]],
  [[7,77],[6,23]],
  [[8,63],[7,37]],
  [[9,48],[8,52]],
  [[10,36],[9,64]],
  [[10,43],[11,57]],
];

// Bee Egg (Beehive, Digger shares identical table; Queen Bee also same)
const DR_BEE_EGG = [
  [[0,50],[1,45],[2,5]],
  [[1,60],[2,35],[3,5]],
  [[2,65],[3,30],[4,5]],
  [[2,80],[3,20]],
  [[3,90],[4,10]],
  [[4,55],[3,45]],
  [[4,10],[5,88],[6,2]],
  [[5,90],[6,10]],
  [[6,18],[5,82]],
  [[7,80],[6,20]],
  [[8,68],[7,32]],
  [[9,52],[8,48]],
  [[10,40],[9,60]],
  [[10,45],[11,55]],
];

// Digger Egg (same as Bee Egg)
const DR_DIGGER_EGG = DR_BEE_EGG;

// Magnet from Ant Hole (starts at Unusual, not Common)
const DR_MAGNET_HOLE = [
  [[1,70],[2,30]],
  [[1,55],[2,40],[3,5]],
  [[2,65],[3,30],[4,5]],
  [[2,80],[3,20]],
  [[3,90],[4,10]],
  [[4,55],[3,45]],
  [[4,10],[5,88],[6,2]],
  [[5,90],[6,10]],
  [[6,20],[5,80]],
  [[7,80],[6,20]],
  [[8,68],[7,32]],
  [[9,52],[8,48]],
  [[10,40],[9,60]],
  [[10,45],[11,55]],
];

// Third Eye from Spider — does NOT drop at mob tiers 0-5
const DR_THIRD_EYE = [
  null, null, null, null, null, null, // no drop Common→Mythical
  [[5,99],[6,1]],           // 6 Ultra
  [[5,68],[6,32]],          // 7 Super
  [[6,20],[5,80]],          // 8 Radiant
  [[7,78],[6,22]],          // 9 Mystic
  [[8,65],[7,35]],          // 10 Runic
  [[9,50],[8,50]],          // 11 Seraphic
  [[10,38],[9,62]],         // 12 Umbral
  [[10,45],[11,55]],        // 13 Impracticality
];

// ── Rolling helpers ──────────────────────────────────────────────────────────

function _rollTier(table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [t, w] of table) { if ((r -= w) <= 0) return t; }
  return table[table.length - 1][0];
}

function _tieredId(baseId, tier) {
  if (tier === 0) return baseId;
  const suffix = RARITIES[tier].toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${baseId}_${suffix}`;
}

/** Roll a tiered petal ID for the given base petal + mob tier. Returns null if no drop. */
function rollDropId(baseId, rateTable, mobTier) {
  const rates = rateTable[mobTier];
  if (!rates) return null;
  return _tieredId(baseId, _rollTier(rates));
}

// ── Spawn helpers ────────────────────────────────────────────────────────────

function spawnAllDrops(x, y, dropTypes) {
  for (let i = 0; i < dropTypes.length; i++) {
    const angle = (Math.PI * 2 * i) / dropTypes.length;
    const d = 58;
    spawnDrop(x + Math.cos(angle) * d, y + Math.sin(angle) * d, dropTypes[i]);
  }
}

/** Resolve an array of {baseId, rateTable} entries at mob's tier, then scatter drops. */
function spawnTieredDrops(x, y, drops, mobTier) {
  const ids = drops.map(({baseId, rateTable}) => rollDropId(baseId, rateTable, mobTier))
                   .filter(id => id !== null);
  spawnAllDrops(x, y, ids);
}

// ── Main drop dispatcher ─────────────────────────────────────────────────────

// ── Public drop-table query (used by mob tooltip to show drop chances) ────────
const MOB_DROP_TABLE = {
  soldier_ant:    [{ baseId: 'wing',         rateTable: DR_A }],
  worker_ant:     [{ baseId: 'leaf',         rateTable: DR_A }],
  baby_ant:       [{ baseId: 'light',        rateTable: DR_A }, { baseId: 'leaf', rateTable: DR_B }, { baseId: 'rice', rateTable: DR_C }],
  queen_ant:      [{ baseId: 'leaf',         rateTable: DR_A }, { baseId: 'wing', rateTable: DR_B }, { baseId: 'ant_egg', rateTable: DR_ANT_EGG_QUEEN }],
  spider:         [{ baseId: 'faster',       rateTable: DR_A }, { baseId: 'web', rateTable: DR_A }, { baseId: 'third_eye', rateTable: DR_THIRD_EYE }],
  centipede_head: [{ baseId: 'leaf',         rateTable: DR_A }, { baseId: 'peas', rateTable: DR_B }, { baseId: 'centipede_legs', rateTable: DR_C }],
  centipede_body: [{ baseId: 'leaf',         rateTable: DR_A }, { baseId: 'peas', rateTable: DR_B }, { baseId: 'centipede_legs', rateTable: DR_C }],
  ant_hole:       [{ baseId: 'soil',         rateTable: DR_A }, { baseId: 'ant_egg', rateTable: DR_ANT_EGG_HOLE }, { baseId: 'magnet', rateTable: DR_MAGNET_HOLE }],
  digger:         [{ baseId: 'disc',         rateTable: DR_A }, { baseId: 'cutter', rateTable: DR_B }, { baseId: 'digger_egg', rateTable: DR_DIGGER_EGG }],
  beehive:        [{ baseId: 'honeycomb',    rateTable: DR_B }, { baseId: 'bee_egg', rateTable: DR_BEE_EGG }],
  bee:            [{ baseId: 'stinger',      rateTable: DR_STINGER_BEE }, { baseId: 'pollen', rateTable: DR_B }],
  hornet:         [{ baseId: 'missile',      rateTable: DR_A }, { baseId: 'antennae', rateTable: DR_B }, { baseId: 'orange', rateTable: DR_C }],
  beekeeper:      [{ baseId: 'disc',         rateTable: DR_B }, { baseId: 'cutter', rateTable: DR_C }],
  queen_bee:      [{ baseId: 'pollen',       rateTable: DR_A }, { baseId: 'honeycomb', rateTable: DR_B }, { baseId: 'stinger', rateTable: DR_C }, { baseId: 'bee_egg', rateTable: DR_BEE_EGG }],
  ladybug:        [{ baseId: 'rose',         rateTable: DR_A }, { baseId: 'light', rateTable: DR_B }],
};

/**
 * Returns an array of { typeId, chance } for the given mob type + tier.
 * Each entry is a possible petal drop with its probability (0–1).
 */
/**
 * Returns grouped drop slots for the given mob type + tier.
 * Each slot = { variants: [{ typeId, chance }, ...] } — one slot per drop row.
 * Variants are the different possible rarities for that drop slot.
 */
export function getMobDropTable(typeId, tier) {
  const entries = MOB_DROP_TABLE[typeId];
  if (!entries) return [];
  const t = tier ?? 0;
  const slots = [];
  for (const { baseId, rateTable } of entries) {
    const rates = rateTable[t];
    if (!rates) continue;
    const total = rates.reduce((s, [, w]) => s + w, 0);
    const variants = rates.map(([petalTier, weight]) => {
      const chance = weight / total;
      const petalTypeId = petalTier === 0 ? baseId
        : `${baseId}_${RARITIES[petalTier].toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      return { typeId: petalTypeId, chance };
    });
    slots.push({ variants });
  }
  return slots;
}

function spawnMobDrops(mob) {
  const x = mob.x, y = mob.y;
  const t = mob.tier ?? 0;

  // ── Mob Gallery: record the kill ──────────────────────────────────────────
  if (typeof window.__mobGalRecordKill === 'function' && !mob.isFriendlyPet) {
    window.__mobGalRecordKill(mob.typeId, t);
  }

  switch (mob.typeId) {
    case 'soldier_ant':
      // Wing (clover ignored — not in use)
      spawnTieredDrops(x, y, [
        { baseId: 'wing', rateTable: DR_A },
      ], t);
      break;

    case 'worker_ant':
      // Leaf (corn ignored — not in game)
      spawnTieredDrops(x, y, [
        { baseId: 'leaf', rateTable: DR_A },
      ], t);
      break;

    case 'baby_ant':
      spawnTieredDrops(x, y, [
        { baseId: 'light', rateTable: DR_A },
        { baseId: 'leaf',  rateTable: DR_B },
        { baseId: 'rice',  rateTable: DR_C },
      ], t);
      break;

    case 'queen_ant':
      spawnTieredDrops(x, y, [
        { baseId: 'leaf',    rateTable: DR_A             },
        { baseId: 'wing',    rateTable: DR_B             },
        { baseId: 'ant_egg', rateTable: DR_ANT_EGG_QUEEN },
      ], t);
      break;

    case 'spider':
      // faster + web share identical rates; Third Eye only drops at tier 6+
      spawnTieredDrops(x, y, [
        { baseId: 'faster',    rateTable: DR_A         },
        { baseId: 'web',       rateTable: DR_A         },
        { baseId: 'third_eye', rateTable: DR_THIRD_EYE },
      ], t);
      break;

    case 'centipede_head':
    case 'centipede_body':
      spawnTieredDrops(x, y, [
        { baseId: 'leaf',           rateTable: DR_A },
        { baseId: 'peas',           rateTable: DR_B },
        { baseId: 'centipede_legs', rateTable: DR_C },
      ], t);
      break;

    case 'ant_hole':
      spawnTieredDrops(x, y, [
        { baseId: 'soil',    rateTable: DR_A            },
        { baseId: 'ant_egg', rateTable: DR_ANT_EGG_HOLE },
        { baseId: 'magnet',  rateTable: DR_MAGNET_HOLE  },
      ], t);
      break;

    case 'digger':
      spawnTieredDrops(x, y, [
        { baseId: 'disc',       rateTable: DR_A         },
        { baseId: 'cutter',     rateTable: DR_B         },
        { baseId: 'digger_egg', rateTable: DR_DIGGER_EGG},
      ], t);
      break;

    case 'beehive':
      // Honey ignored; Honeycomb was slot-B, Bee Egg special
      spawnTieredDrops(x, y, [
        { baseId: 'honeycomb', rateTable: DR_B      },
        { baseId: 'bee_egg',   rateTable: DR_BEE_EGG},
      ], t);
      break;

    case 'bee':
      spawnTieredDrops(x, y, [
        { baseId: 'stinger', rateTable: DR_STINGER_BEE },
        { baseId: 'pollen',  rateTable: DR_B           },
      ], t);
      break;

    case 'hornet':
      spawnTieredDrops(x, y, [
        { baseId: 'missile',  rateTable: DR_A },
        { baseId: 'antennae', rateTable: DR_B },
        { baseId: 'orange',   rateTable: DR_C },
      ], t);
      break;

    case 'beekeeper':
      // Honey ignored; Disc was slot-B, Cutter slot-C
      spawnTieredDrops(x, y, [
        { baseId: 'disc',   rateTable: DR_B },
        { baseId: 'cutter', rateTable: DR_C },
      ], t);
      break;

    case 'queen_bee':
      // Pollen(A), Honeycomb(B), Stinger(C), Honey ignored, Bee Egg special
      spawnTieredDrops(x, y, [
        { baseId: 'pollen',    rateTable: DR_A      },
        { baseId: 'honeycomb', rateTable: DR_B      },
        { baseId: 'stinger',   rateTable: DR_C      },
        { baseId: 'bee_egg',   rateTable: DR_BEE_EGG},
      ], t);
      break;

    case 'ladybug':
      // Copying soldier ant slot structure (DR_A / DR_B)
      spawnTieredDrops(x, y, [
        { baseId: 'rose',  rateTable: DR_A },
        { baseId: 'light', rateTable: DR_B },
      ], t);
      break;

    default:
      // ant_egg mob and anything else — no drop
      break;
  }
}

export function updateCombat(dt) {
  if (player.dead) return;

  // ── Compute player armor from all active petals ───────────────────────────
  player.armor = 0;
  for (const p of petalInstances) {
    if (p.state === 'active' && !p.roseState) {
      const pt = PETAL_TYPES[p.typeId];
      if (pt?.armor) player.armor += pt.armor;
    }
  }

  // ── Leaf passive heal ─────────────────────────────────────────────────────
  for (const p of petalInstances) {
    if (p.state !== 'active') continue;
    const pt = PETAL_TYPES[p.typeId];
    if (!pt?.passiveHeal) continue;
    player.hp = Math.min(player.maxHp, player.hp + pt.passiveHeal * (dt / 1000));
  }

  // ── Petal → mob hits ───────────────────────────────────────────────────────
  // Roses in approaching/waiting don't fight. Pollen petals spawn entities instead of doing contact damage.
  const activePetals = petalInstances.filter(p => p.state === 'active' && !p.roseState && !PETAL_TYPES[p.typeId]?.dropsPollen);

  for (const petal of activePetals) {
    if (isNaN(petal.worldX) || isNaN(petal.worldY)) {
      console.warn('Petal missing world position:', petal);
      continue;
    }

    for (const mob of mobs) {
      if (mob.dead) continue;
      // Player petals should not damage friendly diggers, beekeepers, or ant pets
      if (mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;

      const _hAngle1 = (mob.facing || 0) + Math.PI / 2;
      const _swayX1  = mob.swayHitX || 0;
      const _hOx1 = ((mob.hitOffsetX||0) + _swayX1) * Math.cos(_hAngle1) - (mob.hitOffsetY||0) * Math.sin(_hAngle1);
      const _hOy1 = ((mob.hitOffsetX||0) + _swayX1) * Math.sin(_hAngle1) + (mob.hitOffsetY||0) * Math.cos(_hAngle1);
      const mobHitX = mob.x + _hOx1;
      const mobHitY = mob.y + _hOy1;

      // Each petal (including individual piece-petals) is tested as a single circle.
      const hitPoints = [{ wx: petal.worldX, wy: petal.worldY, r: petal.radius }];

      for (const hp of hitPoints) {
        const dx   = hp.wx - mobHitX;
        const dy   = hp.wy - mobHitY;
        const dist = Math.hypot(dx, dy);

        if (dist < hp.r + mob.radius) {
          const armorReduction = mob.armor ?? 0;
          const dmg = Math.max(1, petal.damage - armorReduction);
          mob.hp -= dmg;
          damagePetal(petal, mob.damage);
          mob.alerted = true;
          if (mob.isCentipede) alertChainByMob(mob);  // instantly alert whole chain, no tick delay
          spawnDamage(mob.x, mob.y, dmg, '#ff4444', mob.radius, mob);

          const _pt = PETAL_TYPES[petal.typeId];

          // Poison: apply / refresh DoT using petal-type poisonDps
          if (_pt?.poisonDps) {
            poisonedMobs.set(mob.id, { dps: _pt.poisonDps, timer: 3000 });
          }

          // Stinger: one-shot — destroy the petal immediately after hitting
          if (_pt?.oneShot) {
            damagePetal(petal, petal.hp + 1);
          }

          if (mob.hp <= 0) {
            mob.dead = true;
            spawnMobDrops(mob);
          }
          break; // one piece hit is enough per petal-mob pair per frame
        }
      }
    }
  }

  // hitCooldowns removed: no decay loop needed

  // ── Poison DoT tick ────────────────────────────────────────────────────────
  for (const [mobId, poison] of poisonedMobs) {
    poison.timer -= dt;
    if (poison.timer <= 0) { poisonedMobs.delete(mobId); continue; }
    const mob = mobs.find(m => m.id === mobId && !m.dead);
    if (!mob) { poisonedMobs.delete(mobId); continue; }
    const tick = poison.dps * (dt / 1000);
    mob.hp -= tick;
    spawnDamage(mob.x, mob.y, tick, '#aa44ff', mob.radius, mob);
    if (mob.hp <= 0) {
      mob.dead = true;
      spawnMobDrops(mob);
      poisonedMobs.delete(mobId);
    }
  }

  // ── Player poison tick
  if (playerPoison.timer > 0) {
    playerPoison.timer -= dt;
    const tick = playerPoison.dps * (dt / 1000);
    player.hp -= tick;
    spawnDamage(player.x, player.y, tick, '#aa44ff', player.radius, player);
    if (player.hp <= 0) player.dead = true;
    if (playerPoison.timer <= 0) { playerPoison.dps = 0; playerPoison.timer = 0; }
  }

  
  // ── Mob -> player contact damage & knockback ───────────────────────────────
  for (const mob of mobs) {
    if (mob.dead) continue;
    if (mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;  // friendly — never damage player

    const _hAngle2 = (mob.facing || 0) + Math.PI / 2;
    const _swayX2  = mob.swayHitX || 0;
    const _hOx2 = ((mob.hitOffsetX||0) + _swayX2) * Math.cos(_hAngle2) - (mob.hitOffsetY||0) * Math.sin(_hAngle2);
    const _hOy2 = ((mob.hitOffsetX||0) + _swayX2) * Math.sin(_hAngle2) + (mob.hitOffsetY||0) * Math.cos(_hAngle2);
    const dx   = player.x - (mob.x + _hOx2);
    const dy   = player.y - (mob.y + _hOy2);
    const dist = Math.hypot(dx, dy);
    const minD = player.radius + mob.radius;

    if (dist < minD && dist > 0.001) {
      const rawDamage = mob.contactDps * (dt / 1000);
      const damage = rawDamage * (1 - getDiscBlock());
      if (damage > 0) { /* rose now heals on spawn, not on damage */ }
      player.hp = Math.max(0, player.hp - damage);
      if (player.hp <= 0) player.dead = true;
      mob.alerted = true;
      if (mob.isCentipede) alertChainByMob(mob);

      // Player body damage — always on, boosted by cutter accessories
      const bodyDps  = getPlayerBodyDamage();
      const bodyDmg  = Math.max(1, bodyDps * (dt / 1000) - (mob.armor ?? 0));
      mob.hp -= bodyDmg;
      spawnDamage(mob.x, mob.y, Math.round(bodyDmg), '#ffdd44', mob.radius, mob);
      if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
      // Spider contact applies poison DoT to player
      if (mob.typeId === 'spider') {
        const s = getMobStats(mob.typeId, mob.tier);
        if (s && s.poisonDps) { playerPoison.dps = s.poisonDps; playerPoison.timer = 3000; }
      }

      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = minD - dist;
      player.x += nx * overlap * 0.5;
      player.y += ny * overlap * 0.5;

      const impulse = 3.5 + mob.contactDps * 0.18;
      player.vx += nx * impulse;
      player.vy += ny * impulse;

      const maxKB = 14;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > maxKB) {
        player.vx = (player.vx / speed) * maxKB;
        player.vy = (player.vy / speed) * maxKB;
      }
    }
  }

  // ── Friendly mob -> player collision (no damage, just physics) ────────────────
  for (const mob of mobs) {
    if (mob.dead || (mob.typeId !== 'digger' && mob.typeId !== 'beekeeper')) continue;

    const dx   = player.x - mob.x;
    const dy   = player.y - mob.y;
    const dist = Math.hypot(dx, dy);
    const minD = player.radius + mob.radius;

    if (dist < minD && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = minD - dist;
      const total = PLAYER_MASS + mob.mass;
      const pFrac = mob.mass / total;    // heavier mob → player pushed more
      const mFrac = PLAYER_MASS / total; // heavier mob → mob pushed less
      player.x += nx * overlap * pFrac;
      player.y += ny * overlap * pFrac;
      mob.x -= nx * overlap * mFrac;
      mob.y -= ny * overlap * mFrac;

      const impulse = 2.5;
      player.vx += nx * impulse * pFrac * 2;
      player.vy += ny * impulse * pFrac * 2;
      mob.x -= nx * impulse * mFrac * 0.6;
      mob.y -= ny * impulse * mFrac * 0.6;
    }
  }

  // ── Digger -> mob contact damage (digger fights on the player's side) ──────
  for (const digger of mobs) {
    if (digger.dead || digger.typeId !== 'digger') continue;
    for (const mob of mobs) {
      if (mob.dead || mob.id === digger.id || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
      const dx   = mob.x - digger.x;
      const dy   = mob.y - digger.y;
      const dist = Math.hypot(dx, dy);
      const minD = digger.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const dmg = Math.max(1, digger.contactDps * (dt / 1000) * 20 - (mob.armor ?? 0));
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#ff4444', mob.radius, mob);
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
      }
    }
  }

  // ── Mob -> digger contact damage (mobs can damage diggers)
  for (const mob of mobs) {
    if (mob.dead || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
    for (const digger of mobs) {
      if (digger.dead || digger.typeId !== 'digger' || digger.id === mob.id) continue;
      const dx = digger.x - mob.x;
      const dy = digger.y - mob.y;
      const dist = Math.hypot(dx, dy);
      const minD = digger.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const armorReduction = digger.armor ?? 0;
        const dmg2 = Math.max(1, mob.contactDps * (dt / 1000) * 20 - armorReduction);
        digger.hp -= dmg2;
        mob.alerted = true;
        spawnDamage(digger.x, digger.y, dmg2, '#ff4444', digger.radius, digger);
        // Spider contact applies poison to diggers
        if (mob.typeId === 'spider') {
          const s = getMobStats(mob.typeId, mob.tier);
          if (s && s.poisonDps) { poisonedMobs.set(digger.id, { dps: s.poisonDps, timer: 3000 }); }
        }
        if (digger.hp <= 0) { digger.dead = true; spawnMobDrops(digger); }
      }
    }
  }

  // ── Beekeeper -> mob contact damage (beekeeper fights on the player's side) ──────
  for (const beekeeper of mobs) {
    if (beekeeper.dead || beekeeper.typeId !== 'beekeeper') continue;
    for (const mob of mobs) {
      if (mob.dead || mob.id === beekeeper.id || mob.typeId === 'beekeeper' || mob.typeId === 'digger' || mob.isFriendlyPet) continue;
      const dx   = mob.x - beekeeper.x;
      const dy   = mob.y - beekeeper.y;
      const dist = Math.hypot(dx, dy);
      const minD = beekeeper.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const dmg = Math.max(1, beekeeper.contactDps * (dt / 1000) * 20 - (mob.armor ?? 0));
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#ff4444', mob.radius, mob);
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
      }
    }
  }

  // ── Mob -> beekeeper contact damage (mobs can damage beekeepers)
  for (const mob of mobs) {
    if (mob.dead || mob.typeId === 'beekeeper' || mob.typeId === 'digger' || mob.isFriendlyPet) continue;
    for (const beekeeper of mobs) {
      if (beekeeper.dead || beekeeper.typeId !== 'beekeeper' || beekeeper.id === mob.id) continue;
      const dx = beekeeper.x - mob.x;
      const dy = beekeeper.y - mob.y;
      const dist = Math.hypot(dx, dy);
      const minD = beekeeper.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const armorReduction = beekeeper.armor ?? 0;
        const dmg2 = Math.max(1, mob.contactDps * (dt / 1000) * 20 - armorReduction);
        beekeeper.hp -= dmg2;
        mob.alerted = true;
        spawnDamage(beekeeper.x, beekeeper.y, dmg2, '#ff4444', beekeeper.radius, beekeeper);
        // Spider contact applies poison to beekeepers
        if (mob.typeId === 'spider') {
          const s = getMobStats(mob.typeId, mob.tier);
          if (s && s.poisonDps) { poisonedMobs.set(beekeeper.id, { dps: s.poisonDps, timer: 3000 }); }
        }
        if (beekeeper.hp <= 0) { beekeeper.dead = true; spawnMobDrops(beekeeper); }
      }
    }
  }

  // ── Friendly ant pet → enemy mob contact damage ────────────────────────────
  for (const pet of mobs) {
    if (pet.dead || !pet.isFriendlyPet) continue;
    for (const mob of mobs) {
      if (mob.dead || mob.id === pet.id) continue;
      if (mob.isFriendlyPet) continue;                            // don't fight fellow pets
      if (mob.typeId === 'digger' || mob.typeId === 'beekeeper') continue;  // friendly — skip
      const dx   = mob.x - pet.x;
      const dy   = mob.y - pet.y;
      const dist = Math.hypot(dx, dy);
      const minD = pet.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const dmg = Math.max(1, pet.contactDps * (dt / 1000) * 20 - (mob.armor ?? 0));
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#ff4444', mob.radius, mob);
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
      }
    }
  }

  // ── Enemy mob → friendly ant pet contact damage ─────────────────────────────
  for (const mob of mobs) {
    if (mob.dead || mob.isFriendlyPet) continue;
    if (mob.typeId === 'digger' || mob.typeId === 'beekeeper') continue;
    for (const pet of mobs) {
      if (pet.dead || !pet.isFriendlyPet || pet.id === mob.id) continue;
      const dx   = pet.x - mob.x;
      const dy   = pet.y - mob.y;
      const dist = Math.hypot(dx, dy);
      const minD = pet.radius + mob.radius;
      if (dist < minD + COLLISION_EPS && dist > 0.001) {
        const armorReduction = pet.armor ?? 0;
        const dmg2 = Math.max(1, mob.contactDps * (dt / 1000) * 20 - armorReduction);
        pet.hp -= dmg2;
        mob.alerted = true;
        spawnDamage(pet.x, pet.y, dmg2, '#ff4444', pet.radius, pet);
        // Spider contact applies poison to friendly pets
        if (mob.typeId === 'spider') {
          const s = getMobStats(mob.typeId, mob.tier);
          if (s && s.poisonDps) { poisonedMobs.set(pet.id, { dps: s.poisonDps, timer: 3000 }); }
        }
        if (pet.hp <= 0) { pet.dead = true; }   // no drops; death handled by petal reload cycle
      }
    }
  }

  // ── Missile → player contact damage ───────────────────────────────────────
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (m.dead) continue;

    // Collide with friendly mobs first (diggers and beekeepers)
    for (const mob of mobs) {
      if (mob.dead || (mob.typeId !== 'digger' && mob.typeId !== 'beekeeper')) continue;
      const ddx = mob.x - m.x;
      const ddy = mob.y - m.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd < mob.radius + m.radius && dd > 0.001) {
        const armorReduction = mob.armor ?? 0;
        const dmg = Math.max(1, m.damage - armorReduction);
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#ff4444', mob.radius, mob);
        m.dead = true;
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
        break;
      }
    }

    if (m.dead) continue;

    const dx   = player.x - m.x;
    const dy   = player.y - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist < player.radius + m.radius && dist > 0.001) {
      const armorReduction = player.armor ?? 0;
      const rawDmg = Math.max(1, m.damage - armorReduction);
      const dmg = rawDmg * (1 - getDiscBlock());
      player.hp -= dmg;
      spawnDamage(player.x, player.y, Math.round(dmg), '#ff4444', player.radius, player);
      if (player.hp <= 0) player.dead = true;
      // Knockback in missile travel direction
      const nx = dx / dist, ny = dy / dist;
      const impulse = 4.0 + m.damage * 0.002;
      player.vx += nx * impulse; player.vy += ny * impulse;
      const maxKB = 16;
      const spd = Math.hypot(player.vx, player.vy);
      if (spd > maxKB) { player.vx = (player.vx/spd)*maxKB; player.vy = (player.vy/spd)*maxKB; }
      m.dead = true;
    }
  }

  // ── Petal → missile hits ───────────────────────────────────────────────────
  for (const petal of activePetals) {
    if (isNaN(petal.worldX) || isNaN(petal.worldY)) continue;
    for (const m of missiles) {
      if (m.dead) continue;
      // Each petal (including individual piece-petals) is tested as a single circle.
      const hitPoints = [{ wx: petal.worldX, wy: petal.worldY, r: petal.radius }];
      for (const hp of hitPoints) {
        const dx   = hp.wx - m.x;
        const dy   = hp.wy - m.y;
        const dist = Math.hypot(dx, dy);
        if (dist < hp.r + m.radius) {
          m.hp -= Math.max(1, petal.damage - (m.armor ?? 0));
          damagePetal(petal, m.damage);
          if (m.hp <= 0) m.dead = true;
          break; // one piece hit per missile per frame is enough
        }
      }
    }
  }
  // ── Rose movement logic ───────────────────────────────────────────────────
  // After spawning: wait 0.5s ('spawn_wait'), then if player is below max HP
  // move to the player body ('approaching' over 350ms), wait 500ms ('waiting'),
  // heal the player, then reload.
  for (const p of petalInstances) {
    if (!p.roseState) continue;
    const pt = PETAL_TYPES[p.typeId];

    if (p.roseState === 'spawn_wait') {
      p.roseTimer -= dt;
      if (p.roseTimer <= 0) {
        if (player.hp < player.maxHp) {
          // Player is hurt — move in to heal
          p.roseState  = 'approaching';
          p.roseTimer  = 350;
          p.roseStartX = p.worldX;
          p.roseStartY = p.worldY;
        } else {
          // Player is at full HP — orbit normally until next reload cycle
          p.roseState = null;
        }
      }
    } else if (p.roseState === 'approaching') {
      p.roseTimer -= dt;
      const progress = Math.min(1, 1 - p.roseTimer / 350);
      const ease = 1 - Math.pow(1 - progress, 3);
      const dirX = p.roseStartX - player.x;
      const dirY = p.roseStartY - player.y;
      const len  = Math.hypot(dirX, dirY) || 1;
      const edgeX = player.x + (dirX / len) * PLAYER_RADIUS;
      const edgeY = player.y + (dirY / len) * PLAYER_RADIUS;
      p.worldX = p.roseStartX + (edgeX - p.roseStartX) * ease;
      p.worldY = p.roseStartY + (edgeY - p.roseStartY) * ease;
      if (p.roseTimer <= 0) {
        p.roseState = 'waiting';
        p.roseTimer = 500;
      }
    } else if (p.roseState === 'waiting') {
      p.roseTimer -= dt;
      if (p.roseTimer <= 0) {
        player.hp = Math.min(player.maxHp, player.hp + pt.healAmount);
        p.roseState   = null;
        p.state       = 'reloading';
        p.reloadTimer = pt.reloadTime;
        p.hp          = 0;
      }
    }
  }

  // ── Pollen petal state machine ────────────────────────────────────────────
  // pre_drop → wait 0.5s after reload
  // ready    → fires while held; no re-click required
  // watching → entity is live; petal orbits as placeholder until entity dies/expires
  for (const p of petalInstances) {
    const pt = PETAL_TYPES[p.typeId];
    if (!pt?.dropsPollen || p.state !== 'active') continue;

    // pre_drop: count down, then fall through to ready check in same frame
    if (p.pollenState === 'pre_drop') {
      p.pollenTimer -= dt;
      if (p.pollenTimer > 0) continue; // still waiting
      p.pollenState = 'ready';
      // fall through intentionally ↓
    }

    if (p.pollenState === 'ready') {
      // Fires while held — no click required, no re-click required
      if (inputState.expand || inputState.retract) {
        const entity = spawnPollenEntity(p.worldX, p.worldY, p.maxHp, p.damage, p.radius);
        p.pollenEntityId = entity.id;
        p.pollenState    = 'watching';
      }
      continue;
    }

    if (p.pollenState === 'watching') {
      // When entity dies or timer expires, send petal to normal reload
      const alive = pollenEntities.some(e => e.id === p.pollenEntityId && !e.dead);
      if (!alive) {
        p.pollenState    = null;
        p.pollenEntityId = null;
        p.state          = 'reloading';
        p.hp             = 0;
        p.reloadTimer    = pt.reloadTime;
      }
    }
  }

  // ── Pollen entity → mob hits (DPS on contact, entity pushed by mobs — massless) ──
  for (const pe of pollenEntities) {
    if (pe.dead) continue;
    for (const mob of mobs) {
      if (mob.dead || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
      const dx   = pe.x - mob.x;
      const dy   = pe.y - mob.y;
      const dist = Math.hypot(dx, dy);
      if (dist < pe.radius + mob.radius && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        // Pollen is massless — push it fully out of overlap, mob doesn't move
        const overlap = pe.radius + mob.radius - dist;
        pe.x += nx * overlap;
        pe.y += ny * overlap;
        // Add velocity impulse to pollen entity in push direction
        const impulse = 2.5 + mob.contactDps * 0.04;
        pe.vx += nx * impulse;
        pe.vy += ny * impulse;
        // Pollen damages mob (DPS)
        const dmg = Math.max(0.1, pe.damage * (dt / 1000) - (mob.armor ?? 0));
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#d8e786', mob.radius, mob);
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
        // Mob damages pollen (DPS, no knockback to mob)
        pe.hp -= mob.contactDps * (dt / 1000);
        if (pe.hp <= 0) pe.dead = true;
      }
    }
  }


  // ── Honeycomb petal state machine ──────────────────────────────────────────
  // pre_drop → ready → (drop + immediately start cooldown)
  for (const p of petalInstances) {
    const pt = PETAL_TYPES[p.typeId];
    if (!pt?.isHoneycomb || p.state !== 'active') continue;

    if (p.honeycombState === 'pre_drop') {
      p.honeycombTimer -= dt;
      if (p.honeycombTimer > 0) continue;
      p.honeycombState = 'ready';
    }

    if (p.honeycombState === 'ready') {
      // Drop when player attacks (expand) — petal immediately goes on cooldown
      if (inputState.expand) {
        spawnHoneycombEntity(p.worldX, p.worldY, pt.honeycombHp, pt.attractRange, pt.tier ?? 0);
        p.honeycombState    = null;
        p.honeycombEntityId = null;
        p.state             = 'reloading';
        p.hp                = 0;
        p.reloadTimer       = pt.reloadTime;
      }
    }
  }

  // ── Honeycomb entity: attract mobs + absorb ramming damage ─────────────────
  for (const hc of honeycombEntities) {
    if (hc.dead) continue;
    for (const mob of mobs) {
      if (mob.dead || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
      // Only attract mobs up to one tier above the honeycomb
      if ((mob.tier ?? 0) > hc.tier + 1) continue;
      const dx   = hc.x - mob.x;
      const dy   = hc.y - mob.y;
      const dist = Math.hypot(dx, dy);
      if (dist < hc.attractRange) {
        mob.honeycombTargetId = hc.id;
      }
      // Mob contact: mob rams honeycomb — pushes it (massless), mob unaffected
      if (dist < hc.radius + mob.radius + 2 && dist > 0.001) {
        // Resolve overlap: push honeycomb away from mob (mob is unaffected)
        const overlap = (hc.radius + mob.radius) - dist;
        const nx = dx / dist, ny = dy / dist;
        hc.x += nx * overlap;
        hc.y += ny * overlap;
        // Give honeycomb an impulse in the push direction
        const impulse = 2.5 + mob.speed * 0.3;
        hc.vx += nx * impulse;
        hc.vy += ny * impulse;
        // Deal damage to honeycomb
        const dmg = mob.contactDps * (dt / 1000);
        hc.hp -= dmg;
        if (hc.hp <= 0) { hc.dead = true; break; }
      }
    }
  }

  // Clear honeycombTargetId from mobs whose target entity is gone
  for (const mob of mobs) {
    if (mob.honeycombTargetId == null) continue;
    const hc = honeycombEntities.find(e => e.id === mob.honeycombTargetId);
    if (!hc || hc.dead) mob.honeycombTargetId = null;
  }

  // ── Missile petal firing ──────────────────────────────────────────────────
  // After the 0.5s pre_fire wait, fire when player is attacking (expand).
  const PLAYER_MISSILE_SPEED = 18; // px per frame (~1080 px/s at 60fps)
  for (const p of petalInstances) {
    const pt = PETAL_TYPES[p.typeId];
    if (!pt?.isMissilePetal || p.state !== 'active') continue;
    if (p.missileState !== 'pre_fire' || p.missileTimer > 0) continue;
    if (!inputState.expand) continue; // only fire when attacking

    // Aim at the nearest hostile mob WITHIN visual range; fall back to player's movement direction
    let fireAngle = player.moveAngle ?? 0;
    let nearestDist = Infinity;
    const visualRange = 600 / Math.max(0.1, zoom); // world-units visible to player
    for (const mob of mobs) {
      if (mob.dead || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
      const d = Math.hypot(mob.x - player.x, mob.y - player.y);
      if (d < nearestDist && d <= visualRange) {
        nearestDist = d;
        fireAngle = Math.atan2(mob.y - player.y, mob.x - player.x);
      }
    }

    // The petal ITSELF becomes the projectile — detach from orbit and fly
    p.state        = 'flying';
    p.flyLifetime  = 3500;
    p.vx           = Math.cos(fireAngle) * PLAYER_MISSILE_SPEED;
    p.vy           = Math.sin(fireAngle) * PLAYER_MISSILE_SPEED;
    p.flyAngle     = fireAngle;
    p.hitMobIds    = new Set();
    p.missileState = null;
  }

  // ── Peas petal firing ─────────────────────────────────────────────────────
  // When attacking, pea pieces fire in two opposite directions.
  // The cluster's orbital angle (player→cluster-center) defines the axis;
  // pieces 0 & 1 go outward along that axis, pieces 2 & 3 go the opposite way.
  const PEAS_SPEED = 13; // px per frame
  if (inputState.expand) {
    // Group active pea pieces by slot so each cluster fires as a unit.
    const peaSlots = new Map(); // slotIdx → [piece, ...]
    for (const p of petalInstances) {
      const pt = PETAL_TYPES[p.typeId];
      if (!p.isPiece || pt?.pieceShape !== 'peas' || p.state !== 'active') continue;
      if (!peaSlots.has(p.slotIdx)) peaSlots.set(p.slotIdx, []);
      peaSlots.get(p.slotIdx).push(p);
    }
    for (const pieces of peaSlots.values()) {
      // Cluster center = average world position of all pieces in this slot.
      const cx = pieces.reduce((s, p) => s + p.worldX, 0) / pieces.length;
      const cy = pieces.reduce((s, p) => s + p.worldY, 0) / pieces.length;
      const clusterAngle = Math.atan2(cy - player.y, cx - player.x);
      pieces.forEach((p, i) => {
        // First half fire outward (cluster angle), second half fire inward (opposite).
        const angle = i < 2 ? clusterAngle : clusterAngle + Math.PI;
        p.state       = 'flying';
        p.flyLifetime = 2500;
        p.vx          = Math.cos(angle) * PEAS_SPEED;
        p.vy          = Math.sin(angle) * PEAS_SPEED;
        p.flyAngle    = angle;
        p.hitMobIds   = new Set();
      });
    }
  }

  // ── Flying petal → mob hits (phases through each mob once) ───────────────
  for (const p of petalInstances) {
    if (p.state !== 'flying' || !p.hitMobIds) continue;
    for (const mob of mobs) {
      if (mob.dead || mob.typeId === 'digger' || mob.typeId === 'beekeeper' || mob.isFriendlyPet) continue;
      if (p.hitMobIds.has(mob.id)) continue; // already struck this mob
      const dx   = mob.x - p.worldX;
      const dy   = mob.y - p.worldY;
      const dist = Math.hypot(dx, dy);
      if (dist < p.radius + mob.radius) {
        p.hitMobIds.add(mob.id);
        const dmg = Math.max(1, p.damage - (mob.armor ?? 0));
        mob.hp -= dmg;
        mob.alerted = true;
        spawnDamage(mob.x, mob.y, dmg, '#ff8800', mob.radius, mob);
        if (mob.hp <= 0) { mob.dead = true; spawnMobDrops(mob); }
      }
    }
  }
}