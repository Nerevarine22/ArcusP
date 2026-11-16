# Entropy builder analytics

Entropy history is attributed using builder `0xcd254d2a328f7f67c7c6fef930a4757516f7b601`, not the `io:` market prefix. Public daily builder files include native and HIP-3 perpetual markets. An address appearing only as counterparty does not qualify. Spot executions are excluded.

Run `npm run entropy:init` once against the connected PostgreSQL database. This creates the private `entropy_analytics` schema with one row per requested wallet/day and a cached report per wallet/period. Global execution archives and other wallets' executions are not retained in PostgreSQL. DATABASE_URL stays server-side.

`POST /api/entropy/wallet` accepts `{ address, period, sync }`. With `sync: false`, it returns saved data and outstanding-day counts. With `sync: true` (the default), it imports up to 12 outstanding days with two concurrent archive requests, saves validated results, and returns the updated report. The page repeats bounded requests until no days remain. Cancellation or interruption retains completed batches; a later analysis resumes from them. No cron job is required.

Days are checked from 19 August 2026 or the start of the selected rolling period. Available recent days (less than three days old) are rechecked after 15 minutes; older days after seven days. Missing/inaccessible files and request failures are retried after five minutes. A 403/404 is unavailable data, never an empty trading day. Valid refreshes reconcile a day rather than append duplicate executions. Failed requests retain the previous saved executions. Concurrent writes lock matching days and merge known fee enrichment before updating.

Archive bodies have a best-effort, memory-bounded cache on each server instance. Cache eviction and server restarts do not lose wallet history. Individual archives are limited to 24 MiB compressed / 128 MiB decoded. No database credentials or upstream authorization tokens are sent to the browser.

Execution fees are enriched from Hyperliquid's public account feed, using exact size/price/PnL/role/builder fee and second-level timestamps. A group is matched only when candidate and archive multiplicities agree; ambiguous candidates remain unknown. Builder fees already form part of Hyperliquid's execution fee and are never added twice. Fee totals are displayed only if every selected execution has a matched USDC fee; the report separately identifies the verified subset. Older fills beyond Hyperliquid retention can remain unverified.

Every result is marked incomplete, including an empty successful archive. Public builder files frequently end before the UTC day ends; complete availability of dates does not prove complete trade coverage. Funding, account balances, positions and FIFO holding times cannot be isolated reliably by frontend and are excluded from the builder analysis. Archived realized PnL is not a complete account PnL. The export includes day-by-day archive coverage and synchronization progress.

Sources: [builder codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes), [public fills](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).
