const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

// ✅ MIDDLEWARE (ერთხელ და სწორად)
app.use(cors({ origin: '*' }));
app.use(express.json());

// 🔐 CONFIG (შეცვალე რეალურით)
const MERCHANT_ID = "TEST";
const SECRET = "secret";

// ✅ ROOT
app.get("/", (req, res) => {
  res.send("API is running");
});

// ✅ TEST
app.get('/test', (req, res) => {
  res.send('ok');
});

// ✅ CREDO ORDER
app.post('/api/credo-order', async (req, res) => {
  try {
    const { products = [], customer = {} } = req.body;

    const orderCode = 'ORD_' + Date.now();

    // 🔥 HASH
    let stringToHash = '';

    products.forEach(p => {
      stringToHash +=
        (p.id || '') +
        (p.title || '') +
        (p.amount || 1) +
        (p.price || 0) +
        (p.type || '');
    });

    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');

    // 🔥 REQUEST CREDO-ზე
    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify({
        merchantId: MERCHANT_ID,
        orderCode: orderCode,
        check: check,
        products: JSON.stringify(products),
        clientFullName: customer.name || "",
        mobile: customer.phone || "",
        email: customer.email || "",
        factAddress: customer.address || "",
        installmentLength: 12
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 🔥 REDIRECT URL ამოღება
    let redirectUrl = null;

    if (response.headers['refresh']) {
      const refresh = response.headers['refresh'];

      if (refresh.includes('url=')) {
        redirectUrl = refresh.split('url=')[1];
      }
    }

    // fallback (ზოგჯერ აქ მოდის)
    if (!redirectUrl && response.data?.redirectUrl) {
      redirectUrl = response.data.redirectUrl;
    }

    res.json({ redirectUrl });

  } catch (err) {
    console.log('❌ ERROR FROM CREDO:', err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

// ✅ SUCCESS / FAIL
app.get('/success', (req, res) => {
  res.send("გადახდა წარმატებით დასრულდა");
});

app.get('/fail', (req, res) => {
  res.send("გადახდა ვერ განხორციელდა");
});

// ✅ PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log('🚀 Server running on port ' + PORT));
