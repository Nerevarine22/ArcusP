"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SiteHeader from "@/components/site-header";
import WeeklyHoldingAnalysis from "@/components/weekly-analysis";
import type { WalletReport } from "@/lib/wallet-analytics";
import type { SearchResult } from "@/lib/leaderboard";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fineUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const money = (value: string | number | null | undefined, fine = false) => value == null ? "—" : (fine ? fineUsd : usd).format(Number(value));
const testWallet = "0x9ac26d73b0a6db219dd61a660c5e7ce94f6796db";

export default function WalletAnalytics({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [address, setAddress] = useState("");
  const [scope, setScope] = useState("all");
  const [period, setPeriod] = useState("all");
  const [includeWeekly, setIncludeWeekly] = useState(true);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [report, setReport] = useState<WalletReport | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [points, setPoints] = useState(""); const [name, setName] = useState("");
  const [pointsBasis, setPointsBasis] = useState("total");
  const [pointsLoading, setPointsLoading] = useState(false); const [pointsNote, setPointsNote] = useState("");
  const [participant, setParticipant] = useState<SearchResult | null>(null);
  const scanController = useRef<AbortController | null>(null);
  const pointsController = useRef<AbortController | null>(null);
  useEffect(() => () => { scanController.current?.abort(); pointsController.current?.abort(); }, []);

  function resetReport() { scanController.current?.abort(); setReport(null); setLoading(false); setError(""); }
  function changePeriod(value: string) {
    resetReport(); setPeriod(value);
    if (value === "custom" && !from && !to) { setFrom(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 16)); setTo(new Date().toISOString().slice(0, 16)); }
  }
  async function scan(event: FormEvent) {
    event.preventDefault(); scanController.current?.abort();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) { setError("Enter a valid 0x wallet address."); return; }
    const controller = new AbortController(); scanController.current = controller;
    setLoading(true); setError(""); setReport(null);
    try {
      const response = await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ address: address.trim(), accountScope: scope === "all" ? "all" : Number(scope), period, includeWeekly, ...(period === "custom" ? { from: `${from}:00Z`, to: `${to}:00Z` } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load wallet data.");
      if (!controller.signal.aborted) setReport(data as WalletReport);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load wallet data."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function applyPoints(data: SearchResult, basis: string) {
    const current = data.entry.points;
    if (current === null) { setPoints(""); setPointsNote("Points are not visible in the current snapshot."); return; }
    if (basis === "gain") {
      if (!data.comparison || data.comparison.status !== "compared") { setPoints(""); setPointsNote("A previous point value is required to calculate the snapshot gain. Enter period points manually."); return; }
      const gain = (Math.round(current * 100) - Math.round(data.comparison.previous_points * 100)) / 100;
      if (gain < 0) { setPoints(""); setPointsNote("The snapshot change is negative. Enter the points earned in your selected period manually."); return; }
      setPoints(String(gain));
    } else setPoints(String(current));
    setPointsNote(`${data.entry.name} · ${basis === "gain" ? "gain since previous snapshot" : "Season 1 snapshot total"} · ${date.format(new Date(data.updated_at))} UTC.`);
  }
  async function loadPoints(event: FormEvent) {
    event.preventDefault(); pointsController.current?.abort();
    if (!name.trim()) { setPointsNote("Enter your Arcus name."); return; }
    const controller = new AbortController(); pointsController.current = controller;
    setPointsLoading(true); setPointsNote(""); setParticipant(null); setPoints("");
    try {
      const response = await fetch(`/api/points?name=${encodeURIComponent(name.trim())}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load points.");
      if (!controller.signal.aborted) { setParticipant(data); applyPoints(data, pointsBasis); }
    } catch (cause) { if (!controller.signal.aborted) setPointsNote(cause instanceof Error ? cause.message : "Could not load points."); }
    finally { if (!controller.signal.aborted) setPointsLoading(false); }
  }
  function download() {
    if (!report) return;
    const payload = { ...report, pointsComparison: { points: validPoints ? pointCount : null, volumePerPointUsd: ratioVolume, netFeesPerPointUsd: ratioFees } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `arcus-wallet-${report.address}-${report.fetchedAt.slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pointCount = Number(points.replace(",", "."));
  const validPoints = points.trim() !== "" && Number.isFinite(pointCount) && pointCount > 0;
  const ratioVolume = report && validPoints && report.scan.complete ? Number(report.summary.volumeUsd) / pointCount : null;
  const ratioFees = report && validPoints && report.scan.complete ? Number(report.summary.netFeesUsd) / pointCount : null;
  const effectiveFee = report && Number(report.summary.volumeUsd) > 0 ? Number(report.summary.netFeesUsd) / Number(report.summary.volumeUsd) * 10_000 : null;
  const scopeLabel = report?.accountScope === "all" ? "All subaccounts" : `Subaccount ${report?.accountScope ?? scope}`;

  return <div className="site-shell wallet-page">
    <SiteHeader initialTheme={initialTheme} active="wallet" />
    <main>
      <div className="page-intro"><div><p className="eyebrow">ARCUS COMMUNITY TOOL · EXPERIMENTAL</p><h1>Your trading activity,<br />in perspective.</h1><p className="wallet-intro">Explore volume, fees, and the cost of your points.</p></div><span className="model-tag"><span className="status-dot" />Live wallet data</span></div>
      <section className="wallet-query panel" aria-labelledby="wallet-heading">
        <div className="wallet-section-heading"><div><h2 id="wallet-heading">Wallet lookup</h2><p>Enter a public address to read Arcus perpetual trading activity.</p></div><button className="text-button" type="button" onClick={() => { resetReport(); setAddress(testWallet); }}>Use test wallet</button></div>
        <form onSubmit={scan}>
          <div className="wallet-address-row"><div><label htmlFor="wallet-address">Wallet address</label><input id="wallet-address" value={address} onChange={event => { resetReport(); setAddress(event.target.value); }} maxLength={42} autoComplete="off" spellCheck={false} aria-describedby="wallet-status" aria-invalid={Boolean(error)} /></div><button className="primary-button" type="submit" disabled={loading}>{loading ? "Scanning…" : "Analyze wallet"}</button></div>
          <div className="wallet-filters"><div><label htmlFor="wallet-period">Trade period</label><select id="wallet-period" value={period} onChange={event => changePeriod(event.target.value)}><option value="all">All time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom UTC period</option></select></div><div><label htmlFor="wallet-scope">Account scope</label><select id="wallet-scope" value={scope} onChange={event => { resetReport(); setScope(event.target.value); }}><option value="all">All subaccounts (0–9)</option>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>Subaccount {index}{index === 0 ? " · Primary" : ""}</option>)}</select></div>
          {period === "custom" && <><div><label htmlFor="wallet-from">From (UTC)</label><input id="wallet-from" type="datetime-local" value={from} required onChange={event => { resetReport(); setFrom(event.target.value); }} /></div><div><label htmlFor="wallet-to">To (UTC)</label><input id="wallet-to" type="datetime-local" value={to} required onChange={event => { resetReport(); setTo(event.target.value); }} /></div></>}</div>
          <label className="wallet-weekly-option"><input type="checkbox" checked={includeWeekly} onChange={event => { resetReport(); setIncludeWeekly(event.target.checked); }} />Include weekly holding analysis</label>
          {includeWeekly && <p className="wallet-small wallet-history-hint">Reads earlier fills too, so positions opened before the selected period can be matched.</p>}
        </form>
        <div id="wallet-status" className={error ? "error" : "muted"} role="status">{error || (loading ? "Reading account stats and trade history. This may take a few seconds." : "Public data only · no wallet connection or signing required.")}</div>
      </section>

      <section className="wallet-overview summary panel" aria-labelledby="activity-heading" aria-busy={loading}>
        <div className="summary-kicker"><span className="accent-tag">TRADING ACTIVITY</span><span>{report ? `${scopeLabel} · ${report.scan.complete ? "Complete scan" : "Partial scan"}` : "Analyze a wallet to see your activity"}</span></div>
        <div className="wallet-overview-grid"><div className="estimated-value"><h2 id="activity-heading">Scanned trading volume</h2><strong>{money(report?.summary.volumeUsd)}</strong><p>{report ? `${number.format(report.summary.fillCount)} fills · ${report.range.from ? date.format(new Date(report.range.from)) : "All time"} → ${date.format(new Date(report.range.to))} UTC` : "Volume is calculated from executed size × price on each fill."}</p></div><div className="mini-stats"><div><span className="stat-label">Fill fees paid</span><strong>{money(report?.summary.feesPaidUsd, true)}</strong></div><div><span className="stat-label">Rebates received</span><strong>{money(report?.summary.rebatesUsd, true)}</strong></div><div><span className="stat-label">Net fill fees</span><strong>{money(report?.summary.netFeesUsd, true)}</strong></div><div><span className="stat-label">Effective fee rate</span><strong>{effectiveFee === null ? "—" : `${number.format(effectiveFee)} bps`}</strong></div></div></div>
        <div className="summary-footer"><span>Maker volume: <b>{money(report?.summary.makerVolumeUsd)}</b></span><span>Taker volume: <b>{money(report?.summary.takerVolumeUsd)}</b></span>{report && <span className="model-origin">Fetched {date.format(new Date(report.fetchedAt))} UTC</span>}</div>
      </section>
      {report && !report.scan.complete && <div className="wallet-notice" role="status"><b>Partial results.</b> Totals cover only the fills read successfully. Per-point ratios are disabled until a complete scan is available.</div>}
      {report && report.scan.warnings.length > 0 && <div className="wallet-notice">{report.scan.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}

      <WeeklyHoldingAnalysis key={report?.fetchedAt ?? "empty"} analysis={report?.weekly} />

      <div className="wallet-details-grid">
        <section className="wallet-card panel" aria-labelledby="points-ratio-heading"><h2 id="points-ratio-heading">Volume & fees per point</h2><p className="muted">Use points earned in the same period as your trade scan.</p>
          <form onSubmit={loadPoints}><label htmlFor="wallet-arcus-name">Arcus name (optional)</label><div className="nickname-row"><input id="wallet-arcus-name" value={name} maxLength={100} autoComplete="off" spellCheck={false} onChange={event => { pointsController.current?.abort(); setPointsLoading(false); setName(event.target.value); setParticipant(null); setPoints(""); setPointsNote(""); }} /><button className="primary-button" disabled={pointsLoading} type="submit">{pointsLoading ? "…" : "Load points"}</button></div></form>
          <div className="wallet-points-fields"><div><label htmlFor="points-basis">Snapshot points</label><select id="points-basis" value={pointsBasis} disabled={pointsLoading} onChange={event => { setPointsBasis(event.target.value); if (participant) applyPoints(participant, event.target.value); }}><option value="total">Season 1 total</option><option value="gain">Gain since previous snapshot</option></select></div><div><label htmlFor="period-points">Points for selected period</label><input id="period-points" inputMode="decimal" value={points} onChange={event => { pointsController.current?.abort(); setPointsLoading(false); setParticipant(null); setPoints(event.target.value); setPointsNote("Manual points value."); }} /></div></div>
          {pointsNote && <p className="muted wallet-points-note" role="status">{pointsNote}</p>}
          {points.trim() && !validPoints && <p className="error">Enter a points value greater than zero.</p>}
          <div className="wallet-ratios"><div><span>Trading volume / point</span><strong>{money(ratioVolume)}</strong></div><div><span>Net fees / point</span><strong>{money(ratioFees, true)}</strong></div></div><p className="wallet-small">Ratios describe your measured activity; they are not an official points conversion rate. Live trades may be newer than the points snapshot.</p>
        </section>
        <section className="wallet-card panel" aria-labelledby="stats-heading"><div className="wallet-section-heading"><h2 id="stats-heading">Arcus account statistics</h2><button className="wallet-export" type="button" disabled={!report} onClick={download}>Download JSON ↗</button></div><p className="muted">Address-level aggregates, independent of the scan filters.</p>
          <div className="wallet-table-scroll" data-lenis-prevent-horizontal><table className="wallet-stats-table"><thead><tr><th>Window</th><th>Volume</th><th>Fees</th></tr></thead><tbody>{[["All time", report?.stats?.lifetime], ["Last 24h", report?.stats?.windows["24h"]], ["Last 7d", report?.stats?.windows["7d"]], ["Last 30d", report?.stats?.windows["30d"]]].map(([label, pair]) => { const stats = typeof pair === "object" ? pair : null; return <tr key={String(label)}><th scope="row">{String(label)}</th><td>{money(stats?.volumeUsd)}</td><td>{money(stats?.feesPaidUsd, true)}</td></tr>; })}</tbody></table></div>
          <div className="wallet-tier"><span>Fee tier <b>{report?.stats?.feeTier == null ? "—" : `Level ${report.stats.feeTier}`}</b></span><span>Maker <b>{report?.stats?.makerFeeBps == null ? "—" : `${number.format(report.stats.makerFeeBps)} bps`}</b></span><span>Taker <b>{report?.stats?.takerFeeBps == null ? "—" : `${number.format(report.stats.takerFeeBps)} bps`}</b></span></div>
          <p className="wallet-small">Aggregate fees and lifetime figures use hourly rollups and can lag recent fills. Compare all-time figures with a complete scan across all subaccounts.</p>
        </section>
      </div>

    </main>
    <footer className="site-footer"><span>ARCUS · WALLET ANALYTICS · TEST PAGE</span><a href="https://docs.arcus.xyz/api-reference/public/get-fills" target="_blank" rel="noopener noreferrer">Arcus API documentation ↗</a></footer>
  </div>;
}
