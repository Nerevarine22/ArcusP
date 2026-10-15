# Arcus Points Estimator

A Next.js App Router and TypeScript app. Nickname searches read the local
`leaderboard-season-1-2026-10-15.json` through `GET /api/points?name=Witty%20Phoenix`.
The full snapshot stays on the server; only the matching entry is sent to the browser.
The previous `leaderboard-season-1.json` is retained as an archive.

## Local development

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:3000. Search ignores letter case and extra spaces.
The interface, validation messages, and API errors are in English.

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

## Refreshing the snapshot

```powershell
.\fetch-leaderboard.ps1 -OutputPath .\leaderboard-season-1-2026-10-15.json
```

The JSON is read on each request. Reload the page after updating the snapshot
to refresh season information. The app does not automatically fetch the Arcus API.
`updated_at` is the download completion time, not the exchange's data update time.
The footer displays this download time in UTC. When saving a new dated snapshot,
update the filename in `lib/leaderboard.ts` to make that file active.
Include the JSON file when deploying to another server and use the Node.js runtime.
