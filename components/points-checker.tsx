"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LeaderboardInfo, SearchResult } from "@/lib/leaderboard";
import { ALLOCATION_PRESETS, ASSUMED_TOTAL_POINTS, FDV_PRESETS, estimate, parsePoints } from "@/lib/estimator";
import ThemeToggle from "@/components/theme-toggle";
import ReferralOffer from "@/components/referral-offer";
import EstimatePreview from "@/components/estimate-preview";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdvLabel = (value: number) => value >= 1e9 ? `$${number.format(value / 1e9)}B` : `$${number.format(value / 1e6)}M`;
const money = (value: number | undefined) => value === undefined ? "—" : usd.format(value);

export default function PointsChecker({ info, initialTheme }: { info: LeaderboardInfo | null; initialTheme: "light" | "dark" }) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [totalInput, setTotalInput] = useState(String(ASSUMED_TOTAL_POINTS));
  const [fdv, setFdv] = useState(FDV_PRESETS[0]);
  const [allocation, setAllocation] = useState(10);
  const [perPoint, setPerPoint] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);

  function changeName(value: string) {
    controller.current?.abort();
    setName(value);
    setError("");
    if (result) setPointsInput("");
    setResult(null);
    setLoading(false);
  }

  function editPoints(value: string) {
    controller.current?.abort();
    setLoading(false);
    setError("");
    setResult(null);
    setPointsInput(value);
    setPerPoint(false);
  }

  async function search(value: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setResult(null);
    setPointsInput("");
    setError("");
    if (!value.trim()) {
      setError("Enter a nickname to search.");
      setLoading(false);
      input.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/points?name=${encodeURIComponent(value)}`, { cache: "no-store", signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed. Please try again.");
      if (!current.signal.aborted) {
        const found = data as SearchResult;
        setResult(found);
        setPointsInput(found.entry.points === null ? "" : String(found.entry.points));
        setPerPoint(found.entry.points === null);
      }
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "Search failed. Please try again.");
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void search(name); }

  const points = parsePoints(pointsInput);
  const totalPoints = parsePoints(totalInput);
  const validTotal = totalPoints !== null && totalPoints > 0;
  const pointsError = pointsInput.trim() && (points === null || (validTotal && points > totalPoints))
    ? "Points must be a number between 0 and the total points pool." : "";
  const showDemo = !name.trim() && !pointsInput.trim() && !result && !loading && validTotal;
  const currentInfo = result ?? info;
  const rankPercent = result ? result.entry.rank / result.total * 100 : null;
  const modelSource = Number(totalInput) === ASSUMED_TOTAL_POINTS ? "11M — reference assumption" : "Custom total points pool";

  return <div className="site-shell">
    <header className="site-header">
      <a href="/" className="brand" aria-label="Arcus Points Estimator — home"><img className="brand-logo brand-logo-light" src="/brand/arcus-logo.svg" alt="Arcus" width="134" height="40" /><img className="brand-logo brand-logo-dark" src="/brand/arcus-logo-cream.svg" alt="Arcus" width="134" height="40" /><span className="brand-divider" aria-hidden="true" /><span className="brand-product">POINTS ESTIMATOR</span></a>
      <div className="header-actions"><ReferralOffer /><span className="season-pill"><span className="status-dot" />{currentInfo?.season ?? "Season 1"}</span><ThemeToggle initialTheme={initialTheme} /></div>
    </header>
    <main>
      <div className="page-intro"><div><p className="eyebrow">ARCUS COMMUNITY TOOL</p><h1>What could your Arcus<br />points be worth?</h1></div><span className="model-tag"><span className="status-dot" />Hypothetical model</span></div>

      <section className="summary panel" aria-labelledby="estimate-heading">
        <div className="summary-kicker"><span className="accent-tag">AIRDROP ALLOCATION ESTIMATE</span><span>Proportional allocation · {validTotal ? number.format(totalPoints) : "—"} total points</span></div>
        <EstimatePreview demo={showDemo} points={points} totalPoints={totalPoints} fdv={fdv} fdvLabel={fdvLabel(fdv)} allocation={allocation} pointLabel={result ? `${result.entry.name} · ${result.entry.tier}` : "Your points"} sourceLabel={result ? "From the leaderboard snapshot" : points !== null ? "Manual estimate" : "Find your nickname or enter points below"} />
        <div className="summary-footer"><span>Participants: <b>{currentInfo ? number.format(currentInfo.total) : "—"}</b></span><span>Snapshot points: <b>{currentInfo?.snapshot_points != null ? number.format(currentInfo.snapshot_points) : "—"}</b></span><span>Your rank: <b>{result ? `#${number.format(result.entry.rank)}` : "—"}</b></span><span className="model-origin">{modelSource}</span></div>
      </section>

      <div className="estimator-layout">
        <aside className="settings panel" aria-labelledby="settings-heading">
          <h2 id="settings-heading">Parameters & settings</h2><p className="muted settings-intro">Find your points and choose a scenario.</p>
          <div className="setting-group"><form onSubmit={submit} noValidate><label htmlFor="nickname">Search by nickname</label><div className="nickname-row"><input ref={input} id="nickname" placeholder="Witty Phoenix" value={name} onChange={event => changeName(event.target.value)} maxLength={100} autoComplete="off" spellCheck={false} aria-describedby="search-status" aria-invalid={Boolean(error)} /><button className="primary-button" type="submit" disabled={loading || !info}>{loading ? "…" : "Find"}</button></div></form>
            <div id="search-status" className={`search-status ${error ? "error" : ""}`} aria-live="polite">{!info ? "Snapshot unavailable. You can still enter points manually." : loading ? "Searching the leaderboard…" : error || (result ? `Found: ${result.entry.name} · ${result.entry.tier}` : "Search ignores letter case and extra spaces.")}</div>
          </div>
          <div className="setting-group"><label htmlFor="points">Your points <span>{result ? "JSON" : "MANUAL"}</span></label><input id="points" className="large-input" inputMode="decimal" placeholder="Enter your points" value={pointsInput} onChange={event => editPoints(event.target.value)} aria-describedby="points-error" aria-invalid={Boolean(pointsError)} /><p id="points-error" className="error">{pointsError}</p></div>
          <div className="setting-group"><div className="control-heading"><label htmlFor="fdv">Token FDV</label><strong>{fdvLabel(fdv)}</strong></div><div className="preset-list fdv-presets">{FDV_PRESETS.map(value => <button key={value} type="button" aria-pressed={fdv === value} onClick={() => setFdv(value)}>{fdvLabel(value)}</button>)}</div><input id="fdv" type="range" min={500_000_000} max={3_000_000_000} step={100_000_000} value={fdv} onChange={event => setFdv(Number(event.target.value))} aria-valuetext={fdvLabel(fdv)} /><div className="range-captions"><span>$500M</span><span>$3B</span></div></div>
          <div className="setting-group"><div className="control-heading"><label htmlFor="allocation">Airdrop allocation</label><strong>{allocation}%</strong></div><div className="preset-list">{ALLOCATION_PRESETS.map(value => <button key={value} type="button" aria-pressed={allocation === value} onClick={() => setAllocation(value)}>{value}%</button>)}</div><input id="allocation" type="range" min={5} max={15} step={1} value={allocation} onChange={event => setAllocation(Number(event.target.value))} aria-valuetext={`${allocation}%`} /><div className="range-captions"><span>5%</span><span>15%</span></div></div>
          <div className="setting-group total-setting"><label htmlFor="total-points">Total points pool</label><input id="total-points" inputMode="decimal" value={totalInput} onChange={event => setTotalInput(event.target.value)} aria-describedby="total-help" aria-invalid={!validTotal} /><p id="total-help" className={validTotal ? "muted" : "error"}>{validTotal ? "11M is a model assumption, not the current Season 1 total." : "Enter a total points pool greater than zero."}</p><div className="total-shortcuts"><button className="text-button" type="button" onClick={() => setTotalInput(String(ASSUMED_TOTAL_POINTS))}>Use 11M assumption</button>{currentInfo?.snapshot_points != null && currentInfo.snapshot_points > 0 && <button className="text-button" type="button" onClick={() => setTotalInput(String(currentInfo.snapshot_points))}>Use snapshot total</button>}</div></div>
        </aside>

        <div className="matrix-column">
          <section className="standing panel" aria-labelledby="standing-heading"><div className="standing-head"><div><h2 id="standing-heading">Leaderboard standing</h2><p>{result && rankPercent !== null ? `Top ${number.format(Math.ceil(rankPercent * 10) / 10)}% of participants · ${result.entry.tier}` : "Find your nickname to see your leaderboard rank."}</p></div><strong>{result ? `#${number.format(result.entry.rank)}` : "—"}<small> / {currentInfo ? number.format(currentInfo.total) : "—"}</small></strong></div><div className="position-track"><span style={{ width: result ? `${(1 - (result.entry.rank - 1) / result.total) * 100}%` : "0%" }} /></div></section>

          <section className="matrix-panel panel" aria-labelledby="matrix-heading"><div className="matrix-heading"><div><h2 id="matrix-heading">Scenario matrix</h2><p>{perPoint ? "Value per point" : points !== null ? `${number.format(points)} PTS · your estimated allocation` : "Enter your points to see your allocation"} · click a cell to select a scenario</p></div><div className="view-toggle" aria-label="Matrix view"><button type="button" aria-pressed={perPoint} onClick={() => setPerPoint(true)}>Per point</button><button type="button" aria-pressed={!perPoint} onClick={() => setPerPoint(false)}>My points</button></div></div>
            <div className="matrix-scroll"><table><caption className="sr-only">Estimated value by FDV and airdrop allocation. Total pool: {validTotal ? totalPoints : "not set"} points.</caption><thead><tr><th scope="col">TOKEN FDV</th>{ALLOCATION_PRESETS.map(value => <th key={value} scope="col">{value}%<small>ALLOCATION</small></th>)}</tr></thead><tbody>{FDV_PRESETS.map(row => <tr key={row}><th scope="row">{fdvLabel(row)}</th>{ALLOCATION_PRESETS.map(column => {
              const cell = validTotal ? estimate(row, column, totalPoints, perPoint ? 1 : points ?? -1) : null;
              const unitCell = validTotal ? estimate(row, column, totalPoints, 1) : null;
              const selected = fdv === row && allocation === column;
              return <td key={column}><button className="matrix-cell" type="button" aria-pressed={selected} aria-label={`${fdvLabel(row)} FDV, ${column}% allocation: ${money(cell?.value)}`} onClick={() => { setFdv(row); setAllocation(column); }}><strong>{money(cell?.value)}</strong><span>{perPoint ? "per point" : `${money(unitCell?.valuePerPoint)} / PTS`}</span>{selected && <span className="selected-dot" aria-hidden="true" />}</button></td>;
            })}</tr>)}</tbody></table></div>
            <div className="matrix-footnote"><span className="status-dot" />Selected: {fdvLabel(fdv)} FDV · {allocation}% airdrop · {validTotal ? number.format(totalPoints) : "—"} total PTS</div>
          </section>
          <div className="model-explanation"><p><b>Formula:</b> Value per point = FDV × airdrop allocation ÷ total points.</p><p>Your estimate = value per point × your points. These hypothetical scenarios assume equal, proportional point conversion. A token launch and airdrop are not guaranteed.</p></div>
        </div>
      </div>
    </main>
    <footer className="site-footer"><span>ARCUS · COMMUNITY POINTS ESTIMATOR</span><span>Snapshot: {currentInfo ? "7 October 2026, at 19:00 UTC" : "unavailable"}</span></footer>
  </div>;
}
