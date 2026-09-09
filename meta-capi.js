const crypto = require('crypto');

const DEFAULT_GRAPH_API_VERSION = 'v24.0';

function sha256(value) {
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toLowerCase(), 'utf8')
    .digest('hex');
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `995${digits.slice(1)}`;
  if (digits.length === 9) digits = `995${digits}`;

  return digits;
}

function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
}

function buildPurchaseEvent({
  eventId,
  value,
  currency = 'GEL',
  contents = [],
  customer = {},
  sourceUrl = 'https://ezzy.ge/',
  orderId,
  eventTime = Math.floor(Date.now() / 1000)
}) {
  const amount = Number(value);

  if (!eventId || !orderId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid Meta Purchase event data');
  }

  const { firstName, lastName } = splitName(customer.name);
  const phone = normalizePhone(customer.phone);
  const userData = {
    external_id: [sha256(orderId)]
  };

  if (phone) userData.ph = [sha256(phone)];
  if (firstName) userData.fn = [sha256(firstName)];
  if (lastName) userData.ln = [sha256(lastName)];

  const normalizedContents = contents.map(item => ({
    id: String(item.id),
    quantity: Number(item.quantity) || 1,
    item_price: Number(item.item_price)
  })).filter(item => item.id && Number.isFinite(item.item_price));

  return {
    event_name: 'Purchase',
    event_time: eventTime,
    event_id: String(eventId),
    action_source: 'website',
    event_source_url: sourceUrl,
    user_data: userData,
    custom_data: {
      currency,
      value: amount,
      order_id: String(orderId),
      content_type: 'product',
      content_ids: normalizedContents.map(item => item.id),
      contents: normalizedContents
    }
  };
}

async function sendMetaPurchase(data, options = {}) {
  const pixelId = options.pixelId || process.env.META_PIXEL_ID;
  const accessToken = options.accessToken || process.env.META_CAPI_ACCESS_TOKEN;
  const graphVersion = options.graphVersion || process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
  const httpClient = options.httpClient || require('axios');

  if (!pixelId || !accessToken) {
    throw new Error('Meta CAPI is not configured');
  }

  const event = buildPurchaseEvent(data);
  const response = await httpClient.post(
    `https://graph.facebook.com/${graphVersion}/${pixelId}/events`,
    { data: [event] },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  return response.data;
}

module.exports = {
  buildPurchaseEvent,
  normalizePhone,
  sendMetaPurchase,
  splitName
};
