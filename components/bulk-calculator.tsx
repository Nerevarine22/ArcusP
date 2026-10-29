"use client";

import Link from "next/link";
import NumberTransition from "@/components/number-transition";
import { useBulkEstimate } from "@/hooks/use-bulk-estimate";
import { BULK_FDV_PRESETS, BULK_POOL_PRESETS } from "@/lib/bulk-estimator";
import { estimate, parsePoints } from "@/lib/estimator";
import { featureFlags } from "@/lib/features";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const share = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const money = (value: number | undefined, unit = false) => value === undefined ? "—" : (unit ? unitUsd : usd).format(value);
const fdvLabel = (value: number) => value >= 1e9 ? `$${number.format(value / 1e9)}B` : `$${number.format(value / 1e6)}M`;

export default function BulkCalculator() {
  const [settings, update] = useBulkEstimate();
  const { pointsInput, totalInput, fdvInput, allocationInput, matrixMode } = settings;
  const points = parsePoints(pointsInput), total = parsePoints(totalInput), fdv = parsePoints(fdvInput), allocation = parsePoints(allocationInput);
  const validTotal = total !== null && total >= 1 && total <= 1e15;
  const validFdv = fdv !== null && fdv >= 1 && fdv <= 1e15;
  const validAllocation = allocation !== null && allocation > 0 && allocation <= 100;
  const pointsError = pointsInput.trim() && points === null ? "Enter an AURA amount of zero or greater." : points !== null && validTotal && points > total ? "Your AURA cannot exceed the total AURA pool." : "";
  const totalError = validTotal ? "" : "Enter a total AURA pool between 1 and 1 quadrillion.";
  const fdvError = validFdv ? "" : "Enter an FDV between $1 and $1 quadrillion.";
  const allocationError = validAllocation ? "" : "Enter an allocation greater than 0% and no more than 100%.";
  const unit = validTotal && validFdv && validAllocation ? estimate(fdv, allocation, total, 0) : null;
  const result = unit && points !== null && !pointsError ? estimate(fdv!, allocation!, total!, points) : null;
  const range = validFdv && validAllocation ? [estimate(fdv, allocation, 70e6, 0)!.valuePerPoint, estimate(fdv, allocation, 30e6, 0)!.valuePerPoint] : null;

  return <div className="bk-page"><div className="bk-shell">
    <header className="bk-header"><Link href="/bulk" className="bk-brand" aria-label="BULK AURA calculator"><img src="/brand/bulk/logo.svg" alt="BULK" width="166" height="64" /><span>AURA calculator</span></Link><nav aria-label="BULK navigation">{featureFlags.multiExchange && <Link href="/" className="bk-back">← All projects</Link>}<a className="bk-open" href="https://app.bulk.trade/" target="_blank" rel="noopener noreferrer">Open BULK <span aria-hidden="true">↗</span></a></nav></header>
    <nav className="bk-tools" aria-label="BULK tools"><Link href="/bulk" aria-current="page">Points calculator</Link><Link href="/bulk/wallet">Wallet analytics</Link></nav>
    <main>
      <section className="bk-intro" aria-labelledby="bk-title"><div><p className="bk-eyebrow">BULK / COMMUNITY TOOLS</p><h1 id="bk-title">What could your BULK<br /><span>points be worth?</span></h1></div><div className="bk-intro-note"><img src="/brand/bulk/symbol.svg" alt="" width="48" height="48" /><p>AURA value estimates<br /><span>Based on manual assumptions</span></p></div></section>

      <section className="bk-summary" aria-labelledby="bk-summary-heading"><div className="bk-value"><p className="bk-eyebrow">YOUR ESTIMATE / USD</p><h2 id="bk-summary-heading">Estimated value of your AURA</h2><strong><NumberTransition value={money(result?.value)} animate /></strong><p>{validFdv ? fdvLabel(fdv) : "Set FDV"} FDV <i /> {validAllocation ? `${number.format(allocation)}% allocation` : "Set allocation"} <i /> {validTotal ? `${number.format(total / 1e6)}M AURA pool` : "Set AURA pool"}</p></div><div className="bk-summary-stats"><div><span>Value per AURA</span><strong>{money(unit?.valuePerPoint, true)}</strong></div><div><span>Your AURA</span><strong>{points !== null && !pointsError ? number.format(points) : "—"}</strong></div><div><span>Your share of the AURA pool</span><strong>{result ? `${share.format(result.poolShare)}%` : "—"}</strong></div><div><span>Community pool value</span><strong>{money(unit?.poolValue)}</strong></div></div><div className="bk-summary-foot"><span><i />Proportional allocation model</span><span>Scenario estimates. AURA-to-token conversion is assumed.</span></div></section>

      <div className="bk-workspace">
        <section className="bk-settings bk-panel" aria-labelledby="bk-settings-heading"><div className="bk-section-title"><p className="bk-eyebrow">01 / INPUTS</p><h2 id="bk-settings-heading">Calculation settings</h2></div>
          <div className="bk-field"><label htmlFor="bk-points">Your AURA<span>AURA</span></label><input id="bk-points" className="bk-points-input" value={pointsInput} onChange={e => update({ pointsInput: e.target.value })} inputMode="decimal" autoComplete="off" maxLength={100} placeholder="Enter your AURA" aria-invalid={Boolean(pointsError)} aria-describedby={pointsError ? "bk-points-error" : undefined} />{pointsError && <p id="bk-points-error" className="bk-error" role="alert">{pointsError}</p>}</div>
          <div className="bk-field"><label htmlFor="bk-total">Total AURA pool<span>ASSUMED</span></label><div className="bk-presets" aria-label="Total AURA presets">{BULK_POOL_PRESETS.map(pool => <button type="button" key={pool} aria-pressed={total === pool} onClick={() => update({ totalInput: String(pool) })}>{pool / 1e6}M</button>)}</div><input id="bk-total" value={totalInput} onChange={e => update({ totalInput: e.target.value })} inputMode="decimal" autoComplete="off" maxLength={100} aria-invalid={Boolean(totalError)} aria-describedby="bk-total-help" /><p id="bk-total-help" className={totalError ? "bk-error" : "bk-help"}>{totalError || "30–70M are community scenarios. Enter any pool size to model a different campaign duration."}</p></div>
          <div className="bk-field"><label htmlFor="bk-fdv">Token FDV<span>USD</span></label><div className="bk-currency"><span>$</span><input id="bk-fdv" value={fdvInput} onChange={e => update({ fdvInput: e.target.value })} inputMode="decimal" autoComplete="off" maxLength={100} aria-invalid={Boolean(fdvError)} aria-describedby="bk-fdv-help" /></div><p id="bk-fdv-help" className={fdvError ? "bk-error" : "bk-help"}>{fdvError || "Enter a valuation or select a scenario in the grid."}</p></div>
          <div className="bk-field"><label htmlFor="bk-allocation">Community allocation<span>% · ASSUMED</span></label><input id="bk-allocation" value={allocationInput} onChange={e => update({ allocationInput: e.target.value })} inputMode="decimal" autoComplete="off" maxLength={100} aria-invalid={Boolean(allocationError)} aria-describedby="bk-allocation-help" /><p id="bk-allocation-help" className={allocationError ? "bk-error" : "bk-help"}>{allocationError || "30% is the starting assumption, allocated proportionally across the entire AURA pool."}</p></div>
          <p className="bk-saved">✓ Inputs and the selected scenario are saved in this browser.</p>
        </section>

        <section className="bk-panel bk-matrix" aria-labelledby="bk-matrix-heading"><div className="bk-matrix-heading"><div className="bk-section-title"><p className="bk-eyebrow">02 / SCENARIOS</p><h2 id="bk-matrix-heading">Value estimates by FDV</h2></div><div className="bk-mode" role="group" aria-label="Grid values"><button type="button" aria-pressed={matrixMode === "unit"} onClick={() => update({ matrixMode: "unit" })}>Per AURA</button><button type="button" aria-pressed={matrixMode === "personal"} onClick={() => update({ matrixMode: "personal" })}>Your AURA</button></div></div>
          <p className="bk-grid-help">{validAllocation ? `${number.format(allocation)}% community allocation` : "Set community allocation"} · {matrixMode === "unit" ? "USD per AURA" : points !== null && !pointsError ? `${number.format(points)} AURA · estimated USD value` : "Enter your AURA to calculate your value"}</p>
          <div className="bk-table-wrap"><table className="bk-table"><caption className="sr-only">BULK FDV and total AURA pool scenarios. Select a cell to apply its FDV and pool.</caption><thead><tr><th scope="col">FDV</th>{BULK_POOL_PRESETS.map(pool => <th scope="col" key={pool} className={total === pool ? "bk-current-pool" : undefined}>{pool / 1e6}M <small>TOTAL AURA</small></th>)}</tr></thead><tbody>{BULK_FDV_PRESETS.map(row => <tr key={row}><th scope="row">{fdvLabel(row)}</th>{BULK_POOL_PRESETS.map(pool => {
            const active = row === fdv && pool === total;
            const validPoints = points !== null && points <= pool;
            const cell = validAllocation && (matrixMode === "unit" || validPoints) ? estimate(row, allocation, pool, matrixMode === "unit" ? 1 : points!) : null;
            return <td key={pool}><button type="button" className={active ? "bk-selected" : undefined} aria-label={`Select ${fdvLabel(row)} FDV and ${pool / 1e6}M total AURA`} aria-pressed={active} onClick={() => update({ fdvInput: String(row), totalInput: String(pool) })}>{money(cell?.value, matrixMode === "unit")}<span aria-hidden="true">{active ? "↗" : ""}</span></button></td>;
          })}</tr>)}</tbody></table></div>
          <div className="bk-grid-footer"><span><i />{validFdv && validTotal ? `${fdvLabel(fdv)} FDV · ${number.format(total)} total AURA` : "Select a scenario"}</span><span>Click any cell to apply</span></div>
          <div className="bk-range"><div><p className="bk-eyebrow">30–70M AURA POOL RANGE</p><h3>{range ? `${money(range[0], true)} – ${money(range[1], true)}` : "—"}<span>per AURA</span></h3></div><p>At {validFdv ? fdvLabel(fdv) : "your selected"} FDV and {validAllocation ? `${number.format(allocation)}%` : "your selected"} allocation. A larger total pool reduces value per AURA.</p></div>
        </section>
      </div>

      <section className="bk-method" aria-labelledby="bk-method-heading"><div><p className="bk-eyebrow">03 / METHODOLOGY</p><h2 id="bk-method-heading">Calculation method</h2></div><div><p className="bk-formula">Value = FDV × allocation % × (your AURA ÷ total AURA)</p><p>The 30–70M AURA pools and 30% starting allocation are community assumptions supplied for this calculator. The model assumes all eligible AURA shares one allocation proportionally. Final eligibility, campaign duration, category weights and conversion rules may differ.</p><p>Values are calculated directly, then rounded for display. No token supply is assumed. These scenarios do not establish a token launch, claimable allocation or guaranteed return. Project reference: <a href="https://www.bulk.trade/" target="_blank" rel="noopener noreferrer">BULK ↗</a>.</p></div></section>
    </main><footer className="bk-footer"><span>BULK / UNOFFICIAL COMMUNITY TOOL</span><a href="https://www.bulk.trade/brand" target="_blank" rel="noopener noreferrer">Brand assets ↗</a></footer>
  </div></div>;
}
