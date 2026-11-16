"use client";

import Link from "next/link";
import ReferralOffer from "@/components/referral-offer";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ENTROPY_PERIODS, type EntropyPeriod, type EntropySettings } from "@/lib/entropy-wallet";
import type { BuilderProgress, EntropyBuilderReport } from "@/lib/entropy-builder";
import { useEntropyWallet } from "@/hooks/use-entropy-wallet";
import { featureFlags } from "@/lib/features";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const feeUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (value: string | undefined | null, fees = false) => value == null ? "—" : (fees ? feeUsd : usd).format(Number(value));
const share = (part: string | undefined, whole: string | undefined) => part !== undefined && whole !== undefined && Number(whole) > 0 ? `${number.format(Number(part) / Number(whole) * 100)}%` : "0%";
const cacheKey = "entropy-wallet-builder-analysis-v2";
const labelMarket = (value: string) => value.startsWith("io:") ? value.slice(3) : value;

export default function EntropyWallet() {
  const [settings, update, ready] = useEntropyWallet();
  const { address, period } = settings;
  const [report, setReport] = useState<EntropyBuilderReport | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(false), [progress, setProgress] = useState<BuilderProgress | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!ready) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null") as EntropyBuilderReport | null;
      setReport(saved?.version === 2 && saved.dex === "builder" && saved.address === address.trim().toLowerCase() && saved.period === period ? saved : null);
    } catch { setReport(null); }
  }, [ready, address, period]);
  function edit(patch: Partial<EntropySettings>) {
    controller.current?.abort(); setLoading(false); setError(""); setReport(null); setProgress(null); update(patch);
  }
  async function analyze(event: FormEvent) {
    event.preventDefault(); controller.current?.abort();
    const normalized = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) { setError("Enter a valid 0x wallet address with 40 hexadecimal characters."); return; }
    const request = new AbortController(); controller.current = request;
    setError(""); setLoading(true); setProgress(null);
    try {
      let sync = false, previousRemaining = Infinity;
      for (;;) {
        const response = await fetch("/api/entropy/wallet", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: normalized, period, sync }), signal: request.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Activity could not be loaded. Try again shortly.");
        if (request.signal.aborted) return;
        const result = data as EntropyBuilderReport;
        if (result.version !== 2 || result.dex !== "builder" || result.address !== normalized || result.period !== period || !result.synchronization) throw new Error("Unexpected Entropy analysis response.");
        setProgress(result.synchronization);
        if (result.summary || result.synchronization.remaining === 0) {
          setReport(result);
          try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* Results remain available if browser storage is blocked. */ }
        }
        if (!result.synchronization.remaining) break;
        if (sync && result.synchronization.remaining >= previousRemaining) throw new Error("Import did not advance. Saved days are retained; run Analyze activity to continue.");
        previousRemaining = result.synchronization.remaining; sync = true;
      }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity could not be loaded."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  function cancel() { controller.current?.abort(); setLoading(false); }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `entropy-builder-${report.address}-${report.fetchedAt.slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const summary = report?.summary, feesComplete = report?.attribution.feesComplete === true;
  const fee = (value: string | undefined | null) => feesComplete ? money(value, true) : "—";
  const roleRows = summary ? [
    { id: "maker" as const, label: "Maker", volume: summary.makerVolume },
    { id: "taker" as const, label: "Taker", volume: summary.takerVolume },
    ...(Number(summary.unknownRoleVolume) > 0 ? [{ id: "unknown" as const, label: "Unclassified", volume: summary.unknownRoleVolume }] : []),
  ] : [];
  const maxDay = Math.max(0, ...(report?.days.slice(-14).map(row => Number(row.volume)) ?? []));
  const percent = progress && progress.total ? Math.round(progress.checked / progress.total * 100) : 0;

  return <div className="en-page"><div className="en-shell">
    <header className="en-header"><Link href="/entropy" className="en-brand" aria-label="Entropy wallet analytics"><img src="/brand/entropy/symbol.svg" alt="" width="33" height="26" /><span>Entropy</span><small>Wallet analytics</small></Link><nav aria-label="Entropy navigation">{featureFlags.multiExchange && <Link href="/" className="en-back">← All projects</Link>}<ReferralOffer className="en-referral" href="https://pro.entropy.io/?r=quasartitan452" code="quasartitan452" label="Open Entropy" /></nav></header>
    <div className="en-referral-benefits" aria-label="Referral benefits"><span>Rebate <b>120%</b></span><span>Referral bonus <b>50%</b></span><span>Commission <b>50%</b></span></div>
    <main>
      <section className="en-intro" aria-labelledby="en-title"><div><p className="en-eyebrow"><i />ENTROPY / WALLET ANALYTICS</p><h1 id="en-title">Entropy wallet analytics</h1><p>Volume, execution roles and realized PnL for trades carrying Entropy’s builder code.</p></div><span className="en-scope">ATTRIBUTION <b>Entropy builder</b></span></section>

      <section className="en-panel en-query" aria-labelledby="en-query-heading"><div className="en-section-heading"><div><p className="en-eyebrow">01 / ACCOUNT LOOKUP</p><h2 id="en-query-heading">Analyze wallet activity</h2></div><span className="en-readonly"><i />Public data · Read only</span></div>
        <form onSubmit={analyze}><div className="en-wallet-field"><label htmlFor="en-address">Wallet address<span>0x</span></label><input id="en-address" value={address} onChange={e => edit({ address: e.target.value })} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={42} aria-invalid={Boolean(error)} aria-describedby="en-request-status" /></div><div><label htmlFor="en-period">Analysis period<span>UTC</span></label><select id="en-period" value={period} onChange={e => edit({ period: e.target.value as EntropyPeriod })}>{Object.entries(ENTROPY_PERIODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><button type="submit" className="en-analyze" disabled={loading || !ready}>{loading ? "Importing history…" : "Analyze activity"}<span aria-hidden="true">↗</span></button></form>
        <p id="en-request-status" className={error ? "en-error" : "en-query-help"} role={error ? "alert" : "status"}>{error || (loading ? "Checking saved history and importing available Entropy builder archives…" : "No wallet connection or signature. Confirmed executions for searched wallets are saved privately to speed up future analyses.")}</p>
      </section>

      {loading && <section className="en-import en-panel" aria-label="Archive import progress"><div role="status"><strong>{progress ? `${progress.checked} / ${progress.total} days checked` : "Reading saved history…"}</strong><span>{progress ? `${progress.available} archives available · ${progress.unavailable} unavailable` : "Existing results appear while new days are checked."}</span></div><progress aria-label="Days checked" value={progress?.checked ?? 0} max={Math.max(1, progress?.total ?? 1)} /><button type="button" onClick={cancel}>Stop import</button><small>{percent}% · Saved days are retained if the import is stopped.</small></section>}

      {!report && !loading && <section className="en-empty en-panel" aria-labelledby="en-empty-heading"><div className="en-empty-symbol" aria-hidden="true"><img src="/brand/entropy/symbol.svg" alt="" width="48" height="38" /></div><h2 id="en-empty-heading">Enter a wallet to view confirmed Entropy trades</h2><p>Includes native and HIP-3 perpetuals carrying Entropy’s builder code. A market’s io: prefix alone does not qualify it. Public archives may omit trades.</p><ul><li><span>01</span><strong>Attributed executions</strong><p>Only records published under Entropy’s builder address.</p></li><li><span>02</span><strong>Volume and fees</strong><p>Maker and taker volume, with fees verified separately where possible.</p></li><li><span>03</span><strong>Saved history</strong><p>Later checks reuse saved executions and import new or updated days.</p></li></ul></section>}

      {report && <div className="en-results">
        <section className="en-summary en-panel" aria-labelledby="en-volume-heading"><div className="en-summary-top"><span className="en-eyebrow">CONFIRMED ENTROPY EXECUTIONS</span><span>{ENTROPY_PERIODS[report.period]} <i /> Partial history</span></div><div className="en-summary-main"><div><h2 id="en-volume-heading">Confirmed trading volume</h2><strong>{money(summary?.volume)}</strong><p>{summary ? `${number.format(summary.fills)} fills · ${report.markets.length} ${report.markets.length === 1 ? "market" : "markets"}` : "No archive data is available for this period."}</p></div><dl><div><dt>Net execution fees</dt><dd>{fee(summary?.netFees)}</dd><small>{feesComplete ? "Paid fees minus rebates" : "Not verified for every execution"}</small></div><div><dt>Realized PnL before fees</dt><dd>{money(summary?.closedPnl)}</dd><small>Reported for confirmed closing executions</small></div><div><dt>Builder fees</dt><dd>{money(report.builderFeesIncluded, true)}</dd><small>Already included in verified execution fees</small></div><div><dt>Executions with verified USDC fees</dt><dd>{report.attribution.feesMatched} / {report.attribution.feesTotal}</dd><small>Verified net fees: {money(report.attribution.verifiedNetFees, true)}</small></div></dl></div><div className="en-summary-footer"><span>{report.firstFillAt && report.lastFillAt ? `Confirmed fills: ${day.format(new Date(report.firstFillAt))} – ${day.format(new Date(report.lastFillAt))}` : "No confirmed executions found in the available records"}</span><span>Analysis {date.format(new Date(report.fetchedAt))} UTC</span></div></section>

        <div className="en-warning" role="status"><strong>Confirmed Entropy trades · Incomplete history</strong>{report.warnings.map(note => <p key={note}>{note}</p>)}<p>Missing archive data does not mean there was no trading activity. Funding, current balances, open positions and holding times cannot be isolated reliably by interface and are excluded.</p></div>

        <section className="en-panel en-builder-execution en-execution" aria-labelledby="en-execution-heading"><div className="en-section-heading"><div><p className="en-eyebrow">02 / EXECUTION</p><h2 id="en-execution-heading">Maker and taker activity</h2></div><span>Confirmed trades only</span></div><div className="en-execution-bar" aria-label="Execution role by volume">{roleRows.map(row => <span className={`en-role-${row.id}`} key={row.id} style={{ width: share(row.volume, summary?.volume) }} />)}</div><div className="en-role-cards">{roleRows.map(row => {
          const fees = summary!.feesByRole[row.id];
          return <article key={row.id}><div className="en-role-heading"><h3><i className={`en-role-${row.id}`} />{row.label}</h3><span>{share(row.volume, summary?.volume)}</span></div><dl><div><dt>Volume</dt><dd>{money(row.volume)}</dd></div><div><dt>Fees paid</dt><dd>{fee(fees.paid)}</dd></div><div><dt>Rebates</dt><dd>{fee(fees.rebates)}</dd></div><div><dt>Net fees</dt><dd>{fee(fees.net)}</dd></div></dl></article>;
        })}</div>{!summary && <p className="en-help">Execution history is unavailable.</p>}<p className="en-help">Execution roles come from the builder archive. Total fees are shown only when all selected executions have verified USDC fees. Builder fees are not added twice.</p></section>

        <div className="en-analysis-grid en-market-grid">
          <section className="en-panel en-markets" aria-labelledby="en-markets-heading"><div className="en-section-heading"><div><p className="en-eyebrow">03 / MARKET BREAKDOWN</p><h2 id="en-markets-heading">Trading by market</h2></div><span>{report.markets.length} markets</span></div>{report.markets.length ? <ul>{report.markets.map(row => <li key={row.market}><div><strong>{labelMarket(row.market)}<small>{row.market}</small></strong><b>{money(row.volume)}</b></div><div className="en-market-bar"><span style={{ width: share(row.volume, summary?.volume) }} /></div><p><span>{number.format(row.fills)} fills · {share(row.makerVolume, row.volume)} maker</span><span>{fee(row.netFees)} net fees</span></p></li>)}</ul> : <p className="en-help">No confirmed executions found in the available records for this period.</p>}</section>
          <section className="en-panel en-activity" aria-labelledby="en-activity-heading"><div className="en-section-heading"><div><p className="en-eyebrow">04 / ACTIVITY OVER TIME</p><h2 id="en-activity-heading">Daily trading volume</h2></div><span>Last 14 recorded days · UTC</span></div>{report.days.length ? <ul>{report.days.slice(-14).map(row => <li key={row.day}><span>{day.format(new Date(`${row.day}T00:00:00Z`))}</span><div className="en-day-track"><span style={{ width: `${maxDay > 0 ? Number(row.volume) / maxDay * 100 : 0}%` }} /></div><strong>{money(row.volume)}<small>{row.fills} fills</small></strong></li>)}</ul> : <p className="en-help">No trading days in the confirmed records.</p>}</section>
        </div>

        <section className="en-panel en-weeks" aria-labelledby="en-weeks-heading"><div className="en-section-heading"><div><p className="en-eyebrow">05 / WEEKLY SUMMARY</p><h2 id="en-weeks-heading">Trading by week</h2></div><span>Monday–Sunday · UTC</span></div><div className="en-table-wrap" data-lenis-prevent-horizontal><table className="en-table"><caption className="sr-only">Confirmed Entropy executions by week. Missing archive hours are excluded.</caption><thead><tr><th scope="col">Week starting</th><th scope="col">Volume</th><th scope="col">Fills</th><th scope="col">Maker share</th><th scope="col">Net fees</th><th scope="col">Realized PnL*</th></tr></thead><tbody>{report.weeks.map(row => <tr key={row.start}><th scope="row">{day.format(new Date(row.start))}</th><td>{money(row.summary.volume)}</td><td>{row.summary.fills}</td><td>{share(row.summary.makerVolume, row.summary.volume)}</td><td>{fee(row.summary.netFees)}</td><td>{money(row.summary.closedPnl)}</td></tr>)}</tbody></table></div>{!report.weeks.length && <p className="en-help">No confirmed executions in this period.</p>}<p className="en-help">* Before execution fees and funding. Totals cover confirmed records only.</p></section>

        <details className="en-panel en-coverage"><summary>Archive coverage <span>{report.synchronization.available} available / {report.synchronization.total} days</span></summary><p className="en-help">First and last records describe the entire builder file. A file reaching the end of a day does not prove complete coverage. Unavailable files are not treated as zero activity.</p><div className="en-table-wrap"><table className="en-table"><caption className="sr-only">Archive availability and UTC time coverage by date.</caption><thead><tr><th scope="col">Date</th><th scope="col">Status</th><th scope="col">First record UTC</th><th scope="col">Last record UTC</th><th scope="col">Last checked UTC</th></tr></thead><tbody>{report.attribution.days.map(row => <tr key={row.day}><th scope="row">{row.day}</th><td>{row.status === "available" ? "Available · partial coverage" : row.archiveFirst ? "Saved copy · refresh failed" : row.status === "missing" ? "Not available" : "Request failed"}</td><td>{row.archiveFirst ? date.format(new Date(row.archiveFirst)) : "—"}</td><td>{row.archiveLast ? date.format(new Date(row.archiveLast)) : "—"}</td><td>{date.format(new Date(row.checkedAt))}</td></tr>)}</tbody></table></div></details>

        <section className="en-method" aria-labelledby="en-method-heading"><div><h2 id="en-method-heading">Data sources and calculation</h2><p>Volume sums executed price × size for both opening and closing executions. Only records whose user address matches this wallet in Entropy’s builder archives are included. Native and other HIP-3 perpetual markets qualify; io: trades through another builder are excluded. Spot trades are excluded.</p><p>USDC fees are taken from public Hyperliquid fills only when the archived execution can be matched without ambiguity. Unmatched fees stay unknown. Source timestamps may have one-second precision. Archived PnL is not a complete account PnL.</p><p>Confirmed executions are saved privately in the shared database. Imports resume from saved days; recent days are checked every 15 minutes and older days after seven days when you analyze. <a href="https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes" target="_blank" rel="noopener noreferrer">Hyperliquid builder archive documentation ↗</a></p></div><button type="button" onClick={download} className="en-export">Export analysis JSON <span aria-hidden="true">↗</span></button></section>
      </div>}
    </main>
    <footer className="en-footer"><span>ENTROPY / UNOFFICIAL COMMUNITY TOOL</span><span>Entropy builder attribution · Incomplete public archives</span></footer>
  </div></div>;
}
