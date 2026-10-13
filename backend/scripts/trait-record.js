// trait-record.js — one minted parcel's minted-traits.json record, read from
// chain. Shared by bake-minted-traits.js (all 9911) and crosscheck-indexer.js
// (only the parcels the public indexer disagrees on), so both write the same
// shape by the same rules.

const { ethers } = require('ethers');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const ANTENNA_ADDRESS    = '0x331512A28A4cF80221aF949B5d43041fF0FC7f01';

const TERRAFORMS_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
];
const ANTENNA_ABI = [
  'function getAntennaStatus(uint256 tokenId) view returns (uint8)',
  'function getFirstAntennaModification(uint256 tokenId) view returns (tuple(uint8 modification, address satellite, uint256 timestamp))',
];

function makeContracts(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return {
    provider,
    terraforms: new ethers.Contract(TERRAFORMS_ADDRESS, TERRAFORMS_ABI, provider),
    antenna: new ethers.Contract(ANTENNA_ADDRESS, ANTENNA_ABI, provider),
  };
}

function extractAttrs(uri) {
  if (!uri.startsWith('data:application/json;base64,')) return null;
  const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
  return json.attributes || [];
}

function buildTraitRecord(tokenId, attrs, antennaOn, antennaFirstTs) {
  const findVal = (name) => attrs.find(a => a.trait_type === name)?.value;
  const levelVal = findVal('Level');
  const biomeVal = findVal('Biome');
  const mysteryRaw = findVal('???');
  return {
    tokenId,
    zone: findVal('Zone') || null,
    level: levelVal != null ? parseInt(levelVal, 10) : null,
    biome: biomeVal != null ? parseInt(biomeVal, 10) : null,
    chroma: findVal('Chroma') || 'Flow',
    mode: findVal('Mode') || 'Terrain',
    mysteryValue: mysteryRaw != null ? Number(mysteryRaw) : null,
    antennaOn,
    antennaFirstTs,
  };
}

// Antenna state comes from the Antenna contract's getAntennaStatus, not the
// tokenURI's Antenna attribute: a parcel rendered by the v1 renderer omits the
// attribute even with its antenna on (#1351, #1915 and 15 others whose antenna
// went on inside the S0 window). That is also what the public indexer reports.
// The attribute is only the fallback if the status call itself fails.
async function readAntenna(tokenId, attrs, antenna) {
  let antennaOn;
  try {
    antennaOn = Number(await antenna.getAntennaStatus(tokenId)) === 1;
  } catch {
    antennaOn = attrs.find(a => a.trait_type === 'Antenna')?.value === 'On';
  }
  let antennaFirstTs = 0;
  if (antennaOn) {
    try {
      antennaFirstTs = Number((await antenna.getFirstAntennaModification(tokenId))[2]);
    } catch {
      // Reverts with "No antenna modifications" — leave at 0.
    }
  }
  return { antennaOn, antennaFirstTs };
}

async function fetchTraitRecord(tokenId, { terraforms, antenna }) {
  const attrs = extractAttrs(await terraforms.tokenURI(tokenId));
  if (!attrs) throw new Error('Unexpected tokenURI format');
  const { antennaOn, antennaFirstTs } = await readAntenna(tokenId, attrs, antenna);
  return buildTraitRecord(tokenId, attrs, antennaOn, antennaFirstTs);
}

module.exports = { makeContracts, fetchTraitRecord, readAntenna, TERRAFORMS_ADDRESS, ANTENNA_ADDRESS };
