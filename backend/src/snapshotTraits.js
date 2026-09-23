// Parcel traits that come from lookups rather than from the chain: the curated
// special-token lists, the 1of1 set and the S0 antenna window, layered onto the
// pre-baked minted-traits.json snapshot.
//
// One module because four callers need the same answer: the API, the floor
// calibration, the model verifier and predict.js. The offline scripts each used
// to carry their own partial copy, and calibrate-floor.js priced every sale with
// specialType null and isOneOfOne/isS0 false. A Spine or an X-Seed was scored as
// a plain parcel, so its premium leaked into the calibration constant.

const SPECIAL_TOKEN_LOOKUP = require('./special-tokens.json');

// Includes both pure 1of1s AND Spine/Lith0/X-Seed/Y-Seed tokens that are also 1of1.
// Used to set isOneOfOne independently of specialType. Built from a full on-chain
// tokenURI scan (Mar 2026) — Alchemy returns empty attributes for Terraforms and
// cannot be used. To re-verify: verify_1of1.js in git history, commit 8848717.
const ONE_OF_ONE_IDS = new Set(require('./one-of-one-ids.json'));

// X-Seed + Origin Daydream, the rarest combination (3 tokens). They stay
// specialType='X-Seed' in the lookup and are priced as Godmode.
const GODMODE_IDS = new Set([83, 124, 1955]);

// Terrain / Biome 71 parcels with a low ??? value that print a clean "gm" in the
// heightmap. Source: community-verified list provided Mar 2026.
const GM_IDS = new Set([1369, 1800, 4632, 6997, 7297]);

// Biome 0 parcels whose opening frame is a flat single block of colour,
// visually indistinguishable from genuine Lith0. Source: community-verified, Mar 2026.
const LITH0LIKE_IDS = new Set([3124, 3218, 6005, 6512, 9427]);

// ??? thresholds from a full scan of the 9911 minted tokens (Mar 2026): 8864 carry
// the trait; min 815, p5 19918, p50 41052, p95 52953, max 53994. The cut points are
// set by eye from the animations — where the flood level reads as distinctly low
// (< 20000, 449 tokens) or high (> 50000, 1574 tokens). Mesa uses its own < 30000
// for the same reason.
const MYSTERY_P5 = 20000;
const MYSTERY_P95 = 50000;

function mysteryOutlierFlag(value) {
  if (value == null) return null;
  if (value > MYSTERY_P95) return 'high';
  if (value < MYSTERY_P5) return 'low';
  return null;
}

// S0 (Season 0): antenna first turned on inside the V2 launch window AND still on.
// antennaFirstTs comes from getFirstAntennaModification on the Antenna contract.
const S0_ANTENNA_TS_MIN = 1703376000; // 2023-12-24 00:00:00 UTC
const S0_ANTENNA_TS_MAX = 1705190399; // 2024-01-13 23:59:59 UTC

function computeIsS0(antennaOn, antennaFirstTs) {
  if (!antennaOn || !antennaFirstTs) return false;
  return antennaFirstTs >= S0_ANTENNA_TS_MIN && antennaFirstTs <= S0_ANTENNA_TS_MAX;
}

/**
 * Full trait object for a minted-traits.json record, in the shape getParcelTraits
 * returns (minus seed/x/y, which only the parcel page shows).
 */
function snapshotTraits(rec) {
  const id = Number(rec.tokenId);
  const specialType = SPECIAL_TOKEN_LOOKUP[id] || (rec.chroma === 'Plague' ? 'Plague' : null);
  return {
    tokenId: id,
    zone: rec.zone,
    level: rec.level,
    biome: rec.biome,
    chroma: rec.chroma,
    mode: rec.mode,
    specialType,
    isOneOfOne: ONE_OF_ONE_IDS.has(id),
    isGodmode: GODMODE_IDS.has(id),
    isS0: computeIsS0(rec.antennaOn, rec.antennaFirstTs),
    isLith0like: LITH0LIKE_IDS.has(id),
    isGm: GM_IDS.has(id),
    mysteryValue: rec.mysteryValue,
    mysteryOutlier: mysteryOutlierFlag(rec.mysteryValue),
    seed: null,
    x: null,
    y: null,
  };
}

module.exports = {
  SPECIAL_TOKEN_LOOKUP,
  ONE_OF_ONE_IDS,
  GODMODE_IDS,
  GM_IDS,
  LITH0LIKE_IDS,
  MYSTERY_P5,
  MYSTERY_P95,
  mysteryOutlierFlag,
  computeIsS0,
  snapshotTraits,
};
