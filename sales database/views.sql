-- Analysis-ready view over `sales`, encoding the money-sword bid/ask split and
-- model-eligibility. Non-destructive (a view) — safe to re-run. Apply with:
--   node -e "require('better-sqlite3')('terraforms_sales.db').exec(require('fs').readFileSync('views.sql','utf8'))"
--
-- Settlement side is derived from payment_token, NOT the normalised symbol:
--   native ETH (0x000…000) ................. ASK  (buyer took the listing)
--   WETH (0xC02a…) ......................... BID  (seller accepted an offer)
--   Blur Pool / BETH (0x000…87ac) .......... BID  (per decision 2026-06-05; BETH is Blur's bidding currency)
-- pay_venue keeps the finer provenance for auditing / re-classification.

-- When each parcel left Terrain (build_dream_history.js fills it from the chain).
-- Created here too, so the view builds on a DB that has never run the backfill.
CREATE TABLE IF NOT EXISTS parcel_dreams (
  token_id          INTEGER PRIMARY KEY,
  first_dream_unix  INTEGER NOT NULL,
  first_dream_block INTEGER NOT NULL,
  first_event       TEXT    NOT NULL,
  tx_hash           TEXT
);

DROP VIEW IF EXISTS v_model_sales;
CREATE VIEW v_model_sales AS
SELECT
  s.tx_hash,
  s.token_id,
  s.event_unix,
  s.event_ts,
  s.price_native,
  s.price_usd,
  s.payment_symbol,
  CASE lower(COALESCE(s.payment_token, ''))
    WHEN '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' THEN 'WETH'
    WHEN '0x0000000000a39bb272e79075ade125fd351887ac' THEN 'BLUR_POOL'
    WHEN '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' THEN 'USDC'
    WHEN '0x0000000000000000000000000000000000000000' THEN 'NATIVE_ETH'
    WHEN '' THEN 'NATIVE_ETH'
    ELSE 'OTHER'
  END AS pay_venue,
  CASE
    WHEN lower(COALESCE(s.payment_token, '')) IN (
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',  -- WETH
      '0x0000000000a39bb272e79075ade125fd351887ac'   -- Blur Pool
    ) THEN 'BID'
    WHEN COALESCE(s.payment_token, '') IN ('', '0x0000000000000000000000000000000000000000') THEN 'ASK'
    ELSE 'OTHER'
  END AS side,
  s.buyer,
  s.seller,
  s.is_bundle,
  s.is_wash,
  m.zone,
  m.biome,
  m.level,
  -- The parcel's mode AT THE SALE (2026-10-21). Terrain is one-way, so a parcel
  -- that sold before its first Daydreaming/Terraformed event (parcel_dreams) was
  -- Terrain then, whatever it is now, and one that sold after it was dreamed.
  -- Origins were never Terrain. A parcel with no event keeps token_meta's mode.
  CASE
    WHEN m.mode LIKE 'Origin%' THEN m.mode
    WHEN d.first_dream_unix IS NULL THEN m.mode
    WHEN s.event_unix < d.first_dream_unix THEN 'Terrain'
    WHEN m.mode IN ('Daydream', 'Terraform') THEN m.mode
    ELSE 'Daydream'
  END AS mode,
  m.mode AS mode_now,
  f.floor_eth AS floor_at_sale,   -- endogenous floor index on the sale's day (build_floor_index.js)
  -- target y = ln(price_native / floor_at_sale) is computed by the consumer
  -- (Python) to avoid depending on SQLite math-function compilation.
  -- Clean enough to feed the hedonic fit: single-token, ETH-denominated, not wash,
  -- not a self-trade. (Reviewed sweeps can be added back later by hand.)
  CASE
    WHEN s.is_bundle = 0
     AND s.is_wash = 0
     AND lower(s.buyer) <> lower(s.seller)
     AND s.payment_symbol IN ('ETH', 'WETH')
    THEN 1 ELSE 0
  END AS model_eligible
FROM sales s
LEFT JOIN token_meta m ON m.token_id = s.token_id
LEFT JOIN parcel_dreams d ON d.token_id = s.token_id
LEFT JOIN floor_index_daily f ON f.day = substr(s.event_ts, 1, 10);
