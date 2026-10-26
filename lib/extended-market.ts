export const EXTENDED_EVENT_SLUG = "extended-fdv-above-one-day-after-launch";
export const EXTENDED_MARKET_URL = `https://polymarket.com/event/${EXTENDED_EVENT_SLUG}`;
export const EXTENDED_MARKET_TITLE = "Extended FDV above ___ one day after launch?";
export const MAX_QUOTE_AGE_MS = 24 * 60 * 60 * 1000;

export type ExtendedThreshold = {
  thresholdUsd: number; question: string; marketUrl: string;
  yesProbability: number | null; lastKnownProbability: number | null; quoteAsOf: string | null;
  priceMethod: "midpoint" | "last_trade" | null;
  state: "available" | "stale" | "unavailable";
};
export type FdvMedian =
  | { kind: "estimate"; fdvUsd: number; lowerUsd: number; upperUsd: number }
  | { kind: "below" | "above"; boundUsd: number }
  | { kind: "unavailable"; reason: string };
export type ExtendedMarketSnapshot = {
  status: "ready" | "partial" | "unavailable" | "not_configured";
  provider: "Heisenberg"; marketTitle: string; marketUrl: string;
  fetchedAt: string; quoteAsOf: string | null;
  thresholds: ExtendedThreshold[]; median: FdvMedian;
  warnings: string[]; message: string | null;
};
export type HeisenbergQuery = (agent: number, params: Record<string, string>, pagination: { limit: number; offset: number }) => Promise<unknown>;
type Market = { thresholdUsd: number; question: string; slug: string; conditionId: string; yesToken: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected market response.");
  return value as Record<string, unknown>;
}
export function heisenbergPage(value: unknown) {
  const response = object(value), data = object(response.data), pagination = object(response.pagination);
  if (!Array.isArray(data.results) || data.results.length > 200 || typeof pagination.has_more !== "boolean") throw new Error("Unexpected market response.");
  return { rows: data.results as unknown[], hasMore: pagination.has_more };
}
export function normalizeExtendedMarkets(values: unknown[]): Market[] {
  const markets: Market[] = [], seen = new Set<number>();
  for (const value of values) {
    const row = object(value);
    // Never admit other events from a broad or malformed search response.
    if (row.event_slug !== EXTENDED_EVENT_SLUG || row.closed !== false) continue;
    const question = String(row.question ?? ""), match = question.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|bn|m|b)\b/i);
    if (!match || !/extended\s+fdv\s+above/i.test(question)) throw new Error("Unrecognized Extended FDV threshold.");
    const thresholdUsd = Number(match[1].replaceAll(",", "")) * (/^(b|bn|billion)$/i.test(match[2]) ? 1e9 : 1e6);
    const yesToken = String(String(row.side_a_outcome).toLowerCase() === "yes" ? row.side_a_token_id
      : String(row.side_b_outcome).toLowerCase() === "yes" ? row.side_b_token_id : "");
    if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0 || seen.has(thresholdUsd)
      || !/^\d{1,100}$/.test(yesToken) || !/^0x[\da-f]{64}$/i.test(String(row.condition_id))
      || !/^[a-z0-9-]+$/.test(String(row.slug))) throw new Error("Invalid or duplicate Extended market.");
    seen.add(thresholdUsd);
    markets.push({ thresholdUsd, question, slug: String(row.slug), conditionId: String(row.condition_id), yesToken });
  }
  if (markets.length > 20) throw new Error("Too many Extended thresholds.");
  return markets.sort((a, b) => a.thresholdUsd - b.thresholdUsd);
}
function probability(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || (typeof value !== "number" && typeof value !== "string")) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= 1 ? result : null;
}
export function quoteFromCandles(values: unknown[], market: Market, now: number): Pick<ExtendedThreshold, "yesProbability" | "lastKnownProbability" | "quoteAsOf" | "priceMethod" | "state"> {
  const quotes = values.map(value => {
    const row = object(value), time = typeof row.candle_time === "string" ? Date.parse(row.candle_time) : NaN;
    if (row.token_id !== market.yesToken || row.condition_id !== market.conditionId || String(row.outcome).toLowerCase() !== "yes"
      || !Number.isFinite(time) || time > now + 60_000) return null;
    const bid = probability(row.bid_close), ask = probability(row.ask_close), close = probability(row.close);
    // Do not use crossed or very wide books. A recorded trade is the fallback.
    if (bid !== null && ask !== null && bid <= ask && ask - bid <= 0.1 + 1e-10) return { time, yesProbability: (bid + ask) / 2, priceMethod: "midpoint" as const };
    if (close !== null && Number(row.trade_count) > 0) return { time, yesProbability: close, priceMethod: "last_trade" as const };
    return null;
  }).filter(value => value !== null).sort((a, b) => b.time - a.time);
  const latest = quotes[0];
  if (!latest) return { yesProbability: null, lastKnownProbability: null, quoteAsOf: null, priceMethod: null, state: "unavailable" };
  const shared = { lastKnownProbability: latest.yesProbability, quoteAsOf: new Date(latest.time).toISOString(), priceMethod: latest.priceMethod };
  if (now - latest.time > MAX_QUOTE_AGE_MS) return { ...shared, yesProbability: null, state: "stale" };
  return { ...shared, yesProbability: latest.yesProbability, state: "available" };
}

/** These are overlapping P(FDV > threshold) contracts, not exclusive outcomes. */
export function inferFdvMedian(thresholds: Pick<ExtendedThreshold, "thresholdUsd" | "yesProbability">[]): FdvMedian {
  const rows = thresholds.filter(row => row.yesProbability !== null).sort((a, b) => a.thresholdUsd - b.thresholdUsd);
  if (!rows.length) return { kind: "unavailable", reason: "No recent threshold quotes are available." };
  if (rows.some((row, index) => !Number.isFinite(row.thresholdUsd) || row.thresholdUsd <= 0 || !Number.isFinite(row.yesProbability)
    || row.yesProbability! < 0 || row.yesProbability! > 1 || (index > 0 && (row.thresholdUsd === rows[index - 1].thresholdUsd || row.yesProbability! > rows[index - 1].yesProbability! + 1e-10)))) {
    return { kind: "unavailable", reason: "Threshold probabilities are inconsistent. Use the individual scenarios instead." };
  }
  const exact = rows.find(row => row.yesProbability === 0.5);
  if (exact) return { kind: "estimate", fdvUsd: exact.thresholdUsd, lowerUsd: exact.thresholdUsd, upperUsd: exact.thresholdUsd };
  if (rows[0].yesProbability! < 0.5) return { kind: "below", boundUsd: rows[0].thresholdUsd };
  if (rows[rows.length - 1].yesProbability! > 0.5) return { kind: "above", boundUsd: rows[rows.length - 1].thresholdUsd };
  for (let index = 1; index < rows.length; index++) {
    const lower = rows[index - 1], upper = rows[index];
    if (lower.yesProbability! > 0.5 && upper.yesProbability! < 0.5) {
      const fraction = (lower.yesProbability! - 0.5) / (lower.yesProbability! - upper.yesProbability!);
      return { kind: "estimate", fdvUsd: lower.thresholdUsd + fraction * (upper.thresholdUsd - lower.thresholdUsd), lowerUsd: lower.thresholdUsd, upperUsd: upper.thresholdUsd };
    }
  }
  return { kind: "unavailable", reason: "A 50% crossing could not be identified." };
}

export function emptyExtendedMarket(status: "unavailable" | "not_configured", message: string, now = Date.now()): ExtendedMarketSnapshot {
  return { status, provider: "Heisenberg", marketTitle: EXTENDED_MARKET_TITLE, marketUrl: EXTENDED_MARKET_URL,
    fetchedAt: new Date(now).toISOString(), quoteAsOf: null, thresholds: [], median: { kind: "unavailable", reason: message }, warnings: [], message };
}

export async function loadExtendedMarket(query: HeisenbergQuery, now = Date.now()): Promise<ExtendedMarketSnapshot> {
  const raw: unknown[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = heisenbergPage(await query(574, { event_slug: EXTENDED_EVENT_SLUG, closed: "False" }, { limit: 200, offset }));
    raw.push(...page.rows);
    if (!page.hasMore) break;
    if (offset >= 400 || page.rows.length === 0) throw new Error("Market pagination could not complete.");
  }
  const markets = normalizeExtendedMarkets(raw);
  if (!markets.length) return emptyExtendedMarket("unavailable", "No open markets were found for this Extended event.", now);
  const thresholds: ExtendedThreshold[] = [], warnings: string[] = [];
  // At most 168 hourly candles in seven days. Sparse markets can have no 1m rows.
  const end = Math.floor(now / 1000), params = { interval: "1h", start_time: String(end - 7 * 86400), end_time: String(end) };
  // Small batches keep the integration bounded and avoid a burst per threshold.
  for (let offset = 0; offset < markets.length; offset += 3) {
    const batch = await Promise.allSettled(markets.slice(offset, offset + 3).map(async market => {
      const page = heisenbergPage(await query(568, { ...params, token_id: market.yesToken }, { limit: 200, offset: 0 }));
      if (page.hasMore) throw new Error("Incomplete quote history.");
      return quoteFromCandles(page.rows, market, now);
    }));
    batch.forEach((result, index) => {
      const market = markets[offset + index];
      const quote = result.status === "fulfilled" ? result.value : { yesProbability: null, lastKnownProbability: null, quoteAsOf: null, priceMethod: null, state: "unavailable" as const };
      if (quote.state !== "available") warnings.push(`${market.question} ${quote.state === "stale" ? "Its latest quote is over 24 hours old." : "A recent quote is unavailable."}`);
      thresholds.push({ thresholdUsd: market.thresholdUsd, question: market.question, marketUrl: `${EXTENDED_MARKET_URL}/${market.slug}`, ...quote });
    });
  }
  const available = thresholds.filter(row => row.state === "available");
  const median = inferFdvMedian(thresholds);
  return { status: available.length === thresholds.length ? "ready" : available.length ? "partial" : "unavailable", provider: "Heisenberg",
    marketTitle: EXTENDED_MARKET_TITLE, marketUrl: EXTENDED_MARKET_URL, fetchedAt: new Date(now).toISOString(),
    quoteAsOf: available.length ? available.map(row => row.quoteAsOf!).sort()[0] : null, thresholds, median, warnings,
    message: available.length ? null : "No quotes from the last 24 hours are available. Manual FDV remains available." };
}
