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
// plus Synchro, a special type with no /traits page (2 parcels).
const SPECIAL_TRAITS = [
  ...TRAIT_TYPES.filter(t => t.group !== 'mode').map(t => ({ id: t.type, label: t.label })),
  { id: 'synchro', label: 'Synchro' },
];
const SPECIAL_LABEL = Object.fromEntries(SPECIAL_TRAITS.map(s => [s.id, s.label]));

const MAX_CUSTOM_SPECS = 12;
const OWNED_SHOWN = 12;     // owned token ids listed per target; the count is always exact
const LISTINGS_SHOWN = 3;   // cheapest listings listed per unmet target

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function hasTrait(t, id) {
  return id === 'synchro' ? t.specialType === 'Synchro' : matchesTrait(t, id);
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
];
const PRESET_BY_ID = new Map(PRESETS.map(p => [p.id, p]));

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

/** Preset ids + custom specs → groups. Throws RubricError on anything malformed. */
function buildRubric({ presets = [], custom = [] } = {}) {
  if (!Array.isArray(presets) || !Array.isArray(custom)) throw new RubricError('malformed rubric');
  if (custom.length > MAX_CUSTOM_SPECS) throw new RubricError(`at most ${MAX_CUSTOM_SPECS} custom goals`);
  const groups = [];
  const seen = new Set();
  for (const id of presets) {
    const p = PRESET_BY_ID.get(String(id));
    if (!p) throw new RubricError(`unknown goal "${String(id).slice(0, 40)}"`);
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

/** What the page needs to offer: the presets and every value a custom goal can use. */
function catalog() {
  return {
    presets: PRESETS.map(p => {
      const g = p.build();
      return { id: g.id, label: g.label, category: g.category, description: g.description, attainability: g.attainability || null, targets: g.targets.length };
    }),
    fields: {
      zone: ALL_ZONES, biome: ALL_BIOMES, level: LEVELS, chroma: CHROMAS, mode: MODES,
      trait: SPECIAL_TRAITS,
    },
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
 * @param {Map}   [p.supplyCache] target id -> supply, reused while the universe is unchanged
 * @param {object} [p.options]  { budget, maxPrice, maxPremium } — see shoppingList
 */
function evaluate({ groups, owned, universe, listings, ownWallets, supplyCache = new Map(), options = {} }) {
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
      exists: supply > 0 || !t.prune,
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
      // Custom combinations no parcel has are left out of the count (see prune).
      nonexistent: targets.length - real.length,
      targets: real.map(stripMatch),
    };
  });

  const unmet = [...byId.values()].filter(t => t.exists && !t.met);
  const plan = shoppingList(unmet, market, options);
  const label = new Map([...byId.values()].map(t => [t.id, t.label]));
  plan.picks.forEach(p => { p.fillsLabels = p.fills.map(id => label.get(id)); });

  const allReal = [...byId.values()].filter(t => t.exists);
  return {
    summary: {
      targets: allReal.length,
      met: allReal.filter(t => t.met).length,
      listedNow: unmet.filter(t => t.listed > 0).length,
    },
    groups: outGroups,
    shoppingList: plan,
  };
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
  // maxPremium: how far over the model's ask-side value a listing may be (0.1 =
  // up to 10% over; 0 = at or below model; negative = at least that far under).
  const withinPremium = l => maxPremium == null || (l.model != null && l.price <= l.model * (1 + maxPremium) + 1e-9);
  const candidates = market
    .filter(l => (maxPrice == null || l.price <= maxPrice) && withinPremium(l))
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

module.exports = { buildRubric, evaluate, shoppingList, catalog, RubricError, CHROMAS, MODES, PRESETS };
