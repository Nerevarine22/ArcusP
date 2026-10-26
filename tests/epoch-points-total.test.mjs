import test from 'node:test';
import assert from 'node:assert/strict';
import { sumPointInputs } from '../lib/estimator.ts';

test('awarded epoch points sum only when every included epoch has a valid value', () => {
  assert.equal(sumPointInputs(['100', '340', '400']), 840);
  assert.equal(sumPointInputs(['100', '0', '400']), 500);
  assert.equal(sumPointInputs(['0', '0', '0']), 0);
  assert.equal(sumPointInputs(['100', '', '400']), null);
  assert.equal(sumPointInputs(['100', 'bad', '400']), null);
  assert.equal(sumPointInputs(['100', '-1', '400']), null);
  assert.equal(sumPointInputs([]), null);
  assert.equal(sumPointInputs(['0,1', '0.2']), 0.3);
  assert.equal(sumPointInputs(['1e308', '1e308']), null);
  assert.equal(sumPointInputs(['340', '400']), 740);
});
