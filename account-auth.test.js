const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createLoginChallenge,
  createSessionToken,
  verifyLoginChallenge,
  verifySessionToken,
} = require('./account-auth');

const secret = 'test-secret-with-at-least-thirty-two-characters';
const now = 1_800_000_000_000;

test('accepts a valid login code and rejects an incorrect or expired code', () => {
  const challenge = createLoginChallenge({ phone: '555123456', code: '123456', accountExists: true, secret, now });
  assert.equal(verifyLoginChallenge({ challenge, code: '123456', secret, now: now + 1000 }), '555123456');
  assert.equal(verifyLoginChallenge({ challenge, code: '654321', secret, now: now + 1000 }), null);
  assert.equal(verifyLoginChallenge({ challenge, code: '123456', secret, now: now + 301_000 }), null);
});

test('does not authenticate a challenge for an unknown phone', () => {
  const challenge = createLoginChallenge({ phone: '555123456', code: '123456', accountExists: false, secret, now });
  assert.equal(verifyLoginChallenge({ challenge, code: '123456', secret, now }), null);
});

test('creates a 30-day phone session and detects tampering', () => {
  const token = createSessionToken({ phone: '555123456', secret, now });
  assert.equal(verifySessionToken(token, secret, now + 1000), '555123456');
  assert.equal(verifySessionToken(`${token}x`, secret, now + 1000), null);
  assert.equal(verifySessionToken(token, secret, now + 31 * 24 * 60 * 60 * 1000), null);
});
