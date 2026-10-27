# Perp tools

## Wallet research collection

Arcus and TxFlow wallet analyses can optionally contribute to a private Neon PostgreSQL dataset.
One record per exchange/wallet contains separate weekly/epoch observations, point provenance,
trading metrics, holding mix and completeness flags. Repeat scans merge without duplicating wallets.
Set private `DATABASE_URL`, run `npm run research:init`, and redeploy. Export with
`npm run research:export` to JSON and CSV. See [setup and dataset format](docs/wallet-research.md).

## Extended points calculator

The calculator is available at `/extended` and from its card on the project
chooser. The home page and exchange navigation are enabled by default.

The page uses Extended's official header logo, symbol, locally bundled Inter fonts,
black background and teal `#00BC84` accent from https://extended.exchange/.
The app reference itself returned HTTP 403 during development, so the public
official website and the supplied points image were used for visual reference.

Inputs are manual Xpoints, editable total points (default **70,000,000** from
https://docs.extended.exchange/extended-resources/points-program), and manual FDV
(starting scenario **$500M**). The supplied **1B XTEN genesis supply** and
**300M XTEN / 30% community allocation** are fixed model inputs. Values assume
proportional conversion; no eligibility or final conversion ratio is inferred.
The summary shows USD value, XTEN quantity, pool share and value per point; the
FDV table updates the same calculation. Settings persist separately under
`extended-estimate-v1`, preserving Arcus and TxFlow settings.
The table appears above Polymarket and uses its thresholds through $1B:
**$150M, $250M, $300M, $500M, $800M, $1B**. The FDV preset buttons use the same values.
Manual values remain editable without adding rows outside this fixed grid.

Polymarket FDV is loaded through the server-only Heisenberg integration at
`GET /api/extended/fdv`. Put `HEISENBERG_API_KEY` in the ignored `.env.local`
file (see `.env.example`) and restart the server. Configure the same private
variable in the production host before deploying. No key is sent to the browser.

The fixed event is https://polymarket.com/event/extended-fdv-above-one-day-after-launch.
Agent 574 retrieves its open thresholds; agent 568 retrieves bounded seven-day
hourly candles for each YES token. The newest valid candle uses the bid/ask
midpoint when the spread is at most 10 percentage points, otherwise its recorded
trade close. Quotes over 24 hours old retain their last known percentage in the table and
are excluded from the FDV estimate; quote times remain in tooltips and notices. Each row
links to its contract. Partial data is labeled and missing values are never zero.

A suggested FDV linearly interpolates the 50% crossing of the exceedance curve.
This is a model-derived median, not a weighted average of overlapping contracts,
a listed token price, or an expected FDV. Missing tail quotes do not block an
available crossing; nonmonotone quotes disable the estimate. If all probabilities
are on one side of 50%, only an upper/lower bound is displayed. The user applies
the numeric estimate explicitly; refresh does not overwrite manual calculations.

Responses are cached server-side for 60 seconds with concurrent requests shared
per instance. A normal fresh event load makes eight Heisenberg requests for its
seven thresholds; market pagination is bounded. Hourly quote times, partial data,
notices and the calculation method are shown in the UI. There is no automatic
polling. Errors retain the manual calculator and never expose provider response
bodies, credentials or stack traces.

A Next.js App Router and TypeScript app with Arcus, TxFlow and Extended tools
and an enabled multi-exchange project chooser. Add future projects through `lib/projects.ts`.

## Enable or disable the project chooser and TxFlow

To preview TxFlow separately, set `TXFLOW_ENABLED=true` in the ignored
`.env.local` and restart the local server after building the updated source.
This enables `/txflow`, `/txflow/wallet` and its API independently when the
project chooser is disabled. The override defaults to disabled when unset;
remove it or set it to `false` to hide TxFlow again.

The project chooser, exchange pages and **All projects** navigation are enabled
by default locally and on deployments. `NEXT_PUBLIC_MULTI_EXCHANGE_ENABLED=false`
temporarily disables the hub; set it to `true` or remove it to enable the hub again.
This public boolean is bundled into browser navigation as well as read by the
server, so rebuild/restart after changing it. Local `.env.local` stays ignored.

When disabled, `/` redirects to `/arcus`; TxFlow routes/API also remain disabled
unless the separate `TXFLOW_ENABLED` override above is enabled. The source,
assets and saved browser settings are retained in both modes.

The Arcus points estimator lives at `/arcus`, with wallet analytics at
`/arcus/wallet`. The previous `/wallet` URL redirects to `/arcus/wallet`.
When multi-exchange mode is enabled, both Arcus tools have an `All projects` link.
Existing stored names, wallet addresses and estimator settings are preserved.

Arcus nickname searches read the local
`leaderboard-season-1-2026-10-22.json` through `GET /api/points?name=Witty%20Phoenix`.
The full snapshot stays on the server; only the matching entry is sent to the browser.
The previous `leaderboard-season-1-2026-10-15.json` is used for weekly comparisons.
Both it and the original `leaderboard-season-1.json` are retained as archives.

## Local development

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:3000 to use Arcus, or select an exchange when multi-exchange
mode is enabled. Arcus search ignores letter case and extra spaces.
The interface, validation messages, and API errors are in English.
The Arcus nickname is remembered in browser storage and shared between the points
estimator and wallet analytics inputs, including after a reload. Clearing either
nickname field clears the saved name.
The wallet address is also remembered across navigation and reloads. Clearing
the wallet input removes the saved address.
The estimator also remembers manual points, FDV, airdrop allocation, total pool,
and matrix view. A saved nickname calculation reloads its leaderboard entry from
the active snapshot, restoring rank and weekly comparison without another search.

## Brand assets

Visual reference: https://arcus.xyz/brand-kit. Official logo SVGs are bundled in
`public/brand`; Hedvig Letters Serif and Satoshi fonts from the brand-kit page
are bundled in `public/fonts` so the app has no external font dependency.
Brand palette: sand `#E8DDBE`, forest `#1E3B25`, dark `#0F140D`, cream `#F5F2EB`.
This is an unofficial community tool.

TxFlow's calculator lives at `/txflow`. It uses manual user points and selectable
total pool scenarios from the supplied simulation: Basic **45.6M**, Bullish
**52.1M**, or Manual. The last custom pool is retained when switching scenarios.
These approximate totals are assumptions, not official TxFlow totals. FDV presets
are **$100M, $250M, $500M, $750M, $1B** and allocations **15%, 20%, 25%, 30%**.
It uses the same proportional calculation as Arcus. The matrix
switches between per-point and personal values, and cell selection updates the
scenario controls. Inputs and display mode persist separately under
`txflow-estimate-v1`, leaving Arcus calculations untouched. Existing custom totals
migrate to Manual mode. Only final display values are rounded: exact division
gives $4.39 for Basic $1B/20% and $4.80 for Bullish $1B/25%, slightly different
from the reference image's $4.38/$4.79.

TxFlow visual references: [brand kit](https://docs.txflow.com/resources/brand-kit),
[trading app](https://app.txflow.com/trade/SNDK-USDC), and
[Squad Bounty](https://app.txflow.com/campaign/squad-bounty). Official PNG logos
and Space Grotesk / PP Mondwest WOFF2 fonts are bundled under `public/brand/txflow`
and `public/fonts/txflow`. The design uses the brand's green accents (`#8DF885`
dark, `#33DC26` light), dark exchange surfaces, square borders, and pixel display
type. Styles are scoped to `.txflow-page` for safe navigation between projects.

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
The Arcus default pool is **11,000,000 points**, a reference assumption rather than
the current Season 1 total. Enter a custom pool or use the snapshot's point total.

Estimated value = FDV × (allocation / 100) × (your points / total points).
The matrix shows value per point or a personal estimate. Selecting a cell
synchronizes the FDV and allocation controls. Editing points manually clears
the linked participant and rank. Token amounts require a known token supply.
These are hypothetical scenarios; a token launch and airdrop are not guaranteed.

`npm test` checks all 15 reference values and calculation edge cases.

## TxFlow wallet analytics

Open `/txflow/wallet` from either TxFlow tool. `POST /api/txflow/wallet` proxies
read-only queries to `https://rpc.txflow.com/info` with
`x-api-version: 2026-08-16`; no authentication, wallet connection, or signature.
Points are entered at the top beside the wallet and analysis scope. Three main views:

- **Awarded epochs only** (default): enter each included epoch's points separately;
  the total is summed automatically once all fields are valid, including zero.
  Until then, a combined total can be entered manually. Editing an epoch clears
  the old manual total; per-epoch inputs are shared across analysis modes. Only confirmed
  received distributions contribute executions, fees and funding. Gaps between
  selected epochs are excluded, while fills within gaps may establish FIFO context.
- **Season 1 / individual epoch**: enter each epoch's points separately. Both S1
  epochs appear as selectable analysis cards with their own volume, fees, ratios,
  markets and holding profile. Pending distributions retain trading statistics.
- **All available history**: all indexed activity, including ongoing or unawarded
  periods. Ratios are calculated per matching epoch, not against an incomplete total.

Explicit UTC windows are S0 before 12 October 2026; S1 Epoch 1 from 12 October
00:00 through 19 October 23:59:59.999; S1 Epoch 2 from 20 October 00:00 through
26 October 23:59:59.999. RPC upper bounds exclude the next day's midnight.
Epoch 1 was distributed on 20 October. For the requested local preview, S0 and Epoch 2
are marked distributed on 27 October and included by default. Scans still stop
at the actual current time; future executions are never invented. Dates alone never mark unconfigured distributions received. Users confirm **Points received** after
actual distribution; the control is enabled after the snapshot window ends.
Confirmation is stored per address. Changing receipts clears the combined total
and report so a stale total cannot silently be reused for a different scope.

Existing saved wallet, period and epoch point values migrate without loss.
Epoch points are saved separately from the combined awarded total. Zero is a valid
point value but cannot produce a per-point ratio. Missing points remain unknown.
Manual epoch ratios require complete selected fills and positive entered points.
Inputs remain enabled before distribution, including S0 and Epoch 2. Pending
distributions with entered points are labelled as manual comparisons; an ongoing
epoch uses trades through the scan cutoff. Manual entry does not mark points as
received or add that epoch to the awarded-only scan. Future epochs are not inferred from a calendar.

Other supported trade periods: 24 hours, 7 days, 30 days, and 90 days. Only perpetual
accounts are queried. Outcome accounts are excluded.

The report includes executed volume, paid fees, rebates and net USDC fill fees,
realized fill PnL, funding cash flows, maker/taker volume, UTC daily activity,
market breakdowns, current equity and positions. API `userOverview` is displayed
separately from fill-based calculations. A fixed epoch does not query the
rolling-only overview endpoint. Current account data is independent of
the selected history period. The live overview has a bare `code: 0` response;
the client also supports the documented success/data envelope.

`userFills` and `userFundings` use offset pagination and `hasMore`, with a fixed
history end timestamp and a limit of 20 pages of 1,000 rows per history type /
50 seconds. Duplicate executions are reconciled without collapsing both legs
of a self-trade. Stalled pagination, changed counts, invalid rows, timeouts and
upstream failures produce partial/unavailable labels. Empty successful history
is distinct from unavailable history. Maker/taker classification comes from
`tradeSide`; the legacy nullable `crossed` field is ignored.

Notional is executed size × price; decimal arithmetic uses 18 decimal places
before final display rounding, and lossless JSON parsing preserves uint64 IDs.
Non-USDC fee tokens are flagged and excluded from USDC fee totals. Funding is
separate from fill fees and closed PnL. Complete scans can be compared to manually
entered points earned in the same period; no official points weighting is inferred.
Points inputs are remembered per address and period under `txflow-wallet-v1`.
The address and selected period persist across navigation/reload. The latest report
stays in memory across tool navigation; it is not stored in browser storage.

Holding analysis reconstructs FIFO positions per instrument and margin mode.
It groups executed volume into closed `<1h`, `1–2h`, `2–12h`, `12h+`, open `<12h`,
open `12h+`, and unknown opening history. Both entry and exit notional are allocated
once, with exact remainders on partial closes and direction flips. A volume-weighted
average is shown for matched closed executions. Open entries age at the selected
period cutoff, including the fixed Epoch 1 end; later exits never rewrite that mix.
For bounded periods, earlier fills are loaded separately to establish openings but
do not contribute to period volume or fees. Selected plus earlier fills share the
20-page fills budget. `startPosition` checkpoints reveal unknown opening positions
and continuity gaps; affected volume remains unknown. Truncated prior history is
disclosed, and an incomplete selected scan produces no holding breakdown. These
are descriptive durations, not published TxFlow points multipliers.

Sources: [Info API](https://docs.txflow.com/api/info),
[fills](https://docs.txflow.com/api/info/userFills),
[overview](https://docs.txflow.com/api/info/userOverview),
[account](https://docs.txflow.com/api/info/clearinghouseState),
[funding](https://docs.txflow.com/api/info/userFundings).

## Wallet analytics test page

Open `/arcus/wallet` from the navigation above the estimator. The page reads the public
Arcus API through `POST /api/wallet`; no wallet connection, API key, or signature is
required. Choose all subaccounts (0–9) or one subaccount and an all-time, rolling,
or custom UTC period under `Scan settings`. Enter your wallet address and
Arcus name alongside it and press `Analyze activity`
to load trades and points together. `Load points` also works independently.
The API does not verify that the wallet and nickname belong to the same profile.

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

For weekly analysis, any Season 1 window with no executions in the initial history
is checked again using explicit inclusive microsecond bounds on each active
subaccount. Recovered executions are merged before calculating volumes, fees,
markets and FIFO holding times. The same page/time budget covers these checks;
failed checks make the report incomplete rather than confirming a zero-volume week.
The JSON report includes `scan.verifiedEmptyWeeks` and `scan.recoveredFillCount`
for diagnosing history gaps. Each new analysis requests uncached data.

For volume or net fees per point, enter period points manually or load a name from
the local leaderboard. The name is not inferred from the address. Choose either
the current Season 1 total or its gain since the archived snapshot, and match the
scan's trade period to that points period. Ratios are descriptive, not an official
Arcus points conversion formula.
Custom period ratios and account aggregates are in the secondary accordions.
`Download report JSON` includes the source fills and loaded points profile.

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
Week cards compare recorded points with volume. The selected week shows
fees/point, volume/point, changes from the preceding week, holding mix, maker
share and market mix. Holding and market details show only the selected week's
values and label that week explicitly; switching week cards lets users compare them.
On mobile, the primary comparison uses cards; the optional compact table has a
sticky week column and its own horizontal scroll container.

`GET /api/points?name=...&history=1` adds the three saved distribution records as
`weekly_points`. Rewards are consecutive cumulative snapshot differences, not
trade-level attribution. Missing history stays unknown, negative changes are
adjustments, and ongoing weeks remain pending. Weekly efficiency requires
positive recorded points, all subaccounts and a completed full analysis week.
See [research and design decisions](docs/wallet-analytics-design.md).

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
append its filename, week number and actual distribution time to the snapshot
registry in `lib/leaderboard.ts`. The last two records become the active and
previous snapshots; all records are available to weekly analytics. A download
time is not a distribution time.
Include the JSON file when deploying to another server and use the Node.js runtime.
