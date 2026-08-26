# Terraforms Estimator — Pricing Model v2 (Hedonic) — Design Plan

**Status:** planning only. Nothing here is wired into the app yet.
**Date:** 2026-05-29 (rev. 2, after James's feedback)
**Source framework:** James (LLM-assisted draft), reviewed/cross-checked against the live glossary, `pricingModel.js`, and on-chain trait counts.
**Raw source inputs** (unedited draft + d347h infra conversation): see `pricing-v2-source-draft.md`.

---

## 0. TL;DR

1. **The two frameworks in your draft are the same model.** A log-linear hedonic
   regression `ln(P) = α + Σβ·traits` is *mathematically identical* to the
   "floor-multiple" model `P = Floor × Π(multipliers)` once you exponentiate:
   `e^β` **is** the multiplier. Regression doesn't replace our multiplicative
   model — it **fits the multipliers we currently hand-tune** and gives us
   confidence intervals. That is the whole prize of v2.

2. **Anchor to the floor, in log space.** Don't model `ln(P)`. Model
   `ln(P / floor_at_sale)`. This makes the fitted `e^β` *exactly* the
   floor-multipliers the app already ships, and strips out the market-trend
   confound so coefficients stay stable as the floor moves. (Your draft omitted
   any time/floor term — this was its biggest gap.)

3. **Weight recent sales more.** Apply an exponential **time-decay weight** to
   each sale so recent trades dominate the fit (§9). This is what keeps the
   model tracking current taste rather than 2022's.

4. **Two tiers, not one regression.** Structural traits (zone, biome, chroma,
   mode, level) have thousands of examples and *can* be fit. The truly rare
   "mythic" specials cannot: **Plague = 7 tokens, Godmode = 3** in the entire
   collection — a handful of sales at most. Keep those as a separate
   **override/premium tier** with v1-as-prior + explicit uncertainty.

5. **The data problem is much smaller than it first looked.** Of every Terraforms
   trait, **only `mode` is mutable** — and terrain→daydream is a **one-way**
   flip. Biome, zone, chroma, level, and `???` never change. So we do **not**
   need archival state replay. We need (a) the **sales history** and (b) for the
   ~1,743 currently-daydream/terraform parcels, **the timestamp each one left
   terrain**. That's an event lookup, not a full state reconstruction.

---

## 1. What v1 does today (baseline to beat)

`backend/src/pricingModel.js` (internally versioned 2.9.6) is already a
multiplicative floor-multiple model:

```
standard parcel:
  Terrain:  Floor × ((zone_m·0.5  + biome_m·0.5)  + level_m) × chroma × Π(trait premiums)
  Daydream: Floor × ((zone_m·0.85 + biome_m·0.15) + level_m) × chroma × Π(trait premiums)
            (then standard Daydream/Terraform compresses premium-above-floor to 32%)

special parcel (override, ignores structural traits):
  Godmode:  Floor × 60
  Plague:   Floor × 65
  X-Seed:   Floor × 15   × seed_zone_tier   (×0.72 if upgraded to DD/TF)
  Y-Seed:   Floor × 17.5 × seed_zone_tier
  Lith0:    Floor × 18   × [1.2 if Flow] × [1.1 if 1of1]

premiums (multiplied onto standard formula): Spine 1.20, Matrix 1.5, Mesa 1.25,
  gm 1.15, Heartbeat 1.35, 1of1 1.05, S0 1.05, lith0-like 1.8, biome0 zone-tier bump.
  Origin Daydream/Terraform = 3.0× in the standard path (NOT an override).
```

**What's good and should be kept:** the floor-anchored multiplicative form;
override-vs-premium split for specials; curated "look" badges (Mesa, Matrix,
Heartbeat, gm) as explicit interaction features; mode-dependent zone/biome
weighting; daydream/terraform grouping; origin treated structurally (not mythic).

**What v2 changes:** the multipliers stop being hand-set and start being
**fit to time-weighted historical sales with shrinkage**, with measured
uncertainty, validated out-of-sample, and A/B-tested against v1 on the same sales.

---

## 2. Cross-check of your draft against the glossary + on-chain reality

Population counts from `minted-traits.json` (9,911 minted), `special-tokens.json`,
`one-of-one-ids.json`.

### 2.1 Trait spaces — mostly correct

| Draft claim | Verdict | Reality |
|---|---|---|
| Zone examples *Blushing, Eternal September, First Earth, Gaea's Cradle* | ⚠️ half hallucinated | **Blushing ✓, First Earth ✓.** "Eternal September" and "Gaea's Cradle" are **not** Terraforms zones. There are exactly **75 zones**. |
| Biome ∈ {0…91}, 92 classes | ✅ | All 92 present; min occupancy 5, median 102, max 268. 7 biomes have <20 minted. |
| Chroma {Flow, Hyper, Pulse, Plague} | ✅ but | Flow 5970 / Pulse 2915 / Hyper 1019 / **Plague 7**. Plague is *both* a chroma value and a mythic override — pull it out of the chroma factor (§4.7). |
| Mode = 5 independent categories | ⚠️ refine | Terrain 8001 / Daydream 1316 / Terraform 427 / Origin Daydream 156 / Origin Terraform 11. **Origin DD and Origin TF are interchangeable** (reversible) → treat as **one class, ~167 parcels — NOT rare** like Plague/Godmode. Likewise standard Daydream↔Terraform are one group. Fit **3 mode groups**, not 5 dummies. |
| Level 1–20, nonlinear > linear | ✅ | Premium lives only at the extremes. L1 & L20 rarest (13 each); L2/L3/L18/L19 ≈ 53–59; interior floors number in the hundreds–thousands. |

### 2.2 Special traits — definitions correct, **magnitudes wrong**

This is the section you flagged. Definitions match the glossary almost exactly.
The **example multipliers in your draft are off**, sometimes badly:

| Special | Draft definition | Glossary/contract | Draft mult | Live v1 | Population | Note |
|---|---|---|---|---|---|---|
| **godmode** | seed 9970–9999, Origin DD, full charset | ✅ exact | 12× | **60×** | 3 tokens | Stale `45x` comment in `server.js:209` vs `60x` in code — fix in v2. Truly mythic → override + prior. |
| **plague** | rarest chroma | ✅ | 3× | **65×** | **7 tokens** | Can't be regression-fit. Override + prior only. |
| **x-seed** | ODD seed>9000 OR Terrain seed>9970 | ✅ exact | — | 15× base | 48 | Override + seed_zone_tier. |
| **y-seed** | seed 9950–9970 | ✅ (">9950 ≤9970") | — | 17.5× base | **17** | ⚠️ Draft calls Y "intermediate", but Y is **scarcer** than X (17 vs 48) and v1 prices it *higher*. Resolve empirically. |
| **lith0** | biome0 + duotone + non-alternating | ✅ | — | 18× | 13 | Override + Flow/1of1 bonus. |
| **spine** | 4 parcels per level | ✅ | 1.8× | 1.20× | 68 minted (80 total) | Premium multiplier. |
| **1 of 1** | unique zone+biome | ✅ | **4×** | **1.05×** | **1,034 = 10.4%** | ⚠️ **Biggest error.** 1of1 is *common* here. 4× is wildly too high; ~1.05× is right. |
| **s0** | Dec 24 2023 → Jan 13 2024 antenna | ✅ exact | — | 1.05× | **1,401 = 14%** | Common → keep small/speculative. |
| **origin mint** | 2021 contributor allocation | ✅ | 2.5× | 3.0× (structural) | ~167 (DD+TF) | **NOT a mythic override.** Structural mode feature (Tier-1), interchangeable DD/TF, moderate premium. |

**Takeaway:** trust your draft's *definitions*; discard its *example multiplier
table*. Those numbers were illustrative and contradict both the live model and
the rarity data.

### 2.3 Things your draft was missing / got wrong on mechanics

- **Floor / time anchor (missing).** Model `ln(P / floor_at_sale)`, not `ln(P)` (§5).
- **Recency (missing).** Time-decay weights so recent sales dominate (§9).
- **Trait mutability (overstated).** Only **`mode`** is mutable, and
  terrain→daydream is **one-way**. Biome, zone, chroma, `???`, level are
  **immutable** — today's snapshot is valid for all of their history. We still
  need traits-as-of-sale, but *only because of mode* (§7).
- **The `???` (mystery) value (missing).** Gates Mesa (B39 + Terrain + ??? <30k)
  and gm; flags low/high "water level". Immutable.
- **Curated "look" badges as interactions.** Your generic `B×L`, `C×M` crosses
  are the wrong shape (92×20 empty cells). The interactions that matter are
  *named*: Mesa, Matrix, Heartbeat, gm, biome0×chroma. Each = one binary feature (§4.6).
- **Prestige layer (cut).** The "famous owner / meme / lore" S-layer was an LLM
  addition, not wanted. v2 is **purely trait-driven** — no per-token prestige
  term (§6).

---

## 3. The core identity (why this is low-risk)

```
ln(P_i / floor_ti) = β0 + Σβ·traits_i + ε_i
        ⇕  exponentiate
P_i = floor_ti × e^β0 × Π_k e^(β_k · trait_ik)
                   └──┬──┘   └──────┬───────┘
              baseline mult    per-trait multipliers  ← what the app ships
```

v2 production code is **the same `floor × Π(multipliers)` evaluation we have now**
— a pure-JS lookup, no Python in the request path. The only change is that
`ZONE_MULTIPLES`, `BIOME_MULTIPLES`, etc. become a fitted `pricing-v2-coeffs.json`
instead of hand-typed constants. Deployment topology (Render/Vercel) unchanged.

---

## 4. v2 model architecture

### 4.1 Target
`y_i = ln(saleprice_i / floor_at_sale_i)` — the **log floor-multiple**.

### 4.2 Estimating equation (Tier-1 structural)

```
y_i = β0
    + f_zone(zone_i)            # partial-pooled by desirability tier
    + f_biome(biome_i)          # partial-pooled by tier / biome family
    + β_chroma[chroma_i]        # Flow / Pulse / Hyper   (Plague excluded → Tier-2)
    + g_mode(mode_i)            # 3 groups: Terrain | DD≈TF | OriginDD≈OriginTF
    + h_level(level_i)          # extreme-floor indicators + flat interior
    + Σ_b β_badge,b · 1[badge_b]# mesa, matrix, heartbeat, gm, biome0×chroma, lith0-like
    + ε_i
```

Each sale enters the weighted fit with weight `w_i` (§9). **No per-token term.**

### 4.3 Zone & biome — partial pooling (the key statistical move)
75 zones + 92 biomes = 167 categories, many with few *sales*. Free OLS dummies
overfit. Use **hierarchical / partial-pooling** (random effects):

```
β_zone[z]  ~ Normal(μ_tier(z),  σ_zone)
β_biome[b] ~ Normal(μ_tier(b),  σ_biome)
```

Rarely-sold categories shrink to their **tier mean** (Mythical/Rare/Premium/
Uncommon/Floor tiers already exist); often-sold ones deviate. This solves the
dimensionality problem in your draft. (Frequentist equivalent: grouped ridge.
Bayesian via `bambi`/PyMC gives CIs.) Optionally pool biomes by **family** too
(chess 85/39/26/27/38, binary 54/58/89, blocky 0–16, grass 42/65) — families
already live in `SETS`.

### 4.4 Mode — three groups, reversibility-aware
`{Terrain}`, `{Daydream, Terraform}`, `{Origin Daydream, Origin Terraform}`.
Origin DD/TF are interchangeable and moderately premium (not rare) — a normal
Tier-1 coefficient with ~167 parcels behind it. Matches glossary convention and
v1's structural treatment of origin.

### 4.5 Level — extreme-floor indicators, not 20 dummies
Premium concentrated at L1–L3 and L18–L20. Encode six indicators
`1[L=1] … 1[L=20]` (or a smooth basis on `|L − 10.5|` to test monotonicity),
interior floors pooled flat.

### 4.6 Curated "look" badges — single binary features
One coefficient each: `mesa` (B39 ∧ Terrain ∧ ??? <30k), `matrix` (B58 ∧ Intro
Forest ∧ Terrain), `heartbeat` ([BLOOD] ∧ Pulse ∧ Terrain), `gm` (B71 ∧ Terrain
∧ low ???), `biome0 × chroma` (Flow bump), `lith0-like`. Replaces blind crosses.

### 4.7 Tier-2 — rare "mythic" specials (override / premium)
Estimated separately with **v1-as-prior**, each reported with sale count + CI.
Two sub-forms (as v1):
- **Override specials** (special dominates the whole look → zero structural
  terms): Plague, Godmode, X-Seed, Y-Seed, Lith0.
  `P = floor × M_special × (seed_zone_tier for seeds)`.
- **Premium specials** (coexist with normal aesthetics → multiply on top):
  Spine, 1of1, S0. `× e^(β_premium)`.

Where sale count is too thin to identify `M_special`, fall back to the v1 value
as prior mean and widen the interval. Resolve **Y-Seed vs X-Seed** with whatever
sales exist + rarity prior (Y scarcer ⇒ Y ≥ X base is plausible).

---

## 5. The floor / time anchor (do not skip)

Use `floor_at_sale` as a fixed **offset** (coefficient = 1) ⇔ modeling the log
floor-multiple ⇔ fitted `e^β` are shippable as-is. **Diagnostic:** also fit
`ln(floor_t)` as a *free* regressor — if its coefficient ≈ 1, proportional-to-
floor holds; if it deviates, premiums compress/expand with the market and we've
learned something. (This is separate from §9 recency weighting: the offset
removes the market *level*; the weights handle premium-structure *drift*.)

---

## 6. No prestige layer — v2 is purely trait-driven

The "famous owner / meme / lore / iconic" S-layer was an LLM suggestion and is
**cut**. There is no per-token prestige/random-intercept term in the shipped
estimate — every prediction comes from a parcel's traits, which also means the
model generalises cleanly to never-sold and unminted parcels. Repeat sales are
handled honestly in the *fit* (time-decay weights §9 + cluster-robust SEs by
tokenId for correct inference), not by giving specific tokens a bespoke premium.

---

## 7. Trait mutability — narrowed to `mode` only

Per your correction:
- **Immutable** (today's snapshot valid for all history): zone, level, x/y,
  **biome, chroma, `???`**.
- **Mutable:** `mode` only — and **terrain → daydream is one-way** (irreversible).
  Within daydream, daydream↔terraform toggles, but we group those, so they don't
  matter.

This collapses "historical traits" to a single question per parcel: **what was
its mode at the sale block?** Resolved with no archival state:

```
mode_at_sale(token, t_sale):
  if token is Origin (current mode ∈ {Origin Daydream, Origin Terraform}):
      → "OriginDD≈OriginTF" group   (minted in daydream; always origin)
  elif current mode == Terrain:
      → "Terrain"                    (one-way ⇒ never been anything else)
  else:  # current mode ∈ {Daydream, Terraform}, non-origin
      → "Terrain" if t_sale < firstDaydreamTs[token] else "DD≈TF"
```

So the **only** historical datum we must fetch is `firstDaydreamTs` — the
timestamp each currently-daydream/terraform, non-origin parcel first left
terrain. That's ~**1,743 parcels**, one timestamp each (1316 Daydream + 427
Terraform, minus any origin). Everything else comes from the existing snapshot.

**Implication:** an **archival node is not required.** We need an *event* (the
status-change / first-daydream transition), not historical *state*. That's
available from an indexer (ArtGod) or an `eth_getLogs` scan on an ordinary full
node.

---

## 8. Data requirements

### 8.1 Dependent variable — historical sales
Fields: `tokenId, price, currency, timestamp (block# a bonus), marketplace,
buyer, seller`. ETH-normalized (WETH 1:1; convert/exclude others).

Sources, now that **Reservoir has shut down**:
- **Alchemy `getNFTSales`** (we already hold `ALCHEMY_API_KEY`) — marketplace
  sales for the contract, paginated via `pageKey`, with price + marketplace.
  **Runnable today**; good for the Phase-0 count and a first dataset.
- **Dune `nft.trades`** — free SQL, all-marketplace coverage back to mint; best
  for a quick exact count + price distribution (needs a free Dune account).
- **ArtGod indexer** (d347h) — the eventual canonical source; his 2nd message
  confirms it already *produces* sales data.
- OpenSea events (what `sales.js` uses) — too shallow/rate-limited for full
  history; keep for the live feed.

**Filtering (critical — Terraforms has wash-trade history):** drop 0-value /
self-transfers, bundle-split rows, mints, and contemporaneous-floor outliers
(`price > N× floor` or `< floor/N`). Robust loss (Huber/quantile) or trim
`|resid| > 3·MAD`. Cluster SEs by tokenId.

### 8.2 Independent variables — traits-as-of-sale
Immutable traits ← existing snapshot. Mode ← snapshot + `firstDaydreamTs` per the
~1,743 parcels in §7. Source for `firstDaydreamTs`: ArtGod status/transition feed,
or an `eth_getLogs` scan of the contract's status-change event.

### 8.3 The floor series (deflator) — **our biggest current gap**
`floor-history.json` holds **48 samples over ~3 weeks** (May 2026). Useless for a
multi-year backtest. Need a floor (or robust price index) across the whole sales
window:
- Daily floor proxy from Alchemy historical floor, or derive endogenously
  (rolling 7-day 10th-percentile sale price), or a repeat-sales price index
  (Phase 2).

### 8.4 ETH/USD (optional)
Largely absorbed by the floor-multiple target; pull daily only if residuals show
USD-denominated behaviour.

---

## 9. Estimation, recency weighting, validation, A/B

**Recency weighting (your request).** Each sale enters the fit with
`w_i = 2^(−Δt_i / H)`, `Δt_i = now − sale_time`, half-life `H` tuned by CV
(start ~120 days). Recent sales dominate; ancient sales fade but aren't dropped.
**Tier-dependent half-life:** short `H` for data-rich Tier-1; long (or `H→∞`,
i.e. unweighted) for thin Tier-2 specials, where we can't afford to discount old
trades. Combine with periodic rolling refits.

1. **Assemble** one row per clean sale → Parquet/SQLite (app has no DB; offline
   table is fine).
2. **Fit** (offline Python): Bayesian hierarchical (`bambi`/PyMC) for Tier-1
   pooling + CIs, or weighted penalized GLM as a faster first cut. Tier-2 fit
   separately with v1-as-prior.
3. **Validate — time split:** train on sales ≤ T, test on the most recent ~20%.
   Report median |error| and interval calibration in floor-multiple space.
4. **A/B vs v1 for free:** `sales.js` already computes `signedError` per sale vs
   v1 — run v2 through the same path and compare on identical held-out sales.
5. **Stability:** rolling-window refits; watch coefficient drift.
6. **Ship:** export `pricing-v2-coeffs.json`; `estimatePrice` becomes
   `floor × exp(Σβ) × special handling`; bump `PRICING_MODEL_VERSION`.

---

## 10. Phased roadmap (with a triage gate)

- **Phase 0 — Data-size triage (do first).** Pull the **count** of clean ETH/WETH
  single-token sales. Source now that Reservoir is gone: **Alchemy `getNFTSales`**
  (we have the key — scriptable today) or **Dune `nft.trades`** (one query).
  Gate:
  - `< ~1,500` clean sales → Tier-1-only, heavy pooling, specials fully
    expert-set (v1 values).
  - `~1,500–4,000` → full Tier-1 hierarchical model; specials = prior + thin data.
  - `> ~4,000` → interaction tests, finer pooling.
  - *Prior:* recent volume ≈ 47 sales/week (2026-05-25). Expect **~2–6k clean**
    after filtering.
- **Phase 1 — Plumbing.** Sales pull (Alchemy/Dune → ArtGod when ready);
  `firstDaydreamTs` for the ~1,743 parcels (ArtGod feed or `eth_getLogs`); floor
  series (§8.3).
- **Phase 2 — Fit + validate Tier-1**, A/B vs v1.
- **Phase 3 — Tier-2 specials** with priors; reconcile Y/X.
- **Phase 4 — Optional** floor-elasticity diagnostic, rolling refit cadence.
- **Phase 5 — Export coeffs**, wire into `pricingModel.js`, ship behind a version
  bump; keep v1 for comparison.

---

## 11. Questions / asks for d347h

(See the ready-to-send message in Appendix A.) Core asks:
1. **Sales history** via ArtGod — fields, history depth (to mint?), access shape
   (REST/GraphQL), secret-key auth, rate limits.
2. **Parcel mode/status history** — can we get each token's terrain→daydream
   transition timestamp (or query "status of token N over time")? Flag if the
   only persisted status event is the Terraformed/commit (canvas) event — a
   parcel can sit in daydream without ever committing a terraform, so we need the
   *status flip*, not just commits.
3. **(Minor)** Is the node archival? We think we *don't* need it (only mode is
   mutable and we get that from events) — asking only for occasional spot-checks.
4. Latency: irrelevant to us (offline backtest).

---

## 12. Open risks

- **Sales volume may be thin for the full model** → mitigated by the Phase-0 gate
  + pooling; worst case v2 = recalibrated Tier-1 + expert specials (still > v1).
- **Wash trading** distorts the target → filtering + robust loss + token clustering.
- **Floor-series reconstruction** (§8.3) is a mini-project on the critical path.
- **`firstDaydreamTs` source** — if no clean status event exists, fall back to an
  `eth_getLogs` scan or (last resort) archival spot-checks for the affected subset.
- **Recency weighting × thin specials** → tier-dependent half-life (§9).

---

## 13. One-paragraph recommendation

Adopt the hedonic model **as a fitting procedure for the multipliers we already
ship**, targeting `ln(price / floor_at_sale)` with **time-decay weights** so the
fitted `e^β` drop straight into `pricingModel.js` and track recent taste. Fit
structural traits (zone, biome, chroma, 3-group mode, level) with **partial
pooling**; keep the rare mythic specials (Plague, Godmode, seeds, Lith0) in a
separate **override/premium tier with v1-as-prior**; encode the named "look"
interactions as single binary features; and treat **origin DD/TF as one ordinary
structural mode group, not a mythic override**. No prestige layer — the model is
purely trait-driven. The build is far lighter than first thought: because **only
`mode` is mutable and terrain→daydream is one-way**, we need just the sales
history plus a single transition timestamp for ~1,743 parcels — **no archival
node**. Immediate next step: a Phase-0 sale count via Alchemy `getNFTSales` (we
hold the key) or Dune, to size the model before building.

---

## Appendix A — Message to send d347h

> Hey! Thanks again for digging into this, and for the ArtGod / Explorer / roll-
> your-own rundown. I scoped what I actually need and it's narrower than I first
> thought, so hopefully this is easy.
>
> Context: I'm building a v2 pricing model for the estimator that *fits* trait
> premiums from historical sales instead of my hand-tuned multipliers. For that I
> need two things: the sales, and each parcel's **mode** at the time of each sale.
>
> The nice simplification: of all the Terraforms traits, only **mode** is mutable
> (terrain → daydream/terraform). Biome, zone, chroma, level and ??? never change.
> And terrain→daydream is one-way. So I do **not** need full archival state
> replay — I just need to know, per parcel, *when* it first left terrain.
>
> So, concretely:
>
> **1. Sales history** — every Terraforms secondary sale (all marketplaces if
> possible) with: tokenId, price, currency (so I can normalise WETH/ETH and
> drop/convert the rest), timestamp (block number a bonus), and ideally
> buyer/seller + marketplace. Back to mint ideally. Does ArtGod already expose
> this? If so — REST or GraphQL? The secret-key auth you mentioned? Any rate
> limits / history depth?
>
> **2. Parcel mode (status) history** — I need each token's mode as of a
> historical timestamp. The terrain→daydream transition timestamp per token is
> enough (origin parcels are just always origin). Does ArtGod track parcel status
> changes (the daydream/terraform events), and can I query "status of token N over
> time" or pull the status-change event log? One gotcha: if the only status event
> you persist is the Terraformed/commit (canvas) event, flag it — a parcel can sit
> in daydream without ever committing a terraform, so I need the actual status
> flip, not just commits.
>
> **3. (Minor / nice-to-have)** I think I *don't* need archival state given the
> above, but just in case I ever want to spot-check a historical tokenURI — is the
> node archival, or pruned?
>
> Latency doesn't matter for me at all — this is an offline backtest, not a live
> feed.
>
> You said the ArtGod instance is basically ready and just needs HTTPS + a secret
> key exposed — if that covers sales + status, that sounds like the path of least
> resistance for both. Happy to hop on a call if easier. No rush 🙏
