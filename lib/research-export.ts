import type { ResearchWallet } from "./research-data";

const buckets = ["under1h", "oneTo2h", "twoTo12h", "over12h", "openUnder12h", "openOver12h", "unknown"];
function csv(value: unknown) {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop a user-supplied nickname becoming a spreadsheet formula.
  if (/^[\s]*[=+@-]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function researchCsv(wallets: ResearchWallet[]) {
  const headers = ["schema_version", "project", "wallet", "arcus_name", "wallet_link_verified", "period_id", "season", "start_utc", "end_utc", "observed_through_utc", "observed_at_utc",
    "period_complete", "full_coverage", "fills_complete", "fees_complete", "holding_complete", "comparable", "holding_comparable",
    "points", "points_source", "points_status", "points_observed_at_utc", "volume_usd", "net_fees_usd", "fees_paid_usd", "rebates_usd", "fills",
    "maker_volume_usd", "taker_volume_usd", "unknown_role_volume_usd", ...["maker", "taker", "unknown"].flatMap(role => [`${role}_fees_paid_usd`, `${role}_rebates_usd`, `${role}_net_fees_usd`]), "maker_share_pct", "volume_per_point_usd", "net_fees_per_point_usd", "points_per_10k_volume",
    "average_closed_hold_hours", "held_12h_plus_volume_usd", "realized_pnl_usd", "funding_net_received_usd", "funding_complete", ...buckets.flatMap(id => [`${id}_volume_usd`, `${id}_share_pct`]), "markets_json"];
  const rows = wallets.flatMap(wallet => Object.values(wallet.periods).map(period => {
    const summary = period.summary;
    return [wallet.schemaVersion, wallet.project, wallet.address, wallet.profile?.name, false, period.id, period.season, period.start, period.end, period.observedThrough, period.observedAt,
      period.periodComplete, period.fullCoverage, period.fillsComplete, period.feesComplete, period.holdingComplete, period.eligibleForPointsComparison, period.eligibleForHoldingComparison,
      period.points.value, period.points.source, period.points.status, period.points.observedAt, summary?.volumeUsd, summary?.netFeesUsd, summary?.feesPaidUsd, summary?.rebatesUsd, summary?.fills,
      summary?.makerVolumeUsd, summary?.takerVolumeUsd, summary?.unknownRoleVolumeUsd,
      ...(["maker", "taker", "unknown"] as const).flatMap(role => { const fees = summary?.feesByRole?.[role]; return [fees?.paidUsd, fees?.rebatesUsd, fees?.netUsd]; }),
      period.ratios.makerSharePercent, period.ratios.volumePerPointUsd, period.ratios.netFeesPerPointUsd, period.ratios.pointsPer10kVolume,
      period.holding.averageClosedHoldHours, period.holding.heldAtLeast12hUsd, summary?.realizedPnlUsd, period.fundingNetReceivedUsd, period.fundingComplete,
      ...buckets.flatMap(id => { const bucket = period.holding.buckets.find(value => value.id === id); return [bucket?.volumeUsd, bucket?.sharePercent]; }), JSON.stringify(period.markets)];
  }));
  return [headers, ...rows].map(row => row.map(csv).join(",")).join("\r\n") + "\r\n";
}
