"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import distribution from "@/data/jumper/xp-distribution-2026-10-06.json";
import { estimateTokenAllocation, parsePoints } from "@/lib/estimator";
import { JUMPER_ALLOCATION_PRESETS, JUMPER_ASSUMED_SUPPLY, JUMPER_FDV_PRESETS, jumperEligibility, type JumperEstimateSettings } from "@/lib/jumper-estimator";
import { JUMPER_PREMARKET_URL, type JumperPremarketQuote } from "@/lib/jumper-premarket";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const unitUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const percent = (value: number) => `${number.format(value * 100)}%`;
const snapshotDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(distribution.snapshotAt));

export default function JumperScenarios({ settings, update, walletPoints, walletLookup }: {
  settings: JumperEstimateSettings;
  update: (patch: Partial<JumperEstimateSettings>) => void;
  walletPoints: number | null;
  walletLookup: ReactNode;
}) {
  const [quote, setQuote] = useState<JumperPremarketQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"loading" | "ready" | "unavailable">("loading");
  useEffect(() => {
    const controller = new AbortController();
    let active = false;
    async function load() {
      if (active || controller.signal.aborted) return;
      active = true;
      try {
        const response = await fetch("/api/jumper/premarket", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        const data = response.ok ? await response.json() : null;
        if (typeof data?.price !== "number" || !Number.isFinite(data.price) || data.price <= 0
          || typeof data?.fdv !== "number" || !Number.isFinite(data.fdv) || data.fdv <= 0
          || typeof data?.fetchedAt !== "string" || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error("Quote unavailable");
        if (!controller.signal.aborted) { setQuote(data); setQuoteState("ready"); }
      } catch {
        if (!controller.signal.aborted) { setQuote(null); setQuoteState("unavailable"); }
      } finally { active = false; }
    }
    void load();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  const pointsInput = settings.pointsInput ?? (walletPoints === null ? "" : String(walletPoints));
  const points = parsePoints(pointsInput), total = parsePoints(settings.totalInput), fdv = parsePoints(settings.fdvInput), allocation = parsePoints(settings.allocationInput);
  const eligibility = useMemo(() => jumperEligibility(distribution.histogram, settings.minimumXp), [settings.minimumXp]);
  const eligibleTotal = total === null ? null : total * eligibility.xpShare;
  const belowCutoff = points !== null && points < settings.minimumXp;
  const personalPoints = belowCutoff ? 0 : points;
  function scenario(value: number, share: number, xp: number | null = personalPoints) {
    return eligibleTotal !== null && xp !== null ? estimateTokenAllocation(value, eligibleTotal, xp, JUMPER_ASSUMED_SUPPLY, JUMPER_ASSUMED_SUPPLY * share / 100) : null;
  }
  const selected = fdv !== null && allocation !== null ? scenario(fdv, allocation) : null;
  const perXp = fdv !== null && allocation !== null ? scenario(fdv, allocation, 1) : null;
  const rows = [{ value: quote?.fdv ?? null, premarket: true }, ...JUMPER_FDV_PRESETS.map(value => ({ value, premarket: false }))];
  const problem = eligibility.wallets === 0 ? "No wallets in this snapshot meet the selected cutoff."
    : total === null || total <= 0 ? "Enter a positive total XP pool."
    : points === null ? "Enter your XP or look up a wallet to calculate your allocation."
    : points > (eligibleTotal ?? 0) && !belowCutoff ? "Your XP cannot exceed the eligible XP pool."
    : fdv === null || fdv <= 0 || allocation === null || allocation <= 0 || allocation > 100 ? "Enter a positive FDV and an allocation between 0 and 100%." : null;

  return <>
    <section className="jp-estimate jp-result jp-panel" aria-labelledby="jp-estimate-heading" aria-live="polite">
      <div className="jp-result-art" aria-hidden="true"><span /><span /><span /><img src="/brand/jumper/symbol.svg" alt="" width="300" height="300" /></div>
      <p className="jp-eyebrow">YOUR ALLOCATION ESTIMATE</p>
      <div className="jp-estimate-grid"><div><h2 id="jp-estimate-heading">Estimated value in USD</h2><p className="jp-estimate-value">{selected ? usd.format(selected.value) : "—"}</p><p className="jp-help">{fdv ? `$${compact.format(fdv)} FDV` : "Select an FDV"} · {allocation !== null ? `${number.format(allocation)}% allocation` : "Enter allocation"}</p></div>
        <dl><div><dt>Estimated JUMP</dt><dd>{selected ? number.format(selected.tokens) : "—"}</dd></div><div><dt>Value per XP</dt><dd>{perXp ? unitUsd.format(perXp.valuePerPoint) : "—"}</dd></div><div><dt>Share of eligible XP</dt><dd>{selected ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(selected.poolShare)}%` : "—"}</dd></div><div><dt>Implied token price</dt><dd>{selected ? unitUsd.format(selected.tokenPrice) : "—"}</dd></div></dl>
      </div>
      <p className={problem || belowCutoff ? "jp-help jp-estimate-note" : "jp-help"}>{problem ?? (belowCutoff ? `Your ${number.format(points!)} XP is below the ≥${number.format(settings.minimumXp)} XP cutoff. This scenario assigns no tokens.` : "Proportional allocation under the selected assumptions. Airdrop eligibility and allocation are not confirmed.")}</p>
    </section>

    <div className="jp-estimator-layout">
    <aside className="jp-calculation jp-panel" aria-labelledby="jp-settings-heading">
      <div className="jp-section-heading"><div><p className="jp-eyebrow">01 / SETTINGS</p><h2 id="jp-settings-heading">Calculation settings</h2></div></div>
      {walletLookup}
      <div className="jp-fields">
        <label>Your XP<input inputMode="decimal" value={pointsInput} onChange={event => update({ pointsInput: event.target.value })} placeholder="Enter XP" /></label>
        <label>Token FDV · USD<input inputMode="decimal" value={settings.fdvInput} onChange={event => update({ fdvInput: event.target.value })} /></label>
        <label>Airdrop allocation · %<input inputMode="decimal" value={settings.allocationInput} onChange={event => update({ allocationInput: event.target.value })} /></label>
        <label>Total XP pool<input inputMode="decimal" value={settings.totalInput} onChange={event => update({ totalInput: event.target.value })} /></label>
      </div>
      <div className="jp-eligibility">
        <div className="jp-cutoff-heading"><h3>Eligible wallets</h3><strong>{settings.minimumXp === 0 ? "All" : `≥${number.format(settings.minimumXp)} XP`}</strong></div>
        <div className="jp-cutoff-options">
          <div className="jp-chips">{[0, 25, 100, 500].map(value => <button key={value} type="button" aria-pressed={settings.minimumXp === value} onClick={() => update({ minimumXp: value })}>{value === 0 ? "All" : `≥${value}`}</button>)}</div>
          <label className="jp-custom-cutoff"><span>≥</span><input aria-label="Custom minimum XP" type="number" min="0" max="1000000" step="1" value={settings.minimumXp} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) update({ minimumXp: value }); }} /><span>XP</span></label>
        </div>
        <input className="jp-cutoff-slider" type="range" min="0" max="100" step="1" aria-label="Minimum XP to qualify" aria-valuetext={`${settings.minimumXp} XP`} value={settings.minimumXp === 0 ? 0 : Math.min(100, Math.log10(settings.minimumXp + 1) / Math.log10(10_001) * 100)} onChange={event => update({ minimumXp: Math.round(10_001 ** (Number(event.target.value) / 100) - 1) })} />
        <p className="jp-help"><strong>{compact.format(eligibility.wallets)}</strong> wallets ({percent(eligibility.walletShare)}) · holding <strong>{percent(eligibility.xpShare)}</strong> of snapshot XP · {eligibleTotal !== null ? number.format(eligibleTotal) : "—"} eligible XP in this scenario</p>
        <p className="jp-help jp-snapshot">Estimated distribution · {snapshotDate} snapshot · <a href={distribution.source} target="_blank" rel="noopener noreferrer">Jumper XP data ↗</a></p>
      </div>
    </aside>
    <div className="jp-matrix-column">
    <section className="jp-matrix jp-panel" aria-labelledby="jp-matrix-heading">
      <div className="jp-section-heading"><div><p className="jp-eyebrow">02 / FDV SCENARIOS</p><h2 id="jp-matrix-heading">Value estimates by FDV</h2></div></div>
      <p className="jp-help jp-matrix-caption">{points !== null ? `${number.format(points)} XP` : "Enter your XP in settings"} · Select a cell to apply its FDV and allocation.</p>
      <div className="jp-matrix-scroll" role="region" aria-label="FDV scenarios" tabIndex={0}>
        <table><thead><tr><th scope="col">FDV ↓ /<br />Airdrop →</th>{JUMPER_ALLOCATION_PRESETS.map(share => <th key={share} scope="col">{share}%{share === 33.33 && <small>ALL COMMUNITY</small>}</th>)}</tr></thead>
          <tbody>{rows.map(({ value, premarket }) => {
            const label = value === null ? quoteState === "loading" ? "Loading…" : "Unavailable" : `$${compact.format(value)}`;
            return <tr key={premarket ? "premarket" : value} className={premarket ? "jp-premarket-row" : undefined}><th scope="row">{label}{premarket ? <small>ASPECTA<br />PREMARKET</small> : value === 75_000_000 && <small>SALE SCENARIO</small>}</th>{JUMPER_ALLOCATION_PRESETS.map(share => {
              const cell = value === null ? null : scenario(value, share), unit = value === null ? null : scenario(value, share, 1);
              return <td key={share}><button type="button" disabled={value === null} aria-label={`${premarket ? "Aspecta premarket: " : ""}${label} FDV, ${share}% allocation`} aria-pressed={value !== null && fdv === value && allocation === share} onClick={() => { if (value !== null) update({ fdvInput: String(value), allocationInput: String(share) }); }}><strong>{cell ? usd.format(cell.value) : "—"}</strong><span>{unit ? `${unitUsd.format(unit.valuePerPoint)}/XP` : "—/XP"}</span></button></td>;
            })}</tr>;
          })}</tbody></table>
      </div>
      <p className="jp-help jp-market-source"><a href={JUMPER_PREMARKET_URL} target="_blank" rel="noopener noreferrer">Aspecta premarket ↗</a><span role="status">{quote ? `${unitUsd.format(quote.price)} / JUMP · checked ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(quote.fetchedAt))} UTC · refreshes every minute` : quoteState === "loading" ? "Loading quote…" : "Quote unavailable · manual scenarios available"}</span></p>
    </section>
    <section className="jp-method jp-panel" aria-labelledby="jp-method-heading"><p className="jp-eyebrow">03 / ASSUMPTIONS</p><h2 id="jp-method-heading">Calculation method</h2><p>Eligible XP = total XP pool × the snapshot’s XP share above the selected cutoff. Estimated JUMP = your eligible XP ÷ eligible XP pool × 1B assumed token supply × airdrop allocation. USD value = estimated JUMP × FDV ÷ 1B.</p><p>The default pool is 250M XP. Cutoffs model a hypothetical distribution using the {snapshotDate} snapshot; wallet counts are from that snapshot. The 33.33% column models the full community allocation going to XP holders. Actual eligibility and the XP allocation may differ.</p><p>Aspecta is a derivatives premarket. The quote converts the V3 BuildKey price using its settlement ratio and assumes 1B tokens to calculate FDV.</p></section>
    </div>
    </div>
  </>;
}
