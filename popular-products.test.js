const test = require('node:test');
const assert = require('node:assert/strict');
const { hydratePopularProducts, rankDraftOrderProducts } = require('./popular-products');

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

test('hydrates ranked items with current Shopify product card data without changing rank order', async () => {
  const graphql = async (_query, variables) => {
    assert.deepEqual(variables.ids, ['gid://shopify/Product/2', 'gid://shopify/Product/1']);
    return {
      nodes: [
        {
          legacyResourceId: '1', handle: 'alpha', title: 'Alpha - Black', productType: 'Sneaker',
          featuredMedia: { preview: { image: { url: 'https://cdn.example/alpha.jpg' } } },
          variants: { nodes: [{ availableForSale: true, price: '199.00', compareAtPrice: '259.00' }] },
        },
        {
          legacyResourceId: '2', handle: 'beta', title: 'Beta - Blue', productType: 'Boot',
          featuredMedia: null,
          variants: { nodes: [{ availableForSale: false, price: '219.50', compareAtPrice: null }] },
        },
      ],
    };
  };

  assert.deepEqual(await hydratePopularProducts(graphql, [
    { id: '2', handle: 'old-beta', quantity: 7 },
    { id: '1', handle: 'old-alpha', quantity: 4 },
  ]), [
    { id: '2', handle: 'beta', title: 'Beta - Blue', productType: 'Boot', image: '', priceMinor: 21950, compareAtPriceMinor: null, quantity: 7 },
    { id: '1', handle: 'alpha', title: 'Alpha - Black', productType: 'Sneaker', image: 'https://cdn.example/alpha.jpg', priceMinor: 19900, compareAtPriceMinor: 25900, quantity: 4 },
  ]);
});

