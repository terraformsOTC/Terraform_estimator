// Shared constants and micro-components used across multiple files

export const CATEGORY_COLORS = {
  Grail: '#ffd700',
  Rare: '#c084fc',
  Premium: '#60a5fa',
  'Premium Floor': '#34d399',
  Floor: 'inherit',
};

export function EthIcon({ width = 10, height = 16 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 10 16" fill="currentColor" style={{ opacity: 0.8 }}>
      <path d="M5 0L0 8.15L5 11L10 8.15L5 0Z" />
      <path d="M0 9.1L5 16L10 9.1L5 12L0 9.1Z" />
    </svg>
  );
}
