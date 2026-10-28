"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import NumberTransition from "@/components/number-transition";
import ReferralOffer from "@/components/referral-offer";
import { useVariationalEstimate } from "@/hooks/use-variational-estimate";
import { estimate, parsePoints } from "@/lib/estimator";
import { featureFlags } from "@/lib/features";
import { VARIATIONAL_ALLOCATION, VARIATIONAL_FDV_PRESETS, VARIATIONAL_TOKEN_SOURCE } from "@/lib/variational-estimator";
import { VARIATIONAL_EVENT, type VariationalMarketSnapshot } from "@/lib/variational-market";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fdvLabel = (value: number) => value >= 1e9 ? `$${number.format(value / 1e9)}B` : `$${number.format(value / 1e6)}M`;
const money = (value: number | undefined, unit = false) => value === undefined ? "—" : (unit ? unitUsd : usd).format(value);

export default function VariationalCalculator() {
  const [settings, update] = useVariationalEstimate();
  const { pointsInput, totalInput, fdvInput, supplyInput } = settings;
  const points = parsePoints(pointsInput), total = parsePoints(totalInput), fdv = parsePoints(fdvInput), supply = parsePoints(supplyInput);
  const validTotal = total !== null && total > 0, validFdv = fdv !== null && fdv > 0, validSupply = supply !== null && supply > 0;
  const pointsError = pointsInput.trim() && points === null ? "Enter points as a number, zero or greater."
    : points !== null && validTotal && points > total ? "Your points cannot exceed the total points pool." : "";
  const totalError = validTotal ? "" : "Enter a total points pool greater than zero.";
  const fdvError = validFdv ? "" : "Enter an FDV greater than zero.";
  const supplyError = validSupply ? "" : "Enter a token supply greater than zero.";
  // USD estimates depend on FDV and allocation, not on an assumed token supply.
  const result = validFdv && validTotal && points !== null ? estimate(fdv, VARIATIONAL_ALLOCATION, total, points) : null;
  const unit = validFdv && validTotal ? estimate(fdv, VARIATIONAL_ALLOCATION, total, 0) : null;
  const tokens = result && validSupply ? supply * VARIATIONAL_ALLOCATION / 100 * (points! / total!) : undefined;
  const [snapshot, setSnapshot] = useState<VariationalMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [marketError, setMarketError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setMarketError("");
    try {
      const response = await fetch("/api/variational/fdv", { cache: "no-store", signal: request.signal });
      if (!response.ok) throw new Error("Market data could not be loaded. Manual scenarios remain available.");
      const data = await response.json() as VariationalMarketSnapshot;
      if (!request.signal.aborted) setSnapshot(data);
    } catch (cause) {
      if (!request.signal.aborted) { setSnapshot(null); setMarketError(cause instanceof Error ? cause.message : "Market data could not be loaded."); }
    } finally { if (!request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => controller.current?.abort(); }, [load]);
  const median = snapshot?.median;
  const marketEstimate = median?.kind === "estimate" ? median : null;
  const marketStatus = loading ? "Loading" : snapshot?.status === "ready" ? "Connected" : snapshot?.status === "partial" ? "Partial data" : "Unavailable";
  const selectedThreshold = snapshot?.thresholds.find(row => row.thresholdUsd === fdv);
  const selectedProbability = selectedThreshold?.yesProbability ?? selectedThreshold?.lastKnownProbability;

  return <div className="va-page"><div className="va-shell">
    <header className="va-header">
      <Link href="/variational" className="va-brand" aria-label="Variational points calculator"><img src="/brand/variational/logo.svg" alt="Variational Omni" width="213" height="24" /><span>Points calculator</span></Link>
      <nav aria-label="Variational navigation">{featureFlags.multiExchange && <Link href="/" className="va-back">← All projects</Link>}<ReferralOffer className="va-referral" href="https://omni.variational.io/?ref=OMNIATOMS" code="OMNIATOMS" label="15% boost" /></nav>
    </header>

    <main>
      <section className="va-intro" aria-labelledby="va-title"><div><p className="va-eyebrow"><span />VARIATIONAL / POINTS CALCULATOR</p><h1 id="va-title">What could your Variational<br /><span>points be worth?</span></h1></div><span className="va-model-tag">32% Genesis allocation</span></section>

      <section className="va-summary" aria-labelledby="va-value-heading">
        <div className="va-summary-main"><p className="va-eyebrow">ALLOCATION ESTIMATE <span className="va-usd-tag">USD</span></p><h2 id="va-value-heading">Estimated value of your points</h2><strong className="va-value"><NumberTransition value={money(result?.value)} animate /></strong><p>{validFdv ? `${fdvLabel(fdv)} FDV` : "Set an FDV"}<span> / </span>{VARIATIONAL_ALLOCATION}% allocation<span> / </span>{validTotal ? `${number.format(total)} total points` : "Set a points pool"}</p></div>
        <div className="va-summary-details"><div className="va-points-total"><span>Your points</span><strong>{points !== null && !pointsError ? number.format(points) : "—"}<small>PTS</small></strong></div><dl><div><dt>Value per point</dt><dd>{money(unit?.valuePerPoint, true)}</dd></div><div><dt>Your points pool share</dt><dd>{result ? `${precise.format(result.poolShare)}%` : "—"}</dd></div><div><dt>Illustrative VAR allocation</dt><dd>{tokens === undefined ? "—" : number.format(tokens)}</dd></div><div><dt>Illustrative VAR price</dt><dd>{money(validFdv && validSupply ? fdv / supply : undefined, true)}</dd></div></dl></div>
        <div className="va-summary-footer"><span><i />Proportional allocation model</span><span>FDV, total points and token supply are scenario inputs.</span></div>
      </section>

      <div className="va-workspace">
        <section className="va-panel va-settings" aria-labelledby="va-settings-heading"><div className="va-panel-heading"><p className="va-eyebrow">01 / INPUTS</p><h2 id="va-settings-heading">Calculation settings</h2></div>
          <div className="va-field"><label htmlFor="va-points">Your points<span>PTS</span></label><input id="va-points" className="va-points-input" value={pointsInput} onChange={e => update({ pointsInput: e.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(pointsError)} aria-describedby={pointsError ? "va-points-error" : undefined} />{pointsError && <p id="va-points-error" className="va-error" role="alert">{pointsError}</p>}</div>
          <div className="va-field"><label htmlFor="va-total">Total points pool<span>MANUAL</span></label><input id="va-total" value={totalInput} onChange={e => update({ totalInput: e.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(totalError)} aria-describedby="va-total-help" /><p id="va-total-help" className={totalError ? "va-error" : "va-help"}>{totalError || "10M is a starting assumption. Enter the points pool you want to model."}</p></div>
          <div className="va-field"><label htmlFor="va-fdv">Token FDV<span>USD</span></label><div className="va-currency-input"><span>$</span><input id="va-fdv" value={fdvInput} onChange={e => update({ fdvInput: e.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(fdvError)} aria-describedby="va-fdv-help" /></div><p id="va-fdv-help" className={fdvError ? "va-error" : "va-help"}>{fdvError || "Enter an FDV or select a row in the table."}</p></div>
          <div className="va-allocation"><div><span>Genesis allocation</span><strong>32%</strong></div><div className="va-allocation-track"><span /></div><p>Proportional to points holdings. <a href={VARIATIONAL_TOKEN_SOURCE} target="_blank" rel="noopener noreferrer">Official documentation ↗</a></p></div>
          <div className="va-field"><label htmlFor="va-supply">Illustrative token supply<span>VAR</span></label><input id="va-supply" value={supplyInput} onChange={e => update({ supplyInput: e.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(supplyError)} aria-describedby="va-supply-help" /><p id="va-supply-help" className={supplyError ? "va-error" : "va-help"}>{supplyError || "1B matches the reference grid. Total supply is not specified in the linked token documentation. This changes token counts and price, not USD value."}</p></div>
          <p className="va-saved"><span aria-hidden="true">✓</span> Your calculation is saved in this browser.</p>
        </section>

        <div className="va-analysis">
          <section className="va-panel va-matrix" aria-labelledby="va-matrix-heading"><div className="va-panel-heading va-matrix-heading"><div><p className="va-eyebrow">02 / SCENARIOS</p><h2 id="va-matrix-heading">Value estimates by FDV</h2></div><span className="va-grid-label">SELECT A ROW</span></div>
            <p className="va-table-help">{validTotal ? `${number.format(total)} total points` : "Set a total points pool"} · 32% Genesis allocation</p>
            <div className="va-table-wrap" data-lenis-prevent-horizontal><table className="va-table"><caption className="sr-only">Variational FDV scenarios, Polymarket probabilities, illustrative VAR price and allocation, and estimated USD value.</caption><thead><tr><th scope="col">FDV</th><th scope="col"><span className="va-odds-label">Odds <img src="/brand/extended/polymarket.png" alt="Polymarket" width="13" height="13" /></span></th><th scope="col">VAR price*</th><th scope="col">VAR allocation*</th><th scope="col">Your value</th></tr></thead><tbody>{VARIATIONAL_FDV_PRESETS.map(row => {
              const cell = validTotal ? estimate(row, VARIATIONAL_ALLOCATION, total, points !== null && !pointsError ? points : 0) : null;
              const active = fdv === row, threshold = snapshot?.thresholds.find(item => item.thresholdUsd === row);
              const probability = threshold?.yesProbability ?? threshold?.lastKnownProbability;
              return <tr key={row} className={active ? "va-selected-row" : undefined} onClick={() => update({ fdvInput: String(row) })}><th scope="row"><button type="button" aria-label={`Select ${fdvLabel(row)} FDV`} aria-pressed={active}><i aria-hidden="true" />{fdvLabel(row)}</button></th><td title={threshold?.quoteAsOf ? `Quote: ${date.format(new Date(threshold.quoteAsOf))} UTC` : undefined}>{probability !== null && probability !== undefined ? percent.format(probability) : "—"}</td><td>{money(validSupply ? row / supply : undefined, true)}</td><td>{cell && points !== null && !pointsError && validSupply ? number.format(supply * VARIATIONAL_ALLOCATION / 100 * (points / total!)) : "—"}</td><td>{points !== null && !pointsError ? money(cell?.value) : "—"}</td></tr>;
            })}</tbody></table></div>
            <div className="va-matrix-footer"><span><i />{validFdv ? `${fdvLabel(fdv)} FDV selected` : "Choose an FDV"}</span><span>{selectedProbability !== null && selectedProbability !== undefined ? `${percent.format(selectedProbability)} chance of exceeding` : "Manual valuation scenario"}</span></div><p className="va-table-note">* Token price and allocation use your illustrative supply. Odds show the chance of exceeding each FDV one day after launch.</p>
          </section>

          <section className="va-panel va-market" aria-labelledby="va-market-heading" aria-busy={loading}><div className="va-panel-heading va-market-heading"><div className="va-market-brand"><img src="/brand/extended/polymarket.png" width="32" height="32" alt="" /><div><p className="va-eyebrow">03 / MARKET REFERENCE</p><h2 id="va-market-heading">Polymarket</h2></div></div><span className="va-connection" role="status"><i />{marketStatus}</span></div>
            <a className="va-market-event" href={VARIATIONAL_EVENT.url} target="_blank" rel="noopener noreferrer">{VARIATIONAL_EVENT.title} <span>↗</span></a>
            {marketEstimate && <div className="va-market-estimate"><div><span>Market-implied median FDV</span><strong>≈ {fdvLabel(marketEstimate.fdvUsd)}</strong><p>50% crossing{marketEstimate.lowerUsd !== marketEstimate.upperUsd ? ` between ${fdvLabel(marketEstimate.lowerUsd)} and ${fdvLabel(marketEstimate.upperUsd)}` : " at this threshold"}</p></div><button className="va-apply" type="button" onClick={() => update({ fdvInput: String(Math.round(marketEstimate.fdvUsd)) })} disabled={loading || fdv === Math.round(marketEstimate.fdvUsd)}>{fdv === Math.round(marketEstimate.fdvUsd) ? "Applied ✓" : "Use this FDV ↗"}</button></div>}
            {median && (median.kind === "above" || median.kind === "below") && <p className="va-market-note">Market-implied median: {median.kind === "above" ? "above" : "below"} {fdvLabel(median.boundUsd)}. The quoted thresholds do not bracket 50%.</p>}
            {median?.kind === "unavailable" && !snapshot?.message && <p className="va-market-note">{median.reason}</p>}
            {(marketError || snapshot?.message) && <p className="va-market-note" role="status">{marketError || snapshot?.message}</p>}
            <div className="va-market-update"><span>{snapshot?.fetchedAt ? `Retrieved ${date.format(new Date(snapshot.fetchedAt))} UTC` : "Retrieving latest available quotes"}</span><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh ↻"}</button></div>
            <details className="va-market-method"><summary>Market data and calculation</summary><p>Each percentage is a separate, overlapping probability of exceeding a threshold. Probabilities are not added or averaged. The median interpolates the 50% crossing; it is not an expected FDV or a token price.</p><p>Odds use the latest available hourly YES bid/ask midpoint, or the latest recorded trade. Hover over an odds cell to see its quote time. Quotes over 24 hours old remain visible but are excluded from the median. Requests are cached for one minute. Refreshing quotes does not change your selected FDV.</p>{snapshot?.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>
          </section>
        </div>
      </div>

      <section className="va-method" aria-labelledby="va-method-heading"><div><p className="va-eyebrow">04 / METHODOLOGY</p><h2 id="va-method-heading">Calculation method</h2></div><div><p className="va-formula">Value = FDV × 32% × (your points ÷ total points)</p><p>The 32% Genesis allocation is described in the <a href={VARIATIONAL_TOKEN_SOURCE} target="_blank" rel="noopener noreferrer">Variational token documentation ↗</a>. The 10M starting points pool and 1B illustrative supply are assumptions. The final eligible points pool, FDV and token supply may differ. Dollar estimates do not depend on the assumed token supply.</p></div></section>
    </main>
    <footer className="va-footer"><span>VARIATIONAL / UNOFFICIAL COMMUNITY TOOL</span><span>Scenario estimates · No wallet connection</span></footer>
  </div></div>;
}
