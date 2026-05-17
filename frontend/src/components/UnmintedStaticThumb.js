'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { getUnmintedAnim, loadUnmintedFontFace } from '@/lib/unmintedThumbCache';

const CLASS_IDS = ['i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
const FALLBACK_CHAR = '▆';
const UNI = [9600, 9610, 9620, 3900, 9812, 9120, 9590, 143345, 48, 143672, 143682,
  143692, 143702, 820, 8210, 8680, 9573, 142080, 142085, 142990, 143010, 143030,
  9580, 9540, 1470, 143762, 143790, 143810];

function makeSet(start) {
  const chars = [];
  for (let i = start; i < start + 10; i++) chars.push(String.fromCharCode(i));
  return chars;
}

function classToHeight(cls) {
  const idx = CLASS_IDS.indexOf(cls);
  return idx === -1 ? 9 : CLASS_IDS.length - idx - 1;
}

function buildMainSet(seed, chars) {
  const SEED = parseInt(seed);
  const originalChars = CLASS_IDS.map((c) => chars?.[c] || FALLBACK_CHAR);
  const charSet = [...originalChars];
  if (SEED > 9970) {
    for (const u of UNI) charSet.push(...makeSet(u));
  } else if (SEED > 5000) {
    charSet.push(...makeSet(UNI[SEED % 3]));
  }
  const mainSet = [...originalChars].reverse();
  return SEED > 9950 ? charSet : mainSet;
}

// Rec. 601 perceptual luminance — used to pick a contrasting overlay text
// color so the [unminted] label reads on both dark and light parcel bgs
// (e.g. Hyphae's near-white bg drowned white text).
function bgLuminance(hex) {
  if (!hex) return 0;
  let s = String(hex).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (s.length !== 6) return 0;
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Placeholder shown before anim data arrives (and on load failure).
function Placeholder({ unmintedId }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center text-center"
      style={{ backgroundColor: 'rgba(232,232,232,0.04)', border: '1px solid rgba(232,232,232,0.08)' }}
    >
      <div>
        <div className="text-xs opacity-60 mb-1">[unminted]</div>
        <div className="text-xs opacity-40">#{unmintedId}</div>
      </div>
    </div>
  );
}

export default function UnmintedStaticThumb({ unmintedId }) {
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const [animData, setAnimData] = useState(null);
  const [fontFamily, setFontFamily] = useState(null);
  const [visible, setVisible] = useState(false);
  const [scale, setScale] = useState(1);

  // Defer fetch until card is near the viewport — long lists otherwise fire
  // hundreds of requests up-front before the user scrolls.
  useEffect(() => {
    if (visible || !rootRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setVisible(true); obs.disconnect(); break; }
      }
    }, { rootMargin: '200px' });
    obs.observe(rootRef.current);
    return () => obs.disconnect();
  }, [visible]);

  // Measure rendered width and rescale the fixed-size 388x560 grid into it.
  // Card aspect (277/400) ≈ grid aspect (388/560), so width-based scale is
  // sufficient for both axes.
  useEffect(() => {
    if (!rootRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setScale(w / 388);
      }
    });
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch anim data + font once visible.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getUnmintedAnim(unmintedId);
        if (cancelled) return;
        setAnimData(data);
        if (data.fontIndex != null) {
          const family = await loadUnmintedFontFace(data.fontIndex);
          if (!cancelled) setFontFamily(family);
        }
      } catch (err) {
        // Placeholder stays — fine for the thumb. Card still links through.
        if (typeof console !== 'undefined') console.warn('[unminted-thumb]', unmintedId, err);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, unmintedId]);

  const mainSet = useMemo(
    () => (animData ? buildMainSet(animData.seed, animData.chars) : []),
    [animData],
  );

  // Set textContent for each cell once. Frame 0: rawIdx = floor(h + 0.5*col)
  // (the on-chain Terrain formula with airship=0, DIRECTION=0).
  useEffect(() => {
    if (!animData || !gridRef.current) return;
    const { grid, resource: resourceRaw, chars } = animData;
    const RESOURCE  = parseInt(resourceRaw) / 10000;
    const DIRECTION = 0;
    const waterline = 6 - RESOURCE;
    const heights = Array.from(grid).map(classToHeight);
    const gridClasses = Array.from(grid);
    const domCells = gridRef.current.querySelectorAll('[data-cell]');
    if (domCells.length !== 1024) return;
    const setLen = Math.max(mainSet.length, 1);

    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 32; col++) {
        const idx = row * 32 + col;
        const cell = domCells[idx];
        const h = heights[idx];
        if (h === 9) {
          cell.textContent = ' ';
        } else if (h > waterline) {
          const rawIdx = Math.floor(h + 0.5 * col + 0.1 * DIRECTION * row);
          cell.textContent = mainSet[((rawIdx % setLen) + setLen) % setLen];
        } else {
          cell.textContent = chars?.[gridClasses[idx]] || FALLBACK_CHAR;
        }
      }
    }
  }, [animData, mainSet]);

  const colors = animData?.colors;
  const bgColor = colors?.bg || 'transparent';
  const parcelFontSize = animData?.fontSize || 15;
  const parcelFontWeight = animData?.fontWeight || 'normal';
  const fontFamilyCss = fontFamily ? `'${fontFamily}', monospace` : "'MathcastlesRemix-Regular', monospace";
  // Threshold tuned by eye against Hyphae (#1009, ~white bg) and Mould
  // (#1121, mid-gray). 0.6 puts the cutoff comfortably above mid-gray.
  const isBgLight = bgLuminance(bgColor) > 0.6;
  const overlayTextColor = isBgLight ? '#1f1f1f' : '#eee8de';
  const overlayGradient = isBgLight
    ? 'linear-gradient(180deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.55) 100%)'
    : 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)';

  // Root stays mounted across the loading→loaded transition so the observers
  // attached to rootRef don't churn. Content swaps inside.
  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden" style={{ background: bgColor }}>
      {!animData ? (
        <Placeholder unmintedId={unmintedId} />
      ) : (
        <>
          {/* Scaled fixed-size grid (388x560) — opacity-dimmed so overlay text reads. */}
          <div
            style={{
              width: 388,
              height: 560,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              opacity: 0.55,
            }}
          >
            <div
              ref={gridRef}
              style={{
                boxSizing: 'border-box',
                width: 388,
                height: 560,
                padding: 24,
                fontSize: parcelFontSize,
                fontWeight: parcelFontWeight,
                fontFamily: fontFamilyCss,
                display: 'grid',
                gridTemplateColumns: 'repeat(32, 3%)',
                gridTemplateRows: 'repeat(32, 16px)',
                gap: 0,
                justifyContent: 'space-between',
              }}
            >
              {Array.from(animData.grid).map((cls, i) => (
                <span
                  key={i}
                  data-cell=""
                  style={{
                    color: colors?.[cls] || bgColor,
                    textAlign: 'center',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    margin: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Overlay: [unminted] #id, centered. Text color + bottom-fade
              direction flip to match the parcel's bg luminance. */}
          <div
            className="absolute inset-0 flex items-center justify-center text-center pointer-events-none"
            style={{ background: overlayGradient }}
          >
            <div>
              <div className="text-xs mb-1" style={{ color: overlayTextColor, opacity: 0.95 }}>[unminted]</div>
              <div className="text-xs" style={{ color: overlayTextColor, opacity: 0.8 }}>#{unmintedId}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
