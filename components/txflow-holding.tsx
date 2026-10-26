import type { TxHoldingAnalysis, TxHoldingBucket } from "@/lib/txflow-wallet";
import { useId } from "react";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const colors: Record<TxHoldingBucket, string> = { under1h: "#bcdd84", oneTo2h: "#8df885", twoTo12h: "#56b985", over12h: "#3e9274", openUnder12h: "#9eac99", openOver12h: "#6d8f51", unknown: "#c09b77" };

export default function TxflowHolding({ analysis }: { analysis: TxHoldingAnalysis | undefined }) {
  const titleId = useId();
  const available = analysis && analysis.status !== "incomplete";
  const unknown = analysis?.buckets.find(bucket => bucket.id === "unknown");
  const money = (value: string | undefined) => value === undefined ? "—" : usd.format(Number(value));
  function rows(items: NonNullable<typeof analysis>["buckets"]) {
    return <ul className="tf-holding-rows">{items.map(bucket => <li key={bucket.id}><div><i style={{ background: colors[bucket.id] }} aria-hidden="true" /><span>{bucket.label}</span></div><strong>{money(bucket.volume)}<small>{number.format(bucket.sharePercent)}%</small></strong></li>)}</ul>;
  }
  return <section className="tf-wallet-card tf-panel tf-holding" aria-labelledby={titleId}>
    <div className="tf-wallet-section-title"><div><span className="tf-eyebrow">HOLDING PROFILE / SELECTED PERIOD</span><h2 id={titleId}>How long you held</h2></div><span className="tf-readonly">FIFO · {available ? analysis.status === "complete" ? "RECONSTRUCTED" : "SOME TIMES UNKNOWN" : "HISTORY NEEDED"}</span></div>
    {available ? <>
      <div className="tf-holding-stats"><div><span>Held 12h+ volume</span><strong>{money(analysis.heldAtLeast12h)}</strong><small>Including entries still open at cutoff</small></div><div><span>Avg. matched closed hold</span><strong>{analysis.averageClosedHoldHours === null ? "—" : `${number.format(analysis.averageClosedHoldHours)}h`}</strong><small>Weighted by matched execution volume</small></div><div><span>Unknown opening history</span><strong>{money(unknown?.volume)}</strong><small>Not assigned an estimated duration</small></div></div>
      <div className="tf-holding-stack" role="img" aria-label="Executed volume by holding duration">{analysis.buckets.filter(bucket => Number(bucket.volume) > 0).map(bucket => <span key={bucket.id} style={{ flexGrow: bucket.sharePercent, background: colors[bucket.id] }} title={`${bucket.label}: ${money(bucket.volume)} (${number.format(bucket.sharePercent)}%)`} />)}</div>
      <div className="tf-holding-groups"><div><h3>Closed executions</h3>{rows(analysis.buckets.slice(0, 4))}</div><div><h3>Open at cutoff / unknown</h3>{rows(analysis.buckets.slice(4))}</div></div>
      <p className="tf-help">Open entries are aged at {date.format(new Date(analysis.asOf))} UTC. A close after this cutoff does not change this period’s holding mix.</p>
    </> : <p className="tf-help">{analysis?.notes[0] ?? "Analyze the wallet again to load holding-time reconstruction."}</p>}
    {available && analysis.notes.length > 0 && <div className="tf-holding-notes" role="status">{analysis.notes.map((note, index) => <p key={index}>{note}</p>)}</div>}
    <p className="tf-help tf-holding-method">FIFO matches the earliest open quantity first, including partial closes and direction changes. Entry and exit volume stay in the period they executed and are counted once. Earlier fills establish opening times; gaps remain unknown. Holding for 12h is a descriptive category, not an official points multiplier.</p>
  </section>;
}
