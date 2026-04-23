// apply_1of1_changes.js — Apply 1-of-1 cross-reference results
// Usage: node backend/apply_1of1_changes.js
//
// 1. Removes invalidated token IDs from ONE_OF_ONE_IDS in server.js
// 2. Removes invalidated token IDs from special-tokens.json (if tagged "1of1")
// 3. Tags 133 new unminted parcels with specialType: "1of1" in unminted-parcels.json

const fs = require('fs');
const path = require('path');

const results = require('./1of1_check_results.json');
const toRemoveIds = new Set(results.mintedToRemove.map(r => r.tokenId));
const toAddUnmintedIds = new Set(results.unmintedToAdd.map(r => r.unmintedId));

// ── 1. Update unminted-parcels.json ──────────────────────────────────────────
const unmintedPath = path.join(__dirname, 'src', 'unminted-parcels.json');
const unminted = JSON.parse(fs.readFileSync(unmintedPath, 'utf8'));

let unmintedChanged = 0;
for (const p of unminted) {
  if (toAddUnmintedIds.has(p.id)) {
    if (p.specialType === null) {
      p.specialType = '1of1';
      unmintedChanged++;
    } else {
      console.log(`  SKIP unminted #${p.id} — already has specialType: "${p.specialType}"`);
    }
  }
}
fs.writeFileSync(unmintedPath, JSON.stringify(unminted, null, 2));
console.log(`unminted-parcels.json: tagged ${unmintedChanged} parcels as 1of1`);

// ── 2. Update special-tokens.json ────────────────────────────────────────────
const specialPath = path.join(__dirname, 'src', 'special-tokens.json');
const special = JSON.parse(fs.readFileSync(specialPath, 'utf8'));

let specialRemoved = 0;
for (const id of toRemoveIds) {
  if (special[String(id)] === '1of1') {
    delete special[String(id)];
    specialRemoved++;
  }
}
// Sort keys numerically before writing
const sortedSpecial = Object.fromEntries(
  Object.entries(special).sort((a, b) => Number(a[0]) - Number(b[0]))
);
fs.writeFileSync(specialPath, JSON.stringify(sortedSpecial, null, 2));
console.log(`special-tokens.json: removed ${specialRemoved} invalidated 1of1 entries`);

// ── 3. Update ONE_OF_ONE_IDS in server.js ────────────────────────────────────
const serverPath = path.join(__dirname, 'src', 'server.js');
let serverSrc = fs.readFileSync(serverPath, 'utf8');

// Extract the current ONE_OF_ONE_IDS array
const match = serverSrc.match(/const ONE_OF_ONE_IDS = new Set\(\[([\s\S]*?)\]\);/);
if (!match) {
  console.error('ERROR: Could not find ONE_OF_ONE_IDS in server.js');
  process.exit(1);
}

const currentIds = match[1]
  .split(/[\s,]+/)
  .map(s => s.trim())
  .filter(s => /^\d+$/.test(s))
  .map(Number);

const updatedIds = currentIds.filter(id => !toRemoveIds.has(id));
console.log(`server.js ONE_OF_ONE_IDS: ${currentIds.length} → ${updatedIds.length} (removed ${currentIds.length - updatedIds.length})`);

// Format as rows of ~12 per line, sorted numerically
updatedIds.sort((a, b) => a - b);
const rows = [];
for (let i = 0; i < updatedIds.length; i += 12) {
  rows.push('  ' + updatedIds.slice(i, i + 12).join(', '));
}
const newBlock = `const ONE_OF_ONE_IDS = new Set([\n${rows.join(',\n')},\n]);`;

serverSrc = serverSrc.replace(/const ONE_OF_ONE_IDS = new Set\(\[[\s\S]*?\]\);/, newBlock);
fs.writeFileSync(serverPath, serverSrc);
console.log(`server.js: updated ONE_OF_ONE_IDS`);

console.log('\nAll changes applied.');
