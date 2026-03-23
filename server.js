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

app.get("/", (req, res) => {
  res.send("API is running");
});

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products sent" });
    }

    const orderCode = 'ORD_' + Date.now();

    // ✅ PRODUCTS სწორ ფორმატში
    const formattedProducts = products.map(p => {
      const cleanTitle = String(p.title)
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/[()]/g, '')
        .trim();

      const priceInTetri = Math.round((p.price || 0) * 100);

      return {
        id: String(p.id),
        title: cleanTitle,
        amount: Number(p.amount || 1),
        price: Number(priceInTetri),
        type: "0"
      };
    });

    // ✅ სწორი HASH (ძალიან მნიშვნელოვანი)
    const check = crypto
      .createHash('md5')
      .update(MERCHANT_ID + orderCode + SECRET)
      .digest('hex');

    // ✅ BASE DATA
    const data = {
      merchantId: MERCHANT_ID,
      orderCode: orderCode,
      check: check,
      redirectUrl: "https://ezzy.ge/",
      installmentLength: 12
    };

    // ✅ PRODUCTS → form-data
    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = p.type;
    });

    // ✅ REQUEST
    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/order.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000,
        validateStatus: () => true
      }
    );

    console.log("CREDO FULL RESPONSE:", response);

    let redirectUrl = null;

    // 🔹 header redirect
    if (response.headers?.refresh) {
      const refresh = response.headers.refresh;
      if (refresh.includes('url=')) {
        redirectUrl = refresh.split('url=')[1];
      }
    }

    // 🔹 body redirect
    if (!redirectUrl && response.data?.URL) {
      redirectUrl = response.data.URL;
    }

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        credoResponse: response.data
      });
    }

    return res.json({ redirectUrl });

  } catch (err) {
    console.log("FULL ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
