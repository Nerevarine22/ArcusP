import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'lossless-json';
import { txAtoms, txUsd, unwrapTxflow, normalizeTxFill, normalizeTxFunding, collectTxHistory, summarizeTxFills, summarizeTxFunding, groupTxFills, normalizeTxOverview, normalizeTxAccount, txflowPeriodRange, txflowPointsStatus } from '../lib/txflow-wallet.ts';

const asOf = Date.parse('2026-10-22T12:00:00Z');
const rawFill = (overrides = {}) => ({ coin:'BTC',symbol:'BTC-USDC',instrumentId:'1',tid:'9007199254740993',oid:'9007199254740995',side:'B',time:asOf-1000,px:'65010.5',sz:'0.01',fee:'0.02',feeToken:'USDC',closedPnl:'0',crossed:null,tradeSide:'Taker',instrumentType:'perps',...overrides });
const page = (data, hasMore, total) => ({ success:true,code:0,data:{data,hasMore,...(total === undefined ? {} : {total})} });
const options = {from:null,to:asOf,limit:2,maxPages:5};

test('S0 covers all earlier history without overlapping S1 Epoch 1, with manually entered points rather than an assumed zero', async () => {
  const s0 = txflowPeriodRange('S0',asOf), s1 = txflowPeriodRange('EPOCH_1',asOf);
  assert.equal(s0.from,null);
  assert.equal(s0.to,s1.from);
  assert.equal(s0.endExclusive,true);
  assert.equal(txflowPointsStatus('S0'),'manual');
  assert.equal(txflowPointsStatus('EPOCH_1'),'manual');
  const lastS0 = rawFill({time:s0.to-1}), firstS1 = rawFill({tid:'2',time:s1.from});
  const s0Result = await collectTxHistory(async () => page([lastS0],false),normalizeTxFill,{...options,from:null,to:s0.to-1});
  assert.equal(s0Result.status,'complete');
  const wrongSeason = await collectTxHistory(async () => page([firstS1],false),normalizeTxFill,{...options,from:null,to:s0.to-1});
  assert.equal(wrongSeason.status,'unavailable');
});

test('Epoch 1 is the fixed UTC window including all of Monday 19 October, independent of the current rolling week', () => {
  const range = txflowPeriodRange('EPOCH_1',asOf);
  assert.equal(new Date(range.from).toISOString(),'2026-10-12T00:00:00.000Z');
  assert.equal(new Date(range.to).toISOString(),'2026-10-20T00:00:00.000Z');
  assert.equal(new Date(range.from).getUTCDay(),1);
  assert.equal(new Date(range.to).getUTCDay(),2);
  assert.equal(range.to-range.from,8*86400000);
  assert.equal(range.endExclusive,true);
  assert.notEqual(range.from,txflowPeriodRange('7D',asOf).from);
  assert.deepEqual(txflowPeriodRange('ALLTIME',asOf),{from:null,to:asOf,endExclusive:false});
  assert.throws(()=>txflowPeriodRange('EPOCH_1',range.from-1),/not started/);
});

test('epoch history includes opening Monday and the final millisecond, excluding 20 October midnight', async () => {
  const range = txflowPeriodRange('EPOCH_1',asOf), epochOptions = {...options,from:range.from,to:range.to-1};
  const rows = [rawFill({time:range.from}),rawFill({tid:'2',time:range.to-1})];
  const complete = await collectTxHistory(async () => page(rows,false,2),normalizeTxFill,epochOptions);
  assert.equal(complete.status,'complete');
  assert.equal(summarizeTxFills(complete.rows).volume,'1300.21');
  const nextEpoch = await collectTxHistory(async () => page([rawFill({time:range.to})],false),normalizeTxFill,epochOptions);
  assert.equal(nextEpoch.status,'unavailable');
  const previousEpoch = await collectTxHistory(async () => page([rawFill({time:range.from-1})],false),normalizeTxFill,epochOptions);
  assert.equal(previousEpoch.status,'unavailable');
  const funding = await collectTxHistory(async () => page([{coin:'BTC',time:range.to,amount:'1'}],false),normalizeTxFunding,epochOptions);
  assert.equal(funding.status,'unavailable');
});

test('TxFlow decimal products, fee rebates and liquidity roles reconcile without binary rounding', () => {
  const taker = normalizeTxFill(rawFill());
  const maker = normalizeTxFill(rawFill({tid:'2',fee:'-0.01',tradeSide:'Maker',closedPnl:'1.234567890123456789'}));
  const unknown = normalizeTxFill(rawFill({tid:'3',tradeSide:undefined,crossed:false,fee:'0.001'}));
  assert.equal(taker.notional,'650.105');
  assert.equal(unknown.role,'Unknown');
  assert.match(taker.key,/9007199254740993:9007199254740995/);
  const summary = summarizeTxFills([taker,maker,unknown]);
  assert.equal(summary.volume,'1950.315');
  assert.equal(summary.feesPaid,'0.021');
  assert.equal(summary.rebates,'0.01');
  assert.equal(summary.netFees,'0.011');
  assert.equal(summary.closedPnl,'1.234567890123456789');
  assert.equal(summary.makerVolume,'650.105');
  assert.equal(summary.takerVolume,'650.105');
  assert.equal(summary.unknownRoleVolume,'650.105');
  assert.deepEqual(summary.feesByRole, { maker: { paid: '0', rebates: '0.01', net: '-0.01' }, taker: { paid: '0.02', rebates: '0', net: '0.02' }, unknown: { paid: '0.001', rebates: '0', net: '0.001' } });
  for (const [roleField, totalField] of [['paid','feesPaid'],['rebates','rebates'],['net','netFees']]) {
    assert.equal(txUsd(Object.values(summary.feesByRole).reduce((total, fees) => total + txAtoms(fees[roleField]), BigInt(0))), summary[totalField]);
  }
  assert.equal(txUsd(txAtoms('0.3452479470322310936331832846')),'0.345247947032231094');
});

test('non-USDC fees stay excluded and unknown roles never become maker via crossed', () => {
  const fill = normalizeTxFill(rawFill({feeToken:'BTC',fee:'0.0001',tradeSide:undefined,crossed:true}));
  const summary = summarizeTxFills([fill]);
  assert.equal(summary.volume,'650.105');
  assert.equal(summary.netFees,'0');
  assert.deepEqual(summary.excludedFeeTokens,['BTC']);
  assert.equal(summary.unknownRoleVolume,'650.105');
  assert.deepEqual(summary.feesByRole.unknown, { paid: '0', rebates: '0', net: '0' });
  assert.throws(() => normalizeTxFill(rawFill({instrumentType:'outcome'})),/non-perpetual/);
  assert.throws(() => normalizeTxFill(rawFill({tid:9007199254740992})),/Unsafe/);
});

test('paged TxFlow history uses hasMore and actual row count instead of a short-page heuristic', async () => {
  const offsets = [];
  const result = await collectTxHistory(async offset => {
    offsets.push(offset);
    return offset === 0 ? page([rawFill()],true,2) : page([rawFill({tid:'2'})],false,2);
  },normalizeTxFill,options);
  assert.deepEqual(offsets,[0,1]);
  assert.equal(result.status,'complete');
  assert.equal(result.rows.length,2);
  const empty = await collectTxHistory(async () => page([],false,0),normalizeTxFill,options);
  assert.equal(empty.status,'complete');
  assert.equal(summarizeTxFills(empty.rows).volume,'0');
});

test('deduplication keeps both execution legs of a self-trade', async () => {
  const first = rawFill(), opposite = rawFill({side:'A',oid:'7',tradeSide:'Maker'});
  let call = 0;
  const result = await collectTxHistory(async () => ++call === 1 ? page([first],true,2) : page([first,opposite],false,2),normalizeTxFill,options);
  assert.equal(result.status,'complete');
  assert.equal(result.rows.length,2);
  assert.equal(summarizeTxFills(result.rows).volume,'1300.21');
});

test('stalls, changed counts, missing pages and malformed rows cannot produce complete totals', async () => {
  const stalled = await collectTxHistory(async () => page([rawFill()],true),normalizeTxFill,options);
  assert.equal(stalled.status,'partial');
  const capped = await collectTxHistory(async () => page([rawFill()],true),normalizeTxFill,{...options,maxPages:1});
  assert.equal(capped.status,'partial');
  assert.match(capped.warnings[0],/limit/);
  const mismatch = await collectTxHistory(async () => page([rawFill()],false,2),normalizeTxFill,options);
  assert.equal(mismatch.status,'partial');
  let call = 0;
  const changed = await collectTxHistory(async () => ++call === 1 ? page([rawFill()],true,2) : page([rawFill({tid:'2'})],false,3),normalizeTxFill,options);
  assert.equal(changed.status,'partial');
  call = 0;
  const failed = await collectTxHistory(async () => { if (++call === 2) throw new Error('rate limit'); return page([rawFill()],true); },normalizeTxFill,options);
  assert.equal(failed.status,'partial');
  assert.equal(failed.rows.length,1);
  const unavailable = await collectTxHistory(async () => { throw new Error('offline'); },normalizeTxFill,options);
  assert.equal(unavailable.status,'unavailable');
  const future = await collectTxHistory(async () => page([rawFill({time:asOf+1})],false),normalizeTxFill,options);
  assert.equal(future.status,'unavailable');
  const before = await collectTxHistory(async () => page([rawFill()],false),normalizeTxFill,{...options,from:asOf});
  assert.equal(before.status,'unavailable');
  call = 0;
  const revisedRole = await collectTxHistory(async () => ++call === 1 ? page([rawFill({tradeSide:undefined})],true) : page([rawFill({tradeSide:'Maker'})],false),normalizeTxFill,options);
  assert.equal(revisedRole.status,'partial');
  assert.equal(revisedRole.rows.length,1);
});

test('funding sign means received minus paid and retains decimal precision', () => {
  const rows = [normalizeTxFunding({coin:'BTC',time:asOf,amount:'0.345247947032231093633'}),normalizeTxFunding({coin:'ETH',time:asOf,amount:'-1.5'})];
  assert.deepEqual(summarizeTxFunding(rows),{paid:'1.5',received:'0.345247947032231094',net:'-1.154752052967768906',count:2});
});

test('market and UTC-day aggregates reconcile volume and fees across midnight', () => {
  const rows = [normalizeTxFill(rawFill({time:Date.parse('2026-10-21T23:59:59Z')})),normalizeTxFill(rawFill({tid:'2',symbol:'ETH-USDC',time:Date.parse('2026-10-22T00:00:00Z'),fee:'-0.01'}))];
  const grouped = groupTxFills(rows), summary = summarizeTxFills(rows);
  assert.deepEqual(grouped.days.map(day => day.day),['2026-10-21','2026-10-22']);
  for (const group of [grouped.markets,grouped.days]) {
    assert.equal(txUsd(group.reduce((total,row)=>total+txAtoms(row.volume),BigInt(0))),summary.volume);
    assert.equal(txUsd(group.reduce((total,row)=>total+txAtoms(row.netFees),BigInt(0))),summary.netFees);
    for (const role of ['maker','taker','unknown']) for (const field of ['paid','rebates','net']) {
      assert.equal(txUsd(group.reduce((total,row)=>total+txAtoms(row.feesByRole[role][field]),BigInt(0))),summary.feesByRole[role][field]);
    }
  }
});

test('API envelope errors and mismatched overview periods are rejected; live bare overview is supported', () => {
  const bare = {code:0,period:'ALLTIME',pnl:'-10',roe:'-1',volume:'123.45',totalEquity:'1000'};
  assert.equal(normalizeTxOverview(bare,'ALLTIME').volume,'123.45');
  assert.equal(normalizeTxOverview({success:true,code:0,data:bare},'ALLTIME').equity,'1000');
  assert.throws(()=>normalizeTxOverview(bare,'7D'),/different period/);
  assert.throws(()=>unwrapTxflow({success:false,code:0,message:'Denied'}),/Denied/);
  assert.throws(()=>unwrapTxflow({success:true,code:0,data:{code:1}}),/statistics error/);
  const decoded = parse('{"tid":9007199254740993}',null,{parseNumber:value=>value});
  assert.equal(decoded.tid,'9007199254740993');
});

test('current account normalization retains short size, current equity and unavailable prices', () => {
  const account = normalizeTxAccount({success:true,code:0,data:{marginSummary:{accountValue:'123',totalMarginUsed:'20',totalNtlPos:'200'},withdrawable:'103',time:asOf,
    assetPositions:[{position:{coin:'BTC-USDC',szi:'-0.5',entryPx:'100',markPx:'90',liquidationPx:null,positionValue:'45',marginUsed:'10',unrealizedPnl:'5',leverage:{value:5,type:'Cross'}}}]}});
  assert.equal(account.equity,'123');
  assert.equal(account.positions[0].size,'-0.5');
  assert.equal(account.positions[0].liquidationPrice,null);
  assert.equal(account.positions[0].unrealizedPnl,'5');
});
