"use client";

import Link from "next/link";
import ReferralOffer from "@/components/referral-offer";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ENTROPY_PERIODS, type EntropyPeriod, type EntropyReport, type EntropySettings } from "@/lib/entropy-wallet";
import { useEntropyWallet } from "@/hooks/use-entropy-wallet";
import { featureFlags } from "@/lib/features";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const feeUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const money = (value: string | undefined | null, fees = false) => value == null ? "—" : (fees ? feeUsd : usd).format(Number(value));
const share = (part: string | undefined, whole: string | undefined) => part !== undefined && whole !== undefined && Number(whole) > 0 ? `${number.format(Number(part) / Number(whole) * 100)}%` : "0%";
const cacheKey = "entropy-wallet-analysis-v1";
const labelMarket = (value: string) => value.startsWith("io:") ? value.slice(3) : value;

export default function EntropyWallet() {
  const [settings, update, ready] = useEntropyWallet();
  const { address, period } = settings;
  const [report, setReport] = useState<EntropyReport | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!ready) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null") as EntropyReport | null;
      setReport(saved?.version === 1 && saved.dex === "io" && saved.address === address.trim().toLowerCase() && saved.period === period ? saved : null);
    } catch { setReport(null); }
  }, [ready, address, period]);
  function edit(patch: Partial<EntropySettings>) {
    controller.current?.abort(); setLoading(false); setError(""); setReport(null); update(patch);
  }
  async function analyze(event: FormEvent) {
    event.preventDefault(); controller.current?.abort();
    const normalized = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) { setError("Enter a valid 0x wallet address with 40 hexadecimal characters."); return; }
    const request = new AbortController(); controller.current = request;
    setError(""); setLoading(true); setReport(null);
    try {
      const response = await fetch("/api/entropy/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: normalized, period }), signal: request.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Activity could not be loaded. Try again shortly.");
      if (!request.signal.aborted) {
        setReport(data as EntropyReport);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Current analysis remains visible if storage is full or blocked. */ }
      }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Activity could not be loaded."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `entropy-${report.address}-${report.fetchedAt.slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const summary = report?.summary, funding = report?.funding;
  const incomplete = report && (report.scan.status !== "complete" || report.scan.retentionLimited || report.fundingScan.status !== "complete");
  const roleRows = summary ? [
    { id: "maker" as const, label: "Maker", volume: summary.makerVolume },
    { id: "taker" as const, label: "Taker", volume: summary.takerVolume },
    ...(Number(summary.unknownRoleVolume) > 0 ? [{ id: "unknown" as const, label: "Unclassified", volume: summary.unknownRoleVolume }] : []),
  ] : [];
  const maxDay = Math.max(0, ...(report?.days.slice(-14).map(row => Number(row.volume)) ?? []));

  return <div className="en-page"><div className="en-shell">
    <header className="en-header"><Link href="/entropy" className="en-brand" aria-label="Entropy wallet analytics"><img src="/brand/entropy/symbol.svg" alt="" width="33" height="26" /><span>Entropy</span><small>Wallet analytics</small></Link><nav aria-label="Entropy navigation">{featureFlags.multiExchange && <Link href="/" className="en-back">← All projects</Link>}<ReferralOffer className="en-referral" href="https://pro.entropy.io/?r=quasartitan452" code="quasartitan452" label="Open Entropy" /></nav></header>
    <div className="en-referral-benefits" aria-label="Referral benefits"><span>Rebate <b>120%</b></span><span>Referral bonus <b>50%</b></span><span>Commission <b>50%</b></span></div>
    <main>
      <section className="en-intro" aria-labelledby="en-title"><div><p className="en-eyebrow"><i />ENTROPY / HIP-3</p><h1 id="en-title">Entropy wallet analytics</h1><p>Trading volume, execution costs and holding times for your Entropy markets.</p></div><span className="en-scope">MARKET FILTER <b>io:</b></span></section>

      <section className="en-panel en-query" aria-labelledby="en-query-heading"><div className="en-section-heading"><div><p className="en-eyebrow">01 / ACCOUNT LOOKUP</p><h2 id="en-query-heading">Analyze wallet activity</h2></div><span className="en-readonly"><i />Public data · Read only</span></div>
        <form onSubmit={analyze}><div className="en-wallet-field"><label htmlFor="en-address">Wallet address<span>0x</span></label><input id="en-address" value={address} onChange={e => edit({ address: e.target.value })} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={42} aria-invalid={Boolean(error)} aria-describedby="en-request-status" /></div><div><label htmlFor="en-period">Analysis period<span>UTC</span></label><select id="en-period" value={period} onChange={e => edit({ period: e.target.value as EntropyPeriod })}>{Object.entries(ENTROPY_PERIODS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><button type="submit" className="en-analyze" disabled={loading || !ready}>{loading ? "Loading activity…" : "Analyze activity"}<span aria-hidden="true">↗</span></button></form>
        <p id="en-request-status" className={error ? "en-error" : "en-query-help"} role={error ? "alert" : "status"}>{error || (loading ? "Loading Entropy executions, funding and current positions…" : "Only io: markets are included. Your address and period are remembered in this browser.")}</p>
      </section>

      {!report && !loading && <section className="en-empty en-panel" aria-labelledby="en-empty-heading"><div className="en-empty-symbol" aria-hidden="true"><img src="/brand/entropy/symbol.svg" alt="" width="48" height="38" /></div><h2 id="en-empty-heading">Enter a wallet to view its activity</h2><p>The analysis includes executed trades on Entropy’s io: markets. Other Hyperliquid markets and HIP-3 DEXs are excluded.</p><ul><li><span>01</span><strong>Volume and fees</strong><p>Maker and taker execution, paid fees and rebates.</p></li><li><span>02</span><strong>Holding times</strong><p>Reconstructed position durations from available fills.</p></li><li><span>03</span><strong>Markets and funding</strong><p>Market activity, funding payments and open positions.</p></li></ul></section>}
      {loading && <div className="en-loading en-panel" role="status"><span />Loading public Hyperliquid data…</div>}

      {report && <div className="en-results">
        <section className="en-summary en-panel" aria-labelledby="en-volume-heading"><div className="en-summary-top"><span className="en-eyebrow">TRADING ACTIVITY</span><span>{ENTROPY_PERIODS[report.period]} <i /> {incomplete ? "Partial history" : "Available API history"}</span></div><div className="en-summary-main"><div><h2 id="en-volume-heading">{incomplete ? "Loaded trading volume" : "Executed trading volume"}</h2><strong>{money(summary?.volume)}</strong><p>{summary ? `${number.format(summary.fills)} fills · ${report.markets.length} ${report.markets.length === 1 ? "market" : "markets"}` : "Execution history is unavailable"}</p></div><dl><div><dt>Net trading fees</dt><dd>{money(summary?.netFees)}</dd><small>Paid fees minus rebates</small></div><div><dt>Funding received − paid</dt><dd className={funding && Number(funding.net) >= 0 ? "en-positive" : undefined}>{money(funding?.net)}</dd><small>{funding ? `${money(funding.paid)} paid · ${money(funding.received)} received` : "Funding history unavailable"}</small></div><div><dt>Realized PnL before fees</dt><dd>{money(summary?.closedPnl)}</dd><small>From closing executions</small></div><div><dt>Realized result after costs</dt><dd className={report.realizedNet !== null && Number(report.realizedNet) >= 0 ? "en-positive" : undefined}>{money(report.realizedNet)}</dd><small>Realized PnL − net fees + funding</small></div></dl></div><div className="en-summary-footer"><span>{report.firstFillAt && report.lastFillAt ? `Loaded fills: ${day.format(new Date(report.firstFillAt))} – ${day.format(new Date(report.lastFillAt))}` : "No Entropy executions loaded for this period"}</span><span>Retrieved {date.format(new Date(report.fetchedAt))} UTC</span></div></section>

        {report.warnings.length > 0 && <div className="en-warning" role="status">{report.warnings.map(note => <p key={note}>{note}</p>)}</div>}

        <div className="en-analysis-grid">
          <section className="en-panel en-execution" aria-labelledby="en-execution-heading"><div className="en-section-heading"><div><p className="en-eyebrow">02 / EXECUTION</p><h2 id="en-execution-heading">Maker and taker activity</h2></div><span>{ENTROPY_PERIODS[report.period]}</span></div><div className="en-execution-bar" aria-label="Execution role by volume">{roleRows.map(row => <span className={`en-role-${row.id}`} key={row.id} style={{ width: share(row.volume, summary?.volume) }} />)}</div><div className="en-role-cards">{roleRows.map(row => {
            const fees = summary!.feesByRole[row.id];
            return <article key={row.id}><div className="en-role-heading"><h3><i className={`en-role-${row.id}`} />{row.label}</h3><span>{share(row.volume, summary?.volume)}</span></div><dl><div><dt>Volume</dt><dd>{money(row.volume)}</dd></div><div><dt>Fees paid</dt><dd>{money(fees.paid, true)}</dd></div><div><dt>Rebates</dt><dd>{money(fees.rebates, true)}</dd></div><div><dt>Net fees</dt><dd>{money(fees.net, true)}</dd></div></dl></article>;
          })}</div>{!summary && <p className="en-help">Execution history is unavailable.</p>}<p className="en-help">USDC execution fees. Builder fees are already included{Number(report.builderFeesIncluded) > 0 ? ` (${money(report.builderFeesIncluded, true)})` : ""}; they are not added a second time. Funding is separate.</p></section>

          <section className="en-panel en-holding" aria-labelledby="en-holding-heading"><div className="en-section-heading"><div><p className="en-eyebrow">03 / POSITION DURATION</p><h2 id="en-holding-heading">Holding times</h2></div><span>FIFO estimate</span></div><div className="en-holding-facts"><div><span>Average matched closed hold</span><strong>{report.holding.averageClosedHoldHours === null ? "—" : `${number.format(report.holding.averageClosedHoldHours)}h`}</strong></div><div><span>Volume held 12h+, including open</span><strong>{report.holding.status === "incomplete" ? "—" : share(report.holding.heldAtLeast12h, summary?.volume)}</strong></div></div><div className="en-holding-bar" aria-hidden="true">{report.holding.buckets.map(row => <span key={row.id} className={`en-bucket-${row.id}`} style={{ width: `${row.sharePercent}%` }} />)}</div><ul className="en-holding-list">{report.holding.buckets.map(row => <li key={row.id}><span><i className={`en-bucket-${row.id}`} />{row.label}</span><strong>{money(row.volume)}<small>{number.format(row.sharePercent)}%</small></strong></li>)}</ul>{report.holding.notes.map(note => <p className="en-help" key={note}>{note}</p>)}<p className="en-help">“Open” means still open at the scan cutoff. Missing opening history is classified as unknown.</p></section>
        </div>

        <div className="en-analysis-grid en-market-grid">
          <section className="en-panel en-markets" aria-labelledby="en-markets-heading"><div className="en-section-heading"><div><p className="en-eyebrow">04 / MARKET BREAKDOWN</p><h2 id="en-markets-heading">Trading by market</h2></div><span>{report.markets.length} markets</span></div>{report.markets.length ? <ul>{report.markets.map(row => <li key={row.market}><div><strong>{labelMarket(row.market)}<small>{row.market}</small></strong><b>{money(row.volume)}</b></div><div className="en-market-bar"><span style={{ width: share(row.volume, summary?.volume) }} /></div><p><span>{number.format(row.fills)} fills · {share(row.makerVolume, row.volume)} maker</span><span>{money(row.netFees, true)} net fees</span></p></li>)}</ul> : <p className="en-help">No Entropy executions were loaded for this period.</p>}</section>
          <section className="en-panel en-activity" aria-labelledby="en-activity-heading"><div className="en-section-heading"><div><p className="en-eyebrow">05 / ACTIVITY OVER TIME</p><h2 id="en-activity-heading">Daily trading volume</h2></div><span>Last 14 active days · UTC</span></div>{report.days.length ? <ul>{report.days.slice(-14).map(row => <li key={row.day}><span>{day.format(new Date(`${row.day}T00:00:00Z`))}</span><div className="en-day-track"><span style={{ width: `${maxDay > 0 ? Number(row.volume) / maxDay * 100 : 0}%` }} /></div><strong>{money(row.volume)}<small>{row.fills} fills</small></strong></li>)}</ul> : <p className="en-help">No active trading days in the loaded period.</p>}</section>
        </div>

        <section className="en-panel en-weeks" aria-labelledby="en-weeks-heading"><div className="en-section-heading"><div><p className="en-eyebrow">06 / WEEKLY SUMMARY</p><h2 id="en-weeks-heading">Trading by week</h2></div><span>Monday–Sunday · UTC</span></div><div className="en-table-wrap" data-lenis-prevent-horizontal><table className="en-table"><caption className="sr-only">Entropy trading volume, executions, execution role and net fees by calendar week within the selected period.</caption><thead><tr><th scope="col">Week starting</th><th scope="col">Volume</th><th scope="col">Fills</th><th scope="col">Maker share</th><th scope="col">Net fees</th><th scope="col">Realized PnL*</th></tr></thead><tbody>{report.weeks.map(row => <tr key={row.start}><th scope="row">{day.format(new Date(row.start))}</th><td>{money(row.summary.volume)}</td><td>{row.summary.fills}</td><td>{share(row.summary.makerVolume, row.summary.volume)}</td><td>{money(row.summary.netFees, true)}</td><td>{money(row.summary.closedPnl)}</td></tr>)}</tbody></table></div>{report.weeks.length === 0 && <p className="en-help">No Entropy executions in this period.</p>}<p className="en-help">* Before trading fees and funding. Weeks at the edges of your selected period may cover only part of a week.</p></section>

        <section className="en-panel en-positions" aria-labelledby="en-positions-heading"><div className="en-section-heading"><div><p className="en-eyebrow">07 / CURRENT EXPOSURE</p><h2 id="en-positions-heading">Current Entropy positions</h2></div><span>Current snapshot · io DEX</span></div>{report.account && report.account.positions.length ? <div className="en-table-wrap" data-lenis-prevent-horizontal><table className="en-table"><caption className="sr-only">Current positions on the Entropy io DEX, independent of the historical analysis period.</caption><thead><tr><th scope="col">Market</th><th scope="col">Side / size</th><th scope="col">Entry price</th><th scope="col">Position value</th><th scope="col">Unrealized PnL</th><th scope="col">Leverage</th></tr></thead><tbody>{report.account.positions.map(row => <tr key={row.market}><th scope="row">{labelMarket(row.market)}</th><td>{Number(row.size) < 0 ? "Short" : "Long"} · {number.format(Math.abs(Number(row.size)))}</td><td>{money(row.entryPrice)}</td><td>{money(row.value)}</td><td>{money(row.unrealizedPnl)}</td><td>{row.leverage === null ? "—" : `${row.leverage}×`} · {row.marginMode}</td></tr>)}</tbody></table></div> : <p className="en-help">{report.account ? "No open Entropy positions in this snapshot." : "Current positions are unavailable."}</p>}<p className="en-help">Open positions are shown at retrieval time, regardless of the selected trading period. Unrealized PnL is excluded from the realized result above.</p></section>

        <section className="en-method" aria-labelledby="en-method-heading"><div><h2 id="en-method-heading">Data sources and calculation</h2><p>Volume is the sum of price × size for each executed entry and exit. Only markets beginning with io: are included. Maker / taker uses Hyperliquid’s crossed flag. Holding times use FIFO matching and reported position checkpoints.</p><p>Hyperliquid exposes up to 10,000 recent fills across all DEXs. Older trades may be missing even in “Available history”. This page analyzes the supplied account address; subaccounts require their own address. Data comes from the <a href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint" target="_blank" rel="noopener noreferrer">public Hyperliquid Info API ↗</a>.</p><p>Your address is stored locally. The last analysis is retained in this browser tab’s session; run Analyze activity to refresh it.</p></div><button type="button" onClick={download} className="en-export">Export analysis JSON <span aria-hidden="true">↗</span></button></section>
      </div>}
    </main>
    <footer className="en-footer"><span>ENTROPY / UNOFFICIAL COMMUNITY TOOL</span><span>Public Hyperliquid data · io: markets only</span></footer>
  </div></div>;
}
