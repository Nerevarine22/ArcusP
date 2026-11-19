import { parseVariationalPremarket, VARIATIONAL_LIGHTER_API } from "@/lib/variational-premarket";

export async function GET() {
  try {
    const response = await fetch(VARIATIONAL_LIGHTER_API, {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (response.ok) {
      const quote = parseVariationalPremarket(await response.json());
      if (quote) return Response.json(quote, { headers: { "Cache-Control": "public, s-maxage=30" } });
    }
  } catch { /* Keep manual scenarios available when Lighter cannot supply a quote. */ }
  return Response.json({ price: null }, { headers: { "Cache-Control": "no-store" } });
}
