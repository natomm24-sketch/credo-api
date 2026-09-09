const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildPurchaseEvent,
  normalizePhone,
  sendMetaPurchase
} = require('./meta-capi');

test('normalizes Georgian phone numbers for hashing', () => {
  assert.equal(normalizePhone('599 12 34 56'), '995599123456');
  assert.equal(normalizePhone('0599 12 34 56'), '995599123456');
  assert.equal(normalizePhone('+995 599 12 34 56'), '995599123456');
});

test('builds a Purchase payload without raw customer data', () => {
  const event = buildPurchaseEvent({
    eventId: 'keepz-purchase-abc',
    orderId: 'abc',
    value: 269,
    contents: [{ id: 123, quantity: 1, item_price: 269 }],
    customer: { name: 'გიორგი გიორგაძე', phone: '599123456' },
    eventTime: 1700000000
  });

  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.custom_data.value, 269);
  assert.deepEqual(event.custom_data.content_ids, ['123']);
  assert.equal(event.user_data.ph[0].length, 64);
  assert.equal(JSON.stringify(event).includes('599123456'), false);
  assert.equal(JSON.stringify(event).includes('გიორგი'), false);
});

test('posts one event with a bearer token', async () => {
  let request;
  const httpClient = {
    post: async (...args) => {
      request = args;
      return { data: { events_received: 1 } };
    }
  };

  const result = await sendMetaPurchase({
    eventId: 'keepz-purchase-abc',
    orderId: 'abc',
    value: 269,
    contents: [{ id: 123, quantity: 1, item_price: 269 }]
  }, {
    pixelId: 'pixel-id',
    accessToken: 'secret-token',
    httpClient
  });

  assert.equal(result.events_received, 1);
  assert.match(request[0], /pixel-id\/events$/);
  assert.equal(request[1].data.length, 1);
  assert.equal(request[2].headers.Authorization, 'Bearer secret-token');
});
