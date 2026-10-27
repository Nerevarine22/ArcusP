"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import TxflowHeader from "@/components/txflow-header";
import TxflowHolding from "@/components/txflow-holding";
import TxflowEpochInputs from "@/components/txflow-epoch-inputs";
import TxflowEpochAnalysis from "@/components/txflow-epoch-analysis";
import { useTxflowWallet } from "@/hooks/use-txflow-wallet";
import ResearchSharing from "@/components/research-sharing";
import { useResearchSharing } from "@/hooks/use-research-sharing";
import { RESEARCH_CONSENT } from "@/lib/research-data";
import { parsePoints, sumPointInputs } from "@/lib/estimator";
import { TXFLOW_EPOCHS, TXFLOW_PERIODS, txflowReceivedEpochs, type TxflowEpochId, type TxflowPeriod, type TxWalletReport } from "@/lib/txflow-wallet";

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
  const [shareResearch, setShareResearch] = useResearchSharing();
  const [settings, update, ready] = useTxflowWallet();
  const { address, period } = settings;
  const [storedReport, setReport] = useState<TxWalletReport | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const normalizedAddress = address.trim().toLowerCase();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const received = txflowReceivedEpochs(settings, normalizedAddress, now);
  const receiptKey = received.join(",");
  const report = storedReport?.address === normalizedAddress && storedReport.period === period && (period !== "AWARDED" || storedReport.awardedEpochs?.join(",") === receiptKey) ? storedReport : null;
  const epochIds: TxflowEpochId[] = period === "AWARDED" ? received : period === "S1" ? ["EPOCH_1", "EPOCH_2"] : Object.hasOwn(TXFLOW_EPOCHS, period) ? [period as TxflowEpochId] : [];
  const aggregateInput = period === "AWARDED" || (!epochIds.length && period !== "ALLTIME");
  const pointsInput = settings.points[`${normalizedAddress}:${period}`] ?? "";
  const epochPoints = epochIds.map(id => parsePoints(settings.points[`${normalizedAddress}:${id}`] ?? ""));
  const calculatedTotal = period === "AWARDED" ? sumPointInputs(epochIds.map(id => settings.points[`${normalizedAddress}:${id}`] ?? "")) : null;
  const points = calculatedTotal !== null ? calculatedTotal : aggregateInput ? parsePoints(pointsInput) : epochPoints.length && epochPoints.every(value => value !== null) ? epochPoints.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const pointsPending = epochIds.some((id, index) => !received.includes(id) && epochPoints[index] === null);
  const pointsLabel = period === "AWARDED" ? "Total points for included epochs" : period === "S1" ? "Season 1 points · both epochs" : period === "ALLTIME" ? "Compare points by epoch above" : "Points for this trade period";
  const pointsValid = points !== null && points > 0 && period !== "ALLTIME" && !pointsPending;
  const displayedEpochPoints = period === "AWARDED" && report?.epochs.length === 1
    ? { ...settings.points, [`${normalizedAddress}:${report.epochs[0].id}`]: points === null ? pointsInput : String(points) }
    : settings.points;
  const note = period === "AWARDED" ? { title: "Only epochs with received points", text: `${received.map(id => TXFLOW_EPOCHS[id].label).join(" + ") || "No distributions selected"}. Unawarded activity is excluded. Confirm new distributions only after you receive the points.` }
    : period === "S1" ? { title: "Season 1 · two separate epoch comparisons", text: "Epoch 1: 12–19 October. Epoch 2: 20–26 October. Enter points for each epoch separately, including pending distributions. Ratios use trades available through the scan cutoff." }
    : period === "ALLTIME" ? { title: "All available trading history", text: "Includes activity before, during and after the listed epochs, even when points are pending. Per-point comparisons use matching epoch trades below." }
    : epochIds.length ? { title: `${TXFLOW_EPOCHS[epochIds[0]].label} · ${TXFLOW_EPOCHS[epochIds[0]].dates}`, text: "Epoch boundaries use UTC, including the entire final calendar day. Manual points can be entered before distribution; ratios use the available trading history." }
    : { title: TXFLOW_PERIODS[period], text: "Enter only points earned within this rolling trade period." };
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (ready && recentReport?.address === normalizedAddress && recentReport.period === period && recentReport.epochs && !storedReport) setReport(recentReport);
  }, [ready, normalizedAddress, period, storedReport]);

  function reset() { controller.current?.abort(); setLoading(false); setError(""); setReport(null); recentReport = null; }
  async function analyze(event: FormEvent) {
    event.preventDefault(); reset();
    if (!/^0x[0-9a-f]{40}$/.test(normalizedAddress)) { setError("Enter a valid 0x wallet address with 40 hexadecimal characters."); return; }
    const request = new AbortController(); controller.current = request; setLoading(true);
    try {
      const response = await fetch("/api/txflow/wallet", { method: "POST", cache: "no-store", signal: request.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: normalizedAddress, period, awardedEpochs: received,
        ...(shareResearch ? { research: { consent: true, version: RESEARCH_CONSENT,
          totalPoints: points === null ? "" : String(points),
          points: Object.fromEntries(Object.keys(TXFLOW_EPOCHS).map(id => [id, settings.points[`${normalizedAddress}:${id}`] ?? ""])) } } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load TxFlow wallet data.");
      if (!request.signal.aborted) { recentReport = data as TxWalletReport; setReport(recentReport); }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load TxFlow wallet data."); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }

  const summary = report?.summary;
  const fullFees = report?.fillsScan.status === "complete" && summary?.excludedFeeTokens.length === 0;
  const volumeRatio = report?.fillsScan.status === "complete" && summary && pointsValid ? Number(summary.volume) / points : null;
  const feeRatio = fullFees && summary && pointsValid ? Number(summary.netFees) / points : null;
  const feeBps = summary && Number(summary.volume) > 0 && summary.excludedFeeTokens.length === 0 ? Number(summary.netFees) / Number(summary.volume) * 10_000 : null;
  const makerShare = summary && Number(summary.volume) > 0 ? Number(summary.makerVolume) / Number(summary.volume) * 100 : 0;
  const takerShare = summary && Number(summary.volume) > 0 ? Number(summary.takerVolume) / Number(summary.volume) * 100 : 0;
  const activeDays = report?.days.slice(-14) ?? [], peakDay = Math.max(1, ...activeDays.map(day => Number(day.volume)));
  const warnings = report ? [...report.warnings, ...report.fillsScan.warnings.map(warning => `Fills: ${warning}`), ...report.fundingScan.warnings.map(warning => `Funding: ${warning}`)] : [];

  function download() {
    if (!report) return;
    const payload = { ...report, manualPointsComparison: { status: pointsPending ? "pending" : "manual", source: calculatedTotal === null ? "manual-total" : "epoch-sum", receivedEpochs: received, epochPoints: Object.fromEntries(report.epochs.map(epoch => [epoch.id, parsePoints(settings.points[`${report.address}:${epoch.id}`] ?? "")])), points: pointsValid ? points : null, volumePerPoint: volumeRatio, netFillFeesPerPoint: feeRatio, note: pointsPending ? "Some selected epochs have not received points. Combined per-point comparisons are unavailable." : "User-supplied points for the selected period; not an official conversion formula." } };
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
          <div className="tf-input-group"><label htmlFor="tf-wallet-period">Analysis scope<span>UTC</span></label><select id="tf-wallet-period" value={period} onChange={event => { reset(); update({ period: event.target.value as TxflowPeriod }); }}><optgroup label="Overview"><option value="AWARDED">{TXFLOW_PERIODS.AWARDED}</option><option value="ALLTIME">{TXFLOW_PERIODS.ALLTIME}</option></optgroup><optgroup label="Seasons"><option value="S1">{TXFLOW_PERIODS.S1}</option><option value="S0">{TXFLOW_PERIODS.S0}</option></optgroup><optgroup label="Individual epochs"><option value="EPOCH_1">{TXFLOW_PERIODS.EPOCH_1}</option><option value="EPOCH_2">{TXFLOW_PERIODS.EPOCH_2}</option></optgroup><optgroup label="Rolling trade periods">{["24H", "7D", "30D", "90D"].map(value => <option value={value} key={value}>{TXFLOW_PERIODS[value as TxflowPeriod]}</option>)}</optgroup></select></div>
          <TxflowEpochInputs settings={settings} address={normalizedAddress} now={now} onPoints={(id, value) => update({ points: { ...settings.points, [`${normalizedAddress}:${id}`]: value, ...(Object.hasOwn(TXFLOW_EPOCHS, id) ? { [`${normalizedAddress}:AWARDED`]: "" } : {}) } })} onReceived={(id, value) => { reset(); update({ received: { ...settings.received, [`${normalizedAddress}:${id}`]: value }, points: { ...settings.points, [`${normalizedAddress}:AWARDED`]: "" } }); }} />
          <button className="tf-analyze-button" type="submit" disabled={loading || !ready}>{loading ? "Analyzing…" : "Analyze wallet"}<span aria-hidden="true">↗</span></button>
          <ResearchSharing checked={shareResearch} onChange={setShareResearch} status={report?.research} />
        </form>
        <div id="tf-points-period-note" className="tf-points-period-note is-epoch"><span aria-hidden="true">↳</span><p><b>{note.title}</b><span>{note.text}</span></p></div>
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
        <p className="tf-wallet-scope-note">{report.windows.map((window, index) => <span key={index}>{index > 0 && " + "}{window.from ? dateFormat.format(new Date(window.from)) : "All indexed history"} → {dateFormat.format(new Date(Date.parse(window.to) - (window.endExclusive ? 1 : 0)))} UTC</span>)} · All monetary values in USDC. {report.fillsScan.status !== "complete" && "Fill totals cover only successfully read rows."}</p>

        {report.epochs.length > 0 ? <TxflowEpochAnalysis key={`epochs:${report.fetchedAt}`} report={report} points={displayedEpochPoints} received={received} /> : <TxflowHolding analysis={report.holding} />}

        <div className="tf-wallet-analysis-grid">
          <section className="tf-wallet-card tf-panel" aria-labelledby="tf-liquidity-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">EXECUTION PROFILE</span><h2 id="tf-liquidity-heading">How you trade</h2></div></div>
            <div className="tf-liquidity-bar" aria-hidden="true"><span style={{ width: `${makerShare}%` }} /><span style={{ width: `${takerShare}%` }} /></div><dl className="tf-wallet-definition"><div><dt><i className="tf-maker-dot" />Maker volume</dt><dd>{money(summary?.makerVolume)}<small>{summary ? `${numberFormat.format(makerShare)}%` : "—"}</small></dd></div><div><dt><i className="tf-taker-dot" />Taker volume</dt><dd>{money(summary?.takerVolume)}<small>{summary ? `${numberFormat.format(takerShare)}%` : "—"}</small></dd></div>{summary && Number(summary.unknownRoleVolume) > 0 && <div><dt>Unclassified volume</dt><dd>{money(summary.unknownRoleVolume)}</dd></div>}</dl><p className="tf-help">Liquidity role comes from each fill. Missing roles remain unclassified.</p>
          </section>
          <section className="tf-wallet-card tf-panel" aria-labelledby="tf-points-comparison-heading"><div className="tf-wallet-section-title"><div><span className="tf-eyebrow">{pointsPending ? "DISTRIBUTION PENDING" : "MATCHED PERIOD / POINTS EFFICIENCY"}</span><h2 id="tf-points-comparison-heading">Your trades → your points</h2></div></div><div className="tf-earned-points"><span>{pointsLabel}</span><strong>{pointsPending ? "Pending" : points !== null ? numberFormat.format(points) : "—"}{!pointsPending && <small>PTS</small>}</strong></div>
            <div className="tf-wallet-ratios"><div><span>Volume / point</span><strong>{money(volumeRatio)}</strong></div><div><span>Net fill fees / point</span><strong>{feeRatio === null ? "—" : pointCostFormat.format(feeRatio)}</strong></div></div><p className="tf-help">{period === "ALLTIME" ? "All history includes unawarded and ongoing activity. Use separate epoch comparisons above for matching point ratios." : pointsPending ? "Enter points for every selected epoch to calculate combined ratios. Pending distributions accept manual values too." : <>Based on your manual points and trades through the scan cutoff. {!pointsValid ? "Enter positive points above to see your ratios. " : ""}Ratios require complete fill history and describe past activity, not an official points formula.</>}</p>
          </section>
        </div>

        {report.epochs.length > 1 && <details className="tf-wallet-method tf-panel"><summary>Whole-period holding profile <span aria-hidden="true">＋</span></summary><TxflowHolding analysis={report.holding} /></details>}

        <details className="tf-daily-activity tf-panel" key={`daily:${report.fetchedAt}`}>
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
          <summary>Epoch accounting, funding & methodology <span aria-hidden="true">＋</span></summary>
          <div className="tf-wallet-method-content">
            <div><h3>Matching trades and points</h3><p className="tf-help">Season 0 ends before 12 October 2026, 00:00 UTC. S1 Epoch 1 includes 12–19 October; Epoch 2 includes 20–26 October. Each final day is included through 23:59:59.999 UTC.</p><p className="tf-help">Only confirmed received distributions enter the awarded-epochs scan. Expected dates do not automatically mark points as received. Points are entered by you and saved per address and epoch. Activity outside these windows remains visible in all-history analysis.</p><p className="tf-help">Holding times are reconstructed at each epoch's cutoff; a later close does not rewrite that earlier profile. Current equity and open positions remain an independent snapshot.</p>{report.overview && <p className="tf-help">API overview volume: {money(report.overview.volume)}. Separate aggregates may lag executions and are not added to fill totals.</p>}</div>
            <div><h3>Funding cash flow</h3><dl className="tf-wallet-definition"><div><dt>Funding paid</dt><dd>{money(report.funding?.paid)}</dd></div><div><dt>Funding received</dt><dd>{money(report.funding?.received)}</dd></div><div><dt>Net received</dt><dd>{money(report.funding?.net)}</dd></div></dl><p className="tf-help">Positive funding is received; negative is paid. Funding remains separate from fill fees and closed PnL.</p></div>
            <p className="tf-help tf-method-wide">Perpetual accounts only. Volume sums executed size × price for every fill leg; both opening and closing executions count. Fees and rebates are summed in USDC; other fee tokens are excluded and flagged. History is paged with a fixed end time, deduplicated by execution identity, and capped at 20 pages per history type / 50 seconds. Partial or unavailable histories are labelled. Monetary sums use 18 decimal places internally, with rounding for display. Indexed history may lag the latest block. <a href="https://docs.txflow.com/api/info" target="_blank" rel="noopener noreferrer">TxFlow Info API ↗</a></p>
          </div>
        </details>
      </>}
    </main>
    <footer className="tf-footer"><span>TXFLOW / UNOFFICIAL COMMUNITY WALLET ANALYTICS</span><a href="https://docs.txflow.com/api/info" target="_blank" rel="noopener noreferrer">TxFlow API documentation ↗</a></footer>
  </div></div>;
}
