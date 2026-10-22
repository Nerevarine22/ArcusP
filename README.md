# Arcus Points Estimator

A Next.js App Router and TypeScript app. Nickname searches read the local
`leaderboard-season-1-2026-10-22.json` through `GET /api/points?name=Witty%20Phoenix`.
The full snapshot stays on the server; only the matching entry is sent to the browser.
The previous `leaderboard-season-1-2026-10-15.json` is used for weekly comparisons.
Both it and the original `leaderboard-season-1.json` are retained as archives.

## Local development

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:3000. Search ignores letter case and extra spaces.
The interface, validation messages, and API errors are in English.
The Arcus nickname is remembered in browser storage and shared between the points
estimator and wallet analytics inputs, including after a reload. Clearing either
nickname field clears the saved name.

## Brand assets

Visual reference: https://arcus.xyz/brand-kit. Official logo SVGs are bundled in
`public/brand`; Hedvig Letters Serif and Satoshi fonts from the brand-kit page
are bundled in `public/fonts` so the app has no external font dependency.
Brand palette: sand `#E8DDBE`, forest `#1E3B25`, dark `#0F140D`, cream `#F5F2EB`.
This is an unofficial community tool.

The app starts in dark mode. The sun/moon button in the header switches themes
and saves the preference in the `arcus-theme` cookie for one year. The server
renders the saved theme so reloads do not flash the other theme.

## Checks and production

```powershell
npm run typecheck
npm test
npm run build
npm start
```

## Airdrop model

FDV presets: $500M, $1B, $1.5B, $2B, $3B. Allocation presets: 5%, 10%, 15%.
The default pool is **11,000,000 points**, a reference assumption rather than
the current Season 1 total. Enter a custom pool or use the snapshot's point total.

Estimated value = FDV × (allocation / 100) × (your points / total points).
The matrix shows value per point or a personal estimate. Selecting a cell
synchronizes the FDV and allocation controls. Editing points manually clears
the linked participant and rank. Token amounts require a known token supply.
These are hypothetical scenarios; a token launch and airdrop are not guaranteed.

`npm test` checks all 15 reference values and calculation edge cases.

## Wallet analytics test page

Open `/wallet` from the navigation above the estimator. The page reads the public
Arcus API through `POST /api/wallet`; no wallet connection, API key, or signature is
required. Choose all subaccounts (0–9) or one subaccount and an all-time, rolling,
or custom UTC period. `Use test wallet` fills the supplied test address; press
`Analyze wallet` to load it.

The server paginates `GET /v1/fills` with inclusive microsecond boundaries,
deduplicates trade IDs within each subaccount, and sums executed `size × price`.
Positive fees and rebates are separate; net fees are paid fees minus rebates.
Amounts use integer quote quantums (nine decimal places), and `lossless-json`
preserves int64 values from `GET /v1/account/stats`. Aggregate account statistics
are address-level and can lag live fills; they do not use the selected scan period.

A scan is capped at 25 pages / 50 seconds. An interrupted or incomplete scan is
labelled partial and does not produce per-point ratios. An account can have more
than one fill at the same timestamp; if the API cannot advance at a full-page
boundary, the page reports a partial result rather than silently skipping trades.

For volume or net fees per point, enter period points manually or load a name from
the local leaderboard. The name is not inferred from the address. Choose either
the current Season 1 total or its gain since the archived snapshot, and match the
scan's trade period to that points period. Ratios are descriptive, not an official
Arcus points conversion formula. `Download JSON` exports the report and fills.

Sources: [account stats](https://docs.arcus.xyz/api-reference/public/get-account-stats),
[fills](https://docs.arcus.xyz/api-reference/public/get-fills).

### Weekly volume and holding time

`Include weekly holding analysis` is enabled by default. The report groups volume
and fees into weeks aligned with the published Wednesday 15:00 New York points
distribution schedule, including daylight-saving changes. Week 1 starts at the
analysis assumption of 1 October 2026, 00:00 UTC. Distribution times are not a
confirmed activity earning cutoff. See the
[Arcus points announcement](https://arcus.xyz/blog/introducing-arcus-points).

Select a week to inspect closed trading volume held for less than 1 hour, 1–2
hours, 2–12 hours, or at least 12 hours. Entry volume still open at that week's
cutoff is shown separately, aged below or above 12 hours. Unknown opening history
has its own category. A chart and comparison table show USD values and shares;
all categories reconcile exactly to executed volume without double counting.

Holding times use FIFO matching per market and subaccount, splitting partial
closes and direction flips. Each entry and exit contributes volume in its own
execution week. A later close does not rewrite an earlier week's open status.
The average closed holding time is weighted by matched executed volume. Metadata
indicating a missing opening position marks history unknown until an explicit
new opening; otherwise the available history is assumed to start flat. These
are reconstructed holding times, not Arcus points multipliers or open interest.

With weekly analysis enabled, the server reads earlier history even for a short
selected period to find opening fills. The selected period still filters totals,
fees, and exported fills. The existing page/time limits apply to this
full history read; incomplete scans suppress holding estimates. Disable weekly
analysis for a bounded volume-only scan or choose one subaccount. JSON downloads
include the weekly breakdown. `npm test` covers duration boundaries, partial
closes, flips, weekly cutoffs, DST, missing history, and exact volume allocation.

## Refreshing the snapshot

```powershell
.\fetch-leaderboard.ps1 -OutputPath .\leaderboard-season-1-2026-10-22.json
```

The JSON is read on each request. Reload the page after updating the snapshot
to refresh season information. The app does not automatically fetch the Arcus API.
`updated_at` is the download completion time, not the exchange's data update time.
The footer displays this download time in UTC. When saving a new dated snapshot,
update the active and previous filenames in `lib/leaderboard.ts` to use that file
and compare it with the preceding snapshot.
Include the JSON file when deploying to another server and use the Node.js runtime.
