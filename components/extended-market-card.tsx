"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXTENDED_MARKET_URL, type ExtendedMarketSnapshot } from "@/lib/extended-market";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const chance = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fdv = (value: number) => value >= 1e9 ? `$${number.format(value / 1e9)}B` : `$${number.format(value / 1e6)}M`;

export default function ExtendedMarketCard({ currentFdv, onApply }: { currentFdv: number | null; onApply: (fdvUsd: number) => void }) {
  const [snapshot, setSnapshot] = useState<ExtendedMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/extended/fdv", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Market data could not be loaded. Try again shortly.");
      const data = await response.json() as ExtendedMarketSnapshot;
      if (!request.signal.aborted) setSnapshot(data);
    } catch (cause) {
      if (!request.signal.aborted) { setSnapshot(null); setError(cause instanceof Error ? cause.message : "Market data could not be loaded."); }
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  const median = snapshot?.median;
  const estimate = median?.kind === "estimate" ? median : null;
  const usable = Boolean(snapshot?.thresholds.some(row => row.yesProbability !== null));
  const status = loading ? "Loading…" : error ? "Unavailable" : snapshot?.status === "ready" ? "Market data"
    : snapshot?.status === "partial" ? "Partial data" : snapshot?.status === "not_configured" ? "Not connected" : "Unavailable";
  const applied = estimate && currentFdv !== null && Math.abs(estimate.fdvUsd - currentFdv) < 1;

  return <section className="ex-market-reference ex-panel" aria-labelledby="ex-market-heading" aria-busy={loading}>
    <div className="ex-reference-heading"><div><span className="ex-polymarket-symbol" aria-hidden="true"><img src="/brand/extended/polymarket.png" alt="" width="38" height="38" /></span><div><p className="ex-eyebrow">FDV REFERENCE</p><h2 id="ex-market-heading">Polymarket</h2></div></div><span className={`ex-reference-status${usable ? " is-connected" : ""}`} role="status"><i aria-hidden="true" />{status}</span></div>
    <a className="ex-market-event" href={EXTENDED_MARKET_URL} target="_blank" rel="noopener noreferrer">Extended FDV above ___ one day after launch? <span aria-hidden="true">↗</span></a>
    {loading && !snapshot ? <p className="ex-reference-note" role="status">Reading threshold markets and their latest available quotes…</p> : <>
      {estimate && <div className="ex-market-estimate"><div><span>Market-implied median FDV</span><strong>≈ {fdv(estimate.fdvUsd)}</strong><p>{estimate.lowerUsd === estimate.upperUsd ? "50% probability at this threshold" : `50% crossing between ${fdv(estimate.lowerUsd)} and ${fdv(estimate.upperUsd)}`}</p></div><button type="button" className="ex-apply-reference" disabled={loading || Boolean(applied)} onClick={() => onApply(estimate.fdvUsd)}>{applied ? "Applied ✓" : "Use this FDV ↗"}</button></div>}
      {median && (median.kind === "below" || median.kind === "above") && <div className="ex-market-bound"><span>Market-implied median</span><strong>{median.kind === "below" ? "Below" : "Above"} {fdv(median.boundUsd)}</strong><p>The quoted thresholds do not bracket 50%. Choose a scenario manually.</p></div>}
      {!estimate && median?.kind === "unavailable" && usable && <p className="ex-reference-note">{median.reason}</p>}
      {(error || snapshot?.message) && <p className="ex-market-warning" role="status">{error || snapshot?.message}</p>}
      {snapshot && snapshot.thresholds.length > 0 && <div className="ex-thresholds"><div className="ex-threshold-labels"><span>FDV threshold</span><span>Chance of exceeding</span></div>{snapshot.thresholds.map(row => {
        const shownProbability = row.yesProbability ?? row.lastKnownProbability ?? null;
        const outdated = row.state === "stale";
        return <div className={`ex-threshold${outdated ? " is-stale" : ""}`} key={row.thresholdUsd}><a href={row.marketUrl} target="_blank" rel="noopener noreferrer">&gt; {fdv(row.thresholdUsd)} <span aria-hidden="true">↗</span></a><div className="ex-threshold-track" aria-hidden="true"><span style={{ width: `${(shownProbability ?? 0) * 100}%` }} /></div><span title={row.quoteAsOf ? `${date.format(new Date(row.quoteAsOf))} UTC · ${row.priceMethod === "midpoint" ? "YES bid/ask midpoint" : "latest recorded YES trade"}` : undefined}>{shownProbability === null ? "—" : chance.format(shownProbability)}</span></div>;
      })}</div>}
      {snapshot && snapshot.warnings.length > 0 && <details className="ex-market-warnings"><summary>{snapshot.warnings.length} threshold {snapshot.warnings.length === 1 ? "notice" : "notices"}</summary>{snapshot.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
    </>}
    <div className="ex-market-update"><span>{snapshot?.quoteAsOf ? `Oldest included quote: ${date.format(new Date(snapshot.quoteAsOf))} UTC` : "Latest available hourly quotes"}</span><button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh Polymarket FDV data">{loading ? "Loading…" : "Refresh ↻"}</button></div>
    <details className="ex-market-method"><summary>How the estimate is calculated</summary><p>Each threshold is a separate YES/NO market. Its percentage is the probability of exceeding that FDV one day after launch. These probabilities overlap and are not added or averaged as separate outcomes.</p><p>The estimate linearly interpolates the 50% crossing between two quoted thresholds. It is a model-derived median, not a listed token price or an expected FDV. If no crossing is bracketed, only a bound is shown.</p><p>Quotes come from the latest available Heisenberg hourly candle: YES bid/ask midpoint for a spread of at most 10 percentage points, otherwise its last recorded trade. Quotes over 24 hours old are shown with their date and an outdated label, and excluded from the estimate. Missing or inconsistent quotes can prevent an estimate. Results are cached on the server for one minute; applying an estimate does not automatically change it on refresh.</p></details>
  </section>;
}
