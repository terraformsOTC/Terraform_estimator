'use client';

import { useState, useEffect } from 'react';
import ParcelArt from './ParcelArt';
import { EthIcon, parcelImage, SpecialBadge, SPECIAL_TYPE_BADGES, CATEGORY_COLORS, vsModelColor } from './shared';

// How many cards the rail holds. /listings returns every active listing (~145
// today, ~94 of them Terrain); past the first couple of dozen the "best deal"
// framing stops being true, so the tail is cut rather than scrolled forever.
const MAX_CARDS = 20;
const CARD_W = 168;
const CARD_H = 242;

// A listing is scored against the ASK side of the model (pricingV2.on), the same
// basis /undervalued and the weekly report use: a listing IS an ask, and scoring
// it against the bid side would mark every listing on the site overpriced by the
// width of the spread. The backend already does this and hands us `discount`.
//
// Sign convention matches ListingsView: a positive `discount` means the parcel is
// listed BELOW the model, so it renders as "-10.3%" — the price is that much
// lower than the estimate, not the return that much worse.
function formatPct(discount) {
  const sign = discount >= 0 ? '-' : '+';
  return `${sign}${(Math.abs(discount) * 100).toFixed(1)}%`;
}

function CardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[168px]" aria-hidden="true">
      <div className="bg-placeholder animate-pulse" style={{ width: 168, height: 242 }} />
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="bg-placeholder animate-pulse h-3 w-20" />
        <div className="bg-placeholder animate-pulse h-3 w-28" />
        <div className="bg-placeholder animate-pulse h-3 w-16" />
      </div>
    </div>
  );
}

function ParcelCard({ parcel, rank }) {
  // Flat shape from /listings-slim — no nested traits/pricing objects.
  const { tokenId, listedPrice, discount, mode, specialType, zoneCategory } = parcel;

  const specialBadge = SPECIAL_TYPE_BADGES[
    mode === 'Origin Daydream' ? 'Origin Daydream'
    : mode === 'Origin Terraform' ? 'Origin Terraform'
    : specialType
  ];

  return (
    <a
      href={`/?token=${tokenId}`}
      className="flex-shrink-0 w-[168px] no-underline snap-start group"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div className="relative">
        <ParcelArt tokenId={tokenId} width={CARD_W} height={CARD_H} />
        <span
          className="absolute top-1 left-1 text-xs px-1"
          style={{ background: 'var(--bg-primary)', color: vsModelColor(discount), border: `1px solid ${vsModelColor(discount)}` }}
        >
          {formatPct(discount)}
        </span>
        <span className="absolute top-1 right-1 text-xs px-1 opacity-35" style={{ background: 'var(--bg-primary)' }}>
          #{rank}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm opacity-90">#{tokenId}</span>
          {zoneCategory && zoneCategory !== 'Floor' && (
            <span className="text-xs" style={{ color: CATEGORY_COLORS[zoneCategory], opacity: 0.8 }}>
              {zoneCategory.toLowerCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <EthIcon />
          {listedPrice?.toFixed(3)}
        </div>
        {specialBadge && (
          <div className="flex"><SpecialBadge config={specialBadge} opacity={0.8} /></div>
        )}
      </div>
    </a>
  );
}

export default function BestTerrainCarousel() {
  const [parcels, setParcels] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Same-origin /api/feed/* rather than the backend directly: it is edge-cached
    // on Vercel, which turns a 250ms round trip to Render's single region into a
    // hit from the nearest PoP. listings-slim does the Terrain filter, the sort
    // and the field trimming upstream — this rail was drawing 20 cards out of a
    // 237KB payload of all 145 listings with their full pricing breakdowns.
    fetch(`/api/feed/listings-slim?mode=Terrain&limit=${MAX_CARDS}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed to load listings');
        return d;
      })
      .then((d) => {
        if (cancelled) return;
        setParcels(d.parcels || []);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return null;               // the rail is a bonus; never block the estimator
  if (parcels && parcels.length === 0) return null;

  return (
    <section className="mb-10" aria-label="Best terrain parcels listed">
      {/* Same size, case and weight as the "parcel valuation estimate" heading
          below it — the two are siblings on the page and were reading as
          different levels of the hierarchy. */}
      <h2 className="text-[1.35rem] md:text-[1.6875rem] m-0 font-normal mb-3">
        best terrain parcels listed
      </h2>

      <div
        className="flex gap-4 overflow-x-auto pb-2 carousel-rail"
        style={{ scrollSnapType: 'x mandatory' }}
        tabIndex={0}
      >
        {parcels
          ? parcels.map((p, i) => <ParcelCard key={p.tokenId} parcel={p} rank={i + 1} />)
          : Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </section>
  );
}
