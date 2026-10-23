import type { PointWeek } from "./leaderboard";
import { parse } from "lossless-json";

export type WalletFill = {
  tradeId: string; subaccount: number; market: string; side: "BUY" | "SELL"; role: "MAKER" | "TAKER";
  size: string; price: string; feeUsd: string; notionalUsd: string; createdAtMicros: number; createdAt: string;
  sequenceNumber?: string; positionEffect?: string; marketId?: string;
};
export type FillSummary = {
  fillCount: number; volumeUsd: string; feesPaidUsd: string; rebatesUsd: string; netFeesUsd: string;
  makerVolumeUsd: string; takerVolumeUsd: string;
};
export type WalletStats = {
  lifetime: { volumeUsd: string; feesPaidUsd: string };
  windows: Record<string, { volumeUsd: string; feesPaidUsd: string }>;
  feeTier: number | null; makerFeeBps: number | null; takerFeeBps: number | null;
};
export type WalletReport = {
  address: string; accountScope: "all" | number; fetchedAt: string;
  range: { from: string | null; to: string };
  scan: { complete: boolean; pages: number; subaccounts: number[]; warnings: string[]; verifiedEmptyWeeks?: number[]; recoveredFillCount?: number };
  stats: WalletStats | null; summary: FillSummary | null; fills: WalletFill[];
  weekly: WeeklyAnalysis;
};

// JSON int64 quote quantums must survive parsing without Number rounding.
export function parseArcusJson(text: string): unknown { return parse(text, null, { parseNumber: value => value }); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected Arcus response.");
  return value as Record<string, unknown>;
}
const ten = BigInt(10);
const zero = BigInt(0);
const scale = ten ** BigInt(9);
function decimal(value: unknown): { coefficient: bigint; digits: number } {
  if (typeof value !== "string" || value.length > 100 || !/^-?\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount in Arcus response.");
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), digits: fraction.length };
}
function quantize(coefficient: bigint, digits: number): bigint {
  if (digits <= 9) return coefficient * ten ** BigInt(9 - digits);
  const divisor = ten ** BigInt(digits - 9);
  const absolute = coefficient < zero ? -coefficient : coefficient;
  const rounded = (absolute + divisor / BigInt(2)) / divisor;
  return coefficient < zero ? -rounded : rounded;
}
export function decimalAtoms(value: unknown): bigint { const parsed = decimal(value); return quantize(parsed.coefficient, parsed.digits); }
export function atomsUsd(atoms: bigint): string {
  const sign = atoms < zero ? "-" : "";
  const absolute = atoms < zero ? -atoms : atoms;
  const fraction = (absolute % scale).toString().padStart(9, "0").replace(/0+$/, "");
  return `${sign}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}
function notional(size: string, price: string): string {
  const quantity = decimal(size); const rate = decimal(price);
  if (quantity.coefficient <= zero || rate.coefficient <= zero) throw new Error("Fill size and price must be positive.");
  return atomsUsd(quantize(quantity.coefficient * rate.coefficient, quantity.digits + rate.digits));
}
export function normalizeFill(value: unknown, address: string, subaccount: number): WalletFill {
  const fill = record(value);
  if (fill.address !== undefined && String(fill.address).toLowerCase() !== address) throw new Error("Arcus returned fills for a different address.");
  if (fill.accountIndex !== undefined && Number(fill.accountIndex) !== subaccount) throw new Error("Arcus returned fills for a different subaccount.");
  const timestamp = Number(fill.createdAt);
  if (!Number.isSafeInteger(timestamp) || timestamp < 1e14) throw new Error("Invalid fill timestamp.");
  if (typeof fill.tradeId !== "string" || !fill.tradeId || (fill.side !== "BUY" && fill.side !== "SELL") || (fill.role !== "MAKER" && fill.role !== "TAKER")) throw new Error("Invalid fill metadata.");
  const size = String(fill.size); const price = String(fill.price);
  return { tradeId: fill.tradeId, subaccount, market: String(fill.marketDisplayName ?? fill.marketId), side: fill.side, role: fill.role,
    size, price, feeUsd: atomsUsd(decimalAtoms(String(fill.fee))), notionalUsd: notional(size, price), createdAtMicros: timestamp, createdAt: new Date(Math.floor(timestamp / 1000)).toISOString(),
    ...(fill.sequenceNumber != null && /^\d+$/.test(String(fill.sequenceNumber)) ? { sequenceNumber: String(fill.sequenceNumber) } : {}),
    ...(fill.marketId != null ? { marketId: String(fill.marketId) } : {}),
    ...(typeof fill.positionEffect === "string" ? { positionEffect: fill.positionEffect } : {}) };
}
export function summarizeFills(fills: WalletFill[]): FillSummary {
  let volume = zero, paid = zero, rebates = zero, maker = zero, taker = zero;
  for (const fill of fills) {
    const amount = decimalAtoms(fill.notionalUsd); const fee = decimalAtoms(fill.feeUsd);
    volume += amount;
    if (fee >= zero) paid += fee; else rebates -= fee;
    if (fill.role === "MAKER") maker += amount; else taker += amount;
  }
  return { fillCount: fills.length, volumeUsd: atomsUsd(volume), feesPaidUsd: atomsUsd(paid), rebatesUsd: atomsUsd(rebates), netFeesUsd: atomsUsd(paid - rebates), makerVolumeUsd: atomsUsd(maker), takerVolumeUsd: atomsUsd(taker) };
}
// An unsuccessful empty scan is unknown, rather than evidence of zero activity.
export function summarizeScan(fills: WalletFill[], complete: boolean): FillSummary | null {
  return !complete && fills.length === 0 ? null : summarizeFills(fills);
}
export function normalizeStats(value: unknown, address: string): WalletStats {
  const stats = record(value);
  if (String(stats.address).toLowerCase() !== address) throw new Error("Arcus returned statistics for a different address.");
  const amount = (value: unknown) => {
    if (typeof value !== "string" || !/^-?\d+$/.test(value)) throw new Error("Missing or invalid quote quantums in account stats.");
    return atomsUsd(BigInt(value));
  };
  const windows: WalletStats["windows"] = {};
  if (stats.windowedStats) for (const [window, raw] of Object.entries(record(stats.windowedStats))) {
    const pair = record(raw); windows[window] = { volumeUsd: amount(pair.volume), feesPaidUsd: amount(pair.feesPaid) };
  }
  const tier = stats.tradingFeeTier ? record(stats.tradingFeeTier) : null;
  const rate = (value: unknown) => value != null && Number.isFinite(Number(value)) ? Number(value) / 100 : null;
  return { lifetime: { volumeUsd: amount(stats.lifetimeVolume), feesPaidUsd: amount(stats.lifetimeFeesPaid) }, windows,
    feeTier: tier && Number.isInteger(Number(tier.level)) ? Number(tier.level) : null, makerFeeBps: rate(tier?.makerFeePpm), takerFeeBps: rate(tier?.takerFeePpm) };
}

type FillPage = (to: number) => Promise<unknown>;
export async function collectFills(fetchPage: FillPage, options: { address: string; subaccount: number; from: number | null; to: number; limit: number; maxPages: number }) {
  const fills: WalletFill[] = []; const seen = new Set<string>();
  let to = options.to, pages = 0;
  for (; pages < options.maxPages;) {
    try {
      pages++;
      const page = record(await fetchPage(to));
      if (!Array.isArray(page.fills) || page.fills.length > options.limit) throw new Error("Unexpected fills page.");
      // Validate the entire page before admitting any of its rows.
      const validated = page.fills.map(raw => {
        const fill = normalizeFill(raw, options.address, options.subaccount);
        if (fill.createdAtMicros > to || (options.from !== null && fill.createdAtMicros < options.from)) throw new Error("Arcus returned fills outside the requested period.");
        return fill;
      });
      let added = 0, oldest = to;
      for (const fill of validated) {
        oldest = Math.min(oldest, fill.createdAtMicros);
        if (!seen.has(fill.tradeId)) { seen.add(fill.tradeId); fills.push(fill); added++; }
      }
      if (page.fills.length < options.limit) return { fills, pages, complete: true, reason: null };
      // Bounds are inclusive: keep the boundary microsecond and deduplicate IDs.
      if (added === 0 || oldest === to) return { fills, pages, complete: false, reason: "The fills API could not advance past a timestamp boundary." };
      to = oldest;
    } catch (error) {
      return { fills, pages, complete: false, failed: true, reason: error instanceof Error ? error.message : "Could not read fills." };
    }
  }
  return { fills, pages, complete: false, reason: "Scan limit reached. Choose a shorter period or a single subaccount." };
}

export const HOLDING_BUCKETS = [
  { id: "under1h", label: "Closed <1h" }, { id: "oneTo2h", label: "Closed 1–2h" },
  { id: "twoTo12h", label: "Closed 2–12h" }, { id: "over12h", label: "Closed 12h+" },
  { id: "openUnder12h", label: "Open <12h" }, { id: "openOver12h", label: "Open 12h+" },
  { id: "unknown", label: "Unknown history" },
] as const;
export type HoldingBucket = typeof HOLDING_BUCKETS[number]["id"];
export type PointsWeek = {
  index: number; label: string; start: string; end: string; cutoff: string;
  status: "completed" | "in_progress"; partialPeriod: boolean;
  volumeUsd: string; feesPaidUsd: string; rebatesUsd: string; netFeesUsd: string; fillCount: number;
  buckets: { id: HoldingBucket; label: string; volumeUsd: string; sharePercent: number }[];
  heldAtLeast12hUsd: string; averageClosedHoldHours: number | null;
};
export type WeeklyAnalysis = {
  status: "complete" | "incomplete" | "disabled";
  method: "FIFO"; asOf: string; timezone: "America/New_York"; weeks: PointsWeek[];
};
const hourMs = 3_600_000;
const weekMs = 7 * 24 * hourMs;
const hourMicros = hourMs * 1000;
export const SEASON_ONE_START = Date.parse("2026-10-01T00:00:00Z");
const firstDistribution = Date.parse("2026-10-07T19:00:00Z");
const newYorkHour = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });

// Distribution-aligned analysis windows, not an assertion of the earning cutoff.
export function pointsDistributionAt(index: number): number {
  if (!Number.isInteger(index) || index < 1) throw new Error("Invalid points week.");
  const candidate = firstDistribution + (index - 1) * weekMs;
  return candidate + (15 - Number(newYorkHour.format(new Date(candidate)))) * hourMs;
}
export function pointsWeekIndex(timestamp: number): number {
  if (timestamp < SEASON_ONE_START) return 0;
  let index = Math.max(1, Math.floor((timestamp - firstDistribution) / weekMs) + 2);
  while (index > 1 && timestamp < pointsDistributionAt(index - 1)) index--;
  while (timestamp >= pointsDistributionAt(index)) index++;
  return index;
}

// A short all-history response is not enough evidence of an empty distribution
// window. Recheck those gaps with explicit UTC bounds before reporting zero.
export async function verifyEmptyPointsWeeks(
  initialFills: WalletFill[],
  fetchPage: (query: { subaccount: number; from: number; to: number }) => Promise<unknown>,
  options: { address: string; subaccounts: number[]; from: number | null; to: number; limit: number; maxPages: number; shouldStop?: () => boolean },
) {
  const result = { fills: [...initialFills], pages: 0, complete: true, warnings: [] as string[], verifiedWeeks: [] as number[] };
  const start = Math.max(SEASON_ONE_START, options.from ?? SEASON_ONE_START);
  if (start > options.to) return result;
  const first = pointsWeekIndex(start), last = pointsWeekIndex(options.to);
  if (last - first > 520) throw new Error("Weekly analysis supports up to ten years per scan.");
  const occupied = new Set(initialFills.filter(fill => fill.createdAtMicros >= start * 1000 && fill.createdAtMicros <= options.to * 1000)
    .map(fill => pointsWeekIndex(Math.floor(fill.createdAtMicros / 1000))));
  const active = options.subaccounts.filter(subaccount => initialFills.some(fill => fill.subaccount === subaccount));
  // Accounts with no executions anywhere were already checked by the main scan.
  if (!active.length) return result;
  const seen = new Set(initialFills.map(fill => `${fill.subaccount}:${fill.tradeId}`));
  for (let index = first; index <= last; index++) {
    if (occupied.has(index)) continue;
    const weekStart = index === 1 ? SEASON_ONE_START : pointsDistributionAt(index - 1);
    const from = Math.max(start, weekStart) * 1000;
    // Arcus bounds are inclusive; the next Wednesday belongs to the next week.
    const to = Math.min(options.to * 1000, pointsDistributionAt(index) * 1000 - 1);
    for (const subaccount of active) {
      if (result.pages >= options.maxPages || options.shouldStop?.()) {
        result.complete = false;
        result.warnings.push(`Week ${index} could not be verified before the scan limit. Select a shorter period or a single subaccount and retry.`);
        return result;
      }
      const scan = await collectFills(cursor => fetchPage({ subaccount, from, to: cursor }),
        { address: options.address, subaccount, from, to, limit: options.limit, maxPages: options.maxPages - result.pages });
      result.pages += scan.pages;
      for (const fill of scan.fills) {
        const key = `${fill.subaccount}:${fill.tradeId}`;
        if (!seen.has(key)) { seen.add(key); result.fills.push(fill); }
      }
      if (!scan.complete) {
        result.complete = false;
        result.warnings.push(`Week ${index}, subaccount ${subaccount}: ${scan.reason}`);
        return result;
      }
    }
    result.verifiedWeeks.push(index);
  }
  return result;
}

type WeekAccumulator = {
  index: number; start: number; end: number; cutoff: number;
  buckets: Record<HoldingBucket, bigint>; volume: bigint; paid: bigint; rebates: bigint;
  fillCount: number; closedVolume: bigint; weightedHold: bigint;
};
type HoldingFill = { fill: WalletFill; remainingQty: bigint; remainingVolume: bigint; week: WeekAccumulator | null };
type HoldingLot = { entry: HoldingFill; side: WalletFill["side"] };

export function analyzePointsWeeks(fills: WalletFill[], options: { from: number | null; to: number; complete: boolean; enabled?: boolean }): WeeklyAnalysis {
  const result: WeeklyAnalysis = { status: options.enabled === false ? "disabled" : options.complete ? "complete" : "incomplete", method: "FIFO", asOf: new Date(options.to).toISOString(), timezone: "America/New_York", weeks: [] };
  if (result.status !== "complete") return result;
  const weeks = new Map<number, WeekAccumulator>();
  const selected = (fill: WalletFill) => (options.from === null || fill.createdAtMicros >= options.from * 1000) && fill.createdAtMicros <= options.to * 1000;
  const earliest = fills.filter(selected).reduce((min, fill) => Math.min(min, Math.floor(fill.createdAtMicros / 1000)), options.to);
  function getWeek(index: number): WeekAccumulator {
    const existing = weeks.get(index); if (existing) return existing;
    const start = index === 0 ? options.from ?? earliest : index === 1 ? SEASON_ONE_START : pointsDistributionAt(index - 1);
    const end = index === 0 ? SEASON_ONE_START : pointsDistributionAt(index);
    const week: WeekAccumulator = { index, start, end, cutoff: Math.min(end, options.to),
      buckets: Object.fromEntries(HOLDING_BUCKETS.map(bucket => [bucket.id, zero])) as Record<HoldingBucket, bigint>,
      volume: zero, paid: zero, rebates: zero, fillCount: 0, closedVolume: zero, weightedHold: zero };
    weeks.set(index, week); return week;
  }
  const firstIndex = pointsWeekIndex(options.from ?? Math.min(SEASON_ONE_START, earliest));
  const lastIndex = pointsWeekIndex(options.to);
  // Bound calendar output independently of the number of fills.
  if (lastIndex - firstIndex > 520) throw new Error("Weekly analysis supports up to ten years per scan.");
  for (let index = firstIndex; index <= lastIndex; index++) getWeek(index);

  const precision = new Map<string, number>();
  const keyFor = (fill: WalletFill) => `${fill.subaccount}:${fill.marketId ?? fill.market}`;
  const history = fills.filter(fill => fill.createdAtMicros <= options.to * 1000);
  for (const fill of history) precision.set(keyFor(fill), Math.max(precision.get(keyFor(fill)) ?? 0, decimal(fill.size).digits));
  history.sort((a, b) => {
    const time = a.createdAtMicros - b.createdAtMicros; if (time) return time;
    const left = a.sequenceNumber && b.sequenceNumber ? a.sequenceNumber : a.tradeId;
    const right = a.sequenceNumber && b.sequenceNumber ? b.sequenceNumber : b.tradeId;
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;
    return left.localeCompare(right);
  });
  const books = new Map<string, { lots: HoldingLot[]; head: number; uncertain: boolean; initialized: boolean }>();
  function take(fill: HoldingFill, quantity: bigint): bigint {
    const value = quantity === fill.remainingQty ? fill.remainingVolume : fill.remainingVolume * quantity / fill.remainingQty;
    fill.remainingQty -= quantity; fill.remainingVolume -= value; return value;
  }
  function assign(fill: HoldingFill, volume: bigint, bucket: HoldingBucket, duration?: number) {
    if (!fill.week) return;
    fill.week.buckets[bucket] += volume;
    if (duration !== undefined) { fill.week.closedVolume += volume; fill.week.weightedHold += volume * BigInt(duration); }
  }
  function closedBucket(duration: number): HoldingBucket {
    return duration < hourMicros ? "under1h" : duration < 2 * hourMicros ? "oneTo2h" : duration < 12 * hourMicros ? "twoTo12h" : "over12h";
  }
  function openBucket(fill: HoldingFill): HoldingBucket {
    const cutoff = fill.week?.cutoff ?? options.to;
    return cutoff * 1000 - fill.fill.createdAtMicros >= 12 * hourMicros ? "openOver12h" : "openUnder12h";
  }
  for (const fill of history) {
    const key = keyFor(fill); const parsed = decimal(fill.size);
    const week = selected(fill) ? getWeek(pointsWeekIndex(Math.floor(fill.createdAtMicros / 1000))) : null;
    const current: HoldingFill = { fill, remainingQty: parsed.coefficient * ten ** BigInt((precision.get(key) ?? 0) - parsed.digits), remainingVolume: decimalAtoms(fill.notionalUsd), week };
    if (week) {
      week.volume += current.remainingVolume; week.fillCount++;
      const fee = decimalAtoms(fill.feeUsd); if (fee >= zero) week.paid += fee; else week.rebates -= fee;
    }
    let book = books.get(key);
    if (!book) { book = { lots: [], head: 0, uncertain: false, initialized: false }; books.set(key, book); }
    // First observed ADD/CLOSE/FLIP is evidence that earlier position history is missing.
    if (!book.initialized) { book.uncertain = /^(ADD|CLOSE|FLIP)_/.test(fill.positionEffect ?? ""); book.initialized = true; }
    else if (book.uncertain && /^OPEN_/.test(fill.positionEffect ?? "")) book.uncertain = false;
    if (book.uncertain) { assign(current, current.remainingVolume, "unknown"); continue; }
    while (current.remainingQty > zero && book.head < book.lots.length && book.lots[book.head].side !== fill.side) {
      const lot = book.lots[book.head];
      const quantity = current.remainingQty < lot.entry.remainingQty ? current.remainingQty : lot.entry.remainingQty;
      const duration = fill.createdAtMicros - lot.entry.fill.createdAtMicros;
      const bucket = closedBucket(duration);
      const entryVolume = take(lot.entry, quantity); const exitVolume = take(current, quantity);
      // A later-week close must not rewrite the opening week's state at its cutoff.
      if (lot.entry.week && fill.createdAtMicros >= lot.entry.week.cutoff * 1000) assign(lot.entry, entryVolume, openBucket(lot.entry));
      else assign(lot.entry, entryVolume, bucket, duration);
      assign(current, exitVolume, bucket, duration);
      if (lot.entry.remainingQty === zero) book.head++;
    }
    if (current.remainingQty > zero) book.lots.push({ entry: current, side: fill.side });
  }
  for (const book of books.values()) for (let index = book.head; index < book.lots.length; index++) {
    const entry = book.lots[index].entry; assign(entry, entry.remainingVolume, openBucket(entry));
  }
  result.weeks = [...weeks.values()].sort((a, b) => a.index - b.index).map(week => {
    const bucketSum = Object.values(week.buckets).reduce((sum, value) => sum + value, zero);
    if (bucketSum !== week.volume) throw new Error("Weekly volume allocation did not reconcile.");
    return { index: week.index, label: week.index === 0 ? "Before Season 1" : `Week ${week.index}`, start: new Date(week.start).toISOString(), end: new Date(week.end).toISOString(), cutoff: new Date(week.cutoff).toISOString(),
      status: week.end <= options.to ? "completed" : "in_progress", partialPeriod: (options.from !== null && options.from > week.start) || options.to < week.end,
      volumeUsd: atomsUsd(week.volume), feesPaidUsd: atomsUsd(week.paid), rebatesUsd: atomsUsd(week.rebates), netFeesUsd: atomsUsd(week.paid - week.rebates), fillCount: week.fillCount,
      buckets: HOLDING_BUCKETS.map(bucket => ({ ...bucket, volumeUsd: atomsUsd(week.buckets[bucket.id]), sharePercent: week.volume > zero ? Number(week.buckets[bucket.id]) / Number(week.volume) * 100 : 0 })),
      heldAtLeast12hUsd: atomsUsd(week.buckets.over12h + week.buckets.openOver12h), averageClosedHoldHours: week.closedVolume > zero ? Number(week.weightedHold) / Number(week.closedVolume) / hourMicros : null };
  });
  return result;
}


export function weeklyEfficiency(week: PointsWeek, points: PointWeek | undefined, allSubaccounts: boolean) {
  const earned = points?.earned_points ?? null;
  const comparable = allSubaccounts && !week.partialPeriod && week.status === "completed"
    && points?.status === "recorded" && points.week === week.index
    && Date.parse(points.distributed_at) === Date.parse(week.end) && earned !== null && earned > 0;
  return {
    comparable,
    volumePerPoint: comparable ? Number(week.volumeUsd) / earned! : null,
    feesPerPoint: comparable ? Number(week.netFeesUsd) / earned! : null,
    pointsPer10k: comparable && Number(week.volumeUsd) > 0 ? earned! / Number(week.volumeUsd) * 10_000 : null,
  };
}

export function percentChange(current: number, previous: number): number | null {
  return previous > 0 && Number.isFinite(current) && Number.isFinite(previous) ? (current - previous) / previous * 100 : null;
}

export function fillsForWeek(fills: WalletFill[], week: PointsWeek) {
  const from = Date.parse(week.start) * 1000;
  const end = Date.parse(week.end) * 1000;
  const cutoff = Date.parse(week.cutoff) * 1000;
  return fills.filter(fill => fill.createdAtMicros >= from && fill.createdAtMicros < end && fill.createdAtMicros <= cutoff);
}

export function marketBreakdown(fills: WalletFill[]) {
  const markets = new Map<string, { market: string; volume: bigint; fees: bigint; maker: bigint; fills: number }>();
  for (const fill of fills) {
    const key = fill.marketId ?? fill.market;
    const item = markets.get(key) ?? { market: fill.market, volume: BigInt(0), fees: BigInt(0), maker: BigInt(0), fills: 0 };
    const volume = decimalAtoms(fill.notionalUsd);
    item.volume += volume; item.fees += decimalAtoms(fill.feeUsd); item.fills++;
    if (fill.role === "MAKER") item.maker += volume;
    markets.set(key, item);
  }
  const total = [...markets.values()].reduce((sum, item) => sum + item.volume, BigInt(0));
  return [...markets.entries()].sort((a, b) => a[1].volume > b[1].volume ? -1 : a[1].volume < b[1].volume ? 1 : 0).map(([id, item]) => ({
    id, market: item.market, volumeUsd: atomsUsd(item.volume), netFeesUsd: atomsUsd(item.fees), fillCount: item.fills,
    sharePercent: total > BigInt(0) ? Number(item.volume) / Number(total) * 100 : 0,
    makerPercent: item.volume > BigInt(0) ? Number(item.maker) / Number(item.volume) * 100 : 0,
  }));
}
