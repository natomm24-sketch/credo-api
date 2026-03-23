const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const MERCHANT_ID = "21118";
const SECRET = "Vq6h3J0+fI";

app.post('/api/credo-order', async (req, res) => {
    try {
        const products = Array.isArray(req.body.products) ? req.body.products : [];
        if (products.length === 0) return res.status(400).json({ error: "No products" });

        const orderCode = 'ORD_' + Date.now();

        // 1. პროდუქტების ფორმატირება (ფასი თეთრებში!) 
        const formattedProducts = products.map(p => ({
            id: String(p.id),
            title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
            amount: Number(p.amount || 1),
            price: Math.round(Number(p.price) * 100), // 239 ლარი -> 23900 თეთრი 
            type: "0" // ყოველთვის 0 [cite: 17, 141]
        }));

        // 2. MD5 Hash-ის გენერირება [cite: 14, 49, 136]
        let stringToHash = "";
        formattedProducts.forEach(p => {
            stringToHash += p.id + p.title + p.amount + p.price + p.type;
        });
        stringToHash += SECRET; 
        const check = crypto.createHash('md5').update(stringToHash).digest('hex');

        // 3. მონაცემების მომზადება (Standard URLSearchParams)
        const params = new URLSearchParams();
        params.append('merchantId', MERCHANT_ID);
        params.append('orderCode', orderCode);
        params.append('check', check);
        params.append('installmentLength', "12");

        formattedProducts.forEach((p, i) => {
            params.append(`products[${i}][id]`, p.id);
            params.append(`products[${i}][title]`, p.title);
            params.append(`products[${i}][amount]`, String(p.amount));
            params.append(`products[${i}][price]`, String(p.price));
            params.append(`products[${i}][type]`, p.type);
        });

        // 4. მოთხოვნა ბანკთან [cite: 9, 83]
        const response = await axios.post(
            'https://ganvadeba.credo.ge/widget_api/order.php',
            params.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: () => true
            }
        );

        // 5. URL-ის ამოღება Header-იდან ან Body-დან [cite: 18, 142]
        let redirectUrl = response.headers['location'] || 
                          (response.headers['refresh']?.includes('url=') ? response.headers['refresh'].split('url=')[1] : null) ||
                          response.data?.URL || 
                          response.data?.data?.URL;

        if (redirectUrl) {
            return res.json({ redirectUrl });
        }

        return res.status(400).json({
            error: "Redirect URL ვერ მოიძებნა",
            bankResponse: response.data,
            sentData: params.toString() // დებაგისთვის
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
