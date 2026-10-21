'use strict';

// Endogenous daily floor index, derived from the sales themselves, to use as the
// deflator in the hedonic target ln(price / floor_at_sale). Built because the
// app's floor-history.json only spans ~3 weeks (plan §8.3).
//
// Method: for each UTC day d, take clean sales in a TRAILING window ending at
// end-of-day d (no lookahead), expand the window until it holds at least
// MIN_SAMPLES, and take a low percentile (FLOOR_PCTL) as the floor proxy. A low
// quantile of transacted prices tracks the listing floor while resisting outliers.
//
// Clean = every parcel bought at its own listed price, sweep legs included
// (own-price.js, the fit's rule; James, 2026-10-21) — a floor sweep is the floor
// trading. Only bundle orders, whose total sits on every leg, stay out. Their test
// needs a floor (one seller repeating one price under 1.5x it is a floor sweep),
// so the index is built twice: from single sales first, then with the sweep legs
// that index admits. SWEEPS=0 builds from single sales only.
//
// Tunables (env): FLOOR_PCTL (0.12), MIN_SAMPLES (12), BASE_WINDOW_D (14),
// MAX_WINDOW_D (120), SALE_SET ('ALL' | 'ASK').

const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || 'terraforms_sales.db';
const PCTL = Number(process.env.FLOOR_PCTL || 0.12);
const MIN_SAMPLES = Number(process.env.MIN_SAMPLES || 12);
const BASE_W = Number(process.env.BASE_WINDOW_D || 14) * 86400;
const MAX_W = Number(process.env.MAX_WINDOW_D || 120) * 86400;
const SALE_SET = (process.env.SALE_SET || 'ALL').toUpperCase();
const SWEEPS = process.env.SWEEPS !== '0';
const DAY = 86400;
const { ownPriceSales } = require('./own-price');

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function dayStr(unix) { return new Date(unix * 1000).toISOString().slice(0, 10); }
function dayStartUnix(unix) { return Math.floor(unix / DAY) * DAY; }

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS floor_index_daily (
    day         TEXT PRIMARY KEY,   -- YYYY-MM-DD UTC
    floor_eth   REAL,
    n_samples   INTEGER,
    window_days INTEGER
  );
  DELETE FROM floor_index_daily;
`);

// Every clean sale: the view's single sales plus the multi-parcel legs, which
// ownPriceSales then sorts into own-price legs and bundle orders.
const sideClause = SALE_SET === 'ASK' ? "AND side='ASK'" : '';
const candidates = db.prepare(
  `SELECT event_unix AS u, price_native AS p, price_native, tx_hash, seller, is_bundle FROM v_model_sales
   WHERE is_wash = 0 AND lower(buyer) <> lower(seller) AND payment_symbol IN ('ETH', 'WETH')
     AND price_native > 0 ${sideClause} ORDER BY event_unix`
).all();
const singles = candidates.filter((s) => !s.is_bundle);
if (!singles.length) { console.error('No eligible sales — run views.sql first.'); process.exit(1); }

// Daily floor from `sales` (sorted by u): day string -> { floor, n, windowDays }.
function buildIndex(sales) {
  const us = sales.map((s) => s.u);
  // Binary search: first index with u > target.
  const upperBound = (target) => {
    let lo = 0, hi = us.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (us[mid] <= target) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const out = new Map();
  for (let d = dayStartUnix(us[0]); d <= dayStartUnix(us[us.length - 1]); d += DAY) {
    const cutoff = d + DAY - 1; // end of day d (inclusive of same-day sales)
    const endIdx = upperBound(cutoff);
    let W = BASE_W, prices = null, n = 0;
    for (;;) {
      const startIdx = upperBound(cutoff - W);
      n = endIdx - startIdx;
      if (n >= MIN_SAMPLES || W >= MAX_W) {
        prices = sales.slice(startIdx, endIdx).map((s) => s.p).sort((a, b) => a - b);
        break;
      }
      W += BASE_W;
    }
    const floor = percentile(prices, PCTL);
    if (floor != null) out.set(dayStr(d), { floor: Number(floor.toFixed(6)), n, windowDays: Math.round(W / DAY) });
  }
  return out;
}

let index = buildIndex(singles);
let sales = singles;
if (SWEEPS) {
  const first = index;
  sales = ownPriceSales(candidates, (s) => first.get(dayStr(s.u))?.floor);
  index = buildIndex(sales);
}
console.log(`index built from ${sales.length} sales (${sales.length - singles.length} sweep legs at their own price)`);

const ins = db.prepare('INSERT INTO floor_index_daily (day, floor_eth, n_samples, window_days) VALUES (?, ?, ?, ?)');
db.transaction(() => {
  for (const [day, v] of index) ins.run(day, v.floor, v.n, v.windowDays);
})();

const rows = db.prepare('SELECT COUNT(*) c, MIN(day) lo, MAX(day) hi, ROUND(MIN(floor_eth),3) mn, ROUND(MAX(floor_eth),3) mx FROM floor_index_daily').get();
console.log(`floor_index_daily: ${rows.c} days, ${rows.lo} → ${rows.hi}, floor range ${rows.mn}–${rows.mx} ETH`);
console.log(`(pctl=${PCTL}, min_samples=${MIN_SAMPLES}, set=${SALE_SET}, sweeps=${SWEEPS ? 'own-price legs' : 'excluded'})`);
console.log('\nRecent floor (validate vs floor-history ~0.31–0.34 ETH early Jun 2026):');
console.log(db.prepare("SELECT day, floor_eth, n_samples, window_days FROM floor_index_daily WHERE day >= '2026-05-20' ORDER BY day").all()
  .map((r) => `  ${r.day}: ${r.floor_eth} ETH  (n=${r.n_samples}, ${r.window_days}d)`).join('\n'));
db.close();
