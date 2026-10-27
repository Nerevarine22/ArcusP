"use client";

import TxflowHolding from "@/components/txflow-holding";
import TxflowExecutionProfile from "@/components/txflow-execution-profile";
import { parsePoints } from "@/lib/estimator";
import type { TxflowEpochId, TxWalletReport } from "@/lib/txflow-wallet";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const preciseUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const money = (value: string | number | null | undefined) => value == null ? "—" : usd.format(Number(value));

export default function TxflowEpochAnalysis({ report, points, received, selectedId, onSelect }: { report: TxWalletReport; points: Record<string, string>; received: TxflowEpochId[]; selectedId: TxflowEpochId; onSelect: (id: TxflowEpochId) => void }) {
  const epochs = report.epochs ?? [];
  const selected = epochs.find(epoch => epoch.id === selectedId);
  if (!selected) return null;
  const valueFor = (id: TxflowEpochId) => parsePoints(points[`${report.address}:${id}`] ?? "");
  const count = valueFor(selected.id), summary = selected.summary;
  const comparable = report.fillsScan.status === "complete" && count !== null && count > 0;
  const feesComparable = comparable && summary?.excludedFeeTokens.length === 0;
  return <section className="tf-epoch-analysis tf-panel" aria-labelledby="tf-epochs-heading">
    <div className="tf-wallet-section-title"><div><span className="tf-eyebrow">EPOCH COMPARISON / MATCHED ACTIVITY</span><h2 id="tf-epochs-heading">Epoch analysis</h2></div></div><p className="tf-help">Choose an epoch to see its volume, fees, points and holding profile. Points entered above stay attached to that epoch.</p>
    <div className="tf-epoch-cards" role="group" aria-label="Select an epoch">{epochs.map(epoch => {
      const count = valueFor(epoch.id), awarded = received.includes(epoch.id);
      return <button type="button" className="tf-epoch-card" key={epoch.id} aria-label={`Analyze ${epoch.label}`} aria-pressed={selected.id === epoch.id} onClick={() => onSelect(epoch.id)}><span className="tf-epoch-card-top"><b>{epoch.label}</b><small>{awarded ? "Points received" : count !== null ? "Manual points" : "Points pending"}</small></span><span className="tf-epoch-card-dates">{epoch.dates}</span><strong>{count === null ? awarded ? "Enter points" : "Pending" : `${number.format(count)} PTS`}</strong><span>Volume <b>{money(epoch.summary?.volume)}</b></span><span>Net fees <b>{money(epoch.summary?.netFees)}</b></span></button>;
    })}</div>
    <div className="tf-epoch-selected-heading"><div><span className="tf-eyebrow">SELECTED EPOCH</span><h3>{selected.label}</h3><p className="tf-help">{selected.dates} · UTC · {selected.completed ? "Snapshot window complete" : "Snapshot window in progress"}</p></div><span className="tf-readonly">{summary?.fills ?? "—"} FILLS</span></div>
    <div className="tf-epoch-scorecard"><div><span>Trading volume</span><strong>{money(summary?.volume)}</strong></div><div><span>Epoch points</span><strong>{count === null ? received.includes(selected.id) ? "—" : "Pending" : number.format(count)}</strong></div><div><span>Volume / point</span><strong>{comparable && summary ? money(Number(summary.volume) / count!) : "—"}</strong></div><div><span>Net fees / point</span><strong>{feesComparable && summary ? preciseUsd.format(Number(summary.netFees) / count!) : "—"}</strong></div></div>
    {!comparable && <p className="tf-help">{received.includes(selected.id) ? "Enter this epoch's points above. Ratios need positive points and complete fill history." : "Enter manual points above to calculate ratios, even while distribution is pending."}</p>}
    {comparable && !received.includes(selected.id) && <p className="tf-help">Manual comparison · distribution pending. Ratios use your entered points and trades through this scan's cutoff.</p>}
    <section className="tf-epoch-execution" aria-label={`Execution breakdown for ${selected.label}`}><h3>Maker &amp; taker · {selected.label}</h3><TxflowExecutionProfile summary={summary} complete={report.fillsScan.status === "complete"} /></section>
    <TxflowHolding analysis={selected.holding} />
    <div className="tf-epoch-markets"><h3>Markets in {selected.label}</h3>{selected.markets.length ? selected.markets.slice(0, 5).map(market => <div key={market.market}><span>{market.market}<small>{market.fills} fills · {money(market.netFees)} net fees</small></span><strong>{money(market.volume)}</strong></div>) : <p className="tf-help">{summary === null ? "Trading history unavailable." : "No executions in this epoch."}</p>}</div>
  </section>;
}
