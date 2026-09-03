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
          named look-badges. Override specials (Godmode/Plague/seeds/Lith0)
          excluded -> Tier-2, handled separately with v1 priors.

Outputs:  pricing-v2-coeffs.json  (+ a readable console report)
Deps:     numpy, scikit-learn, stdlib sqlite3/json  (no pandas needed)
"""
import os, sys, json, math, sqlite3, time
from collections import Counter
import numpy as np
from sklearn.linear_model import Ridge

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, os.environ.get('DB_PATH', 'terraforms_sales.db'))
MINTED = os.path.join(HERE, '..', 'backend', 'src', 'minted-traits.json')
SPECIAL = os.path.join(HERE, '..', 'backend', 'src', 'special-tokens.json')
PRIORS = os.path.join(HERE, 'v1-priors.json')
OUT = os.path.join(HERE, 'pricing-v2-coeffs.json')

# 60d chosen by sweep against ab_vs_v1.js (H in {30,45,60,120,365,730,none} x
# K in {0,15,30,60,120}): shorter is better, and the gain is flat below ~60d.
HALF_LIFE_D = float(os.environ.get('HALF_LIFE_DAYS', 60))
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
# Re-check as the feed grows: set ALPHA= to re-test, or ALPHA=cv for the CV pick.
ALPHA = os.environ.get('ALPHA', '10')
# Rare-zone pooling is off by default now that priors exist: shrinking a thin zone
# toward its OWN v1 prior strictly beats merging it into a 'ZONE_rare' bucket that
# averages mythical 1-of-1 zones together with floor zones. Set >0 to re-enable.
MIN_ZONE_N = int(os.environ.get('MIN_ZONE_N', 0))
OVERRIDE_SPECIALS = {'Godmode', 'Plague', 'X-Seed', 'Y-Seed', 'Lith0'}
MODE_GROUP = {'Terrain': 'Terrain', 'Daydream': 'DDTF', 'Terraform': 'DDTF',
              'Origin Daydream': 'ORIG', 'Origin Terraform': 'ORIG'}
# Plan §4.5: level premium lives ONLY at the extremes (basement L1–3, penthouse
# L18–20). Interior levels L4–17 are pooled flat (no dummy → absorbed into the
# baseline, multiplier 1.0). Fitting a free dummy per level instead let thin
# interior cells learn large spurious premiums/discounts from noise — e.g. the
# prior fit priced L17–L19 BELOW floor (0.46–0.60x) and missed L1 entirely.
EXTREME_LEVELS = {1, 2, 3, 18, 19, 20}
# Plausible floor-multiple band; outside = data error / uncaught wash -> drop.
MULT_LO, MULT_HI = 0.25, 40.0

def load_aux():
    mt = {e['tokenId']: e for e in json.load(open(MINTED))}
    special = json.load(open(SPECIAL))
    override_ids = {int(k) for k, v in special.items() if v in OVERRIDE_SPECIALS}
    return mt, override_ids

def load_records(mt, override_ids):
    con = sqlite3.connect(DB)
    rows = con.execute("""
        SELECT token_id, event_unix, price_native, floor_at_sale, side,
               zone, biome, level, mode
        FROM v_model_sales
        WHERE model_eligible=1 AND floor_at_sale > 0 AND price_native > 0
    """).fetchall()
    con.close()
    recs, dropped = [], Counter()
    for tid, u, price, floor, side, zone, biome, level, mode in rows:
        if tid in override_ids:
            dropped['override_special'] += 1; continue
        m = mt.get(tid)
        if m is None:
            dropped['not_in_snapshot'] += 1; continue
        if m['chroma'] == 'Plague':           # Plague = Tier-2 override
            dropped['plague_chroma'] += 1; continue
        mult = price / floor
        if not (MULT_LO <= mult <= MULT_HI):
            dropped['extreme_multiple'] += 1; continue
        recs.append({
            'tid': tid, 'u': int(u), 'y': math.log(mult), 'mult': mult,
            'side': side,
            'zone': zone or m['zone'],
            'biome': str(biome if biome is not None else m['biome']),
            'level': int(level) if (level not in (None, '')) else int(m['level']),
            'mode_group': MODE_GROUP.get(mode or m['mode'], 'Terrain'),
            'chroma': m['chroma'],                 # Flow / Pulse / Hyper
            'mystery': m['mysteryValue'],
        })
    return recs, dropped

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

def build_design(recs):
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
            [f'mode={m}' for m in modes] + [f'badge={b}' for b in badge_names])
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

def coeffs_to_multipliers(mdl, cols):
    out = {'baseline_multiple': float(math.exp(mdl.intercept_)),
           'zone': {}, 'biome': {}, 'level': {}, 'chroma': {}, 'mode': {}, 'badge': {}}
    for c, b in zip(cols, mdl.coef_):
        kind, name = c.split('=', 1)
        # side=ask is the bid/ask spread, not a trait. It scales the baseline, so
        # it is returned separately rather than dropped into a multiplier table
        # that consumers apply per parcel.
        if kind == 'side':
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

def shrink_to_priors(mult, counts, priors, K):
    """Blend each fitted coefficient toward its v1 prior with weight n/(n+K).

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
            prior = pri.get(str(name), 1.0)
            if prior <= 0: prior = 1.0
            if kind != 'badge': prior = prior / base
            n = counts[kind].get(name, 0)
            w = n / (n + K)
            blended = math.exp(w * math.log(fitted) + (1 - w) * math.log(prior))
            mult[kind][name] = round(blended, 4)
            audit.append({'kind': kind, 'name': str(name), 'n': n, 'w': round(w, 3),
                          'fitted': fitted, 'prior': prior, 'blended': round(blended, 4)})
    return audit

def emit_side_dummy(result, recs, X, y, u, cols, counts, priors):
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
    base = coeffs_to_multipliers(mdl, cols)
    audit = shrink_to_priors(base, counts, priors, PRIOR_K)
    base['zone'][REF_ZONE] = 1.0
    base['biome'][REF_BIOME] = 1.0

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

    result['meta']['alpha_selection'] = 'single fit, side as a feature'
    result['meta']['side_model'] = 'dummy'
    result['ask_premium'] = {'value': round(premium, 6),
                             'note': 'ask = bid x this. One fit, is-ask indicator; '
                                     'guarantees ask >= bid for every parcel.'}
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
    mt, override_ids = load_aux()
    recs, dropped = load_records(mt, override_ids)
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
    X, cols = build_design(recs)
    y = np.array([r['y'] for r in recs])
    u = [r['u'] for r in recs]
    print(f"Records: {len(recs)} eligible structural sales "
          f"({sum(r['side']=='BID' for r in recs)} BID / {sum(r['side']=='ASK' for r in recs)} ASK)")
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
        'half_life_days': HALF_LIFE_D, 'estimator': 'weighted Ridge (alpha by CV)',
        'n_eligible': len(recs), 'features': len(cols),
        'train_cutoff_unix': cutoff,
        'reference_parcel': {'zone': REF_ZONE, 'biome': REF_BIOME, 'level': 'interior L4-17',
                             'chroma': 'Flow', 'mode': 'Terrain'},
        'prior_k': PRIOR_K,
        'priors': 'v1-priors.json (build_priors.js)' if PRIOR_K > 0 else 'none (pure data fit)',
        'excluded': 'override specials (Godmode/Plague/seeds/Lith0), Plague chroma, bundles, wash, self-trades',
        'caveat': 'mode is current snapshot, not mode-as-of-sale (firstDaydreamTs pending)'}}

    priors = json.load(open(PRIORS)) if PRIOR_K > 0 else {}
    counts = trait_counts(recs)

    if SIDE_MODEL == 'dummy':
        emit_side_dummy(result, recs, X, y, u, cols, counts, priors)
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
        mult = coeffs_to_multipliers(mdl, cols)
        audit = shrink_to_priors(mult, counts, priors, PRIOR_K)
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
