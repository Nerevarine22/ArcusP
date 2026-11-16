import { decompress, decompressBound } from "lz4js";
import { parse } from "lossless-json";
import { ENTROPY_BUILDER, parseBuilderArchive, type BuilderDay } from "./entropy-builder";
import { collectEntropyHistory, normalizeHyperliquidPerpFill, type EntropyFill } from "./entropy-wallet";

const maxCompressed = 24 * 1024 * 1024, maxUnpacked = 128 * 1024 * 1024;
const cache = new Map<string, { text: string; etag: string | null; expires: number; bytes: number }>();
const cacheBudget = 32 * 1024 * 1024;
let cacheSize = 0;
function remember(day: string, text: string, etag: string | null, now: number) {
  const bytes = Buffer.byteLength(text) * 2;
  if (bytes > cacheBudget) return;
  const old = cache.get(day); if (old) { cacheSize -= old.bytes; cache.delete(day); }
  for (const [key, value] of cache) {
    if (cacheSize + bytes <= cacheBudget && value.expires > now) continue;
    cache.delete(key); cacheSize -= value.bytes;
  }
  cache.set(day, { text, etag, bytes, expires: now + (now - Date.parse(day) < 3 * 86_400_000 ? 15 * 60_000 : 6 * 3600_000) });
  cacheSize += bytes;
}
export async function fetchBuilderDay(day: string, address: string, now: number, signal: AbortSignal): Promise<BuilderDay> {
  const checkedAt = new Date(now).toISOString();
  const failed = (status: "missing" | "error", error?: string): BuilderDay => ({ version: 1, day, checkedAt, status,
    archiveFirst: null, archiveLast: null, archiveRows: 0, etag: null, fills: [], ...(error ? { error } : {}) });
  try {
    let saved = cache.get(day);
    if (saved && saved.expires <= now) { cache.delete(day); cacheSize -= saved.bytes; saved = undefined; }
    if (saved) return { ...parseBuilderArchive(saved.text, day, address), checkedAt, etag: saved.etag };
    const url = `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/${ENTROPY_BUILDER}/${day.replaceAll("-", "")}.csv.lz4`;
    const response = await fetch(url, { cache: "no-store", signal });
    // S3 returns AccessDenied both for absent and inaccessible objects; never call these empty days.
    if (response.status === 403 || response.status === 404) return failed("missing");
    if (!response.ok) return failed("error", `Archive HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > maxCompressed) return failed("error", "Archive exceeds the processing limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const bound = decompressBound(bytes);
    if (bytes.byteLength > maxCompressed || bound > maxUnpacked) return failed("error", "Archive exceeds the processing limit.");
    const text = Buffer.from(decompress(bytes, bound)).toString("utf8"), etag = response.headers.get("etag");
    const parsed = parseBuilderArchive(text, day, address);
    remember(day, text, etag, now);
    return { ...parsed, checkedAt, etag };
  } catch {
    return failed("error", signal.aborted ? "Archive request was interrupted." : "Archive could not be validated.");
  }
}
const feeCache = new Map<string, { rows: EntropyFill[]; expires: number }>();
export async function fetchBuilderFeeHistory(address: string, signal: AbortSignal): Promise<EntropyFill[]> {
  const now = Date.now();
  const saved = feeCache.get(address);
  if (saved && saved.expires > now) return saved.rows;
  const scan = await collectEntropyHistory(async startTime => {
    const response = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userFillsByTime", user: address, startTime, endTime: now, aggregateByTime: false }) });
    if (!response.ok) throw new Error("Execution-fee lookup is unavailable.");
    return parse(await response.text(), null, { parseNumber: value => value });
  }, normalizeHyperliquidPerpFill, { to: now, limit: 2000, maxPages: 8, kind: "fills" });
  if (scan.status === "complete") {
    feeCache.delete(address);
    while (feeCache.size >= 4) feeCache.delete(feeCache.keys().next().value!);
    feeCache.set(address, { rows: scan.rows, expires: now + 5 * 60_000 });
  }
  return scan.rows;
}
