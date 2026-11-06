import { useState } from "react";
import EpochActivityCard from "@/components/epoch-activity-card";
import styles from "@/components/epoch-activity-card.module.css";
import { parsePoints } from "@/lib/estimator";
import type { RisexEpoch } from "@/lib/risex-epochs";
import type { RisexReport } from "@/lib/risex-wallet";

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const statuses: Record<RisexEpoch["status"], string> = {
  upcoming: "Upcoming", "in-progress": "In progress", "awaiting-drop": "Awaiting drop", completed: "Completed",
};

export function risexEpochStatus(status: RisexEpoch["status"]) {
  return statuses[status];
}

export default function RisexEpochCards({ epochs, selected, points, onSelect, onPoints }: {
  epochs: RisexReport["epochs"]; selected: string; points: Record<string, string>; onSelect: (id: string) => void;
  onPoints: (id: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const recent = new Set([epochs[0]?.id, ...epochs.slice(-4).map(epoch => epoch.id), selected]);
  const hiddenCount = epochs.filter(epoch => !recent.has(epoch.id)).length;
  const maxVolume = Math.max(1, ...epochs.map(epoch => Number(epoch.activity?.summary?.volume ?? 0)));
  const maxPoints = Math.max(1, ...epochs.map(epoch => parsePoints(points[epoch.id] ?? "") ?? 0));

  return <section className="rx-panel" aria-labelledby="rx-epochs-heading">
    <div className="rx-epochs-heading">
      <div>
        <p className="rx-eyebrow">02 / DISTRIBUTION WINDOWS</p>
        <h2 id="rx-epochs-heading">Trading and points by epoch</h2>
        <p className="rx-wallet-help">Select an epoch to review its trades. Enter points directly on its card.</p>
      </div>
      {hiddenCount > 0 && <button type="button" className="rx-epoch-toggle" aria-expanded={expanded} aria-controls="rx-epoch-cards"
        onClick={() => setExpanded(value => !value)}>{expanded ? "Show recent epochs" : `Show all ${epochs.length} epochs`}</button>}
    </div>
    <div className={`rx-epoch-grid ${styles.grid}`} id="rx-epoch-cards" role="group" aria-label="Select a points epoch">
      {epochs.filter(epoch => expanded || recent.has(epoch.id)).map(epoch => {
        const activityDates = epoch.from === null ? "Before 20 Jul · ~12 weeks" : shortDate.formatRange(epoch.from, epoch.to - 1);
        return <EpochActivityCard key={epoch.id} label={epoch.label} status={risexEpochStatus(epoch.status)}
          dates={activityDates} distribution={shortDate.format(epoch.distribution)} selected={selected === epoch.id}
          points={points[epoch.id] ?? ""} placeholder={epoch.status === "completed" ? "Enter points" : "Pending"}
          volume={epoch.activity?.summary?.volume} maxPoints={maxPoints} maxVolume={maxVolume}
          onSelect={() => onSelect(epoch.id)} onPoints={value => onPoints(epoch.id, value)} />;
      })}
    </div>
  </section>;
}
