import { isRisexWallet } from "@/lib/risex-points";
import { buildRisexReport, riseEpoch, riseFill, riseFunding, riseMarketNames, risePortfolio, riseRecord, riseTransfers, scanRisex } from "@/lib/risex-wallet";

const origin = "https://api.rise.trade";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("account")?.trim().toLowerCase() ?? "";
  if (!isRisexWallet(address)) return Response.json({ error: "Enter a valid 0x wallet address." }, { status: 400, headers });

  const now = Date.now();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(19_000)]);
  const endTime = (BigInt(now) * BigInt(1_000_000)).toString();
  async function read(path: string, query: Record<string, string> = {}) {
    const url = new URL(path, origin);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
    });
    if (!response.ok) throw new Error(`RISEx HTTP ${response.status}`);
    return riseRecord(await response.json()).data;
  }

  async function optional<T>(task: Promise<T>, warning: string) {
    try { return { value: await task, warning: null }; }
    catch { return { value: null, warning }; }
  }

  const [markets, trades, funding, portfolio, transfers, epoch] = await Promise.all([
    optional(read("/v1/markets").then(riseMarketNames), "Market names are unavailable. Market IDs are shown."),
    scanRisex(
      page => read("/v1/trade-history", { account: address, end_time: endTime, page: String(page), limit: "1000", sorted_by: "-time" }),
      riseFill,
      { field: "trades", limit: 24, deduplicate: true, label: "trade history" },
    ),
    scanRisex(
      page => read("/v1/account/funding-payments", { account: address, end_time: endTime, page: String(page), limit: "1000", sorted_by: "-time" }),
      riseFunding,
      { field: "records", limit: 10, label: "funding history" },
    ),
    optional(read("/v1/portfolio/details", { account: address }).then(risePortfolio), "Current portfolio could not be loaded."),
    optional(read("/v1/account/transfer-history", { account: address, limit: "10" }).then(riseTransfers), "Recent transfers could not be loaded."),
    optional(read("/v1/points/epoch/current").then(riseEpoch), "The next scheduled points distribution could not be loaded."),
  ]);
  if (trades.status === "unavailable" && funding.status === "unavailable" && !portfolio.value && !transfers.value) {
    return Response.json({ error: "RISEx wallet activity could not be loaded. Try again shortly." }, { status: 502, headers });
  }

  if (markets.value) {
    for (const row of trades.rows) row.market = markets.value.get(row.instrument) ?? row.market;
  }
  return Response.json(buildRisexReport({
    address, now, trades, funding, portfolio: portfolio.value, transfers: transfers.value, epoch: epoch.value,
    warnings: [markets.warning, portfolio.warning, transfers.warning, epoch.warning].filter(warning => warning !== null),
  }), { headers });
}
