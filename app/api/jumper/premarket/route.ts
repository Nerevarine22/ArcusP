import { JUMPER_ASPECTA_POOL, parseJumperPremarket } from "@/lib/jumper-premarket";

export async function GET() {
  const signal = AbortSignal.timeout(8_000);
  for (const rpc of ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed1.bnbchain.org"]) {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(3_500)]);
    try {
      const response = await fetch(rpc, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: requestSignal,
        // Both view calls are read against the same block for a consistent quote.
        body: JSON.stringify([
          { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
        ]),
      });
      if (!response.ok) continue;
      const blockResponse: unknown = await response.json();
      const block = Array.isArray(blockResponse) ? blockResponse.find(item => item.id === 1 && !item.error)?.result : null;
      if (typeof block !== "string" || !/^0x[0-9a-fA-F]+$/.test(block)) continue;
      const calls = await fetch(rpc, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: requestSignal,
        // getSqrtPrice() and getSettlementRatio(), verified against Aspecta's V3 ABI.
        body: JSON.stringify(["0x86e6862d", "0x46c7b829"].map((data, index) => ({
          jsonrpc: "2.0", id: index + 1, method: "eth_call", params: [{ to: JUMPER_ASPECTA_POOL, data }, block],
        }))),
      });
      if (!calls.ok) continue;
      const payload: unknown = await calls.json();
      if (!Array.isArray(payload)) continue;
      const quote = parseJumperPremarket(payload.find(item => item.id === 1 && !item.error)?.result, payload.find(item => item.id === 2 && !item.error)?.result);
      if (quote) return Response.json({ ...quote, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=30" } });
    } catch { /* Try the other public RPC; manual FDV scenarios remain available. */ }
  }
  return Response.json({ price: null, fdv: null }, { headers: { "Cache-Control": "no-store" } });
}
