"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ThemeToggle from "@/components/theme-toggle";
import PairRewards, { PairBreakEven } from "@/components/pair-rewards";
import { PAIR_REWARD_MODELS, pairRewardDefaults, pairRewardScenario } from "@/lib/pair-rewards";
import { usePairAnalysis } from "@/hooks/use-pair-analysis";
import { fetchPairLeg, fetchPairBalance, unavailablePairBalance } from "@/lib/pair-requests";
import { applyPairBalance } from "@/lib/pair-balances";
import { PAIR_PROJECTS, isPairAddress, pairKey, pairTotals, pairAmount, pairBalancePnl, pairBalanceCost, pairManualLeg, selectPairProjects, type PairProject, type PairMetrics, type PairLeg } from "@/lib/pair-analytics";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, signDisplay: "exceptZero" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const money = (value: string | null | undefined, showSign = false) => value == null ? "—" : (showSign ? signed : usd).format(Number(value));
const tone = (value: string | null | undefined) => value == null || Number(value) === 0 ? "" : Number(value) > 0 ? "cp-positive" : "cp-negative";
const letter = (index: number) => String.fromCharCode(65 + index);
const rows: { key: keyof PairMetrics; label: string; signed?: boolean; description?: string }[] = [
  { key: "netPnl", label: "API / history net PnL", signed: true, description: "Includes current unrealized PnL; independent of your manual net deposits." },
  { key: "tradingPnl", label: "Loaded realized trading PnL", signed: true }, { key: "unrealizedPnl", label: "Current unrealized PnL", signed: true },
  { key: "funding", label: "Net funding received", signed: true }, { key: "netFees", label: "Loaded net execution fees", description: "Paid fees minus rebates; already included in net PnL." },
  { key: "makerFees", label: "Maker net fees" }, { key: "takerFees", label: "Taker net fees" }, { key: "feesPaid", label: "Execution fees paid" }, { key: "rebates", label: "Execution rebates" },
  { key: "volume", label: "Loaded executed volume" }, { key: "makerVolume", label: "Maker volume" }, { key: "takerVolume", label: "Taker volume" }, { key: "equity", label: "Current account balance" },
];

export default function PairAnalytics({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [session, update, ready] = usePairAnalysis();
  const { form, reports, netDeposits, pnlBasis, rewards, selectionConfirmed } = session;
  const [loading, setLoading] = useState(false), [errors, setErrors] = useState<string[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false), autoBalanceKey = useRef<string | null>(null);
  const [editingSelection, setEditingSelection] = useState(false), [draft, setDraft] = useState<PairProject[] | null>(null);
  const controller = useRef<AbortController | null>(null), formKey = form.map(pairKey).join("|");
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { controller.current?.abort(); setLoading(false); setBalanceLoading(false); setErrors([]); }, [formKey]);
  const selecting = !selectionConfirmed || editingSelection, selected = draft ?? [...new Set(form.map(input => input.project))];
  const projects = form.map(input => PAIR_PROJECTS.find(project => project.id === input.project)!);
  const totals = pairTotals(reports), hasReports = reports.some(Boolean), balanceMode = pnlBasis === "equity";
  const deposits = pairAmount(netDeposits.trim()), depositError = netDeposits.trim() !== "" && deposits === null;
  const balancePnl = pairBalancePnl(totals.equity, netDeposits), resultPnl = balanceMode ? balancePnl : totals.netPnl, complete = resultPnl !== null;
  const hasManual = form.some(input => input.project === "variational");
  const netCost = pairBalanceCost(totals.equity, netDeposits), busy = loading || balanceLoading;
  const canReadBalances = form.length >= 2 && form.every(input => input.project === "variational" || isPairAddress(input.address));
  useEffect(() => {
    if (!ready || selecting || !canReadBalances || autoBalanceKey.current === formKey || !reports.some(Boolean)) return;
    const stale = reports.some(report => report && report.project !== "variational" && (!report.balanceSnapshot || report.balanceSnapshot.value === null || Date.now() - Date.parse(report.balanceSnapshot.fetchedAt) > 60_000));
    if (stale) { autoBalanceKey.current = formKey; void refreshBalances(); }
  }, [ready, selecting, formKey]);
  async function refreshBalances() {
    if (!canReadBalances) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(false); setBalanceLoading(true); setErrors([]); autoBalanceKey.current = formKey;
    const results = await Promise.allSettled(form.map(async (input, index) => input.project === "variational" ? input.manualEquity?.trim() ? pairManualLeg(input) : null : applyPairBalance(input, reports[index] ?? null, await fetchPairBalance(input, request.signal))));
    if (request.signal.aborted) return;
    update({ reports: results.map((result, index) => result.status === "fulfilled" ? result.value : form[index].project === "variational" ? null : applyPairBalance(form[index], reports[index] ?? null, unavailablePairBalance(form[index], result.reason))) });
    setErrors(results.map(result => result.status === "fulfilled" ? "" : result.reason instanceof Error ? result.reason.message : "Current balance is unavailable.")); setBalanceLoading(false);
  }
  function confirmSelection() {
    controller.current?.abort(); setLoading(false); setBalanceLoading(false); setErrors([]); update(selectPairProjects(session, selected)); setEditingSelection(false); setDraft(null);
  }
  function changeAddress(index: number, address: string) {
    controller.current?.abort(); setLoading(false); setBalanceLoading(false); setErrors([]);
    const next = form.map((input, i) => i === index ? { ...input, address } : input), changed = next.map(pairKey).join("|") !== formKey;
    update({ form: next, reports: next.map(() => null), ...(changed ? { netDeposits: "", rewards: rewards.map((reward, i) => i === index ? pairRewardDefaults(next[i].project) : reward) } : {}) });
  }
  function changeManualEquity(index: number, manualEquity: string) {
    controller.current?.abort(); setLoading(false); setBalanceLoading(false);
    const next = form.map((input, i) => i === index ? { ...input, manualEquity } : input);
    let report: PairLeg | null = null, error = "";
    if (manualEquity.trim()) { try { report = pairManualLeg(next[index]); } catch (cause) { error = cause instanceof Error ? cause.message : "Enter current equity in USD."; } }
    update({ form: next, reports: reports.map((old, i) => i === index ? report : old) });
    setErrors(form.map((_, i) => i === index ? error : errors[i] ?? ""));
  }
  async function analyze(event: FormEvent) {
    event.preventDefault();
    const invalid: string[] = form.map(input => input.project === "variational" ? input.address.trim() && !isPairAddress(input.address) ? "Enter a valid wallet address or leave it blank." : pairAmount(input.manualEquity?.trim()) === null ? "Enter current Variational equity in USD, including open-position PnL." : "" : isPairAddress(input.address) ? "" : "Enter a valid EVM address (0x + 40 hexadecimal characters)."), seen = new Set<string>();
    form.forEach((input, i) => { const key = pairKey(input); if (seen.has(key) && !invalid[i]) invalid[i] = "This account is already included."; seen.add(key); });
    setErrors(invalid); if (invalid.some(Boolean) || form.length < 2) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setBalanceLoading(false); update({ reports: form.map(() => null) });
    const results = await Promise.allSettled(form.map(input => fetchPairLeg(input, request.signal)));
    if (request.signal.aborted) return;
    update({ reports: results.map(result => result.status === "fulfilled" ? result.value : null) });
    setErrors(results.map(result => result.status === "fulfilled" ? "" : result.reason?.name === "TimeoutError" ? "The scan timed out. Try again." : result.reason instanceof Error ? result.reason.message : "This wallet could not be loaded.")); setLoading(false);
  }
  function download() {
    const data = { version: 4, scope: "available_history", exportedAt: new Date().toISOString(), wallets: reports, combined: totals, pnlBasis,
      balanceComparison: { equity: totals.equity, netDeposits: deposits, netDepositsInput: netDeposits, netDepositsSource: "manual", netPnl: balancePnl, netCost, method: "Net cost = net deposits minus the sum of current account balances. Net PnL is the opposite sign. No additional fees, funding or historical PnL are deducted." },
      rewardsComparison: { projects: form.map(input => input.project), inputs: rewards, pointsSource: "manual", basePnl: resultPnl, scenario: pairRewardScenario(form.map(input => input.project), rewards, resultPnl), method: "Base PnL plus all included proportional point values. Blank points exclude that reward; estimates are conditional." } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), link = document.createElement("a");
    link.href = url; link.download = `wallet-comparison-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return <div className="pair-page"><div className="cp-shell">
    <header className="cp-header"><Link href="/" className="cp-brand"><img src="/brand/perp-tools-symbol.svg" width="34" height="34" alt="" />Perp tools<span>.</span></Link><nav><Link href="/">← All projects</Link><ThemeToggle initialTheme={initialTheme} /></nav></header>
    <main>
      <section className="cp-intro"><div><p className="cp-eyebrow"><i />WALLET COMPARISON</p><h1>{selecting ? <>Choose your <span>exchanges.</span></> : <>Compare your <span>wallets.</span></>}</h1><p>{selecting ? "Select two or more projects to compare their combined result." : "Enter an address for each project, your points and combined net deposits."}</p></div><div className="cp-intro-mark" aria-hidden="true"><span>A</span><i>＋</i><span>B+</span></div></section>
      <div className="cp-steps"><span aria-current={selecting ? "step" : undefined}>01 · Projects</span><i>→</i><span aria-current={!selecting ? "step" : undefined}>02 · Wallets and points</span></div>
      {selecting ? <section className="cp-picker" aria-label="Choose exchanges">
        <div className="cp-project-options">{PAIR_PROJECTS.map(project => {
          const checked = selected.includes(project.id);
          return <button type="button" className="cp-project-option" key={project.id} aria-pressed={checked} onClick={() => setDraft(checked ? selected.filter(id => id !== project.id) : [...selected, project.id])} disabled={!ready}>
            <img src={project.logo} data-project={project.id} width="43" height="43" alt="" /><span><strong>{project.name}</strong><small>{project.id === "variational" ? "Manual equity + points" : PAIR_REWARD_MODELS[project.id] ? "Wallet analytics + points" : "Wallet analytics"}</small></span><i aria-hidden="true">{checked ? "✓" : "+"}</i>
          </button>;
        })}</div>
        <div className="cp-picker-footer"><p>{selected.length} selected <span>· select at least 2</span></p><button type="button" className="cp-analyze" disabled={!ready || selected.length < 2} onClick={confirmSelection}>Confirm projects <span>→</span></button></div>
        {selectionConfirmed && <button type="button" className="cp-selection-cancel" onClick={() => { setEditingSelection(false); setDraft(null); }}>Return without changes</button>}
      </section> : <>
        <div className="cp-selection-bar"><div>{projects.map((project, i) => <span key={i}><img src={project.logo} data-project={project.id} alt="" width="17" height="17" />{project.name}</span>)}</div><button type="button" onClick={() => { controller.current?.abort(); setLoading(false); setBalanceLoading(false); setDraft([...new Set(form.map(input => input.project))]); setEditingSelection(true); }}>Change projects</button></div>
        <form className="cp-form" onSubmit={analyze} noValidate>
          <div className="cp-wallet-grid" data-count={form.length}>{form.map((input, index) => <section className={`cp-wallet cp-wallet-${index}`} key={input.project} aria-labelledby={`cp-wallet-${index}`}>
            <div className="cp-wallet-heading"><span className="cp-leg-id">{letter(index)}</span><h2 id={`cp-wallet-${index}`}>{projects[index].name}</h2><img src={projects[index].logo} data-project={input.project} width="28" height="28" alt="" /></div>
            <label htmlFor={`cp-address-${index}`}>Wallet address{input.project === "variational" ? " · optional" : ""}</label><input id={`cp-address-${index}`} value={input.address} onChange={event => changeAddress(index, event.target.value)} maxLength={42} autoComplete="off" spellCheck={false} placeholder="0x…" aria-invalid={Boolean(errors[index])} aria-describedby={`cp-error-${index}`} />
            {input.project === "variational" && <><label htmlFor={`cp-manual-equity-${index}`}>Current equity · USD <span className="cp-manual">MANUAL</span></label><input id={`cp-manual-equity-${index}`} value={input.manualEquity ?? ""} onChange={event => changeManualEquity(index, event.target.value)} inputMode="decimal" maxLength={100} autoComplete="off" placeholder="Include open-position PnL" /></>}
            {PAIR_REWARD_MODELS[input.project] && <><label htmlFor={`cp-points-${index}`}>Your points <span className="cp-manual">MANUAL · OPTIONAL</span></label><input id={`cp-points-${index}`} value={rewards[index].points} onChange={event => update({ rewards: rewards.map((reward, i) => i === index ? { ...reward, points: event.target.value } : reward) })} inputMode="decimal" maxLength={100} autoComplete="off" placeholder="Leave blank to exclude rewards" /></>}
            <p className="cp-input-note">{input.project === "variational" ? "Manual equity and points. Trade history is not loaded." : `${input.project === "arcus" ? "All subaccounts" : input.project === "entropy" ? "Entropy io: markets only" : "Perpetual trading account"} · available history`}</p>
            {errors[index] && <p className="cp-error" id={`cp-error-${index}`} role="alert">{errors[index]}</p>}
          </section>)}</div>
          <div className="cp-deposit cp-query-deposit"><div><label htmlFor="cp-net-deposits">Total net deposits · all selected accounts <span>USD · MANUAL</span></label><input id="cp-net-deposits" type="text" inputMode="decimal" value={netDeposits} maxLength={100} onChange={event => update({ netDeposits: event.target.value })} placeholder="e.g. 10000" autoComplete="off" aria-invalid={depositError} aria-describedby="cp-deposit-help cp-deposit-error" /><p id="cp-deposit-error" className="cp-error" role={depositError ? "alert" : undefined}>{depositError ? "Enter a USD amount using a decimal point." : ""}</p></div><p id="cp-deposit-help">Deposits minus withdrawals across the selected accounts. Internal transfers cancel out. Equity includes open PnL, fees and funding.</p></div>
          <div className="cp-form-footer"><p>Public addresses only. Inputs and results are saved in this browser.</p><div>{busy && <button type="button" className="cp-cancel" onClick={() => { controller.current?.abort(); setLoading(false); setBalanceLoading(false); }}>Cancel</button>}<button type="submit" className="cp-analyze" disabled={!ready || busy}>{loading ? "Loading wallets…" : "Analyze wallets"}<span aria-hidden="true">↗</span></button></div></div>
        </form>

        <section className={`cp-summary${complete ? " cp-summary-ready" : ""}`} aria-labelledby="cp-summary-heading" aria-busy={busy}>
          <div className="cp-summary-top"><p className="cp-eyebrow">COMBINED RESULT · {form.length} ACCOUNTS</p><span className={`cp-status ${complete ? "cp-status-complete" : ""}`}><i />{balanceLoading ? "Refreshing API balances" : loading ? "Scanning" : complete ? balanceMode ? "Based on current balances" : "All net PnL totals available" : balanceMode && totals.equity !== null ? depositError ? "Check net deposits" : "Enter net deposits" : hasReports ? "Partial data" : "Awaiting wallets"}</span></div>
          <div className="cp-result-controls"><div className="cp-basis" role="group" aria-label="PnL calculation method"><button type="button" aria-pressed={balanceMode} onClick={() => update({ pnlBasis: "equity" })}>Account balances</button><button type="button" aria-pressed={!balanceMode} disabled={hasManual} title={hasManual ? "Variational uses manually entered equity." : undefined} onClick={() => update({ pnlBasis: "history" })}>Trading history</button></div><button type="button" className="cp-refresh-balances" disabled={!ready || !canReadBalances || busy} onClick={() => void refreshBalances()}>{balanceLoading ? "Refreshing balances…" : "Refresh balances"}</button></div>
          <PairBreakEven form={form} inputs={rewards} pnl={resultPnl} />
          <div className="cp-net"><div><h2 id="cp-summary-heading">{balanceMode ? "Combined net PnL from balances" : "Combined net PnL from history"}</h2><strong className={tone(resultPnl)}>{money(resultPnl, true)}</strong><p>{balanceMode ? `${money(totals.equity)} current balances − ${money(deposits)} net deposits.` : "Includes current unrealized PnL. Execution fees and funding are counted once."}</p>{balanceMode && netCost !== null && <div className="cp-net-cost"><span>{Number(netCost) < 0 ? "Net gain" : "Net cost"}</span><strong className={tone(balancePnl)}>{money(netCost.startsWith("-") ? netCost.slice(1) : netCost)}</strong><small>Net deposits − current balances. No additional fees or funding are deducted.</small></div>}</div>
            <div className="cp-contributions" data-count={form.length}>{reports.map((report, index) => <div key={index}><span><i className={`cp-side-dot cp-dot-${index}`} />{letter(index)} · {projects[index].name}</span><strong className={balanceMode ? undefined : tone(report?.metrics.netPnl)}>{money(balanceMode ? report?.metrics.equity : report?.metrics.netPnl, !balanceMode)}</strong><small title={report?.balanceSnapshot ? `${report.balanceSnapshot.source} · ${report.balanceSnapshot.scope}` : undefined}>{balanceMode ? report?.source === "manual" ? "Manual balance" : report?.balanceSnapshot?.value != null ? `API · ${date.format(new Date(report.balanceSnapshot.fetchedAt))} UTC` : report?.metrics.equity != null ? "Saved balance · refresh to update" : busy ? "Loading…" : "Balance unavailable" : report ? report.pnlStatus === "complete" ? "Net PnL" : "Partial / unavailable net PnL" : loading ? "Loading…" : "Not loaded"}</small></div>)}</div>
          </div>
          <div className="cp-summary-metrics"><div><span>Loaded volume · {hasManual ? "API accounts" : "all accounts"}</span><strong>{money(totals.volume)}</strong></div><div><span>Loaded net execution fees</span><strong>{money(totals.netFees)}</strong></div><div><span>Net funding received</span><strong className={tone(totals.funding)}>{money(totals.funding, true)}</strong></div><div><span>Current account balances</span><strong>{money(totals.equity)}</strong></div></div>
          <details className="cp-balance-sources"><summary>Balance sources and update times</summary><ul>{reports.map((report, i) => <li key={i}><span>{projects[i].name} · {money(report?.metrics.equity)}</span><small>{report?.source === "manual" ? "Manually entered balance" : report?.balanceSnapshot ? `${report.balanceSnapshot.scope} · ${report.balanceSnapshot.source}` : "No verified current API balance"}{report?.balanceSnapshot ? ` · ${date.format(new Date(report.balanceSnapshot.fetchedAt))} UTC` : ""}</small></li>)}</ul></details>
          <div className="cp-summary-footer"><span>{balanceLoading ? "Reading current balances directly from the exchanges, without a trade-history scan." : loading ? "Reading exchange data. Larger histories may take up to a minute." : !hasReports ? "Enter wallet addresses and analyze to load account data." : balanceMode ? "Balances are snapshots. Refresh balances updates them independently of trade history." : !complete ? "Combined history PnL requires complete totals from every selected account." : "Account totals are compared; hedge legs are not matched and delta neutrality is not verified."}</span><span>USD equivalents</span></div>
        </section>
        <PairRewards form={form} inputs={rewards} pnl={resultPnl} basis={pnlBasis} ready={ready} onChange={inputs => update({ rewards: inputs })} />
        {hasReports && <>
          <div className="cp-results-heading"><div><p className="cp-eyebrow">ACCOUNT BREAKDOWN</p><h2>Wallets side by side</h2></div><button type="button" onClick={download}>Download JSON ↗</button></div>
          <div className="cp-report-grid">{reports.map((report, index) => <article className="cp-report" key={index}><div className="cp-report-heading"><span className={`cp-side-dot cp-dot-${index}`} /><h3>{projects[index].name}</h3><span className="cp-report-badge">{report?.source === "manual" ? "Manual equity" : report ? report.historyStatus === "complete" ? "History loaded" : "Partial history" : "Unavailable"}</span></div><p className="cp-report-address">{form[index].address.trim() || "No wallet address supplied"}</p><p>{report?.scope || errors[index] || "No data"}</p><div className="cp-report-meta"><span>{report?.source === "manual" ? "Trade history unavailable" : report ? `${report.positions ?? "—"} open positions` : "—"}</span><span>{report ? `${date.format(new Date(report.fetchedAt))} UTC` : "Not loaded"}</span></div><Link href={projects[index].href}>{projects[index].id === "variational" ? "Variational calculator" : `Full ${projects[index].name} analytics`} ↗</Link></article>)}</div>
          <section className="cp-table-panel" aria-label="Wallet metric comparison"><div className="cp-table-scroll" data-lenis-prevent-horizontal><table style={{ minWidth: Math.max(650, 300 + 150 * form.length) }}><caption className="sr-only">Each selected wallet and combined financial metrics. Missing data is a dash.</caption><thead><tr><th scope="col">Metric</th>{projects.map((project, i) => <th scope="col" key={i}>{letter(i)} · {project.name}</th>)}<th scope="col">Combined</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row" title={row.description}>{row.label}</th>{[...reports.map(report => report?.metrics[row.key]), totals[row.key]].map((value, i) => <td key={i} className={row.signed ? tone(value) : undefined}>{money(value, row.signed)}</td>)}</tr>)}</tbody></table></div></section>
          <section className="cp-method"><h2>Data and calculation</h2><p>Equity-based PnL = total current equity of every selected account − manually entered combined net deposits. Match deposits, withdrawals and points to the same accounts and activity period. Internal transfers cancel out. Equity includes unrealized PnL, execution fees, funding and other credits; these amounts are counted once. Changing a wallet or the project set clears the combined deposit.</p><p>The table shows the independent API / history calculation. Volume and fees cover loaded trades. Missing data remains unknown and prevents a complete combined total.</p>{reports.map((report, index) => report && <div className="cp-source-note" key={index}><h3>{letter(index)} · {projects[index].name}</h3><p>{report.pnlMethod}</p>{report.warnings.length > 0 && <details><summary>{report.warnings.length} data notices</summary><ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}</div>)}<p>Account snapshots are read independently. Dollar-denominated balances are compared without a stablecoin exchange-rate adjustment. This comparison does not match trades or verify a hedge ratio.</p></section>
        </>}
      </>}
    </main><footer className="cp-footer"><span>PERP TOOLS / WALLET COMPARISON</span><Link href="/">All projects ↗</Link></footer>
  </div></div>;
}
