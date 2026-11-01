/**
 * client/ui/chat.js — In-game chat bar
 *
 * Format: [Global] [CLAN] [Dev] [Lvl N] [username] Display name: message — the
 *   first tag is the channel; then the clan tag (clan members only, clan blue);
 *   then any badges (server/config.js CHAT_BADGES, each in its own colour); the
 *   username is the account's (or the guest tag, "Guest #A7K2"); the display
 *   name is the homescreen name box. Lines go through the server
 *   (server/room/worker.js).
 * - Three channels: Global — everyone in your biome (on the homescreen:
 *   everyone there); Squad — only your squad, and Clan — only your clan,
 *   wherever they are. Tab while typing switches between the ones you're in —
 *   or, while typing a /command, fills it in (again: the next match); the
 *   input row shows the channel. In squad lines the display name is
 *   pink, in clan lines green.
 * - Lvl badge colored by highest rarity petal in hotbar (the server picks it)
 * - Lines are outlined text, no box behind them. A squad code in any line
 *   (garden-7KQ2) is blue: click it to copy it.
 * - Typing "/…" previews the matching commands just above the box (click one
 *   to fill it in).
 * - A Runic-or-rarer mob spawning in your biome is announced here
 *   ([Server] lines — only that biome's players see them).
 * - Messages slide in from the left, appearing after the button column
 * - Chat positioned bottom-left, starting just right of the icon buttons
 * - Press Enter or click bar to open; Enter/Escape to close
 * - 50 char limit; messages fade 10s after chat closes; the last 300 lines are
 *   kept (scroll up while chat is open to read them)
 * - Opening chat re-reveals faded/fading messages; closing re-arms their fade
 * - Up/Down arrows while typing cycle through previously sent messages
 * - Closing chat with unsent text keeps that text in the box for next time
 *
 * Squad commands (anyone): /new-squad, /join-squad {code}, /leave-squad,
 * /squad-code, /set-squad-public, /set-squad-private, /find-public-squad —
 * they become squad requests (client/net/squad.js); /squad-code copies the
 * code here. Clan commands (leader): /clan-invite {user}, /clan-kick {user},
 * /clan-transfer {user} — clan requests (client/net/clan.js). Admin commands: /speed, /set hp, /set dmg, /spawn, /godmode, /invis, /viewcheckpoints,
 * /give, /petals, /fullindex, /goto, /bring — run by the server (game/chatCommands.js), for
 * ADMIN_USERNAMES only; /enable-AI and /disable-AI switch Zevo, the AI player,
 * on and off, /ai-brain picks its brain (server/ai/host.js); /unlockdiep, /revokediep, /active-diep and
 * /deactive-diep run the hidden Diep biome (server/diep.js). Replies show as [System] lines. /cmds is drawn here.
 */



import { sendChat } from '../net/actions.js';
import { onNet } from '../net/connection.js';
import { squad, onSquadChange, newSquad, joinSquad, leaveSquad, setSquadPublic, findPublicSquad } from '../net/squad.js';
import { clan, onClanChange, inviteToClan, kickFromClan, transferClan } from '../net/clan.js';
import { account } from '../account.js';
import { CHAT_MAX_CHARS } from '../../shared/netProtocol.js';
import { MOB_DEFS } from '../../shared/mobTypes.js';
import { PETAL_TYPES } from '../../shared/petalTypes.js';
import { SHINY_TEXT_COLOR } from '../../shared/shiny.js';
import { RARITIES, rarityText, rarityTier } from '../../shared/rarities.js';
import { settings } from '../settings.js';
import { openProfileView } from './profileView.js';
import { outline } from './textOutline.js';
import { appendEmojis } from './emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_CHARS    = CHAT_MAX_CHARS;
const FADE_DELAY   = 10000;   // ms after close before fade starts
const FADE_DUR     = 1200;    // ms for CSS fade-out
const MAX_MESSAGES = 300;   // lines kept in the log before the oldest are removed
const REOPEN_FADE_DELAY = 300; // ms after close before old messages start re-fading (re-close behavior)
const MAX_HISTORY  = 50;      // how many sent messages are kept for up/down recall

// Left edge of buttons column: left:16px, width:54px → right edge = 70px
// Chat starts with a gap after that
const BTN_RIGHT  = 70;
const CHAT_GAP   = 14;   // gap between button column and chat
const CHAT_LEFT  = BTN_RIGHT + CHAT_GAP;   // 84px
const CHAT_W     = 260;  // shorter bar
const BOTTOM_PAD = 24;

// Slide animation: messages start fully left (hidden behind button col) and
// slide right into their resting place. We use a CSS clip + translate trick.
const SLIDE_MS = 380;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let chatOpen = false;
let chatEl   = null;
let inputEl  = null;
let logEl    = null;
let hintEl   = null;
let chanEl   = null;
let suggestEl = null;   // the command preview above the input row

// The channel lines are sent to: 'global', 'squad' or 'clan' (Tab cycles through the ones you're in)
let channel = 'global';
const CHANNEL_LABEL = { global: '[Global]', squad: '[Squad]', clan: '[Clan]' };
const channelOf = ch => (ch === 'squad' || ch === 'clan' ? ch : 'global');

/** The channels you can talk in right now. */
const openChannels = () => ['global', ...(squad.code ? ['squad'] : []), ...(clan.info ? ['clan'] : [])];

function showChannel() {
  if (!chanEl) return;
  chanEl.textContent = CHANNEL_LABEL[channel];
  chanEl.className = `chat-ch ${channel}`;
  if (hintEl) hintEl.textContent = openChannels().length > 1 ? '[ENTER] to chat, [TAB] channel' : '[ENTER] to chat...';
}

function switchChannel() {
  const list = openChannels();
  channel = list[(list.indexOf(channel) + 1) % list.length];
  showChannel();
}

// Out of a squad / clan: back to global
onSquadChange(sq => {
  if (!sq.code && channel === 'squad') channel = 'global';
  showChannel();
});
onClanChange(c => {
  if (!c.info && channel === 'clan') channel = 'global';
  showChannel();
});

const messages = []; // { el, timerId, faded }

// ── Sent-message history (Up/Down arrow recall) ─────────────────────────────
const history = [];       // most recent last
let historyIndex = -1;    // -1 = not currently browsing history
let draftBeforeHistory = ''; // what was typed before Up was first pressed, restored on Down past the end
let _recallingHistory = false; // guards the 'input' listener against our own value writes

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
export function isChatOpen() { return chatOpen; }

export function ensureChatDOM() {
  if (chatEl) return;
  injectStyles();

  // Outer wrapper — clips the log so messages slide in from the left
  chatEl = document.createElement('div');
  chatEl.id = 'chat-wrap';
  document.body.appendChild(chatEl);

  // Message log
  logEl = document.createElement('div');
  logEl.id = 'chat-log';
  chatEl.appendChild(logEl);

  // Command preview (only while typing "/…")
  suggestEl = document.createElement('div');
  suggestEl.id = 'chat-suggest';
  suggestEl.addEventListener('mousedown', e => {
    e.stopPropagation();
    e.preventDefault();   // (keep the focus in the input)
    const pick = e.target.closest('.chat-suggest-row');
    if (!pick) return;
    inputEl.value = pick.dataset.fill;
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    updateSuggest();
  });
  chatEl.appendChild(suggestEl);

  // Input row
  const row = document.createElement('div');
  row.id = 'chat-input-row';
  chatEl.appendChild(row);

  chanEl = document.createElement('span');
  chanEl.id = 'chat-channel';
  row.appendChild(chanEl);

  hintEl = document.createElement('span');
  hintEl.id = 'chat-hint';
  row.appendChild(hintEl);
  showChannel();

  inputEl = document.createElement('input');
  inputEl.id           = 'chat-input';
  inputEl.type         = 'text';
  inputEl.maxLength    = MAX_CHARS;
  inputEl.autocomplete = 'off';
  inputEl.spellcheck   = false;
  row.appendChild(inputEl);

  row.addEventListener('mousedown', e => {
    e.stopPropagation();
    if (!chatOpen) openChat();
  });
  logEl.addEventListener('mousedown',  e => e.stopPropagation());
  inputEl.addEventListener('mousedown', e => e.stopPropagation());
  // Let the log be scrolled to browse past messages while chat is open.
  logEl.addEventListener('wheel', e => { e.stopPropagation(); }, { passive: true });

  inputEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (text.length > 0) {
        pushToHistory(text);
        submitMessage(text);
      }
      closeChat({ clearInput: true });
    } else if (e.key === 'Tab') {
      e.preventDefault();   // (not the browser's focus jump)
      if (!completeCommand(e.shiftKey ? -1 : 1)) switchChannel();   // (Tab fills in a command; otherwise it switches channel)
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeChat({ clearInput: false });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      recallHistory(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      recallHistory(1);
    }
  });

  // Real typing (not our own programmatic recall writes) resets history browsing
  inputEl.addEventListener('input', () => {
    tabCycle = null;   // (real typing starts a new Tab completion)
    updateSuggest();
    if (_recallingHistory) return;
    if (historyIndex !== -1) historyIndex = -1;
  });

  // Click anywhere outside the chat wrapper → close, preserving any typed text
  document.addEventListener('mousedown', e => {
    if (!chatOpen) return;
    if (chatEl.contains(e.target)) return;
    closeChat({ clearInput: false });
  });

  positionChat();
}

export function onEnterKey() {
  if (chatOpen) return true;
  openChat();
  return true;
}

/**
 * The top of the chat box (its input row, at the bottom-left) — the left
 * button column ends just above it (inventoryPanel.js). The messages above
 * the box sit right of the column, so they never meet it.
 */
export function chatAreaTop() {
  return window.innerHeight - BOTTOM_PAD - CHAT_BOX_H;
}
const CHAT_BOX_H = 33;   // the input row

export function positionChat() {
  if (!chatEl) return;
  chatEl.style.left   = CHAT_LEFT + 'px';
  chatEl.style.width  = CHAT_W + 'px';
  chatEl.style.bottom = BOTTOM_PAD + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
// Sent-message history (Up/Down arrow recall)
// ─────────────────────────────────────────────────────────────────────────────
function pushToHistory(text) {
  history.push(text);
  while (history.length > MAX_HISTORY) history.shift();
  historyIndex = -1;
}

/** dir: -1 for Up (older), +1 for Down (newer) */
function recallHistory(dir) {
  if (history.length === 0) return;

  if (historyIndex === -1) {
    if (dir > 0) return; // Down with nothing recalled yet — nothing to do
    draftBeforeHistory = inputEl.value;
    historyIndex = history.length - 1;
  } else {
    historyIndex += dir;
  }

  _recallingHistory = true;
  try {
    if (historyIndex < 0) {
      historyIndex = 0;
    } else if (historyIndex >= history.length) {
      // Walked past the newest recalled message — restore the in-progress draft
      historyIndex = -1;
      inputEl.value = draftBeforeHistory;
      const v = inputEl.value;
      inputEl.setSelectionRange(v.length, v.length);
      return;
    }

    inputEl.value = history[historyIndex];
    const v = inputEl.value;
    inputEl.setSelectionRange(v.length, v.length);
  } finally {
    _recallingHistory = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────
function openChat() {
  chatOpen = true;
  chatEl.classList.add('open');
  hintEl.style.display  = 'none';
  inputEl.style.display = 'block';
  updateSuggest();   // (a half-typed command left from last time)

  // Re-reveal every message, including ones that had fully faded out —
  // nothing is deleted from the log just by opening chat. Messages that were
  // already faded/fading get flagged so the NEXT close re-fades them quickly
  // (0.3s) instead of waiting the full FADE_DELAY again.
  for (const m of messages) {
    if (m.faded || m.el.classList.contains('fading')) m.wasReopened = true;
    clearTimeout(m.timerId);
    m.el.classList.remove('fading');
    m.el.style.opacity = '1';
    m.faded = false;
  }

  // Scroll to the newest message so re-appeared history doesn't leave the view stranded.
  logEl.scrollTop = logEl.scrollHeight;

  // Restore whatever was left in the box last time chat closed with unsent text.
  requestAnimationFrame(() => {
    inputEl.focus();
    const v = inputEl.value;
    inputEl.setSelectionRange(v.length, v.length);
  });
}

/**
 * @param {Object} opts
 * @param {boolean} opts.clearInput - true after a real submit (Enter with text); false to
 *   preserve whatever's currently typed (Escape, click-away, or Enter on an empty box).
 */
function closeChat({ clearInput } = { clearInput: true }) {
  chatOpen = false;
  if (suggestEl) suggestEl.style.display = 'none';
  chatEl.classList.remove('open');
  if (clearInput) inputEl.value = '';
  inputEl.style.display = 'none';
  hintEl.style.display  = 'block';
  inputEl.blur();
  historyIndex = -1;
  // Messages that had already faded once (and were re-revealed by opening chat)
  // fade back out quickly; anything sent fresh this session gets the normal delay.
  messages.forEach(m => armFade(m, m.wasReopened ? REOPEN_FADE_DELAY : FADE_DELAY));
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat commands
// ─────────────────────────────────────────────────────────────────────────────
// Reference list shown by /cmds — kept next to the handlers so it can't drift.
// Anyone's commands (beyond squads and clans)
const PLAYER_HELP = [
  { usage: '/profile {user?}',                      desc: "Open someone's profile (yours if no name), e.g. /profile vyx" },
  { usage: '/claim',                                desc: 'Claim your daily streak reward and every finished challenge' },
];

const SQUAD_HELP = [
  { usage: '/new-squad',                            desc: 'Make a squad (private) in your biome' },
  { usage: '/join-squad {code}',                    desc: 'Join a squad, e.g. /join-squad garden-7KQ2' },
  { usage: '/leave-squad',                          desc: 'Leave your squad' },
  { usage: '/squad-code',                           desc: 'Copy your squad\'s code' },
  { usage: '/set-squad-public',                     desc: 'Let anyone find your squad (leader)' },
  { usage: '/set-squad-private',                    desc: 'Join by code only (leader)' },
  { usage: '/find-public-squad',                    desc: 'Join a public squad you can join' },
  { usage: '/cmds',                                 desc: 'Show this list' },
];
const CLAN_HELP = [
  { usage: '/clan-invite {user}',                   desc: 'Invite an online player to your clan (leader)' },
  { usage: '/clan-kick {user}',                     desc: 'Remove someone from your clan (leader)' },
  { usage: '/clan-transfer {user}',                 desc: 'Make another member the clan leader (leader)' },
];
// {user?}: do it to another online player instead — their username, or a
// guest's tag as #KZTT (server/rooms.js finds them, wherever they are)
const ADMIN_HELP = [
  { usage: '/speed {num} {user?}',                  desc: 'Set speed multiplier, e.g. /speed 2.5 = 2.5x' },
  { usage: '/set hp {num} {user?}',                 desc: 'Add bonus max HP, e.g. /set hp 1k' },
  { usage: '/set dmg {num} {user?}',                desc: 'Add bonus body damage, e.g. /set dmg 500' },
  { usage: '/spawn {mob} {rarity} {boss?} {shiny? / spooky?} {user?}', desc: 'Spawn a mob near you (or them), e.g. /spawn baby-ant l boss, /spawn hornet o shiny (spooky: during the Halloween event)' },
  { usage: '/give {petal} {rarity?} {count?} {user?}', desc: 'Add petals to inventory, e.g. /give third-eye m 3 #KZTT' },
  { usage: '/take {petal} {rarity?} {count?|all} {user?}', desc: 'Take petals out of inventory, e.g. /take web u all SkissueFrKai' },
  { usage: '/bosspetals {rarity} {boss?} {user?}', desc: 'One of each biome boss\'s own petals at a rarity — all of them, or one boss\'s (flytrap, wyrm, kraken, tarantula, primordial, eye)' },
  { usage: '/givenewpetals {rarity} {shiny?} {user?}', desc: 'One of each newest petal (Cell, RNA, Hemoglobin, Organelle, DNA, Chromosome) at a rarity (or its Shiny — no Shiny Cell yet)' },
  { usage: '/givepetalsnoshiny {rarity?} {user?}',   desc: 'One of every petal whose Shiny does nothing yet (the normal one)' },
  { usage: '/givepetalsnofunc {rarity?} {user?}',    desc: 'One of every petal with no special function' },
  { usage: '/adddodge {text} {user?}',               desc: 'Add a word their flower can show instead of Dodge!' },
  { usage: '/cleardodge {user?}',                    desc: 'Clear their dodge words (back to Dodge!)' },
  { usage: '/givediep-petals {rarity} {user?}',      desc: 'One of every Diep drop (tanks, square, triangle, pentagon) at a rarity' },
  { usage: '/givediep-petal {petal} {rarity?} {count?} {user?}', desc: 'One Diep drop: a tank (tank, penta-shot), square, triangle or pentagon' },
  { usage: '/giveEgg {mob} {rarity?} {count?} {user?}', desc: 'A gray egg that hatches that mob as your pet, e.g. /giveEgg baby-ant l 2' },
  { usage: '/petals {rarity} {user?}',              desc: 'One of every petal at a rarity, e.g. /petals l' },
  { usage: '/petals petals {user?}',                desc: 'Clear the inventory, then one of every petal at every rarity' },
  { usage: '/petals shiny {rarity} {user?}',        desc: 'One of every Shiny petal at a rarity, e.g. /petals shiny u' },
  { usage: '/godmode {user?}',                      desc: 'Toggle unkillable mode' },
  { usage: '/viewcheckpoints {user?}',               desc: 'Toggle the checkpoints drawn in red on the minimap' },
  { usage: '/invis {user?}',                        desc: 'Toggle invisible: flower hidden (petals show), mobs ignore you and pass through you, walk through walls' },
  { usage: '/goto {user}',                          desc: 'Teleport to them (same biome), onto open ground' },
  { usage: '/bring {user}',                         desc: 'Teleport them to you (same biome), onto open ground' },
  { usage: '/spectate {user}',                      desc: 'See what they see, following them from biome to biome (you go invisible)' },
  { usage: '/unspectate',                           desc: 'Stop spectating: back to your own flower' },
  { usage: '/cartooncat',                           desc: 'vyx only: become the Cartoon Cat (keys under the minimap); again to turn back' },
  { usage: '/fullindex {user?}',                    desc: 'Unlock every mob in the gallery' },
  { usage: '/reset {user}',                         desc: 'Back to level 1 and Basics; wipes progress, keeps the account' },
  { usage: '/invclear {user}',                      desc: 'Remove every petal from their inventory, top row and bench' },
  { usage: '/setlevel {user?} {level}',             desc: 'Set a level, e.g. /setlevel 50 or /setlevel vyx 50' },
  { usage: '/readystreak {user?}',                  desc: 'Their daily streak reward opens now (their day is kept)' },
  { usage: '/serverreset {time}',                   desc: "Count down (30s, 10m, 1h30m…) and restart the server; every page reloads — /serverreset cancel stops it" },
  { usage: '/unlockskineditor {user}',              desc: 'Give someone the Skin Studio (online or not)' },
  { usage: '/revokeskineditor {user}',              desc: 'Take the Skin Studio away (their skins stay)' },
  { usage: '/unlockstudio {user}',                  desc: 'Give someone the Game Studio (online or not)' },
  { usage: '/revokestudio {user}',                  desc: 'Take the Game Studio away' },
  { usage: '/updategamestudiochanges',              desc: "Put the saved Game Studio changes in: every room restarts and every page refreshes" },
  { usage: '/starthalloweenevent',                  desc: 'Start the Halloween event: every room restarts fresh (no loot from the old mobs) and every page refreshes' },
  { usage: '/endhalloweenevent',                    desc: 'End the Halloween event the same way — Spookys and the Ghost Flower are gone' },
  { usage: '/spawnghostflower',                     desc: 'Put the Ghost Flower (candy → credits) in the Garden, by the spawn' },
  { usage: '/despawnghostflower',                   desc: 'Take the Ghost Flower away' },
  { usage: '/enable-AI',                            desc: 'Turn on Zevo, the AI player, and spawn it in your biome' },
  { usage: '/disable-AI',                           desc: 'Turn Zevo off and despawn it (its progress is kept)' },
  { usage: '/ai-brain {learned|scripted}',          desc: "Zevo's brain: the trained network, or the scripted rules" },
  { usage: '/unlockdiep {user}',                    desc: 'Give someone the hidden Diep biome (online or not)' },
  { usage: '/revokediep {user}',                    desc: 'Take the Diep biome away from someone' },
  { usage: '/active-diep',                          desc: 'Switch the Diep biome on (Play works for those with access)' },
  { usage: '/deactive-diep',                        desc: 'Switch the Diep biome off and send everyone in it home' },
  { usage: '{user?}',                              desc: 'Another player: their username, or a guest #tag' },
];

// Squad commands (anyone): what each asks for. A reply comes back as a [System] line.
const PLAYER_COMMANDS = {
  '/profile': arg => {
    const who = arg || account.username || account.guestTag;
    if (who) openProfileView(who);
  },
};

const SQUAD_COMMANDS = {
  '/new-squad':         () => newSquad(),
  '/join-squad':        arg => (arg ? joinSquad(arg) : pushSystemMessage('Usage: /join-squad {code} — e.g. /join-squad garden-7KQ2')),
  '/leave-squad':       () => leaveSquad(),
  '/set-squad-public':  () => setSquadPublic(true),
  '/set-squad-private': () => setSquadPublic(false),
  '/find-public-squad': () => findPublicSquad(),
  '/squad-code':        () => copySquadCode(),
};

// Clan commands: clan requests (the server checks you're the leader)
const CLAN_COMMANDS = {
  '/clan-invite':   arg => (arg ? inviteToClan(arg) : pushSystemMessage('Usage: /clan-invite {user}')),
  '/clan-kick':     arg => (arg ? kickFromClan(arg) : pushSystemMessage('Usage: /clan-kick {user}')),
  '/clan-transfer': arg => (arg ? transferClan(arg) : pushSystemMessage('Usage: /clan-transfer {user}')),
};

/** Copies the squad code (the Squad panel's Copy button too). */
export function copySquadCode() {
  if (!squad.code) { pushSystemMessage('You\'re not in a squad.'); return; }
  navigator.clipboard?.writeText(squad.code).then(
    () => pushSystemMessage(`Copied your squad code: ${squad.code}`),
    () => pushSystemMessage(`Your squad code: ${squad.code}`));
}

/** Renders the /cmds output as a single clean, organized system message block. */
function pushCommandList() {
  if (!logEl) return;
  const el = document.createElement('div');
  el.className = 'chat-msg chat-cmds';

  const sections = [['Player commands', PLAYER_HELP], ['Squad commands', SQUAD_HELP], ['Clan commands', CLAN_HELP]];
  if (account.isAdmin) sections.push(['Admin commands', ADMIN_HELP]);
  for (const [heading, help] of sections) {
    const title = document.createElement('div');
    title.className = 'chat-cmds-title';
    title.textContent = heading;
    el.appendChild(title);

    const list = document.createElement('div');
    list.className = 'chat-cmds-list';
    for (const { usage, desc } of help) {
      const row = document.createElement('div');
      row.className = 'chat-cmds-row';

      const usageSpan = document.createElement('span');
      usageSpan.className = 'chat-cmds-usage';
      usageSpan.textContent = usage;

      const descSpan = document.createElement('span');
      descSpan.className = 'chat-cmds-desc';
      descSpan.textContent = desc;

      row.appendChild(usageSpan);
      row.appendChild(descSpan);
      list.appendChild(row);
    }
    el.appendChild(list);
  }

  el.style.transform = `translateX(-${CHAT_LEFT + CHAT_W}px)`;
  el.style.opacity   = '0';
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${SLIDE_MS}ms ease`;
      el.style.transform  = 'translateX(0)';
      el.style.opacity    = '1';
    });
  });

  const msg = { el, timerId: null, faded: false, wasReopened: false };
  messages.push(msg);
  while (messages.length > MAX_MESSAGES) {
    const old = messages.shift();
    clearTimeout(old.timerId);
    old.el.remove();
  }
  armFade(msg);
}

// ── Command preview ─────────────────────────────────────────────────────────
const cmdOf = h => h.usage.split(' ')[0];
/** What a picked command fills the input with: the command, and a space if it takes more. */
const fillOf = h => cmdOf(h) + (h.usage.includes(' ') ? ' ' : '');

/** The commands `text` could be: still typing the command, everything it could be; past it (a space), just that one. */
function matchingCommands(text) {
  const typed = text.split(/\s/, 1)[0].toLowerCase();
  const hasArgs = /\s/.test(text);
  const all = account.isAdmin ? [...PLAYER_HELP, ...SQUAD_HELP, ...CLAN_HELP, ...ADMIN_HELP] : [...PLAYER_HELP, ...SQUAD_HELP, ...CLAN_HELP];
  return all.filter(h => {
    const cmd = cmdOf(h).toLowerCase();   // (/enable-AI is typed any case)
    return hasArgs ? cmd === typed : cmd.startsWith(typed);
  });
}

// Tab while typing a command fills it in: the first Tab picks the first one it
// could be, each Tab after the next (Shift+Tab goes back) — round and round
// while the input still holds the one Tab put there.
let tabCycle = null;   // { fills: [what each match fills in], i }

/** Tab in the chat input: true if it completed (or was in) a command — false lets Tab switch channel. */
function completeCommand(dir) {
  const text = inputEl.value;
  if (!text.startsWith('/')) return false;
  if (!tabCycle || text !== tabCycle.fills[tabCycle.i]) {
    if (/\s/.test(text)) return true;   // (past the command: nothing to fill in)
    const fills = matchingCommands(text).map(fillOf);
    if (!fills.length) return true;
    tabCycle = { fills, i: dir > 0 ? 0 : fills.length - 1 };
  } else {
    tabCycle.i = (tabCycle.i + dir + tabCycle.fills.length) % tabCycle.fills.length;
  }
  inputEl.value = tabCycle.fills[tabCycle.i];
  inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
  updateSuggest();
  return true;
}

/** Shows the commands matching what's typed ("/jo" → /join-squad …) above the box. */
function updateSuggest() {
  if (!suggestEl) return;
  const text = inputEl.value;
  if (!chatOpen || !text.startsWith('/')) { suggestEl.style.display = 'none'; return; }
  const matches = matchingCommands(text).slice(0, 5);
  if (!matches.length) { suggestEl.style.display = 'none'; return; }
  suggestEl.replaceChildren(...matches.map(h => {
    const row = document.createElement('div');
    row.className = 'chat-suggest-row';
    row.dataset.fill = fillOf(h);
    const u = document.createElement('span');
    u.className = 'chat-cmds-usage';
    u.textContent = h.usage;
    const d = document.createElement('span');
    d.className = 'chat-cmds-desc';
    d.textContent = h.desc;
    row.append(u, d);
    return row;
  }));
  suggestEl.style.display = 'block';
}

// ── Squad codes in chat: blue, click to copy. @mentions: click for their profile ──
const CODE_RE = /\b((?:garden|desert|ocean|jungle|swamp|space)-[A-Za-z0-9]{4})\b|@([A-Za-z0-9_]{2,16})\b/g;

/** A clickable span that opens `user`'s profile (a [tag] or an @mention). */
function profileLink(cls, text, user) {
  const link = document.createElement('span');
  link.className = cls + ' chat-user';
  link.textContent = text;
  link.addEventListener('mousedown', e => {
    e.stopPropagation();   // (not a click on the game behind it)
    e.preventDefault();
    openProfileView(user);
  });
  return link;
}

/** Appends `text` to `parent`, turning squad codes into click-to-copy links, @names into profile links and :names: into emojis (ui/emojis.js). */
function appendWithCodes(parent, text) {
  let last = 0;
  for (const m of text.matchAll(CODE_RE)) {
    if (m.index > last) appendEmojis(parent, text.slice(last, m.index));
    if (m[2]) {
      parent.append(profileLink('chat-mention', m[0], m[2]));
      last = m.index + m[0].length;
      continue;
    }
    const code = m[1];
    const link = document.createElement('span');
    link.className = 'chat-code';
    link.textContent = code;
    link.addEventListener('mousedown', e => {
      e.stopPropagation();   // (not a click on the game behind it)
      e.preventDefault();
      navigator.clipboard?.writeText(code).then(
        () => pushSystemMessage(`Copied ${code}`),
        () => pushSystemMessage(`Couldn't copy — the code is ${code}`));
    });
    parent.append(link);
    last = m.index + code.length;
  }
  if (last < text.length) appendEmojis(parent, text.slice(last));
}

// ── Rare spawns (this biome only — the server only tells its own players) ───
// "A Shiny Omega Hornet has spawned!" — a Shiny one from Omega up (game/mobs.js announceSpawn)
onNet('spawned', ({ typeId, tier, boss, shiny }) => {
  const rarity = RARITIES[tier] ?? 'Unique';
  pushLine(el => el.append(serverTag(), shiny ? 'A ' : article(rarity), ...shinyRare(shiny, rarity),
    ` ${mobName(typeId, boss)} has spawned!`));
});

// ── Kill and drop news (this biome only — server/room/worker.js) ─────────────
// "A Super Beetle was killed by @Vyx with 54.3% damage!"
// "@Vyx got x1 Super Beetle Egg from Unique Beetle!" — the rarities coloured,
// the player's name a link to their profile.
const article = rarity => (/^(?:[AEIO]|U(?!ni))/i.test(rarity) ? 'An ' : 'A ');
function rareSpan(rarity) {
  const el = document.createElement('span');
  el.className = 'chat-rare';
  el.style.color = rarityText(rarity);
  el.textContent = rarity;
  return el;
}
/** "Shiny Omega" (Shiny in gold, the rarity in its colour) for a Shiny mob, just the rarity otherwise. */
function shinyRare(shiny, rarity) {
  if (!shiny) return [rareSpan(rarity)];
  const el = document.createElement('span');
  el.className = 'chat-rare';
  el.style.color = SHINY_TEXT_COLOR;
  el.textContent = 'Shiny';
  return [el, ' ', rareSpan(rarity)];
}
function newsWho(who, user) {
  return user ? profileLink('chat-mention', who, user) : who;
}
function serverTag() {
  const tag = document.createElement('span');
  tag.className = 'chat-ch server';
  tag.textContent = '[Server] ';
  return tag;
}
const mobName = (typeId, boss) => `${boss ? 'Boss ' : ''}${MOB_DEFS[typeId]?.name ?? typeId}`;
onNet('killed', m => {
  if (!settings.chatKills || m.tier < settings.chatKillTier) return;   // (Settings → Mob Death Rarity)
  const rarity = RARITIES[m.tier] ?? 'Common';
  pushLine(el => el.append(serverTag(), m.shiny ? 'A ' : article(rarity), ...shinyRare(m.shiny, rarity), ` ${mobName(m.typeId, m.boss)} was killed by `,
    newsWho(m.who, m.user), ` with ${m.pct}% damage!`));
});
onNet('dropped', m => {
  const pt = PETAL_TYPES[m.petalId];
  if (!pt || !settings.chatDrops || rarityTier(pt.rarity) < settings.chatDropTier) return;   // (Settings → Drop Rarity)
  const fromRarity = RARITIES[m.fromTier] ?? 'Common';
  pushLine(el => el.append(serverTag(), newsWho(m.who, m.user), ` got x${m.count} `, rareSpan(pt.rarity), ` ${pt.name} from `,
    ...shinyRare(m.shiny, fromRarity), ` ${mobName(m.from, m.boss)}!`));
});
// "@Vyx crafted x1 Super Leaf from x15 Omega Leaf!" / "@Vyx crafted nothing from x10 Omega Leaf!"
// — shown by the rarity it was crafted to (Settings → Craft Rarity)
onNet('crafted', m => {
  const from = PETAL_TYPES[m.from], to = PETAL_TYPES[m.to];
  if (!from || !to || !settings.chatCrafts || rarityTier(to.rarity) < settings.chatCraftTier) return;
  const made = m.made > 0 ? [`x${m.made} `, rareSpan(to.rarity), ` ${to.name}`] : ['nothing'];
  pushLine(el => el.append(serverTag(), newsWho(m.who, m.user), ' crafted ', ...made, ` from x${m.used} `,
    rareSpan(from.rarity), ` ${from.name}!`));
});

// Reading back: a new line only scrolls the log down to it if you were
// already at the bottom (or chat is closed). Scrolled up, the view stays on
// what you're reading — the oldest lines trimmed off the top are made up for.
const LOG_GAP = 1;   // (#chat-log's gap between lines)
function followingLog() {
  return !chatOpen || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
}
function trimLog(following) {
  while (messages.length > MAX_MESSAGES) {
    const old = messages.shift();
    clearTimeout(old.timerId);
    const h = following ? 0 : old.el.offsetHeight + LOG_GAP;
    old.el.remove();
    if (h) logEl.scrollTop -= h;
  }
}

/** Adds one line to the log, slid in and faded like every other. */
function pushLine(fill) {
  if (!logEl) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';
  fill(el);
  el.style.transform = `translateX(-${CHAT_LEFT + CHAT_W}px)`;
  el.style.opacity   = '0';
  const following = followingLog();
  logEl.appendChild(el);
  if (following) logEl.scrollTop = logEl.scrollHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${SLIDE_MS}ms ease`;
      el.style.transform  = 'translateX(0)';
      el.style.opacity    = '1';
    });
  });
  const msg = { el, timerId: null, faded: false, wasReopened: false };
  messages.push(msg);
  trimLog(following);
  if (!chatOpen) armFade(msg);
}

function submitMessage(text) {
  // /cmds is the help list, drawn right here; squad commands become squad
  // requests; every other line (admin commands too) goes to the server on the
  // current channel.
  const [cmd, arg] = text.trim().split(/\s+/, 2);
  const lower = cmd.toLowerCase();
  if (lower === '/cmds') { pushCommandList(); return; }
  if (PLAYER_COMMANDS[lower]) { PLAYER_COMMANDS[lower](text.trim().slice(cmd.length).trim()); return; }   // (the whole rest: "Guest #KZTT" has a space)
  if (SQUAD_COMMANDS[lower]) { SQUAD_COMMANDS[lower](arg); return; }
  if (CLAN_COMMANDS[lower]) { CLAN_COMMANDS[lower](arg); return; }
  sendChat(text, channel);
}

/** A chat line from the server: [Global] [Lvl N] [username] display name: text. */
function addChatLine({ ch, lvl, tag, name, color, text, clan, badges }) {
  if (!logEl) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';

  // Channel
  const chSpan = document.createElement('span');
  chSpan.className = `chat-ch ${channelOf(ch)}`;
  chSpan.textContent = CHANNEL_LABEL[channelOf(ch)] + ' ';
  el.appendChild(chSpan);

  // [CLAN] — the clan tag, for clan members
  if (clan) {
    const clanSpan = document.createElement('span');
    clanSpan.className = 'chat-clan-tag';
    clanSpan.textContent = `[${clan}] `;
    el.appendChild(clanSpan);
  }

  // Badges: [Dev]… (server/config.js CHAT_BADGES)
  for (const b of Array.isArray(badges) ? badges : []) {
    if (!b?.text) continue;
    const badge = document.createElement('span');
    badge.className = 'chat-badge';
    if (b.color) badge.style.color = b.color;
    badge.textContent = `[${b.text}] `;
    el.appendChild(badge);
  }

  // Level badge
  const lvlSpan = document.createElement('span');
  lvlSpan.className = 'chat-lvl';
  lvlSpan.style.color = color;
  lvlSpan.textContent = `[Lvl ${lvl}]`;

  // Separator space
  const sep = document.createTextNode(' ');

  // [username] — the account, or the guest tag: click for their profile
  const tagSpan = document.createElement('span');
  tagSpan.className = 'chat-tag';
  tagSpan.append(profileLink('chat-tag-link', `[${tag}]`, tag), ' ');

  // Display name
  const nameSpan = document.createElement('span');
  nameSpan.className = channelOf(ch) === 'global' ? 'chat-name' : `chat-name ${ch}`;
  nameSpan.textContent = (name || 'Unnamed') + ': ';

  // Message text
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  appendWithCodes(textSpan, text);

  el.appendChild(lvlSpan);
  el.appendChild(sep);
  el.appendChild(tagSpan);
  el.appendChild(nameSpan);
  el.appendChild(textSpan);

  // Start off-screen to the left for slide-in
  el.style.transform = `translateX(-${CHAT_LEFT + CHAT_W}px)`;
  el.style.opacity   = '0';

  const following = followingLog();
  logEl.appendChild(el);
  if (following) logEl.scrollTop = logEl.scrollHeight;

  // Trigger slide-in on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${SLIDE_MS}ms ease`;
      el.style.transform  = 'translateX(0)';
      el.style.opacity    = '1';
    });
  });

  const msg = { el, timerId: null, faded: false, wasReopened: false };
  messages.push(msg);

  trimLog(following);
  if (!chatOpen) armFade(msg);   // (an open chat fades everything when it closes)
}

onNet('chat', addChatLine);
onNet('sys', m => (m.ch === 'squad' || m.ch === 'clan' ? pushChannelNote(m.ch, m.text) : pushSystemMessage(m.text)));
onNet('glitch', m => pushLine(el => el.append(glitchText(m.text))));

// ── Glitchy lines (the Cartoon Cat arriving — server/room/worker.js) ─────────
// No tag (Dev): the text alone, a sickly white, its letters scrambling into place, with red and cyan
// copies of it jolting sideways every so often
const GLITCH_CHARS = '!<>-_\\/[]{}=+*^?#░▒▓█';
const GLITCH_CSS = `
.chat-glitch { position: relative; display: inline-block; color: #e8e2f0; font-weight: bold; letter-spacing: 0.5px;
  text-shadow: 0 0 6px rgba(140, 0, 30, 0.6); animation: chat-glitch-skew 2.6s infinite steps(1); }
.chat-glitch::before, .chat-glitch::after { content: attr(data-text); position: absolute; left: 0; top: 0; width: 100%;
  overflow: hidden; pointer-events: none; }
.chat-glitch::before { color: #ff2a4d; animation: chat-glitch-a 2.2s infinite steps(1); }
.chat-glitch::after  { color: #2af0ff; animation: chat-glitch-b 1.9s infinite steps(1); }
@keyframes chat-glitch-a { 0%, 62%, 100% { transform: none; clip-path: inset(0 0 100% 0); }
  64% { transform: translate(-3px, -1px); clip-path: inset(10% 0 55% 0); } 68% { transform: translate(2px, 1px); clip-path: inset(60% 0 8% 0); }
  72% { transform: translate(-1px, 0); clip-path: inset(30% 0 40% 0); } }
@keyframes chat-glitch-b { 0%, 40%, 100% { transform: none; clip-path: inset(0 0 100% 0); }
  42% { transform: translate(3px, 1px); clip-path: inset(50% 0 20% 0); } 46% { transform: translate(-2px, -1px); clip-path: inset(5% 0 70% 0); }
  50% { transform: translate(1px, 0); clip-path: inset(75% 0 2% 0); } }
@keyframes chat-glitch-skew { 0%, 80%, 100% { transform: none; } 82% { transform: skewX(-12deg); } 84% { transform: skewX(8deg); } 86% { transform: none; } }`;
let glitchStyled = false;

/** `text` as a glitchy span: it scrambles into place over a second, then keeps glitching. */
function glitchText(text) {
  if (!glitchStyled) {
    glitchStyled = true;
    const style = document.createElement('style');
    style.textContent = GLITCH_CSS;
    document.head.appendChild(style);
  }
  const span = document.createElement('span');
  span.className = 'chat-text chat-glitch';
  span.dataset.text = text;
  const t0 = performance.now(), SETTLE_MS = 1100;
  const frame = now => {
    const done = Math.min(1, (now - t0) / SETTLE_MS);
    const fixed = Math.floor(done * text.length);
    let out = text.slice(0, fixed);
    for (let i = fixed; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    span.textContent = out;
    if (done < 1) requestAnimationFrame(frame);
  };
  frame(t0);
  return span;
}

/** "[Squad] X has joined the squad!" / "[Clan] @x has joined the clan!" — news, in the channel's colour. */
function pushChannelNote(ch, text) {
  pushLine(el => {
    const tag = document.createElement('span');
    tag.className = `chat-ch ${ch}`;
    tag.textContent = `${CHANNEL_LABEL[ch]} `;
    const body = document.createElement('span');
    body.className = `chat-text chat-${ch}-note`;
    body.textContent = text;
    el.append(tag, body);
  });
}

function armFade(msg, delay = FADE_DELAY) {
  clearTimeout(msg.timerId);
  msg.el.classList.remove('fading');
  msg.el.style.opacity = '1';
  msg.faded = false;
  msg.timerId = setTimeout(() => {
    msg.el.classList.add('fading');
    msg.timerId = setTimeout(() => {
      msg.faded = true;
    }, FADE_DUR + 50);
  }, delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// System message (chat commands / server notices)
// ─────────────────────────────────────────────────────────────────────────────
function pushSystemMessage(text) {
  if (!logEl) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';

  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  textSpan.style.cssText = 'color:#adf; font-style:italic;';
  appendWithCodes(textSpan, `[System] ${text}`);
  el.appendChild(textSpan);

  el.style.transform = `translateX(-${CHAT_LEFT + CHAT_W}px)`;
  el.style.opacity   = '0';
  const following = followingLog();
  logEl.appendChild(el);
  if (following) logEl.scrollTop = logEl.scrollHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${SLIDE_MS}ms ease`;
      el.style.transform  = 'translateX(0)';
      el.style.opacity    = '1';
    });
  });

  const msg = { el, timerId: null, faded: false, wasReopened: false };
  messages.push(msg);
  trimLog(following);
  armFade(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    #chat-wrap {
      position: fixed;
      z-index: 60;
      display: flex;
      flex-direction: column;
      gap: 0;
      pointer-events: none;
      font-family: 'UbuntuCustom', 'Ubuntu', Arial, sans-serif;
      /* Clip so slide-in messages don't bleed left into the button column */
      overflow: hidden;
    }

    #chat-log {
      display: flex;
      flex-direction: column;
      gap: 1px;
      max-height: 160px;
      overflow-y: hidden;
      overflow-x: hidden;
      overflow-anchor: none;   /* (trimLog keeps the view still itself) */
      padding: 0 0 5px 0;
      pointer-events: none;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.25) transparent;
    }

    /* Only scrollable (and interactive) while chat is open — otherwise it
       would eat mouse/wheel input over the game world. */
    #chat-wrap.open #chat-log {
      overflow-y: auto;
      pointer-events: auto;
    }

    #chat-log::-webkit-scrollbar { width: 5px; }
    #chat-log::-webkit-scrollbar-track { background: transparent; }
    #chat-log::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.25);
      border-radius: 3px;
    }

    .chat-msg {
      display: inline-block;
      align-self: flex-start;
      padding: 0 2px;
      font-size: 10.5px;
      ${outline(2, 'rgba(0, 0, 0, 0.85)')}
      line-height: 1.3;
      color: #e8e8f0;
      max-width: 100%;
      word-break: break-word;
      pointer-events: none;
      /* fade-out transition (slide-in transition set inline per-message) */
      transition: opacity ${FADE_DUR}ms ease;
    }

    .chat-msg.fading { opacity: 0 !important; }

    /* ── /cmds command list ─────────────────────────────────────────────── */
    .chat-cmds {
      padding: 6px 9px 7px 9px;
      background: rgba(10, 14, 28, 0.88);
      border: 1px solid rgba(125, 232, 168, 0.25);
      border-radius: 6px;
      text-shadow: none;   /* (it keeps its box, so no outline needed) */
    }

    .chat-cmds-title {
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: #7de8a8;
      margin-bottom: 4px;
    }

    .chat-cmds-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .chat-cmds-row {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .chat-cmds-usage {
      font-family: 'Consolas', 'Menlo', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #ffe08a;
      word-break: break-word;
    }

    .chat-cmds-desc {
      font-size: 11px;
      color: #b8b8cc;
      padding-left: 6px;
      word-break: break-word;
    }

    .chat-lvl {
      font-weight: 700;
      font-size: 9.5px;
    }

    .chat-tag {
      font-weight: 700;
      color: #8f93b8;
    }

    .chat-name {
      font-weight: 700;
      color: #c8c8e8;
    }

    .chat-text { color: #e8e8f0; }

    /* Channels: [Global] / [Squad] — in squad lines the name is pink too */
    .chat-ch { font-weight: 700; font-size: 9.5px; }
    .chat-clan-tag { font-weight: 700; font-size: 9.5px; color: #5d99e0; }   /* (the Clan button's blue) */
    .chat-badge { font-weight: 700; font-size: 9.5px; color: #ffd166; }
    .chat-ch.global { color: #9fb2d8; }
    .chat-ch.squad,
    .chat-name.squad { color: #ff8fd8; }
    #chat-channel { margin-right: 6px; user-select: none; pointer-events: none; }
    .chat-ch.server { color: #ffd166; }
    .chat-rare { font-weight: 700; }
    .chat-squad-note { color: #ffc4ec; font-style: italic; }
    .chat-ch.clan,
    .chat-name.clan { color: #7dff7a; }
    .chat-clan-note { color: #c6ffc4; font-style: italic; }

    /* Squad codes: blue, click to copy (clickable even though lines aren't) */
    .chat-code {
      color: #5ab4ff;
      font-weight: 700;
      cursor: default;
      pointer-events: auto;
    }
    .chat-code:hover { text-decoration: underline; }
    .chat-msg.fading .chat-code { pointer-events: none; }

    /* [tag] and @mentions: click for that player's profile */
    .chat-user { cursor: default; pointer-events: auto; white-space: nowrap; }
    .chat-user:hover { text-decoration: underline; }
    .chat-mention { color: #ffd166; font-weight: 700; }

    /* :name: — a Discord server emoji's picture (ui/emojis.js) */
    .chat-emoji { width: 1.375em; height: 1.375em; object-fit: contain; vertical-align: -0.35em; }
    .chat-msg.fading .chat-user { pointer-events: none; }

    /* Command preview, just above the input row */
    #chat-suggest {
      display: none;
      margin-bottom: 4px;
      padding: 5px 8px;
      background: rgba(10, 14, 28, 0.88);
      border: 1px solid rgba(125, 232, 168, 0.25);
      border-radius: 6px;
      pointer-events: auto;
    }
    .chat-suggest-row {
      display: flex;
      flex-direction: column;
      padding: 2px 3px;
      border-radius: 4px;
      cursor: default;
    }
    .chat-suggest-row + .chat-suggest-row { margin-top: 2px; }
    .chat-suggest-row:hover { background: rgba(125, 232, 168, 0.12); }

    #chat-input-row {
      display: flex;
      align-items: center;
      background: rgba(10, 14, 28, 0.60);
      border: 2px solid rgba(255,255,255,0.10);
      border-radius: 7px;
      padding: 4px 9px;
      cursor: text;
      pointer-events: auto;
      transition: border-color 0.15s, background 0.15s;
    }

    #chat-wrap.open #chat-input-row {
      background: rgba(10, 14, 28, 0.90);
      border-color: rgba(125, 232, 168, 0.50);
    }

    #chat-input-row:hover { border-color: rgba(255,255,255,0.22); }

    #chat-hint {
      font-size: 12px;
      color: rgba(200, 200, 220, 0.50);
      user-select: none;
      pointer-events: none;
    }

    #chat-input {
      display: none;
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-family: 'UbuntuCustom', 'Ubuntu', Arial, sans-serif;
      font-size: 12px;
      color: #e8e8f0;
      caret-color: #7de8a8;
      width: 100%;
    }

    #chat-input::placeholder { color: rgba(200,200,220,0.30); }
  `;
  document.head.appendChild(s);
}