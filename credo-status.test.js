const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const test = require('node:test');

const axios = { get: async () => { throw new Error('Unexpected HTTP request'); } };
const originalLoad = Module._load;
Module._load = function loadWithAxiosStub(request, parent, isMain) {
  if (request === 'axios') return axios;
  return originalLoad.call(this, request, parent, isMain);
};
const tracker = require('./tracker');
Module._load = originalLoad;

const {
  parseCredoStatusPayload,
  credoStatusCheckIsDue,
  fetchCredoStatus,
} = tracker.statusHelpers;

test('maps documented Credo application statuses', () => {
  assert.deepEqual(parseCredoStatusPayload({ status: 200, data: 2 }), {
    available: true,
    statusCode: 200,
    statusId: 2,
    status: 'განაცხადი მუშავდება',
    info: null,
  });
  assert.equal(parseCredoStatusPayload({ status: 200, data: 12 }).status, 'პროდუქტი გასაგზავნია');
  assert.equal(parseCredoStatusPayload({ status: 200, data: 5 }).status, 'დასრულდა');
  assert.equal(parseCredoStatusPayload({ status: 200, data: 6 }).status, 'დაუარდა');
  assert.equal(parseCredoStatusPayload({ status: 200, data: 7 }).status, 'გაუქმდა');
});

test('rejects unavailable or malformed Credo status payloads', () => {
  assert.equal(parseCredoStatusPayload({ status: 404, data: null }).available, false);
  assert.equal(parseCredoStatusPayload({ status: 200, data: null }).available, false);
  assert.equal(parseCredoStatusPayload({ status: 200, data: 'not-a-status' }).available, false);
});

test('automatically checks only Credo applications older than 30 minutes', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');
  assert.equal(credoStatusCheckIsDue({ provider: 'CREDO', applicationCode: 'ORD_1', createdAt: '2026-09-10T11:29:59.000Z' }, now), true);
  assert.equal(credoStatusCheckIsDue({ provider: 'CREDO', applicationCode: 'ORD_1', createdAt: '2026-09-10T11:30:01.000Z' }, now), false);
  assert.equal(credoStatusCheckIsDue({ provider: 'TBC', applicationCode: 'ORD_1', createdAt: '2026-09-10T11:00:00.000Z' }, now), false);
});

test('signs Credo status requests and caches repeated automatic checks', async () => {
  const originalGet = axios.get;
  const config = { credoMerchantId: 'merchant-test', credoSecret: 'secret-test' };
  const orderCode = `ORD_TEST_${Date.now()}`;
  let calls = 0;

  axios.get = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://ganvadeba.credo.ge/widget/api.php');
    assert.equal(options.params.merchantId, config.credoMerchantId);
    assert.equal(options.params.orderCode, orderCode);
    assert.equal(
      options.params.hash,
      crypto.createHash('md5').update(`${config.credoMerchantId}${orderCode}${config.credoSecret}`).digest('hex'),
    );
    return { data: { status: 200, data: 4 } };
  };

  try {
    const first = await fetchCredoStatus(orderCode, config);
    const second = await fetchCredoStatus(orderCode, config);
    assert.equal(first.status, 'ხელმოწერას ელოდება');
    assert.deepEqual(second, first);
    assert.equal(calls, 1);
  } finally {
    axios.get = originalGet;
  }
});
