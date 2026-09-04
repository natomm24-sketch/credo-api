const axios = require('axios');
const crypto = require('crypto');

const SHOP = process.env.SHOPIFY_TRACKER_SHOP || 'x8hxwv-pn.myshopify.com';
const CLIENT_ID = process.env.SHOPIFY_TRACKER_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_TRACKER_CLIENT_SECRET;
const rateLimits = new Map();
const adminRateLimits = new Map();
let accessToken = null;
let tokenExpiresAt = 0;

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('995')) digits = digits.slice(3);
  if (digits.length > 9) digits = digits.slice(-9);
  return /^5\d{8}$/.test(digits) ? digits : '';
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ka-GE');
}

function requestAllowed(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const ip = forwarded.split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now - record.startedAt > 10 * 60 * 1000) {
    rateLimits.set(ip, { startedAt: now, count: 1 });
    return true;
  }

  record.count += 1;
  return record.count <= 8;
}

function setTrackerCors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowedOrigin =
    /^https:\/\/(?:www\.)?ezzy\.ge$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.chatgpt\.site$/i.test(origin) ||
    /^http:\/\/localhost(?::\d+)?$/i.test(origin);
  if (allowedOrigin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Cache-Control', 'no-store');
}

function adminRequestAllowed(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  const ip = forwarded.split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  const record = adminRateLimits.get(ip);
  if (!record || now - record.startedAt > 10 * 60 * 1000) {
    adminRateLimits.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  record.count += 1;
  return record.count <= 120;
}

function adminAuthorized(req) {
  const expected = String(process.env.TRACKER_ADMIN_PASSWORD || '');
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function requireAdmin(req, res) {
  setTrackerCors(req, res);
  if (!adminRequestAllowed(req)) {
    res.status(429).json({ error: 'ძალიან ბევრი მოთხოვნაა. რამდენიმე წუთში თავიდან სცადეთ.' });
    return false;
  }
  if (!adminAuthorized(req)) {
    res.status(401).json({ error: 'პაროლი არასწორია.' });
    return false;
  }
  return true;
}

function cleanAdminSearch(value) {
  return String(value || '').normalize('NFKC').trim().slice(0, 80).replace(/[^\p{L}\p{N}@.+# _-]/gu, '');
}

function assertShopifyId(value, resource) {
  const id = String(value || '');
  if (!new RegExp(`^gid:\\/\\/shopify\\/${resource}\\/\\d+$`).test(id)) throw new Error('არასწორი Shopify ID.');
  return id;
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Tracker credentials are not configured');

  const response = await axios.post(
    `https://${SHOP}/admin/oauth/access_token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  accessToken = response.data.access_token;
  tokenExpiresAt = Date.now() + Number(response.data.expires_in || 86399) * 1000;
  return accessToken;
}

async function graphql(query, variables) {
  const response = await axios.post(
    `https://${SHOP}/admin/api/2026-07/graphql.json`,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': await getAccessToken(),
      },
    },
  );

  if (response.data.errors?.length) {
    throw new Error(response.data.errors.map((error) => error.message).join('; '));
  }
  return response.data.data;
}

module.exports = function registerOrderTracker(app) {
  app.post('/api/track-order', async (req, res) => {
    setTrackerCors(req, res);

    if (!requestAllowed(req)) {
      return res.status(429).json({ error: 'ძალიან ბევრი მცდელობაა. გთხოვთ, რამდენიმე წუთში თავიდან სცადოთ.' });
    }

    const firstName = normalizeName(req.body?.firstName);
    const lastName = normalizeName(req.body?.lastName);
    const phone = normalizePhone(req.body?.phone);

    if (firstName.length < 2 || firstName.length > 50 || lastName.length < 2 || lastName.length > 50 || !phone) {
      return res.status(400).json({ error: 'შეავსეთ სახელი, გვარი და ქართული მობილურის ნომერი.' });
    }

    const search = [`"+995${phone}"`, `"995${phone}"`, `"${phone}"`].join(' OR ');
    const query = `
      query TrackOrders($search: String!) {
        orders(first: 50, query: $search, sortKey: CREATED_AT, reverse: true) {
          nodes {
            name createdAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { firstName lastName phone }
            shippingAddress { firstName lastName phone }
            billingAddress { firstName lastName phone }
            lineItems(first: 20) { nodes { name quantity variantTitle } }
            fulfillments { status trackingInfo(first: 10) { company number url } }
          }
        }
      }
    `;

    try {
      const data = await graphql(query, { search });
      const expectedFullName = `${firstName} ${lastName}`;
      const orders = (data.orders?.nodes || [])
        .filter((order) => {
          const contacts = [order.customer, order.shippingAddress, order.billingAddress].filter(Boolean);
          const phoneMatches = contacts.some((contact) => normalizePhone(contact.phone) === phone);
          const nameMatches = contacts.some((contact) => {
            const contactFirst = normalizeName(contact.firstName);
            const contactLast = normalizeName(contact.lastName);
            const contactFull = normalizeName(`${contactFirst} ${contactLast}`);
            return (contactFirst === firstName && contactLast === lastName) || contactFirst === expectedFullName || contactFull === expectedFullName;
          });
          return phoneMatches && nameMatches;
        })
        .slice(0, 10)
        .map((order) => ({
          number: order.name,
          createdAt: order.createdAt,
          financialStatus: order.displayFinancialStatus,
          fulfillmentStatus: order.displayFulfillmentStatus,
          total: order.totalPriceSet?.shopMoney || null,
          items: (order.lineItems?.nodes || []).map((item) => ({ name: item.name, quantity: item.quantity, variant: item.variantTitle || null })),
          tracking: (order.fulfillments || []).flatMap((fulfillment) =>
            (fulfillment.trackingInfo || []).map((info) => ({
              status: fulfillment.status,
              company: info.company || null,
              number: info.number || null,
              url: info.url || null,
            })),
          ),
        }));

      return res.json({ orders });
    } catch (error) {
      console.error('ORDER TRACKER ERROR:', error.response?.status || error.message);
      return res.status(503).json({ error: 'შეკვეთების მოძებნა დროებით ვერ მოხერხდა. გთხოვთ, მოგვიანებით სცადოთ.' });
    }
  });

  app.get('/api/admin/orders', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const search = cleanAdminSearch(req.query?.q);
    const query = `
      query AdminOrders($search: String) {
        orders(first: 50, query: $search, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            email phone note
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { displayName firstName lastName email phone }
            shippingAddress { name firstName lastName phone city address1 }
            lineItems(first: 50) { nodes { id name quantity variantTitle } }
            fulfillments { id status displayStatus trackingInfo(first: 10) { company number url } }
          }
        }
      }
    `;

    try {
      const data = await graphql(query, { search: search || null });
      const orders = (data.orders?.nodes || []).map((order) => ({
        id: order.id,
        number: order.name,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus,
        fulfillmentStatus: order.displayFulfillmentStatus,
        customer: {
          name: order.customer?.displayName || order.shippingAddress?.name || '',
          email: order.customer?.email || order.email || '',
          phone: order.customer?.phone || order.shippingAddress?.phone || order.phone || '',
        },
        shippingAddress: order.shippingAddress ? {
          name: order.shippingAddress.name || '',
          city: order.shippingAddress.city || '',
          address1: order.shippingAddress.address1 || '',
        } : null,
        note: order.note || '',
        total: order.totalPriceSet?.shopMoney || null,
        items: (order.lineItems?.nodes || []).map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          variant: item.variantTitle || null,
        })),
        fulfillmentOrders: [],
        fulfillments: (order.fulfillments || []).map((fulfillment) => ({
          id: fulfillment.id,
          status: fulfillment.status,
          displayStatus: fulfillment.displayStatus || null,
          tracking: (fulfillment.trackingInfo || []).map((info) => ({ company: info.company || '', number: info.number || '', url: info.url || '' })),
        })),
      }));
      return res.json({ orders });
    } catch (error) {
      console.error('ADMIN ORDERS ERROR:', error.response?.status || error.message);
      return res.status(503).json({ error: 'შეკვეთების ჩატვირთვა ვერ მოხერხდა.' });
    }
  });

  app.post('/api/admin/fulfill', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const fulfillmentOrderIds = Array.isArray(req.body?.fulfillmentOrderIds) ? req.body.fulfillmentOrderIds : [];
    const company = String(req.body?.company || '').trim().slice(0, 80);
    const number = String(req.body?.trackingNumber || '').trim().slice(0, 120);
    const url = String(req.body?.trackingUrl || '').trim().slice(0, 500);
    const notifyCustomer = req.body?.notifyCustomer !== false;

    try {
      if (!fulfillmentOrderIds.length || fulfillmentOrderIds.length > 20) throw new Error('შესასრულებელი შეკვეთა ვერ მოიძებნა.');
      const ids = fulfillmentOrderIds.map((id) => assertShopifyId(id, 'FulfillmentOrder'));
      if (url && !/^https:\/\//i.test(url)) throw new Error('Tracking ბმული უნდა იწყებოდეს https://-ით.');
      const mutation = `
        mutation FulfillOrder($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id status trackingInfo { company number url } }
            userErrors { field message }
          }
        }
      `;
      const created = [];
      for (const fulfillmentOrderId of ids) {
        const fulfillment = {
          lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
          notifyCustomer,
        };
        if (company || number || url) fulfillment.trackingInfo = { ...(company ? { company } : {}), ...(number ? { number } : {}), ...(url ? { url } : {}) };
        const data = await graphql(mutation, { fulfillment });
        const userErrors = data.fulfillmentCreate?.userErrors || [];
        if (userErrors.length) throw new Error(userErrors.map((item) => item.message).join('; '));
        created.push(data.fulfillmentCreate?.fulfillment);
      }
      return res.json({ ok: true, fulfillments: created });
    } catch (error) {
      console.error('ADMIN FULFILL ERROR:', error.response?.status || error.message);
      return res.status(400).json({ error: error.message || 'სტატუსის შეცვლა ვერ მოხერხდა.' });
    }
  });

  app.post('/api/admin/tracking', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const company = String(req.body?.company || '').trim().slice(0, 80);
    const number = String(req.body?.trackingNumber || '').trim().slice(0, 120);
    const url = String(req.body?.trackingUrl || '').trim().slice(0, 500);
    const notifyCustomer = req.body?.notifyCustomer === true;

    try {
      const fulfillmentId = assertShopifyId(req.body?.fulfillmentId, 'Fulfillment');
      if (!company && !number && !url) throw new Error('შეავსეთ tracking ინფორმაცია.');
      if (url && !/^https:\/\//i.test(url)) throw new Error('Tracking ბმული უნდა იწყებოდეს https://-ით.');
      const mutation = `
        mutation UpdateTracking($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
          fulfillmentTrackingInfoUpdate(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) {
            fulfillment { id status trackingInfo { company number url } }
            userErrors { field message }
          }
        }
      `;
      const trackingInfoInput = { ...(company ? { company } : {}), ...(number ? { number } : {}), ...(url ? { url } : {}) };
      const data = await graphql(mutation, { fulfillmentId, trackingInfoInput, notifyCustomer });
      const userErrors = data.fulfillmentTrackingInfoUpdate?.userErrors || [];
      if (userErrors.length) throw new Error(userErrors.map((item) => item.message).join('; '));
      return res.json({ ok: true, fulfillment: data.fulfillmentTrackingInfoUpdate?.fulfillment });
    } catch (error) {
      console.error('ADMIN TRACKING ERROR:', error.response?.status || error.message);
      return res.status(400).json({ error: error.message || 'Tracking ინფორმაციის განახლება ვერ მოხერხდა.' });
    }
  });
};
