#!/usr/bin/env node
'use strict';

// The public download of the Terraforms sales history (James, 2026-10-29: an
// open-source ethos — anyone can pull the raw data and run their own models).
//
//   node export_sales_dataset.js                    # sales through the end of last month
//   node export_sales_dataset.js --through 2026-10-28
//   node export_sales_dataset.js --if-due           # only when last month is not out yet
//
// Writes frontend/public/data/ (served by the site at /data/...):
//   terraforms-sales-through-<date>.csv.gz       the data, one sale per row
//   terraforms-sales-through-<date>.csv.gz.sha256 its SHA-256, `shasum -a 256 -c` format
//   sales-dataset.json                           manifest: the current file + every past release
//   sales-dataset-README.txt                     what each column means
// and deletes the previous release's data file (the manifest keeps its checksum, and
// the repo's history keeps the file).
//
// Built from backend/src/sales-history.json, the nightly export the site's sales
// pages serve (export_sales_history.js), and floor-index.json beside it. A release
// holds only whole UTC days up to --through, and the gzip carries no timestamp, so
// re-running it over the same sales gives the same bytes and the same checksum.
// Run monthly from ops/daily-refit.sh (--if-due).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const SRC_DIR = path.join(__dirname, '..', 'backend', 'src');
const OUT_DIR = path.join(__dirname, '..', 'frontend', 'public', 'data');
const MANIFEST = path.join(OUT_DIR, 'sales-dataset.json');
const README = path.join(OUT_DIR, 'sales-dataset-README.txt');
const REPO_URL = 'https://github.com/terraformsOTC/Terraform_estimator';
// The data is CC0 (James, 2026-10-29: open data; the code is AGPL-3.0-or-later).
const LICENSE = {
  id: 'CC0-1.0',
  name: 'Creative Commons Zero v1.0 Universal (public domain dedication)',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  file: 'LICENSE-CC0-1.0.txt',
};

const COLUMNS = [
  ['sale_time_utc', 'when the sale settled, ISO 8601 UTC'],
  ['unix', 'the same, as a Unix timestamp (seconds)'],
  ['token_id', 'the parcel, 1-9911'],
  ['price', 'sale price in the currency column. For kind=bundle this is the ORDER TOTAL, repeated on every parcel in the bundle (OpenSea reports it that way) — divide by legs for a per-parcel figure'],
  ['currency', 'ETH (a listing was bought), WETH (an offer was accepted) or BETH (Blur pool ETH, an accepted Blur bid)'],
  ['kind', 'single (one parcel in the transaction), sweep (several parcels, each its own order at its own price) or bundle (one order for several parcels)'],
  ['legs', 'parcels in the same transaction'],
  ['buyer', 'buying wallet'],
  ['seller', 'selling wallet'],
  ['tx_hash', 'the Ethereum transaction'],
  ['floor_index_eth', "the estimator's daily floor index for that day (12th percentile of clean single-parcel sales over a trailing 14+ day window) — derived, not raw; empty where the index has no value"],
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function lastDayOfPreviousMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

function main() {
  const through = arg('--through') || lastDayOfPreviousMonth();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) throw new Error(`--through must be YYYY-MM-DD, got ${through}`);
  const throughEnd = Date.parse(`${through}T00:00:00Z`) / 1000 + 86400;   // exclusive
  if (!(throughEnd <= Date.now() / 1000)) throw new Error(`--through ${through} is not a finished UTC day yet`);

  let manifest = { latest: null, history: [] };
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch {}
  if (process.argv.includes('--if-due') && manifest.latest && manifest.latest.through >= through) {
    console.log(`sales dataset: release through ${manifest.latest.through} already out — nothing due`);
    return;
  }

  const sales = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'sales-history.json'), 'utf8'));
  const floor = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'floor-index.json'), 'utf8')).days;
  const col = Object.fromEntries(sales.columns.map((c, i) => [c, i]));
  const lastExported = sales.rows.length ? sales.rows[sales.rows.length - 1][col.unix] : 0;
  if (lastExported < throughEnd - 86400) {
    throw new Error(`sales-history.json ends ${new Date(lastExported * 1000).toISOString()}, before ${through}: run export_sales_history.js first`);
  }

  const lines = [COLUMNS.map(([c]) => c).join(',')];
  let first = null;
  let last = null;
  for (const r of sales.rows) {
    const unix = r[col.unix];
    if (unix >= throughEnd) continue;
    const iso = new Date(unix * 1000).toISOString().replace('.000Z', 'Z');
    const f = floor[iso.slice(0, 10)];
    lines.push([
      iso, unix, r[col.tokenId], r[col.price], sales.currencies[r[col.currency]], sales.kinds[r[col.kind]],
      r[col.legs], sales.addresses[r[col.buyer]], sales.addresses[r[col.seller]], r[col.tx],
      f == null ? '' : f,
    ].join(','));
    if (first === null) first = iso;
    last = iso;
  }
  const csv = lines.join('\n') + '\n';
  const gz = zlib.gzipSync(Buffer.from(csv), { level: 9 });   // Node writes mtime 0: same input, same bytes
  if (zlib.gunzipSync(gz).toString() !== csv) throw new Error('gzip round trip failed');
  const sha256 = crypto.createHash('sha256').update(gz).digest('hex');

  const file = `terraforms-sales-through-${through}.csv.gz`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const old of fs.readdirSync(OUT_DIR)) {
    if (/^terraforms-sales-through-.*\.csv\.gz(\.sha256)?$/.test(old) && !old.startsWith(file)) fs.rmSync(path.join(OUT_DIR, old));
  }
  fs.writeFileSync(path.join(OUT_DIR, file), gz);
  fs.writeFileSync(path.join(OUT_DIR, `${file}.sha256`), `${sha256}  ${file}\n`);

  const release = {
    file, sha256, bytes: gz.length, rows: lines.length - 1, through,
    firstSale: first, lastSale: last, generatedAt: new Date().toISOString(),
  };
  const history = (manifest.history || []).filter((h) => h.file !== file);
  if (manifest.latest && manifest.latest.file !== file) history.unshift(manifest.latest);
  fs.writeFileSync(MANIFEST, JSON.stringify({
    description: 'Terraforms (0x4E1f41613c9084FdB9E34E11fAE9412427480e56) secondary-market sales, from the Terraform Estimator. Updated monthly.',
    repository: REPO_URL,
    license: LICENSE,
    verify: 'shasum -a 256 -c <file>.sha256  (or sha256sum -c; on Windows: Get-FileHash <file> -Algorithm SHA256)',
    columns: COLUMNS.map(([name, meaning]) => ({ name, meaning })),
    latest: release,
    history: history.map(({ file: f, sha256: s, bytes, rows, through: t, generatedAt }) => ({ file: f, sha256: s, bytes, rows, through: t, generatedAt })),
  }, null, 2) + '\n');

  fs.writeFileSync(README, [
    'Terraforms sales history — Terraform Estimator open data',
    '',
    `Every secondary-market sale of a Terraforms parcel (contract 0x4E1f41613c9084FdB9E34E11fAE9412427480e56)`,
    'in ETH, WETH or Blur pool ETH, oldest first, one row per parcel sold. Updated monthly; each release covers',
    'whole UTC days up to the date in its name.',
    '',
    'Left out: self-trades and wash trades (a wallet selling to itself, or a router\'s internal leg — never a',
    'real sale), and four 2022 sales in USDC. Nothing else is filtered: anomalous sales are in the data.',
    '',
    'Columns:',
    ...COLUMNS.map(([name, meaning]) => `  ${name.padEnd(16)} ${meaning}`),
    '',
    'Check the download before you use it — the file must match its SHA-256:',
    '  macOS:   shasum -a 256 -c <file>.sha256',
    '  Linux:   sha256sum -c <file>.sha256',
    '  Windows: Get-FileHash <file> -Algorithm SHA256   (compare with the hash in <file>.sha256)',
    'The same checksum is in sales-dataset.json, committed to the public repository, so you can check it',
    `against a source other than the website: ${REPO_URL}/commits/main/frontend/public/data/sales-dataset.json`,
    '',
    'Source: on-chain sales collected from the OpenSea API (sales database/ in the repository).',
    '',
    `License: ${LICENSE.name}, ${LICENSE.url} (full text in ${LICENSE.file}).`,
    'To the extent possible under law, the publisher waives all copyright and related rights in this data:',
    'use it for anything, no permission or credit needed. The Terraform Estimator code itself is',
    `AGPL-3.0-or-later (${REPO_URL}).`,
    '',
  ].join('\n'));

  console.log(`sales dataset: ${file} — ${release.rows} sales ${first} .. ${last}, ${Math.round(gz.length / 1024)}KB, sha256 ${sha256}`);
}

main();
