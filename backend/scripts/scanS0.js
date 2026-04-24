// scanS0.js — Scan the full Terraforms collection for Season 0 (S0) parcels.
//
// Usage:
//   node --env-file=../.env scripts/scanS0.js
//
// Output: logs each S0 token ID as it's found, then prints a final summary.
// S0 parcels are V2-upgraded tokens whose on-chain Timestamp trait contains '[S0]'.

const { ethers } = require('ethers');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const TOTAL_SUPPLY = 9911;
const BATCH_SIZE = 10;   // concurrent RPC calls per batch
const DELAY_MS = 100;    // ms between batches (be gentle with the RPC)

const ABI = ['function tokenURI(uint256 tokenId) view returns (string)'];

async function main() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL not set — run with --env-file=../.env');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(TERRAFORMS_ADDRESS, ABI, provider);

  const s0Ids = [];
  let scanned = 0;

  console.log(`Scanning tokens 1–${TOTAL_SUPPLY} for S0 designation...\n`);

  for (let start = 1; start <= TOTAL_SUPPLY; start += BATCH_SIZE) {
    const batch = [];
    for (let id = start; id < start + BATCH_SIZE && id <= TOTAL_SUPPLY; id++) {
      batch.push(id);
    }

    const results = await Promise.allSettled(
      batch.map(async (tokenId) => {
        const uri = await contract.tokenURI(tokenId);
        if (!uri.startsWith('data:application/json;base64,')) return null;
        const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
        const attrs = json.attributes || [];
        const ts = attrs.find(a => a.trait_type === 'Timestamp')?.value || '';
        return String(ts).includes('[S0]') ? tokenId : null;
      })
    );

    for (const r of results) {
      scanned++;
      if (r.status === 'fulfilled' && r.value !== null) {
        s0Ids.push(r.value);
        process.stdout.write(`  S0 found: #${r.value}\n`);
      }
    }

    if (scanned % 500 === 0) {
      console.log(`  ... ${scanned}/${TOTAL_SUPPLY} scanned, ${s0Ids.length} S0 found so far`);
    }

    if (start + BATCH_SIZE <= TOTAL_SUPPLY) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Scan complete. ${scanned} tokens scanned.`);
  console.log(`S0 parcels found: ${s0Ids.length}`);
  console.log(`\nToken IDs:\n${JSON.stringify(s0Ids)}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
