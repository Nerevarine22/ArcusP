import { NextRequest, NextResponse } from "next/server";
import { parse } from "lossless-json";
import { ENTROPY_PERIODS, buildEntropyReport, collectEntropyHistory, normalizeEntropyAccount, normalizeEntropyFill, normalizeEntropyFunding, type EntropyPeriod } from "@/lib/entropy-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let body: { address?: unknown; period?: unknown };
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return NextResponse.json({ error: "Send a valid wallet request." }, { status: 400, headers }); }
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "Enter a valid 0x wallet address with 40 hexadecimal characters." }, { status: 400, headers });
  const period = body.period ?? "ALL";
  if (typeof period !== "string" || !Object.hasOwn(ENTROPY_PERIODS, period)) return NextResponse.json({ error: "Select a supported analysis period." }, { status: 400, headers });
  const now = Date.now(), signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  async function read(payload: Record<string, unknown>) {
    const response = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(response.status === 429 ? "Hyperliquid rate limit reached. Try again shortly." : "Hyperliquid data is temporarily unavailable.");
    return parse(await response.text(), null, { parseNumber: value => value });
  }
  const [fills, funding, accountResult] = await Promise.all([
    collectEntropyHistory(startTime => read({ type: "userFillsByTime", user: address, startTime, endTime: now, aggregateByTime: false }), normalizeEntropyFill, { to: now, limit: 2000, maxPages: 8, kind: "fills" }),
    collectEntropyHistory(startTime => read({ type: "userFunding", user: address, startTime, endTime: now }), normalizeEntropyFunding, { to: now, limit: 500, maxPages: 20, kind: "funding" }),
    read({ type: "clearinghouseState", user: address, dex: "io" }).then(value => ({ data: normalizeEntropyAccount(value), warning: undefined })).catch(() => ({ data: null, warning: "Current io positions could not be loaded. Historical trading metrics remain available." })),
  ]);
  if (fills.status === "unavailable" && funding.status === "unavailable" && accountResult.data === null) return NextResponse.json({ error: "Entropy activity could not be loaded from Hyperliquid. Try again shortly." }, { status: 502, headers });
  return NextResponse.json(buildEntropyReport(address, period as EntropyPeriod, now, fills, funding, accountResult.data, accountResult.warning), { headers });
}
