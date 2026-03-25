// Terraforms Pricing Model v2
// Formula (standard parcels):
//   Estimated Value = (Floor × ((zone_m + biome_m) / 2)
//                   + (level_m × Floor) × chroma_m × mode_m)
//                   × spine_m × 1of1_m × s0_m × matrix_m × mesa_m × heartbeat_m × lith0like_m × gm_m × origin_mode_m
//
//   level_m is 0 for mid-levels (L4–17), so the level term contributes nothing there.
//   level_m is non-zero only for basement (L1–3) and penthouse (L18–20).
//   All trait premiums apply to the total — none are level-dependent.
//
// Special parcels:
//   Godmode / Plague:  Floor × special_multiple  (all traits ignored)
//   X-Seed / Y-Seed:  Floor × special_multiple × seed_zone_tier_m  (zone tier only, biome ignored)
//   Lith0:            Floor × 18x × [1.1x if 1of1]
// Spine and 1of1 use the standard formula with a multiplier premium appended.

const FLOOR_PRICE_ETH = 0.2; // Update as market moves

// ─── ZONE MULTIPLES ────────────────────────────────────────────────────────────
const ZONE_MULTIPLES = {
  // Mythical (individual)
  "Shahra": 25.2, "Antenna": 18.9, "Aetherking": 7.88,
  // Mythical (5.04x)
  "Gemina": 6.83, "[SOON]": 5.04, "Dread": 5.04, "[SUN]": 5.04,
  // Rare (2.9x)
  "Royal": 2.9, "Killscreen": 2.9, "[NOV]": 2.9, "Avidana": 2.9,
  // Rare (2.75x)
  "Mould": 2.75, "First Earth": 2.75, "Tetsu": 2.75, "Aria": 2.75, "Xleph": 2.75,
  // Rare (2.52x)
  "Uwo": 2.52, "Mori": 2.52,
  "Radiant": 2.52, "Venmon": 2.52, "Promiselands": 2.52,
  "Greysunn": 2.52, "Treasure": 2.52, "[HOME]": 2.52,
  // Premium (1.99x)
  "Dhampir": 1.99, "Rocket": 1.99, "Mt Zuka": 1.99, "Valeria": 1.99, "Jadeite": 1.99,
  // Premium (1.82x)
  "Intro Forest": 1.82, "Dynacrypts": 1.82,
  "Cradle": 1.82, "Bubble": 1.82, "Kippsun": 1.82, "Everglades": 1.82,
  "Muxtai X1": 1.82, "pfpfpfpbbx80": 1.82, "Toad": 1.82, "Angel": 1.82,
  // Uncommon (1.51x)
  "[BOSS]": 1.51, "Pepo": 1.51, "Wastelands": 1.51, "[BLOOD]": 1.51,
  "Blushing": 1.51, "Ender": 1.51, "Akileaf": 1.51,
  // Uncommon (1.33x)
  "[NEON]": 1.33, "Calyx": 1.33, "Zerinia": 1.33, "Palace": 1.33,
  "[CUR2]": 1.33, "[DARK]": 1.33, "Warp": 1.33,
  "Blossom": 1.33, "Linosim": 1.33,
  // Uncommon (1.16x)
  "[HYCA]": 1.16, "[YUNA]": 1.16, "[MENU]": 1.16, "Alto": 1.16, "Kairo": 1.16,
  // Floor (1x)
  "[WEN]": 1, "[MOON]": 1, "[SEP]": 1, "Shiro": 1, "Mirage": 1, "Grove": 1,
  "Hyphae": 1, "Mecha": 1, "Riso": 1, "Exduo": 1, "Arc": 1,
  "Nightrose": 1, "Hypermage": 1, "Holo": 1,
  "Ouallada": 1,
};

// ─── BIOME MULTIPLES ───────────────────────────────────────────────────────────
const BIOME_MULTIPLES = {
  // Mythical (4.8x)
  0: 4.8, 73: 4.8, 74: 4.8, 76: 4.8, 77: 4.8, 78: 4.8, 79: 4.8, 81: 4.8,
  // Mythical badge, lower multiple (3.6x) — see BIOME_CATEGORY_OVERRIDES
  10: 3.6, 11: 3.6, 17: 3.6,
  // Rare (2.4x)
  14: 2.4, 15: 2.4, 16: 2.4, 18: 2.4, 19: 2.4, 20: 2.4,
  39: 2.4, 75: 2.4, 80: 2.4, 87: 2.4, 88: 2.4,
  // Rare (1.84x — category override, see BIOME_CATEGORY_OVERRIDES)
  12: 1.84, 13: 1.84, 82: 1.84,
  // Premium (1.73x)
  1: 1.73, 2: 1.73, 8: 1.73, 40: 1.73, 42: 1.73,
  84: 1.73, 85: 1.73, 91: 1.73,
  // Premium (1.51x)
  89: 1.51, 90: 1.51,
  // Uncommon (1.27x)
  4: 1.27, 9: 1.27,
  21: 1.27, 22: 1.27, 23: 1.27, 25: 1.27,
  26: 1.27,
  41: 1.27,
  58: 1.27, 86: 1.27,
  // Uncommon (1.1x)
  3: 1.1, 5: 1.1, 6: 1.1, 7: 1.1, 24: 1.1, 28: 1.1, 29: 1.1, 30: 1.1,
  34: 1.1, 35: 1.1, 36: 1.1, 37: 1.1, 38: 1.1,
  65: 1.1, 66: 1.1, 67: 1.1, 68: 1.1, 69: 1.1, 83: 1.1,
  // Floor (1x)
  27: 1, 31: 1, 32: 1, 33: 1,
  43: 1, 44: 1, 45: 1, 46: 1, 47: 1, 48: 1, 49: 1, 50: 1,
  51: 1, 52: 1, 53: 1, 54: 1, 55: 1, 56: 1, 57: 1,
  59: 1, 60: 1, 61: 1, 62: 1, 63: 1, 64: 1,
  70: 1, 71: 1, 72: 1,
};

// ─── BIOME CATEGORY OVERRIDES ──────────────────────────────────────────────────
// Biomes whose display category differs from what getCategoryFromMultiple() returns.
const BIOME_CATEGORY_OVERRIDES = {
  10: "Mythical", // Mythical badge despite 3.6x pricing
  11: "Mythical", // Mythical badge despite 3.6x pricing
  17: "Mythical", // Mythical badge despite 3.6x pricing
  12: "Rare",     // Rare badge despite 1.84x pricing
  13: "Rare",     // Rare badge despite 1.84x pricing
  82: "Rare",     // Rare badge despite 1.84x pricing
};

// ─── LEVEL MULTIPLES ───────────────────────────────────────────────────────────
const LEVEL_MULTIPLES = {
  1: 5,   // Basement — extremely rare
  2: 2,   // Basement
  3: 2,   // Basement
  4: 0,   // Mid-level — no level premium
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
  13: 0,
  14: 0,
  15: 0,
  16: 0,
  17: 0,
  18: 2,  // Penthouse
  19: 2,  // Penthouse
  20: 5,  // Penthouse — extremely rare
};

// ─── CHROMA MULTIPLES ──────────────────────────────────────────────────────────
const CHROMA_MULTIPLES = {
  "Flow": 1,
  "Pulse": 1.025,
  "Hyper": 1.025,
  // Plague is handled as a special parcel — not applied here
};

// ─── MODE MULTIPLES ────────────────────────────────────────────────────────────
// Origin Daydream/Terraform use originModeMultiple (applied to total) instead,
// because modeMultiple only multiplies the level term — which is 0 for mid-levels.
const MODE_MULTIPLES = {
  "Origin Daydream": 1,
  "Origin Terraform": 1,
  "Terrain": 1,
  "Daydream": 0.975,
  "Terraform": 0.975,
};

// ─── SPECIAL PARCEL OVERRIDES ──────────────────────────────────────────────────
// Bypass standard formula entirely.
// Spine and 1of1 are NOT here — they use the standard zone/biome formula + a premium below.
const SPECIAL_TYPES = {
  "Plague":  65,
  "X-Seed":  15,
  "Y-Seed":  17.5,
  "Lith0":   18,
};
const GODMODE_MULTIPLE = 45;

// X-Seed / Y-Seed zone tier multipliers (zone only — biome ignored for seeds)
const SEED_ZONE_TIER_MULTIPLES = {
  "Mythical": 2,
  "Rare":     1.5,
  "Premium":  1.25,
  "Uncommon": 1.1,
  "Floor":    1,
};

// ─── TRAIT PREMIUMS ────────────────────────────────────────────────────────────
// Applied on top of the standard zone/biome formula (multiplied in at the end).
const TRAIT_PREMIUMS = {
  "Spine":      1.20,  // +20%
  "Matrix":     1.5,   // +50% — B58 + Intro Forest
  "Mesa":       1.25,  // +25% — B39 + ??? < 30000
  "gm":         1.15,  // +15% — B71 + low ???
  "Heartbeat":  1.35,  // +35% — [BLOOD] zone + Pulse chroma
  "1of1":       1.05,  // +5%
  "S0":         1.05,  // +5% — Season 0 upgrade (V2 + antenna locked during S0)
  // Biome 0 is already priced at 4x (Mythical) in BIOME_MULTIPLES — no extra premium needed.
};

// ─── LITH0-LIKE PREMIUMS (per-token) ─────────────────────────────────────────
// All tokens: 1.5x
const LITH0LIKE_PREMIUMS = {
  3124: 1.5,
  3218: 1.5,
  6005: 1.5,
  6512: 1.5,
  9427: 1.5,
};

// ─── SETS ──────────────────────────────────────────────────────────────────────
const SETS = {
  "Chess biome set": {
    description: "Biomes 85, 39, 26, 27, 38",
    requiredBiomes: [85, 39, 26, 27, 38],
    attainability: "Easy",
    bottleneck: "biome 39",
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
  const { tokenId, zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryOutlier, mysteryValue } = traits;
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
    const baseMultiple = SPECIAL_TYPES[specialType];

    // X-Seed / Y-Seed: apply zone tier multiplier on top of base multiple (biome ignored)
    if (specialType === 'X-Seed' || specialType === 'Y-Seed') {
      const zoneCategory = getCategoryFromMultiple(getZoneMultiple(zone));
      const seedZoneTier = SEED_ZONE_TIER_MULTIPLES[zoneCategory] ?? 1;
      const specialMultiple = Math.round(baseMultiple * seedZoneTier * 1000) / 1000;
      return {
        estimatedValue: Math.round(floor * specialMultiple * 1000) / 1000,
        floor,
        isSpecial: true,
        specialType,
        specialMultiple,
        formula: `${floor} ETH × ${baseMultiple}x (${specialType}) × ${seedZoneTier}x (${zoneCategory} zone: ${zone})`,
      };
    }

    // Lith0: +10% if also 1of1
    if (specialType === 'Lith0') {
      const oneOf1Bonus = isOneOfOne ? 1.1 : 1;
      const specialMultiple = Math.round(baseMultiple * oneOf1Bonus * 1000) / 1000;
      return {
        estimatedValue: Math.round(floor * specialMultiple * 1000) / 1000,
        floor,
        isSpecial: true,
        specialType,
        specialMultiple,
        formula: oneOf1Bonus > 1
          ? `${floor} ETH × ${baseMultiple}x (Lith0) × ${oneOf1Bonus}x (1of1 bonus)`
          : `${floor} ETH × ${baseMultiple}x (Lith0)`,
      };
    }

    // Default: flat special multiple (Plague, etc.)
    return {
      estimatedValue: Math.round(floor * baseMultiple * 1000) / 1000,
      floor,
      isSpecial: true,
      specialType,
      specialMultiple: baseMultiple,
      formula: `${floor} ETH × ${baseMultiple}x (${specialType})`,
    };
  }

  const zoneMultiple = getZoneMultiple(zone);
  const biomeMultiple = getBiomeMultiple(biome);
  const levelMultiple = getLevelMultiple(level);
  // Biome 0 + Flow chroma gets a 1.1x boost (Flow is otherwise 1x)
  const chromaMultiple = (parseInt(biome, 10) === 0 && (chroma === 'Flow' || !chroma))
    ? 1.1
    : getChromaMultiple(chroma);
  const modeMultiple = getModeMultiple(mode);

  const zonebiomeAvg = (zoneMultiple + biomeMultiple) / 2;

  // Trait premiums — applied on top of the level term
  const spineMultiple     = specialType === 'Spine'                        ? TRAIT_PREMIUMS['Spine']     : 1;
  const oneOf1Multiple    = (specialType === '1of1' || isOneOfOne)         ? TRAIT_PREMIUMS['1of1']      : 1;
  const s0Multiple        = isS0                                           ? TRAIT_PREMIUMS['S0']        : 1;
  const isTerrain         = mode === 'Terrain';
  const matrixMultiple    = (isTerrain && parseInt(biome, 10) === 58 && zone === 'Intro Forest') ? TRAIT_PREMIUMS['Matrix']    : 1;
  const mesaMultiple      = (isTerrain && parseInt(biome, 10) === 39 && mysteryValue != null && mysteryValue < 30000) ? TRAIT_PREMIUMS['Mesa']      : 1;
  const heartbeatMultiple = (isTerrain && zone === '[BLOOD]' && chroma === 'Pulse')     ? TRAIT_PREMIUMS['Heartbeat'] : 1;
  const lith0likeMultiple  = isLith0like ? (LITH0LIKE_PREMIUMS[tokenId] ?? 1) : 1;
  const gmMultiple         = isGm ? TRAIT_PREMIUMS['gm'] : 1;
  const originModeMultiple = (mode === 'Origin Daydream' || mode === 'Origin Terraform') ? 4 : 1;

  // Additive formula: base zone/biome value + level premium (0 for mid-levels)
  // Only chroma and mode multiply into the level term — all trait premiums apply to the total
  const premiumMultiple = chromaMultiple * modeMultiple;
  const baseValue       = floor * zonebiomeAvg;
  const levelValue      = levelMultiple * floor * premiumMultiple;
  const estimatedValue  = (baseValue + levelValue) * spineMultiple * oneOf1Multiple * s0Multiple * matrixMultiple * mesaMultiple * heartbeatMultiple * lith0likeMultiple * gmMultiple * originModeMultiple;
  const totalMultiple   = Math.round((estimatedValue / floor) * 100) / 100;

  let formula = `${floor} × ((${zoneMultiple} + ${biomeMultiple}) / 2)`;
  if (levelMultiple > 0) {
    formula += ` + (${levelMultiple} × ${floor})(lvl) × ${chromaMultiple}(chroma) × ${modeMultiple}(mode)`;
  }
  if (spineMultiple     !== 1) formula += ` × ${spineMultiple}(spine)`;
  if (oneOf1Multiple    !== 1) formula += ` × ${oneOf1Multiple}(1of1)`;
  if (s0Multiple        !== 1) formula += ` × ${s0Multiple}(s0)`;
  if (matrixMultiple    !== 1) formula += ` × ${matrixMultiple}(matrix)`;
  if (mesaMultiple      !== 1) formula += ` × ${mesaMultiple}(mesa)`;
  if (heartbeatMultiple !== 1) formula += ` × ${heartbeatMultiple}(heartbeat)`;
  if (lith0likeMultiple !== 1) formula += ` × ${lith0likeMultiple}(lith-0like)`;
  if (gmMultiple         !== 1) formula += ` × ${gmMultiple}(gm)`;
  if (originModeMultiple !== 1) formula += ` × ${originModeMultiple}(${mode.toLowerCase()})`;

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
    s0Multiple,
    matrixMultiple,
    mesaMultiple,
    heartbeatMultiple,
    lith0likeMultiple,
    gmMultiple,
    originModeMultiple,
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
