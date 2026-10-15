import { parse } from "lossless-json";

export type WalletFill = {
  tradeId: string; subaccount: number; market: string; side: "BUY" | "SELL"; role: "MAKER" | "TAKER";
  size: string; price: string; feeUsd: string; notionalUsd: string; createdAtMicros: number; createdAt: string;
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
  scan: { complete: boolean; pages: number; subaccounts: number[]; warnings: string[] };
  stats: WalletStats | null; summary: FillSummary; fills: WalletFill[];
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
    size, price, feeUsd: atomsUsd(decimalAtoms(String(fill.fee))), notionalUsd: notional(size, price), createdAtMicros: timestamp, createdAt: new Date(Math.floor(timestamp / 1000)).toISOString() };
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
    const page = record(await fetchPage(to)); pages++;
    if (!Array.isArray(page.fills) || page.fills.length > options.limit) throw new Error("Unexpected fills page.");
    let added = 0, oldest = to;
    for (const raw of page.fills) {
      const fill = normalizeFill(raw, options.address, options.subaccount);
      if (fill.createdAtMicros > to || (options.from !== null && fill.createdAtMicros < options.from)) throw new Error("Arcus returned fills outside the requested period.");
      oldest = Math.min(oldest, fill.createdAtMicros);
      if (!seen.has(fill.tradeId)) { seen.add(fill.tradeId); fills.push(fill); added++; }
    }
    if (page.fills.length < options.limit) return { fills, pages, complete: true, reason: null };
    // Bounds are inclusive: keep the boundary microsecond and deduplicate IDs.
    if (added === 0 || oldest === to) return { fills, pages, complete: false, reason: "The fills API could not advance past a timestamp boundary." };
    to = oldest;
  }
  return { fills, pages, complete: false, reason: "Scan limit reached. Choose a shorter period or a single subaccount." };
}
