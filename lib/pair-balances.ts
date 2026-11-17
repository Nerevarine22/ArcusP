import type { PairInput, PairLeg, PairProject } from "./pair-analytics";
import { atomsUsd, decimalAtoms } from "./wallet-analytics";

export type PairBalanceSnapshot = { version: 1; project: PairProject; address: string; value: string | null; fetchedAt: string; source: string; scope: string; error?: string };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Account balance response is unavailable.");
  return value as Record<string, unknown>;
}
export function balanceAmount(value: unknown): string { return atomsUsd(decimalAtoms(value)); }

/** Unified collateral is already included in spot total. Never add DEX equity or subtract holds again. */
export function entropyCurrentBalance(mode: unknown, spot: unknown, io: unknown): { value: string; source: string; scope: string } {
  if (mode === "unifiedAccount") {
    const balances = record(spot).balances;
    if (!Array.isArray(balances)) throw new Error("Unified USDC balance is unavailable.");
    const rows = balances.map(record).filter(row => row.coin === "USDC" && String(row.token) === "0");
    if (rows.length > 1) throw new Error("The unified USDC balance is ambiguous.");
    return { value: rows.length ? balanceAmount(rows[0].total) : "0", source: "spotClearinghouseState · USDC total", scope: "Unified Hyperliquid USDC balance shared with Entropy" };
  }
  if (!["disabled", "default"].includes(String(mode))) throw new Error("This Hyperliquid account mode needs a separate balance valuation; no zero balance is assumed.");
  return { value: balanceAmount(record(record(io).marginSummary).accountValue), source: "clearinghouseState · io accountValue", scope: "Entropy io perpetual account balance" };
}

export function applyPairBalance(input: PairInput, leg: PairLeg | null, snapshot: PairBalanceSnapshot): PairLeg {
  const address = input.address.trim().toLowerCase();
  if (snapshot.project !== input.project || snapshot.address !== address || snapshot.version !== 1 || typeof snapshot.source !== "string" || typeof snapshot.scope !== "string" || !Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error("The balance belongs to another account.");
  const value = snapshot.value === null ? null : balanceAmount(snapshot.value);
  const unknown = { netPnl: null, tradingPnl: null, unrealizedPnl: null, equity: null, volume: null, netFees: null, feesPaid: null, rebates: null, makerVolume: null, takerVolume: null, makerFees: null, takerFees: null, funding: null };
  const base: PairLeg = leg ?? { project: input.project, address, fetchedAt: snapshot.fetchedAt, metrics: unknown, pnlStatus: "unavailable", historyStatus: "unavailable", fundingStatus: "unavailable", positions: null, scope: snapshot.scope, pnlMethod: "Only the current API balance is loaded. Trade history is unavailable.", warnings: [] };
  return { ...base, metrics: { ...base.metrics, equity: value }, balanceSnapshot: { ...snapshot, value }, warnings: [...base.warnings.filter(note => !note.startsWith("Balance: ")), ...(snapshot.error ? [`Balance: ${snapshot.error}`] : [])] };
}
