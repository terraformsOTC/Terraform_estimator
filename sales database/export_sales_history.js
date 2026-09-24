#!/usr/bin/env node
'use strict';

// Export every sale in the local sales DB to the backend, so the site's sales
// page can show (and filter) the whole market history rather than the ~50 most
// recent events the live OpenSea feed carries.
//
//   node export_sales_history.js     # -> backend/src/sales-history.json
//                                    #    backend/src/floor-index.json
//
// Run nightly by ops/daily-refit.sh after catchup and build_floor_index, and
// committed with the other artifacts; the backend loads both at boot and merges
// in live sales newer than the export.
//
// WHAT IS EXPORTED
// Every ETH / WETH / Blur Pool sale except self-trades (a router's internal leg,
// never a sale — see lib/db.js). USDC sales (4, all 2022) are left out: the site
// prices everything in ETH.
//
// FORMAT
// Compact and append-friendly: one sale per line, oldest first, wallet addresses
// held once in a table in first-seen order. New sales only append lines, so the
// nightly commit is a small diff rather than a rewritten 3MB file.
//
// `kind` separates the three things OpenSea reports as a multi-parcel sale:
//   single  one parcel in the transaction
//   sweep   several parcels, each its own order at its own price (a real price)
//   bundle  one order for several parcels — OpenSea repeats the ORDER TOTAL on
//           every leg, so the per-leg price is not what that parcel sold for.
//           Recognised as: every leg the same price, one seller, one buyer, and a
//           price of at least 1.5x the day's floor (a sweep of floor parcels from
//           one seller also shares a price, but at about 1x the floor).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, process.env.DB_PATH || 'terraforms_sales.db');
const OUT_DIR = path.join(__dirname, '..', 'backend', 'src');
const SALES_OUT = path.join(OUT_DIR, 'sales-history.json');
const FLOOR_OUT = path.join(OUT_DIR, 'floor-index.json');

const CURRENCY = {
  '0x0000000000000000000000000000000000000000': 0, // ETH, a taken listing
  '': 0,
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 1, // WETH, an accepted offer
  '0x0000000000a39bb272e79075ade125fd351887ac': 2, // Blur Pool ETH, an accepted offer
};
const CURRENCIES = ['ETH', 'WETH', 'BETH'];
const KINDS = ['single', 'sweep', 'bundle'];
const BUNDLE_MIN_FLOOR_MULTIPLE = 1.5;

function main() {
  const db = new Database(DB_PATH, { readonly: true });
  const floorIndex = new Map(
    db.prepare('SELECT day, floor_eth FROM floor_index_daily ORDER BY day').all()
      .map((r) => [r.day, r.floor_eth]),
  );
  const rows = db.prepare(`
    SELECT tx_hash, token_id, event_unix, event_ts, price_native,
           lower(COALESCE(payment_token, '')) AS token,
           lower(buyer) AS buyer, lower(seller) AS seller
    FROM sales
    WHERE lower(buyer) <> lower(seller)
      AND is_wash = 0
      AND price_native > 0
    ORDER BY event_unix, tx_hash, token_id
  `).all().filter((r) => r.token in CURRENCY);
  db.close();

  // Per-transaction shape, to tell a bundle order from a sweep.
  const byTx = new Map();
  for (const r of rows) {
    const t = byTx.get(r.tx_hash) || { tokens: new Set(), prices: new Set(), buyers: new Set(), sellers: new Set() };
    t.tokens.add(r.token_id); t.prices.add(r.price_native);
    t.buyers.add(r.buyer); t.sellers.add(r.seller);
    byTx.set(r.tx_hash, t);
  }

  const addrIndex = new Map();
  const addresses = [];
  const addr = (a) => {
    if (!addrIndex.has(a)) { addrIndex.set(a, addresses.length); addresses.push(a); }
    return addrIndex.get(a);
  };

  const counts = { single: 0, sweep: 0, bundle: 0 };
  const lines = rows.map((r) => {
    const t = byTx.get(r.tx_hash);
    const legs = t.tokens.size;
    let kind = 0;
    if (legs > 1) {
      const floor = floorIndex.get(r.event_ts.slice(0, 10));
      const oneOrder = t.prices.size === 1 && t.buyers.size === 1 && t.sellers.size === 1;
      kind = oneOrder && floor > 0 && r.price_native >= BUNDLE_MIN_FLOOR_MULTIPLE * floor ? 2 : 1;
    }
    counts[KINDS[kind]]++;
    return JSON.stringify([
      r.event_unix, r.token_id, Number(r.price_native.toFixed(8)), CURRENCY[r.token],
      legs, kind, addr(r.buyer), addr(r.seller), r.tx_hash.toLowerCase(),
    ]);
  });

  const header = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'sales database/terraforms_sales.db via export_sales_history.js',
    columns: ['unix', 'tokenId', 'price', 'currency', 'legs', 'kind', 'buyer', 'seller', 'tx'],
    currencies: CURRENCIES,
    kinds: KINDS,
  };
  const out = [
    '{',
    ...Object.entries(header).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)},`),
    '"addresses":[',
    addresses.map((a) => JSON.stringify(a)).join(',\n'),
    '],',
    '"rows":[',
    lines.join(',\n'),
    ']}',
    '',
  ].join('\n');
  JSON.parse(out); // never write a file the backend cannot load
  fs.writeFileSync(SALES_OUT, out);

  const days = [...floorIndex.entries()];
  const floorOut = [
    '{',
    `"version":1,`,
    `"method":${JSON.stringify('12th percentile of clean single-parcel sales over a trailing 14+ day window (build_floor_index.js) — the floor the model was fitted against')},`,
    '"days":{',
    days.map(([d, f]) => `${JSON.stringify(d)}:${Number(f.toFixed(6))}`).join(',\n'),
    '}}',
    '',
  ].join('\n');
  JSON.parse(floorOut);
  fs.writeFileSync(FLOOR_OUT, floorOut);

  const kb = (p) => Math.round(fs.statSync(p).size / 1024);
  console.log(`sales-history.json: ${lines.length} sales (${counts.single} single, ${counts.sweep} sweep legs, `
    + `${counts.bundle} bundle legs), ${addresses.length} wallets, ${kb(SALES_OUT)}KB`);
  console.log(`floor-index.json: ${days.length} days, ${kb(FLOOR_OUT)}KB`);
}

main();
