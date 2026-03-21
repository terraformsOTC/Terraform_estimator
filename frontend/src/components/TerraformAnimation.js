'use client';
import { useEffect, useRef, useMemo } from 'react';

// Unicode codepoint ranges used to build extended character sets
const UNI = [9600,9610,9620,3900,9812,9120,9590,143345,48,143672,143682,143692,
              143702,820,8210,8680,9573,142080,142085,142990,143010,143030,9580,
              9540,1470,143762,143790,143810];

function makeSet(start) {
  const chars = [];
  for (let i = start; i < start + 10; i++) {
    try { chars.push(String.fromCodePoint(i)); } catch(e) { chars.push('▪'); }
  }
  return chars;
}

// Class index → height value (classIds = ['i','h','g','f','e','d','c','b','a'])
// h=8 is highest (mountain peak), h=0 is lowest (valley floor)
const CLASS_ORDER = ['i','h','g','f','e','d','c','b','a'];
function classToHeight(cls) {
  const idx = CLASS_ORDER.indexOf(cls);
  return idx === -1 ? 9 : CLASS_ORDER.length - idx - 1; // j → 9 (empty cell)
}

// Classes with CSS color-cycling animation in the original
const ANIMATED_CLASSES = new Set(['b','c','d','e','f','g','h']);

function buildCharSets(seed) {
  const SEED = parseInt(seed);
  // Original block chars (i,h,g,f,e,d,c,b,a order → reversed to a,b,c,...,i)
  const originalChars = ['▆','▇','▆','▇','▉','▊','▋','█','▊'].reverse();
  let charSet = [...originalChars];
  if (SEED > 9970) {
    for (const u of UNI) charSet.push(...makeSet(u));
  } else if (SEED > 5000) {
    charSet.push(...makeSet(UNI[Math.floor(SEED) % 3]));
  }
  const mainSet = SEED > 9950 ? charSet : [...originalChars];
  return { mainSet, charSet };
}

export default function TerraformAnimation({ animData, width = 200, height = 288 }) {
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const { mainSet, charSet } = useMemo(
    () => animData ? buildCharSets(animData.seed) : { mainSet: [], charSet: [] },
    [animData?.seed]
  );

  useEffect(() => {
    if (!animData || !containerRef.current) return;
    const { grid, resource: resourceRaw } = animData;
    const RESOURCE = parseInt(resourceRaw) / 10000;
    const DIRECTION = 2;
    const waterline = 6 - RESOURCE;
    const heights = Array.from(grid).map(classToHeight);
    const cells = containerRef.current.querySelectorAll('[data-cell]');
    if (cells.length !== 1024) return;

    let airship = 0;
    timerRef.current = setInterval(() => {
      for (let row = 0; row < 32; row++) {
        for (let col = 0; col < 32; col++) {
          const cell = cells[row * 32 + col];
          const h = heights[row * 32 + col];
          if (h === 9) { cell.textContent = ' '; continue; }
          if (h > waterline) {
            const rawIdx = Math.floor(0.25 * airship + (h + 0.5 * row + 0.1 * DIRECTION * col));
            cell.textContent = mainSet[((rawIdx % mainSet.length) + mainSet.length) % mainSet.length];
          } else {
            cell.textContent = '';
          }
        }
      }
      airship++;
    }, 10);

    return () => { clearInterval(timerRef.current); };
  }, [animData, mainSet]);

  if (!animData) {
    return (
      <div style={{ width, height, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-xs opacity-20">loading...</p>
      </div>
    );
  }

  const { grid, colors, seed } = animData;
  const bgColor = colors?.bg || '#111';

  // Scale the 388×560 original to our display size
  const scaleX = width / 388;
  const scaleY = height / 560;
  const scale = Math.min(scaleX, scaleY);

  // Build per-instance CSS: @keyframes + animated class rules
  // Use a unique id so multiple instances on page don't clash
  const instanceId = useMemo(() => `tf-${Math.random().toString(36).slice(2,7)}`, []);

  const colorList = ['a','b','c','d','e','f','g','h','i'].map(c => colors?.[c] || bgColor);
  const keyframeStops = colorList.map((c, i) => `${i * 10}% { color: ${c}; }`).join('\n');

  // Animated class delays (c=0ms, d=160ms, e=320ms, f=480ms, g=640ms)
  const animDelays = { b: '0ms', c: '160ms', d: '320ms', e: '480ms', f: '640ms', g: '800ms', h: '960ms' };
  const animatedRules = Object.entries(animDelays)
    .map(([cls, delay]) => `.${instanceId}-${cls} { animation: 800ms linear ${delay} infinite alternate both running ${instanceId}-x; }`)
    .join('\n');

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
            fontSize: 27,
            fontWeight: 'bold',
            fontFamily: 'MathcastlesRemix-Regular, monospace',
            display: 'grid',
            gridTemplateColumns: 'repeat(32, 3%)',
            gridTemplateRows: 'repeat(32, 16px)',
            gap: 0,
            justifyContent: 'space-between',
          }}
        >
          {Array.from(grid).map((cls, i) => {
            const color = colors?.[cls] || bgColor;
            const isAnimated = ANIMATED_CLASSES.has(cls);
            return (
              <span
                key={i}
                data-cell=""
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
          })}
        </div>
      </div>
    </div>
  );
}
