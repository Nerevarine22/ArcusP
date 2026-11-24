import test from 'node:test';
import assert from 'node:assert/strict';
import { TXFLOW_EPOCHS, txflowAwardedEpochs, txflowCurrentEpoch, txflowPendingEpochs, txflowReportEpochs, txflowPointsStatus, txflowReceivedEpochs, txflowEpochIds, txflowPeriodRange, txflowSelectionWindows, txflowInWindows, summarizeTxFills, summarizeTxFunding, analyzeTxHolding, buildTxEpochReport, buildTxEpochReports, normalizeTxFill, parseTxflowWalletSettings } from '../lib/txflow-wallet.ts';

const at = value => Date.parse(value);
const today = at('2026-10-26T18:00:00Z'), afterDistribution = at('2026-10-28T12:00:00Z');
const start = at('2026-10-12T00:00:00Z'), split = at('2026-10-19T00:00:00Z'), end = at('2026-10-26T00:00:00Z');
const scan = { fillsStatus:'complete', fundingStatus:'complete', historyStatus:'complete', historyPages:2 };
let sequence = 0;
const fill = (time, side='B', startPosition='0') => normalizeTxFill({instrumentId:'1',tid:String(++sequence),oid:String(sequence),symbol:'BTC-USDC',instrumentType:'perps',marginMode:'Cross',tradeSide:'Maker',side,sz:'1',px:'100',fee:'0.01',feeToken:'USDC',closedPnl:'0',time,startPosition});

test('TxFlow invalidates cached epoch reports across Monday rollover and missing configured epochs',async()=>{
  const {isTxflowScheduleCurrent}=await import('../lib/txflow-wallet.ts');
  const before=at('2026-11-15T23:59:59Z'),after=at('2026-11-16T00:00:00Z');
  const awarded=txflowAwardedEpochs(undefined,before);
  const snapshot={period:'AWARDED',awardedEpochs:awarded,epochs:awarded.map(id=>({id})),currentEpoch:txflowCurrentEpoch(before)};
  assert.equal(isTxflowScheduleCurrent(snapshot,before),true);
  assert.equal(isTxflowScheduleCurrent(snapshot,after),false);
  const refreshed={...snapshot,currentEpoch:txflowCurrentEpoch(after)};
  assert.equal(isTxflowScheduleCurrent(refreshed,after),true);
  const s1={...refreshed,period:'S1',epochs:txflowEpochIds('S1',awarded,after).map(id=>({id}))};
  assert.equal(isTxflowScheduleCurrent(s1,after),true);
  assert.equal(isTxflowScheduleCurrent({...s1,epochs:s1.epochs.filter(epoch=>epoch.id!=='EPOCH_5')},after),false);
  const individual={...snapshot,period:'EPOCH_1',epochs:[{id:'EPOCH_1'}]};
  assert.equal(isTxflowScheduleCurrent(individual,after),true);
});

test('explicit epoch boundaries include the entire final day without overlap or gaps', () => {
  const s0 = txflowPeriodRange('S0',afterDistribution), one = txflowPeriodRange('EPOCH_1',afterDistribution), two = txflowPeriodRange('EPOCH_2',afterDistribution);
  assert.equal(s0.to,start); assert.equal(one.from,start); assert.equal(one.to,split); assert.equal(two.from,split); assert.equal(two.to,end);
  for (const [time, expected] of [[start-1,'S0'],[start,'EPOCH_1'],[split-1,'EPOCH_1'],[split,'EPOCH_2'],[end-1,'EPOCH_2']]) {
    assert.deepEqual(['S0','EPOCH_1','EPOCH_2'].filter(id => txflowInWindows(time,[txflowPeriodRange(id,afterDistribution)])),[expected]);
  }
  assert.equal(txflowInWindows(end,[two]),false);
});

test('every configured S1 epoch starts on Monday, lasts seven days, and drops points on Tuesday', () => {
  for (const [id,epoch] of Object.entries(TXFLOW_EPOCHS).filter(([id]) => id !== 'S0')) {
    const from = at(epoch.start), to = at(epoch.end);
    assert.equal(new Date(from).getUTCDay(),1);
    assert.equal(new Date(to).getUTCDay(),1);
    assert.equal(to-from,7*86400000);
    assert.equal(at(epoch.distribution+'T00:00:00Z')-to,86400000);
    assert.deepEqual(txflowPeriodRange(id,from),{from,to:from,endExclusive:false});
    assert.equal(txflowCurrentEpoch(from).id,id);
  }
});

test('Epoch IV and V roll over on 9 November midnight UTC, independently of Tuesday distribution', () => {
  const boundary = at('2026-11-09T00:00:00Z');
  const fourth = txflowCurrentEpoch(boundary-1), fifth = txflowCurrentEpoch(boundary);
  assert.equal(fourth.id,'EPOCH_4');
  assert.equal(fourth.range.from,at('2026-11-02T00:00:00Z'));
  assert.equal(fifth.id,'EPOCH_5');
  assert.equal(fifth.range.from,boundary);
  const displayed = txflowCurrentEpoch(at('2026-11-09T11:12:00Z'));
  assert.equal(displayed.id,'EPOCH_5');
  // Matches the live overview's currentEpochEndsAt, the final millisecond of Sunday.
  assert.equal(displayed.range.from+7*86400000-1,at('2026-11-15T23:59:59.999Z'));
  const fills = [fill(boundary-1),fill(boundary)];
  const report = buildTxEpochReport(fills,[],displayed,scan);
  assert.equal(report.summary.fills,1);
  assert.equal(report.summary.volume,'100');
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
  assert.deepEqual(txflowEpochIds('S1',['EPOCH_1'],today),['EPOCH_1','EPOCH_2','EPOCH_3']);
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
  assert.equal(buildTxEpochReports([],[],['EPOCH_2'],today,scan)[0].completed,true);
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
  const distributed=at('2026-11-03T12:00:00Z'), cutoff=at('2026-11-02T00:00:00Z');
  const address='0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const ids=['S0','EPOCH_1','EPOCH_2','EPOCH_3'];
  assert.deepEqual(txflowAwardedEpochs(undefined,distributed),ids);
  assert.deepEqual(txflowReceivedEpochs({received:{}},address,distributed),ids);
  assert.deepEqual(txflowAwardedEpochs(undefined,cutoff-1),ids.slice(0,3));
  assert.deepEqual(txflowAwardedEpochs([...ids].reverse(),distributed),ids);
  assert.deepEqual(txflowEpochIds('S1',ids,distributed),[...ids.slice(1),'EPOCH_4']);
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
  const cutoff = at('2026-11-02T00:00:00Z'), now = at('2026-11-05T12:00:00Z');
  const current = txflowCurrentEpoch(now);
  assert.equal(current.id, 'EPOCH_4');
  assert.deepEqual(current.range, { from: cutoff, to: now, endExclusive: false });
  assert.equal(txflowCurrentEpoch(cutoff - 1).id, 'EPOCH_3');
  assert.equal(txflowCurrentEpoch(at('2026-11-09T00:00:00Z')).id, 'EPOCH_5');
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

test('Epoch 4 is the latest awarded epoch from 10 November while Epoch 5 stays separate', () => {
  const distributed = at('2026-11-10T12:00:00Z'), cutoff = at('2026-11-09T00:00:00Z');
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const awarded = ['S0','EPOCH_1','EPOCH_2','EPOCH_3','EPOCH_4'];
  assert.deepEqual(txflowAwardedEpochs(undefined,distributed),awarded);
  assert.deepEqual(txflowReceivedEpochs({received:{}},address,distributed),awarded);
  assert.deepEqual(txflowAwardedEpochs(undefined,at('2026-11-09T23:59:59.999Z')),awarded.slice(0,-1));
  assert.equal(txflowCurrentEpoch(distributed).id,'EPOCH_5');
  const range = txflowPeriodRange('EPOCH_4',distributed);
  assert.deepEqual(range,{from:at('2026-11-02T00:00:00Z'),to:cutoff,endExclusive:true});
  const fills = [fill(range.from-1),fill(range.from),fill(cutoff-1),fill(cutoff)];
  const funding = fills.map(row => ({key:row.key,time:row.time,market:row.market,amount:'1'}));
  const windows = txflowSelectionWindows('AWARDED',distributed);
  assert.equal(summarizeTxFills(fills.filter(row=>txflowInWindows(row.time,windows))).fills,3);
  assert.equal(summarizeTxFunding(funding.filter(row=>txflowInWindows(row.time,windows))).count,3);
  const [fourth] = buildTxEpochReports(fills,funding,['EPOCH_4'],distributed,scan);
  assert.equal(fourth.completed,true);
  assert.equal(fourth.summary.fills,2);
  assert.equal(fourth.summary.volume,'200');
  const saved = parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_4',
    points:{[`${address}:EPOCH_3`]:'30',[`${address}:EPOCH_4`]:'40',[`${address}:EPOCH_5`]:'50'},
    received:{[`${address}:EPOCH_4`]:true}}));
  assert.equal(saved.period,'EPOCH_4');
  assert.equal(saved.points[`${address}:EPOCH_3`],'30');
  assert.equal(saved.points[`${address}:EPOCH_4`],'40');
  assert.equal(saved.points[`${address}:EPOCH_5`],'50');
  assert.equal(saved.received[`${address}:EPOCH_4`],true);
});

test('the Monday rollover preserves all pending weeks without overlap or adding them to awarded totals', () => {
  const previous = at('2026-11-09T00:00:00Z'), cutoff = at('2026-11-16T00:00:00Z'), now = cutoff + 12*3600000;
  assert.deepEqual(txflowPendingEpochs(cutoff-1),[]);
  const [pending] = txflowPendingEpochs(now), current = txflowCurrentEpoch(now);
  assert.equal(pending.id,'EPOCH_5');
  assert.deepEqual(pending.range,{from:previous,to:cutoff,endExclusive:true});
  assert.equal(pending.completed,true);
  assert.equal(current.id,'EPOCH_6');
  assert.deepEqual(current.range,{from:cutoff,to:now,endExclusive:false});

  const fills = [fill(previous-1),fill(previous),fill(cutoff-1),fill(cutoff),fill(now),fill(now+1)];
  const funding = fills.map(row=>({key:row.key,time:row.time,market:row.market,amount:'1'}));
  const epochs = buildTxEpochReports(fills,funding,txflowEpochIds('AWARDED',txflowAwardedEpochs(undefined,now),now),now,scan);
  const report = {epochs,pendingEpochs:[buildTxEpochReport(fills,funding,pending,scan)],currentEpoch:buildTxEpochReport(fills,funding,current,scan)};
  const visible = txflowReportEpochs(report);
  assert.deepEqual(visible.map(epoch=>epoch.id),['S0','EPOCH_1','EPOCH_2','EPOCH_3','EPOCH_4','EPOCH_5','EPOCH_6']);
  assert.equal(visible.at(-2).summary.volume,'200');
  assert.equal(visible.at(-2).funding.net,'2');
  assert.equal(visible.at(-1).summary.volume,'200');
  assert.equal(visible.at(-1).funding.net,'2');
  const awarded = txflowSelectionWindows('AWARDED',now);
  assert.equal(summarizeTxFills(fills.filter(row=>txflowInWindows(row.time,awarded))).fills,1);
  assert.equal(summarizeTxFunding(funding.filter(row=>txflowInWindows(row.time,awarded))).count,1);
  assert.equal(epochs.reduce((total,epoch)=>total+epoch.summary.fills,0),1);
  // A future close cannot rewrite the holding profile at the completed week's cutoff.
  assert.deepEqual(report.pendingEpochs[0].holding,buildTxEpochReport(fills.filter(row=>row.time<cutoff),funding,pending,scan).holding);

  const later = cutoff + 2*7*86400000;
  assert.deepEqual(txflowPendingEpochs(later).map(epoch=>epoch.id),['EPOCH_7']);
  assert.equal(txflowCurrentEpoch(later).id,'EPOCH_8');
  assert.equal(txflowPendingEpochs(at('2026-11-10T12:00:00Z')).some(epoch=>epoch.id==='EPOCH_4'),false);
  assert.equal(txflowPendingEpochs(at('2026-11-09T12:00:00Z')).some(epoch=>epoch.id==='EPOCH_4'),true);
});

test('epoch selection keeps legacy reports readable and avoids duplicate cards for all-history scopes', () => {
  const now = at('2026-11-05T12:00:00Z');
  const epochs = buildTxEpochReports([],[],['S0','EPOCH_3','EPOCH_4'],now,scan);
  const currentEpoch = buildTxEpochReport([],[],txflowCurrentEpoch(now),scan);
  assert.deepEqual(txflowReportEpochs({epochs}),epochs);
  const visible = txflowReportEpochs({epochs,pendingEpochs:[epochs[1]],currentEpoch});
  assert.equal(visible.length,3);
  assert.equal(visible.at(-1),currentEpoch);
});

test('Epoch 5 joins awarded totals on 17 November and Epoch 6 remains separate without duplicate cards', () => {
  const distributed = at('2026-11-17T12:00:00Z'), cutoff = at('2026-11-16T00:00:00Z');
  const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const ids = ['S0','EPOCH_1','EPOCH_2','EPOCH_3','EPOCH_4','EPOCH_5'];
  assert.deepEqual(txflowAwardedEpochs(undefined,distributed),ids);
  assert.deepEqual(txflowReceivedEpochs({received:{}},address,distributed),ids);
  assert.deepEqual(txflowAwardedEpochs(undefined,at('2026-11-16T23:59:59.999Z')),ids.slice(0,-1));
  assert.deepEqual(txflowPendingEpochs(distributed),[]);
  assert.equal(txflowCurrentEpoch(distributed).id,'EPOCH_6');
  const range = txflowPeriodRange('EPOCH_5',distributed);
  assert.deepEqual(range,{from:at('2026-11-09T00:00:00Z'),to:cutoff,endExclusive:true});
  assert.equal(txflowPeriodRange('AWARDED',distributed).to,cutoff);
  const fills = [fill(range.from-1),fill(range.from),fill(cutoff-1),fill(cutoff)];
  const funding = fills.map(row=>({key:row.key,time:row.time,market:row.market,amount:'1'}));
  const windows = txflowSelectionWindows('AWARDED',distributed);
  assert.equal(summarizeTxFills(fills.filter(row=>txflowInWindows(row.time,windows))).fills,3);
  assert.equal(summarizeTxFunding(funding.filter(row=>txflowInWindows(row.time,windows))).count,3);
  const epochs = buildTxEpochReports(fills,funding,ids,distributed,scan);
  assert.equal(epochs.at(-1).summary.volume,'200');
  const currentEpoch = buildTxEpochReport(fills,funding,txflowCurrentEpoch(distributed),scan);
  const visible = txflowReportEpochs({epochs,pendingEpochs:[],currentEpoch});
  assert.deepEqual(visible.map(epoch=>epoch.id),[...ids,'EPOCH_6']);
  assert.equal(currentEpoch.summary.fills,1);
  const saved = parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_5',
    points:{[`${address}:EPOCH_4`]:'40',[`${address}:EPOCH_5`]:'50'},received:{[`${address}:EPOCH_5`]:true}}));
  assert.equal(saved.period,'EPOCH_5');
  assert.equal(saved.points[`${address}:EPOCH_4`],'40');
  assert.equal(saved.points[`${address}:EPOCH_5`],'50');
  assert.equal(saved.received[`${address}:EPOCH_5`],true);
});

test('Epoch 6 is awarded on 24 November while Epoch 7 activity stays outside awarded totals', async () => {
  const {isTxflowScheduleCurrent}=await import('../lib/txflow-wallet.ts');
  const now=at('2026-11-24T12:00:00Z'),cutoff=at('2026-11-23T00:00:00Z');
  const address='0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
  const ids=['S0','EPOCH_1','EPOCH_2','EPOCH_3','EPOCH_4','EPOCH_5','EPOCH_6'];
  assert.deepEqual(txflowAwardedEpochs(undefined,now),ids);
  assert.deepEqual(txflowReceivedEpochs({received:{}},address,now),ids);
  assert.deepEqual(txflowAwardedEpochs(undefined,at('2026-11-23T23:59:59.999Z')),ids.slice(0,-1));
  assert.deepEqual(txflowPendingEpochs(now),[]);
  assert.deepEqual(txflowPendingEpochs(cutoff+1).map(epoch=>epoch.id),['EPOCH_6']);
  const range=txflowPeriodRange('EPOCH_6',now);
  assert.deepEqual(range,{from:at('2026-11-16T00:00:00Z'),to:cutoff,endExclusive:true});
  assert.equal(txflowPeriodRange('AWARDED',now).to,cutoff);
  const fills=[fill(range.from-1),fill(range.from),fill(cutoff-1),fill(cutoff)];
  const funding=fills.map(row=>({key:row.key,time:row.time,market:row.market,amount:'1'}));
  const windows=txflowSelectionWindows('AWARDED',now);
  assert.equal(summarizeTxFills(fills.filter(row=>txflowInWindows(row.time,windows))).fills,3);
  assert.equal(summarizeTxFunding(funding.filter(row=>txflowInWindows(row.time,windows))).count,3);
  const epochs=buildTxEpochReports(fills,funding,ids,now,scan);
  assert.equal(epochs.at(-1).summary.volume,'200');
  const current=txflowCurrentEpoch(now);
  assert.equal(current.id,'EPOCH_7');
  const currentEpoch=buildTxEpochReport(fills,funding,current,scan);
  assert.equal(currentEpoch.summary.fills,1);
  assert.deepEqual(txflowReportEpochs({epochs,pendingEpochs:[],currentEpoch}).map(row=>row.id),[...ids,'EPOCH_7']);
  const report={period:'S1',epochs:epochs.slice(1),awardedEpochs:ids,currentEpoch:current};
  assert.equal(isTxflowScheduleCurrent(report,now),true);
  assert.equal(isTxflowScheduleCurrent({...report,epochs:report.epochs.slice(0,-1)},now),false);
  const saved=parseTxflowWalletSettings(JSON.stringify({address,period:'EPOCH_6',
    points:{[`${address}:EPOCH_5`]:'50',[`${address}:EPOCH_6`]:'60'},received:{[`${address}:EPOCH_6`]:true}}));
  assert.equal(saved.period,'EPOCH_6');
  assert.equal(saved.points[`${address}:EPOCH_5`],'50');
  assert.equal(saved.points[`${address}:EPOCH_6`],'60');
  assert.equal(saved.received[`${address}:EPOCH_6`],true);
});
