import { parseArcusJson, atomsUsd, decimalAtoms } from "@/lib/wallet-analytics";
import { isPairAddress, isPairProject } from "@/lib/pair-analytics";
import { balanceAmount, entropyCurrentBalance, type PairBalanceSnapshot } from "@/lib/pair-balances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Account balance response is unavailable.");
  return value as Record<string, any>;
}
export async function POST(request: Request) {
  let input: Record<string, any>;
  try { input = record(await request.json()); } catch { return Response.json({ error: "Send a valid account request." }, { status: 400, headers }); }
  const address = typeof input.address === "string" ? input.address.trim().toLowerCase() : "", project = input.project;
  if (!isPairAddress(address) || !isPairProject(project) || project === "variational") return Response.json({ error: "Select an API-supported exchange and valid wallet address." }, { status: 400, headers });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(22_000)]);
  async function read(url: string, body?: object, extraHeaders: Record<string, string> = {}, empty404 = false) {
    const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]), headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (empty404 && response.status === 404) return null;
    if (!response.ok) throw new Error("Current balance could not be read from the exchange.");
    return parseArcusJson(await response.text());
  }
  try {
    let value: string, source: string, scope: string;
    if (project === "arcus") {
      let sum = BigInt(0);
      for (let start = 0; start < 10; start += 3) {
        const rows = await Promise.all(Array.from({ length: Math.min(3, 10 - start) }, (_, offset) => {
          const index = start + offset;
          return read(`https://api.arcus.xyz/v1/account?address=${address}&accountIndex=${index}`, undefined, {}, true).then(value => {
            if (value === null) return "0";
            const row = record(value);
            if (String(row.address).toLowerCase() !== address || Number(row.accountIndex) !== index) throw new Error("Arcus returned a different account.");
            return balanceAmount(row.equity);
          });
        }));
        sum += rows.reduce((total, amount) => total + decimalAtoms(amount), BigInt(0));
      }
      value = atomsUsd(sum); source = "/v1/account · equity"; scope = "All Arcus subaccounts (0–9)";
    } else if (project === "txflow") {
      const raw = record(await read("https://rpc.txflow.com/info", { type: "clearinghouseState", user: address, accountType: "perp" }, { "x-api-version": "2026-08-16" }));
      if (raw.success === false || (raw.code !== undefined && String(raw.code) !== "0")) throw new Error("TxFlow balance is unavailable.");
      value = balanceAmount(record(record(raw.data ?? raw).marginSummary).accountValue); source = "clearinghouseState · marginSummary.accountValue"; scope = "TxFlow perpetual account";
    } else if (project === "risex") {
      const raw = record(await read(`https://api.rise.trade/v1/portfolio/details?account=${address}`));
      value = balanceAmount(record(record(raw.data).summary).total_account_value); source = "/v1/portfolio/details · total_account_value"; scope = "RISEx account";
    } else {
      const mode = await read("https://api.hyperliquid.xyz/info", { type: "userAbstraction", user: address });
      const account = await read("https://api.hyperliquid.xyz/info", mode === "unifiedAccount" ? { type: "spotClearinghouseState", user: address } : { type: "clearinghouseState", user: address, dex: "io" });
      ({ value, source, scope } = entropyCurrentBalance(mode, mode === "unifiedAccount" ? account : null, mode === "unifiedAccount" ? null : account));
    }
    const result: PairBalanceSnapshot = { version: 1, project, address, value, source, scope, fetchedAt: new Date().toISOString() };
    return Response.json(result, { headers });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Current balance is unavailable." }, { status: 502, headers });
  }
}
