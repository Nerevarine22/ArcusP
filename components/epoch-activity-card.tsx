import { useId, type ReactNode } from "react";
import { parsePoints } from "@/lib/estimator";
import styles from "./epoch-activity-card.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

export default function EpochActivityCard({
  label, status, dates, distribution, selected, points, placeholder, volume, maxPoints, maxVolume,
  maxLength = 32, onSelect, onPoints, children,
}: {
  label: string; status: string; dates: string; distribution: string; selected: boolean;
  points: string; placeholder: string; volume?: string | null; maxPoints: number; maxVolume: number; maxLength?: number;
  onSelect: () => void; onPoints: (value: string) => void; children?: ReactNode;
}) {
  const errorId = useId();
  const entered = parsePoints(points);
  const invalid = points.trim() !== "" && entered === null;

  return <div className={`${styles.card}${selected ? ` ${styles.selected}` : ""}`}>
    <span className={styles.top}>
      <button type="button" className={styles.select} aria-label={`Select ${label}`} aria-pressed={selected} onClick={onSelect}>{label}</button>
      <small>{status}</small>
    </span>
    <span className={styles.dates}>{dates}<br />Drop · {distribution}</span>
    <label className={styles.points}>
      <span className="sr-only">{label} points on card</span>
      <input value={points} onChange={event => onPoints(event.target.value)} inputMode="decimal"
        placeholder={placeholder} autoComplete="off" maxLength={maxLength}
        aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} />
      <span aria-hidden="true">PTS</span>
    </label>
    {invalid && <span id={errorId} className="sr-only">Enter a non-negative points amount.</span>}
    <span className={`${styles.track} ${styles.pointsTrack}`} aria-hidden="true"><i style={{ width: `${(entered ?? 0) / maxPoints * 100}%` }} /></span>
    <span className={styles.stat}><span>Volume</span><b>{volume == null ? "—" : money.format(Number(volume))}</b></span>
    <span className={styles.track} aria-hidden="true"><i style={{ width: `${Number(volume ?? 0) / maxVolume * 100}%` }} /></span>
    {children}
  </div>;
}
