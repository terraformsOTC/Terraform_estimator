'use client';

// The collection helper: for a group of wallets, which goals (sets, chroma, mode,
// special traits, custom) are met, what is missing, what is listed that fills
// each gap, and the cheapest way to fill them. All the work is one backend call
// (/collection); see HelperView and backend/src/collectionHelper.js.

import HelperView from '@/components/HelperView';

export default function HelperPage() {
  return <HelperView />;
}
