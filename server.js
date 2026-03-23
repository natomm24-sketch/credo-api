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
        const orderCode = 'ORD_' + Date.now();

        // 1. პროდუქტების მომზადება (ფასი აუცილებლად თეთრებში!) [cite: 17, 139]
        const formattedProducts = products.map(p => ({
            id: String(p.id),
            title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
            amount: Number(p.amount || 1),
            price: Math.round(Number(p.price) * 100), // 239 ლარი -> 23900 თეთრი
            type: "0" // დოკუმენტში String 0-ია [cite: 17, 141]
        }));

        // 2. MD5 Hash [cite: 14, 136]
        let stringToHash = "";
        formattedProducts.forEach(p => {
            stringToHash += p.id + p.title + p.amount + p.price + p.type;
        });
        stringToHash += SECRET;
        const check = crypto.createHash('md5').update(stringToHash).digest('hex');

        // 3. მონაცემების მომზადება Axios-ისთვის (URLSearchParams გამოიყენე FormData-ს ნაცვლად)
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

        // 4. მოთხოვნა ბანკთან [cite: 10, 83]
        const response = await axios.post(
            'https://ganvadeba.credo.ge/widget_api/order.php',
            params,
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: () => true
            }
        );

        // 5. Redirect URL-ის ძებნა [cite: 18, 142]
        let redirectUrl = response.headers['location'] || 
                          response.data?.URL || 
                          response.data?.data?.URL;

        if (redirectUrl) {
            return res.json({ redirectUrl });
        }

        return res.status(400).json({
            error: "Redirect URL ვერ მოიძებნა",
            bankResponse: response.data
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(process.env.PORT || 3000);
