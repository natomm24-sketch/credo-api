const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');
const Keepz = require('./keepz');
const { v4: uuidv4 } = require('uuid');

const app = express();
const pendingOrders = {};

app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = process.env.MERCHANT_ID;
const SECRET = process.env.SECRET;

const SHOP = "ezzy-ge.myshopify.com";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const TBC_API_KEY = process.env.TBC_API_KEY;
const TBC_API_SECRET = process.env.TBC_API_SECRET;

const SHOPIFY_STORE = 'ezzy-ge.myshopify.com';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const KEEPZ_INTEGRATOR_ID = process.env.KEEPZ_INTEGRATOR_ID
const KEEPZ_PUBLIC_KEY = process.env.KEEPZ_PUBLIC_KEY;
const KEEPZ_PRIVATE_KEY = process.env.KEEPZ_PRIVATE_KEY;

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

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
    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');

    const data = {
      merchantId: MERCHANT_ID,
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
      return res.json({ redirectUrl });
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
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
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
          'Authorization': 'Basic ' + Buffer.from(TBC_API_KEY + ':' + TBC_API_SECRET).toString('base64')
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    /* INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: "405757140-c326230e-e884-4565-be96-d41349469b31",
        campaignId: 529,
        priceTotal: Number(
  products.reduce((sum, p) => 
    sum + ((Number(p.price) / 100) * (Number(p.amount) || 1)), 0)
),
        currency: "GEL",
        invoiceId: "INV_" + Date.now(),
       products: products.map(p => ({
  name: p.product_title 
  ? `${p.product_title} - ${p.title}`
  : (p.title || "Product"),
  price: Number(p.price) / 100,
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
        client_secret: SHOPIFY_CLIENT_SECRET,
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

const SHOP_COMFORT = "comfortmix.myshopify.com";
const ACCESS_TOKEN_COMFORT = process.env.ACCESS_TOKEN_COMFORT;

app.post('/api/create-order-and-credo-comfortmix', async (req, res) => {
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
          note: `Credo Order (Comfortmix)
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
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
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
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

for (const p of products) {

  const shopifyRes = await axios.get(
    `https://${SHOP}/admin/api/2024-01/variants/${p.id}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN
      }
    }
  );

  const realPrice = Number(shopifyRes.data.variant.price);

  total += realPrice * (Number(p.amount) || 1);
}

const amount = Number(total.toFixed(2));

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    console.log("FINAL AMOUNT:", amount);

    const keepz = new Keepz(KEEPZ_PUBLIC_KEY, KEEPZ_PRIVATE_KEY);
    const orderId = uuidv4();
    pendingOrders[orderId] = {
  customer: req.body.customer,
  products: req.body.products,
  createdAt: Date.now()
};

    const orderData = {
      amount: amount,
      currency: "GEL",
      integratorId: KEEPZ_INTEGRATOR_ID,
      integratorOrderId: orderId,
      receiverId: "d10d0e01-e70f-41eb-b7ba-8fd14e425f3f",
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
app.post('/api/keepz-callback', async (req, res) => {
  try {
    console.log("KEEPZ CALLBACK:", req.body);

    const { status, integratorOrderId } = req.body;

    // მხოლოდ წარმატებული გადახდა
    if (status !== "SUCCESS") {
      return res.sendStatus(200);
    }

    // ⚠️ აქ უნდა გქონდეს შენახული products (შემდეგ ეტაპზე დავამატებთ)
    const products = req.body.products || [];

    if (!products.length) {
      console.log("No products in callback");
      return res.sendStatus(200);
    }

    // Shopify order შექმნა
    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/orders.json`,
      {
        order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          financial_status: "paid",
          note: `Keepz Order ID: ${integratorOrderId}`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("SHOPIFY ORDER CREATED:", shopifyResponse.data.order.id);

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

    const savedOrder = pendingOrders[orderId];

    if (!savedOrder) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    console.log('SUCCESS ORDER:', savedOrder);
   await axios.post(

  `https://${SHOPIFY_STORE}/admin/api/2026-04/orders.json`,

  {
    order: {

      line_items: savedOrder.products.map(p => ({
        variant_id: Number(p.id),
        quantity: p.amount
      })),

      billing_address: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone
},

      financial_status: 'paid',
note: `Name: ${savedOrder.customer.name}
Phone: ${savedOrder.customer.phone}`,
      tags: 'KEEPZ'

    }
  },

  {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  }

);
    return res.json({
      success: true
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

app.listen(process.env.PORT || 3000);
