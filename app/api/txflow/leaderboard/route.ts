import { featureFlags } from "@/lib/features";
import { TXFLOW_LEADERBOARD_METRICS, TXFLOW_LEADERBOARD_PERIODS, type TxflowLeaderboardMetric, type TxflowLeaderboardResult } from "@/lib/txflow-leaderboard";
import { txRecord } from "@/lib/txflow-wallet";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!featureFlags.multiExchange && !featureFlags.txflow) return Response.json({ error: "TxFlow analytics is temporarily unavailable." }, { status: 503, headers });
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim().toLowerCase() ?? "";
  const period = params.get("period") ?? "alltime";
  if (!/^0x[0-9a-f]{40}$/.test(address) || !Object.hasOwn(TXFLOW_LEADERBOARD_PERIODS, period)) {
    return Response.json({ error: "Enter a valid wallet address and leaderboard period." }, { status: 400, headers });
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(6_000)]);
  async function read(sortBy: TxflowLeaderboardMetric) {
    // This public request is used by the exchange leaderboard. Its total is filtered by wallet.
    const response = await fetch("https://rpc.txflow.com/info", {
      method: "POST", cache: "no-store", redirect: "error", signal,
      headers: { "Content-Type": "application/json", "x-api-version": "2026-08-16" },
      body: JSON.stringify({
        type: "growthGeneralPublic",
        interface: "/uapi/v1/leaderboard/getOverview",
        queryAddress: address,
        period,
        sortBy,
        pageNo: 1,
        pageSize: 1,
      }),
    });
    if (!response.ok) throw new Error("Leaderboard request failed.");
    const payload = txRecord(await response.json());
    const { data: rows, lastUpdated, total } = txRecord(payload.data);
    if (payload.success !== true || payload.code !== 0 || !Array.isArray(rows)) {
      throw new Error("Unexpected leaderboard response.");
    }
    const row = rows.map(txRecord).find(row => typeof row.userName === "string" && row.userName.toLowerCase() === address);
    const rank = row?.rank;
    const updatedAt = typeof lastUpdated === "number" && lastUpdated > 0 && Number.isFinite(new Date(lastUpdated).getTime()) ? lastUpdated : null;
    if (typeof rank === "number" && Number.isSafeInteger(rank) && rank > 0) return { rank, updatedAt };
    if (total === 0 && rows.length === 0) return { rank: null, updatedAt };
    throw new Error("Wallet rank was missing from the leaderboard response.");
  }

  const metrics = Object.keys(TXFLOW_LEADERBOARD_METRICS) as TxflowLeaderboardMetric[];
  const results = await Promise.allSettled(metrics.map(read));
  const ranks: TxflowLeaderboardResult["ranks"] = { pnl: "unavailable", roi: "unavailable", volume: "unavailable" };
  const timestamps: number[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status !== "fulfilled") continue;
    ranks[metrics[index]] = result.value.rank;
    if (result.value.updatedAt !== null) timestamps.push(result.value.updatedAt);
  }
  if (Object.values(ranks).every(rank => rank === "unavailable")) {
    return Response.json({ error: "TxFlow leaderboard is temporarily unavailable." }, { status: 502, headers });
  }
  const updatedAt = timestamps.length && timestamps.every(value => value === timestamps[0]) ? timestamps[0] : null;
  return Response.json({ ranks, updatedAt } satisfies TxflowLeaderboardResult, { headers });
}
