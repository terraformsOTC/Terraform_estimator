'use strict';

// Endogenous daily floor index, derived from the sales themselves, to use as the
// deflator in the hedonic target ln(price / floor_at_sale). Built because the
// app's floor-history.json only spans ~3 weeks (plan §8.3).
//
// Method: for each UTC day d, take clean single-token sales in a TRAILING window
// ending at end-of-day d (no lookahead), expand the window until it holds at least
// MIN_SAMPLES, and take a low percentile (FLOOR_PCTL) as the floor proxy. A low
// quantile of transacted prices tracks the listing floor while resisting outliers.
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
const DAY = 86400;

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

const where = SALE_SET === 'ASK'
  ? "model_eligible=1 AND side='ASK'"
  : 'model_eligible=1';
const sales = db.prepare(
  `SELECT event_unix AS u, price_native AS p FROM v_model_sales WHERE ${where} AND price_native > 0 ORDER BY event_unix`
).all();

if (!sales.length) { console.error('No eligible sales — run views.sql first.'); process.exit(1); }

const us = sales.map((s) => s.u);
const firstDay = dayStartUnix(us[0]);
const lastDay = dayStartUnix(us[us.length - 1]);

// Binary search: first index with u > target.
function upperBound(target) {
  let lo = 0, hi = us.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (us[mid] <= target) lo = mid + 1; else hi = mid; }
  return lo;
}

const ins = db.prepare('INSERT INTO floor_index_daily (day, floor_eth, n_samples, window_days) VALUES (?, ?, ?, ?)');
const writeAll = db.transaction(() => {
  for (let d = firstDay; d <= lastDay; d += DAY) {
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
    if (floor != null) ins.run(dayStr(d), Number(floor.toFixed(6)), n, Math.round(W / DAY));
  }
});
writeAll();

const rows = db.prepare('SELECT COUNT(*) c, MIN(day) lo, MAX(day) hi, ROUND(MIN(floor_eth),3) mn, ROUND(MAX(floor_eth),3) mx FROM floor_index_daily').get();
console.log(`floor_index_daily: ${rows.c} days, ${rows.lo} → ${rows.hi}, floor range ${rows.mn}–${rows.mx} ETH`);
console.log(`(pctl=${PCTL}, min_samples=${MIN_SAMPLES}, set=${SALE_SET})`);
console.log('\nRecent floor (validate vs floor-history ~0.31–0.34 ETH early Jun 2026):');
console.log(db.prepare("SELECT day, floor_eth, n_samples, window_days FROM floor_index_daily WHERE day >= '2026-05-20' ORDER BY day").all()
  .map((r) => `  ${r.day}: ${r.floor_eth} ETH  (n=${r.n_samples}, ${r.window_days}d)`).join('\n'));
db.close();
