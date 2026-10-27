import type { TxSummary } from "@/lib/txflow-wallet";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const volumeFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const shareFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default function TxflowExecutionProfile({ summary, complete }: { summary: TxSummary | null; complete: boolean }) {
  const total = Number(summary?.volume ?? 0);
  const rows = [
    { id: "maker" as const, label: "Maker", volume: summary?.makerVolume },
    { id: "taker" as const, label: "Taker", volume: summary?.takerVolume },
    ...(Number(summary?.unknownRoleVolume ?? 0) > 0 ? [{ id: "unknown" as const, label: "Unclassified", volume: summary?.unknownRoleVolume }] : []),
  ];
  return <div className="tf-execution-profile">
    <div className="tf-liquidity-bar" aria-hidden="true">{rows.map(row => <span key={row.id} className={`tf-role-${row.id}`} style={{ width: `${total > 0 ? Number(row.volume ?? 0) / total * 100 : 0}%` }} />)}</div>
    <div className="tf-execution-grid">{rows.map(row => {
      const fees = summary?.feesByRole?.[row.id];
      return <article className="tf-execution-role" key={row.id} aria-label={`${row.label} trading activity`}>
        <div className="tf-execution-role-heading"><h4><i className={`tf-role-${row.id}`} aria-hidden="true" />{row.label}</h4><span>{summary && total > 0 ? `${shareFormat.format(Number(row.volume ?? 0) / total * 100)}% of volume` : "—"}</span></div>
        <dl><div><dt>Volume</dt><dd>{row.volume === undefined ? "—" : volumeFormat.format(Number(row.volume))}</dd></div>
          <div><dt>Fees paid</dt><dd>{fees ? usd.format(Number(fees.paid)) : "—"}</dd></div>
          <div><dt>Rebates</dt><dd>{fees ? usd.format(Number(fees.rebates)) : "—"}</dd></div>
          <div><dt>Net fees</dt><dd>{fees ? usd.format(Number(fees.net)) : "—"}</dd></div></dl>
      </article>;
    })}</div>
    <p className="tf-help">USDC fill fees by execution role · net fees = paid fees − rebates. Funding is separate.{!complete && " Partial history: totals cover loaded fills only."}{Boolean(summary?.excludedFeeTokens.length) && " Fees in other tokens are excluded."}{summary && !summary.feesByRole && " Run Analyze again to load fees by role."}</p>
  </div>;
}
