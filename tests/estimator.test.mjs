import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate, parsePoints, FDV_PRESETS, ALLOCATION_PRESETS, ASSUMED_TOTAL_POINTS } from '../lib/estimator.ts';

test('all 25 one-point values match the 11M scenarios from 10% to 30% allocation', () => {
  const expected = [[4.55,6.82,9.09,11.36,13.64],[9.09,13.64,18.18,22.73,27.27],[13.64,20.45,27.27,34.09,40.91],[18.18,27.27,36.36,45.45,54.55],[27.27,40.91,54.55,68.18,81.82]];
  FDV_PRESETS.forEach((fdv, row) => ALLOCATION_PRESETS.forEach((allocation, col) => {
    const result = estimate(fdv, allocation, ASSUMED_TOTAL_POINTS, 1);
    assert.equal(Number(result.value.toFixed(2)), expected[row][col]);
  }));
});

test('Witty Phoenix estimate uses full precision before rounding', () => {
  const result = estimate(500_000_000, 10, 11_000_000, 2.98);
  assert.equal(Number(result.value.toFixed(2)), 13.55);
  assert.equal(result.poolValue, 50_000_000);
});

test('manual pool changes scale payout and full pool returns pool value', () => {
  assert.equal(estimate(1_000_000_000, 10, 250_000, 250_000).value, 100_000_000);
  assert.equal(estimate(500_000_000, 10, 250_000, 2.98).value, 596);
  assert.equal(estimate(500_000_000, 10, 11_000_000, 0).value, 0);
});

test('invalid inputs never produce a payout; zero points and decimal comma work', () => {
  for (const invalid of [0,-1,NaN,Infinity]) assert.equal(estimate(500_000_000, 10, invalid, 1), null);
  assert.equal(estimate(500_000_000, 101, 11_000_000, 1), null);
  assert.equal(estimate(500_000_000, 10, 100, 101), null);
  assert.equal(parsePoints('2,98'), 2.98);
  assert.equal(parsePoints('0'), 0);
  for (const invalid of ['', ' ', '-1', 'Infinity', 'abc']) assert.equal(parsePoints(invalid), null);
});
