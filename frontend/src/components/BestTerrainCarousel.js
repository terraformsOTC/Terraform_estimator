'use client';

import { useState, useEffect, useRef } from 'react';
import { API_URL, EthIcon, parcelImage, SpecialBadge, SPECIAL_TYPE_BADGES, CATEGORY_COLORS, vsModelColor } from './shared';

// How many cards the rail holds. /listings returns every active listing (~145
// today, ~94 of them Terrain); past the first couple of dozen the "best deal"
// framing stops being true, so the tail is cut rather than scrolled forever.
const MAX_CARDS = 20;

// Native size of the on-chain tokenHTML document. The card is narrower, so the
// frame is rendered at full size and scaled down — the document has no responsive
// layout of its own and squashes if the frame is simply made smaller.
const ART_W = 277;
const ART_H = 400;
const CARD_W = 168;
const CARD_H = 242;

// A mouse crossing the rail passes over every card on the way. Without this each
// one would mount an iframe against mathcastles and immediately tear it down.
const HOVER_DELAY_MS = 140;

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
  const { tokenId, traits, pricing, listedPrice, discount } = parcel;
  const { mode, specialType } = traits;
  const zoneCategory = pricing?.zoneCategory;
  const [live, setLive] = useState(false);
  const hoverTimer = useRef(null);

  function onArtEnter() {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setLive(true), HOVER_DELAY_MS);
  }
  function onArtLeave() {
    clearTimeout(hoverTimer.current);
    setLive(false);
  }
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

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
      <div
        className="relative"
        style={{ width: CARD_W, height: CARD_H, overflow: 'hidden', border: '1px solid var(--border-color)' }}
        onMouseEnter={onArtEnter}
        onMouseLeave={onArtLeave}
      >
        <img
          src={parcelImage(tokenId)}
          alt={`Parcel ${tokenId}`}
          width={CARD_W}
          height={CARD_H}
          loading="lazy"
          style={{ display: 'block', objectFit: 'cover' }}
        />
        {live && (
          // pointer-events:none so the click still lands on the card's anchor —
          // the frame is sandboxed without allow-same-origin, so a click that
          // reached it would go nowhere.
          <iframe
            src={`https://tokens.mathcastles.xyz/terraforms/token-html/${tokenId}`}
            title={`Parcel ${tokenId} animation`}
            scrolling="no"
            sandbox="allow-scripts"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: ART_W,
              height: ART_H,
              border: 'none',
              display: 'block',
              pointerEvents: 'none',
              transform: `scale(${CARD_W / ART_W})`,
              transformOrigin: 'top left',
            }}
          />
        )}
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
    fetch(`${API_URL}/listings`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed to load listings');
        return d;
      })
      .then((d) => {
        if (cancelled) return;
        // Terrain only — a dreamed or terraformed parcel is a different thing to
        // buy, so it does not belong in a rail about raw land.
        const terrain = (d.parcels || []).filter(p => p?.traits?.mode === 'Terrain');
        terrain.sort((a, b) => b.discount - a.discount);
        setParcels(terrain.slice(0, MAX_CARDS));
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
