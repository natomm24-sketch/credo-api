const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

test('Ezzy Keepz uses isolated new-company credentials and preserves routing', () => {
  const orderRoute = source.slice(
    source.indexOf("app.post('/api/keepz-order'"),
    source.indexOf("app.post('/api/keepz-callback'"),
  );
  const callbackRoute = source.slice(
    source.indexOf("app.post('/api/keepz-callback'"),
    source.indexOf("app.post('/api/keepz-success'"),
  );

  assert.match(orderRoute, /new Keepz\(\s*KEEPZ_PUBLIC_KEY_EZZY,\s*KEEPZ_PRIVATE_KEY_EZZY\s*\)/);
  assert.match(orderRoute, /integratorId:\s*KEEPZ_INTEGRATOR_ID_EZZY/);
  assert.match(orderRoute, /identifier:\s*KEEPZ_INTEGRATOR_ID_EZZY/);
  assert.match(orderRoute, /receiverId:\s*KEEPZ_RECEIVER_ID_EZZY/);
  assert.doesNotMatch(orderRoute, /KEEPZ_(?:INTEGRATOR_ID|PUBLIC_KEY|PRIVATE_KEY|RECEIVER_ID)(?!_EZZY)/);

  assert.match(callbackRoute, /integratorId\s*!==\s*KEEPZ_INTEGRATOR_ID_EZZY/);
  assert.match(callbackRoute, /receiverId\s*!==\s*KEEPZ_RECEIVER_ID_EZZY/);

  assert.match(orderRoute, /https:\/\/ezzy\.ge\/pages\/payment-success\?orderId=/);
  assert.match(orderRoute, /https:\/\/ezzy\.ge\/pages\/payment-fail/);
  assert.match(orderRoute, /https:\/\/api\.ezzy\.ge\/api\/keepz-callback/);
});

test('Ezzy Keepz card payment includes server-priced delivery without changing callback events', () => {
  const orderRoute = source.slice(
    source.indexOf("app.post('/api/keepz-order'"),
    source.indexOf("app.post('/api/keepz-courier-order'"),
  );
  const callbackRoute = source.slice(
    source.indexOf("app.post('/api/keepz-callback'"),
    source.indexOf("app.post('/api/keepz-success'"),
  );

  assert.match(source, /function keepzDeliveryZone\(body\)/);
  assert.match(orderRoute, /const deliveryZone = keepzDeliveryZone\(req\.body\)/);
  assert.match(orderRoute, /const amount = Number\(\(productTotal \+ delivery\.fee\)\.toFixed\(2\)\)/);
  assert.match(orderRoute, /\.\.\.draftDeliveryFields\(delivery\.zone\)/);
  assert.match(orderRoute, /deliveryTag\(delivery\.zone\)/);
  assert.match(orderRoute, /delivery_fee['"], value: delivery\.fee\.toFixed\(2\)/);
  assert.match(source, /async function refreshKeepzPayment/);
  assert.match(source, /if \(paymentType === 'card' && !wasSuccessful\) \{[\s\S]*?sendMetaPurchase/);
});

test('courier Keepz charges only server-priced delivery and preserves callback safety', () => {
  const courierRoute = source.slice(
    source.indexOf("app.post('/api/keepz-courier-order'"),
    source.indexOf('const SHOPIFY_API_VERSION', source.indexOf("app.post('/api/keepz-courier-order'")),
  );
  const callbackRoute = source.slice(
    source.indexOf("app.post('/api/keepz-callback'"),
    source.indexOf("app.post('/api/keepz-success'"),
  );

  assert.match(courierRoute, /deliveryDetails\(req\.body\.delivery_zone\)/);
  assert.match(courierRoute, /const amount = Number\(delivery\.fee\.toFixed\(2\)\)/);
  assert.match(courierRoute, /keepz_payment_type['"], value: 'courier'/);
  assert.match(courierRoute, /successRedirectUri:[\s\S]*mode=courier/);
  assert.match(courierRoute, /failRedirectUri: 'https:\/\/ezzy\.ge\/pages\/payment-fail'/);
  assert.match(courierRoute, /callbackUri: 'https:\/\/api\.ezzy\.ge\/api\/keepz-callback'/);
  assert.doesNotMatch(courierRoute, /sendMetaPurchase/);

  assert.match(source, /Math\.abs\(receivedAmount - Number\(savedOrder\.amount\)\) > 0\.009/);
  assert.match(source, /KEEPZ-STATUS-SUCCESS/);
  assert.doesNotMatch(callbackRoute, /completeKeepzDraft|\/complete\.json/);
});

test('Keepz success is persisted for order-admin status display', () => {
  const trackerSource = fs.readFileSync(path.join(__dirname, 'tracker.js'), 'utf8');
  assert.match(trackerSource, /KEEPZ-STATUS-SUCCESS\|Keepz\\s\+Status/);
  assert.match(trackerSource, /provider === 'KEEPZ'[\s\S]*?'გადახდილია'/);
  assert.match(trackerSource, /keepzSuccessful \? 'success' : 'in_progress'/);
  assert.match(trackerSource, /app\.get\('\/api\/admin\/keepz-status'/);
  assert.match(trackerSource, /provider === 'KEEPZ' \? keepzOrderId : bogOrderId/);
});

test('unpaid courier advances stay hidden and successful Keepz wins over COD', () => {
  const trackerSource = fs.readFileSync(path.join(__dirname, 'tracker.js'), 'utf8');
  const providerRoute = trackerSource.slice(
    trackerSource.indexOf('function detectProvider'),
    trackerSource.indexOf('function extractApplicationMeta'),
  );

  assert.ok(providerRoute.indexOf("text.includes('KEEPZ')") < providerRoute.indexOf("return 'COD'"));
  assert.match(trackerSource, /function isPendingCourierAdvance/);
  assert.match(trackerSource, /COURIER-ADVANCE-PENDING/);
  assert.match(trackerSource, /matchesPhone\(draft\) && !isPendingCourierAdvance\(draft\)/);
  assert.match(trackerSource, /matchesCustomer\(draft\) && !isPendingCourierAdvance\(draft\)/);
  assert.match(trackerSource, /filter\(\(draft\) => !isPendingCourierAdvance\(draft\)\)/);
});

test('Comfortmix Keepz remains on the existing credential set', () => {
  const comfortRoute = source.slice(
    source.indexOf("app.post('/api/keepz-order-comfortmix'"),
    source.indexOf("app.post('/api/keepz-success-comfortmix'"),
  );

  assert.match(comfortRoute, /new Keepz\(\s*KEEPZ_PUBLIC_KEY,\s*KEEPZ_PRIVATE_KEY\s*\)/);
  assert.match(comfortRoute, /integratorId:\s*KEEPZ_INTEGRATOR_ID/);
  assert.match(comfortRoute, /identifier:\s*KEEPZ_INTEGRATOR_ID/);
  assert.match(comfortRoute, /receiverId:\s*KEEPZ_RECEIVER_ID/);
  assert.doesNotMatch(comfortRoute, /KEEPZ_(?:INTEGRATOR_ID|PUBLIC_KEY|PRIVATE_KEY|RECEIVER_ID)_EZZY/);
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
    'KEEPZ_INTEGRATOR_ID_EZZY',
    'KEEPZ_RECEIVER_ID_EZZY',
    'KEEPZ_PUBLIC_KEY_EZZY',
    'KEEPZ_PRIVATE_KEY_EZZY',
  ]) {
    assert.match(source, new RegExp(`requiredEnv\\('${name}'\\)`));
  }

  assert.doesNotMatch(source, /const\s+KEEPZ_PRIVATE_KEY(?:_EZZY)?\s*=\s*["'`]/);
});


