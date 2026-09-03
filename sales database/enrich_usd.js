'use strict';

require('dotenv').config();
const { getJson } = require('./lib/http');
const { openDb } = require('./lib/db');

// Populate eth_usd_daily with one USD price per UTC day across the sales range,
// then stamp price_usd on each ETH/WETH sale using the price ON THE SALE DAY
// (never today's price). Non-ETH/WETH sales are left null here.
//
// Source: Alchemy Prices API (daily ETH/USD closes), reusing ALCHEMY_API_KEY —
// no extra account needed. It replaced CryptoCompare on 2026-09-03: histoday
// started returning HTTP 401 "API key required", so this silently stopped
// ingesting new points and price_usd froze for anything recent.
//
// Alchemy caps a 1d interval at 365 points per call, so we page BACKWARD in
// <=365-day windows until the earliest sale is covered — five or so calls for
// the full history since mint. Set CRYPTOCOMPARE_API_KEY to fall back to the old
// source instead (it still works with a key).

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY || '';
const ALCHEMY_MAX_DAYS = 365;  // hard server-side cap on a 1d interval
const CC = 'https://min-api.cryptocompare.com/data/v2/histoday';
const CC_MAX = 2000; // max daily points per histoday call
const CC_KEY = process.env.CRYPTOCOMPARE_API_KEY || '';

function dayKey(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

// One Alchemy page: daily closes for the window ending at `toTs`, capped at 365
// days. Same [[unixSec, usdClose], ...] oldest-first shape as the CryptoCompare
// path so the caller does not care which source answered.
async function fetchDailyPageAlchemy(toTs, limitDays) {
  const days = Math.min(limitDays, ALCHEMY_MAX_DAYS);
  const endTime = new Date(toTs * 1000).toISOString();
  const startTime = new Date((toTs - days * 86400) * 1000).toISOString();
  const url = `https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/historical`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ symbol: 'ETH', startTime, endTime, interval: '1d' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Alchemy prices HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.data || [])
    .map((d) => [Math.floor(Date.parse(d.timestamp) / 1000), Number(d.value)])
    .filter(([sec, usd]) => Number.isFinite(sec) && Number.isFinite(usd) && usd > 0)
    .sort((a, b) => a[0] - b[0]);
}

// Dispatch: Alchemy unless a CryptoCompare key is explicitly configured.
async function fetchDailyPage(toTs, limitDays) {
  if (!CC_KEY && ALCHEMY_KEY) return fetchDailyPageAlchemy(toTs, limitDays);
  if (!CC_KEY && !ALCHEMY_KEY) {
    throw new Error('no price source: set ALCHEMY_API_KEY (or CRYPTOCOMPARE_API_KEY)');
  }
  return fetchDailyPageCryptoCompare(toTs, limitDays);
}

// One histoday page: up to `limitDays` daily closes ending at `toTs`.
// Returns [[unixSec, usdClose], ...] oldest-first, zero-close padding dropped.
async function fetchDailyPageCryptoCompare(toTs, limitDays) {
  const params = new URLSearchParams({
    fsym: 'ETH',
    tsym: 'USD',
    limit: String(Math.min(limitDays, CC_MAX)),
    toTs: String(toTs),
  });
  if (CC_KEY) params.set('api_key', CC_KEY);
  const data = await getJson(`${CC}?${params.toString()}`, { maxRetries: 6 });
  if (data.Response && data.Response !== 'Success') {
    throw new Error(`CryptoCompare: ${data.Message || 'unknown error'}`);
  }
  const rows = (data.Data && data.Data.Data) || [];
  return rows
    .filter((r) => r && r.close > 0)
    .map((r) => [r.time, r.close]);
}

async function main() {
  const db = openDb();

  const r = db.prepare('SELECT MIN(event_unix) lo, MAX(event_unix) hi FROM sales').get();
  if (!r.lo) { console.log('No sales to price. Run backfill first.'); db.close(); return; }

  const upDay = db.prepare(`
    INSERT INTO eth_usd_daily (day, usd) VALUES (?, ?)
    ON CONFLICT(day) DO UPDATE SET usd = excluded.usd
  `);

  const floor = r.lo - 86400;     // one day of slack below the earliest sale
  let toTs = r.hi + 86400;        // and above the latest
  let count = 0;

  while (toTs > floor) {
    const spanDays = Math.ceil((toTs - floor) / 86400) + 1;
    let page;
    try {
      page = await fetchDailyPage(toTs, spanDays);
    } catch (err) {
      console.warn(`  histoday page up to ${dayKey(toTs)} failed: ${err.message}`);
      break;
    }
    if (!page.length) break;

    const tx = db.transaction((rows) => {
      for (const [sec, usd] of rows) upDay.run(dayKey(sec), usd);
    });
    tx(page);
    count += page.length;

    const earliest = page[0][0];
    console.log(`  ${dayKey(earliest)}..${dayKey(toTs)} → ${page.length} points`);
    if (earliest <= floor) break;
    toTs = earliest - 86400; // next page ends the day before this page's earliest
  }

  const days = db.prepare('SELECT COUNT(*) c FROM eth_usd_daily').get().c;
  console.log(`eth_usd_daily now holds ${days} days (ingested ${count} points).`);

  // Stamp price_usd for ETH/WETH sales via day join.
  const updated = db.prepare(`
    UPDATE sales
    SET price_usd = price_native * (
      SELECT usd FROM eth_usd_daily d WHERE d.day = substr(sales.event_ts, 1, 10)
    )
    WHERE payment_symbol IN ('ETH', 'WETH')
      AND price_native IS NOT NULL
      AND EXISTS (SELECT 1 FROM eth_usd_daily d WHERE d.day = substr(sales.event_ts, 1, 10))
  `).run();

  console.log(`price_usd stamped on ${updated.changes} ETH/WETH sales.`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
