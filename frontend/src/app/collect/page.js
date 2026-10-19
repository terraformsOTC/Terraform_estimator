'use client';

// The collection helper: for a group of wallets, which goals (sets, chroma, mode,
// special traits, custom) are met, what is missing, what is listed that fills
// each gap, and the cheapest way to fill them. All the work is one backend call
// (/collection); see CollectView and backend/src/collectionHelper.js.

import CollectView from '@/components/CollectView';

export default function CollectPage() {
  return <CollectView />;
}
