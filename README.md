# [terraform estimator]

Price estimator for Terraforms by Mathcastles parcels.

## Architecture

- **Frontend**: Next.js 14, deployed to Vercel
- **Backend**: Node.js/Express API, deployed to Railway or Render
- **On-chain**: Reads zone/biome traits directly from Terraforms contract via Ethereum RPC

## Pricing

Estimates track the live collection floor and scale with the rarity of each parcel's traits — the scarcer its zone and biome, the higher the estimate. Parcels fall into rarity tiers ranging from everyday floor parcels up to the rarest grails, with special types (1-of-1s, seeds, and other rare parcels) valued separately.

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

## Maintaining the Model

All pricing logic and configuration live in `backend/src/pricingModel.js`.

## RPC Endpoints (free)

- https://eth.llamarpc.com
- https://cloudflare-eth.com
- https://rpc.ankr.com/eth
- For production, use Alchemy or Infura for reliability
