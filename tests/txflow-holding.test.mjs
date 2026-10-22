import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTxHolding, normalizeTxFill, summarizeTxFills, txAtoms, txUsd } from '../lib/txflow-wallet.ts';

const start = Date.parse('2026-10-12T00:00:00Z'), hour = 3600000;
let sequence = 0;
function fill(at, side, size, startPosition, overrides = {}) {
  sequence++;
  return normalizeTxFill({ instrumentId:'1',tid:String(sequence),oid:String(sequence),symbol:'BTC-USDC',instrumentType:'perps',marginMode:'Cross',tradeSide:'Maker',
    side:side === 'BUY' ? 'B' : 'A',sz:String(size),px:'100',fee:'0',feeToken:'USDC',closedPnl:'0',time:at,startPosition:startPosition === null ? null : String(startPosition),...overrides });
}
const options = { from:start, to:start+24*hour, endExclusive:true, selectedComplete:true, historyStatus:'complete', historyPages:2 };
const bucket = (result,id) => result.buckets.find(row => row.id === id).volume;
function reconcile(result, selected) {
  assert.equal(result.volume,summarizeTxFills(selected).volume);
  assert.equal(txUsd(result.buckets.reduce((sum,row)=>sum+txAtoms(row.volume),BigInt(0))),result.volume);
}

test('holding duration bands are disjoint at exactly 1h, 2h and 12h', () => {
  for (const [duration,id] of [[0.5,'under1h'],[1,'oneTo2h'],[2,'twoTo12h'],[12,'over12h']]) {
    const fills = [fill(start,'BUY',1,0),fill(start+duration*hour,'SELL',1,1)];
    const result = analyzeTxHolding(fills,options);
    assert.equal(bucket(result,id),'200');
    assert.equal(result.averageClosedHoldHours,duration);
    assert.equal(result.status,'complete');
    reconcile(result,fills);
  }
});

test('partial closes allocate entry and exit volume once, leaving the remainder open', () => {
  const fills = [fill(start,'BUY',10,0),fill(start+1.5*hour,'SELL',3,10,{px:'110'})];
  const result = analyzeTxHolding(fills,options);
  assert.equal(bucket(result,'oneTo2h'),'630');
  assert.equal(bucket(result,'openOver12h'),'700');
  assert.equal(result.heldAtLeast12h,'700');
  assert.equal(result.averageClosedHoldHours,1.5);
  reconcile(result,fills);
});

test('a direction flip closes the old position and opens a new opposite lot', () => {
  const fills = [fill(start,'BUY',1,0),fill(start+2*hour,'SELL',2,1,{px:'125'})];
  const result = analyzeTxHolding(fills,{...options,to:start+3*hour});
  assert.equal(bucket(result,'twoTo12h'),'225');
  assert.equal(bucket(result,'openUnder12h'),'125');
  assert.equal(result.averageClosedHoldHours,2);
  reconcile(result,fills);
});

test('prior-period entries determine duration without adding their volume to the selected epoch', () => {
  const entry = fill(start-4*hour,'BUY',10,0), exit = fill(start+12*hour,'SELL',10,10,{px:'110'});
  const result = analyzeTxHolding([entry,exit],options);
  assert.equal(bucket(result,'over12h'),'1100');
  assert.equal(result.averageClosedHoldHours,16);
  reconcile(result,[exit]);
});

test('closes after the cutoff never rewrite the prior epoch open state', () => {
  const entry = fill(start+6*hour,'BUY',1,0), futureExit = fill(options.to+hour,'SELL',1,1);
  const first = analyzeTxHolding([entry],options), later = analyzeTxHolding([entry,futureExit],options);
  assert.deepEqual(later,first);
  assert.equal(bucket(later,'openOver12h'),'100');
  const shorter = analyzeTxHolding([entry],{...options,to:entry.time+12*hour-1});
  assert.equal(bucket(shorter,'openUnder12h'),'100');
});

test('FIFO matches the earliest quantity first when positions are built in several entries', () => {
  const fills = [fill(start,'BUY',1,0),fill(start+11*hour,'BUY',1,1),fill(start+13*hour,'SELL',1,2)];
  const result = analyzeTxHolding(fills,{...options,to:start+14*hour});
  assert.equal(bucket(result,'over12h'),'200');
  assert.equal(bucket(result,'openUnder12h'),'100');
  assert.equal(result.averageClosedHoldHours,13);
  reconcile(result,fills);
});

test('missing original openings stay unknown and known subsequent flat positions can recover', () => {
  const fills = [fill(start,'SELL',1,1),fill(start+hour,'BUY',1,0,{px:'110'}),fill(start+1.5*hour,'SELL',1,1,{px:'120'})];
  const result = analyzeTxHolding(fills,options);
  assert.equal(bucket(result,'unknown'),'100');
  assert.equal(bucket(result,'under1h'),'230');
  assert.equal(result.status,'partial');
  reconcile(result,fills);
  const noCheckpoint = analyzeTxHolding([fill(start,'BUY',1,null)],options);
  assert.equal(bucket(noCheckpoint,'unknown'),'100');
  assert.equal(noCheckpoint.averageClosedHoldHours,null);
});

test('position checkpoint gaps invalidate only unresolved entry volume, not earlier matches', () => {
  const fills = [fill(start,'BUY',2,0),fill(start+hour,'SELL',1,2),fill(start+2*hour,'SELL',1,6)];
  const result = analyzeTxHolding(fills,options);
  assert.equal(bucket(result,'oneTo2h'),'200');
  assert.equal(bucket(result,'unknown'),'200');
  assert.equal(result.status,'partial');
  assert.match(result.notes.join(' '),/checkpoints/);
  reconcile(result,fills);
});

test('instrument and margin-mode books do not close one another', () => {
  const fills = [fill(start,'BUY',1,0),fill(start+hour,'SELL',1,1,{instrumentId:'2',symbol:'ETH-USDC'}),fill(start+2*hour,'SELL',1,1,{marginMode:'Isolated'})];
  const result = analyzeTxHolding(fills,options);
  assert.equal(bucket(result,'unknown'),'200');
  assert.equal(bucket(result,'openOver12h'),'100');
  reconcile(result,fills);
});

test('timestamp ties use full-precision execution ids rather than lexical ordering', () => {
  const entry = fill(start,'BUY',1,0,{tid:'9007199254740999'}), exit = fill(start,'SELL',1,1,{tid:'9007199254741000'});
  const result = analyzeTxHolding([exit,entry],options);
  assert.equal(bucket(result,'under1h'),'200');
  assert.equal(result.averageClosedHoldHours,0);
});

test('18-decimal monetary remainders and fractional quantities reconcile after partial closes', () => {
  const fills = [fill(start,'BUY','0.00000000000000000003',0,{px:'100'}),fill(start+hour,'SELL','0.00000000000000000001','0.00000000000000000003',{px:'103'}),fill(start+2*hour,'SELL','0.00000000000000000002','0.00000000000000000002',{px:'107'})];
  const result = analyzeTxHolding(fills,options);
  reconcile(result,fills);
  assert.equal(result.status,'complete');
});

test('incomplete selected scans make no holding claims; truncated prior history is disclosed', () => {
  const fills = [fill(start,'BUY',1,0),fill(start+hour,'SELL',1,1)];
  const incomplete = analyzeTxHolding(fills,{...options,selectedComplete:false});
  assert.equal(incomplete.status,'incomplete');
  assert.deepEqual(incomplete.buckets,[]);
  const priorMissing = analyzeTxHolding(fills,{...options,historyStatus:'partial'});
  assert.equal(priorMissing.status,'partial');
  assert.equal(bucket(priorMissing,'oneTo2h'),'200');
  const empty = analyzeTxHolding([],options);
  assert.equal(empty.volume,'0');
  assert.equal(empty.averageClosedHoldHours,null);
});
