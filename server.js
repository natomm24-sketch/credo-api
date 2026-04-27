const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');
const Keepz = require('./keepz');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = "21118";
const SECRET = "Vq6h3J0+fI";

const SHOP = "ezzy-ge.myshopify.com";
const ACCESS_TOKEN = "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";

const TBC_API_KEY = "HH5Jiu9Ldzk6ka7m4NvPrSYW9Nk2ezEH";
const TBC_API_SECRET = "XGlVzNoHWuthRLaO";

const KEEPZ_INTEGRATOR_ID = "5e03f8e2-8eb8-42ff-9175-56a53a4dd96c";
const KEEPZ_PUBLIC_KEY = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAufnkp1l18mSJQcZ2JkB32Hp7m0X9m1lnmgGshQDvoqVqqmq0/165WH04sFlQimKe5zGKSVkrEAR2A2uu9nhH/kSU6fPl19VyLg+DH7VaGawN68HfdUeLv4Vauni1/L1y2eh4WNzuqkI9lIAIeY2zWwx+nKs8areFn0Sw8s6zD8ehbHCK2cT0HObcvZcf2n4THHxhvpdlkGPkoGMnDC/cZRdRa5DPyNBuhKDIno38zMfnsCDTZ56NkSzjB7lrO1oHQX5ilRx578/+FvpbvR3WXdotKfE/QejpE6Ty5kBMGz3zMbW0iRvWWA4Cf26dJg3pgOeQ39YJX3mrRDmnQe7EgHePswDi6NL0UEc/NJr8Wug8k+Ggx/q/a754c6aPkKC/VUy4Rrzn3JBODB7v9+SJ/T8JMkiOYkl8SZARtidboj25US2GAb3a7NxIdLC4nosN6OrYoffav6awnoUVjbcTSXYonk4XNGIViwdP+PS4BaX/Thoa4aUm7rv1drDGvaCmXZCce4elps1NnsZjWdS/JfTAN82XqDc2Vse6EEikiQb5z4zEZeqoEMRrzKC+YTmX1mw+0G9bUKzsmRJ3nftFmyn/fdj71x7zJXzeNZtuEg3TgveVWfehUsEIp9JnD0bHyBkX2/sgMnIzj7nq3sKa7SnCGJPC4ehkmeQeEpKqZW8CAwEAAQ==";
const KEEPZ_PRIVATE_KEY = "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";

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
/* ===================== SHOPIFY + CREDO (COMFORTMIX) ===================== */

const SHOP_COMFORT = "comfortmix.myshopify.com";
const ACCESS_TOKEN_COMFORT = "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";

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
app.post('/api/keepz-order', async (req, res) => {
  try {
    const products = req.body.products || [];

    const amount = products.reduce((sum, p) =>
      sum + (Number(p.price) * (Number(p.amount) || 1)), 0
    );

    const keepz = new Keepz(KEEPZ_PUBLIC_KEY, KEEPZ_PRIVATE_KEY);

    const orderData = {
      amount: amount,
      currency: "GEL",
      integratorOrderId: "ORD_" + Date.now(),
      description: "Order from Shopify",
      successUrl: "https://yourdomain.com/success",
      failUrl: "https://yourdomain.com/fail",
      callbackUrl: "https://yourdomain.com/api/keepz-callback"
    };

    const encrypted = keepz.encrypt(orderData);

    const response = await axios.post(
      "https://gateway.keepz.me/ecommerce-service/api/integrator/order",
      {
        identifier: KEEPZ_INTEGRATOR_ID,
        encryptedData: encrypted.encryptedData,
        encryptedKeys: encrypted.encryptedKeys,
        aes: true
      }
    );

    return res.json({
      redirectUrl: response.data.redirectUrl
    });

  } catch (err) {
    console.log("KEEPZ ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.post('/api/keepz-callback', (req, res) => {
  try {
    const { encryptedData, encryptedKeys } = req.body;

    const keepz = new Keepz(KEEPZ_PUBLIC_KEY, KEEPZ_PRIVATE_KEY);

    const data = keepz.decrypt(encryptedData, encryptedKeys);

    console.log("KEEPZ CALLBACK:", data);

    res.sendStatus(200);

  } catch (err) {
    console.log("CALLBACK ERROR:", err.message);
    res.sendStatus(500);
  }
});
app.listen(process.env.PORT || 3000);
