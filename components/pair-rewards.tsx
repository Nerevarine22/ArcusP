"use client";

import { useState } from "react";
import type { PairForm, PairProject } from "@/lib/pair-analytics";
import { PAIR_PROJECTS } from "@/lib/pair-analytics";
import { PAIR_REWARD_MODELS, pairBreakEvenFdv, pairRewardScenario, type PairRewardInput, type PairRewardInputs } from "@/lib/pair-rewards";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const signedUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, signDisplay: "exceptZero" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const money = (value: string | null, signed = false) => value === null ? "—" : (signed ? signedUsd : usd).format(Number(value));
const statusLabels = { above: "Above break-even", "break-even": "Break-even", below: "Below break-even", unknown: "PnL unavailable" };

export default function PairRewards({ form, inputs, pnl, basis, ready, onChange }: {
  form: PairForm; inputs: PairRewardInputs; pnl: string | null; basis: "equity" | "history"; ready: boolean; onChange: (inputs: PairRewardInputs) => void;
}) {
  const projects = form.map(input => input.project), names = projects.map(id => PAIR_PROJECTS.find(project => project.id === id)!.name);
  const result = pairRewardScenario(projects, inputs, pnl);
  const active = result.legs.flatMap((leg, i) => leg.included ? [i] : []);
  const groups = active.filter((index, position) => active.findIndex(i => projects[i] === projects[index]) === position);
  const [axes, setAxes] = useState<{ row: PairProject | null; column: PairProject | null }>({ row: null, column: null });
  const rowIndex = groups.find(index => projects[index] === axes.row) ?? groups[0] ?? 0;
  const columnIndex = groups.find(index => projects[index] === axes.column && projects[index] !== projects[rowIndex]) ?? groups.find(index => projects[index] !== projects[rowIndex]);
  const twoAxes = columnIndex !== undefined;
  const rowFdvs = PAIR_REWARD_MODELS[projects[rowIndex]]?.presets ?? [];
  const columnFdvs = twoAxes ? PAIR_REWARD_MODELS[projects[columnIndex!]]!.presets : [null];
  function change(index: number, patch: Partial<PairRewardInput>) {
    const shared = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "points"));
    onChange(inputs.map((input, i) => ({ ...input, ...(i === index ? patch : projects[i] === projects[index] ? shared : {}) })));
  }
  function atFdv(row: number, column: number | null): PairRewardInputs {
    return inputs.map((input, index) => ({ ...input, fdv: projects[index] === projects[rowIndex] ? String(row) : twoAxes && projects[index] === projects[columnIndex!] ? String(column) : input.fdv }));
  }
  return <section className="cp-rewards" aria-labelledby="cp-rewards-heading">
    <div className="cp-rewards-heading"><div><p className="cp-eyebrow">POINTS / CONDITIONAL ESTIMATES</p><h2 id="cp-rewards-heading">Points and FDV scenarios</h2></div><p>Base PnL <strong>{money(pnl, true)}</strong><span>{basis === "equity" ? "Account equity" : "Trading history"}</span></p></div>
    <p className="cp-reward-help">Points are entered beside each wallet above. Use the same activity period as your PnL. Blank points exclude that reward; all account PnL stays included.</p>
    <div className="cp-reward-inputs">{inputs.map((input, index) => {
      const supported = Boolean(PAIR_REWARD_MODELS[projects[index]]), leg = result.legs[index];
      return <article className="cp-reward-card" key={index}>
        <h3><i className={`cp-side-dot cp-dot-${index}`} />{String.fromCharCode(65 + index)} · {names[index]}</h3>
        {supported ? <><div className="cp-reward-fields"><div><span className="cp-points-label">Points entered above</span><strong className="cp-points-readonly">{input.points.trim() || "Excluded"}</strong></div><div><label htmlFor={`cp-reward-${index}-fdv`}>Token FDV · USD</label><input id={`cp-reward-${index}-fdv`} inputMode="decimal" type="text" autoComplete="off" maxLength={100} value={input.fdv} disabled={!ready} onChange={event => change(index, { fdv: event.target.value })} placeholder="Enter FDV" /></div></div>
          <details className="cp-reward-assumptions"><summary>Pool and allocation · assumed <span>{compact.format(Number(input.pool))} points · {input.allocation}%</span></summary><div className="cp-reward-fields">{([['pool','Total points pool'],['allocation','Airdrop allocation · %']] as const).map(([key, label]) => <div key={key}><label htmlFor={`cp-reward-${index}-${key}`}>{label}</label><input id={`cp-reward-${index}-${key}`} inputMode="decimal" type="text" autoComplete="off" maxLength={100} value={input[key]} disabled={!ready} onChange={event => change(index, { [key]: event.target.value })} /></div>)}</div></details>
          {leg.error ? <p className="cp-error" role="alert">{leg.error}</p> : <p className="cp-reward-value">{leg.included ? "Estimated points value" : "Reward excluded"}<strong>{leg.included ? money(leg.value) : "—"}</strong></p>}
        </> : <p className="cp-reward-help">No points model is available for this project. Its reward is excluded; its account PnL remains included.</p>}
      </article>;
    })}</div>
    {new Set(projects).size < projects.length && active.length > 0 && <p className="cp-reward-help">Wallets on the same project share its pool, allocation and FDV. Their points are added together.</p>}
    {active.length > 0 ? <>
      {result.error && !result.legs.some(leg => leg.error === result.error) && <p className="cp-error" role="alert">{result.error}</p>}
      <div className={`cp-reward-result cp-reward-${result.status}`}>
        <div><span>Estimated points value · included projects</span><strong>{money(result.rewardValue)}</strong></div>
        <div><span>Net result incl. estimated points</span><strong>{money(result.netResult, true)}</strong><small>{result.error ? "Check assumptions" : statusLabels[result.status]}</small></div>
        <div><span>Net loss to cover</span><strong>{money(result.lossToCover)}</strong><small>{result.coveragePercent !== null ? `${Number(result.coveragePercent).toFixed(1)}% covered by estimated rewards` : result.lossToCover === "0" ? "No loss to cover" : result.error ? "Check points and assumptions" : "Complete base PnL required"}</small></div>
      </div>
      <div className="cp-reward-grid-heading"><h3>Net result by FDV</h3><p>{twoAxes ? `Rows: ${names[rowIndex]} · columns: ${names[columnIndex!]}` : `${names[rowIndex]} FDV · other settings stay fixed`}</p></div>
      {groups.length > 2 && <div className="cp-axis-controls"><label>Row project<select aria-label="FDV row project" value={projects[rowIndex]} onChange={event => setAxes({ row: event.target.value as PairProject, column: event.target.value === projects[columnIndex!] ? projects[rowIndex] : projects[columnIndex!] })}>{groups.map(i => <option key={i} value={projects[i]}>{names[i]}</option>)}</select></label><label>Column project<select aria-label="FDV column project" value={projects[columnIndex!]} onChange={event => setAxes({ row: projects[rowIndex], column: event.target.value as PairProject })}>{groups.filter(i => projects[i] !== projects[rowIndex]).map(i => <option key={i} value={projects[i]}>{names[i]}</option>)}</select></label><p>All other rewards use their selected FDVs.</p></div>}
      <div className="cp-reward-grid-scroll" data-lenis-prevent-horizontal><table className={`cp-reward-grid${twoAxes ? " cp-reward-grid-matrix" : ""}`}><caption className="sr-only">Conditional net result including estimated points. Select a scenario to apply its FDV settings.</caption>
        <thead><tr><th scope="col">{names[rowIndex]} FDV</th>{twoAxes ? columnFdvs.map(fdv => <th scope="col" key={fdv!}>${compact.format(fdv!)}</th>) : <><th scope="col">Estimated points value</th><th scope="col">Net result incl. points</th></>}</tr></thead>
        <tbody>{rowFdvs.map(fdv => <tr key={fdv}><th scope="row">${compact.format(fdv)}</th>{columnFdvs.map(column => {
          const settings = atFdv(fdv, column), scenario = pairRewardScenario(projects, settings, pnl);
          const selected = inputs[rowIndex].fdv === String(fdv) && (!twoAxes || inputs[columnIndex!].fdv === String(column));
          const label = scenario.error ? "Check assumptions" : statusLabels[scenario.status];
          return <ScenarioCell key={column ?? "result"} single={!twoAxes} reward={money(scenario.rewardValue)} net={money(scenario.netResult, true)} status={scenario.status} label={label} selected={selected} onClick={() => onChange(settings)} ariaLabel={`${names[rowIndex]} $${compact.format(fdv)} FDV${twoAxes ? `, ${names[columnIndex!]} $${compact.format(column!)} FDV` : ""}: ${money(scenario.netResult, true)}, ${label}`} />;
        })}</tr>)}</tbody>
      </table></div>
      <p className="cp-reward-help">Select a cell to apply its FDV. Green estimates exceed break-even; red estimates remain below it. Higher FDV raises the estimate at a fixed pool and allocation.</p>
    </> : <p className="cp-reward-empty">Enter points for at least one project to compare reward values and break-even FDV scenarios.</p>}
    <details className="cp-reward-method"><summary>Calculation method and assumptions</summary><p>Point value = FDV × allocation share × your points ÷ total points. Net result = selected base PnL + included point values. Fees and funding are already in base PnL. Pools and allocations are editable assumptions. Estimates assume full reward value; token launch, eligibility, conversion, vesting and realizable proceeds are unconfirmed.</p></details>
  </section>;
}

export function PairBreakEven({ form, inputs, pnl }: { form: PairForm; inputs: PairRewardInputs; pnl: string | null }) {
  const projects = form.map(input => input.project);
  const result = pairRewardScenario(projects, inputs, pnl);
  const active = result.legs.flatMap((leg, index) => leg.included ? [index] : []);
  if (pnl === null || result.error || !active.length) return null;
  const names = projects.map(id => PAIR_PROJECTS.find(project => project.id === id)!.name);
  const shown = active.filter((index, position) => active.findIndex(i => projects[i] === projects[index]) === position);
  return <div className="cp-break-even" data-count={shown.length} aria-label="Primary break-even FDV indicators">{shown.map(index => {
    const threshold = pairBreakEvenFdv(projects, inputs, pnl, index);
    const others = shown.filter(i => projects[i] !== projects[index]);
    return <div className="cp-break-even-card" key={index}><div><span>{names[index]} break-even FDV</span><strong className={threshold === null || threshold === "0" ? "cp-break-even-message" : undefined} title={threshold !== null && threshold !== "0" ? `Exact break-even FDV: ${money(threshold)}` : undefined}>{threshold === "0" ? "Already covered" : threshold === null ? "Positive points required" : `≈ ${compactUsd.format(Number(threshold))}`}</strong></div><div className="cp-break-even-context"><p>{threshold === "0" ? "Base PnL or other included rewards already cover the modeled result." : threshold === null ? "Enter positive points to calculate the FDV threshold." : "Above this approximate FDV, the modeled net result is positive."}</p><small>{others.length === 1 ? `${names[others[0]]} held at $${compact.format(Number(inputs[others[0]].fdv))} FDV.` : others.length > 1 ? "All other included rewards held at their selected FDVs." : "At the entered points, pool and allocation."} Conditional estimate.</small></div></div>;
  })}</div>;
}

function ScenarioCell({ single, reward, net, status, label, selected, onClick, ariaLabel }: { single: boolean; reward: string; net: string; status: string; label: string; selected: boolean; onClick: () => void; ariaLabel: string }) {
  return <>{single && <td>{reward}</td>}<td><button type="button" className={`cp-scenario cp-scenario-${status}`} aria-pressed={selected} aria-label={ariaLabel} onClick={onClick}><strong>{net}</strong>{!single && <span>{reward} rewards</span>}<small>{label}</small></button></td></>;
}
