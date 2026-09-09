const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function setup() {
  const source = fs.readFileSync(`${__dirname}/server.js`, 'utf8');
  const start = source.indexOf('const reviewRateLimits =');
  const end = source.indexOf('const SHOP =', start);
  const routes = {}, fields = new Map();
  let tokens = 0, writes = 0;
  function verify(url, options) {
    assert.ok(url.startsWith('https://review-test.myshopify.com/admin/api/'));
    assert.equal(options.headers['X-Shopify-Access-Token'], 'renewable-test-token');
  }
  const axios = {
    async get(url, options) {
      verify(url, options);
      const id = url.match(/products\/(\d+)/)[1];
      return { data: { metafields: fields.has(id) ? [fields.get(id)] : [] } };
    },
    async post(url, body, options) {
      verify(url, options); writes++;
      const id = url.match(/products\/(\d+)/)[1];
      fields.set(id, { ...body.metafield, id: `field-${id}` });
    },
    async put(url, body, options) {
      verify(url, options); writes++;
      const id = body.metafield.id.slice(6);
      fields.set(id, { ...fields.get(id), ...body.metafield });
    }
  };
  vm.runInNewContext(source.slice(start, end), {
    app: { get: (p, f) => routes.GET = f, post: (p, f) => routes.POST = f },
    require: (name) => {
      assert.equal(name, './tracker');
      return { shopify: { shop: 'review-test.myshopify.com', getAccessToken: async () => { tokens++; return 'renewable-test-token'; } } };
    }, axios, crypto, URL, console: { error() {} }
  });
  async function call(method, body = {}, origin = 'https://ezzy.ge') {
    let status = 200, data;
    await routes[method]({ body, query: body, ip: 'test', get: () => origin }, {
      status(n) { status = n; return this; }, json(value) { data = value; return this; }
    });
    return { status, data };
  }
  return { call, fields, counters: () => ({ tokens, writes }) };
}

test('reviews use renewable credentials for reads, creates and updates', async () => {
  const s = setup();
  assert.equal((await s.call('GET', { productId: '123' })).data.count, 0);
  assert.equal(s.counters().writes, 0);
  const first = await s.call('POST', { productId: '123', name: 'ტესტი', rating: 5 });
  assert.equal(first.status, 201);
  assert.equal(first.data.count, 1);
  const second = await s.call('POST', { productId: '123', name: 'ტესტი 2', rating: 3 });
  assert.equal(second.status, 201);
  const persisted = await s.call('GET', { productId: '123' });
  assert.equal(persisted.data.count, 2);
  assert.equal(persisted.data.average, 4);
  assert.equal(s.counters().writes, 2);
  assert.equal(s.counters().tokens, 6);
});

test('parallel submissions are retained and invalid requests do not write', async () => {
  const s = setup();
  await Promise.all([1, 2].map(n => s.call('POST', { productId: '321', name: `Test ${n}`, rating: n })));
  assert.equal((await s.call('GET', { productId: '321' })).data.count, 2);
  assert.equal((await s.call('POST', { productId: '321', name: 'Test', rating: 6 })).status, 400);
  assert.equal((await s.call('POST', { productId: '321', name: 'Test', rating: 5 }, 'https://unrelated.example')).status, 403);
  assert.equal(s.counters().writes, 2);
});

