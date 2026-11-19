import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate, estimateTokenAllocation } from '../lib/estimator.ts';
import { VARIATIONAL_ALLOCATION, VARIATIONAL_DEFAULTS, VARIATIONAL_FDV_PRESETS, parseVariationalSettings } from '../lib/variational-estimator.ts';

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
  const settings={pointsInput:'125.5',totalInput:'9800000',fdvInput:'740000000',supplyInput:'2000000000',valuationMode:'manual'};
  assert.deepEqual(parseVariationalSettings(JSON.stringify(settings)),settings);
  assert.equal(parseVariationalSettings('{"supplyInput":""}').supplyInput,'');
  assert.equal(parseVariationalSettings('{"pointsInput":0}').pointsInput,'');
  assert.equal(parseVariationalSettings(JSON.stringify({...settings,valuationMode:'premarket'})).valuationMode,'premarket');
  const {valuationMode,...legacy}=settings;
  assert.deepEqual(parseVariationalSettings(JSON.stringify(legacy)),settings,'existing manual calculations stay manual');
  assert.equal(VARIATIONAL_DEFAULTS.valuationMode,'premarket');
  assert.equal(VARIATIONAL_DEFAULTS.totalInput,'10350000');
  assert.equal(parseVariationalSettings(JSON.stringify({...settings,totalInput:'10000000'})).totalInput,'10350000');
  assert.equal(parseVariationalSettings(JSON.stringify({...settings,totalInput:'10000000',poolRevision:2})).totalInput,'10000000');
  assert.equal(parseVariationalSettings(JSON.stringify({...settings,totalInput:''})).totalInput,'');
  for (const value of [null,'{','[]','null']) assert.deepEqual(parseVariationalSettings(value),VARIATIONAL_DEFAULTS);
});
