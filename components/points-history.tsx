import type { PointsComparison } from "@/lib/leaderboard";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const change = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, signDisplay: "exceptZero" });

export default function PointsHistory({ comparison }: { comparison: PointsComparison }) {
  if (comparison.status === "new") return <div className="points-history"><span>Not in previous snapshot</span><span className="points-change neutral">New</span></div>;

  const percent = comparison.change_percent;
  const direction = percent === null || percent > 0 ? "positive" : percent < 0 ? "negative" : "neutral";
  const label = percent === null ? "New points" : `${percent > 0 ? "↑ " : percent < 0 ? "↓ " : ""}${change.format(percent)}%`;
  return <div className="points-history">
    <span>Last week: <b>{number.format(comparison.previous_points)} PTS</b></span>
    <span className={`points-change ${direction}`} title={percent === null ? "Percentage change is undefined when the previous value is zero." : "Change since the previous snapshot"}>{label}</span>
  </div>;
}
