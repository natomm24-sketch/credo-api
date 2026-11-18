const test = require('node:test');
const assert = require('node:assert/strict');
const { rankDraftOrderProducts } = require('./popular-products');

test('ranks Shopify products by total quantity across draft orders', () => {
  const product = (id, handle, quantity) => ({
    quantity,
    product: { legacyResourceId: id, handle },
  });
  const drafts = [
    { lineItems: { nodes: [product('1', 'alpha', 1), product('2', 'beta', 2)] } },
    { lineItems: { nodes: [product('1', 'alpha', 3), product('3', 'gamma', 1)] } },
  ];

  assert.deepEqual(rankDraftOrderProducts(drafts, 3), [
    { id: '1', handle: 'alpha', quantity: 4 },
    { id: '2', handle: 'beta', quantity: 2 },
    { id: '3', handle: 'gamma', quantity: 1 },
  ]);
});

test('ignores custom draft lines that are not linked to a Shopify product', () => {
  const drafts = [{
    lineItems: {
      nodes: [
        { quantity: 9, product: null },
        { quantity: 2, product: { legacyResourceId: '4', handle: 'delta' } },
      ],
    },
  }];

  assert.deepEqual(rankDraftOrderProducts(drafts), [
    { id: '4', handle: 'delta', quantity: 2 },
  ]);
});

