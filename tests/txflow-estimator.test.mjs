import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../lib/estimator.ts';
import { TXFLOW_FDV_PRESETS, TXFLOW_ALLOCATION_PRESETS, TXFLOW_POOL_PRESETS, TXFLOW_DEFAULTS, parseTxflowSettings } from '../lib/txflow-estimator.ts';

test('TxFlow Basic and Bullish simulate all 24 one-point scenarios with final rounding', () => {
  // The image uses approximate totals. Exact division rounds Basic $1B/20% to
  // $4.39 and Bullish $1B/25% to $4.80, rather than the image's $4.38/$4.79.
  const expected = {
    basic: [[0.82,1.10,1.37],[1.64,2.19,2.74],[2.47,3.29,4.11],[3.29,4.39,5.48]],
    bullish: [[0.72,0.96,1.20],[1.44,1.92,2.40],[2.16,2.88,3.60],[2.88,3.84,4.80]],
  };
  for (const [mode, pool] of Object.entries(TXFLOW_POOL_PRESETS)) {
    TXFLOW_FDV_PRESETS.forEach((fdv, row) => TXFLOW_ALLOCATION_PRESETS.forEach((allocation, column) => {
      assert.equal(Number(estimate(fdv, allocation, pool, 1).value.toFixed(2)), expected[mode][row][column]);
    }));
  }
  assert.equal(Number(estimate(250_000_000, 15, TXFLOW_POOL_PRESETS.basic, 1000).value.toFixed(2)), 822.37);
});

test('pool mode preserves the manual value through preset selections and restores it', () => {
  const saved = { ...TXFLOW_DEFAULTS, poolMode: 'manual', totalInput: '12345678', pointsInput: '123', fdv: 750_000_000, allocation: 25, perPoint: false };
  for (const poolMode of ['basic','bullish','manual']) {
    assert.deepEqual(parseTxflowSettings(JSON.stringify({ ...saved, poolMode })), { ...saved, poolMode });
  }
});

test('earlier manual calculations migrate without losing points or custom total', () => {
  const migrated = parseTxflowSettings(JSON.stringify({ pointsInput: '100', totalInput: '1000000', fdv: 500_000_000, allocation: 10, perPoint: false }));
  assert.equal(migrated.poolMode, 'manual');
  assert.equal(migrated.totalInput, '1000000');
  assert.equal(migrated.pointsInput, '100');
  assert.equal(migrated.fdv, 500_000_000);
  assert.equal(migrated.allocation, 15);
  assert.equal(migrated.perPoint, false);
  assert.equal(parseTxflowSettings('{"totalInput":""}').poolMode, 'basic');
});

test('invalid stored settings use TxFlow defaults and stay within the new ranges', () => {
  for (const raw of [null,'bad JSON','[]','null']) assert.deepEqual(parseTxflowSettings(raw), TXFLOW_DEFAULTS);
  assert.deepEqual(parseTxflowSettings(JSON.stringify({ fdv: 3_000_000_000, allocation: 10, pointsInput: 123, totalInput: -1, perPoint: 'yes', poolMode: 'unknown' })), TXFLOW_DEFAULTS);
});
