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

const KEEPZ_INTEGRATOR_ID = "1b02b811-f2d2-4111-adb4-4d2c6f313e93";
const KEEPZ_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk4VGFzUU2QFKnRquFmQdbRjUbLEwT9ixVG3EMnxuupTAK8Lee4UiTrZ1+AiuwHPWyDUMHBPRpwx1QVD6lcbHhFI2nOdWjDLiqgzLdy9q9SK5kuVMYBqeLVo3uan7x6oksrukXvciMdXKMwy0UtBnjD4WcFNRi1fSEl7AKQXl8VQRfJsBvtJIK9BB/A2hDifdDB3S3fD4p2Qc9L6MbSlzSP8ZCpJ3HynJfaH7jzhFcj4+lkWwc/zHXnr5ATXLnvuytnNIpqQWPjGAVXkzM0YhR10fGxvnedQiXH2pex9ZzXMx2raatbEF8GyvlkDRmMV9KU23GItMIcHjDw9ZYz5saQIDAQAB";
const KEEPZ_PRIVATE_KEY = "MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCThUYXNRTZAUqdGq4WZB1tGNRssTBP2LFUbcQyfG66lMArwt57hSJOtnX4CK7Ac9bINQwcE9GnDHVBUPqVxseEUjac51aMMuKqDMt3L2r1IrmS5UxgGp4tWje5qfvHqiSyu6Re9yIx1cozDLRS0GeMPhZwU1GLV9ISXsApBeXxVBF8mwG+0kgr0EH8DaEOJ90MHdLd8PinZBz0voxtKXNI/xkKkncfKcl9ofuPOEVyPj6WRbBz/MdeevkBNcue+7K2c0impBY+MYBVeTMzRiFHXR8bG+d51CJcfal7H1nNczHatpq1sQXwbK+WQNGYxX0pTbcYi0whweMPD1ljPmxpAgMBAAECggEAI6/D6u1OY8iqMiM4JfaGH9Q33ytmEorLKy96nPP5HW3Kp0t24s6sI/qDw0Lmc2wSc1BR46DvwMeEvg5G8GCr91ikGYTlLPlKV/TMa8KuzypdVineNgl6ZmJCxMlYPU7tncdC1i5WuVOMnJjgLoB37DdA2l9thJX0HbmKJuJkY+KiLkIsV9PPDiFFjg6Szc5L8yFR4YPrrs+g4GJEixIAwdmVafZchsD7xM1gP0BRsNWFnaaKNrOsd7l4BgRoErKgTm0FAmR4TDE6NTsQWH0tDCu6c01R1DXWuPw6RohCGfwC/Ey7ZyWLnN+NJ1pGFwAZj4twzcTaOrPTcmP8D3UV4QKBgQDQj2sOBM4eod/dacCFZr1iTAWi/oBmHYMkdRIfTEFwRnnTO25bAvXURrmVKf1u/7oV3Nws2WvNUhT3aZBN3ndJtNYAV7WL/FKgdOTvuhiQiLjDFyGDCAH4vcJheadj2wyRTBIiHyfcjg0e5kH5jTmPqoXQfyvUfmhlfJT6CxLBfQKBgQC1E3usYzzsDPxQj0NwIXjaxZBnX7eqfUuEE4AJ1UNolDqN/r8+36BEDJ2WqnXjs6rXQhStmV+MB7d9Yt63SIf6ip6NEr4vC+GtfXp/zprsNrvDV4c2E7g3AlAjsblxsjrBXRMeEWbaOSV/t9oyzg3v5Ap0Wm+logZMB1RSb4BKXQKBgQCiT7uFQYAYnupWqsLGD1s8cOXCIEdVMYqqiOH9sZ8L/g05s3sDIZ6oAhLUX8V46VStRyGjVeJr/IGMu38u2wADQNV7lscXltvHPLIfT7lmYsFIM2xFSaofJ69rpP383LE/MvC51X10TKkxbwnRaXNut8tEpHQ7/9THhtl6b7u9EQKBgQCElg6BbGyoXt3FUxFLIocukWip+LEwWewYenrPOGPSSG8Tl8uLCw17pk0hjBEkOGNImK8xadNHYkMdwW5Yf/hpIGT14Rp2sll9whoXST2w5mbXothzZT8GsF/jsveZY6qX+UHNS2qnMR7fBMz1VGFqHOz2w11qx1ebBebdMZ2bVQKBgQC+CUhLsoi35APuaP7SccL/ut84z96u+WaABBtCCFtBO7oAds5BOE3LaMvTC6zTtrEGc9rIqe8AatUmAP1/9PrnNbRaYUM4LFprXq6u/5IOiXAaL6n2gnPYxNq6kdQwGvenoDqkbKvqYspb8TDRAxEWdyWXL/gXYX70VagxWv+jQg==";

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
