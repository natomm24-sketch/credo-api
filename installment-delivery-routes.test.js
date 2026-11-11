const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const server = fs.readFileSync(require.resolve('./server'), 'utf8');

function section(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing section: ${startMarker}`);
  assert.notEqual(end, -1, `Missing section end: ${endMarker}`);
  return server.slice(start, end);
}

test('all four Ezzy bank application payloads add server-priced delivery', () => {
  const routes = [
    section("app.post('/api/credo-order'", '/* ===================== SHOPIFY + CREDO FLOW'),
    section("app.post('/api/tbc-order'", '/* ===================== TBC CART EZZY'),
    section("app.post('/api/bog-order'", '/* ===================== BOG PART BY PART'),
    section("app.post('/api/bog-part-order'", '/* ===================== BOG PART BY PART Draft Order'),
  ];

  for (const route of routes) {
    assert.match(route, /productsWithDelivery\(req\.body\.products, req\.body\.delivery_zone\)/);
    assert.match(route, /installmentDeliveryError\(res, err\)/);
  }
});

test('TBC cart application also adds server-priced delivery', () => {
  const route = section(
    "app.post('/api/tbc-order-cart'",
    '/* ===================== SHOPIFY + COD (EZZY)',
  );
  assert.match(route, /productsWithDelivery\(req\.body\.products, req\.body\.delivery_zone\)/);
  assert.match(route, /priceTotal = products\.reduce/);
});

test('Ezzy draft-order wrappers forward the zone and record included delivery', () => {
  const wrappers = [
    section("app.post('/api/create-order-and-bog-ezzy'", '/* ===================== BOG ORDER EZZY'),
    section("app.post('/api/create-order-and-bog-part-ezzy'", '/* ===================== BOG COMFORTMIX'),
    section("app.post('/api/create-order-and-tbc-ezzy'", '/* ===================== SHOPIFY + TBC (EZZY CART)'),
    section("app.post('/api/create-order-and-tbc-cart-ezzy'", '/* ===================== SHOPIFY + CREDO (EZZY)'),
    section("app.post('/api/create-order-and-credo-ezzy'", '/* ===================== SHOPIFY + COD (EZZY)'),
  ];

  for (const wrapper of wrappers) {
    assert.match(wrapper, /normalizeDeliveryZone\(req\.body\.delivery_zone\)/);
    assert.match(wrapper, /\.\.\.draftDeliveryFields\(deliveryZone\)/);
    assert.match(wrapper, /delivery_zone: deliveryZone/);
    assert.match(wrapper, /deliveryNote\(deliveryZone\)/);
    assert.match(wrapper, /orderDeliveryTag/);
  }
});

