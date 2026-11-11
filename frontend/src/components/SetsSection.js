'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { API_URL } from '@/components/shared';
import ParcelArt from '@/components/ParcelArt';
import { SETS_GLOSSARY, setStyle } from '@/lib/setsGlossary';
import { BLADES, abbreviateGlyphs } from '@/lib/parcelGlyphs';

const BLADE_FONT = "'MathcastlesRemix-Regular', monospace";

// Blade examples (Full blade) also show the blade's glyphs under the label; like
// every example they play the animation only while hovered (ParcelArt), which is
// when a Terraform parcel's raised cells draw the blade.
function ExampleCard({ example }) {
  const { label, tokenId, traits } = example;
  const bladeIndex = /^blade \d+$/.test(label) ? Number(label.slice(6)) - 1 : null;
  const blade = bladeIndex != null ? BLADES[bladeIndex] : null;
  const [head, tail] = blade ? abbreviateGlyphs(blade, 6, 6) : [null, null];
  return (
    <a
      href={`/?token=${tokenId}`}
      className="flex-shrink-0 w-[190px] no-underline"
      style={{ scrollSnapAlign: 'start' }}
    >
      <ParcelArt tokenId={tokenId} width={190} height={274} alt={`Parcel ${tokenId} — ${label}`} />
      <div className="mt-2 flex flex-col gap-0.5">
        <span className="text-sm opacity-90">{label}</span>
        {blade && (
          <span className="text-xs opacity-60 whitespace-pre overflow-hidden" style={{ fontFamily: BLADE_FONT }}>
            {head}{tail != null && <span style={{ fontFamily: "'Courier New', Courier, monospace", opacity: 0.6 }}>{' … '}</span>}{tail}
          </span>
        )}
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

// The sets half of /traits (they had their own /sets page until 2026-10-12;
// that path now redirects to /traits#sets). Fetches its own data so the trait
// list above it renders without waiting on the example parcels.
export default function SetsSection() {
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
    <section id="sets" className="scroll-mt-6">
      <h2 className="text-xs opacity-50 uppercase tracking-widest mb-3">Sets</h2>
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
    </section>
  );
}
