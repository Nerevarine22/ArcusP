import test from 'node:test';
import assert from 'node:assert/strict';
import { atomsUsd, collectFills, decimalAtoms, normalizeFill, normalizeStats, parseArcusJson, summarizeFills, summarizeScan } from '../lib/wallet-analytics.ts';

const address = '0x1111111111111111111111111111111111111111';
const timestamp = 1791970065102405;
const fill = (tradeId, createdAt = timestamp, extra = {}) => ({ tradeId, accountIndex: '0', address, marketDisplayName: 'BTC-USD', side: 'BUY', role: 'TAKER', size: '0.001', price: '50000.123456789', fee: '0.010000001', createdAt: String(createdAt), ...extra });

test('parses quote int64 without precision loss and converts 1e9 quantums to USD', () => {
  const response = parseArcusJson('{"address":"' + address + '","lifetimeVolume":900719925474099312345,"lifetimeFeesPaid":10587956642,"tradingFeeTier":{"level":0,"makerFeePpm":0,"takerFeePpm":225}}');
  const stats = normalizeStats(response, address);
  assert.equal(stats.lifetime.volumeUsd, '900719925474.099312345');
  assert.equal(stats.lifetime.feesPaidUsd, '10.587956642');
  assert.equal(stats.takerFeeBps, 2.25);
  assert.equal(stats.makerFeeBps, 0);
});

test('calculates size × price using executed size and exact decimal arithmetic', () => {
  const normalized = normalizeFill(fill('1', timestamp, { originalSize: '9999' }), address, 0);
  assert.equal(normalized.notionalUsd, '50.000123457');
  assert.equal(normalized.feeUsd, '0.010000001');
  assert.equal(normalized.createdAt, new Date(Math.floor(timestamp / 1000)).toISOString());
  assert.equal(atomsUsd(decimalAtoms('-0.000000001')), '-0.000000001');
});

test('separates fees paid, rebates, net fees and maker/taker volume', () => {
  const summary = summarizeFills([
    normalizeFill(fill('1', timestamp, { size: '2', price: '100', fee: '0.3' }), address, 0),
    normalizeFill(fill('2', timestamp - 1, { size: '1', price: '100', role: 'MAKER', fee: '-0.1' }), address, 0),
  ]);
  assert.deepEqual(summary, { fillCount: 2, volumeUsd: '300', feesPaidUsd: '0.3', rebatesUsd: '0.1', netFeesUsd: '0.2', makerVolumeUsd: '100', takerVolumeUsd: '200' });
  assert.equal(summarizeFills([]).volumeUsd, '0');
});

test('paginates inclusive timestamp bounds and deduplicates the boundary fill', async () => {
  const cursors = [];
  const pages = [
    { fills: [fill('3', timestamp), fill('2', timestamp - 1)], total: '2' },
    { fills: [fill('2', timestamp - 1), fill('1', timestamp - 2)], total: '2' },
    { fills: [fill('1', timestamp - 2)], total: '1' },
  ];
  const scan = await collectFills(async to => { cursors.push(to); return pages.shift(); }, { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 2, maxPages: 10 });
  assert.equal(scan.complete, true);
  assert.equal(scan.pages, 3);
  assert.deepEqual(scan.fills.map(item => item.tradeId), ['3', '2', '1']);
  assert.deepEqual(cursors, [timestamp + 1000, timestamp - 1, timestamp - 2]);
});

test('does not claim completeness when pagination stalls or the page cap is hit', async () => {
  const sameTime = { fills: [fill('1'), fill('2')] };
  const stalled = await collectFills(async () => sameTime, { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 2, maxPages: 10 });
  assert.equal(stalled.complete, false);
  assert.equal(stalled.fills.length, 2);
  const capped = await collectFills(async () => sameTime, { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 2, maxPages: 1 });
  assert.equal(capped.complete, false);
});

test('rejects mixed wallets, subaccounts and fills outside the chosen period', async () => {
  assert.throws(() => normalizeFill(fill('1', timestamp, { address: '0x2222222222222222222222222222222222222222' }), address, 0), /different address/);
  assert.throws(() => normalizeFill(fill('1', timestamp, { accountIndex: '1' }), address, 0), /different subaccount/);
  const invalid = await collectFills(async () => ({ fills: [fill('1')] }), { address, subaccount: 0, from: timestamp + 1, to: timestamp + 1000, limit: 1000, maxPages: 1 });
  assert.equal(invalid.complete, false);
  assert.match(invalid.reason, /outside/);
  assert.equal(invalid.fills.length, 0);
  assert.throws(() => normalizeStats({ address, lifetimeVolume: '0' }, address), /Missing/);
});

test('keeps validated earlier pages after an upstream failure and exposes the reason', async () => {
  let calls = 0;
  const scan = await collectFills(async () => {
    if (++calls === 2) throw new Error('Arcus /v1/fills returned HTTP 503.');
    return { fills: [fill('2', timestamp), fill('1', timestamp - 1)] };
  }, { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 2, maxPages: 10 });
  assert.equal(scan.complete, false);
  assert.equal(scan.failed, true);
  assert.equal(scan.pages, 2);
  assert.deepEqual(scan.fills.map(row => row.tradeId), ['2', '1']);
  assert.match(scan.reason, /HTTP 503/);
  assert.equal(summarizeScan(scan.fills, scan.complete).fillCount, 2);
});

test('distinguishes unavailable history from a successful empty wallet in API summaries', async () => {
  const options = { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 1000, maxPages: 10 };
  const failed = await collectFills(async () => { throw new Error('Arcus rate limit reached.'); }, options);
  assert.equal(summarizeScan(failed.fills, failed.complete), null);
  assert.equal(failed.pages, 1);
  assert.match(failed.reason, /rate limit/);
  const empty = await collectFills(async () => ({ fills: [] }), options);
  assert.equal(empty.complete, true);
  assert.equal(summarizeScan(empty.fills, empty.complete).volumeUsd, '0');
  // Reading earlier fills must not imply a verified zero for a later failed period.
  assert.equal(summarizeScan([], false), null);
});

test('discards an invalid page without losing validated preceding pages', async () => {
  let calls = 0;
  const scan = await collectFills(async () => ++calls === 1
    ? { fills: [fill('3', timestamp), fill('2', timestamp - 1)] }
    : { fills: [fill('1', timestamp - 2), fill('bad', timestamp - 3, { address: '0x2222222222222222222222222222222222222222' })] },
  { address, subaccount: 0, from: null, to: timestamp + 1000, limit: 2, maxPages: 10 });
  assert.deepEqual(scan.fills.map(row => row.tradeId), ['3', '2']);
  assert.equal(scan.complete, false);
  assert.match(scan.reason, /different address/);
});
