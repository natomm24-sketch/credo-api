const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = "21118";
const SECRET = "Vq6h3J0+fI";

const SHOP = "ezzy-ge.myshopify.com";
const ACCESS_TOKEN = "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";

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

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
      data[`products[${i}][type]`] = "0";
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
      error: err.message
    });
  }
});

app.post('/api/create-order-and-credo', async (req, res) => {
  try {
    const products = req.body.products || [];

    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
  line_items: products.map(p => ({
    title: p.title + " / " + (p.variant || ""), // 👉 ზომა დაემატება
    price: (Number(p.price) / 100).toFixed(2),
    quantity: p.amount || 1
  })),

  customer: {
    first_name: req.body.name || "Customer",
    phone: req.body.phone || ""
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
          use_customer_default_address: true
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

app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop } = req.query;

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: 'af5fb204f41d87764fb313cb873734eb',
        client_secret: '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',
        code: code
      }
    );

    res.json(response.data);

  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

app.listen(process.env.PORT || 3000);
