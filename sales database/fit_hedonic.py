#!/usr/bin/env python3
"""
First-cut hedonic fit for Terraforms pricing v2 — both money-sword sub-models.

Target:   y = ln(price_native / floor_at_sale)   (the log floor-multiple)
Estimator: weighted Ridge (the frequentist grouped-ridge ~ partial-pooling the
           plan calls for: rare zones/biomes shrink toward the baseline).
Weights:   recency (exp time-decay, half-life H) x settlement-side mass.
Sub-models:
  money_sword_OFF (liquidation):  weight mass 80% BID / 20% ASK
  money_sword_ON  (retail ask):   weight mass 80% ASK / 20% BID

Features: zone, biome, chroma(Flow base), mode-group(Terrain base), level,
          named look-badges, the 1of1 / S0 / Spine flags, and one interaction:
          Daydream/Terraform x ln(v1 biome prior). Override specials
          (Godmode/Plague/seeds/Lith0) excluded -> Tier-2, each type one floor
          multiple from its own sales (special_multiples).
Shrinkage: thin traits shrink toward v1's multipliers, except those James has
           approved for pricing from their own recency-weighted sales
           (SALES_ANCHORED, via sales_anchors).

Outputs:  pricing-v2-coeffs.json  (+ a readable console report)
Deps:     numpy, scikit-learn, stdlib sqlite3/json  (no pandas needed)
"""
import os, sys, json, math, sqlite3, time, copy
from collections import Counter, defaultdict
import numpy as np
from sklearn.linear_model import Ridge

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, os.environ.get('DB_PATH', 'terraforms_sales.db'))
MINTED = os.path.join(HERE, '..', 'backend', 'src', 'minted-traits.json')
SPECIAL = os.path.join(HERE, '..', 'backend', 'src', 'special-tokens.json')
ONE_OF_ONE = os.path.join(HERE, '..', 'backend', 'src', 'one-of-one-ids.json')
PRIORS = os.path.join(HERE, 'v1-priors.json')
OUT = os.path.join(HERE, 'pricing-v2-coeffs.json')

# Half-life of the recency weights.
#
# 2026-09-23: 60 -> 180, chosen by a rolling-origin backtest rather than a single
# holdout: refit every 14 days on sales up to that day, calibrate the level on the
# preceding 30 days (the way production does), score the next 14 days. Median
# absolute error, side-matched, over two separate years of out-of-sample sales:
#
#                                         2024-09..2025-09   2025-09..2026-09
#   H=60  alpha=10, v1 premia (was live)       11.05%              9.95%
#   H=180 alpha=3, fitted extras + DDTF x biome 10.73%              8.85%
#
# The level is recalibrated daily against sales, so the half-life only has to
# carry the SHAPE — relative trait premiums — which moves slowly. 60 days threw
# most of the data away to track it. 120-270 is a flat optimum; 30 is worse.
# The earlier sweep (ab_vs_v1.js) scored one 20% holdout adjacent to training,
# the same flaw noted on ALPHA below.
HALF_LIFE_D = float(os.environ.get('HALF_LIFE_DAYS', 180))
# Grid extends below 1.0 so CV can find the true optimum instead of pinning to the
# grid floor (the prior fit selected alpha=1 for both sub-models — a boundary hit
# that means the search never bracketed the minimum).
ALPHA_GRID = [0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0]
# Reference level per factor, dropped from the design matrix. Without this, a full
# dummy set for zone AND biome alongside an intercept is collinear (the dummies sum
# to the intercept), so ridge — not the data — decides how the level is split
# between them. Coefficients then sit on a penalty-determined scale that means
# nothing in particular, and blending them with v1 priors compares two different
# quantities. Dropping a reference makes every coefficient "premium relative to the
# reference parcel", which is exactly what build_priors.js measures.
# Chosen as the most-traded FLOOR-tier value: common enough for a stable intercept,
# unremarkable enough to be a true 1.0 baseline. MUST match build_priors.js.
REF_ZONE = os.environ.get('REF_ZONE', 'Holo')      # 1,799 eligible sales
REF_BIOME = os.environ.get('REF_BIOME', '46')      # 695 eligible sales
# Prior strength, in sales. A trait level with exactly K eligible sales lands
# halfway between its fitted value and its v1 prior. 0 disables shrinkage entirely
# (pure data fit — reproduces the old behaviour).
# K=120 by the same sweep — a strong prior. Held-out error falls monotonically as
# K rises (10.7% -> 10.0% at H=60), which is itself the finding: v1's hand-tuned
# multipliers carry real information, and the sales data alone does not beat them.
PRIOR_K = float(os.environ.get('PRIOR_K', 120))
# How settlement side enters the model.
#   'dummy'    — ONE fit over all sales with an is-ask indicator. ask = bid x a
#                single fitted premium, so the band cannot invert: it is the same
#                parcel priced on two sides, not two parcels priced independently.
#   'reweight' — the original: two separate fits, 80/20 and 20/80 weight mass.
#                Nothing tied the two together, so per-trait noise flipped 16.4%
#                of parcels to bid-above-ask (25.6% once alpha was equalised),
#                against raw data that says ask clears ~25% ABOVE bid at every
#                level bucket and every zone-richness quartile (+18.6% to +26.0%).
#                Kept for reproducing the first fit.
SIDE_MODEL = os.environ.get('SIDE_MODEL', 'dummy')
# Alpha override, and why there is one.
#
# holdout_eval splits on time and scores the most recent 20% of the DB — but that
# window is temporally adjacent to the training data, so a barely-regularised fit
# that tracks the current regime scores well on it. Against sales that landed
# AFTER the DB was built (the live /sales feed, 50 settled sales), the CV pick is
# the worst model on the grid:
#
#   alpha    live feed    bias
#   3          5.4%       -2.4%
#   10         5.0%       +0.8%   <- best out-of-sample
#   30         5.6%       +1.9%
#   100        5.8%       +1.1%
#
# So CV is anti-correlated with real out-of-sample error here, and reading it
# straight would ship the worst option.
#
# 2026-09-03: was 30. The feed those numbers came from was missing ~30% of its
# sales — backend/src/sales.js dropped Blur Pool ETH fills, which are bid-side,
# so alpha was being chosen against an ask-skewed sample. With the full feed the
# minimum moves to 10, which also lands nearly unbiased (+0.8% vs +1.9%).
#
# 2026-09-23: 10 -> 3, from the rolling-origin backtest described at HALF_LIFE_D
# (~3,200 out-of-sample sales, not 50). At H=180: alpha 3 / 10 / 30 scored
# 10.83 / 11.04 / 11.01% on the older year and 8.77 / 9.00 / 9.51% on the recent
# one. The prior shrinkage already handles thin traits, so the penalty has less
# to do. Re-check with ALPHA=, or ALPHA=cv for the (untrustworthy) CV pick.
ALPHA = os.environ.get('ALPHA', '3')
# Rare-zone pooling is off by default now that priors exist: shrinking a thin zone
# toward its OWN v1 prior strictly beats merging it into a 'ZONE_rare' bucket that
# averages mythical 1-of-1 zones together with floor zones. Set >0 to re-enable.
MIN_ZONE_N = int(os.environ.get('MIN_ZONE_N', 0))
OVERRIDE_SPECIALS = {'Godmode', 'Plague', 'X-Seed', 'Y-Seed', 'Lith0'}
# Godmode is not in special-tokens.json: snapshotTraits.js lists it. MUST match.
GODMODE_IDS = {83, 124, 1955}
# Traits whose prior is their own recency-weighted sales (sales_anchors) rather
# than v1's hand-set multiplier. James reviews them trait by trait (the audit's
# sales_implied against v1_prior) and approves; every other trait stays on its v1
# prior until he has. ANCHOR_SALES=0 reproduces the all-v1 fit.
#   2026-10-20  level 20, Dread, biome 39
#   2026-10-20  the five whose sales sat above v1: First Earth, Avidana, biome
#               17, and the Biome 0 Flow and Matrix badges
SALES_ANCHORED = {
    ('level', '20'), ('zone', 'Dread'), ('biome', '39'),
    ('zone', 'First Earth'), ('zone', 'Avidana'), ('biome', '17'),
    ('badge', 'biome0_flow'), ('badge', 'matrix'),
}
ANCHOR_SALES = os.environ.get('ANCHOR_SALES', '1') != '0'
ANCHOR_ROUNDS = 4
# Tier-2 types priced at the floor multiple their own sales show (special_
# multiples). X-Seed and Godmode keep v1's price, and hedonicModel.js values
# Y-Seeds as X-Seeds (James, 2026-10-20).
SALES_PRICED_SPECIALS = {'Lith0', 'Plague'}
# Premiums James has set outright, overriding both the fit and any prior. Mesa:
# its sales never supported v1's +25% over biome 39 (the last, #2518 at 0.9 ETH in
# Aug 2025, cleared ~1.9x the floor, level with other biome-39 parcels), so +5%
# for now, to come down further if the sales keep saying so (2026-10-20).
FIXED_PREMIUMS = {('badge', 'mesa'): 1.05}
# Sweep legs: several parcels settled in one transaction, each its own order at its
# own price. The view (v_model_sales) drops every multi-parcel transaction as a
# possible bundle, but only one order spanning several parcels repeats its total
# on every leg. A leg is its own price when no other leg of the transaction
# shares that price, when several sellers share it (separate listings), or when
# it is under 1.5x the day's floor (a floor sweep from one seller; a bundle
# order's total would be far above that) — the same test export_sales_history.js
# uses to tell sweeps from bundles on the /sales page. James, 2026-10-20: these
# are clear data points and belong in the model. INCLUDE_SWEEPS=0 drops them.
INCLUDE_SWEEPS = os.environ.get('INCLUDE_SWEEPS', '1') != '0'
BUNDLE_MIN_FLOOR_MULTIPLE = 1.5
MODE_GROUP = {'Terrain': 'Terrain', 'Daydream': 'DDTF', 'Terraform': 'DDTF',
              'Origin Daydream': 'ORIG', 'Origin Terraform': 'ORIG'}
# Plan §4.5: level premium lives ONLY at the extremes (basement L1–3, penthouse
# L18–20). Interior levels L4–17 are pooled flat (no dummy → absorbed into the
# baseline, multiplier 1.0). Fitting a free dummy per level instead let thin
# interior cells learn large spurious premiums/discounts from noise — e.g. the
# prior fit priced L17–L19 BELOW floor (0.46–0.60x) and missed L1 entirely.
EXTREME_LEVELS = {1, 2, 3, 18, 19, 20}
# Parcel flags fitted as features. These were v1 premiums multiplied on AFTER the
# fit (1of1 x1.05, S0 x1.05, Spine x1.20) while the fit itself never saw them, so
# their effect was partly absorbed into the zone/biome coefficients of the traits
# they co-occur with and then applied again. Fitted on 1,618 / 3,870 / 96 eligible
# sales they come out at ~1.03 / ~0.98 / ~1.18: S0 carries no premium at all, and
# priced at +5% it read 3% over on every S0 sale in the backtest.
EXTRA_FLAGS = ['one_of_one', 's0', 'spine']
S0_MIN, S0_MAX = 1703376000, 1705190399     # MUST match snapshotTraits.js
# Daydream / Terraform hide the terrain, so a biome premium should not carry over
# in full — v1 already weights biome at 0.15 in those modes against 0.5 in
# Terrain. One interaction captures it: DDTF x ln(v1 biome prior), fitted, so a
# DDTF parcel's biome effect is scaled by prior^beta. It fits at beta ~ -0.5 on
# 469 sales. Before it, Daydream/Terraform parcels on premium biomes ran ~25%
# over their sale prices (#4363, a biome-0 Daydream, quoted ~1.1 ETH, sold 0.65).
DDTF_BIOME_INTERACTION = os.environ.get('DDTF_BIOME', '1') != '0'
# Plausible floor-multiple band; outside = data error / uncaught wash -> drop.
MULT_LO, MULT_HI = 0.25, 40.0

def load_aux():
    mt = {e['tokenId']: e for e in json.load(open(MINTED))}
    special = json.load(open(SPECIAL))
    override_ids = {int(k) for k, v in special.items() if v in OVERRIDE_SPECIALS}
    flags = {
        'one_of_one': set(json.load(open(ONE_OF_ONE))),
        'spine': {int(k) for k, v in special.items() if v == 'Spine'},
        'special': {int(k): v for k, v in special.items()},
    }
    return mt, override_ids, flags

def is_s0(m):
    ts = m.get('antennaFirstTs') or 0
    return bool(m.get('antennaOn')) and S0_MIN <= ts <= S0_MAX

def tier2_type(tid, m, flags):
    """The Tier-2 type the site prices a parcel under (hedonicModel.js isTier2,
    snapshotTraits.js specialType): Godmode, else a special-tokens type, else
    Plague chroma — or None for a parcel the fit prices."""
    if tid in GODMODE_IDS:
        return 'Godmode'
    st = flags['special'].get(tid) or ('Plague' if m['chroma'] == 'Plague' else None)
    return st if st in OVERRIDE_SPECIALS else None

def load_records(mt, override_ids, flags):
    """Eligible sales for the fit, and the Tier-2 sales kept aside for
    special_multiples. Eligible = the view's model_eligible, plus sweep legs that
    carry their own price (INCLUDE_SWEEPS)."""
    con = sqlite3.connect(DB)
    rows = con.execute("""
        SELECT token_id, event_unix, price_native, floor_at_sale, side,
               zone, biome, level, mode, model_eligible, is_bundle, tx_hash, lower(seller)
        FROM v_model_sales
        WHERE floor_at_sale > 0 AND price_native > 0
          AND is_wash = 0 AND lower(buyer) <> lower(seller)
          AND payment_symbol IN ('ETH', 'WETH')
    """).fetchall()
    con.close()
    # Legs of one transaction at one price, and how many sellers they come from.
    groups = defaultdict(lambda: [0, set()])
    for r in rows:
        if r[10]:
            g = groups[(r[11], r[2])]
            g[0] += 1
            g[1].add(r[12])
    def own_price(tx, price, floor):
        n, sellers = groups[(tx, price)]
        return n == 1 or len(sellers) > 1 or price < BUNDLE_MIN_FLOOR_MULTIPLE * floor
    recs, tier2, dropped = [], [], Counter()
    for tid, u, price, floor, side, zone, biome, level, mode, eligible, bundle, tx, seller in rows:
        if bundle:
            if not (INCLUDE_SWEEPS and own_price(tx, price, floor)):
                dropped['bundle_order'] += 1; continue
        elif not eligible:
            dropped['ineligible'] += 1; continue
        m = mt.get(tid)
        if m is None:
            dropped['not_in_snapshot'] += 1; continue
        mult = price / floor
        lvl = int(level) if (level not in (None, '')) else int(m['level'])
        rec = {
            'tid': tid, 'u': int(u), 'y': math.log(mult), 'mult': mult,
            'side': side,
            'zone': zone or m['zone'],
            'biome': str(biome if biome is not None else m['biome']),
            'level': lvl,
            'mode_group': MODE_GROUP.get(mode or m['mode'], 'Terrain'),
            'chroma': m['chroma'],                 # Flow / Pulse / Hyper (Plague: Tier-2)
            'mystery': m['mysteryValue'],
            'one_of_one': tid in flags['one_of_one'],
            's0': is_s0(m),
            # Penthouse outranks Spine (James, 2026-10-20): on a level-20 parcel the
            # Spine flag adds nothing, and the sale counts toward the penthouse.
            'spine': tid in flags['spine'] and lvl != 20,
            'sweep': bool(bundle),
        }
        special = tier2_type(tid, m, flags)
        if special is not None:
            # Out of the fit; priced from its own sales. Only the lower band
            # applies: a Plague parcel at 70x the floor is a real sale.
            if mult >= MULT_LO:
                tier2.append({**rec, 'special': special})
            dropped['override_special'] += 1; continue
        if tid in override_ids:
            dropped['override_special'] += 1; continue
        if m['chroma'] == 'Plague':           # Plague = Tier-2 override
            dropped['plague_chroma'] += 1; continue
        if not (MULT_LO <= mult <= MULT_HI):
            dropped['extreme_multiple'] += 1; continue
        recs.append(rec)
    return recs, tier2, dropped

def badges(r):
    b, mode_t = {}, (r['mode_group'] == 'Terrain')
    b['mesa'] = 1 if (r['biome'] == '39' and mode_t and r['mystery'] < 30000) else 0
    # Matrix requires the Intro Forest zone, matching the product's badge (CLAUDE.md
    # "Matrix — Biome 58 / Intro Forest") and v1's matrixMultiple. The earlier
    # biome-58-only test fired on 354 sales and fitted to ~1.06x, but it was not
    # measuring Matrix — it was a near-duplicate of the biome=58 coefficient, which
    # already carries the generic biome-58 effect. Narrowed, it matches on 1 sale
    # and is carried almost entirely by the prior, which is the correct outcome.
    b['matrix'] = 1 if (r['biome'] == '58' and mode_t and r['zone'] == 'Intro Forest') else 0
    b['heartbeat'] = 1 if (r['zone'] == '[BLOOD]' and r['chroma'] == 'Pulse' and mode_t) else 0
    b['gm'] = 1 if (r['biome'] == '71' and mode_t and r['mystery'] < 30000) else 0
    b['biome0_flow'] = 1 if (r['biome'] == '0' and r['chroma'] == 'Flow') else 0
    return b

def pool_rare_zones(recs, min_n):
    cnt = Counter(r['zone'] for r in recs)
    rare = {z for z, c in cnt.items() if c < min_n}
    for r in recs:
        if r['zone'] in rare:
            r['zone'] = 'ZONE_rare'
    return len(rare), sum(cnt[z] for z in rare)

def ddtf_biome_x(r, priors):
    """Interaction regressor: ln(v1 biome prior) on Daydream/Terraform parcels, 0
    elsewhere. The prior is a fixed, pre-fit quantity, so this is one extra column
    rather than a second biome table."""
    if r['mode_group'] != 'DDTF':
        return 0.0
    return math.log(max(float(priors['biome'].get(r['biome'], 1.0)), 1e-6))

def build_design(recs, priors):
    # REF_ZONE / REF_BIOME are dropped: they ARE the baseline, so their coefficient
    # is 1.0 by construction and estimating one would make the design collinear.
    zones = sorted({r['zone'] for r in recs} - {REF_ZONE})
    biomes = sorted({r['biome'] for r in recs} - {REF_BIOME}, key=lambda x: int(x))
    # Only extreme levels get a dummy; interior L4–17 pool flat into the baseline.
    levels = sorted(l for l in {r['level'] for r in recs} if l in EXTREME_LEVELS)
    chromas = ['Pulse', 'Hyper']          # Flow = baseline
    modes = ['DDTF', 'ORIG']              # Terrain = baseline
    badge_names = ['mesa', 'matrix', 'heartbeat', 'gm', 'biome0_flow']
    cols = ([f'zone={z}' for z in zones] + [f'biome={b}' for b in biomes] +
            [f'level={l}' for l in levels] + [f'chroma={c}' for c in chromas] +
            [f'mode={m}' for m in modes] + [f'badge={b}' for b in badge_names] +
            [f'extra={e}' for e in EXTRA_FLAGS] +
            (['inter=ddtf_biome'] if DDTF_BIOME_INTERACTION else []))
    # Settlement side as a feature rather than as a pair of reweighted fits. BID is
    # the baseline; the ASK coefficient IS the bid/ask spread, estimated once from
    # all 20,271 sales instead of inferred by differencing two independent fits.
    if SIDE_MODEL == 'dummy':
        cols = cols + ['side=ask']
    idx = {c: i for i, c in enumerate(cols)}
    X = np.zeros((len(recs), len(cols)), dtype=np.float64)
    for i, r in enumerate(recs):
        if r['zone'] != REF_ZONE: X[i, idx[f"zone={r['zone']}"]] = 1
        if r['biome'] != REF_BIOME: X[i, idx[f"biome={r['biome']}"]] = 1
        if r['level'] in EXTREME_LEVELS: X[i, idx[f"level={r['level']}"]] = 1
        if r['chroma'] in chromas: X[i, idx[f"chroma={r['chroma']}"]] = 1
        if r['mode_group'] in modes: X[i, idx[f"mode={r['mode_group']}"]] = 1
        for bn, bv in badges(r).items():
            if bv: X[i, idx[f'badge={bn}']] = 1
        for e in EXTRA_FLAGS:
            if r[e]: X[i, idx[f'extra={e}']] = 1
        if DDTF_BIOME_INTERACTION:
            X[i, idx['inter=ddtf_biome']] = ddtf_biome_x(r, priors)
        if SIDE_MODEL == 'dummy' and r['side'] == 'ASK': X[i, idx['side=ask']] = 1
    return X, cols

def side_weights(recs, w_time, bid_share):
    """Scale time-weights so total mass is bid_share on BID, (1-bid_share) on ASK."""
    w_time = np.asarray(w_time, float)
    is_bid = np.array([r['side'] == 'BID' for r in recs])
    mb, ma = w_time[is_bid].sum(), w_time[~is_bid].sum()
    w = np.where(is_bid, w_time * (bid_share / mb), w_time * ((1 - bid_share) / ma))
    return w * (len(w) / w.sum())          # normalise mean(w)=1 so alpha is comparable

def holdout_eval(X, y, w, alpha, order, frac=0.20):
    n = len(y); k = int(n * (1 - frac))
    tr, te = order[:k], order[k:]
    mdl = Ridge(alpha=alpha, fit_intercept=True)
    mdl.fit(X[tr], y[tr], sample_weight=w[tr])
    pred = mdl.predict(X[te])
    pct = np.abs(np.exp(pred - y[te]) - 1.0)     # |predicted/actual - 1| in multiple space
    return float(np.median(pct))

def select_shared_alpha(recs, X, y, u, shares):
    """One alpha for every sub-model, chosen jointly by the worst sub-model's
    held-out error.

    Selecting alpha per sub-model is what made the two incomparable. Ridge runs
    with fit_intercept=True, so the intercept is NOT penalised: at a high alpha
    the trait coefficients are squashed toward 1 and the level collects in the
    baseline, at a low alpha it stays out in the coefficients. The first fit
    picked 100 for the bid model and 0.1 for the ask model, so their baselines
    (1.56x vs 1.09x) were measuring different things — and on any parcel without
    a strong trait multiple to outweigh that gap, the bid band sat ABOVE the ask
    band. 16.4% of tier-1 parcels, rising to 32% of the plainest sixth, against
    raw data that says ask clears 25% above bid.

    side_weights already normalises mean(w)=1 with the comment "so alpha is
    comparable". This is the part that actually uses that.

    Criterion is the worst side, not the mean: a mean lets a good bid fit pay for
    a bad ask fit, and the ask model is the one setting the top of the band. In
    practice the bid model is nearly flat in alpha (10.34% at 0.1 vs 10.01% at
    100 — inside the noise) while the ask model degrades steeply, so the joint
    choice costs the bid side ~0.3pp and saves the ask side ~2.9pp.
    """
    ref = max(u)
    w_time = np.power(0.5, ((ref - np.asarray(u)) / 86400.0) / HALF_LIFE_D)
    order = np.argsort(u)
    scored = []
    for a in ALPHA_GRID:
        errs = [holdout_eval(X, y, side_weights(recs, w_time, bs), a, order)
                for bs in shares]
        scored.append((max(errs), a, errs))
    worst, alpha, errs = min(scored, key=lambda t: t[0])
    print(f"Shared alpha {alpha} (worst-side held-out error {worst:.1%}; "
          + ", ".join(f"{bs:.0%} bid -> {e:.1%}" for bs, e in zip(shares, errs)) + ")\n")
    return alpha


def fit_submodel(recs, X, y, u, label, bid_share, alpha=None):
    ref = max(u)
    w_time = np.power(0.5, ((ref - np.asarray(u)) / 86400.0) / HALF_LIFE_D)
    w = side_weights(recs, w_time, bid_share)
    order = np.argsort(u)                          # time order for the split
    if alpha is None:
        # Per-sub-model selection. Kept for SHARED_ALPHA=0 / historical fits only —
        # see select_shared_alpha for why this is not the default any more.
        scored = [(holdout_eval(X, y, w, a, order), a) for a in ALPHA_GRID]
        holdout_err, alpha = min(scored, key=lambda t: t[0])
    else:
        holdout_err = holdout_eval(X, y, w, alpha, order)
    mdl = Ridge(alpha=alpha, fit_intercept=True)
    mdl.fit(X, y, sample_weight=w)                 # final fit on all data
    # in-sample weighted R^2
    pred = mdl.predict(X)
    ss_res = np.sum(w * (y - pred) ** 2)
    ybar = np.average(y, weights=w)
    ss_tot = np.sum(w * (y - ybar) ** 2)
    r2 = 1 - ss_res / ss_tot
    return mdl, dict(label=label, bid_share=bid_share, alpha=alpha,
                     holdout_median_pct_err=holdout_err, weighted_r2=float(r2),
                     n=len(y))

def coeffs_to_multipliers(mdl, cols, priors):
    out = {'baseline_multiple': float(math.exp(mdl.intercept_)),
           'zone': {}, 'biome': {}, 'level': {}, 'chroma': {}, 'mode': {}, 'badge': {},
           'extra': {}}
    for c, b in zip(cols, mdl.coef_):
        kind, name = c.split('=', 1)
        # side=ask is the bid/ask spread, not a trait. It scales the baseline, so
        # it is returned separately rather than dropped into a multiplier table
        # that consumers apply per parcel.
        if kind == 'side':
            continue
        if kind == 'inter':
            # Expanded to a per-biome table so the backend needs no v1 priors at
            # runtime: a DDTF parcel on biome b multiplies by prior_b ** beta.
            beta = float(b)
            out['ddtf_biome_beta'] = round(beta, 6)
            out['mode_biome'] = {'DDTF': {
                str(k): round(math.exp(beta * math.log(max(float(v), 1e-6))), 4)
                for k, v in priors['biome'].items()}}
            continue
        out[kind][name] = round(float(math.exp(b)), 4)
    return out


def ask_premium(mdl, cols):
    """exp(beta) on the is-ask indicator: how much more a taken listing settles
    for than an accepted offer on the same parcel. One number, >1, applied to the
    baseline — which is precisely what makes an inverted band unrepresentable."""
    for c, b in zip(cols, mdl.coef_):
        if c == 'side=ask':
            return float(math.exp(b))
    return 1.0

def trait_counts(recs):
    """Unweighted eligible-sale count per trait level — the evidence behind each
    coefficient. Deliberately NOT time-weighted: recency decides how much a sale
    says about today's price, but prior strength is about how much data exists at
    all, and a 2022 Aetherking sale is still evidence that Aetherking is rare."""
    c = {'zone': Counter(), 'biome': Counter(), 'level': Counter(), 'badge': Counter()}
    for r in recs:
        c['zone'][r['zone']] += 1
        c['biome'][r['biome']] += 1
        # str() because coefficient names come back off the design-matrix columns
        # as strings ('level=1' -> '1'). Counting under int 1 would silently miss
        # every lookup, zeroing w and handing all levels to the prior.
        if r['level'] in EXTREME_LEVELS: c['level'][str(r['level'])] += 1
        for bn, bv in badges(r).items():
            if bv: c['badge'][bn] += 1
    return c

def shrink_to_priors(mult, counts, priors, K, anchors=None):
    """Blend each fitted coefficient toward its prior with weight n/(n+K).

    The prior is the trait's own sales (`anchors`, from sales_anchors, already in
    coefficient space) wherever it has any, and its v1 multiplier otherwise. A
    thin trait therefore lands near what its own recent sales say rather than near
    v1's hand-set number, while a well-traded one stays with the fit.

    In LOG space: these are multipliers, so the neutral midpoint between 0.5x and
    2.0x is 1.0x, not 1.25x. A linear blend would bias every coefficient upward.

    Zone/biome/level priors are TOTAL floor-multiples for a reference parcel
    carrying that trait, but a fitted coefficient is only one factor in
    `baseline x zone_c x biome_c x ...`. They have to be divided into coefficient
    space first, or the blend silently inflates every shrunk trait by the baseline
    (~8%). Badge priors are already interaction premiums, not totals, so they are
    used as-is.
    """
    if K <= 0:
        return []
    base = mult['baseline_multiple']
    audit = []
    for kind in ('zone', 'biome', 'level', 'badge'):
        pri = priors.get(kind, {})
        for name, fitted in list(mult[kind].items()):
            # A zone v1 has never heard of (custom 1-of-1 zones) gets v1's own
            # default for an unknown zone: no premium.
            v1 = pri.get(str(name), 1.0)
            if v1 <= 0: v1 = 1.0
            if kind != 'badge': v1 = v1 / base
            anchor = (anchors or {}).get((kind, str(name)))
            prior = anchor if anchor is not None else v1
            n = counts[kind].get(name, 0)
            w = n / (n + K)
            blended = math.exp(w * math.log(fitted) + (1 - w) * math.log(prior))
            mult[kind][name] = round(blended, 4)
            audit.append({'kind': kind, 'name': str(name), 'n': n, 'w': round(w, 3),
                          'fitted': fitted, 'prior': round(prior, 4),
                          'prior_source': 'sales' if anchor is not None else 'v1',
                          'v1_prior': round(v1, 4), 'blended': round(blended, 4)})
    return audit

def predict_log(r, mult, premium):
    """ln(floor multiple) the model gives a record's parcel on its sale's side —
    the product hedonicModel.js forms in subModelMultiple, so this sees what the
    site serves."""
    lg = math.log(mult['baseline_multiple'])
    lg += math.log(mult['zone'].get(r['zone'], 1.0))
    lg += math.log(mult['biome'].get(r['biome'], 1.0))
    lg += math.log(mult['level'].get(str(r['level']), 1.0))
    if r['chroma'] in ('Pulse', 'Hyper'):
        lg += math.log(mult['chroma'].get(r['chroma'], 1.0))
    g = r['mode_group']
    if g != 'Terrain':
        lg += math.log(mult['mode'].get(g, 1.0))
    mb = mult.get('mode_biome', {}).get(g, {}).get(r['biome'])
    if mb is not None:
        lg += math.log(mb)
    for bn, bv in badges(r).items():
        if bv: lg += math.log(mult['badge'].get(bn, 1.0))
    for e in EXTRA_FLAGS:
        if r[e]: lg += math.log(mult['extra'].get(e, 1.0))
    if r['side'] == 'ASK':
        lg += math.log(premium)
    return lg

def trait_keys(r):
    """The shrunk coefficients a record carries (the reference zone and biome
    are fixed at 1.0 and carry none)."""
    keys = []
    if r['zone'] != REF_ZONE: keys.append(('zone', r['zone']))
    if r['biome'] != REF_BIOME: keys.append(('biome', r['biome']))
    if r['level'] in EXTREME_LEVELS: keys.append(('level', str(r['level'])))
    keys += [('badge', bn) for bn, bv in badges(r).items() if bv]
    return keys

def recency(us):
    """Half-life weights, relative to the newest of `us`: only the ratios
    matter, so a trait whose sales are all old still speaks for itself, its
    latest sales loudest."""
    ref = max(us)
    return [0.5 ** (((ref - u) / 86400.0) / HALF_LIFE_D) for u in us]

def wmedian(xs, ws):
    """Weighted median, interpolated between neighbours (midpoint rule). Robust
    to the odd valuable parcel dumped into a floor bid or flipped in launch week,
    which a mean over a handful of sales is not; two equal-weight sales give
    their midpoint."""
    pts = sorted(zip(xs, ws))
    total = sum(w for _, w in pts)
    acc, mids = 0.0, []
    for _, w in pts:
        mids.append((acc + w / 2) / total)
        acc += w
    if mids[0] >= 0.5: return pts[0][0]
    if mids[-1] <= 0.5: return pts[-1][0]
    for i in range(1, len(pts)):
        if mids[i] >= 0.5:
            t = (0.5 - mids[i - 1]) / (mids[i] - mids[i - 1])
            return pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])

def sales_anchors(recs, mult, premium):
    """Each zone, biome, extreme level and badge's premium as its own sales put
    it: the recency-weighted median, over its sales, of price / the model's price
    for the same parcel without that premium.

    These replace v1's hand-set multipliers as the priors (shrink_to_priors), so a
    trait with too few sales for the fit to trust lands on its own recent sales
    (James, 2026-10-20: trust the objective sales data, however scarce). The fit
    itself can't do this: ridge pulls a premium resting on a few sales toward
    none, and the recency weights make old sales of a rare trait nearly
    weightless — so before this, level 20's two May 2026 sales at ~27x the floor
    moved its premium from v1's 11.1x to 11.2x."""
    by = defaultdict(lambda: ([], []))
    for r, wi in zip(recs, recency([r['u'] for r in recs])):
        lg = predict_log(r, mult, premium)
        for kind, name in trait_keys(r):
            own = math.log(mult[kind].get(name, 1.0))
            xs, ws = by[(kind, name)]
            xs.append(r['y'] - (lg - own))
            ws.append(wi)
    return {k: math.exp(wmedian(xs, ws)) for k, (xs, ws) in by.items()}

def special_multiples(tier2, premium):
    """Tier-2 types (Godmode, Plague, the seeds, Lith0) are too few to fit. As in
    v1, the type sets the value and the parcel's other traits don't stack on it
    (an origin X-Seed is an X-Seed, not an origin x an X-Seed). So each type gets
    one floor multiple, read off its own sales: the recency-weighted median of
    price / floor index, bid side (a taken listing counted as bid x the ask
    premium). hedonicModel.js prices the type at that multiple, in place of v1's
    hand-set one; a type with no sale keeps v1's price."""
    by = defaultdict(list)
    for r in tier2:
        by[r['special']].append(r)
    out = {}
    for typ, rs in sorted(by.items()):
        rs.sort(key=lambda r: r['u'])
        xs = [r['y'] - (math.log(premium) if r['side'] == 'ASK' else 0.0) for r in rs]
        out[typ] = {'multiple': round(math.exp(wmedian(xs, recency([r['u'] for r in rs]))), 3),
                    'n': len(rs), 'n_ask': sum(r['side'] == 'ASK' for r in rs),
                    'last_sale': time.strftime('%Y-%m-%d', time.gmtime(rs[-1]['u']))}
    return out

def emit_side_dummy(result, recs, X, y, u, cols, counts, priors, all_priors, tier2=()):
    """Single fit, side as a feature. Emits the same two-sub-model schema the
    backend already reads, so hedonicModel.js needs no change: identical trait
    multipliers on both sides, baselines differing by exactly the fitted premium.

    The spread is deliberately one number rather than per-trait. Measured raw it
    is flat — +26.0% / +23.0% / +21.2% across L4-8 / L9-13 / L14-17, and +20.1% /
    +22.4% / +18.6% / +25.1% across zone-richness quartiles — so a per-trait
    spread would be fitting noise, and fitting that noise is what produced the
    inverted bands in the first place.
    """
    ref = max(u)
    w = np.power(0.5, ((ref - np.asarray(u)) / 86400.0) / HALF_LIFE_D)
    w = w * (len(w) / w.sum())                     # mean(w)=1, so alpha is comparable
    order = np.argsort(u)
    if ALPHA == 'cv':
        scored = [(holdout_eval(X, y, w, a, order), a) for a in ALPHA_GRID]
        holdout_err, alpha = min(scored, key=lambda t: t[0])
    else:
        alpha = float(ALPHA)
        holdout_err = holdout_eval(X, y, w, alpha, order)

    mdl = Ridge(alpha=alpha, fit_intercept=True)
    mdl.fit(X, y, sample_weight=w)
    pred = mdl.predict(X)
    ybar = np.average(y, weights=w)
    r2 = float(1 - np.sum(w * (y - pred) ** 2) / np.sum(w * (y - ybar) ** 2))

    premium = ask_premium(mdl, cols)
    fitted = coeffs_to_multipliers(mdl, cols, all_priors)

    def shrink(anchors=None):
        m = copy.deepcopy(fitted)
        a = shrink_to_priors(m, counts, priors, PRIOR_K, anchors)
        m['zone'][REF_ZONE] = 1.0
        m['biome'][REF_BIOME] = 1.0
        # Set inside the loop, so the sales anchors read the other traits against
        # the premium the site will actually serve.
        for (kind, name), v in FIXED_PREMIUMS.items():
            m[kind][name] = v
            for entry in a:
                if (entry['kind'], entry['name']) == (kind, name):
                    entry.update(prior=v, prior_source='fixed', blended=v)
        return m, a

    base, audit = shrink()
    if ANCHOR_SALES and PRIOR_K > 0:
        # A few rounds, because rare traits co-occur (Mesa sits inside biome 39, a
        # Shahra parcel on biome 74): each pass prices the others at their current
        # values before reading a trait's own sales.
        for _ in range(ANCHOR_ROUNDS):
            anchors = sales_anchors(recs, base, premium)
            base, audit = shrink({k: v for k, v in anchors.items() if k in SALES_ANCHORED})
        # What each trait's own sales say against the final model, applied or not,
        # so the traits still on v1 can be reviewed against their sales.
        implied = sales_anchors(recs, base, premium)
        for entry in audit:
            v = implied.get((entry['kind'], entry['name']))
            if v is not None:
                entry['sales_implied'] = round(v, 4)
    all_specials = special_multiples(tier2, premium)
    specials = {k: v for k, v in all_specials.items() if k in SALES_PRICED_SPECIALS}

    # Per-side held-out error, so the report stays comparable with the two-fit run.
    n = len(y); k = int(n * 0.8); te = order[k:]
    side_err = {}
    for name, want in (('bid', 'BID'), ('ask', 'ASK')):
        m = [i for i in te if recs[i]['side'] == want]
        side_err[name] = float(np.median(np.abs(np.exp(mdl.predict(X[m]) - y[m]) - 1.0))) if m else None

    print(f"=== single fit, settlement side as a feature ===")
    print(f"  alpha {alpha}  | weighted R^2 {r2:.3f}  | holdout median err {holdout_err:.1%}")
    print(f"  per-side holdout: bid {side_err['bid']:.1%}  ask {side_err['ask']:.1%}")
    print(f"  fitted ask premium: {premium:.4f}x  ({premium - 1:+.1%})")
    print(f"  baseline floor-multiple: bid {base['baseline_multiple']:.2f}x  "
          f"ask {base['baseline_multiple'] * premium:.2f}x")
    print(f"  fitted flags: " + ", ".join(f"{k} {v:.3f}x" for k, v in base['extra'].items()))
    moved = sorted((a for a in audit if a.get('prior_source') == 'sales'),
                   key=lambda a: -abs(math.log(a['prior'] / a['v1_prior'])))[:10]
    if moved:
        print(f"  largest moves off v1 (n = sales, w = weight left on the fit):")
        for a in moved:
            print(f"    {a['kind']:<6} {a['name']:<14} n={a['n']:<5} w={a['w']:<5} "
                  f"v1 {a['v1_prior']:>7.2f}x -> sales {a['prior']:>7.2f}x => {a['blended']:>7.2f}x")
    for typ, sp in specials.items():
        print(f"  Tier-2 {typ:<8} {sp['multiple']:6.2f}x the floor index, bid  ({sp['n']} sales, last {sp['last_sale']})")
    if 'ddtf_biome_beta' in base:
        print(f"  DDTF x ln(biome prior) beta {base['ddtf_biome_beta']:+.3f} "
              f"(biome 0 in Daydream/Terraform x{base['mode_biome']['DDTF'].get('0', 1):.3f})")

    result['meta']['alpha_selection'] = 'single fit, side as a feature'
    result['meta']['side_model'] = 'dummy'
    result['ask_premium'] = {'value': round(premium, 6),
                             'note': 'ask = bid x this. One fit, is-ask indicator; '
                                     'guarantees ask >= bid for every parcel.'}
    if specials:
        result['special_multiples'] = specials
    # Every Tier-2 type's sales, applied or not, for review.
    result['special_sales'] = all_specials
    shared = dict(alpha=alpha, holdout_median_pct_err=holdout_err,
                  weighted_r2=r2, n=len(y), prior_audit=audit)
    for label, bid_share, mult_base in (
            ('money_sword_off', 0.80, base['baseline_multiple']),
            ('money_sword_on', 0.20, base['baseline_multiple'] * premium)):
        mult = {**base, 'baseline_multiple': mult_base}
        result[label] = {'label': label, 'bid_share': bid_share,
                         'holdout_median_pct_err': side_err['bid' if bid_share > 0.5 else 'ask'],
                         **{k: v for k, v in shared.items() if k != 'holdout_median_pct_err'},
                         'multipliers': mult}


def main():
    mt, override_ids, flags = load_aux()
    recs, tier2, dropped = load_records(mt, override_ids, flags)
    # The interaction needs the v1 biome priors whatever PRIOR_K is.
    priors = json.load(open(PRIORS))
    # A/B mode: train on the oldest (1-frac); hold out the newest frac for ab_vs_v1.js.
    ab_frac = float(os.environ.get('AB_TEST_FRAC', 0))
    cutoff = None
    if ab_frac > 0:
        us = sorted(r['u'] for r in recs)
        cutoff = us[int(len(us) * (1 - ab_frac))]
        recs = [r for r in recs if r['u'] <= cutoff]
        print(f"A/B mode: train on sales <= {time.strftime('%Y-%m-%d', time.gmtime(cutoff))} "
              f"(cutoff {cutoff}); {len(recs)} train records (test = newest {ab_frac:.0%})")
    out_path = os.path.join(HERE, 'pricing-v2-coeffs-train.json') if cutoff else OUT
    n_rare_zones, n_rare_sales = pool_rare_zones(recs, MIN_ZONE_N)
    print(f"Pooled {n_rare_zones} thin zones (<{MIN_ZONE_N} sales, {n_rare_sales} sales) → 'ZONE_rare'")
    X, cols = build_design(recs, priors)
    y = np.array([r['y'] for r in recs])
    u = [r['u'] for r in recs]
    print(f"Records: {len(recs)} eligible structural sales "
          f"({sum(r['side']=='BID' for r in recs)} BID / {sum(r['side']=='ASK' for r in recs)} ASK; "
          f"{sum(r['sweep'] for r in recs)} of them sweep legs at their own price)")
    print(f"Dropped: {dict(dropped)}")
    print(f"Features: {len(cols)}  |  half-life {HALF_LIFE_D:.0f}d\n")

    # raw side gap (motivates the split): median multiple by side
    med_bid = np.median([r['mult'] for r in recs if r['side'] == 'BID'])
    med_ask = np.median([r['mult'] for r in recs if r['side'] == 'ASK'])
    print(f"Raw median floor-multiple — BID {med_bid:.2f}x  vs  ASK {med_ask:.2f}x "
          f"(ask premium {med_ask/med_bid-1:+.0%})\n")

    result = {'meta': {
        'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'target': 'ln(price_native / floor_at_sale)',
        'floor': 'endogenous p12 trailing index (build_floor_index.js)',
        'half_life_days': HALF_LIFE_D,
        'estimator': 'weighted Ridge (alpha by CV)' if ALPHA == 'cv' else f'weighted Ridge (alpha {ALPHA}, fixed)',
        'n_eligible': len(recs), 'features': len(cols),
        'train_cutoff_unix': cutoff,
        'reference_parcel': {'zone': REF_ZONE, 'biome': REF_BIOME, 'level': 'interior L4-17',
                             'chroma': 'Flow', 'mode': 'Terrain'},
        'prior_k': PRIOR_K,
        'priors': 'v1-priors.json (build_priors.js), except sales_anchored' if PRIOR_K > 0 else 'none (pure data fit)',
        'sales_anchored': sorted(f'{k} {n}' for k, n in SALES_ANCHORED) if ANCHOR_SALES else [],
        'specials_from_sales': sorted(SALES_PRICED_SPECIALS),
        'fixed_premiums': {f'{k} {n}': v for (k, n), v in FIXED_PREMIUMS.items()},
        'sweeps': ('multi-parcel legs at their own price included; one seller repeating one price '
                   f'at >= {BUNDLE_MIN_FLOOR_MULTIPLE}x floor = a bundle order, excluded') if INCLUDE_SWEEPS else 'excluded',
        'n_sweep_legs': sum(r['sweep'] for r in recs),
        'penthouse_spine': 'Spine adds nothing on level 20',
        'excluded': 'override specials (Godmode/Plague/seeds/Lith0), Plague chroma, bundles, wash, self-trades',
        'fitted_flags': EXTRA_FLAGS,
        'interactions': ['DDTF x ln(v1 biome prior)'] if DDTF_BIOME_INTERACTION else [],
        'caveat': 'mode is current snapshot, not mode-as-of-sale (firstDaydreamTs pending)'}}

    counts = trait_counts(recs)
    if PRIOR_K <= 0:
        priors_for_shrink = {}
    else:
        priors_for_shrink = priors

    if SIDE_MODEL == 'dummy':
        emit_side_dummy(result, recs, X, y, u, cols, counts, priors_for_shrink, priors, tier2)
        json.dump(result, open(out_path, 'w'), indent=1)
        print(f"\nWrote {out_path}")
        return

    sub_models = [('money_sword_off', 0.80), ('money_sword_on', 0.20)]
    # One alpha across sub-models unless explicitly disabled. Both baselines then
    # sit on the same penalty scale, which is what makes off and on comparable to
    # each other for a single parcel. NOTE: necessary but not sufficient — it
    # equalises the baselines and still leaves per-trait coefficients free to
    # cross, which is why SIDE_MODEL='dummy' is the default.
    shared_alpha = (select_shared_alpha(recs, X, y, u, [bs for _, bs in sub_models])
                    if os.environ.get('SHARED_ALPHA', '1') != '0' else None)
    result['meta']['alpha_selection'] = 'shared (worst-side holdout)' if shared_alpha is not None else 'per sub-model'

    for label, bid_share in sub_models:
        mdl, diag = fit_submodel(recs, X, y, u, label, bid_share, alpha=shared_alpha)
        mult = coeffs_to_multipliers(mdl, cols, priors)
        audit = shrink_to_priors(mult, counts, priors_for_shrink, PRIOR_K)
        # The reference levels carry no dummy, so state their 1.0 explicitly rather
        # than leaving consumers to infer it from a missing key.
        mult['zone'][REF_ZONE] = 1.0
        mult['biome'][REF_BIOME] = 1.0
        result[label] = {**diag, 'multipliers': mult, 'prior_audit': audit}
        print(f"=== {label}  (BID mass {bid_share:.0%}/ ASK {1-bid_share:.0%}) ===")
        print(f"  alpha {diag['alpha']}  | weighted R^2 {diag['weighted_r2']:.3f}"
              f"  | holdout median err {diag['holdout_median_pct_err']:.1%}")
        print(f"  baseline floor-multiple: {mult['baseline_multiple']:.2f}x")
        zr = sorted(mult['zone'].items(), key=lambda t: -t[1])
        print(f"  top zones:  " + ", ".join(f"{k} {v:.2f}x" for k, v in zr[:5]))
        print(f"  low zones:  " + ", ".join(f"{k} {v:.2f}x" for k, v in zr[-3:]))
        print(f"  chroma: " + ", ".join(f"{k} {v:.2f}x" for k, v in mult['chroma'].items())
              + "  (Flow=1.00 base)")
        print(f"  mode:   " + ", ".join(f"{k} {v:.2f}x" for k, v in mult['mode'].items())
              + "  (Terrain=1.00 base)")
        lv = mult['level']
        print(f"  level extremes: " + ", ".join(f"L{k} {lv[k]:.2f}x" for k in
              ['1', '2', '20', '19'] if k in lv))
        print(f"  badges: " + ", ".join(f"{k} {v:.2f}x" for k, v in mult['badge'].items()))
        if audit:
            # Where the prior did the most work. These are the coefficients the raw
            # fit got wrong for lack of data, so they are the ones worth eyeballing.
            moved = sorted(audit, key=lambda a: -abs(math.log(a['blended'] / a['fitted'])))[:6]
            print(f"  largest prior corrections (n = eligible sales, w = data weight):")
            for a in moved:
                print(f"    {a['kind']:<6} {a['name']:<14} n={a['n']:<5} w={a['w']:<5} "
                      f"fitted {a['fitted']:>7.2f}x -> prior {a['prior']:>7.2f}x "
                      f"=> {a['blended']:>7.2f}x")
        print()

    json.dump(result, open(out_path, 'w'), indent=2)
    print(f"Wrote {out_path}")

if __name__ == '__main__':
    main()
