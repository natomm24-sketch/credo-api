const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

test('Ezzy Keepz uses the shared old-company credentials and receiver', () => {
  const orderRoute = source.slice(
    source.indexOf("app.post('/api/keepz-order'"),
    source.indexOf("app.post('/api/keepz-callback'"),
  );
  const callbackRoute = source.slice(
    source.indexOf("app.post('/api/keepz-callback'"),
    source.indexOf("app.post('/api/keepz-success'"),
  );

  assert.match(orderRoute, /new Keepz\(\s*KEEPZ_PUBLIC_KEY,\s*KEEPZ_PRIVATE_KEY\s*\)/);
  assert.match(orderRoute, /integratorId:\s*KEEPZ_INTEGRATOR_ID/);
  assert.match(orderRoute, /identifier:\s*KEEPZ_INTEGRATOR_ID/);
  assert.match(orderRoute, /receiverId:\s*KEEPZ_RECEIVER_ID/);
  assert.doesNotMatch(orderRoute, /KEEPZ_(?:INTEGRATOR_ID|PUBLIC_KEY|PRIVATE_KEY|RECEIVER_ID)_EZZY/);

  assert.match(callbackRoute, /integratorId\s*!==\s*KEEPZ_INTEGRATOR_ID/);
  assert.match(callbackRoute, /receiverId\s*!==\s*KEEPZ_RECEIVER_ID/);
});

test('payment credentials are loaded from the environment', () => {
  for (const name of [
    'CREDO_MERCHANT_ID_COMFORT',
    'CREDO_SECRET_COMFORT',
    'TBC_API_KEY_COMFORT',
    'TBC_API_SECRET_COMFORT',
    'TBC_MERCHANT_COMFORT',
    'KEEPZ_INTEGRATOR_ID',
    'KEEPZ_RECEIVER_ID',
    'KEEPZ_PUBLIC_KEY',
    'KEEPZ_PRIVATE_KEY',
  ]) {
    assert.match(source, new RegExp(`requiredEnv\\('${name}'\\)`));
  }

  assert.doesNotMatch(source, /KEEPZ_(?:INTEGRATOR_ID|PUBLIC_KEY|PRIVATE_KEY|RECEIVER_ID)_EZZY/);
  assert.doesNotMatch(source, /const\s+KEEPZ_PRIVATE_KEY\s*=\s*["'`]/);
});
