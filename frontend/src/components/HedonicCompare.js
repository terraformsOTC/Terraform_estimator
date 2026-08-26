// Presentation for the /hedonic staging page. Pure functions of their props and
// deliberately kept out of the route file so they can be rendered against fixture
// payloads without standing up the whole page.

export function HedonicScorecard({ scorecard }) {
  if (!scorecard) return null;
  const { n, v1, v2, v2Wins } = scorecard;
  // Lower median absolute error is better. Stated as a delta as well as two
  // numbers because "10.0% vs 9.7%" reads as a tie until you see it is 0.3pp.
  const delta = (v2 - v1) * 100;
  const leader = Math.abs(delta) < 0.05 ? null : (delta < 0 ? 'v2' : 'v1');

  return (
    <div className="mb-8 max-w-2xl">
      <p className="text-xs opacity-60 uppercase tracking-widest mb-2">live scorecard</p>
      <div className="flex gap-8 flex-wrap text-sm">
        <div>
          <p className="text-xs opacity-50">v1 median abs error</p>
          <span>{(v1 * 100).toFixed(1)}%</span>
        </div>
        <div>
          <p className="text-xs opacity-50">v2 median abs error</p>
          <span>{(v2 * 100).toFixed(1)}%</span>
        </div>
        <div>
          <p className="text-xs opacity-50">v2 closer</p>
          <span>{v2Wins}/{n}</span>
        </div>
      </div>
      <p className="text-xs opacity-45 mt-2">
        over {n} settled sales in the current feed, each scored against the sub-model matching how it
        settled — a WETH fill is an accepted bid, native ETH a taken listing.{' '}
        {leader
          ? `${leader} is ahead by ${Math.abs(delta).toFixed(1)}pp.`
          : 'the two are at parity.'}
      </p>
    </div>
  );
}

// The fitted multiples that produced the band, in the order they compound.
// This is the part a backtest cannot show: whether v2 disagrees with v1 for a
// reason that survives looking at it.
export function HedonicBreakdown({ pricingV2, v1 }) {
  if (!pricingV2) return null;
  const { off, on, offMultiple, onMultiple, tier, tierReason, floor, effectiveFloor, floorCalibration, breakdown, modelVersion } = pricingV2;

  if (tier === 'tier2') {
    return (
      <div className="mt-10 max-w-2xl">
        <p className="text-xs opacity-60 uppercase tracking-widest mb-2">breakdown</p>
        <p className="text-sm opacity-70">
          {tierReason} — too few settled sales to fit, so v2 returns v1&apos;s price ({on.toFixed(3)} ETH) unchanged.
        </p>
      </div>
    );
  }

  // subModelMultiple only pushes a factor whose multiple isn't exactly 1, so the
  // two lists can differ in length — zipping by index would print a bid multiple
  // against the wrong ask label. They are emitted in the same order by the same
  // code path, so a two-pointer merge on label lines them up and leaves a dash
  // where one side dropped the factor out.
  const a = breakdown?.off || [];
  const b = breakdown?.on || [];
  const rows = [];
  for (let i = 0, j = 0; i < a.length || j < b.length; ) {
    if (i < a.length && j < b.length && a[i].label === b[j].label) {
      rows.push({ label: a[i].label, off: a[i].multiple, on: b[j].multiple });
      i++; j++;
    } else if (i < a.length && b.slice(j).some(p => p.label === a[i].label)) {
      rows.push({ label: b[j].label, off: null, on: b[j].multiple });
      j++;
    } else if (i < a.length) {
      rows.push({ label: a[i].label, off: a[i].multiple, on: null });
      i++;
    } else {
      rows.push({ label: b[j].label, off: null, on: b[j].multiple });
      j++;
    }
  }

  return (
    <div className="mt-10 max-w-2xl">
      <p className="text-xs opacity-60 uppercase tracking-widest mb-2">breakdown</p>

      <div className="flex gap-8 flex-wrap text-sm mb-4">
        <div>
          <p className="text-xs opacity-50">v1</p>
          <span>{v1 != null ? `${v1.toFixed(3)} ETH` : '—'}</span>
        </div>
        <div>
          <p className="text-xs opacity-50">v2 liquidation (bid)</p>
          <span>{off.toFixed(3)} ETH <span className="opacity-50 text-xs">{offMultiple}x</span></span>
        </div>
        <div>
          <p className="text-xs opacity-50">v2 retail (ask)</p>
          <span>{on.toFixed(3)} ETH <span className="opacity-50 text-xs">{onMultiple}x</span></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full min-w-[320px]">
          <thead>
            <tr className="text-xs opacity-50 uppercase tracking-widest text-left">
              <th className="pb-2 pr-4 font-normal">factor</th>
              <th className="pb-2 pr-4 font-normal text-right">bid</th>
              <th className="pb-2 font-normal text-right">ask</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-t" style={{ borderColor: 'rgba(232, 232, 232, 0.08)' }}>
                <td className="py-2 pr-4">{r.label}</td>
                <td className="py-2 pr-4 text-right opacity-80">{r.off ?? '—'}</td>
                <td className="py-2 text-right opacity-80">{r.on ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {off > on && (
        <p className="text-xs mt-3" style={{ color: '#d2a24c' }}>
          band inverted — the bid sub-model prices this parcel above the ask sub-model. Both are fitted
          on the same 20,271 sales, only reweighted (80/20 bid mass vs 20/80), but fit_submodel picks
          each one&apos;s Ridge alpha separately and they landed 1000x apart: 100 for bid, 0.1 for ask.
          The intercept is unpenalised, so heavy shrinkage pushes the level into the baseline (bid
          1.33x floor) while light shrinkage leaves it in the coefficients (ask 0.93x floor) — which
          makes the two baselines incomparable rather than a bid/ask spread. It shows up on plain
          parcels, where no strong trait multiple outweighs that baseline gap: 1,626 of 9,911 tier-1
          parcels (16.4%) overall, but 32% of the plainest sixth against 1.9% of the strongest.
        </p>
      )}

      <p className="text-xs opacity-45 mt-3">
        multiples compound onto {effectiveFloor} ETH
        {floorCalibration !== 1 && (
          <> — the {floor?.toFixed ? floor.toFixed(3) : floor} ETH listing floor scaled by {floorCalibration},
          because the fit&apos;s target divides by an endogenous floor index that sits below the live listing
          floor; applying a fitted multiple to an uncalibrated floor inflates every estimate</>
        )}
        . model {modelVersion}.
      </p>
    </div>
  );
}
