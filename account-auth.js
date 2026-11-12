const crypto = require('crypto');

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(encoded, secret) {
  return crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSignedToken(payload, secret) {
  if (!secret || String(secret).length < 32) throw new Error('TRACKER_SESSION_SECRET must contain at least 32 characters');
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded, secret)}`;
}

function verifySignedToken(token, secret, now = Date.now()) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra || !safeEqual(signature, sign(encoded, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function hashLoginCode(code, nonce, secret) {
  return crypto.createHmac('sha256', secret).update(`${nonce}:${code}`).digest('base64url');
}

function createLoginChallenge({ phone, code, accountExists, secret, now = Date.now() }) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  return createSignedToken({
    type: 'login_challenge',
    phone,
    nonce,
    codeHash: hashLoginCode(code, nonce, secret),
    accountExists: accountExists === true,
    exp: now + 5 * 60 * 1000,
  }, secret);
}

function verifyLoginChallenge({ challenge, code, secret, now = Date.now() }) {
  const payload = verifySignedToken(challenge, secret, now);
  if (!payload || payload.type !== 'login_challenge' || !/^5\d{8}$/.test(payload.phone)) return null;
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  if (!safeEqual(payload.codeHash, hashLoginCode(String(code), payload.nonce, secret))) return null;
  return payload.accountExists ? payload.phone : null;
}

function createSessionToken({ phone, secret, now = Date.now() }) {
  return createSignedToken({ type: 'account_session', phone, exp: now + 30 * 24 * 60 * 60 * 1000 }, secret);
}

function verifySessionToken(token, secret, now = Date.now()) {
  const payload = verifySignedToken(token, secret, now);
  return payload?.type === 'account_session' && /^5\d{8}$/.test(payload.phone) ? payload.phone : null;
}

module.exports = {
  createLoginChallenge,
  createSessionToken,
  verifyLoginChallenge,
  verifySessionToken,
};
