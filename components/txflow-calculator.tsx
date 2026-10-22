"use client";

import NumberTransition from "@/components/number-transition";
import TxflowHeader from "@/components/txflow-header";
import { useTxflowEstimate } from "@/hooks/use-txflow-estimate";
import { estimate, parsePoints } from "@/lib/estimator";
import { TXFLOW_ALLOCATION_PRESETS as ALLOCATION_PRESETS, TXFLOW_FDV_PRESETS as FDV_PRESETS, TXFLOW_POOL_PRESETS } from "@/lib/txflow-estimator";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const fdvLabel = (value: number) => value >= 1_000_000_000 ? `$${number.format(value / 1_000_000_000)}B` : `$${number.format(value / 1_000_000)}M`;

export default function TxflowCalculator({ initialTheme }: { initialTheme: "light" | "dark" }) {
  const [settings, update] = useTxflowEstimate();
  const { pointsInput, totalInput, poolMode, fdv, allocation, perPoint } = settings;
  const points = parsePoints(pointsInput);
  const total = poolMode === "manual" ? parsePoints(totalInput) : TXFLOW_POOL_PRESETS[poolMode];
  const poolLabel = poolMode === "basic" ? "Basic" : poolMode === "bullish" ? "Bullish" : "Manual";
  const validTotal = total !== null && total > 0;
  const pointsError = pointsInput.trim() && points === null ? "Enter a valid number of points, zero or greater."
    : points !== null && validTotal && points > total ? "Your points cannot exceed the total points pool." : "";
  const totalError = poolMode === "manual" && totalInput.trim() && !validTotal ? "Enter a total points pool greater than zero." : "";
  const result = points !== null && validTotal ? estimate(fdv, allocation, total, points) : null;
  const unitResult = validTotal ? estimate(fdv, allocation, total, 0) : null;
  const share = result ? `${percent.format(result.poolShare)}%` : "—";
  const matrixReady = validTotal && (perPoint || result !== null);

  return <div className="txflow-page">
    <div className="tf-shell">
      <TxflowHeader initialTheme={initialTheme} active="points" />

      <main>
        <section className="tf-intro" aria-labelledby="tf-title">
          <div><p className="tf-eyebrow">[ TXFLOW / COMMUNITY TOOLS ]</p><h1 id="tf-title">Your points.<br /><span>The possibilities.</span></h1></div>
          <div className="tf-intro-note"><span className="tf-status"><i aria-hidden="true" />POINTS SIMULATION</span><p>Set your assumptions.<br />Explore what your points could be worth.</p></div>
        </section>

        <section className="tf-summary" aria-labelledby="tf-summary-title">
          <div className="tf-section-bar"><span><i aria-hidden="true" />ALLOCATION ESTIMATE</span><span>01 / OVERVIEW</span></div>
          <div className="tf-summary-grid">
            <div className="tf-payout">
              <h2 id="tf-summary-title">Estimated airdrop value</h2>
              <strong className="tf-payout-number"><NumberTransition value={result ? usd.format(result.value) : "—"} animate={true} /></strong>
              <p>Based on <b>{fdvLabel(fdv)}</b> FDV and <b>{allocation}%</b> airdrop allocation</p>
            </div>
            <div className="tf-summary-details">
              <div className="tf-user-points"><span>Your points <small>MANUAL INPUT</small></span><strong>{points !== null && !pointsError ? number.format(points) : "—"}<em>PTS</em></strong></div>
              <dl className="tf-metrics">
                <div><dt>Share of points pool</dt><dd>{share}</dd></div>
                <div><dt>Value per point</dt><dd>{unitResult ? unitUsd.format(unitResult.valuePerPoint) : "—"}</dd></div>
                <div><dt>Airdrop pool value</dt><dd>{usd.format(fdv * allocation / 100)}</dd></div>
                <div><dt>Total points assumed</dt><dd>{validTotal ? number.format(total) : "—"}<small>PTS</small></dd></div>
              </dl>
            </div>
          </div>
          <div className="tf-summary-footer"><span className="tf-model-message">{result ? "Your scenario is ready. Compare the matrix below." : pointsError || totalError ? "Check the highlighted inputs below." : validTotal ? "Enter your points below to calculate your allocation." : "Enter your points and total pool below to get started."}</span><span>[ {poolLabel.toUpperCase()} POOL / HYPOTHETICAL SCENARIO ]</span></div>
        </section>

        <div className="tf-workspace">
          <section className="tf-settings tf-panel" aria-labelledby="tf-settings-title">
            <div className="tf-panel-heading"><span className="tf-eyebrow">02 / PARAMETERS</span><h2 id="tf-settings-title">Build your scenario</h2><p>Your points. Your assumptions.</p></div>
            <div className="tf-input-group">
              <label htmlFor="tf-points">Your points<span>PTS</span></label>
              <input id="tf-points" className="tf-points-input" inputMode="decimal" autoComplete="off" maxLength={100} value={pointsInput} onChange={event => update({ pointsInput: event.target.value, perPoint: false })} aria-invalid={Boolean(pointsError)} aria-describedby={pointsError ? "tf-points-error" : undefined} />
              {pointsError && <p id="tf-points-error" className="tf-error" role="alert">{pointsError}</p>}
            </div>
            <div className="tf-input-group tf-pool-input-group">
              <div className="tf-control-label" id="tf-pool-label">Total points pool<span>SCENARIO</span></div>
              <div className="tf-pool-options" role="group" aria-labelledby="tf-pool-label">{([['basic', 'Basic', '45.6M'], ['bullish', 'Bullish', '52.1M'], ['manual', 'Manual', 'Custom']] as const).map(([mode, name, detail]) => <button key={mode} type="button" aria-pressed={poolMode === mode} onClick={() => update({ poolMode: mode })}><strong>{name}</strong><span>{detail}</span></button>)}</div>
              {poolMode === "manual" ? <div className="tf-custom-pool"><label htmlFor="tf-total">Custom total points<span>PTS</span></label>
              <input id="tf-total" inputMode="decimal" autoComplete="off" maxLength={100} value={totalInput} onChange={event => update({ totalInput: event.target.value })} aria-invalid={Boolean(totalError)} aria-describedby={totalError ? "tf-total-error" : "tf-total-help"} />
              {totalError ? <p id="tf-total-error" className="tf-error" role="alert">{totalError}</p> : <p id="tf-total-help" className="tf-help">Enter your assumed pool. Your custom value is kept when switching scenarios.</p>}</div> : <><p className="tf-pool-value">{number.format(total!)} <span>PTS</span></p><p className="tf-help">Approximate pool from the reference simulation, not an official total.</p></>}
            </div>
            <div className="tf-setting-divider" />
            <div className="tf-input-group">
              <label htmlFor="tf-fdv">Token FDV<strong>{fdvLabel(fdv)}</strong></label>
              <div className="tf-presets tf-fdv-presets" role="group" aria-label="FDV presets">{FDV_PRESETS.map(value => <button key={value} type="button" aria-pressed={fdv === value} onClick={() => update({ fdv: value })}>{fdvLabel(value)}</button>)}</div>
              <input id="tf-fdv" type="range" min={250_000_000} max={1_000_000_000} step={25_000_000} value={fdv} onChange={event => update({ fdv: Number(event.target.value) })} aria-valuetext={fdvLabel(fdv)} />
              <div className="tf-range-labels"><span>$250M</span><span>$1B</span></div>
            </div>
            <div className="tf-input-group">
              <label htmlFor="tf-allocation">Airdrop allocation<strong>{allocation}%</strong></label>
              <div className="tf-presets" role="group" aria-label="Allocation presets">{ALLOCATION_PRESETS.map(value => <button key={value} type="button" aria-pressed={allocation === value} onClick={() => update({ allocation: value })}>{value}%</button>)}</div>
              <input id="tf-allocation" type="range" min={15} max={25} step={1} value={allocation} onChange={event => update({ allocation: Number(event.target.value) })} aria-valuetext={`${allocation}%`} />
              <div className="tf-range-labels"><span>15%</span><span>25%</span></div>
            </div>
            <p className="tf-saved-note"><span aria-hidden="true">↳</span> Your calculation is saved in this browser.</p>
          </section>

          <div className="tf-analysis">
            <section className="tf-pool-strip tf-panel" aria-label="Your share of the points pool">
              <div><span className="tf-eyebrow">YOUR SLICE OF THE POOL</span><p>{result ? `${number.format(points!)} of ${number.format(total!)} total points` : "Add your points and pool to see your share"}</p></div><strong>{share}</strong>
              <div className="tf-pool-track" role="progressbar" aria-label="Share of total points" aria-valuemin={0} aria-valuemax={100} {...(result ? { "aria-valuenow": result.poolShare } : { "aria-valuetext": "Enter points and pool to calculate" })}><span style={{ width: `${result?.poolShare ?? 0}%` }} /></div>
            </section>

            <section className="tf-matrix tf-panel" aria-labelledby="tf-matrix-title">
              <div className="tf-matrix-heading"><div><span className="tf-eyebrow">03 / COMPARE OUTCOMES</span><h2 id="tf-matrix-title">Scenario matrix</h2></div><div className="tf-view-toggle" role="group" aria-label="Matrix display"><button type="button" aria-pressed={perPoint} onClick={() => update({ perPoint: true })}>Per point</button><button type="button" aria-pressed={!perPoint} onClick={() => update({ perPoint: false })}>My points</button></div></div>
              <p className="tf-matrix-description"><b>{poolLabel} pool{validTotal ? ` · ${number.format(total)} PTS` : ""}</b><br />{perPoint ? "Implied value of one point" : points !== null && !pointsError ? `${number.format(points)} PTS · your estimated allocation` : "Enter your points to see your estimated allocation"} <span>· Select a cell to explore</span></p>
              <p className="tf-table-hint">Swipe to view all scenarios →</p>
              <div className="tf-table-wrap"><table className="tf-table"><caption className="sr-only">{perPoint ? "Estimated value per point" : "Estimated value of your points"} by token FDV and airdrop allocation</caption><thead><tr><th scope="col">TOKEN FDV</th>{ALLOCATION_PRESETS.map(value => <th key={value} scope="col"><b>{value}%</b><span>ALLOCATION</span></th>)}</tr></thead><tbody>{FDV_PRESETS.map(row => <tr key={row}><th scope="row">{fdvLabel(row)}</th>{ALLOCATION_PRESETS.map(column => {
                const cell = validTotal ? estimate(row, column, total, perPoint ? 0 : (points ?? -1)) : null;
                const active = row === fdv && column === allocation;
                const cellValue = matrixReady && cell ? (perPoint ? unitUsd.format(cell.valuePerPoint) : usd.format(cell.value)) : "—";
                return <td key={column}><button type="button" className={active ? "is-active" : ""} aria-pressed={active} aria-label={`${fdvLabel(row)} FDV, ${column}% allocation${matrixReady && cell ? `: ${cellValue}${perPoint ? " per point" : " estimated value"}` : ""}`} onClick={() => update({ fdv: row, allocation: column })}><strong>{cellValue}</strong><small>{matrixReady && cell ? (perPoint ? "/ POINT" : `${unitUsd.format(cell.valuePerPoint)} / PT`) : "AWAITING INPUT"}</small>{active && <span className="tf-cell-marker" aria-hidden="true">↗</span>}</button></td>;
              })}</tr>)}</tbody></table></div>
              <div className="tf-matrix-footer"><span className="tf-selected-dot" aria-hidden="true" />Selected: {fdvLabel(fdv)} FDV · {allocation}% allocation{validTotal && <> · {number.format(total)} total PTS</>}</div>
            </section>
            <section className="tf-method" aria-labelledby="tf-method-title"><span aria-hidden="true">↳</span><div><h2 id="tf-method-title">The math, made clear.</h2><p>Estimated value = FDV × airdrop allocation × (your points ÷ total points pool).</p><p>Basic (45.6M) and Bullish (52.1M) use the approximate pools from the reference image. Values are calculated at full precision and rounded to two decimals for display.</p><p>FDV, allocation, and pools are scenario assumptions, not an official TxFlow conversion formula. Token launch and airdrop are not guaranteed.</p></div></section>
          </div>
        </div>
      </main>
      <footer className="tf-footer"><span>TXFLOW / UNOFFICIAL COMMUNITY TOOL</span><a href="https://docs.txflow.com/resources/brand-kit" target="_blank" rel="noopener noreferrer">Brand by TxFlow ↗</a></footer>
    </div>
  </div>;
}
