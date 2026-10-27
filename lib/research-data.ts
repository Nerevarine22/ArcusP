import type { PointWeek } from "./leaderboard";
import type { WalletReport } from "./wallet-analytics";
import type { TxWalletReport } from "./txflow-wallet";

export const RESEARCH_VERSION = 1;
export const RESEARCH_CONSENT = "wallet-strategy-research-v1";
export type ResearchStatus = { status: "saved" | "not_configured" | "failed"; message: string };
export type ResearchPoints = {
  value: string | null; source: "arcus_snapshot" | "manual"; status: string;
  distributionAt: string | null; observedAt: string;
};
export type ResearchSummary = {
  fills: number; volumeUsd: string; feesPaidUsd: string; rebatesUsd: string; netFeesUsd: string;
  makerVolumeUsd: string; takerVolumeUsd: string; unknownRoleVolumeUsd: string; realizedPnlUsd: string | null;
};
export type ResearchPeriod = {
  id: string; label: string; season: string; start: string | null; end: string; observedThrough: string; observedAt: string;
  periodComplete: boolean; fullCoverage: boolean; fillsComplete: boolean; feesComplete: boolean; holdingComplete: boolean;
  points: ResearchPoints; summary: ResearchSummary | null;
  holding: { method: "FIFO"; averageClosedHoldHours: number | null; heldAtLeast12hUsd: string;
    buckets: { id: string; volumeUsd: string; sharePercent: number }[] };
  markets: { market: string; volumeUsd: string; netFeesUsd: string; fills: number; makerSharePercent: number }[];
  fundingNetReceivedUsd: string | null; fundingComplete: boolean;
  eligibleForPointsComparison: boolean; eligibleForHoldingComparison: boolean;
  ratios: { volumePerPointUsd: number | null; netFeesPerPointUsd: number | null; pointsPer10kVolume: number | null; makerSharePercent: number | null };
};
export type ResearchWallet = {
  schemaVersion: number; project: "arcus" | "txflow"; address: string; firstSeenAt: string; updatedAt: string;
  consent: { version: string; acceptedAt: string };
  profile: { name: string; walletLink: "user_supplied_unverified" } | null;
  latestScan: { fetchedAt: string; from: string | null; to: string; scope: string; complete: boolean; summary: ResearchSummary | null;
    submittedTotalPoints?: { value: string; source: "manual"; attribution: "selected_scan_only" } | null };
  periods: Record<string, ResearchPeriod>;
};

// This is the only client metadata admitted to the dataset. Trading data is built on the server.
export function researchInput(value: unknown): { consent: true; name: string; points: Record<string, string>; totalPoints: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.consent !== true || input.version !== RESEARCH_CONSENT) return null;
  const pointValue = (raw: unknown) => {
    if (typeof raw !== "string" || raw.length > 40) return null;
    const normalized = raw.trim().replace(",", ".");
    return /^\d{1,18}(\.\d{1,12})?$/.test(normalized) ? normalized : null;
  };
  const points: Record<string, string> = {};
  if (input.points && typeof input.points === "object" && !Array.isArray(input.points)) {
    for (const id of ["S0", "EPOCH_1", "EPOCH_2"]) {
      const raw = (input.points as Record<string, unknown>)[id];
      // Empty is unknown; explicitly entered zero is a valid observation.
      const normalized = pointValue(raw);
      if (normalized !== null) points[id] = normalized;
    }
  }
  const totalPoints = pointValue(input.totalPoints);
  return { consent: true, name: typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 100) : "", points, totalPoints };
}

function decimalSum(values: string[]) {
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return sum + BigInt(whole) * BigInt(1_000_000_000) + BigInt(fraction.padEnd(9, "0").slice(0, 9));
  }, BigInt(0));
  const fraction = (total % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
  return `${total / BigInt(1_000_000_000)}${fraction ? `.${fraction}` : ""}`;
}
function arcusSummary(summary: NonNullable<WalletReport["summary"]>): ResearchSummary {
  return { fills: summary.fillCount, volumeUsd: summary.volumeUsd, feesPaidUsd: summary.feesPaidUsd, rebatesUsd: summary.rebatesUsd,
    netFeesUsd: summary.netFeesUsd, makerVolumeUsd: summary.makerVolumeUsd, takerVolumeUsd: summary.takerVolumeUsd, unknownRoleVolumeUsd: "0", realizedPnlUsd: null };
}
function txSummary(summary: NonNullable<TxWalletReport["summary"]>): ResearchSummary {
  return { fills: summary.fills, volumeUsd: summary.volume, feesPaidUsd: summary.feesPaid, rebatesUsd: summary.rebates,
    netFeesUsd: summary.netFees, makerVolumeUsd: summary.makerVolume, takerVolumeUsd: summary.takerVolume, unknownRoleVolumeUsd: summary.unknownRoleVolume, realizedPnlUsd: summary.closedPnl };
}
export function withResearchRatios(period: ResearchPeriod): ResearchPeriod {
  const count = Number(period.points.value), summary = period.summary;
  const eligible = period.points.value !== null && count > 0 && Number.isFinite(count) && ["recorded", "manual"].includes(period.points.status)
    && period.periodComplete && period.fullCoverage && period.fillsComplete && summary !== null;
  const volume = summary ? Number(summary.volumeUsd) : 0;
  const finite = (value: number) => Number.isFinite(value) ? value : null;
  return { ...period, eligibleForPointsComparison: eligible, eligibleForHoldingComparison: eligible && period.holdingComplete,
    ratios: { volumePerPointUsd: eligible ? finite(volume / count) : null,
      netFeesPerPointUsd: eligible && period.feesComplete ? finite(Number(summary!.netFeesUsd) / count) : null,
      pointsPer10kVolume: eligible && volume > 0 ? finite(count / volume * 10_000) : null,
      makerSharePercent: summary && volume > 0 ? finite(Number(summary.makerVolumeUsd) / volume * 100) : null } };
}
const emptyRatios: ResearchPeriod["ratios"] = { volumePerPointUsd: null, netFeesPerPointUsd: null, pointsPer10kVolume: null, makerSharePercent: null };
function baseWallet(project: ResearchWallet["project"], address: string, fetchedAt: string): Pick<ResearchWallet, "schemaVersion" | "project" | "address" | "firstSeenAt" | "updatedAt" | "consent"> {
  return { schemaVersion: RESEARCH_VERSION, project, address: address.toLowerCase(), firstSeenAt: fetchedAt, updatedAt: fetchedAt,
    consent: { version: RESEARCH_CONSENT, acceptedAt: fetchedAt } };
}

export function arcusResearch(report: WalletReport, name: string, points: PointWeek[]): ResearchWallet {
  const periods: ResearchWallet["periods"] = {};
  for (const week of report.weekly.weeks) {
    const reward = points.find(row => row.week === week.index && Date.parse(row.distributed_at) === Date.parse(week.end));
    const fills = report.fills.filter(fill => fill.createdAtMicros >= Date.parse(week.start) * 1000 && fill.createdAtMicros < Date.parse(week.end) * 1000 && fill.createdAtMicros <= Date.parse(week.cutoff) * 1000);
    const markets = new Map<string, typeof fills>();
    for (const fill of fills) {
      const rows = markets.get(fill.market) ?? [];
      rows.push(fill); markets.set(fill.market, rows);
    }
    const id = `s1-week-${week.index}`;
    periods[id] = withResearchRatios({ id, label: week.label, season: "S1", start: week.start, end: week.end,
      observedThrough: week.cutoff, observedAt: report.fetchedAt, periodComplete: week.status === "completed",
      fullCoverage: report.accountScope === "all" && !week.partialPeriod, fillsComplete: report.scan.complete,
      feesComplete: report.scan.complete, holdingComplete: report.weekly.status === "complete" && !week.buckets.some(bucket => bucket.id === "unknown" && Number(bucket.volumeUsd) > 0),
      points: { value: reward?.earned_points == null ? null : String(reward.earned_points), source: "arcus_snapshot", status: reward?.status ?? "missing",
        distributionAt: reward?.distributed_at ?? null, observedAt: report.fetchedAt },
      summary: { fills: week.fillCount, volumeUsd: week.volumeUsd, feesPaidUsd: week.feesPaidUsd, rebatesUsd: week.rebatesUsd, netFeesUsd: week.netFeesUsd,
        makerVolumeUsd: decimalSum(fills.filter(fill => fill.role === "MAKER").map(fill => fill.notionalUsd)),
        takerVolumeUsd: decimalSum(fills.filter(fill => fill.role === "TAKER").map(fill => fill.notionalUsd)), unknownRoleVolumeUsd: "0", realizedPnlUsd: null },
      holding: { method: "FIFO", averageClosedHoldHours: week.averageClosedHoldHours, heldAtLeast12hUsd: week.heldAtLeast12hUsd,
        buckets: week.buckets.map(bucket => ({ id: bucket.id, volumeUsd: bucket.volumeUsd, sharePercent: bucket.sharePercent })) },
      markets: [...markets].map(([market, rows]) => {
        const volumeUsd = decimalSum(rows.map(fill => fill.notionalUsd));
        // Fees may be negative rebates; avoid converting the stored exact totals through Number.
        const netFeesUsd = signedDecimalSum(rows.map(fill => fill.feeUsd));
        return { market, volumeUsd, netFeesUsd, fills: rows.length, makerSharePercent: Number(volumeUsd) > 0 ? Number(decimalSum(rows.filter(fill => fill.role === "MAKER").map(fill => fill.notionalUsd))) / Number(volumeUsd) * 100 : 0 };
      }), fundingNetReceivedUsd: null, fundingComplete: false, eligibleForPointsComparison: false, eligibleForHoldingComparison: false, ratios: emptyRatios });
  }
  return { ...baseWallet("arcus", report.address, report.fetchedAt), profile: name ? { name, walletLink: "user_supplied_unverified" } : null,
    latestScan: { fetchedAt: report.fetchedAt, from: report.range.from, to: report.range.to, scope: String(report.accountScope), complete: report.scan.complete,
      summary: report.summary ? arcusSummary(report.summary) : null }, periods };
}
function signedDecimalSum(values: string[]) {
  const positive = decimalSum(values.filter(value => !value.startsWith("-")));
  const negative = decimalSum(values.filter(value => value.startsWith("-")).map(value => value.slice(1)));
  const atoms = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * BigInt(1_000_000_000) + BigInt(fraction.padEnd(9, "0")); };
  const difference = atoms(positive) - atoms(negative), absolute = difference < BigInt(0) ? -difference : difference;
  const fraction = (absolute % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
  return `${difference < BigInt(0) ? "-" : ""}${absolute / BigInt(1_000_000_000)}${fraction ? `.${fraction}` : ""}`;
}
export function txflowResearch(report: TxWalletReport, points: Record<string, string>, totalPoints: string | null = null,
  metadata: Record<string, { end: string; distribution: string }> = {}): ResearchWallet {
  const periods: ResearchWallet["periods"] = {};
  for (const epoch of report.epochs) {
    const id = epoch.id === "S0" ? "s0" : `s1-${epoch.id.toLowerCase().replace("_", "-")}`;
    const coverage = report.windows.some(window => (epoch.range.from === null ? window.from === null : window.from === null || Date.parse(window.from) <= Date.parse(epoch.range.from)) && Date.parse(window.to) >= Date.parse(epoch.range.to));
    periods[id] = withResearchRatios({ id, label: epoch.label, season: epoch.id === "S0" ? "S0" : "S1", start: epoch.range.from, end: metadata[epoch.id]?.end ?? epoch.range.to,
      observedThrough: epoch.range.to, observedAt: report.fetchedAt, periodComplete: epoch.completed, fullCoverage: coverage,
      fillsComplete: report.fillsScan.status === "complete", feesComplete: report.fillsScan.status === "complete" && epoch.summary?.excludedFeeTokens.length === 0,
      holdingComplete: epoch.holding.status === "complete" && !epoch.holding.buckets.some(bucket => bucket.id === "unknown" && Number(bucket.volume) > 0),
      points: { value: points[epoch.id] ?? null, source: "manual", status: points[epoch.id] === undefined ? "missing" : "manual", distributionAt: metadata[epoch.id]?.distribution ?? null, observedAt: report.fetchedAt },
      summary: epoch.summary ? txSummary(epoch.summary) : null,
      holding: { method: "FIFO", averageClosedHoldHours: epoch.holding.averageClosedHoldHours, heldAtLeast12hUsd: epoch.holding.heldAtLeast12h,
        buckets: epoch.holding.buckets.map(bucket => ({ id: bucket.id, volumeUsd: bucket.volume, sharePercent: bucket.sharePercent })) },
      markets: epoch.markets.map(market => ({ market: market.market, volumeUsd: market.volume, netFeesUsd: market.netFees, fills: market.fills,
        makerSharePercent: Number(market.volume) > 0 ? Number(market.makerVolume) / Number(market.volume) * 100 : 0 })),
      fundingNetReceivedUsd: epoch.funding?.net ?? null, fundingComplete: report.fundingScan.status === "complete",
      eligibleForPointsComparison: false, eligibleForHoldingComparison: false, ratios: emptyRatios });
  }
  return { ...baseWallet("txflow", report.address, report.fetchedAt), profile: null,
    latestScan: { fetchedAt: report.fetchedAt, from: report.range.from, to: report.range.to, scope: report.period, complete: report.fillsScan.status === "complete",
      summary: report.summary ? txSummary(report.summary) : null,
      submittedTotalPoints: totalPoints === null ? null : { value: totalPoints, source: "manual", attribution: "selected_scan_only" } }, periods };
}

export function mergeResearchWallet(previous: ResearchWallet | null, incoming: ResearchWallet): ResearchWallet {
  if (!previous) return incoming;
  if (previous.project !== incoming.project || previous.address !== incoming.address) throw new Error("Cannot merge different research wallets.");
  const newer = Date.parse(incoming.updatedAt) >= Date.parse(previous.updatedAt);
  const sameProfile = !incoming.profile || previous.profile?.name.toLowerCase() === incoming.profile.name.toLowerCase();
  const result = { ...previous, ...(newer ? incoming : {}), profile: newer ? incoming.profile ?? previous.profile : previous.profile,
    firstSeenAt: previous.firstSeenAt, periods: { ...previous.periods } };
  const quality = (period: ResearchPeriod) => Number(period.fullCoverage) * 16 + Number(period.fillsComplete) * 8 + Number(period.periodComplete) * 4 + Number(period.feesComplete) * 2 + Number(period.holdingComplete);
  // A change to the claimed Arcus name must never inherit another profile's points.
  if (newer && !sameProfile) for (const [id, period] of Object.entries(result.periods)) {
    result.periods[id] = withResearchRatios({ ...period, points: { ...period.points, value: null, status: "missing", observedAt: incoming.updatedAt } });
  }
  for (const [id, next] of Object.entries(incoming.periods)) {
    const old = result.periods[id];
    if (!old) {
      result.periods[id] = !newer && !sameProfile ? withResearchRatios({ ...next, points: { ...next.points, value: null, status: "missing" } }) : next;
      continue;
    }
    const preferNext = quality(next) > quality(old) || (quality(next) === quality(old) && Date.parse(next.observedAt) >= Date.parse(old.observedAt));
    const trade = preferNext ? next : old;
    // Unknown points from a later empty input never erase previously supplied values.
    const reward = !newer && !sameProfile ? old.points : newer && !sameProfile ? next.points
      : next.points.value !== null && Date.parse(next.points.observedAt) >= Date.parse(old.points.observedAt) ? next.points : old.points;
    const keepFunding = old.fundingComplete && !next.fundingComplete && old.start === next.start && old.end === next.end;
    result.periods[id] = withResearchRatios({ ...trade, points: reward,
      ...(keepFunding ? { fundingComplete: true, fundingNetReceivedUsd: old.fundingNetReceivedUsd } : {}) });
  }
  return result;
}
