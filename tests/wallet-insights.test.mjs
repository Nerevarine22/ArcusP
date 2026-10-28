import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeeklyPoints, readWeeklyPoints } from '../lib/leaderboard.ts';
import { fillsForWeek, marketBreakdown, normalizeFill, weeklyEfficiency, percentChange } from '../lib/wallet-analytics.ts';

const snapshot = (points, visible = true, present = true) => ({ season: 'Season 1', points_visible: visible, total: present ? 1 : 0,
  updated_at: '2026-10-22T09:00:00Z', entries: present ? [{ rank: 1, name: 'Test User', tier: 'Gold', points }] : [], by_name: present ? { 'test user': 0 } : {} });
const history = values => values.map((value, index) => ({ week: index + 1, distributed_at: `2026-10-${String(7 + index * 7).padStart(2, '0')}T19:00:00Z`, snapshot: value }));
const week = { index: 3, end: '2026-10-21T19:00:00Z', start: '2026-10-14T19:00:00Z', cutoff: '2026-10-21T19:00:00Z',
  status: 'completed', partialPeriod: false, volumeUsd: '50000', netFeesUsd: '10' };
const points = { week: 3, distributed_at: week.end, status: 'recorded', earned_points: 5 };

test('saved distributions give separate weekly gains that sum to the cumulative total', async () => {
  const points = await readWeeklyPoints('  WITTY   PHOENIX ');
  assert.deepEqual(points.map(row => row.earned_points), [2.98, 12.78, 18.15, 18.09]);
  assert.equal(points.reduce((sum, row) => sum + Math.round(row.earned_points * 100), 0), 5200);
  assert.equal(points[3].distributed_at, '2026-10-28T19:00:00Z');
  assert.notEqual(points[3].downloaded_at, points[3].distributed_at);
});

test('missing or hidden history never becomes zero or a multiweek gain', () => {
  for (const missing of [null, snapshot(null, false), snapshot(null, true, false)]) {
    const rows = getWeeklyPoints(history([snapshot(1), missing, snapshot(9)]), 'Test User');
    assert.equal(rows[1].earned_points, null);
    assert.equal(rows[2].earned_points, null);
    assert.equal(rows[2].cumulative_points, 9);
    assert.equal(rows[2].status, 'baseline_missing');
  }
  const adjustment = getWeeklyPoints(history([snapshot(2.98), snapshot(2.48)]), 'Test User');
  assert.equal(adjustment[1].earned_points, -0.5);
  assert.equal(adjustment[1].status, 'adjusted');
});

test('weekly efficiency uses matching complete periods and disables misleading comparisons', () => {
  assert.deepEqual(weeklyEfficiency(week, points, true), { comparable: true, volumePerPoint: 10000, feesPerPoint: 2, pointsPer10k: 1 });
  for (const [period, reward, all] of [
    [{ ...week, partialPeriod: true }, points, true], [{ ...week, status: 'in_progress' }, points, true],
    [week, points, false], [week, undefined, true], [week, { ...points, earned_points: 0 }, true],
    [week, { ...points, earned_points: -1, status: 'adjusted' }, true], [week, { ...points, week: 2 }, true],
    [week, { ...points, distributed_at: '2026-10-14T19:00:00Z' }, true],
  ]) assert.equal(weeklyEfficiency(period, reward, all).comparable, false);
  assert.equal(percentChange(20, 10), 100);
  assert.equal(percentChange(5, 10), -50);
  assert.equal(percentChange(5, 0), null);
});

test('market breakdown reconciles exact notional and net fees across subaccounts and week edges', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const make = (id, time, marketId, market, subaccount = 0, role = 'TAKER', fee = '0.1') => normalizeFill({
    tradeId: String(id), createdAt: String(Date.parse(time) * 1000), marketId, marketDisplayName: market,
    side: 'BUY', role, size: '1', price: '100.123456789', fee,
  }, address, subaccount);
  const fills = [make(1, week.start, 'btc', 'BTC-USD', 0, 'MAKER'), make(2, week.start, 'btc', 'BTC-USD', 1, 'TAKER', '-0.01'),
    make(3, '2026-10-16T00:00:00Z', 'eth', 'ETH-USD'), make(4, week.end, 'btc', 'BTC-USD')];
  const selected = fillsForWeek(fills, week);
  assert.equal(selected.length, 3);
  const markets = marketBreakdown(selected);
  assert.equal(markets[0].volumeUsd, '200.246913578');
  assert.equal(markets[0].netFeesUsd, '0.09');
  assert.equal(markets[0].fillCount, 2);
  assert.equal(markets[0].makerPercent, 50);
  assert.equal(markets[1].volumeUsd, '100.123456789');
  assert.equal(markets.reduce((sum, market) => sum + market.fillCount, 0), 3);
});
