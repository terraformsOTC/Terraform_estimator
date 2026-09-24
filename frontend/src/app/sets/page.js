'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Header from '@/components/Header';
import { API_URL, connectAndRedirect, Footer } from '@/components/shared';
import ParcelArt from '@/components/ParcelArt';
import { SETS_GLOSSARY, setStyle } from '@/lib/setsGlossary';

// Examples come from the backend (GET /sets), which picks a Terrain + Flow parcel
// per member so a row differs only in the trait the set is actually about. Where
// no such parcel can exist — Plague is a chroma, Origin is a mode — it falls back
// to the nearest match. The card does not call that out: those two ARE the
// exception the set is about, and the intro no longer sets up Terrain + Flow as a
// rule, so a "· Plague" tag read as a defect rather than the point. The backend
// still returns `exact` for anyone querying /sets directly.
function ExampleCard({ example }) {
  const { label, tokenId, traits } = example;
  return (
    <a
      href={`/?token=${tokenId}`}
      className="flex-shrink-0 w-[158px] no-underline"
      style={{ scrollSnapAlign: 'start' }}
    >
      <ParcelArt tokenId={tokenId} width={158} height={228} alt={`Parcel ${tokenId} — ${label}`} />
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="text-sm opacity-90">{label}</span>
        <span className="text-xs opacity-45">
          #{tokenId} · {traits?.zone}
        </span>
      </div>
    </a>
  );
}

function ExampleRail({ examples }) {
  const railRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => { syncArrows(); }, [examples, syncArrows]);

  function scrollByPage(dir) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 150), behavior: 'smooth' });
  }

  // Arrows only earn their place once the rail actually overflows; a three-parcel
  // set on a desktop fits whole, and two dead buttons above it read as broken.
  const overflows = !atStart || !atEnd;

  return (
    <div>
      {overflows && (
        <div className="flex justify-end gap-1 mb-2">
          <button type="button" className="btn-primary btn-sm" onClick={() => scrollByPage(-1)} disabled={atStart} aria-label="Scroll left">[&lt;]</button>
          <button type="button" className="btn-primary btn-sm" onClick={() => scrollByPage(1)} disabled={atEnd} aria-label="Scroll right">[&gt;]</button>
        </div>
      )}
      <div
        ref={railRef}
        onScroll={syncArrows}
        className="flex gap-3 overflow-x-auto pb-2 carousel-rail"
        style={{ scrollSnapType: 'x mandatory' }}
        tabIndex={0}
      >
        {examples.map(e => <ExampleCard key={`${e.label}-${e.tokenId}`} example={e} />)}
      </div>
    </div>
  );
}

function SetBlock({ set, data }) {
  const style = setStyle(set.name);
  const examples = data?.examples || [];
  // `set.size` rather than data.memberCount: the two full sets are defined by
  // allZones/allBiomes rather than an explicit list, so the backend reports 0
  // members for them. The glossary carries the real figure.
  const size = set.size ?? data?.memberCount ?? null;

  return (
    <section className="mb-14">
      <div className="flex items-baseline gap-3 flex-wrap mb-2">
        <span
          className="text-xs px-1"
          style={{ color: style?.color, border: `1px solid ${style?.color}`, opacity: 0.85 }}
        >
          {set.name}
        </span>
        {size != null && (
          <span className="text-xs opacity-40">{size} parcels</span>
        )}
        {data?.bottleneck && (
          <span className="text-xs opacity-40">bottleneck: {data.bottleneck}</span>
        )}
      </div>

      <p className="text-sm opacity-65 leading-relaxed mb-5 max-w-2xl">{set.description}</p>

      {examples.length > 0 ? (
        <>
          <ExampleRail examples={examples} />
          {data.truncated && (
            <p className="mt-2 text-xs opacity-35">
              Showing {examples.length} of {data.memberCount}.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

export default function SetsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/sets`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'failed to load sets');
        return d;
      })
      .then(d => setData(d.sets))
      .catch(e => setError(e.message));
  }, []);

  const byName = Object.fromEntries((data || []).map(s => [s.name, s]));

  return (
    <div className="content-wrapper">
      <Header onConnect={connectAndRedirect} onDisconnect={() => {}} />
      <main className="flex-1 px-6">
        <div className="mb-6">
          <span className="text-[1.35rem] md:text-[1.6875rem]">
            <a href="/" className="no-underline opacity-60 hover:opacity-100">Estimate</a>
            <span> / </span>
            <span>[sets]</span>
          </span>
        </div>

        <p className="opacity-55 text-sm mb-10 max-w-2xl">
          Sets are groupings of parcels built around a common theme in the collection.
          Some are easy to complete, whilst others are almost impossible. Each set is shown
          here with examples of the parcels required to complete them. The estimator detects
          which sets you hold when you view your collection.
        </p>

        {error && <p className="text-sm opacity-70 mb-8">[error: {error}]</p>}

        {SETS_GLOSSARY.map(set => (
          <SetBlock key={set.name} set={set} data={byName[set.name]} />
        ))}
      </main>
      <Footer />
    </div>
  );
}
