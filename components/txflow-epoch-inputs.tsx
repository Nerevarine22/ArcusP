"use client";

import { TXFLOW_EPOCHS, txflowReceivedEpochs, type TxflowEpochId, type TxflowPeriod, type TxflowWalletSettings } from "@/lib/txflow-wallet";
import { parsePoints } from "@/lib/estimator";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const snapshotFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default function TxflowEpochInputs({ settings, address, now, onPoints, onReceived }: {
  settings: TxflowWalletSettings; address: string; now: number;
  onPoints: (id: string, value: string) => void; onReceived: (id: TxflowEpochId, value: boolean) => void;
}) {
  const period: TxflowPeriod = settings.period;
  const ids: TxflowEpochId[] = period === "AWARDED" ? txflowReceivedEpochs(settings, address, now) : period === "S1" ? ["EPOCH_1", "EPOCH_2"] : Object.hasOwn(TXFLOW_EPOCHS, period) ? [period as TxflowEpochId]
    : period === "ALLTIME" ? ["S0", "EPOCH_1", "EPOCH_2"] : [];
  const aggregateInput = ids.length === 0 && period !== "AWARDED" && period !== "ALLTIME";
  const input = (id: string, label: string) => {
    const value = settings.points[`${address}:${id}`] ?? "", invalid = Boolean(value.trim() && parsePoints(value) === null);
    return <div className="tf-input-group"><label htmlFor={`tf-points-${id}`}>{label}<span>MANUAL</span></label><input id={`tf-points-${id}`} inputMode="decimal" autoComplete="off" maxLength={100} value={value} onChange={event => onPoints(id, event.target.value)} aria-invalid={invalid} aria-describedby={invalid ? `tf-points-error-${id}` : undefined} />{invalid && <p className="tf-error" id={`tf-points-error-${id}`}>Enter a number of points, zero or greater.</p>}</div>;
  };
  return <div className="tf-epoch-inputs">
    {aggregateInput && <div className="tf-aggregate-points">{input(period, "Points for this trade period")}</div>}
    {ids.length > 0 && <><div className="tf-epoch-input-heading"><span className="tf-eyebrow">{period === "AWARDED" ? "INCLUDED DISTRIBUTIONS" : "POINTS BY EPOCH"}</span><p>{period === "AWARDED" ? "Enter points for each included epoch. The combined analysis uses their sum once every epoch is filled." : "Enter points for any epoch to calculate its ratios, including distributions still pending."}</p></div>
      <div className={`tf-epoch-input-grid${ids.length === 2 ? " has-two" : ""}`}>{ids.map(id => {
        const epoch = TXFLOW_EPOCHS[id], received = epoch.distributed || settings.received[`${address}:${id}`] === true;
        const completed = now >= Date.parse(epoch.end), canReceive = epoch.distributed || completed;
        const distributionDate = dateFormat.format(new Date(`${epoch.distribution}T00:00:00Z`));
        const snapshotDate = new Date(Date.parse(epoch.end) - 1);
        return <div className={`tf-epoch-input-card${received ? " is-received" : ""}`} key={id}><div className="tf-epoch-input-title"><strong>{epoch.label}</strong><span>{epoch.dates}</span></div>
          {epoch.distributed ? <p className="tf-epoch-distributed">Distributed {distributionDate}</p> : <label className="tf-receipt-toggle"><input type="checkbox" checked={received} disabled={!canReceive} onChange={event => onReceived(id, event.target.checked)} />Points received · {distributionDate}</label>}
          <p className="tf-help">Snapshot: <time dateTime={snapshotDate.toISOString()}>{snapshotFormat.format(snapshotDate)} UTC</time></p>
          {!epoch.distributed && received && <p className="tf-help">Receipt confirmed by you</p>}
          {input(id, "Points for this epoch")}
        </div>;
      })}</div></>}
  </div>;
}
