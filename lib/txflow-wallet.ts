import type { ResearchStatus } from "./research-data";

// S0 and Epoch 2 are marked distributed for the requested local preview.
export const TXFLOW_EPOCHS = {
  S0: { label: "Season 0", start: null, end: "2026-10-12T00:00:00.000Z", dates: "Before 12 October 2026", distribution: "2026-10-27", distributed: true },
  EPOCH_1: { label: "S1 · Epoch 1", start: "2026-10-12T00:00:00.000Z", end: "2026-10-20T00:00:00.000Z", dates: "12–19 October 2026", distribution: "2026-10-20", distributed: true },
  EPOCH_2: { label: "S1 · Epoch 2", start: "2026-10-20T00:00:00.000Z", end: "2026-10-27T00:00:00.000Z", dates: "20–26 October 2026", distribution: "2026-10-27", distributed: true },
};
export const TXFLOW_PERIODS = { AWARDED: "Awarded epochs only", S1: "Season 1 · Epochs 1 & 2", S0: "S0 · Before 12 Oct 2026", EPOCH_1: "S1 · Epoch 1 · 12–19 Oct", EPOCH_2: "S1 · Epoch 2 · 20–26 Oct", ALLTIME: "All available history", "24H": "Last 24 hours", "7D": "Last 7 days", "30D": "Last 30 days", "90D": "Last 90 days" };
export type TxflowEpochId = keyof typeof TXFLOW_EPOCHS;
export type TxflowPeriod = keyof typeof TXFLOW_PERIODS;
export type TxflowWindow = { from: number | null; to: number; endExclusive: boolean };
export const txflowPointsStatus = (period: TxflowPeriod, received: TxflowEpochId[] = []): "pending" | "manual" => (period === "S0" || period === "EPOCH_2") && !TXFLOW_EPOCHS[period].distributed && !received.includes(period) ? "pending" : "manual";
export const txflowDefaultAwarded = (): TxflowEpochId[] => (Object.keys(TXFLOW_EPOCHS) as TxflowEpochId[]).filter(id => TXFLOW_EPOCHS[id].distributed);
export function txflowEpochRange(id: TxflowEpochId, now: number): TxflowWindow {
  const epoch = TXFLOW_EPOCHS[id], from = epoch.start === null ? null : Date.parse(epoch.start), end = Date.parse(epoch.end);
  if (from !== null && now <= from) throw new Error("This points epoch has not started yet.");
  return { from, to: Math.min(end, now), endExclusive: now >= end };
}
export function txflowAwardedEpochs(value: unknown, now: number): TxflowEpochId[] {
  const values = value === undefined ? txflowDefaultAwarded() : value;
  if (!Array.isArray(values) || !values.length || values.length > 3 || values.some(id => typeof id !== "string" || !Object.hasOwn(TXFLOW_EPOCHS, id)) || new Set(values).size !== values.length) throw new Error("Choose at least one valid awarded epoch.");
  const ids = values as TxflowEpochId[];
  for (const id of ids) {
    const epoch = TXFLOW_EPOCHS[id];
    if (epoch.start !== null && Date.parse(epoch.start) >= now) throw new Error("This points epoch has not started yet.");
    if (!epoch.distributed && Date.parse(epoch.end) > now) throw new Error("An awarded epoch must have a completed snapshot window.");
  }
  return (Object.keys(TXFLOW_EPOCHS) as TxflowEpochId[]).filter(id => ids.includes(id));
}
export function txflowEpochIds(period: TxflowPeriod, awarded: TxflowEpochId[], now: number): TxflowEpochId[] {
  const ids = period === "AWARDED" ? awarded : period === "S1" ? ["EPOCH_1", "EPOCH_2"] as TxflowEpochId[]
    : Object.hasOwn(TXFLOW_EPOCHS, period) ? [period as TxflowEpochId] : period === "ALLTIME" ? Object.keys(TXFLOW_EPOCHS) as TxflowEpochId[] : [];
  return ids.filter(id => TXFLOW_EPOCHS[id].start === null || Date.parse(TXFLOW_EPOCHS[id].start!) < now);
}
export function txflowPeriodRange(period: TxflowPeriod, now: number, awarded = txflowDefaultAwarded()): TxflowWindow {
  if (Object.hasOwn(TXFLOW_EPOCHS, period)) return txflowEpochRange(period as TxflowEpochId, now);
  if (period === "S1" || period === "AWARDED") {
    const ids = period === "AWARDED" ? txflowAwardedEpochs(awarded, now) : txflowEpochIds(period, awarded, now);
    if (!ids.length) throw new Error("This points epoch has not started yet.");
    const windows = ids.map(id => txflowEpochRange(id, now));
    const to = Math.max(...windows.map(window => window.to));
    return { from: windows.some(window => window.from === null) ? null : Math.min(...windows.map(window => window.from!)), to,
      endExclusive: windows.filter(window => window.to === to).every(window => window.endExclusive) };
  }
  const days = { "24H": 1, "7D": 7, "30D": 30, "90D": 90 };
  return { from: period === "ALLTIME" ? null : now - days[period as keyof typeof days] * 86_400_000, to: now, endExclusive: false };
}
export function txflowSelectionWindows(period: TxflowPeriod, now: number, awarded = txflowDefaultAwarded()): TxflowWindow[] {
  return period === "AWARDED" ? txflowAwardedEpochs(awarded, now).map(id => txflowEpochRange(id, now)) : [txflowPeriodRange(period, now, awarded)];
}
export const txflowInWindows = (time: number, windows: TxflowWindow[]) => windows.some(window => (window.from === null || time >= window.from) && (window.endExclusive ? time < window.to : time <= window.to));
export type TxflowWalletSettings = { address: string; period: TxflowPeriod; points: Record<string, string>; received: Record<string, boolean> };
export function txflowReceivedEpochs(settings: TxflowWalletSettings, address: string, now: number): TxflowEpochId[] {
  return (Object.keys(TXFLOW_EPOCHS) as TxflowEpochId[]).filter(id => {
    const epoch = TXFLOW_EPOCHS[id];
    if (epoch.start !== null && Date.parse(epoch.start) >= now) return false;
    return epoch.distributed || (Date.parse(epoch.end) <= now && settings.received[`${address}:${id}`] === true);
  });
}
export const TXFLOW_WALLET_DEFAULTS: TxflowWalletSettings = { address: "", period: "AWARDED", points: {}, received: {} };
export function parseTxflowWalletSettings(raw: string | null): TxflowWalletSettings {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return TXFLOW_WALLET_DEFAULTS;
    const points: Record<string, string> = {}, received: Record<string, boolean> = {};
    if (saved.points && typeof saved.points === "object" && !Array.isArray(saved.points)) for (const [key, value] of Object.entries(saved.points).slice(-500)) {
      if (/^0x[0-9a-f]{40}:(S0|EPOCH_1|EPOCH_2|24H|7D|30D|90D)$/.test(key) && typeof value === "string" && value.length <= 100) points[key] = value;
    }
    if (saved.received && typeof saved.received === "object" && !Array.isArray(saved.received)) for (const [key, value] of Object.entries(saved.received).slice(-500)) {
      if (/^0x[0-9a-f]{40}:(S0|EPOCH_1|EPOCH_2)$/.test(key) && typeof value === "boolean") received[key] = value;
    }
    return { address: typeof saved.address === "string" ? saved.address.slice(0, 42) : "", period: typeof saved.period === "string" && Object.hasOwn(TXFLOW_PERIODS, saved.period) ? saved.period : "AWARDED", points, received };
  } catch { return TXFLOW_WALLET_DEFAULTS; }
}
export type TxFill = { key: string; market: string; instrument: string; side: "BUY" | "SELL"; size: string; startPosition: string | null; sequence: string; marginMode: string; time: number; notional: string; fee: string; feeToken: string; closedPnl: string; role: "Maker" | "Taker" | "Unknown" };
export type TxFunding = { key: string; time: number; market: string; amount: string };
export type TxScan<T> = { rows: T[]; pages: number; status: "complete" | "partial" | "unavailable"; warnings: string[] };
export type TxRoleFees = { paid: string; rebates: string; net: string };
export type TxSummary = { fills: number; volume: string; feesPaid: string; rebates: string; netFees: string; closedPnl: string; makerVolume: string; takerVolume: string; unknownRoleVolume: string;
  feesByRole: Record<"maker" | "taker" | "unknown", TxRoleFees>; excludedFeeTokens: string[] };
export type TxOverview = { period: string; pnl: string; roe: string; volume: string; maxDrawdown: string | null; equity: string };
export type TxPosition = { market: string; size: string; entryPrice: string | null; markPrice: string | null; liquidationPrice: string | null; value: string; margin: string; unrealizedPnl: string; leverage: number | null; marginMode: string };
export type TxAccount = { equity: string; withdrawable: string; marginUsed: string; positionValue: string; time: number | null; positions: TxPosition[] };
export type TxWalletReport = {
  research?: ResearchStatus;
  address: string; period: TxflowPeriod; pointsStatus: "pending" | "manual"; fetchedAt: string; range: { from: string | null; to: string; endExclusive: boolean };
  fillsScan: Omit<TxScan<TxFill>, "rows">; fundingScan: Omit<TxScan<TxFunding>, "rows">;
  summary: TxSummary | null; funding: { paid: string; received: string; net: string; count: number } | null;
  overview: TxOverview | null; account: TxAccount | null; warnings: string[];
  markets: (TxSummary & { market: string })[]; days: (TxSummary & { day: string })[];
  holding: TxHoldingAnalysis;
  awardedEpochs: TxflowEpochId[]; windows: { from: string | null; to: string; endExclusive: boolean }[];
  epochs: TxEpochReport[];
};
export type TxEpochReport = { id: TxflowEpochId; label: string; dates: string; range: { from: string | null; to: string; endExclusive: boolean }; completed: boolean;
  summary: TxSummary | null; funding: TxWalletReport["funding"]; holding: TxHoldingAnalysis; markets: TxWalletReport["markets"] };

export function txRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected TxFlow response.");
  return value as Record<string, unknown>;
}
const ten = BigInt(10), zero = BigInt(0), precision = 18, scale = ten ** BigInt(precision);
function decimal(value: unknown) {
  if (typeof value !== "string" || value.length > 100 || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount in TxFlow response.");
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), digits: fraction.length };
}
function quantize(value: bigint, digits: number) {
  if (digits <= precision) return value * ten ** BigInt(precision - digits);
  const divisor = ten ** BigInt(digits - precision), absolute = value < zero ? -value : value;
  const rounded = (absolute + divisor / BigInt(2)) / divisor;
  return value < zero ? -rounded : rounded;
}
export function txAtoms(value: unknown) { const parsed = decimal(value); return quantize(parsed.coefficient, parsed.digits); }
export function txUsd(value: bigint): string {
  const absolute = value < zero ? -value : value;
  const fraction = (absolute % scale).toString().padStart(precision, "0").replace(/0+$/, "");
  return `${value < zero ? "-" : ""}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}
function amount(value: unknown) { return txUsd(txAtoms(value)); }
const optionalAmount = (value: unknown) => value === null || value === undefined || value === "" ? null : amount(value);
function timestamp(value: unknown) {
  const time = Number(value);
  if (!Number.isSafeInteger(time) || time < 0 || time > 8.64e15) throw new Error("Invalid TxFlow timestamp.");
  return time;
}
function id(value: unknown) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Unsafe TxFlow identifier.");
  if (!/^[0-9]+$/.test(String(value))) throw new Error("Missing TxFlow fill identifier.");
  return String(value);
}
function name(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 100) throw new Error("Missing TxFlow market name.");
  return value;
}

/** The live userOverview is bare; other reads use the documented success/data envelope. */
export function unwrapTxflow(value: unknown) {
  const response = txRecord(value);
  if (response.success === false || (response.code !== 0 && response.code !== "0")) throw new Error(typeof response.message === "string" ? response.message.slice(0, 200) : typeof response.msg === "string" && response.msg ? response.msg.slice(0, 200) : "TxFlow reported an API error.");
  const data = response.data === undefined ? response : txRecord(response.data);
  if (data.code !== undefined && data.code !== 0 && data.code !== "0") throw new Error("TxFlow reported an account statistics error.");
  return data;
}

export function normalizeTxFill(value: unknown): TxFill {
  const row = txRecord(value);
  for (const field of ["instrumentType", "marketType"]) if (row[field] !== undefined && row[field] !== "perps" && row[field] !== "perp") throw new Error("TxFlow returned non-perpetual fills for a perp-only scan.");
  const side = String(row.side).toUpperCase();
  if (!["A", "B", "BUY", "SELL"].includes(side)) throw new Error("Invalid TxFlow fill side.");
  const size = decimal(row.sz), price = decimal(row.px);
  if (size.coefficient <= zero || price.coefficient <= zero) throw new Error("TxFlow fill size and price must be positive.");
  const role = row.tradeSide === "Maker" || row.tradeSide === "Taker" ? row.tradeSide : "Unknown";
  let startPosition: string | null = null;
  try { decimal(row.startPosition); startPosition = row.startPosition as string; } catch { /* Missing position checkpoints affect holding estimates, not executed volume. */ }
  return { key: `${id(row.instrumentId)}:${id(row.tid)}:${id(row.oid)}:${side}`, market: name(row.symbol ?? row.coin), instrument: id(row.instrumentId),
    side: side === "B" || side === "BUY" ? "BUY" : "SELL", size: row.sz as string, startPosition, sequence: id(row.tid), marginMode: typeof row.marginMode === "string" ? row.marginMode.toLowerCase() : "unknown",
    time: timestamp(row.time), notional: txUsd(quantize(size.coefficient * price.coefficient, size.digits + price.digits)),
    fee: amount(row.fee), feeToken: typeof row.feeToken === "string" && row.feeToken ? row.feeToken : "Unknown", closedPnl: amount(row.closedPnl), role };
}
export function normalizeTxFunding(value: unknown): TxFunding {
  const row = txRecord(value), time = timestamp(row.time), market = name(row.coin), valueUsd = amount(row.amount);
  return { key: `${market}:${time}:${String(row.szi ?? "")}`, market, time, amount: valueUsd };
}

export async function collectTxHistory<T extends { key: string; time: number }>(fetchPage: (offset: number) => Promise<unknown>, normalize: (row: unknown) => T, options: { from: number | null; to: number; limit: number; maxPages: number }): Promise<TxScan<T>> {
  const rows: T[] = [], seen = new Map<string, string>(); let pages = 0, offset = 0, expectedTotal: number | null = null;
  const finish = (status: TxScan<T>["status"], warning?: string): TxScan<T> => ({ rows, pages, status, warnings: warning ? [warning] : [] });
  try {
    while (pages < options.maxPages) {
      const page = unwrapTxflow(await fetchPage(offset)); pages++;
      if (!Array.isArray(page.data) || page.data.length > options.limit || typeof page.hasMore !== "boolean") throw new Error("Unexpected paged TxFlow history response.");
      if (page.total !== undefined) {
        const total = Number(page.total);
        if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid TxFlow history count.");
        if (expectedTotal !== null && expectedTotal !== total) return finish("partial", "Indexed history changed during pagination. Refresh to reconcile it.");
        expectedTotal = total;
      }
      let added = 0;
      for (const raw of page.data) {
        const row = normalize(raw);
        if (row.time > options.to || (options.from !== null && row.time < options.from)) throw new Error("TxFlow returned history outside the requested period.");
        const signature = JSON.stringify(row), previous = seen.get(row.key);
        if (previous && previous !== signature) throw new Error("A TxFlow history row changed during pagination.");
        if (!previous) { rows.push(row); seen.set(row.key, signature); added++; }
      }
      if (!page.hasMore) {
        if (expectedTotal !== null && expectedTotal !== rows.length) return finish("partial", "The indexed history count does not match the rows returned. Refresh to reconcile it.");
        return finish("complete");
      }
      if (!added) return finish("partial", "TxFlow history pagination stopped advancing.");
      offset += page.data.length;
    }
    return finish("partial", "History scan limit reached. Choose a shorter period.");
  } catch (error) { return finish(rows.length ? "partial" : "unavailable", error instanceof Error ? error.message : "Could not load TxFlow history."); }
}

export function summarizeTxFills(fills: TxFill[]): TxSummary {
  let volume = zero, paid = zero, rebates = zero, pnl = zero, maker = zero, taker = zero, unknown = zero;
  const excluded = new Set<string>();
  const roleFees = { maker: { paid: zero, rebates: zero }, taker: { paid: zero, rebates: zero }, unknown: { paid: zero, rebates: zero } };
  for (const fill of fills) {
    const notional = txAtoms(fill.notional), fee = txAtoms(fill.fee);
    volume += notional; pnl += txAtoms(fill.closedPnl);
    const role = fill.role === "Maker" ? "maker" : fill.role === "Taker" ? "taker" : "unknown";
    if (fill.feeToken.toUpperCase() === "USDC") {
      if (fee >= zero) { paid += fee; roleFees[role].paid += fee; }
      else { rebates -= fee; roleFees[role].rebates -= fee; }
    }
    else if (fee !== zero) excluded.add(fill.feeToken);
    if (fill.role === "Maker") maker += notional; else if (fill.role === "Taker") taker += notional; else unknown += notional;
  }
  const feesFor = (role: keyof typeof roleFees): TxRoleFees => ({ paid: txUsd(roleFees[role].paid), rebates: txUsd(roleFees[role].rebates), net: txUsd(roleFees[role].paid - roleFees[role].rebates) });
  return { fills: fills.length, volume: txUsd(volume), feesPaid: txUsd(paid), rebates: txUsd(rebates), netFees: txUsd(paid - rebates), closedPnl: txUsd(pnl), makerVolume: txUsd(maker), takerVolume: txUsd(taker), unknownRoleVolume: txUsd(unknown),
    feesByRole: { maker: feesFor("maker"), taker: feesFor("taker"), unknown: feesFor("unknown") }, excludedFeeTokens: [...excluded].sort() };
}
export function summarizeTxFunding(rows: TxFunding[]) {
  let paid = zero, received = zero;
  for (const row of rows) { const value = txAtoms(row.amount); if (value >= zero) received += value; else paid -= value; }
  return { paid: txUsd(paid), received: txUsd(received), net: txUsd(received - paid), count: rows.length };
}
export function groupTxFills(fills: TxFill[]) {
  const markets = new Map<string, TxFill[]>(), days = new Map<string, TxFill[]>();
  for (const fill of fills) {
    const day = new Date(fill.time).toISOString().slice(0, 10);
    if (!markets.has(fill.market)) markets.set(fill.market, []);
    if (!days.has(day)) days.set(day, []);
    markets.get(fill.market)!.push(fill);
    days.get(day)!.push(fill);
  }
  return { markets: [...markets].map(([market, rows]) => ({ market, ...summarizeTxFills(rows) })).sort((a, b) => txAtoms(a.volume) > txAtoms(b.volume) ? -1 : txAtoms(a.volume) < txAtoms(b.volume) ? 1 : a.market.localeCompare(b.market)),
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => ({ day, ...summarizeTxFills(rows) })) };
}
export function normalizeTxOverview(value: unknown, period: TxflowPeriod): TxOverview {
  const row = unwrapTxflow(value);
  if (row.period !== period) throw new Error("TxFlow overview returned a different period.");
  return { period, pnl: amount(row.pnl), roe: amount(row.roe), volume: amount(row.volume), maxDrawdown: optionalAmount(row.maxDrawdown), equity: amount(row.totalEquity) };
}
export function normalizeTxAccount(value: unknown): TxAccount {
  const row = unwrapTxflow(value), margin = txRecord(row.marginSummary);
  if (!Array.isArray(row.assetPositions)) throw new Error("Missing TxFlow positions response.");
  const positions = row.assetPositions.map(raw => {
    const position = txRecord(txRecord(raw).position), leverage = txRecord(position.leverage);
    return { market: name(position.coin), size: amount(position.szi), entryPrice: optionalAmount(position.entryPx), markPrice: optionalAmount(position.markPx), liquidationPrice: optionalAmount(position.liquidationPx),
      value: amount(position.positionValue), margin: amount(position.marginUsed), unrealizedPnl: amount(position.unrealizedPnl), leverage: Number.isFinite(Number(leverage.value)) ? Number(leverage.value) : null, marginMode: String(leverage.type ?? "Unknown") };
  }).filter(position => txAtoms(position.size) !== zero);
  return { equity: amount(margin.accountValue), withdrawable: amount(row.withdrawable), marginUsed: amount(margin.totalMarginUsed), positionValue: amount(margin.totalNtlPos), time: row.time == null ? null : timestamp(row.time), positions };
}

export const TX_HOLDING_BUCKETS = [
  { id: "under1h", label: "Closed <1h" }, { id: "oneTo2h", label: "Closed 1–2h" },
  { id: "twoTo12h", label: "Closed 2–12h" }, { id: "over12h", label: "Closed 12h+" },
  { id: "openUnder12h", label: "Open <12h" }, { id: "openOver12h", label: "Open 12h+" },
  { id: "unknown", label: "Unknown opening history" },
] as const;
export type TxHoldingBucket = typeof TX_HOLDING_BUCKETS[number]["id"];
export type TxHoldingAnalysis = {
  status: "complete" | "partial" | "incomplete"; method: "FIFO"; asOf: string;
  volume: string; heldAtLeast12h: string; matchedClosedVolume: string; averageClosedHoldHours: number | null;
  buckets: { id: TxHoldingBucket; label: string; volume: string; sharePercent: number }[];
  history: { status: TxScan<TxFill>["status"]; fills: number; pages: number }; notes: string[];
};

/** Reconstruct one-way positions at the selected cutoff; later exits never rewrite an epoch. */
export function analyzeTxHolding(fills: TxFill[], options: { from: number | null; to: number; endExclusive: boolean; selectedComplete: boolean; historyStatus: TxScan<TxFill>["status"]; historyPages: number; windows?: TxflowWindow[] }): TxHoldingAnalysis {
  const beforeCutoff = (fill: TxFill) => options.endExclusive ? fill.time < options.to : fill.time <= options.to;
  const selected = (fill: TxFill) => beforeCutoff(fill) && (options.from === null || fill.time >= options.from) && (!options.windows || txflowInWindows(fill.time, options.windows));
  const history = fills.filter(beforeCutoff);
  const selectedVolume = history.filter(selected).reduce((total, fill) => total + txAtoms(fill.notional), zero);
  const result: TxHoldingAnalysis = { status: "complete", method: "FIFO", asOf: new Date(options.to).toISOString(), volume: txUsd(selectedVolume),
    heldAtLeast12h: "0", matchedClosedVolume: "0", averageClosedHoldHours: null, buckets: [],
    history: { status: options.historyStatus, fills: history.length, pages: options.historyPages }, notes: [] };
  if (!options.selectedComplete) {
    result.status = "incomplete"; result.notes.push("Complete executions for the selected period are needed to calculate holding times."); return result;
  }
  const totals = Object.fromEntries(TX_HOLDING_BUCKETS.map(bucket => [bucket.id, zero])) as Record<TxHoldingBucket, bigint>;
  type Part = { qty: bigint; volume: bigint; time: number; selected: boolean };
  type Lot = { qty: bigint; sign: bigint; entry: Part | null };
  type Book = { lots: Lot[]; head: number; position: bigint; initialized: boolean };
  const keyFor = (fill: TxFill) => `${fill.instrument}:${fill.marginMode}`;
  const quantityPrecision = new Map<string, number>();
  for (const fill of history) {
    const digits = Math.max(decimal(fill.size).digits, fill.startPosition === null ? 0 : decimal(fill.startPosition).digits);
    quantityPrecision.set(keyFor(fill), Math.max(quantityPrecision.get(keyFor(fill)) ?? 0, digits));
  }
  const quantity = (value: string, key: string) => { const parsed = decimal(value); return parsed.coefficient * ten ** BigInt(quantityPrecision.get(key)! - parsed.digits); };
  history.sort((a, b) => a.time - b.time || (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : a.key.localeCompare(b.key)));
  const books = new Map<string, Book>();
  const absolute = (value: bigint) => value < zero ? -value : value;
  let weightedClosedTime = zero, matchedClosedVolume = zero, continuityGap = false;
  const hour = 3_600_000;
  const closedBucket = (duration: number): TxHoldingBucket => duration < hour ? "under1h" : duration < 2 * hour ? "oneTo2h" : duration < 12 * hour ? "twoTo12h" : "over12h";
  function take(part: Part, qty: bigint) {
    const volume = qty === part.qty ? part.volume : part.volume * qty / part.qty;
    part.qty -= qty; part.volume -= volume; return volume;
  }
  function assign(part: Part, volume: bigint, bucket: TxHoldingBucket, duration?: number) {
    if (!part.selected) return;
    totals[bucket] += volume;
    if (duration !== undefined) { matchedClosedVolume += volume; weightedClosedTime += volume * BigInt(duration); }
  }
  for (const fill of history) {
    const key = keyFor(fill), qty = quantity(fill.size, key), sign = fill.side === "BUY" ? BigInt(1) : BigInt(-1);
    const current: Part = { qty, volume: txAtoms(fill.notional), time: fill.time, selected: selected(fill) };
    const book = books.get(key) ?? { lots: [], head: 0, position: zero, initialized: false };
    books.set(key, book);
    const checkpoint = fill.startPosition === null ? null : quantity(fill.startPosition, key);
    if (checkpoint !== null && (!book.initialized || checkpoint !== book.position)) {
      if (book.initialized) continuityGap = true;
      // Unknown changes may have consumed outstanding entries. Do not invent their exit times.
      for (let i = book.head; i < book.lots.length; i++) {
        const entry = book.lots[i].entry;
        if (entry && entry.qty > zero) assign(entry, take(entry, entry.qty), "unknown");
      }
      book.lots = checkpoint === zero ? [] : [{ qty: absolute(checkpoint), sign: checkpoint > zero ? BigInt(1) : BigInt(-1), entry: null }];
      book.head = 0; book.position = checkpoint; book.initialized = true;
    }
    if (!book.initialized) { assign(current, take(current, current.qty), "unknown"); continue; }
    while (current.qty > zero && book.head < book.lots.length && book.lots[book.head].sign !== sign) {
      const lot = book.lots[book.head], matched = current.qty < lot.qty ? current.qty : lot.qty;
      const exitVolume = take(current, matched);
      if (lot.entry) {
        const duration = fill.time - lot.entry.time, bucket = closedBucket(duration);
        assign(lot.entry, take(lot.entry, matched), bucket, duration);
        assign(current, exitVolume, bucket, duration);
      } else assign(current, exitVolume, "unknown");
      lot.qty -= matched;
      if (lot.qty === zero) book.head++;
    }
    if (current.qty > zero) book.lots.push({ qty: current.qty, sign, entry: current });
    book.position += sign * qty;
  }
  for (const book of books.values()) for (let i = book.head; i < book.lots.length; i++) {
    const entry = book.lots[i].entry;
    if (entry && entry.qty > zero) assign(entry, take(entry, entry.qty), options.to - entry.time >= 12 * hour ? "openOver12h" : "openUnder12h");
  }
  const allocated = Object.values(totals).reduce((sum, value) => sum + value, zero);
  if (allocated !== selectedVolume) throw new Error("Holding-time allocation did not reconcile with executed volume.");
  result.buckets = TX_HOLDING_BUCKETS.map(bucket => ({ ...bucket, volume: txUsd(totals[bucket.id]), sharePercent: selectedVolume > zero ? Number(totals[bucket.id] * BigInt(1_000_000) / selectedVolume) / 10_000 : 0 }));
  result.heldAtLeast12h = txUsd(totals.over12h + totals.openOver12h);
  result.matchedClosedVolume = txUsd(matchedClosedVolume);
  result.averageClosedHoldHours = matchedClosedVolume > zero ? Number(weightedClosedTime / matchedClosedVolume) / hour : null;
  if (options.historyStatus !== "complete") result.notes.push("Earlier execution history is incomplete. Unmatched opening times remain unknown.");
  if (totals.unknown > zero) result.notes.push("Some executions have no verifiable opening time. Their volume is shown as unknown.");
  if (continuityGap) result.notes.push("Position checkpoints revealed gaps or changes in the available history. Affected entries are shown as unknown.");
  if (result.notes.length) result.status = "partial";
  return result;
}


export function buildTxEpochReports(fills: TxFill[], fundings: TxFunding[], ids: TxflowEpochId[], now: number,
  scan: { fillsStatus: TxScan<TxFill>["status"]; fundingStatus: TxScan<TxFunding>["status"]; historyStatus: TxScan<TxFill>["status"]; historyPages: number }): TxEpochReport[] {
  return ids.map(id => {
    const epoch = TXFLOW_EPOCHS[id], range = txflowEpochRange(id, now);
    const selected = fills.filter(fill => txflowInWindows(fill.time, [range]));
    const funding = fundings.filter(row => txflowInWindows(row.time, [range]));
    let holding: TxHoldingAnalysis;
    try { holding = analyzeTxHolding(fills, { ...range, selectedComplete: scan.fillsStatus === "complete", historyStatus: scan.historyStatus, historyPages: scan.historyPages }); }
    catch { holding = analyzeTxHolding(selected, { ...range, selectedComplete: false, historyStatus: scan.historyStatus, historyPages: scan.historyPages }); }
    return { id, label: epoch.label, dates: epoch.dates, completed: now >= Date.parse(epoch.end),
      range: { from: range.from === null ? null : new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), endExclusive: range.endExclusive },
      summary: scan.fillsStatus === "unavailable" ? null : summarizeTxFills(selected),
      funding: scan.fundingStatus === "unavailable" ? null : summarizeTxFunding(funding), holding, markets: groupTxFills(selected).markets };
  });
}
