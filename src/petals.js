/**
 * petals.js — Orbit logic, petal instances, hotbar array.
 */
import {
  ORBIT_RADIUS_NORMAL,
  ORBIT_RADIUS_EXPANDED,
  ORBIT_RADIUS_RETRACT,
  ORBIT_EXPAND_SPEED,
  ORBIT_SPEED,
  MAX_HOTBAR_SLOTS,
  PLAYER_RADIUS,
} from './constants.js';
import { PETAL_TYPES }  from './petalTypes.js';
import { RARITIES }    from './constants.js';
import { inputState }   from './inputState.js';
import { wingState }    from './wingState.js';
import { spawnWebField, honeycombEntities } from './drops.js';
import { mobs, spawnFriendlyAntPet, spawnFriendlyBeePet, spawnFriendlyDiggerPet } from './mobs.js';
import { player } from './player.js';

// ── Orbit state ──────────────────────────────────────────────────────────────
export let orbitAngle    = 0;
export let currentOrbitR = ORBIT_RADIUS_NORMAL;
let targetOrbitR         = ORBIT_RADIUS_NORMAL;

// ── Hotbar ────────────────────────────────────────────────────────────────────
// null = empty slot. Player starts with 5 common basic petals equipped.
export const hotbar = Array.from(
  { length: MAX_HOTBAR_SLOTS },
  (_, i) => (i < 5 ? 'basic' : null),
);

// ── Bench row ─────────────────────────────────────────────────────────────────
// Second row of slots — inactive (not orbiting). Swapping moves to hotbar.
export const benchBar = Array.from({ length: MAX_HOTBAR_SLOTS }, () => null);

// ── Petal instances ───────────────────────────────────────────────────────────
export const petalInstances = [];

// playerMissiles removed — missile petals now fly as the petal entity itself.

/**
 * Returns a single petal object, OR an array of piece-petal objects for
 * multi-piece types (any petal whose type has a .pieces array).
 * Each piece is fully independent: own hp, state, reloadTimer.
 */
function makePetal(slotIdx, typeId) {
  const t = PETAL_TYPES[typeId];

  if (t.pieces) {
    // One petal instance per piece — each independently damageable / reloadable.
    return t.pieces.map((piece, pieceIdx) => {
      const p = {
        slotIdx,
        typeId,
        pieceIdx,
        isPiece:    true,
        noExpand:   !!t.noExpand,
        hp:         t.maxHp,
        maxHp:      t.maxHp,
        damage:     t.damage,
        radius:     piece.pr * t.radius,
        clusterDx:  piece.dx * t.radius,
        clusterDy:  piece.dy * t.radius,
        color:      t.color,
        border:     t.border,
        state:      'reloading',
        reloadTimer: t.reloadTime,
        worldX:     0,
        worldY:     0,
        spawnX:     null,
        spawnY:     null,
        spawnT:     0,
      };
      // Ant egg pieces: each tracks its own hatching state and linked pet
      if (t.isAntEgg) {
        p.antEggState = 'hatch_wait';
        p.hatchTimer  = t.hatchTime;
        p.linkedPetId = null;
      }
      return p;
    });
  }

  // Standard single-body petal
  const inst = {
    slotIdx,
    typeId,
    noExpand:      !!t.noExpand,
    hp:            t.maxHp,
    maxHp:         t.maxHp,
    damage:        t.damage,
    radius:        t.radius,
    hitboxOffsetX: t.hitboxX ?? 0,
    hitboxOffsetY: t.hitboxY ?? 0,
    color:         t.color,
    border:        t.border,
    state:         'reloading',
    reloadTimer:   t.reloadTime,
    worldX:        0,
    worldY:        0,
    spawnX:        null,
    spawnY:        null,
    spawnT:        0,
  };

  // Rose-specific state fields — start in spawn_wait so it checks HP on first cycle
  if (t.healAmount !== undefined) {
    inst.roseState  = 'spawn_wait';
    inst.roseTimer  = 500;
    inst.roseStartX = 0;
    inst.roseStartY = 0;
  }

  // Pollen petal — start in pre_drop: wait 0.5s before becoming ready to fire
  if (t.dropsPollen) {
    inst.pollenState    = 'pre_drop';
    inst.pollenTimer    = 500;
    inst.pollenEntityId = null;
  }

  // Missile petal — starts waiting to fire
  if (t.isMissilePetal) {
    inst.missileState = 'pre_fire';
    inst.missileTimer = 500;
  }

  // Honeycomb petal — starts waiting to be activated
  if (t.isHoneycomb) {
    inst.honeycombState    = 'pre_drop';
    inst.honeycombTimer    = 300;
    inst.honeycombEntityId = null;
  }

  // Bee egg — starts hatching immediately
  if (t.isBeeEgg) {
    inst.beeEggState = 'hatch_wait';
    inst.hatchTimer  = t.hatchTime;
    inst.linkedPetId = null;
  }

  // Digger egg — starts hatching immediately
  if (t.isDiggerEgg) {
    inst.diggerEggState = 'hatch_wait';
    inst.hatchTimer     = t.hatchTime;
    inst.linkedPetId    = null;
  }

  return inst;
}

export function rebuildPetals() {
  // Save ALL state for slots that HAVEN'T changed — reload timers, hp, egg states, etc.
  // This ensures that adding/removing a different slot doesn't interrupt other petals.
  const savedStates = new Map(); // key: `${slotIdx}_${pieceIdx}` → full state snapshot

  for (const p of petalInstances) {
    const newType = hotbar[p.slotIdx];
    if (newType === p.typeId) {
      // Same petal still in the same slot — save full state to restore after rebuild
      savedStates.set(`${p.slotIdx}_${p.pieceIdx ?? 0}`, {
        // Combat/reload state
        state:       p.state,
        reloadTimer: p.reloadTimer,
        hp:          p.hp,
        // Egg states
        antEggState:    p.antEggState,
        beeEggState:    p.beeEggState,
        diggerEggState: p.diggerEggState,
        linkedPetId:    p.linkedPetId,
        hatchTimer:     p.hatchTimer,
      });
    } else {
      // Slot changed or cleared — kill the orphaned pet if any
      if (p.linkedPetId !== null) {
        const pet = mobs.find(m => m.id === p.linkedPetId && !m.dead);
        if (pet) pet.dead = true;
      }
    }
  }

  petalInstances.length = 0;
  for (let i = 0; i < hotbar.length; i++) {
    if (hotbar[i] === null) continue;
    if (PETAL_TYPES[hotbar[i]]?.isAccessory) continue;
    const result = makePetal(i, hotbar[i]);
    if (Array.isArray(result)) petalInstances.push(...result);
    else                       petalInstances.push(result);
  }

  // Restore full state for slots that didn't change
  for (const p of petalInstances) {
    const saved = savedStates.get(`${p.slotIdx}_${p.pieceIdx ?? 0}`);
    if (saved) {
      // Restore reload/combat state so petals don't restart their timers
      if (saved.state       !== undefined) p.state       = saved.state;
      if (saved.reloadTimer !== undefined) p.reloadTimer = saved.reloadTimer;
      if (saved.hp          !== undefined) p.hp          = saved.hp;
      // Restore egg states
      if (saved.antEggState    !== undefined) p.antEggState    = saved.antEggState;
      if (saved.beeEggState    !== undefined) p.beeEggState    = saved.beeEggState;
      if (saved.diggerEggState !== undefined) p.diggerEggState = saved.diggerEggState;
      if (saved.linkedPetId    !== undefined) p.linkedPetId    = saved.linkedPetId;
      if (saved.hatchTimer     !== undefined) p.hatchTimer     = saved.hatchTimer;
    }
  }
}
rebuildPetals();

// ── Public helpers ────────────────────────────────────────────────────────────
export function damagePetal(petal, amount) {
  if (petal.state !== 'active') return;
  petal.hp -= amount;
  if (petal.hp <= 0) {
    petal.hp          = 0;
    petal.state       = 'reloading';
    petal.reloadTimer = PETAL_TYPES[petal.typeId].reloadTime;
    // Clear rose state when it goes to reloading
    if (petal.roseState !== undefined) petal.roseState = null;
    // Clear missile state when it goes to reloading
    if (petal.missileState !== undefined) petal.missileState = null;
    // Clear pollen state when it goes to reloading
    if (petal.pollenState !== undefined) petal.pollenState = null;
    // Clear honeycomb state when it goes to reloading
    if (petal.honeycombState !== undefined) { petal.honeycombState = null; }
    // Ant egg piece: preserve linkedPetId so we know if a pet is still alive;
    // just clear the state flag — the pet survives pellet destruction.
    if (petal.antEggState !== undefined) { petal.antEggState = null; }
    if (petal.beeEggState !== undefined) { petal.beeEggState = null; }
    if (petal.diggerEggState !== undefined) { petal.diggerEggState = null; }
    
    // Web petal: spawn web field when destroyed (all rarity tiers)
    const _wpt = PETAL_TYPES[petal.typeId];
    if (_wpt?.slowFactor !== undefined) {
      // Derive tier from the petal type's rarity (0 = Common, 1 = Uncommon, …)
      const webTier = Math.max(0, RARITIES.indexOf(_wpt.rarity));
      spawnWebField(petal.worldX, petal.worldY, webTier, null, _wpt.slowFactor);
    }
  }
}


// ── Update ────────────────────────────────────────────────────────────────────
export function updatePetals(dt, originX, originY) {
  // Orbit radius
  if (inputState.retract)     targetOrbitR = ORBIT_RADIUS_RETRACT;
  else if (inputState.expand) {
    // Check for third_eye expandBonus from equipped accessories
    let expandBonus = 0;
    for (const typeId of hotbar) {
      if (!typeId) continue;
      const pt = PETAL_TYPES[typeId];
      if (pt?.expandBonus) expandBonus += pt.expandBonus;
    }
    targetOrbitR = ORBIT_RADIUS_EXPANDED + expandBonus;
  }
  else                        targetOrbitR = ORBIT_RADIUS_NORMAL;
  currentOrbitR += (targetOrbitR - currentOrbitR) * ORBIT_EXPAND_SPEED;

  // Sum spin bonus from all active petals that have one (faster petal variants)
  let fasterBoost = 0;
  for (const p of petalInstances) {
    if (p.state === 'active') {
      const sb = PETAL_TYPES[p.typeId]?.spinBonus;
      if (sb) fasterBoost += sb;
    }
  }
  orbitAngle += ORBIT_SPEED + fasterBoost;

  // Determine unique slot order for orbit spacing
  // Flying petals are detached — don't count their slot while airborne
  const seen = new Set();
  const uniqueSlots = [];
  for (const p of petalInstances) {
    if (p.state === 'flying') continue;
    if (!seen.has(p.slotIdx)) { seen.add(p.slotIdx); uniqueSlots.push(p.slotIdx); }
  }
  const n = uniqueSlots.length;

  // Update wing pulse state
  const WING_ATTACK_K = 0.012;
  const wingTarget = inputState.expand ? 1 : 0;
  wingState.attackT += (wingTarget - wingState.attackT) * (1 - Math.pow(1 - WING_ATTACK_K, dt));
  if (inputState.expand) wingState.pulseT += dt;

  const WING_EXTRA_R   = 84;
  const wingPulseOffset = wingState.attackT * Math.abs(Math.sin(wingState.pulseT * 0.002)) * WING_EXTRA_R;

  const SPAWN_ANIM_MS = 350;

  if (n > 0) {
    for (const p of petalInstances) {
      // Roses in approaching/waiting handle their own position in combat.js
      if (p.roseState === 'approaching' || p.roseState === 'waiting') continue;

      // Flying petals move independently — skip orbit positioning
      if (p.state === 'flying') continue;

      const slotOrder = uniqueSlots.indexOf(p.slotIdx);
      const angle  = orbitAngle + (Math.PI * 2 / n) * slotOrder;
      const r      = p.noExpand ? ORBIT_RADIUS_NORMAL : currentOrbitR;
      const orbitX = originX + Math.cos(angle) * r;
      const orbitY = originY + Math.sin(angle) * r;
      const targetX = orbitX + (p.clusterDx ?? 0) + (p.hitboxOffsetX ?? 0);
      const targetY = orbitY + (p.clusterDy ?? 0) + (p.hitboxOffsetY ?? 0);

      // Spawn animation
      if (p.spawnX !== null) {
        p.spawnT += dt;
        const t    = Math.min(p.spawnT / SPAWN_ANIM_MS, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        p.worldX = p.spawnX + (targetX - p.spawnX) * ease;
        p.worldY = p.spawnY + (targetY - p.spawnY) * ease;
        if (t >= 1) { p.spawnX = null; p.spawnY = null; }
      } else {
        p.worldX = targetX;
        p.worldY = targetY;
      }

      // Wing pulse: push hitbox outward during attack
      if (PETAL_TYPES[p.typeId]?.isWing && p.state === 'active') {
        p.worldX += Math.cos(angle) * wingPulseOffset;
        p.worldY += Math.sin(angle) * wingPulseOffset;
      }
    }
  }

  // Reload timers
  for (const p of petalInstances) {
    if (p.state === 'reloading') {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.state = 'active';
        p.hp    = p.maxHp;
        const pt_rl = PETAL_TYPES[p.typeId];

        if (pt_rl?.isMissilePetal) {
          // Missile petal: enter pre_fire wait — no spawn animation
          p.missileState = 'pre_fire';
          p.missileTimer = 500;
        } else if (pt_rl?.dropsPollen) {
          // Pollen petal: re-enter pre_drop wait; spawn animation plays as normal
          p.pollenState    = 'pre_drop';
          p.pollenTimer    = 500;
          p.pollenEntityId = null;
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else if (pt_rl?.healAmount !== undefined) {
          // Rose: enter spawn_wait, check HP after 0.5s — play spawn animation
          p.roseState = 'spawn_wait';
          p.roseTimer = 500;
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else if (pt_rl?.isHoneycomb) {
          // Honeycomb: re-enter pre_drop, play spawn animation
          p.honeycombState    = 'pre_drop';
          p.honeycombTimer    = 300;
          p.honeycombEntityId = null;
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else if (pt_rl?.isAntEgg) {
          // Ant egg piece: check if its linked pet is still alive
          const petAlive = p.linkedPetId !== null &&
            mobs.some(m => m.id === p.linkedPetId && !m.dead);
          if (petAlive) {
            // Pet survived — re-link, no new hatch needed
            p.antEggState = 'linked';
          } else {
            // No living pet — start hatch countdown
            p.linkedPetId = null;
            p.antEggState = 'hatch_wait';
            p.hatchTimer  = pt_rl.hatchTime;
          }
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else if (pt_rl?.isBeeEgg) {
          // Bee egg: check if its linked pet is still alive
          const petAlive = p.linkedPetId !== null &&
            mobs.some(m => m.id === p.linkedPetId && !m.dead);
          if (petAlive) {
            p.beeEggState = 'linked';
          } else {
            p.linkedPetId = null;
            p.beeEggState = 'hatch_wait';
            p.hatchTimer  = pt_rl.hatchTime;
          }
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else if (pt_rl?.isDiggerEgg) {
          // Digger egg: check if its linked pet is still alive
          const petAlive = p.linkedPetId !== null &&
            mobs.some(m => m.id === p.linkedPetId && !m.dead);
          if (petAlive) {
            p.diggerEggState = 'linked';
          } else {
            p.linkedPetId    = null;
            p.diggerEggState = 'hatch_wait';
            p.hatchTimer     = pt_rl.hatchTime;
          }
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        } else {
          // Normal petal spawn animation
          const spawnAngle = Math.random() * Math.PI * 2;
          p.spawnX = originX + Math.cos(spawnAngle) * PLAYER_RADIUS;
          p.spawnY = originY + Math.sin(spawnAngle) * PLAYER_RADIUS;
          p.spawnT = 0;
        }
      }
    }
  }

  // ── Pre-fire timer for missile petals (counts down while orbiting) ──────────
  for (const p of petalInstances) {
    if (p.state === 'active' && p.missileState === 'pre_fire') {
      p.missileTimer -= dt;
    }
  }

  // ── Ant egg hatch timer + pet-death detection ────────────────────────────────
  for (const p of petalInstances) {
    if (p.antEggState === undefined || p.state !== 'active') continue;

    if (p.antEggState === 'hatch_wait') {
      p.hatchTimer -= dt;
      if (p.hatchTimer <= 0) {
        // Spawn the friendly ant pet at this piece's world position
        const pt = PETAL_TYPES[p.typeId];
        const pet = spawnFriendlyAntPet(pt.tier ?? 0, p.worldX, p.worldY, p.slotIdx, p.pieceIdx);
        if (pet) {
          p.linkedPetId = pet.id;
          p.antEggState = 'linked';
        } else {
          // Spawn failed (rare) — retry after 500 ms instead of spamming every frame
          p.hatchTimer = 500;
        }
      }
    } else if (p.antEggState === 'linked') {
      // Check if our pet died
      const petAlive = mobs.some(m => m.id === p.linkedPetId && !m.dead);
      if (!petAlive) {
        // Pet died — destroy this piece and start the reload cycle
        p.linkedPetId = null;
        p.antEggState = null;
        p.hp          = 0;
        p.state       = 'reloading';
        p.reloadTimer = PETAL_TYPES[p.typeId].reloadTime;
      }
    }
  }

  // ── Bee egg hatch timer + pet-death detection ─────────────────────────────
  for (const p of petalInstances) {
    if (p.beeEggState === undefined || p.state !== 'active') continue;

    if (p.beeEggState === 'hatch_wait') {
      p.hatchTimer -= dt;
      if (p.hatchTimer <= 0) {
        const pt = PETAL_TYPES[p.typeId];
        const pet = spawnFriendlyBeePet(pt.tier ?? 0, p.worldX, p.worldY, p.slotIdx, p.pieceIdx ?? 0);
        if (pet) {
          p.linkedPetId = pet.id;
          p.beeEggState = 'linked';
        } else {
          p.hatchTimer = 500;
        }
      }
    } else if (p.beeEggState === 'linked') {
      const petAlive = mobs.some(m => m.id === p.linkedPetId && !m.dead);
      if (!petAlive) {
        p.linkedPetId = null;
        p.beeEggState = null;
        p.hp          = 0;
        p.state       = 'reloading';
        p.reloadTimer = PETAL_TYPES[p.typeId].reloadTime;
      }
    }
  }

  // ── Digger egg hatch timer + pet-death detection ─────────────────────────────
  for (const p of petalInstances) {
    if (p.diggerEggState === undefined || p.state !== 'active') continue;

    if (p.diggerEggState === 'hatch_wait') {
      p.hatchTimer -= dt;
      if (p.hatchTimer <= 0) {
        const pt = PETAL_TYPES[p.typeId];
        const pet = spawnFriendlyDiggerPet(pt.tier ?? 0, p.worldX, p.worldY, p.slotIdx, p.pieceIdx ?? 0, player.color);
        if (pet) {
          p.linkedPetId    = pet.id;
          p.diggerEggState = 'linked';
        } else {
          p.hatchTimer = 500;
        }
      }
    } else if (p.diggerEggState === 'linked') {
      const petAlive = mobs.some(m => m.id === p.linkedPetId && !m.dead);
      if (!petAlive) {
        p.linkedPetId    = null;
        p.diggerEggState = null;
        p.hp             = 0;
        p.state          = 'reloading';
        p.reloadTimer    = PETAL_TYPES[p.typeId].reloadTime;
      }
    }
  }

  // ── Flying petal movement (missile & peas pieces in flight) ─────────────────
  for (const p of petalInstances) {
    if (p.state !== 'flying') continue;
    p.worldX += p.vx;
    p.worldY += p.vy;
    p.flyLifetime -= dt;
    if (p.flyLifetime <= 0) {
      // Despawn → go on cooldown
      p.state       = 'flying_done'; // temporary flag, resolved below
      p.hp          = 0;
      p.reloadTimer = PETAL_TYPES[p.typeId].reloadTime;
      p.hitMobIds   = null;
    }
  }
  // Resolve flying_done → reloading in a second pass (avoids mid-loop mutation issues)
  for (const p of petalInstances) {
    if (p.state === 'flying_done') p.state = 'reloading';
  }
}