import { NextRequest, NextResponse } from "next/server";
import { analyzePointsWeeks, collectFills, normalizeStats, parseArcusJson, record, summarizeFills, type WalletFill, type WalletReport, type WalletStats } from "@/lib/wallet-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const base = "https://api.arcus.xyz";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = record(await request.json()); } catch { return NextResponse.json({ error: "Send a valid wallet request." }, { status: 400, headers }); }
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "Enter a valid 0x wallet address with 40 hexadecimal characters." }, { status: 400, headers });
  if (body.includeWeekly !== undefined && typeof body.includeWeekly !== "boolean") return NextResponse.json({ error: "Invalid weekly analysis option." }, { status: 400, headers });
  const includeWeekly = body.includeWeekly !== false;
  const scope = body.accountScope ?? "all";
  if (scope !== "all" && (typeof scope !== "number" || !Number.isInteger(scope) || scope < 0 || scope > 9)) return NextResponse.json({ error: "Select all subaccounts or a subaccount from 0 to 9." }, { status: 400, headers });
  const now = Date.now(); const period = body.period ?? "all";
  const windows: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };
  let from: number | null = null, to = now;
  if (period === "custom") {
    from = typeof body.from === "string" ? Date.parse(body.from) : NaN;
    to = typeof body.to === "string" ? Date.parse(body.to) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from * 1000 < 1e14 || from >= to || to > now + 60_000) return NextResponse.json({ error: "Choose a valid UTC period ending no later than now." }, { status: 400, headers });
  } else if (typeof period === "string" && Object.hasOwn(windows, period)) from = now - windows[period] * 86_400_000;
  else if (period !== "all") return NextResponse.json({ error: "Select a supported trade period." }, { status: 400, headers });

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  async function read(path: string, params: Record<string, string>) {
    const url = new URL(path, base); url.searchParams.set("address", address);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, { cache: "no-store", signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(response.status === 429 ? "Arcus rate limit reached. Try again shortly." : `Arcus ${path} returned HTTP ${response.status}.`);
    return parseArcusJson(await response.text());
  }
  const warnings: string[] = [];
  const statsPromise = read("/v1/account/stats", { include: "feeTier,volumes", windows: "24h,7d,30d" })
    .then(value => normalizeStats(value, address)).catch((error: unknown) => { warnings.push(error instanceof Error ? error.message : "Account statistics are unavailable."); return null; });
  const fills: WalletFill[] = []; const completed: number[] = [];
  const subaccounts = scope === "all" ? Array.from({ length: 10 }, (_, i) => i) : [scope];
  let pages = 0, complete = true;
  for (const subaccount of subaccounts) {
    if (pages >= 25 || signal.aborted) { complete = false; warnings.push(includeWeekly ? "History scan stopped before all subaccounts were read. Select one subaccount, or disable weekly analysis and narrow the period." : "Scan stopped before all subaccounts were read. Narrow the period and try again."); break; }
    try {
      const historyFrom = includeWeekly ? null : from;
      const scan = await collectFills(cursor => read("/v1/fills", { accountIndex: String(subaccount), limit: "1000", to: String(cursor), ...(historyFrom === null ? {} : { from: String(historyFrom * 1000) }) }),
        { address, subaccount, from: historyFrom === null ? null : historyFrom * 1000, to: to * 1000, limit: 1000, maxPages: 25 - pages });
      pages += scan.pages; fills.push(...scan.fills);
      if (scan.complete) completed.push(subaccount);
      else { complete = false; warnings.push(`Subaccount ${subaccount}: ${includeWeekly && scan.reason?.startsWith("Scan limit") ? "History limit reached. Select one subaccount, or disable weekly analysis and narrow the period." : scan.reason}`); }
    } catch (error) { complete = false; warnings.push(`Subaccount ${subaccount}: ${error instanceof Error ? error.message : "Could not read fills."}`); break; }
  }
  const stats: WalletStats | null = await statsPromise;
  if (!stats && !fills.length && !complete) return NextResponse.json({ error: warnings[0] ?? "Arcus data is unavailable. Try again." }, { status: 502, headers });
  fills.sort((a, b) => b.createdAtMicros - a.createdAtMicros);
  const selectedFills = fills.filter(fill => from === null || fill.createdAtMicros >= from * 1000);
  const report: WalletReport = { address, accountScope: scope, fetchedAt: new Date().toISOString(), range: { from: from === null ? null : new Date(from).toISOString(), to: new Date(to).toISOString() },
    scan: { complete, pages, subaccounts: completed, warnings }, stats, summary: summarizeFills(selectedFills), fills: selectedFills,
    weekly: analyzePointsWeeks(fills, { from, to, complete, enabled: includeWeekly }) };
  return NextResponse.json(report, { headers });
}
