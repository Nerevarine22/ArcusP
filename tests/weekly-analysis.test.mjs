import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePointsWeeks, decimalAtoms, normalizeFill, pointsDistributionAt, pointsWeekIndex, summarizeFills } from '../lib/wallet-analytics.ts';

const address = '0x1111111111111111111111111111111111111111';
const make = (id, time, side, size = '1', price = '100', extra = {}) => normalizeFill({ tradeId: String(id), address, accountIndex: '0', marketId: '1', marketDisplayName: 'BTC-USD', side, role: 'TAKER', size, price, fee: '0', createdAt: String(Date.parse(time) * 1000), sequenceNumber: String(id), ...extra }, address, Number(extra.accountIndex ?? 0));
const analyze = (fills, to = '2026-10-15T12:00:00Z', from = null) => analyzePointsWeeks(fills, { complete: true, from: from ? Date.parse(from) : null, to: Date.parse(to) });
const bucket = (week, id) => week.buckets.find(value => value.id === id).volumeUsd;
const week = (report, index) => report.weeks.find(value => value.index === index);

test('aligns weeks with Wednesday 15:00 ET and handles the November DST change', () => {
  assert.equal(new Date(pointsDistributionAt(1)).toISOString(), '2026-10-07T19:00:00.000Z');
  assert.equal(new Date(pointsDistributionAt(5)).toISOString(), '2026-11-04T20:00:00.000Z');
  assert.equal(pointsWeekIndex(Date.parse('2026-10-07T18:59:59Z')), 1);
  assert.equal(pointsWeekIndex(Date.parse('2026-10-07T19:00:00Z')), 2);
  assert.equal(pointsWeekIndex(Date.parse('2026-11-04T19:30:00Z')), 5);
  assert.equal(pointsWeekIndex(Date.parse('2026-11-04T20:00:00Z')), 6);
});

test('duration bands are disjoint at exact 1h, 2h and 12h boundaries', () => {
  const fills = [];
  [0.5, 1, 2, 12].forEach((hours, index) => {
    const marketId = String(index + 1);
    fills.push(make(index * 2 + 1, '2026-10-08T00:00:00Z', 'BUY', '1', '100', { marketId }));
    fills.push(make(index * 2 + 2, new Date(Date.parse('2026-10-08T00:00:00Z') + hours * 3_600_000).toISOString(), 'SELL', '1', '100', { marketId }));
  });
  const selected = week(analyze(fills), 2);
  for (const id of ['under1h', 'oneTo2h', 'twoTo12h', 'over12h']) assert.equal(bucket(selected, id), '200');
  assert.equal(selected.volumeUsd, '800');
  assert.equal(selected.averageClosedHoldHours, 3.875);
});

test('FIFO splits partial closes and leaves remaining entry volume open', () => {
  const report = analyze([
    make(1, '2026-10-08T00:00:00Z', 'BUY', '2', '100'),
    make(2, '2026-10-08T01:00:00Z', 'BUY', '1', '110'),
    make(3, '2026-10-08T02:00:00Z', 'SELL', '1.5', '120'),
    make(4, '2026-10-08T15:00:00Z', 'SELL', '1', '130'),
  ], '2026-10-09T00:00:00Z');
  const selected = week(report, 2);
  assert.equal(selected.volumeUsd, '620');
  assert.equal(bucket(selected, 'twoTo12h'), '330');
  assert.equal(bucket(selected, 'over12h'), '235');
  assert.equal(bucket(selected, 'openOver12h'), '55');
  assert.equal(selected.heldAtLeast12hUsd, '290');
});

test('a direction flip closes the old position and opens a new opposite lot', () => {
  const selected = week(analyze([
    make(1, '2026-10-08T00:00:00Z', 'BUY', '2', '100'),
    make(2, '2026-10-08T01:00:00Z', 'SELL', '3', '110'),
    make(3, '2026-10-08T04:00:00Z', 'BUY', '1', '100'),
  ]), 2);
  assert.equal(selected.volumeUsd, '630');
  assert.equal(bucket(selected, 'oneTo2h'), '420');
  assert.equal(bucket(selected, 'twoTo12h'), '210');
  assert.equal(bucket(selected, 'openUnder12h'), '0');
});

test('cross-week closes keep entry volume open at its original weekly cutoff', () => {
  const report = analyze([
    make(1, '2026-10-07T06:00:00Z', 'BUY'),
    make(2, '2026-10-08T08:00:00Z', 'SELL', '1', '120'),
  ]);
  assert.equal(bucket(week(report, 1), 'openOver12h'), '100');
  assert.equal(bucket(week(report, 1), 'over12h'), '0');
  assert.equal(bucket(week(report, 2), 'over12h'), '120');
  const recentEntry = analyze([make(1, '2026-10-07T18:00:00Z', 'BUY'), make(2, '2026-10-08T03:00:00Z', 'SELL')]);
  assert.equal(bucket(week(recentEntry, 1), 'openUnder12h'), '100');
  assert.equal(bucket(week(recentEntry, 2), 'twoTo12h'), '100');
});

test('prior-period entries still determine duration for exits inside the selected slice', () => {
  const report = analyze([make(1, '2026-10-07T06:00:00Z', 'BUY'), make(2, '2026-10-08T08:00:00Z', 'SELL', '1', '120')], '2026-10-09T00:00:00Z', '2026-10-08T00:00:00Z');
  assert.equal(report.weeks.length, 1);
  assert.equal(week(report, 2).volumeUsd, '120');
  assert.equal(bucket(week(report, 2), 'over12h'), '120');
  assert.equal(week(report, 2).partialPeriod, true);
});

test('markets and subaccounts never close each other even with identical display names', () => {
  const report = analyze([
    make(1, '2026-10-08T00:00:00Z', 'BUY'),
    make(2, '2026-10-08T01:00:00Z', 'SELL', '1', '100', { marketId: '2' }),
    make(3, '2026-10-08T01:00:00Z', 'SELL', '1', '100', { accountIndex: '1' }),
  ], '2026-10-08T02:00:00Z');
  assert.equal(bucket(week(report, 2), 'openUnder12h'), '300');
  assert.equal(week(report, 2).averageClosedHoldHours, null);
});

test('missing earlier position history is marked unknown instead of fabricating an opening', () => {
  const report = analyze([
    make(1, '2026-10-08T00:00:00Z', 'SELL', '1', '100', { positionEffect: 'CLOSE_LONG' }),
    make(2, '2026-10-08T01:00:00Z', 'SELL', '1', '100', { positionEffect: 'ADD_SHORT' }),
    make(3, '2026-10-09T12:00:00Z', 'BUY', '1', '100', { positionEffect: 'OPEN_LONG' }),
  ], '2026-10-09T13:00:00Z');
  assert.equal(bucket(week(report, 2), 'unknown'), '200');
  assert.equal(bucket(week(report, 2), 'openUnder12h'), '100');
});

test('one-nanodollar rounding remainders are conserved across partial closes', () => {
  const fills = [
    make(1, '2026-10-08T00:00:00Z', 'BUY', '0.000000003', '0.333333333'),
    make(2, '2026-10-08T01:00:00Z', 'SELL', '0.000000001', '0.333333333'),
    make(3, '2026-10-08T13:00:00Z', 'SELL', '0.000000002', '0.333333333'),
  ];
  const selected = week(analyze(fills), 2);
  assert.equal(selected.volumeUsd, summarizeFills(fills).volumeUsd);
  assert.equal(selected.buckets.reduce((sum, value) => sum + decimalAtoms(value.volumeUsd), BigInt(0)), decimalAtoms(selected.volumeUsd));
});

test('zero-volume weeks stay visible; partial scans and disabled analysis make no holding claims', () => {
  assert.deepEqual(analyze([]).weeks.map(value => value.index), [1, 2, 3]);
  assert.equal(analyze([]).weeks[2].status, 'in_progress');
  assert.equal(analyzePointsWeeks([], { complete: false, from: null, to: Date.parse('2026-10-15T12:00:00Z') }).status, 'incomplete');
  assert.equal(analyzePointsWeeks([], { complete: true, enabled: false, from: null, to: Date.parse('2026-10-15T12:00:00Z') }).status, 'disabled');
});

test('mixed lots reconcile every weekly volume and fee total with the fill summary', () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647);
  const fills = Array.from({ length: 200 }, (_, index) => make(index + 1,
    new Date(Date.parse('2026-10-02T00:00:00Z') + index * 3600_000).toISOString(), random() % 2 ? 'BUY' : 'SELL', String((random() % 10 + 1) / 10), '123.456789', { marketId: String(random() % 3), accountIndex: String(random() % 2), fee: index % 3 ? '0.0001' : '-0.00001' }));
  const report = analyze(fills); const summary = summarizeFills(fills);
  assert.equal(report.weeks.reduce((sum, value) => sum + decimalAtoms(value.volumeUsd), BigInt(0)), decimalAtoms(summary.volumeUsd));
  assert.equal(report.weeks.reduce((sum, value) => sum + decimalAtoms(value.netFeesUsd), BigInt(0)), decimalAtoms(summary.netFeesUsd));
});
