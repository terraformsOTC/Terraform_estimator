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

// The renderer's `uni` table: 28 runs of 10 glyphs. Some parcels animate
// these in place of the blade — see customGlyphs.
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

// The v2 renderer animates the blade only on non-origin parcels with seed
// <= 9950; above that, and on every origin parcel, it swaps in a uni set
// instead (customGlyphs). The blade is drawn only in Daydream and Terraform
// modes, so on a Terrain parcel this is latent: what dreaming it would show.
export function latentBlade(mode, biome, seed) {
  if (isOriginMode(mode) || Number(seed) > 9950) return null;
  return bladeFor(biome, seed);
}

// makeSet() as the renderer has it: String.fromCharCode keeps only the low 16
// bits, so table entries above 0xFFFF paint a wrapped code point, exactly as on
// chain.
function makeSet(start) {
  let out = '';
  for (let i = 0; i < 10; i++) out += String.fromCharCode(start + i);
  return out;
}

// The uni glyphs a parcel animates in place of its blade, mirroring the v2
// renderer's seedSet branch:
//   origin, seed <= 9000      one run, UNI[seed % 28]
//   origin, seed  > 9000      all 28 runs
//   non-origin, 9951-9970     UNI[seed % 3], reversed (the renderer's Y-seed)
//   non-origin, seed  > 9970  all 28 runs (X-seed)
//   anything else             null: the parcel shows its blade
// Returns { kind, set, glyphs }: kind is 'origin' (one seed-picked run),
// 'y-seed' (one of 3 runs, reversed) or 'x-seed' (all 28 runs; the renderer
// flags both high-seed branches isXSeed); `set` is the run's 0-27 index, null
// for an X-seed. Combining marks are dropped: they are zero-width, collapse onto their
// neighbours in a string, and paint as blank cells in the animation anyway
// (set 13 is all marks, so it keeps the raw run rather than vanish).
export function customGlyphs(mode, seed) {
  const s = Math.floor(Number(seed));
  if (seed == null || !Number.isFinite(s)) return null;
  const run = (kind, set, reversed = false) => {
    let raw = makeSet(ORIGIN_UNI[set]);
    if (reversed) raw = Array.from(raw).reverse().join('');
    return { kind, set, glyphs: raw.replace(/\p{M}/gu, '') || raw };
  };
  const xSeed = { kind: 'x-seed', set: null, glyphs: null };
  if (isOriginMode(mode)) return s > 9000 ? xSeed : run('origin', s % ORIGIN_UNI.length);
  if (s > 9970) return xSeed;
  if (s > 9950) return run('y-seed', s % 3, true);
  return null;
}

// Long blades (up to 133 glyphs) read as their opening and closing runs:
// returns [head, tail], or [text, null] when the whole thing fits.
export function abbreviateGlyphs(text, head = 8, tail = 8) {
  const chars = Array.from(text);
  if (chars.length <= head + tail + 4) return [text, null];
  return [chars.slice(0, head).join(''), chars.slice(-tail).join('')];
}
