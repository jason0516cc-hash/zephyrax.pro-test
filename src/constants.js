// ── World ────────────────────────────────────────────────────────────────────
export const WORLD_W = 21000;
export const WORLD_H = 35000;

// ── Player ───────────────────────────────────────────────────────────────────
export const PLAYER_RADIUS  = 22;
export const PLAYER_SPEED   = 4.2;
export const PLAYER_COLOR   = '#ffe840';
export const PLAYER_BORDER  = '#f0c800';
export const PLAYER_MAX_HP  = 100;
export const PLAYER_BASE_BODY_DAMAGE = 25;  // DPS dealt to mobs touching the player

// ── Camera ───────────────────────────────────────────────────────────────────
export const CAMERA_LAG        = 0.08;
export const PETAL_ORIGIN_LAG  = 0.18;

// ── Petals / Orbit ────────────────────────────────────────────────────────────
export const ORBIT_RADIUS_NORMAL   = 55;
export const ORBIT_RADIUS_EXPANDED = 110;
export const ORBIT_RADIUS_RETRACT  = 20;
export const ORBIT_EXPAND_SPEED    = 0.14;
export const ORBIT_SPEED           = 0.040;
export const PETAL_RADIUS          = 10;
export const PETAL_COLOR           = '#ffffff';
export const PETAL_BORDER          = '#cccccc';

// ── Hotbar ────────────────────────────────────────────────────────────────────
export const MAX_HOTBAR_SLOTS = 5;
export const HOTBAR_SLOT_SIZE = 56;
export const HOTBAR_GAP       = 8;

// ── Inventory panel ───────────────────────────────────────────────────────────
export const INV_PANEL_W   = 370;
export const INV_COLS      = 5;
export const INV_SLOT_SIZE = 58;
export const INV_SLOT_GAP  = 6;
export const INV_PADDING   = 12;
export const INV_HEADER_H  = 44;

// ── Rarity tier order (index 0 = lowest) ──────────────────────────────────────
export const RARITIES = [
  'Common',         // 0
  'Unusual',        // 1
  'Rare',           // 2
  'Epic',           // 3
  'Legendary',      // 4
  'Mythical',       // 5
  'Ultra',          // 6
  'Super',          // 7
  'Radiant',        // 8
  'Mystitic',       // 9
  'Runic',          // 10
  'Seraphic',       // 11
  'Umbral',         // 12
  'Impracticality', // 13
];

export function rarityTier(rarity) {
  const i = RARITIES.indexOf(rarity);
  return i === -1 ? 0 : i;
}

// ── Canonical rarity colours ──────────────────────────────────────────────────
// RARITY_BG   – slot / drop background (vivid but not blinding)
// RARITY_BORDER – slot border / darker accent
// RARITY_TEXT  – label text on dark background (bright, readable)
// RARITY_COLORS is an alias for RARITY_TEXT kept for legacy call-sites.



export const RARITY_BG = {
  Common:          '#90EE90',   // light green
  Uncommon:        '#B8D84F',   // light yellow-green
  Unusual:         '#FFFF66',   // light yellow
  Rare:            '#6699FF',   // blue
  Epic:            '#CC88FF',   // light purple
  Legendary:       '#FF3344',   // maroon / bright red
  Mythical:        '#44DDFF',   // light blue / teal
  Ultra:           '#FF77BB',   // hot pink
  Super:           '#00FFAA',   // cyan green
  Radiant:         '#FFD700',   // gold
  Mystitic:        '#00E5D0',   // turquoise
  Runic:           '#9966FF',   // deep indigo (bright)
  Seraphic:        '#FFFFFF',   // white / pearl
  Umbral:          '#000000',   // void (dim visible)
  Impracticality:  null,        // rendered as rainbow gradient
};

export const RARITY_BORDER = {
  Common:          '#1f4d1f',
  Uncommon:        '#6b7d2d',
  Unusual:         '#4d4500',
  Rare:            '#0d2266',
  Epic:            '#2a0066',
  Legendary:       '#440008',
  Mythical:        '#055566',
  Ultra:           '#660033',
  Super:           '#004433',
  Radiant:         '#664400',
  Mystitic:        '#004d48',
  Runic:           '#1a0044',
  Seraphic:        '#3a5577',
  Umbral:          '#000000',
  Impracticality:  '#880088',
};

export const RARITY_TEXT = {
  Common:          '#90EE90',   // light green
  Uncommon:        '#B8D84F',   // light yellow-green
  Unusual:         '#FFFF66',   // light yellow
  Rare:            '#6699FF',   // blue
  Epic:            '#CC88FF',   // light purple
  Legendary:       '#FF3344',   // maroon / bright red
  Mythical:        '#44DDFF',   // light blue / teal
  Ultra:           '#FF77BB',   // hot pink
  Super:           '#00FFAA',   // cyan green
  Radiant:         '#FFD700',   // gold
  Mystitic:        '#00E5D0',   // turquoise
  Runic:           '#9966FF',   // deep indigo (bright)
  Seraphic:        '#FFFFFF',   // white / pearl
  Umbral:          '#000000',   // void (dim visible)
  Impracticality:  '#FF88FF',   // rainbow (placeholder)
};

// Legacy alias — existing code importing RARITY_COLORS gets the text colours
export const RARITY_COLORS = RARITY_TEXT;

// ── Mobs ──────────────────────────────────────────────────────────────────────
export const MOB_SPAWN_TOTAL  = 50;
export const MOB_SAFE_RADIUS  = 350;
export const HORNET_PREFERRED_DIST_BASE = 250;
// Aggro range scaling per tier: higher = mobs notice targets from farther away
export const AGGRO_TIER_SCALE = 0.65;

// ── Physics ───────────────────────────────────────────────────────────────────
export const PLAYER_MASS     = 150;
