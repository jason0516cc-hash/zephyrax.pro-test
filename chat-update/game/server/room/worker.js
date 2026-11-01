// worker.js — one room of the game server, in its own worker thread: the
// homescreen ('lobby') or one biome ('garden', 'desert', 'ocean', 'jungle', 'swamp', 'space').
//
// A worker has its own copy of every system/game module, so each biome is a
// separate world (its own players, mobs, drops) without the game code
// knowing. The main thread (server/rooms.js) owns the sockets and the
// database; it hands players in ('enter') and takes them back out ('leave'),
// with their save, and forwards their browser's messages ('msg'). Everything
// this room wants a browser to get goes back as 'send'.
//
// A biome room runs the world (advanceWorld, 60 ticks/s) while anyone is in
// it, and sends each player a snapshot of what's near them every SNAP_TICKS
// ticks. The lobby never runs a world: it only holds players who are on the
// homescreen, so they can still rearrange petals, craft and turn the ring.
//
// Zevo, the AI player (server/ai/), is a member with no browser (info.isAI):
// nothing is sent to it; its brain (agent.js) sets its controls before each
// world step, hears this biome's chat, and speaks through the same chat path.
import './studioBoot.js';   // (first: the Game Studio's changes, before any petal is built)
import { parentPort, workerData } from 'node:worker_threads';
import { netLog } from '../netLog.js';
import { loadBiome, spawnPlayerInBiome, respawnAtCheckpoint, advanceWorld, getWorldTick,
         removePlayerFromWorld, TICK_MS } from '../../system/game/game.js';
import { createPlayer, addPlayer, players, setDisconnected } from '../../system/game/player.js';
import { makeSave, loadSave } from '../../system/game/save.js';
import { cleanPrefs } from '../../system/shared/prefs.js';
import { onGameEvent, emitGameEvent } from '../../system/game/events.js';
import { killPlayerSelf } from '../../system/game/damage.js';
import { mobs, bossPeas, bossRoses, firstBatchAlive, spawnMobByCommand, randomZoneSpot } from '../../system/game/mobs.js';
import * as commands from '../../system/game/commands.js';
import { runChatCommand, highestHotbarRarity, teleportNextTo } from '../../system/game/chatCommands.js';
import { setSquadTable, squadOf } from '../../system/game/squads.js';
import { levelFromXp } from '../../system/shared/leveling.js';
import { rarityText, rarityTier, RARITIES } from '../../system/shared/rarities.js';
import { MOB_DEFS, PLANET_MOB_TYPES, mobSize } from '../../system/shared/mobTypes.js';
import { PETAL_TYPES } from '../../system/shared/petalTypes.js';
import { gameTimeMs } from '../../system/game/clock.js';
import { flavorBuff } from '../../system/game/flavors.js';
import { SNAP_TICKS, ACTIONS, RESULT_ACTIONS, CHAT_MAX_CHARS, maxViewHalf, DIEP_ROOM } from '../../system/shared/netProtocol.js';
import { MAX_IMPORT_CHARS, LOADOUT_EQUIP_COOLDOWN_MS } from '../../system/shared/loadoutCode.js';
import { visionOf, loadedOf } from '../../system/shared/playerStats.js';
import { ABSORB_MAX_KINDS } from '../../system/shared/absorb.js';
import { HURT_FLASH_MS } from '../../system/shared/constants.js';
import { buildSnapshot, newViewState, fullView, knownNetId, canSee, netIdOf } from './views.js';
import { nearestWalkable } from '../../system/game/physics.js';
import { createAgent } from '../ai/agent.js';
import { rollDailyIfDue, claimChallenge, claimStreak, dropMultAt } from '../../system/game/daily.js';
import { CLAIM_GAP_MS, streakState } from '../../system/shared/daily.js';
import { checkAchievements } from '../../system/game/achievements.js';
import { diepLeaders } from '../../system/game/diep.js';
import { toggleCartoonCat, catKey } from '../../system/game/cartoonCat.js';
import { ccMaxViewHalf } from '../../system/shared/cartoonCat.js';
import { setHalloween, spawnGhostFlower, despawnGhostFlower, halloweenOn } from '../../system/game/halloween.js';
import { candyTierOf } from '../../system/shared/halloween.js';
import { getZoneTierAt } from '../../system/game/world.js';

const ROOM = workerData.roomId;
const IS_BIOME = ROOM !== 'lobby';
const SAVE_EVERY_MS   = 5000;    // a hard stop (a dev restart on Windows) loses at most this much
const ME_EVERY_MS     = 250;
const ROSTER_EVERY_MS = 100;
const STATUS_EVERY_MS = 250;

// (before the world loads: its first batch announces itself as it fills)
// A rare one (Runic+) is a chat line here; #game-logs hears of every spawn from /game-log's rarity up. The world's
// first batch waits (firstBatch, below) for the first player to come in — nobody's here yet, and the bot may not be either (Dev)
onGameEvent('mobSpawned', e => {
  if (!IS_BIOME) return;
  if (e.firstBatch) { firstBatch.push(e); return; }
  if (e.rare) sendAll({ t: 'spawned', typeId: e.typeId, tier: e.tier, boss: !!e.isBoss, shiny: !!e.isShiny });
  if (e.typeId === 'grim_reaper') {   // (an admin's /spawn: its own #game-logs post — reaperRisen, below)
    const reaper = mobs.filter(isWildReaper).at(-1);
    if (reaper) reaperRisen(reaper, getZoneTierAt(reaper.x, reaper.y));
    return;
  }
  if (logsSpawn(e)) logSpawn(e);
});
// A planet's spawn always goes to #game-logs from Unique up, whatever /game-log says; other mobs follow /game-log (Dev)
const PLANETS = new Set(PLANET_MOB_TYPES);
const PLANET_LOG_TIER = RARITIES.indexOf('Unique');
const logsSpawn = e => e.tier >= LOG_MOB_TIER || (PLANETS.has(e.typeId) && e.tier >= PLANET_LOG_TIER);
const logSpawn = e => gameLog({ kind: 'spawn', typeId: e.typeId, mob: MOB_DEFS[e.typeId]?.name ?? e.typeId, tier: e.tier, boss: !!e.isBoss, shiny: !!e.isShiny });

// ── The Discord #game-logs channel ───────────────────────────────────────────
// Mobs spawning and dying from LOG_MOB_TIER up, and drops and crafts (failed
// tries too) from LOG_PETAL_TIER up, go to the main thread, which hands them to
// the Discord bot (server/discord.js — the bot posts them with the mob's picture).
// The bot's /game-log sets both (server/rooms.js setLogTiers); till it's been
// heard from: Imperial+ mobs, Unique+ petals.
let LOG_MOB_TIER   = workerData.logTiers?.mob ?? RARITIES.indexOf('Imperial');
let LOG_PETAL_TIER = workerData.logTiers?.petal ?? RARITIES.indexOf('Unique');
function gameLog(entry) {
  parentPort.postMessage({ op: 'gameLog', entry: { ...entry, rarity: RARITIES[entry.tier] ?? null, biome: ROOM } });
}
const petalLog = id => ({ petal: PETAL_TYPES[id]?.name ?? id, petalRarity: PETAL_TYPES[id]?.rarity ?? null, petalId: id });
// The world's first batch (game/mobs.js populateAllZones): each player is told
// about the rare (Runic+) ones still alive the first time they come in, and
// when the first player (not Zevo) does, #game-logs gets the ones still alive
// from /game-log's rarity up — after that, only what spawns (Dev).
const firstBatch = [];
const toldFirstBatch = new Set();   // profileIds
// A world started by /starthalloweenevent or /endhalloweenevent: its first batch is never told — not in the chat,
// not in #game-logs (Dev: "no chat logs or server logs"); what spawns after is, as always
const QUIET_START = !!workerData.quiet;
let loggedFirstBatch = false;
function tellFirstBatch(member) {
  if (member.ai || toldFirstBatch.has(member.profileId) || QUIET_START) return;
  toldFirstBatch.add(member.profileId);
  const logIt = !loggedFirstBatch;
  loggedFirstBatch = true;
  for (const e of firstBatch) {
    if (!firstBatchAlive(e.firstBatch)) continue;
    if (e.rare) send(member, { t: 'spawned', typeId: e.typeId, tier: e.tier, boss: !!e.isBoss, shiny: !!e.isShiny });
    if (logIt && logsSpawn(e)) logSpawn(e);
  }
}

// The Halloween event (game/halloween.js): on or off for this whole world, before it loads (its first batch rolls
// Spookys); the Ghost Flower back in a Garden that restarted while an admin had it out (server/rooms.js)
setHalloween(workerData.halloween);
if (IS_BIOME) loadBiome(ROOM);
if (workerData.halloween?.npc) spawnGhostFlower();   // (only does anything in the Garden)

/** profileId → { player, info: { displayName, tag, isAdmin }, view, events, ack, … } */
const members = new Map();
let outbox = [];   // [profileId, json] waiting to go to the main thread
/** player id → the name their mob leaderboard row shows (username or guest tag; Zevo) — kept after they leave. */
const boardNames = new Map();

// (Zevo, the AI, has no browser: nothing is sent to it)
function send(member, msg) {
  if (member.ai) return;
  outbox.push([member.profileId, JSON.stringify(msg)]);
}
function sendAll(msg) {
  const json = JSON.stringify(msg);
  for (const m of members.values()) if (!m.ai) outbox.push([m.profileId, json]);
}
function flushOutbox() {
  if (!outbox.length) return;
  parentPort.postMessage({ op: 'send', list: outbox });
  outbox = [];
}

const memberOfPlayer = id => {
  for (const m of members.values()) if (m.player.id === id) return m;
  return null;
};

// ── Kill and drop news in the biome's chat ───────────────────────────────────
// A Super+ kill, drop or craft (game/damage.js, loot.js, commands.js) goes to
// everyone here as 'killed' / 'dropped' / 'crafted'; the browser writes the
// line (client/ui/chat.js) if its Settings want that kind and rarity.
// who = how the player is named in it — @username, a guest's tag, or Zevo —
// and user = what clicking it looks up (their profile).
function newsName(playerId) {
  const m = memberOfPlayer(playerId);
  if (!m) return null;
  if (m.info.isAI) return { who: m.info.displayName || 'Zevo', user: null };
  return m.info.username ? { who: '@' + m.info.username, user: m.info.username } : { who: m.info.tag, user: m.info.tag };
}
onGameEvent('killAnnounce', e => {
  const n = newsName(e.playerId);
  if (n) sendAll({ t: 'killed', typeId: e.typeId, tier: e.tier, boss: e.isBoss, shiny: !!e.isShiny, pct: Math.round(e.pct * 10) / 10, ...n });
  if (n && e.tier >= LOG_MOB_TIER) {
    gameLog({ kind: 'kill', typeId: e.typeId, mob: MOB_DEFS[e.typeId]?.name ?? e.typeId, tier: e.tier, boss: !!e.isBoss, shiny: !!e.isShiny,
              who: n.user ?? n.who, pct: Math.round(e.pct * 10) / 10 });
  }
});
onGameEvent('dropAnnounce', e => {
  const n = newsName(e.playerId);
  if (n) sendAll({ t: 'dropped', petalId: e.petalId, count: e.count, from: e.fromTypeId, fromTier: e.fromTier, boss: e.fromBoss, shiny: !!e.fromShiny, ...n });
  if (n && rarityTier(PETAL_TYPES[e.petalId]?.rarity) >= LOG_PETAL_TIER) {
    gameLog({ kind: 'drop', ...petalLog(e.petalId), count: e.count, who: n.user ?? n.who,
              typeId: e.fromTypeId, mob: MOB_DEFS[e.fromTypeId]?.name ?? e.fromTypeId, tier: e.fromTier, boss: !!e.fromBoss, shiny: !!e.fromShiny });
  }
});
onGameEvent('craftAnnounce', e => {
  const n = newsName(e.playerId);
  if (n) sendAll({ t: 'crafted', from: e.typeId, to: e.nextTypeId, made: e.made, used: e.used, ...n });
  if (n && rarityTier(PETAL_TYPES[e.nextTypeId]?.rarity) >= LOG_PETAL_TIER) {   // (made 0: a try that failed)
    gameLog({ kind: 'craft', ...petalLog(e.nextTypeId), made: e.made, used: e.used, who: n.user ?? n.who,
              from: PETAL_TYPES[e.typeId]?.name ?? e.typeId, fromRarity: PETAL_TYPES[e.typeId]?.rarity ?? null });
  }
});

// ── Entering and leaving ─────────────────────────────────────────────────────
/** What a player's flower shows from their info: their display name, a clan member's tag over their head, their skin. */
function applyInfo(player, info) {
  player.name    = info.displayName || 'Unnamed';
  player.clanTag = info.clanTag ?? null;
  player.skin    = typeof info.skinRef === 'string' ? info.skinRef : '';   // the custom skin it wears (server/skins.js), '' = none
  boardNames.set(player.id, info.isAI ? (info.displayName || 'Zevo') : (info.tag || player.name));
}

function enter({ profileId, save, info }) {
  const player = createPlayer({ id: `p${profileId}`, name: info.displayName || 'Unnamed' });
  applyInfo(player, info);
  const member = {
    profileId, player, info,
    view: newViewState(),
    events: [],
    ack: 0,
    meJson: null, meSentAt: 0,
    chatTimes: [],
  };
  members.set(profileId, member);
  if (save) loadSave(player, save);
  checkDaily(player);   // (a new set of challenges if the last is 24 h old; the streak's drop boost)
  checkAchievements(player, true);   // (an old save's progress, caught up without COMPLETE cards)
  if (IS_BIOME) {
    addPlayer(player);
    spawnPlayerInBiome(player, ROOM);
    tellFirstBatch(member);
  }
  // Zevo, the AI player: its brain plays this flower (server/ai/agent.js)
  if (info.isAI && IS_BIOME) {
    player.name = `${info.displayName} [AI]`;
    member.ai = createAgent(player, {
      biome: ROOM,
      say: (text, ch) => aiSay(member, text, ch),
      respawn: () => { if (player.dead) respawnAtCheckpoint(player); },
      moveBiome: biome => parentPort.postMessage({ op: 'aiMove', biome }),
      // squads are the main thread's (server/squads.js): asked like a browser's squad buttons
      squad: msg => parentPort.postMessage({ op: 'aiSquad', profileId, msg }),
      nameOf: id => memberOfPlayer(id)?.info.displayName ?? null,
    }, { brain: info.brain ?? 'learned' });
  }
  parentPort.postMessage({ op: 'entered', profileId, playerId: player.id, baseline: makeSave(player) });
  sendMe(member, true);
  sendStatus();   // (their level, for squad joins, right away)
}

function leave({ profileId }, reason = null) {
  const member = members.get(profileId);
  if (!member) { parentPort.postMessage({ op: 'left', profileId, save: null }); return; }
  if (IS_BIOME) removePlayerFromWorld(member.player);
  member.ai?.dispose();
  members.delete(profileId);
  // (anyone spectating them sees their own spot until the main thread takes them along — server/rooms.js)
  for (const o of members.values()) if (o.player.spectating === member.player) o.player.spectating = null;
  flushOutbox();   // anything still queued for them goes first
  // A run left by disconnecting keeps no checkpoint progress
  const save = member.player.disconnected ? withoutCheckpoints(makeSave(member.player)) : makeSave(member.player);
  parentPort.postMessage({ op: 'left', profileId, save, reason });
}

/**
 * An admin spectates targetId (null: stops). What they're sent is what's round
 * the target (views.js viewBox), and their page's camera follows the target
 * ({ t: 'spectate', id } — client/spectate.js). Their own flower stays put,
 * made invisible while they watch (unless it already was — /invis).
 */
function spectate({ profileId, targetId, targetName, quiet }) {
  const me = members.get(profileId);
  if (!me) return;
  const p = me.player;
  const reply = text => parentPort.postMessage({ op: 'commandReply', profileId, text });
  if (targetId == null) {
    p.spectating = null;
    if (p.invisForSpectate) {
      p.invisForSpectate = false;
      p.invis = false;
      const spot = nearestWalkable(p.x, p.y, p.radius);   // (out of any wall it drifted into)
      if (spot) { p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0; }
    }
    send(me, { t: 'spectate', id: null });
    if (!quiet) reply('Stopped spectating.');
    return;
  }
  const them = members.get(targetId);
  if (!them) { reply(`${targetName} isn't in this biome.`); return; }
  p.spectating = them.player;
  if (!p.invis) { p.invis = true; p.invisForSpectate = true; }
  send(me, { t: 'spectate', id: netIdOf(them.player), name: targetName });
  if (!quiet) reply(`Spectating ${targetName} — /unspectate to stop.`);
}

/** `save` with its checkpoint progress dropped: next time they start from the biome's spawn. */
function withoutCheckpoints(save) {
  return { ...save, checkpoints: null };
}

/** Everyone's save; `reset`: the server is shutting down, which ends every run here. */
function allSaves(reset = false) {
  return [...members.values()].map(m => ({
    profileId: m.profileId,
    save: reset && IS_BIOME ? withoutCheckpoints(makeSave(m.player)) : makeSave(m.player),
  }));
}

// ── Disconnected flowers ─────────────────────────────────────────────────────
// A player whose browser goes while they're in a biome stays in it
// (server/rooms.js): their flower stands still and slowly dies (game.js). Once
// it's dead it leaves — no respawn — and the main thread takes them out of
// their squad too.
function disconnect({ profileId }) {
  const member = members.get(profileId);
  if (member) setDisconnected(member.player);
}

/** Their browser came back (server/rooms.js resume): the flower is theirs again, from where it stands. */
function reconnect({ profileId, info }) {
  const member = members.get(profileId);
  if (!member || member.player.dead || !IS_BIOME) { parentPort.postMessage({ op: 'resumeFailed', profileId }); return; }
  const player = member.player;
  player.disconnected = false;
  player.disconnectedMs = 0;
  member.info = info;
  applyInfo(player, info);
  member.view = newViewState();   // (a new page: it gets everything again)
  member.events = [];
  member.ack = 0;
  member.inSeq = 0;   // (a reloaded page numbers its inputs from 1 again — client/net/predict.js)
  member.meJson = null;
  member.diepBoardJson = null;
  parentPort.postMessage({ op: 'resumed', profileId, playerId: player.id });
  sendMe(member, true);
}

function removeDeadDisconnected() {
  for (const m of [...members.values()]) {
    if (m.player.disconnected && m.player.dead) leave({ profileId: m.profileId }, 'dcDied');
  }
}

// ── Your own progress ("me") ─────────────────────────────────────────────────
// Sent when it changes (checked a few times a second) and right after an
// action, so the hotbar/inventory UI always settles on the server's truth.
function meOf(player) {
  return {
    xp: player.xp, level: player.level,
    hotbar: player.hotbar, bench: player.bench, inventory: player.inventory,
    craftHold: player.craftHold, craftAttempts: player.craftAttempts,
    mobKills: player.mobKills, shinyMobKills: player.shinyMobKills, spookyMobKills: player.spookyMobKills, spinSpeed: player.spinSpeed, options: player.options, tutorial: player.tutorial,
    talents: player.talents, loadouts: player.loadouts, prefs: player.prefs,
    stars: player.stars, daily: player.daily, streak: player.streak, achievements: player.achievements,
    deathCause: player.deathCause, godmode: player.godmode, viewCheckpoints: !!player.viewCheckpoints,
    _speedMult: player._speedMult, _hpBonus: player._hpBonus, _dmgBonus: player._dmgBonus,
  };
}

// What your squad mates' petals add to yours right now (Dev, 2026-10-31): their Sacrifice (your petals' DMG — a petal with
// no damage of its own: its effects), their Atmosphere you're in (your petals' hits). Sent when it changes, for the
// hotbar tooltips' "+X from Sacrifice (name)" (client/ui/hotbar.js — shared/slotBuffs.js withSquadBoosts)
// …and what your own petals give every other one (who: null — Dev): a Blood Eye's, a Corruption's and a Shiny Weird
// Eye's hits, a Shiny Faster's reload, a Sharp Eye's burst while it's open (a Shiny one's: effects, not hits), a
// Cinnamon poptart you ate. Each: { petal, rarity, who, dmg (hits — on a petal with no damage of its own only with
// effects), eff (effects, any petal), reload (the share of its reload taken off), skip (petals with this field don't
// get it), maxTier (only petals up to this rarity tier) }.
function squadBoostsOf(p) {
  const out = [];
  const r3 = v => Math.round(v * 1000) / 1000;   // (so the list only changes when a number does)
  const nameOf = id => memberOfPlayer(id)?.info.displayName || 'a squad mate';
  const loaded = loadedOf(p);
  const best = field => { let b = null; for (const id of loaded) { const pt = PETAL_TYPES[id]; if (pt?.[field] > 0 && !(b?.[field] >= pt[field])) b = pt; } return b; };
  if (p.sacrificeBoost > 0 && p.sacrificeFrom) out.push({ petal: 'Sacrifice', rarity: p.sacrificeFrom.rarity, who: nameOf(p.sacrificeFrom.id), dmg: p.sacrificeBoost, effects: true });
  if (p._atmoUntil > gameTimeMs() && p._atmoDmg > 0 && p._atmoFrom != null) {
    const giver = p._atmoFrom === p.id ? p : memberOfPlayer(p._atmoFrom)?.player;
    let rarity = null, top = 0;
    for (const id of giver ? loadedOf(giver) : []) { const pt = PETAL_TYPES[id]; if (pt?.atmoDmg > top) { top = pt.atmoDmg; rarity = pt.rarity; } }
    out.push({ petal: 'Atmosphere', rarity, who: p._atmoFrom === p.id ? null : nameOf(p._atmoFrom), dmg: p._atmoDmg, effects: false });
  }
  for (const [field, effects] of [['dmgDealtBonus', false], ['corruptBoost', false]]) {   // (a Blood Eye, a Corruption)
    const pt = best(field);
    if (pt) out.push({ petal: pt.name, rarity: pt.rarity, who: null, dmg: pt[field], effects });
  }
  if (p.spinDmg > 0) { const pt = best('spinDmgCap'); out.push({ petal: pt?.name ?? 'Weird Eye', rarity: pt?.rarity ?? null, who: null, dmg: r3(p.spinDmg) }); }
  if (p.shinyReloadCut > 0) { const pt = best('reloadCut'); out.push({ petal: pt?.name ?? 'Faster', rarity: pt?.rarity ?? null, who: null, reload: p.shinyReloadCut, skip: 'reloadCut' }); }
  if (p.sharpT > 0 && p.sharpDmg > 0) {
    const pt = best('sharpDmg');
    out.push({ petal: pt?.name ?? 'Sharp Eye', rarity: pt?.rarity ?? null, who: null, skip: 'isSharpEye',
               ...(p.sharpEffects ? { eff: p.sharpDmg } : { dmg: p.sharpDmg }), reload: p.sharpCut || 0,
               ...(isFinite(p.sharpMaxTier) ? { maxTier: p.sharpMaxTier } : {}) });
  }
  const cinnamon = flavorBuff(p, 'dmg');
  if (cinnamon > 0) out.push({ petal: 'Cinnamon Poptart', rarity: null, who: null, dmg: r3(cinnamon) });
  return out;
}
function sendSquadBoosts(member) {
  if (member.ai) return;
  const json = JSON.stringify(squadBoostsOf(member.player));
  if (json === (member.squadBoostJson ?? '[]')) return;
  member.squadBoostJson = json;
  send(member, { t: 'squadBoosts', list: JSON.parse(json) });
}

function sendMe(member, force = false) {
  const me = meOf(member.player);
  const json = JSON.stringify(me);
  const now = Date.now();
  // Lifetime stats tick every frame (time played): sent along when something
  // else changes, or every few seconds on their own.
  const statsDue = now - member.meSentAt > 5000;
  if (!force && json === member.meJson && !statsDue) return;
  member.meJson = json;
  member.meSentAt = now;
  send(member, { t: 'me', ack: member.ack, ...me, stats: member.player.stats, now });
}

// ── Game events → the browsers that should see them ──────────────────────────
const ROUTE_TO_PLAYER = ['xpGained', 'mobKilled', 'inventoryChanged', 'saveLoaded', 'playerDied', 'playerRevived', 'dropPickedUp',
                         'challengeDone', 'achievementDone'];
for (const type of ROUTE_TO_PLAYER) {
  onGameEvent(type, e => {
    const member = memberOfPlayer(e.playerId);
    if (member) member.events.push([type, e]);
  });
}

/** Events that happen at a place: everyone who can see that place gets them. */
function routeByPlace(type, x, y, r, data) {
  for (const m of members.values()) {
    if (canSee(m.player, x, y, r)) m.events.push([type, data]);
  }
}
onGameEvent('damage', e => {
  routeByPlace('damage', e.x, e.y, e.radius ?? 0, {
    x: Math.round(e.x), y: Math.round(e.y), amount: e.amount, color: e.color, radius: e.radius,
    target: knownNetId(e.target),
    ...(e.text ? { text: e.text } : {}),   // ("Dodge!")
    ...(e.heal ? { heal: 1 } : {}),        // (a green "+X" — updateHurtFlash)
  });
});
onGameEvent('mobDied', ({ mob }) => {
  routeByPlace('mobDied', mob.x, mob.y, mob.drawRadius ?? mob.radius ?? 0, { mob: fullView('mobs', mob) });
});
onGameEvent('missileDied', e => routeByPlace('missileDied', e.x, e.y, e.size ?? 0, e));
onGameEvent('petalBroken', e => routeByPlace('petalBroken', e.x, e.y, e.radius ?? 0, e));
onGameEvent('spaceFx', e => routeByPlace('spaceFx', e.x, e.y, e.radius ?? 0, e));   // (Space's petals: a Flux's swirl, waves, flashes, blasts)
onGameEvent('bossAnnouncement', e => { for (const m of members.values()) m.events.push(['bossAnnouncement', e]); });
// The Halloween event's Grim Reaper — it only ever comes from ?hallowboss or an admin's /spawn (beside them). ?hallowboss's
// (server/rooms.js summonReaper picks a random biome) rises in this biome's rarity zone of its tier (Unique, the top
// zone, for a Runic+ one — game/mobs.js randomZoneSpot) and goes for whoever comes near (game/biomeBosses.js reaper).
// Each one Omega+ is posted in #game-logs with an Event Ping (the bot's lib/gameLogs.js). Its death frees the game for the next one.
const REAPER_PING_TIER = RARITIES.indexOf('Omega');
const isWildReaper = m => !m.dead && m.typeId === 'grim_reaper' && !m.isFriendlyPet;
function reaperRisen(reaper, zone, who = null) {
  parentPort.postMessage({ op: 'reaperUp' });   // (one in the whole game at a time — server/rooms.js reaperRoom)
  if ((reaper.tier ?? 0) < REAPER_PING_TIER) return;
  gameLog({ kind: 'reaper', typeId: 'grim_reaper', mob: MOB_DEFS.grim_reaper.name, tier: reaper.tier, zone: RARITIES[zone] ?? null, who });
}
function summonReaper({ reqId, tier, by }) {
  const reply = r => parentPort.postMessage({ op: 'reaperResult', reqId, ...r });
  if (!IS_BIOME) return reply({ ok: false, code: 'noSpot' });
  if (!halloweenOn()) return reply({ ok: false, code: 'eventOff' });
  if (mobs.some(isWildReaper)) return reply({ ok: false, code: 'busy' });
  const spot = randomZoneSpot(tier, mobSize('grim_reaper', tier).radius);
  if (!spot) return reply({ ok: false, code: 'noSpot' });
  const id = spawnMobByCommand('grim_reaper', tier, false, spot.x, spot.y);
  const reaper = mobs.find(x => x.id === id);
  if (!reaper) return reply({ ok: false, code: 'noSpot' });
  const label = `${RARITIES[tier]} Grim Reaper`;
  emitGameEvent('bossAnnouncement', { label, color: rarityText(RARITIES[tier]), spawned: true });
  reaperRisen(reaper, spot.zone, by);
  reply({ ok: true, label, zone: RARITIES[spot.zone] });
}
onGameEvent('mobDied', ({ mob }) => { if (mob.typeId === 'grim_reaper' && !mob.isFriendlyPet) parentPort.postMessage({ op: 'reaperGone' }); });
// Candy Corn picked up while the event is on (any rarity, each piece): the bot's ?halloweenld counts it (server/rooms.js candyBoard)
onGameEvent('dropPickedUp', e => {
  if (!halloweenOn() || candyTierOf(e.typeId) < 0) return;
  const m = memberOfPlayer(e.playerId);
  if (m && !m.ai) parentPort.postMessage({ op: 'candyPicked', profileId: m.profileId, n: e.count ?? 1 });
});
// A line for one player only, in their chat (game/artifacts.js: a boss is already awake)
onGameEvent('playerNote', e => { const m = memberOfPlayer(e.playerId); if (m) send(m, { t: 'sys', text: e.text }); });
// A Runic+ mob spawned here: a chat line for this biome's players only

// ── Requests from a browser ──────────────────────────────────────────────────
const ARG_CHECKS = {
  str:  v => typeof v === 'string' && v.length <= 64,
  int:  v => Number.isInteger(v) && Math.abs(v) <= 1e9,
  bool: v => typeof v === 'boolean',
  row:  v => v === 'hotbar' || v === 'bench',
  code: v => typeof v === 'string' && v.length <= MAX_IMPORT_CHARS,
  prefs: v => cleanPrefs(v) !== null,
  // [[typeId, count], …]: each petal once, a whole count
  absorb: v => Array.isArray(v) && v.length > 0 && v.length <= ABSORB_MAX_KINDS
    && v.every(e => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && e[0].length <= 64
                    && Number.isInteger(e[1]) && e[1] > 0 && e[1] <= 1e9)
    && new Set(v.map(e => e[0])).size === v.length,
};

function runAction(member, n, a) {
  const p = member.player;
  switch (n) {
    case 'equip':    return commands.equipFromInventory(p, a[0], a[1], a[2]);
    case 'move':     return commands.moveSlot(p, a[0], a[1], a[2], a[3]);
    case 'unequip':  return commands.unequipToInventory(p, a[0], a[1]);
    case 'swap':     return commands.swapWithBench(p, a[0]);
    case 'refresh':  return commands.refreshPetals(p);
    case 'holdAdd':  return commands.addToCraftHold(p, a[0], Math.max(1, a[1]));
    case 'holdBack': return commands.returnCraftHold(p, a[0] < 0 ? Infinity : a[0]);
    case 'craft':    return commands.craftFromHold(p);
    case 'absorb':   return commands.absorbPetals(p, a[0]);
    case 'ghostShopBuy': return IS_BIOME ? commands.buyFromGhostShop(p, a[0], a[1]) : null;   // (the Ghost Flower's shop — game/commands.js)
    case 'candyConvert': {   // (the Ghost Flower — game/commands.js; the credits go to the bot through server/rooms.js)
      if (!IS_BIOME || !member.info.linked) return null;
      const r = commands.convertCandy(p, a[0]);
      if (r) parentPort.postMessage({ op: 'candy', profileId: member.profileId, credits: r.credits,
                                      lost: r.converted.map(([id, n]) => [PETAL_TYPES[id]?.rarity ?? id, n]) });
      return r;
    }
    case 'respawn':  if (IS_BIOME && p.dead) respawnAtCheckpoint(p); return true;
    case 'killSelf': if (IS_BIOME && !p.dead && !p.cc) killPlayerSelf(p); return true;
    case 'cc':       return IS_BIOME ? catKey(p, a[0]) : false;   // (the Cartoon Cat's keys — game/cartoonCat.js)
    case 'autoEquip': commands.setAutoEquipDrops(p, a[0]); return true;
    case 'tutorial': commands.setTutorialStep(p, a[0]); return true;
    case 'prefs':    return commands.setPrefs(p, a[0]);
    case 'talentUp':    return commands.upgradeTalent(p, a[0], a[1]);
    case 'talentReset': return commands.resetTalents(p);
    case 'loadoutSave':   return commands.saveLoadout(p, a[0], a[1], a[2]);
    case 'loadoutUpdate': return commands.updateLoadout(p, a[0], a[1], a[2]);
    case 'loadoutEquip': {
      // One equip a second at most (a little slack for the network): a
      // loadout swap re-equips the whole ring, so it mustn't be spammable
      const now = Date.now();
      if (now - (member.loadoutEquipAt ?? 0) < LOADOUT_EQUIP_COOLDOWN_MS - 150) return { limited: true };
      member.loadoutEquipAt = now;
      return commands.equipLoadout(p, a[0]);
    }
    case 'loadoutDelete': return commands.deleteLoadout(p, a[0]);
    case 'loadoutRename': return commands.renameLoadout(p, a[0], a[1]);
    case 'loadoutMove':   return commands.moveLoadout(p, a[0], a[1]);
    case 'loadoutImport': return commands.importLoadouts(p, a[0]);
    case 'claimChallenge':
    case 'claimStreak': {
      // One claim every CLAIM_GAP_MS at most (a little slack for the network)
      const now = Date.now();
      if (now - (member.claimAt ?? 0) < CLAIM_GAP_MS - 150) return { limited: true };
      const r = n === 'claimStreak' ? claimStreak(p, now) : claimChallenge(p, a[0]);
      if (r) member.claimAt = now;
      if (n === 'claimStreak') p._dropMult = dropMultAt(p, now);
      return r;
    }
  }
  return null;
}

function onAction(member, msg) {
  const spec = typeof msg.n === 'string' && Object.hasOwn(ACTIONS, msg.n) ? ACTIONS[msg.n] : null;
  const args = Array.isArray(msg.a) ? msg.a : [];
  const seq = Number.isInteger(msg.seq) ? msg.seq : 0;
  let result = null;
  if (spec && args.length === spec.length && spec.every((type, i) => ARG_CHECKS[type](args[i]))) {
    result = runAction(member, msg.n, args);
  }
  member.ack = Math.max(member.ack, seq);
  if (RESULT_ACTIONS.includes(msg.n)) send(member, { t: 'res', seq, r: result });
  sendMe(member, true);
}

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

function onInput(member, msg) {
  const input = member.player.input;
  // Its number: the snapshots echo the last one applied (iq), so the browser can replay the rest (client/net/predict.js)
  if (Number.isInteger(msg.q) && msg.q > (member.inSeq ?? 0)) member.inSeq = msg.q;
  let mx = num(msg.mx, -1, 1), my = num(msg.my, -1, 1);
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  input.moveX = mx;
  input.moveY = my;
  input.attack = !!msg.a;
  input.defend = !!msg.d;
  input.spin = Math.sign(num(msg.s, -1, 1));
  const bonus = visionOf(member.player);   // (Antennae or the Vision talent, the better one)
  const max = member.player.cc ? ccMaxViewHalf() : maxViewHalf(bonus);   // (the Cartoon Cat zooms out as far as it likes)
  input.viewHalfW = num(msg.vw, 100, max.w);
  input.viewHalfH = num(msg.vh, 100, max.h);
  input.viewRange = num(msg.vr, 100, Math.max(max.w, max.h));
  // The mob whose damage leaderboard this browser shows (its net id; 0 = none)
  member.boardId = Number.isInteger(msg.lb) && msg.lb > 0 ? msg.lb : 0;
  // Where the mouse is, from the flower — never further than the view (a tank petal's drones go there).
  // The Cartoon Cat's view is centred up its body, not on its feet: twice that, so its hand reaches the top of the screen
  const aimMult = member.player.cc ? 2 : 1;
  input.aimX = num(msg.ax, -input.viewHalfW * aimMult, input.viewHalfW * aimMult);
  input.aimY = num(msg.ay, -input.viewHalfH * aimMult, input.viewHalfH * aimMult);
}

/** At most 5 lines (or commands) in 5 seconds — for players and Zevo alike. */
function chatAllowed(member) {
  const now = Date.now();
  member.chatTimes = member.chatTimes.filter(t => now - t < 5000);
  if (member.chatTimes.length >= 5) return false;
  member.chatTimes.push(now);
  return true;
}

/** "5h 12m", "3m", "40s" */
function waitText(ms) {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

/**
 * /claim (anyone): the daily streak's reward if it's open, and every finished
 * challenge's Stars — the same claims as the Daily panel's buttons, and like
 * them at most one every CLAIM_GAP_MS.
 */
function claimDaily(member) {
  const p = member.player, now = Date.now();
  if (now - (member.claimAt ?? 0) < CLAIM_GAP_MS - 150) return 'Slow down — one claim every 2 seconds.';
  const got = [];
  const streak = claimStreak(p, now);
  if (streak) {
    p._dropMult = dropMultAt(p, now);
    got.push(`day ${streak.day} of your daily streak (${streak.mult}× drops for an hour)`);
  }
  let stars = 0, n = 0;
  (p.daily?.set ?? []).forEach((c, i) => { const r = claimChallenge(p, i); if (r) { stars += r.stars; n++; } });
  if (n) got.push(`${n} challenge${n > 1 ? 's' : ''} (+${stars} Stars)`);
  if (!got.length) return `Nothing to claim yet — your next streak reward opens in ${waitText(streakState(p.streak, now).waitMs)}.`;
  member.claimAt = now;
  return `Claimed ${got.join(' and ')}!`;
}

function onChat(member, msg) {
  const text = String(msg.text ?? '').trim().slice(0, CHAT_MAX_CHARS);
  if (!text) return;
  if (!chatAllowed(member)) { send(member, { t: 'sys', text: 'Slow down — too many messages.' }); return; }

  const p = member.player;
  if (text.startsWith('/')) {
    // /cartooncat: vyx's alone (Dev) — becoming the Cartoon Cat and back (game/cartoonCat.js)
    if (text.toLowerCase() === '/cartooncat') {
      const reply = member.info.username?.toLowerCase() !== 'vyx' ? 'Commands are only for admins.'
        : !IS_BIOME ? 'Use it inside a biome.' : toggleCartoonCat(p);
      send(member, { t: 'sys', text: reply });
      // It just came: every chat in the game gets a glitchy line, no [Server] (Dev — client/ui/chat.js 'glitch')
      if (p.cc?.phase === 'open' && p.cc.t === 0) parentPort.postMessage({ op: 'broadcast', msg: { t: 'glitch', text: 'Something not too friendly has shifted into your reality...' } });
      return;
    }
    // (/claim is anyone's; every other command is an admin's — chatCommands.js)
    const reply = /^\/claim$/i.test(text) ? claimDaily(member) : runChatCommand(p, text, member.info.isAdmin, IS_BIOME);
    send(member, { t: 'sys', text: reply });
    sendMe(member, true);
    return;
  }
  postChatLine(member, text, msg.ch === 'squad' || msg.ch === 'clan' ? msg.ch : 'global');
}

/** Zevo says something in this biome's chat or its squad's (never a command). */
function aiSay(member, text, ch = 'global') {
  text = String(text ?? '').trim().replace(/^\/+/, '').slice(0, CHAT_MAX_CHARS);
  if (ch === 'squad' && !squadOf(member.player.id)) ch = 'global';   // (left meanwhile)
  if (text && chatAllowed(member)) postChatLine(member, text, ch);
}

/** `member`'s chat line `text` on channel `ch` ('global' | 'squad' | 'clan'). */
function postChatLine(member, text, ch) {
  const p = member.player;
  commands.recordChatSent(p);
  const line = {
    t: 'chat', ch,
    id: p.id,   // (whose flower its chat bubble floats over — client/render/chatBubbles.js)
    lvl: p.level + 1, tag: member.info.tag, name: member.info.displayName || 'Unnamed',
    color: rarityText(highestHotbarRarity(p)), text,
  };
  // Global: everyone in this room. Squad / clan: the main thread hands it to
  // every member, wherever they are (server/squads.js, server/clans.js).
  if (line.ch === 'global') {
    sendAll(line);
    // Zevo hears the biome's chat (it answers questions — server/ai/chat.js)
    for (const m of members.values()) if (m.ai && m !== member) m.ai.hearChat({ id: p.id, name: line.name, tag: line.tag, text, ch: 'global' });
  } else parentPort.postMessage({ op: line.ch === 'clan' ? 'clanChat' : 'squadChat', profileId: member.profileId, line });
}

function onMessage(member, msg) {
  switch (msg.t) {
    case 'in':   return onInput(member, msg);
    case 'act':  return onAction(member, msg);
    case 'chat': return onChat(member, msg);
  }
}

parentPort.on('message', m => {
  switch (m.op) {
    case 'enter': enter(m); break;
    case 'leave': leave(m); break;
    case 'disconnected': disconnect(m); break;
    case 'reconnected': reconnect(m); break;
    case 'msg': {
      const member = members.get(m.profileId);
      // One player's odd request mustn't take the whole biome down with it
      try { if (member) onMessage(member, m.data); }
      catch (e) { console.error(`[${ROOM}] request ${JSON.stringify(m.data).slice(0, 120)} failed:`, e); }
      break;
    }
    case 'info': {
      const member = members.get(m.profileId);
      if (member) { Object.assign(member.info, m.info); applyInfo(member.player, member.info); }
      break;
    }
    case 'command': {   // an admin's command aimed at one of our players (server/rooms.js)
      const member = members.get(m.profileId);
      const self = m.by.profileId === m.profileId;
      let reply = `${m.targetName} just left that room — try again.`;
      if (member) {
        try { reply = runChatCommand(member.player, m.text, true, IS_BIOME, true); }
        catch (e) { console.error(`[${ROOM}] command ${m.text.slice(0, 120)} failed:`, e); reply = 'That command failed.'; }
        sendMe(member, true);
        if (!self) send(member, { t: 'sys', text: `${m.by.name} used ${m.text.split(/\s+/)[0]} on you.` });
      }
      parentPort.postMessage({ op: 'commandReply', profileId: m.by.profileId, text: self ? reply : `${m.targetName}: ${reply}` });
      break;
    }
    case 'teleport': {   // an admin's /goto or /bring (server/rooms.js): moverId goes beside toId
      const mover = members.get(m.moverId), dest = members.get(m.toId);
      const self = m.moverId === m.by.profileId;
      let reply;
      if (!mover || !dest) reply = `${m.targetName} just left this biome — try again.`;
      else if (mover.player.dead) reply = self ? "You can't teleport while dead." : `${m.targetName} is dead.`;
      else {
        teleportNextTo(mover.player, dest.player);
        sendMe(mover, true);
        if (!self) send(mover, { t: 'sys', text: `${m.by.name} brought you to them.` });
        reply = self ? `Teleported to ${m.targetName}.` : `Brought ${m.targetName} to you.`;
      }
      parentPort.postMessage({ op: 'commandReply', profileId: m.by.profileId, text: reply });
      break;
    }
    case 'spectate': spectate(m); break;   // an admin's /spectate or /unspectate (server/rooms.js)
    case 'flush': parentPort.postMessage({ op: 'saves', list: allSaves(true), flushId: m.flushId }); break;   // (only at shutdown)
    case 'squads': setSquadTable(m.list); break;   // who is with whom (loot pool, pets)
    case 'logTiers': LOG_MOB_TIER = m.mob; LOG_PETAL_TIER = m.petal; break;   // (the bot's /game-log — #game-logs above)
    case 'ghostFlower': if (m.on) spawnGhostFlower(); else despawnGhostFlower(); break;
    case 'reaper': summonReaper(m); break;   // (?hallowboss — server/rooms.js summonReaper)   // (an admin's /spawnghostflower, /despawnghostflower — server/rooms.js)
    // Zevo: a squad chat line it's sent as a member (it hears it like a player reads it),
    // and what became of its squad request (server/ai/squad.js)
    case 'aiHear':
    case 'aiSquadResult': {
      const ai = members.get(m.profileId)?.ai;
      try {
        if (ai && m.op === 'aiHear') ai.hearChat({ ...m.line, ch: 'squad' });
        else if (ai) ai.squadResult(m.result);
      } catch (e) { console.error(`[${ROOM}] AI ${m.op} failed:`, e); }
      break;
    }
  }
  sendLobbyEvents();
  flushOutbox();
});

// ── The loop ─────────────────────────────────────────────────────────────────
// ── Damage flash ─────────────────────────────────────────────────────────────
// Anything that lost HP since last time — whatever hurt it — flashes red
// (hurtFlash, carried by snapshots; client/render/hurtFlash.js draws it).
// Watching HP here, rather than at every place damage is dealt, means no kind
// of damage can be missed; damage that keeps coming keeps it topped up. A
// smaller max HP (an HP petal unequipped) isn't damage, so it doesn't count.
// The room also counts flashes down, so snapshots can tell a new hit from an old one.
//
// Heal numbers: the same watch the other way round. A flower or mob whose HP
// went up shows a green "+X" over it (a 'damage' event with heal: the browser's
// render/damagePopups.js), whatever healed it. Heals are added up and sent every
// HEAL_EVERY_MS, so regeneration that comes every tick is one growing number, not
// a stream of events. Coming back to life (a respawn, a revive), a bigger max HP,
// a target dummy's and a /godmode flower's refills aren't healing.
const HEAL_EVERY_MS = 250;
const HEAL_COLOR = '#4dff7c';
let healClock = 0;
function updateHurtFlash(ms) {
  const check = (o, heals = false) => {
    if (o.hurtFlash > 0) o.hurtFlash = Math.max(0, o.hurtFlash - ms);
    if (o._flashHp !== undefined && o.maxHp === o._flashMaxHp) {
      if (o.hp < o._flashHp) o.hurtFlash = HURT_FLASH_MS;
      else if (heals && o.hp > o._flashHp && !o.dead && !o._flashDead && !o.isDummy && !o.godmode) o._healed = (o._healed ?? 0) + o.hp - o._flashHp;
    }
    o._flashHp = o.hp;
    o._flashMaxHp = o.maxHp;
    o._flashDead = !!o.dead;
  };
  for (const p of players) { check(p, true); for (const pt of p.petals) check(pt); }
  for (const m of mobs) check(m, true);
  for (const b of bossPeas) check(b);
  for (const r of bossRoses) check(r);

  healClock += ms;
  if (healClock < HEAL_EVERY_MS) return;
  healClock = 0;
  const sendHeal = o => {
    if (!(o._healed >= 1) || o.dead) { if (o.dead) o._healed = 0; return; }
    const n = Math.floor(o._healed);
    o._healed -= n;   // (the fraction left waits for the next one)
    emitGameEvent('damage', { x: o.x, y: o.y, amount: n, color: HEAL_COLOR, radius: o.drawRadius ?? o.radius ?? 0, target: o, heal: true });
  };
  for (const p of players) sendHeal(p);
  for (const m of mobs) sendHeal(m);
}

function sendSnapshots() {
  const tick = getWorldTick(), now = tick * TICK_MS;
  for (const m of members.values()) {
    if (m.ai) { m.events.length = 0; continue; }   // (Zevo hears its own events — server/ai/agent.js)
    const snap = buildSnapshot(m.player, m.view, tick, now);
    if (m.inSeq) snap.iq = m.inSeq;   // (the last of its inputs this snapshot has in it)
    // (its own flower's walking, for Predict Movement to carry on from — client/net/predict.js; left out at rest)
    const wvx = Math.round(m.player.walkVx * 100) / 100, wvy = Math.round(m.player.walkVy * 100) / 100;
    if (wvx || wvy) snap.wv = [wvx, wvy];
    if (m.events.length) { snap.ev = m.events; m.events = []; }
    send(m, snap);
  }
}

// The homescreen has no snapshots to carry events, so they go on their own.
function sendLobbyEvents() {
  if (IS_BIOME) return;
  for (const m of members.values()) {
    if (m.events.length) { send(m, { t: 'ev', ev: m.events }); m.events = []; }
  }
}

// Everyone's level, HP, face and petals (top row and bench), for squad views (the main
// thread sends each squad's members what changed).
function sendStatus() {
  const list = [...members.values()].map(({ profileId, player: p }) => ({
    profileId, lvl: p.level + 1, xpf: Math.floor((levelFromXp(p.xp) % 1) * 100) / 100,
    hp: Math.ceil(p.hp), maxHp: Math.ceil(p.maxHp),
    dead: p.dead, spawned: IS_BIOME, atk: !!p.input.attack, def: !!p.input.defend,
    mv: !!p.isMoving, ang: Math.round(p.moveAngle * 10) / 10,
    hotbar: p.hotbar, bench: p.bench, skin: p.skin ?? '',
  }));
  if (list.length) parentPort.postMessage({ op: 'status', list });
}

/**
 * Each player's squad mates in this biome — their minimap dots (a dead mate's
 * stays where they fell), and their face / movement / HP for the squad HUD
 * when they're off screen. With Settings → Show Clan Mates on, also their
 * clan mates here who aren't in their squad — just a blue dot each (clan: 1).
 * Nobody else's.
 */
function sendRoster() {
  const bySquad = new Map();   // squad code → [members here]
  const byClan  = new Map();   // clan tag → [members here] (tags are unique)
  const add = (map, key, m) => { if (!map.has(key)) map.set(key, []); map.get(key).push(m); };
  for (const m of members.values()) {
    const code = squadOf(m.player.id);
    if (code) add(bySquad, code, m);
    if (m.player.clanTag) add(byClan, m.player.clanTag.toLowerCase(), m);
  }
  for (const m of members.values()) {
    const code = squadOf(m.player.id);
    const clanMates = m.player.clanTag && m.player.prefs?.['s.showClanMates']
      ? byClan.get(m.player.clanTag.toLowerCase())
          .filter(o => o !== m && !o.player.invis && (!code || squadOf(o.player.id) !== code))   // (an /invis admin has no dot here at all; a squad mate is pink instead)
          .map(({ player: p }) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y), clan: 1, ...(p.dead ? { dead: 1 } : null) }))
      : [];
    const list = (code ? bySquad.get(code) : [])
      .filter(o => o !== m && (!o.player.invis || o.player.cc))   // (an /invis admin has no minimap dot — the Cartoon Cat does)
      .map(({ player: p }) => ({
        id: p.id, x: Math.round(p.x), y: Math.round(p.y),
        hp: Math.ceil(p.hp), maxHp: Math.ceil(p.maxHp), sh: Math.ceil(p.shield ?? 0), msh: Math.ceil(p.maxShield ?? 0),
        atk: p.input.attack ? 1 : 0, def: p.input.defend ? 1 : 0,
        mv: p.isMoving ? 1 : 0, ang: Math.round(p.moveAngle * 100) / 100,
        ...(p.dead ? { dead: 1 } : null),
        ...(p.cc ? { cc: 1 } : null),   // (the Cartoon Cat: a black circle in the squad HUD — client/ui/levelHud.js)
      }))
      .concat(clanMates);
    if (!list.length && m.rosterEmpty) continue;   // (told already)
    m.rosterEmpty = !list.length;
    send(m, { t: 'roster', list });
  }
}

// ── Daily challenges + streak (wall clock — game/daily.js never reads one) ──
/** A new set of challenges once the last is 24 h old, and the streak's drop boost right now. */
function checkDaily(player) {
  const now = Date.now();
  rollDailyIfDue(player, now);
  player._dropMult = dropMultAt(player, now);
}

// ── Mob leaderboards ─────────────────────────────────────────────────────────
// Each browser names the mob it shows a damage leaderboard for (the closest
// one on its screen at the rarity its settings ask for — client/ui/mobLeaderboard.js).
// It's sent that mob's top 10 by damage (mob.damageBy, pets counting for their
// owner) as % of the mob's max HP, plus its own place if lower; rows are
// tagged you / squad mate. Only a mob the player can see, only when it changed.
const BOARD_EVERY_MS = 200;
const BOARD_SIZE = 10;

function boardRow(id, dealt, rank, mob, player, mySquad) {
  const kind = id === player.id ? 1 : mySquad && squadOf(id) === mySquad ? 2 : 0;
  return { n: boardNames.get(id) ?? 'Unknown', p: Math.round(dealt / mob.maxHp * 1e6) / 1e4, k: kind, r: rank };
}

function sendBoards() {
  let byId = null;   // net id → mob, built once for everyone who asks
  for (const m of members.values()) {
    if (m.ai || !m.boardId) continue;
    if (!byId) {
      byId = new Map();
      for (const mob of mobs) {
        const id = knownNetId(mob);
        if (id != null && !mob.dead) byId.set(id, mob);
      }
    }
    const mob = byId.get(m.boardId);
    const p = m.player;
    let msg;
    if (!mob || !(mob.maxHp > 0) || !canSee(p, mob.x, mob.y, mob.radius ?? 0)) msg = { t: 'mlb', id: m.boardId, rows: [] };
    else {
      const ranked = Object.entries(mob.damageBy ?? {}).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
      const mySquad = squadOf(p.id);
      const rows = ranked.slice(0, BOARD_SIZE).map(([id, d], i) => boardRow(id, d, i + 1, mob, p, mySquad));
      const mine = ranked.findIndex(e => e[0] === p.id);
      if (mine >= BOARD_SIZE) rows.push(boardRow(p.id, ranked[mine][1], mine + 1, mob, p, mySquad));
      msg = { t: 'mlb', id: m.boardId, rows };
    }
    const json = JSON.stringify(msg);
    if (json === m.boardJson) continue;
    m.boardJson = json;
    outbox.push([m.profileId, json]);
  }
}

// ── The Diep biome's Scoreboard ──────────────────────────────────────────────
// In place of the minimap there (client/ui/diepScoreboard.js): every living
// tank and player by kills (game/diep.js diepLeaders) — the top 10, plus your
// own row with your place if you're lower. Rows: { i: its id, n: name (a tank's class, a
// player's username / guest tag), t: team ('red' / 'blue' / 'player'),
// k: kills, c: a tank's class, r: its rarity tier, y: 1 = you, p: place }.
const DIEP_BOARD_EVERY_MS = 500;
const DIEP_BOARD_SIZE = 10;
function sendDiepBoards() {
  const all = diepLeaders(Infinity);
  const row = (e, i, me) => {
    const r = { i: e.id, n: e.player ? (boardNames.get(e.id) ?? e.name) : e.name, t: e.team, k: e.kills };
    if (!e.player) { r.c = e.cls; r.r = e.tier; }
    if (e.id === me) r.y = 1;
    if (i >= DIEP_BOARD_SIZE) r.p = i + 1;
    return r;
  };
  for (const m of members.values()) {
    if (m.ai) continue;
    const me = m.player.id;
    const rows = all.slice(0, DIEP_BOARD_SIZE).map((e, i) => row(e, i, me));
    const mine = all.findIndex(e => e.id === me);
    if (mine >= DIEP_BOARD_SIZE) rows.push(row(all[mine], mine, me));
    const json = JSON.stringify({ t: 'dsb', rows });
    if (json === m.diepBoardJson) continue;
    m.diepBoardJson = json;
    outbox.push([m.profileId, json]);
  }
}

let last = performance.now();
let lastSnapTick = 0, lastMe = 0, lastRoster = 0, lastStatus = 0, lastSave = Date.now(), lastBoards = 0, lastDaily = 0, lastDiepBoard = 0;
let lastAiError = -Infinity;

// How long the world takes: a warning in the server's terminal when a biome
// gets too busy to keep 60 ticks a second comfortably (a tick has 16.7 ms).
const SLOW_TICK_MS = 8;
let busyMs = 0, busyTicks = 0, busySince = performance.now();
function noteBusy(ms, ticks) {
  busyMs += ms; busyTicks += ticks;
  statsMs += ms; statsTicks += ticks;
  if (performance.now() - busySince < 10_000) return;
  const avg = busyTicks ? busyMs / busyTicks : 0;
  if (process.env.TICK_STATS) console.log(`[${ROOM}] ${busyTicks} ticks, ${avg.toFixed(2)} ms per tick`);
  if (busyTicks >= 300 && avg > SLOW_TICK_MS) console.warn(`[${ROOM}] busy: ${avg.toFixed(1)} ms per tick with ${members.size} player(s)`);
  busyMs = 0; busyTicks = 0; busySince = performance.now();
}

// How this room is doing, for the Discord bot's ?serverinfo (server/rooms.js serverInfo): every
// STATS_EVERY_MS, its mobs alive and how long a tick took on average since the last report
const STATS_EVERY_MS = 2000;
const STARTED_AT = Date.now();
let statsMs = 0, statsTicks = 0, lastStats = 0;
function sendRoomStats(now) {
  lastStats = now;
  let alive = 0;
  if (IS_BIOME) for (const m of mobs) if (!m.dead && !m.isFriendlyPet && !m.isDummy) alive++;
  parentPort.postMessage({ op: 'roomStats', stats: {
    mobs: alive, tickMs: statsTicks ? Math.round(statsMs / statsTicks * 100) / 100 : 0, startedAt: STARTED_AT,
  } });
  statsMs = 0; statsTicks = 0;
}

// How long the loop sleeps (Dev: the game lagged randomly — the host is a 4-core laptop chip, and every room
// waking ~1,000 times a second for nothing, whenever Windows' timer runs fine, is threads fighting the rooms
// with players): a biome room in use till its next tick is due, less WAKE_SLACK_MS (a timer can wake late —
// and on Windows' coarse ~15.6 ms clock any short wait is one step anyway); everyone else IDLE_WAIT_MS
const WAKE_SLACK_MS = 2, IDLE_WAIT_MS = 50;
let untilTick = 0;

function loop() {
  const now = performance.now();
  const dt = Math.min(now - last, 250);
  last = now;
  if (now - lastStats >= STATS_EVERY_MS) sendRoomStats(now);

  if (members.size) {
    if (IS_BIOME) {
      const before = getWorldTick();
      for (const m of members.values()) {
        if (!m.ai) continue;
        // Its brain sets its controls, like a browser's input would (one bad think mustn't stop the biome)
        try { m.ai.update(dt); }
        catch (e) {
          if (now - lastAiError > 10_000) { lastAiError = now; console.error(`[${ROOM}] AI update failed:`, e); }
        }
      }
      untilTick = (1 - advanceWorld(dt)) * TICK_MS;   // (how far off its next tick is)
      const ran = getWorldTick() - before;
      if (ran) { updateHurtFlash(ran * TICK_MS); removeDeadDisconnected(); }
      if (getWorldTick() - lastSnapTick >= SNAP_TICKS) {
        lastSnapTick = getWorldTick();
        sendSnapshots();
      }
      const tookMs = performance.now() - now;
      noteBusy(tookMs, ran);
      if (tookMs > 1000) netLog('slow', `${ROOM}: one update took ${(tookMs / 1000).toFixed(1)} s (${ran} ticks, ${members.size} player(s), ${mobs.length} mobs)`);
      if (now - lastRoster >= ROSTER_EVERY_MS) { lastRoster = now; sendRoster(); }
      if (now - lastBoards >= BOARD_EVERY_MS) { lastBoards = now; sendBoards(); }
      if (ROOM === DIEP_ROOM && now - lastDiepBoard >= DIEP_BOARD_EVERY_MS) { lastDiepBoard = now; sendDiepBoards(); }
    } else {
      // The homescreen: no world, but the ring (and the Speed dial) still turn
      for (const m of members.values()) commands.turnRingIdle(m.player, dt);
      sendLobbyEvents();
    }
    if (now - lastStatus >= STATUS_EVERY_MS) { lastStatus = now; sendStatus(); }
    if (now - lastDaily >= 1000) { lastDaily = now; for (const m of members.values()) { checkDaily(m.player); checkAchievements(m.player); } }
    if (now - lastMe >= ME_EVERY_MS) {
      lastMe = now;
      for (const m of members.values()) { sendMe(m); sendSquadBoosts(m); }
    }
  }
  if (Date.now() - lastSave >= SAVE_EVERY_MS) {
    lastSave = Date.now();
    if (members.size) parentPort.postMessage({ op: 'saves', list: allSaves() });
  }
  flushOutbox();
  // Till its next tick is due: on Windows' coarse ~15.6 ms clock that's the next step, whatever it's asked
  // (asking for 4 ms after the work once meant a busy room slept a whole extra 15.6, ran its ticks two at a time
  // and sent its snapshots unevenly) — so never more than a tick, and as soon as it can when one is near.
  // (The world keeps its own time: advanceWorld runs whatever is due.)
  const busy = IS_BIOME && members.size;
  setTimeout(loop, busy ? Math.max(1, Math.min(TICK_MS, untilTick) - WAKE_SLACK_MS) : IDLE_WAIT_MS);
}
loop();
parentPort.postMessage({ op: 'ready' });
