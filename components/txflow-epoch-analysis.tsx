"use client";

import EpochActivityCard from "@/components/epoch-activity-card";
import styles from "@/components/epoch-activity-card.module.css";
import TxflowHolding from "@/components/txflow-holding";
import TxflowExecutionProfile from "@/components/txflow-execution-profile";
import { parsePoints } from "@/lib/estimator";
import { TXFLOW_EPOCHS, txflowEpochDistributed, type TxflowEpochId, type TxflowReportEpochId, type TxWalletReport } from "@/lib/txflow-wallet";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const preciseUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (value: string | number | null | undefined) => value == null ? "—" : usd.format(Number(value));

export default function TxflowEpochAnalysis({ report, points, received, selectedId, now, onSelect, onPoints, onReceived }: {
  report: TxWalletReport; points: Record<string, string>; received: TxflowEpochId[]; selectedId: TxflowReportEpochId;
  now: number; onSelect: (id: TxflowReportEpochId) => void; onPoints: (id: TxflowReportEpochId, value: string) => void;
  onReceived: (id: TxflowEpochId, value: boolean) => void;
}) {
  const epochs = report.currentEpoch ? [...report.epochs, report.currentEpoch] : report.epochs;
  const selected = epochs.find(epoch => epoch.id === selectedId);
  if (!selected) return null;
  const currentSelected = selected === report.currentEpoch;
  const inputFor = (id: TxflowReportEpochId) => points[`${report.address}:${id}`] ?? "";
  const valueFor = (id: TxflowReportEpochId) => report.currentEpoch?.id === id ? null : parsePoints(inputFor(id));
  const maxVolume = Math.max(1, ...epochs.map(epoch => Number(epoch.summary?.volume ?? 0)));
  const maxPoints = Math.max(1, ...epochs.map(epoch => parsePoints(inputFor(epoch.id)) ?? 0));
  const hasReceived = (id: TxflowReportEpochId) => received.some(epochId => epochId === id);
  const count = valueFor(selected.id), summary = selected.summary;
  const comparable = report.fillsScan.status === "complete" && count !== null && count > 0;
  const feesComparable = comparable && summary?.excludedFeeTokens.length === 0;
  return <section className="tf-epoch-analysis tf-panel" aria-labelledby="tf-epochs-heading">
    <div className="tf-wallet-section-title"><div><span className="tf-eyebrow">EPOCH COMPARISON / MATCHED ACTIVITY</span><h2 id="tf-epochs-heading">Epoch analysis</h2></div></div>
    <p className="tf-help">Choose an epoch to see its trading activity. Enter points directly on its card.</p>
    <div className={`tf-epoch-cards ${styles.grid}`} role="group" aria-label="Select an epoch">{epochs.map(epoch => {
      const awarded = hasReceived(epoch.id);
      const known = Object.hasOwn(TXFLOW_EPOCHS, epoch.id) ? epoch.id as TxflowEpochId : null;
      const status = !epoch.completed ? "In progress" : awarded ? "Completed" : "Awaiting drop";
      const distribution = known ? shortDate.format(new Date(TXFLOW_EPOCHS[known].distribution)) : "Pending";
      return <EpochActivityCard key={epoch.id} label={epoch.label} status={status} dates={epoch.dates}
        distribution={distribution} selected={selected.id === epoch.id} points={inputFor(epoch.id)}
        placeholder={awarded ? "Enter points" : "Pending"} volume={epoch.summary?.volume}
        maxPoints={maxPoints} maxVolume={maxVolume} maxLength={100}
        onSelect={() => onSelect(epoch.id)} onPoints={value => onPoints(epoch.id, value)}>
        {known && epoch.completed && !txflowEpochDistributed(known, now) && <label className="tf-receipt-toggle">
          <input type="checkbox" checked={awarded} onChange={event => onReceived(known, event.target.checked)} />Points received
        </label>}
      </EpochActivityCard>;
    })}</div>
    <div className="tf-epoch-selected-heading"><div><span className="tf-eyebrow">SELECTED EPOCH</span><h3>{selected.label}</h3><p className="tf-help">{selected.dates} · UTC · {selected.completed ? "Snapshot window complete" : "Snapshot window in progress"}</p></div><span className="tf-readonly">{summary?.fills ?? "—"} FILLS</span></div>
    <div className="tf-epoch-scorecard"><div><span>Trading volume</span><strong>{money(summary?.volume)}</strong></div><div><span>Epoch points</span><strong>{count === null ? hasReceived(selected.id) ? "—" : "Pending" : number.format(count)}</strong></div><div><span>Volume / point</span><strong>{comparable && summary ? money(Number(summary.volume) / count!) : "—"}</strong></div><div><span>Net fees / point</span><strong>{feesComparable && summary ? preciseUsd.format(Number(summary.netFees) / count!) : "—"}</strong></div></div>
    {currentSelected ? <p className="tf-help">Activity through the scan time · Realized PnL {money(summary?.closedPnl)} · Net funding {money(selected.funding?.net)}</p>
      : !comparable ? <p className="tf-help">{hasReceived(selected.id) ? "Enter points on the epoch card. Ratios need positive points and complete fill history." : "Enter points on the epoch card to calculate ratios while distribution is pending."}</p>
      : !hasReceived(selected.id) && <p className="tf-help">Manual comparison · distribution pending. Ratios use your entered points and trades through this scan's cutoff.</p>}
    <section className="tf-epoch-execution" aria-label={`Execution breakdown for ${selected.label}`}><h3>Maker &amp; taker · {selected.label}</h3><TxflowExecutionProfile summary={summary} complete={report.fillsScan.status === "complete"} /></section>
    <TxflowHolding analysis={selected.holding} />
    <div className="tf-epoch-markets"><h3>Markets in {selected.label}</h3>{selected.markets.length ? selected.markets.slice(0, 5).map(market => <div key={market.market}><span>{market.market}<small>{market.fills} fills · {money(market.netFees)} net fees</small></span><strong>{money(market.volume)}</strong></div>) : <p className="tf-help">{summary === null ? "Trading history unavailable." : "No executions in this epoch."}</p>}</div>
  </section>;
}
