const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = "21118";
const SECRET = "Vq6h3J0+fI";

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

    const form = new FormData();

    form.append('merchantId', MERCHANT_ID);
    form.append('orderCode', orderCode);
    form.append('check', check);
    form.append('installmentLength', '12');
    form.append('products', JSON.stringify(formattedProducts));

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      form,
      {
        headers: form.getHeaders(),
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
