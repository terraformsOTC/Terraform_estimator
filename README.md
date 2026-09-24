# [terraform estimator]

Price estimator for Terraforms by Mathcastles parcels — [terraformestimator.xyz](https://terraformestimator.xyz).

## Architecture

- **Frontend** — Next.js 15, deployed to Vercel (`frontend/`).
- **Backend** — Node/Express API, deployed to Render (`backend/`).
- **Pricing** — a hedonic model fitted to ~20,000 settled sales (`backend/src/hedonicModel.js`,
  coefficients in `backend/src/pricing-v2-coeffs.json`), scaled by the live collection floor. Each
  parcel gets a range: what it would clear at taking a bid, and at a listing that gets bought.
  Rare specials (Godmode, Plague, seeds, Lith0) fall back to the hand-tuned v1 model, which is also
  served on the unlinked `/legacy` page.
- **Refit** — nightly at 04:20 on the maintainer's machine (`ops/daily-refit.sh`): pull new sales,
  refit, re-calibrate against the last 30 days of sales, verify, test, commit, push. The sales
  database never leaves that machine; the pipeline scripts are in `sales database/`.
- **On-chain** — traits and artwork come straight from the Terraforms contract over Ethereum RPC.

## Local development

```bash
cd backend && npm install
# backend/.env: RPC_URL, ALCHEMY_API_KEY (live floor), OPENSEA_API_KEY (listings and sales feeds)
npm run dev          # :3001

cd frontend && npm install
# frontend/.env.local: NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev          # :3000
```

`https://ethereum.publicnode.com` works as an RPC. `eth.llamarpc.com` returns null and
`cloudflare-eth.com` fails network detection — don't use either.

Tests: `npm test` in `backend/` (sales comparison rules and model invariants) and in `frontend/`.

## Deployment

Pushing to `main` redeploys both: Render builds the backend, Vercel the frontend. The pre-push
hook appends a live floor sample and commits it, then asks for the push to be run again.

## Maintaining the model

See `CLAUDE.md` for the moving parts and `sales database/fit_hedonic.py` for how the fit is chosen
(its header records the backtest behind the current half-life and regularisation).
