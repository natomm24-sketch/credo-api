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

module.exports = {
  DELIVERY_ZONES,
  deliveryDetails,
  deliveryNote,
  deliveryTag,
  draftShippingLine,
  normalizeDeliveryZone,
  productsWithDelivery,
};

