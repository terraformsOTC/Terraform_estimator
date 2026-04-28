# Terraforms Weekly Newsletter

Fetch the weekly report data and generate two publish-ready drafts: a Substack newsletter post and a Twitter/X thread.

## Step 1 — Fetch the data

Run this and parse the JSON response:

```bash
curl -s https://terraform-estimator.onrender.com/api/weekly-report-data
```

## Step 2 — Substack newsletter

Write a Substack post using the structure below. Tone: knowledgeable collector writing to other collectors — not a trading bot, not hype. Factual, specific, brief. No filler sentences.

### Structure

**Title:** `Terraforms Weekly — [from date] to [to date]`

**Market snapshot** (brief paragraph or tight bullet list):
- Floor: X ETH / $Y (link the cheapest listed parcel: `https://terraformestimator.xyz/?token=[floor_token_id]`)
- 7-day volume: X ETH across N sales
- Active listings: N · Collectors: N

**Notable sales** (prose, one short paragraph per sale, top 5 max):
For each sale, include: token ID with link to `https://terraformestimator.xyz/?token=[tokenId]`, zone, mode if not Terrain, specialType if present, price in ETH, and whether it sold above or below estimate (use price_to_estimate_ratio — below 1.0 means below estimate, above 1.0 means above). Call out anything interesting: Origin Daydream/Terraform sales, 1of1s, same-seller bulk sales (same seller_wallet across multiple entries), or parcels that sold far above estimate.

**Value picks** (if bargains array is non-empty):
List bargains with token ID linked to estimator, zone, list price, and discount %. If bargains array is empty, omit this section entirely.

**Footer:**
> Prices via [Terraform Estimator](https://terraformestimator.xyz). Not financial advice.

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
