// calibrate-floor.js — measure the gap between the endogenous floor index the
// hedonic model trains on and the live listing floor the API prices against.
//
// WHY THIS EXISTS
// The model's target is ln(price / floor_at_sale), where floor_at_sale comes from
// `floor_index_daily` — a low percentile of *transacted* prices in a trailing
// window. That is a deliberately conservative deflator, and it sits consistently
// BELOW the live listing floor Alchemy reports (people list above the last clean
// trade). Offline that offset is harmless: it is absorbed into the fitted baseline
// and cancels, because training and evaluation both use the index.
//
// In production it does NOT cancel. The API prices against the LIVE floor, so
//     estimate = live_floor x fitted_multiple
// inflates every non-special parcel by the full size of the gap. This script
// measures the gap so prediction can divide it back out:
//     estimate = live_floor x floor_calibration x fitted_multiple
//
// Sources are the two the repo already maintains:
//   - floor_index_daily   (sales database/terraforms_sales.db, build_floor_index.js)
//   - floor-history.json  (backend/src, appended by .githooks/pre-push)
// Only days present in BOTH can be compared, so coverage grows as the pre-push
// hook keeps sampling. Re-run it periodically; the constant is stored in JSON
// rather than hardcoded precisely because it is expected to move.
//
// Lives here rather than backend/scripts because it needs better-sqlite3 (a native
// module the deployed backend does not carry) and because it patches the
// coefficients JSON, which is this project's artifact.
//
// Usage (from "sales database"):
//   node calibrate-floor.js            # report only
//   node calibrate-floor.js --write    # also patch the coeffs JSON

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

// Below this many overlapping days the median is too fragile to ship.
const MIN_DAYS = 5;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Live floor per UTC day. Several samples can land on one day; keep the last. */
function liveFloorByDay() {
  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  const byDay = new Map();
  for (const s of [...history].sort((a, b) => a.ts - b.ts)) {
    byDay.set(new Date(s.ts * 1000).toISOString().slice(0, 10), s.floor);
  }
  return byDay;
}

function indexFloorByDay() {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare('SELECT day, floor_eth FROM floor_index_daily').all();
  db.close();
  return new Map(rows.map((r) => [r.day, r.floor_eth]));
}

function main() {
  const live = liveFloorByDay();
  const index = indexFloorByDay();

  const days = [...index.keys()].filter((d) => live.has(d)).sort();
  if (days.length < MIN_DAYS) {
    console.error(`Only ${days.length} overlapping day(s); need >= ${MIN_DAYS}. `
      + `Push more floor-history samples (.githooks/pre-push) or rebuild the index.`);
    process.exit(1);
  }

  const ratios = days.map((d) => index.get(d) / live.get(d));
  const c = median(ratios);
  const lo = Math.min(...ratios), hi = Math.max(...ratios);

  console.log(`\nFloor calibration — index vs live listing floor`);
  console.log(`  overlapping days: ${days.length}  (${days[0]} -> ${days[days.length - 1]})\n`);
  console.log(`  ${'day'.padEnd(12)}${'index'.padStart(9)}${'live'.padStart(10)}${'idx/live'.padStart(11)}`);
  for (const d of days) {
    console.log(`  ${d.padEnd(12)}${index.get(d).toFixed(4).padStart(9)}`
      + `${live.get(d).toFixed(4).padStart(10)}${(index.get(d) / live.get(d)).toFixed(3).padStart(11)}`);
  }
  console.log(`\n  floor_calibration = ${c.toFixed(4)}   (range ${lo.toFixed(3)}-${hi.toFixed(3)}, n=${days.length})`);
  console.log(`  live floor runs ${((1 / c - 1) * 100).toFixed(1)}% above the index`);
  console.log(`  => uncorrected, production would overprice by that much\n`);

  // A single floor regime cannot tell us whether the ratio is stable as the floor
  // moves, and the floor has historically swung ~20x. Say so rather than implying
  // more confidence than 15-ish days in one regime supports.
  const liveVals = days.map((d) => live.get(d));
  const spread = Math.max(...liveVals) / Math.min(...liveVals);
  if (spread < 2) {
    console.log(`  NOTE: all samples sit within a ${spread.toFixed(1)}x floor range `
      + `(${Math.min(...liveVals).toFixed(3)}-${Math.max(...liveVals).toFixed(3)} ETH).`);
    console.log(`  Treat this as a first correction, not a settled constant — re-run as`);
    console.log(`  floor-history.json accumulates samples across different regimes.\n`);
  }

  if (!process.argv.includes('--write')) {
    console.log(`  (pass --write to patch floor_calibration into the coefficients JSON)\n`);
    return;
  }

  const payload = {
    value: Number(c.toFixed(4)),
    measured_at: new Date().toISOString(),
    n_days: days.length,
    day_range: [days[0], days[days.length - 1]],
    ratio_range: [Number(lo.toFixed(3)), Number(hi.toFixed(3))],
    live_floor_range: [Number(Math.min(...liveVals).toFixed(4)), Number(Math.max(...liveVals).toFixed(4))],
    note: 'median(index_floor / live_floor). Multiply the live floor by this before '
        + 'applying fitted multiples, which were trained against the index.',
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
