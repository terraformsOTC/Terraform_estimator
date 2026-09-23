'use client';

import { useEffect, useState, useCallback } from 'react';
import { API_URL, Footer } from '@/components/shared';

// Operator dashboard. Unlisted, noindex, not in the sitemap and not in the menu —
// reachable only by typing the URL.
//
// It exists because of 2026-09-23: every estimate ran ~15% high for three weeks
// and nothing surfaced it. The coefficients were fitted once and their floor
// calibration with them, and neither had a visible age. An uptime check would
// have been green the whole time, because the API was working perfectly — it was
// answering with stale numbers.
//
// So the top line here is not "is it up", it is "how old is what it is telling
// people". Everything else is context for that question.

// `coarse` drops the decimal. The model rows want the tenth of an hour — the
// whole point there is how close the age is to the 48h threshold. A commit list
// does not: "4d ago" says everything "4.1d ago" was trying to.
function ago(iso, { coarse = false } = {}) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '—';
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  const h = s / 3600, d = s / 86400;
  if (s < 172800) return `${coarse ? Math.round(h) : h.toFixed(1)}h ago`;
  return `${coarse ? Math.round(d) : d.toFixed(1)}d ago`;
}

const COLLAPSED_COMMITS = 25;

const GOOD = '#4ade80';
const WARN = '#fbbf24';
const BAD = '#f87171';
const DIM = 'rgba(232,232,232,0.45)';

function Row({ label, value, color, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderBottom: '1px solid rgba(232,232,232,0.06)' }}>
      <span className="text-xs opacity-50 whitespace-nowrap">{label}</span>
      <span className="text-sm text-right" style={color ? { color } : undefined}>
        {value}
        {hint && <span className="text-xs opacity-35 ml-2">{hint}</span>}
      </span>
    </div>
  );
}

function Panel({ title, status, children }) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-sm tracking-widest uppercase opacity-60 m-0 font-normal">{title}</h2>
        {status && <span className="text-xs" style={{ color: status.color }}>{status.label}</span>}
      </div>
      {children}
    </section>
  );
}

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState(null);
  const [logError, setLogError] = useState(null);
  // 25 is enough to see what shipped this week; the rest is there on request.
  const [logExpanded, setLogExpanded] = useState(false);

  const load = useCallback(() => {
    // Same-origin, through src/app/api/feed — which forwards /health uncached.
    //
    // This used to call the Render origin directly and was the only page left
    // doing so, every other feed having moved behind the proxy. That made it the
    // only page that could fail on anything specific to that hostname: a blocking
    // extension, DNS, a VPN, or the origin waking from idle. Same-origin removes
    // the whole class, and inherits the CSP 'self' allowance for free.
    fetch('/api/feed/health', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => {
        // "Failed to fetch" on its own tells an operator nothing about which hop
        // broke, and this page exists for exactly the moment something has.
        setError(`${e.message} — /api/feed/health did not answer. Check the API at ${API_URL}/health directly.`);
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Once on mount, not on the 60s tick: commits change far more slowly than the
  // model ages, and the route is edge-cached for five minutes anyway.
  useEffect(() => {
    fetch('/api/changelog')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        return d;
      })
      .then(setLog)
      .catch((e) => setLogError(e.message));
  }, []);

  const model = data?.model;
  const calib = data?.calibration;
  const modelColor = model ? (model.stale ? BAD : model.ageHours > 26 ? WARN : GOOD) : DIM;
  const calibColor = calib ? (calib.stale ? BAD : calib.ageHours > 26 ? WARN : GOOD) : DIM;

  return (
    <div className="content-wrapper">
      <main className="flex-1 px-6 pt-8 max-w-2xl">
        <h1 className="text-[1.35rem] md:text-[1.6875rem] m-0 font-normal mb-8">estimator health</h1>

        {error && (
          <div className="mb-8 text-sm" style={{ color: BAD }}>
            [api unreachable: {error}]
          </div>
        )}

        {data && (
          <>
            <div
              className="mb-10 px-4 py-3 text-sm"
              style={{ border: `1px solid ${data.stale ? BAD : GOOD}`, color: data.stale ? BAD : GOOD }}
            >
              {data.stale
                ? 'STALE — the model or its calibration is over 48h old. Estimates may be drifting. Check the daily refit on the mac mini.'
                : 'Model and calibration are current. Estimates are being priced off fresh data.'}
            </div>

            <Panel title="Pricing model" status={{ label: model.stale ? 'stale' : 'fresh', color: modelColor }}>
              <Row label="fitted" value={ago(model.built)} color={modelColor} hint={model.built?.slice(0, 16).replace('T', ' ')} />
              <Row label="age" value={model.ageHours != null ? `${model.ageHours}h` : '—'} color={modelColor} hint={`stale after ${data.staleAfterHours}h`} />
              <Row label="sales fitted" value={model.salesFitted?.toLocaleString() ?? '—'} />
              <Row label="median model error" value={model.holdoutMedianPctErr != null ? `${(model.holdoutMedianPctErr * 100).toFixed(1)}%` : '—'}
                   hint="against the newest 20% of sales, held out of the fit" />
              <Row label="baseline multiple" value={model.baselineMultiple?.toFixed(4) ?? '—'} />
              <Row label="half-life" value={model.halfLifeDays ? `${model.halfLifeDays}d` : '—'} hint={`${model.features ?? '—'} features`} />
              <Row label="version" value={model.version ?? '—'} />
            </Panel>

            <Panel title="Floor">
              <Row label="live floor" value={data.floor ? `${data.floor.eth.toFixed(4)} ETH` : '—'}
                   color={data.floor?.isLive ? undefined : WARN}
                   hint={data.floor?.isLive ? 'cheapest ask' : 'fallback — alchemy unreachable'} />
              <Row label="top collection bid" value={data.floor?.topBid ? `${data.floor.topBid.toFixed(4)} WETH` : '—'} />
              <Row label="synthetic floor" value={data.floor && calib.value ? `${(data.floor.eth * calib.value).toFixed(4)} ETH` : '—'}
                   hint="every estimate is built from this — compare to recent sale prices" />
              <Row label="history samples" value={data.data?.floorHistorySamples ?? '—'} />
            </Panel>

            <Panel title="Floor calibration" status={{ label: calib.stale ? 'stale' : 'fresh', color: calibColor }}>
              <Row label="recent sale-to-ask ratio" value={calib.value ?? '—'} color={calibColor}
                   hint={calib.value ? `live floor x ${calib.value}` : null} />
              <Row label="measured" value={ago(calib.measuredAt)} color={calibColor} hint={calib.measuredFromDay} />
              <Row label="4-month average" value={calib.historyMedian ?? '—'} />
            </Panel>

            <Panel title="Feed caches">
              {Object.entries(data.feeds || {}).map(([name, f]) => (
                <Row
                  key={name}
                  label={name}
                  value={f.warm ? ago(new Date(Date.now() - f.ageSeconds * 1000).toISOString()) : 'cold'}
                  color={f.warm ? (f.ageSeconds > 3600 ? WARN : GOOD) : WARN}
                  hint={[f.refreshing ? 'refreshing' : null, f.lastFailureAt ? 'had a failure' : null].filter(Boolean).join(' · ') || null}
                />
              ))}
            </Panel>

            <Panel title="Data">
              <Row label="minted parcels indexed" value={data.data?.mintedTraitsSnapshot?.toLocaleString() ?? '—'} hint="of 9,911" />
              <Row label="unminted parcels" value={data.data?.unmintedParcels?.toLocaleString() ?? '—'} />
              <Row label="api uptime" value={data.uptimeSeconds != null ? `${(data.uptimeSeconds / 3600).toFixed(1)}h` : '—'} />
            </Panel>
          </>
        )}

        <Panel title="Changelog">
          {logError && <p className="text-sm" style={{ color: WARN }}>[{logError}]</p>}
          {!log && !logError && <p className="text-sm opacity-40">[loading...]</p>}
          {log && (
            <>
              {(logExpanded ? log.commits : log.commits.slice(0, COLLAPSED_COMMITS)).map((c) => (
                <div key={c.sha} className="flex items-baseline justify-between gap-3 py-0.5">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs opacity-75 hover:opacity-100 no-underline truncate"
                  >
                    {c.title}
                  </a>
                  <span className="text-xs opacity-30 whitespace-nowrap">
                    {ago(c.date, { coarse: true })}
                  </span>
                </div>
              ))}
              {!logExpanded && log.commits.length > COLLAPSED_COMMITS && (
                <button
                  type="button"
                  onClick={() => setLogExpanded(true)}
                  className="mt-2 bg-transparent border-none cursor-pointer p-0 font-inherit text-xs opacity-50 hover:opacity-100"
                >
                  [see full changelog — {log.commits.length} changes]
                </button>
              )}
              <p className="mt-3 text-xs opacity-35">
                {logExpanded ? `Last ${log.commits.length} changes to main` : `Last ${Math.min(COLLAPSED_COMMITS, log.commits.length)} of ${log.commits.length} changes to main`}
                {log.automatedCount > 0
                  ? ` · ${log.automatedCount} automated floor snapshots hidden`
                  : ''}
              </p>
            </>
          )}
        </Panel>

        {!data && !error && <p className="text-sm opacity-50">[loading...]</p>}
      </main>
      <Footer />
    </div>
  );
}
