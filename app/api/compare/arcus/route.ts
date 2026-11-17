import { parseArcusJson } from "@/lib/wallet-analytics";
import { atomsUsd, decimalAtoms } from "@/lib/wallet-analytics";
import { isPairAddress, pairAmount, pairSum, type ArcusPairAccount } from "@/lib/pair-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim().toLowerCase() ?? "";
  if (!isPairAddress(address)) return Response.json({ error: "Enter a valid EVM wallet address." }, { status: 400, headers });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(23_000)]);
  const nowMicros = Date.now() * 1000;
  async function read(path: string, accountIndex: number, query: Record<string, string> = {}) {
    const url = new URL(path, "https://api.arcus.xyz");
    url.search = new URLSearchParams({ address, accountIndex: String(accountIndex), ...query }).toString();
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]) });
    if (path === "/v1/account" && response.status === 404) return null;
    if (!response.ok) throw new Error("Arcus account data is temporarily unavailable.");
    return parseArcusJson(await response.text()) as Record<string, any>;
  }
  const accounts: { index: number; equity: string; deposits: string; unrealized: string | null; positions: number }[] = [];
  const warnings: string[] = [];
  let complete = true;
  // Bound concurrency to avoid a burst of ten account requests.
  for (let start = 0; start < 10; start += 3) {
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, 10 - start) }, async (_, offset) => {
      const index = start + offset, row = await read("/v1/account", index);
      if (row === null) return null;
      if (String(row.address).toLowerCase() !== address || Number(row.accountIndex) !== index) throw new Error("Arcus returned another account.");
      const equity = pairAmount(row.equity), deposits = pairAmount(row.netDeposits);
      if (equity === null || deposits === null || !row.positions || typeof row.positions !== "object" || Array.isArray(row.positions)) throw new Error("Incomplete account balance.");
      if (Array.isArray(row.netDepositsByAsset) && row.netDepositsByAsset.some((asset: any) => !["USDG", "USDC", "USD"].includes(asset.spotAssetDisplayName))) throw new Error("Non-dollar collateral cannot be compared without a valuation.");
      const positions = Object.values(row.positions) as Record<string, unknown>[];
      return { index, equity, deposits, unrealized: positions.length ? pairSum(positions.map(position => pairAmount(position.unrealizedPnl))) : "0", positions: positions.length };
    }));
    for (const result of results) {
      if (result.status === "fulfilled") { if (result.value) accounts.push(result.value); }
      else complete = false;
    }
  }
  if (!complete) warnings.push("Some Arcus subaccounts could not be read. Combined wallet PnL is unavailable.");
  let fundingComplete = true;
  const payments: string[] = [];
  for (const account of accounts) {
    let cursor = nowMicros, ended = false;
    const seen = new Set<string>();
    try {
      for (let page = 0; page < 4; page++) {
        const response = await read("/v1/funding", account.index, { limit: "1000", to: String(cursor) });
        if (!Array.isArray(response?.fundingPayments)) throw new Error("Funding unavailable.");
        let oldest = cursor, added = 0;
        for (const row of response.fundingPayments) {
          const time = Number(row.time), amount = pairAmount(row.payment);
          if (!Number.isSafeInteger(time) || time < 1e14 || time > cursor || amount === null) throw new Error("Invalid funding payment.");
          const key = `${row.marketId}:${time}:${row.size}`;
          oldest = Math.min(oldest, time);
          if (!seen.has(key)) { seen.add(key); added++; payments.push(amount); }
        }
        if (response.fundingPayments.length < 1000) { ended = true; break; }
        if (!added || oldest >= cursor) break;
        cursor = oldest;
      }
    } catch { /* Account PnL remains available even if funding detail is unavailable. */ }
    if (!ended) fundingComplete = false;
  }
  fundingComplete = fundingComplete && complete;
  if (!fundingComplete) warnings.push("Arcus funding history is incomplete; no complete funding total is shown.");
  const equity = complete ? pairSum(accounts.map(account => account.equity).concat("0")) : null;
  const netDeposits = complete ? pairSum(accounts.map(account => account.deposits).concat("0")) : null;
  const result: ArcusPairAccount = { address, fetchedAt: new Date().toISOString(), complete,
    equity, netDeposits, netPnl: equity !== null && netDeposits !== null ? atomsUsd(decimalAtoms(equity) - decimalAtoms(netDeposits)) : null,
    unrealizedPnl: complete ? pairSum(accounts.map(account => account.unrealized).concat("0")) : null,
    funding: fundingComplete ? pairSum(payments.concat("0")) : null, fundingComplete,
    positions: complete ? accounts.reduce((sum, account) => sum + account.positions, 0) : null, warnings };
  return Response.json(result, { headers });
}
