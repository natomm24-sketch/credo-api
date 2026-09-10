const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const axios = {
  post: async () => { throw new Error('Unexpected token request'); },
  request: async () => { throw new Error('Unexpected status request'); },
};
const originalLoad = Module._load;
Module._load = function loadWithAxiosStub(request, parent, isMain) {
  if (request === 'axios') return axios;
  return originalLoad.call(this, request, parent, isMain);
};
const tracker = require('./tracker');
Module._load = originalLoad;

const {
  parseTbcStatusPayload,
  tbcStatusCheckIsDue,
  fetchTbcStatus,
} = tracker.statusHelpers;

test('maps documented TBC application statuses', () => {
  assert.equal(parseTbcStatusPayload({ statusId: 1 }).status, 'განაცხადი მუშავდება');
  assert.equal(parseTbcStatusPayload({ statusId: 2 }).status, 'დამტკიცდა');
  assert.equal(parseTbcStatusPayload({ statusId: 6 }).status, 'დაუარდა');
  assert.equal(parseTbcStatusPayload({ statusId: 8 }).status, 'თანხა ჩარიცხულია');
});

test('handles unavailable TBC status responses', () => {
  assert.equal(parseTbcStatusPayload({}, 404).available, false);
  assert.equal(parseTbcStatusPayload({ statusId: null }, 200).available, false);
});

test('automatically checks TBC applications after two minutes', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');
  const session = '279838cb-f41f-41c2-b9c9-151407acbbbf';
  assert.equal(tbcStatusCheckIsDue({ provider: 'TBC', applicationSessionId: session, createdAt: '2026-09-10T11:57:59.000Z' }, now), true);
  assert.equal(tbcStatusCheckIsDue({ provider: 'TBC', applicationSessionId: session, createdAt: '2026-09-10T11:58:01.000Z' }, now), false);
  assert.equal(tbcStatusCheckIsDue({ provider: 'CREDO', applicationSessionId: session, createdAt: '2026-09-10T11:00:00.000Z' }, now), false);
});

test('uses GET with merchantKey and caches repeated TBC status checks', async () => {
  const originalPost = axios.post;
  const originalRequest = axios.request;
  const config = { tbcApiKey: `key-${Date.now()}`, tbcApiSecret: 'secret-test', tbcMerchantKey: 'merchant-test' };
  const sessionId = '279838cb-f41f-41c2-b9c9-151407acbbbf';
  let tokenCalls = 0;
  let statusCalls = 0;

  axios.post = async (url, body, options) => {
    tokenCalls += 1;
    assert.equal(url, 'https://api.tbcbank.ge/oauth/token');
    assert.match(body, /grant_type=client_credentials/);
    assert.match(options.headers.Authorization, /^Basic /);
    return { data: { access_token: 'test-token', expires_in: 3600 } };
  };
  axios.request = async (options) => {
    statusCalls += 1;
    assert.equal(options.method, 'GET');
    assert.equal(options.url, `https://api.tbcbank.ge/v1/online-installments/applications/${sessionId}/status`);
    assert.deepEqual(options.data, { merchantKey: config.tbcMerchantKey });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return { status: 200, data: { statusId: 5, description: 'Waiting for merchant decision' } };
  };

  try {
    const first = await fetchTbcStatus(sessionId, config);
    const second = await fetchTbcStatus(sessionId, config);
    assert.equal(first.status, 'მაღაზიის გადაწყვეტილებას ელოდება');
    assert.deepEqual(second, first);
    assert.equal(tokenCalls, 1);
    assert.equal(statusCalls, 1);
  } finally {
    axios.post = originalPost;
    axios.request = originalRequest;
  }
});
