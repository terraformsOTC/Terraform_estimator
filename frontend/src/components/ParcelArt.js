'use client';

import { useState, useRef, useEffect } from 'react';
import { parcelImage } from './shared';

// A parcel thumbnail that plays the real animation while the cursor is on it.
//
// The on-chain SVG from /image carries no keyframes and no script — it is a still.
// The animation lives in tokenHTML, which mathcastles serves and which ParcelResult
// and the wallet-grid zoom already frame; the site CSP allows that host for exactly
// this reason.
//
// The frame is mounted on hover and torn down on leave, never one per card: a page
// of twenty live iframes against a third-party gateway is not something to ship.
//
// Native size of the tokenHTML document. It has no responsive layout of its own and
// squashes if the frame is simply made smaller, so it renders full size and scales.
const ART_W = 277;
const ART_H = 400;

// A cursor crossing a rail passes over every card on the way. Without this each one
// would mount a frame and immediately tear it down.
const HOVER_DELAY_MS = 140;

export default function ParcelArt({ tokenId, width, height, alt, className = '', style = {} }) {
  const [live, setLive] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div
      className={`relative ${className}`}
      style={{ width, height, overflow: 'hidden', border: '1px solid var(--border-color)', ...style }}
      onMouseEnter={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setLive(true), HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setLive(false);
      }}
    >
      <img
        src={parcelImage(tokenId)}
        alt={alt ?? `Parcel ${tokenId}`}
        width={width}
        height={height}
        loading="lazy"
        style={{ display: 'block', objectFit: 'cover' }}
      />
      {live && (
        // pointer-events:none so a click still reaches whatever wraps this — the
        // frame is sandboxed without allow-same-origin, so a click landing inside
        // it would go nowhere.
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
            transform: `scale(${width / ART_W})`,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  );
}
