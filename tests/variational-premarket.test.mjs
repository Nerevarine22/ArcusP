import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { estimate } from '../lib/estimator.ts';
import { parseVariationalPremarket, variationalPremarketFdv, VARIATIONAL_LIGHTER_API } from '../lib/variational-premarket.ts';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === '@/lib/variational-premarket' ? new URL('../lib/variational-premarket.ts', import.meta.url).href : specifier, context);
} });
const { GET } = await import('../app/api/variational/premarket/route.ts');
const now = Date.parse('2026-11-19T12:00:00Z');
const market = (patch = {}) => ({
  symbol:'VARIATIONAL', market_id:4098, market_type:'perp', status:'active', is_frozen:false,
  multiplier:'1.000000000000000000', quote_multiplier:1,
  mark_price:'1.4972', index_price:'1.5610', last_trade_price:1.4964, ...patch,
});
const payload = (patch = {}) => ({code:200,order_book_details:[market(patch)]});

test('Lighter valuation uses the exact active VARIATIONAL mark, independently of index and last trade', () => {
  const quote=parseVariationalPremarket(payload(),now);
  assert.deepEqual(quote,{price:1.4972,priceType:'mark',marketId:4098,fetchedAt:'2026-11-19T12:00:00.000Z'});
  const foreign=market({symbol:'BTC',market_id:1,mark_price:'90000'});
  assert.equal(parseVariationalPremarket({code:200,order_book_details:[foreign,market()]},now).price,1.4972);
});

test('invalid, inactive, duplicate, scaled or foreign Lighter contracts never become a VAR quote', () => {
  for (const patch of [
    {symbol:'VAR'},{market_id:1},{market_type:'spot'},{status:'inactive'},{is_frozen:true},
    {multiplier:'1000'},{multiplier:true},{quote_multiplier:1000},
    {mark_price:null},{mark_price:''},{mark_price:'0'},{mark_price:'-1'},{mark_price:'NaN'},
    {mark_price:'Infinity'},{mark_price:'0x10'},{mark_price:' 1.5 '},{mark_price:'9'.repeat(400)},
  ]) assert.equal(parseVariationalPremarket(payload(patch),now),null,JSON.stringify(patch));
  for (const value of [null,[],{}, {code:429,order_book_details:[market()]},
    {code:200,order_book_details:[market(),market()]},{code:200,order_book_details:[]}]) {
    assert.equal(parseVariationalPremarket(value,now),null);
  }
});

test('premarket FDV and point value track both mark price and assumed supply', () => {
  const fdv=variationalPremarketFdv(1.5,1e9);
  assert.equal(fdv,1.5e9);
  const result=estimate(fdv,32,1e7,100);
  assert.equal(result.value,4800);
  assert.equal(result.valuePerPoint,48);
  assert.ok(Math.abs(1e9*.32*(100/1e7)*1.5-result.value)<1e-8);
  assert.equal(estimate(variationalPremarketFdv(1.5,2e9),32,1e7,100).value,9600);
  assert.equal(estimate(variationalPremarketFdv(3,1e9),32,1e7,100).value,9600);
  for (const [price,supply] of [[null,1e9],[1.5,null],[0,1e9],[-1,1e9],[NaN,1e9],[1.5,Infinity],[1.5,0],[1e308,1e308]]) {
    assert.equal(variationalPremarketFdv(price,supply),null);
  }
});

test('quote route fetches the public market without credentials and returns a dated quote',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(url,VARIATIONAL_LIGHTER_API);
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers,undefined);
    return Response.json(payload());
  });
  const response=await GET(),quote=await response.json();
  assert.equal(quote.price,1.4972);assert.equal(quote.priceType,'mark');
  assert.ok(Number.isFinite(Date.parse(quote.fetchedAt)));
  assert.equal(response.headers.get('cache-control'),'public, s-maxage=30');
});

test('upstream failures and invalid quotes return unknown price without a stale fallback',async t=>{
  for (const fetcher of [async()=>{throw new Error('offline');},async()=>new Response('',{status:429}),async()=>Response.json(payload({mark_price:'0'}))]) {
    const mock=t.mock.method(globalThis,'fetch',fetcher);
    const response=await GET();
    assert.deepEqual(await response.json(),{price:null});
    assert.equal(response.headers.get('cache-control'),'no-store');
    mock.mock.restore();
  }
});
