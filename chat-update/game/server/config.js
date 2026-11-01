// config.js — the server's settings, in one place.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The project folder (the one with package.json). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Secrets (GAME_BOT_SECRET) live in .env, loaded here rather than with node's
// --env-file flag, which sends `node --watch` (npm run dev) into a restart loop
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env: fine */ }

/** Where the game listens. The tunnel (see SERVER_GUIDE.md) points at this. */
export const PORT = Number(process.env.PORT) || 5173;
export const HOST = process.env.HOST || 'localhost';

/** The database: one file holding every profile, account and session. Back it up by copying it. */
export const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'game.db');

/** The Game Studio's map files (server/gameStudio.js): new maps, and copies of the game's. */
export const STUDIO_DIR = process.env.STUDIO_DIR || path.join(ROOT, 'studio-creations');

/**
 * Web addresses the game may be opened from besides localhost — the tunnel's.
 * A leading dot means "this domain and everything under it". When you give
 * the game its own domain (SERVER_GUIDE.md, part 3), add it here.
 */
export const ALLOWED_HOSTS = [
  '.trycloudflare.com',   // Cloudflare quick tunnels
  '.devtunnels.ms',       // VS Code port forwarding
];

/**
 * Accounts that may use chat commands (/give, /spawn, …). Usernames, any
 * capitalisation. Empty: commands are off for everyone. Only add a username
 * once the right person has taken it (with a password) — otherwise whoever
 * sets that username first gets the commands.
 */
export const ADMIN_USERNAMES = ['vyx'];

/**
 * Chat badges: extra [tags] shown in someone's chat lines, after their clan
 * tag — "[Global] [CLAN] [Dev] [Lvl 50] [vyx] Vyx: hi". Username (lower case)
 * → a list of { text, color }. Add a line here to give someone a badge; the
 * server picks them up the next time that player connects.
 */
export const CHAT_BADGES = {
  vyx: [{ text: 'Dev', color: '#ff5d5d' }],
};

/**
 * The Discord bot's key to the /bot routes (server/discord.js): GAME_BOT_SECRET
 * in this folder's .env, the same as in ZephBot/bot/.env. Never put it in the
 * code. Empty: the bot can't reach the game (linking, ?profile stats).
 */
export const BOT_SECRET = process.env.GAME_BOT_SECRET || '';

/** How long a login (or a guest's cookie) lasts without visiting. Each visit renews it. */
export const SESSION_DAYS = 365;

/** Guests that never saved anything are deleted after this many days away. */
export const EMPTY_GUEST_DAYS = 7;
