import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokenAllocation } from '../lib/estimator.ts';
import { EXTENDED_SUPPLY, EXTENDED_COMMUNITY_TOKENS, EXTENDED_ALLOCATION, EXTENDED_DEFAULTS, parseExtendedSettings } from '../lib/extended-estimator.ts';

test('Extended allocation reconciles USD value, token quantity and the entire community pool', () => {
  assert.equal(EXTENDED_ALLOCATION, 30);
  const result = estimateTokenAllocation(500_000_000, 70_000_000, 46, EXTENDED_SUPPLY, EXTENDED_COMMUNITY_TOKENS);
  assert.ok(result);
  assert.equal(result.tokenPrice, 0.5);
  assert.equal(result.tokensPerPoint, 30 / 7);
  assert.ok(Math.abs(result.tokens * result.tokenPrice - result.value) < 1e-10);
  assert.equal(result.value.toFixed(2), '98.57');
  const all = estimateTokenAllocation(500_000_000, 70_000_000, 70_000_000, EXTENDED_SUPPLY, EXTENDED_COMMUNITY_TOKENS);
  assert.equal(all.tokens, 300_000_000);
  assert.equal(all.value, 150_000_000);
  assert.equal(all.poolShare, 100);
});

test('zero points is valid; invalid supply, allocation, pool and excessive points are rejected', () => {
  assert.equal(estimateTokenAllocation(500_000_000, 70_000_000, 0, EXTENDED_SUPPLY, EXTENDED_COMMUNITY_TOKENS).value, 0);
  for (const args of [[0,70,1,100,30], [500,0,1,100,30], [500,70,71,100,30], [500,70,-1,100,30], [500,70,1,0,30], [500,70,1,100,101], [500,70,1,100,-1], [Infinity,70,1,100,30]]) {
    assert.equal(estimateTokenAllocation(...args), null);
  }
});

test('Extended saved settings preserve custom and empty inputs without inheriting other project settings', () => {
  const custom = { pointsInput:'46', totalInput:'69235805', fdvInput:'725000000' };
  assert.deepEqual(parseExtendedSettings(JSON.stringify(custom)), custom);
  assert.deepEqual(parseExtendedSettings(JSON.stringify({pointsInput:'', totalInput:'', fdvInput:''})), {pointsInput:'', totalInput:'', fdvInput:''});
  for (const raw of [null,'{','[]','null']) assert.deepEqual(parseExtendedSettings(raw), EXTENDED_DEFAULTS);
  assert.deepEqual(parseExtendedSettings(JSON.stringify({pointsInput:46,totalInput:Infinity,fdvInput:'1'.repeat(101)})), EXTENDED_DEFAULTS);
});
