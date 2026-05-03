/**
 * petalTypes.js — Defines every petal type, including rarity-scaled variants.
 *
 * Scalable petals (basic, faster, light, pollen, rose, stinger, poison, leaf,
 * peas, wing, rice, orange) auto-generate 14 rarity tiers.
 *
 * Scaling rules:
 *   HP  : x3.75 per tier
 *   DMG : x3    per tier
 *   Amor: x3    per tier
 *   Special scales (x3/tier): rose healAmount, poison poisonDps, leaf passiveHeal
 *   Faster spinBonus: +0.4 rad/s per tier (base 0.2 rad/s at Common)
 *   Reload: does NOT scale per tier
 */

import { RARITIES } from './constants.js';

function rarSuffix(rarity) {
  return rarity.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function scaledId(baseId, tier) {
  return tier === 0 ? baseId : `${baseId}_${rarSuffix(RARITIES[tier])}`;
}

const SCALABLE_BASES = {
  web: {
    name: 'Web', color: '#aacfe0', border: '#6b9ca8', spriteIndex: 6,
    radius: 8, hitboxX: 0, hitboxY: 0,
    baseHp: 1, baseDmg: 9, reloadTime: 1800,
    baseSlowFactor: 0.4,
    noScaleHp: true,
    description: 'Spawns a slowing web on the ground when it hits. Slows mobs by 40%.',
  },
  basic: {
    name: 'Basic', color: '#ffffff', border: '#90ee90', spriteIndex: 0,
    radius: 9.5, hitboxX: 0, hitboxY: 0,
    baseHp: 10, baseDmg: 10, reloadTime: 2500,
    description: 'A simple white petal.',
  },
  faster: {
    name: 'Faster', color: '#7fffd4', border: '#ff69b4', spriteIndex: 1,
    radius: 9.5, hitboxX: 0, hitboxY: 0,
    baseHp: 5, baseDmg: 20, reloadTime: 700,
    spinBonusPerSec: 0.2,
    description: 'Slightly higher damage and makes petals rotate faster.',
  },
  light: {
    name: 'Light', color: '#fcf7b2', border: '#f7f7a0', spriteIndex: 2,
    radius: 9.5, hitboxX: 0, hitboxY: 0,
    baseHp: 5, baseDmg: 20, baseArmor: 3, reloadTime: 500,
    description: 'Faster reload and slightly smaller than basic.',
  },
  pollen: {
    name: 'Pollen', color: '#d8e786', border: '#9aa83d', spriteIndex: 3,
    radius: 9.5, hitboxX: 0, hitboxY: 0,
    baseHp: 5, baseDmg: 25, baseArmor: 15, reloadTime: 1000,
    dropsPollen: true,
    description: 'Drops pollen on contact while attacking or defending.',
  },
  rose: {
    name: 'Rose', color: '#e87ba3', border: '#8b2a50', spriteIndex: 4,
    radius: 9, hitboxX: 0, hitboxY: 0,
    baseHp: 5, baseDmg: 5, reloadTime: 2500,
    baseHeal: 10,
    noExpand: true, canCollect: false,
    description: 'Moves to the player when they take damage, heals them, then reloads.',
  },
  stinger: {
    name: 'Stinger', color: '#f5a844', border: '#c26a28', spriteIndex: 5,
    radius: 8, hitboxX: 0, hitboxY: 0,
    baseHp: 1, baseDmg: 150, reloadTime: 5000,
    oneShot: true,
    description: 'Extreme damage. Breaks after one hit.',
  },
  poison: {
    name: 'Poison', color: '#55cc44', border: '#2a6618', spriteIndex: 7,
    radius: 8, hitboxX: 0, hitboxY: 0,
    baseHp: 5, baseDmg: 5, reloadTime: 2000,
    basePoisonDps: 35,
    description: 'Poisons enemies on contact, dealing damage over time.',
  },
  leaf: {
    name: 'Leaf', color: '#3db830', border: '#1e6612', spriteIndex: 8,
    radius: 13, hitboxX: 0, hitboxY: -2,
    baseHp: 12, baseDmg: 15, reloadTime: 2000,
    basePassiveHeal: 2,
    description: 'A sturdy leaf. Passively heals the player while active.',
  },
  peas: {
    name: 'Peas', color: '#66bb6a', border: '#2e7d32', spriteIndex: 10,
    radius: 8,
    baseHp: 5, baseDmg: 100, baseArmor: 3, reloadTime: 3000,
    pieceShape: 'peas',
    pieces: [
      { dx: -0.6, dy: -0.6, pr: 0.43 },
      { dx:  0.6, dy: -0.6, pr: 0.43 },
      { dx: -0.6, dy:  0.6, pr: 0.43 },
      { dx:  0.6, dy:  0.6, pr: 0.43 },
    ],
    description: 'Four little peas. Each pellet hits independently.',
  },
  wing: {
    name: 'Wing', color: '#ffffff', border: '#aaaaaa', spriteIndex: 13,
    radius: 15, hitboxX: 0, hitboxY: 0,
    baseHp: 10, baseDmg: 30, baseArmor: 3, reloadTime: 1200,
    isWing: true,
    description: 'A wing. Deals high damage and has good durability.',
  },
  rice: {
    name: 'Rice', color: '#ffffff', border: '#c0c0c0', spriteIndex: 14,
    radius: 6.5, hitboxX: 0, hitboxY: 0,
    baseHp: 1, baseDmg: 20, reloadTime: 50,
    description: 'A grain of rice. Fires extremely rapidly.',
  },
  orange: {
    name: 'Orange', color: '#e8a030', border: '#a06820', spriteIndex: 25,
    radius: 10,
    baseHp: 10, baseDmg: 30, baseArmor: 6, reloadTime: 2000,
    pieceShape: 'orange',
    pieces: [
      { dx:  0.80, dy: -0.75, pr: 0.52 },
      { dx: -0.55, dy:  0.25, pr: 0.52 },
      { dx:  0.85, dy:  1.05, pr: 0.52 },
    ],
    description: 'A cluster of oranges. Each piece hits independently.',
  },
  disc: {
    name: 'Disc', color: '#111111', border: '#000000', spriteIndex: 16,
    radius: 10, hitboxX: 0, hitboxY: 0,
    baseHp: 10, baseDmg: 12, reloadTime: 2200,
    isAccessory: true,
    baseDamageBlock: 0.10,
    damageBlockPerTier: 0.09,
    description: 'placeholder', // overridden per-tier below
  },
  cutter: {
    name: 'Cutter', color: '#111111', border: '#000000', spriteIndex: 17,
    radius: 10, hitboxX: 0, hitboxY: 0,
    baseHp: 8, baseDmg: 20, reloadTime: 3000,
    isAccessory: true,
    baseBodyDamage: 55,
    bodyDamageMultiplier: 3,
    description: 'placeholder', // overridden per-tier below
  },
  soil: {
    name: 'Soil', color: '#664b1d', border: '#4c3713', spriteIndex: 19,
    radius: 9, hitboxX: 0, hitboxY: 0,
    baseHp: 30, baseDmg: 15, reloadTime: 2000,
    baseMaxHpBonus: 200,
    maxHpBonusMultiplier: 3,
    description: 'placeholder', // overridden per-tier below
  },
  magnet: {
    name: 'Magnet', color: '#b84040', border: '#7a2020', spriteIndex: 20,
    radius: 14.5, hitboxX: -1, hitboxY: -1,
    baseHp: 15, baseDmg: 2, reloadTime: 2000,
    isAccessory: true, noExpand: true,
    basePickupBonus: 0.15,        // 15% larger pickup range at Common
    pickupBonusMultiplier: 1.5,   // ×1.5 per tier
    description: 'placeholder',   // overridden per-tier below
  },
  missile: {
    name: 'Missile', color: '#1a1a1a', border: '#3a2800', spriteIndex: 26,
    radius: 10, hitboxX: 0, hitboxY: 0,
    baseHp: 1, baseDmg: 30, reloadTime: 4000,
    isMissilePetal: true, noExpand: true,
    description: 'placeholder',   // overridden per-tier below
  },
  centipede_legs: {
    name: 'Centipede Legs', color: '#7ed62a', border: '#3a6b1a', spriteIndex: 9,
    radius: 9, hitboxX: 0, hitboxY: 0,
    baseHp: 8, baseDmg: 12, reloadTime: 3000,
    isAccessory: true,
    baseWalkSpeedBonus: 2.2,       // flat speed added to PLAYER_SPEED
    walkSpeedBonusMultiplier: 1.5, // ×1.5 per tier
    description: 'placeholder', // overridden per-tier below
  },
  third_eye: {
    name: 'Third Eye', color: '#111111', border: '#444444', spriteIndex: 11,
    radius: 9, hitboxX: 0, hitboxY: 0,
    baseHp: 8, baseDmg: 10, reloadTime: 2000,
    isAccessory: true,
    baseExpandBonus: 30,          // flat world-units added to ORBIT_RADIUS_EXPANDED
    expandBonusMultiplier: 3,     // ×3 per tier
    description: 'placeholder', // overridden per-tier below
  },
  ant_egg: {
    name: 'Ant Egg', color: '#fffcec', border: '#2a2a2a', spriteIndex: 15,
    radius: 10,
    baseHp: 100, baseDmg: 0, reloadTime: 1000,
    hpScaleMult: 3,  // HP × 3 per tier (not 3.75)
    noExpand: true,
    isAntEgg: true,
    pieceShape: 'ant_egg',
    pieces: [
      { dx:  0,    dy: -0.47, pr: 0.62 },
      { dx: -0.47, dy:  0,    pr: 0.62 },
      { dx:  0,    dy:  0.47, pr: 0.62 },
      { dx:  0.47, dy:  0,    pr: 0.62 },
    ],
    description: 'placeholder',
  },
  bee_egg: {
    name: 'Bee Egg', color: '#f5cf4b', border: '#c8960a', spriteIndex: 22,
    radius: 9.5,
    hitboxX: 0, hitboxY: 0,
    baseHp: 100, baseDmg: 0, reloadTime: 1000,
    hpScaleMult: 3,  // HP × 3 per tier (not 3.75)
    noExpand: true,
    isBeeEgg: true,
    pieceShape: 'bee_egg',
    description: 'placeholder',
  },
  digger_egg: {
    name: 'Digger Egg', color: '#8c8c8c', border: '#000000', spriteIndex: 18,
    radius: 10,
    hitboxX: 0, hitboxY: 0,
    baseHp: 100, baseDmg: 0, reloadTime: 1000,
    hpScaleMult: 3,  // HP × 3 per tier
    noExpand: true,
    isDiggerEgg: true,
    pieceShape: 'digger_egg',
    description: 'placeholder',
  },
  honeycomb: {
    name: 'Honeycomb', color: '#ffba04', border: '#9a6200', spriteIndex: 23,
    radius: 11, hitboxX: 0, hitboxY: 0,
    baseHp: 10, baseDmg: 0, reloadTime: 5000,
    isHoneycomb: true, noExpand: true,
    // HP: 1000 * 3^tier (custom scaling — overrides default 3.75^tier)
    honeycombHpByTier: [
      1000, 3000, 9000, 27000, 81000, 243000, 729000,
      2187000, 6561000, 19683000, 59049000, 177147000, 531441000, 1594323000,
    ],
    // Attract range per rarity tier
    attractRangeByTier: [
      140, 220, 320, 400, 570, 750, 940, 1250, 1750, 3000,
      5000, 9000, 18000, 45000,
    ],
    description: 'placeholder', // overridden per-tier below
  },
  antennae: {
    name: 'Antennae', color: '#3d3d3d', border: '#1a1a1a', spriteIndex: 24,
    radius: 9, hitboxX: 0, hitboxY: 0,
    baseHp: 8, baseDmg: 9, reloadTime: 2000,
    isAccessory: true,
    // Per-tier vision bonus (fraction added to zoom-out multiplier, e.g. 0.25 = +25%)
    visionBonusByTier: [
      0.25,  // Common
      0.40,  // Unusual
      0.60,  // Rare
      0.80,  // Epic
      0.90,  // Legendary
      1.00,  // Mythical
      2.00,  // Ultra
      3.50,  // Super
      5.00,  // Radiant
      8.00,  // Mystitic
      12.00, // Runic
      18.00, // Seraphic
      28.00, // Umbral
      50.00, // Impracticality
    ],
    description: 'placeholder', // overridden per-tier below
  },
};

function generateScaledVariants() {
  const out = {};
  for (const [baseId, base] of Object.entries(SCALABLE_BASES)) {
    for (let tier = 0; tier < RARITIES.length; tier++) {
      const rarity  = RARITIES[tier];
      const id      = scaledId(baseId, tier);
      const hpMult  = Math.pow(base.hpScaleMult ?? 3.75, tier);
      const dmgMult = Math.pow(3,    tier);
      const x3Mult  = Math.pow(3,    tier);

      const entry = {
        id, name: base.name, rarity, tier,
        spriteIndex: base.spriteIndex,
        color: base.color, border: base.border,
        radius:  base.radius,
        hitboxX: base.hitboxX ?? 0,
        hitboxY: base.hitboxY ?? 0,
        maxHp:      base.noScaleHp ? base.baseHp : Math.round(base.baseHp  * hpMult),
        damage:     Math.round(base.baseDmg * dmgMult),
        reloadTime: base.reloadTime,
        description: base.description,
      };

      if (base.isAntEgg) {
        entry.isAntEgg  = true;
        entry.hatchTime = tier >= 6 ? 15000 : 4000;
        entry.damage    = 0;
        const hatchSec  = tier >= 6 ? '15s' : '4s';
        entry.description = `4 pieces — each hatches a friendly ${rarity} Soldier Ant pet. Pellet reloads in 1s; ant spawns ${hatchSec} after. Pet death recycles its piece.`;
      }

      if (base.isBeeEgg) {
        entry.isBeeEgg  = true;
        entry.damage    = 0;
        const hatchMs   = tier >= 9 ? 10000 : tier >= 5 ? 5000 : 2000;
        const hatchSec  = tier >= 9 ? '10s' : tier >= 5 ? '5s' : '2s';
        entry.hatchTime = hatchMs;
        entry.description = `Hatches a friendly ${rarity} Bee pet. Pellet reloads in 1s; bee spawns ${hatchSec} after. Pet death recycles the piece.`;
      }

      if (base.isDiggerEgg) {
        entry.isDiggerEgg = true;
        entry.damage      = 0;
        const hatchMs     = tier >= 6 ? 7000 : 5000;  // Ultra+ = 7s, Common–Mythical = 5s
        const hatchSec    = tier >= 6 ? '7s' : '5s';
        entry.hatchTime   = hatchMs;
        entry.description = `Hatches a friendly ${rarity} Digger pet. Pellet reloads in 1s; digger spawns ${hatchSec} after. Pet death recycles the piece.`;
      }

      if (base.noExpand)             entry.noExpand    = true;
      if (base.canCollect === false)  entry.canCollect  = false;
      if (base.oneShot)              entry.oneShot     = true;
      if (base.dropsPollen)          entry.dropsPollen = true;
      if (base.isWing)               entry.isWing      = true;
      if (base.pieces)               entry.pieces      = base.pieces;
      if (base.pieceShape)           entry.pieceShape  = base.pieceShape;

      if (base.baseArmor !== undefined)
        entry.armor = Math.round(base.baseArmor * x3Mult);

      if (base.spinBonusPerSec !== undefined)
        entry.spinBonus = (base.spinBonusPerSec + 0.4 * tier) / 60;

      if (base.baseHeal !== undefined) {
        entry.healAmount   = Math.round(base.baseHeal * x3Mult);
        entry.cooldownText = `${(base.reloadTime / 1000).toFixed(1)}s + 0.5s`;
      }

      if (base.basePoisonDps !== undefined)
        entry.poisonDps = Math.round(base.basePoisonDps * x3Mult);

      if (base.basePassiveHeal !== undefined)
        entry.passiveHeal = base.basePassiveHeal * x3Mult;

      if (base.baseSlowFactor !== undefined)
        entry.slowFactor = base.baseSlowFactor;

      if (base.isAccessory)
        entry.isAccessory = true;

      if (base.isMissilePetal) {
        entry.isMissilePetal = true;
        entry.description = `After reloading, waits 0.5s then fires a phasing stinger dealing ${entry.damage} damage to every mob it passes through. Despawns after 3.5s.`;
      }

      if (base.basePickupBonus !== undefined) {
        const bonus = base.basePickupBonus * Math.pow(base.pickupBonusMultiplier ?? 1.5, tier);
        entry.pickupBonus = bonus;
        entry.description = `A magnetic petal. Increases drop pickup range by +${Math.round(bonus * 100)}% while equipped.`;
      }

      if (base.baseWalkSpeedBonus !== undefined) {
        const bonus = base.baseWalkSpeedBonus * Math.pow(base.walkSpeedBonusMultiplier ?? 1.5, tier);
        entry.walkSpeedBonus = bonus;
        entry.description = `Legs from the centipede. Grants +${bonus.toFixed(1)} flat walk speed when equipped.`;
      }

      if (base.baseExpandBonus !== undefined) {
        const bonus = Math.round(base.baseExpandBonus * Math.pow(base.expandBonusMultiplier ?? 3, tier));
        entry.expandBonus = bonus;
        entry.description = `A mysterious eye. Increases expansion radius by +${bonus} when equipped.`;
      }

      if (base.visionBonusByTier !== undefined) {
        const bonus = base.visionBonusByTier[tier] ?? base.visionBonusByTier[base.visionBonusByTier.length - 1];
        entry.visionBonus = bonus;
        entry.description = `Antennae from a hornet. Increases vision range by +${Math.round(bonus * 100)}% when equipped.`;
      }

      if (base.honeycombHpByTier !== undefined) {
        const hcHp       = base.honeycombHpByTier[tier] ?? base.honeycombHpByTier[base.honeycombHpByTier.length - 1];
        const hcRange    = base.attractRangeByTier[tier] ?? base.attractRangeByTier[base.attractRangeByTier.length - 1];
        const maxRarity  = RARITIES[Math.min(tier + 1, RARITIES.length - 1)];
        entry.maxHp         = hcHp;
        entry.damage        = 0;
        entry.isHoneycomb   = true;
        entry.attractRange  = hcRange;
        entry.honeycombHp   = hcHp;
        entry.description   = `Drop on the ground to lure mobs up to ${maxRarity} rarity within ${hcRange} range. Survives ${(hcHp).toLocaleString()} damage or 10 seconds.`;
      }

      if (base.baseDamageBlock !== undefined) {
        const block = Math.min(1, base.baseDamageBlock + base.damageBlockPerTier * tier);
        entry.damageBlock = block;
        entry.description = `A spinning disc. Blocks ${Math.round(block * 100)}% of incoming damage per hit. Adds a black saw outline.`;
      }

      if (base.baseBodyDamage !== undefined) {
        const bodyDmg = Math.round(base.baseBodyDamage * Math.pow(base.bodyDamageMultiplier ?? 3, tier));
        entry.bodyDamage = bodyDmg;
        entry.description = `A saw blade attached to you. Adds +${bodyDmg} body damage on contact with enemies.`;
      }

      if (base.baseMaxHpBonus !== undefined) {
        const bonus = Math.round(base.baseMaxHpBonus * Math.pow(base.maxHpBonusMultiplier ?? 3, tier));
        entry.maxHpBonus = bonus;
        entry.description = `A clump of rich earth. Adds +${bonus} max HP while equipped.`;
      }

      out[id] = entry;
    }
  }
  return out;
}

const STATIC_PETALS = {
  clover: {
    id: 'clover', name: 'Clover', rarity: 'Uncommon', spriteIndex: 12,
    color: '#5cba3c', border: '#2e7d32',
    radius: 9, hitboxX: 0, hitboxY: 0, maxHp: 10, damage: 8, reloadTime: 2000,
    description: 'A lucky three-leaf clover.',
  },
  honey: {
    id: 'honey', name: 'Honey', rarity: 'Uncommon', spriteIndex: 21,
    color: '#F9D71C', border: '#C8A51D',
    radius: 9, hitboxX: 0, hitboxY: 0, maxHp: 10, damage: 8, reloadTime: 2000,
    description: 'A hexagon of honey. Slows enemies on contact.',
  },


};

export const PETAL_TYPES = {
  ...generateScaledVariants(),
  ...STATIC_PETALS,
};

/** All typeIds for scalable petals at every rarity tier (for inventory init). */
export const SCALABLE_PETAL_IDS = Object.keys(SCALABLE_BASES).flatMap(baseId =>
  RARITIES.map((_, tier) => scaledId(baseId, tier)),
);