import test from 'node:test';
import assert from 'node:assert/strict';
import { getPointsComparison, readLeaderboard, readPreviousLeaderboard } from '../lib/leaderboard.ts';

const entry = (points, name = 'Test User') => ({ rank: 1, name, tier: 'Silver', points });
const snapshot = (points) => ({ season: 'Season 1', points_visible: true, total: 1, updated_at: '2026-10-09T11:13:42Z', entries: [entry(points)], by_name: { 'test user': 0 } });

test('compares the 22 October Witty Phoenix entry with the 15 October snapshot', async () => {
  const [current, previous] = await Promise.all([readLeaderboard(), readPreviousLeaderboard()]);
  const result = getPointsComparison(previous, current.entries[current.by_name['witty phoenix']]);
  assert.equal(current.entries[current.by_name['witty phoenix']].points, 33.91);
  assert.equal(result.previous_points, 15.76);
  assert.equal(Number(result.change_percent.toFixed(2)), 115.16);
});

test('reports growth, decline, unchanged points, and loss to zero', () => {
  assert.equal(getPointsComparison(snapshot(10), entry(20)).change_percent, 100);
  assert.equal(getPointsComparison(snapshot(10), entry(7.5)).change_percent, -25);
  assert.equal(getPointsComparison(snapshot(2.98), entry(2.98)).change_percent, 0);
  assert.equal(getPointsComparison(snapshot(10), entry(0)).change_percent, -100);
});

test('distinguishes a new participant from zero previous points', () => {
  assert.deepEqual(getPointsComparison(snapshot(10), entry(5, 'New User')), { status: 'new', previous_points: null, change_percent: null });
  assert.deepEqual(getPointsComparison(snapshot(0), entry(5)), { status: 'compared', previous_points: 0, change_percent: null });
  assert.equal(getPointsComparison(snapshot(0), entry(0)).change_percent, 0);
});

test('normalizes names and does not expose hidden or missing points', () => {
  assert.equal(getPointsComparison(snapshot(10), entry(20, '  TEST   USER ')).change_percent, 100);
  assert.equal(getPointsComparison({ ...snapshot(10), points_visible: false }, entry(20)), null);
  assert.equal(getPointsComparison(snapshot(null), entry(20)), null);
  assert.equal(getPointsComparison(snapshot(10), entry(null)), null);
});
