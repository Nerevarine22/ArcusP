import test from 'node:test';
import assert from 'node:assert/strict';
import { isJumperAddress, normalizeJumperWallet, parseJumperWalletSettings } from '../lib/jumper-wallet.ts';

const address = '0x4c4e9818925a5bdaf5f50944ffbe9d297e58563b';
const now = Date.parse('2026-11-10T12:00:00Z');

test('Jumper accepts EVM addresses and preserves zero XP separately from an unavailable result', () => {
  assert.equal(isJumperAddress(address), true);
  assert.equal(isJumperAddress('0x' + 'A'.repeat(40)), true);
  for (const value of ['', address.slice(0,-1), address+'0', '0x'+'g'.repeat(40)]) assert.equal(isJumperAddress(value), false);
  const zero = normalizeJumperWallet({ points:0, position:null }, address, now);
  assert.equal(zero.points, 0);
  assert.equal(zero.position, null);
  assert.equal(normalizeJumperWallet({ points:0, position:0 }, address, now).position, null);
  assert.equal(normalizeJumperWallet({ points:55, position:820155 }, address, now).position, 820155);
});

test('malformed responses and another wallet cannot be presented as a valid XP lookup', () => {
  for (const points of [undefined, '55', -1, NaN, Infinity, Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(() => normalizeJumperWallet({ points, position:1 }, address, now));
  }
  for (const position of [undefined, '1', -1, 1.5, Infinity]) {
    assert.throws(() => normalizeJumperWallet({ points:55, position }, address, now));
  }
  assert.throws(() => normalizeJumperWallet({ address:'0x'+'1'.repeat(40), points:55, position:1 }, address, now), /different wallet/);
});

test('saved XP restores only for the same wallet and corrupted results keep the entered address', () => {
  const result = normalizeJumperWallet({ points:55, position:820155 }, address, now);
  assert.deepEqual(parseJumperWalletSettings(JSON.stringify({ address, result })), { address, result });
  for (const corrupt of [{ ...result, points:-1 }, { ...result, address:'0x'+'1'.repeat(40) }, { ...result, fetchedAt:'invalid' }]) {
    assert.deepEqual(parseJumperWalletSettings(JSON.stringify({ address, result:corrupt })), { address, result:null });
  }
  assert.deepEqual(parseJumperWalletSettings(JSON.stringify({ address:'0x123', result })), { address:'0x123', result:null });
  assert.deepEqual(parseJumperWalletSettings('invalid'), { address:'', result:null });
});
