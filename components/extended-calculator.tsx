"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NumberTransition from "@/components/number-transition";
import ExtendedMarketCard from "@/components/extended-market-card";
import ReferralOffer from "@/components/referral-offer";
import { useExtendedEstimate } from "@/hooks/use-extended-estimate";
import { parsePoints } from "@/lib/estimator";
import { featureFlags } from "@/lib/features";
import { EXTENDED_REFERRAL_CODE, EXTENDED_REFERRAL_URL } from "@/lib/projects";
import { EXTENDED_ALLOCATION, EXTENDED_COMMUNITY_TOKENS, EXTENDED_FDV_PRESETS, EXTENDED_POINTS_SOURCE, EXTENDED_SUPPLY, EXTENDED_TOKENS_PER_POINT, EXTENDED_TOTAL_POINTS, estimateExtended, extendedTokensForPoints } from "@/lib/extended-estimator";
import { EXTENDED_PREMARKET_URL } from "@/lib/extended-premarket";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const precise = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const tokenNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const markUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 });
const fdvLabel = (value: number) => value >= 1_000_000_000 ? `$${number.format(value / 1_000_000_000)}B` : value >= 1_000_000 ? `$${number.format(value / 1_000_000)}M` : usd.format(value);
const money = (value: number | undefined, unit = false) => value === undefined ? "—" : (unit ? unitUsd : usd).format(value);
const conversion = `1 Xpoint ≈ ${tokenNumber.format(EXTENDED_TOKENS_PER_POINT)} XTEN`;

export default function ExtendedCalculator() {
  const [settings, update] = useExtendedEstimate();
  const [markPrice, setMarkPrice] = useState<number | null>();
  useEffect(() => {
    const controller = new AbortController();
    async function loadMarkPrice() {
      try {
        const response = await fetch("/api/extended/premarket", { signal: controller.signal });
        if (!response.ok) throw new Error("Hyperliquid quote unavailable.");
        const quote: { markPrice: number | null } = await response.json();
        if (!controller.signal.aborted) setMarkPrice(quote.markPrice);
      } catch {
        if (!controller.signal.aborted) setMarkPrice(null);
      }
    }
    void loadMarkPrice();
    const timer = window.setInterval(loadMarkPrice, 60_000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, []);
  const { pointsInput, fdvInput } = settings;
  const points = parsePoints(pointsInput), fdv = parsePoints(fdvInput);
  const tokens = extendedTokensForPoints(points);
  const result = fdv === null ? null : estimateExtended(fdv, tokens);
  const validFdv = fdv !== null && result !== null;
  const pointsError = pointsInput.trim() && points === null ? "Enter a valid number of points, zero or greater."
    : points !== null && tokens === null ? `Your Xpoints cannot exceed the ${number.format(EXTENDED_TOTAL_POINTS)} programme total.` : "";
  const fdvError = !validFdv ? "Enter an FDV greater than zero." : "";
  const share = tokens === null ? "—" : `${precise.format(tokens / EXTENDED_COMMUNITY_TOKENS * 100)}%`;
  const tokenLabel = tokens === null ? "—" : `${tokenNumber.format(tokens)} XTEN`;
  const premarketFdv = markPrice == null ? null : Math.round(markPrice * EXTENDED_SUPPLY);
  const rows = [{ fdv: premarketFdv, premarket: true }, ...EXTENDED_FDV_PRESETS.map(value => ({ fdv: value, premarket: false }))];

  return <div className="ex-page"><div className="ex-shell">
    <header className="ex-header">
      <Link href="/extended" className="ex-brand" aria-label="Extended points calculator"><img src="/brand/extended/logo.svg" alt="Extended" width="159" height="36" /><span>Points calculator</span></Link>
      <nav aria-label="Extended navigation">
        {featureFlags.multiExchange && <Link href="/" className="ex-project-link">← All projects</Link>}
        <ReferralOffer className="ex-referral" href={EXTENDED_REFERRAL_URL} code={EXTENDED_REFERRAL_CODE} label="10% off fees" />
      </nav>
    </header>

    <main>
      <section className="ex-intro" aria-labelledby="ex-title"><div><p className="ex-eyebrow">EXTENDED / COMMUNITY TOOLS</p><h1 id="ex-title">What could your Extended<br /><span>points be worth?</span></h1><p className="ex-intro-copy">Convert your Xpoints to XTEN and compare their value across FDV scenarios.</p></div><span className="ex-status"><i aria-hidden="true" />Final Xpoint conversion</span></section>

      <section className="ex-summary" aria-labelledby="ex-value-heading">
        <svg className="ex-summary-art" viewBox="0 0 420 420" fill="none" aria-hidden="true"><defs><linearGradient id="ex-shape-gradient" x1="0" y1="0" x2="420" y2="420"><stop stopColor="#00bc84" stopOpacity=".3" /><stop offset="1" stopColor="#00bc84" stopOpacity="0" /></linearGradient></defs><path d="M30 30Q210 160 390 30Q260 210 390 390Q210 260 30 390Q160 210 30 30Z" fill="url(#ex-shape-gradient)" stroke="#00bc84" strokeOpacity=".35" /><path d="M55 55Q210 165 365 55Q255 210 365 365Q210 255 55 365Q165 210 55 55Z" stroke="#00bc84" strokeOpacity=".08" /></svg>
        <div className="ex-summary-top"><span className="ex-badge">YOUR ALLOCATION ESTIMATE</span><a href={EXTENDED_POINTS_SOURCE} target="_blank" rel="noopener noreferrer">{conversion} ↗</a></div>
        <div className="ex-summary-grid"><div className="ex-payout"><h2 id="ex-value-heading">Estimated XTEN allocation</h2><strong className="ex-value"><NumberTransition value={tokens === null ? "—" : tokenNumber.format(tokens)} animate={true} /> <small>XTEN</small></strong><p>Based on Extended’s published conversion rate</p></div>
          <div className="ex-summary-details"><div className="ex-your-points"><span>Estimated value in USD <small>{validFdv ? `${fdvLabel(fdv)} FDV` : "SET YOUR FDV"}</small></span><strong><NumberTransition value={money(result?.value)} animate={true} /></strong></div><dl className="ex-metrics"><div><dt>Your Xpoints</dt><dd>{points !== null && !pointsError ? tokenNumber.format(points) : "—"}</dd></div><div><dt>Value per Xpoint</dt><dd>{money(result?.valuePerPoint, true)}</dd></div><div><dt>Your pool share</dt><dd>{share}</dd></div><div><dt>Implied XTEN price</dt><dd>{money(result?.tokenPrice, true)}</dd></div></dl></div></div>
        <div className="ex-summary-bottom"><span><i aria-hidden="true" />{pointsError || fdvError ? "Check your inputs below." : tokens === null ? "Enter your Xpoints below to see your estimate." : "Compare USD estimates in the table below."}</span><span>Hypothetical value · USD</span></div>
      </section>

      <div className="ex-workspace">
        <section className="ex-settings ex-panel" aria-labelledby="ex-settings-heading"><div className="ex-panel-heading"><p className="ex-eyebrow">01 / YOUR SCENARIO</p><h2 id="ex-settings-heading">Calculation settings</h2><p>Enter your Xpoints and select an FDV.</p></div>
          <div className="ex-field"><label htmlFor="ex-points">Your Xpoints<span>XP</span></label><input id="ex-points" className="ex-points-input" value={pointsInput} onChange={event => update({ pointsInput: event.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(pointsError)} aria-describedby={pointsError ? "ex-points-help ex-points-error" : "ex-points-help"} />{pointsError && <p className="ex-error" id="ex-points-error" role="alert">{pointsError}</p>}<p className="ex-help" id="ex-points-help">{conversion}</p><output className="ex-converted" htmlFor="ex-points"><span>Estimated XTEN</span><strong>{tokenLabel}</strong></output></div>
          <div className="ex-field ex-fdv-field"><label htmlFor="ex-fdv">Token FDV<span>USD</span></label><div className="ex-presets" role="group" aria-label="FDV presets">{EXTENDED_FDV_PRESETS.map(value => <button key={value} type="button" aria-pressed={fdv === value} onClick={() => update({ fdvInput: String(value) })}>{fdvLabel(value)}</button>)}</div><div className="ex-currency-input"><span aria-hidden="true">$</span><input id="ex-fdv" value={fdvInput} onChange={event => update({ fdvInput: event.target.value })} inputMode="decimal" maxLength={100} autoComplete="off" aria-invalid={Boolean(fdvError)} aria-describedby={fdvError ? "ex-fdv-error" : "ex-fdv-help"} /></div>{fdvError ? <p className="ex-error" id="ex-fdv-error" role="alert">{fdvError}</p> : <p className="ex-help" id="ex-fdv-help">Select a preset, enter any FDV, or apply the market estimate.</p>}</div>
          <div className="ex-fixed-allocation"><div><span>Community allocation</span><strong>{EXTENDED_ALLOCATION}%</strong></div><div className="ex-allocation-track"><span /></div><p>{number.format(EXTENDED_COMMUNITY_TOKENS)} XTEN of the genesis supply</p></div>
          <p className="ex-saved"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.5" /></svg>Your calculation is saved in this browser.</p>
        </section>

        <div className="ex-analysis">
          <section className="ex-matrix ex-panel" aria-labelledby="ex-matrix-heading"><div className="ex-matrix-heading"><div><p className="ex-eyebrow">02 / COMPARE VALUATIONS</p><h2 id="ex-matrix-heading">Value estimates by FDV</h2></div><span className="ex-matrix-tag">XTEN ESTIMATES</span></div>
            <div className="ex-table-wrap" data-lenis-prevent-horizontal><table className="ex-table"><caption className="sr-only">XTEN price, your XTEN quantity and its USD value by FDV</caption><thead><tr><th scope="col">Token FDV</th><th scope="col">XTEN price</th><th scope="col">Your XTEN</th><th scope="col">Value in USD</th></tr></thead><tbody>{rows.map(({ fdv: rowFdv, premarket }) => {
              const cell = rowFdv === null ? null : estimateExtended(rowFdv, tokens);
              const active = rowFdv !== null && fdv === rowFdv;
              const label = rowFdv === null ? markPrice === undefined ? "Loading…" : "Unavailable" : fdvLabel(rowFdv);
              const apply = rowFdv === null ? undefined : () => update({ fdvInput: String(rowFdv) });
              return <tr key={premarket ? "premarket" : rowFdv} className={[premarket && "ex-premarket-row", active && "ex-active-row"].filter(Boolean).join(" ")} onClick={apply}>
                <th scope="row"><button type="button" aria-label={premarket ? `Hyperliquid premarket FDV: ${label}` : `Select ${label} FDV`} aria-pressed={active} disabled={!apply}><i aria-hidden="true" /><b>{label}{premarket && <small>Hyperliquid premarket</small>}</b><span aria-hidden="true">{apply ? "↗" : ""}</span></button></th>
                <td>{premarket && markPrice != null ? markUsd.format(markPrice) : money(cell?.tokenPrice, true)}</td><td>{tokens === null ? "—" : tokenNumber.format(tokens)}</td><td>{money(cell?.value)}</td>
              </tr>;
            })}</tbody></table></div>
            <div className="ex-matrix-footer">
              <span className="ex-matrix-selection"><i className="ex-selected-indicator" aria-hidden="true" />{validFdv ? `${fdvLabel(fdv)} FDV selected` : "Choose a valuation"}{tokens !== null ? ` · ${tokenLabel}` : " · Enter your Xpoints for a personal estimate"}</span>
              <a href={EXTENDED_PREMARKET_URL} target="_blank" rel="noopener noreferrer">Hyperliquid mark price <span aria-hidden="true">↗</span></a>
            </div>
          </section>

          <ExtendedMarketCard currentFdv={fdv} onApply={value => update({ fdvInput: String(value) })} />

          <section className="ex-tokenomics ex-panel" aria-labelledby="ex-tokenomics-heading"><div className="ex-tokenomics-heading"><p className="ex-eyebrow">03 / THE TOKEN MODEL</p><h2 id="ex-tokenomics-heading">Token supply and allocation</h2></div><dl><div><dt>Genesis supply</dt><dd>{number.format(EXTENDED_SUPPLY)} <span>XTEN</span></dd></div><div><dt>Community allocation</dt><dd>{number.format(EXTENDED_COMMUNITY_TOKENS)} <span>XTEN · {EXTENDED_ALLOCATION}%</span></dd></div><div><dt>Total Xpoints</dt><dd>{number.format(EXTENDED_TOTAL_POINTS)} <span>final programme total</span></dd></div></dl></section>
        </div>
      </div>
      <section className="ex-method" aria-labelledby="ex-method-heading"><div><span className="ex-method-mark" aria-hidden="true">↳</span><h2 id="ex-method-heading">Calculation method</h2></div><p>Your XTEN = your Xpoints × (300M ÷ 70M). Estimated USD value = your XTEN × (FDV ÷ 1B).</p><p>Calculations use the full conversion ratio and round for display. Individual allocations depend on Extended’s eligibility and claim requirements. The starting $500M FDV is a manual scenario.</p></section>
    </main>
    <footer className="ex-footer"><span>EXTENDED / UNOFFICIAL COMMUNITY TOOL</span><a href="https://extended.exchange/" target="_blank" rel="noopener noreferrer">Brand by Extended ↗</a></footer>
  </div></div>;
}
