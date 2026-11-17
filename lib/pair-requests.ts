import { pairLegFromReport, pairManualLeg, type PairInput, type PairLeg } from "./pair-analytics";
import { applyPairBalance, type PairBalanceSnapshot } from "./pair-balances";

async function read(url: string, signal: AbortSignal, body?: object) {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "Wallet activity could not be loaded.");
  return value;
}

export async function fetchPairBalance(input: PairInput, signal: AbortSignal): Promise<PairBalanceSnapshot> {
  return await read("/api/compare/balance", AbortSignal.any([signal, AbortSignal.timeout(27_000)]), { project: input.project, address: input.address.trim().toLowerCase() }) as PairBalanceSnapshot;
}
export function unavailablePairBalance(input: PairInput, cause: unknown): PairBalanceSnapshot {
  return { version: 1, project: input.project, address: input.address.trim().toLowerCase(), value: null, fetchedAt: new Date().toISOString(), source: "Unavailable", scope: "Current API account balance", error: cause instanceof Error ? cause.message : "Current balance could not be loaded." };
}
export async function fetchPairLeg(input: PairInput, parentSignal: AbortSignal): Promise<PairLeg> {
  if (input.project === "variational") return pairManualLeg(input);
  const [activity, balance] = await Promise.allSettled([fetchPairActivity(input, parentSignal), fetchPairBalance(input, parentSignal)]);
  if (activity.status === "rejected" && balance.status === "rejected") throw new Error("Account balance and activity could not be loaded. Try again shortly.");
  return applyPairBalance(input, activity.status === "fulfilled" ? activity.value : null, balance.status === "fulfilled" ? balance.value : unavailablePairBalance(input, balance.reason));
}
async function fetchPairActivity(input: PairInput, parentSignal: AbortSignal): Promise<PairLeg> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(58_000)]);
  const address = input.address.trim().toLowerCase();
  if (input.project === "arcus") {
    const [history, account] = await Promise.allSettled([
      read("/api/wallet", signal, { address, period: "all", accountScope: "all", includeWeekly: true }),
      read(`/api/compare/arcus?address=${address}`, signal),
    ]);
    if (history.status === "rejected" && account.status === "rejected") throw new Error("Arcus activity could not be loaded. Try again shortly.");
    return pairLegFromReport(input, history.status === "fulfilled" ? history.value : null, account.status === "fulfilled" ? account.value : null);
  }
  const report = input.project === "risex"
    ? await read(`/api/risex/wallet?account=${address}`, signal)
    : await read(`/api/${input.project}/wallet`, signal, { address, period: input.project === "txflow" ? "ALLTIME" : "ALL", ...(input.project === "entropy" ? { scope: "io" } : {}) });
  return pairLegFromReport(input, report);
}
