// debugTraits.js — Dump all raw on-chain attributes for a token.
// Usage: node --env-file=../.env scripts/debugTraits.js 128

const { ethers } = require('ethers');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const ABI = ['function tokenURI(uint256 tokenId) view returns (string)'];

async function main() {
  const tokenId = process.argv[2];
  if (!tokenId) { console.error('Usage: node debugTraits.js <tokenId>'); process.exit(1); }

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error('RPC_URL not set');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(TERRAFORMS_ADDRESS, ABI, provider);

  const uri = await contract.tokenURI(tokenId);
  if (!uri.startsWith('data:application/json;base64,')) {
    console.log('Non-base64 URI:', uri.slice(0, 100));
    return;
  }

  const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  console.log('\nAll attributes for token', tokenId, ':\n');
  (json.attributes || []).forEach(a => {
    console.log(`  trait_type: ${JSON.stringify(a.trait_type)}  →  value: ${JSON.stringify(a.value)}`);
  });
}

main().catch(err => { console.error(err.message); process.exit(1); });
