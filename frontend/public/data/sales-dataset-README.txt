Terraforms sales history — Terraform Estimator open data

Every secondary-market sale of a Terraforms parcel (contract 0x4E1f41613c9084FdB9E34E11fAE9412427480e56)
in ETH, WETH or Blur pool ETH, oldest first, one row per parcel sold. Updated monthly; each release covers
whole UTC days up to the date in its name.

Left out: self-trades and wash trades (a wallet selling to itself, or a router's internal leg — never a
real sale), and four 2022 sales in USDC. Nothing else is filtered: anomalous sales are in the data.

Columns:
  sale_time_utc    when the sale settled, ISO 8601 UTC
  unix             the same, as a Unix timestamp (seconds)
  token_id         the parcel, 1-9911
  price            sale price in the currency column. For kind=bundle this is the ORDER TOTAL, repeated on every parcel in the bundle (OpenSea reports it that way) — divide by legs for a per-parcel figure
  currency         ETH (a listing was bought), WETH (an offer was accepted) or BETH (Blur pool ETH, an accepted Blur bid)
  kind             single (one parcel in the transaction), sweep (several parcels, each its own order at its own price) or bundle (one order for several parcels)
  legs             parcels in the same transaction
  buyer            buying wallet
  seller           selling wallet
  tx_hash          the Ethereum transaction
  floor_index_eth  the estimator's daily floor index for that day (12th percentile of clean single-parcel sales over a trailing 14+ day window) — derived, not raw; empty where the index has no value

Check the download before you use it — the file must match its SHA-256:
  macOS:   shasum -a 256 -c <file>.sha256
  Linux:   sha256sum -c <file>.sha256
  Windows: Get-FileHash <file> -Algorithm SHA256   (compare with the hash in <file>.sha256)
The same checksum is in sales-dataset.json, committed to the public repository, so you can check it
against a source other than the website: https://github.com/terraformsOTC/Terraform_estimator/commits/main/frontend/public/data/sales-dataset.json

Source: on-chain sales collected from the OpenSea API (sales database/ in the repository).

License: Creative Commons Zero v1.0 Universal (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/ (full text in LICENSE-CC0-1.0.txt).
To the extent possible under law, the publisher waives all copyright and related rights in this data:
use it for anything, no permission or credit needed. The Terraform Estimator code itself is
AGPL-3.0-or-later (https://github.com/terraformsOTC/Terraform_estimator).
