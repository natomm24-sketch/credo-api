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
  async function graphql(query, variables) {
    tokens++;
    const id = String(variables.id || variables.metafields?.[0]?.ownerId || '').split('/').pop();
    if (query.includes('ProductReviewMetafield')) {
      return { product: { metafield: fields.get(id) || null } };
    }
    assert.ok(query.includes('SaveProductReviews'));
    writes++;
    const input = variables.metafields[0];
    fields.set(id, { id: `field-${id}`, value: input.value, type: input.type });
    return { metafieldsSet: { metafields: [fields.get(id)], userErrors: [] } };
  }
  vm.runInNewContext(source.slice(start, end), {
    app: { get: (p, f) => routes.GET = f, post: (p, f) => routes.POST = f },
    require: (name) => {
      assert.equal(name, './tracker');
      return { shopify: { graphql } };
    }, crypto, URL, console: { error() {} }
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

