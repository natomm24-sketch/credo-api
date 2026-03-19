const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

// ✅ MIDDLEWARE
app.use(cors({ origin: '*' }));
app.use(express.json());

// 🔐 CONFIG
const MERCHANT_ID = "TEST"; // შეცვალე რეალურით
const SECRET = "secret";    // შეცვალე რეალურით

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
    const products = req.body.products || [];
const safeCustomer = req.body.customer || {};

    const safeCustomer = customer || {}; // 🔥 FIX

    const orderCode = 'ORD_' + Date.now();

    // 🔥 1. პროდუქტების სწორ ფორმატში გადაყვანა
    const formattedProducts = products.map(p => ({
      id: String(p.id),
      title: String(p.title),
      amount: Number(p.amount),
      price: Number(p.price), // tetri
      type: Number(p.type || 0)
    }));

    // 🔥 2. HASH
    let stringToHash = '';

    formattedProducts.forEach(p => {
      stringToHash +=
        p.id +
        p.title +
        p.amount +
        p.price +
        p.type;
    });

    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');

    // 🔥 3. REQUEST
    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/order.php',
      qs.stringify({
        merchantId: MERCHANT_ID,
        orderCode: orderCode,
        check: check,
        products: JSON.stringify(formattedProducts),
        clientFullName: safeCustomer.name || "",
        mobile: safeCustomer.phone || "",
        email: safeCustomer.email || "",
        factAddress: safeCustomer.address || "",
        installmentLength: 12
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 🔥 4. REDIRECT URL
    let redirectUrl = null;

    const refresh = response.headers['refresh'];

    if (refresh && refresh.includes('url=')) {
      redirectUrl = refresh.split('url=')[1];
    }

    if (!redirectUrl && response.data?.redirectUrl) {
      redirectUrl = response.data.redirectUrl;
    }

    console.log("CREODO RESPONSE:", response.data);

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
