const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');
const Keepz = require('./keepz');
const { v4: uuidv4 } = require('uuid');
const { sendMetaPurchase } = require('./meta-capi');

const app = express();
const pendingOrders = {};

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/* ===================== CREDO (OLD COMPANY / COMFORTMIX) ===================== */

const MERCHANT_ID_COMFORT = requiredEnv('CREDO_MERCHANT_ID_COMFORT');
const SECRET_COMFORT = requiredEnv('CREDO_SECRET_COMFORT');

/* ===================== TBC (OLD COMPANY / COMFORTMIX) ===================== */

const TBC_API_KEY_COMFORT = requiredEnv('TBC_API_KEY_COMFORT');
const TBC_API_SECRET_COMFORT = requiredEnv('TBC_API_SECRET_COMFORT');
const TBC_MERCHANT_COMFORT = requiredEnv('TBC_MERCHANT_COMFORT');
const TBC_CAMPAIGN_COMFORT = Number(process.env.TBC_CAMPAIGN_COMFORT || 529);

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/* ===================== EZZY PRODUCT REVIEWS ===================== */

const reviewRateLimits = new Map();
const reviewWriteQueues = new Map();
const REVIEW_NAMESPACE = 'ezzy';
const REVIEW_KEY = 'product_reviews';
const orderTracker = require('./tracker');
const { shop: EZZY_SHOP, getAccessToken: getEzzyAccessToken, graphql: ezzyGraphql } = orderTracker.shopify;


function isEzzyStorefrontRequest(req) {
  const origin = String(req.get('origin') || '');
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === 'ezzy.ge' || hostname === 'www.ezzy.ge' || hostname.endsWith('.myshopify.com');
  } catch (_) {
    return false;
  }
}

function cleanReviewText(value, maxLength) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

async function getReviewMetafield(productId) {
  const data = await ezzyGraphql(`
    query ProductReviewMetafield($id: ID!) {
      product(id: $id) {
        metafield(namespace: "${REVIEW_NAMESPACE}", key: "${REVIEW_KEY}") {
          id value type
        }
      }
    }
  `, { id: `gid://shopify/Product/${productId}` });
  return data.product?.metafield || null;
}

async function saveReviewMetafield(productId, reviews) {
  const data = await ezzyGraphql(`
    mutation SaveProductReviews($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id value type }
        userErrors { field message code }
      }
    }
  `, {
    metafields: [{
      ownerId: `gid://shopify/Product/${productId}`,
      namespace: REVIEW_NAMESPACE,
      key: REVIEW_KEY,
      type: 'json',
      value: JSON.stringify(reviews)
    }]
  });
  const userErrors = data.metafieldsSet?.userErrors || [];
  if (userErrors.length) throw new Error(userErrors.map(item => item.message).join('; '));
}

function parseStoredReviews(metafield) {
  if (!metafield?.value) return [];
  try {
    const reviews = JSON.parse(metafield.value);
    return Array.isArray(reviews) ? reviews : [];
  } catch (_) {
    return [];
  }
}

function summarizeReviews(reviews) {
  const visible = reviews.filter(review => review.approved !== false);
  const total = visible.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return {
    average: visible.length ? Number((total / visible.length).toFixed(1)) : 0,
    count: visible.length,
    reviews: visible.slice().reverse()
  };
}

app.get('/api/reviews', async (req, res) => {
  if (!isEzzyStorefrontRequest(req)) return res.status(403).json({ error: 'Origin not allowed' });
  const productId = String(req.query.productId || '').replace(/\D/g, '');
  if (!productId) return res.status(400).json({ error: 'Product ID required' });

  try {
    const metafield = await getReviewMetafield(productId);
    return res.json(summarizeReviews(parseStoredReviews(metafield)));
  } catch (error) {
    console.error('REVIEWS GET ERROR:', error.response?.status || error.message);
    return res.status(500).json({ error: 'Reviews unavailable' });
  }
});

app.post('/api/reviews', async (req, res) => {
  if (!isEzzyStorefrontRequest(req)) return res.status(403).json({ error: 'Origin not allowed' });

  const productId = String(req.body.productId || '').replace(/\D/g, '');
  const productHandle = cleanReviewText(req.body.productHandle, 120);
  const name = cleanReviewText(req.body.name, 50);
  const rating = Number(req.body.rating);
  if (!productId || !name || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid review' });
  }

  const clientKey = `${req.ip}:${productId}`;
  const now = Date.now();
  const recent = (reviewRateLimits.get(clientKey) || []).filter(time => now - time < 10 * 60 * 1000);
  if (recent.length >= 3) return res.status(429).json({ error: 'Please try again later' });
  reviewRateLimits.set(clientKey, [...recent, now]);

  const previousQueue = reviewWriteQueues.get(productId) || Promise.resolve();
  const writeTask = previousQueue.then(async () => {
    const metafield = await getReviewMetafield(productId);
    const reviews = parseStoredReviews(metafield).slice(-199);
    reviews.push({
      id: crypto.randomUUID(),
      productHandle,
      name,
      rating,
      createdAt: new Date().toISOString(),
      approved: true
    });

    await saveReviewMetafield(productId, reviews);
    return summarizeReviews(reviews);
  });

  reviewWriteQueues.set(productId, writeTask.catch(() => {}));
  try {
    return res.status(201).json(await writeTask);
  } catch (error) {
    console.error('REVIEWS POST ERROR:', error.response?.status || error.message);
    return res.status(500).json({ error: 'Review could not be saved' });
  }
});


const SHOP = EZZY_SHOP;

const SHOPIFY_STORE = EZZY_SHOP;

const SHOPIFY_CLIENT_ID = requiredEnv('SHOPIFY_CLIENT_ID');
const SHOPIFY_CLIENT_SECRET = requiredEnv('SHOPIFY_CLIENT_SECRET');

const KEEPZ_INTEGRATOR_ID = requiredEnv('KEEPZ_INTEGRATOR_ID');
const KEEPZ_PUBLIC_KEY = requiredEnv('KEEPZ_PUBLIC_KEY');
const KEEPZ_PRIVATE_KEY = requiredEnv('KEEPZ_PRIVATE_KEY');
const KEEPZ_RECEIVER_ID = requiredEnv('KEEPZ_RECEIVER_ID');

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ===================== BOG EZZY ===================== */

const BOG_CLIENT_ID_EZZY = process.env.BOG_CLIENT_ID_EZZY;
const BOG_CLIENT_SECRET_EZZY = process.env.BOG_CLIENT_SECRET_EZZY;

async function createBogCheckoutForStore({
  products,
  shopOrderId,
  storefrontUrl,
  month = 12,
  discountCode,
}) {
  if (!Array.isArray(products) || !products.length) {
    const error = new Error('No products');
    error.statusCode = 400;
    throw error;
  }

  const tokenResponse = await axios.post(
    'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',
    qs.stringify({ grant_type: 'client_credentials' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${BOG_CLIENT_ID_EZZY}:${BOG_CLIENT_SECRET_EZZY}`).toString('base64')}`,
      },
    }
  );

  const amount = Number(products.reduce((sum, product) => {
    const rawPrice = Number(product.price);
    const price = rawPrice > 10000 ? rawPrice / 100 : rawPrice;
    return sum + price * (Number(product.amount) || 1);
  }, 0));

  const cartItems = products.map((product) => ({
    total_item_amount:
      (Number(product.price) > 10000 ? Number(product.price) / 100 : Number(product.price))
      * (Number(product.amount) || 1),
    item_description: product.product_title
      ? `${product.product_title} - ${product.title}`
      : (product.title || 'Product'),
    total_item_qty: Number(product.amount) || 1,
    item_vendor_code: String(product.id),
    product_image_url: storefrontUrl,
    item_site_detail_url: storefrontUrl,
  }));

  const checkout = {
    intent: 'LOAN',
    installment_month: Number(month) || 12,
    installment_type: 'STANDARD',
    shop_order_id: shopOrderId,
    success_redirect_url: `${storefrontUrl}/pages/payment-success`,
    fail_redirect_url: `${storefrontUrl}/payment-fail`,
    reject_redirect_url: `${storefrontUrl}/payment-fail`,
    validate_items: true,
    locale: 'ka',
    purchase_units: [{ amount: { currency_code: 'GEL', value: amount } }],
    cart_items: cartItems,
  };

  if (discountCode) checkout.discount_code = discountCode;

  const checkoutResponse = await axios.post(
    'https://installment.bog.ge/v1/installment/checkout',
    checkout,
    {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const redirectLink = checkoutResponse.data.links?.find((link) => link.rel === 'target');

  return {
    redirectUrl: redirectLink?.href,
    orderId: checkoutResponse.data.order_id,
  };
}

/* ===================== CREDO ===================== */

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const orderCode = 'ORD_' + Date.now();

    const formattedProducts = products.map(p => ({
      id: String(p.id),
      title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
      amount: Number(p.amount || 1),
      price: Number(p.price),
      type: 0
    }));

    let stringToHash = '';
    formattedProducts.forEach(p => {
      stringToHash += p.id + p.title + p.amount + p.price + "0";
    });
    stringToHash += SECRET_COMFORT;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');
console.log("CREDO MERCHANT:", MERCHANT_ID_COMFORT);

console.log("CREDO REQUEST:", {
  merchantId: MERCHANT_ID_COMFORT,
  orderCode,
  products: formattedProducts
});
    
    const data = {
      merchantId: MERCHANT_ID_COMFORT,
      orderCode: orderCode,
      check: check,
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = 0;
    });

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    let redirectUrl =
      response.headers.location ||
      (response.headers.refresh && response.headers.refresh.includes('url=') ? response.headers.refresh.split('url=')[1] : null) ||
      (response.data && response.data.URL) ||
      (response.data && response.data.data && response.data.data.URL);

    if (redirectUrl) {
      return res.json({ redirectUrl, orderCode });
    }

    return res.status(400).json({
      error: "No redirect URL",
      bankResponse: response.data
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

/* ===================== SHOPIFY + CREDO FLOW ===================== */

app.post('/api/create-order-and-credo', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const amount = Number(req.body.amount);

    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `Credo Order
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "CREDO",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }
    );

    const draftOrder = shopifyResponse.data.draft_order;

    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order',
      { products },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json({
      draftOrderId: draftOrder.id,
      redirectUrl: credoResponse.data.redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== TBC ===================== */

app.post('/api/tbc-order', async (req, res) => {
  try {
     console.log("FULL BODY:", req.body);
    console.log("PRODUCTS FROM FRONT:", req.body.products);
    
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products" });
    }

    /* TOKEN */
    const tokenResponse = await axios.post(
      'https://api.tbcbank.ge/oauth/token',
      qs.stringify({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
  TBC_API_KEY_COMFORT + ':' + TBC_API_SECRET_COMFORT
).toString('base64')
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    /* INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: TBC_MERCHANT_COMFORT,
campaignId: TBC_CAMPAIGN_COMFORT,
     priceTotal: Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
),

currency: "GEL",

invoiceId: "INV_" + Date.now(),

products: products.map(p => ({
  
  name: p.product_title
    ? `${p.product_title} - ${p.title}`
    : (p.title || "Product"),

  price:
    Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price),

  quantity: Number(p.amount) || 1

}))
  },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    console.log("STATUS:", tbcResponse.status);
    console.log("HEADERS:", tbcResponse.headers);
    console.log("DATA:", tbcResponse.data);

    const redirectUrl = tbcResponse.headers.location;

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        status: tbcResponse.status,
        headers: tbcResponse.headers,
        data: tbcResponse.data
      });
    }

    return res.json({ redirectUrl, sessionId: tbcResponse.data?.sessionId || null });

  } catch (err) {
    console.log("TBC ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== TBC CART EZZY ===================== */

app.post('/api/tbc-order-cart', async (req, res) => {
  try {

    console.log("CART PRODUCTS:", req.body.products);

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!products.length) {
      return res.status(400).json({
        error: "No products"
      });
    }

    const tokenResponse = await axios.post(
      'https://api.tbcbank.ge/oauth/token',
      qs.stringify({
        grant_type: 'client_credentials'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization':
            'Basic ' +
            Buffer.from(
              TBC_API_KEY_COMFORT +
              ':' +
              TBC_API_SECRET_COMFORT
            ).toString('base64')
        }
      }
    );

    const accessToken =
      tokenResponse.data.access_token;

    const priceTotal = products.reduce(
  (sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  },
  0
);

    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: TBC_MERCHANT_COMFORT,
        campaignId: TBC_CAMPAIGN_COMFORT,

        priceTotal,

        currency: "GEL",

        invoiceId:
          "CART_" + Date.now(),

        products: products.map(p => ({

          name:
            p.product_title ||
            p.title ||
            "Product",

         price:
  Number(p.price) > 10000
    ? Number(p.price) / 100
    : Number(p.price),

          quantity:
            Number(p.amount) || 1

        }))
      },
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    console.log(
      "CART STATUS:",
      tbcResponse.status
    );

    console.log(
      "CART DATA:",
      tbcResponse.data
    );

    const redirectUrl =
      tbcResponse.headers.location;

    if (!redirectUrl) {

      return res.status(400).json({

        error: "No redirect URL",

        bankResponse:
          tbcResponse.data

      });

    }

    return res.json({
      redirectUrl,
      sessionId: tbcResponse.data?.sessionId || null
    });

  } catch (err) {

    console.log(
      "TBC CART ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }
});
/* ===================== SHOPIFY + COD (EZZY) ===================== */

app.post('/api/create-order-and-cod-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: Number(p.amount) || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `კურიერთან გადახდა

სახელი: ${req.body.name}
ტელეფონი: ${req.body.phone}
მისამართი: ${req.body.address}`,

          tags: "COD",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({

      success: true,

      draftOrderId:
        shopifyResponse.data.draft_order.id

    });

  } catch (err) {

    console.log(
      "COD ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + BOG (EZZY) ===================== */

app.post('/api/create-order-and-bog-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `BOG Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "BOG",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    const bogResponse = await axios.post(

      'https://api.ezzy.ge/api/bog-order',

      { products, shopOrderId: `BOG_${shopifyResponse.data.draft_order.id}` },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    const draftOrder = shopifyResponse.data.draft_order;
    const bogOrderId = bogResponse.data.orderId;
    if (bogOrderId) {
      try {
        await axios.put(
          `https://${SHOP}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
          { draft_order: { id: draftOrder.id, tags: 'BOG,BOG-STATUS-CREATED', note: `${draftOrder.note}\nBOG Order ID: ${bogOrderId}\nBOG Status: in_progress\nBOG Installment Status: unknown` } },
          { headers: { 'X-Shopify-Access-Token': await getEzzyAccessToken(), 'Content-Type': 'application/json' } }
        );
      } catch (metadataError) {
        console.log('BOG DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
      }
    }

    return res.json({

      draftOrderId:
        draftOrder.id,

      redirectUrl:
        bogResponse.data.redirectUrl,

      orderId:
        bogOrderId

    });

  } catch (err) {

    console.log(
      "BOG EZZY ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== BOG ORDER EZZY ===================== */

app.post('/api/bog-order', async (req, res) => {

  try {

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!products.length) {
      return res.status(400).json({
        error: "No products"
      });
    }

    /* TOKEN */

    const tokenResponse = await axios.post(

      'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',

      qs.stringify({
        grant_type: 'client_credentials'
      }),

      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization':
            'Basic ' +
            Buffer.from(
              BOG_CLIENT_ID_EZZY +
              ':' +
              BOG_CLIENT_SECRET_EZZY
            ).toString('base64')
        }
      }

    );

    const accessToken =
      tokenResponse.data.access_token;
    const amount = Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
);

const cartItems = products.map(p => ({

  total_item_amount:
    (Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price))
    * (Number(p.amount) || 1),

  item_description:
    p.product_title
      ? `${p.product_title} - ${p.title}`
      : (p.title || "Product"),

  total_item_qty:
    Number(p.amount) || 1,

  item_vendor_code:
    String(p.id),

  product_image_url:
    "https://ezzy.ge",

  item_site_detail_url:
    "https://ezzy.ge"

}));
console.log("BOG TOKEN OK");
console.log("ACCESS TOKEN EXISTS:", !!accessToken);
    const shopOrderId = /^BOG_\d+$/.test(String(req.body.shopOrderId || ''))
      ? String(req.body.shopOrderId)
      : `BOG_${Date.now()}`;
    const checkoutResponse = await axios.post(

  'https://installment.bog.ge/v1/installment/checkout',

  {
    intent: "LOAN",

    installment_month: 12,

    installment_type: "STANDARD",

    shop_order_id: shopOrderId,

    success_redirect_url:
      "https://ezzy.ge/pages/payment-success",

    fail_redirect_url:
      "https://ezzy.ge/payment-fail",

    reject_redirect_url:
      "https://ezzy.ge/payment-fail",

    validate_items: true,

    locale: "ka",

    purchase_units: [
      {
        amount: {
          currency_code: "GEL",
          value: amount
        }
      }
    ],

    cart_items: cartItems

  },

  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }

);

console.log(
  "BOG CHECKOUT:",
  checkoutResponse.data
);
    const redirectLink = checkoutResponse.data.links.find(
  l => l.rel === "target"
);

return res.json({
  redirectUrl: redirectLink?.href,
  orderId: checkoutResponse.data.order_id
});

  } catch (err) {

    console.log(
      "BOG ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      error:
        err.response?.data || err.message
    });

  }

});
/* ===================== BOG PART BY PART ===================== */

app.post('/api/bog-part-order', async (req, res) => {

  try {

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    const month =
      Number(req.body.month) || 4;

    const discountCode =
      req.body.discount_code || "ZERO";

    if (!products.length) {
      return res.status(400).json({
        error: "No products"
      });
    }

    const tokenResponse = await axios.post(

      'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',

      qs.stringify({
        grant_type: 'client_credentials'
      }),

      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization':
            'Basic ' +
            Buffer.from(
              BOG_CLIENT_ID_EZZY +
              ':' +
              BOG_CLIENT_SECRET_EZZY
            ).toString('base64')
        }
      }

    );

    const accessToken =
      tokenResponse.data.access_token;

    const amount = Number(
      products.reduce((sum, p) => {

        const rawPrice = Number(p.price);

        return sum + (
          (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
          * (Number(p.amount) || 1)
        );

      }, 0)
    );

    const cartItems = products.map(p => ({

      total_item_amount:
        (Number(p.price) > 10000
          ? Number(p.price) / 100
          : Number(p.price))
        * (Number(p.amount) || 1),

      item_description:
        p.product_title
          ? `${p.product_title} - ${p.title}`
          : (p.title || "Product"),

      total_item_qty:
        Number(p.amount) || 1,

      item_vendor_code:
        String(p.id),

      product_image_url:
        "https://ezzy.ge",

      item_site_detail_url:
        "https://ezzy.ge"

    }));

    const shopOrderId = /^BNPL_\d+$/.test(String(req.body.shopOrderId || ''))
      ? String(req.body.shopOrderId)
      : `BNPL_${Date.now()}`;

    const checkoutResponse = await axios.post(

      'https://installment.bog.ge/v1/installment/checkout',

      {
        intent: "LOAN",

        installment_month: month,

        installment_type: "STANDARD",

        discount_code: discountCode,

        shop_order_id: shopOrderId,

        success_redirect_url:
          "https://ezzy.ge/pages/payment-success",

        fail_redirect_url:
          "https://ezzy.ge/payment-fail",

        reject_redirect_url:
          "https://ezzy.ge/payment-fail",

        validate_items: true,

        locale: "ka",

        purchase_units: [
          {
            amount: {
              currency_code: "GEL",
              value: amount
            }
          }
        ],

        cart_items: cartItems

      },

      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          'Content-Type':
            'application/json'
        }
      }

    );

    const redirectLink =
      checkoutResponse.data.links.find(
        l => l.rel === "target"
      );

    return res.json({

      redirectUrl:
        redirectLink?.href,

      orderId:
        checkoutResponse.data.order_id

    });

  } catch (err) {

    console.log(
      "BOG BNPL ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});

/* ===================== BOG PART BY PART Draft Order ===================== */
app.post('/api/create-order-and-bog-part-ezzy', async (req, res) => {

try {
const products = req.body.products || [];

const shopifyResponse = await axios.post(

  `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

  {
    draft_order: {

      line_items: products.map(p => ({
        variant_id: Number(p.id),
        quantity: p.amount || 1
      })),

      customer: {
        first_name: req.body.name || "Customer"
      },

      shipping_address: {
        first_name: req.body.name || "Customer",
        address1: req.body.address || "",
        phone: req.body.phone || "",
        country: "Georgia"
      },

      note: `BOG PART BY PART

Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

      tags: "BOG-BNPL",

      use_customer_default_address: false

    }
  },

  {
    headers: {
      'X-Shopify-Access-Token': await getEzzyAccessToken(),
      'Content-Type': 'application/json'
    }
  }

);

const bogResponse = await axios.post(

  'https://api.ezzy.ge/api/bog-part-order',

  {
    products,
    month: req.body.month,
    discount_code: req.body.discount_code,
    shopOrderId: `BNPL_${shopifyResponse.data.draft_order.id}`
  },

  {
    headers: {
      'Content-Type': 'application/json'
    }
  }

);

const draftOrder = shopifyResponse.data.draft_order;
const bogOrderId = bogResponse.data.orderId;
if (bogOrderId) {
  try {
    await axios.put(
      `https://${SHOP}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
      { draft_order: { id: draftOrder.id, tags: 'BOG-BNPL,BOG-STATUS-CREATED', note: `${draftOrder.note}\nBOG Order ID: ${bogOrderId}\nBOG Status: in_progress\nBOG Installment Status: unknown` } },
      { headers: { 'X-Shopify-Access-Token': await getEzzyAccessToken(), 'Content-Type': 'application/json' } }
    );
  } catch (metadataError) {
    console.log('BOG BNPL DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
  }
}

return res.json({

  draftOrderId:
    draftOrder.id,

  redirectUrl:
    bogResponse.data.redirectUrl,

  orderId:
    bogOrderId

});

} catch (err) {

console.log(
  "BOG BNPL EZZY ERROR:",
  err.response?.data || err.message
);

return res.status(500).json({

  error:
    err.response?.data || err.message

});

}

});

/* ===================== BOG COMFORTMIX ===================== */

app.post('/api/bog-order-comfortmix', async (req, res) => {
  try {
    const shopOrderId = /^CBOG_\d+$/.test(String(req.body.shopOrderId || ''))
      ? String(req.body.shopOrderId)
      : `CBOG_${Date.now()}`;
    const checkout = await createBogCheckoutForStore({
      products: req.body.products,
      shopOrderId,
      storefrontUrl: 'https://comfortmix.ge',
    });
    return res.json(checkout);
  } catch (error) {
    console.log('BOG COMFORTMIX ERROR:', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({ error: error.response?.data || error.message });
  }
});

app.post('/api/bog-part-order-comfortmix', async (req, res) => {
  try {
    const shopOrderId = /^CBNPL_\d+$/.test(String(req.body.shopOrderId || ''))
      ? String(req.body.shopOrderId)
      : `CBNPL_${Date.now()}`;
    const checkout = await createBogCheckoutForStore({
      products: req.body.products,
      shopOrderId,
      storefrontUrl: 'https://comfortmix.ge',
      month: req.body.month,
      discountCode: req.body.discount_code || 'ZERO',
    });
    return res.json(checkout);
  } catch (error) {
    console.log('BOG BNPL COMFORTMIX ERROR:', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({ error: error.response?.data || error.message });
  }
});

async function createComfortBogDraftOrder(req, { partByPart = false } = {}) {
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  if (!products.length) {
    const error = new Error('No products');
    error.statusCode = 400;
    throw error;
  }

  const shopifyResponse = await axios.post(
    `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
    {
      draft_order: {
        line_items: products.map((product) => ({
          variant_id: Number(product.id),
          quantity: product.amount || 1,
        })),
        customer: { first_name: req.body.name || 'Customer' },
        shipping_address: {
          first_name: req.body.name || 'Customer',
          address1: req.body.address || '',
          phone: req.body.phone || '',
          country: 'Georgia',
        },
        note: `${partByPart ? 'BOG PART BY PART' : 'BOG Installment'} (Comfortmix)\nName: ${req.body.name}\nPhone: ${req.body.phone}\nAddress: ${req.body.address}`,
        tags: partByPart ? 'BOG-BNPL,COMFORTMIX' : 'BOG,COMFORTMIX',
        use_customer_default_address: false,
      },
    },
    {
      headers: {
        'X-Shopify-Access-Token': await getComfortAccessToken(),
        'Content-Type': 'application/json',
      },
    }
  );

  const draftOrder = shopifyResponse.data.draft_order;
  const prefix = partByPart ? 'CBNPL' : 'CBOG';
  const checkout = await createBogCheckoutForStore({
    products,
    shopOrderId: `${prefix}_${draftOrder.id}`,
    storefrontUrl: 'https://comfortmix.ge',
    month: partByPart ? req.body.month : 12,
    discountCode: partByPart ? (req.body.discount_code || 'ZERO') : undefined,
  });

  if (checkout.orderId) {
    try {
      await axios.put(
        `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
        {
          draft_order: {
            id: draftOrder.id,
            tags: `${partByPart ? 'BOG-BNPL' : 'BOG'},COMFORTMIX,BOG-STATUS-CREATED`,
            note: `${draftOrder.note}\nBOG Order ID: ${checkout.orderId}\nBOG Status: in_progress\nBOG Installment Status: unknown`,
          },
        },
        {
          headers: {
            'X-Shopify-Access-Token': await getComfortAccessToken(),
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (metadataError) {
      console.log('BOG COMFORTMIX DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
    }
  }

  return {
    draftOrderId: draftOrder.id,
    redirectUrl: checkout.redirectUrl,
    orderId: checkout.orderId,
  };
}

app.post('/api/create-order-and-bog-comfortmix', async (req, res) => {
  try {
    return res.json(await createComfortBogDraftOrder(req));
  } catch (error) {
    console.log('BOG COMFORTMIX DRAFT ERROR:', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({ error: error.response?.data || error.message });
  }
});

app.post('/api/create-order-and-bog-part-comfortmix', async (req, res) => {
  try {
    return res.json(await createComfortBogDraftOrder(req, { partByPart: true }));
  } catch (error) {
    console.log('BOG BNPL COMFORTMIX DRAFT ERROR:', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({ error: error.response?.data || error.message });
  }
});

/* ===================== BOG INSTALLMENT CALLBACK ===================== */

app.post('/api/bog-installment-callback', async (req, res) => {
  const orderId = String(req.body?.order_id || '').trim();
  const callbackShopOrderId = String(req.body?.shop_order_id || '').trim();
  const paymentMethod = String(req.body?.payment_method || '').trim().toUpperCase();

  if (!/^[A-Za-z0-9_-]{20,100}$/.test(orderId) || (paymentMethod && paymentMethod !== 'BOG_LOAN')) {
    return res.sendStatus(400);
  }

  try {
    const verified = await orderTracker.statusHelpers.fetchBogStatus(orderId, {
      bogClientId: BOG_CLIENT_ID_EZZY,
      bogClientSecret: BOG_CLIENT_SECRET_EZZY,
    }, { force: true, timeout: 15_000 });

    if (!verified.available) {
      console.log('BOG CALLBACK STATUS NOT READY:', verified.statusCode || 'unknown');
      return res.sendStatus(200);
    }

    const verifiedShopOrderId = String(verified.shopOrderId || '').trim();
    if (callbackShopOrderId && verifiedShopOrderId && callbackShopOrderId !== verifiedShopOrderId) {
      console.log('BOG CALLBACK SHOP ORDER MISMATCH');
      return res.sendStatus(200);
    }

    const shopOrderId = verifiedShopOrderId || callbackShopOrderId;
    const shopOrderMatch = shopOrderId.match(/^(BOG|BNPL|CBOG|CBNPL)_(\d+)$/);
    const draftId = shopOrderMatch?.[2];
    if (!draftId) return res.sendStatus(200);

    const isComfortmixOrder = shopOrderMatch[1] === 'CBOG' || shopOrderMatch[1] === 'CBNPL';
    const targetShop = isComfortmixOrder ? SHOP_COMFORT : SHOP;
    const targetAccessToken = isComfortmixOrder
      ? await getComfortAccessToken()
      : await getEzzyAccessToken();

    const headers = {
      'X-Shopify-Access-Token': targetAccessToken,
      'Content-Type': 'application/json',
    };
    const draftResponse = await axios.get(
      `https://${targetShop}/admin/api/2024-01/draft_orders/${draftId}.json`,
      { headers }
    );
    const draftOrder = draftResponse.data?.draft_order;
    if (!draftOrder) return res.sendStatus(200);

    const cleanNote = String(draftOrder.note || '')
      .replace(/\n?BOG Order ID:[^\n]*/gi, '')
      .replace(/\n?BOG Status:[^\n]*/gi, '')
      .replace(/\n?BOG Installment Status:[^\n]*/gi, '')
      .trim();
    const orderStatus = String(verified.orderStatus || 'in_progress').toLowerCase();
    const installmentStatus = String(verified.installmentStatus || 'unknown').toLowerCase();
    const statusTags = String(draftOrder.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag && !/^BOG-(?:INSTALLMENT-)?STATUS-/i.test(tag));
    statusTags.push(
      `BOG-STATUS-${orderStatus.replace(/_/g, '-')}`.toUpperCase(),
      `BOG-INSTALLMENT-STATUS-${installmentStatus.replace(/_/g, '-')}`.toUpperCase()
    );

    await axios.put(
      `https://${targetShop}/admin/api/2024-01/draft_orders/${draftId}.json`,
      {
        draft_order: {
          id: draftId,
          tags: [...new Set(statusTags)].join(','),
          note: `${cleanNote}\nBOG Order ID: ${orderId}\nBOG Status: ${orderStatus}\nBOG Installment Status: ${installmentStatus}`,
        },
      },
      { headers }
    );
  } catch (error) {
    console.log('BOG CALLBACK ERROR:', error.response?.status || error.message);
  }

  return res.sendStatus(200);
});


/* ===================== TBC COMFORTMIX ===================== */

app.post('/api/tbc-order-comfortmix', async (req, res) => {
  try {
     console.log("FULL BODY:", req.body);
    console.log("PRODUCTS FROM FRONT:", req.body.products);
    
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products" });
    }

    /* TOKEN */
    const tokenResponse = await axios.post(
      'https://api.tbcbank.ge/oauth/token',
      qs.stringify({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
  TBC_API_KEY_COMFORT + ':' + TBC_API_SECRET_COMFORT
).toString('base64')
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    /* INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: TBC_MERCHANT_COMFORT,
campaignId: TBC_CAMPAIGN_COMFORT,
     priceTotal: Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
),

currency: "GEL",

invoiceId: "INV_" + Date.now(),

products: products.map(p => ({
  
  name: p.product_title
    ? `${p.product_title} - ${p.title}`
    : (p.title || "Product"),

  price:
    Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price),

  quantity: Number(p.amount) || 1

}))
  },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    console.log("STATUS:", tbcResponse.status);
    console.log("HEADERS:", tbcResponse.headers);
    console.log("DATA:", tbcResponse.data);

    const redirectUrl = tbcResponse.headers.location;

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        status: tbcResponse.status,
        headers: tbcResponse.headers,
        data: tbcResponse.data
      });
    }

    return res.json({ redirectUrl });

  } catch (err) {
    console.log("TBC ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop } = req.query;

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: '3f09333ae04b00e338137653ea48a8e2',
        client_secret: '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',
        code: code
      }
    );

    console.log("KEEPZ RESPONSE:", response.data);
res.json(response.data);

  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== SHOPIFY + CREDO (COMFORTMIX) ===================== */

const { shop: SHOP_COMFORT, getAccessToken: getComfortAccessToken } = require('./comfort-shopify');

app.post('/api/create-order-and-credo-comfortmix', async (req, res) => {
  try {
    console.log("BODY RECEIVED:", req.body);
    const products = req.body.products || [];

    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `Credo Order (Comfortmix)
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "CREDO",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': await getComfortAccessToken(),
          'Content-Type': 'application/json'
        }
      }
    );

    const draftOrder = shopifyResponse.data.draft_order;

    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order-comfortmix',
      { products },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json({
      draftOrderId: draftOrder.id,
      redirectUrl: credoResponse.data.redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.post('/api/credo-order-comfortmix', async (req, res) => {
  try {

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    const orderCode = 'ORD_' + Date.now();

    const formattedProducts = products.map(p => ({
      id: String(p.id),
      title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
      amount: Number(p.amount || 1),
      price: Number(p.price),
      type: 0
    }));

    let stringToHash = '';

    formattedProducts.forEach(p => {
      stringToHash +=
        p.id +
        p.title +
        p.amount +
        p.price +
        "0";
    });

    stringToHash += SECRET_COMFORT;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');
    console.log("CREDO MERCHANT:", MERCHANT_ID_COMFORT);

console.log("CREDO REQUEST:", {
  merchantId: MERCHANT_ID_COMFORT,
  orderCode,
  products: formattedProducts
});


    const data = {
      merchantId: MERCHANT_ID_COMFORT,
      orderCode,
      check,
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = 0;
    });

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    const redirectUrl =
      response.headers.location ||
      (response.headers.refresh &&
      response.headers.refresh.includes('url=')
        ? response.headers.refresh.split('url=')[1]
        : null) ||
      response.data?.URL ||
      response.data?.data?.URL;

    if (redirectUrl) {
      return res.json({ redirectUrl });
    }

    return res.status(400).json({
      error: 'No redirect URL',
      bankResponse: response.data
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }
});
/* ===================== SHOPIFY + BANK (UNIFIED) ===================== */

app.post('/api/create-order-and-bank', async (req, res) => {
  try {
    const { products, bank } = req.body;

    // Shopify order
    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          }))
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': await getComfortAccessToken(),
          'Content-Type': 'application/json'
        }
      }
    );

    let redirectUrl;

    // 🔥 ბანკის არჩევა
    if (bank === "izi") {
      redirectUrl = await sendToCredo({
        products,
        merchantId: MERCHANT_ID_IZI,
        secret: SECRET_IZI
      });
    }

    if (bank === "comfort") {
      redirectUrl = await sendToCredo({
        products,
        merchantId: MERCHANT_ID_COMFORT,
        secret: SECRET_COMFORT
      });
    }

    return res.json({
      draftOrderId: shopifyResponse.data.draft_order.id,
      redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== KEEPZ ===================== */

app.post('/api/keepz-order', async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (!products.length) {
      return res.status(400).json({ error: "No products" });
    }

    // 🔒 თანხის დაცული გამოთვლა backend-ზე
    let total = 0;
    const trustedProducts = [];

for (const p of products) {

  const shopifyRes = await axios.get(
    `https://${SHOP}/admin/api/2024-01/variants/${p.id}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': await getEzzyAccessToken()
      }
    }
  );

  const realPrice = Number(shopifyRes.data.variant.price);
  const quantity = Number(p.amount) || 1;

  total += realPrice * quantity;
  trustedProducts.push({
    id: Number(p.id),
    quantity,
    item_price: realPrice
  });
}

const amount = Number(total.toFixed(2));
const orderId = uuidv4();

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    console.log("FINAL AMOUNT:", amount);
    
const draftOrderResponse = await axios.post(
  `https://${SHOP}/admin/api/2024-01/draft_orders.json`,
  {
    draft_order: {
  line_items: products.map(p => ({
    variant_id: Number(p.id),
    quantity: Number(p.amount) || 1
  })),

  customer: {
    first_name: req.body.customer?.name || "Customer"
  },

  shipping_address: {
    first_name: req.body.customer?.name || "Customer",
    phone: req.body.customer?.phone || "",
    country: "Georgia"
  },

  note: `KEEPZ

Name: ${req.body.customer?.name || ''}
Phone: ${req.body.customer?.phone || ''}
Keepz Order ID: ${orderId}
Keepz Amount: ${amount.toFixed(2)} GEL`,

  note_attributes: [
    { name: "keepz_order_id", value: orderId },
    { name: "keepz_amount", value: amount.toFixed(2) }
  ],

    tags: `KEEPZ, KZ:${orderId}`,

   use_customer_default_address: false
    }
  },
  {
    headers: {
      'X-Shopify-Access-Token': await getEzzyAccessToken(),
      'Content-Type': 'application/json'
    }
  }
);

console.log(
  "KEEPZ DRAFT CREATED:",
  draftOrderResponse.data.draft_order.id
);
    const keepz = new Keepz(
  KEEPZ_PUBLIC_KEY,
  KEEPZ_PRIVATE_KEY
);

pendingOrders[orderId] = {
  customer: req.body.customer,
  products: trustedProducts,
  amount,
  draftOrderId: draftOrderResponse.data.draft_order.id,
  createdAt: Date.now()
};

    const orderData = {
      amount: amount,
      currency: "GEL",
     integratorId: KEEPZ_INTEGRATOR_ID,
      integratorOrderId: orderId,
      receiverId: KEEPZ_RECEIVER_ID,
      receiverType: "BRANCH",
      directLinkProvider: "DEFAULT",
      language: "KA",

      // 🔥 redirect-ები დალაგებული
      successRedirectUri:
`https://ezzy.ge/pages/payment-success?orderId=${orderId}&amount=${amount}&productId=${req.body.products[0].id}`,
      failRedirectUri: `https://ezzy.ge/payment-fail`,

      // 🔥 KEEPZ callback
      callbackUri: "https://api.ezzy.ge/api/keepz-callback"
    };

    const encrypted = keepz.encrypt(orderData);

    const response = await axios.post(
      "https://gateway.keepz.me/ecommerce-service/api/integrator/order",
      {
        identifier: KEEPZ_INTEGRATOR_ID,
        encryptedData: encrypted.encryptedData,
        encryptedKeys: encrypted.encryptedKeys,
        aes: true
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    console.log("RAW KEEPZ RESPONSE:", response.data);

    let decrypted;

    try {
      decrypted = keepz.decrypt(
        response.data.encryptedData,
        response.data.encryptedKeys
      );

      console.log("DECRYPTED:", decrypted);

    } catch (err) {
      console.error("DECRYPT ERROR:", err);
      return res.status(500).json({ error: "Decryption failed" });
    }

const redirect =
  decrypted?.redirectUrl ||
  decrypted?.paymentUrl ||
  decrypted?.urlForQR ||
  decrypted?.redirectUri;

if (!redirect) {
  return res.status(500).json({
    error: "No redirect URL",
    debug: decrypted
  });
}

return res.json({
  redirectUrl: redirect,
  orderId: orderId
});

  } catch (err) {
    console.error("KEEPZ ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

const SHOPIFY_API_VERSION = '2026-07';

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function verifyKeepzPayment(orderId) {
  const keepz = new Keepz(KEEPZ_PUBLIC_KEY, KEEPZ_PRIVATE_KEY);
  const encrypted = keepz.encrypt({
    integratorId: KEEPZ_INTEGRATOR_ID,
    integratorOrderId: orderId
  });

  const response = await axios.get(
    'https://gateway.keepz.me/ecommerce-service/api/integrator/order/status',
    {
      params: {
        identifier: KEEPZ_INTEGRATOR_ID,
        encryptedData: encrypted.encryptedData,
        encryptedKeys: encrypted.encryptedKeys,
        aes: true
      },
      timeout: 10000
    }
  );

  return keepz.decrypt(
    response.data.encryptedData,
    response.data.encryptedKeys
  );
}

async function getKeepzDraft(orderId, draftOrderId) {
  const headers = { 'X-Shopify-Access-Token': await getEzzyAccessToken() };

  if (draftOrderId) {
    const response = await axios.get(
      `https://${SHOP}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draftOrderId}.json`,
      { headers, timeout: 10000 }
    );
    return response.data.draft_order;
  }

  const response = await axios.get(
    `https://${SHOP}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`,
    {
      headers,
      params: { status: 'any', limit: 250 },
      timeout: 10000
    }
  );

  return (response.data.draft_orders || []).find(draft =>
    (draft.note_attributes || []).some(attribute =>
      attribute.name === 'keepz_order_id' && attribute.value === orderId
    ) || String(draft.note || '').includes(`Keepz Order ID: ${orderId}`)
  );
}

function keepzOrderFromDraft(draft) {
  const fullName = draft.shipping_address?.name
    || [draft.shipping_address?.first_name, draft.shipping_address?.last_name].filter(Boolean).join(' ')
    || draft.customer?.first_name
    || '';
  const keepzAmount = (draft.note_attributes || []).find(attribute =>
    attribute.name === 'keepz_amount'
  )?.value;

  return {
    customer: {
      name: fullName,
      phone: draft.shipping_address?.phone || draft.customer?.phone || ''
    },
    amount: Number(keepzAmount || draft.total_price),
    products: (draft.line_items || []).map(item => ({
      id: item.variant_id || item.product_id,
      quantity: Number(item.quantity) || 1,
      item_price: Number(item.price)
    }))
  };
}

async function completeKeepzDraft(draft) {
  if (draft.order_id || draft.status === 'completed') return draft;

  const headers = { 'X-Shopify-Access-Token': await getEzzyAccessToken() };

  try {
    const response = await axios.put(
      `https://${SHOP}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draft.id}/complete.json`,
      null,
      { headers, timeout: 15000 }
    );
    return response.data.draft_order;
  } catch (error) {
    if (error.response?.status !== 422) throw error;

    const response = await axios.get(
      `https://${SHOP}/admin/api/${SHOPIFY_API_VERSION}/draft_orders/${draft.id}.json`,
      { headers, timeout: 10000 }
    );
    if (!response.data.draft_order?.order_id) throw error;
    return response.data.draft_order;
  }
}

app.post('/api/keepz-callback', async (req, res) => {
  try {
    const {
      status,
      integratorOrderId,
      integratorId,
      receiverId,
      amount,
      initialCurrency
    } = req.body;

    if (status !== "SUCCESS") {
      return res.sendStatus(200);
    }

    if (
      !isUuid(integratorOrderId)
      || integratorId !== KEEPZ_INTEGRATOR_ID
      || receiverId !== KEEPZ_RECEIVER_ID
      || (initialCurrency && initialCurrency !== 'GEL')
    ) {
      return res.sendStatus(400);
    }

    const verified = await verifyKeepzPayment(integratorOrderId);
    if (verified.integratorOrderId !== integratorOrderId || verified.status !== 'SUCCESS') {
      return res.sendStatus(409);
    }

    const pending = pendingOrders[integratorOrderId];
    const draft = await getKeepzDraft(integratorOrderId, pending?.draftOrderId);
    if (!draft) throw new Error('Keepz draft order not found');

    const savedOrder = pending || keepzOrderFromDraft(draft);
    const callbackAmount = Number(amount);
    if (
      !Number.isFinite(callbackAmount)
      || !Number.isFinite(Number(savedOrder.amount))
      || Math.abs(callbackAmount - Number(savedOrder.amount)) > 0.009
    ) {
      return res.sendStatus(409);
    }

    const completedDraft = await completeKeepzDraft(draft);

    await sendMetaPurchase({
      eventId: `keepz-purchase-${integratorOrderId}`,
      orderId: completedDraft.order_id || integratorOrderId,
      value: savedOrder.amount,
      currency: 'GEL',
      contents: savedOrder.products,
      customer: savedOrder.customer,
      sourceUrl: 'https://ezzy.ge/'
    });

    pendingOrders[integratorOrderId] = {
      ...savedOrder,
      draftOrderId: draft.id,
      shopifyOrderId: completedDraft.order_id,
      completedAt: Date.now()
    };

    console.log('KEEPZ PAYMENT FULFILLED:', integratorOrderId);

    res.sendStatus(200);

  } catch (err) {
    console.error("CALLBACK ERROR:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});
app.post('/api/keepz-success', async (req, res) => {

  try {

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: 'Order ID required'
      });
    }

    if (!isUuid(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const verified = await verifyKeepzPayment(orderId);

    return res.json({
      success: verified.status === 'SUCCESS',
      status: verified.status
    });

  } catch (e) {

    console.log(
  'SHOPIFY ERROR:',
  JSON.stringify(e.response?.data || e, null, 2)
);

    return res.status(500).json({
      error: 'Server error'
    });

  }

});
/* ===================== KEEPZ (COMFORTMIX) ===================== */

app.post('/api/keepz-order-comfortmix', async (req, res) => {

  try {

    console.log("REQ BODY:", req.body);

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!products.length) {

      return res.status(400).json({
        error: "No products"
      });

    }

    // 🔒 უსაფრთხო თანხის გამოთვლა Shopify-დან
    let total = 0;

    for (const p of products) {

      const shopifyRes = await axios.get(

        `https://${SHOP_COMFORT}/admin/api/2024-01/variants/${p.id}.json`,

        {
          headers: {
            'X-Shopify-Access-Token': await getComfortAccessToken()
          }
        }

      );

      const realPrice =
        Number(shopifyRes.data.variant.price);

      total +=
        realPrice * (Number(p.amount) || 1);

    }

    const amount =
      Number(total.toFixed(2));

    if (!amount || isNaN(amount)) {

      return res.status(400).json({
        error: "Invalid amount"
      });

    }

    console.log("FINAL AMOUNT:", amount);

    const keepz = new Keepz(
      KEEPZ_PUBLIC_KEY,
      KEEPZ_PRIVATE_KEY
    );

    const orderId = uuidv4();

    pendingOrders[orderId] = {

      customer: req.body.customer,

      products: req.body.products,

      createdAt: Date.now(),

      store: 'comfortmix'

    };

    const orderData = {

      amount: amount,

      currency: "GEL",

      integratorId: KEEPZ_INTEGRATOR_ID,

      integratorOrderId: orderId,

      receiverId:
        KEEPZ_RECEIVER_ID,

      receiverType: "BRANCH",

      directLinkProvider: "DEFAULT",

      language: "KA",

      successRedirectUri:
`https://comfortmix.ge/pages/payment-success?orderId=${orderId}&amount=${amount}&productId=${req.body.products[0].id}`,

      failRedirectUri:
`https://comfortmix.ge/payment-fail`,

      callbackUri:
"https://api.ezzy.ge/api/keepz-callback-comfortmix"

    };

    const encrypted =
      keepz.encrypt(orderData);

    const response = await axios.post(

      "https://gateway.keepz.me/ecommerce-service/api/integrator/order",

      {
        identifier: KEEPZ_INTEGRATOR_ID,

        encryptedData:
          encrypted.encryptedData,

        encryptedKeys:
          encrypted.encryptedKeys,

        aes: true
      },

      {
        headers: {
          "Content-Type": "application/json"
        }
      }

    );

    console.log(
      "RAW KEEPZ RESPONSE:",
      response.data
    );

    let decrypted;

    try {

      decrypted = keepz.decrypt(

        response.data.encryptedData,

        response.data.encryptedKeys

      );

      console.log(
        "DECRYPTED:",
        decrypted
      );

    } catch (err) {

      console.error(
        "DECRYPT ERROR:",
        err
      );

      return res.status(500).json({
        error: "Decryption failed"
      });

    }

    const redirect =

      decrypted?.redirectUrl ||

      decrypted?.paymentUrl ||

      decrypted?.urlForQR ||

      decrypted?.redirectUri;

    if (!redirect) {

      return res.status(500).json({

        error: "No redirect URL",

        debug: decrypted

      });

    }

    return res.json({

      redirectUrl: redirect,

      orderId: orderId

    });

  } catch (err) {

    console.error(

      "KEEPZ ERROR:",

      err.response?.data || err.message

    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});


/* ===================== KEEPZ SUCCESS (COMFORTMIX) ===================== */

app.post('/api/keepz-success-comfortmix', async (req, res) => {

  try {

    const { orderId } = req.body;

    if (!orderId) {

      return res.status(400).json({
        error: 'Order ID required'
      });

    }

    const savedOrder =
      pendingOrders[orderId];

    if (!savedOrder) {

      return res.status(404).json({
        error: 'Order not found'
      });

    }

    console.log(
      'SUCCESS ORDER:',
      savedOrder
    );

    await axios.post(

      `https://${SHOP_COMFORT}/admin/api/2026-04/orders.json`,

      {
        order: {

          line_items:
            savedOrder.products.map(p => ({

              variant_id: Number(p.id),

              quantity: p.amount

            })),

          customer: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone
},

billing_address: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone,
  country: "Georgia"
},

          financial_status: 'paid',

          note:
`Name: ${savedOrder.customer.name}
Phone: ${savedOrder.customer.phone}`,

          tags: 'KEEPZ, COMFORTMIX'

        }
      },

      {
        headers: {

          'X-Shopify-Access-Token':
            await getComfortAccessToken(),

          'Content-Type':
            'application/json'

        }
      }

    );

    return res.json({
      success: true
    });

  } catch (e) {

    console.log(

      'SHOPIFY ERROR:',

      JSON.stringify(
        e.response?.data || e,
        null,
        2
      )

    );

    return res.status(500).json({
      error: 'Server error'
    });

  }

});
app.post('/api/create-order-and-tbc-comfortmix', async (req, res) => {
  try {

    const products = req.body.products || [];

    // 1. Shopify draft order
    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `TBC Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "TBC",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': await getComfortAccessToken(),
          'Content-Type': 'application/json'
        }
      }
    );

    // 2. TBC redirect
    const tbcResponse = await axios.post(
      'https://api.ezzy.ge/api/tbc-order-comfortmix',
      { products },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({
      draftOrderId: shopifyResponse.data.draft_order.id,
      redirectUrl: tbcResponse.data.redirectUrl
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }
});
app.post('/api/create-order-and-cod-comfortmix', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Cash On Delivery
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "კურიერთან",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getComfortAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({
      success: true,
      draftOrderId: shopifyResponse.data.draft_order.id
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }

});
/* ===================== SHOPIFY + TBC (EZZY) ===================== */

app.post('/api/create-order-and-tbc-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    // Shopify draft order
    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `TBC Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "TBC",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    // TBC redirect
    const tbcResponse = await axios.post(

      'https://api.ezzy.ge/api/tbc-order',

      { products },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    const draftOrder = shopifyResponse.data.draft_order;
    const sessionId = tbcResponse.data.sessionId;
    if (sessionId) {
      try {
        await axios.put(
          `https://${SHOP}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
          { draft_order: { id: draftOrder.id, tags: 'TBC,TBC-STATUS-0', note: `${draftOrder.note}\nTBC Session ID: ${sessionId}\nTBC Status: 0` } },
          { headers: { 'X-Shopify-Access-Token': await getEzzyAccessToken(), 'Content-Type': 'application/json' } }
        );
      } catch (metadataError) {
        console.log('TBC DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
      }
    }

    return res.json({

      draftOrderId:
        draftOrder.id,

      sessionId,

      redirectUrl:
        tbcResponse.data.redirectUrl

    });

  } catch (err) {

    console.log(
      "EZZY TBC ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + TBC (EZZY CART) ===================== */

app.post('/api/create-order-and-tbc-cart-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    // Shopify Draft Order
    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: Number(p.amount) || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `TBC CART
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "TBC,CART",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    // TBC CART
    const tbcResponse = await axios.post(

      'https://api.ezzy.ge/api/tbc-order-cart',

      { products },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    const draftOrder = shopifyResponse.data.draft_order;
    const sessionId = tbcResponse.data.sessionId;
    if (sessionId) {
      try {
        await axios.put(
          `https://${SHOP}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
          { draft_order: { id: draftOrder.id, tags: 'TBC,CART,TBC-STATUS-0', note: `${draftOrder.note}\nTBC Session ID: ${sessionId}\nTBC Status: 0` } },
          { headers: { 'X-Shopify-Access-Token': await getEzzyAccessToken(), 'Content-Type': 'application/json' } }
        );
      } catch (metadataError) {
        console.log('TBC CART DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
      }
    }

    return res.json({

      draftOrderId:
        draftOrder.id,

      sessionId:
        sessionId,

      redirectUrl:
        tbcResponse.data.redirectUrl

    });

  } catch (err) {

    console.log(
      "EZZY TBC CART ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + CREDO (EZZY) ===================== */

app.post('/api/create-order-and-credo-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    // Shopify draft order
    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Credo Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "CREDO",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    // Credo redirect
    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order',

      { products },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    const draftOrder = shopifyResponse.data.draft_order;
    const orderCode = credoResponse.data.orderCode;
    if (orderCode) {
      try {
        await axios.put(
          `https://${SHOP}/admin/api/2024-01/draft_orders/${draftOrder.id}.json`,
          { draft_order: { id: draftOrder.id, tags: 'CREDO,CREDO-STATUS-PENDING', note: `${draftOrder.note}\nCredo Order Code: ${orderCode}` } },
          { headers: { 'X-Shopify-Access-Token': await getEzzyAccessToken(), 'Content-Type': 'application/json' } }
        );
      } catch (metadataError) {
        console.log('CREDO DRAFT METADATA ERROR:', metadataError.response?.status || metadataError.message);
      }
    }

    return res.json({

      draftOrderId:
        draftOrder.id,

      orderCode,

      redirectUrl:
        credoResponse.data.redirectUrl

    });

  } catch (err) {

    console.log(
      "EZZY CREDO ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + COD (EZZY) ===================== */

app.post('/api/create-order-and-cod-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Cash On Delivery
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "კურიერთან",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': await getEzzyAccessToken(),
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({

      success: true,

      draftOrderId:
        shopifyResponse.data.draft_order.id

    });

  } catch (err) {

    console.log(
      "EZZY COD ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});

orderTracker(app, {
  tbcApiKey: TBC_API_KEY_COMFORT,
  tbcApiSecret: TBC_API_SECRET_COMFORT,
  tbcMerchantKey: TBC_MERCHANT_COMFORT,
  credoMerchantId: MERCHANT_ID_COMFORT,
  credoSecret: SECRET_COMFORT,
  bogClientId: BOG_CLIENT_ID_EZZY,
  bogClientSecret: BOG_CLIENT_SECRET_EZZY
});

app.listen(process.env.PORT || 3000);

