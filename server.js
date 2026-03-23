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

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products" });
    }

    const orderCode = 'ORD_' + Date.now();

    // ✅ პროდუქტების ფორმატირება
    const formattedProducts = products.map(p => {
      const cleanTitle = String(p.title)
        .replace(/[^\x00-\x7F]/g, '')
        .trim() || "Product";

      return {
        id: String(p.id),
        title: cleanTitle,
        amount: Number(p.amount || 1),
        price: Math.round(Number(p.price) * 100),
        type: 0
      };
    });

    // ✅ HASH (დოკუმენტაციის მიხედვით)
    let stringToHash = '';

    formattedProducts.forEach(p => {
      stringToHash += p.id + p.title + p.amount + p.price + p.type;
    });

    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');

    // ✅ form-data payload
    const formData = {
      merchantId: MERCHANT_ID,
      orderCode: orderCode,
      check: check,
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      formData[`products[${i}][id]`] = p.id;
      formData[`products[${i}][title]`] = p.title;
      formData[`products[${i}][amount]`] = p.amount;
      formData[`products[${i}][price]`] = p.price;
      formData[`products[${i}][type]`] = p.type;
    });

    // ✅ request Credo-ზე
    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/order.php',
      qs.stringify(formData),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    // ✅ redirect URL ამოღება
    let redirectUrl = null;

    if (response.headers.location) {
      redirectUrl = response.headers.location;
    } else if (response.headers.refresh && response.headers.refresh.includes('url=')) {
      redirectUrl = response.headers.refresh.split('url=')[1];
    } else if (response.data?.URL) {
      redirectUrl = response.data.URL;
    } else if (response.data?.data?.URL) {
      redirectUrl = response.data.data.URL;
    }

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        credoResponse: response.data
      });
    }

    return res.json({ redirectUrl });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
