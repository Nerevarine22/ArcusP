"use client";

import { useSyncExternalStore } from "react";
import NumberTransition from "@/components/number-transition";
import RisexHeader from "@/components/risex-header";
import { estimate, parsePoints } from "@/lib/estimator";

const fdvScenarios = [250e6, 300e6, 500e6, 800e6, 1e9];
const allocationScenarios = [15, 20, 25, 30];
const poolScenarios = [9e6, 10e6, 12e6];
const [lowPool, , highPool] = poolScenarios;
const storageKey = "risex-estimate-v1";
const defaults = { points: "", pool: "10000000", fdv: "500000000", allocation: "20", mode: "unit" as "unit" | "personal" };
type Settings = typeof defaults;
type InputKey = Exclude<keyof Settings, "mode">;

let fallback = "";
const serverSnapshot = () => "";

function snapshot() {
  try { return localStorage.getItem(storageKey) ?? ""; }
  catch { return fallback; }
}

function subscribe(refresh: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) refresh(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(storageKey, refresh);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(storageKey, refresh);
  };
}

function readSettings(raw: string): Settings {
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved !== "object") return defaults;
    const field = (key: InputKey) => typeof saved[key] === "string" && saved[key].length <= 32 ? saved[key] : defaults[key];
    return { points: field("points"), pool: field("pool"), fdv: field("fdv"), allocation: field("allocation"), mode: saved.mode === "personal" ? "personal" : "unit" };
  } catch { return defaults; }
}

function update(patch: Partial<Settings>) {
  fallback = JSON.stringify({ ...readSettings(snapshot()), ...patch });
  try { localStorage.setItem(storageKey, fallback); } catch { /* Keep settings available in memory. */ }
  window.dispatchEvent(new Event(storageKey));
}

function parseInput(raw: string) {
  const value = raw.trim().replace(/[\u00a0\u202f ]/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(value) && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)) return null;
  return parsePoints(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value) ? value.replaceAll(",", "") : value);
}

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const unitCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const usd = (value: number | null | undefined, unit = false) => value == null ? "—" : (unit ? unitCurrency : currency).format(value);
const inRange = (value: number | null): value is number => value !== null && value >= 1 && value <= 1e15;

export default function RisexCalculator() {
  const settings = readSettings(useSyncExternalStore(subscribe, snapshot, serverSnapshot));
  const points = parseInput(settings.points);
  const pool = parseInput(settings.pool);
  const fdv = parseInput(settings.fdv);
  const allocation = parseInput(settings.allocation);
  const validPool = inRange(pool);
  const validFdv = inRange(fdv);
  const validAllocation = allocation !== null && allocation > 0 && allocation <= 100;
  const pointsError = settings.points.trim() && points === null ? "Enter a number of points of zero or greater." : points !== null && validPool && points > pool ? "Your points cannot exceed total points." : "";
  const validPoints = points !== null && !pointsError;
  const unit = validPool && validFdv && validAllocation ? estimate(fdv, allocation, pool, 0) : null;
  const result = unit && validPoints ? estimate(fdv!, allocation!, pool!, points) : null;
  const low = validFdv && validAllocation ? estimate(fdv, allocation, highPool, 0)?.valuePerPoint : null;
  const high = validFdv && validAllocation ? estimate(fdv, allocation, lowPool, 0)?.valuePerPoint : null;

  function input(key: InputKey, error: string, placeholder?: string) {
    return <input id={`rx-${key}`} value={settings[key]} onChange={event => update({ [key]: event.target.value })}
      maxLength={32} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={placeholder}
      aria-invalid={!!error} aria-describedby={key !== "points" || error ? `rx-${key}-help` : undefined} />;
  }

  return <div className="rx-page"><div className="rx-shell">
    <RisexHeader tool="calculator" />
    <main>
      <section className="rx-intro" aria-labelledby="rx-title">
        <div className="rx-intro-copy">
          <p className="rx-eyebrow">RISEX / COMMUNITY TOOLS</p>
          <h1 id="rx-title">What could your RISEx <span>points be worth?</span></h1>
          <p>Estimate the value of your points in USD using different valuations, airdrop allocations, and total points.</p>
        </div>
        <span className="rx-projection">9–12M total points · Community estimate</span>
      </section>

      <section className="rx-summary" aria-labelledby="rx-summary-heading">
        <div className="rx-summary-art" aria-hidden="true">
          <img src="/brand/risex/symbol.svg" width="440" height="440" alt="" />
        </div>
        <p className="rx-summary-badge">YOUR POINTS ESTIMATE</p>
        <div className="rx-summary-grid">
          <div className="rx-main-value">
            <h2 id="rx-summary-heading">Estimated value of your points</h2>
            <strong aria-live="polite"><NumberTransition value={usd(result?.value)} animate /></strong>
            <p>{validFdv && validAllocation && validPool ? `${compactUsd.format(fdv)} FDV · ${number.format(allocation)}% allocation · ${number.format(pool)} total points` : "Enter valid scenario settings to calculate value."}</p>
          </div>
          <dl className="rx-summary-stats">
            <div><dt>Your points</dt><dd>{validPoints ? number.format(points) : "—"}</dd></div>
            <div><dt>Value per point</dt><dd>{usd(unit?.valuePerPoint, true)}</dd></div>
            <div><dt>Your share of total points</dt><dd>{result ? `${number.format(result.poolShare)}%` : "—"}</dd></div>
            <div><dt>Assumed airdrop value</dt><dd>{usd(unit?.poolValue)}</dd></div>
          </dl>
        </div>
        <div className="rx-summary-footer">
          <span>{pointsError ? "Check your points below." : points === null ? "Enter your points below to see your estimate." : "Compare estimates in the FDV grid below."}</span>
          <span>Scenario estimate · USD</span>
        </div>
      </section>

      <div className="rx-workspace">
        <section className="rx-panel rx-settings" aria-labelledby="rx-settings-heading">
          <p className="rx-eyebrow">01 / INPUTS</p>
          <h2 id="rx-settings-heading">Calculation settings</h2>
          <div className="rx-field">
            <label htmlFor="rx-points">Your RISEx points</label>
            {input("points", pointsError, "Enter your points")}
            {pointsError && <p id="rx-points-help" className="rx-error">{pointsError}</p>}
          </div>
          <div className="rx-field">
            <label htmlFor="rx-pool">Total points <span>ASSUMED</span></label>
            <div className="rx-options" role="group" aria-label="Total points presets">
              {poolScenarios.map(value => <button type="button" key={value} aria-pressed={pool === value} onClick={() => update({ pool: String(value) })}>{value / 1e6}M</button>)}
            </div>
            {input("pool", validPool ? "" : "invalid")}
            <p id="rx-pool-help" className={validPool ? undefined : "rx-error"}>{validPool ? "Choose a preset or enter a custom total." : "Enter total points between 1 and 1 quadrillion."}</p>
          </div>
          <div className="rx-field">
            <label htmlFor="rx-fdv">Token FDV <span>USD</span></label>
            {input("fdv", validFdv ? "" : "invalid")}
            <p id="rx-fdv-help" className={validFdv ? undefined : "rx-error"}>{validFdv ? "Fully diluted valuation. Enter a value or select a cell in the grid." : "Enter an FDV between $1 and $1 quadrillion."}</p>
          </div>
          <div className="rx-field">
            <label htmlFor="rx-allocation">Airdrop allocation <span>% · ASSUMED</span></label>
            {input("allocation", validAllocation ? "" : "invalid")}
            <p id="rx-allocation-help" className={validAllocation ? undefined : "rx-error"}>{validAllocation ? "Share of the token supply assumed to go to points holders." : "Enter a percentage greater than 0 and no more than 100."}</p>
          </div>
          <p className="rx-save-note">Settings are saved in this browser.</p>
        </section>

        <section className="rx-panel rx-scenarios" aria-labelledby="rx-scenario-heading">
          <div className="rx-scenario-head">
            <div><p className="rx-eyebrow">02 / SCENARIOS</p><h2 id="rx-scenario-heading">Value estimates by FDV</h2></div>
            <div className="rx-options" role="group" aria-label="Scenario values">
              <button type="button" aria-pressed={settings.mode === "unit"} onClick={() => update({ mode: "unit" })}>Per point</button>
              <button type="button" aria-pressed={settings.mode === "personal"} onClick={() => update({ mode: "personal" })}>My points</button>
            </div>
          </div>
          <p className="rx-grid-note">{validPool ? `${number.format(pool)} total points` : "Enter a valid points total"} · {settings.mode === "unit" ? "USD per point" : validPoints ? `Value of ${number.format(points)} points` : "Enter your points to see your estimate"}</p>
          <table className="rx-table">
            <caption className="sr-only">Select a cell to apply its FDV and allocation.</caption>
            <thead><tr><th scope="col">FDV</th>{allocationScenarios.map(value => <th key={value} scope="col">{value}%</th>)}</tr></thead>
            <tbody>{fdvScenarios.map(row => <tr key={row}><th scope="row">{compactUsd.format(row)}</th>{allocationScenarios.map(column => {
              const active = fdv === row && allocation === column;
              const cell = validPool ? estimate(row, column, pool, 0) : null;
              const value = settings.mode === "unit" ? cell?.valuePerPoint : cell && validPoints ? points * cell.valuePerPoint : null;
              const label = usd(value, settings.mode === "unit");
              return <td key={column}><button type="button" aria-label={`${compactUsd.format(row)} FDV, ${column}% allocation: ${value == null ? "no estimate" : label}`} aria-pressed={active}
                onClick={() => update({ fdv: String(row), allocation: String(column) })}>{label}</button></td>;
            })}</tr>)}</tbody>
          </table>
          <p className="rx-grid-foot"><i aria-hidden="true" />Select any cell to apply its FDV and allocation.</p>
          <div className="rx-range">
            <div><p className="rx-eyebrow">9–12M POINTS POOL</p><strong>{low != null && high != null ? `${usd(low, true)} – ${usd(high, true)}` : "—"}</strong><span> per point</span></div>
            <p>Estimated range at the selected FDV and allocation.</p>
          </div>
        </section>
      </div>

      <section className="rx-panel rx-method" aria-labelledby="rx-method-heading">
        <div><p className="rx-eyebrow">03 / METHODOLOGY</p><h2 id="rx-method-heading">Calculation method</h2></div>
        <div><p className="rx-formula">Estimated value = FDV × allocation share × (your points ÷ total points)</p>
          <p>The 9–12M pool is a community projection based on an estimated 1.5–1.6M Season 0 points and an assumed 200K points per week through Q2 2027. The calculator starts with a 10M pool.</p>
          <p>The model assigns every eligible point the same share of the airdrop. The total points, allocation, FDV, and any conversion to tokens are unconfirmed.</p>
        </div>
      </section>
    </main>
    <footer className="rx-footer"><span>RISEx / UNOFFICIAL COMMUNITY TOOL</span><a href="https://www.rise.trade/en/competition" target="_blank" rel="noopener noreferrer">RISEx competitions ↗</a></footer>
  </div></div>;
}
