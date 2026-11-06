import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENDED_COMMUNITY_TOKENS, EXTENDED_ALLOCATION, EXTENDED_DEFAULTS, EXTENDED_TOKENS_PER_POINT, EXTENDED_TOTAL_POINTS, estimateExtended, extendedTokensForPoints, parseExtendedSettings } from '../lib/extended-estimator.ts';
import { parseExtendedMarkPrice } from '../lib/extended-premarket.ts';

test('Extended uses the published conversion and values the same XTEN across FDV scenarios', () => {
  assert.equal(EXTENDED_ALLOCATION, 30);
  assert.equal(EXTENDED_TOKENS_PER_POINT.toFixed(4), '4.2857');
  const tokens = extendedTokensForPoints(46);
  assert.equal(tokens.toFixed(4), '197.1429');
  const at500m = estimateExtended(500_000_000, tokens);
  assert.equal(at500m.tokenPrice, 0.5);
  assert.equal(at500m.valuePerPoint, 15 / 7);
  assert.equal(at500m.value.toFixed(2), '98.57');
  assert.equal(estimateExtended(1_000_000_000, tokens).value, tokens);
  assert.equal(extendedTokensForPoints(EXTENDED_TOTAL_POINTS), EXTENDED_COMMUNITY_TOKENS);
});

test('Extended distinguishes empty points from zero and validates FDV independently', () => {
  for (const points of [null, -1, Infinity, EXTENDED_TOTAL_POINTS + 1]) assert.equal(extendedTokensForPoints(points), null);
  assert.equal(extendedTokensForPoints(0), 0);
  assert.equal(estimateExtended(500_000_000, 0).value, 0);
  assert.equal(estimateExtended(500_000_000, null).value, undefined);
  for (const fdv of [0, -1, Infinity]) assert.equal(estimateExtended(fdv, extendedTokensForPoints(46)), null);
});

test('Hyperliquid XTEN mark price matches the active asset at its metadata index', () => {
  const other = { name: 'HYPE' };
  const xten = { name: 'XTEN' };
  const context = { markPx: '0.24105', midPx: '0.24054', oraclePx: '0.240872' };
  assert.equal(parseExtendedMarkPrice([{ universe: [other, xten] }, [{ markPx: '45' }, context]]), 0.24105);
  assert.equal(parseExtendedMarkPrice([{ universe: [other] }, [context]]), null);
  assert.equal(parseExtendedMarkPrice([{ universe: [{ ...xten, isDelisted: true }] }, [context]]), null);
  for (const markPx of [null, '0', '-1', 'Infinity']) {
    assert.equal(parseExtendedMarkPrice([{ universe: [xten] }, [{ ...context, markPx }]]), null);
  }
});

test('Extended migrates saved Xpoints and FDV without carrying over an old custom points pool', () => {
  const custom = { pointsInput:'46', fdvInput:'725000000' };
  assert.deepEqual(parseExtendedSettings(JSON.stringify({...custom, totalInput:'69235805'})), custom);
  assert.deepEqual(parseExtendedSettings(JSON.stringify({pointsInput:'', fdvInput:''})), {pointsInput:'', fdvInput:''});
  for (const raw of [null,'{','[]','null']) assert.deepEqual(parseExtendedSettings(raw), EXTENDED_DEFAULTS);
  assert.deepEqual(parseExtendedSettings(JSON.stringify({pointsInput:46,fdvInput:'1'.repeat(101)})), EXTENDED_DEFAULTS);
});
