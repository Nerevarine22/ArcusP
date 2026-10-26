import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENDED_EVENT_SLUG, heisenbergPage, inferFdvMedian, loadExtendedMarket, normalizeExtendedMarkets, quoteFromCandles } from '../lib/extended-market.ts';

const now = Date.parse('2026-10-23T17:45:00Z');
const raw = (amount, id = 1) => ({ question:`Extended FDV above $${amount} one day after launch?`,
  event_slug:EXTENDED_EVENT_SLUG, closed:false, slug:`extended-fdv-above-${amount.toLowerCase()}-one-day-after-launch`,
  condition_id:`0x${String(id).padStart(64,'0')}`, side_a_outcome:'Yes', side_a_token_id:String(id), side_b_outcome:'No', side_b_token_id:String(id+100) });
const market = normalizeExtendedMarkets([raw('150M')])[0];
const candle = (patch = {}) => ({ candle_time:'2026-10-23T16:00:00Z',token_id:market.yesToken,condition_id:market.conditionId,
  outcome:'Yes',bid_close:'0.70',ask_close:'0.74',close:'0.73',trade_count:1,...patch });
const page = (rows, has_more = false) => ({ data:{results:rows},pagination:{has_more} });
const threshold = (thresholdUsd, yesProbability) => ({thresholdUsd,yesProbability});

test('exact event, open markets and YES side identity are required; thresholds sort numerically', () => {
  const reversed = {...raw('1B',2),side_a_outcome:'No',side_a_token_id:'99',side_b_outcome:'Yes',side_b_token_id:'2'};
  const rows = normalizeExtendedMarkets([reversed,raw('150M'),{...raw('500M',3),closed:true},{...raw('300M',4),event_slug:'other-event'}]);
  assert.deepEqual(rows.map(row=>row.thresholdUsd),[150_000_000,1_000_000_000]);
  assert.equal(rows[1].yesToken,'2');
  assert.throws(()=>normalizeExtendedMarkets([raw('150M'),raw('150M',2)]));
  assert.throws(()=>normalizeExtendedMarkets([{...raw('150M'),side_a_outcome:'Maybe',side_b_outcome:'No'}]));
});

test('latest matching YES candle uses bid/ask midpoint, with a trade fallback for wide/crossed books', () => {
  const result = quoteFromCandles([candle({candle_time:'2026-10-23T15:00:00Z',bid_close:'0.60',ask_close:'0.64'}),candle()],market,now);
  assert.equal(result.state,'available'); assert.equal(result.yesProbability,0.72); assert.equal(result.priceMethod,'midpoint');
  for (const patch of [{bid_close:'0.01',ask_close:'0.99'},{bid_close:'0.9',ask_close:'0.1'},{bid_close:null,ask_close:null}]) {
    const fallback=quoteFromCandles([candle(patch)],market,now);
    assert.equal(fallback.yesProbability,0.73); assert.equal(fallback.priceMethod,'last_trade');
  }
});

test('foreign outcomes, invalid timestamps, stale data and non-traded invalid books do not become current quotes', () => {
  for (const patch of [{token_id:'999'},{condition_id:`0x${'f'.repeat(64)}`},{outcome:'No'},
    {candle_time:'invalid'},{candle_time:'2026-10-24T16:00:00Z'}, {bid_close:'bad',ask_close:null,close:null,trade_count:0}]) {
    assert.equal(quoteFromCandles([candle(patch)],market,now).yesProbability,null);
  }
  const stale=quoteFromCandles([candle({candle_time:'2026-10-21T16:00:00Z'})],market,now);
  assert.equal(stale.state,'stale'); assert.equal(stale.yesProbability,null); assert.equal(stale.quoteAsOf,'2026-10-21T16:00:00.000Z');
  assert.equal(stale.lastKnownProbability,0.72,'retain the historical percentage for clearly dated display');
  assert.equal(stale.priceMethod,'midpoint');
});

test('50% median interpolates overlapping exceedance thresholds without a weighted-average FDV', () => {
  const median=inferFdvMedian([threshold(500e6,0.2),threshold(150e6,0.72),threshold(300e6,0.38)]);
  assert.equal(median.kind,'estimate');
  assert.ok(Math.abs(median.fdvUsd-247_058_823.52941176)<1e-6);
  assert.equal(median.lowerUsd,150e6); assert.equal(median.upperUsd,300e6);
  assert.deepEqual(inferFdvMedian([threshold(300e6,0.5)]),{kind:'estimate',fdvUsd:300e6,lowerUsd:300e6,upperUsd:300e6});
});

test('unbracketed tails give bounds; missing or inconsistent probabilities never invent a point estimate', () => {
  assert.deepEqual(inferFdvMedian([threshold(150e6,0.4),threshold(300e6,0.2)]),{kind:'below',boundUsd:150e6});
  assert.deepEqual(inferFdvMedian([threshold(150e6,0.8),threshold(300e6,0.6)]),{kind:'above',boundUsd:300e6});
  for (const rows of [[],[threshold(150e6,null)],[threshold(150e6,0.4),threshold(300e6,0.8)],
    [threshold(150e6,NaN)],[threshold(150e6,1.1)],[threshold(150e6,0.6),threshold(150e6,0.4)]]) {
    assert.equal(inferFdvMedian(rows).kind,'unavailable');
  }
});

test('provider adapter paginates exact event metadata and asks for bounded hourly YES prices', async () => {
  const calls=[],rawRows=[raw('150M',1),raw('300M',2)];
  const report=await loadExtendedMarket(async(agent,params,pagination)=>{
    calls.push({agent,params,pagination});
    if(agent===574) return pagination.offset===0?page([rawRows[0]],true):page([rawRows[1]]);
    const id=Number(params.token_id),m=normalizeExtendedMarkets([rawRows[id-1]])[0];
    return page([candle({token_id:m.yesToken,condition_id:m.conditionId,bid_close:null,ask_close:null,close:id===1?'0.72':'0.38'})]);
  },now);
  assert.equal(report.status,'ready');assert.equal(report.median.kind,'estimate');assert.equal(report.thresholds.length,2);
  assert.equal(calls.length,4);assert.equal(calls[1].pagination.offset,200);
  assert.ok(calls.filter(c=>c.agent===574).every(c=>c.params.event_slug===EXTENDED_EVENT_SLUG&&c.params.closed==='False'));
  const priceCalls=calls.filter(c=>c.agent===568);
  assert.ok(priceCalls.every(c=>c.params.interval==='1h'&&c.pagination.limit===200));
  assert.equal(Number(priceCalls[0].params.end_time)-Number(priceCalls[0].params.start_time),7*86400);
  assert.ok(Number(priceCalls[0].params.end_time)<1e11,'candle request timestamps are seconds');
});

test('missing tail quotes stay unknown while a valid fresh median bracket remains usable', async () => {
  const rawRows=[raw('150M',1),raw('300M',2),raw('1B',3)];
  const report=await loadExtendedMarket(async(agent,params)=>{
    if(agent===574)return page(rawRows);
    const id=Number(params.token_id);if(id===3)throw Error('provider failed');
    const m=normalizeExtendedMarkets([rawRows[id-1]])[0];
    return page([candle({token_id:m.yesToken,condition_id:m.conditionId,bid_close:null,ask_close:null,close:id===1?'0.72':'0.38'})]);
  },now);
  assert.equal(report.status,'partial');assert.equal(report.median.kind,'estimate');
  assert.equal(report.thresholds[2].yesProbability,null);assert.equal(report.warnings.length,1);
});

test('empty or incomplete payloads fail closed, without claiming zero-percent probabilities', async () => {
  assert.throws(()=>heisenbergPage({data:{results:[]}}));
  assert.throws(()=>heisenbergPage({data:{results:{}},pagination:{has_more:false}}));
  const empty=await loadExtendedMarket(async()=>page([]),now);
  assert.equal(empty.status,'unavailable');assert.equal(empty.median.kind,'unavailable');
  const partial=await loadExtendedMarket(async agent=>agent===574?page([raw('150M')]):page([],true),now);
  assert.equal(partial.status,'unavailable');assert.equal(partial.thresholds[0].yesProbability,null);
});

test('displaying a stale percentage never admits it into the FDV median calculation', async () => {
  const rawRows=[raw('150M',1),raw('300M',2),raw('800M',3)];
  const report=await loadExtendedMarket(async(agent,params)=>{
    if(agent===574)return page(rawRows);
    const id=Number(params.token_id),m=normalizeExtendedMarkets([rawRows[id-1]])[0];
    return page([candle({token_id:m.yesToken,condition_id:m.conditionId,bid_close:null,ask_close:null,
      close:id===1?'0.72':id===2?'0.38':'0.99',candle_time:id===3?'2026-10-19T19:00:00Z':'2026-10-23T16:00:00Z'})]);
  },now);
  assert.equal(report.status,'partial');
  assert.equal(report.thresholds[2].lastKnownProbability,0.99);
  assert.equal(report.thresholds[2].yesProbability,null);
  assert.equal(report.thresholds[2].state,'stale');
  assert.equal(report.median.kind,'estimate');
  assert.ok(Math.abs(report.median.fdvUsd-247_058_823.52941176)<1e-6);
});
