// Full trait domains for the Terraforms collection — the complete set of values
// a parcel can hold, so filter panels can show unowned options greyed out
// rather than omitting them.
//
// Derived from backend/src/minted-traits.json (all 9911 minted parcels); the
// 1193 unminted parcels contribute no additional zones. Biome (0–91), level
// (1–20), mode and chroma are fixed by the contract, so only ALL_ZONES is
// snapshot-derived — and zone is assigned at mint and never changes, so it
// does not go stale the way chroma/mode/level do.

export const ALL_ZONES = [
  "[BLOOD]",
  "[BOSS]",
  "[CUR2]",
  "[DARK]",
  "[HOME]",
  "[HYCA]",
  "[MENU]",
  "[MOON]",
  "[NEON]",
  "[NOV]",
  "[SEP]",
  "[SOON]",
  "[SUN]",
  "[WEN]",
  "[YUNA]",
  "Aetherking",
  "Akileaf",
  "Alto",
  "Angel",
  "Antenna",
  "Arc",
  "Aria",
  "Avidana",
  "Blossom",
  "Blushing",
  "Bubble",
  "Calyx",
  "Cradle",
  "Dhampir",
  "Dread",
  "Dynacrypts",
  "Ender",
  "Everglades",
  "Exduo",
  "First Earth",
  "Gemina",
  "Greysunn",
  "Grove",
  "Holo",
  "Hypermage",
  "Hyphae",
  "Intro Forest",
  "Jadeite",
  "Kairo",
  "Killscreen",
  "Kippsun",
  "Linosim",
  "Mecha",
  "Mirage",
  "Mori",
  "Mould",
  "Mt Zuka",
  "Muxtai X1",
  "Nightrose",
  "Ouallada",
  "Palace",
  "Pepo",
  "pfpfpfpbbx80",
  "Promiselands",
  "Radiant",
  "Riso",
  "Rocket",
  "Royal",
  "Shahra",
  "Shiro",
  "Tetsu",
  "Toad",
  "Treasure",
  "Uwo",
  "Valeria",
  "Venmon",
  "Warp",
  "Wastelands",
  "Xleph",
  "Zerinia",
];

export const ALL_MODES = ['Daydream', 'Origin Daydream', 'Origin Terraform', 'Terraform', 'Terrain'];

export const ALL_CHROMAS = ['Flow', 'Hyper', 'Plague', 'Pulse'];

export const ALL_BIOMES = Array.from({ length: 92 }, (_, i) => i);        // 0–91

export const ALL_LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);    // 1–20
