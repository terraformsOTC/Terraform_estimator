// The collecting sets, as written for a reader.
//
// The backend's SETS rubric (backend/src/pricingModel.js) is the machine-readable
// version — which biomes/zones/levels a set requires, and what detectSets checks a
// wallet against. This is the prose that goes with it. `name` is the join key
// across all three consumers (glossary, /sets, the wallet view), so it has to match
// the backend's SETS keys exactly.
//
// Colour follows how hard the set is to finish: green easy, blue medium, purple
// hard, yellow near-impossible.
export const SETS_GLOSSARY = [
  { name: 'Chess biomes',  color: '#34d399', description: 'One parcel from biomes 85, 39, 26, 27, and 38. These biomes all have various chess piece unicode characters in their animations.' },
  { name: 'Binary biomes', color: '#34d399', description: 'One parcel from biomes 54, 58, and 89. These biomes all have binary 0/1 characters in their animations.' },
  { name: 'Meadow biomes', color: '#34d399', description: 'One parcel from biomes 42, 65, and 60. These biomes all have the appearance of wind flowing over grass in their animations.' },
  { name: 'Blocky biomes', color: '#60a5fa', description: 'One parcel from the first 16 biomes, including biome 0. These parcels are all made up of various "blocky" unicode characters that create very distinctive and recognisable animations.' },
  { name: '[DUOTONE]',     color: '#60a5fa', description: 'One parcel from every duotone zone. These zones are all easily identified by their square bracket naming convention (e.g. [BLOOD], [MOON], [SOON]) and are distinct for their two-colour animations.' },
  { name: 'Polychrome set', color: '#c084fc', description: 'One parcel from every multicoloured zone. These are easily identified by their standard case names without brackets.' },
  { name: 'Full level',    color: '#c084fc', description: 'One parcel at each of the 20 levels of the Hypercastle (L1–L20). Parcels on the top and the bottom of the Hypercastle are the most difficult to acquire.' },
  { name: 'Grails',        color: '#c084fc', description: 'One parcel from each of special parcel types: X-Seed, Y-Seed, Plague, Lith0, and Spine, plus a biome 0 parcel and an Origin Daydream or Origin Terraform.' },
  { name: 'Full zone',     color: '#ffe401', description: 'One parcel from every zone in the collection.' },
  { name: 'Full biome',    color: '#ffe401', description: 'One parcel from every biome. The hardest set of all to acquire.' },
];

export const setStyle = (name) => SETS_GLOSSARY.find(s => s.name === name) || null;

// The wallet view colours completed sets from the same list, so a new set never
// renders unstyled there because a second hardcoded map was missed.
export const SET_COLORS = Object.fromEntries(SETS_GLOSSARY.map(s => [s.name, s.color]));
