import { NextRequest, NextResponse } from "next/server";
import { ENTROPY_PERIODS, type EntropyPeriod } from "@/lib/entropy-wallet";
import { syncBuilderWallet } from "@/lib/entropy-builder-service";
import { fetchBuilderDay, fetchBuilderFeeHistory } from "@/lib/entropy-builder-source";
import { readBuilderDays, saveBuilderDays, saveBuilderReport } from "@/lib/entropy-builder-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  let body: { address?: unknown; period?: unknown; sync?: unknown };
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return NextResponse.json({ error: "Send a valid wallet request." }, { status: 400, headers }); }
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  if (!/^0x[0-9a-f]{40}$/.test(address)) return NextResponse.json({ error: "Enter a valid 0x wallet address with 40 hexadecimal characters." }, { status: 400, headers });
  const period = body.period ?? "ALL";
  if (typeof period !== "string" || !Object.hasOwn(ENTROPY_PERIODS, period)) return NextResponse.json({ error: "Select a supported analysis period." }, { status: 400, headers });
  if (body.sync !== undefined && typeof body.sync !== "boolean") return NextResponse.json({ error: "Invalid import request." }, { status: 400, headers });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  try {
    const report = await syncBuilderWallet(address, period as EntropyPeriod, Date.now(), body.sync !== false, signal,
      { read: readBuilderDays, save: saveBuilderDays, saveReport: saveBuilderReport, archive: fetchBuilderDay, fees: fetchBuilderFeeHistory });
    return NextResponse.json(report, { headers });
  } catch (error) {
    // Database exceptions are translated by the store; never expose driver messages or credentials.
    const message = signal.aborted ? "Import interrupted. Previously saved days are retained; run Analyze activity to continue."
      : error instanceof Error && error.message.startsWith("Entropy ") ? error.message : "Entropy history could not be loaded. Previously saved history is retained.";
    return NextResponse.json({ error: message }, { status: 503, headers });
  }
}
