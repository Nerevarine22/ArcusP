import { NextResponse } from "next/server";
import { emptyVariationalMarket, loadVariationalMarket, type VariationalMarketSnapshot } from "@/lib/variational-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;
const endpoint = "https://narrative.agent.heisenberg.so/api/v2/semantic/retrieve/parameterized";
const headers = { "Cache-Control": "no-store" };
// A one-minute server cache and shared pending request protect API credits.
let cached: { key: string; expires: number; snapshot: VariationalMarketSnapshot } | null = null;
let pending: { key: string; promise: Promise<VariationalMarketSnapshot> } | null = null;

export async function GET() {
  const key = process.env.HEISENBERG_API_KEY?.trim();
  if (!key) return NextResponse.json(emptyVariationalMarket("not_configured", "The market data connection is not configured yet. Use manual FDV."), { headers });
  if (cached?.key === key && cached.expires > Date.now()) return NextResponse.json(cached.snapshot, { headers });
  if (pending?.key === key) return NextResponse.json(await pending.promise, { headers });

  const promise = (async () => {
    const signal = AbortSignal.timeout(30_000);
    try {
      const snapshot = await loadVariationalMarket(async (agent_id, params, pagination) => {
        const response = await fetch(endpoint, { method: "POST", cache: "no-store", signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ agent_id, params, pagination, formatter_config: { format_type: "raw" } }) });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error("Heisenberg authentication failed. Check the server API key.");
          if (response.status === 429) throw new Error("Heisenberg rate limit reached. Try again shortly.");
          throw new Error("The market data provider is temporarily unavailable.");
        }
        return response.json();
      });
      cached = { key, expires: Date.now() + 60_000, snapshot };
      return snapshot;
    } catch (cause) {
      // Do not return upstream bodies, request headers, credentials or stack traces.
      const allowed = ["Heisenberg authentication failed. Check the server API key.", "Heisenberg rate limit reached. Try again shortly."];
      const message = signal.aborted ? "The market data request timed out. Try again shortly."
        : cause instanceof Error && allowed.includes(cause.message) ? cause.message : "Market data could not be loaded. Manual FDV remains available.";
      const snapshot = emptyVariationalMarket("unavailable", message);
      cached = { key, expires: Date.now() + 15_000, snapshot };
      return snapshot;
    }
  })();
  pending = { key, promise };
  try { return NextResponse.json(await promise, { headers }); }
  finally { if (pending?.promise === promise) pending = null; }
}
