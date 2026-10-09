"use client";

import { useEffect, useState } from "react";
import { estimate } from "@/lib/estimator";

const demoSteps = [1_000, 1_800, 750, 0];
const stepDuration = 6_000;
const previewDuration = stepDuration * (demoSteps.length - 1);
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
  const [demoPoints, setDemoPoints] = useState(demoSteps[0]);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!demo || complete) { setDemoPoints(0); setComplete(true); return; }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let elapsed = 0;
    let previous = 0;
    let lastPaint = 0;

    function animate(now: number) {
      if (previous) elapsed += Math.min(now - previous, 100);
      previous = now;
      if (elapsed >= previewDuration) {
        setDemoPoints(0);
        setComplete(true);
        return;
      }
      if (now - lastPaint >= 50) {
        const segment = Math.floor(elapsed / stepDuration);
        // Hold each example briefly, then count smoothly toward the next one.
        const progress = Math.min(1, Math.max(0, (elapsed % stepDuration - 1_500) / 4_500));
        const eased = progress * progress * (3 - 2 * progress);
        const from = demoSteps[segment];
        const to = demoSteps[segment + 1];
        setDemoPoints(Math.round(from + (to - from) * eased));
        lastPaint = now;
      }
      frame = requestAnimationFrame(animate);
    }

    function syncAnimation() {
      cancelAnimationFrame(frame);
      previous = 0;
      if (reducedMotion.matches) { setDemoPoints(0); setComplete(true); }
      else if (!document.hidden) frame = requestAnimationFrame(animate);
    }

    syncAnimation();
    reducedMotion.addEventListener("change", syncAnimation);
    document.addEventListener("visibilitychange", syncAnimation);
    return () => {
      cancelAnimationFrame(frame);
      reducedMotion.removeEventListener("change", syncAnimation);
      document.removeEventListener("visibilitychange", syncAnimation);
    };
  }, [demo, complete]);

  const validTotal = totalPoints !== null && totalPoints > 0;
  // Keep demo examples within a custom points pool, including small pools.
  const displayPoints = demo && validTotal
    ? Math.round(demoPoints * Math.min(1, totalPoints / 5_000) * 100) / 100
    : points;
  const calculation = validTotal && displayPoints !== null ? estimate(fdv, allocation, totalPoints, displayPoints) : null;
  const unit = validTotal ? estimate(fdv, allocation, totalPoints, 1) : null;

  return <div className={`summary-grid${demo ? " demo-preview" : ""}`}>
    <div className="estimated-value">
      <h2 id="estimate-heading">Estimated airdrop value</h2>
      <strong aria-live={demo ? "off" : "polite"}>{demo && complete && calculation?.value === 0 ? "$0" : money(calculation?.value)}</strong>
      <p>Based on {fdvLabel} FDV and {allocation}% airdrop allocation</p>
    </div>
    <div className="summary-details">
      <div className="your-points"><span className="stat-label">{demo && !complete ? "Example points" : pointLabel}</span><strong>{displayPoints === null ? "—" : number.format(displayPoints)}</strong><span className="source-label">{demo && !complete ? "Example only · enter your nickname or points below" : sourceLabel}</span></div>
      <div className="mini-stats">
        <div><span className="stat-label">Share of the points pool</span><strong>{calculation ? `${percent.format(calculation.poolShare)}%` : "—"}</strong></div>
        <div><span className="stat-label">Value per point</span><strong>{money(unit?.valuePerPoint)}</strong></div>
        <div><span className="stat-label">Airdrop pool value</span><strong>{money(unit?.poolValue)}</strong></div>
        <div><span className="stat-label">Total points assumed</span><strong className="model-total">{validTotal ? number.format(totalPoints) : "—"} PTS</strong></div>
      </div>
    </div>
  </div>;
}
