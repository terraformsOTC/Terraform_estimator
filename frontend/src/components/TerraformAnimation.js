'use client';
import { useEffect, useRef, useMemo } from 'react';

// Unicode codepoint ranges used to build extended character sets (mirrors terrafans uni array)
const UNI = [9600,9610,9620,3900,9812,9120,9590,143345,48,143672,143682,143692,
              143702,820,8210,8680,9573,142080,142085,142990,143010,143030,9580,
              9540,1470,143762,143790,143810];

// Must use String.fromCharCode (not fromCodePoint) to match terrafans — values >65535 wrap mod 65536
function makeSet(start) {
  const chars = [];
  for (let i = start; i < start + 10; i++) chars.push(String.fromCharCode(i));
  return chars;
}

// classIds order matches terrafans: ['i','h','g','f','e','d','c','b','a']
const CLASS_IDS = ['i','h','g','f','e','d','c','b','a'];

const FALLBACK_CHAR = '▆';

function classToHeight(cls) {
  const idx = CLASS_IDS.indexOf(cls);
  return idx === -1 ? 9 : CLASS_IDS.length - idx - 1;
}

// Mirrors terrafans character set logic exactly.
// chars = per-class initial characters from PHP (varies by seed/parcel)
function buildMainSet(seed, chars) {
  const SEED = parseInt(seed);
  // originalChars in classIds order: [char_i, char_h, ..., char_a]
  const originalChars = CLASS_IDS.map(c => chars?.[c] || FALLBACK_CHAR);
  const charSet = [...originalChars];
  if (SEED > 9970) {
    for (const u of UNI) charSet.push(...makeSet(u));
  } else if (SEED > 5000) {
    charSet.push(...makeSet(UNI[Math.floor(SEED) % 3]));
  }
  // mainSet = originalChars.reverse() → [char_a, char_b, ..., char_i]
  const mainSet = [...originalChars].reverse();
  return SEED > 9950 ? charSet : mainSet;
}

export default function TerraformAnimation({ animData, width = 200, height = 288 }) {
  const containerRef = useRef(null);

  // All hooks must run unconditionally — guard is below
  const mainSet = useMemo(
    () => animData ? buildMainSet(animData.seed, animData.chars) : [],
    [animData?.seed, animData?.chars]
  );

  // Stable per-instance id for scoped CSS keyframes
  const instanceId = useMemo(() => `tf-${Math.random().toString(36).slice(2, 7)}`, []);

  // Build set of animated classes from per-parcel data
  const animatedSet = useMemo(() => {
    if (!animData?.animClasses) return new Set();
    return new Set(animData.animClasses.map(a => a.cls));
  }, [animData?.animClasses]);

  // Memoize the 1024-cell grid elements
  const cells = useMemo(() => {
    if (!animData) return [];
    const { grid, colors } = animData;
    const bgColor = colors?.bg || '#111';
    return Array.from(grid).map((cls, i) => {
      const color = colors?.[cls] || bgColor;
      const isAnimated = animatedSet.has(cls);
      return (
        <span
          key={i}
          data-cell=""
          data-cls={cls}
          className={isAnimated ? `${instanceId}-${cls}` : undefined}
          style={{
            color: isAnimated ? undefined : color,
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            margin: 0,
          }}
        />
      );
    });
  }, [animData?.grid, animData?.colors, instanceId, animatedSet]);

  useEffect(() => {
    if (!animData || !containerRef.current) return;
    const { grid, resource: resourceRaw, chars } = animData;
    const RESOURCE  = parseInt(resourceRaw) / 10000;
    const DIRECTION = 0;
    const waterline = 6 - RESOURCE;
    const heights   = Array.from(grid).map(classToHeight);
    const gridClasses = Array.from(grid);
    const domCells  = containerRef.current.querySelectorAll('[data-cell]');
    if (domCells.length !== 1024) return;

    const wrapAt = Math.max(mainSet.length, 1) * 4096;
    let airship = 0;
    const timer = setInterval(() => {
      for (let row = 0; row < 32; row++) {
        for (let col = 0; col < 32; col++) {
          const idx  = row * 32 + col;
          const cell = domCells[idx];
          const h    = heights[idx];
          const cls  = gridClasses[idx];
          if (h === 9) { cell.textContent = ' '; continue; }
          if (h > waterline) {
            const rawIdx = Math.floor(0.25 * airship + (h + 0.5 * row + 0.1 * DIRECTION * col));
            cell.textContent = mainSet[((rawIdx % mainSet.length) + mainSet.length) % mainSet.length];
          } else {
            // Below waterline: static PHP-initial char for this class (varies by seed)
            cell.textContent = chars?.[cls] || FALLBACK_CHAR;
          }
        }
      }
      airship = (airship + 1) % wrapAt;
    }, 10);

    return () => clearInterval(timer);
  }, [animData, mainSet]);

  // Guard after all hooks
  if (!animData) {
    return (
      <div style={{ width, height, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-xs opacity-20">loading...</p>
      </div>
    );
  }

  const { colors, fontSize: parcelFontSize, fontWeight: parcelFontWeight, animClasses } = animData;
  const bgColor = colors?.bg || '#111';
  const scale = Math.min(width / 388, height / 560);

  // Build keyframe stops: 10 stops (0%-90%), with 90% = bg color (matches terrafans exactly)
  const colorList = ['a','b','c','d','e','f','g','h','i'].map(c => colors?.[c] || bgColor);
  const keyframeStops = [
    ...colorList.map((c, i) => `${i * 10}% { color: ${c}; }`),
    `90% { color: ${bgColor}; }`,
  ].join('\n');

  // Per-parcel animation rules from scraped CSS data
  const animatedRules = (animClasses || [])
    .map(({ cls, duration, delay }) =>
      `.${instanceId}-${cls} { animation: ${duration}ms linear ${delay}ms infinite alternate both running ${instanceId}-x; }`
    ).join('\n');

  return (
    <div style={{ width, height, flexShrink: 0 }}>
      <style>{`
        @keyframes ${instanceId}-x {
          ${keyframeStops}
        }
        ${animatedRules}
      `}</style>

      <div style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: 388,
        height: 560,
        background: bgColor,
        overflow: 'hidden',
      }}>
        <div
          ref={containerRef}
          style={{
            boxSizing: 'border-box',
            width: 388,
            height: 560,
            padding: 24,
            fontSize: parcelFontSize || 15,
            fontWeight: parcelFontWeight || 'normal',
            fontFamily: 'MathcastlesRemix-Regular, monospace',
            display: 'grid',
            gridTemplateColumns: 'repeat(32, 3%)',
            gridTemplateRows: 'repeat(32, 16px)',
            gap: 0,
            justifyContent: 'space-between',
          }}
        >
          {cells}
        </div>
      </div>
    </div>
  );
}
