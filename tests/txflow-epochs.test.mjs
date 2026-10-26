import test from 'node:test';
import assert from 'node:assert/strict';
import { txflowAwardedEpochs, txflowPointsStatus, txflowReceivedEpochs, txflowEpochIds, txflowPeriodRange, txflowSelectionWindows, txflowInWindows, summarizeTxFills, summarizeTxFunding, analyzeTxHolding, buildTxEpochReports, normalizeTxFill, parseTxflowWalletSettings } from '../lib/txflow-wallet.ts';

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

test('local S0 and Epoch 2 previews count as distributed without changing scan cutoffs', () => {
  assert.equal(txflowPointsStatus('S0'),'manual');
  assert.equal(txflowPointsStatus('S0',['S0','EPOCH_1']),'manual');
  assert.equal(txflowPointsStatus('EPOCH_2',['EPOCH_1','EPOCH_2']),'manual');
  assert.equal(txflowPointsStatus('EPOCH_2'),'manual');
  assert.deepEqual(txflowAwardedEpochs(undefined,today),['S0','EPOCH_1','EPOCH_2']);
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  assert.deepEqual(txflowReceivedEpochs({received:{[`${address}:S0`]:false,[`${address}:EPOCH_2`]:false}},address,today),['S0','EPOCH_1','EPOCH_2']);
  assert.equal(txflowPeriodRange('AWARDED',today).to,today);
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

test('wallet settings migrate old saved inputs and retain distinct per-wallet epoch values and receipt confirmations', () => {
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const legacy = parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_1',points:{[`${address}:EPOCH_1`]:'46'}}));
  assert.equal(legacy.points[`${address}:EPOCH_1`],'46'); assert.deepEqual(legacy.received,{});
  const saved = parseTxflowWalletSettings(JSON.stringify({...legacy,period:'S1',points:{...legacy.points,[`${address}:EPOCH_2`]:'21',[`${address}:AWARDED`]:'67'},received:{[`${address}:EPOCH_2`]:true,bad:true}}));
  assert.equal(saved.period,'S1'); assert.equal(saved.points[`${address}:EPOCH_2`],'21'); assert.equal(saved.points[`${address}:AWARDED`],'67');
  assert.deepEqual(saved.received,{[`${address}:EPOCH_2`]:true});
  assert.equal(parseTxflowWalletSettings('invalid').period,'AWARDED');
});
