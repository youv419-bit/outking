import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isBlockedHostname,
  isPrivateAddress,
  safeExternalUrl,
} from '../src/lib/urlGuard.ts';

test('blocks loopback and private IPv4 ranges', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.4.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
  ]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be blocked`);
  }
});

test('allows ordinary public IPv4', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be allowed`);
  }
});

test('blocks IPv6 loopback, link-local and unique-local', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', '::ffff:169.254.169.254']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be blocked`);
  }
});

test('blocks internal hostnames', () => {
  for (const host of ['localhost', 'db.internal', 'printer.local', 'metadata.google.internal']) {
    assert.equal(isBlockedHostname(host), true, `${host} should be blocked`);
  }
});

test('rejects non-http schemes and credentials', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('file:///etc/passwd'), null);
  assert.equal(safeExternalUrl('http://user:pass@example.com'), null);
});

test('rejects URLs pointing at private addresses', () => {
  assert.equal(safeExternalUrl('http://127.0.0.1:5432'), null);
  assert.equal(safeExternalUrl('http://169.254.169.254/latest/meta-data/'), null);
  assert.equal(safeExternalUrl('http://localhost:3000'), null);
});

test('accepts a normal site and adds https when missing', () => {
  const url = safeExternalUrl('acme.ai');
  assert.ok(url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'acme.ai');
});

test('keeps an explicit http URL', () => {
  const url = safeExternalUrl('http://example.com/about');
  assert.ok(url);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.pathname, '/about');
});
