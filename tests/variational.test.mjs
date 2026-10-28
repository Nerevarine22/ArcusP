import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate, estimateTokenAllocation } from '../lib/estimator.ts';
import { VARIATIONAL_ALLOCATION, VARIATIONAL_DEFAULTS, VARIATIONAL_FDV_PRESETS, parseVariationalSettings } from '../lib/variational-estimator.ts';
import { loadExtendedMarket, normalizeExtendedMarkets } from '../lib/extended-market.ts';

const event = { slug:'variational-fdv-above-one-day-after-launch', project:'Variational', title:'Variational FDV above ___ one day after launch?', url:'https://polymarket.com/event/variational-fdv-above-one-day-after-launch' };
const market = (amount, id) => ({ event_slug:event.slug, question:`Variational FDV above $${amount} one day after launch?`, closed:false,
  slug:`variational-fdv-above-${amount.toLowerCase()}-one-day-after-launch`, condition_id:`0x${String(id).padStart(64,'0')}`,
  side_a_outcome:'No',side_a_token_id:String(id+100),side_b_outcome:'Yes',side_b_token_id:String(id) });
const page = rows => ({ data:{results:rows},pagination:{has_more:false} });

test('Variational scenarios use 32%; changing illustrative supply changes tokens and price but preserves USD value', () => {
  assert.deepEqual(VARIATIONAL_FDV_PRESETS,[1e8,2e8,3e8,5e8,8e8,1e9,2e9]);
  const usd = estimate(5e8,VARIATIONAL_ALLOCATION,1e7,100);
  assert.equal(usd.value,1600);
  assert.equal(usd.valuePerPoint,16);
  for (const supply of [1e8,1e9,1e10]) {
    const result = estimateTokenAllocation(5e8,1e7,100,supply,supply*.32);
    assert.equal(result.value,usd.value);
    assert.ok(Math.abs(result.tokens * result.tokenPrice - usd.value)<1e-8);
  }
  assert.equal(estimate(5e8,32,1e7,0).value,0);
  assert.equal(estimate(5e8,32,1e7,1e7).value,160_000_000);
  assert.equal(estimate(5e8,32,1e7,1e7+1),null);
});

test('Variational settings preserve independent pool, supply, empty and custom values; malformed storage restores defaults', () => {
  const settings={pointsInput:'125.5',totalInput:'9800000',fdvInput:'740000000',supplyInput:'2000000000'};
  assert.deepEqual(parseVariationalSettings(JSON.stringify(settings)),settings);
  assert.equal(parseVariationalSettings('{"supplyInput":""}').supplyInput,'');
  assert.equal(parseVariationalSettings('{"pointsInput":0}').pointsInput,'');
  for (const value of [null,'{','[]','null']) assert.deepEqual(parseVariationalSettings(value),VARIATIONAL_DEFAULTS);
});

test('FDV event isolation excludes Extended and rejects foreign-project questions under the Variational event', () => {
  const other = {...market('100M',1),event_slug:'extended-fdv-above-one-day-after-launch',question:'Extended FDV above $100M one day after launch?'};
  assert.equal(normalizeExtendedMarkets([other],event).length,0);
  assert.equal(normalizeExtendedMarkets([market('100M',1)]).length,0);
  assert.throws(()=>normalizeExtendedMarkets([{...other,event_slug:event.slug}],event));
  assert.equal(normalizeExtendedMarkets([market('100M',1)],event)[0].yesToken,'1');
});

test('Variational adapter queries its exact event and computes its own bracket; unavailable quotes stay unknown', async () => {
  const now=Date.parse('2026-10-28T14:00:00Z');
  const rows=[market('1B',1),market('2B',2),market('500M',3)];
  const report=await loadExtendedMarket(async (agent,params)=>{
    if(agent===574) {assert.equal(params.event_slug,event.slug);return page(rows);}
    const id=Number(params.token_id),row=rows.find(item=>item.side_b_token_id===String(id));
    if(id===3) throw new Error('Unavailable threshold');
    const quote = id === 1 ? .6 : .3;
    return page([{token_id:String(id),condition_id:row.condition_id,outcome:'Yes',candle_time:'2026-10-28T13:00:00Z',bid_close:quote-.01,ask_close:quote+.01,trade_count:1}]);
  },now,event);
  assert.equal(report.marketTitle,event.title);
  assert.equal(report.marketUrl,event.url);
  assert.equal(report.status,'partial');
  assert.equal(report.thresholds[0].yesProbability,null);
  assert.equal(report.thresholds[0].lastKnownProbability,null);
  assert.equal(report.median.kind,'estimate');
  assert.ok(Math.abs(report.median.fdvUsd-1_333_333_333.3333333)<.001);
  assert.ok(report.thresholds.every(row=>row.marketUrl.startsWith(event.url+'/variational-')));
});
