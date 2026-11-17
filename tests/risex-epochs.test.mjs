import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(['./wallet-analytics', './txflow-wallet', './risex-epochs'].includes(specifier) ? specifier + '.ts' : specifier, context);
} });
const { risexEpochs, isRisexScheduleCurrent } = await import('../lib/risex-epochs.ts');
const { riseFill, buildRisexReport } = await import('../lib/risex-wallet.ts');

const start17 = Date.parse('2026-11-09T00:00:00Z');
const end17 = Date.parse('2026-11-16T00:00:00Z');
const drop17 = Date.parse('2026-11-17T14:00:00Z');
const now = Date.parse('2026-11-17T17:00:00Z');
const live18 = {
  label: 'Week 18', from: end17, to: Date.parse('2026-11-22T23:59:00Z'),
  distribution: Date.parse('2026-11-24T14:00:00Z'),
};

test('RISEx retains Week 17 after the API rolls over to Week 18', () => {
  for (const live of [null, live18]) {
    const epochs = risexEpochs(now, live);
    const week17 = epochs.find(epoch => epoch.from === start17);
    assert.deepEqual(week17, {
      id: `epoch:${start17}`, label: 'Week 17', from: start17, to: end17,
      distribution: drop17, status: 'completed',
    });
    assert.equal(epochs.length, 19); // Pre-season and 18 started weeks.
    assert.equal(new Set(epochs.map(epoch => epoch.id)).size, epochs.length);
    const week18 = epochs.find(epoch => epoch.from === end17);
    assert.equal(week18.status, 'in-progress');
    assert.equal(week18.to, Date.parse('2026-11-23T00:00:00Z'));
  }
});

test('RISEx generates later weeks without a fixed season limit', () => {
  const epochs = risexEpochs(Date.parse('2026-12-07T00:00:00Z'), null);
  assert.equal(epochs.at(-1).label, 'Week 21');
  assert.equal(epochs.at(-1).status, 'in-progress');
  assert.equal(epochs.filter(epoch => epoch.from !== null).length, 21);
  assert.equal(risexEpochs(Date.parse('2026-07-19T23:59:59Z'), null).length, 1);
});

test('RISEx transitions at the weekly close and distribution time', () => {
  const statusAt = time => risexEpochs(time, null).find(epoch => epoch.from === start17).status;
  assert.equal(statusAt(end17 - 1), 'in-progress');
  assert.equal(statusAt(end17), 'awaiting-drop');
  assert.equal(statusAt(drop17 - 1), 'awaiting-drop');
  assert.equal(statusAt(drop17), 'completed');
});

test('RISEx rejects saved reports missing Week 17 even when Week 18 is present', () => {
  const current = risexEpochs(now, live18);
  assert.equal(isRisexScheduleCurrent(current, now), true);
  assert.equal(isRisexScheduleCurrent(current.filter(epoch => epoch.from !== start17), now), false);
  assert.equal(isRisexScheduleCurrent(risexEpochs(end17 - 1, null), now), false);
  assert.equal(isRisexScheduleCurrent(risexEpochs(drop17 - 1, null), now), false);
});

test('RISEx cache validation respects distribution times supplied by the API', () => {
  const live17 = { label: 'Week 17', from: start17, to: end17, distribution: drop17 + 3_600_000 };
  const snapshot = risexEpochs(drop17, live17);
  assert.equal(snapshot.find(epoch => epoch.from === start17).status, 'awaiting-drop');
  assert.equal(isRisexScheduleCurrent(snapshot, drop17 + 1), true);
  assert.equal(isRisexScheduleCurrent(snapshot, live17.distribution), false);
});

test('RISEx awarded totals include Week 17 and exclude Week 18 at the exact boundary', () => {
  const fill = (id, time, price) => riseFill({
    id, order_id: id, market_id: '1', blockchain_data: { block_number: id, log_index: '1' },
    size: '1', price, side: 'BUY', fee: '0.1', liquidity_indicator: 'TAKER',
    time: String(BigInt(time) * 1_000_000n), avg_price: '0', realized_pnl: '0',
  });
  const report = buildRisexReport({
    address: '0x1111111111111111111111111111111111111111', now,
    trades: { rows: [fill('1', end17 - 1, '100'), fill('2', end17, '200')], status: 'complete', pages: 1, warnings: [] },
    funding: { rows: [], status: 'complete', pages: 1, warnings: [] },
    portfolio: null, transfers: null, epoch: live18, warnings: [],
  });
  assert.equal(report.epochs.find(epoch => epoch.from === start17).activity.summary.volume, '100');
  assert.equal(report.epochs.find(epoch => epoch.from === end17).activity.summary.volume, '200');
  assert.equal(report.awarded.summary.volume, '100');
  assert.equal(report.season1.summary.volume, '100');
  assert.equal(report.total.summary.volume, '300');
});
