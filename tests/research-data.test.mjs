import test from 'node:test';
import assert from 'node:assert/strict';
import { arcusResearch, txflowResearch, researchInput, mergeResearchWallet } from '../lib/research-data.ts';
import { researchCsv } from '../lib/research-export.ts';
import { normalizeFill, summarizeFills, analyzePointsWeeks } from '../lib/wallet-analytics.ts';
import { TXFLOW_EPOCHS, buildTxEpochReports, summarizeTxFills, normalizeTxFill, txflowSelectionWindows } from '../lib/txflow-wallet.ts';

const address = '0x1111111111111111111111111111111111111111';
const fetchedAt = '2026-10-28T12:00:00.000Z';
function arcusReport() {
  const fill = (id, time, side, role, fee) => normalizeFill({ tradeId: String(id), address, accountIndex: '0', marketDisplayName: 'BTC-USD', side, role,
    size: '1', price: '100.123456789', fee, createdAt: String(Date.parse(time) * 1000) }, address, 0);
  const fills = [fill(1, '2026-10-08T00:00:00Z', 'BUY', 'MAKER', '-0.123456789'), fill(2, '2026-10-09T00:00:00Z', 'SELL', 'TAKER', '0.1')];
  return { address, fetchedAt, accountScope: 'all', range: { from: null, to: fetchedAt }, scan: { complete: true, pages: 1, subaccounts: [0], warnings: [] }, stats: null,
    summary: summarizeFills(fills), fills, weekly: analyzePointsWeeks(fills, { from: null, to: Date.parse(fetchedAt), complete: true }) };
}
const arcusPoints = [{ week: 2, distributed_at: '2026-10-14T19:00:00Z', earned_points: 10, status: 'recorded' }];
function txReport() {
  const fill = (id, time, side, startPosition) => normalizeTxFill({ instrumentId: '1', tid: String(id), oid: String(id), symbol: 'BTC-USDC', instrumentType: 'perps', marginMode: 'Cross',
    tradeSide: 'Maker', side, sz: '1', px: '100', fee: '0.01', feeToken: 'USDC', closedPnl: '2', time: Date.parse(time), startPosition });
  const fills = [fill(1, '2026-10-13T00:00:00Z', 'B', '0'), fill(2, '2026-10-14T00:00:00Z', 'A', '1'), fill(3, '2026-10-21T00:00:00Z', 'B', '0'), fill(4, '2026-10-23T00:00:00Z', 'A', '1')];
  const epochs = buildTxEpochReports(fills, [], ['S0', 'EPOCH_1', 'EPOCH_2'], Date.parse(fetchedAt), { fillsStatus: 'complete', fundingStatus: 'complete', historyStatus: 'complete', historyPages: 1 });
  return { address, fetchedAt, period: 'AWARDED', range: { from: null, to: TXFLOW_EPOCHS.EPOCH_2.end, endExclusive: true },
    fillsScan: { status: 'complete' }, fundingScan: { status: 'complete' }, summary: summarizeTxFills(fills), epochs,
    windows: txflowSelectionWindows('AWARDED', Date.parse(fetchedAt)).map(window => ({ from: window.from === null ? null : new Date(window.from).toISOString(), to: new Date(window.to).toISOString(), endExclusive: window.endExclusive })) };
}

test('automatic research works without preferences and rejects invalid manual point metadata', () => {
  for (const input of [null, undefined, {}, [], { consent: false, version: 'wallet-strategy-research-v1' }]) assert.deepEqual(researchInput(input), { name: '', points: {}, totalPoints: null });
  const input = researchInput({ name: '  Test   User  ', points: { S0: '0', EPOCH_1: '10.25', EPOCH_2: '-1', bad: '100' }, totalPoints: 'Infinity', report: { volume: '123' } });
  assert.deepEqual(input, { name: 'Test User', points: { S0: '0', EPOCH_1: '10.25' }, totalPoints: null });
  assert.equal(researchInput({ points: { EPOCH_1: ' 10,25 ' } }).points.EPOCH_1, '10.25');
});

test('Arcus research aligns canonical weekly gains and preserves exact fees, rebates, holding and liquidity mix', () => {
  const research = arcusResearch(arcusReport(), 'Test User', arcusPoints), period = research.periods['s1-week-2'];
  assert.equal(period.summary.volumeUsd, '200.246913578');
  assert.equal(period.summary.makerVolumeUsd, '100.123456789');
  assert.equal(period.markets[0].netFeesUsd, '-0.023456789');
  assert.equal(period.points.source, 'arcus_snapshot');
  assert.equal(period.points.value, '10');
  assert.equal(period.ratios.makerSharePercent, 50);
  assert.equal(period.eligibleForHoldingComparison, true);
  assert.equal(research.profile.walletLink, 'user_supplied_unverified');
  assert.equal(research.collection.mode, 'automatic');
  assert.equal(research.consent, undefined);
  assert.equal(period.holding.buckets.reduce((sum, bucket) => sum + Number(bucket.volumeUsd), 0), Number(period.summary.volumeUsd));
  const subaccount = arcusReport(); subaccount.accountScope = 0;
  assert.equal(arcusResearch(subaccount, 'Test User', arcusPoints).periods['s1-week-2'].ratios.volumePerPointUsd, null);
  assert.equal(arcusResearch(arcusReport(), 'Test User', [{ ...arcusPoints[0], distributed_at: '2026-10-15T19:00:00Z' }]).periods['s1-week-2'].points.value, null);
});

test('TxFlow keeps zero separate from unknown and never allocates a combined total to individual epochs', () => {
  const research = txflowResearch(txReport(), { S0: '0', EPOCH_1: '10' }, '100', TXFLOW_EPOCHS);
  assert.equal(research.periods.s0.points.value, '0');
  assert.equal(research.periods.s0.eligibleForPointsComparison, false);
  assert.equal(research.periods['s1-epoch-1'].ratios.volumePerPointUsd, 20);
  assert.equal(research.periods['s1-epoch-1'].summary.realizedPnlUsd, '4');
  assert.deepEqual(research.periods['s1-epoch-1'].summary.feesByRole.maker, { paidUsd: '0.02', rebatesUsd: '0', netUsd: '0.02' });
  assert.deepEqual(research.periods['s1-epoch-1'].summary.feesByRole.taker, { paidUsd: '0', rebatesUsd: '0', netUsd: '0' });
  assert.equal(research.periods['s1-epoch-1'].points.distributionAt, '2026-10-20');
  assert.equal(research.periods['s1-epoch-2'].points.value, null);
  assert.equal(research.latestScan.submittedTotalPoints.value, '100');
  const rolling = txReport(); rolling.windows = [{ from: '2026-10-15T00:00:00Z', to: TXFLOW_EPOCHS.EPOCH_2.end }];
  assert.equal(txflowResearch(rolling, { EPOCH_1: '10' }).periods['s1-epoch-1'].eligibleForPointsComparison, false);
});

test('upserts deduplicate epochs, retain full analysis under partial scans, and recompute ratios after point corrections', () => {
  const original = txflowResearch(txReport(), { EPOCH_1: '10', EPOCH_2: '20' });
  const partialReport = txReport(); partialReport.fetchedAt = '2026-10-29T12:00:00Z'; partialReport.fillsScan.status = 'partial';
  partialReport.epochs[1].summary.volume = '1'; partialReport.epochs[1].holding.status = 'incomplete';
  const updated = mergeResearchWallet(original, txflowResearch(partialReport, { EPOCH_1: '20' }));
  assert.equal(Object.keys(updated.periods).length, 3);
  assert.equal(updated.periods['s1-epoch-1'].summary.volumeUsd, '200');
  assert.equal(updated.periods['s1-epoch-1'].holdingComplete, true);
  assert.equal(updated.periods['s1-epoch-1'].points.value, '20');
  assert.equal(updated.periods['s1-epoch-1'].ratios.volumePerPointUsd, 10);
  assert.equal(updated.periods['s1-epoch-2'].points.value, '20');
  assert.equal(updated.firstSeenAt, original.firstSeenAt);
  assert.equal(mergeResearchWallet(updated, original).periods['s1-epoch-1'].points.value, '20');
  assert.deepEqual(mergeResearchWallet(updated, updated), updated);
  assert.throws(() => mergeResearchWallet(original, { ...original, project: 'arcus' }), /different/);
});

test('changed Arcus profile clears previous claimed points; blank and stale profiles do not corrupt an existing association', () => {
  const original = arcusResearch(arcusReport(), 'Alice', arcusPoints);
  const next = arcusReport(); next.fetchedAt = '2026-10-29T12:00:00Z';
  const blank = mergeResearchWallet(original, arcusResearch(next, '', []));
  assert.equal(blank.profile.name, 'Alice');
  assert.equal(blank.periods['s1-week-2'].points.value, '10');
  const changed = mergeResearchWallet(original, arcusResearch(next, 'Bob', []));
  assert.equal(changed.profile.name, 'Bob');
  assert.equal(changed.periods['s1-week-2'].points.value, null);
  const outOfOrder = mergeResearchWallet(changed, original);
  assert.equal(outOfOrder.profile.name, 'Bob');
  assert.equal(outOfOrder.periods['s1-week-2'].points.value, null);
});

test('automatic updates preserve historical consent without fabricating new consent', () => {
  const legacy = arcusResearch(arcusReport(), 'Alice', arcusPoints);
  delete legacy.collection;
  legacy.consent = { version: 'wallet-strategy-research-v1', acceptedAt: fetchedAt };
  const next = arcusReport(); next.fetchedAt = '2026-10-29T12:00:00Z';
  const merged = mergeResearchWallet(legacy, arcusResearch(next, 'Alice', arcusPoints));
  assert.deepEqual(merged.consent, legacy.consent);
  assert.equal(merged.collection.mode, 'automatic');
  assert.equal(merged.collection.recordedAt, next.fetchedAt);
});

test('CSV contains separate wallet-period observations, explicit unknowns and spreadsheet-safe names', () => {
  const wallet = arcusResearch(arcusReport(), '=HYPERLINK("bad")', arcusPoints);
  const csv = researchCsv([wallet]);
  assert.equal(csv.trim().split('\r\n').length, Object.keys(wallet.periods).length + 1);
  assert.ok(csv.includes('"comparable"'));
  assert.ok(csv.includes('"points_source"'));
  assert.ok(csv.includes('"under1h_volume_usd"'));
  assert.ok(csv.includes('"maker_fees_paid_usd"'));
  assert.ok(csv.includes('"taker_net_fees_usd"'));
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes('"-0.023456789"'));
  assert.ok(csv.includes('"arcus_snapshot"'));
  assert.ok(csv.includes('"s1-week-2"'));
});
