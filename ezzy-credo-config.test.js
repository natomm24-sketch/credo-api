const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const server = fs.readFileSync(require.resolve('./server'), 'utf8');
const tracker = fs.readFileSync(require.resolve('./tracker'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing section: ${startMarker}`);
  assert.notEqual(end, -1, `Missing section end: ${endMarker}`);
  return source.slice(start, end);
}

test('Ezzy Credo checkout uses only the isolated IZI company credentials', () => {
  const ezzyRoute = section(
    server,
    "app.post('/api/credo-order'",
    '/* ===================== SHOPIFY + CREDO FLOW',
  );

  assert.match(ezzyRoute, /SECRET_EZZY/);
  assert.match(ezzyRoute, /MERCHANT_ID_EZZY/);
  assert.doesNotMatch(ezzyRoute, /SECRET_COMFORT|MERCHANT_ID_COMFORT/);
  assert.match(ezzyRoute, /return res\.json\(\{ redirectUrl, orderCode \}\)/);
});

test('Comfortmix Credo checkout keeps the existing company credentials', () => {
  const comfortRoute = section(
    server,
    "app.post('/api/credo-order-comfortmix'",
    '/* ===================== SHOPIFY + BANK (UNIFIED)',
  );

  assert.match(comfortRoute, /SECRET_COMFORT/);
  assert.match(comfortRoute, /MERCHANT_ID_COMFORT/);
  assert.doesNotMatch(comfortRoute, /SECRET_EZZY|MERCHANT_ID_EZZY/);
});

test('Ezzy order tracking uses the isolated Credo status credentials', () => {
  assert.match(tracker, /credoMerchantId:\s*bankConfig\?\.credoMerchantIdEzzy/);
  assert.match(tracker, /credoSecret:\s*bankConfig\?\.credoSecretEzzy/);
  assert.match(server, /credoMerchantId:\s*MERCHANT_ID_COMFORT/);
  assert.match(server, /credoSecret:\s*SECRET_COMFORT/);
  assert.match(server, /credoMerchantIdEzzy:\s*MERCHANT_ID_EZZY/);
  assert.match(server, /credoSecretEzzy:\s*SECRET_EZZY/);
});
