"use client";

import Link from "next/link";
import NumberTransition from "@/components/number-transition";
import ExtendedMarketCard from "@/components/extended-market-card";
import { useExtendedEstimate } from "@/hooks/use-extended-estimate";
import { estimateTokenAllocation, parsePoints } from "@/lib/estimator";
import { featureFlags } from "@/lib/features";
import { EXTENDED_ALLOCATION, EXTENDED_COMMUNITY_TOKENS, EXTENDED_FDV_PRESETS, EXTENDED_POINTS_SOURCE, EXTENDED_SUPPLY } from "@/lib/extended-estimator";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const fdvLabel = (value: number) => value >= 1_000_000_000 ? `$${number.format(value / 1_000_000_000)}B` : value >= 1_000_000 ? `$${number.format(value / 1_000_000)}M` : usd.format(value);
const money = (value: number | undefined, unit = false) => value === undefined ? "—" : (unit ? unitUsd : usd).format(value);
const estimateExtended = (fdv: number, total: number, points: number) => estimateTokenAllocation(fdv, total, points, EXTENDED_SUPPLY, EXTENDED_COMMUNITY_TOKENS);

export default function ExtendedCalculator() {
  const [settings, update] = useExtendedEstimate();
  const { pointsInput, totalInput, fdvInput } = settings;
  const points = parsePoints(pointsInput), total = parsePoints(totalInput), fdv = parsePoints(fdvInput);
  const validTotal = total !== null && total > 0;
  const validFdv = fdv !== null && fdv > 0;
  const pointsError = pointsInput.trim() && points === null ? "Enter a valid number of points, zero or greater."
    : points !== null && validTotal && points > total ? "Your points cannot exceed the total points pool." : "";
  const totalError = !validTotal ? "Enter a total points pool greater than zero." : "";
  const fdvError = !validFdv ? "Enter an FDV greater than zero." : "";
  const result = validFdv && validTotal && points !== null ? estimateExtended(fdv, total, points) : null;
  const unit = validFdv && validTotal ? estimateExtended(fdv, total, 0) : null;
  const share = result ? `${precise.format(result.poolShare)}%` : "—";
  const rows = EXTENDED_FDV_PRESETS;

  return <div className="ex-page"><div className="ex-shell">
    <header className="ex-header">
      <Link href="/extended" className="ex-brand" aria-label="Extended points calculator"><img src="/brand/extended/logo.svg" alt="Extended" width="159" height="36" /><span>Points calculator</span></Link>
      <nav aria-label="Extended navigation">{featureFlags.multiExchange && <Link href="/" className="ex-project-link">← All projects</Link>}<a className="ex-open" href="https://app.extended.exchange/" target="_blank" rel="noopener noreferrer">Open Extended <span aria-hidden="true">↗</span></a></nav>
    </header>

    <main>
      <section className="ex-intro" aria-labelledby="ex-title"><div><p className="ex-eyebrow">EXTENDED / COMMUNITY TOOLS</p><h1 id="ex-title">Your Xpoints.<br /><span>A little perspective.</span></h1><p className="ex-intro-copy">Explore what your points could be worth at token launch.</p></div><span className="ex-status"><i aria-hidden="true" />XTEN allocation model</span></section>

      <section className="ex-summary" aria-labelledby="ex-value-heading">
        <svg className="ex-summary-art" viewBox="0 0 420 420" fill="none" aria-hidden="true"><defs><linearGradient id="ex-shape-gradient" x1="0" y1="0" x2="420" y2="420"><stop stopColor="#00bc84" stopOpacity=".3" /><stop offset="1" stopColor="#00bc84" stopOpacity="0" /></linearGradient></defs><path d="M30 30Q210 160 390 30Q260 210 390 390Q210 260 30 390Q160 210 30 30Z" fill="url(#ex-shape-gradient)" stroke="#00bc84" strokeOpacity=".35" /><path d="M55 55Q210 165 365 55Q255 210 365 365Q210 255 55 365Q165 210 55 55Z" stroke="#00bc84" strokeOpacity=".08" /></svg>
        <div className="ex-summary-top"><span className="ex-badge">YOUR ALLOCATION ESTIMATE</span><span>30% community pool · proportional model</span></div>
        <div className="ex-summary-grid"><div className="ex-payout"><h2 id="ex-value-heading">Estimated value of your points</h2><strong className="ex-value"><NumberTransition value={money(result?.value)} animate={true} /></strong><p>{validFdv ? `${fdvLabel(fdv)} FDV` : "Set your FDV"} <span>·</span> {validTotal ? `${number.format(total)} total Xpoints` : "Set the total points pool"}</p></div>
          <div className="ex-summary-details"><div className="ex-your-points"><span>Your Xpoints <small>MANUAL INPUT</small></span><strong>{points !== null && !pointsError ? number.format(points) : "—"}<em>XP</em></strong></div><dl className="ex-metrics"><div><dt>Value per Xpoint</dt><dd>{money(unit?.valuePerPoint, true)}</dd></div><div><dt>Your pool share</dt><dd>{share}</dd></div><div><dt>Estimated XTEN</dt><dd>{result ? number.format(result.tokens) : "—"}</dd></div><div><dt>Implied XTEN price</dt><dd>{money(validFdv ? fdv / EXTENDED_SUPPLY : undefined, true)}</dd></div></dl></div></div>
        <div className="ex-summary-bottom"><span><i aria-hidden="true" />{result ? "Your scenario is ready. Explore the valuations below." : pointsError || totalError || fdvError ? "Check your scenario inputs below." : "Enter your Xpoints below to see your estimate."}</span><span>Hypothetical value · USD</span></div>
      </section>

      <div className="ex-workspace">
        <section className="ex-settings ex-panel" aria-labelledby="ex-settings-heading"><div className="ex-panel-heading"><p className="ex-eyebrow">01 / YOUR SCENARIO</p><h2 id="ex-settings-heading">Make it yours.</h2><p>Enter your points and set the assumptions.</p></div>
          <div className="ex-field"><label htmlFor="ex-points">Your Xpoints<span>XP</span></label><input id="ex-points" className="ex-points-input" value={pointsInput} onChange={event => update({ pointsInput: event.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(pointsError)} aria-describedby={pointsError ? "ex-points-error" : undefined} />{pointsError && <p className="ex-error" id="ex-points-error" role="alert">{pointsError}</p>}</div>
          <div className="ex-field"><label htmlFor="ex-total">Total points pool<span>XP</span></label><input id="ex-total" value={totalInput} onChange={event => update({ totalInput: event.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(totalError)} aria-describedby={totalError ? "ex-total-error" : "ex-total-help"} />{totalError ? <p className="ex-error" id="ex-total-error" role="alert">{totalError}</p> : <p className="ex-help" id="ex-total-help">70M is the program total in the <a href={EXTENDED_POINTS_SOURCE} target="_blank" rel="noopener noreferrer">Extended docs ↗</a>. Edit to explore another pool.</p>}</div>
          <div className="ex-field ex-fdv-field"><label htmlFor="ex-fdv">Token FDV<span>USD</span></label><div className="ex-presets" role="group" aria-label="FDV presets">{EXTENDED_FDV_PRESETS.map(value => <button key={value} type="button" aria-pressed={fdv === value} onClick={() => update({ fdvInput: String(value) })}>{fdvLabel(value)}</button>)}</div><div className="ex-currency-input"><span aria-hidden="true">$</span><input id="ex-fdv" value={fdvInput} onChange={event => update({ fdvInput: event.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(fdvError)} aria-describedby={fdvError ? "ex-fdv-error" : "ex-fdv-help"} /></div>{fdvError ? <p className="ex-error" id="ex-fdv-error" role="alert">{fdvError}</p> : <p className="ex-help" id="ex-fdv-help">Select a preset, enter any FDV, or apply the market estimate.</p>}</div>
          <div className="ex-fixed-allocation"><div><span>Community allocation</span><strong>{EXTENDED_ALLOCATION}%</strong></div><div className="ex-allocation-track"><span /></div><p>{number.format(EXTENDED_COMMUNITY_TOKENS)} XTEN of the genesis supply</p></div>
          <p className="ex-saved"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.5" /></svg>Your calculation is saved in this browser.</p>
        </section>

        <div className="ex-analysis">
          <section className="ex-matrix ex-panel" aria-labelledby="ex-matrix-heading"><div className="ex-matrix-heading"><div><p className="ex-eyebrow">02 / COMPARE VALUATIONS</p><h2 id="ex-matrix-heading">Same points. Different outcomes.</h2></div><span className="ex-matrix-tag">30% ALLOCATION</span></div><p className="ex-matrix-description">{validTotal ? `${number.format(total)} total Xpoints` : "Set a total points pool"} <span>·</span> Select a valuation to update your estimate.</p>
            <div className="ex-table-wrap" data-lenis-prevent-horizontal><table className="ex-table"><caption className="sr-only">XTEN price, value per Xpoint and your estimated value by FDV at a fixed 30 percent community allocation</caption><thead><tr><th scope="col">Token FDV</th><th scope="col">XTEN price</th><th scope="col">Per Xpoint</th><th scope="col">Your estimate</th></tr></thead><tbody>{rows.map(row => {
              const cell = validTotal ? estimateExtended(row, total, points !== null && !pointsError ? points : 0) : null;
              const active = fdv === row;
              return <tr key={row} className={active ? "ex-active-row" : undefined} onClick={() => update({ fdvInput: String(row) })}><th scope="row"><button type="button" aria-label={`Select ${fdvLabel(row)} FDV`} aria-pressed={active}><i aria-hidden="true" />{fdvLabel(row)}<span aria-hidden="true">↗</span></button></th><td>{money(row / EXTENDED_SUPPLY, true)}</td><td>{money(cell?.valuePerPoint, true)}</td><td>{points !== null && !pointsError ? money(cell?.value) : "—"}</td></tr>;
            })}</tbody></table></div><div className="ex-matrix-footer"><span className="ex-selected-indicator" aria-hidden="true" /><span>{validFdv ? `${fdvLabel(fdv)} FDV selected` : "Choose a valuation"}{points !== null && !pointsError ? ` · ${number.format(points)} Xpoints` : " · Add your Xpoints to calculate your estimate"}</span></div>
          </section>

          <ExtendedMarketCard currentFdv={fdv} onApply={value => update({ fdvInput: String(value) })} />

          <section className="ex-tokenomics ex-panel" aria-labelledby="ex-tokenomics-heading"><div className="ex-tokenomics-heading"><p className="ex-eyebrow">03 / THE TOKEN MODEL</p><h2 id="ex-tokenomics-heading">The numbers behind it.</h2></div><dl><div><dt>Genesis supply</dt><dd>1,000,000,000 <span>XTEN</span></dd></div><div><dt>Community allocation</dt><dd>300,000,000 <span>XTEN · 30%</span></dd></div><div><dt>XTEN per Xpoint</dt><dd>{validTotal ? precise.format(EXTENDED_COMMUNITY_TOKENS / total) : "—"} <span>at your total pool</span></dd></div></dl></section>
        </div>
      </div>
      <section className="ex-method" aria-labelledby="ex-method-heading"><div><span className="ex-method-mark" aria-hidden="true">↳</span><h2 id="ex-method-heading">A scenario, with transparent math.</h2></div><p>Value = FDV × 30% × (your Xpoints ÷ total Xpoints).</p><p>This calculator applies the supplied 1B XTEN genesis supply and 300M XTEN community allocation proportionally to the points pool. Eligibility and the final conversion method may differ. The $500M starting FDV is a manual assumption, not a Polymarket quote.</p></section>
    </main>
    <footer className="ex-footer"><span>EXTENDED / UNOFFICIAL COMMUNITY TOOL</span><a href="https://extended.exchange/" target="_blank" rel="noopener noreferrer">Brand by Extended ↗</a></footer>
  </div></div>;
}
