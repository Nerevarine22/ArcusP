import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(['./entropy-wallet','./txflow-wallet','./entropy-builder'].includes(specifier)?specifier+'.ts':specifier,context);}});
const {parseBuilderArchive,reconcileBuilderExecutions,mergeBuilderDay,buildBuilderReport,builderDayFresh,builderProgress,entropyArchiveDays}=await import('../lib/entropy-builder.ts');
const {normalizeHyperliquidPerpFill}=await import('../lib/entropy-wallet.ts');
const {syncBuilderWallet}=await import('../lib/entropy-builder-service.ts');
const address='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const day='2026-11-12',now=Date.parse('2026-11-16T12:00:00Z');
const header='time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee';
const line=(patch={})=>Object.values({time:day+'T10:00:00Z',user:address,coin:'io:SNDK',side:'Bid',px:'100',sz:'1',crossed:'false',special:'Na',tif:'Gtc',trigger:'false',counterparty:other,pnl:'0',twap:'0',builderFee:'0',...patch}).join(',');
const archive=(lines=[line()],date=day)=>parseBuilderArchive(header+'\n'+lines.join('\n')+'\n',date,address);
const snapshot=(date=day,lines=[line({time:date+'T10:00:00Z'})])=>({...archive(lines,date),checkedAt:new Date(now).toISOString(),etag:'etag'});
const raw=(patch={})=>normalizeHyperliquidPerpFill({coin:'io:SNDK',tid:'9007199254740993',oid:'2',px:'100',sz:'1',side:'B',crossed:false,time:Date.parse(day+'T10:00:00.123Z'),startPosition:'0',closedPnl:'0',fee:'0.01',feeToken:'USDC',...patch});

test('builder attribution includes native and other DEX perps, excludes counterparties, and retains zero-fee executions',()=>{
  const result=archive([line(),line({coin:'BTC'}),line({coin:'xyz:NVDA'}),line({coin:'@107'}),line({user:other,counterparty:address})]);
  assert.deepEqual(result.fills.map(f=>f.market),['io:SNDK','BTC','xyz:NVDA']);
  assert.equal(result.archiveRows,5);
  assert.equal(result.fills[0].builderFee,'0');
  assert.equal(result.archiveFirst,day+'T10:00:00.000Z');
  assert.equal(normalizeHyperliquidPerpFill({coin:'@107'}),null);
});

test('archive identities preserve duplicate executions and survive row reordering and decimal formatting',()=>{
  const a=line(),b=line({px:'101'}),one=archive([a,a,b]),two=archive([b,a,a]);
  assert.equal(new Set(one.fills.map(f=>f.key)).size,3);
  assert.deepEqual(one.fills.map(f=>f.key).sort(),two.fills.map(f=>f.key).sort());
  assert.equal(archive([line({px:'100.00',sz:'1.0'})]).fills[0].key,one.fills[0].key);
  const decimal=archive([line({px:'0.000000000000000001',sz:'1.5'})]).fills[0];
  assert.equal(decimal.notional,'0.000000000000000002');
});

test('malformed, truncated and wrong-day archives cannot produce successful zero history',()=>{
  for(const text of ['','time,user\n',header+'\n'+line().slice(0,-3),header+'\n'+line({px:'NaN'}),header+'\n'+line({time:'2026-11-13T10:00:00Z'}),header+'\n'+line({crossed:'maybe'})])assert.throws(()=>parseBuilderArchive(text,day,address));
  assert.equal(parseBuilderArchive(header+'\n',day,address).fills.length,0);
});

test('fee enrichment never imports foreign trades or ambiguously matched fees',()=>{
  const fills=archive().fills,history=[raw(),raw({coin:'BTC',tid:'4'}),raw({time:Date.parse(day+'T10:01:00Z'),tid:'5'})];
  const enriched=reconcileBuilderExecutions(fills,history);
  assert.equal(enriched.length,1);assert.equal(enriched[0].execution.fee,'0.01');
  assert.equal(enriched[0].execution.sequence,'9007199254740993');
  const ambiguous=reconcileBuilderExecutions(fills,[raw(),raw({tid:'3',fee:'0.5'})]);
  assert.equal(ambiguous[0].execution,undefined);
  assert.equal(reconcileBuilderExecutions(fills,[raw({closedPnl:'1'})])[0].execution,undefined);
  assert.equal(reconcileBuilderExecutions(fills,[raw({crossed:true})])[0].execution,undefined);
  assert.equal(reconcileBuilderExecutions(fills,[raw({builderFee:'0.1'})])[0].execution,undefined);
  const duplicate=archive([line(),line()]).fills;
  assert.equal(reconcileBuilderExecutions(duplicate,[raw(),raw({tid:'3'})]).filter(f=>f.execution).length,2);
});

test('exact original prices support fee matching even where notional rounding loses price precision',()=>{
  const fills=archive([line({px:'1.234567890123456789',sz:'0.000000000000000001'})]).fills;
  assert.ok(reconcileBuilderExecutions(fills,[raw({px:'1.234567890123456789',sz:'0.000000000000000001'})])[0].execution);
});

test('source failures preserve saved executions and repeated valid refreshes never duplicate them',()=>{
  const previous=snapshot();previous.fills=reconcileBuilderExecutions(previous.fills,[raw()]);
  const failure={...previous,status:'missing',fills:[],archiveFirst:null,archiveLast:null,archiveRows:0};
  assert.deepEqual(mergeBuilderDay(previous,failure).fills,previous.fills);
  const fresh=mergeBuilderDay(previous,snapshot());
  assert.equal(fresh.fills.length,1);assert.equal(fresh.fills[0].execution.fee,'0.01');
  assert.throws(()=>mergeBuilderDay(previous,{...previous,day:'2026-11-13'}));
});

test('reports label incomplete coverage and unknown fees without inventing funding, holdings or account PnL',()=>{
  const saved=snapshot(),dates=entropyArchiveDays('7D',now),progress=builderProgress(dates,[saved],now,false);
  const unknown=buildBuilderReport(address,'7D',now,[saved],progress);
  assert.equal(unknown.version,2);assert.equal(unknown.dex,'builder');assert.equal(unknown.summary.volume,'100');
  assert.equal(unknown.scan.status,'partial');assert.equal(unknown.attribution.incomplete,true);
  assert.equal(unknown.attribution.feesComplete,false);assert.equal(unknown.attribution.feesMatched,0);
  assert.ok(unknown.summary.excludedFeeTokens.includes('Unverified execution fees'));
  assert.equal(unknown.funding,null);assert.equal(unknown.account,null);assert.equal(unknown.realizedNet,null);
  assert.equal(unknown.holding.status,'incomplete');
  saved.fills=reconcileBuilderExecutions(saved.fills,[raw()]);
  const verified=buildBuilderReport(address,'7D',now,[saved],progress);
  assert.equal(verified.attribution.feesComplete,true);assert.equal(verified.summary.netFees,'0.01');
  const failed=buildBuilderReport(address,'7D',now,[{...saved,status:'missing',fills:[],archiveFirst:null}],progress);
  assert.equal(failed.summary,null);
  const empty=buildBuilderReport(address,'7D',now,[snapshot(day,[])],progress);
  assert.equal(empty.summary.volume,'0');assert.equal(empty.attribution.incomplete,true);
});

test('day selection, TTL and report filtering respect UTC and never fabricate missing days as empty activity',()=>{
  assert.equal(entropyArchiveDays('ALL',now)[0],'2026-08-19');
  assert.equal(entropyArchiveDays('ALL',now).at(-1),'2026-11-16');
  assert.equal(entropyArchiveDays('24H',now)[0],'2026-11-15');
  assert.equal(builderDayFresh(snapshot(),now+7*86400000),false);
  const recent=snapshot('2026-11-16');
  assert.equal(builderDayFresh(recent,now+14*60000),true);assert.equal(builderDayFresh(recent,now+15*60000),false);
  assert.equal(builderDayFresh({...recent,status:'missing'},now+5*60000),false);
  const filtered=buildBuilderReport(address,'24H',now,[snapshot()],builderProgress([],[],now,false));
  assert.equal(filtered.summary.fills,0);
});

test('bounded imports resume from persisted days; cached checks do not download archives; failed days retry later',async()=>{
  const store=new Map(),calls=[],reports=[];
  const deps={read:async(_address,dates)=>dates.flatMap(date=>store.has(date)?[store.get(date)]:[]),save:async(_address,days)=>days.forEach(day=>store.set(day.day,mergeBuilderDay(store.get(day.day),day))),saveReport:async report=>reports.push(report),fees:async()=>[],archive:async(date)=>{calls.push(date);return date==='2026-11-16'?{...snapshot(date),status:'missing',fills:[],archiveFirst:null,archiveLast:null,archiveRows:0}:snapshot(date);}};
  const signal=new AbortController().signal;
  const before=await syncBuilderWallet(address,'7D',now,false,signal,deps,2);
  assert.equal(before.summary,null);assert.equal(calls.length,0);assert.equal(before.synchronization.total,8);
  let result;
  for(let i=0;i<4;i++)result=await syncBuilderWallet(address,'7D',now,true,signal,deps,2);
  assert.equal(calls.length,8);assert.equal(store.size,8);assert.equal(result.synchronization.remaining,0);
  assert.equal(result.synchronization.unavailable,1);assert.equal(result.summary.fills,6); // Opening day is clipped at 12:00 UTC.
  assert.equal(reports.length,4);
  await syncBuilderWallet(address,'7D',now,true,signal,deps,2);
  assert.equal(calls.length,8);
  await syncBuilderWallet(address,'7D',now+6*60000,true,signal,deps,2);
  assert.equal(calls.length,9);assert.equal(store.size,8);
});

test('archive cache isolates wallets and rejects unavailable or invalid source files',async()=>{
  const {fetchBuilderDay}=await import('../lib/entropy-builder-source.ts');
  const {compress}=await import('lz4js');
  const fetchBefore=globalThis.fetch,signal=new AbortController().signal;
  let calls=0;
  const cacheDay='2026-08-19',text=header+'\n'+[line({time:cacheDay+'T10:00:00Z'}),line({time:cacheDay+'T11:00:00Z',user:other,counterparty:address,coin:'BTC'})].join('\n');
  try{
    globalThis.fetch=async()=>{calls++;return new Response(compress(Buffer.from(text)),{headers:{etag:'test'}});};
    const first=await fetchBuilderDay(cacheDay,address,now,signal),second=await fetchBuilderDay(cacheDay,other,now,signal);
    assert.equal(calls,1);assert.equal(first.status,'available');assert.equal(first.fills.length,1);
    assert.equal(second.fills.length,1);assert.equal(second.fills[0].market,'BTC');
    await fetchBuilderDay(cacheDay,address,now+7*3600000,signal);assert.equal(calls,2);
    globalThis.fetch=async()=>new Response('Access denied',{status:403});
    const missing=await fetchBuilderDay('2026-08-20',address,now,signal);
    assert.equal(missing.status,'missing');assert.equal(missing.archiveFirst,null);
    globalThis.fetch=async()=>new Response('invalid compressed archive');
    const invalid=await fetchBuilderDay('2026-08-21',address,now,signal);
    assert.equal(invalid.status,'error');assert.equal(invalid.fills.length,0);
  }finally{globalThis.fetch=fetchBefore;}
});
