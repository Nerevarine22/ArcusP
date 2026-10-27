# Wallet research dataset

## Connect Neon

1. In the Vercel project, connect a Neon PostgreSQL database through Storage / Marketplace.
2. Enable the integration's `DATABASE_URL` for Production (and Preview only if you want preview traffic in the same dataset). Use a **pooled** connection string. Keep it server-only, without a `NEXT_PUBLIC_` prefix.
3. Copy that connection string into the ignored `.env.local` file as `DATABASE_URL=...`. Do not put it in Git or send it in chat.
4. Run `npm run research:init` locally against that database. This applies `db/research.sql` and can safely be repeated.
5. Redeploy Vercel after adding the environment variable. Local development needs a restart after changing `.env.local`.
6. On either wallet analysis page, enter points/name, then run Analyze. Results are saved automatically and a success message confirms the database write. There is no sharing checkbox or browser preference controlling storage.

No database credentials are needed to build the app. Missing database configuration or a failed write does not block the wallet report. It shows a separate storage status and never pretends the record was saved. Data is saved only when Analyze runs; editing points alone does not submit another record. The server saves valid analyses even when an older browser sends no research metadata or its former sharing preference is false.

## One wallet, one record

The primary key is `(project, lowercase wallet address)`. Arcus and TxFlow activity stay separate. `analytics_research.wallets.document` is a schema-versioned JSON document with:

- Identity: project, public address, optional Arcus name, automatic collection mode/version and first/last observation timestamps. Historical consent metadata from the earlier opt-in version is preserved without inventing consent for automatically saved records.
- Latest scan: selected range/scope, complete/partial flag, summary and any manually supplied aggregate point total. A combined total is never guessed into separate epoch rewards.
- `periods`: stable keys such as `s1-week-2`, `s0`, `s1-epoch-1`. Every period holds its boundaries, observed cutoff, points and provenance, volume, paid fees, rebates, net fees, fill count, maker/taker volume, holding buckets, average closed hold, markets and ratios. TxFlow summaries also retain paid fees, rebates and net fees separately for maker, taker and unknown execution roles. Earlier records without that breakdown export blank fields until refreshed, rather than inventing zero fees.
- TxFlow also includes realized fill PnL and net funding received. Arcus has `null` for unavailable PnL/funding; unknown is not zero.

USD amounts and points are decimal strings in JSON, preserving the API's normalized precision. Derived ratios/shares are floating-point numbers. JSON timestamps use UTC; TxFlow distribution dates are calendar dates. Arcus windows follow the existing distribution-aligned model, including its DST behavior. Holding is reconstructed with FIFO at each period cutoff; a later close does not rewrite an earlier period's open state.

Repeated analyses merge under a transaction and row lock, retaining prior epochs. A partial scan cannot replace a complete period. Blank point fields retain previous observations; an explicit zero replaces them and produces no per-point division. A newer positive point correction recalculates ratios without requiring complete trade history to be overwritten. Changing the claimed Arcus name clears inherited points for the previous profile. An older response cannot replace a newer profile association.

No IP addresses, browser identifiers, wallet signatures, balances, current positions or raw fill histories are retained by this feature. There is no public dataset read/export API. A short notice on both analysis forms explains automatic storage. An operator can remove a record with the command below.

## Data quality

Trades are derived from the application's server-side API scan, never a submitted browser report. Arcus point values come from canonical local leaderboard snapshots, matched to each week's distribution date. The **wallet-to-name link is user-supplied and unverified**. TxFlow points are manually entered and unverified. A public-address lookup does not establish wallet ownership for either project. These limitations are retained in the export.

`eligibleForPointsComparison` requires positive points, a closed period, full range/account coverage and complete fills. `eligibleForHoldingComparison` additionally requires reconciled holding history. Fee ratios also require complete supported-token fees. Partial scans, subaccount-only Arcus scans, rolling windows that do not cover an entire epoch, pending periods, missing points and negative Arcus adjustments do not become valid efficiency observations.

The `analytics_research.periods` SQL view exposes one row per wallet and period. Filter `comparable = true` (and `holding_comparable = true` for holding studies), then stratify by exchange, epoch, maker share, markets and holding mix. Compare volume/point and net fees/point with sample sizes. These are observational associations, not proof of a reward formula or a causal strategy: referrals, deposits, spot trading, eligibility and other incentives may affect points.

## Export and removal

```sh
npm run research:export
```

Creates ignored files under `artifacts/research/<UTC timestamp>/`:

- `wallets.json`: one complete document per project/wallet, with all periods and quality metadata.
- `periods.csv`: one row per project/wallet/period for spreadsheets or Python. Includes point source, eligibility flags, costs, volume, holding bucket volumes/shares, and market detail as JSON.

CSV numeric unknowns are blank, explicit zero remains zero, and user-entered names are escaped against spreadsheet formula execution. Export uses the private local `DATABASE_URL`; it is not available to site visitors.

```sh
npm run research:delete -- arcus 0x1111111111111111111111111111111111111111
```

Deletes that project's wallet record and its nested periods. Repeat for the other project if applicable. Keep credentials and exports private; `artifacts/` and `.env.local` are ignored by Git.

## Example SQL

```sql
SELECT project, period_id, count(*) AS wallets,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY net_fees_usd / NULLIF(points, 0)) AS median_net_fees_per_point
FROM analytics_research.periods
WHERE comparable AND points > 0
  AND (analysis->>'feesComplete')::boolean
GROUP BY project, period_id;
```

Setup references: https://vercel.com/docs/postgres and https://neon.com/docs/connect/connection-pooling.
