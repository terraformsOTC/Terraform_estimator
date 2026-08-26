# Terraforms Weekly Newsletter

Fetch the weekly report data and generate two publish-ready drafts: a Substack newsletter post and a Twitter/X thread.

## Step 1 — Fetch the data

Run this and parse the JSON response:

```bash
curl -s https://terraform-estimator.onrender.com/api/weekly-report-data
```

## Step 1b — Scan for private / OTC sales

The weekly data above only contains marketplace fills, so a negotiated deal
settled wallet-to-wallet never appears in it. Scan the raw transfers too:

```bash
cd backend && node --env-file=.env scripts/otc-scan.js 7
```

This reads every Terraforms ERC-721 transfer for the window and sorts them into
marketplace fills, NFT-lending collateral moves, and unexplained transfers. Note
the mempool is **not** the right source for this — it holds only pending
transactions, so it cannot answer a question about the last 7 days.

Only report a transfer as a private sale when the scan labels it
`LIKELY PRIVATE SALE`, which requires payment flowing from the parcel's
recipient back to its sender at half the floor or more. Most bare transfers are
self-custody (hot wallet to cold storage) or loan collateral, and reporting
those as sales would be wrong. Two traps the scan already handles, so do not
undo them:

- **Lending is not a sale.** Gondi and NFTfi both move parcels into and out of
  loan escrow and pay WETH in the same transaction. That WETH is loan principal
  — a refinance can move 5+ WETH against a 0.3 ETH parcel.
- **EIP-7702 and ERC-4337 batching hide the venue.** A bulk offer-accept calls
  Seaport from inside the user's own smart account, so `tx.to` is their wallet,
  not Seaport. The scan checks receipt logs for marketplace events to catch these.

Where the atomic-settlement venues land:

- **Gondi Trades** (gondi.xyz/trades) — peer-to-peer swaps of ERC-721/1155/20.
  Per Gondi's docs these "settle through Seaport", so a Gondi trade appears as an
  ordinary Seaport fill and is already in the weekly sales data. It is not a
  hidden transfer. What it can hide is the *character* of the deal: a negotiated
  or barter trade prices nothing like an open-market fill, so treat a Seaport
  sale far off estimate as a possible negotiated deal rather than a market print.
- **Fountain** (go.fountaindigital.xyz) — an OTC brokerage. No public contract
  address, and nothing on their site or in search confirms an on-chain
  settlement contract; brokered deals may well settle as a plain wallet-to-wallet
  transfer plus a separate payment, which is exactly the shape the scan detects.
  If Fountain does settle through its own contract, that contract will surface as
  an `UNKNOWN` router the first time it is used — identify it and add it then.

If the scan prints `UNKNOWN, identify and add to KNOWN`, identify that contract
(the scan probes `name()` for you) and add it to `KNOWN` in the script before
trusting the verdict, otherwise a new marketplace reads as a private sale.

When there are hits, add a block after **Notable sales** and leave it for the
user to accept or cut — never publish these unreviewed:

```
**Possible private sales — for review**

- [#7116](https://terraformestimator.xyz/?token=7116) — [NOV], biome 18, Daydream, 0.37 ETH.
  Direct transferFrom between two wallets, 0.37 ETH paid back 97 min later.
  The buyer has paid this seller 50 times (57.9 ETH) and been paid back once —
  a standing OTC relationship, not one person moving parcels between wallets.
```

Omit the block entirely when the scan finds nothing.

## Step 2 — Substack newsletter

Write the post using the structure below. Tone: knowledgeable collector writing
to other collectors — not a trading bot, not hype. Factual, specific, brief. No
filler sentences. Keep the whole thing to roughly 220 words: the summary runs
3-4 short paragraphs, most of them a single sentence.

The draft is saved to `~/Vault/Assets/terraforms-weekly-YYYY-MM-DD.md`, dated the
Monday the week closes. Match the previous week's file exactly — the `>>`
placeholder lines are the user's, keep them in place and never fill them in.

### Structure

**Title:** `# TF Weekly — [Month D] to [Month D]`

**### Summary** — prose. Lead with the single most interesting thing that
happened, then breadth (sales count and volume vs last week), then the floor.
Percent changes are computed by hand against the previous week's note; the API
returns no deltas.

`>> embedded tweet`

**### Market snapshot** — three plain lines:
```
Floor: X ETH (±N.N%) / $Y (±N.N%)
7-day volume: X ETH (±N%) across N sales
Listings: N · Collectors: N
```

**### Notable sales** — up to 5 bullets, no blank lines between them:
`- [#id](https://terraformestimator.xyz/?token=id) — zone, biome N, [mode if not Terrain], [specialType], chroma, price ETH. One short clause of context.`
Call out Origin Daydream/Terraform, 1of1s, biome 0, same-seller bulk sales, and
anything that traded twice in the week.

`>>TF tiles image screengrab`

**### Lending market activity** — from the Step 1b scan's lending breakdown.
Terraforms are actively used as loan collateral on **Gondi** and **NFTfi**, and
none of it shows up in sales data. Cover, in two or three sentences:

- how many parcels touched lending, and on which protocol
- loans opened or rolled vs repaid/liquidated
- any leveraged purchase — Gondi's purchase bundler buys a parcel and opens a
  loan against it in one transaction, so the buyer only puts down part of the
  price. Give the split, e.g. "put down 0.101 ETH and borrowed 0.168 WETH".
- a parcel repeatedly cycling in and out of escrow is one collector refinancing,
  which is worth a mention but is not trading activity

Do not describe loan principal as a sale price. Omit the section in a week with
no lending activity.

**### Interesting listings** — same bullet shape as Notable sales, ending with
`, on the floor.` for the floor listing. Include a bargain from the `bargains`
array when there is one. Keep the `>> interesting listings (user to supply)`
line underneath.

**### Other news** — leave `>> other news (user to supply)` for the user.

---

## Step 3 — Twitter/X thread

Write a Twitter/X thread. Rules:
- Each tweet ≤ 280 characters including spaces and line breaks
- Number each tweet: `1/`, `2/`, etc.
- No em dashes (use · or — sparingly). No hashtags unless genuinely useful.
- URLs count toward character limit — use short token links like `terraformestimator.xyz/?token=123`

### Thread structure

**Tweet 1 — Hook:**
Lead with the most interesting single fact from the week (biggest sale, unusual activity, notable special parcel traded, etc.). Make someone stop scrolling.

**Tweet 2 — Market stats:**
Floor, 7-day volume, sales count, collector count. Keep it tight.

**Tweet 3–5 — Top sales:**
One or two sales per tweet. Include token ID, zone, price, and one line of context (above/below estimate, special type, etc.).

**Tweet 6 — Value picks (if bargains exist):**
Best bargain listing. If no bargains, skip this tweet.

**Tweet 7 — Closer:**
Point to the estimator. Keep it clean, no hype.

---

## Output format

Print the Substack draft first (clearly marked), then the Twitter thread (clearly marked). Both should be ready to copy-paste with no further editing needed.
