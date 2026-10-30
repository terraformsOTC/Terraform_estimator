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
- `server.js` — Express API. Reads Terraforms contract via Ethereum RPC (15s timeout). Rate limits: 200 req/min standard, 20 req/min wallet. CORS allows hardcoded prod origins + `ALLOWED_ORIGINS` env var.
- `parcelStore.js` — every minted parcel's tokenURI document (name, attributes, gzipped SVG; ~65MB retained, ~95MB RSS, measured) in memory, so `/image`, `/estimate`, `/wallet` and the feeds make no per-request RPC call (the old 500-entry LRU let a walk over the collection turn every request into a publicnode read). Warmed at boot (~17 min) and daily; an event poller re-reads a parcel within a minute of `Daydreaming`/`Terraformed`/antenna events and drops its cached owner on `Transfer`. **tokenURI is not immutable** — those events redraw the image — so `/image` and `/img` cache for an hour with stale-while-revalidate, never `immutable`.
- `parcel-constants.json` — `{id: [seed, x, y]}` for all 9911, fixed at mint. Baked by `scripts/bake-parcel-constants.js` (resumable); spares `/estimate` a tokenHTML read and a tokenSupplementalData call.
- **Collection helper** (`/helper` on the site; `GET /collection`, `/collection/catalog`, `/linked-wallets/:address`) — for a group of up to 10 wallets: which goals are met, what's missing, what's listed that fills each gap, which sets the group completes (`setsCompleted`, `detectSets`), and a shopping list (greedy set cover: cheapest listing per newly filled goal, with budget / max price / max % over model). `modes=Terrain,…` scopes everything to those modes (held, listed, supply; targets no parcel in them meets are left out, `nonexistent`). `view=wishlist` returns only `wishlist` — every listing that fills an unmet goal, with the goals and their groups — for the listings page; `wprem` limits it by price vs model as `prem` does the shopping list (negative = at least that far under), and the full view returns its size as `wishlistCount`. With `holders=<wallets>` it also returns `held`: the parcels those wallets hold that fill one, listed or not, for the wallet page (holders in the group are skipped). Answered from memory, no per-request RPC:
  - `collectionHelper.js` — pure: goals (the 10 `SETS` with `detectSets`' exact rules, the `/traits` special and visual traits plus Synchro (visual) — all as `specials`, or picked one at a time as `trait:<id>` into the same group; Penthouse, Basement and Biome 0 left that list 2026-10-21 for the level and biome menus, and old `trait:penthouse`/`basement`/`biome0` goals map to `level:20`/`level:1`/`biome:0` (`MOVED_GOALS`) — zones, biomes, chromas and levels picked one by one (`zone:Holo`, `biome:30`, `chroma:Pulse`, `level:20` — each kind one group), blades (`blades` / `blade:<0-26>`) and origin glyph sets (`glyphs` / `glyph:<0-27>`) picked like the specials; "Every chroma", "Every mode" and the custom `{each, where}` goal builder were retired 2026-10-21 — saved setups naming `chroma`/`mode` are skipped, not refused), coverage, shopping list. Blade = (biome + seed) % 27 on non-origin parcels with seed ≤ 9950 (latent on Terrain); glyph set = seed % 28 on origins with seed ≤ 9000 (above: X-seed, none) — mirrors `frontend/src/lib/parcelGlyphs.js`; seeds come from `parcel-constants.json` via `currentTraitsOf`. Tested against `detectSets` in `test/collectionHelper.test.js`. `/collection/catalog` also carries `supply`, parcels per zone/biome/level/blade/glyph set by mode, for the page's counts. `/collection*` and `/linked-wallets` share a 60/min limit (the helper re-asks after each edit).
  - `ownerIndex.js` — who holds every parcel: one Alchemy `getOwnersForContract` (same call as `/collectors`) at boot and every 30 min, moved on each Transfer by the parcel event poller.
  - `linkedWallets.js` — wallet suggestions: delegate.xyz **v1 and v2** (most Terraforms holders who delegate use v1) and Safes (owners via `getOwners`; Safes an owner co-owns via `api.safe.global/tx-service`, no key). Suggestions only — anyone can delegate to anyone.
  - `traitTypes.js` — the `/traits` catalogue and `matchesTrait`, shared by `/traits` and the helper.
  - Phase 2 (alerts: Telegram + email when a wanted parcel lists) is not built; hosting is undecided (not the Mac mini, which stays off the public web).
- `hedonicModel.js` — **the pricing model**: fitted multiples from `pricing-v2-coeffs.json` (built by `sales database/fit_hedonic.py`, refit daily by `ops/daily-refit.sh`) × live floor × `floor_calibration`. Returns a bid–ask range. **2.3.0 (James, 2026-10-20), approved trait by trait:** the traits in `SALES_ANCHORED` (level 20, Dread, biome 39; then First Earth, Avidana, biome 17 and the Biome 0 Flow badge in 2.3.1) take their prior from their own sales — the recency-weighted median of what each sale implies (`SALES_ANCHORED` / `sales_anchors` in fit_hedonic.py; weight n/(n+120) stays on the ridge fit) — while every other trait still shrinks toward v1 until reviewed (the full sales-anchored version moved 1,035 parcels >20%, many down; James kept X-Seed, Godmode, Aetherking and biomes 76/79 as they were). **2.3.2 (James, 2026-10-21):** level 20 takes its sales anchor outright (`SALES_ONLY`: no share on the ridge fit, 90-day half-life, so the two May 2026 sales set it), and level-20 sales above 40x the floor count (`UNCAPPED_LEVELS`). **2.3.3 (James, 2026-10-21, from the rare-trait check):** biomes 74, 77, 78 and 81 set outright to what their two latest sales say (`FIXED_PREMIUMS`: 11.9x, 6.38x, 5.60x, 5.44x), Plague's floor multiple set to 72.7x in line with its sales (`FIXED_SPECIAL_MULTIPLES`), and sales he knows were anomalous (bids accepted far under value) listed in `sales database/excluded-sales.json`, which the fit, the floor index, the calibration and verify-model all skip (`own-price.js` / `EXCLUDED_SALES`); they stay on /sales. **No visual trait carries a premium** (James, 2026-10-21): Mesa, gm, Matrix, Heartbeat, Synchro and Lith0-like are tags on the site only, their parcels valued as plain parcels of their zone, biome and chroma — the fit's `badges()` and `badgeFlags` in hedonicModel.js price only Biome 0 Flow (a biome-and-chroma effect). Tier-2: Lith0, Plague and Godmode are one floor multiple each from their own sales (`special_multiples`; the type sets the value, as in v1; Godmode set to 60x the floor on the ask side — `FIXED_SPECIAL_MULTIPLES` takes (side, multiple) — James, 2026-10-23, so the site reads 13–14 ETH: the multiple applies to the *calibrated* floor, so the earlier 45x showed ~10.1 ETH. Its last two sales: #83 at 14 ETH (Oct 2025) and #1955's June 2026 deal, 11 ETH through Blur plus #2451, a Blossom biome-0 parcel, transferred separately two minutes later), X-Seed keeps v1's price, and Y-Seeds are valued as X-Seeds. **Each sale is read in the mode the parcel was in when it sold** (2026-10-21): `sales database/build_dream_history.js` reads every parcel's first `Daydreaming`/`Terraformed` event from the chain into `parcel_dreams` (Pocket RPC — publicnode refuses historical getLogs; it checks itself against the snapshot and writes nothing on a gap), `views.sql` (tracked) gives `v_model_sales.mode` the mode at the sale (Terrain is one-way: Terrain before the first event, dreamed after), and daily-refit step 3c keeps it current. Before, a parcel daydreamed after a sale counted as a Daydream sale at a Terrain price. Spine adds nothing on level 20 — penthouse is the premium there (fit and serving), which also takes the level-20 sales out of the Spine fit (Spine elsewhere 1.24x → 1.08x). **Every parcel bought at its own listed price is in**, sweeps included (James, 2026-10-21: real data however the transaction was structured, even where it costs some backtest accuracy): `SWEEP_MODEL='pool'` in the fit, and `sales database/own-price.js` gives `calibrate-floor.js` and `ops/verify-model.js` the same rule — a multi-parcel leg counts unless one seller repeats one price at ≥1.5x the floor (a bundle order's total, ~219 legs). The floor index (`build_floor_index.js`) reads them too (2026-10-21): built from single sales first, then rebuilt with the own-price sweep legs that index admits (SWEEPS=0 for singles only).
- `sales database/backtest_hedonic.py` — **how the fit's settings are chosen** (rebuilt 2026-10-21; the September harness was lost): refit every 14 days over two years using `fit_hedonic.fit_multipliers` (exactly the production fit), level re-solved daily on 30 days of singles as production does, single-sale MdAPE per year, paired bootstrap over two-week windows. With every purchase in, nothing beat half-life 180 / alpha 3 beyond noise (2026-10-21); two-parcel carts only would score 0.3pp better on single sales, and James chose all purchases. Rare-trait anchors have their own recency (`ANCHOR_HALF_LIFE_D`, 180). Never pick settings from `fit_hedonic.py`'s holdout_eval.
- `pricingModel.js` — v1 hand-tuned model. Only served on `/legacy` (unchanged, so old quotes reproduce); its multipliers are the fit's priors (`build_priors.js`) for every trait not in `SALES_ANCHORED`, and the Tier-2 price for X-Seed, Godmode and Y-Seed (priced as an X-Seed). Also holds `SETS` / `detectSets`.
- `snapshotTraits.js` — lookup-derived traits (special tokens, 1of1, Godmode, gm, Lith0-like, S0 window, ??? thresholds). Shared by the API and the offline pricing scripts — change them here only.
- `sales.js` — OpenSea sales feed and the `decideBasis` over/under rule (ask-anchored; see `test/basis.test.js`). The estimate a sale is measured against is the one the site displayed when it sold — `pricingV2.on` with the offer floor, using the bid standing then (`bidAt`, from `floor-history.json`) — so a listing and its sale read the same figure. Sales before bids were recorded (2026-09-23) have no offer floor.
- `salesHistory.js` — every sale since mint for `GET /sales-history` (filters: mode, chroma, level, zone, biome, and sale size `min`/`max` in ETH; paged, newest first, with facet counts and totals). Loads `sales-history.json` + `floor-index.json`, exported nightly from the sales DB by `sales database/export_sales_history.js` (run in `ops/daily-refit.sh`), prices each sale at its day's floor, and merges live OpenSea sales newer than the export.
- **Open data** (`/stats`, bottom; James 2026-10-29, open-source ethos) — `sales database/export_sales_dataset.js` publishes every sale as `frontend/public/data/terraforms-sales-through-<date>.csv.gz` with a `.sha256` (`shasum -a 256 -c` format), `sales-dataset.json` (manifest: the current release + every past release's checksum) and `sales-dataset-README.txt` (columns). Built from `sales-history.json` + `floor-index.json`; whole UTC days up to `--through` (default: end of last month), gzip without a timestamp, so a re-run gives the same bytes and checksum. Monthly from `ops/daily-refit.sh` step 3b' (`--if-due`); only the latest data file is kept in `public/` (the repo history keeps the rest). The page shows the SHA-256, the verify commands, a link to the manifest's commit history on GitHub (a source other than the site), and checks a dropped file in the browser (`crypto.subtle`, nothing uploaded). **Licensing (James, 2026-10-29):** the data is CC0-1.0 (`LICENSE-CC0-1.0.txt` beside it, `license` in the manifest, README, the page, and schema.org Dataset JSON-LD in `app/stats/layout.js`); the code is AGPL-3.0-or-later (root `LICENSE`, `license` in each package.json).
- `trait-tiers.json` — zone/biome badge tiers (Mythical…Floor) from the objective rubric on /glossary: fitted price multiple in the live model + parcel count (scarcity). Committed snapshot, not computed at load, so nightly refits can't flip boundary traits. Regenerate by hand with `node scripts/build-trait-tiers.js` and review the diff. v1's internal tier multipliers (seeds, biome 0 bump) still use v1 price bands.
- `special-tokens.json` — Minted special parcel overrides.
- `minted-traits.json` — Pre-baked attribute-derived traits for all 9911 minted parcels (zone/biome/level/chroma/mode/mysteryValue/antennaOn/antennaFirstTs). Used by `/undervalued` and `/api/weekly-report-data` to skip per-token RPC fetches on cold compute. See "Minted Traits Snapshot" below.
- `floor-history.json` — Time-series of `{ts, floor, bid?}` samples (hourly sampler + pre-push hook). Used by `/sales`, `/sales-history` and `calibrate-floor.js` to anchor estimates to the floor (and the standing bid) at time of sale. See "Floor Price History" below.
- `unminted-parcels.json` — 1193 unminted parcels with all traits and `specialType` field.
- `unminted-animation.json` — Per-parcel animation data (grid, chars, fonts, CSS).
- `unminted-fonts.json` — 94 base64 WOFF2 fonts indexed by `fontIndex`.

### Frontend (`frontend/src/`)
- `app/page.js` — Main UI, client component, handles token IDs 1–11104.
- `app/{stats,sales,listings,collectors}/page.js` — server components (regenerated every 30 min) that fetch the first data through `lib/serverData.js` and hand it to the client page beside them (`StatsPage.js` etc.), so the HTML search engines index holds the content instead of "[loading ...]" (2026-10-30: 1 of 10 sitemap pages was indexed). Any fetch failure falls back to loading in the browser. Numbers on those pages format with a fixed locale (`'en-US'`) so the server HTML and the browser's first render agree; relative times carry `suppressHydrationWarning`.
- `components/HelperView.js` — the `/helper` page: wallets (+ linked-wallet suggestions), goals: mode chips (the scope), then zone / biome / chroma / level chip menus (like the wallet filter's; `FilterChip`), then presets — sets (the heading links to /traits#sets), and under "other" the special and visual traits, blades (drawn in the on-chain font) and origin glyph sets, pickable one by one, the last two with a hover (i) explaining them (`InfoTip`) — shopping-list limits, sets completed, results per goal. The view is mirrored into the URL (shareable); the collector's own setup saves to localStorage (`helper:v1`) as they edit. A link whose view differs from the saved setup opens as a **shared view** that is never saved unless they press `[keep this view as mine]` — so opening someone's link can't change their setup or wishlist.
- `lib/wishlist.js` — the **wishlist** is the saved setup with `wishlist: true` (its modes and wishlist price `wprem` included, and named on the marks line), switched on from the helper with a wallet in the group connected; it follows later edits. `/listings` marks (pink ★, `[★ wishlist only]` toggle) every listing that fills an unmet goal, only while `eth_accounts` reports a wallet in the group (no prompt). On `/listings` (and `/helper`) connecting stays on the page — every other page's [connect] goes to the wallet view — and a connected wallet without a wishlist gets the way in: `[turn on wishlist]` in one click when a helper setup exists (adding the wallet to it if needed), else a link to `/helper?w=<wallet>` to pick goals and add vaults. With no wallet connected and no wishlist on, `/listings` shows nothing of it. The wallet page (`/?address=`, and My Parcels) marks another collector's parcels the same way (pink outline, `[show only these]`); a wallet in the group, or the connected one, reads as the collector's own (`'mine'`) and is left unmarked, so a combined view of theirs + yours marks only theirs. The wishlist line is `components/WishlistLine.js`, shared by both pages. Nothing is stored server-side, so no signature is needed; when Phase 2 stores wishlists on the server for alerts, saving one must require a signed message from a wallet in the group.
- `components/ParcelResult.js` — Minted parcel display (1–9911).
- `components/UnmintedResult.js` — Unminted parcel display (9912–11104).
- `components/TerraformAnimation.js` — On-chain SVG animation renderer. Unminted animations replicate terrafans.xyz: per-parcel WOFF2 fonts, per-parcel CSS (fontSize 9–27px), DIRECTION hardcoded to 0, `String.fromCharCode` (not `fromCodePoint`).
- `components/shared.js` — `BadgeStack`, `SpecialBadge`, `TraitRow`, `API_URL`, `EthIcon`.

### Badge Auto-Detection (BadgeStack)
Applies to both minted and unminted from trait data:
- **Basement** — Level 1
- **Penthouse** — Level 20
- **Biome0** — Biome 0
- **Matrix** — Biome 58 / Intro Forest
- **Heartbeat** — Zone `[BLOOD]` / Chroma Pulse
- **Mesa** — Biome 39 / Terrain / mystery < 30000

### Spine Detection
Manual list only — `special-tokens.json` for minted, `specialType` field in `unminted-parcels.json` for unminted. The `Resource` attribute does **not** contain a Spine value on-chain.

### Seed Extraction (Minted)
The SEED lives in `tokenHTML(uint256)` (not `tokenURI`) — the SVG has no SEED, the HTML does. It never changes after mint, so it is read once by `scripts/bake-parcel-constants.js` into `parcel-constants.json`; a live tokenHTML read is only the fallback for a parcel missing from that file.

### Floor Price History
`backend/src/floor-history.json` is an append-only time-series of `{ts, floor}` samples used by `/sales` to anchor each sale's estimate to the floor in effect at sale time, instead of the current floor (which would otherwise make every past sale look retroactively under/overvalued as the floor moves).

Samples are written three ways, all through `backend/scripts/append-floor-history.js` or its in-memory equivalent:
- **hourly**, by the `com.terraformestimator.floor-sample` launchd agent (`ops/launchd/`). It writes the file and does not commit — the file is normally dirty.
- **before every push**, by `.githooks/pre-push`, which appends a sample, commits the file, and asks you to re-run `git push` (one-time enable: `git config core.hooksPath .githooks`).
- **at runtime**, the API adds every live floor it reads (≥10 min apart) to its in-memory history, so sales since the last deploy resolve to a fresh floor.

Lookups are nearest-prior. Before 2026-09-23 sampling was tied to pushes and has multi-day holes; `calibrate-floor.js` refuses sales whose nearest reading is over 72h old. Sales that predate all history fall back to the current live floor (`floorAtSaleSource: 'current'`).

### Minted Traits Snapshot
`minted-traits.json` is a pre-baked snapshot of attribute-derived traits for all 9911 minted parcels (zone, biome, level, chroma, mode, mysteryValue, antennaOn, antennaFirstTs). It powers `/undervalued` and weekly-report bargains: scoring 200 listings drops from ~25–50s to ~1s on cold compute.

Lookup-derived fields (`specialType`, `isOneOfOne`, `isGodmode`, `isLith0like`, `isGm`, `isS0`) are applied at query time via `snapshotTraits()` in `snapshotTraits.js`, so changes to `special-tokens.json` / `one-of-one-ids.json` / S0 window bounds take effect without re-baking. `isS0` is true when `antennaOn === true` AND `antennaFirstTs` falls inside `[S0_ANTENNA_TS_MIN, S0_ANTENNA_TS_MAX]` (currently the V2 launch window 2023-12-24 → 2024-01-13 UTC). `antennaOn` is `getAntennaStatus(tokenId) == 1` and `antennaFirstTs` is `getFirstAntennaModification(tokenId).timestamp`, both on the Antenna contract `0x331512A28A4cF80221aF949B5d43041fF0FC7f01` — the V2 antenna state lives on a separate contract from the original Terraforms contract. **Not** the tokenURI's `Antenna` attribute: a v1-rendered parcel omits it even with its antenna on, which hid 17 S0 parcels (#1351, #1915, …) until 2026-10-13. The live API (`getParcelTraits`) and the bake (`scripts/trait-record.js`) apply the same rule.

**Refresh cadence**: chroma, mode, level, and mysteryValue can change on-chain when parcels are upgraded/terraformed. Stale traits skew estimates (worst case: a parcel that becomes Plague after the bake won't get the 5x specialType). Re-bake periodically:
```bash
cd backend && npm run bake-traits -- --force   # ~22 min, batches of 8
```
Then commit the updated `minted-traits.json`.

**Nightly cross-check.** Between bakes, `ops/daily-refit.sh` step 1b runs `scripts/crosscheck-indexer.js`: it pulls every parcel from the public terraformexplorer indexer (`terraforms-indexer-production-d72b.up.railway.app/graphql`, run by team-tfx, ~8s), and for each parcel that disagrees with the snapshot re-reads the chain and writes only the chain's answer. The indexer is a redundancy check, never a source: it has been wrong (#7287 Daydream vs chain Terraform). Unreachable, lagging, or disagreeing on >300 parcels → nothing written, refit carries on. `--dry-run` to preview.

**`--force` is required for a refresh.** The plain `npm run bake-traits` is
resumable and only fetches tokenIds that are missing or predate the
`antennaFirstTs` field — so once the file is complete it prints "Nothing to
do" and refreshes nothing. An existing record is exactly what goes stale, so
only `--force` re-reads every token. (Found 2026-08-26: #5299 had been
terraformed but the snapshot still read `Daydream`.) Use the plain form only
to fill gaps after an interrupted bake.

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
3. **Thumbnail weight** — parcel SVGs reach browsers through the edge-cached `/img/:id` proxy
   (`frontend/src/app/img`), and the backend serves them gzipped from memory (`parcelStore.js`).
   Still not done: raster thumbnails — the list view draws a ~30KB 277×400 SVG into a 67×97 box,
   where a 2× WebP is ~2–4KB; then `srcset`/`sizes` so list rows get the small asset and cards
   the large one. (Static pre-baked SVGs were dropped as an idea: tokenURI changes on
   daydream/terraform/antenna, so a bake would go stale.)
