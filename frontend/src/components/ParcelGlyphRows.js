'use client';

import { useEffect, useRef, useState } from 'react';
import { abbreviateGlyphs, customGlyphs, latentBlade } from '@/lib/parcelGlyphs';

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
 * The glyphs a parcel's raised cells cycle when it is dreamed or terraformed:
 * its blade, picked by (biome + seed) as on the mandala tool, or the custom
 * uni set the v2 renderer swaps in for it (origin parcels, seeds above 9950).
 * A parcel shows one or the other, never both. On a Terrain parcel the blade
 * row is latent — what dreaming it would show. Long blades show their opening
 * and closing runs; the full blade is on hover.
 */
export function ParcelGlyphRows({ biome, seed, mode }) {
  const blade = latentBlade(mode, biome, seed);
  const custom = customGlyphs(mode, seed);

  return (
    <>
      {blade && <BladeRow blade={blade} />}
      {custom && <CustomGlyphsRow custom={custom} />}
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
  const label = <>blade <span className="opacity-60">(v2)</span></>;
  return <GlyphRow label={label} value={value} title={blade} fontFamily={BLADE_FONT} />;
}

function CustomGlyphsRow({ custom }) {
  // The high-seed branches run all 28 sets at once — hundreds of glyphs.
  if (custom.set == null) {
    return <GlyphRow label="glyphs" value="all 28 sets" />;
  }
  // These glyphs are not in the parcel's own font subset, so the animation
  // paints them in the system font, and so does this row.
  const marksOnly = /^\p{M}+$/u.test(custom.glyphs);
  const setLabel = `set ${custom.set}${custom.reversed ? ', reversed' : ''}`;
  return (
    <GlyphRow
      label="glyphs"
      title={`${setLabel} of 28`}
      value={
        <>
          {marksOnly ? <span className="opacity-60">near-invisible marks</span> : custom.glyphs}
          <span className="opacity-40">{`  ${setLabel}`}</span>
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
