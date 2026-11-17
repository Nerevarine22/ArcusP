import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { return next(['./wallet-analytics','./txflow-wallet','./risex-epochs','./pair-rewards','./estimator','./txflow-estimator','./variational-estimator','./pair-analytics','./pair-balances'].includes(specifier) ? specifier + '.ts' : specifier, context); } });
const { pairLegFromReport, pairManualLeg, pairTotals, pairSum, pairNetPnl, pairBalancePnl, parsePairSession, selectPairProjects, samePairWallet, isPairAddress } = await import('../lib/pair-analytics.ts');
const { fetchPairLeg } = await import('../lib/pair-requests.ts');
const { entropyCurrentBalance, applyPairBalance } = await import('../lib/pair-balances.ts');
const { pairBalanceCost } = await import('../lib/pair-analytics.ts');
const { riseFill, buildRisexReport } = await import('../lib/risex-wallet.ts');

const address = '0x1111111111111111111111111111111111111111', other = '0x2222222222222222222222222222222222222222';
const fetchedAt = '2026-11-12T12:00:00Z';
const summary = { volume:'100000',netFees:'10',feesPaid:'12',rebates:'2',closedPnl:'100',makerVolume:'70000',takerVolume:'30000',feesByRole:{maker:{net:'-2'},taker:{net:'12'}},excludedFeeTokens:[] };
const tx = (patch = {}) => ({address,fetchedAt,summary,funding:{net:'-3'},fillsScan:{status:'complete'},fundingScan:{status:'complete'},account:{equity:'1000',positions:[{unrealizedPnl:'20'}]},warnings:[],...patch});
const input = project => ({project,address});

test('pair PnL adds trading, funding and unrealized PnL and subtracts net fees once', () => {
  const leg = pairLegFromReport(input('txflow'),tx());
  assert.equal(leg.metrics.netPnl,'107');
  assert.equal(leg.metrics.makerFees,'-2');
  assert.equal(leg.pnlStatus,'complete');
  const second = pairLegFromReport({project:'entropy',address:other}, {...tx(),address:other,scan:{status:'complete',retentionLimited:false},summary:{...summary,closedPnl:'-80'}});
  assert.equal(second.metrics.netPnl,'-73');
  assert.equal(pairTotals([leg,second]).netPnl,'34');
  assert.equal(pairTotals([leg,second]).netFees,'20');
  assert.equal(pairTotals([leg,second]).volume,'200000');
});

test('Entropy builder history never turns unverified execution fees into a known zero', () => {
  const leg=pairLegFromReport(input('entropy'),{...tx(),version:2,dex:'builder',scan:{status:'partial'},funding:null,account:null,attribution:{feesComplete:false}});
  assert.match(leg.scope,/builder/);
  assert.equal(leg.metrics.volume,'100000');assert.equal(leg.metrics.netFees,null);assert.equal(leg.metrics.makerFees,null);
  assert.equal(leg.metrics.netPnl,null);assert.equal(leg.metrics.funding,null);
});

test('Arcus uses net equity change directly, without charging fees or funding twice', () => {
  const report = {address,fetchedAt,scan:{complete:true,warnings:[]},summary:{volumeUsd:'10000',netFeesUsd:'10',feesPaidUsd:'10',rebatesUsd:'0',makerVolumeUsd:'8000',takerVolumeUsd:'2000'},fills:[{role:'MAKER',feeUsd:'-1'},{role:'TAKER',feeUsd:'11'}]};
  const account = {address,fetchedAt,complete:true,equity:'1200',netDeposits:'1000',netPnl:'200',unrealizedPnl:'20',funding:'-5',fundingComplete:true,positions:1,warnings:[]};
  const leg = pairLegFromReport(input('arcus'),report,account);
  assert.equal(leg.metrics.netPnl,'200');
  assert.equal(leg.metrics.tradingPnl,null);
  assert.equal(leg.metrics.makerFees,'-1');
  assert.equal(leg.metrics.funding,'-5');
  assert.equal(leg.pnlStatus,'complete');
  const withoutHistory = pairLegFromReport(input('arcus'),null,account);
  assert.equal(withoutHistory.metrics.netPnl,'200');
  assert.equal(withoutHistory.metrics.netFees,null);
  assert.equal(withoutHistory.historyStatus,'unavailable');
});

test('balance PnL uses both account equities and signed net deposits without subtracting fees again', () => {
  const a = pairLegFromReport(input('txflow'),tx({fillsScan:{status:'partial'}}));
  const b = pairLegFromReport({project:'txflow',address:other},tx({address:other,account:{equity:'1100.000000001',positions:[]},funding:null}));
  const totals = pairTotals([a,b]);
  assert.equal(totals.netPnl,null);
  assert.equal(totals.equity,'2100.000000001');
  assert.equal(pairBalancePnl(totals.equity,'2000'),'100.000000001');
  assert.equal(pairBalancePnl(totals.equity,'2200'),'-99.999999999');
  assert.equal(pairBalancePnl('0','-250'),'250');
  assert.equal(pairBalancePnl('0','0'),'0');
  assert.equal(pairBalancePnl('100',' 80.25 '),'19.75');
  for (const deposits of ['',' ','-','NaN','1,000','1e3']) assert.equal(pairBalancePnl('100',deposits),null);
  assert.equal(pairBalancePnl(null,'100'),null);
  assert.equal(pairBalancePnl(pairTotals([a,null]).equity,'100'),null);
  assert.equal(pairBalancePnl(pairTotals([a,a]).equity,'100'),null);
});

test('RISEx uses the all-history range and the account-level unrealized total', () => {
  const leg = pairLegFromReport(input('risex'),{address,fetchedAt:Date.parse(fetchedAt),tradesStatus:'complete',fundingStatus:'complete',total:{summary,funding:{net:'5'}},portfolio:{equity:'900',unrealizedPnl:'-10',positions:[]},warnings:[]});
  assert.equal(leg.metrics.netPnl,'85');
  assert.equal(leg.positions,0);
  assert.equal(leg.metrics.volume,'100000');
  const unknownPnl = pairLegFromReport(input('risex'),{address,fetchedAt,tradesStatus:'complete',fundingStatus:'complete',tradingPnlComplete:false,total:{summary,funding:{net:'5'}},portfolio:{equity:'900',unrealizedPnl:'-10',positions:[]}});
  assert.equal(unknownPnl.metrics.tradingPnl,null);
  assert.equal(unknownPnl.metrics.netPnl,null);
  assert.equal(unknownPnl.pnlStatus,'unavailable');
});

test('partial history, missing positions, missing funding or excluded fees cannot become a complete combined PnL', () => {
  const complete = pairLegFromReport({project:'txflow',address:other},{...tx(),address:other});
  for(const patch of [{fillsScan:{status:'partial'}},{fundingScan:{status:'partial'}},{account:null},{funding:null},{summary:{...summary,excludedFeeTokens:['BTC']}}]) {
    const leg = pairLegFromReport(input('txflow'),tx(patch));
    assert.notEqual(leg.pnlStatus,'complete');
    assert.equal(pairTotals([leg,complete]).netPnl,null);
  }
  const entropy = pairLegFromReport(input('entropy'),{...tx(),scan:{status:'complete',retentionLimited:true}});
  assert.equal(entropy.pnlStatus,'partial');
  assert.equal(entropy.historyStatus,'partial');
  assert.equal(pairTotals([null,complete]).netPnl,null);
  assert.equal(pairNetPnl('1',null,'0','0'),null);
  assert.equal(pairSum(['1.000000001','-1']),'0.000000001');
});

test('RISEx missing realized PnL is distinguishable from a reported zero before comparison', () => {
  const raw = {id:'1',order_id:'2',market_id:'1',blockchain_data:{block_number:'100',log_index:'1'},size:'1',price:'100',side:'BUY',fee:'0.1',time:'1794484800000000000',avg_price:'0'};
  const missing = riseFill(raw), explicitZero = riseFill({...raw,realized_pnl:'0'});
  assert.equal(missing.closedPnlKnown,false);
  assert.equal(explicitZero.closedPnlKnown,true);
  const report = fill => buildRisexReport({address,now:Date.parse(fetchedAt)+1000,trades:{rows:[fill],status:'complete',pages:1,warnings:[]},funding:{rows:[],status:'complete',pages:1,warnings:[]},portfolio:null,transfers:null,epoch:null,warnings:[]});
  assert.equal(report(missing).tradingPnlComplete,false);
  assert.equal(report(explicitZero).tradingPnlComplete,true);
});

test('identical wallets are not counted twice, but the same address on two exchanges is valid', () => {
  const leg = pairLegFromReport(input('txflow'),tx());
  assert.equal(pairTotals([leg,leg]).netPnl,null);
  assert.equal(samePairWallet(input('arcus'),input('txflow')),false);
  assert.equal(samePairWallet(input('arcus'),{project:'arcus',address:' '+address.toUpperCase().replace('0X','0x')+' '}),true);
  assert.throws(()=>pairLegFromReport(input('txflow'),{...tx(),address:other}),/another wallet/);
  assert.equal(isPairAddress('0x123'),false);
});

test('saved pair inputs and results restore together; mismatches and malformed amounts discard results', () => {
  const form = [input('arcus'),input('txflow')], leg = pairLegFromReport(input('txflow'),tx());
  const saved = parsePairSession(JSON.stringify({form,reports:[null,leg]}));
  assert.deepEqual(saved.form,form);
  assert.deepEqual(saved.reports[1],leg);
  assert.equal(saved.netDeposits,'');
  assert.equal(saved.pnlBasis,'equity');
  assert.equal(saved.rewards[0].pool,'11000000');
  assert.equal(saved.rewards[1].points,'');
  const withDeposits = parsePairSession(JSON.stringify({form,reports:[null,leg],netDeposits:'-123.45',pnlBasis:'history'}));
  assert.equal(withDeposits.netDeposits,'-123.45');
  assert.equal(withDeposits.pnlBasis,'history');
  const malformed = parsePairSession(JSON.stringify({form,netDeposits:123,pnlBasis:'anything'}));
  assert.equal(malformed.netDeposits,'');
  assert.equal(malformed.pnlBasis,'equity');
  for(const invalid of [{...leg,address:other},{...leg,address:undefined},{...leg,metrics:{...leg.metrics,netPnl:'NaN'}},{...leg,fetchedAt:'invalid'}]) {
    const restored = parsePairSession(JSON.stringify({form,reports:[null,invalid]}));
    assert.deepEqual(restored.form,form);
    assert.equal(restored.reports[1],null);
  }
});

test('three or four accounts aggregate every balance and cost; an unknown account never becomes zero',()=>{
  const leg=pairLegFromReport(input('txflow'),tx());
  const b={...leg,project:'arcus',metrics:{...leg.metrics,equity:'2000',netPnl:'-7',volume:'2'}};
  const c={...leg,project:'risex',metrics:{...leg.metrics,equity:'3000',netPnl:'20'}};
  const d={...leg,project:'entropy',metrics:{...leg.metrics,equity:'4000',netPnl:'-20'}};
  const total=pairTotals([leg,b,c,d]);
  assert.equal(total.equity,'10000');
  assert.equal(total.netPnl,'100');
  assert.equal(total.netFees,'40');
  assert.equal(total.volume,'300002');
  assert.equal(pairBalancePnl(total.equity,'11000'),'-1000');
  assert.equal(pairTotals([leg,b,c]).equity,'6000');
  assert.equal(pairTotals([leg,b,c,null]).equity,null);
  assert.equal(pairTotals([leg,b,c,{...d,pnlStatus:'partial'}]).netPnl,null);
  assert.equal(pairTotals([leg,b,c,{...d,pnlStatus:'partial'}]).equity,'10000');
  assert.equal(pairTotals([leg,b,leg]).equity,null);
});

test('project confirmation preserves matched wallets and rewards while resetting the combined deposit for a changed set',()=>{
  const leg=pairLegFromReport(input('txflow'),tx());
  const saved=parsePairSession(JSON.stringify({form:[input('arcus'),input('txflow')],reports:[null,leg],netDeposits:'1000'}));
  assert.equal(saved.selectionConfirmed,false);
  saved.rewards[1].points='50';
  const expanded=selectPairProjects(saved,['risex','txflow','arcus']);
  assert.deepEqual(expanded.form.map(row=>row.project),['arcus','txflow','risex']);
  assert.equal(expanded.form[0].address,address);
  assert.equal(expanded.form[2].address,'');
  assert.equal(expanded.selectionConfirmed,true);
  assert.equal(expanded.netDeposits,'');
  assert.equal(expanded.rewards[1].points,'50');
  assert.deepEqual(expanded.reports[1],leg);
  const unchanged=selectPairProjects({...expanded,netDeposits:'1234'},['risex','arcus','txflow']);
  assert.equal(unchanged.netDeposits,'1234');
  const removed=selectPairProjects(unchanged,['txflow','risex']);
  assert.equal(removed.netDeposits,'');
  assert.equal(removed.form[0].project,'txflow');
  assert.deepEqual(removed.reports[0],leg);
  assert.equal(removed.rewards[0].points,'50');
  const four=selectPairProjects(expanded,['arcus','txflow','risex','entropy']);
  const restored=parsePairSession(JSON.stringify(four));
  assert.deepEqual(restored,four);
  assert.equal(restored.reports.length,4);
  assert.equal(restored.rewards.length,4);
  assert.throws(()=>selectPairProjects(saved,['arcus']),/at least two/);
  assert.throws(()=>selectPairProjects(saved,['arcus','arcus']),/at least two/);
});

test('Variational manual equity contributes without inventing trade PnL, fees or funding',async()=>{
  const manualInput={project:'variational',address:'',manualEquity:'1500.5'};
  const manual=pairManualLeg(manualInput,fetchedAt), leg=pairLegFromReport(input('txflow'),tx());
  assert.equal(manual.source,'manual');
  assert.equal(manual.metrics.equity,'1500.5');
  assert.equal(manual.metrics.netPnl,null);
  assert.equal(manual.metrics.netFees,null);
  const totals=pairTotals([leg,manual]);
  assert.equal(totals.equity,'2500.5');
  assert.equal(pairBalancePnl(totals.equity,'2000'),'500.5');
  assert.equal(totals.netPnl,null);
  assert.equal(totals.netFees,'10');
  assert.equal(totals.volume,'100000');
  assert.equal(totals.funding,null);
  const saved=parsePairSession(JSON.stringify({form:[input('txflow'),manualInput],reports:[leg,manual],netDeposits:'2000',pnlBasis:'history',selectionConfirmed:true}));
  assert.equal(saved.pnlBasis,'equity');
  assert.equal(saved.form[1].manualEquity,'1500.5');
  assert.deepEqual(saved.reports[1],manual);
  for(const value of ['', 'NaN','1e3']) assert.throws(()=>pairManualLeg({...manualInput,manualEquity:value}),/equity/);
  assert.equal(pairManualLeg({...manualInput,manualEquity:'0'}).metrics.equity,'0');
  assert.throws(()=>pairManualLeg({...manualInput,address:'wrong'}),/address/);
  const original=globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('A manual project must not call a trade API');};
  try { assert.equal((await fetchPairLeg(manualInput,new AbortController().signal)).metrics.equity,'1500.5'); }
  finally { globalThis.fetch=original; }
});

test('Entropy unified mode reads the authoritative USDC total without adding DEX collateral or subtracting holds',()=>{
  const spot={balances:[{coin:'USDC',token:'0',total:'4000.25',hold:'1530'},{coin:'HYPE',token:'150',total:'10',hold:'0'}]};
  const io={marginSummary:{accountValue:'1530'}};
  const unified=entropyCurrentBalance('unifiedAccount',spot,io);
  assert.equal(unified.value,'4000.25');
  assert.match(unified.source,/spotClearinghouseState/);
  assert.equal(entropyCurrentBalance('default',null,io).value,'1530');
  assert.equal(entropyCurrentBalance('disabled',null,io).value,'1530');
  assert.equal(entropyCurrentBalance('unifiedAccount',{balances:[]},io).value,'0');
  assert.throws(()=>entropyCurrentBalance('portfolioMargin',spot,io),/valuation/);
  assert.throws(()=>entropyCurrentBalance('unifiedAccount',{},io),/unavailable/);
  assert.throws(()=>entropyCurrentBalance('unifiedAccount',{balances:[spot.balances[0],spot.balances[0]]},io),/ambiguous/);
});

test('fresh API balance replaces a saved value and net cost uses only deposits minus total balances',()=>{
  const txLeg=pairLegFromReport(input('txflow'),tx({account:{equity:'10581',positions:[]}}));
  const snapshot={version:1,project:'txflow',address,value:'12111',fetchedAt,source:'clearinghouseState',scope:'Perpetual account'};
  const fresh=applyPairBalance(input('txflow'),txLeg,snapshot);
  const second=pairManualLeg({project:'variational',address:'',manualEquity:'0'},fetchedAt);
  const total=pairTotals([fresh,second]);
  assert.equal(total.equity,'12111');
  assert.equal(pairBalanceCost(total.equity,'15000'),'2889');
  assert.equal(pairBalanceCost(total.equity,'12000'),'-111');
  assert.equal(pairBalancePnl(total.equity,'15000'),'-2889');
  assert.equal(fresh.metrics.netFees,'10');
  assert.equal(fresh.balanceSnapshot.value,'12111');
  const withoutHistory=applyPairBalance(input('txflow'),null,snapshot);
  assert.equal(withoutHistory.metrics.equity,'12111');
  assert.equal(withoutHistory.metrics.netFees,null);
  assert.equal(withoutHistory.historyStatus,'unavailable');
  const failed=applyPairBalance(input('txflow'),fresh,{...snapshot,value:null,error:'API unavailable'});
  assert.equal(failed.metrics.equity,null);
  assert.equal(pairTotals([failed,second]).equity,null);
  assert.equal(pairBalanceCost(null,'15000'),null);
  assert.throws(()=>applyPairBalance(input('txflow'),txLeg,{...snapshot,address:other}),/another account/);
  const saved=parsePairSession(JSON.stringify({form:[input('txflow'),{project:'variational',address:'',manualEquity:'0'}],reports:[fresh,second],selectionConfirmed:true}));
  assert.deepEqual(saved.reports[0].balanceSnapshot,snapshot);
});
