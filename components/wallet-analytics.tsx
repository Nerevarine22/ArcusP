"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import SiteHeader from "@/components/site-header";
import WeeklyHoldingAnalysis from "@/components/weekly-analysis";
import type { WalletReport } from "@/lib/wallet-analytics";
import type { SearchResult } from "@/lib/leaderboard";
import { useRememberedName } from "@/hooks/use-remembered-name";
import { useRememberedWallet } from "@/hooks/use-remembered-wallet";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fineUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const money = (value: string | number | null | undefined, fine = false) => value == null ? "—" : (fine ? fineUsd : usd).format(Number(value));
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export default function WalletAnalytics({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [address, setAddress] = useRememberedWallet();
  const [scope, setScope] = useState("all");
  const [period, setPeriod] = useState("all");
  const [includeWeekly, setIncludeWeekly] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<WalletReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [points, setPoints] = useState("");
  const [name, setName] = useRememberedName();
  const [pointsBasis, setPointsBasis] = useState("gain");
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsNote, setPointsNote] = useState("");
  const [participant, setParticipant] = useState<SearchResult | null>(null);
  const scanController = useRef<AbortController | null>(null);
  const pointsController = useRef<AbortController | null>(null);
  useEffect(() => () => { scanController.current?.abort(); pointsController.current?.abort(); }, []);
  useEffect(() => {
    if (participant && normalize(participant.entry.name) !== normalize(name)) {
      pointsController.current?.abort();
      setParticipant(null); setPoints(""); setPointsNote(""); setPointsLoading(false);
    }
  }, [name, participant]);

  function resetReport() { scanController.current?.abort(); setReport(null); setLoading(false); setError(""); }
  function changePeriod(value: string) {
    resetReport(); setPeriod(value);
    if (value === "custom" && !from && !to) {
      setFrom(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 16));
      setTo(new Date().toISOString().slice(0, 16));
    }
  }
  function changeName(value: string) {
    pointsController.current?.abort(); setPointsLoading(false); setName(value);
    setParticipant(null); setPoints(""); setPointsNote("");
  }
  async function scan(event: FormEvent) {
    event.preventDefault(); scanController.current?.abort();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) { setError("Enter a valid 0x wallet address."); return; }
    const controller = new AbortController(); scanController.current = controller;
    setLoading(true); setError(""); setReport(null);
    if (name.trim()) void loadPoints();
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
      if (!data.comparison || data.comparison.status !== "compared") { setPoints(""); setPointsNote("No previous snapshot match. Enter period points manually below."); return; }
      const gain = (Math.round(current * 100) - Math.round(data.comparison.previous_points * 100)) / 100;
      if (gain < 0) { setPoints(""); setPointsNote("The latest snapshot has a negative adjustment. Enter earned period points manually."); return; }
      setPoints(String(gain));
    } else setPoints(String(current));
    setPointsNote(`${data.entry.name} · ${data.entry.tier} · ${data.weekly_points?.filter(week => week.earned_points !== null).length ?? 0} weekly distributions loaded.`);
  }
  async function loadPoints() {
    pointsController.current?.abort();
    if (!name.trim()) { setPointsNote("Enter your Arcus name to load points snapshots."); return; }
    const controller = new AbortController(); pointsController.current = controller;
    setPointsLoading(true); setPointsNote(""); setParticipant(null); setPoints("");
    try {
      const response = await fetch(`/api/points?name=${encodeURIComponent(name.trim())}&history=1`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load points.");
      if (!controller.signal.aborted) { setParticipant(data); applyPoints(data, pointsBasis); }
    } catch (cause) { if (!controller.signal.aborted) setPointsNote(cause instanceof Error ? cause.message : "Could not load points."); }
    finally { if (!controller.signal.aborted) setPointsLoading(false); }
  }
  function download() {
    if (!report) return;
    const payload = { ...report, pointsProfile: participant, pointsComparison: { points: validPoints ? pointCount : null, volumePerPointUsd: ratioVolume, netFeesPerPointUsd: ratioFees } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `arcus-wallet-${report.address}-${report.fetchedAt.slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pointCount = Number(points.replace(",", "."));
  const validPoints = points.trim() !== "" && Number.isFinite(pointCount) && pointCount > 0;
  const summary = report?.summary;
  const historyUnavailable = Boolean(report && !summary);
  const ratioVolume = summary && validPoints && report?.scan.complete ? Number(summary.volumeUsd) / pointCount : null;
  const ratioFees = summary && validPoints && report?.scan.complete ? Number(summary.netFeesUsd) / pointCount : null;
  const effectiveFee = summary && Number(summary.volumeUsd) > 0 ? Number(summary.netFeesUsd) / Number(summary.volumeUsd) * 10_000 : null;
  const scopeLabel = scope === "all" ? "All subaccounts" : `Subaccount ${scope}`;
  const periodLabel = ({ all: "All time", "24h": "Last 24h", "7d": "Last 7 days", "30d": "Last 30 days", custom: "Custom UTC period" })[period];
  const latestPoints = participant?.weekly_points?.filter(week => week.earned_points !== null).at(-1);

  return <div className="site-shell wallet-page">
    <SiteHeader initialTheme={initialTheme} active="wallet" />
    <main>
      <div className="page-intro wallet-page-intro"><div><p className="eyebrow">ARCUS COMMUNITY TOOL</p><h1>Your trades.<br />Your points.</h1><p className="wallet-intro">Find the patterns behind your weekly rewards.</p></div><span className="model-tag"><span className="status-dot" />Wallet analytics</span></div>

      <section className="wallet-query panel" aria-labelledby="wallet-heading">
        <div className="wallet-section-heading"><div><p className="eyebrow">START WITH YOUR ACCOUNT</p><h2 id="wallet-heading">One lookup. The whole picture.</h2></div></div>
        <form onSubmit={scan}>
          <div className="wallet-identity-grid">
            <div><label htmlFor="wallet-address">Wallet address</label><input id="wallet-address" value={address} onChange={event => { resetReport(); setAddress(event.target.value); }} maxLength={42} autoComplete="off" spellCheck={false} aria-describedby="wallet-status" aria-invalid={Boolean(error)} /><p className="field-description">Public address · no connection or signature</p></div>
            <div><label htmlFor="wallet-arcus-name">Arcus name <span>FOR POINTS</span></label><input id="wallet-arcus-name" value={name} maxLength={100} autoComplete="off" spellCheck={false} onChange={event => changeName(event.target.value)} /><div className="name-field-footer"><span>Your matching leaderboard profile</span><button className="text-button" disabled={pointsLoading} type="button" onClick={() => void loadPoints()}>{pointsLoading ? "Loading…" : "Load points"}</button></div></div>
            <button className="primary-button analyze-button" type="submit" disabled={loading}>{loading ? "Analyzing…" : "Analyze activity"}<span aria-hidden="true">↗</span></button>
          </div>
          <details className="wallet-scan-settings"><summary>Scan settings <span>{periodLabel} · {scopeLabel}</span></summary><div className="wallet-filters">
            <div><label htmlFor="wallet-period">Trade period</label><select id="wallet-period" value={period} onChange={event => changePeriod(event.target.value)}><option value="all">All time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom UTC period</option></select></div>
            <div><label htmlFor="wallet-scope">Account scope</label><select id="wallet-scope" value={scope} onChange={event => { resetReport(); setScope(event.target.value); }}><option value="all">All subaccounts (0–9)</option>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>Subaccount {index}{index === 0 ? " · Primary" : ""}</option>)}</select></div>
            {period === "custom" && <><div><label htmlFor="wallet-from">From (UTC)</label><input id="wallet-from" type="datetime-local" value={from} required onChange={event => { resetReport(); setFrom(event.target.value); }} /></div><div><label htmlFor="wallet-to">To (UTC)</label><input id="wallet-to" type="datetime-local" value={to} required onChange={event => { resetReport(); setTo(event.target.value); }} /></div></>}
          </div><label className="wallet-weekly-option"><input type="checkbox" checked={includeWeekly} onChange={event => { resetReport(); setIncludeWeekly(event.target.checked); }} />Include weekly holding analysis</label><p className="wallet-small wallet-history-hint">Weekly analysis reads earlier fills to match positions opened before the selected period.</p></details>
        </form>
        <div className="lookup-feedback"><p id="wallet-status" className={error ? "error" : "muted"} role="status">{error || (loading ? "Reading account stats and trade history…" : "Name-to-wallet matching is supplied by you. The API does not verify this link.")}</p><p className="points-load-status" role="status">{pointsLoading ? "Loading points snapshots…" : pointsNote}</p></div>
      </section>

      {(report || loading) && <section className="wallet-overview summary panel" aria-labelledby="activity-heading" aria-busy={loading}>
        <div className="summary-kicker"><span className="accent-tag">YOUR ACTIVITY AT A GLANCE</span><span>{report ? `${scopeLabel} · ${historyUnavailable ? "Trade history unavailable" : report.scan.complete ? "Complete history" : "Partial history"}` : "Scanning your activity…"}</span></div>
        <div className="activity-summary-grid"><div><h2 id="activity-heading">Executed trading volume</h2><strong>{money(summary?.volumeUsd)}</strong><p>{historyUnavailable ? "No fills could be verified for this period" : report && summary ? `${number.format(summary.fillCount)} ${report.scan.complete ? "fills" : "loaded fills"} · ${report.range.from ? date.format(new Date(report.range.from)) : "All time"}` : "Executed size × price"}</p></div><div><h3>Net fill fees</h3><strong>{money(summary?.netFeesUsd)}</strong><p>{effectiveFee === null ? "Paid fees minus rebates" : `${number.format(effectiveFee)} bps effective fee`}</p></div><div><h3>Recorded Season 1 points</h3><strong>{participant?.entry.points == null ? "—" : number.format(participant.entry.points)}<em>PTS</em></strong><p>{latestPoints ? `${latestPoints.earned_points! >= 0 ? "+" : ""}${number.format(latestPoints.earned_points!)} in Week ${latestPoints.week}` : "Load your Arcus name above"}</p></div></div>
        <div className="summary-footer"><span>Maker <b>{money(summary?.makerVolumeUsd)}</b></span><span>Taker <b>{money(summary?.takerVolumeUsd)}</b></span>{report && <span className="model-origin">Fetched {date.format(new Date(report.fetchedAt))} UTC</span>}</div>
      </section>}
      {report && (!report.scan.complete || report.scan.warnings.length > 0) && <div className="wallet-notice" role="status">
        {!report.scan.complete && <><b>{historyUnavailable ? "Trade history unavailable." : "Partial results."}</b><p>{historyUnavailable ? "Volume and fees are unknown, not zero. Leaderboard points load separately and do not confirm trading activity for this wallet." : "Totals cover successfully read fills only. Weekly holding estimates and efficiency require complete history."}</p></>}
        {report.scan.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
        {!report.scan.complete && <p>Try again using Analyze activity. If this persists, select a single subaccount in Scan settings, or disable weekly analysis and choose a shorter period. Download the report JSON below to share the scan details.</p>}
      </div>}

      <WeeklyHoldingAnalysis key={report?.fetchedAt ?? "empty"} report={report} points={participant?.weekly_points ?? []} linkedName={participant?.entry.name ?? null} loading={loading} />

      {report && <>
        <div className="analytics-support-grid">
          <details className="wallet-card panel analytics-support"><summary><span>Custom period comparison<small>Use your own point total for a chosen scan period</small></span><span aria-hidden="true">+</span></summary><div className="support-content"><div className="wallet-points-fields"><div><label htmlFor="points-basis">Use snapshot points</label><select id="points-basis" value={pointsBasis} disabled={pointsLoading} onChange={event => { setPointsBasis(event.target.value); if (participant) applyPoints(participant, event.target.value); }}><option value="total">Season 1 total</option><option value="gain">Latest snapshot gain</option></select></div><div><label htmlFor="period-points">Points for selected period</label><input id="period-points" inputMode="decimal" value={points} onChange={event => { setPoints(event.target.value); }} /></div></div>
            {points.trim() && !validPoints && <p className="error">Enter a points value greater than zero.</p>}<div className="wallet-ratios"><div><span>Volume / point</span><strong>{money(ratioVolume)}</strong></div><div><span>Net fees / point</span><strong>{money(ratioFees, true)}</strong></div></div><p className="wallet-small">Match the points period to the trade period in Scan settings. This manual comparison does not align periods automatically.</p></div></details>
          <details className="wallet-card panel analytics-support"><summary><span>Arcus account statistics<small>Fee tier and address-level API aggregates</small></span><span aria-hidden="true">+</span></summary><div className="support-content"><div className="wallet-table-scroll" data-lenis-prevent-horizontal><table className="wallet-stats-table"><thead><tr><th>Window</th><th>Volume</th><th>Fees</th></tr></thead><tbody>{[["All time", report.stats?.lifetime], ["Last 24h", report.stats?.windows["24h"]], ["Last 7d", report.stats?.windows["7d"]], ["Last 30d", report.stats?.windows["30d"]]].map(([label, pair]) => { const stats = typeof pair === "object" ? pair : null; return <tr key={String(label)}><th scope="row">{String(label)}</th><td>{money(stats?.volumeUsd)}</td><td>{money(stats?.feesPaidUsd, true)}</td></tr>; })}</tbody></table></div><div className="wallet-tier"><span>Fee tier <b>{report.stats?.feeTier == null ? "—" : `Level ${report.stats.feeTier}`}</b></span><span>Maker <b>{report.stats?.makerFeeBps == null ? "—" : `${number.format(report.stats.makerFeeBps)} bps`}</b></span><span>Taker <b>{report.stats?.takerFeeBps == null ? "—" : `${number.format(report.stats.takerFeeBps)} bps`}</b></span></div><p className="wallet-small">Address-level aggregates are independent of scan filters and may lag recent fills.</p></div></details>
        </div>
        <div className="analytics-report-footer"><p>Fill fees may include liquidation penalties. Funding, transfers and deposits are excluded.</p><button className="wallet-export" type="button" onClick={download}>Download report JSON ↗</button></div>
      </>}
    </main>
    <footer className="site-footer"><span>ARCUS · COMMUNITY WALLET ANALYTICS</span><a href="https://docs.arcus.xyz/api-reference/public/get-fills" target="_blank" rel="noopener noreferrer">Arcus API documentation ↗</a></footer>
  </div>;
}
