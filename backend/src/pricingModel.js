// Terraforms Pricing Model v2
// Formula (standard parcels):
//   Estimated Value = Floor × ((zone_m + biome_m) / 2) × level_m × chroma_m × mode_m
//
// Special parcels (Godmode, Plague, X-Seed, Y-Seed, Lith0):
//   Estimated Value = Floor × special_multiple  (all other traits ignored)
// Spine and 1of1 use the standard formula with a multiplier premium appended.

const FLOOR_PRICE_ETH = 0.2; // Update as market moves

// ─── ZONE MULTIPLES ────────────────────────────────────────────────────────────
const ZONE_MULTIPLES = {
  // Grail (6x)
  "Shahra": 6, "Antenna": 6, "Aetherking": 6,
  // Grail (4x)
  "Gemina": 4, "[SOON]": 4, "Dread": 4, "[SUN]": 4,
  // Rare (2.2x)
  "Royal": 2.2, "Killscreen": 2.2, "Mould": 2.2,
  // Rare (2x)
  "Tetsu": 2, "Aria": 2, "First Earth": 2, "Uwo": 2,
  "[NOV]": 2, "Avidana": 2, "Mori": 2,
  "Radiant": 2, "Venmon": 2, "Promiselands": 2, "Xleph": 2,
  "Greysunn": 2, "Treasure": 2, "[HOME]": 2,
  // Premium (1.6x)
  "Dhampir": 1.6, "Rocket": 1.6, "Mt Zuka": 1.6, "Angel": 1.6, "Valeria": 1.6, "Jadeite": 1.6,
  // Premium (1.5x)
  "Intro Forest": 1.5, "Dynacrypts": 1.5,
  "Cradle": 1.5, "Bubble": 1.5, "Kippsun": 1.5, "Everglades": 1.5,
  "Muxtai X1": 1.5, "pfpfpfpbbx80": 1.5, "Toad": 1.5,
  // Uncommon (1.25x)
  "[BOSS]": 1.25, "Pepo": 1.25, "Wastelands": 1.25, "[BLOOD]": 1.25,
  "Blushing": 1.25, "Ender": 1.25, "Akileaf": 1.25,
  // Uncommon (1.1x)
  "[NEON]": 1.1, "Calyx": 1.1, "Zerinia": 1.1, "Palace": 1.1,
  "[CUR2]": 1.1, "[HYCA]": 1.1, "[YUNA]": 1.1, "[MENU]": 1.1,
  "[DARK]": 1.1, "Alto": 1.1, "Warp": 1.1,
  "Blossom": 1.1, "Linosim": 1.1,
  // Floor (1x)
  "[WEN]": 1, "[MOON]": 1, "[SEP]": 1, "Shiro": 1, "Mirage": 1, "Grove": 1,
  "Hyphae": 1, "Mecha": 1, "Riso": 1, "Exduo": 1, "Arc": 1,
  "Kairo": 1, "Nightrose": 1, "Hypermage": 1, "Holo": 1,
  "Ouallada": 1,
};

// ─── BIOME MULTIPLES ───────────────────────────────────────────────────────────
const BIOME_MULTIPLES = {
  // Grail (4x)
  0: 4, 10: 4, 11: 4, 17: 4, 73: 4, 74: 4, 76: 4, 77: 4, 78: 4, 79: 4, 81: 4,
  // Rare (2x)
  12: 2, 13: 2, 14: 2, 15: 2, 16: 2, 18: 2, 19: 2, 20: 2,
  39: 2, 75: 2, 80: 2, 87: 2, 88: 2,
  // Rare (1.6x — category override, see BIOME_CATEGORY_OVERRIDES)
  82: 1.6,
  // Premium (1.5x)
  1: 1.5, 2: 1.5, 4: 1.5, 8: 1.5, 40: 1.5, 42: 1.5,
  84: 1.5, 85: 1.5, 89: 1.5, 90: 1.5, 91: 1.5,
  // Uncommon (1.1x)
  3: 1.1, 5: 1.1, 6: 1.1, 7: 1.1, 9: 1.1,
  21: 1.1, 22: 1.1, 23: 1.1, 24: 1.1, 25: 1.1,
  26: 1.1, 28: 1.1, 29: 1.1, 30: 1.1,
  34: 1.1, 35: 1.1, 36: 1.1, 37: 1.1, 38: 1.1,
  41: 1.1,
  58: 1.1, 65: 1.1, 66: 1.1, 67: 1.1, 69: 1.1,
  83: 1.1, 86: 1.1,
  // Floor (1x)
  27: 1, 31: 1, 32: 1, 33: 1,
  43: 1, 44: 1, 45: 1, 46: 1, 47: 1, 48: 1, 49: 1, 50: 1,
  51: 1, 52: 1, 53: 1, 54: 1, 55: 1, 56: 1, 57: 1,
  59: 1, 60: 1, 61: 1, 62: 1, 63: 1, 64: 1, 68: 1,
  70: 1, 71: 1, 72: 1,
};

// ─── BIOME CATEGORY OVERRIDES ──────────────────────────────────────────────────
// Biomes whose display category differs from what getCategoryFromMultiple() returns.
const BIOME_CATEGORY_OVERRIDES = {
  82: "Rare", // Rare-tier badge despite 1.6x pricing
};

// ─── LEVEL MULTIPLES ───────────────────────────────────────────────────────────
const LEVEL_MULTIPLES = {
  1: 5,   // Kairo basement — extremely rare
  2: 2,   // Kairo basement
  3: 2,   // Kairo basement
  4: 1,
  5: 1,
  6: 1,
  7: 1,
  8: 1,
  9: 1,
  10: 1,
  11: 1,
  12: 1,
  13: 1,
  14: 1,
  15: 1,
  16: 1,
  17: 1,
  18: 2,  // Alto penthouse
  19: 2,  // Alto penthouse
  20: 5,  // Alto penthouse — extremely rare
};

// ─── CHROMA MULTIPLES ──────────────────────────────────────────────────────────
const CHROMA_MULTIPLES = {
  "Flow": 1,
  "Pulse": 1.05,
  "Hyper": 1.05,
  // Plague is handled as a special parcel — not applied here
};

// ─── MODE MULTIPLES ────────────────────────────────────────────────────────────
const MODE_MULTIPLES = {
  "Origin Daydream": 4,
  "Origin Terraform": 4,
  "Terrain": 1,
  "Daydream": 0.95,
  "Terraform": 0.95,
};

// ─── SPECIAL PARCEL OVERRIDES ──────────────────────────────────────────────────
// Bypass standard formula entirely — Floor × special_multiple
// Spine and 1of1 are NOT here — they use the standard zone/biome formula + a premium below.
const SPECIAL_TYPES = {
  "Plague":  65,
  "X-Seed":  12.5,
  "Y-Seed":  14,
  "Lith0":   15,
};
const GODMODE_MULTIPLE = 45;

// ─── TRAIT PREMIUMS ────────────────────────────────────────────────────────────
// Applied on top of the standard zone/biome formula (multiplied in at the end).
const TRAIT_PREMIUMS = {
  "Spine":  1.20,  // +20%
  "1of1":   1.05,  // +5%
  // Biome 0 is already priced at 4x (Grail) in BIOME_MULTIPLES — no extra premium needed.
};

// ─── SETS ──────────────────────────────────────────────────────────────────────
const SETS = {
  "Chess biome set": {
    description: "Biomes 85, 39, 26, 27, 38",
    requiredBiomes: [85, 39, 26, 27, 38],
    attainability: "Easy",
    bottleneck: "biome 58",
  },
  "Binary biome set": {
    description: "Biomes 54, 58, 89",
    requiredBiomes: [54, 58, 89],
    attainability: "Easy",
    bottleneck: "biome 89",
  },
  "Blocky biome set": {
    description: "Biomes 0–16",
    requiredBiomes: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    attainability: "Medium",
    bottleneck: "biome 10",
  },
  "[DUOTONE] set": {
    description: "All Duotone zones (designated by [...] naming)",
    requiredZones: ["[SOON]","[SUN]","[NOV]","[HOME]","[NEON]","[BOSS]","[CUR2]","[HYCA]","[YUNA]","[MENU]","[DARK]","[SEP]","[BLOOD]","[WEN]","[MOON]"],
    attainability: "Medium",
    bottleneck: "[SOON] zone",
  },
  "Polychrome set": {
    description: "All polychrome zones (not duotone)",
    requiredZones: [
      "Shahra","Antenna","Gemina","Aetherking","Dread",
      "Tetsu","Killscreen","Aria","First Earth","Uwo","Mould","Avidana","Rocket",
      "Mori","Radiant","Dhampir","Venmon","Promiselands","Xleph","Jadeite",
      "Greysunn","Royal","Angel","Treasure",
      "Intro Forest","Mt Zuka","Dynacrypts","Valeria","Cradle","Bubble","Kippsun",
      "Everglades","Muxtai X1","pfpfpfpbbx80","Toad",
      "Calyx","Zerinia","Palace","Ender","Alto","Warp","Blushing","Blossom",
      "Pepo","Akileaf","Wastelands","Shiro","Mirage","Grove","Hyphae","Mecha",
      "Riso","Exduo","Arc","Kairo","Nightrose","Hypermage","Holo","Linosim","Ouallada",
    ],
    attainability: "Very difficult",
    bottleneck: "Shahra zone",
  },
  "Full level set": {
    description: "Levels 1–20 of the Hypercastle",
    requiredLevels: Array.from({ length: 20 }, (_, i) => i + 1),
    attainability: "Very difficult",
    bottleneck: "levels 1 & 20",
  },
  "Grail set": {
    description: "One each: X-Seed, Y-Seed, Plague, Lith0, Spine + biome 0 + Origin daydream/terraform",
    requiredSpecialTypes: ["X-Seed", "Y-Seed", "Plague", "Lith0", "Spine"],
    requiredBiomes: [0],
    requiredModes: ["Origin Daydream", "Origin Terraform"],
    attainability: "Very difficult",
    bottleneck: "Plague chroma",
  },
  "Full zone set": {
    description: "One parcel from each zone (75 zones)",
    allZones: true,
    attainability: "Very difficult",
    bottleneck: "Shahra zone",
  },
  "Full biome set": {
    description: "One parcel from each biome (92 biomes)",
    allBiomes: true,
    attainability: "Very difficult",
    bottleneck: "biome 74",
  },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function getCategoryFromMultiple(multiple) {
  if (multiple >= 4) return "Mythical";
  if (multiple >= 2) return "Rare";
  if (multiple >= 1.5) return "Premium";
  if (multiple >= 1.1) return "Uncommon";
  return "Floor";
}

function getZoneMultiple(zoneName) {
  return ZONE_MULTIPLES[zoneName] ?? 1;
}

function getBiomeMultiple(biomeNumber) {
  return BIOME_MULTIPLES[parseInt(biomeNumber, 10)] ?? 1;
}

function getLevelMultiple(level) {
  return LEVEL_MULTIPLES[parseInt(level, 10)] ?? 1;
}

function getChromaMultiple(chroma) {
  return CHROMA_MULTIPLES[chroma] ?? 1;
}

function getModeMultiple(mode) {
  return MODE_MULTIPLES[mode] ?? 1;
}

// ─── MAIN ESTIMATE FUNCTION ────────────────────────────────────────────────────
function estimatePrice(traits, floorOverride) {
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode } = traits;
  const floor = floorOverride ?? FLOOR_PRICE_ETH;

  // Godmode override: X-Seed + Origin Daydream (3 tokens) — priced above X-Seed
  if (isGodmode) {
    return {
      estimatedValue: Math.round(floor * GODMODE_MULTIPLE * 1000) / 1000,
      floor,
      isSpecial: true,
      specialType,
      specialMultiple: GODMODE_MULTIPLE,
      formula: `${floor} ETH × ${GODMODE_MULTIPLE}x (Godmode)`,
    };
  }

  // Special parcel: bypass standard formula entirely
  // (Spine and 1of1 are NOT in SPECIAL_TYPES — they use the formula below)
  if (specialType && SPECIAL_TYPES[specialType] != null) {
    const specialMultiple = SPECIAL_TYPES[specialType];
    return {
      estimatedValue: Math.round(floor * specialMultiple * 1000) / 1000,
      floor,
      isSpecial: true,
      specialType,
      specialMultiple,
      formula: `${floor} ETH × ${specialMultiple}x (${specialType})`,
    };
  }

  const zoneMultiple = getZoneMultiple(zone);
  const biomeMultiple = getBiomeMultiple(biome);
  const levelMultiple = getLevelMultiple(level);
  const chromaMultiple = getChromaMultiple(chroma);
  const modeMultiple = getModeMultiple(mode);

  const zonebiomeAvg = (zoneMultiple + biomeMultiple) / 2;

  // Trait premiums — applied on top of the standard formula
  const spineMultiple  = specialType === 'Spine'                ? TRAIT_PREMIUMS['Spine'] : 1;
  const oneOf1Multiple = (specialType === '1of1' || isOneOfOne) ? TRAIT_PREMIUMS['1of1']  : 1;

  const totalMultiple = zonebiomeAvg * levelMultiple * chromaMultiple * modeMultiple * spineMultiple * oneOf1Multiple;
  const estimatedValue = floor * totalMultiple;

  let formula = `${floor} × ((${zoneMultiple} + ${biomeMultiple}) / 2) × ${levelMultiple}(lvl) × ${chromaMultiple}(chroma) × ${modeMultiple}(mode)`;
  if (spineMultiple  !== 1) formula += ` × ${spineMultiple}(spine)`;
  if (oneOf1Multiple !== 1) formula += ` × ${oneOf1Multiple}(1of1)`;

  return {
    estimatedValue: Math.round(estimatedValue * 1000) / 1000,
    floor,
    isSpecial: false,
    zoneMultiple,
    biomeMultiple,
    zonebiomeAvg: Math.round(zonebiomeAvg * 100) / 100,
    levelMultiple,
    chromaMultiple,
    modeMultiple,
    spineMultiple,
    oneOf1Multiple,
    totalMultiple: Math.round(totalMultiple * 100) / 100,
    zoneCategory: getCategoryFromMultiple(zoneMultiple),
    biomeCategory: BIOME_CATEGORY_OVERRIDES[parseInt(biome, 10)] ?? getCategoryFromMultiple(biomeMultiple),
    formula,
  };
}

// ─── SET DETECTION ─────────────────────────────────────────────────────────────
function detectSets(parcels) {
  const ownedBiomes = new Set(parcels.map(p => parseInt(p.biome, 10)).filter(b => !isNaN(b)));
  const ownedZones = new Set(parcels.map(p => p.zone).filter(Boolean));
  const ownedLevels = new Set(parcels.map(p => parseInt(p.level, 10)).filter(l => !isNaN(l)));
  const ownedSpecialTypes = new Set(parcels.map(p => p.specialType).filter(Boolean));
  const ownedModes = new Set(parcels.map(p => p.mode).filter(Boolean));

  const ALL_ZONES = Object.keys(ZONE_MULTIPLES);
  const ALL_BIOMES = Object.keys(BIOME_MULTIPLES).map(Number);

  const qualified = [];

  for (const [setName, setDef] of Object.entries(SETS)) {
    let qualifies = false;

    if (setDef.requiredSpecialTypes) {
      // Check specials + origin mode + optional biomes (e.g. Grail set requires biome 0)
      const hasSpecials = setDef.requiredSpecialTypes.every(t => ownedSpecialTypes.has(t));
      const hasOrigin = setDef.requiredModes.some(m => ownedModes.has(m));
      const hasBiomes = !setDef.requiredBiomes || setDef.requiredBiomes.every(b => ownedBiomes.has(b));
      qualifies = hasSpecials && hasOrigin && hasBiomes;
    } else if (setDef.requiredBiomes) {
      qualifies = setDef.requiredBiomes.every(b => ownedBiomes.has(b));
    } else if (setDef.requiredZones) {
      qualifies = setDef.requiredZones.every(z => ownedZones.has(z));
    } else if (setDef.requiredLevels) {
      qualifies = setDef.requiredLevels.every(l => ownedLevels.has(l));
    } else if (setDef.allZones) {
      qualifies = ALL_ZONES.every(z => ownedZones.has(z));
    } else if (setDef.allBiomes) {
      qualifies = ALL_BIOMES.every(b => ownedBiomes.has(b));
    }

    if (qualifies) {
      qualified.push({
        name: setName,
        description: setDef.description,
        attainability: setDef.attainability,
        bottleneck: setDef.bottleneck,
      });
    }
  }

  return qualified;
}

module.exports = {
  estimatePrice,
  detectSets,
  FLOOR_PRICE_ETH,
};
