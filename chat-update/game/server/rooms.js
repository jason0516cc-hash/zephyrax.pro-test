// rooms.js — the game's rooms and who is in which. Runs on the main thread.
//
// Each room is a worker thread (room/worker.js) with its own copy of the
// game: 'lobby' (the homescreen) and one per biome. A player's live state is
// always in exactly ONE room. Moving between rooms is a handoff:
//
//   1. the old room takes the player out and hands back their save,
//   2. this thread writes the save to the database,
//   3. only then does the new room get it.
//
// Rooms also send everyone's saves every 5 seconds. So a crash loses a
// few seconds at most, and petals can never be duplicated by switching
// biomes or disconnecting halfway. This is the only place saves are written.
//
// A player whose browser goes while they're in a biome isn't taken out:
// their flower stays, slowly dies, and only then leaves (and their squad).
// Coming back before that brings them out of it, to the homescreen. A run
// ended by a disconnect or a server restart keeps no checkpoint progress.
//
// One live connection per account: a second tab in the same browser takes
// over (the old tab is told 'otherTab'); the account opened from a different
// browser kicks both ('elsewhere').
//
// Clans (clans.js) are kept in the database; this thread tells each room a
// member's clan tag (for their flower) and passes clan requests and chat on.
//
// Zevo, the AI player, is an entry with no connection (ai/host.js): admins
// switch it on and off (/enable-AI, /disable-AI), and its saves and moves go
// through the same handoffs as everyone's.
//
// The Diep biome (diep.js) is a hidden biome room: it only runs while an admin
// has it switched on, and only accounts an admin unlocked may play it.
import { Worker } from 'node:worker_threads';
import { cleanSave, freshSave } from '../system/shared/save.js';
import { BIOME_ROOMS, DIEP_ROOM, SQUAD_OPS } from '../system/shared/netProtocol.js';
import { REAPER_COOLDOWN_MS } from '../system/shared/halloween.js';
import { CLAN_OPS } from '../system/shared/clanRules.js';
import { cleanDisplayName } from '../system/shared/accountRules.js';
import { allowTry } from './rateLimit.js';
import { createSquads } from './squads.js';
import { createClans } from './clans.js';
import { createProfiles } from './profiles.js';
import { createLeaderboards } from './leaderboards.js';
import { PROFILE_OPS } from '../system/shared/profileRules.js';
import { createAiHost } from './ai/host.js';
import { createDiep } from './diep.js';
import { createSkinCommands, skinRefOf } from './skins.js';
import { createGameStudioCommands, liveStudioChanges, applyStudioChanges } from './gameStudio.js';
import { netLog } from './netLog.js';
import { tellBot, tellBotKept, restoreKeptBotNews } from './discord.js';
import { createPetalUsage } from './petalUsage.js';
import { createServerReset, BOOT_ID } from './serverReset.js';
import { CHAT_BADGES } from './config.js';

const ROOM_IDS = ['lobby', ...BIOME_ROOMS];
/** A room a player can be out in the world in (not the homescreen). */
const isWorldRoom = id => BIOME_ROOMS.includes(id) || id === DIEP_ROOM;
const FLUSH_TIMEOUT_MS = 3000;

/**
 * Starts every room. Returns what the socket layer (ws.js) and the API use:
 * connect / message / disconnect for a connection, kickSessions, shutdown.
 */
/** restart(): the server restarts (index.js restartServer) — at the end of a /serverreset countdown. */
export function startRooms(db, { restart } = {}) {
  const workers = new Map();    // roomId → Worker
  const profiles = new Map();   // profileId → entry (below)
  //   entry: { id, conn, room, state: 'entering'|'in'|'leaving'|null, next,
  //            displayName, savedJson, clanId, clanTag } — Zevo's also has ai: true, info, and never a conn
  const roomStats = new Map();  // roomId → { mobs, tickMs, startedAt, at } — the room's last report (room/worker.js)
  const flushWaits = new Map(); // flushId → resolve
  let nextFlushId = 1;
  let shuttingDown = false;
  let resetting = false;        // an admin's /updategamestudiochanges is restarting every room
  let resetQuiet = false;       // …and the new worlds' first batches aren't told (the Halloween event's on / off)
  // The Halloween event (system/shared/halloween.js): { on, npc } — on: every room's world has it; npc: an admin put
  // the Ghost Flower in the Garden. Kept between restarts; each room gets it with its workerData
  let halloween = db.getState('halloween') ?? { on: false, npc: false };
  restoreKeptBotNews(db);       // (Server Credits still owed to someone when the game last stopped — discord.js)
  let reaperRoom = null;        // where the Grim Reaper is (one in the whole game at a time) — summonReaper
  const reaperWaits = new Map(); // request id → resolve (a room's answer)
  let nextReaperReq = 1;
  let reaperReadyAt = db.getState('reaperReadyAt') ?? 0;   // ?hallowboss's cooldown (REAPER_COOLDOWN_MS) — kept, so a restart doesn't skip it
  let reaperRising = false;     // a ?hallowboss is asking the rooms (so a second one at the same moment is 'busy')
  // ?halloweenld (the bot — candyBoard): profileId → [Candy Corn picked up, Candy Corn turned in, the credits it made],
  // counted while the event is on; ?hallowldr clears it. Kept between restarts
  const candyBoard = new Map(Object.entries(db.getState('candyBoard') ?? {}).map(([id, v]) => [Number(id), v]));
  const saveCandyBoard = () => { candyDirty = false; db.setState('candyBoard', Object.fromEntries(candyBoard)); };
  // (pickups come often — Spooky nests, the Reaper's ghosts: written at most every few seconds, and at shutdown)
  let candyDirty = false;
  setInterval(() => { if (candyDirty) saveCandyBoard(); }, 5000).unref();
  const candyRow = pid => { if (!candyBoard.has(pid)) candyBoard.set(pid, [0, 0, 0]); return candyBoard.get(pid); };
  // { mob, petal }: the lowest rarities #game-logs wants (the bot's /game-log — setLogTiers), kept between restarts so a
  // room's first batch is logged by them before the bot is heard from; null = the rooms' own
  let logTiers = db.getState('gameLog') ?? null;

  // Squads span rooms, so they live here (squads.js)
  const squads = createSquads({
    roomOf: pid => profiles.get(pid)?.room ?? null,
    infoOf: pid => {
      const e = profiles.get(pid);
      if (e?.ai) return { tag: e.info.tag, name: e.displayName };
      return e?.conn ? { tag: e.conn.info.tag, name: e.displayName } : null;
    },
    send: (pid, msg) => {
      const e = profiles.get(pid);
      if (e?.conn) e.conn.send(JSON.stringify(msg));
      // Zevo reads its squad's chat in its room (server/ai/squad.js); squad news it sees in the table
      else if (e?.ai && msg.t === 'chat' && e.room && e.state === 'in') post(e.room, { op: 'aiHear', profileId: pid, line: msg });
    },
    postRooms: msg => { for (const w of workers.values()) w.postMessage(msg); },
  });

  // Clans too (clans.js) — kept in the database
  const clans = createClans(db, {
    entryOf: pid => profiles.get(pid),
    send: (pid, msg) => profiles.get(pid)?.conn?.send(JSON.stringify(msg)),
    postRoom: (roomId, msg) => post(roomId, msg),
    squadCodeOf: pid => squads.codeOf(pid),
    onlineByUsername: name => {
      const key = String(name).toLowerCase();
      for (const e of profiles.values()) if (e.conn && String(e.conn.info.username ?? '').toLowerCase() === key) return e;
      return undefined;
    },
  });

  // Profiles: anyone can look anyone up (profiles.js) — from the stored saves
  const profileViews = createProfiles(db, {
    entryOf: pid => profiles.get(pid),
    send: (pid, msg) => profiles.get(pid)?.conn?.send(JSON.stringify(msg)),
  });

  // Global Leaderboards (leaderboards.js) — from the stored saves, ranked once a minute
  const leaderboards = createLeaderboards(db, {
    entryOf: pid => profiles.get(pid),
    send: (pid, msg) => profiles.get(pid)?.conn?.send(JSON.stringify(msg)),
  });

  // Which petals players use, for the bot's ?petalsused (petalUsage.js) — connected players only, never Zevo
  const petalUsage = createPetalUsage(db, {
    onlineIds: () => [...profiles.values()].filter(e => e.conn && !e.ai).map(e => e.id),
  });

  // /serverreset {time} (admins, or the bot's ?serverreset): a countdown for everyone, then the server restarts (serverReset.js)
  const serverReset = createServerReset({
    broadcast: text => { for (const e of profiles.values()) sendTo(e, { t: 'sys', text }); },
    restart: () => restart?.(),
  });

  // ── Workers ────────────────────────────────────────────────────────────────
  function startWorker(roomId) {
    // (studio: the Game Studio's live changes — the room's petals are built with them, room/studioBoot.js)
    const w = new Worker(new URL('./room/worker.js', import.meta.url), { workerData: { roomId, studio: liveStudioChanges(db), logTiers,
      halloween, quiet: resetting && resetQuiet } });
    workers.set(roomId, w);
    w.on('message', m => onWorkerMessage(roomId, m));
    if (squads) squads.postTable();   // (a restarted room needs to know who is with whom)
    w.on('error', e => { console.error(`[rooms] ${roomId} crashed:`, e); netLog('crash', `${roomId}: ${e?.stack ?? e}`.replace(/\n\s*/g, ' | ')); });
    w.on('exit', code => {
      if (workers.get(roomId) !== w) return;
      workers.delete(roomId);
      if (reaperRoom === roomId) reaperRoom = null;   // (its Grim Reaper went with the world)
      if (shuttingDown) return;
      // The Diep room stops for good when it's switched off (diep.js); anything else comes back
      const stays = roomId === DIEP_ROOM && !diep.isActive();
      if (stays) console.log(`[rooms] ${roomId} stopped (switched off)`);
      else if (resetting) console.log(`[rooms] ${roomId} reset (${resetQuiet ? 'the Halloween event' : '/updategamestudiochanges'})`);
      else { console.error(`[rooms] ${roomId} stopped (code ${code}) — restarting it`); netLog('restart', `${roomId} stopped (code ${code}) and restarted`); }
      if (!stays) startWorker(roomId);
      // Everyone who was in it starts over from their last save, on the homescreen
      for (const e of profiles.values()) {
        if (e.room !== roomId) continue;
        e.room = null; e.state = null; e.next = null;
        if (e.ai) { enter(e, roomId, loadSave(e.id)); continue; }   // Zevo plays on in the restarted biome
        if (!e.conn) { profiles.delete(e.id); continue; }
        if (!stays) sendTo(e, { t: 'sys', text: 'That biome had a problem and restarted. Your progress from a few seconds ago is safe.' });
        enter(e, 'lobby', loadSave(e.id));
      }
    });
    return w;
  }
  for (const id of ROOM_IDS) startWorker(id);

  /** Stops a room for good (the Diep room, switched off — the exit handler doesn't restart it). */
  function stopWorker(roomId) {
    workers.get(roomId)?.terminate();
  }

  // Zevo, the AI player: an entry with no connection (ai/host.js)
  const aiHost = createAiHost({ db, profiles, enter, leaveRoom, loadSave, sendTo,
    leaveSquad: pid => squads.remove(pid) });
  aiHost.restore();

  // The hidden Diep biome (diep.js): its room runs only while it's switched on
  const diep = createDiep({ db, profiles, sendTo, leaveRoom, startWorker, stopWorker, playerKey: s => playerKey(s) });
  if (diep.shouldRun()) startWorker(DIEP_ROOM);

  // Custom skins (skins.js): /unlockskineditor, /revokeskineditor, and the skin each flower wears
  const skins = createSkinCommands({ db, profiles, sendTo, playerKey: s => playerKey(s) });

  // The Game Studio (gameStudio.js): /unlockstudio, /revokestudio; /updategamestudiochanges is below
  const gameStudio = createGameStudioCommands({ db, profiles, sendTo, playerKey: s => playerKey(s) });

  /** Someone saved Game Studio changes (api.js): the admins online hear it. */
  function studioSaved(by) {
    for (const e of profiles.values()) {
      if (e.conn?.info.isAdmin) sendTo(e, { t: 'sys', text: `${by} saved Game Studio changes — /updategamestudiochanges puts them in the game.` });
    }
  }

  /** What a player's room is told about them: name, clan tag, chat badges (config.js CHAT_BADGES), the skin they wear. */
  const infoOf = e => ({ ...e.conn.info, displayName: e.displayName, clanTag: e.clanTag ?? null, skinRef: e.skinRef ?? '',
                         badges: CHAT_BADGES[String(e.conn.info.username ?? '').toLowerCase()] ?? [],
                         linked: !!db.profileById(e.id)?.discord_id });   // (linked to Discord: the Ghost Flower's Convert — room/worker.js)

  /** `profileId` published, wore or took off a skin (api.js): their room, squad and browser hear it. */
  function skinChanged(profileId) {
    const e = profiles.get(profileId);
    if (!e) return;
    e.skinRef = skinRefOf(db, profileId);
    if (e.room) post(e.room, { op: 'info', profileId, info: { skinRef: e.skinRef } });
    skins.tell(e);
  }

  function post(roomId, msg) {
    workers.get(roomId)?.postMessage(msg);
  }

  function onWorkerMessage(roomId, m) {
    switch (m.op) {
      case 'send':
        for (const [profileId, json] of m.list) {
          const e = profiles.get(profileId);
          if (e && e.room === roomId && e.conn) e.conn.send(json);
        }
        break;
      case 'resumed': {   // (resume, above)
        const e = profiles.get(m.profileId);
        if (!e || e.room !== roomId || e.state !== 'resuming') break;
        e.state = 'in'; e.next = null;
        netLog('resume', `${e.conn?.info.tag} picked their flower back up in ${roomId}`);
        sendTo(e, { t: 'joined', biome: roomId, id: m.playerId, resumed: true });
        break;
      }
      case 'resumeFailed': {
        const e = profiles.get(m.profileId);
        if (!e || e.room !== roomId || e.state !== 'resuming') break;
        e.state = 'in';
        leaveRoom(e, 'lobby');
        break;
      }
      case 'entered': {
        const e = profiles.get(m.profileId);
        if (!e || e.room !== roomId) break;
        e.state = 'in';
        // Never saved before (a new guest): nothing to write until something changes
        if (e.savedJson === undefined) e.savedJson = JSON.stringify(cleanSave(m.baseline));
        if (!e.conn && !e.ai) { leaveRoom(e, null); break; }  // they left while it was entering
        if (e.next) { leaveRoom(e, e.next); break; }          // a move was asked for meanwhile
        sendTo(e, roomId === 'lobby' ? { t: 'home', id: m.playerId } : { t: 'joined', biome: roomId, id: m.playerId });
        if (roomId === 'lobby') diep.onHome(e);   // (the DIEP! tab, if they have it)
        spectatingOnEnter(e, roomId);   // (an admin's /spectate)
        break;
      }
      case 'left': {
        const e = profiles.get(m.profileId);
        if (!e || e.room !== roomId) break;
        if (m.save) writeSave(e, m.save);
        if (m.reason === 'dcDied') squads.remove(e.id);   // their disconnected flower died
        e.room = null; e.state = null;
        const next = e.next; e.next = null;
        if (next && (e.conn || e.ai) && !shuttingDown) enter(e, next, m.save ?? loadSave(e.id));
        else if (!e.conn) profiles.delete(e.id);
        break;
      }
      case 'roomStats':   // its mobs and tick time, every couple of seconds (room/worker.js) — the bot's ?serverinfo
        roomStats.set(roomId, { ...m.stats, at: Date.now() });
        break;
      case 'status': {   // levels, HP, faces, petals — for squad views (and clan levels)
        const list = m.list.filter(s => profiles.get(s.profileId)?.room === roomId);
        squads.onStatus(list);
        clans.onStatus(list);
        petalUsage.onStatus(list);
        break;
      }
      case 'squadChat':
        squads.chat(m.profileId, m.line);
        break;
      case 'clanChat':
        clans.chat(m.profileId, m.line);
        break;
      case 'gameLog':   // a mob, drop or craft past the bot's /game-log rarities: for the Discord bot's #game-logs (server/discord.js)
        tellBot({ type: 'gameLog', ...m.entry });
        break;
      case 'reaperResult': reaperWaits.get(m.reqId)?.(m); break;   // (a room's answer to summonReaper)
      case 'reaperGone': if (reaperRoom === roomId) reaperRoom = null; break;   // (the Grim Reaper died — another can be summoned)
      case 'reaperUp': reaperRoom = roomId; break;   // (one rose there — ?hallowboss or an admin's /spawn)
      case 'candyPicked': candyRow(m.profileId)[0] += m.n; candyDirty = true; break;   // (?halloweenld)
      case 'candy': {   // Candy Corn turned in at the Ghost Flower (the Halloween event): the bot adds the credits and DMs them
        const row = db.profileById(m.profileId);
        console.log(`[halloween] "${row?.username ?? m.profileId}" converted Candy Corn → ${m.credits} credits`);
        if (!row?.discord_id) { console.error(`[halloween] …but they're not linked to Discord any more: ${m.credits} credits not given`); break; }
        tellBotKept(db, { type: 'candyConverted', discordId: row.discord_id, username: row.username, credits: m.credits, lost: m.lost });
        const board = candyRow(m.profileId);
        board[1] += m.lost.reduce((n, [, k]) => n + k, 0); board[2] += m.credits;
        saveCandyBoard();
        break;
      }
      case 'broadcast': {   // to everyone in the game, every room and the homescreen (the Cartoon Cat's arrival — room/worker.js)
        const json = JSON.stringify(m.msg);
        for (const e of profiles.values()) e.conn?.send(json);
        break;
      }
      case 'commandReply':   // how an admin command aimed at someone went
        profiles.get(m.profileId)?.conn?.send(JSON.stringify({ t: 'sys', text: m.text }));
        break;
      case 'aiMove':   // Zevo's brain wants another biome (leaving a squad there, like a player)
        if (aiHost.move(roomId, m.biome)) squads.onPlay(aiHost.profileId(), m.biome);
        break;
      case 'aiSquad': {   // Zevo asks to make / join / leave a squad (server/ai/squad.js)
        const e = profiles.get(m.profileId);
        if (!e?.ai || e.room !== roomId || !allowTry(`squad:${e.id}`, 30, 10_000)) break;
        post(roomId, { op: 'aiSquadResult', profileId: e.id, result: squads.aiRequest(e.id, m.msg) });
        break;
      }
      case 'saves':
        for (const { profileId, save } of m.list) {
          const e = profiles.get(profileId);
          if (e && e.room === roomId) writeSave(e, save);
        }
        if (m.flushId) flushWaits.get(m.flushId)?.();
        break;
    }
  }

  // ── Saves ──────────────────────────────────────────────────────────────────
  function loadSave(profileId) {
    const p = db.profileById(profileId);
    if (!p?.save) return null;
    try { return cleanSave(JSON.parse(p.save)); } catch { return null; }
  }

  /** Writes `save` if it differs from what's stored (a guest who never plays is never saved). */
  function writeSave(e, save) {
    const clean = cleanSave(save);
    if (!clean) return;
    const json = JSON.stringify(clean);
    if (json === e.savedJson) return;
    db.setSave(e.id, json, e.displayName, Date.now());
    e.savedJson = json;
  }

  // ── Moving between rooms ───────────────────────────────────────────────────
  function enter(e, roomId, save) {
    e.room = roomId;
    e.state = 'entering';
    const info = e.ai ? e.info : e.conn ? infoOf(e) : {};
    post(roomId, { op: 'enter', profileId: e.id, save, info });
  }

  /** Takes the player out of their room; then they go to `next` (a room id) or, if null, nowhere. */
  function leaveRoom(e, next) {
    e.next = next;
    if (e.state === 'leaving') return;
    if (e.state === 'entering') return;   // 'entered' will see no connection, or `next`, and act
    e.state = 'leaving';
    post(e.room, { op: 'leave', profileId: e.id });
  }

  function sendTo(e, msg) {
    e.conn?.send(JSON.stringify(msg));
  }

  // ── Admin commands aimed at another player ─────────────────────────────────
  // "/give third-eye m 3 vyx": the last word may name any online player — a
  // username, or a guest's tag as "#KZTT" or "Guest#KZTT" (any case). The
  // command then runs in that player's room, on them (room/worker.js), and the
  // reply comes back here for the admin. Usernames can't hold '#' or start
  // with "Guest", so a tag is never mistaken for one.
  const TARGETABLE = new Set(['/speed', '/godmode', '/fullindex', '/set', '/spawn', '/give', '/take', '/giveegg', '/givediep-petals', '/givenewpetals', '/bosspetals', '/givepetalsnoshiny', '/givepetalsnofunc', '/givediep-petal', '/petals', '/reset', '/invclear', '/setlevel', '/invis', '/viewcheckpoints', '/adddodge', '/cleardodge', '/readystreak']);
  const playerKey = s => {
    const k = String(s).toLowerCase().replace(/\s+/g, '');
    return k.startsWith('guest#') ? k.slice(5) : k;   // 'Guest #KZTT' / 'guest#kztt' → '#kztt'
  };

  /** Sends an admin's command to the player its last word names. True if it did (or said why not). */
  function commandForSomeone(e, text) {
    const words = String(text ?? '').trim().split(/\s+/);
    // /setlevel takes the name first ("/setlevel vyx 50"): move it to the end like the others
    if (words[0]?.toLowerCase() === '/setlevel' && words.length === 3 && !/^\d+$/.test(words[1])) words.push(words.splice(1, 1)[0]);
    if (words.length < 2 || !TARGETABLE.has(words[0].toLowerCase())) return false;
    const last = words[words.length - 1], key = playerKey(last);
    const target = [...profiles.values()].find(o => o.conn && playerKey(o.conn.info.tag) === key);
    const cmd = words[0].toLowerCase();
    if (!target) {
      // A guest tag or a real account that isn't here; anything else is just the command's own last word
      const account = key.startsWith('#') ? null : db.profileByUsername(last);
      if (!key.startsWith('#') && !account) return false;
      if (cmd === '/reset' && account) { resetOffline(e, account); return true; }
      sendTo(e, { t: 'sys', text: `${last} isn't online.` });
      return true;
    }
    const name = target.conn.info.tag;
    if (target.state !== 'in') {
      sendTo(e, { t: 'sys', text: `${name} is moving between rooms — try again in a moment.` });
      return true;
    }
    post(target.room, { op: 'command', profileId: target.id, text: words.slice(0, -1).join(' '),
                        by: { profileId: e.id, name: e.conn.info.tag }, targetName: name });
    // A reset flower starts over on the homescreen (the room resets them first: it gets the
    // command before the leave, so the save it hands back is the fresh one)
    if (cmd === '/reset' && target.room !== 'lobby') leaveRoom(target, 'lobby');
    return true;
  }

  // ── /goto and /bring (admins) ──────────────────────────────────────────────
  // "/goto vyx" puts the admin beside that player; "/bring vyx" puts them
  // beside the admin. Both must be in the same biome; the room picks open
  // ground clear of mobs and players (game/chatCommands.js teleportNextTo).
  function teleportCommand(e, text) {
    const m = /^\/(goto|bring)(?:\s+(.+?))?\s*$/i.exec(String(text ?? '').trim());
    if (!m) return false;
    const cmd = m[1].toLowerCase();
    if (!m[2]) { sendTo(e, { t: 'sys', text: `Usage: /${cmd} {user}` }); return true; }
    const key = playerKey(m[2]);
    const target = [...profiles.values()].find(o => o.conn && playerKey(o.conn.info.tag) === key);
    if (!target) { sendTo(e, { t: 'sys', text: `${m[2]} isn't online.` }); return true; }
    const name = target.conn.info.tag;
    if (target === e) { sendTo(e, { t: 'sys', text: "That's you." }); return true; }
    if (e.state !== 'in' || target.state !== 'in') {
      sendTo(e, { t: 'sys', text: `${e.state !== 'in' ? 'You are' : `${name} is`} moving between rooms — try again in a moment.` });
      return true;
    }
    if (e.room !== target.room || !isWorldRoom(e.room)) {
      sendTo(e, { t: 'sys', text: isWorldRoom(e.room) ? `${name} isn't in your biome.` : 'You need to be in a biome.' });
      return true;
    }
    const [moverId, toId] = cmd === 'goto' ? [e.id, target.id] : [target.id, e.id];
    post(e.room, { op: 'teleport', moverId, toId, by: { profileId: e.id, name: e.conn.info.tag }, targetName: name });
    return true;
  }

  // ── /spectate and /unspectate (admins) ─────────────────────────────────────
  // "/spectate vyx": the admin sees what vyx sees, and keeps following them
  // from biome to biome (their own flower goes along, invisible while they
  // watch — room/worker.js spectate). vyx on the homescreen pauses it; the
  // admin going to the homescreen, /unspectate, or either of them leaving the
  // game ends it.
  const spectators = new Map();   // spectator profileId → the profileId they watch

  function spectateCommand(e, text) {
    const m = /^\/(spectate|unspectate)(?:\s+(.+?))?\s*$/i.exec(String(text ?? '').trim());
    if (!m) return false;
    if (m[1].toLowerCase() === 'unspectate') {
      if (!spectators.has(e.id)) { sendTo(e, { t: 'sys', text: "You're not spectating anyone." }); return true; }
      stopSpectating(e.id);
      return true;
    }
    if (!m[2]) { sendTo(e, { t: 'sys', text: 'Usage: /spectate {user}' }); return true; }
    const key = playerKey(m[2]);
    const target = [...profiles.values()].find(o => o.conn && playerKey(o.conn.info.tag) === key);
    if (!target) { sendTo(e, { t: 'sys', text: `${m[2]} isn't online.` }); return true; }
    const name = target.conn.info.tag;
    if (target === e) { sendTo(e, { t: 'sys', text: "That's you." }); return true; }
    if (!isWorldRoom(target.room)) { sendTo(e, { t: 'sys', text: `${name} is on the homescreen — try again once they're playing.` }); return true; }
    spectators.set(e.id, target.id);
    if (e.room === target.room && e.state === 'in') {
      post(e.room, { op: 'spectate', profileId: e.id, targetId: target.id, targetName: name });
    } else {
      sendTo(e, { t: 'sys', text: `Going to ${name}'s biome to spectate them…` });
      leaveRoom(e, target.room);   // (they're spectating once they're in — 'entered' below)
    }
    return true;
  }

  /** Ends spectatorId's spectating: their view goes back to their own flower. */
  function stopSpectating(spectatorId, text = null) {
    if (!spectators.delete(spectatorId)) return;
    const s = profiles.get(spectatorId);
    if (!s) return;
    if (s.room && s.state === 'in') post(s.room, { op: 'spectate', profileId: s.id, targetId: null, quiet: !!text });
    if (text) sendTo(s, { t: 'sys', text });
  }

  /** `e` just got into room `roomId`: spectating starts (or carries on) there. */
  function spectatingOnEnter(e, roomId) {
    // They spectate someone: start, if that someone's here (a spectator going home stops)
    const watched = spectators.get(e.id);
    if (watched != null) {
      const t = profiles.get(watched);
      if (roomId === 'lobby') spectators.delete(e.id);
      else if (t?.room === roomId) post(roomId, { op: 'spectate', profileId: e.id, targetId: t.id, targetName: t.conn?.info.tag ?? '?' });
    }
    // Someone spectates them: they follow. The homescreen (every biome change goes
    // through it) only pauses it — their view is their own until the target plays again.
    for (const [sid, tid] of spectators) {
      if (tid !== e.id) continue;
      const s = profiles.get(sid);
      const name = e.conn?.info.tag ?? 'They';
      if (!s?.conn) spectators.delete(sid);
      else if (roomId === 'lobby') {
        if (s.room && s.state === 'in') post(s.room, { op: 'spectate', profileId: sid, targetId: null, quiet: true });
        sendTo(s, { t: 'sys', text: `${name} went to the homescreen — you'll follow them when they play again (/unspectate to stop).` });
      }
      else if (s.room === roomId && s.state === 'in') post(roomId, { op: 'spectate', profileId: sid, targetId: e.id, targetName: name, quiet: true });
      else if (s.room !== roomId) leaveRoom(s, roomId);
    }
  }

  /** /reset for an account that isn't online: its stored progress becomes a brand-new player's. */
  function resetOffline(e, account) {
    if (profiles.has(account.id)) {   // (still on its way out of a room — its save isn't written yet)
      sendTo(e, { t: 'sys', text: `${account.username} is just leaving — try again in a moment.` });
      return;
    }
    db.setSave(account.id, JSON.stringify(freshSave()), account.display_name, Date.now());
    profileViews.forget(account.id);
    console.log(`[accounts] "${account.username}" was reset by "${e.conn.info.tag}"`);
    sendTo(e, { t: 'sys', text: `${account.username} (offline): reset to a brand-new flower.` });
  }

  // ── Connections ────────────────────────────────────────────────────────────
  function kick(conn, reason, extra = {}) {
    if (conn.closed) return;
    conn.send(JSON.stringify({ t: 'kicked', reason, ...extra }));
    conn.close();
    detach(conn);
  }

  /** The connection is gone (closed or kicked): its player leaves their room. */
  function detach(conn) {
    if (conn.detached) return;
    conn.detached = true;
    conn.closed = true;
    const e = profiles.get(conn.profileId);
    if (!e || e.conn !== conn) return;
    e.conn = null;
    db.touchProfile(e.id, Date.now());   // (the Clan panel's "last seen")
    // Spectating ends when either of them goes
    spectators.delete(e.id);
    for (const [sid, tid] of spectators) if (tid === e.id) stopSpectating(sid, `${conn.info.tag} left the game — stopped spectating.`);
    clans.onDisconnect(e.id);
    // Gone from inside a biome: their flower stays there and slowly dies
    // (room/worker.js), keeping its squad place until it does. Anywhere else
    // they leave now, and the squad keeps their place a little while.
    if (isWorldRoom(e.room) && e.state === 'in' && !shuttingDown) {
      squads.onDisconnect(e.id, { stay: true });
      post(e.room, { op: 'disconnected', profileId: e.id });
      return;
    }
    squads.onDisconnect(e.id);
    if (e.room) leaveRoom(e, null);
    else profiles.delete(e.id);
  }

  function connect(conn) {
    if (shuttingDown) { conn.send(JSON.stringify({ t: 'kicked', reason: 'restart' })); conn.close(); return; }
    let e = profiles.get(conn.profileId);
    const old = e?.conn;
    if (old && !old.closed) {
      if (old.sessionHash === conn.sessionHash) {
        kick(old, 'otherTab');            // same browser: the newest tab plays
      } else {
        kick(old, 'elsewhere');           // another browser: nobody plays until one closes
        conn.send(JSON.stringify({ t: 'kicked', reason: 'elsewhere' }));
        conn.close();
        conn.closed = conn.detached = true;
        return;
      }
    }
    if (!e) {
      e = { id: conn.profileId, conn: null, room: null, state: null, next: null,
            displayName: conn.info.displayName, savedJson: undefined };
      const stored = db.profileById(conn.profileId)?.save;
      if (stored) e.savedJson = JSON.stringify(loadSave(conn.profileId));
      profiles.set(e.id, e);
    }
    e.conn = conn;
    e.displayName = conn.info.displayName;
    e.skinRef = skinRefOf(db, e.id);   // (the skin their flower wears — before entering a room)
    skins.tell(e);
    db.touchProfile(e.id, Date.now());
    squads.onConnect(e.id);
    clans.onConnect(e.id);   // (before entering: the room shows their clan tag)
    if (!e.room) enter(e, 'lobby', loadSave(e.id));
    else if (isWorldRoom(e.room) && e.state === 'in') resume(e);   // their flower is still out there: back into it
    else leaveRoom(e, 'lobby');   // the previous connection's player is still leaving: come back in after
  }

  /**
   * A dropped connection came back while its flower was still in the biome
   * (it stays a while after a disconnect — room/worker.js): the player picks
   * it up where it is instead of starting over from the homescreen. If it's
   * gone meanwhile (it died), they go to the homescreen as before (`next`).
   */
  function resume(e) {
    e.state = 'resuming';
    e.next = 'lobby';   // (if its flower leaves instead, 'left' sends them home)
    post(e.room, { op: 'reconnected', profileId: e.id, info: infoOf(e) });
  }

  function message(conn, msg) {
    const e = profiles.get(conn.profileId);
    if (!e || e.conn !== conn) return;
    switch (msg.t) {
      case 'name': {
        if (!allowTry(`name:${e.id}`, 30, 60_000)) return;
        e.displayName = cleanDisplayName(msg.name);
        conn.info.displayName = e.displayName;
        db.setDisplayName(e.id, e.displayName);
        if (e.room) post(e.room, { op: 'info', profileId: e.id, info: { displayName: e.displayName } });
        squads.onRename(e.id);
        return;
      }
      case 'play':
        if (e.state === 'in' && e.room === 'lobby' && BIOME_ROOMS.includes(msg.biome)) {
          squads.onPlay(e.id, msg.biome);   // (before entering: the room gets the squad table first)
          leaveRoom(e, msg.biome);
        } else if (e.state === 'in' && e.room === 'lobby' && msg.biome === DIEP_ROOM && diep.canPlay(e)) {
          leaveRoom(e, DIEP_ROOM);   // (no squads there — the squad stays as it is)
        }
        return;
      case 'squad':
        if (SQUAD_OPS.includes(msg.op) && allowTry(`squad:${e.id}`, 30, 10_000)) squads.handle(e.id, msg);
        return;
      case 'clan':
        if (CLAN_OPS.includes(msg.op) && allowTry(`clan:${e.id}`, 30, 10_000)) clans.handle(e.id, msg);
        return;
      case 'leaderboard':
        if (allowTry(`lb:${e.id}`, 10, 10_000)) leaderboards.send(e.id);
        return;
      case 'profile':
        if (!PROFILE_OPS.includes(msg.op)) return;
        if (msg.op === 'view' ? allowTry(`profile:${e.id}`, 20, 10_000) : allowTry(`about:${e.id}`, 10, 60_000)) {
          profileViews.handle(e.id, msg);
        }
        return;
      case 'leave':
        if (e.state === 'in' && e.room !== 'lobby') leaveRoom(e, 'lobby');
        return;
      case 'chat':
        // /serverreset {time} / cancel (admins): the countdown, then the server restarts (serverReset.js)
        if (conn.info.isAdmin && /^\/serverreset(\s|$)/i.test(String(msg.text ?? '').trim())) {
          sendTo(e, { t: 'sys', text: serverReset.command(String(msg.text).trim().slice('/serverreset'.length), conn.info.username ?? conn.info.tag) });
          return;
        }
        // /updategamestudiochanges (admins): the saved Game Studio changes go live — the same restart, with them in
        if (conn.info.isAdmin && /^\/updategamestudiochanges\s*$/i.test(String(msg.text ?? '').trim())) {
          const n = applyStudioChanges(db);
          if (n === null) { sendTo(e, { t: 'sys', text: 'Nothing new was saved in the Game Studio since the last update.' }); return; }
          console.log(`[server] /updategamestudiochanges by "${conn.info.tag}": ${n} changed — resetting every room, refreshing every page`);
          resetGame('Putting in the Game Studio changes — your page reloads in a moment.');
          return;
        }
        if (conn.info.isAdmin && halloweenCommand(e, String(msg.text ?? '').trim())) return;   // /starthalloweenevent, /endhalloweenevent, /spawnghostflower, /despawnghostflower
        if (conn.info.isAdmin && gameStudio.command(e, msg.text)) return;   // /unlockstudio, /revokestudio
        if (conn.info.isAdmin && aiHost.command(e, msg.text)) return;   // /enable-AI, /disable-AI
        if (conn.info.isAdmin && diep.command(e, msg.text)) return;     // /unlockdiep, /revokediep, /active-diep, /deactive-diep
        if (conn.info.isAdmin && skins.command(e, msg.text)) return;    // /unlockskineditor, /revokeskineditor
        if (conn.info.isAdmin && teleportCommand(e, msg.text)) return;  // /goto, /bring
        if (conn.info.isAdmin && spectateCommand(e, msg.text)) return;  // /spectate, /unspectate
        if (conn.info.isAdmin && commandForSomeone(e, msg.text)) return;
        break;
    }
    if (e.state === 'in') post(e.room, { op: 'msg', profileId: e.id, data: msg });
  }

  function disconnect(conn) {
    detach(conn);
  }

  /**
   * Closes `profileId`'s connection unless it belongs to the login `keepHash`
   * (a password change logs out every other browser).
   */
  function kickSessions(profileId, keepHash, reason = 'loggedOut') {
    const e = profiles.get(profileId);
    if (e?.conn && e.conn.sessionHash !== keepHash) kick(e.conn, reason);
  }

  /** This browser's login was replaced by a fresh one (password set): keep its connection. */
  function renameSession(profileId, oldHash, newHash) {
    const e = profiles.get(profileId);
    if (e?.conn && e.conn.sessionHash === oldHash) e.conn.sessionHash = newHash;
  }

  /** Every room hands over everyone's save, and they're written (waits for all of them). */
  function flushAll() {
    return Promise.all([...workers.keys()].map(roomId => new Promise(resolve => {
      const flushId = nextFlushId++;
      const done = () => { flushWaits.delete(flushId); resolve(); };
      flushWaits.set(flushId, done);
      setTimeout(done, FLUSH_TIMEOUT_MS);
      post(roomId, { op: 'flush', flushId });
    })));
  }

  /**
   * An admin's /updategamestudiochanges — the game starts over without the server
   * process stopping: everyone's progress is saved, every page is told to
   * reload (kick reason 'serverRestart' — net/connection.js), and every room
   * (the homescreen and each biome) is restarted as a fresh world: new mobs,
   * nothing left lying around. (The worker exit handler above starts each one
   * again; Zevo goes back into its biome.) The pages come back to the
   * homescreen of the new worlds.
   */
  async function resetGame(text, { quiet = false } = {}) {
    if (resetting || shuttingDown) return;
    resetting = true;
    resetQuiet = quiet;   // (the restarted worlds' first batches aren't told — startWorker)
    try {
      await flushAll();
      for (const e of profiles.values()) {
        if (!e.conn) continue;
        sendTo(e, { t: 'sys', text });
        kick(e.conn, 'serverRestart');
      }
      await Promise.all([...workers.values()].map(w => w.terminate()));
    } finally {
      resetting = false;
    }
  }

  /**
   * The Halloween event's admin commands (system/shared/halloween.js) — true if `text` was one.
   * /starthalloweenevent, /endhalloweenevent: the event on / off, and the game starts over like a Game Studio update
   * (resetGame: everyone saved, every page reloads, every world fresh — the old mobs gone without loot), quietly:
   * nothing about the new worlds' mobs in the chat or #game-logs (Dev). Ending it takes the Ghost Flower away too.
   * /spawnghostflower, /despawnghostflower: the NPC in the Garden (kept, so a restarted Garden has it back).
   */
  function halloweenCommand(e, text) {
    const cmd = text.toLowerCase();
    const reply = t => sendTo(e, { t: 'sys', text: t });
    const save = () => db.setState('halloween', halloween);
    if (cmd === '/starthalloweenevent' || cmd === '/endhalloweenevent') {
      const start = cmd === '/starthalloweenevent';
      if (halloween.on === start) { reply(`The Halloween event is already ${start ? 'on' : 'off'}.`); return true; }
      halloween = { on: start, npc: false };
      reaperRoom = null;
      save();
      console.log(`[halloween] ${cmd} by "${e.conn.info.tag}" — resetting every room, refreshing every page`);
      resetGame(start ? 'The Halloween event is starting — your page reloads in a moment.'
                      : 'The Halloween event is over — your page reloads in a moment.', { quiet: true });
      return true;
    }
    if (cmd === '/spawnghostflower' || cmd === '/despawnghostflower') {
      const out = cmd === '/spawnghostflower';
      if (!halloween.on) { reply('Start the Halloween event first (/starthalloweenevent).'); return true; }
      if (halloween.npc === out) { reply(out ? 'The Ghost Flower is already in the Garden.' : 'The Ghost Flower isn\'t out.'); return true; }
      halloween = { ...halloween, npc: out };
      save();
      post('garden', { op: 'ghostFlower', on: out });
      reply(out ? 'The Ghost Flower is in the Garden, by the spawn.' : 'The Ghost Flower is gone.');
      return true;
    }
    return false;
  }

  /**
   * ?hallowboss (the Halloween event — the bot's /bot/hallow-boss): the Grim Reaper at rarity `tier` (Omega+) in a
   * random biome, in its rarity zone (room/worker.js summonReaper). One in the whole game at a time. `by`: the
   * Discord name of who paid (their game name if they're linked). Resolves to { ok: true, biome, zone } or
   * { ok: false, code } — the bot only takes the credits once it's ok.
   */
  async function summonReaper(discordId, tier, by) {
    if (!halloween.on) return { ok: false, code: 'eventOff' };
    if (reaperRoom || reaperRising) return { ok: false, code: 'busy' };
    if (Date.now() < reaperReadyAt) return { ok: false, code: 'cooldown', waitMs: reaperReadyAt - Date.now() };
    if (tier == null || tier < 8) return { ok: false, code: 'badTier' };
    reaperRising = true;
    try { return await riseSomewhere(discordId, tier, by); }
    finally { reaperRising = false; }
  }
  async function riseSomewhere(discordId, tier, by) {
    const row = discordId ? db.profileByDiscordId(discordId) : null;
    const name = (row && (profiles.get(row.id)?.displayName || row.display_name || row.username)) || by || 'Someone';
    const rooms = BIOME_ROOMS.filter(id => workers.has(id));
    for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }
    for (const room of rooms) {   // (the next one if a biome has no room for it)
      const reqId = nextReaperReq++;
      const answer = await new Promise(resolve => {
        const done = m => { reaperWaits.delete(reqId); resolve(m); };
        reaperWaits.set(reqId, done);
        setTimeout(() => done({ ok: false, code: 'noSpot' }), 3000);
        post(room, { op: 'reaper', reqId, tier, by: name });
      });
      if (answer.code === 'eventOff' || answer.code === 'busy') return { ok: false, code: answer.code };
      if (!answer.ok) continue;
      reaperRoom = room;
      reaperReadyAt = Date.now() + REAPER_COOLDOWN_MS;
      db.setState('reaperReadyAt', reaperReadyAt);
      const biome = room.charAt(0).toUpperCase() + room.slice(1);
      console.log(`[halloween] ?hallowboss: "${name}" summoned a tier-${tier} Grim Reaper in ${room} (${answer.zone} zone)`);
      for (const x of profiles.values()) sendTo(x, { t: 'sys', text: `${name} summoned ${answer.label} in the ${biome}'s ${answer.zone} zone!` });
      return { ok: true, biome, zone: answer.zone };
    }
    return { ok: false, code: 'noSpot' };
  }

  /** ?halloweenld (the bot): the 20 who picked up the most Candy Corn, with how much they turned in — while the event is on. */
  function candyLeaders() {
    if (!halloween.on) return { ok: false, code: 'eventOff' };
    const rows = [];
    for (const [pid, [collected, exchanged, credits]] of candyBoard) {
      const p = db.profileById(pid);
      if (!p?.username || collected + exchanged <= 0) continue;   // (a guest, or an account gone)
      rows.push({ name: p.display_name || p.username, username: p.username, collected, exchanged, credits });
    }
    rows.sort((a, b) => b.collected - a.collected || b.exchanged - a.exchanged);
    return { ok: true, rows: rows.slice(0, 20), players: rows.length };
  }

  /** ?hallowldr (the bot): ?halloweenld starts over for everyone — while the event is on. */
  function resetCandyLeaders() {
    if (!halloween.on) return { ok: false, code: 'eventOff' };
    const cleared = candyBoard.size;
    candyBoard.clear();
    saveCandyBoard();
    console.log(`[halloween] ?hallowldr: the Candy Corn leaderboard was reset (${cleared} players)`);
    return { ok: true, cleared };
  }

  /** `profileId` was linked to or unlinked from Discord (discord.js): their room hears it (the Ghost Flower's Convert — room/worker.js). */
  function linkChanged(profileId) {
    const e = profiles.get(profileId);
    if (e?.room) post(e.room, { op: 'info', profileId, info: { linked: !!db.profileById(profileId)?.discord_id } });
  }

  /**
   * Saves everyone (waits for every room), closes every connection, stops the rooms. reason 'serverReset' (the end
   * of a /serverreset): each page reloads once the server is back — a new BOOT_ID (client/net/connection.js).
   */
  async function shutdown(reason = 'restart') {
    shuttingDown = true;
    if (candyDirty) saveCandyBoard();   // (?halloweenld's latest pickups)
    await flushAll();
    for (const e of profiles.values()) if (e.conn) kick(e.conn, reason, reason === 'serverReset' ? { boot: BOOT_ID } : {});
    await Promise.all([...workers.values()].map(w => w.terminate()));
  }

  /** Where a player is connected — 'lobby' (the homescreen) or a biome — or null when offline. */
  function whereIs(profileId) {
    const e = profiles.get(profileId);
    return e?.conn ? (e.room ?? 'lobby') : null;
  }

  /**
   * Every room that's running (the Discord bot's ?servers / ?serverinfo — server/discord.js): the homescreen,
   * then each biome, with who is in it — connected players and Zevo; a flower whose browser went
   * (dying out) is counted apart — and the room's last report (mobs alive, tick time, running since).
   * Players: { name: their display name, user: username, a guest's tag, or 'AI' }.
   */
  function servers() {
    return [...ROOM_IDS, DIEP_ROOM].filter(id => workers.has(id)).map(id => {
      const players = [];
      let disconnected = 0;
      for (const e of profiles.values()) {
        if ((e.room ?? (e.conn ? 'lobby' : null)) !== id) continue;   // (between rooms: on the homescreen, like whereIs)
        if (e.ai) players.push({ name: e.displayName || 'Zevo', user: 'AI' });
        else if (e.conn) players.push({ name: e.displayName || 'Unnamed', user: e.conn.info.username ?? e.conn.info.tag });
        else disconnected++;
      }
      players.sort((a, b) => a.name.localeCompare(b.name));
      const s = roomStats.get(id) ?? null;
      return { id, players, disconnected, mobs: s?.mobs ?? null, tickMs: s?.tickMs ?? null, startedAt: s?.startedAt ?? null };
    });
  }

  /** The lowest rarity tiers #game-logs wants, { mob, petal } (the bot sends them with every /bot/events — server/discord.js): every room logs from them up. */
  function setLogTiers(t) {
    if (logTiers?.mob === t.mob && logTiers?.petal === t.petal) return;
    logTiers = { mob: t.mob, petal: t.petal };
    db.setState('gameLog', logTiers);
    for (const w of workers.values()) w.postMessage({ op: 'logTiers', ...logTiers });
  }

  return { connect, message, disconnect, kickSessions, renameSession, skinChanged, studioSaved, whereIs, servers, setLogTiers, summonReaper, candyLeaders, resetCandyLeaders, linkChanged,
           petalUsage: () => petalUsage.top(), serverReset: (arg, by) => serverReset.command(arg, by), shutdown };
}
