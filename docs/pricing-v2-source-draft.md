# Pricing v2 — Source Inputs (unedited)

This file preserves the **raw starting material** for the v2 work so it survives
across chat sessions. Nothing here has been corrected — the review, corrections,
and final spec live in **`pricing-v2-plan.md`** (see its §2 cross-check for what
was right vs. wrong in the draft below).

Two inputs:
- **A.** James's LLM-assisted hedonic pricing framework (the draft to refine).
- **B.** Relevant excerpts from the d347h.eth (friend with ETH node) conversation
  about how to actually get the data.

---

## A. Hedonic pricing framework (source draft)

> ⚠️ Unedited source. Known issues flagged in `pricing-v2-plan.md` §2:
> example multipliers are illustrative/wrong (esp. 1of1 4× — it's 10.4% of the
> collection), two zone examples are hallucinated, no floor/time anchor, trait
> mutability overstated (only `mode` is mutable). Definitions of the special
> traits, however, matched the glossary.

### Core model

```
ln(P_i) = α + Σ_z β_z·Z_iz + Σ_b δ_b·B_ib + Σ_c φ_c·C_ic
            + Σ_m ψ_m·M_im + Σ_l ω_l·L_il + Σ_k γ_k·S_ik + ε_i
```

| Variable | Meaning |
|---|---|
| P_i | Sale price of Terraform i |
| ln(P_i) | Log-transformed sale price |
| α | Baseline intercept |
| Z_iz | Zone type |
| B_ib | Biome type |
| C_ic | Chroma type |
| M_im | Mode type |
| L_il | Level |
| S_ik | Special manual traits |
| ε_i | Residual error |

### Trait spaces

1. **Zone (Z)** — categorical, dummy-encoded. (Draft examples: Blushing, Eternal
   September, First Earth, Gaea's Cradle — note two of these aren't real zones.)
2. **Biome (B)** — integer categorical, B ∈ {0,…,91}, 92 classes, one-hot.
3. **Chroma (C)** — {Flow, Hyper, Pulse, Plague}.
4. **Mode (M)** — {Terrain, Daydream, Terraform, Origin Daydream, Origin Terraform};
   "likely one of the strongest coefficients."
5. **Level (L)** — ordinal L ∈ {1,…,20}. Linear form `ω·L` or nonlinear
   categorical `Σ ω_l·L_il`; nonlinear usually better for collectibles (L20
   prestige, premiums rarely linear).

### Special traits (S) — premium override layer

Updated draft with these special types (additive prestige multipliers over the
baseline stack):

- **godmode** — highest X-Seed range, Seed 9970–9999; Origin Daydream / possibly
  Origin Terraform; full charset cycling animation. Modeled `T_godmode = 1`, very
  large coefficient (extreme tail).
- **origin mint** — Origin Daydream/Terraform allocated during 2021 launch; tied
  to Hypercastle decay calibration + contributor provenance. Strong provenance premium.
- **plague** — Plague chroma; rarest chroma class; mysterious role; warped
  palettes. Possibly modeled separately from ordinary chroma (mythology premium).
- **x-seed** — full on-chain charset animation. Origin Daydream Seed > 9000, or
  Terrain Seed > 9970. Major rarity/aesthetic premium.
- **y-seed** — alternative charset animation. Seed 9950–9970. Intermediate tier
  between standard and X-Seed.
- **lith0** — intersection of biome 0 + duotone palette + non-alternating palette →
  lithographic appearance. A classic interaction-effect rarity.
- **spine** — central Hypercastle axis parcels; 4 per level; community artwork
  infrastructure. Strong lore + positional significance.
- **1 of 1** — unique zone + biome combination. `T_1of1 = 1`. Strong collector premium.
- **s0** — Season 0 antenna-enabled parcels, upgraded Dec 24 2023 → Jan 13 2024;
  potential future broadcast mechanics. Speculative utility premium.

### Optional interaction terms (draft)

```
ln(P_i) = α + Z_i + B_i + C_i + M_i + L_i + (C_i × M_i) + (B_i × L_i)
            + Σ_k γ_k·S_ik + ε_i
```

Examples floated: Hyper × Origin Terraform; certain biomes valuable only at high
levels; Plague premium in specific zones.

### Alternative "Floor Multiple" version (draft)

```
P_i = F_t × Z_i × B_i × C_i × M_i × L_i × Π_s T_is
```

F_t = collection floor at time t; each factor a rarity/prestige multiplier.
Draft's **illustrative** example table (NB: these numbers are wrong vs. the live
model — see plan §2.2):

| Trait | Multiplier (draft) |
|---|---|
| Origin Terraform | 2.5× |
| Plague | 3× |
| godmode | 12× |
| spine | 1.8× |
| 1 of 1 | 4× |

### Suggested practical hierarchy (draft)

Rough pricing order: 1) Special traits, 2) Mode, 3) Zone mythology, 4) Chroma,
5) Level, 6) Biome rarity — with godmode / plague / origin / spine / 1-of-1 as
"mythic overlays" rather than ordinary rarity traits.

---

## B. d347h.eth infrastructure conversation (excerpts, 2026-05-21)

James's friend runs the ETH node + infra. Key points:

**Server state.** New "chad server" currently runs only an Ethereum node — no
indexers deployed on top yet. terraformexplorer.xyz/dreams is down.

**Three options to get the decoded `Terraformed` event feed (best → worst):**
1. **ArtGod indexer/backend API** — already has all the data + live sync for the
   `Terraformed` event and already feeds its own frontend. Only missing piece:
   exposing the API to a remote client over HTTPS with a secret key. He needs to
   re-deploy the ArtGod instance to the new server, then add the HTTPS+secret-key
   access. "Everything already in place and maintains live sync — the API just
   isn't exposed to the outside." ← his recommended path.
2. **Terraform Explorer** — `/dreams` page runs on its own DB + a tiny ponder
   indexer, but it's down and only serves its own frontend (not exposed to remote
   clients).
3. **Build our own** small DB + ponder indexer ingesting from the node's JSON-RPC;
   needs a historical backfill + live sync. Ponder exposes HTTP REST + GraphQL and
   can be secret-key gated. Only if 100% justified.

**Latency:** a few seconds max in all cases. Heightmap data is available in all
cases (the indexer persists it during event decoding) — event decoding context
has enough to track which `uint256[16]` heightmap landed on a token at a given tx.

**On sales data (important):** *"Ethereum nodes don't have sales data. They only
have raw data for blocks, txs, tx receipts."* Sales are a derivative produced by a
separate indexer that decodes raw tx data. Options:
- Integrate with an indexer like **ArtGod** to consume sales data it already produces.
- Integrate with the node and do the indexing yourself (more control, more work).

He strongly recommended **integrating with the ArtGod API** and only building our
own indexer if truly justified.

**His questions to us** (answered in `pricing-v2-plan.md` §11 / Appendix A):
access shape (REST/GraphQL/subgraph?); coverage (`commitDreamToCanvas` / `setStatus`,
or just transfers/logs?); latency to chain head; schema (columns per event, is raw
calldata / the `uint256[16]` heightmap preserved?).
