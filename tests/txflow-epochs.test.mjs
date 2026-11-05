import test from 'node:test';
import assert from 'node:assert/strict';
import { txflowAwardedEpochs, txflowCurrentEpoch, txflowPointsStatus, txflowReceivedEpochs, txflowEpochIds, txflowPeriodRange, txflowSelectionWindows, txflowInWindows, summarizeTxFills, summarizeTxFunding, analyzeTxHolding, buildTxEpochReport, buildTxEpochReports, normalizeTxFill, parseTxflowWalletSettings } from '../lib/txflow-wallet.ts';

const at = value => Date.parse(value);
const today = at('2026-10-26T18:00:00Z'), afterDistribution = at('2026-10-28T12:00:00Z');
const start = at('2026-10-12T00:00:00Z'), split = at('2026-10-20T00:00:00Z'), end = at('2026-10-27T00:00:00Z');
const scan = { fillsStatus:'complete', fundingStatus:'complete', historyStatus:'complete', historyPages:2 };
let sequence = 0;
const fill = (time, side='B', startPosition='0') => normalizeTxFill({instrumentId:'1',tid:String(++sequence),oid:String(sequence),symbol:'BTC-USDC',instrumentType:'perps',marginMode:'Cross',tradeSide:'Maker',side,sz:'1',px:'100',fee:'0.01',feeToken:'USDC',closedPnl:'0',time,startPosition});

test('explicit epoch boundaries include the entire final day without overlap or gaps', () => {
  const s0 = txflowPeriodRange('S0',afterDistribution), one = txflowPeriodRange('EPOCH_1',afterDistribution), two = txflowPeriodRange('EPOCH_2',afterDistribution);
  assert.equal(s0.to,start); assert.equal(one.from,start); assert.equal(one.to,split); assert.equal(two.from,split); assert.equal(two.to,end);
  for (const [time, expected] of [[start-1,'S0'],[start,'EPOCH_1'],[split-1,'EPOCH_1'],[split,'EPOCH_2'],[end-1,'EPOCH_2']]) {
    assert.deepEqual(['S0','EPOCH_1','EPOCH_2'].filter(id => txflowInWindows(time,[txflowPeriodRange(id,afterDistribution)])),[expected]);
  }
  assert.equal(txflowInWindows(end,[two]),false);
});

test('awarded defaults follow distribution dates without changing epoch boundaries', () => {
  assert.equal(txflowPointsStatus('S0'),'manual');
  assert.equal(txflowPointsStatus('S0',['S0','EPOCH_1']),'manual');
  assert.equal(txflowPointsStatus('EPOCH_2',['EPOCH_1','EPOCH_2']),'manual');
  assert.equal(txflowPointsStatus('EPOCH_2'),'manual');
  assert.deepEqual(txflowAwardedEpochs(undefined,today),['EPOCH_1']);
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  assert.deepEqual(txflowReceivedEpochs({received:{[`${address}:S0`]:false,[`${address}:EPOCH_2`]:false}},address,today),['EPOCH_1']);
  assert.equal(txflowPeriodRange('AWARDED',today).to,split);
  assert.deepEqual(txflowAwardedEpochs(undefined,afterDistribution),['S0','EPOCH_1','EPOCH_2']);
  assert.throws(() => txflowAwardedEpochs(['EPOCH_2'],split),/not started/);
  assert.deepEqual(txflowAwardedEpochs(['EPOCH_2','S0','EPOCH_1'],afterDistribution),['S0','EPOCH_1','EPOCH_2']);
  for (const invalid of [[],['INVALID'],['EPOCH_1','EPOCH_1'],null]) assert.throws(() => txflowAwardedEpochs(invalid,today));
});

test('awarded-only totals follow the selected epochs and exclude other fees and funding', () => {
  const windows = txflowSelectionWindows('AWARDED',today,['EPOCH_1']);
  const fills = [fill(start-1),fill(start),fill(split-1),fill(split),fill(today)];
  const selected = fills.filter(row => txflowInWindows(row.time,windows));
  assert.equal(summarizeTxFills(selected).volume,'200'); assert.equal(summarizeTxFills(selected).netFees,'0.02');
  const funding = fills.map((row,index) => ({key:String(index),time:row.time,market:row.market,amount:'1'}));
  assert.equal(summarizeTxFunding(funding.filter(row => txflowInWindows(row.time,windows))).count,2);
  assert.equal(fills.filter(row => txflowInWindows(row.time,txflowSelectionWindows('ALLTIME',today))).length,5);
  assert.deepEqual(txflowEpochIds('S1',['EPOCH_1'],today),['EPOCH_1','EPOCH_2']);
});

test('non-contiguous awarded windows preserve FIFO context but exclude gap execution volume', () => {
  const ids = ['S0','EPOCH_2'], windows = txflowSelectionWindows('AWARDED',afterDistribution,ids), range = txflowPeriodRange('AWARDED',afterDistribution,ids);
  const fills = [fill(start-3600000),fill(start+3600000,'A','1'),fill(split),fill(split+7200000,'A','1')];
  assert.equal(summarizeTxFills(fills.filter(row => txflowInWindows(row.time,windows))).volume,'300');
  const holding = analyzeTxHolding(fills,{...range,windows,selectedComplete:true,historyStatus:'complete',historyPages:1});
  assert.equal(holding.volume,'300');
  assert.equal(holding.buckets.find(row => row.id === 'twoTo12h').volume,'300');
  assert.equal(holding.buckets.find(row => row.id === 'unknown').volume,'0');
});

test('epoch reports reconcile individually and a later close never rewrites earlier open holdings', () => {
  const fills = [fill(split-3600000),fill(split+3600000,'A','1')];
  const reports = buildTxEpochReports(fills,[],['EPOCH_1','EPOCH_2'],afterDistribution,scan);
  assert.equal(reports[0].summary.volume,'100'); assert.equal(reports[1].summary.volume,'100');
  assert.equal(reports[0].holding.buckets.find(row => row.id === 'openUnder12h').volume,'100');
  assert.equal(reports[1].holding.buckets.find(row => row.id === 'twoTo12h').volume,'100');
  const earlier = buildTxEpochReports([fills[0]],[],['EPOCH_1'],afterDistribution,scan)[0];
  assert.deepEqual(reports[0].holding,earlier.holding);
  const unavailable = buildTxEpochReports([],[],['EPOCH_1'],today,{...scan,fillsStatus:'unavailable',fundingStatus:'unavailable'})[0];
  assert.equal(unavailable.summary,null); assert.equal(unavailable.funding,null);
  assert.equal(buildTxEpochReports([],[],['EPOCH_2'],today,scan)[0].completed,false);
});

test('each epoch keeps its own maker, taker and unknown fees, including rebates', () => {
  const fills = [
    { ...fill(start + 3600000), role:'Maker', fee:'0.1' },
    { ...fill(start + 7200000), role:'Taker', fee:'0.2' },
    { ...fill(split + 3600000), role:'Maker', fee:'-0.03' },
    { ...fill(split + 7200000), role:'Unknown', fee:'0.04' },
  ];
  const [one, two] = buildTxEpochReports(fills,[],['EPOCH_1','EPOCH_2'],afterDistribution,scan);
  assert.deepEqual(one.summary.feesByRole, { maker:{paid:'0.1',rebates:'0',net:'0.1'}, taker:{paid:'0.2',rebates:'0',net:'0.2'}, unknown:{paid:'0',rebates:'0',net:'0'} });
  assert.deepEqual(two.summary.feesByRole, { maker:{paid:'0',rebates:'0.03',net:'-0.03'}, taker:{paid:'0',rebates:'0',net:'0'}, unknown:{paid:'0.04',rebates:'0',net:'0.04'} });
  assert.equal(one.summary.netFees,'0.3'); assert.equal(two.summary.netFees,'0.01');
  assert.equal(one.summary.makerVolume,'100'); assert.equal(one.summary.takerVolume,'100');
  assert.equal(two.summary.makerVolume,'100'); assert.equal(two.summary.unknownRoleVolume,'100');
});

test('wallet settings migrate old saved inputs and retain distinct per-wallet epoch values and receipt confirmations', () => {
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const legacy = parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_1',points:{[`${address}:EPOCH_1`]:'46'}}));
  assert.equal(legacy.points[`${address}:EPOCH_1`],'46'); assert.deepEqual(legacy.received,{});
  const saved = parseTxflowWalletSettings(JSON.stringify({...legacy,period:'S1',points:{...legacy.points,[`${address}:EPOCH_2`]:'21',[`${address}:AWARDED`]:'67'},received:{[`${address}:EPOCH_2`]:true,bad:true}}));
  assert.equal(saved.period,'S1'); assert.equal(saved.points[`${address}:EPOCH_2`],'21'); assert.equal(saved.points[`${address}:AWARDED`],undefined);
  assert.deepEqual(saved.received,{[`${address}:EPOCH_2`]:true});
  assert.equal(parseTxflowWalletSettings('invalid').period,'AWARDED');
});

test('Epoch 3 enters awarded totals on 3 November and excludes subsequent trading', () => {
  const distributed=at('2026-11-03T12:00:00Z'), cutoff=at('2026-11-03T00:00:00Z');
  const address='0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const ids=['S0','EPOCH_1','EPOCH_2','EPOCH_3'];
  assert.deepEqual(txflowAwardedEpochs(undefined,distributed),ids);
  assert.deepEqual(txflowReceivedEpochs({received:{}},address,distributed),ids);
  assert.deepEqual(txflowAwardedEpochs(undefined,cutoff-1),ids.slice(0,3));
  assert.deepEqual(txflowAwardedEpochs([...ids].reverse(),distributed),ids);
  assert.deepEqual(txflowEpochIds('S1',ids,distributed),ids.slice(1));
  const range=txflowPeriodRange('EPOCH_3',distributed);
  assert.equal(range.from,end);assert.equal(range.to,cutoff);assert.equal(range.endExclusive,true);
  const fills=[fill(end-1),fill(end),fill(cutoff-1),fill(cutoff)];
  const windows=txflowSelectionWindows('AWARDED',distributed);
  assert.equal(summarizeTxFills(fills.filter(row=>txflowInWindows(row.time,windows))).fills,3);
  const [third]=buildTxEpochReports(fills,[],['EPOCH_3'],distributed,scan);
  assert.equal(third.summary.volume,'200');assert.equal(third.completed,true);
  const saved=parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_3',points:{[`${address}:EPOCH_1`]:'10',[`${address}:EPOCH_3`]:'30'},received:{[`${address}:EPOCH_3`]:true}}));
  assert.equal(saved.period,'EPOCH_3');assert.equal(saved.points[`${address}:EPOCH_3`],'30');assert.equal(saved.points[`${address}:EPOCH_1`],'10');
});

test('the current epoch has its own activity and rolls forward without entering awarded totals', () => {
  const cutoff = at('2026-11-03T00:00:00Z'), now = at('2026-11-05T12:00:00Z');
  const current = txflowCurrentEpoch(now);
  assert.equal(current.id, 'EPOCH_4');
  assert.deepEqual(current.range, { from: cutoff, to: now, endExclusive: false });
  assert.equal(txflowCurrentEpoch(cutoff - 1).id, 'EPOCH_3');
  assert.equal(txflowCurrentEpoch(at('2026-11-10T00:00:00Z')).id, 'EPOCH_5');
  assert.throws(() => txflowAwardedEpochs([current.id], now));

  const fills = [fill(cutoff - 1), { ...fill(cutoff, 'A', '1'), role: 'Taker' }, fill(now + 1)];
  const fundings = fills.map(row => ({ key: row.key, time: row.time, market: row.market, amount: '1' }));
  const awarded = txflowSelectionWindows('AWARDED', now);
  assert.equal(summarizeTxFills(fills.filter(row => txflowInWindows(row.time, awarded))).makerVolume, '100');
  assert.equal(summarizeTxFills(fills.filter(row => txflowInWindows(row.time, awarded))).takerVolume, '0');
  assert.equal(summarizeTxFunding(fundings.filter(row => txflowInWindows(row.time, awarded))).count, 1);

  const report = buildTxEpochReport(fills, fundings, current, scan);
  assert.equal(report.completed, false);
  assert.equal(report.summary.fills, 1);
  assert.equal(report.summary.takerVolume, '100');
  assert.equal(report.summary.feesByRole.taker.net, '0.01');
  assert.equal(report.funding.net, '1');
  assert.equal(report.holding.buckets.find(row => row.id === 'under1h').volume, '100');
});
