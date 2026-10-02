'use client';

import { useEffect, useRef, useState } from 'react';
import { abbreviateGlyphs, bladeFor, isOriginMode, originGlyphs } from '@/lib/parcelGlyphs';

// The artwork's native viewBox.
const ART_RATIO = 388 / 560;

// The on-chain font that draws blade glyphs. globals.css registers the
// MathcastlesRemix-Extra subset (identical in every parcel's HTML) under the
// Regular name, which is what the unminted animations already use.
const BLADE_FONT = "'MathcastlesRemix-Regular', monospace";

const ROW_STYLE = { borderColor: 'rgba(232,232,232,0.08)' };

function GlyphRow({ label, value, title, fontFamily }) {
  return (
    <div className="flex justify-between items-center gap-4 border-b pb-2 mb-2" style={ROW_STYLE}>
      <span className="text-sm opacity-65 shrink-0">{label}</span>
      <span
        className="text-sm whitespace-pre overflow-hidden text-ellipsis min-w-0"
        title={title}
        style={fontFamily ? { fontFamily } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The parcel's blade — the glyph pattern its raised cells cycle, picked by
 * (biome + seed) as on the mandala tool — and, for Origin parcels, the custom
 * glyph set they animate in its place. Long blades show their opening and
 * closing runs; the full blade is on hover.
 */
export function ParcelGlyphRows({ biome, seed, mode }) {
  const blade = bladeFor(biome, seed);
  const origin = isOriginMode(mode) ? originGlyphs(seed) : null;

  return (
    <>
      {blade && <BladeRow blade={blade} />}
      {origin && <OriginGlyphsRow origin={origin} />}
    </>
  );
}

function BladeRow({ blade }) {
  const [head, tail] = abbreviateGlyphs(blade);
  // The ellipsis is drawn in the page font: in the block font it shrinks to a
  // few dots that read as part of the pattern.
  const value = tail == null ? blade : (
    <>
      {head}
      <span className="opacity-50" style={{ fontFamily: "'Courier New', Courier, monospace" }}>{' … '}</span>
      {tail}
    </>
  );
  return <GlyphRow label="blade" value={value} title={blade} fontFamily={BLADE_FONT} />;
}

function OriginGlyphsRow({ origin }) {
  // Above seed 9000 the parcel runs all 28 sets at once — hundreds of glyphs.
  if (origin.set == null) {
    return <GlyphRow label="glyphs" value="all 28 sets" />;
  }
  // These glyphs are not in the parcel's own font subset, so the animation
  // paints them in the system font, and so does this row.
  const marksOnly = /^\p{M}+$/u.test(origin.glyphs);
  return (
    <GlyphRow
      label="glyphs"
      title={`set ${origin.set} of 28`}
      value={
        <>
          {marksOnly ? <span className="opacity-60">near-invisible marks</span> : origin.glyphs}
          <span className="opacity-40">{`  set ${origin.set}`}</span>
        </>
      }
    />
  );
}

/**
 * Sizes the parcel animation to end level with the last trait row on wide
 * screens, keeping the artwork's shape. Stacked on mobile it keeps its default
 * size. Attach `columnRef` to the column beside the animation and `rowsRef` to
 * the rows list inside it.
 */
export function useAnimationHeight(defaultHeight = 400, maxHeight = 640) {
  const columnRef = useRef(null);
  const rowsRef = useRef(null);
  const [height, setHeight] = useState(defaultHeight);

  useEffect(() => {
    const column = columnRef.current;
    const rows = rowsRef.current;
    if (!column || !rows || typeof ResizeObserver === 'undefined') return undefined;
    const wide = window.matchMedia('(min-width: 768px)');

    const measure = () => {
      if (!wide.matches) {
        setHeight(defaultHeight);
        return;
      }
      // The last row's border line, measured from the top both columns share.
      const last = rows.lastElementChild ?? rows;
      const span = last.getBoundingClientRect().bottom - column.getBoundingClientRect().top;
      setHeight(Math.round(Math.min(maxHeight, Math.max(defaultHeight, span))));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    observer.observe(rows);
    wide.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, [defaultHeight, maxHeight]);

  return { columnRef, rowsRef, height, width: Math.round(height * ART_RATIO) };
}
