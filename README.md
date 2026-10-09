# Arcus Points Estimator

A Next.js App Router and TypeScript app. Nickname searches read the local
`leaderboard-season-1.json` through `GET /api/points?name=Witty%20Phoenix`.
The full snapshot stays on the server; only the matching entry is sent to the browser.

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

## Refreshing the snapshot

```powershell
.\fetch-leaderboard.ps1
```

The JSON is read on each request. Reload the page after updating the snapshot
to refresh season information. The app does not automatically fetch the Arcus API.
`updated_at` is the download completion time, not the exchange's data update time.
Include the JSON file when deploying to another server and use the Node.js runtime.
