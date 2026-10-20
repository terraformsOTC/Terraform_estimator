// collectionHelper.js — "what am I missing, and what's for sale that fills it?"
//
// A rubric is a list of goal groups: the estimator's sets, every chroma, every
// mode, the special traits, or custom ones a collector builds. A group is a list
// of targets, and a target is met when any parcel in the collector's wallet
// group matches it. For every target this reports what they hold, how many
// exist, what is listed now (never their own listings) and the cheapest; then a
// shopping list — the cheapest current listings that fill the most unmet
// targets, within a budget.
//
// Pure: callers pass parcels (with traits) and listings in. Set groups follow
// detectSets in pricingModel.js exactly, so a set this calls complete is one the
// wallet page shows as completed.

const { SETS, ZONE_MULTIPLES, BIOME_MULTIPLES } = require('./pricingModel');
const { TRAIT_TYPES, matchesTrait } = require('./traitTypes');

const CHROMAS = ['Flow', 'Pulse', 'Hyper', 'Plague'];
const MODES = ['Terrain', 'Daydream', 'Terraform', 'Origin Daydream', 'Origin Terraform'];
const ALL_ZONES = Object.keys(ZONE_MULTIPLES);
const ALL_BIOMES = Object.keys(BIOME_MULTIPLES).map(Number).sort((a, b) => a - b);
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
// The /traits catalogue minus its two mode entries (the mode preset has those),
// plus Synchro, a special type with no /traits page (2 parcels). `group` is the
// catalogue's (special / visual / level), for the page's trait picker.
const SPECIAL_TRAITS = [
  ...TRAIT_TYPES.filter(t => t.group !== 'mode').map(t => ({ id: t.type, label: t.label, group: t.group })),
  { id: 'synchro', label: 'Synchro', group: 'special' },
];
const SPECIAL_LABEL = Object.fromEntries(SPECIAL_TRAITS.map(s => [s.id, s.label]));

const MAX_CUSTOM_SPECS = 12;
const OWNED_SHOWN = 12;     // owned token ids listed per target; the count is always exact
const LISTINGS_SHOWN = 3;   // cheapest listings listed per unmet target

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function hasTrait(t, id) {
  return id === 'synchro' ? t.specialType === 'Synchro' : matchesTrait(t, id);
}

// Blades and origin glyph sets, picked as the v2 renderer picks them (the
// glyphs themselves live in frontend/src/lib/parcelGlyphs.js, which this
// mirrors). A non-origin parcel with seed <= 9950 has blade (biome + seed) %
// 27, latent on a Terrain parcel and drawn once it is dreamed. An origin with
// seed <= 9000 animates glyph set seed % 28 in its place; above 9000 it is an
// X-seed, animating all 28 at once, so it counts as none of them.
const BLADE_COUNT = 27;
const GLYPH_SET_COUNT = 28;
const BLADES = Array.from({ length: BLADE_COUNT }, (_, i) => i);
const GLYPH_SETS = Array.from({ length: GLYPH_SET_COUNT }, (_, i) => i);
const isOrigin = t => t.mode === 'Origin Daydream' || t.mode === 'Origin Terraform';

function bladeOf(t) {
  if (!Number.isInteger(t.seed) || isOrigin(t) || t.seed > 9950) return null;
  return (t.biome + t.seed) % BLADE_COUNT;
}

function glyphSetOf(t) {
  if (!Number.isInteger(t.seed) || !isOrigin(t) || t.seed > 9000) return null;
  return t.seed % GLYPH_SET_COUNT;
}

// ─── TARGETS ─────────────────────────────────────────────────────────────────
const target = {
  zone: z => ({ id: `zone:${z}`, label: z, kind: 'zone', match: t => t.zone === z }),
  biome: b => ({ id: `biome:${b}`, label: `Biome ${b}`, kind: 'biome', match: t => t.biome === b }),
  level: l => ({ id: `level:${l}`, label: `Level ${l}`, kind: 'level', match: t => t.level === l }),
  chroma: c => ({ id: `chroma:${c}`, label: c, kind: 'chroma', match: t => t.chroma === c }),
  mode: m => ({ id: `mode:${m}`, label: m, kind: 'mode', match: t => t.mode === m }),
  specialType: s => ({ id: `special:${s}`, label: s, kind: 'special', match: t => t.specialType === s }),
  anyMode: ms => ({ id: `mode:${ms.join('|')}`, label: ms.join(' or '), kind: 'mode', match: t => ms.includes(t.mode) }),
  trait: id => ({ id: `trait:${id}`, label: SPECIAL_LABEL[id], kind: 'trait', match: t => hasTrait(t, id) }),
  blade: i => ({ id: `blade:${i}`, label: `Blade ${i + 1}`, kind: 'blade', match: t => bladeOf(t) === i }),
  glyph: i => ({ id: `glyph:${i}`, label: `Glyph set ${i}`, kind: 'glyph', match: t => glyphSetOf(t) === i }),
};

function setGroup(name, def) {
  let targets = [];
  if (def.requiredSpecialTypes) {
    targets = [
      ...def.requiredSpecialTypes.map(target.specialType),
      target.anyMode(def.requiredModes),
      ...(def.requiredBiomes || []).map(target.biome),
    ];
  } else if (def.requiredBiomes) {
    targets = def.requiredBiomes.map(target.biome);
  } else if (def.requiredZones) {
    targets = def.requiredZones.map(target.zone);
  } else if (def.requiredLevels) {
    targets = def.requiredLevels.map(target.level);
  } else if (def.allZones) {
    targets = ALL_ZONES.map(target.zone);
  } else if (def.allBiomes) {
    targets = ALL_BIOMES.map(target.biome);
  }
  return {
    id: `set:${slug(name)}`, label: name, category: 'sets',
    description: def.description, attainability: def.attainability, bottleneck: def.bottleneck,
    targets,
  };
}

const PRESETS = [
  ...Object.entries(SETS).map(([name, def]) => ({ id: `set:${slug(name)}`, build: () => setGroup(name, def) })),
  { id: 'chroma', build: () => ({ id: 'chroma', label: 'Every chroma', category: 'traits', description: 'One parcel in each chroma', targets: CHROMAS.map(target.chroma) }) },
  { id: 'mode', build: () => ({ id: 'mode', label: 'Every mode', category: 'traits', description: 'One parcel in each mode', targets: MODES.map(target.mode) }) },
  { id: 'specials', build: () => ({ id: 'specials', label: 'Special traits', category: 'traits', description: 'One parcel with each special, visual and level trait', targets: SPECIAL_TRAITS.map(s => target.trait(s.id)) }) },
  { id: 'blades', build: () => ({ id: 'blades', label: 'Blades', category: 'traits', description: 'One parcel with each blade (any non-origin parcel; latent on Terrain until dreamed)', targets: BLADES.map(target.blade) }) },
  { id: 'glyphs', build: () => ({ id: 'glyphs', label: 'Origin glyph sets', category: 'traits', description: 'One origin parcel animating each glyph set', targets: GLYPH_SETS.map(target.glyph) }) },
];
const PRESET_BY_ID = new Map(PRESETS.map(p => [p.id, p]));

// Goals picked one value at a time, written `<kind>:<value>`. Each kind's
// picks form one group (`group`), so a collector who picks ten zones gets one
// "Zones" group, not ten. `all` is the preset holding every value: listing it
// as well makes the group whole rather than adding a second one.
const inList = (values, parse) => v => {
  const value = String(v).trim() === '' ? null : parse(v); // Number('') is 0, biome 0
  return values.includes(value) ? value : null;
};
const PICKS = {
  zone: { group: 'zones', label: 'Zones', noun: 'zone', description: 'One parcel in each chosen zone', parse: inList(ALL_ZONES, String), target: target.zone },
  biome: { group: 'biomes', label: 'Biomes', noun: 'biome', description: 'One parcel in each chosen biome', parse: inList(ALL_BIOMES, Number), target: target.biome },
  level: { group: 'levels', label: 'Levels', noun: 'level', description: 'One parcel at each chosen level', parse: inList(LEVELS, Number), target: target.level },
  trait: { group: 'specials', all: 'specials', label: 'Special traits', noun: 'special trait', description: 'One parcel with each chosen special trait', parse: v => (SPECIAL_LABEL[v] ? v : null), target: target.trait },
  blade: { group: 'blades', all: 'blades', label: 'Blades', noun: 'blade', description: 'One parcel with each chosen blade', parse: inList(BLADES, Number), target: target.blade },
  glyph: { group: 'glyphs', all: 'glyphs', label: 'Origin glyph sets', noun: 'glyph set', description: 'One origin parcel animating each chosen glyph set', parse: inList(GLYPH_SETS, Number), target: target.glyph },
};

// ─── CUSTOM GOALS ────────────────────────────────────────────────────────────
// A custom spec is { each?: field, where?: { field: value, ... } }:
//   { where: { zone: 'Alto', chroma: 'Hyper' } }  → one target, an Alto Hyper parcel
//   { each: 'biome', where: { chroma: 'Pulse' } } → one target per biome, in Pulse
const FIELDS = {
  zone: { values: ALL_ZONES, parse: v => String(v), get: t => t.zone, label: v => v },
  biome: { values: ALL_BIOMES, parse: v => Number(v), get: t => t.biome, label: v => `Biome ${v}` },
  level: { values: LEVELS, parse: v => Number(v), get: t => t.level, label: v => `Level ${v}` },
  chroma: { values: CHROMAS, parse: v => String(v), get: t => t.chroma, label: v => v },
  mode: { values: MODES, parse: v => String(v), get: t => t.mode, label: v => v },
  trait: { values: SPECIAL_TRAITS.map(s => s.id), parse: v => String(v), get: null, label: v => SPECIAL_LABEL[v] },
};

function fieldMatch(field, value) {
  return field === 'trait' ? (t => hasTrait(t, value)) : (t => FIELDS[field].get(t) === value);
}

class RubricError extends Error {}

function parseWhere(where) {
  if (where == null) return [];
  if (typeof where !== 'object' || Array.isArray(where)) throw new RubricError('where must be an object');
  const entries = Object.entries(where);
  if (entries.length > 4) throw new RubricError('at most 4 conditions per goal');
  return entries.map(([field, raw]) => {
    const f = FIELDS[field];
    if (!f) throw new RubricError(`unknown field "${String(field).slice(0, 20)}"`);
    const value = f.parse(raw);
    if (!f.values.includes(value)) throw new RubricError(`unknown ${field} "${String(raw).slice(0, 40)}"`);
    return [field, value];
  });
}

function customGroup(spec) {
  if (!spec || typeof spec !== 'object') throw new RubricError('each custom goal must be an object');
  const where = parseWhere(spec.where);
  const each = spec.each == null ? null : String(spec.each);
  if (each != null && !FIELDS[each]) throw new RubricError(`unknown field "${each.slice(0, 20)}"`);
  if (each == null && where.length === 0) throw new RubricError('a custom goal needs "each" or "where"');
  if (each != null && where.some(([f]) => f === each)) throw new RubricError(`"${each}" cannot be both "each" and a condition`);
  const whereFns = where.map(([f, v]) => fieldMatch(f, v));
  const whereOk = t => whereFns.every(fn => fn(t));
  const whereLabel = where.map(([f, v]) => FIELDS[f].label(v)).join(' · ');
  const whereKey = where.map(([f, v]) => `${f}=${v}`).join('&');
  if (each == null) {
    const id = `custom:${whereKey}`;
    return { id, label: whereLabel, category: 'custom', description: 'Custom goal', targets: [{ id, label: whereLabel, kind: 'custom', match: whereOk }] };
  }
  const f = FIELDS[each];
  const id = `custom:each-${each}${whereKey ? `:${whereKey}` : ''}`;
  return {
    id,
    label: `Every ${each}${whereLabel ? ` · ${whereLabel}` : ''}`,
    category: 'custom',
    description: 'Custom goal',
    // prune: a combination no parcel has (a biome that never occurs in Plague) is
    // dropped from the goal rather than shown as unreachable. Only custom "each"
    // goals do this; preset goals keep every target, exactly as detectSets does.
    targets: f.values.map(v => {
      const each_ = fieldMatch(each, v);
      return { id: `${id}:${v}`, label: f.label(v), kind: each, prune: true, match: t => each_(t) && whereOk(t) };
    }),
  };
}

/**
 * Preset ids + custom specs → groups. Throws RubricError on anything malformed.
 *
 * `specials` is every special trait; `trait:<id>` picks them one at a time, and
 * the picks share one "Special traits" group (id `specials` either way), so a
 * collector who wants three of them doesn't get three one-line groups. Blades
 * (`blades`, `blade:<n>`) and origin glyph sets (`glyphs`, `glyph:<n>`) work
 * the same way; zones, biomes and levels are picks only (`zone:<name>`, …),
 * the whole of each being a set already.
 */
function buildRubric({ presets = [], custom = [] } = {}) {
  if (!Array.isArray(presets) || !Array.isArray(custom)) throw new RubricError('malformed rubric');
  if (custom.length > MAX_CUSTOM_SPECS) throw new RubricError(`at most ${MAX_CUSTOM_SPECS} custom goals`);
  const groups = [];
  const seen = new Set();
  const picked = new Map(); // pick kind -> its group, while built from single picks
  for (const id of presets) {
    const sid = String(id);
    const colon = sid.indexOf(':');
    const kind = colon > 0 ? sid.slice(0, colon) : null;
    const pick = kind ? PICKS[kind] : null;
    if (pick) {
      const value = pick.parse(sid.slice(colon + 1));
      if (value == null) throw new RubricError(`unknown ${pick.noun} "${sid.slice(colon + 1, colon + 41)}"`);
      if (seen.has(pick.group) && !picked.has(kind)) continue; // every one is already in
      let g = picked.get(kind);
      if (!g) {
        g = { id: pick.group, label: pick.label, category: pick.all ? 'traits' : 'picks', description: pick.description, targets: [] };
        picked.set(kind, g);
        seen.add(pick.group);
        groups.push(g);
      }
      const t = pick.target(value);
      if (!g.targets.some(x => x.id === t.id)) g.targets.push(t);
      continue;
    }
    const p = PRESET_BY_ID.get(sid);
    if (!p) throw new RubricError(`unknown goal "${sid.slice(0, 40)}"`);
    const allOf = Object.keys(PICKS).find(k => PICKS[k].all === p.id);
    if (allOf && picked.has(allOf)) {
      Object.assign(picked.get(allOf), p.build()); // all of them after all
      picked.delete(allOf);
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    groups.push(p.build());
  }
  for (const spec of custom) {
    const g = customGroup(spec);
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    groups.push(g);
  }
  return groups;
}

// The fields of a combination row, in order (see combinations).
const COMBO_FIELDS = ['zone', 'biome', 'level', 'chroma', 'mode', 'trait'];

/**
 * Which custom-goal values occur together on real parcels, so the page offers
 * only conditions some parcel meets (no Shahra once Plague is picked). One row
 * per distinct combination: each field as the index of its value in
 * catalog().fields, and `trait` as a bit mask over fields.trait, since a
 * parcel can carry several.
 */
function combinations(items) {
  const single = COMBO_FIELDS.filter(f => f !== 'trait');
  const index = Object.fromEntries(single.map(f => [f, new Map(FIELDS[f].values.map((v, i) => [v, i]))]));
  const seen = new Set();
  const rows = [];
  for (const { traits: t } of items) {
    if (!t) continue;
    const row = single.map(f => index[f].get(FIELDS[f].get(t)));
    if (row.some(i => i == null)) continue;
    let mask = 0;
    SPECIAL_TRAITS.forEach((s, i) => { if (hasTrait(t, s.id)) mask |= 1 << i; });
    row.push(mask);
    const key = row.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

/**
 * How many minted parcels have each zone, biome, level, blade and glyph set,
 * split by mode (counts in MODES order), so the page can show what exists in
 * the modes a collector keeps to.
 */
function supplyByMode(items) {
  const zeros = () => MODES.map(() => 0);
  const out = {
    modes: MODES,
    zone: Object.fromEntries(ALL_ZONES.map(z => [z, zeros()])),
    biome: Object.fromEntries(ALL_BIOMES.map(b => [b, zeros()])),
    level: Object.fromEntries(LEVELS.map(l => [l, zeros()])),
    blade: BLADES.map(zeros),
    glyph: GLYPH_SETS.map(zeros),
  };
  for (const { traits: t } of items) {
    const m = t ? MODES.indexOf(t.mode) : -1;
    if (m < 0) continue;
    if (out.zone[t.zone]) out.zone[t.zone][m]++;
    if (out.biome[t.biome]) out.biome[t.biome][m]++;
    if (out.level[t.level]) out.level[t.level][m]++;
    const b = bladeOf(t);
    if (b != null) out.blade[b][m]++;
    const g = glyphSetOf(t);
    if (g != null) out.glyph[g][m]++;
  }
  return out;
}

/**
 * What the page needs to offer: the presets, every value a custom goal can use
 * and, given every minted parcel ([{ tokenId, traits }]), which of those values
 * occur together and how many parcels have each, by mode.
 */
function catalog(items = null) {
  return {
    presets: PRESETS.map(p => {
      const g = p.build();
      return { id: g.id, label: g.label, category: g.category, description: g.description, attainability: g.attainability || null, targets: g.targets.length };
    }),
    fields: {
      zone: ALL_ZONES, biome: ALL_BIOMES, level: LEVELS, chroma: CHROMAS, mode: MODES,
      trait: SPECIAL_TRAITS,
    },
    ...(items ? { combos: { fields: COMBO_FIELDS, rows: combinations(items) }, supply: supplyByMode(items) } : {}),
    limits: { customGoals: MAX_CUSTOM_SPECS },
  };
}

// ─── EVALUATION ──────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {Array} p.groups      from buildRubric
 * @param {Array} p.owned       [{ tokenId, traits }] — the wallet group's parcels
 * @param {Array} p.universe    [{ tokenId, traits }] — every minted parcel (for supply)
 * @param {Array} p.listings    [{ tokenId, traits, price, model, discount, seller }]
 * @param {Set}   p.ownWallets  lowercased addresses in the group (their listings are skipped)
 * @param {Array} [p.held]      [{ tokenId, traits }] — parcels other collectors hold, listed or
 *                              not, for their wallet page; returned as `held` with what each fills
 * @param {Array} [p.modes]     a mode scope ("Terrain only"): only parcels in these modes count
 * @param {Map}   [p.supplyCache] target id -> supply, reused while the universe (and the
 *                              mode scope) is unchanged
 * @param {object} [p.options]  { budget, maxPrice, maxPremium } — see shoppingList — and
 *                              wishlistPremium, the same test for the wishlist's listings
 */
function evaluate({ groups, owned, universe, listings, ownWallets, held = [], modes = null, supplyCache = new Map(), options = {} }) {
  // A mode scope narrows every parcel the goals look at: the collector's, the
  // market's, other collectors' and the supply. A target no parcel in those
  // modes can meet is left out, as custom combinations that don't exist are.
  const scoped = Array.isArray(modes) && modes.length > 0;
  if (scoped) {
    const inScope = p => !!p.traits && modes.includes(p.traits.mode);
    owned = owned.filter(inScope);
    universe = universe.filter(inScope);
    listings = listings.filter(inScope);
    held = held.filter(inScope);
  }
  const ownedIds = new Set(owned.map(o => o.tokenId));
  const market = listings
    .filter(l => l.traits && !ownedIds.has(l.tokenId) && !ownWallets.has(String(l.seller || '').toLowerCase()))
    .sort((a, b) => a.price - b.price || a.tokenId - b.tokenId);

  const byId = new Map(); // target id -> evaluated target (shared across groups)
  const evalTarget = (t) => {
    if (byId.has(t.id)) return byId.get(t.id);
    let supply = supplyCache.get(t.id);
    if (supply == null) {
      supply = 0;
      for (const u of universe) if (t.match(u.traits)) supply++;
      supplyCache.set(t.id, supply);
    }
    const mine = owned.filter(o => t.match(o.traits)).map(o => o.tokenId);
    const listed = market.filter(l => t.match(l.traits));
    const e = {
      id: t.id, label: t.label, kind: t.kind, match: t.match,
      met: mine.length > 0,
      exists: supply > 0 || (!t.prune && !scoped),
      supply,
      ownedCount: mine.length,
      owned: mine.slice(0, OWNED_SHOWN),
      listed: listed.length,
      cheapest: mine.length ? null : listed.slice(0, LISTINGS_SHOWN).map(l => ({
        tokenId: l.tokenId, price: l.price, model: l.model, discount: l.discount,
      })),
    };
    byId.set(t.id, e);
    return e;
  };

  const outGroups = groups.map(g => {
    const targets = g.targets.map(evalTarget);
    const real = targets.filter(t => t.exists);
    return {
      id: g.id, label: g.label, category: g.category, description: g.description,
      attainability: g.attainability || null, bottleneck: g.bottleneck || null,
      met: real.filter(t => t.met).length,
      total: real.length,
      // Custom combinations no parcel has, and under a mode scope any target
      // no parcel in those modes meets, are left out of the count (see prune).
      nonexistent: targets.length - real.length,
      targets: real.map(stripMatch),
    };
  });

  const unmet = [...byId.values()].filter(t => t.exists && !t.met);
  const plan = shoppingList(unmet, market, options);
  const label = new Map([...byId.values()].map(t => [t.id, t.label]));
  plan.picks.forEach(p => { p.fillsLabels = p.fills.map(id => label.get(id)); });

  // The groups each target sits in, so a listing can say what it fills in
  // context: "Biome 12" alone could be Full biome's or "Every biome · Pulse"'s.
  const groupsOf = new Map();
  for (const g of groups) {
    for (const t of g.targets) {
      const names = groupsOf.get(t.id) || [];
      if (!names.includes(g.label)) names.push(g.label);
      groupsOf.set(t.id, names);
    }
  }
  const fillsOf = traits => unmet.filter(t => t.match(traits))
    .map(t => ({ id: t.id, label: t.label, groups: groupsOf.get(t.id) || [] }));
  // Every listing that fills at least one unmet goal, at a price the collector
  // accepts (any, unless they set one against the model) — the listings page
  // marks these for a collector who saved the goals as a wishlist.
  const wishlist = [];
  for (const l of market) {
    if (!withinPremium(l, options.wishlistPremium ?? null)) continue;
    const fills = fillsOf(l.traits);
    if (fills.length) wishlist.push({ tokenId: l.tokenId, price: l.price, fills });
  }
  // The same test over another collector's parcels, listed or not — their
  // wallet page marks the ones worth asking them about.
  const heldFills = [];
  for (const h of held) {
    if (!h.traits || ownedIds.has(h.tokenId)) continue;
    const fills = fillsOf(h.traits);
    if (fills.length) heldFills.push({ tokenId: h.tokenId, fills });
  }

  const allReal = [...byId.values()].filter(t => t.exists);
  return {
    summary: {
      targets: allReal.length,
      met: allReal.filter(t => t.met).length,
      listedNow: unmet.filter(t => t.listed > 0).length,
    },
    groups: outGroups,
    shoppingList: plan,
    wishlist,
    wishlistCount: wishlist.length,
    held: heldFills,
  };
}

// Whether a listing's price is within `maxPremium` of the model's ask-side
// value: 0.1 = up to 10% over, 0 = at or below model, -0.1 = at least 10%
// under; null = any price. A listing the model can't price passes only then.
function withinPremium(l, maxPremium) {
  return maxPremium == null || (l.model != null && l.price <= l.model * (1 + maxPremium) + 1e-9);
}

function stripMatch({ match, exists, prune, ...rest }) {
  return rest;
}

/**
 * Greedy weighted set cover: repeatedly buy the listing with the lowest price
 * per newly filled target, skipping any that would break the budget, until no
 * listing fills anything new. One parcel often fills several goals at once (a
 * zone, a biome and a level), which is where this beats cheapest-per-goal.
 */
function shoppingList(unmet, market, { budget = null, maxPrice = null, maxPremium = null } = {}) {
  const candidates = market
    .filter(l => (maxPrice == null || l.price <= maxPrice) && withinPremium(l, maxPremium))
    .map(l => ({ l, covers: unmet.filter(t => t.match(l.traits)).map(t => t.id) }))
    .filter(c => c.covers.length > 0);

  const remaining = new Set(unmet.map(t => t.id));
  const picks = [];
  let spent = 0;
  for (;;) {
    let best = null, bestScore = Infinity, bestNew = 0;
    for (const c of candidates) {
      if (c.used) continue;
      if (budget != null && spent + c.l.price > budget + 1e-9) continue;
      const fresh = c.covers.filter(id => remaining.has(id)).length;
      if (!fresh) continue;
      const score = c.l.price / fresh;
      const better = score < bestScore - 1e-12
        || (Math.abs(score - bestScore) <= 1e-12 && (fresh > bestNew || (fresh === bestNew && c.l.tokenId < best.l.tokenId)));
      if (better) { best = c; bestScore = score; bestNew = fresh; }
    }
    if (!best) break;
    best.used = true;
    const fills = best.covers.filter(id => remaining.has(id));
    fills.forEach(id => remaining.delete(id));
    spent += best.l.price;
    picks.push({
      tokenId: best.l.tokenId, price: best.l.price, model: best.l.model, discount: best.l.discount,
      fills,
    });
  }

  // Why each unfilled goal stayed unfilled: nothing listed fits the filters, or
  // something does but the budget ran out first.
  const coverable = new Set(candidates.flatMap(c => c.covers));
  const left = [...remaining];
  return {
    picks,
    total: Math.round(spent * 1e6) / 1e6,
    filled: unmet.length - left.length,
    unfilled: left.length,
    unfilledNoListing: left.filter(id => !coverable.has(id)).length,
    unfilledOverBudget: left.filter(id => coverable.has(id)).length,
  };
}

module.exports = { buildRubric, evaluate, shoppingList, catalog, combinations, supplyByMode, bladeOf, glyphSetOf, RubricError, CHROMAS, MODES, PRESETS };
