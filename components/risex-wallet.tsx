"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import RisexHeader from "@/components/risex-header";
import RisexEpochCards, { risexEpochStatus } from "@/components/risex-epoch-cards";
import { parsePoints, sumPointInputs } from "@/lib/estimator";
import { risexEpochs, risexRollingDays, risexScopeEpochs, risexScopes } from "@/lib/risex-epochs";
import { isRisexWallet } from "@/lib/risex-points";
import type { RisexReport } from "@/lib/risex-wallet";

const addressKey = "risex-wallet-address";
const reportKey = "risex-wallet-report-v3";
const scopeKey = "risex-wallet-scope";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fees = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const money = (value: string | number | null | undefined, precise = false) => value == null ? "—" : (precise ? fees : usd).format(Number(value));
const pointsKey = (address: string, period: string) => `risex-wallet-points:${address}:${period}`;
const emptyActivity = { summary: null, funding: null, holding: null, markets: [], days: [] };

function readLocal(key: string) {
  try { return localStorage.getItem(key) ?? ""; }
  catch { return ""; }
}

function remember(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { /* Keep the current input usable without storage. */ }
}

function savedPoints(address: string, epochIds: string[], otherPeriods: string[] = []) {
  try {
    const periods = [...epochIds, ...Object.keys(risexRollingDays), ...otherPeriods];
    return Object.fromEntries(periods.map(period => {
      const value = localStorage.getItem(pointsKey(address, period));
      const calendarWeek = period.startsWith("epoch:") ? localStorage.getItem(pointsKey(address, period.slice(6))) : null;
      return [period, value ?? calendarWeek ?? ""];
    }));
  } catch { return {}; }
}

function preferredEpoch(epochs: RisexReport["epochs"]) {
  const completed = epochs.filter(epoch => epoch.status === "completed").reverse();
  return completed.find(epoch => (epoch.activity?.summary?.fills ?? 0) > 0) ?? completed[0] ?? epochs[0];
}

export default function RisexWallet() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState<RisexReport | null>(null);
  const [scope, setScope] = useState("awarded");
  const [selectedEpochId, setSelectedEpochId] = useState("");
  const [now, setNow] = useState(0);
  const [pointsByPeriod, setPointsByPeriod] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedAddress = readLocal(addressKey);
    const started = Date.now();
    const savedScope = readLocal(scopeKey);
    setNow(started);
    setAddress(savedAddress);
    if (savedScope && (Object.hasOwn(risexScopes, savedScope) || savedScope === "preseason" || /^(?:epoch:)?\d+$/.test(savedScope))) setScope(savedScope);
    setPointsByPeriod(savedPoints(savedAddress, risexEpochs(started, null).map(epoch => epoch.id)));
    try {
      const saved = JSON.parse(sessionStorage.getItem(reportKey) ?? "null") as RisexReport | null;
      if (saved?.version === 3 && saved.address === savedAddress.trim().toLowerCase()) {
        setReport(saved);
        setPointsByPeriod(savedPoints(saved.address, saved.epochs.map(epoch => epoch.id), saved.weeks.map(week => String(week.from))));
      }
    } catch { /* A fresh scan can always be started. */ }
    return () => requestRef.current?.abort();
  }, []);

  function editAddress(value: string) {
    requestRef.current?.abort();
    setLoading(false);
    setError("");
    setAddress(value);
    setReport(null);
    setSelectedEpochId("");
    setPointsByPeriod(savedPoints(value.trim().toLowerCase(), risexEpochs(Date.now(), null).map(epoch => epoch.id)));
  }

  function changeScope(value: string) {
    setScope(value);
    setSelectedEpochId("");
    remember(scopeKey, value);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = address.trim().toLowerCase();
    if (!isRisexWallet(account)) {
      setError("Enter a valid 0x wallet address.");
      return;
    }
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    setError("");
    setReport(null);
    remember(addressKey, account);
    try {
      const response = await fetch(`/api/risex/wallet?account=${encodeURIComponent(account)}`, { signal: request.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "RISEx activity could not be loaded.");
      if (!request.signal.aborted) {
        const nextReport = data as RisexReport;
        setReport(nextReport);
        setSelectedEpochId("");
        const stored = savedPoints(account, nextReport.epochs.map(epoch => epoch.id), nextReport.weeks.map(week => String(week.from)));
        setPointsByPeriod(previous => ({ ...stored, ...previous }));
        try { sessionStorage.setItem(reportKey, JSON.stringify(data)); } catch { /* The active result remains available. */ }
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "RISEx activity could not be loaded.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  const epochs = report?.epochs ?? (now > 0 ? risexEpochs(now, null) : []);
  const otherWeeks = report?.weeks.filter(week => !epochs.some(epoch => epoch.from === week.from && epoch.to === week.end)) ?? [];
  const activeScope = Object.hasOwn(risexScopes, scope) || epochs.some(epoch => epoch.id === scope) || otherWeeks.some(week => String(week.from) === scope) ? scope : "awarded";
  const isCombined = activeScope === "awarded" || activeScope === "season1";
  const scopedEpochs = report ? risexScopeEpochs(report.epochs, activeScope) : [];
  const pendingEpochs = isCombined ? report?.epochs.filter(epoch => epoch.status === "in-progress" || epoch.status === "awaiting-drop") ?? [] : [];
  const shownEpochs = [...scopedEpochs, ...pendingEpochs];
  const selectedEpoch = shownEpochs.find(epoch => epoch.id === selectedEpochId) ?? preferredEpoch(shownEpochs);
  const selectedWeek = otherWeeks.find(week => String(week.from) === activeScope);
  const scopeActivity = activeScope === "all" ? report?.total
    : isCombined ? report?.[activeScope]
      : Object.hasOwn(risexRollingDays, activeScope) ? report?.rolling[activeScope as keyof typeof risexRollingDays]
        : scopedEpochs[0]?.activity ?? selectedWeek;
  const activity = selectedEpoch ? selectedEpoch.activity ?? emptyActivity : scopeActivity ?? emptyActivity;
  const summary = activity.summary;
  const scopeSummary = scopeActivity?.summary;
  const scopeTitle = risexScopes[activeScope as keyof typeof risexScopes] ?? scopedEpochs[0]?.label
    ?? (selectedWeek ? day.formatRange(selectedWeek.from, selectedWeek.end - 1) : epochs.find(epoch => epoch.id === activeScope)?.label ?? "");
  const periodTitle = selectedEpoch?.label ?? scopeTitle;
  const manualPeriod = activeScope !== "all" && (Object.hasOwn(risexRollingDays, activeScope) || Boolean(selectedWeek));
  const account = address.trim().toLowerCase();
  const pointsInput = pointsByPeriod[selectedEpoch?.id ?? activeScope] ?? "";
  const points = parsePoints(pointsInput);
  const invalidPoints = pointsInput.trim() !== "" && points === null;
  const validRatios = report?.tradesStatus === "complete" && summary && points !== null && points > 0
    && (selectedEpoch ? selectedEpoch.status === "completed" : manualPeriod);
  const combinedPoints = isCombined ? sumPointInputs(scopedEpochs.map(epoch => pointsByPeriod[epoch.id] ?? "")) : null;
  const validCombinedRatios = report?.tradesStatus === "complete" && !!scopeSummary && combinedPoints !== null && combinedPoints > 0;
  const daily = scopeActivity?.days ?? [];
  const maxDailyVolume = Math.max(1, ...daily.map(item => Number(item.volume)));
  const roleRows = summary && [
    { id: "maker", label: "Maker", volume: summary.makerVolume, fees: summary.feesByRole.maker },
    { id: "taker", label: "Taker", volume: summary.takerVolume, fees: summary.feesByRole.taker },
    ...(Number(summary.unknownRoleVolume) > 0 ? [{ id: "unknown", label: "Unclassified", volume: summary.unknownRoleVolume, fees: summary.feesByRole.unknown }] : []),
  ];
  const roleShare = (volume: string) => Number(summary?.volume) > 0 ? Number(volume) / Number(summary?.volume) * 100 : 0;

  function updatePoints(id: string, value: string) {
    setPointsByPeriod(previous => ({ ...previous, [id]: value }));
    remember(pointsKey(account, id), value);
  }

  return <div className="rx-page rx-wallet-page"><div className="rx-shell">
    <RisexHeader tool="wallet" />
    <main>
      <section className="rx-intro" aria-labelledby="rx-wallet-title">
        <div className="rx-intro-copy">
          <p className="rx-eyebrow">RISEX / COMMUNITY TOOLS</p>
          <h1 id="rx-wallet-title">RISEx <span>wallet analytics</span></h1>
          <p>Review trades, execution fees, holding times, settled funding and open positions for a RISEx address.</p>
        </div>
        <span className="rx-projection">Public account data</span>
      </section>

      <section className="rx-panel rx-wallet-query" aria-labelledby="rx-query-title">
        <p className="rx-eyebrow">01 / ACCOUNT LOOKUP</p>
        <h2 id="rx-query-title">Analyze wallet activity</h2>
        <form className="rx-field rx-wallet-form" onSubmit={analyze}>
          <div>
            <label htmlFor="rx-wallet-address">Wallet address</label>
            <input id="rx-wallet-address" value={address} onChange={event => editAddress(event.target.value)}
              placeholder="0x…" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64}
              aria-describedby="rx-scan-status" />
          </div>
          <div className="rx-field rx-scope-field">
            <label htmlFor="rx-wallet-period">Analysis scope<span>UTC</span></label>
            <select id="rx-wallet-period" value={activeScope} onChange={event => changeScope(event.target.value)}>
              <optgroup label="Overview"><option value="awarded">{risexScopes.awarded}</option><option value="all">{risexScopes.all}</option></optgroup>
              <optgroup label="Seasons"><option value="season1">{risexScopes.season1}</option>
                {epochs.some(epoch => epoch.id === "preseason") && <option value="preseason">Pre-season · Retro</option>}
              </optgroup>
              {epochs.some(epoch => epoch.from !== null) && <optgroup label="Points epochs">
                {epochs.filter(epoch => epoch.from !== null).map(epoch => <option key={epoch.id} value={epoch.id}>{epoch.label}</option>)}
              </optgroup>}
              <optgroup label="Rolling trade periods">{Object.keys(risexRollingDays).map(id =>
                <option key={id} value={id}>{risexScopes[id as keyof typeof risexRollingDays]}</option>)}</optgroup>
              {otherWeeks.length > 0 && <optgroup label="Other calendar weeks">{otherWeeks.map(week =>
                <option key={week.from} value={String(week.from)}>{day.formatRange(week.from, week.end - 1)} · UTC</option>)}</optgroup>}
            </select>
          </div>
          <button className="rx-analyze-button" disabled={loading || !now}>{loading ? "Analyzing…" : "Analyze activity"}</button>
        </form>
        {manualPeriod && isRisexWallet(account) && <div className="rx-field rx-period-points">
          <label htmlFor="rx-period-points">Points for this trade period<span>MANUAL</span></label>
          <input id="rx-period-points" value={pointsInput} onChange={event => updatePoints(activeScope, event.target.value)}
            placeholder="Enter points" maxLength={32} inputMode="decimal" autoComplete="off"
            aria-invalid={invalidPoints} aria-describedby={invalidPoints ? "rx-period-points-error" : undefined} />
          {invalidPoints && <p id="rx-period-points-error" className="rx-error">Enter a non-negative points amount.</p>}
        </div>}
        <p id="rx-scan-status" role={error ? "alert" : "status"} className={error ? "rx-wallet-error" : "rx-wallet-help"}>
          {error || (loading ? "Loading activity from RISEx." : "Enter a public wallet address to look up its activity.")}
        </p>
      </section>

      {report && <div className="rx-wallet-results">
        {report.warnings.length > 0 && <div className="rx-panel rx-wallet-warnings" role="status">
          <strong>Data coverage</strong>
          <ul>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>}
        <section className="rx-panel" aria-labelledby="rx-scope-summary-title">
          <p className="rx-eyebrow">02 / TRADING SUMMARY</p>
          <h2 id="rx-scope-summary-title">{scopeTitle}</h2>
          <dl className="rx-wallet-metrics rx-wallet-balance">
            <div><dt>Executed volume</dt><dd>{money(scopeActivity?.summary?.volume)}</dd></div>
            <div><dt>Net execution fees</dt><dd>{money(scopeActivity?.summary?.netFees, true)}</dd></div>
            <div><dt>Reported realized PnL</dt><dd>{money(scopeActivity?.summary?.closedPnl)}</dd></div>
            <div><dt>Net settled funding</dt><dd>{money(scopeActivity?.funding?.net, true)}</dd></div>
          </dl>
          <p className="rx-wallet-help">
            {scopeActivity?.summary ? `${number.format(scopeActivity.summary.fills)} executions · ` : ""}
            {report.tradesStatus === "complete" ? "Trade history loaded" : report.tradesStatus === "partial" ? "Partial trade history" : "Trade history unavailable"}
            {" · Fetched "}{date.format(report.fetchedAt)} UTC
          </p>
          {isCombined && <p className="rx-wallet-help">
            {combinedPoints === null ? "Enter points on all included epoch cards to see combined ratios."
              : `${number.format(combinedPoints)} PTS total · ${validCombinedRatios ? money(Number(scopeSummary.volume) / combinedPoints) : "—"} volume / point · ${validCombinedRatios ? money(Number(scopeSummary.netFees) / combinedPoints, true) : "—"} net fees / point`}
          </p>}
        </section>
        {selectedEpoch && <>
          <RisexEpochCards epochs={shownEpochs} selected={selectedEpoch.id} points={pointsByPeriod}
            onSelect={setSelectedEpochId} onPoints={updatePoints} />
          <section className="rx-panel rx-selected-epoch" aria-labelledby="rx-wallet-summary-title">
            <p className="rx-eyebrow">SELECTED EPOCH</p>
            <h2 id="rx-wallet-summary-title">{periodTitle}<span className="rx-epoch-state">{risexEpochStatus(selectedEpoch.status)}</span></h2>
            <p className="rx-wallet-help">
              {selectedEpoch.from === null ? `Before ${date.format(selectedEpoch.to)} UTC` : `${day.formatRange(selectedEpoch.from, selectedEpoch.to - 1)} UTC`}
              {" · Drop "}{day.format(selectedEpoch.distribution)}
            </p>
            <dl className="rx-wallet-metrics rx-wallet-balance">
              <div><dt>Executed volume</dt><dd>{money(summary?.volume)}</dd></div>
              <div><dt>Executions</dt><dd>{summary ? number.format(summary.fills) : "—"}</dd></div>
              <div><dt>Net execution fees</dt><dd>{money(summary?.netFees, true)}</dd></div>
              <div><dt>Net settled funding</dt><dd>{money(activity.funding?.net, true)}</dd></div>
            </dl>
          </section>
        </>}

        <div className="rx-wallet-columns">
          <section className="rx-panel" aria-labelledby="rx-wallet-holding-title">
            <p className="rx-eyebrow">HOLDING PROFILE</p><h2 id="rx-wallet-holding-title">How long you held</h2>
            <p className="rx-wallet-help">{periodTitle} · Share of executed volume</p>
            {activity.holding && activity.holding.status !== "incomplete" ? <>
              <dl className="rx-wallet-metrics">
                <div><dt>Executed volume held 12h+</dt><dd>{money(activity.holding.heldAtLeast12h)}</dd></div>
                <div><dt>Average matched closed hold</dt><dd>{activity.holding.averageClosedHoldHours == null ? "—" : `${activity.holding.averageClosedHoldHours.toFixed(2)} h`}</dd></div>
              </dl>
              <ul className="rx-wallet-lines">{activity.holding.buckets.map(bucket => <li key={bucket.id}>
                <span>{bucket.label}</span><strong>{money(bucket.volume)} <small>{bucket.sharePercent.toFixed(2)}%</small></strong>
              </li>)}</ul>
              <p className="rx-wallet-help">FIFO estimate at the period cutoff. Volume without a verifiable opening is shown as unknown.</p>
            </> : <p className="rx-wallet-help">{activity.holding?.notes[0] ?? "Holding times appear when trades are available."}</p>}
          </section>
          <section className="rx-panel" aria-labelledby="rx-wallet-market-title">
            <p className="rx-eyebrow">MARKET BREAKDOWN</p><h2 id="rx-wallet-market-title">What you traded</h2>
            <p className="rx-wallet-help">{periodTitle} · {activity.markets.length} markets</p>
            {activity.markets.length ? <ul className="rx-wallet-lines rx-wallet-markets">
              {activity.markets.map(market => <li key={market.market}><span>{market.market} <small>{market.fills} fills</small></span><strong>{money(market.volume)}</strong></li>)}
            </ul> : <p className="rx-wallet-help">No market activity to show for this period.</p>}
          </section>
        </div>

        <div className="rx-wallet-columns">
          <section className="rx-panel" aria-labelledby="rx-wallet-role-title">
            <p className="rx-eyebrow">EXECUTION PROFILE</p><h2 id="rx-wallet-role-title">Maker and taker</h2>
            <p className="rx-wallet-help">{selectedEpoch ? `Selected epoch · ${periodTitle}` : `Analysis scope · ${scopeTitle}`}</p>
            {roleRows && summary.fills > 0 ? <>
              <div className="rx-execution-bar" aria-hidden="true">
                {roleRows.map(role => <span key={role.id} className={`rx-role-${role.id}`} style={{ width: `${roleShare(role.volume)}%` }} />)}
              </div>
              <div className="rx-execution-grid">
                {roleRows.map(role => <article className={`rx-execution-card rx-role-${role.id}`} key={role.id} aria-label={`${role.label} trading activity`}>
                  <div className="rx-execution-card-heading">
                    <h3>{role.label}</h3>
                    <span>{roleShare(role.volume).toFixed(2)}% of volume</span>
                  </div>
                  <dl>
                    <div><dt>Volume</dt><dd>{money(role.volume)}</dd></div>
                    <div><dt>Fees paid</dt><dd>{money(role.fees.paid, true)}</dd></div>
                    <div><dt>Rebates</dt><dd>{money(role.fees.rebates, true)}</dd></div>
                    <div><dt>Net fees</dt><dd>{money(role.fees.net, true)}</dd></div>
                  </dl>
                </article>)}
              </div>
            </> : <p className="rx-wallet-help">No executions to break down for this period.</p>}
            {activity.funding && <p className="rx-wallet-help">Settled funding · {money(activity.funding.paid, true)} paid · {money(activity.funding.received, true)} received.</p>}
          </section>
          <section className="rx-panel" aria-labelledby="rx-wallet-efficiency-title">
            <p className="rx-eyebrow">POINTS EFFICIENCY</p><h2 id="rx-wallet-efficiency-title">Trades and points</h2>
            <p className="rx-wallet-help">{periodTitle} · {selectedEpoch && selectedEpoch.status !== "completed" ? "Points pending"
              : points !== null ? `${number.format(points)} PTS` : "Points not entered"}</p>
            <dl className="rx-wallet-metrics">
              <div><dt>Volume per point</dt><dd>{validRatios ? money(Number(summary.volume) / points) : "—"}</dd></div>
              <div><dt>Net fees per point</dt><dd>{validRatios ? money(Number(summary.netFees) / points, true) : "—"}</dd></div>
            </dl>
            <p className="rx-wallet-help">{selectedEpoch && selectedEpoch.status !== "completed" ? "Ratios appear after the drop date and points entry."
              : selectedEpoch ? "Enter points on the epoch card. Ratios require positive points and complete trade history."
                : "Enter the period’s points in the analysis form. Ratios require positive points and complete trade history."}</p>
          </section>
        </div>

        <details className="rx-panel rx-wallet-disclosure">
          <summary>Daily activity <span>{scopeTitle} · UTC</span></summary>
          <p className="rx-wallet-help">Most recent 14 active days in this scope.</p>
          {daily.length ? <ul className="rx-daily-list">{daily.map(item => <li key={item.day}>
            <span>{item.day.slice(5)}</span>
            <span className="rx-epoch-track" aria-hidden="true"><i style={{ width: `${Number(item.volume) / maxDailyVolume * 100}%` }} /></span>
            <strong>{money(item.volume)} <small>{item.fills} fills · {money(item.netFees, true)} net fees</small></strong>
          </li>)}</ul> : <p className="rx-wallet-help">No daily executions to show for this scope.</p>}
        </details>

        {shownEpochs.length > 1 && <section className="rx-panel" aria-labelledby="rx-scope-markets">
          <p className="rx-eyebrow">MARKET BREAKDOWN / WHOLE SCOPE</p><h2 id="rx-scope-markets">Markets in {scopeTitle.toLowerCase()}</h2>
          {scopeActivity?.markets.length ? <div className="rx-wallet-table-wrap"><table className="rx-wallet-table">
            <thead><tr><th scope="col">Market</th><th scope="col">Volume</th><th scope="col">Net fees</th><th scope="col">Reported PnL</th><th scope="col">Fills</th></tr></thead>
            <tbody>{scopeActivity.markets.map(market => <tr key={market.market}>
              <th scope="row">{market.market}</th><td>{money(market.volume)}</td><td>{money(market.netFees, true)}</td><td>{money(market.closedPnl)}</td><td>{number.format(market.fills)}</td>
            </tr>)}</tbody>
          </table></div> : <p className="rx-wallet-help">No market activity to show for this scope.</p>}
        </section>}

        <section className="rx-panel" aria-labelledby="rx-wallet-position-title">
          <p className="rx-eyebrow">03 / PORTFOLIO SNAPSHOT</p><h2 id="rx-wallet-position-title">Balance and open positions</h2>
          {report.portfolio ? <>
            <dl className="rx-wallet-metrics rx-wallet-balance">
              <div><dt>Account equity</dt><dd>{money(report.portfolio.equity)}</dd></div>
              <div><dt>USDC balance</dt><dd>{money(report.portfolio.balance)}</dd></div>
              <div><dt>Free collateral</dt><dd>{money(report.portfolio.freeCollateral)}</dd></div>
              <div><dt>Unrealized PnL</dt><dd>{money(report.portfolio.unrealizedPnl)}</dd></div>
            </dl>
            {report.portfolio.positions.length ? <div className="rx-wallet-table-wrap"><table className="rx-wallet-table">
              <thead><tr><th scope="col">Market</th><th scope="col">Side / size</th><th scope="col">Entry price</th><th scope="col">Position value</th><th scope="col">Unrealized PnL</th><th scope="col">Leverage</th></tr></thead>
              <tbody>{report.portfolio.positions.map((row, index) => <tr key={`${row.market}:${index}`}>
                <th scope="row">{row.market}</th><td>{Number(row.size) < 0 ? "Short" : "Long"} · {number.format(Math.abs(Number(row.size)))}</td>
                <td>{money(row.entryPrice, true)}</td><td>{money(row.notional)}</td><td>{money(row.unrealizedPnl)}</td><td>{row.leverage === null ? "—" : `${row.leverage}×`}{row.marginMode && ` · ${row.marginMode}`}</td>
              </tr>)}</tbody>
            </table></div> : <p className="rx-wallet-help">No open positions in the current snapshot.</p>}
          </> : <p className="rx-wallet-help">Current portfolio unavailable.</p>}
        </section>
        <section className="rx-panel" aria-labelledby="rx-wallet-transfer-title">
          <p className="rx-eyebrow">04 / ACCOUNT TRANSFERS</p><h2 id="rx-wallet-transfer-title">Recent deposits and withdrawals</h2>
          {report.transfers?.length ? <div className="rx-wallet-table-wrap"><table className="rx-wallet-table">
            <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Type</th><th scope="col">Amount</th><th scope="col">Token</th></tr></thead>
            <tbody>{report.transfers.map((row, index) => <tr key={`${row.hash}:${index}`}>
              <th scope="row">{date.format(row.time)}</th><td>{row.type === "DEPOSIT" ? "Deposit" : row.type === "WITHDRAW" ? "Withdrawal" : row.type}</td>
              <td>{number.format(Number(row.amount))}</td><td><span title={row.token}>{row.token.slice(0, 8)}…{row.token.slice(-4)}</span></td>
            </tr>)}</tbody>
          </table></div> : <p className="rx-wallet-help">{report.transfers ? "No deposits or withdrawals returned for this address." : "Recent transfers unavailable."}</p>}
        </section>
        <details className="rx-panel rx-wallet-disclosure rx-wallet-method">
          <summary>Calculation method</summary>
          <div className="rx-wallet-help">
            <p>Volume is execution price × size. Net execution fees are paid fees minus rebates. Realized PnL is displayed as reported by RISEx. Settled funding is tracked separately.</p>
            <p>Season 1 trading windows run Monday through Sunday UTC and points drop the following Tuesday. The retro window includes available trades before 20 July 2026. Manual points are saved per wallet and period in this browser. <a href="https://blog.risechain.com/rise-points-season-1-ignite-everything-you-need-to-know/" target="_blank" rel="noopener noreferrer">RISEx points schedule ↗</a></p>
            <p>Hold times use FIFO and use the reported prior entry price of zero to establish a flat position. <a href="https://developer.rise.trade/reference/getaccounttradehistory" target="_blank" rel="noopener noreferrer">RISEx trade history API ↗</a></p>
          </div>
        </details>
      </div>}
    </main>
    <footer className="rx-footer"><span>RISEX / UNOFFICIAL COMMUNITY TOOL</span><a href="https://www.rise.trade/en/points" target="_blank" rel="noopener noreferrer">RISEx points ↗</a></footer>
  </div></div>;
}
