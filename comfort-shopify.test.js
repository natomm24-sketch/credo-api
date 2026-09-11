const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup(env, post, clock = () => 1_000_000) {
  const context = { require: () => ({ post }), process: { env }, Date: { now: clock }, URLSearchParams, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./comfort-shopify'), 'utf8'), context);
  return context.module.exports;
}
const credentials = { SHOPIFY_COMFORT_CLIENT_ID: 'comfort-id', SHOPIFY_COMFORT_CLIENT_SECRET: 'comfort-secret', SHOPIFY_TRACKER_CLIENT_ID: 'ezzy-id', SHOPIFY_TRACKER_CLIENT_SECRET: 'ezzy-secret' };

test('Comfortmix uses only its own credentials and shares concurrent token refresh', async () => {
  let calls = 0;
  const api = setup(credentials, async (url, body) => {
    calls++;
    assert.equal(url, 'https://comfortmix.myshopify.com/admin/oauth/access_token');
    assert.equal(new URLSearchParams(body).get('client_id'), 'comfort-id');
    assert.equal(new URLSearchParams(body).get('client_secret'), 'comfort-secret');
    return { data: { access_token: 'comfort-token', expires_in: 86399 } };
  });
  assert.deepEqual(await Promise.all([api.getAccessToken(), api.getAccessToken()]), ['comfort-token', 'comfort-token']);
  assert.equal(await api.getAccessToken(), 'comfort-token');
  assert.equal(calls, 1);
});

test('refreshes before expiry and retries after failed refresh without disclosing credentials', async () => {
  let now = 1_000_000;
  let calls = 0;
  const api = setup(credentials, async () => {
    calls++;
    if (calls === 2) throw new Error('request included comfort-secret');
    return { data: { access_token: `token-${calls}`, expires_in: 120 } };
  }, () => now);
  assert.equal(await api.getAccessToken(), 'token-1');
  now += 61_000;
  await assert.rejects(api.getAccessToken(), { message: 'Comfortmix Shopify authentication failed' });
  assert.equal(await api.getAccessToken(), 'token-3');
});

test('missing Comfortmix credentials never use EZZY credentials', async () => {
  const api = setup({ SHOPIFY_TRACKER_CLIENT_ID: 'ezzy-id', SHOPIFY_TRACKER_CLIENT_SECRET: 'ezzy-secret' }, () => assert.fail('must not request an EZZY token'));
  await assert.rejects(api.getAccessToken(), /Comfortmix Shopify credentials are not configured/);
});

test('invalid token responses are not cached', async () => {
  let calls = 0;
  const api = setup(credentials, async () => { calls++; return { data: { access_token: 'bad' } }; });
  await assert.rejects(api.getAccessToken(), /authentication failed/);
  await assert.rejects(api.getAccessToken(), /authentication failed/);
  assert.equal(calls, 2);
});

test('explicit Comfortmix access token works without client credentials', async () => {
  const api = setup({ SHOPIFY_COMFORT_ACCESS_TOKEN: 'comfort-only' }, () => assert.fail('no exchange required'));
  assert.equal(await api.getAccessToken(), 'comfort-only');
});
