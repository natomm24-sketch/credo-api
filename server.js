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
      price: Math.round(Number(p.price) * 100),
      type: "0"
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

app.listen(process.env.PORT || 3000);
