import { createHash } from "node:crypto";
import { buildEntropyReport, entropyRange, type EntropyFill, type EntropyPeriod, type EntropyReport } from "./entropy-wallet";
import { txAtoms, txUsd } from "./txflow-wallet";

export const ENTROPY_BUILDER = "0xcd254d2a328f7f67c7c6fef930a4757516f7b601";
export const ENTROPY_ARCHIVE_START = "2026-08-19";
const dayMs = 86_400_000;
export type BuilderExecution = {
  key: string; time: number; market: string; side: "BUY" | "SELL"; price: string; size: string;
  notional: string; closedPnl: string; builderFee: string; role: "Maker" | "Taker";
  execution?: EntropyFill;
};
export type BuilderDay = {
  version: 1; day: string; checkedAt: string; status: "available" | "missing" | "error";
  archiveFirst: string | null; archiveLast: string | null; archiveRows: number; etag: string | null;
  fills: BuilderExecution[]; error?: string;
};
export type BuilderProgress = { total: number; checked: number; remaining: number; available: number; unavailable: number; cached: boolean };
export type EntropyBuilderReport = Omit<EntropyReport, "version" | "dex" | "scope"> & {
  version: 2; dex: "builder";
  attribution: {
    builder: string; source: "builder-archives"; incomplete: true; storage: "database";
    feesMatched: number; feesTotal: number; feesComplete: boolean; verifiedNetFees: string;
    days: Omit<BuilderDay, "fills" | "version" | "etag" | "error">[];
  };
  synchronization: BuilderProgress;
};

export function entropyArchiveDays(period: EntropyPeriod, now: number): string[] {
  const range = entropyRange(period, now), first = Math.max(Date.parse(ENTROPY_ARCHIVE_START), range.from ?? 0);
  const dates: string[] = [];
  for (let time = Math.floor(first / dayMs) * dayMs; time <= now; time += dayMs) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
export function builderDayFresh(day: BuilderDay | undefined, now: number): boolean {
  if (!day || day.version !== 1) return false;
  const age = now - Date.parse(day.checkedAt);
  const recent = now - Date.parse(day.day) < 3 * dayMs;
  const ttl = day.status === "available" ? (recent ? 15 * 60_000 : 7 * dayMs) : 5 * 60_000;
  return Number.isFinite(age) && age >= 0 && age < ttl;
}
export function builderProgress(dates: string[], days: BuilderDay[], now: number, cached: boolean): BuilderProgress {
  const saved = new Map(days.map(day => [day.day, day]));
  const checked = dates.filter(date => builderDayFresh(saved.get(date), now)).length;
  return { total: dates.length, checked, remaining: dates.length - checked,
    available: dates.filter(date => saved.get(date)?.status === "available").length,
    unavailable: dates.filter(date => saved.has(date) && saved.get(date)?.status !== "available").length, cached };
}

function decimal(value: string) {
  if (!/^-?\d+(\.\d{1,18})?$/.test(value) || value.length > 100) throw new Error("Invalid amount in the builder archive.");
  return txUsd(txAtoms(value));
}
function fields(line: string): string[] {
  // Archive columns contain unquoted scalar values; fail closed if the provider changes the format.
  if (line.includes('"')) throw new Error("Unsupported quoted builder archive format.");
  return line.replace(/\r$/, "").split(",");
}
export function parseBuilderArchive(text: string, day: string, address: string): Omit<BuilderDay, "checkedAt" | "etag"> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^0x[0-9a-f]{40}$/.test(address)) throw new Error("Invalid archive selection.");
  const lines = text.trimEnd().split("\n"), header = fields(lines.shift() ?? "");
  const required = ["time", "user", "coin", "side", "px", "sz", "crossed", "counterparty", "closed_pnl", "builder_fee"];
  if (new Set(header).size !== header.length || required.some(key => !header.includes(key))) throw new Error("Builder archive columns changed.");
  const index = Object.fromEntries(header.map((key, i) => [key, i]));
  const fills: BuilderExecution[] = [], occurrences = new Map<string, number>();
  let first = Infinity, last = -Infinity, rows = 0;
  for (const line of lines) {
    const values = fields(line);
    if (values.length !== header.length) throw new Error("A builder archive row is truncated.");
    const value = (key: string) => values[index[key]];
    const stamp = value("time"), time = Date.parse(stamp);
    if (!stamp.startsWith(`${day}T`) || !Number.isSafeInteger(time) || new Date(time).toISOString().slice(0, 10) !== day || !/^0x[0-9a-fA-F]{40}$/.test(value("user"))) throw new Error("Invalid timestamp or wallet in builder archive.");
    first = Math.min(first, time); last = Math.max(last, time); rows++;
    // A wallet appearing as counterparty is not evidence that it used this builder.
    if (value("user").toLowerCase() !== address) continue;
    const market = value("coin");
    // Native and other HIP-3 perpetuals qualify; spot trades have a separate accounting model.
    if (!/^(?:[A-Za-z0-9_.-]+:)?[A-Za-z0-9_.-]{1,80}$/.test(market)) continue;
    if (!["Ask", "Bid"].includes(value("side")) || !["true", "false"].includes(value("crossed"))) throw new Error("Invalid side or liquidity role in builder archive.");
    const price = decimal(value("px")), size = decimal(value("sz")), builderFee = decimal(value("builder_fee")), closedPnl = decimal(value("closed_pnl"));
    if (txAtoms(price) <= BigInt(0) || txAtoms(size) <= BigInt(0) || txAtoms(builderFee) < BigInt(0)) throw new Error("Invalid execution size or fee in builder archive.");
    const role = value("crossed") === "true" ? "Taker" as const : "Maker" as const;
    const side = value("side") === "Ask" ? "SELL" as const : "BUY" as const;
    const identity = JSON.stringify([stamp, market, side, price, size, role, value("counterparty").toLowerCase(), closedPnl, builderFee]);
    const hash = createHash("sha256").update(identity).digest("hex");
    const occurrence = occurrences.get(hash) ?? 0; occurrences.set(hash, occurrence + 1);
    const scale = BigInt("1000000000000000000");
    fills.push({ key: `${day}:${hash}:${occurrence}`, time, market, side, price, size, builderFee, closedPnl, role,
      notional: txUsd((txAtoms(price) * txAtoms(size) + scale / BigInt(2)) / scale) });
  }
  return { version: 1, day, status: "available", archiveRows: rows, archiveFirst: Number.isFinite(first) ? new Date(first).toISOString() : null,
    archiveLast: Number.isFinite(last) ? new Date(last).toISOString() : null, fills };
}

function signature(fill: BuilderExecution | EntropyFill) {
  return JSON.stringify([Math.floor(fill.time / 1000), fill.market, fill.side,
    fill.price ?? txUsd(txAtoms(fill.notional) * BigInt("1000000000000000000") / txAtoms(fill.size)),
    txUsd(txAtoms(fill.size)), fill.closedPnl, fill.role, fill.builderFee]);
}
export function reconcileBuilderExecutions(fills: BuilderExecution[], history: EntropyFill[]): BuilderExecution[] {
  const archived = new Map<string, BuilderExecution[]>(), candidates = new Map<string, EntropyFill[]>();
  for (const fill of fills) { const key = signature(fill); if (!archived.has(key)) archived.set(key, []); archived.get(key)!.push(fill); }
  for (const fill of history) { const key = signature(fill); if (!candidates.has(key)) candidates.set(key, []); candidates.get(key)!.push(fill); }
  const verified = new Map<string, EntropyFill>();
  for (const [key, group] of archived) {
    const matches = candidates.get(key) ?? [];
    // More candidates than archive rows can include another frontend's indistinguishable execution.
    if (group.length !== matches.length) continue;
    matches.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key));
    group.forEach((fill, i) => verified.set(fill.key, matches[i]));
  }
  return fills.map(fill => verified.has(fill.key) ? { ...fill, execution: verified.get(fill.key)! } : fill);
}
export function mergeBuilderDay(previous: BuilderDay | undefined, incoming: BuilderDay): BuilderDay {
  if (!previous) return incoming;
  if (previous.day !== incoming.day) throw new Error("Cannot merge different builder archive days.");
  if (incoming.status !== "available") return { ...incoming, fills: previous.fills, archiveFirst: previous.archiveFirst,
    archiveLast: previous.archiveLast, archiveRows: previous.archiveRows, etag: previous.etag };
  const saved = new Map(previous.fills.map(fill => [fill.key, fill]));
  return { ...incoming, fills: incoming.fills.map(fill => fill.execution || !saved.get(fill.key)?.execution ? fill : { ...fill, execution: saved.get(fill.key)!.execution }) };
}
export function builderAsFill(fill: BuilderExecution): EntropyFill {
  return { key: fill.key, market: fill.market, instrument: fill.market, side: fill.side, size: fill.size,
    startPosition: null, sequence: "0", marginMode: "builder", time: fill.execution?.time ?? fill.time, notional: fill.notional,
    fee: fill.execution?.fee ?? "0", feeToken: fill.execution?.feeToken ?? "Unverified", closedPnl: fill.closedPnl,
    role: fill.role, builderFee: fill.builderFee };
}
export function buildBuilderReport(address: string, period: EntropyPeriod, now: number, days: BuilderDay[], synchronization: BuilderProgress): EntropyBuilderReport {
  const range = entropyRange(period, now);
  const fills = days.flatMap(day => day.fills).filter(fill => (range.from === null || (fill.execution?.time ?? fill.time) >= range.from) && (fill.execution?.time ?? fill.time) <= now);
  fills.sort((a, b) => a.time - b.time || a.key.localeCompare(b.key));
  const rows = fills.map(builderAsFill), feesMatched = fills.filter(fill => fill.execution?.feeToken === "USDC").length;
  const available = days.some(day => day.archiveFirst !== null || day.status === "available");
  const base = buildEntropyReport(address, period, now, { rows, pages: days.length, status: available ? "partial" : "unavailable", warnings: [],
    rawCount: days.reduce((sum, day) => sum + day.archiveRows, 0), ignored: 0, firstTime: null, retentionLimited: false },
    { rows: [], pages: 0, status: "unavailable", warnings: [], rawCount: 0, ignored: 0, firstTime: null, retentionLimited: false }, null);
  const feesComplete = available && feesMatched === fills.length;
  if (base.summary && !feesComplete) base.summary.excludedFeeTokens = [...new Set([...base.summary.excludedFeeTokens, "Unverified execution fees"])];
  return { ...base, version: 2, dex: "builder", synchronization,
    warnings: ["Only executions carrying Entropy's builder code are included. Public archives may cover part of a day; this is not a complete trading history.",
      ...(!feesComplete && fills.length ? ["Execution fees could not be verified for every archived execution. Missing fees are not assumed to be zero."] : []),
      ...(days.some(day => day.status === "error") ? ["Some archive requests failed. Previously saved executions were retained; retry after a few minutes."] : [])],
    attribution: { builder: ENTROPY_BUILDER, source: "builder-archives", incomplete: true, storage: "database", feesMatched,
      feesTotal: fills.length, feesComplete, verifiedNetFees: base.summary?.netFees ?? "0",
      days: days.map(({ fills: _, version: _version, etag: _etag, error: _error, ...day }) => day) } };
}
