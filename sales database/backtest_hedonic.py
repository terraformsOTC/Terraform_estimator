#!/usr/bin/env python3
"""Rolling-origin backtest for the hedonic fit: how its settings are chosen.

Every STEP_D days across the scored period: fit on the sales up to that day exactly
as fit_hedonic.py does (fit_multipliers — ridge, priors, sales anchors, fixed
premiums), solve the level constant on the single sales of the 30 days before (as
calibrate-floor.js does in production), and price the next STEP_D days of sales.
Error is |predicted / price - 1| on the side each sale settled on, at the floor
index, so it measures the SHAPE of the model; production re-solves the level daily.
Reported as the median (MdAPE) per scored year, overall and by segment.

Why not fit_hedonic.py's holdout_eval: it scores the newest 20% of the DB, right
next to its training data, and its alpha pick was the worst of the grid on sales
that came later. A backtest like this one chose H=180 / alpha=3 on 2026-09-23; this
is its rebuild (2026-10-20), after sweep legs and sales anchors joined the fit.

Usage:  .venv/bin/python backtest_hedonic.py [--grid default|current] [--workers N]
Writes backtest-results.json next to itself (not tracked) and prints a summary.
"""
import os, sys, json, math, time, argparse, itertools
from collections import defaultdict
from multiprocessing import Pool
import numpy as np
import fit_hedonic as fh

DAY = 86400
STEP_D = 14                # refit every two weeks, price the two weeks after
CALIB_D = (14, 30, 60)     # level-constant windows; production uses 30
MIN_CALIB = 10             # sales a window needs before its constant is used
YEARS = [('2024-10-20', '2025-10-20'), ('2025-10-20', '2026-10-20')]
CURRENT = dict(half_life=180, alpha=3, prior_k=120, sweeps='pool', anchors=True)

GRIDS = {
    # Every setting the fit exposes, around the current ones.
    'default': dict(half_life=[90, 120, 180, 270, 365], alpha=[1, 3, 10, 30],
                    prior_k=[30, 60, 120, 240, 480], sweeps=['off', 'pairs', 'pool', 'dummy'], anchors=[True]),
    # The current settings, with and without each of the October changes.
    'current': dict(half_life=[180], alpha=[3], prior_k=[120], sweeps=['off', 'pairs', 'pool', 'dummy'],
                    anchors=[True, False]),
}

# The strongest of the default grid (2026-10-20), re-scored with the daily level.
FINALISTS = [
    dict(half_life=365, alpha=1, prior_k=120, sweeps='off', anchors=True),
    dict(half_life=270, alpha=1, prior_k=120, sweeps='off', anchors=True),
    dict(half_life=180, alpha=1, prior_k=120, sweeps='off', anchors=True),
    dict(half_life=120, alpha=1, prior_k=240, sweeps='off', anchors=True),
    dict(half_life=180, alpha=1, prior_k=240, sweeps='dummy', anchors=True),
    dict(half_life=120, alpha=1, prior_k=120, sweeps='dummy', anchors=True),
    dict(half_life=180, alpha=1, prior_k=240, sweeps='pool', anchors=True),
]

def unix(day):
    return int(time.mktime(time.strptime(day, '%Y-%m-%d')))

_DATA = None
def data():
    """All eligible sales, sweep legs included (each record says which), loaded
    once per worker."""
    global _DATA
    if _DATA is None:
        fh.INCLUDE_SWEEPS = True
        fh.SWEEP_MODEL = 'pool'   # load every leg; each config picks its own (keep_sweep)
        mt, override_ids, flags = fh.load_aux()
        recs, _, _ = fh.load_records(mt, override_ids, flags)
        recs.sort(key=lambda r: r['u'])
        _DATA = (recs, json.load(open(fh.PRIORS)))
    return _DATA

def keep_sweep(r, mode):
    """Which sweep legs a config trains on: none ('off'), all ('pool', 'dummy'),
    those priced at >= 1.5x the floor — picked, not swept up cheap ('priced') —
    or those from two-parcel carts ('pairs')."""
    if not r['sweep'] or mode in ('pool', 'dummy'):
        return True
    if mode == 'priced':
        return r['mult'] >= fh.BUNDLE_MIN_FLOOR_MULTIPLE
    if mode == 'pairs':
        return r['tx_legs'] == 2
    return False

def run_origin(job):
    """Fit every config on the sales up to `origin` and price the window after.

    Returns the test sales' segments, and per config the level constants and the
    raw model/price ratios, so the aggregation can score any level window and the
    oracle (the test window's own constant) without refitting."""
    origin, configs = job
    recs, priors = data()
    train_all = [r for r in recs if r['u'] <= origin]
    test = [r for r in recs if origin < r['u'] <= origin + STEP_D * DAY]
    if not test or len(train_all) < 1000:
        return None
    counts_all = fh.trait_counts(train_all)
    segments = [{
        'u': r['u'],
        'sweep': r['sweep'],
        # A sale whose parcel has a trait with fewer than PRIOR_K sales so far.
        'rare': any(counts_all[k].get(n, 0) < 120 for k, n in fh.trait_keys(r)),
        # The parcel's mode group when it sold (views.sql; build_dream_history.js).
        'mode': r['mode_group'],
    } for r in test]
    calib = {d: [r for r in train_all if r['u'] > origin - d * DAY and not r['sweep']] for d in CALIB_D}
    # Singles from the 30 days before the window, for the daily level (production
    # re-solves the constant every day on the trailing 30 days).
    trail = calib[60]

    designs, results = {}, []
    for cfg in configs:
        if cfg['sweeps'] not in designs:
            train = [r for r in train_all if keep_sweep(r, cfg['sweeps'])]
            X, cols = fh.build_design(train, priors, sweep_model=cfg['sweeps'])
            designs[cfg['sweeps']] = (train, X, np.array([r['y'] for r in train]),
                                      [r['u'] for r in train], cols, fh.trait_counts(train))
        train, X, y, u, cols, counts = designs[cfg['sweeps']]
        w = fh.recency_weights(u, cfg['half_life'])
        _, premium, mult, _ = fh.fit_multipliers(
            train, X, y, w, cols, counts, priors, priors, cfg['alpha'],
            prior_k=cfg['prior_k'], anchored=None if cfg['anchors'] else set())
        consts = {}
        for d in CALIB_D:
            ratios = sorted(math.exp(r['y'] - fh.predict_log(r, mult, premium)) for r in calib[d])
            consts[d] = ratios[len(ratios) // 2] if len(ratios) >= MIN_CALIB else None
        # model / price, before the level constant
        raw = [math.exp(fh.predict_log(r, mult, premium) - r['y']) for r in test]
        # premium parcels: a bid-side model multiple above 2x the floor index
        prem = [math.exp(fh.predict_log({**r, 'side': 'BID'}, mult, premium)) > 2 for r in test]
        trail_raw = [math.exp(fh.predict_log(r, mult, premium) - r['y']) for r in trail]
        results.append({'consts': consts, 'raw': raw, 'premium': prem, 'trail_raw': trail_raw})
    return {'origin': origin, 'segments': segments, 'results': results,
            'trail_u': [r['u'] for r in trail]}

def daily_constants(run, res, days=30):
    """The level constant each test sale would have had in production: the
    median actual/model over the single sales of the `days` before its day,
    including earlier sales in the same window, with this window's fitted shape."""
    pts = sorted([(u, 1 / raw) for u, raw in zip(run['trail_u'], res['trail_raw'])]
                 + [(sg['u'], 1 / raw) for sg, raw in zip(run['segments'], res['raw']) if not sg['sweep']])
    out = []
    for sg in run['segments']:
        day0 = sg['u'] - sg['u'] % DAY
        vals = [v for u, v in pts if day0 - days * DAY <= u < day0]
        out.append(float(np.median(vals)) if len(vals) >= MIN_CALIB else None)
    return out

def mdape(errs):
    return float(np.median(errs)) if errs else float('nan')

def score(runs, ci, window=30):
    """Per scored year: MdAPE overall and by segment for config ci, with the level
    constant from `window` days ('oracle' = the test window's own median)."""
    out = {}
    for yi, (a, b) in enumerate(YEARS):
        lo, hi = unix(a), unix(b)
        buckets = defaultdict(list)
        for run in runs:
            res = run['results'][ci]
            fallback = res['consts'][30] or res['consts'][60] or 1.0
            if window == 'oracle':
                cs = [1 / float(np.median(res['raw']))] * len(res['raw'])
            elif str(window).startswith('daily'):
                days = int(window[5:] or 30)
                cs = [c or fallback for c in daily_constants(run, res, days)]
            else:
                cs = [res['consts'][window] or res['consts'][60] or 1.0] * len(res['raw'])
            for seg, raw, prem, c in zip(run['segments'], res['raw'], res['premium'], cs):
                if not (lo <= seg['u'] < hi):
                    continue
                e = abs(raw * c - 1)
                buckets['all'].append(e)
                buckets['sweep' if seg['sweep'] else 'single'].append(e)
                buckets['premium' if prem else 'floor'].append(e)
                if seg['rare']:
                    buckets['rare'].append(e)
                if not seg['sweep'] and seg.get('mode') in ('Terrain', 'DDTF'):
                    buckets['terrain' if seg['mode'] == 'Terrain' else 'dreamed'].append(e)
        out[f'y{yi + 1}'] = {k: (round(mdape(v) * 100, 2), len(v)) for k, v in buckets.items()}
    return out

def errors_by_run(runs, ci, seg='single', window=30):
    """Per run (one two-week test window): its errors per scored year."""
    out = []
    bounds = [(unix(a), unix(b)) for a, b in YEARS]
    for run in runs:
        res = run['results'][ci]
        fallback = res['consts'][30] or res['consts'][60] or 1.0
        if str(window).startswith('daily'):
            days = int(window[5:] or 30)
            cs = [c or fallback for c in daily_constants(run, res, days)]
        else:
            cs = [res['consts'][window] or fallback] * len(res['raw'])
        per_year = [[] for _ in YEARS]
        for sg, raw, c in zip(run['segments'], res['raw'], cs):
            if seg == 'single' and sg['sweep']:
                continue
            for yi, (lo, hi) in enumerate(bounds):
                if lo <= sg['u'] < hi:
                    per_year[yi].append(abs(raw * c - 1))
        out.append([np.array(e) for e in per_year])
    return out

def paired_bootstrap(runs, ci_a, ci_b, n_boot=2000, seed=7, window=30):
    """MdAPE(a) - MdAPE(b) on single sales per year, with a 95% interval from
    resampling whole test windows (two weeks of sales move together, so single
    sales are not independent draws). Negative = a is more accurate."""
    ea, eb = errors_by_run(runs, ci_a, window=window), errors_by_run(runs, ci_b, window=window)
    rng = np.random.default_rng(seed)
    out = []
    for yi in range(len(YEARS)):
        idx = [i for i in range(len(runs)) if len(ea[i][yi])]
        point = np.median(np.concatenate([ea[i][yi] for i in idx])) - np.median(np.concatenate([eb[i][yi] for i in idx]))
        diffs = []
        for _ in range(n_boot):
            pick = rng.choice(idx, size=len(idx), replace=True)
            diffs.append(np.median(np.concatenate([ea[i][yi] for i in pick]))
                         - np.median(np.concatenate([eb[i][yi] for i in pick])))
        lo, hi = np.percentile(diffs, [2.5, 97.5])
        out.append((point * 100, lo * 100, hi * 100))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--grid', default='default', choices=sorted(GRIDS) + ['finalists'])
    ap.add_argument('--workers', type=int, default=os.cpu_count())
    args = ap.parse_args()
    if args.grid == 'finalists':
        configs = [dict(c) for c in FINALISTS]
    else:
        grid = GRIDS[args.grid]
        configs = [dict(zip(grid, vals)) for vals in itertools.product(*grid.values())]
    if CURRENT not in configs:
        configs.append(dict(CURRENT))

    recs, _ = data()
    newest = recs[-1]['u']
    origins = list(range(unix(YEARS[0][0]), newest - STEP_D * DAY + 1, STEP_D * DAY))
    print(f"{len(configs)} configs x {len(origins)} origins ({YEARS[0][0]} .. "
          f"{time.strftime('%Y-%m-%d', time.gmtime(newest))}), {args.workers} workers")
    t0 = time.time()
    with Pool(args.workers) as pool:
        runs = [r for r in pool.map(run_origin, [(o, configs) for o in origins]) if r]
    print(f"done in {time.time() - t0:.0f}s\n")

    table = []
    for ci, cfg in enumerate(configs):
        s = score(runs, ci)
        # Ranked on single sales: the site prices a parcel sold on its own.
        table.append({**cfg, 'score': s, 'mean': (s['y1']['single'][0] + s['y2']['single'][0]) / 2})
    table.sort(key=lambda t: t['mean'])
    cur = next(t for t in table if all(t[k] == v for k, v in CURRENT.items()))
    best = table[0]

    def line(t, tag=''):
        s = t['score']
        return (f"H={t['half_life']:<3} a={t['alpha']:<4} K={t['prior_k']:<4} sweeps={t['sweeps']:<5} "
                f"anchors={'on ' if t['anchors'] else 'off'} | all {s['y1']['all'][0]:5.2f} / {s['y2']['all'][0]:5.2f}"
                f" | singles {s['y1']['single'][0]:5.2f} / {s['y2']['single'][0]:5.2f}"
                f" | rare {s['y1']['rare'][0]:5.2f} / {s['y2']['rare'][0]:5.2f}"
                f" | premium {s['y1']['premium'][0]:5.2f} / {s['y2']['premium'][0]:5.2f}  {tag}")
    print("MdAPE % (year 1 / year 2), level constant from the prior 30 days; ranked on singles")
    for t in table[:12]:
        print(line(t, '<- current' if t is cur else ''))
    if cur not in table[:12]:
        print('...'); print(line(cur, '<- current'))
    n = {k: (best['score']['y1'][k][1], best['score']['y2'][k][1]) for k in ('all', 'single', 'sweep', 'rare', 'premium')}
    print(f"\ntest sales per year: {n}")
    cs = cur['score']
    print("current config by mode at the sale, single sales (MdAPE %, n): "
          + " | ".join(f"{m} {cs['y1'].get(m, (float('nan'), 0))[0]:.2f} ({cs['y1'].get(m, (0, 0))[1]}) / "
                       f"{cs['y2'].get(m, (float('nan'), 0))[0]:.2f} ({cs['y2'].get(m, (0, 0))[1]})" for m in ('terrain', 'dreamed')))
    ci_best = configs.index({k: best[k] for k in CURRENT})
    ci_cur = configs.index(dict(CURRENT))
    if ci_best != ci_cur:
        for yi, (pt, lo, hi) in enumerate(paired_bootstrap(runs, ci_best, ci_cur)):
            print(f"best - current, singles, year {yi + 1}: {pt:+.2f}pp (95% {lo:+.2f} .. {hi:+.2f})")
    for window in (14, 60, 'oracle'):
        s = score(runs, ci_best, window)
        print(f"best config, level from {window} days: singles {s['y1']['single'][0]:.2f} / {s['y2']['single'][0]:.2f}")
    if args.grid == 'finalists':
        print("\nwith the level re-solved daily, as production does (singles; rare; premium):")
        ci_cur = configs.index(dict(CURRENT))
        for ci, cfg in enumerate(configs):
            s = score(runs, ci, 'daily')
            tag = '  <- current' if ci == ci_cur else ''
            print(f"  H={cfg['half_life']:<3} a={cfg['alpha']:<3} K={cfg['prior_k']:<4} {cfg['sweeps']:<5} | "
                  f"singles {s['y1']['single'][0]:5.2f} / {s['y2']['single'][0]:5.2f} | rare {s['y1']['rare'][0]:5.2f} / "
                  f"{s['y2']['rare'][0]:5.2f} | premium {s['y1']['premium'][0]:5.2f} / {s['y2']['premium'][0]:5.2f}{tag}")
            if ci != ci_cur:
                b = paired_bootstrap(runs, ci, ci_cur, n_boot=1000, window='daily')
                print("      vs current: " + "  ".join(f"y{yi + 1} {pt:+.2f}pp ({lo:+.2f}..{hi:+.2f})" for yi, (pt, lo, hi) in enumerate(b)))
    if args.grid == 'finalists':
        print("\nlevel window (days of single sales the daily constant looks back over), singles:")
        for ci in (configs.index(dict(CURRENT)), 1):
            cfg = configs[ci]
            parts = []
            for d in (7, 14, 30, 60):
                s = score(runs, ci, f'daily{d}')
                parts.append(f"{d}d {s['y1']['single'][0]:5.2f} / {s['y2']['single'][0]:5.2f}")
            o = score(runs, ci, 'oracle')
            print(f"  H={cfg['half_life']} a={cfg['alpha']} K={cfg['prior_k']} {cfg['sweeps']}: " + " | ".join(parts)
                  + f" | perfect level {o['y1']['single'][0]:.2f} / {o['y2']['single'][0]:.2f}")
    json.dump({'configs': table, 'origins': len(runs), 'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
              open(os.path.join(fh.HERE, 'backtest-results.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
