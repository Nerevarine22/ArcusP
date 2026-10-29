import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../lib/estimator.ts';
import { BULK_DEFAULTS, parseBulkSettings } from '../lib/bulk-estimator.ts';

test('AURA range uses exact proportional math instead of rounded community bands', () => {
  assert.equal(estimate(100e6,30,30e6,1).value,1);
  assert.equal(estimate(100e6,30,70e6,1).value,3/7);
  assert.equal(estimate(300e6,30,50e6,1000).value,1800);
  assert.equal(estimate(500e6,30,50e6,1000).value,3000);
  assert.equal(estimate(500e6,30,50e6,50e6).value,150e6);
});

test('manual pool, allocation and AURA values scale together without assuming supply', () => {
  assert.equal(estimate(200e6,30,40e6,0).value,0);
  assert.equal(estimate(200e6,30,40e6,12.5).value,18.75);
  assert.equal(estimate(200e6,15,40e6,12.5).value,9.375);
  assert.equal(estimate(200e6,30,40e6,40e6+1),null);
});

test('saved AURA inputs preserve blank edits and validate corrupted storage fields', () => {
  const custom = {pointsInput:'12,5',totalInput:'40000000',fdvInput:'200000000',allocationInput:'15',matrixMode:'personal'};
  assert.deepEqual(parseBulkSettings(JSON.stringify(custom)),custom);
  assert.equal(parseBulkSettings('{"pointsInput":""}').pointsInput,'');
  assert.equal(parseBulkSettings('{"pointsInput":44,"matrixMode":"invalid"}').matrixMode,'unit');
  assert.equal(parseBulkSettings(JSON.stringify({fdvInput:'1'.repeat(101)})).fdvInput,BULK_DEFAULTS.fdvInput);
  for(const raw of [null,'{','[]','null']) assert.deepEqual(parseBulkSettings(raw),BULK_DEFAULTS);
});
