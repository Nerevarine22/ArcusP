import { parseExtendedMarkPrice } from "@/lib/extended-premarket";

export async function GET() {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const markPrice = parseExtendedMarkPrice(await response.json());
      if (markPrice !== null) {
        return Response.json({ markPrice }, { headers: { "Cache-Control": "public, s-maxage=30" } });
      }
    }
  } catch { /* Manual FDV scenarios remain available when the quote cannot be fetched. */ }
  return Response.json({ markPrice: null }, { headers: { "Cache-Control": "no-store" } });
}
