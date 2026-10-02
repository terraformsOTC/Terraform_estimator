// Glyph data from the Terraforms renderer, for the parcel page's blade and
// origin glyph rows. Both are fixed tables in the on-chain script, so they are
// copied here rather than fetched per parcel.

// The v2 renderer's `bladeRailSequencer`: a parcel's blade is
// BLADES[(biome + seed) % BLADES.length], the pattern its raised cells cycle.
export const BLADES = [
  "███████░░████████░░███████    █",
  "▟▙▆▇▂▟▙▆▇▂▟▙▆▇▂▟▙▆▇▂▟▙▆▇▂           ▅█▃▊▄▜▛▁",
  "▟ █ █ █ █ █ ▙ ▆▇░░░░░░░░░░░░▒▒▒▒▒▒▒▒▒▓▓▓▙――――――▄▄▄▀▀▀▄▄▄▀▀▀▄▄▄▀▀▀▄▄▄▀▀▀▄▄▄▀▀▀▄▄▄▀▀▀▜▁▛▜▁▛ ",
  "   ░░░░░░▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓███████▓▓▓▓▓▓▓▓▓▒▒▒▒▒░░░░░",
  "▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▓░░▂▃▅▅▃▂░░▓▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▓░░░░▓▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▓░░░░▓▰▰▰▰▰▰▰▓▓▓▓▓▓░░░░▓▓▓▓▓▓▓▓▓▓▓",
  "▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▄▄▄▄▄░░░░░▓▓▓▓████░░░░░░░░░░░░░░░░░░░",
  "――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――▇▇▇▇▇▆▇▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂",
  "||||||||||||||||||||||||||||||||||||||||||||||||||░░▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓███ ███▓▓▓",
  "░░░▒▒▒――++++―++++░░░▓++―▓█――+█++++―▒▒▒░░░ █▰▰▰     ░    ░   ░      ░  █   ░  █   ░    ",
  "――――――――――――▂▃░░▓▓▓▓▓▓▓▓▓▒▒░░▃▂▂▂▂▂▂▂▂▂▂▂",
  "+++++▓▓++++++++++++++++++++++++++▓▓▓▓+++++++++▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓",
  "▂▃▅▅▃▂▟███████████████████████████████████▙▂▃▅▅▃▂",
  "▄▄▄▄▆▆▆██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▄▌▌▌▌▄▄▄▄░░░░░▓▓▓▓████",
  "▓▓▓▓▓▓░░░░░░██████████+█████████████████+████████▓▓▓▓▓▓░░░░░░",
  "▂▃▅▅▃▂▂                    ▂▂▂▂▟████████████████████████████████████████████████▙",
  "█▌▐▄▀░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░░▒▒▒░░░░░░░░░░▒▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒░░░░░▒░▒░▒░▒░▒░▓▓▓▓▓▓▓▓▒░▒░▒░▒░▒░▒░▒░▒░▒░▒▓▓",
  "█▌█▌█▌█▌█▌█▌█▌█▌▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐ ▐――▐――▐――▐――▐――▐――▐――▐――▐――▐――▐―――――――――――――▓▓▓▓▓▓▓▓▓▓",
  "▓▓▓▓+░░░░░░░░░░▓▓▓▓+░░░░░░░░░░▓▓▓▓+▓▓+▓▓+▓▓+░░░░░░░░░░░░░░░░░░░░░░░░▓▓▓░░░░░░░░░░░░░░░░",
  "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▓▓▓░░░▒▒▒▓▓▓░░░████████████    █    ████████████▒▒▒▓▓▓░░░▒▒▒▓▓▓░░░▒▒▒▓▓▓░░░▒▒▒▓▓▓",
  "▆▇ ▆▇ ▆░░▇ ▆▇ ▆ ▇ ▆ ▇░░░░―░―░―░―░―░░░░▆▇ ▆ ▇░░▆▇▆ ▇▆▇▆▇   ―    ―    ―  ░―░―░░░░",
  "▓▓▓▓▓▓░░░░░░▓▓▓▓▓▓░░░░░░▓▓▓▓▓▓░░░░░░―――░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓░▓",
  "▒▓█    ▒▓█   ▒▓██   ▒▓██ ▒▓██  ▒▓█  ██████    █    █████▒▒▒▓▓▓░░░▒▒▒▓▓▓░░░▒▒▒▓▓▓░░░▒▒▒▓▓▓",
  "█▌▁▁▁▟▙▟▙▟▙▟▙▟▙▟▙▁▁▐▄▀▐▄▀▐▄▀▐▄▀▐▄▀▄▀░▒▓▓",
  "░░░▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰",
  "█▌█▌█▌█▌█▌█▌█▌█▌▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐ ――――――――――――▓▓▓▓▓▓▓▓▓▓",
  "   ███████    █    █  █    ▓▓  ▓▓  ▓▓",
  "||░░++▓▓――▆▇",
];

// The renderer's `uni` table. Origin parcels (Origin Daydream / Origin
// Terraform) animate a seed-picked 10-glyph run from it instead of the blade:
// one run, ORIGIN_UNI[seed % 28], for seed <= 9000, and all 28 runs above that.
export const ORIGIN_UNI = [
  9600, 9610, 9620, 3900, 9812, 9120, 9590, 143345, 48, 143672, 143682, 143692, 143702,
  820, 8210, 8680, 9573, 142080, 142085, 142990, 143010, 143030, 9580, 9540, 1470,
  143762, 143790, 143810,
];

export const isOriginMode = (mode) => mode === 'Origin Daydream' || mode === 'Origin Terraform';

export function bladeFor(biome, seed) {
  const b = Number(biome);
  const s = Number(seed);
  if (biome == null || seed == null || !Number.isFinite(b) || !Number.isFinite(s)) return null;
  return BLADES[(b + s) % BLADES.length];
}

// makeSet() as the renderer has it: String.fromCharCode keeps only the low 16
// bits, so table entries above 0xFFFF paint a wrapped code point, exactly as on
// chain.
function makeSet(start) {
  let out = '';
  for (let i = 0; i < 10; i++) out += String.fromCharCode(start + i);
  return out;
}

// The glyph run an origin parcel animates: `set` is its 0-27 index, or null
// when the parcel runs all 28 (seed > 9000). Combining marks are dropped: they
// are zero-width, collapse onto their neighbours in a string, and paint as
// blank cells in the animation anyway (set 13 is all marks, so it keeps the raw
// run rather than vanish).
export function originGlyphs(seed) {
  const s = Math.floor(Number(seed));
  if (seed == null || !Number.isFinite(s)) return null;
  if (s > 9000) return { set: null, glyphs: null };
  const raw = makeSet(ORIGIN_UNI[s % ORIGIN_UNI.length]);
  return { set: s % ORIGIN_UNI.length, glyphs: raw.replace(/\p{M}/gu, '') || raw };
}

// Long blades (up to 133 glyphs) read as their opening and closing runs:
// returns [head, tail], or [text, null] when the whole thing fits.
export function abbreviateGlyphs(text, head = 8, tail = 8) {
  const chars = Array.from(text);
  if (chars.length <= head + tail + 4) return [text, null];
  return [chars.slice(0, head).join(''), chars.slice(-tail).join('')];
}
