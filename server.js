const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = "TEST"; // შეცვალე რეალურით
const SECRET = "secret";    // შეცვალე რეალურით

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get('/test', (req, res) => {
  res.send('ok');
});

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const safeCustomer =
      req.body.customer && typeof req.body.customer === 'object'
        ? req.body.customer
        : {};

    const orderCode = 'ORD_' + Date.now();

    // ✅ PRODUCTS (FIXED PRICE)
    const formattedProducts = products.map(p => {
      const priceInTetri = Math.round((p.price || 0) * 100);

      console.log("PRICE DEBUG:", p.price, "=>", priceInTetri);

      return {
        id: String(p.id || ''),
        title: String(p.title || '').trim(),
        amount: String(p.amount || 1),
        price: String(Math.round((p.price || 0) * 100)), // ✅ სწორი (თეთრებში)
        type: "0"
      };
    });
    // ✅ HASH
    let stringToHash = '';

    for (const p of formattedProducts) {
      stringToHash += p.id + p.title + p.amount + p.price + p.type;
    }

    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');
console.log("HASH STRING:", stringToHash);
console.log("CHECK:", check);
    // ✅ FORM DATA
    const data = {
      merchantId: MERCHANT_ID,
      orderCode: orderCode,
      check: check,
      clientFullName: safeCustomer.name || "",
      mobile: safeCustomer.phone || "",
      email: safeCustomer.email || "",
      factAddress: safeCustomer.address || "",
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = p.type;
    });

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/order.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );

    let redirectUrl = null;

    const refresh = response.headers?.refresh;

    if (refresh && refresh.includes('url=')) {
      redirectUrl = refresh.split('url=')[1];
    }

    if (!redirectUrl && response.data?.URL) {
      redirectUrl = response.data.URL;
    }

    if (!redirectUrl && response.data?.redirectUrl) {
      redirectUrl = response.data.redirectUrl;
    }

    console.log("CREDO RESPONSE:", response.data);

    return res.json({ redirectUrl });

  } catch (err) {
    console.log('❌ ERROR FROM CREDO:', err.response?.data || err.message);

    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀 Server running on port ' + PORT);
});
