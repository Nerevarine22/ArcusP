import { NextRequest, NextResponse } from "next/server";
import { parse } from "lossless-json";
import { TXFLOW_PERIODS, analyzeTxHolding, collectTxHistory, groupTxFills, normalizeTxAccount, normalizeTxFill, normalizeTxFunding, normalizeTxOverview, summarizeTxFills, summarizeTxFunding, txRecord, txflowPeriodRange, txflowPointsStatus, type TxflowPeriod, type TxWalletReport, type TxScan, type TxFill, type TxHoldingAnalysis } from "@/lib/txflow-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = txRecord(await request.json()); } catch { return NextResponse.json({ error: "Send a valid wallet request." }, { status: 400, headers }); }
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "Enter a valid 0x wallet address with 40 hexadecimal characters." }, { status: 400, headers });
  const selectedPeriod = body.period ?? "ALLTIME";
  if (typeof selectedPeriod !== "string" || !Object.hasOwn(TXFLOW_PERIODS, selectedPeriod)) return NextResponse.json({ error: "Select a supported trade period." }, { status: 400, headers });
  const period = selectedPeriod as TxflowPeriod, now = Date.now();
  let range: ReturnType<typeof txflowPeriodRange>;
  try { range = txflowPeriodRange(period, now); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid epoch period." }, { status: 400, headers }); }
  const { from } = range;
  // RPC time bounds are inclusive. A Monday-to-Monday epoch excludes its ending Monday.
  const to = range.endExclusive ? range.to - 1 : range.to;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  async function read(payload: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await fetch("https://rpc.txflow.com/info", { method: "POST", cache: "no-store", signal,
        headers: { "Content-Type": "application/json", "x-api-version": "2026-08-16" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(response.status === 429 ? "TxFlow rate limit reached. Try again shortly." : `TxFlow returned HTTP ${response.status}.`);
      // Keep uint64 identifiers exact; financial quantities are already decimal strings.
      return parse(await response.text(), null, { parseNumber: value => value });
    } catch (error) {
      if (signal.aborted) throw new Error("TxFlow request timed out or was cancelled. Choose a shorter period and retry.");
      throw error;
    }
  }
  const options = { from, to, limit: 1000, maxPages: 20 };
  const historyRequest = { user: address, accountType: ["perp"], endTimeMs: to, limit: options.limit, ...(from === null ? {} : { startTimeMs: from }) };
  const fillsPromise = collectTxHistory(offset => read({ ...historyRequest, type: "userFills", offset }), normalizeTxFill, options);
  const priorPromise = fillsPromise.then(scan => {
    const empty: TxScan<TxFill> = { rows: [], pages: 0, status: "complete", warnings: [] };
    if (from === null || scan.status !== "complete" || scan.rows.length === 0) return empty;
    return collectTxHistory(offset => read({ type: "userFills", user: address, accountType: ["perp"], endTimeMs: from - 1, limit: options.limit, offset }), normalizeTxFill,
      { ...options, from: null, to: from - 1, maxPages: Math.max(0, options.maxPages - scan.pages) });
  });
  const [fillScan, fundingScan, overviewResult, accountResult, priorScan] = await Promise.all([
    fillsPromise,
    collectTxHistory(offset => read({ ...historyRequest, type: "userFundings", offset }), normalizeTxFunding, options),
    period === "EPOCH_1" || period === "S0" ? Promise.resolve({ data: null, error: null }) : read({ type: "userOverview", user_address: address, period }).then(value => ({ data: normalizeTxOverview(value, period), error: null })).catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Account overview is unavailable." })),
    read({ type: "clearinghouseState", user: address, accountType: "perp" }).then(value => ({ data: normalizeTxAccount(value), error: null })).catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Open positions are unavailable." })),
    priorPromise,
  ]);
  const warnings = [overviewResult.error && `Overview: ${overviewResult.error}`, accountResult.error && `Account: ${accountResult.error}`].filter((value): value is string => Boolean(value));
  if (fillScan.status === "unavailable" && fundingScan.status === "unavailable" && !overviewResult.data && !accountResult.data) return NextResponse.json({ error: fillScan.warnings[0] ?? "TxFlow data is unavailable. Please retry." }, { status: 502, headers });
  const summary = fillScan.status === "unavailable" ? null : summarizeTxFills(fillScan.rows);
  if (summary?.excludedFeeTokens.length) warnings.push(`Fees in ${summary.excludedFeeTokens.join(", ")} are excluded from USDC fee totals; no exchange rate was assumed.`);
  const holdingOptions = { from, to: range.to, endExclusive: range.endExclusive, selectedComplete: fillScan.status === "complete", historyStatus: from === null ? fillScan.status : priorScan.status, historyPages: fillScan.pages + priorScan.pages };
  let holding: TxHoldingAnalysis;
  try { holding = analyzeTxHolding([...priorScan.rows, ...fillScan.rows], holdingOptions); }
  catch {
    holding = analyzeTxHolding(fillScan.rows, { ...holdingOptions, selectedComplete: false });
    holding.notes = ["Holding-time reconstruction could not be reconciled. Trading volume and fee totals are still available."];
  }
  if (priorScan.status !== "complete") holding.notes.push(...priorScan.warnings.map(warning => `Earlier fills: ${warning}`));
  const report: TxWalletReport = { address, period, pointsStatus: txflowPointsStatus(period), fetchedAt: new Date(now).toISOString(), range: { from: from === null ? null : new Date(from).toISOString(), to: new Date(range.to).toISOString(), endExclusive: range.endExclusive },
    fillsScan: { status: fillScan.status, pages: fillScan.pages, warnings: fillScan.warnings }, fundingScan: { status: fundingScan.status, pages: fundingScan.pages, warnings: fundingScan.warnings },
    summary, funding: fundingScan.status === "unavailable" ? null : summarizeTxFunding(fundingScan.rows), overview: overviewResult.data, account: accountResult.data, warnings, holding,
    ...groupTxFills(fillScan.rows) };
  return NextResponse.json(report, { headers });
}
