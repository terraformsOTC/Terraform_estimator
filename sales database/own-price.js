// Which sales are a parcel bought at its own listed price, for calibrate-floor.js
// and ops/verify-model.js. The same rule as load_records in fit_hedonic.py — keep
// them in step. A single-parcel sale always is. In a multi-parcel transaction
// (`is_bundle`) a leg is when no other leg shares its price, when several sellers
// share it (separate listings), or when it is under 1.5x the floor (a floor sweep
// from one seller). Not: one seller repeating one price at >= 1.5x the floor —
// a bundle order, whose total OpenSea repeats on every leg. James (2026-10-21):
// collectors buying listed parcels at their listed price is real data, however
// the transaction was structured.
const BUNDLE_MIN_FLOOR_MULTIPLE = 1.5;

/**
 * @param rows     [{ tx_hash, price_native, seller, is_bundle, ... }]
 * @param floorOf  row -> the floor for the 1.5x test (null/0: unknown)
 */
function ownPriceSales(rows, floorOf) {
  const groups = new Map(); // tx|price -> { n, sellers }
  for (const r of rows) {
    if (!r.is_bundle) continue;
    const key = `${r.tx_hash}|${r.price_native}`;
    const g = groups.get(key) || { n: 0, sellers: new Set() };
    g.n += 1;
    g.sellers.add(String(r.seller).toLowerCase());
    groups.set(key, g);
  }
  return rows.filter((r) => {
    if (!r.is_bundle) return true;
    const g = groups.get(`${r.tx_hash}|${r.price_native}`);
    const floor = floorOf(r);
    return g.n === 1 || g.sellers.size > 1 || (floor > 0 && r.price_native < BUNDLE_MIN_FLOOR_MULTIPLE * floor);
  });
}

module.exports = { ownPriceSales, BUNDLE_MIN_FLOOR_MULTIPLE };
