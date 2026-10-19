// traitTypes.js — the named special/visual/level traits browsable on /traits,
// and the one rule deciding whether a parcel has each. Shared by the /traits
// index and the collection helper so the two can never disagree.

const TRAIT_TYPES = [
  { type: 'godmode',          label: 'Godmode',          group: 'special' },
  { type: 'origin-daydream',  label: 'Origin Daydream',  group: 'mode' },
  { type: 'origin-terraform', label: 'Origin Terraform', group: 'mode' },
  { type: 'plague',           label: 'Plague',           group: 'special' },
  { type: 'x-seed',           label: 'X-Seed',           group: 'special' },
  { type: 'y-seed',           label: 'Y-Seed',           group: 'special' },
  { type: 'lith0',            label: 'Lith0',            group: 'special' },
  { type: 'spine',            label: 'Spine',            group: 'special' },
  { type: '1of1',             label: '1 of 1',           group: 'special' },
  { type: 's0',               label: 'S0',               group: 'special' },
  { type: 'biome0',           label: 'Biome 0',          group: 'visual' },
  { type: 'lith0like',        label: 'Lith0-like',       group: 'visual' },
  { type: 'mesa',             label: 'Mesa',             group: 'visual' },
  { type: 'matrix',           label: 'Matrix',           group: 'visual' },
  { type: 'heartbeat',        label: 'Heartbeat',        group: 'visual' },
  { type: 'gm',               label: 'gm',               group: 'visual' },
  { type: 'basement',         label: 'Basement',         group: 'level' },
  { type: 'penthouse',        label: 'Penthouse',        group: 'level' },
];

// Mirrors AutoBadgeStack / hasBadges logic in frontend/src/components/shared.js.
// Keep in sync — drift between the two is what causes badge-vs-search disagreements.
function matchesTrait(traits, type) {
  const { zone, biome, level, chroma, mode, specialType, isOneOfOne, isGodmode, isS0, isLith0like, isGm, mysteryValue } = traits;
  const isTerrain = mode === 'Terrain';
  switch (type) {
    case 'godmode':          return !!isGodmode;
    case 'origin-daydream':  return mode === 'Origin Daydream';
    case 'origin-terraform': return mode === 'Origin Terraform';
    case 'plague':           return specialType === 'Plague';
    case 'x-seed':           return specialType === 'X-Seed';
    case 'y-seed':           return specialType === 'Y-Seed';
    case 'lith0':            return specialType === 'Lith0';
    case 'spine':            return specialType === 'Spine';
    case '1of1':             return !!isOneOfOne;
    case 's0':               return !!isS0;
    case 'biome0':           return biome === 0 && specialType !== 'Lith0';
    case 'lith0like':        return !!isLith0like;
    case 'mesa':             return isTerrain && biome === 39 && mysteryValue != null && mysteryValue < 30000;
    case 'matrix':           return isTerrain && biome === 58 && zone === 'Intro Forest';
    case 'heartbeat':        return isTerrain && zone === '[BLOOD]' && chroma === 'Pulse';
    case 'gm':               return !!isGm;
    case 'basement':         return level === 1;
    case 'penthouse':        return level === 20;
    default: return false;
  }
}

module.exports = { TRAIT_TYPES, matchesTrait };
