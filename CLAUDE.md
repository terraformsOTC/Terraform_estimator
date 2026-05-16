# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Backend (from /backend) — requires Node 22 for native --env-file support
npm run dev      # nodemon with .env file
npm start        # production

# Frontend (from /frontend)
npm run dev      # next dev on :3000
npm run build    # next build
npm start        # next start
```

Backend: `:3001` | Frontend: `:3000`

## Architecture

**Decoupled Node/Express API + Next.js 14 frontend.**

### Token ID Mapping
- `1–9911` → minted parcels → `/estimate/:id` endpoint
- `9912–11104` → unminted (unmintedId = tokenId − 9911) → `/unminted/search?id=N`
- Unminted IDs `#1–#1193` sorted level ascending (1 = lowest, 1193 = highest)

### Backend (`backend/src/`)
- `server.js` — Express API. Reads Terraforms contract via Ethereum RPC. LRU caches tokenURIs (500 entries, 15s timeout). Rate limits: 200 req/min standard, 20 req/min wallet. CORS allows hardcoded prod origins + `CORS_ORIGIN` env var.
- `pricingModel.js` — All pricing logic. Floor price constant at line 4. Formula: `Floor × (zone_mult + biome_mult) / 2`. Handles Godmode, Plague, X-Seed, Y-Seed, Lith0 special tokens.
- `special-tokens.json` — Minted special parcel overrides.
- `minted-traits.json` — Pre-baked attribute-derived traits for all 9911 minted parcels (zone/biome/level/chroma/mode/mysteryValue/antennaOn/antennaFirstTs). Used by `/undervalued` and `/api/weekly-report-data` to skip per-token RPC fetches on cold compute. See "Minted Traits Snapshot" below.
- `floor-history.json` — Time-series of `{ts, floor}` samples written by `.githooks/pre-push`. Used by `/sales` to anchor estimates to the floor at time of sale. See "Floor Price History" below.
- `unminted-parcels.json` — 1193 unminted parcels with all traits and `specialType` field.
- `unminted-animation.json` — Per-parcel animation data (grid, chars, fonts, CSS).
- `unminted-fonts.json` — 94 base64 WOFF2 fonts indexed by `fontIndex`.

### Frontend (`frontend/src/`)
- `app/page.js` — Main UI, client component, handles token IDs 1–11104.
- `components/ParcelResult.js` — Minted parcel display (1–9911).
- `components/UnmintedResult.js` — Unminted parcel display (9912–11104).
- `components/TerraformAnimation.js` — On-chain SVG animation renderer. Unminted animations replicate terrafans.xyz: per-parcel WOFF2 fonts, per-parcel CSS (fontSize 9–27px), DIRECTION hardcoded to 0, `String.fromCharCode` (not `fromCodePoint`).
- `components/shared.js` — `BadgeStack`, `SpecialBadge`, `TraitRow`, `API_URL`, `EthIcon`.

### Badge Auto-Detection (BadgeStack)
Applies to both minted and unminted from trait data:
- **Basement** — Level 1
- **Penthouse** — Level 20
- **Biome0** — Biome 0
- **BigGrass** — Biome 42
- **LittleGrass** — Biome 65
- **Matrix** — Biome 58 / Intro Forest
- **Heartbeat** — Zone `[BLOOD]` / Chroma Pulse
- **Mesa** — Biome 39 / Terrain / mystery < 30000

### Spine Detection
Manual list only — `special-tokens.json` for minted, `specialType` field in `unminted-parcels.json` for unminted. The `Resource` attribute does **not** contain a Spine value on-chain.

### Seed Extraction (Minted)
Uses `tokenHTML(uint256)` contract call (not `tokenURI`) — the SVG has no SEED, the HTML does. Result is LRU-cached.

### Floor Price History
`backend/src/floor-history.json` is an append-only time-series of `{ts, floor}` samples used by `/sales` to anchor each sale's estimate to the floor in effect at sale time, instead of the current floor (which would otherwise make every past sale look retroactively under/overvalued as the floor moves).

Samples are written by **`.githooks/pre-push`**, which runs `backend/scripts/append-floor-history.js` before any push to main. The hook fetches the live Alchemy floor, appends a sample, creates a follow-up commit, and asks you to re-run `git push` so the new commit ships with the deploy. One-time enable:
```bash
git config core.hooksPath .githooks
```
Sampling cadence equals push cadence — sales between two pushes resolve to the floor at the earlier push (nearest-prior). Sales that predate all history fall back to the current live floor (`floorAtSaleSource: 'current'` on the response).

### Minted Traits Snapshot
`minted-traits.json` is a pre-baked snapshot of attribute-derived traits for all 9911 minted parcels (zone, biome, level, chroma, mode, mysteryValue, antennaOn, antennaFirstTs). It powers `/undervalued` and weekly-report bargains: scoring 200 listings drops from ~25–50s to ~1s on cold compute.

Lookup-derived fields (`specialType`, `isOneOfOne`, `isGodmode`, `isLith0like`, `isGm`, `isS0`) are applied at query time via `getSnapshotTraits` in `server.js`, so changes to `special-tokens.json` / `one-of-one-ids.json` / S0 window bounds take effect without re-baking. `isS0` is true when `antennaOn === true` AND `antennaFirstTs` falls inside `[S0_ANTENNA_TS_MIN, S0_ANTENNA_TS_MAX]` (currently the V2 launch window 2023-12-24 → 2024-01-13 UTC). `antennaFirstTs` is read from `getFirstAntennaModification(tokenId).timestamp` on the Antenna contract `0x331512A28A4cF80221aF949B5d43041fF0FC7f01` — the V2 antenna state lives on a separate contract from the original Terraforms contract.

**Refresh cadence**: chroma, mode, level, and mysteryValue can change on-chain when parcels are upgraded/terraformed. Stale traits skew estimates (worst case: a parcel that becomes Plague after the bake won't get the 5x specialType). Re-bake periodically:
```bash
cd backend && npm run bake-traits   # ~22 min, resumable, batches of 8
```
Then commit the updated `minted-traits.json`.

## On-Chain Trait Attributes

Trait `trait_type` strings are capitalized single words: `"Biome"`, `"Chroma"`, `"Mode"`, `"Zone"`, `"Level"`, `"Version"`, `"Antenna"`. Zone and Level are read from tokenURI JSON attributes — **do not use `tokenSupplementalData`** (broken ABI, struct layout mismatch, removed from ABI).

**Working RPC:** `ethereum.publicnode.com` ✓
**Broken:** `llamarpc.com` (returns null), `cloudflare-eth.com` (network detection fails)

## Environment

**Backend `.env`:**
```
RPC_URL=https://ethereum.publicnode.com
PORT=3001
```

**Frontend `.env.local`:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Deployment

- Frontend → Vercel (`@vercel/analytics` included)
- Backend → Render
- Terraforms contract: `0x4E1f41613c9084FdB9E34E11fAE9412427480e56`
- Repo: `github.com/terraformsOTC/Terraform_estimator`

## Known Pending Issues

1. **X/Y coords** — unminted shows `X3/Y4` in subtitle, minted does not — should be consistent.
2. **1-of-1 unminted** — handle separately, not yet done.
