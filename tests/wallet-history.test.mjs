import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePointsWeeks, collectFills, decimalAtoms, fillsForWeek, marketBreakdown, normalizeFill, pointsDistributionAt, summarizeFills, verifyEmptyPointsWeeks } from '../lib/wallet-analytics.ts';

const address = '0x1111111111111111111111111111111111111111';
const asOf = Date.parse('2026-10-23T10:00:00Z');
const raw = (id, time, price, side = 'BUY', subaccount = 0) => ({
  address, accountIndex: String(subaccount), tradeId: String(id), marketId: '1', marketDisplayName: 'BTC-USD',
  createdAt: String(Date.parse(time) * 1000), size: '1', price: String(price), fee: '0.1', side, role: 'TAKER',
});
const normalize = row => normalizeFill(row, address, Number(row.accountIndex));
const executions = [
  raw(1, '2026-10-06T00:00:00Z', 100), raw(2, '2026-10-06T03:00:00Z', 120, 'SELL'),
  raw(3, '2026-10-10T00:00:00Z', 250), raw(4, '2026-10-10T13:00:00Z', 260, 'SELL'),
  raw(5, '2026-10-16T00:00:00Z', 300), raw(6, '2026-10-17T01:00:00Z', 330, 'SELL'),
  raw(7, '2026-10-22T00:00:00Z', 400),
];
const options = (extra = {}) => ({ address, subaccounts: [0], from: null, to: asOf, limit: 1000, maxPages: 20, ...extra });
const reader = (rows, calls) => async query => {
  calls.push(query);
  return { fills: rows.filter(row => Number(row.accountIndex) === query.subaccount && Number(row.createdAt) >= query.from && Number(row.createdAt) <= query.to)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) };
};

test('recovers weeks 2–4 when an apparently complete short history contains only week 1', async () => {
  const initial = await collectFills(async () => ({ fills: executions.slice(0, 2) }),
    { address, subaccount: 0, from: null, to: asOf * 1000, limit: 1000, maxPages: 10 });
  assert.equal(initial.complete, true);
  const calls = [];
  const verified = await verifyEmptyPointsWeeks(initial.fills, reader(executions, calls), options());
  assert.equal(verified.complete, true);
  assert.deepEqual(verified.verifiedWeeks, [2, 3, 4]);
  assert.equal(verified.pages, 3);
  assert.equal(verified.fills.length, 7);
  assert.equal(initial.fills.length, 2, 'verification does not mutate the original response');
  const weekly = analyzePointsWeeks(verified.fills, { complete: verified.complete, from: null, to: asOf });
  assert.deepEqual(weekly.weeks.map(week => week.volumeUsd), ['220', '510', '630', '400']);
  assert.deepEqual(weekly.weeks.map(week => week.fillCount), [2, 2, 2, 1]);
  assert.deepEqual(weekly.weeks.map(week => week.netFeesUsd), ['0.2', '0.2', '0.2', '0.1']);
  assert.equal(weekly.weeks[1].heldAtLeast12hUsd, '510');
  assert.equal(weekly.weeks[2].averageClosedHoldHours, 25);
  for (const week of weekly.weeks) {
    const markets = marketBreakdown(fillsForWeek(verified.fills, week));
    assert.equal(markets[0].volumeUsd, week.volumeUsd);
    assert.equal(week.buckets.reduce((sum, bucket) => sum + decimalAtoms(bucket.volumeUsd), 0n), decimalAtoms(week.volumeUsd));
  }
  assert.equal(summarizeFills(verified.fills).volumeUsd, '1760');
});

test('checks explicit half-open weekly windows without moving a boundary execution to the prior week', async () => {
  const boundary = raw(8, '2026-10-14T19:00:00Z', 500);
  const calls = [];
  const verified = await verifyEmptyPointsWeeks(executions.slice(0, 2).map(normalize), reader([boundary], calls), options());
  assert.equal(calls[0].from, pointsDistributionAt(1) * 1000);
  assert.equal(calls[0].to, pointsDistributionAt(2) * 1000 - 1);
  assert.equal(calls[1].from, pointsDistributionAt(2) * 1000);
  assert.equal(calls[2].to, asOf * 1000);
  const weekly = analyzePointsWeeks(verified.fills, { complete: true, from: null, to: asOf });
  assert.equal(weekly.weeks[1].fillCount, 0);
  assert.equal(weekly.weeks[2].volumeUsd, '500');
});

test('does not refetch populated weeks or invent activity for a confirmed empty week', async () => {
  const calls = [];
  const initial = executions.slice(0, 6).map(normalize);
  const verified = await verifyEmptyPointsWeeks(initial, reader([], calls), options());
  assert.equal(calls.length, 1);
  assert.deepEqual(verified.verifiedWeeks, [4]);
  assert.deepEqual(verified.fills, initial);
  assert.equal(verified.complete, true);
});

test('keeps already read fills but never confirms zero after a failed weekly check', async () => {
  let calls = 0;
  const verified = await verifyEmptyPointsWeeks(executions.slice(0, 2).map(normalize), async () => {
    if (++calls === 1) return { fills: executions.slice(2, 4) };
    throw new Error('Arcus /v1/fills returned HTTP 503.');
  }, options());
  assert.equal(verified.complete, false);
  assert.equal(verified.fills.length, 4);
  assert.deepEqual(verified.verifiedWeeks, [2]);
  assert.match(verified.warnings[0], /Week 3.*HTTP 503/);
  const weekly = analyzePointsWeeks(verified.fills, { complete: verified.complete, from: null, to: asOf });
  assert.equal(weekly.status, 'incomplete');
  assert.equal(weekly.weeks.length, 0);
});

test('honors the shared page/time budget without making further upstream requests', async () => {
  for (const budget of [{ maxPages: 0 }, { shouldStop: () => true }]) {
    const verified = await verifyEmptyPointsWeeks(executions.slice(0, 2).map(normalize), async () => {
      assert.fail('the scan must stop before another request');
    }, options(budget));
    assert.equal(verified.complete, false);
    assert.equal(verified.pages, 0);
    assert.equal(verified.fills.length, 2);
    assert.match(verified.warnings[0], /Week 2.*scan limit/);
  }
});

test('retains equal trade identifiers belonging to different active subaccounts', async () => {
  const initial = [executions[0], { ...executions[0], accountIndex: '1' }].map(normalize);
  const additional = [executions[2], { ...executions[2], accountIndex: '1' }];
  const calls = [];
  const verified = await verifyEmptyPointsWeeks(initial, reader(additional, calls), options({ subaccounts: [0, 1, 2] }));
  assert.equal(verified.fills.length, 4);
  assert.equal(calls.length, 6, 'globally empty subaccount 2 was already read by the initial scan');
  assert.equal(summarizeFills(verified.fills).volumeUsd, '700');
});

test('limits verification to the selected slice while retaining earlier fills for holding reconstruction', async () => {
  const calls = [];
  const from = Date.parse('2026-10-10T12:00:00Z'), to = Date.parse('2026-10-11T00:00:00Z');
  const initial = executions.slice(0, 2).map(normalize);
  const verified = await verifyEmptyPointsWeeks(initial, reader(executions, calls), options({ from, to }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, from * 1000);
  assert.equal(calls[0].to, to * 1000);
  assert.equal(verified.fills.length, 3);
  const weekly = analyzePointsWeeks(verified.fills, { complete: true, from, to });
  assert.equal(weekly.weeks.length, 1);
  assert.equal(weekly.weeks[0].volumeUsd, '260');
  assert.equal(weekly.weeks[0].partialPeriod, true);
});
