const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const axios = {
  post: async () => { throw new Error('Unexpected token request'); },
  get: async () => { throw new Error('Unexpected status request'); },
};
const originalLoad = Module._load;
Module._load = function loadWithAxiosStub(request, parent, isMain) {
  if (request === 'axios') return axios;
  return originalLoad.call(this, request, parent, isMain);
};
const tracker = require('./tracker');
Module._load = originalLoad;

const {
  parseBogStatusPayload,
  bogStatusCheckIsDue,
  fetchBogStatus,
} = tracker.statusHelpers;

test('maps documented BOG installment statuses', () => {
  assert.equal(parseBogStatusPayload({ status: 'in_progress', installment_status: 'unknown' }).status, 'განაცხადი მუშავდება');
  assert.equal(parseBogStatusPayload({ status: 'success', installment_status: 'success' }).status, 'დამტკიცდა');
  assert.equal(parseBogStatusPayload({ status: 'error', installment_status: 'reject' }).status, 'დაუარდა');
  assert.equal(parseBogStatusPayload({ status: 'error', installment_status: 'reverse_success' }).status, 'გაუქმდა');
  assert.equal(parseBogStatusPayload({ status: 'error', installment_status: 'fail' }).status, 'განაცხადი ვერ დასრულდა');
});

test('handles unavailable BOG status responses', () => {
  assert.equal(parseBogStatusPayload({}, 404).available, false);
  assert.equal(parseBogStatusPayload({ status: 'CREATED' }, 200).available, false);
});

test('automatically checks BOG and BOG BNPL applications after two minutes', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');
  const orderId = '279838cb-f41f-41c2-b9c9-151407acbbbf';
  assert.equal(bogStatusCheckIsDue({ provider: 'BOG', applicationOrderId: orderId, createdAt: '2026-09-10T11:57:59.000Z' }, now), true);
  assert.equal(bogStatusCheckIsDue({ provider: 'BOG_BNPL', applicationOrderId: orderId, createdAt: '2026-09-10T11:57:59.000Z' }, now), true);
  assert.equal(bogStatusCheckIsDue({ provider: 'BOG', applicationOrderId: orderId, createdAt: '2026-09-10T11:58:01.000Z' }, now), false);
  assert.equal(bogStatusCheckIsDue({ provider: 'TBC', applicationOrderId: orderId, createdAt: '2026-09-10T11:00:00.000Z' }, now), false);
});

test('authenticates, fetches and caches BOG installment status', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const config = { bogClientId: `client-${Date.now()}`, bogClientSecret: 'secret-test' };
  const orderId = '279838cb-f41f-41c2-b9c9-151407acbbbf';
  let tokenCalls = 0;
  let statusCalls = 0;

  axios.post = async (url, body, options) => {
    tokenCalls += 1;
    assert.equal(url, 'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token');
    assert.match(body, /grant_type=client_credentials/);
    assert.match(options.headers.Authorization, /^Basic /);
    return { data: { access_token: 'test-token', expires_in: 3600 } };
  };
  axios.get = async (url, options) => {
    statusCalls += 1;
    assert.equal(url, `https://installment.bog.ge/v1/installment/checkout/${orderId}`);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { status: 200, data: { status: 'success', installment_status: 'success', shop_order_id: 'SHOP-1' } };
  };

  try {
    const first = await fetchBogStatus(orderId, config);
    const second = await fetchBogStatus(orderId, config);
    assert.equal(first.status, 'დამტკიცდა');
    assert.deepEqual(second, first);
    assert.equal(tokenCalls, 1);
    assert.equal(statusCalls, 1);
  } finally {
    axios.post = originalPost;
    axios.get = originalGet;
  }
});
