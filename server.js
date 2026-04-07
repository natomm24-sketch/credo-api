const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

/* ===================== CONFIG ===================== */

const MERCHANT_ID = "21118";
const SECRET = "Vq6h3J0+fI";

const SHOP = "ezzy-ge.myshopify.com";
const ACCESS_TOKEN = "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";

const TBC_API_KEY = "HH5Jiu9Ldzk6ka7m4NvPrSYW9Nk2ezEH";
const TBC_API_SECRET = "XGlVzNoHWuthRLaO";

/* ===================== ROOT ===================== */

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

    const check = crypto.createHash('md5').update(stringToHash).digest('hex');

    const data = {
      merchantId: MERCHANT_ID,
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    let redirectUrl =
      response.headers.location ||
      response.data?.URL ||
      response.data?.data?.URL;

    if (redirectUrl) return res.json({ redirectUrl });

    return res.status(400).json({ error: "No redirect URL" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* 🔥 ეს არის შენი ძველი working flow — არ ვეხებით */
app.post('/api/create-order-and-credo', async (req, res) => {
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
          note: `Credo Order`,
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
    const products = req.body.products || [];

    /* 1. Shopify order */
    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: { first_name: req.body.name || "Customer" },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `TBC Order`,
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

    /* 2. TOKEN */
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

    /* 3. INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online/installments/applications',
      {
        merchantKey: "MerchantIntegrationTesting",
        campaignId: 204,
        priceTotal: products[0].price,
        currency: "GEL",
        invoiceId: "INV_" + Date.now(),
        products: [
          {
            name: products[0].title,
            price: products[0].price,
            quantity: 1
          }
        ]
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

    const redirectUrl = tbcResponse.headers.location;

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect from TBC",
        data: tbcResponse.data
      });
    }

    return res.json({
      draftOrderId: draftOrder.id,
      redirectUrl
    });

  } catch (err) {
    console.log("TBC ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

/* ===================== START ===================== */

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
