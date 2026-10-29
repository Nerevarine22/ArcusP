import { analyzeTxHolding, groupTxFills, summarizeTxFills, summarizeTxFunding, txAtoms, txUsd, type TxAccount, type TxFill, type TxFunding, type TxHoldingAnalysis, type TxScan, type TxSummary } from "./txflow-wallet";

export const ENTROPY_PREFIX = "io:";
export const ENTROPY_PERIODS = { ALL: "Available history", "24H": "Last 24 hours", "7D": "Last 7 days", "30D": "Last 30 days", "90D": "Last 90 days" };
export type EntropyPeriod = keyof typeof ENTROPY_PERIODS;
export type EntropySettings = { address: string; period: EntropyPeriod };
export const ENTROPY_DEFAULTS: EntropySettings = { address: "", period: "ALL" };
export type EntropyFill = TxFill & { builderFee: string };
export type EntropyScan<T> = TxScan<T> & { rawCount: number; ignored: number; firstTime: number | null; retentionLimited: boolean };
export type EntropyReport = {
  version: 1; address: string; dex: "io"; period: EntropyPeriod; fetchedAt: string;
  range: { from: string | null; to: string }; scan: Omit<EntropyScan<EntropyFill>, "rows">;
  fundingScan: Omit<EntropyScan<TxFunding>, "rows">;
  summary: TxSummary | null; builderFeesIncluded: string | null;
  funding: ReturnType<typeof summarizeTxFunding> | null; realizedNet: string | null;
  holding: TxHoldingAnalysis; account: TxAccount | null; warnings: string[];
  markets: ReturnType<typeof groupTxFills>["markets"]; days: ReturnType<typeof groupTxFills>["days"];
  weeks: { start: string; end: string; summary: TxSummary }[];
  firstFillAt: string | null; lastFillAt: string | null;
};

export function parseEntropySettings(raw: string | null): EntropySettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return ENTROPY_DEFAULTS;
    return { address: typeof value.address === "string" ? value.address.slice(0, 42) : "", period: Object.hasOwn(ENTROPY_PERIODS, value.period) ? value.period : "ALL" };
  } catch { return ENTROPY_DEFAULTS; }
}
export const isEntropyMarket = (coin: unknown): coin is string => typeof coin === "string" && /^io:[A-Za-z0-9_.-]{1,80}$/.test(coin);
export function entropyRange(period: EntropyPeriod, now: number) {
  const days = { "24H": 1, "7D": 7, "30D": 30, "90D": 90 };
  return { from: period === "ALL" ? null : now - days[period] * 86_400_000, to: now };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected Hyperliquid response.");
  return value as Record<string, unknown>;
}
function time(value: unknown) {
  const parsed = typeof value === "number" || typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 8.64e15) throw new Error("Invalid execution timestamp.");
  return parsed;
}
function id(value: unknown) {
  if (typeof value === "number" && !Number.isSafeInteger(value) || !/^\d{1,100}$/.test(String(value))) throw new Error("Invalid execution identifier.");
  return String(value);
}
function amount(value: unknown) {
  if (typeof value !== "string" || !/^-?\d+(\.\d{1,18})?$/.test(value) || value.length > 100) throw new Error("Invalid financial amount in Hyperliquid response.");
  return txUsd(txAtoms(value));
}
const optionalAmount = (value: unknown) => value === undefined || value === null || value === "" ? null : amount(value);
const scale = BigInt("1000000000000000000");

export function normalizeEntropyFill(value: unknown): EntropyFill | null {
  const row = record(value);
  if (!isEntropyMarket(row.coin)) return null;
  if (row.side !== "A" && row.side !== "B") throw new Error("Invalid execution side.");
  const size = amount(row.sz), price = amount(row.px);
  if (txAtoms(size) <= BigInt(0) || txAtoms(price) <= BigInt(0)) throw new Error("Execution size and price must be positive.");
  const tid = id(row.tid), oid = id(row.oid), timestamp = time(row.time);
  const fee = amount(row.fee), builderFee = row.builderFee == null ? "0" : amount(row.builderFee);
  if (txAtoms(builderFee) < BigInt(0)) throw new Error("Builder fees cannot be negative.");
  return { key: `${row.coin}:${tid}:${oid}:${row.side}`, market: row.coin, instrument: row.coin,
    side: row.side === "B" ? "BUY" : "SELL", size, startPosition: optionalAmount(row.startPosition), sequence: tid, marginMode: "hip3",
    time: timestamp, notional: txUsd((txAtoms(size) * txAtoms(price) + scale / BigInt(2)) / scale),
    fee, feeToken: typeof row.feeToken === "string" && row.feeToken.trim() ? row.feeToken.trim().toUpperCase() : "Unknown",
    closedPnl: amount(row.closedPnl), role: row.crossed === true ? "Taker" : row.crossed === false ? "Maker" : "Unknown", builderFee };
}
export function normalizeEntropyFunding(value: unknown): TxFunding | null {
  const row = record(value), delta = record(row.delta);
  if (!isEntropyMarket(delta.coin)) return null;
  if (delta.type !== "funding") throw new Error("Unexpected funding entry.");
  const timestamp = time(row.time);
  return { key: `${delta.coin}:${timestamp}:${String(row.hash ?? "")}`, market: delta.coin, time: timestamp, amount: amount(delta.usdc) };
}

/** Paginate the unfiltered account feed. Other DEX fills still advance its cursor. */
export async function collectEntropyHistory<T extends { key: string; time: number }>(
  fetchPage: (startTime: number) => Promise<unknown>, normalize: (value: unknown) => T | null,
  options: { to: number; limit: number; maxPages: number; kind: "fills" | "funding" },
): Promise<EntropyScan<T>> {
  const rows: T[] = [], seen = new Map<string, string>();
  let pages = 0, cursor = 0, rawCount = 0, ignored = 0, firstTime: number | null = null;
  const finish = (status: TxScan<T>["status"], warning?: string): EntropyScan<T> => ({ rows, pages, rawCount, ignored, firstTime,
    retentionLimited: options.kind === "fills" && rawCount >= 10_000, status, warnings: warning ? [warning] : [] });
  try {
    while (pages < options.maxPages) {
      const page = await fetchPage(cursor);
      if (!Array.isArray(page) || page.length > options.limit) throw new Error("Unexpected history page.");
      const staged: { key: string; signature: string; time: number; row: T | null }[] = [];
      const pageSeen = new Map<string, string>();
      let lastTime = cursor;
      for (const raw of page) {
        const recordRow = record(raw), timestamp = time(recordRow.time);
        if (timestamp < cursor || timestamp > options.to) throw new Error("History returned an execution outside the requested time range.");
        const key = options.kind === "fills" ? `${String(recordRow.coin)}:${id(recordRow.tid)}:${id(recordRow.oid)}:${String(recordRow.side)}`
          : `${String(record(recordRow.delta).coin)}:${timestamp}:${String(recordRow.hash ?? "")}`;
        const signature = JSON.stringify(recordRow), previous = seen.get(key) ?? pageSeen.get(key);
        if (previous && previous !== signature) throw new Error("A history entry changed during pagination. Refresh the analysis.");
        lastTime = Math.max(lastTime, timestamp);
        if (!previous) { staged.push({ key, signature, time: timestamp, row: normalize(raw) }); pageSeen.set(key, signature); }
      }
      // Only commit a fully validated page; keep earlier pages if a later one fails.
      for (const item of staged) {
        seen.set(item.key, item.signature); rawCount++;
        firstTime = firstTime === null ? item.time : Math.min(firstTime, item.time);
        if (item.row) rows.push(item.row); else ignored++;
      }
      pages++;
      if (page.length < options.limit) return finish("complete");
      if (lastTime <= cursor) return finish("partial", "Too many history entries share a timestamp. The API cursor cannot advance safely; some executions may be missing.");
      cursor = lastTime; // Inclusive boundary: deduplicate rather than skip same-millisecond executions.
    }
    return finish("partial", "The history scan limit was reached. Totals cover loaded executions only.");
  } catch (cause) {
    return finish(pages ? "partial" : "unavailable", cause instanceof Error ? cause.message : "History could not be loaded.");
  }
}

export function normalizeEntropyAccount(value: unknown): TxAccount {
  const row = record(value), margin = record(row.marginSummary);
  if (!Array.isArray(row.assetPositions)) throw new Error("Positions are unavailable.");
  const positions = row.assetPositions.map(raw => {
    const position = record(record(raw).position);
    if (!isEntropyMarket(position.coin)) throw new Error("The account response included a market outside the io DEX.");
    const leverage = record(position.leverage);
    return { market: position.coin, size: amount(position.szi), entryPrice: optionalAmount(position.entryPx), markPrice: null,
      liquidationPrice: optionalAmount(position.liquidationPx), value: amount(position.positionValue), margin: amount(position.marginUsed),
      unrealizedPnl: amount(position.unrealizedPnl), leverage: Number.isFinite(Number(leverage.value)) ? Number(leverage.value) : null, marginMode: String(leverage.type ?? "Unknown") };
  }).filter(position => txAtoms(position.size) !== BigInt(0));
  return { equity: amount(margin.accountValue), withdrawable: amount(row.withdrawable), marginUsed: amount(margin.totalMarginUsed),
    positionValue: amount(margin.totalNtlPos), time: row.time == null ? null : time(row.time), positions };
}

export function buildEntropyReport(address: string, period: EntropyPeriod, now: number,
  fillScan: EntropyScan<EntropyFill>, fundingScan: EntropyScan<TxFunding>, account: TxAccount | null, accountWarning?: string): EntropyReport {
  const range = entropyRange(period, now), inRange = (value: { time: number }) => value.time <= now && (range.from === null || value.time >= range.from);
  const fills = fillScan.rows.filter(inRange), fundings = fundingScan.rows.filter(inRange);
  const summary = fillScan.status === "unavailable" ? null : summarizeTxFills(fills);
  const funding = fundingScan.status === "unavailable" ? null : summarizeTxFunding(fundings);
  const selectedComplete = fillScan.status === "complete" && (!fillScan.retentionLimited || range.from !== null && fillScan.firstTime !== null && fillScan.firstTime <= range.from);
  const warnings = [...fillScan.warnings, ...fundingScan.warnings, ...(accountWarning ? [accountWarning] : [])];
  if (fillScan.retentionLimited) warnings.push("Hyperliquid's 10,000-fill retention limit was reached across all markets. Earlier executions may be unavailable.");
  if (summary?.excludedFeeTokens.length) warnings.push(`Fees in ${summary.excludedFeeTokens.join(", ")} are excluded from USDC totals.`);
  let holding: TxHoldingAnalysis;
  const holdingOptions = { from: range.from, to: now, endExclusive: false, selectedComplete, historyStatus: fillScan.retentionLimited ? "partial" as const : fillScan.status, historyPages: fillScan.pages };
  // Hyperliquid trade IDs identify fills; they are not a chronological sequence.
  try { holding = analyzeTxHolding(fillScan.rows.map((fill, index) => ({ ...fill, sequence: String(index) })), holdingOptions); }
  catch { holding = analyzeTxHolding([], { ...holdingOptions, selectedComplete: false }); holding.notes.push("Holding times could not be reconciled with the available executions."); }
  const grouped = groupTxFills(fills), weeks = new Map<string, EntropyFill[]>();
  for (const fill of fills) {
    const date = new Date(fill.time); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const start = date.toISOString(); if (!weeks.has(start)) weeks.set(start, []); weeks.get(start)!.push(fill);
  }
  const { rows: ignoredFills, ...scan } = fillScan, { rows: ignoredFunding, ...fundingInfo } = fundingScan;
  return { version: 1, address, dex: "io", period, fetchedAt: new Date(now).toISOString(), range: { from: range.from === null ? null : new Date(range.from).toISOString(), to: new Date(now).toISOString() },
    scan, fundingScan: fundingInfo, summary, builderFeesIncluded: summary ? txUsd(fills.filter(fill => fill.feeToken === "USDC").reduce((sum, fill) => sum + txAtoms(fill.builderFee), BigInt(0))) : null,
    funding, realizedNet: summary && funding ? txUsd(txAtoms(summary.closedPnl) - txAtoms(summary.netFees) + txAtoms(funding.net)) : null,
    holding, account, warnings, ...grouped,
    weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([start, rows]) => ({ start, end: new Date(Date.parse(start) + 7 * 86_400_000).toISOString(), summary: summarizeTxFills(rows) })),
    firstFillAt: fills.length ? new Date(Math.min(...fills.map(fill => fill.time))).toISOString() : null,
    lastFillAt: fills.length ? new Date(Math.max(...fills.map(fill => fill.time))).toISOString() : null };
}
