const assert = require('node:assert/strict');
const test = require('node:test');

const {
  deliveryDetails,
  deliveryNote,
  deliveryTag,
  draftShippingLine,
  normalizeDeliveryZone,
  productsWithDelivery,
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

