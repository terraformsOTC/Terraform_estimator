// calibrate-floor.js — set the constant that converts the live listing floor into
// the level the fitted multiples are expressed in.
//
// WHAT THE CONSTANT IS FOR
// The hedonic fit targets ln(price / floor_at_sale), where floor_at_sale is the
// endogenous index from floor_index_daily — a 12th percentile of transacted prices
// over a trailing fortnight. Production does not have that index; it has the live
// Alchemy listing floor. So prediction is
//     estimate = live_floor x floor_calibration x fitted_multiple
// and this script sets floor_calibration.
//
// HOW IT IS MEASURED, AND WHY IT CHANGED
// It used to be measured as a ratio of two proxies: index / live_floor. That is
// unstable in exactly the situation it matters, because the two move on different
// clocks. The index is a trailing fortnight of settlements; the live floor is a
// point sample of the cheapest ask. When the floor jumps, the ratio collapses even
// though nothing about the relationship has changed — it is measuring the lag, not
// the level.
//
// Both ways of reducing that ratio failed, in opposite directions:
//   - A median over all history (the original) ignored a real regime change. On
//     2026-09-23 it read 0.8689 when the market had moved, and every estimate ran
//     ~15% high for three weeks.
//   - The most recent overlapping day (the replacement, same day) read 0.7699,
//     because the listing floor had risen 20% in five days while the trailing index
//     had not caught up. That baked a transient into a constant and every estimate
//     ran ~10% LOW. Measured over the following sales: 1.13x on 14 days, 1.11x on
//     30 — parcels selling well above what the model said they were worth.
//
// So it is no longer measured from proxies at all. It is solved directly against
// outcomes: find the c that puts the median completed sale exactly on its estimate.
//
//     c = median( sale_price / (live_floor_at_sale x fitted_multiple) )
//
// That is calibrating against the thing the model exists to predict, rather than
// against a ratio of two things that correlate with it. It absorbs index lag, the
// percentile choice and any drift in the fitted baseline in one number, and a
// median over ~130 settled sales does not move because one input had a fast week.
//
// Usage (from "sales database"):
//   node calibrate-floor.js            # report only
//   node calibrate-floor.js --write    # also patch the coefficients JSON
//   CALIB_WINDOW_D=45 node calibrate-floor.js
//
// Run it AFTER fit_hedonic.py: it reads the fitted multiples it is correcting.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const HISTORY_PATH = path.join(__dirname, '..', 'backend', 'src', 'floor-history.json');
const DB_PATH = path.join(__dirname, process.env.DB_PATH || 'terraforms_sales.db');
// Both copies are patched when present: this project's artifact and the committed
// copy the backend actually loads at runtime.
const COEFFS_PATHS = [
  path.join(__dirname, 'pricing-v2-coeffs.json'),
  path.join(__dirname, '..', 'backend', 'src', 'pricing-v2-coeffs.json'),
];

// 30 days. Long enough that the median is not hostage to a quiet week, short
// enough to follow a real move — the implied value is flat across 7-30 days
// (0.878/0.870/0.864/0.853) and only diverges past 45, where it starts averaging
// in the previous regime.
const WINDOW_D = Number(process.env.CALIB_WINDOW_D || 30);
// Below this the median is too thin to ship unattended.
const MIN_SALES = Number(process.env.CALIB_MIN_SALES || 40);
// Sanity band. Outside this, something upstream is broken rather than the market
// having moved.
const MIN_C = 0.45;
const MAX_C = 1.30;
// Ship a real regime shift, refuse a broken input.
const MAX_MOVE = Number(process.env.CALIB_MAX_MOVE || 0.5);
// Floor samples are irregular; a sale priced against a floor reading from days
// earlier is measuring the gap, which is the mistake this file is about.
//
// 72h is a compromise with the history we have, not the ideal. Sampling was tied
// to git pushes until 2026-09-23, so it has multi-day holes — at 36h only 33 of
// the last 30 days' sales qualify, below the minimum. The answer barely moves
// across the range, which is the reassuring part: 0.8816 at 72h, 0.8704 at 168h,
// 0.8861 at 36h over a longer window. Tighten this once the hourly sampler has
// filled in a few weeks.
const MAX_FLOOR_AGE_H = Number(process.env.CALIB_MAX_FLOOR_AGE_H || 72);

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function loadFloorHistory() {
  const h = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  if (!Array.isArray(h) || !h.length) throw new Error('floor-history.json is empty');
  return h.sort((a, b) => a.ts - b.ts);
}

/** Nearest-prior live floor, plus how stale that reading was at the time. */
function floorAt(history, ts) {
  let hit = null;
  for (const s of history) {
    if (s.ts <= ts) hit = s;
    else break;
  }
  if (!hit) return null;
  return { floor: hit.floor, ageH: (ts - hit.ts) / 3600 };
}

function main() {
  // Take the constant from the model itself rather than re-reading the JSON.
  // They are normally the same number, but fit_hedonic.py rewrites the
  // coefficients file WITHOUT floor_calibration, so mid-refit the file and the
  // loaded model can disagree — and this script divides the constant back out,
  // so a mismatch would silently scale every implied value.
  const { estimateHedonic, FLOOR_CALIBRATION: prev } =
    require(path.join(__dirname, '..', 'backend', 'src', 'hedonicModel.js'));
  if (!(prev > 0)) {
    console.error('  hedonicModel has no usable floor_calibration — run fit_hedonic.py first.');
    process.exit(1);
  }

  // Dividing the current constant back out leaves an effective floor of exactly
  // 1.0, so what the model returns IS the fitted multiple.
  const snapshot = require(path.join(__dirname, '..', 'backend', 'src', 'minted-traits.json'));
  const byId = {};
  for (const k of Object.keys(snapshot)) byId[snapshot[k].tokenId] = snapshot[k];

  const history = loadFloorHistory();
  const db = new Database(DB_PATH, { readonly: true });
  const since = Math.floor(Date.now() / 1000) - WINDOW_D * 86400;
  // is_bundle = 0: a bundle leg's price is an even split of the bundle total, not
  // an observed price for that parcel.
  const sales = db.prepare(
    'SELECT token_id, price_native, payment_symbol, event_unix FROM sales '
    + 'WHERE is_wash = 0 AND is_bundle = 0 AND event_unix > ? ORDER BY event_unix'
  ).all(since);
  db.close();

  const implied = [];
  const skipped = { noTraits: 0, tier2: 0, noFloor: 0, staleFloor: 0 };
  for (const s of sales) {
    const m = byId[s.token_id];
    if (!m) { skipped.noTraits++; continue; }
    const traits = {
      tokenId: m.tokenId, zone: m.zone, level: m.level, biome: m.biome,
      chroma: m.chroma, mode: m.mode, specialType: null, isOneOfOne: false,
      isGodmode: false, isS0: false, isLith0like: false, isGm: false,
      mysteryValue: m.mysteryValue,
    };
    const r = estimateHedonic(traits, 1 / prev);
    if (r.tier !== 'tier1') { skipped.tier2++; continue; }
    // ETH is a taken listing (ask); WETH and Blur Pool are accepted offers (bid).
    // Same rule as views.sql and the sales feed.
    const mult = (s.payment_symbol === 'ETH') ? r.on : r.off;
    if (!(mult > 0)) continue;

    const f = floorAt(history, s.event_unix);
    if (!f) { skipped.noFloor++; continue; }
    if (f.ageH > MAX_FLOOR_AGE_H) { skipped.staleFloor++; continue; }

    implied.push(s.price_native / (f.floor * mult));
  }

  console.log(`\nFloor calibration — solved against ${WINDOW_D} days of settled sales\n`);
  console.log(`  sales in window     : ${sales.length}`);
  console.log(`  usable              : ${implied.length}`);
  console.log(`  skipped             : ${skipped.tier2} tier-2, ${skipped.staleFloor} stale floor, `
    + `${skipped.noFloor} no floor, ${skipped.noTraits} no traits`);

  if (implied.length < MIN_SALES) {
    console.error(`\n  REFUSING: ${implied.length} usable sales, need >= ${MIN_SALES}. `
      + `Run catchup, and check floor-history.json is being sampled — a gap there `
      + `disqualifies every sale inside it.`);
    process.exit(1);
  }

  const c = median(implied);
  const sorted = [...implied].sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  console.log(`\n  floor_calibration = ${c.toFixed(4)}`);
  console.log(`  spread              : p25 ${q(0.25).toFixed(3)}  p75 ${q(0.75).toFixed(3)}`);
  console.log(`  live floor runs ${((1 / c - 1) * 100).toFixed(1)}% above the level the multiples are in`);
  console.log(`  previous value      : ${prev.toFixed(4)} -> ${c.toFixed(4)} `
    + `(${(((c - prev) / prev) * 100).toFixed(1)}% move)`);

  if (!(c > MIN_C && c < MAX_C)) {
    console.error(`\n  REFUSING: ${c.toFixed(4)} outside the sane band ${MIN_C}-${MAX_C}.`);
    process.exit(1);
  }
  const move = Math.abs(c - prev) / prev;
  if (move > MAX_MOVE && !process.argv.includes('--force')) {
    console.error(`\n  REFUSING: ${(move * 100).toFixed(1)}% move exceeds ${(MAX_MOVE * 100).toFixed(0)}%. `
      + `Check the sales table and floor-history, then re-run with --force if it is real.`);
    process.exit(1);
  }

  if (!process.argv.includes('--write')) {
    console.log(`\n  (pass --write to patch floor_calibration into the coefficients JSON)\n`);
    return;
  }

  const payload = {
    value: Number(c.toFixed(4)),
    measured_at: new Date().toISOString(),
    method: 'median(sale_price / (live_floor_at_sale * fitted_multiple))',
    window_days: WINDOW_D,
    n_sales: implied.length,
    iqr: [Number(q(0.25).toFixed(3)), Number(q(0.75).toFixed(3))],
    note: 'Solved against settled sales, not against the index/live-floor ratio — '
        + 'that ratio measures the lag between a trailing index and a point sample, '
        + 'and swings hardest exactly when the floor moves. Re-measured every 24h by '
        + 'ops/daily-refit.sh, after the fit it corrects.',
  };

  let written = 0;
  for (const p of COEFFS_PATHS) {
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.floor_calibration = payload;
    fs.writeFileSync(p, JSON.stringify(j, null, 2));
    console.log(`  wrote floor_calibration to ${path.relative(process.cwd(), p)}`);
    written++;
  }
  if (!written) {
    console.error('  no coefficients JSON found — run fit_hedonic.py first.');
    process.exit(1);
  }
  console.log('');
}

main();
