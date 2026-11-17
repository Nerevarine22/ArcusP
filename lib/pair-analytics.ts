import { atomsUsd, decimalAtoms } from "./wallet-analytics";
import { parsePairRewardInputs, type PairRewardInputs } from "./pair-rewards";
import { applyPairBalance, type PairBalanceSnapshot } from "./pair-balances";

export const PAIR_PROJECTS = [
  { id: "arcus", name: "Arcus", href: "/arcus/wallet", logo: "/brand/arcus-symbol.svg" },
  { id: "txflow", name: "TxFlow", href: "/txflow/wallet", logo: "/brand/txflow/favicon.ico" },
  { id: "risex", name: "RISEx", href: "/risex/wallet", logo: "/brand/risex/symbol.svg" },
  { id: "entropy", name: "Entropy", href: "/entropy", logo: "/brand/entropy/symbol.svg" },
  { id: "variational", name: "Variational", href: "/variational", logo: "/brand/variational/symbol.svg" },
] as const;
export type PairProject = typeof PAIR_PROJECTS[number]["id"];
export type PairInput = { project: PairProject; address: string; manualEquity?: string };
export type PairForm = PairInput[];
export type PairStatus = "complete" | "partial" | "unavailable";
export const PAIR_DEFAULTS: PairForm = [];
export const isPairAddress = (value: string) => /^0x[0-9a-f]{40}$/i.test(value.trim());
export const isPairProject = (value: unknown): value is PairProject => PAIR_PROJECTS.some(project => project.id === value);
export const pairKey = (value: PairInput) => `${value.project}:${value.address.trim().toLowerCase()}`;
export const samePairWallet = (a: PairInput, b: PairInput) => pairKey(a) === pairKey(b);

export type PairMetrics = {
  netPnl: string | null; tradingPnl: string | null; unrealizedPnl: string | null;
  equity: string | null; volume: string | null; netFees: string | null;
  feesPaid: string | null; rebates: string | null; makerVolume: string | null;
  takerVolume: string | null; makerFees: string | null; takerFees: string | null; funding: string | null;
};
export type PairLeg = {
  project: PairProject; address: string; fetchedAt: string; metrics: PairMetrics;
  pnlStatus: PairStatus; historyStatus: PairStatus; fundingStatus: PairStatus;
  positions: number | null; scope: string; pnlMethod: string; warnings: string[];
  source?: "manual";
  balanceSnapshot?: PairBalanceSnapshot;
};
export type ArcusPairAccount = {
  address: string; fetchedAt: string; complete: boolean; equity: string | null;
  netDeposits: string | null; netPnl: string | null; unrealizedPnl: string | null;
  funding: string | null; fundingComplete: boolean; positions: number | null; warnings: string[];
};

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected wallet response.");
  return value as Record<string, any>;
}
export function pairAmount(value: unknown): string | null {
  try { return atomsUsd(decimalAtoms(value)); } catch { return null; }
}
export function pairSum(values: readonly (string | null)[]): string | null {
  if (!values.length || values.some(value => value === null)) return null;
  return atomsUsd(values.reduce<bigint>((sum, value) => sum + decimalAtoms(value), BigInt(0)));
}
export function pairNetPnl(trading: string | null, fees: string | null, funding: string | null, unrealized: string | null): string | null {
  if ([trading, fees, funding, unrealized].some(value => value === null)) return null;
  return atomsUsd(decimalAtoms(trading) - decimalAtoms(fees) + decimalAtoms(funding) + decimalAtoms(unrealized));
}
export function pairBalancePnl(equity: string | null, netDepositsInput: string): string | null {
  const deposits = pairAmount(netDepositsInput.trim());
  if (equity === null || deposits === null) return null;
  return atomsUsd(decimalAtoms(equity) - decimalAtoms(deposits));
}
export function pairBalanceCost(equity: string | null, netDepositsInput: string): string | null {
  const pnl = pairBalancePnl(equity, netDepositsInput);
  return pnl === null ? null : atomsUsd(-decimalAtoms(pnl));
}
export function pairManualLeg(input: PairInput, fetchedAt = new Date().toISOString()): PairLeg {
  if (input.project !== "variational") throw new Error("Manual equity is available for Variational only.");
  const address = input.address.trim().toLowerCase(), equity = pairAmount(input.manualEquity?.trim());
  if (address && !isPairAddress(address)) throw new Error("Enter a valid wallet address or leave it blank.");
  if (equity === null) throw new Error("Enter current Variational equity in USD, including open-position PnL.");
  return { project: input.project, address, fetchedAt, source: "manual", metrics: { ...pairTotals([]), equity }, positions: null,
    pnlStatus: "unavailable", historyStatus: "unavailable", fundingStatus: "unavailable", scope: "Manually entered Variational account equity",
    pnlMethod: "Current account equity is entered manually and contributes to the combined equity-minus-net-deposits calculation.",
    warnings: ["Variational equity is user-supplied. Trade history, execution fees and funding are unavailable; these amounts are not assumed to be zero."] };
}
const status = (value: unknown): PairStatus => value === "complete" ? "complete" : value === "partial" ? "partial" : "unavailable";
const warnings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 30) : [];
function checked(value: unknown, address: string) {
  const report = object(value);
  if (typeof report.address !== "string" || report.address.toLowerCase() !== address.toLowerCase()) throw new Error("The response belongs to another wallet.");
  return report;
}

/** Normalize existing exchange reports; unknown amounts remain unknown, never zero. */
export function pairLegFromReport(input: PairInput, value: unknown, accountValue?: unknown): PairLeg {
  const address = input.address.trim().toLowerCase();
  const report = value == null ? null : checked(value, address);
  if (input.project !== "arcus" && !report) throw new Error("Wallet activity is unavailable.");
  const metrics: PairMetrics = { netPnl: null, tradingPnl: null, unrealizedPnl: null, equity: null, volume: null, netFees: null, feesPaid: null, rebates: null, makerVolume: null, takerVolume: null, makerFees: null, takerFees: null, funding: null };
  let historyStatus: PairStatus = "unavailable", fundingStatus: PairStatus = "unavailable", pnlStatus: PairStatus = "unavailable";
  let positions: number | null = null, scope = "All available perpetual trading history", pnlMethod = "Loaded trading PnL − net execution fees + funding + current unrealized PnL.";
  let notes = warnings(report?.warnings);
  let fetchedAt = typeof report?.fetchedAt === "number" ? new Date(report.fetchedAt).toISOString() : report?.fetchedAt;

  if (input.project === "arcus") {
    const account = accountValue == null ? null : checked(accountValue, address);
    if (!account && !report) throw new Error("Arcus account and history are unavailable.");
    historyStatus = report?.scan?.complete === true ? "complete" : report?.summary ? "partial" : "unavailable";
    const summary = report?.summary;
    if (summary) {
      metrics.volume = pairAmount(summary.volumeUsd); metrics.netFees = pairAmount(summary.netFeesUsd);
      metrics.feesPaid = pairAmount(summary.feesPaidUsd); metrics.rebates = pairAmount(summary.rebatesUsd);
      metrics.makerVolume = pairAmount(summary.makerVolumeUsd); metrics.takerVolume = pairAmount(summary.takerVolumeUsd);
      if (Array.isArray(report?.fills)) {
        metrics.makerFees = pairSum(report.fills.filter((fill: any) => fill.role === "MAKER").map((fill: any) => pairAmount(fill.feeUsd)).concat("0"));
        metrics.takerFees = pairSum(report.fills.filter((fill: any) => fill.role === "TAKER").map((fill: any) => pairAmount(fill.feeUsd)).concat("0"));
      }
    }
    if (account) {
      metrics.netPnl = pairAmount(account.netPnl); metrics.equity = pairAmount(account.equity);
      metrics.unrealizedPnl = pairAmount(account.unrealizedPnl); metrics.funding = pairAmount(account.funding);
      pnlStatus = metrics.netPnl === null ? "unavailable" : account.complete === true ? "complete" : "partial";
      fundingStatus = account.fundingComplete === true ? "complete" : account.funding !== null ? "partial" : "unavailable";
      positions = Number.isSafeInteger(account.positions) ? account.positions : null;
      fetchedAt = account.fetchedAt;
      notes.push(...warnings(account.warnings));
    } else notes.push("Arcus account PnL could not be loaded. Trading metrics remain available.");
    notes.push(...warnings(report?.scan?.warnings));
    scope = "All Arcus subaccounts (0–9)";
    pnlMethod = "Current account equity minus cumulative net deposits, summed across subaccounts. Fees and funding are already included; they are not deducted again.";
  } else {
    const range = input.project === "risex" ? report!.total : report;
    const summary = range?.summary;
    historyStatus = input.project === "risex" ? status(report!.tradesStatus) : input.project === "entropy" ? status(report!.scan?.status) : status(report!.fillsScan?.status);
    fundingStatus = input.project === "risex" ? status(report!.fundingStatus) : status(report!.fundingScan?.status);
    if (input.project === "entropy") {
      scope = report!.version === 2 ? "Confirmed Entropy builder executions · incomplete public archives" : "Entropy io: perpetual markets only";
      if (report!.scan?.retentionLimited) historyStatus = "partial";
      if (report!.fundingScan?.retentionLimited) fundingStatus = "partial";
      notes.push(...warnings(report!.scan?.warnings));
    } else if (input.project === "txflow") notes.push(...warnings(report!.fillsScan?.warnings));
    notes.push(...warnings(report!.fundingScan?.warnings));
    if (summary) {
      metrics.volume = pairAmount(summary.volume); metrics.netFees = pairAmount(summary.netFees);
      metrics.feesPaid = pairAmount(summary.feesPaid); metrics.rebates = pairAmount(summary.rebates);
      metrics.tradingPnl = pairAmount(summary.closedPnl); metrics.makerVolume = pairAmount(summary.makerVolume);
      metrics.takerVolume = pairAmount(summary.takerVolume); metrics.makerFees = pairAmount(summary.feesByRole?.maker?.net);
      metrics.takerFees = pairAmount(summary.feesByRole?.taker?.net);
      if (input.project === "entropy" && report!.version === 2 && report!.attribution?.feesComplete !== true) {
        metrics.netFees = null; metrics.feesPaid = null; metrics.rebates = null; metrics.makerFees = null; metrics.takerFees = null;
      }
    }
    metrics.funding = pairAmount(range?.funding?.net);
    if (input.project === "risex" && report!.tradingPnlComplete === false) {
      metrics.tradingPnl = null;
      notes.push("Some RISEx trades have no reported realized PnL. A complete trading PnL cannot be calculated.");
    }
    const account = input.project === "risex" ? report!.portfolio : report!.account;
    if (account) {
      metrics.equity = pairAmount(account.equity);
      positions = Array.isArray(account.positions) ? account.positions.length : null;
      metrics.unrealizedPnl = input.project === "risex" ? pairAmount(account.unrealizedPnl)
        : Array.isArray(account.positions) ? pairSum(account.positions.map((position: any) => pairAmount(position.unrealizedPnl)).concat("0")) : null;
    }
    metrics.netPnl = pairNetPnl(metrics.tradingPnl, metrics.netFees, metrics.funding, metrics.unrealizedPnl);
    const excludedFees = Array.isArray(summary?.excludedFeeTokens) && summary.excludedFeeTokens.length > 0;
    if (excludedFees) notes.push("Some execution fees are not USD/USDC-denominated. They are excluded from this estimate.");
    pnlStatus = metrics.netPnl === null ? "unavailable" : historyStatus === "complete" && fundingStatus === "complete" && !excludedFees ? "complete" : "partial";
  }
  if (historyStatus !== "complete") notes.push("History is incomplete. Volume and execution fees cover loaded trades only.");
  if (fundingStatus !== "complete") notes.push("The complete funding total is unavailable.");
  if (pnlStatus !== "complete") notes.push("A complete API / history net PnL is unavailable for this wallet. Equity-based PnL can still use its available balance.");
  if (typeof fetchedAt !== "string" || !Number.isFinite(Date.parse(fetchedAt))) throw new Error("The wallet response has no valid timestamp.");
  return { project: input.project, address, fetchedAt, metrics, pnlStatus, historyStatus, fundingStatus, positions, scope, pnlMethod, warnings: [...new Set(notes)] };
}

export function pairTotals(legs: readonly (PairLeg | null)[]): PairMetrics {
  const metrics = Object.fromEntries(Object.keys({ netPnl: 0, tradingPnl: 0, unrealizedPnl: 0, equity: 0, volume: 0, netFees: 0, feesPaid: 0, rebates: 0, makerVolume: 0, takerVolume: 0, makerFees: 0, takerFees: 0, funding: 0 }).map(key => [key, null])) as PairMetrics;
  if (legs.length < 2 || legs.some(leg => !leg) || new Set(legs.map(leg => pairKey(leg!))).size !== legs.length) return metrics;
  const loadedKeys: (keyof PairMetrics)[] = ["volume", "netFees", "feesPaid", "rebates", "makerVolume", "takerVolume", "makerFees", "takerFees"];
  for (const key of Object.keys(metrics) as (keyof PairMetrics)[]) {
    const sources = loadedKeys.includes(key) ? legs.filter(leg => leg!.project !== "variational") : legs;
    metrics[key] = pairSum(sources.map(leg => leg!.metrics[key]));
  }
  if (legs.some(leg => leg!.pnlStatus !== "complete")) metrics.netPnl = null;
  if (legs.some(leg => leg!.fundingStatus !== "complete")) metrics.funding = null;
  return metrics;
}

export type PairSession = { form: PairForm; reports: (PairLeg | null)[]; netDeposits: string; pnlBasis: "equity" | "history"; rewards: PairRewardInputs; selectionConfirmed: boolean };
export function parsePairSession(raw: string | null): PairSession {
  const empty = (): PairSession => ({ form: [], reports: [], netDeposits: "", pnlBasis: "equity", rewards: [], selectionConfirmed: false });
  try {
    const saved = object(JSON.parse(raw ?? "null")), result = empty();
    if (Array.isArray(saved.form) && saved.form.length >= 2 && saved.form.length <= PAIR_PROJECTS.length && saved.form.every((input: any) => isPairProject(input?.project))) result.form = saved.form.map((input: any) => ({ project: input.project, address: typeof input.address === "string" ? input.address.slice(0, 42) : "", ...(input.project === "variational" ? { manualEquity: typeof input.manualEquity === "string" ? input.manualEquity.slice(0, 100) : "" } : {}) }));
    result.reports = result.form.map(() => null);
    result.selectionConfirmed = saved.selectionConfirmed === true && result.form.length >= 2;
    result.netDeposits = typeof saved.netDeposits === "string" ? saved.netDeposits.slice(0, 100) : "";
    result.pnlBasis = saved.pnlBasis === "history" && !result.form.some(input => input.project === "variational") ? "history" : "equity";
    result.rewards = parsePairRewardInputs(saved.rewards, result.form.map(input => input.project));
    for (let index = 0; index < result.form.length; index++) {
      const report = saved.reports?.[index];
      if (!report || typeof report.address !== "string" || (!isPairAddress(report.address) && !(report.project === "variational" && report.address === "")) || !isPairProject(report.project) || pairKey(report) !== pairKey(result.form[index])) continue;
      if (typeof report.fetchedAt !== "string" || !Number.isFinite(Date.parse(report.fetchedAt)) || typeof report.pnlMethod !== "string" || typeof report.scope !== "string") continue;
      if (report.project === "variational") {
        try { result.reports[index] = pairManualLeg(result.form[index], report.fetchedAt); } catch { /* An invalid manual balance remains unknown. */ }
        continue;
      }
      const keys = Object.keys(pairTotals([])) as (keyof PairMetrics)[];
      if (!report.metrics || keys.some(key => report.metrics[key] !== null && pairAmount(report.metrics[key]) === null)) continue;
      result.reports[index] = { ...report, pnlStatus: status(report.pnlStatus), historyStatus: status(report.historyStatus), fundingStatus: status(report.fundingStatus), warnings: warnings(report.warnings), positions: Number.isSafeInteger(report.positions) && report.positions >= 0 ? report.positions : null };
      if (report.balanceSnapshot) {
        try { result.reports[index] = applyPairBalance(result.form[index], result.reports[index], report.balanceSnapshot); }
        catch { delete result.reports[index]!.balanceSnapshot; }
      }
    }
    return result;
  } catch { return empty(); }
}

/** Confirm the project set atomically; retained wallets keep their matching data. */
export function selectPairProjects(session: PairSession, projects: readonly PairProject[]): PairSession {
  if (projects.length < 2 || projects.length > PAIR_PROJECTS.length || projects.some(project => !isPairProject(project)) || new Set(projects).size !== projects.length) throw new Error("Select at least two different projects.");
  const selected = PAIR_PROJECTS.filter(project => projects.includes(project.id)).map(project => project.id);
  const previous = selected.map(project => session.form.findIndex(input => input.project === project));
  const form = selected.map((project, i) => previous[i] >= 0 ? { ...session.form[previous[i]] } : { project, address: "", ...(project === "variational" ? { manualEquity: "" } : {}) });
  const unchanged = form.length === session.form.length && form.every(input => session.form.some(old => pairKey(input) === pairKey(old)));
  return { ...session, form, reports: previous.map(index => index >= 0 ? session.reports[index] ?? null : null),
    rewards: parsePairRewardInputs(previous.map(index => index >= 0 ? session.rewards[index] : null), selected),
    netDeposits: unchanged ? session.netDeposits : "", selectionConfirmed: true, pnlBasis: selected.includes("variational") ? "equity" : session.pnlBasis };
}
