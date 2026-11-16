# Entropy market analytics

`POST /api/entropy/wallet` reads the public Hyperliquid Info API directly. It accepts
`{ address, period, scope }`, with periods `ALL`, `24H`, `7D`, `30D`, `90D` and scopes:

- `io` (default): only perpetual markets whose coin starts with `io:`.
- `all`: native and all HIP-3 perpetual markets. Spot executions are excluded.

Both scopes include executions through any interface. Neither scope identifies
trades made through Entropy. A market prefix identifies its DEX, not its frontend.

The route paginates `userFillsByTime` and `userFunding`. Inclusive timestamp
boundaries are deduplicated without skipping same-millisecond executions. Scans
retain validated earlier pages if a later page fails, mark partial/unavailable
data explicitly, and never convert an API failure into successful zero activity.
The API exposes at most the 10,000 most recent account fills across all markets;
selecting `io` does not give that DEX a separate retention allowance. Available
history does not guarantee lifetime history. Account and subaccount addresses
must be checked separately.

Volume sums price × size for each fill, including both entries and exits.
Maker/taker follows `crossed`; USDC fees already include builder fees. Funding
uses the same market scope. FIFO holding times use all loaded fills as context
before applying the selected period. Missing opening history is classified as
unknown. Realized result is loaded closed PnL − net fees + net funding, not an
account-equity calculation. Current `io` positions are fetched separately only
in `io` mode and are independent of the analysis period.

Reports use version 3 and include `scope`. Browser settings migrate to `io` by
default, and cached reports must match wallet, period and scope. Builder reports
are not reused. No database, builder archive, login, or wallet signature is needed
for these requests. Existing research tables and builder modules are retained
but are not read or written by this route.

Source: [Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).
