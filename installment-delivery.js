'use strict';

const DELIVERY_ZONES = Object.freeze({
  tbilisi: Object.freeze({
    fee: 8,
    title: 'Delivery - Tbilisi',
    itemId: 'DELIVERY_TBILISI',
    tag: 'DELIVERY-INCLUDED-TBILISI',
  }),
  region: Object.freeze({
    fee: 11,
    title: 'Delivery - Region',
    itemId: 'DELIVERY_REGION',
    tag: 'DELIVERY-INCLUDED-REGION',
  }),
});

const DELIVERY_ITEM_IDS = new Set(
  Object.values(DELIVERY_ZONES).map((zone) => zone.itemId),
);

function normalizeDeliveryZone(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  const aliases = {
    tbilisi: 'tbilisi',
    'თბილისი': 'tbilisi',
    region: 'region',
    regions: 'region',
    'რეგიონი': 'region',
    'რეგიონები': 'region',
  };

  const zone = aliases[normalized];
  if (!zone) {
    const error = new Error('Invalid delivery zone');
    error.code = 'INVALID_DELIVERY_ZONE';
    throw error;
  }

  return zone;
}

function deliveryDetails(value) {
  const zone = normalizeDeliveryZone(value);
  if (!zone) return null;
  return { zone, ...DELIVERY_ZONES[zone] };
}

function isDeliveryItem(product) {
  return DELIVERY_ITEM_IDS.has(String(product?.id || '').toUpperCase());
}

function productsWithDelivery(products, value) {
  const safeProducts = Array.isArray(products)
    ? products.filter((product) => !isDeliveryItem(product))
    : [];
  const delivery = deliveryDetails(value);

  if (!delivery) return safeProducts;

  return [
    ...safeProducts,
    {
      id: delivery.itemId,
      title: delivery.title,
      product_title: delivery.title,
      amount: 1,
      price: delivery.fee,
      is_delivery: true,
    },
  ];
}

function productsWithCredoDelivery(products, value) {
  const safeProducts = Array.isArray(products)
    ? products.filter((product) => !isDeliveryItem(product)).map((product) => ({ ...product }))
    : [];
  const delivery = deliveryDetails(value);

  if (!delivery || !safeProducts.length) return safeProducts;

  const deliveryInTetri = delivery.fee * 100;
  const singleQuantityIndex = safeProducts.findIndex(
    (product) => Number(product.amount || 1) === 1,
  );
  const targetIndex = singleQuantityIndex >= 0 ? singleQuantityIndex : 0;
  const target = safeProducts[targetIndex];
  const quantity = Number(target.amount || 1);
  const price = Number(target.price);

  if (quantity > 1 && Number.isInteger(quantity)) {
    safeProducts.splice(
      targetIndex,
      1,
      { ...target, amount: 1, price: price + deliveryInTetri },
      { ...target, amount: quantity - 1 },
    );
  } else {
    safeProducts[targetIndex] = { ...target, price: price + deliveryInTetri };
  }

  return safeProducts;
}

function draftShippingLine(value) {
  const delivery = deliveryDetails(value);
  if (!delivery) return null;
  return {
    title: delivery.title,
    price: delivery.fee.toFixed(2),
  };
}

function deliveryNote(value) {
  const delivery = deliveryDetails(value);
  if (!delivery) return 'მიწოდება: კურიერთან გადახდა (ძველი ფორმა)';
  const zoneLabel = delivery.zone === 'tbilisi' ? 'თბილისი' : 'რეგიონი';
  return `მიწოდება: ${zoneLabel} - ${delivery.fee.toFixed(2)} GEL (ბანკის განაცხადში ჩათვლილია)`;
}

function deliveryTag(value) {
  const delivery = deliveryDetails(value);
  return delivery ? delivery.tag : 'DELIVERY-COD-LEGACY';
}

function deliveryDetailsFromTags(tags) {
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim().toUpperCase())
    : String(tags || '').split(',').map((tag) => tag.trim().toUpperCase());

  return Object.values(DELIVERY_ZONES).find(
    (delivery) => normalizedTags.includes(delivery.tag.toUpperCase()),
  ) || null;
}

function totalWithDeliveryFallback(total, shippingTotal, tags) {
  const delivery = deliveryDetailsFromTags(tags);
  const totalAmount = Number(total?.amount);
  const shippingAmount = Number(shippingTotal?.amount);

  if (!delivery || !Number.isFinite(totalAmount)) return total || null;

  // Shopify documents totalPriceSet as shipping-inclusive. Only add our
  // server-owned fee if Shopify reports no shipping total for a tagged order.
  if (Number.isFinite(shippingAmount) && shippingAmount > 0) return total;

  return {
    ...total,
    amount: (totalAmount + delivery.fee).toFixed(2),
  };
}

module.exports = {
  DELIVERY_ZONES,
  deliveryDetails,
  deliveryDetailsFromTags,
  deliveryNote,
  deliveryTag,
  draftShippingLine,
  normalizeDeliveryZone,
  productsWithCredoDelivery,
  productsWithDelivery,
  totalWithDeliveryFallback,
};

