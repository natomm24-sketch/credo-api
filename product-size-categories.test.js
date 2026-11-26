const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  categoryTagsForProduct,
  productSizes,
  syncProductCategoryTags,
  validWebhookHmac,
} = require('./product-size-categories');

const product = (values, tags = []) => ({
  id: 'gid://shopify/Product/1', tags,
  variants: { nodes: values.map((value) => ({ title: String(value), selectedOptions: [{ name: 'ზომა', value: String(value) }] })) },
});

test('classifies the full product size range into one category', () => {
  assert.deepEqual(categoryTagsForProduct(product([36, 37, 40])), ['EZZY-WOMEN']);
  assert.deepEqual(categoryTagsForProduct(product([40, 41, 44])), ['EZZY-MEN']);
  assert.deepEqual(categoryTagsForProduct(product([41, 42, 44])), ['EZZY-MEN']);
  assert.deepEqual(categoryTagsForProduct(product([36, 38, 39, 41])), ['EZZY-UNISEX']);
  assert.deepEqual(categoryTagsForProduct(product([40])), ['EZZY-WOMEN', 'EZZY-MEN']);
});

test('reads numeric size values and ignores unrelated option text', () => {
  const item = product(['36', '40.5', 'Black']);
  item.variants.nodes[2].selectedOptions[0].name = 'Color';
  assert.deepEqual(productSizes(item), [36, 40.5]);
});

test('adds and removes only managed category tags', async () => {
  let variables;
  const graphql = async (_query, input) => {
    variables = input;
    return { add: { userErrors: [] }, remove: { userErrors: [] } };
  };
  const result = await syncProductCategoryTags(graphql, product([36, 42], ['Sale', 'EZZY-WOMEN', 'EZZY-MEN']));
  assert.equal(result.changed, true);
  assert.deepEqual(variables.add, ['EZZY-UNISEX']);
  assert.deepEqual(variables.remove, ['EZZY-WOMEN', 'EZZY-MEN']);
});

test('validates Shopify webhook HMAC against the raw body', () => {
  const rawBody = Buffer.from('{"id":1}');
  const secret = 'secret';
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  assert.equal(validWebhookHmac(rawBody, hmac, secret), true);
  assert.equal(validWebhookHmac(rawBody, 'wrong', secret), false);
});
