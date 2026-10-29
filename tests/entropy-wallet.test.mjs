import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Resolve the shared analytics module when running TypeScript directly in Node.
registerHooks({resolve(specifier,context,next){return next(specifier === './txflow-wallet' ? './txflow-wallet.ts' : specifier,context);}});
const { normalizeEntropyFill, normalizeEntropyFunding, normalizeEntropyAccount, collectEntropyHistory, buildEntropyReport, isEntropyMarket, parseEntropySettings, entropyRange } = await import('../lib/entropy-wallet.ts');

const address='0x1111111111111111111111111111111111111111', now=Date.parse('2026-10-29T12:00:00Z');
const raw = (tid,time=now-1000,patch={}) => ({coin:'io:SNDK',tid:String(tid),oid:String(tid),px:'100',sz:'1',side:'B',crossed:false,time,startPosition:'0',closedPnl:'0',fee:'0.01',feeToken:'USDC',...patch});
const funding = (time=now-1000,patch={}) => ({time,hash:'0x1',delta:{type:'funding',coin:'io:SNDK',usdc:'-0.1',...patch}});
const scan = (rows,patch={}) => ({rows,pages:1,status:'complete',warnings:[],rawCount:rows.length,ignored:0,firstTime:rows.length?Math.min(...rows.map(row=>row.time)):null,retentionLimited:false,...patch});
const emptyFunding=scan([]);
const bucket=(report,id)=>report.holding.buckets.find(row=>row.id===id)?.volume;

test('Entropy scope matches the exact io: prefix and excludes other HIP-3 and native/spot markets',()=>{
  for(const coin of ['io:SNDK','io:ANTH','io:OLD-MARKET'])assert.equal(isEntropyMarket(coin),true);
  for(const coin of ['xyz:SNDK','SNDK','BTC','@107',':io','io','io:','notio:SNDK','IO:SNDK']){
    assert.equal(isEntropyMarket(coin),false);
    assert.equal(normalizeEntropyFill({coin}),null);
  }
});

test('maker/taker mapping uses crossed; large identifiers stay exact and inclusive builder fees are not added twice',()=>{
  const maker=normalizeEntropyFill(raw('9007199254740993',now-1000,{fee:'0.1',builderFee:'0.03'}));
  assert.equal(maker.sequence,'9007199254740993');
  assert.equal(maker.role,'Maker');assert.equal(maker.fee,'0.1');assert.equal(maker.builderFee,'0.03');
  assert.equal(normalizeEntropyFill(raw(2,now-1000,{crossed:true})).role,'Taker');
  assert.equal(normalizeEntropyFill(raw(3,now-1000,{crossed:undefined})).role,'Unknown');
  const report=buildEntropyReport(address,'ALL',now,scan([maker]),emptyFunding,null);
  assert.equal(report.summary.netFees,'0.1');assert.equal(report.builderFeesIncluded,'0.03');
  assert.equal(report.realizedNet,'-0.1');
  assert.throws(()=>normalizeEntropyFill(raw(4,now,{builderFee:'-1'})));
  assert.throws(()=>normalizeEntropyFill(raw(5,now,{tid:9007199254740992})));
});

test('rebates, non-USDC fees and fee breakdowns reconcile without inventing exchange rates',()=>{
  const fills=[normalizeEntropyFill(raw(1,now-3000,{fee:'-0.02',builderFee:'0.01'})),
    normalizeEntropyFill(raw(2,now-2000,{crossed:true,fee:'0.1',startPosition:'1'})),
    normalizeEntropyFill(raw(3,now-1000,{crossed:null,fee:'2',feeToken:'HYPE',startPosition:'2'}))];
  const report=buildEntropyReport(address,'ALL',now,scan(fills),emptyFunding,null);
  assert.equal(report.summary.volume,'300');assert.equal(report.summary.feesPaid,'0.1');assert.equal(report.summary.rebates,'0.02');
  assert.equal(report.summary.netFees,'0.08');assert.equal(report.summary.feesByRole.maker.net,'-0.02');
  assert.equal(report.summary.feesByRole.taker.net,'0.1');assert.equal(report.summary.feesByRole.unknown.net,'0');
  assert.deepEqual(report.summary.excludedFeeTokens,['HYPE']);assert.equal(report.summary.unknownRoleVolume,'100');
});

test('pagination advances across pages containing only foreign markets and preserves inclusive boundary fills',async()=>{
  const a=raw(1,100,{coin:'BTC'}),b=raw(2,200,{coin:'xyz:SNDK'}),c=raw(3,300),d=raw(4,400);
  const cursors=[], pages=[[a,b],[b,c],[c,d],[d]];
  const result=await collectEntropyHistory(async cursor=>{cursors.push(cursor);return pages.shift();},normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.deepEqual(cursors,[0,200,300,400]);assert.equal(result.status,'complete');assert.equal(result.rows.length,2);
  assert.equal(result.rawCount,4);assert.equal(result.ignored,2);assert.deepEqual(result.rows.map(row=>row.sequence),['3','4']);
});

test('same-millisecond saturation is partial rather than silently skipping unreturned fills',async()=>{
  const values=[raw(1,100),raw(2,100)];
  const result=await collectEntropyHistory(async()=>values,normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.equal(result.status,'partial');assert.equal(result.rows.length,2);assert.equal(result.pages,2);
  assert.match(result.warnings[0],/timestamp/);
});

test('a malformed later page is discarded atomically while validated pages survive',async()=>{
  const pages=[[raw(1,100),raw(2,200)],[raw(3,300),raw(4,400,{px:'bad'})]];
  const result=await collectEntropyHistory(async()=>pages.shift(),normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.equal(result.status,'partial');assert.equal(result.rows.length,2);assert.equal(result.rawCount,2);
  const failed=await collectEntropyHistory(async()=>{throw new Error('Provider unavailable');},normalizeEntropyFill,{to:500,limit:2000,maxPages:8,kind:'fills'});
  assert.equal(failed.status,'unavailable');
  assert.equal(buildEntropyReport(address,'ALL',now,failed,emptyFunding,null).summary,null);
});

test('successful empty histories remain zero while changed duplicates and out-of-range timestamps fail closed',async()=>{
  const empty=await collectEntropyHistory(async()=>[],normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.equal(empty.status,'complete');assert.equal(buildEntropyReport(address,'ALL',now,empty,emptyFunding,null).summary.volume,'0');
  const pages=[[raw(1,100),raw(2,200)],[raw(2,200,{fee:'5'})]];
  const changed=await collectEntropyHistory(async()=>pages.shift(),normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.equal(changed.status,'partial');assert.equal(changed.rows[1].fee,'0.01');
  const invalid=await collectEntropyHistory(async()=>[raw(1,501)],normalizeEntropyFill,{to:500,limit:2,maxPages:8,kind:'fills'});
  assert.equal(invalid.status,'unavailable');assert.equal(invalid.rows.length,0);
});

test('funding signs and prefix isolation feed realized PnL without including unrealized positions',()=>{
  assert.equal(normalizeEntropyFunding(funding(now,{coin:'xyz:SNDK'})),null);
  const fills=[normalizeEntropyFill(raw(1,now-2000)),normalizeEntropyFill(raw(2,now-1000,{side:'A',startPosition:'1',closedPnl:'10',crossed:true}))];
  const rows=[normalizeEntropyFunding(funding(now-2000,{usdc:'-2'})),normalizeEntropyFunding(funding(now-1000,{usdc:'1'}))];
  const report=buildEntropyReport(address,'ALL',now,scan(fills),scan(rows),{positions:[{unrealizedPnl:'500'}]});
  assert.equal(report.funding.paid,'2');assert.equal(report.funding.received,'1');assert.equal(report.funding.net,'-1');
  assert.equal(report.realizedNet,'8.98');
});

test('holding reconstruction preserves API order at equal timestamps and conserves execution volume',()=>{
  const at=now-3600000;
  const fills=[normalizeEntropyFill(raw(99,at)),normalizeEntropyFill(raw(1,at,{side:'A',startPosition:'1'}))];
  const report=buildEntropyReport(address,'ALL',now,scan(fills),emptyFunding,null);
  assert.equal(report.holding.status,'complete');assert.equal(bucket(report,'under1h'),'200');
  assert.equal(report.holding.volume,report.summary.volume);
  const unknown=buildEntropyReport(address,'ALL',now,scan([normalizeEntropyFill(raw(1,at,{side:'A',startPosition:'3'}))]),emptyFunding,null);
  assert.equal(bucket(unknown,'unknown'),'100');assert.equal(unknown.holding.status,'partial');
});

test('period filtering retains earlier fills as holding context and weekly summaries use Monday UTC',()=>{
  const from=entropyRange('24H',now).from;
  const fills=[normalizeEntropyFill(raw(1,from-3600000)),normalizeEntropyFill(raw(2,from+3600000,{side:'A',startPosition:'1'}))];
  const report=buildEntropyReport(address,'24H',now,scan(fills),emptyFunding,null);
  assert.equal(report.summary.fills,1);assert.equal(report.summary.volume,'100');assert.equal(bucket(report,'twoTo12h'),'100');
  assert.equal(report.weeks[0].start,'2026-10-26T00:00:00.000Z');
  assert.equal(report.weeks[0].summary.volume,'100');
});

test('retention cap never claims complete lifetime holding and a covered short period can still be analyzed',()=>{
  const fill=normalizeEntropyFill(raw(1,now-1000));
  const limited=scan([fill],{retentionLimited:true,rawCount:10000,firstTime:now-40*86400000});
  const all=buildEntropyReport(address,'ALL',now,limited,emptyFunding,null);
  assert.equal(all.holding.status,'incomplete');assert.equal(all.summary.volume,'100');assert.match(all.warnings[0],/10,000/);
  const recent=buildEntropyReport(address,'7D',now,limited,emptyFunding,null);
  assert.notEqual(recent.holding.status,'incomplete');
  const uncovered=buildEntropyReport(address,'7D',now,{...limited,firstTime:now-1000},emptyFunding,null);
  assert.equal(uncovered.holding.status,'incomplete');
});

test('io account response rejects foreign markets and wallet settings remain separate and bounded',()=>{
  const account={marginSummary:{accountValue:'1',totalMarginUsed:'0',totalNtlPos:'0'},withdrawable:'1',assetPositions:[],time:now};
  assert.equal(normalizeEntropyAccount(account).positions.length,0);
  assert.throws(()=>normalizeEntropyAccount({...account,assetPositions:[{position:{coin:'xyz:SNDK'}}]}));
  assert.deepEqual(parseEntropySettings('{"address":"0x123","period":"7D"}'),{address:'0x123',period:'7D'});
  assert.equal(parseEntropySettings('{"address":"x","period":"AWARDED"}').period,'ALL');
  assert.equal(parseEntropySettings('bad').address,'');
});
