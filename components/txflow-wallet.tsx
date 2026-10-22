"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import TxflowHeader from "@/components/txflow-header";
import TxflowHolding from "@/components/txflow-holding";
import { useTxflowWallet } from "@/hooks/use-txflow-wallet";
import { parsePoints } from "@/lib/estimator";
import { TXFLOW_EPOCHS, TXFLOW_PERIODS, txflowPointsStatus, type TxflowPeriod, type TxWalletReport } from "@/lib/txflow-wallet";

const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pointCostFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const sizeFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const money = (value: string | number | null | undefined) => value == null ? "—" : moneyFormat.format(Number(value));
const signClass = (value: string | undefined) => Number(value) < 0 ? "tf-negative" : Number(value) > 0 ? "tf-positive" : "";
// Keep the most recent report across tool navigation, without persisting account data.
let recentReport: TxWalletReport | null = null;

export default function TxflowWallet({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [settings, update, ready] = useTxflowWallet();
  const { address, period } = settings;
  const [storedReport, setReport] = useState<TxWalletReport | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const normalizedAddress = address.trim().toLowerCase();
  const pointKey = `${normalizedAddress}:${period}`, pointsInput = settings.points[pointKey] ?? "";
  const epoch = period === "EPOCH_1" ? TXFLOW_EPOCHS[period] : null;
  const pointsPending = txflowPointsStatus(period) === "pending";
  const pointsLabel = pointsPending ? "S0 points" : epoch ? "S1 · Epoch 1 points" : period === "ALLTIME" ? "Total earned points" : "Points for this period";
  const report = storedReport?.address === normalizedAddress && storedReport.period === period ? storedReport : null;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (ready && recentReport?.address === normalizedAddress && recentReport.period === period && !storedReport) setReport(recentReport);
  }, [ready, normalizedAddress, period, storedReport]);

  function reset() { controller.current?.abort(); setLoading(false); setError(""); setReport(null); recentReport = null; }
  async function analyze(event: FormEvent) {
    event.preventDefault(); reset();
    if (!/^0x[0-9a-f]{40}$/.test(normalizedAddress)) { setError("Enter a valid 0x wallet address with 40 hexadecimal characters."); return; }
    const request = new AbortController(); controller.current = request; setLoading(true);
    try {
      const response = await fetch("/api/txflow/wallet", { method: "POST", cache: "no-store", signal: request.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: normalizedAddress, period }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load TxFlow wallet data.");
      if (!request.signal.aborted) { recentReport = data as TxWalletReport; setReport(recentReport); }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load TxFlow wallet data."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }

  const summary = report?.summary;
  const fullFees = report?.fillsScan.status === "complete" && summary?.excludedFeeTokens.length === 0;
  const points = pointsPending ? null : parsePoints(pointsInput), pointsValid = points !== null && points > 0;
  const pointsError = !pointsPending && Boolean(pointsInput.trim() && points === null);
  const volumeRatio = report?.fillsScan.status === "complete" && summary && pointsValid ? Number(summary.volume) / points : null;
  const feeRatio = fullFees && summary && pointsValid ? Number(summary.netFees) / points : null;
  const feeBps = summary && Number(summary.volume) > 0 && summary.excludedFeeTokens.length === 0 ? Number(summary.netFees) / Number(summary.volume) * 10_000 : null;
  const makerShare = summary && Number(summary.volume) > 0 ? Number(summary.makerVolume) / Number(summary.volume) * 100 : 0;
  const takerShare = summary && Number(summary.volume) > 0 ? Number(summary.takerVolume) / Number(summary.volume) * 100 : 0;
  const activeDays = report?.days.slice(-14) ?? [], peakDay = Math.max(1, ...activeDays.map(day => Number(day.volume)));
  const warnings = report ? [...report.warnings, ...report.fillsScan.warnings.map(warning => `Fills: ${warning}`), ...report.fundingScan.warnings.map(warning => `Funding: ${warning}`)] : [];

  function download() {
    if (!report) return;
    const payload = { ...report, manualPointsComparison: { status: txflowPointsStatus(report.period), points: pointsValid ? points : null, volumePerPoint: volumeRatio, netFillFeesPerPoint: feeRatio, note: pointsPending ? "S0 points have not been distributed. Per-point comparisons are unavailable." : "User-supplied points for the selected period; not an official conversion formula." } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `txflow-wallet-${report.address}-${report.period}-${report.fetchedAt.slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="txflow-page tf-wallet-page"><div className="tf-shell">
    <TxflowHeader initialTheme={initialTheme} active="wallet" />
    <main>
      <section className="tf-intro" aria-labelledby="tf-wallet-title"><div><p className="tf-eyebrow">[ TXFLOW / WALLET INTELLIGENCE ]</p><h1 id="tf-wallet-title">Your trades.<br /><span>In perspective.</span></h1></div><div className="tf-intro-note"><span className="tf-status"><i aria-hidden="true" />PERPETUALS ONLY</span><p>Volume, fees, funding.<br />One address. A clearer picture.</p></div></section>

      <section className="tf-wallet-query tf-panel" aria-labelledby="tf-lookup-heading">
        <div className="tf-wallet-section-title"><div><span className="tf-eyebrow">01 / LOOK UP YOUR ACCOUNT</span><h2 id="tf-lookup-heading">Start with your wallet</h2></div><span className="tf-readonly">PUBLIC DATA / READ ONLY</span></div>
        <form onSubmit={analyze} className="tf-wallet-form">
          <div className="tf-input-group"><label htmlFor="tf-wallet-address">Wallet address<span>0x</span></label><input id="tf-wallet-address" value={address} onChange={event => { reset(); update({ address: event.target.value }); }} maxLength={42} autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby="tf-wallet-status" /></div>
          <div className="tf-input-group"><label htmlFor="tf-period-points">{pointsLabel}<span>{pointsPending ? "PENDING" : "MANUAL"}</span></label><input id="tf-period-points" inputMode="decimal" autoComplete="off" maxLength={100} disabled={pointsPending} value={pointsPending ? "Not distributed yet" : pointsInput} onChange={event => update({ points: { ...settings.points, [pointKey]: event.target.value } })} aria-invalid={pointsError} aria-describedby={pointsError ? "tf-points-error" : "tf-points-period-note"} /></div>
          <div className="tf-input-group"><label htmlFor="tf-wallet-period">Season & trade period<span>UTC</span></label><select id="tf-wallet-period" value={period} onChange={event => { reset(); update({ period: event.target.value as TxflowPeriod }); }}><optgroup label="Points seasons"><option value="S0">{TXFLOW_PERIODS.S0}</option><option value="EPOCH_1">{TXFLOW_PERIODS.EPOCH_1}</option></optgroup><optgroup label="Other trade periods">{Object.entries(TXFLOW_PERIODS).filter(([value]) => value !== "S0" && value !== "EPOCH_1").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</optgroup></select></div>
          <button className="tf-analyze-button" type="submit" disabled={loading || !ready}>{loading ? "Analyzing…" : "Analyze wallet"}<span aria-hidden="true">↗</span></button>
        </form>
        <div id="tf-points-period-note" className={`tf-points-period-note ${epoch || pointsPending ? "is-epoch" : ""}`}><span aria-hidden="true">↳</span><p>{pointsPending ? <><b>S0 · All activity before 12 October 2026, 00:00 UTC</b><span>Points have not been distributed yet. Trading and holding statistics are available; per-point ratios are pending.</span></> : epoch ? <><b>{epoch.label} · {epoch.dates}</b><span>Monday 00:00 → Monday 00:00 UTC. Only trades and funding in this window count toward the comparison.</span></> : period === "ALLTIME" ? <><b>All time · S0 + S1 activity</b><span>S0 points are still pending. Compare only with a complete points total covering the same trading history.</span></> : <><b>{TXFLOW_PERIODS[period]}</b><span>Enter only points earned within this rolling trade period.</span></>}</p></div>
        {pointsError && <p id="tf-points-error" className="tf-error" role="alert">Enter a valid number of points, zero or greater.</p>}
        <div className="tf-wallet-query-footer"><p id="tf-wallet-status" role="status" className={error ? "tf-error" : "tf-help"}>{error || (loading ? "Reading executions, funding and current positions…" : "No wallet connection or signature. Your address is remembered in this browser.")}</p>{loading && <button type="button" className="tf-cancel" onClick={reset}>Cancel</button>}</div>
      </section>

      {!report && <section className="tf-wallet-empty tf-panel" aria-label="Wallet analysis overview" aria-busy={loading}><span className="tf-empty-symbol" aria-hidden="true">↗</span><div><h2>{loading ? "Tracing your activity…" : "See where your activity adds up."}</h2><p>{loading ? "Paging through public history. Larger accounts can take longer." : "Analyze a wallet to see executed volume, trading costs, market activity and open positions."}</p><div className="tf-empty-tags"><span>Trading volume</span><span>Fill fees</span><span>Funding</span><span>Positions</span></div></div></section>}

      {report && <>
        <div className="tf-wallet-report-heading"><span className="tf-eyebrow">02 / {TXFLOW_PERIODS[report.period].toUpperCase()}</span><span>Fetched {dateFormat.format(new Date(report.fetchedAt))} UTC</span><button type="button" onClick={download}>Download JSON ↗</button></div>
        {warnings.length > 0 && <div className="tf-wallet-notice" role="status">{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        <section className="tf-wallet-stats" aria-label="Trading summary">
          <article className="tf-panel"><span>Executed trading volume</span><strong>{money(summary?.volume)}</strong><p>{summary ? `${numberFormat.format(summary.fills)} fills` : "Execution history unavailable"}<b className={`tf-data-badge ${report.fillsScan.status}`}>{report.fillsScan.status === "complete" ? "All pages read" : report.fillsScan.status === "partial" ? "Partial history" : "Unavailable"}</b></p></article>
          <article className="tf-panel"><span>Net fill fees · USDC</span><strong>{money(summary?.netFees)}</strong><p>{feeBps === null ? "Paid fees minus rebates" : `${numberFormat.format(feeBps)} bps effective fee`}{summary && <small>Paid {money(summary.feesPaid)} · Rebates {money(summary.rebates)}</small>}</p></article>
          <article className="tf-panel"><span>Realized PnL from fills</span><strong className={signClass(summary?.closedPnl)}>{money(summary?.closedPnl)}</strong><p>Sum of reported closed PnL<small>Fill fees and funding shown separately</small></p></article>
          <article className="tf-panel"><span>Net funding received</span><strong className={signClass(report.funding?.net)}>{money(report.funding?.net)}</strong><p>{report.funding ? `${numberFormat.format(report.funding.count)} settlements` : "Funding history unavailable"}<b className={`tf-data-badge ${report.fundingScan.status}`}>{report.fundingScan.status === "complete" ? "All pages read" : report.fundingScan.status === "partial" ? "Partial history" : "Unavailable"}</b></p></article>
        </section>
        <p className="tf-wallet-scope-note">{report.range.from ? `${dateFormat.format(new Date(report.range.from))} → ${dateFormat.format(new Date(report.range.to))} UTC` : `${report.range.endExclusive ? "All indexed history before" : "All indexed history through"} ${dateFormat.format(new Date(report.range.to))} UTC`} · All monetary values in USDC. {report.fillsScan.status !== "complete" && "Fill totals cover only successfully read rows."}</p>

        <div className="tf-wallet-analysis-grid">
          <section className="tf-wallet-card tf-panel" aria-labelledby="tf-liquidity-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">EXECUTION PROFILE</span><h2 id="tf-liquidity-heading">How you trade</h2></div></div>
            <div className="tf-liquidity-bar" aria-hidden="true"><span style={{ width: `${makerShare}%` }} /><span style={{ width: `${takerShare}%` }} /></div><dl className="tf-wallet-definition"><div><dt><i className="tf-maker-dot" />Maker volume</dt><dd>{money(summary?.makerVolume)}<small>{summary ? `${numberFormat.format(makerShare)}%` : "—"}</small></dd></div><div><dt><i className="tf-taker-dot" />Taker volume</dt><dd>{money(summary?.takerVolume)}<small>{summary ? `${numberFormat.format(takerShare)}%` : "—"}</small></dd></div>{summary && Number(summary.unknownRoleVolume) > 0 && <div><dt>Unclassified volume</dt><dd>{money(summary.unknownRoleVolume)}</dd></div>}</dl><p className="tf-help">Liquidity role comes from each fill. Missing roles remain unclassified.</p>
          </section>
          <section className="tf-wallet-card tf-panel" aria-labelledby="tf-points-comparison-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">{pointsPending ? "S0 / POINTS PENDING" : epoch ? "S1 · EPOCH 1 / POINTS EFFICIENCY" : "MATCHED PERIOD / POINTS EFFICIENCY"}</span><h2 id="tf-points-comparison-heading">Your trades → your points</h2></div></div><div className="tf-earned-points"><span>{pointsLabel}</span><strong>{pointsPending ? "Pending" : points !== null ? numberFormat.format(points) : "—"}{!pointsPending && <small>PTS</small>}</strong></div>
            <div className="tf-wallet-ratios"><div><span>Volume / point</span><strong>{money(volumeRatio)}</strong></div><div><span>Net fill fees / point</span><strong>{feeRatio === null ? "—" : pointCostFormat.format(feeRatio)}</strong></div></div><p className="tf-help">{pointsPending ? "S0 points have not been distributed. Per-point comparisons will be available after distribution." : <>{epoch ? "Based only on executions from 12 October 00:00 to 19 October 00:00 UTC." : "Based on the selected trade period."} {points === 0 ? "Per-point ratios are unavailable for zero points." : !pointsValid ? "Enter your earned points above to see your ratios." : ""} Ratios require complete fill history and describe past activity, not an official points formula.</>}</p>
          </section>
        </div>

        <TxflowHolding analysis={report.holding} />

        <details className="tf-daily-activity tf-panel" key={report.fetchedAt}>
          <summary><div><span className="tf-eyebrow">03 / ACTIVITY OVER TIME</span><h2>Daily activity</h2></div><span className="tf-daily-description">Volume, fills & net fees</span><span className="tf-daily-toggle" aria-hidden="true" /></summary>
          <div className="tf-daily-content"><p className="tf-readonly">MOST RECENT 14 ACTIVE DAYS IN THE SELECTED PERIOD · UTC</p>
            {activeDays.length ? <div className="tf-daily-chart">{activeDays.map(day => <div className="tf-daily-row" key={day.day}><span>{day.day.slice(5)}</span><div className="tf-daily-track"><span style={{ width: `${Number(day.volume) / peakDay * 100}%` }} /></div><strong>{money(day.volume)}<small>{day.fills} fills · {money(day.netFees)} net fees</small></strong></div>)}</div> : <p className="tf-help">{report.fillsScan.status === "unavailable" ? "Trade activity is unavailable." : "No fills were returned for this period."}</p>}
          </div>
        </details>

        <section className="tf-wallet-card tf-panel" aria-labelledby="tf-markets-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">04 / MARKET BREAKDOWN</span><h2 id="tf-markets-heading">Where you trade</h2></div><span className="tf-readonly">{report.markets.length} MARKETS</span></div>
          <p className="tf-wallet-table-hint">Swipe to view all columns →</p>
          <div className="tf-wallet-table-wrap" data-lenis-prevent-horizontal><table className="tf-wallet-table"><caption className="sr-only">Executed trading activity by market in the selected period</caption><thead><tr><th scope="col">Market</th><th scope="col">Volume</th><th scope="col">Net fill fees</th><th scope="col">Realized PnL</th><th scope="col">Fills</th></tr></thead><tbody>{report.markets.map(market => <tr key={market.market}><th scope="row">{market.market}</th><td>{money(market.volume)}</td><td>{money(market.netFees)}</td><td className={signClass(market.closedPnl)}>{money(market.closedPnl)}</td><td>{numberFormat.format(market.fills)}</td></tr>)}</tbody></table></div>{!report.markets.length && <p className="tf-help">No market activity available for this period.</p>}
        </section>

        <section className="tf-wallet-card tf-panel" aria-labelledby="tf-positions-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">05 / CURRENT ACCOUNT</span><h2 id="tf-positions-heading">Open positions</h2></div><span className="tf-readonly">LIVE SNAPSHOT / INDEPENDENT OF PERIOD</span></div>
          <dl className="tf-account-stats"><div><dt>Account equity</dt><dd>{money(report.account?.equity)}</dd></div><div><dt>Withdrawable</dt><dd>{money(report.account?.withdrawable)}</dd></div><div><dt>Margin used</dt><dd>{money(report.account?.marginUsed)}</dd></div><div><dt>Open notional</dt><dd>{money(report.account?.positionValue)}</dd></div></dl>
          <p className="tf-wallet-table-hint">Swipe to view all columns →</p>
          <div className="tf-wallet-table-wrap" data-lenis-prevent-horizontal><table className="tf-wallet-table tf-positions-table"><caption className="sr-only">Current open perpetual positions, independent of the selected history period</caption><thead><tr><th scope="col">Market / side</th><th scope="col">Size / leverage</th><th scope="col">Entry / mark</th><th scope="col">Notional</th><th scope="col">Unrealized PnL</th><th scope="col">Liq. price</th></tr></thead><tbody>{report.account?.positions.map(position => <tr key={position.market}><th scope="row">{position.market}<small className={Number(position.size) < 0 ? "tf-negative" : "tf-positive"}>{Number(position.size) < 0 ? "SHORT" : "LONG"}</small></th><td>{sizeFormat.format(Math.abs(Number(position.size)))}<small>{position.leverage === null ? "—" : `${position.leverage}×`} · {position.marginMode}</small></td><td>{money(position.entryPrice)}<small>{money(position.markPrice)}</small></td><td>{money(position.value)}</td><td className={signClass(position.unrealizedPnl)}>{money(position.unrealizedPnl)}</td><td>{Number(position.liquidationPrice) > 0 ? money(position.liquidationPrice) : "—"}</td></tr>)}</tbody></table></div>{!report.account?.positions.length && <p className="tf-help">{report.account ? "No open perpetual positions." : "Current positions could not be loaded."}</p>}
        </section>

        <details className="tf-wallet-method tf-panel">
          <summary>{pointsPending ? "S0 accounting, funding & methodology" : epoch ? "Epoch accounting, funding & methodology" : "API overview, funding & methodology"} <span aria-hidden="true">＋</span></summary>
          <div className="tf-wallet-method-content">
            {pointsPending ? <div><h3>S0 · Before Season 1</h3><p className="tf-help">S0 includes all indexed executions and funding before 12 October 2026, 00:00 UTC. Events exactly at that boundary belong to S1 · Epoch 1.</p><p className="tf-help">S0 points have not been distributed yet. Missing points are pending, not zero. Holding times are reconstructed at the S0 cutoff; later S1 closes do not change that earlier mix. Current positions remain a separate snapshot.</p></div> : epoch ? <div><h3>S1 · Epoch 1 · Monday to Monday</h3><p className="tf-help">The window starts at 12 October 2026, 00:00 UTC and ends at 19 October 2026, 00:00 UTC. Executions and funding at the ending boundary belong to the next epoch.</p><p className="tf-help">Epoch totals come from the dated execution and funding records. Rolling-window API overview figures are not used for this fixed week. Current equity and open positions are a separate snapshot.</p></div> : <div>
              <h3>TxFlow period overview</h3><dl className="tf-wallet-definition"><div><dt>API traded volume</dt><dd>{money(report.overview?.volume)}</dd></div><div><dt>API period PnL</dt><dd>{money(report.overview?.pnl)}</dd></div><div><dt>Return on equity</dt><dd>{report.overview ? `${numberFormat.format(Number(report.overview.roe))}%` : "—"}</dd></div><div><dt>Max. drawdown</dt><dd>{report.overview?.maxDrawdown == null ? "—" : `${numberFormat.format(Number(report.overview.maxDrawdown))}%`}</dd></div></dl><p className="tf-help">API overview figures are separate aggregates and may lag executions. API PnL and realized fill PnL use different accounting; they are not added together.</p>
            </div>}
            <div><h3>Funding cash flow</h3><dl className="tf-wallet-definition"><div><dt>Funding paid</dt><dd>{money(report.funding?.paid)}</dd></div><div><dt>Funding received</dt><dd>{money(report.funding?.received)}</dd></div><div><dt>Net received</dt><dd>{money(report.funding?.net)}</dd></div></dl><p className="tf-help">Positive funding is received; negative is paid. Funding remains separate from fill fees and closed PnL.</p></div>
            <p className="tf-help tf-method-wide">Perpetual accounts only. Volume sums executed size × price for every fill leg; both opening and closing executions count. Fees and rebates are summed in USDC; other fee tokens are excluded and flagged. History is paged with a fixed end time, deduplicated by execution identity, and capped at 20 pages per history type / 50 seconds. Partial or unavailable histories are labelled. Monetary sums use 18 decimal places internally, with rounding for display. Indexed history may lag the latest block. <a href="https://docs.txflow.com/api/info" target="_blank" rel="noopener noreferrer">TxFlow Info API ↗</a></p>
          </div>
        </details>
      </>}
    </main>
    <footer className="tf-footer"><span>TXFLOW / UNOFFICIAL COMMUNITY WALLET ANALYTICS</span><a href="https://docs.txflow.com/api/info" target="_blank" rel="noopener noreferrer">TxFlow API documentation ↗</a></footer>
  </div></div>;
}
