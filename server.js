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

    let stringToHash = '';

    formattedProducts.forEach(p => {
      stringToHash +=
        String(p.id) +
        String(p.title) +
        String(p.amount) +
        String(p.price) +
        String(p.type);
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

      // ✅ სწორი redirect
      redirectUrl: "https://ezzy.ge/"
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = String(p.id);
      data[`products[${i}][title]`] = String(p.title);
      data[`products[${i}][amount]`] = String(p.amount);
      data[`products[${i}][price]`] = String(p.price);
      data[`products[${i}][type]`] = String(p.type);
    });

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

    console.log("CREDO RAW:", response.data);

    let redirectUrl = null;

    if (response.headers?.refresh) {
      const refresh = response.headers.refresh;
      if (refresh.includes('url=')) {
        redirectUrl = refresh.split('url=')[1];
      }
    }

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
    console.log("FULL ERROR:", err);

    return res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
