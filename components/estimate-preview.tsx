"use client";

import { useEffect, useRef, useState } from "react";
import { estimate } from "@/lib/estimator";

const introStorageKey = "arcus-estimate-intro-seen";
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const money = (value: number | undefined) => value === undefined ? "—" : usd.format(value);

type Props = {
  demo: boolean;
  points: number | null;
  totalPoints: number | null;
  fdv: number;
  fdvLabel: string;
  allocation: number;
  pointLabel: string;
  sourceLabel: string;
};

export default function EstimatePreview({ demo, points, totalPoints, fdv, fdvLabel, allocation, pointLabel, sourceLabel }: Props) {
  const [exampleValue, setExampleValue] = useState(0);
  const firstVisit = useRef<boolean | null>(null);

  useEffect(() => {
    if (!demo) { firstVisit.current = false; setExampleValue(0); return; }
    if (firstVisit.current === null) {
      try { firstVisit.current = !localStorage.getItem(introStorageKey); }
      catch { firstVisit.current = true; }
    }
    if (!firstVisit.current) return;
    try { localStorage.setItem(introStorageKey, "1"); } catch { /* Show once per page if storage is disabled. */ }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let next: ReturnType<typeof setTimeout> | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;
    function finish() {
      clearTimeout(next);
      clearTimeout(end);
      firstVisit.current = false;
      setExampleValue(0);
    }
    function motionChanged() { if (reducedMotion.matches) finish(); }
    if (reducedMotion.matches) finish();
    else {
      // Brief, discrete examples; no counting between the amounts.
      setExampleValue(10_555);
      next = setTimeout(() => setExampleValue(1_030), 1_200);
      end = setTimeout(finish, 2_400);
    }
    reducedMotion.addEventListener("change", motionChanged);
    return () => {
      clearTimeout(next);
      clearTimeout(end);
      reducedMotion.removeEventListener("change", motionChanged);
    };
  }, [demo]);

  const validTotal = totalPoints !== null && totalPoints > 0;
  const unit = validTotal ? estimate(fdv, allocation, totalPoints, 0) : null;
  const displayPoints = demo ? unit ? exampleValue / unit.valuePerPoint : 0 : points;
  const calculation = validTotal && displayPoints !== null ? estimate(fdv, allocation, totalPoints, displayPoints) : null;
  const showingExample = demo && exampleValue > 0;

  return <div className={`summary-grid${demo ? " demo-preview" : ""}`}>
    <div className="estimated-value">
      <h2 id="estimate-heading">Estimated airdrop value</h2>
      <strong aria-live={demo ? "off" : "polite"}>{demo ? `$${number.format(exampleValue)}` : money(calculation?.value)}</strong>
      <p>Based on {fdvLabel} FDV and {allocation}% airdrop allocation</p>
    </div>
    <div className="summary-details">
      <div className="your-points"><span className="stat-label">{showingExample ? "Example points" : pointLabel}</span><strong>{displayPoints === null ? "—" : number.format(displayPoints)}</strong><span className="source-label">{showingExample ? "Example only · enter your nickname or points below" : sourceLabel}</span></div>
      <div className="mini-stats">
        <div><span className="stat-label">Share of the points pool</span><strong>{calculation ? `${percent.format(calculation.poolShare)}%` : "—"}</strong></div>
        <div><span className="stat-label">Value per point</span><strong>{money(unit?.valuePerPoint)}</strong></div>
        <div><span className="stat-label">Airdrop pool value</span><strong>{money(unit?.poolValue)}</strong></div>
        <div><span className="stat-label">Total points assumed</span><strong className="model-total">{validTotal ? number.format(totalPoints) : "—"} PTS</strong></div>
      </div>
    </div>
  </div>;
}
