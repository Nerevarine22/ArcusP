import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JUMPER_ESTIMATE_DEFAULTS, JUMPER_FDV_PRESETS, JUMPER_ALLOCATION_PRESETS, jumperEligibility, parseJumperEstimateSettings } from '../lib/jumper-estimator.ts';
import { estimateTokenAllocation } from '../lib/estimator.ts';
import { parseJumperPremarket } from '../lib/jumper-premarket.ts';

test('Jumper matrix uses the requested pool, FDVs and allocations without rounding intermediate values', () => {
  assert.deepEqual(JUMPER_FDV_PRESETS, [75e6,150e6,250e6,500e6]);
  assert.deepEqual(JUMPER_ALLOCATION_PRESETS, [5,10,20,33.33]);
  assert.equal(JUMPER_ESTIMATE_DEFAULTS.totalInput, '250000000');
  const result = estimateTokenAllocation(75e6,250e6,1000,1e9,1e8);
  assert.equal(result.tokens, 400);
  assert.equal(result.value, 30);
  assert.equal(result.valuePerPoint, 0.03);
  assert.equal(estimateTokenAllocation(500e6,250e6,1000,1e9,333300000).value,666.6);
});

test('eligibility is inclusive, excludes lower wallets and scales XP rather than wallet count', () => {
  const bins = [[1000,1],[100,2],[25,4],[10,10]];
  assert.deepEqual(jumperEligibility(bins,0), {wallets:17,walletShare:1,xpShare:1});
  assert.deepEqual(jumperEligibility(bins,100), {wallets:3,walletShare:3/17,xpShare:1200/1400});
  assert.equal(jumperEligibility(bins,25).wallets,7);
  assert.equal(jumperEligibility(bins,1001).xpShare,0);
  const snapshot = JSON.parse(readFileSync(new URL('../data/jumper/xp-distribution-2026-10-06.json',import.meta.url)));
  assert.equal(jumperEligibility(snapshot.histogram,0).wallets,snapshot.wallets);
  assert.equal(jumperEligibility(snapshot.histogram,0).xpShare,1);
  for(const cutoff of [25,100,500]) {
    const value = jumperEligibility(snapshot.histogram,cutoff);
    assert.ok(value.xpShare > 0 && value.xpShare < 1);
    assert.ok(value.xpShare > value.walletShare);
  }
});

test('saved calculator inputs preserve manual values and reject invalid cutoff settings', () => {
  const value = {...JUMPER_ESTIMATE_DEFAULTS,pointsInput:'55',minimumXp:100};
  assert.deepEqual(parseJumperEstimateSettings(JSON.stringify(value)),value);
  for(const minimumXp of [-1,NaN,'100',1.5,1000001]) assert.equal(parseJumperEstimateSettings(JSON.stringify({minimumXp})).minimumXp,0);
  assert.deepEqual(parseJumperEstimateSettings('invalid'),JUMPER_ESTIMATE_DEFAULTS);
});

const word = value => BigInt(value).toString(16).padStart(64,'0');
test('Aspecta V3 quote converts BuildKey to future-token price using the settlement adjustment', () => {
  const sqrt = '0x'+word(1e17);
  const quote = parseJumperPremarket(sqrt,'0x'+word(10000)+word(1e17)+word(1e17));
  assert.ok(Math.abs(quote.price - 0.1) < 1e-12);
  assert.ok(Math.abs(quote.fdv - 100e6) < 1e-6);
  const adjusted = parseJumperPremarket(sqrt,'0x'+word(5000)+word(1e17)+word(1e17));
  assert.ok(Math.abs(adjusted.price - 0.2) < 1e-12);
  for(const values of [[null,null],['0x0','0x0'],[sqrt,'0x'+word(0)+word(1e17)+word(1e17)],['0x'+word(0),'0x'+word(10000)+word(1e17)+word(1e17)],[sqrt,'0x'+word(10000)+word(0)+word(1e17)]]) assert.equal(parseJumperPremarket(...values),null);
});
