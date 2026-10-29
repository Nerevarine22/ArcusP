"use client";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useBulkWallet} from "@/hooks/use-bulk-wallet";
import {bulkEpochs,isBulkAddress,type BulkWalletReport} from "@/lib/bulk-wallet";
import {parsePoints,sumPointInputs} from "@/lib/estimator";
import {featureFlags} from "@/lib/features";

const num=new Intl.NumberFormat("en-US",{maximumFractionDigits:2}), precise=new Intl.NumberFormat("en-US",{maximumFractionDigits:8});
const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const feeUsd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:6});
const day=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
const date=new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"UTC"});
const money=(value:string|number|null|undefined,fees=false)=>value==null?"—":(fees?feeUsd:usd).format(Number(value));
const percentage=(part:string|undefined,total:string|undefined)=>part!==undefined&&total!==undefined&&Number(total)>0?`${num.format(Number(part)/Number(total)*100)}%`:"0%";
const cacheKey="bulk-wallet-report-v1";
const periodCode=(id:string)=>id.replace(/^T(?=\d)/,"W");

export default function BulkWallet(){
  const [settings,update,ready]=useBulkWallet();
  const address=settings.address.trim(),valid=isBulkAddress(address);
  const [report,setReport]=useState<BulkWalletReport|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  const [showOtherPeriods,setShowOtherPeriods]=useState(false);
  const [now,setNow]=useState<number|null>(null),controller=useRef<AbortController|null>(null);
  useEffect(()=>{setNow(Date.now());return()=>controller.current?.abort();},[]);
  useEffect(()=>{
    if(!ready)return;
    try{const saved=JSON.parse(sessionStorage.getItem(cacheKey)??"null") as BulkWalletReport|null;setReport(saved?.version===1&&saved.address===address?saved:null);}catch{setReport(null);}
  },[ready,address]);
  const epochs=report?.epochs??(now===null?[]:bulkEpochs(now));
  const selected=report?.periods.find(row=>row.id===settings.selected)??report?.periods.find(row=>row.id==="ALL");
  const summary=selected?.summary,funding=selected?.funding;
  const getPoints=(id:string)=>settings.points[`${address}:${id}`]??"";
  const enteredEpochs=epochs.filter(epoch=>parsePoints(getPoints(epoch.id))!==null);
  const otherEpochs=enteredEpochs.length?epochs.filter(epoch=>parsePoints(getPoints(epoch.id))===null):[];
  const visibleEpochs=enteredEpochs.length?enteredEpochs:epochs;
  useEffect(()=>{
    if(!ready||showOtherPeriods||!enteredEpochs.length||!epochs.some(epoch=>epoch.id===settings.selected)||parsePoints(getPoints(settings.selected))!==null)return;
    update({selected:(enteredEpochs.find(epoch=>!epoch.predeposit)??enteredEpochs[0]).id});
  },[ready,showOtherPeriods,settings.selected,settings.points,address,epochs]);
  const ids=selected?.predeposit?["PRE"]:selected?.epochIds??[];
  const points=sumPointInputs(ids.map(getPoints));
  const known=ids.filter(id=>parsePoints(getPoints(id))!==null).length;
  const ratio=points!==null&&points>0&&summary&&summary.fills>0?{volume:Number(summary.volume)/points,fees:Number(summary.netFees)/points,pointsPer10k:Number(summary.volume)>0?points/Number(summary.volume)*10000:0}:null;
  function editAddress(value:string){controller.current?.abort();setLoading(false);setError("");setReport(null);setShowOtherPeriods(false);update({address:value});}
  async function analyze(event:FormEvent){
    event.preventDefault();if(!valid){setError("Enter a valid Solana wallet or BULK account address.");return;}
    controller.current?.abort();const request=new AbortController();controller.current=request;setLoading(true);setError("");
    try{const response=await fetch("/api/bulk/wallet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address}),signal:request.signal});const data=await response.json();if(!response.ok)throw new Error(data.error??"BULK activity could not be loaded.");if(!request.signal.aborted){setReport(data);try{sessionStorage.setItem(cacheKey,JSON.stringify(data));}catch{/* The report remains visible. */}}}
    catch(cause){if(!request.signal.aborted)setError(cause instanceof Error?cause.message:"BULK activity could not be loaded.");}
    finally{if(!request.signal.aborted)setLoading(false);}
  }
  function download(){
    if(!report)return;
    const exported={...report,manualAura:Object.fromEntries(report.epochs.map(epoch=>[epoch.id,parsePoints(getPoints(epoch.id))])),selectedPeriod:selected?.id,boundaryConvention:"Approximate Saturday 13:00 UTC; half-open windows",exportedAt:new Date().toISOString()};
    const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:"application/json"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=`bulk-wallet-${address}-${report.fetchedAt.slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function epochCards(items:typeof epochs){
    return <div className="bw-epoch-grid">{items.map(epoch=>{
      const period=report?.periods.find(row=>row.id===epoch.id),aura=parsePoints(getPoints(epoch.id));
      return <button type="button" key={epoch.id} aria-pressed={selected?.id===epoch.id} onClick={()=>update({selected:epoch.id})}><span>{epoch.id==="PRE"?"Pre-deposit":periodCode(epoch.id)}<small>{epoch.completed?"Ended":"In progress"}</small></span><p>{day.format(epoch.start)} – {day.format(epoch.end)}</p><strong>{aura===null?"—":num.format(aura)} <small>AURA</small></strong><p>{epoch.predeposit?"Deposit phase":`${money(period?.summary?.volume)} loaded volume`}</p></button>;
    })}</div>;
  }
  return <div className="bk-page bw-page"><div className="bk-shell">
    <header className="bk-header"><Link href="/bulk" className="bk-brand" aria-label="BULK AURA calculator"><img src="/brand/bulk/logo.svg" alt="BULK" width="166" height="64"/><span>Wallet analytics</span></Link><nav aria-label="BULK navigation">{featureFlags.multiExchange&&<Link href="/" className="bk-back">← All projects</Link>}<a className="bk-open" href="https://app.bulk.trade/" target="_blank" rel="noopener noreferrer">Open BULK ↗</a></nav></header>
    <nav className="bw-tool-nav" aria-label="BULK tools"><Link href="/bulk">Points calculator</Link><Link href="/bulk/wallet" aria-current="page">Wallet analytics</Link></nav>
    <main>
      <section className="bk-intro bw-intro"><div><p className="bk-eyebrow">BULK / WALLET ANALYTICS</p><h1>Trading activity<br/><span>and weekly AURA</span></h1></div><p>Volume, execution costs and position duration.<br/><span>AURA is entered manually for each period.</span></p></section>
      <section className="bk-panel bw-query" aria-labelledby="bw-query-title"><div className="bk-section-title"><p className="bk-eyebrow">01 / ACCOUNT LOOKUP</p><h2 id="bw-query-title">Analyze wallet activity</h2></div>
        <form onSubmit={analyze}><div className="bk-field"><label htmlFor="bw-address">Wallet or account address<span>SOLANA</span></label><input id="bw-address" value={settings.address} onChange={e=>editAddress(e.target.value)} maxLength={44} autoCapitalize="off" autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby="bw-status"/></div><button className="bk-open bw-analyze" type="submit" disabled={loading||!ready}>{loading?"Loading activity…":"Analyze activity"}<span aria-hidden="true">↗</span></button></form>
        <p id="bw-status" className={error?"bk-error":"bk-help"} role={error?"alert":"status"}>{error||(loading?"Loading public BULK executions, funding and current positions…":"Read only. No wallet connection or signature. Includes this account and its isolated lanes; separate sub-accounts require their own address.")}</p>
        <details className="bw-points" open><summary>AURA by period <span>Manual input</span></summary><p>Enter received AURA separately for each week. Enter 0 for a confirmed zero award; leave unreceived awards blank. Pre-deposit AURA is excluded from trading efficiency.</p><div className="bw-points-grid">{epochs.map(epoch=>{
          const input=getPoints(epoch.id),invalid=input.trim()!==""&&parsePoints(input)===null;
          return <div className="bw-point-card" key={epoch.id}><div><strong>{epoch.id==="PRE"?"Pre-deposit":periodCode(epoch.id)}</strong><span>{epoch.completed?"Window ended":"In progress"}</span></div><p>{day.format(epoch.start)} – {day.format(epoch.end)} {new Date(epoch.end).getUTCFullYear()}</p><label htmlFor={`bw-aura-${epoch.id}`}>AURA for this period</label><input id={`bw-aura-${epoch.id}`} value={input} disabled={!valid} onChange={e=>update({points:{...settings.points,[`${address}:${epoch.id}`]:e.target.value}})} inputMode="decimal" maxLength={100} autoComplete="off" placeholder="Not entered" aria-invalid={invalid}/>{invalid&&<p className="bk-error">Enter a number of zero or greater.</p>}</div>;
        })}</div></details>
        <p className="bw-boundary">Trading weeks use Saturday ≈13:00 UTC as an analysis convention. These are approximate windows, not verified exchange snapshots. W1 starts 5 September 2026; pre-deposit starts 1 June.</p>
      </section>

      {!report&&!loading&&<div className="bk-panel bw-empty"><img src="/brand/bulk/symbol.svg" alt="" width="50" height="50"/><h2>Enter an account to view its trading history</h2><p>Compare weekly volume, maker and taker costs, holding times and manually recorded AURA.</p></div>}
      {report&&selected&&<div className="bw-results">
        <section className="bw-epochs" aria-labelledby="bw-epochs-title"><div className="bw-section-head"><div className="bk-section-title"><p className="bk-eyebrow">02 / DISTRIBUTION WINDOWS</p><h2 id="bw-epochs-title">Activity by period</h2></div><span>Saturday ≈13:00 UTC</span></div><div className="bw-period-options" role="group" aria-label="Combined trading periods"><button type="button" aria-pressed={selected.id==="ALL"} onClick={()=>update({selected:"ALL"})}>All trading history</button><button type="button" aria-pressed={selected.id==="COMPLETED"} onClick={()=>update({selected:"COMPLETED"})}>Completed trading weeks</button></div>{enteredEpochs.length>0&&<p className="bk-help">Periods with entered AURA</p>}{epochCards(visibleEpochs)}{otherEpochs.length>0&&<details className="bw-other-periods" open={showOtherPeriods} onToggle={event=>setShowOtherPeriods(event.currentTarget.open)}><summary>Other periods <span>{otherEpochs.length} without entered AURA</span></summary>{epochCards(otherEpochs)}</details>}</section>

        <section className="bk-summary bw-summary" aria-labelledby="bw-summary-title"><div className="bk-value"><p className="bk-eyebrow">{periodCode(selected.id)} / SELECTED PERIOD</p><h2 id="bw-summary-title">{selected.predeposit?"Pre-deposit AURA":`${selected.label} · loaded trading volume`}</h2><strong>{selected.predeposit?(points===null?"—":num.format(points)):money(summary?.volume)}</strong><p>{date.format(new Date(selected.from))} → {date.format(new Date(selected.to))} UTC</p></div><div className="bk-summary-stats"><div><span>{selected.predeposit?"Reward source":"Trading AURA in period"}</span><strong>{selected.predeposit?"Pre-deposits":points===null?"—":num.format(points)}</strong></div><div><span>Net execution fees</span><strong>{money(summary?.netFees)}</strong></div><div><span>Volume / AURA</span><strong>{money(ratio?.volume)}</strong></div><div><span>Net fees / AURA</span><strong>{money(ratio?.fees,true)}</strong></div></div><div className="bk-summary-foot"><span>{selected.predeposit?"Excluded from trading efficiency":`${summary?.fills??"—"} fills · ${known}/${ids.length} AURA inputs entered`}</span><span>Retrieved {date.format(new Date(report.fetchedAt))} UTC</span></div></section>
        {report.warnings.length>0&&<div className="bw-warning" role="status">{report.warnings.map(warning=><p key={warning}>{warning}</p>)}</div>}

        {selected.predeposit?<section className="bk-panel bw-pre"><h2>Pre-deposit phase</h2><p>1 June – 5 September 2026. First AURA award: 6 June; the last full pre-deposit week was around 29 August. The transition hour is approximate.</p><p>This read-only trading API does not establish historical pre-deposit balances or a time-weighted deposit score. Enter pre-deposit AURA manually. It is kept separate from trading-week AURA, volume and fee ratios.</p></section>:<>
          {points===null&&<p className="bw-info">Enter AURA for every included trading week to calculate period efficiency. Pending or blank awards are not treated as zero.</p>}
          <div className="bw-analysis-grid">
            <section className="bk-panel bw-execution" aria-labelledby="bw-execution-title"><div className="bk-section-title"><p className="bk-eyebrow">03 / EXECUTION PROFILE</p><h2 id="bw-execution-title">Maker and taker activity</h2></div><p className="bk-help">{selected.label} · {periodCode(selected.id)}</p><div className="bw-role-bar" aria-label="Execution volume by role"><span style={{width:percentage(summary?.makerVolume,summary?.volume)}}/><span style={{width:percentage(summary?.takerVolume,summary?.volume)}}/>{summary&&Number(summary.unknownRoleVolume)>0&&<span style={{width:percentage(summary.unknownRoleVolume,summary.volume)}}/>}</div><div className="bw-roles">{(["maker","taker",...(summary&&Number(summary.unknownRoleVolume)>0?["unknown"]:[])] as const).map(role=>{
              const fees=summary?.feesByRole[role as "maker"|"taker"|"unknown"],volume=role==="maker"?summary?.makerVolume:role==="taker"?summary?.takerVolume:summary?.unknownRoleVolume;
              return <article key={role}><h3>{role==="unknown"?"Unclassified":role==="maker"?"Maker":"Taker"}<span>{percentage(volume,summary?.volume)}</span></h3><dl><div><dt>Volume</dt><dd>{money(volume)}</dd></div><div><dt>Fees paid</dt><dd>{money(fees?.paid,true)}</dd></div><div><dt>Rebates</dt><dd>{money(fees?.rebates,true)}</dd></div><div><dt>Net fees</dt><dd>{money(fees?.net,true)}</dd></div></dl></article>;
            })}</div><p className="bk-help">USDC execution fees. Funding is separate. Values cover loaded executions.</p></section>
            <section className="bk-panel bw-holding" aria-labelledby="bw-holding-title"><div className="bk-section-title"><p className="bk-eyebrow">04 / POSITION DURATION</p><h2 id="bw-holding-title">Holding times</h2></div><p className="bk-help">{selected.label} · FIFO estimate at the selected cutoff</p><div className="bw-holding-facts"><div><span>Average matched closed hold</span><strong>{selected.holding.averageClosedHoldHours===null?"—":`${num.format(selected.holding.averageClosedHoldHours)}h`}</strong></div><div><span>Volume held 12h+, including open</span><strong>{selected.holding.status==="incomplete"?"—":percentage(selected.holding.heldAtLeast12h,summary?.volume)}</strong></div></div><ul>{selected.holding.buckets.map(row=><li key={row.id}><span>{row.label}</span><strong>{money(row.volume)}<small>{num.format(row.sharePercent)}%</small></strong></li>)}</ul>{selected.holding.notes.map(note=><p className="bk-help" key={note}>{note}</p>)}<p className="bk-help">“Open” means open at this period’s cutoff, even if it closed in a later week. Estimates describe loaded executions, not an official AURA multiplier.</p></section>
          </div>
          <div className="bw-analysis-grid"><section className="bk-panel bw-markets"><div className="bk-section-title"><p className="bk-eyebrow">05 / MARKET BREAKDOWN</p><h2>What you traded</h2></div><p className="bk-help">{selected.label}</p><ul>{selected.markets.map(row=><li key={row.market}><div><strong>{row.market}</strong><b>{money(row.volume)}</b></div><p>{row.fills} fills · {percentage(row.makerVolume,row.volume)} maker volume <span>{money(row.netFees,true)} net fees</span></p></li>)}</ul>{!selected.markets.length&&<p className="bk-help">No loaded executions in this period.</p>}</section><section className="bk-panel bw-efficiency"><div className="bk-section-title"><p className="bk-eyebrow">06 / AURA EFFICIENCY</p><h2>Trading activity and AURA</h2></div><p className="bk-help">{selected.label}</p><dl><div><dt>AURA per $10K volume</dt><dd>{ratio?precise.format(ratio.pointsPer10k):"—"}</dd></div><div><dt>Funding received</dt><dd>{money(funding?.received)}</dd></div><div><dt>Funding paid</dt><dd>{money(funding?.paid)}</dd></div><div><dt>Net funding</dt><dd>{money(funding?.net)}</dd></div></dl><p className="bk-help">Manual AURA and observed trading activity are compared for the same approximate window. This does not attribute rewards to individual fills or identify BULK’s scoring formula. Referral and other non-trading AURA should not be entered as Trading AURA.</p></section></div>
        </>}

        <section className="bk-panel bw-current"><div className="bk-section-title"><p className="bk-eyebrow">07 / CURRENT EXPOSURE</p><h2>Current positions</h2></div><p className="bk-help">Snapshot at retrieval time, independent of the selected historical period.</p><div className="bw-table-wrap" data-lenis-prevent-horizontal><table className="bw-table"><caption className="sr-only">Current BULK positions.</caption><thead><tr><th>Market</th><th>Size</th><th>Entry price</th><th>Notional</th><th>Unrealized PnL</th><th>Leverage</th></tr></thead><tbody>{report.account?.positions.map(row=><tr key={row.key}><th scope="row">{row.market}</th><td>{precise.format(Number(row.size))}</td><td>{money(row.entryPrice,true)}</td><td>{money(row.value)}</td><td>{money(row.unrealizedPnl)}</td><td>{num.format(Number(row.leverage))}×</td></tr>)}</tbody></table></div>{!report.account?.positions.length&&<p className="bk-help">{report.account?"No open positions in this snapshot.":"Current positions are unavailable."}</p>}</section>
        <section className="bk-method bw-method"><div><p className="bk-eyebrow">08 / METHODOLOGY</p><h2>Data sources and calculation</h2><button className="bk-open bw-export" type="button" onClick={download}>Export analysis JSON ↗</button></div><div><p>Volume sums price × size for each execution, counting entry and exit separately. Fees use the queried account’s effective fee, not both counterparties’ fees. Legacy API rows without tradeId report signed balance changes (negative paid, positive received); documented rows with tradeId use cost signs. Both are normalized into paid fees and rebates.</p><p>History follows the API’s opaque cursor. Unknown coverage remains flagged; a completed page scan does not prove complete lifetime history. Holding reconstruction is FIFO, anchored to the current positions when available. Missing opening exposure remains unknown. Separate account and isolated-market books are never netted together.</p><p>Pre-deposit AURA and trading AURA are separate. Weekly windows follow the supplied Saturday ≈13:00 UTC convention, including the 5 September transition. Actual distribution times may differ. The API does not provide AURA awards in these account queries.</p><p>Your address, period and manual AURA are stored in this browser. The report is cached for this tab’s session; Analyze activity refreshes it. <a href="https://docs.bulk.trade/api-reference/getAccount" target="_blank" rel="noopener noreferrer">BULK account API ↗</a></p></div></section>
      </div>}
    </main><footer className="bk-footer"><span>BULK / UNOFFICIAL COMMUNITY TOOL</span><span>Public account data · Manual AURA</span></footer>
  </div></div>;
}
