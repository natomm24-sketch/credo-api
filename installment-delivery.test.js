const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deliveryDetails,
  deliveryDetailsFromTags,
  deliveryNote,
  deliveryTag,
  draftShippingLine,
  normalizeDeliveryZone,
  productsWithCredoDelivery,
  productsWithDelivery,
  totalWithDeliveryFallback,
} = require('./installment-delivery');

test('maps Tbilisi and region to server-owned delivery fees', () => {
  assert.deepEqual(deliveryDetails('tbilisi'), {
    zone: 'tbilisi',
    fee: 8,
    title: 'Delivery - Tbilisi',
    itemId: 'DELIVERY_TBILISI',
    tag: 'DELIVERY-INCLUDED-TBILISI',
  });
  assert.equal(deliveryDetails('რეგიონი').fee, 11);
  assert.equal(normalizeDeliveryZone('თბილისი'), 'tbilisi');
});

test('keeps legacy requests backward compatible', () => {
  const products = [{ id: 1, title: 'Shoe', amount: 1, price: 149 }];
  assert.deepEqual(productsWithDelivery(products), products);
  assert.equal(draftShippingLine(), null);
  assert.equal(deliveryTag(), 'DELIVERY-COD-LEGACY');
  assert.match(deliveryNote(), /კურიერთან გადახდა/);
});

test('adds delivery once and ignores a client-supplied delivery item', () => {
  const products = [
    { id: 1, title: 'Shoe', amount: 2, price: 149 },
    { id: 'DELIVERY_TBILISI', title: 'Fake delivery', amount: 10, price: 0.01 },
  ];
  const withDelivery = productsWithDelivery(products, 'region');

  assert.equal(withDelivery.length, 2);
  assert.deepEqual(withDelivery[1], {
    id: 'DELIVERY_REGION',
    title: 'Delivery - Region',
    product_title: 'Delivery - Region',
    amount: 1,
    price: 11,
    is_delivery: true,
  });
  assert.deepEqual(draftShippingLine('region'), {
    title: 'Delivery - Region',
    price: '11.00',
  });
  assert.equal(deliveryTag('region'), 'DELIVERY-INCLUDED-REGION');
  assert.match(deliveryNote('region'), /11\.00 GEL \(ბანკის განაცხადში ჩათვლილია\)/);
});

test('rejects unknown delivery zones instead of trusting a client fee', () => {
  assert.throws(
    () => productsWithDelivery([], 'tbilisi:1'),
    (error) => error.code === 'INVALID_DELIVERY_ZONE',
  );
});



test('merges delivery into the Credo product price in tetri', () => {
  assert.deepEqual(
    productsWithCredoDelivery(
      [{ id: 1, title: 'Shoe', amount: 1, price: 14900 }],
      'tbilisi',
    ),
    [{ id: 1, title: 'Shoe', amount: 1, price: 15700 }],
  );
});

test('charges Credo delivery once when every product quantity is greater than one', () => {
  const products = productsWithCredoDelivery(
    [
      { id: 1, title: 'Shoe', amount: 2, price: 14900 },
      { id: 'DELIVERY_REGION', title: 'Fake delivery', amount: 1, price: 1 },
    ],
    'region',
  );

  assert.deepEqual(products, [
    { id: 1, title: 'Shoe', amount: 1, price: 16000 },
    { id: 1, title: 'Shoe', amount: 1, price: 14900 },
  ]);
  assert.equal(products.reduce((sum, product) => sum + product.price * product.amount, 0), 30900);
});

test('keeps Shopify total when its shipping total is already present', () => {
  const total = { amount: '157.00', currencyCode: 'GEL' };
  assert.equal(
    totalWithDeliveryFallback(
      total,
      { amount: '8.00', currencyCode: 'GEL' },
      ['BOG', 'DELIVERY-INCLUDED-TBILISI'],
    ),
    total,
  );
});

test('adds the tagged delivery fee to the tracker total only when Shopify shipping is missing', () => {
  assert.deepEqual(
    totalWithDeliveryFallback(
      { amount: '219.00', currencyCode: 'GEL' },
      { amount: '0.00', currencyCode: 'GEL' },
      ['TBC', 'DELIVERY-INCLUDED-REGION'],
    ),
    { amount: '230.00', currencyCode: 'GEL' },
  );
  assert.equal(deliveryDetailsFromTags(['DELIVERY-INCLUDED-REGION']).fee, 11);
});

test('does not change legacy orders that were never charged delivery by the bank', () => {
  const total = { amount: '219.00', currencyCode: 'GEL' };
  assert.equal(totalWithDeliveryFallback(total, null, ['TBC']), total);
});
