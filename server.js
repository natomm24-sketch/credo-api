const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();
app.use(express.json());

const MERCHANT_ID = "TEST";   // შეცვლი
const SECRET = "secret";      // შეცვლი


app.post('/api/credo-order', async (req, res) => {
  try {
    const { products, customer } = req.body;

    const orderCode = 'ORD_' + Date.now();

    let stringToHash = '';

    products.forEach(p => {
      stringToHash += p.id + p.title + p.amount + p.price + p.type;
    });

    stringToHash += SECRET;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify({
        merchantId: MERCHANT_ID,
        orderCode: orderCode,
        check: check,
        products: JSON.stringify(products),
        clientFullName: customer?.name || "",
        mobile: customer?.phone || "",
        email: customer?.email || "",
        factAddress: customer?.address || "",
        installmentLength: 12
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const refreshHeader = response.headers['refresh'];

    let redirectUrl = null;

    if (refreshHeader) {
      redirectUrl = refreshHeader.split('url=')[1];
    }

    console.log("NEW CREDO ORDER:", {
      orderCode,
      products,
      customer
    });

    res.json({ redirectUrl });

  } catch (err) {
    console.log('ERROR FROM CREDO:', err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});


// ✅ TEST ROUTE (ეს გაკლდა)
app.get('/test', (req, res) => {
  res.send('ok');
});


// SUCCESS / FAIL
app.get('/success', (req, res) => {
  res.send("გადახდა წარმატებით დასრულდა");
});

app.get('/fail', (req, res) => {
  res.send("გადახდა ვერ განხორციელდა");
});


app.listen(3000, () => console.log('Server running'));