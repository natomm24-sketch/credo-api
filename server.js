const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// ⚠️ აქ ჩაწერე შენი რეალური მონაცემები Credo-სგან
const MERCHANT_ID = "XXXX"; 
const SECRET = "your_secret_here"; 

app.get("/", (req, res) => res.send("API is running"));

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const safeCustomer = req.body.customer || {};
    const orderCode = 'ORD_' + Date.now();

    // 1. პროდუქტების ფორმატირება (ფასი თეთრებში) [cite: 17, 139]
    const formattedProducts = products.map(p => ({
      id: String(p.id || ''),
      title: String(p.title || ''),
      amount: String(p.amount || 1),
      price: String(Math.round((p.price || 0) * 100)), 
      type: "0" // ყოველთვის "0" [cite: 17, 141]
    }));

    // 2. ჰეშის გენერაცია: Id+title+amount+price+type + password [cite: 14, 136]
    let stringToHash = "";
    formattedProducts.forEach(p => {
      stringToHash += p.id + p.title + p.amount + p.price + p.type;
    });
    stringToHash += SECRET;

    const check = crypto.createHash('md5').update(stringToHash).digest('hex');

    // 3. Payload-ის მომზადება [cite: 147-172]
    const credoPayload = {
      merchantId: MERCHANT_ID,
      orderCode: orderCode,
      check: check,
      products: formattedProducts,
      installmentLength: 12,
      clientFullName: safeCustomer.name || "",
      mobile: safeCustomer.phone || "",
      email: safeCustomer.email || "",
      factAddress: safeCustomer.address || ""
    };

    // 4. მოთხოვნის გაგზავნა "credoinstallment" ველით [cite: 84, 98]
    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php', // სწორი URL [cite: 83]
      qs.stringify({
        credoinstallment: JSON.stringify(credoPayload)
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      }
    );

    // 5. რედირექტის ამოღება ჰედერიდან ან ბოდიდან [cite: 18, 142]
    let redirectUrl = response.data?.URL || response.data?.redirectUrl;
    
    const refreshHeader = response.headers?.refresh;
    if (!redirectUrl && refreshHeader && refreshHeader.includes('url=')) {
        redirectUrl = refreshHeader.split('url=')[1];
    }

    console.log("CREDO RESPONSE:", response.data);
    return res.json({ redirectUrl, orderCode });

  } catch (err) {
    console.error('❌ ERROR FROM CREDO:', err.response?.data || err.message);
    return res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Render-ისთვის აუცილებელი პორტის კონფიგურაცია
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server running on port ' + PORT);
});
