# [terraform estimator]

Price estimator for Terraforms by Mathcastles parcels.

## Architecture

- **Frontend**: Next.js 14, deployed to Vercel
- **Backend**: Node.js/Express API, deployed to Railway or Render
- **On-chain**: Reads zone/biome traits directly from Terraforms contract via Ethereum RPC

## Pricing Formula

```
Estimated Value = Floor Price × (zone_multiple + biome_multiple) / 2
```

Categories and multipliers:
- **Grail**: 4–6x (rarest zones/biomes)
- **Rare**: 2x
- **Premium**: 1.5x
- **Premium Floor**: 1.1x
- **Floor**: 1x

## Local Development

### Backend

```bash
cd backend
npm install
# Edit .env — set RPC_URL to your preferred Ethereum RPC endpoint
# Free options: https://eth.llamarpc.com, https://cloudflare-eth.com
npm run dev
```

### Frontend

```bash
cd frontend
npm install
# Edit .env.local if your backend is not on localhost:3001
npm run dev
```

Visit http://localhost:3000

## Deployment

### Backend → Railway

1. Create new Railway project
2. Connect your GitHub repo
3. Set root directory to `/backend`
4. Add env vars: `RPC_URL` (use Alchemy/Infura for production), `PORT=3001`
5. Deploy

### Frontend → Vercel

1. Import repo to Vercel
2. Set root directory to `/frontend`
3. Add env var: `NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app`
4. Deploy

## Updating the Floor Price

In `backend/src/pricingModel.js`, update line 4:

```js
const FLOOR_PRICE_ETH = 0.2; // Update this as market moves
```

## Updating the Model

All zone and biome multipliers are in `backend/src/pricingModel.js` in the `ZONE_MULTIPLES` and `BIOME_MULTIPLES` objects.

## RPC Endpoints (free)

- https://eth.llamarpc.com
- https://cloudflare-eth.com
- https://rpc.ankr.com/eth
- For production, use Alchemy or Infura for reliability
