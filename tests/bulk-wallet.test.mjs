import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier==='./txflow-wallet'?'./txflow-wallet.ts':specifier,context);}});
const {isBulkAddress,bulkEpochs,bulkTimestamp,normalizeBulkFill,normalizeBulkFunding,normalizeBulkAccount,collectBulkHistory,anchorBulkFills,buildBulkReport,parseBulkWalletSettings}=await import('../lib/bulk-wallet.ts');
const user='GCymMCdrcxffEnUdUwzaxjAYXHduvrnoPg4o4XBzkqur',other='11111111111111111111111111111111';
const now=Date.parse('2026-10-29T15:00:00Z');
const ns=time=>String(BigInt(Date.parse(time))*1000000n+358n);
const raw=(patch={})=>({maker:other,taker:user,orderIdMaker:'maker-order',orderIdTaker:'taker-order',isBuy:true,symbol:'BTC-USD',amount:'1',price:'100',makerFee:'0',takerFee:'-0.035',fee:'-0.035',slot:'621278412',timestamp:ns('2026-10-11T14:00:00Z'),sequence:'4',iso:false,...patch});
const scan=(rows,patch={})=>({rows,pages:1,status:'complete',exhausted:true,coverage:['complete'],warnings:[],...patch});
const page=(rows,patch={})=>({data:rows,page:{hasMore:false,nextCursor:null,coverage:'complete',...patch}});
const account=(positions=[])=>({positions,subaccounts:[],margin:'1000'});

test('Solana account validation is case-sensitive and checks decoded length',()=>{
  assert.equal(isBulkAddress(user),true);assert.equal(isBulkAddress(other),true);
  for(const value of ['0x9ac26d73b0a6db219dd61a660c5e7ce94f6796db','0'.repeat(44),'1'.repeat(31),'1'.repeat(33),'z'.repeat(44)])assert.equal(isBulkAddress(value),false);
});
test('BULK windows have contiguous half-open Saturday 13 UTC boundaries',()=>{
  const epochs=bulkEpochs(now);assert.equal(epochs.length,9);assert.equal(epochs[0].start,Date.parse('2026-06-01T00:00:00Z'));
  assert.equal(epochs[1].id,'T1');assert.equal(epochs[1].start,epochs[0].end);
  assert.equal(epochs[6].start,Date.parse('2026-10-10T13:00:00Z'));
  assert.equal(epochs[8].id,'T8');assert.equal(epochs[8].completed,false);
  for(let i=1;i<epochs.length;i++)assert.equal(epochs[i].start,epochs[i-1].end);
});
test('legacy fee cash flows become positive paid fees; documented cost signs stay unchanged',()=>{
  const legacy=normalizeBulkFill(raw(),user);assert.equal(legacy.fee,'0.035');assert.equal(legacy.role,'Taker');assert.equal(legacy.notional,'100');
  const cost=normalizeBulkFill(raw({tradeId:'621278412:4',fee:'0.035',takerFee:'0.035'}),user);assert.equal(cost.fee,'0.035');
  const rebate=normalizeBulkFill(raw({maker:user,taker:other,makerFee:'0.01',fee:'0.01'}),user);assert.equal(rebate.role,'Maker');assert.equal(rebate.fee,'-0.01');
  assert.throws(()=>normalizeBulkFill(raw({fee:'-5'}),user),/effective fee/);
  assert.throws(()=>normalizeBulkFill(raw({tradeId:'7:9'}),user),/ID/);
});
test('nanosecond timestamps and large slot/sequence IDs retain exact order',()=>{
  const value='1791711813863975218';assert.equal(bulkTimestamp(value),1791711813863);
  const fill=normalizeBulkFill(raw({slot:'9007199254740993',sequence:'9007199254740994',timestamp:value}),user);
  assert.match(fill.key,/9007199254740993:9007199254740994$/);assert.equal(fill.timeNs,value);
  assert.throws(()=>bulkTimestamp(1791711813863975200),/identifier/);
  const a=normalizeBulkFill(raw({sequence:'1',timestamp:'1791711813863975219'}),user),b=normalizeBulkFill(raw({sequence:'2',timestamp:'1791711813863975218'}),user);
  assert.equal(anchorBulkFills([a,b],account(),true)[0].eventSequence,'2');
});
test('funding sign remains received minus paid; isolated books use physical owner keys',()=>{
  const funding=normalizeBulkFunding({owner:user,symbol:'BTC-USD',slot:'10',sequence:'2',timestamp:ns('2026-10-11T14:00:00Z'),payment:'-1.25',iso:false},user);assert.equal(funding.amount,'-1.25');
  const isolated=normalizeBulkFill(raw({iso:true,isoPubkey:other,taker:other,maker:user}),user);assert.equal(isolated.instrument,`${other}:BTC-USD`);assert.equal(isolated.role,'Taker');
  assert.throws(()=>normalizeBulkFill(raw({iso:true}),user),/isolated/);
});
test('cursor pagination deduplicates overlap and preserves prior data after a failed page',async()=>{
  const first=normalizeBulkFill(raw(),user);let calls=[];
  const result=await collectBulkHistory(async cursor=>{calls.push(cursor);return cursor===null?page([raw()],{hasMore:true,nextCursor:'opaque'}):page([raw(),raw({sequence:'5'})]);},value=>normalizeBulkFill(value,user));
  assert.deepEqual(calls,[null,'opaque']);assert.equal(result.rows.length,2);assert.equal(result.status,'complete');
  const partial=await collectBulkHistory(async cursor=>cursor===null?page([raw()],{hasMore:true,nextCursor:'opaque'}):page([raw({sequence:'5'}),raw({amount:'bad'})]),value=>normalizeBulkFill(value,user));
  assert.equal(partial.status,'partial');assert.equal(partial.exhausted,false);assert.deepEqual(partial.rows,[first]);
});
test('coverage unknown and cursor failures never claim complete history',async()=>{
  const unknown=await collectBulkHistory(async()=>page([raw()],{coverage:'unknown'}),value=>normalizeBulkFill(value,user));assert.equal(unknown.exhausted,true);assert.equal(unknown.status,'partial');
  const repeat=await collectBulkHistory(async()=>page([raw()],{hasMore:true,nextCursor:'same'}),value=>normalizeBulkFill(value,user));assert.equal(repeat.status,'partial');assert.equal(repeat.exhausted,false);
  const failed=await collectBulkHistory(async()=>{throw new Error('offline');},value=>normalizeBulkFill(value,user));assert.equal(failed.status,'unavailable');
});
test('weekly volume, role fees and holding use the selected cutoff rather than a later close',()=>{
  const buy=normalizeBulkFill(raw({timestamp:ns('2026-10-11T14:00:00Z'),maker:user,taker:other,fee:'0',makerFee:'0'}),user);
  const sell=normalizeBulkFill(raw({timestamp:ns('2026-10-18T15:00:00Z'),slot:'621278413',isBuy:false}),user);
  const report=buildBulkReport(user,now,scan([sell,buy]),scan([]),account());
  const t6=report.periods.find(row=>row.id==='T6'),t7=report.periods.find(row=>row.id==='T7'),all=report.periods.find(row=>row.id==='ALL');
  assert.equal(t6.summary.volume,'100');assert.equal(t6.summary.makerVolume,'100');assert.equal(t6.summary.feesByRole.taker.paid,'0');
  assert.equal(t7.summary.volume,'100');assert.equal(t7.summary.feesByRole.taker.paid,'0.035');
  assert.equal(t6.holding.buckets.find(row=>row.id==='openOver12h').volume,'100');
  assert.equal(t7.holding.buckets.find(row=>row.id==='over12h').volume,'100');
  assert.equal(all.holding.buckets.find(row=>row.id==='over12h').volume,'200');
  assert.equal(report.periods.find(row=>row.id==='PRE').summary,null);
});
test('execution exactly at a week boundary belongs only to the next week',()=>{
  const fill=normalizeBulkFill(raw({timestamp:ns('2026-10-17T13:00:00Z')}),user),report=buildBulkReport(user,now,scan([fill]),scan([]),account([{key:`${user}:BTC-USD`,size:'1'}]));
  assert.equal(report.periods.find(row=>row.id==='T6').summary.fills,0);assert.equal(report.periods.find(row=>row.id==='T7').summary.fills,1);
});
test('unavailable history shows unknown totals rather than successful zero',()=>{
  const report=buildBulkReport(user,now,scan([],{status:'unavailable',exhausted:false}),scan([]),null);assert.equal(report.periods.find(row=>row.id==='T7').summary,null);
  assert.equal(report.periods.find(row=>row.id==='T7').holding.status,'incomplete');
});
test('account snapshots and browser AURA storage retain account scoping',()=>{
  const result=normalizeBulkAccount([{fullAccount:{margin:{totalMargin:'1000'},positions:[{symbol:'BTC-USD',size:'-1',price:'100',notional:'-110',unrealizedPnl:'-10',leverage:'5',iso:false}],subAccounts:[{pubkey:other}]}}],user);
  assert.equal(result.positions[0].value,'110');assert.deepEqual(result.subaccounts,[other]);
  const settings=parseBulkWalletSettings(JSON.stringify({address:user,selected:'T7',points:{[`${user}:T7`]:'12.5',[`${user}:PRE`]:'100','invalid:T7':'55'}}));
  assert.equal(settings.points[`${user}:T7`],'12.5');assert.equal(settings.points[`${user}:PRE`],'100');assert.equal(settings.points['invalid:T7'],undefined);
});
