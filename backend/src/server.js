const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { estimatePrice, detectSets, FLOOR_PRICE_ETH } = require('./pricingModel');

const app = express();
app.use(cors());
app.use(express.json());

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const RPC_URL = process.env.RPC_URL || 'https://eth.llamarpc.com';

const TERRAFORMS_ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
];

let provider, contract;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    contract = new ethers.Contract(TERRAFORMS_ADDRESS, TERRAFORMS_ABI, provider);
  }
  return { provider, contract };
}

// Detect special type from metadata attributes
function detectSpecialType(attributes) {
  if (!attributes) return null;

  const chroma = attributes.find(a => a.trait_type === 'Chroma')?.value;
  if (chroma === 'Plague') return 'Plague';

  const resource = attributes.find(a => a.trait_type === 'Resource')?.value || '';
  if (resource.includes('X-Seed') || resource === 'X Seed') return 'X-Seed';
  if (resource.includes('Y-Seed') || resource === 'Y Seed') return 'Y-Seed';
  if (resource.includes('Lith0')) return 'Lith0';
  if (resource.includes('Spine')) return 'Spine';

  const edition = attributes.find(a => a.trait_type === 'Edition')?.value || '';
  if (edition === '1 of 1' || edition === '1of1') return '1of1';

  return null;
}

// ??? value thresholds derived from sampling 500 tokens across the collection (Mar 2025)
// Distribution: min=5573, max=53993, p5=20733, p95=52564
const MYSTERY_P5  = 20733;
const MYSTERY_P95 = 52564;

function mysteryOutlierFlag(value) {
  if (value == null) return null;
  if (value > MYSTERY_P95) return 'high';
  if (value < MYSTERY_P5)  return 'low';
  return null;
}

// Parse all traits from tokenURI metadata
// Zone and Level are read from tokenURI attributes (trait_type "Zone" / "Level").
// tokenSupplementalData has a struct ABI mismatch and is not used.
async function getParcelTraits(tokenId) {
  const { contract } = getProvider();

  try {
    const uri = await contract.tokenURI(tokenId);

    let zone = null, level = null, biome = null, chroma = null, mode = null,
        specialType = null, mysteryValue = null;

    if (uri.startsWith('data:application/json;base64,')) {
      const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
      const attrs = json.attributes || [];

      zone = attrs.find(a => a.trait_type === 'Zone')?.value || null;
      level = parseInt(attrs.find(a => a.trait_type === 'Level')?.value ?? -1);
      biome = parseInt(attrs.find(a => a.trait_type === 'Biome')?.value ?? -1);
      chroma = attrs.find(a => a.trait_type === 'Chroma')?.value || 'Flow';
      mode = attrs.find(a => a.trait_type === 'Mode')?.value || 'Terrain';
      specialType = detectSpecialType(attrs);
      const rawMystery = attrs.find(a => a.trait_type === '???')?.value;
      mysteryValue = rawMystery != null ? Number(rawMystery) : null;
    }

    return {
      tokenId: Number(tokenId),
      zone,
      level: isNaN(level) ? null : level,
      biome: isNaN(biome) ? null : biome,
      chroma,
      mode,
      specialType,
      mysteryValue,
      mysteryOutlier: mysteryOutlierFlag(mysteryValue),
    };
  } catch (err) {
    console.error(`Error fetching traits for token ${tokenId}:`, err.message);
    throw new Error(`Could not fetch traits for parcel ${tokenId}`);
  }
}

// GET /estimate/:tokenId
// GET /image/:tokenId — serves the on-chain SVG directly from tokenURI
// The SVG is base64-encoded inside the JSON image field.
// Note: parcels can change mode (terraform/daydream), so no long-term caching.
app.get('/image/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId) || tokenId < 1 || tokenId > 9999) {
      return res.status(400).send('Invalid token ID');
    }

    const { contract } = getProvider();
    const uri = await contract.tokenURI(tokenId);

    if (!uri.startsWith('data:application/json;base64,')) {
      return res.status(500).send('Unexpected tokenURI format');
    }

    const json = JSON.parse(Buffer.from(uri.slice(29), 'base64').toString());
    const image = json.image || '';

    if (image.startsWith('data:image/svg+xml;base64,')) {
      const svg = Buffer.from(image.slice(26), 'base64');
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min — mode can change
      return res.send(svg);
    }

    if (image.startsWith('data:image/svg+xml,')) {
      const svg = decodeURIComponent(image.slice(19));
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.send(svg);
    }

    res.status(500).send('Unrecognised image format in tokenURI');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /estimate/:tokenId
app.get('/estimate/:tokenId', async (req, res) => {
  try {
    const tokenId = parseInt(req.params.tokenId);
    if (isNaN(tokenId) || tokenId < 1 || tokenId > 9999) {
      return res.status(400).json({ error: 'Invalid token ID (must be 1–9999)' });
    }

    const traits = await getParcelTraits(tokenId);
    const pricing = estimatePrice(traits);

    res.json({ tokenId, traits, pricing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /wallet/:address
app.get('/wallet/:address', async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const { contract } = getProvider();
    const balance = await contract.balanceOf(address);
    const count = Number(balance);

    if (count === 0) {
      return res.json({ address, parcels: [], sets: [], totalEstimatedValue: 0, floor: FLOOR_PRICE_ETH });
    }

    const fetchCount = Math.min(count, 100);

    const tokenIds = await Promise.all(
      Array.from({ length: fetchCount }, (_, i) => contract.tokenOfOwnerByIndex(address, i))
    );

    // Batch fetch traits with concurrency limit
    const BATCH_SIZE = 5;
    const parcels = [];
    for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
      const batch = tokenIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(id => getParcelTraits(id)));
      for (const r of results) {
        if (r.status === 'fulfilled') parcels.push(r.value);
      }
    }

    const pricedParcels = parcels.map(p => ({
      tokenId: p.tokenId,
      traits: p,
      pricing: estimatePrice(p),
    }));

    const sets = detectSets(parcels);

    const totalEstimatedValue = pricedParcels.reduce((sum, p) => sum + p.pricing.estimatedValue, 0);

    res.json({
      address,
      totalParcels: count,
      fetchedParcels: parcels.length,
      parcels: pricedParcels,
      sets,
      totalEstimatedValue: Math.round(totalEstimatedValue * 1000) / 1000,
      floor: FLOOR_PRICE_ETH,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /floor
app.get('/floor', (req, res) => {
  res.json({ floor: FLOOR_PRICE_ETH });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Terraform Estimator API on port ${PORT}`));
