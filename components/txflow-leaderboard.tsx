import { useEffect, useState } from "react";
import { TXFLOW_LEADERBOARD_METRICS, TXFLOW_LEADERBOARD_PERIODS, type TxflowLeaderboardMetric, type TxflowLeaderboardPeriod, type TxflowLeaderboardResult } from "@/lib/txflow-leaderboard";

const rankFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export default function TxflowLeaderboard({ address }: { address: string }) {
  const [period, setPeriod] = useState<TxflowLeaderboardPeriod>("alltime");
  const [result, setResult] = useState<{ query: string; data: TxflowLeaderboardResult | null }>();
  const query = new URLSearchParams({ address, period }).toString();
  const current = result?.query === query ? result : undefined;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/txflow/leaderboard?${query}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Leaderboard unavailable.");
        const data = await response.json() as TxflowLeaderboardResult;
        if (!controller.signal.aborted) setResult({ query, data });
      } catch {
        if (!controller.signal.aborted) setResult({ query, data: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [query]);

  const data = current?.data;
  const updatedAt = data?.updatedAt;
  return <section className="tf-wallet-card tf-panel" aria-labelledby="tf-leaderboard-heading">
    <div className="tf-wallet-section-title">
      <div><span className="tf-eyebrow">TXFLOW / RANKINGS</span><h2 id="tf-leaderboard-heading">Trading leaderboard</h2></div>
      <div className="tf-leaderboard-controls">
        <label htmlFor="tf-leaderboard-period">Leaderboard period</label>
        <select id="tf-leaderboard-period" value={period} onChange={event => {
          setResult(undefined);
          setPeriod(event.target.value as TxflowLeaderboardPeriod);
        }}>
          {Object.entries(TXFLOW_LEADERBOARD_PERIODS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <a href="https://app.txflow.com/leaderboard" target="_blank" rel="noopener noreferrer">Open on TxFlow <span aria-hidden="true">↗</span></a>
      </div>
    </div>
    <div aria-live="polite">
      {data ? <dl className="tf-leaderboard-ranks">
        {(Object.entries(TXFLOW_LEADERBOARD_METRICS) as [TxflowLeaderboardMetric, string][]).map(([id, label]) => {
          const rank = data.ranks[id];
          return <div key={id}><dt>{label} rank</dt><dd>{typeof rank === "number" ? `#${rankFormat.format(rank)}` : rank === null ? "Unranked" : "Unavailable"}</dd></div>;
        })}
      </dl> : <p className="tf-help">{current ? "TxFlow leaderboard is temporarily unavailable." : "Loading leaderboard ranks…"}</p>}
    </div>
    <p className="tf-help">Ranks use the leaderboard period selected here.{updatedAt ? ` Updated ${dateFormat.format(updatedAt)} UTC.` : ""}</p>
  </section>;
}
