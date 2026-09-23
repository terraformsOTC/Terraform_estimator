#!/usr/bin/env node
// verify-model.js — gate between a fresh fit and production.
//
// An automated refit removes the staleness problem and introduces a new one: a bad
// fit now ships by itself, at 04:00, with nobody looking. This is the check that
// has to pass before daily-refit.sh commits.
//
// It is deliberately a small number of blunt assertions rather than a full
// backtest. The questions are "did something break" and "is this obviously worse
// than what is already live", not "is this the best possible model".
//
//   node ops/verify-model.js            # verify backend/src/pricing-v2-coeffs.json
//   node ops/verify-model.js --verbose  # print the numbers too
//
// Exit 0 = safe to ship. Exit 1 = keep the previous coefficients.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const COEFFS = path.join(REPO, 'backend', 'src', 'pricing-v2-coeffs.json');
const PREV = path.join(REPO, 'sales database', 'pricing-v2-coeffs.prev.json');
const DB_PATH = path.join(REPO, 'sales database', 'terraforms_sales.db');
const VERBOSE = process.argv.includes('--verbose');

// The calibration is measured from one day, so its freshness IS its validity.
// Two days of slack over a 24h cadence.
const MAX_CALIB_AGE_H = 48;
// Backtest window and the band the median sale/model ratio must land in. Wide on
// purpose: a real market move should not block a deploy, a broken fit should.
const BACKTEST_DAYS = 60;
const RATIO_MIN = 0.80;
const RATIO_MAX = 1.20;
// Holdout error may drift up a little run to run; a big jump means the fit broke.
const MAX_ERR_DEGRADE = 0.03;
// A plain reference-trait parcel should price within shouting distance of the
// floor. Coarse on purpose — see the note at the check itself.
const REF_MULT_MAX = 1.45;

const problems = [];
const notes = [];

function check(ok, msg) { (ok ? notes : problems).push(msg); }

const coeffs = JSON.parse(fs.readFileSync(COEFFS, 'utf8'));

// ── 1. the calibration is fresh ──────────────────────────────────────────────
const calib = coeffs.floor_calibration || {};
const ageH = (Date.now() - Date.parse(calib.measured_at)) / 3600000;
check(
  Number.isFinite(ageH) && ageH <= MAX_CALIB_AGE_H,
  `floor_calibration measured ${Number.isFinite(ageH) ? ageH.toFixed(1) : '??'}h ago (max ${MAX_CALIB_AGE_H}h)`
);
check(calib.value > 0.4 && calib.value < 1.2, `floor_calibration = ${calib.value} (expected 0.4–1.2)`);

// ── 2. the fit itself is fresh and not obviously degraded ────────────────────
const fitAgeH = (Date.now() - Date.parse(coeffs.meta?.built)) / 3600000;
check(Number.isFinite(fitAgeH) && fitAgeH <= MAX_CALIB_AGE_H, `fit built ${fitAgeH.toFixed(1)}h ago`);

const err = coeffs.money_sword_on?.holdout_median_pct_err;
check(Number.isFinite(err) && err > 0 && err < 0.30, `holdout median error ${(err * 100).toFixed(1)}%`);
if (fs.existsSync(PREV)) {
  const prevErr = JSON.parse(fs.readFileSync(PREV, 'utf8'))?.money_sword_on?.holdout_median_pct_err;
  if (Number.isFinite(prevErr)) {
    check(err <= prevErr + MAX_ERR_DEGRADE,
      `holdout error ${(err * 100).toFixed(1)}% vs previous ${(prevErr * 100).toFixed(1)}%`);
  }
}

// ── 3. a plain parcel prices near the floor ──────────────────────────────────
// A coarse absurdity bound, not the 2026-09-23 catcher — tested against that
// state, this check passed at 1.27x and the freshness assertions above are what
// failed it. Kept because a fit that prices reference traits at 2x the floor is
// broken in a way no freshness check would notice.
const { estimateHedonic } = require(path.join(REPO, 'backend', 'src', 'hedonicModel.js'));
const ref = {
  tokenId: 0, zone: 'Holo', level: 10, biome: 46, chroma: 'Flow', mode: 'Terrain',
  specialType: null, isOneOfOne: false, isGodmode: false, isS0: false,
  isLith0like: false, isGm: false, mysteryValue: 40000,
};
const FLOOR = 0.25;
const refMult = estimateHedonic(ref, FLOOR).on / FLOOR;
check(refMult <= REF_MULT_MAX, `reference parcel prices at ${refMult.toFixed(3)}x the live floor (max ${REF_MULT_MAX})`);

// ── 4. it tracks what actually sold ──────────────────────────────────────────
let ratioLine = 'backtest skipped (no sales DB on this machine)';
if (fs.existsSync(DB_PATH)) {
  const Database = require(path.join(REPO, 'sales database', 'node_modules', 'better-sqlite3'));
  const snap = require(path.join(REPO, 'backend', 'src', 'minted-traits.json'));
  const hist = require(path.join(REPO, 'backend', 'src', 'floor-history.json'));
  const byId = {};
  for (const k of Object.keys(snap)) byId[snap[k].tokenId] = snap[k];
  const floorAt = (ts) => { let f = hist[0].floor; for (const s of hist) { if (s.ts <= ts) f = s.floor; else break; } return f; };

  const db = new Database(DB_PATH, { readonly: true });
  const since = Math.floor(Date.now() / 1000) - BACKTEST_DAYS * 86400;
  const sales = db.prepare(
    'SELECT token_id, price_native, payment_symbol, event_unix FROM sales '
    + 'WHERE is_wash = 0 AND is_bundle = 0 AND event_unix > ?'
  ).all(since);
  db.close();

  const ratios = [];
  for (const s of sales) {
    const m = byId[s.token_id];
    if (!m) continue;
    const t = {
      tokenId: m.tokenId, zone: m.zone, level: m.level, biome: m.biome,
      chroma: m.chroma, mode: m.mode, specialType: null, isOneOfOne: false,
      isGodmode: false, isS0: false, isLith0like: false, isGm: false,
      mysteryValue: m.mysteryValue,
    };
    const r = estimateHedonic(t, floorAt(s.event_unix));
    if (r.tier !== 'tier1') continue;
    // ETH = taken listing (ask side); WETH/BETH = accepted offer (bid side).
    const model = s.payment_symbol === 'ETH' ? r.on : r.off;
    if (model > 0) ratios.push(s.price_native / model);
  }

  if (ratios.length < 30) {
    notes.push(`backtest inconclusive (${ratios.length} sales in ${BACKTEST_DAYS}d) — not blocking`);
  } else {
    ratios.sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)];
    const under = ratios.filter((r) => r < 1).length / ratios.length;
    ratioLine = `median sale/model ${med.toFixed(3)} over ${ratios.length} sales, ${(under * 100).toFixed(0)}% under`;
    check(med >= RATIO_MIN && med <= RATIO_MAX,
      `${ratioLine} (band ${RATIO_MIN}–${RATIO_MAX})`);
  }
}

const label = problems.length ? 'FAIL' : 'PASS';
console.log(`[verify] ${label}`);
if (VERBOSE || problems.length) {
  for (const n of notes) console.log(`  ok   ${n}`);
  for (const p of problems) console.log(`  FAIL ${p}`);
  if (ratioLine && VERBOSE) console.log(`  --   ${ratioLine}`);
}
process.exit(problems.length ? 1 : 0);
