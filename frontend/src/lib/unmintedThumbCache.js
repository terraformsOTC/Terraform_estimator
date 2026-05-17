'use client';

import { API_URL } from '@/components/shared';

// Module-scoped caches survive across remounts. All maps are id/index → Promise
// so concurrent callers for the same id de-duplicate at the network layer.
const animCache = new Map();
const fontCache = new Map();

export function getUnmintedAnim(id) {
  if (!animCache.has(id)) {
    animCache.set(id, fetch(`${API_URL}/unminted/anim/${id}`).then((r) => {
      if (!r.ok) throw new Error(`anim/${id}: ${r.status}`);
      return r.json();
    }));
  }
  return animCache.get(id);
}

// Resolves to a font-family string ready to use in CSS (or null if no font).
// Loads the FontFace once per index across the entire session.
export function loadUnmintedFontFace(index) {
  if (index == null) return Promise.resolve(null);
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve(null);
  }
  if (!fontCache.has(index)) {
    const family = `tf-unminted-font-${index}`;
    const p = fetch(`${API_URL}/unminted/font/${index}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font/${index}: ${r.status}`);
        return r.json();
      })
      .then(async ({ fontData }) => {
        if (!fontData) return null;
        const face = new FontFace(family, `url(data:application/font-woff2;base64,${fontData})`);
        await face.load();
        document.fonts.add(face);
        return family;
      });
    fontCache.set(index, p);
  }
  return fontCache.get(index);
}
