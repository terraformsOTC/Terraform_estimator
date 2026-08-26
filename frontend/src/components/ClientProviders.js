'use client';

// Kept as the single client boundary for the app shell. The money-sword provider
// that used to live here is gone: it was v1's way of hand-toggling between a
// market leaning on WETH bids and one clearing at listed prices, and the hedonic
// model measures that spread directly, so keeping both would double-count it.
export default function ClientProviders({ children }) {
  return children;
}
