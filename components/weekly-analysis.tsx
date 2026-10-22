"use client";

import { useState } from "react";
import type { PointWeek } from "@/lib/leaderboard";
import type { HoldingBucket, WalletReport } from "@/lib/wallet-analytics";
import { fillsForWeek, marketBreakdown, percentChange, weeklyEfficiency } from "@/lib/wallet-analytics";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const money = (value: string | number | null) => value === null ? "—" : usd.format(Number(value));
const colors: Record<HoldingBucket, string> = { under1h: "#c7b27c", oneTo2h: "#a3b27a", twoTo12h: "#6d9c88", over12h: "#4c8468", openUnder12h: "#9b9e93", openOver12h: "#77955d", unknown: "#be937e" };
const change = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${number.format(value)}%`;
const pointLabel = (point: PointWeek | undefined, ongoing = false) => point?.earned_points != null ? `${number.format(point.earned_points)} PTS` : ongoing ? "Pending" : "No snapshot";

type Props = { report: WalletReport | null; points: PointWeek[]; linkedName: string | null; loading: boolean };

export default function WeeklyHoldingAnalysis({ report, points, linkedName, loading }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const weeks = report?.weekly.weeks ?? [];
  const preferred = [...weeks].reverse().find(week => week.status === "completed" && Number(week.volumeUsd) > 0)
    ?? [...weeks].reverse().find(week => Number(week.volumeUsd) > 0) ?? weeks[weeks.length - 1];
  const selected = weeks.find(week => week.index === selectedIndex) ?? preferred;
  const pointFor = (index: number) => points.find(point => point.week === index);

  if (!selected) return <section className="wallet-card panel analytics-empty" aria-labelledby="weekly-heading" aria-busy={loading}>
    <p className="eyebrow">FROM ACTIVITY TO REWARDS</p>
    <h2 id="weekly-heading">See the story behind each week.</h2>
    <p>{loading ? "Reading your fills and matching opening positions. Weekly comparisons will appear here." : report?.weekly.status === "incomplete" ? "A complete scan is needed for reliable holding times. Select one subaccount, or disable weekly analysis for a shorter volume-only scan." : report?.weekly.status === "disabled" ? "Enable weekly holding analysis in Scan settings to compare points weeks." : "Add your wallet and Arcus name above. Compare what you traded with the points recorded in each distribution."}</p>
    {!report && !loading && <ol className="analytics-steps"><li><span>01</span><strong>Connect the context</strong><p>A public wallet for trades. Your Arcus name for points.</p></li><li><span>02</span><strong>Compare the weeks</strong><p>Volume, fees, holding times and recorded rewards.</p></li><li><span>03</span><strong>Explore the mix</strong><p>See which markets and trading patterns changed.</p></li></ol>}
  </section>;

  const selectedPoint = pointFor(selected.index);
  const efficiency = weeklyEfficiency(selected, selectedPoint, report?.accountScope === "all");
  const previous = weeks.find(week => week.index === selected.index - 1);
  const previousPoint = previous ? pointFor(previous.index) : undefined;
  const previousEfficiency = previous ? weeklyEfficiency(previous, previousPoint, report?.accountScope === "all") : null;
  const completePair = previous && !previous.partialPeriod && !selected.partialPeriod && previous.status === "completed" && selected.status === "completed";
  const volumeChange = completePair ? percentChange(Number(selected.volumeUsd), Number(previous.volumeUsd)) : null;
  const pointsChange = completePair && selectedPoint?.status === "recorded" && previousPoint?.status === "recorded"
    ? percentChange(selectedPoint.earned_points!, previousPoint.earned_points!) : null;
  const feeChange = efficiency.feesPerPoint !== null && previousEfficiency?.feesPerPoint != null
    ? percentChange(efficiency.feesPerPoint, previousEfficiency.feesPerPoint) : null;
  const selectedFills = fillsForWeek(report?.fills ?? [], selected);
  const markets = marketBreakdown(selectedFills);
  const previousMarkets = completePair && previous ? marketBreakdown(fillsForWeek(report?.fills ?? [], previous)) : [];
  const droppedMarkets = previousMarkets.filter(market => !markets.some(current => current.id === market.id));
  const makerVolume = selectedFills.reduce((total, fill) => total + (fill.role === "MAKER" ? Number(fill.notionalUsd) : 0), 0);
  const makerShare = Number(selected.volumeUsd) > 0 ? makerVolume / Number(selected.volumeUsd) * 100 : 0;
  const longShare = Number(selected.volumeUsd) > 0 ? Number(selected.heldAtLeast12hUsd) / Number(selected.volumeUsd) * 100 : 0;
  const maxVolume = Math.max(...weeks.map(week => Number(week.volumeUsd)), 1);
  const maxPoints = Math.max(...points.map(point => point.earned_points ?? 0), 1);
  const knownRewards = selectedPoint?.earned_points !== null && selectedPoint?.earned_points !== undefined;

  function renderMarket(market: typeof markets[number]) {
    return <li key={market.id}>
      <div className="market-title"><strong>{market.market}</strong><b>{money(market.volumeUsd)}</b></div>
      <div className="market-track"><span style={{ width: `${market.sharePercent}%` }} /></div>
      <div className="market-meta"><span>{number.format(market.sharePercent)}% of volume · {market.fillCount} fills</span><span>{money(market.netFeesUsd)} fees</span></div>
      {completePair && <p className="market-previous">{previous?.label} share: {number.format(previousMarkets.find(item => item.id === market.id)?.sharePercent ?? 0)}%</p>}
    </li>;
  }

  return <section className="wallet-card wallet-weekly panel" aria-labelledby="weekly-heading">
    <div className="wallet-section-heading"><div><p className="eyebrow">THE WEEKLY PICTURE</p><h2 id="weekly-heading">Trading & points, week by week.</h2><p>Select a week to explore its trading mix and reward efficiency.</p></div><span className="weekly-method">{points.filter(point => point.earned_points !== null).length} points snapshots</span></div>
    {!linkedName && <p className="analytics-context-note">Load your Arcus name above to add recorded points and weekly efficiency to this comparison.</p>}
    <div className="week-cards" role="group" aria-label="Select a points week">{weeks.map(week => {
      const point = pointFor(week.index);
      return <button type="button" key={week.index} className={`week-card${selected.index === week.index ? " is-selected" : ""}`} aria-pressed={selected.index === week.index} onClick={() => setSelectedIndex(week.index)} aria-label={`Select ${week.label}`}>
        <span className="week-card-top"><strong>{week.label}</strong><span>{week.status === "in_progress" ? "In progress" : week.partialPeriod ? "Partial period" : "Completed"}</span></span>
        <span className="week-card-dates">{day.format(new Date(week.start))} — {day.format(new Date(week.end))}</span>
        <span className="week-card-points">{pointLabel(point, week.status === "in_progress")}<small>{point?.status === "adjusted" ? "snapshot adjustment" : "recorded rewards"}</small></span>
        <span className="week-mini-row"><span>Volume</span><b>${compact.format(Number(week.volumeUsd))}</b></span>
        <span className="week-mini-track"><span style={{ width: `${Number(week.volumeUsd) / maxVolume * 100}%` }} /></span>
        <span className="week-mini-row"><span>Points</span><b>{point?.earned_points == null ? "—" : number.format(point.earned_points)}</b></span>
        <span className="week-mini-track points-track"><span style={{ width: `${Math.max(0, point?.earned_points ?? 0) / maxPoints * 100}%` }} /></span>
      </button>;
    })}</div>

    <div className="weekly-selected-heading"><div><p className="eyebrow">SELECTED DISTRIBUTION WINDOW</p><h3>{selected.label} <span className="weekly-state">{selected.status === "in_progress" ? "In progress" : selected.partialPeriod ? "Selected slice" : "Completed"}</span></h3><p>{date.format(new Date(selected.start))} → {date.format(new Date(selected.end))} UTC</p></div><div className="weekly-profile">{linkedName && <><strong>{linkedName}</strong><span>{selectedPoint?.downloaded_at ? `Snapshot downloaded ${day.format(new Date(selectedPoint.downloaded_at))}` : "Awaiting points snapshot"}</span></>}</div></div>
    <div className="weekly-scorecard">
      <div><span>Trading volume</span><strong>{money(selected.volumeUsd)}</strong><small>{volumeChange === null ? `${selected.fillCount} executed fills` : `${change(volumeChange)} vs ${previous?.label}`}</small></div>
      <div><span>Recorded points</span><strong>{knownRewards ? number.format(selectedPoint.earned_points!) : "—"}<em>{knownRewards ? "PTS" : selected.status === "in_progress" ? "Pending" : "No snapshot"}</em></strong><small>{pointsChange === null ? "From cumulative snapshot changes" : `${change(pointsChange)} vs ${previous?.label}`}</small></div>
      <div><span>Net fees / point</span><strong>{money(efficiency.feesPerPoint)}</strong><small>{feeChange === null ? "Paid fees minus rebates" : `${change(feeChange)} vs ${previous?.label}`}</small></div>
      <div><span>Volume / point</span><strong>{money(efficiency.volumePerPoint)}</strong><small>{efficiency.pointsPer10k === null ? "Full week + recorded points needed" : `${number.format(efficiency.pointsPer10k)} PTS / $10k volume`}</small></div>
    </div>
    {volumeChange !== null && pointsChange !== null && <div className="weekly-observation"><span className="status-dot" /><p><strong>{selected.label} vs {previous?.label}:</strong> volume {change(volumeChange)}, points {change(pointsChange)}. Compare the mix below to explore what changed.</p></div>}
    {!efficiency.comparable && knownRewards && <p className="analytics-context-note">Efficiency needs positive recorded points, a completed full week and all subaccounts. Snapshot points cover the profile; a partial scan or one subaccount cannot represent that full activity.</p>}
    <div className="weekly-trade-facts"><span><b>{selected.fillCount}</b> fills</span><span><b>{number.format(makerShare)}%</b> maker volume</span><span><b>{number.format(longShare)}%</b> held 12h+, including open</span><span><b>{selected.averageClosedHoldHours === null ? "—" : `${number.format(selected.averageClosedHoldHours)}h`}</b> average closed hold</span><span><b>{money(selected.netFeesUsd)}</b> net fees</span></div>

    <div className="weekly-breakdowns">
      <section className="holding-breakdown" aria-labelledby="holding-heading"><div className="breakdown-heading"><h3 id="holding-heading">How long you held</h3><span>Share of executed volume</span></div>
        <div className="weekly-volume-bar" role="img" aria-label={`${selected.label} volume by holding time`}>{selected.buckets.filter(bucket => Number(bucket.volumeUsd) > 0).map(bucket => <span key={bucket.id} style={{ width: `${bucket.sharePercent}%`, background: colors[bucket.id] }} title={`${bucket.label}: ${money(bucket.volumeUsd)}`} />)}</div>
        <ul className="holding-rows">{selected.buckets.map(bucket => <li key={bucket.id}><div><span className="weekly-dot" style={{ background: colors[bucket.id] }} /><span>{bucket.label}{completePair && <small className="holding-previous">{previous?.label}: {number.format(previous?.buckets.find(item => item.id === bucket.id)?.sharePercent ?? 0)}%</small>}</span></div><strong>{money(bucket.volumeUsd)}<small>{number.format(bucket.sharePercent)}%</small></strong></li>)}</ul>
        <p className="wallet-small">FIFO reconstruction. Open entries are aged at this week's cutoff; a later close does not rewrite that earlier state.</p>
      </section>
      <section className="market-breakdown" aria-labelledby="market-heading"><div className="breakdown-heading"><h3 id="market-heading">What you traded</h3><span>{markets.length} {markets.length === 1 ? "market" : "markets"}</span></div>
        {markets.length ? <><ul className="market-rows">{markets.slice(0, 5).map(renderMarket)}</ul>{markets.length > 5 && <details className="more-markets"><summary>Show {markets.length - 5} more markets</summary><ul className="market-rows">{markets.slice(5).map(renderMarket)}</ul></details>}</> : <p className="wallet-small">No fills in this window.</p>}
        {droppedMarkets.length > 0 && <p className="wallet-small">Not traded this week: {droppedMarkets.map(market => market.market).join(", ")}.</p>}
        <p className="wallet-small">Executed entry and exit volume stays in the week it traded. Fees exclude funding and transfers.</p>
      </section>
    </div>
    <p className="analytics-attribution">These are observed comparisons, not trade-level point attribution. Points can also reflect spot activity, deposits, market making and referrals. Holding for 12 hours is an analysis category, not a published points multiplier.</p>
    <details className="weekly-comparison"><summary>Compare all weeks in a table <span>Volume · rewards · fees · holding</span></summary><p className="mobile-table-hint">Scroll sideways for all metrics →</p><div className="wallet-table-scroll" data-lenis-prevent-horizontal><table className="weekly-comparison-table"><caption className="sr-only">Weekly trading and recorded points comparison</caption><thead><tr><th>Week</th><th>Volume</th><th>Points</th><th>Net fees</th><th>12h+ volume</th><th>Fees / point</th></tr></thead><tbody>{weeks.map(week => <tr key={week.index} className={week.index === selected.index ? "weekly-active-row" : undefined}><th scope="row"><button type="button" onClick={() => setSelectedIndex(week.index)}>{week.label}</button></th><td>{money(week.volumeUsd)}</td><td>{pointLabel(pointFor(week.index), week.status === "in_progress")}</td><td>{money(week.netFeesUsd)}</td><td>{money(week.heldAtLeast12hUsd)}</td><td>{money(weeklyEfficiency(week, pointFor(week.index), report?.accountScope === "all").feesPerPoint)}</td></tr>)}</tbody></table></div></details>
    <details className="weekly-methodology"><summary>Data sources & methodology</summary><p>Weekly points are the differences between our saved Season 1 cumulative snapshots. Missing or hidden snapshots stay unknown; negative changes are adjustments and do not produce efficiency ratios. The first distribution uses a Season 1 baseline of zero. Name-to-wallet matching is supplied by you and is not verified by the API.</p><p>Windows follow the <a href="https://arcus.xyz/blog/introducing-arcus-points" target="_blank" rel="noopener noreferrer">Wednesday 15:00 ET distribution schedule ↗</a>, including daylight-saving changes. This is an analysis alignment, not a confirmed activity earning cutoff. Week 1 starts at the assumption of 1 October 2026, 00:00 UTC. Live trades in an ongoing week do not yet have distributed points.</p><p>FIFO matches fills per market and subaccount, including partial closes and flips. Entry and exit notional is counted once in its execution week. Holding time is estimated from available fills; known missing history is marked unknown, otherwise history is assumed to start flat. Earlier fills are read to match openings before a selected period. Ratios require complete scans and complete weeks.</p><p>Arcus describes multiple reward factors, including trading quality, RWA activity, RWA trades outside extended US trading hours, retained deposits and referrals. This page does not infer the unpublished weights or predict future rewards.</p></details>
  </section>;
}
