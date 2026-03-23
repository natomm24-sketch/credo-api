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
        const orderCode = 'ORD_' + Date.now();

        // 1. პროდუქტების მომზადება
        const formattedProducts = products.map(p => ({
            id: String(p.id),
            title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim(),
            amount: Number(p.amount || 1),
            price: Math.round(Number(p.price) * 100),
            type: "0" // დოკუმენტში ზოგჯერ String-ია [cite: 141]
        }));

        // 2. სწორი HASH (მხოლოდ პროდუქტები + საიდუმლო) 
        let stringToHash = "";
        formattedProducts.forEach(p => {
            stringToHash += p.id + p.title + p.amount + p.price + p.type;
        });
        stringToHash += SECRET;
        const check = crypto.createHash('md5').update(stringToHash).digest('hex');

        // 3. მონაცემების აწყობა x-www-form-urlencoded ფორმატისთვის
        const formData = {
            merchantId: MERCHANT_ID,
            orderCode: orderCode,
            check: check,
            installmentLength: 12
        };

        // პროდუქტების დამატება ინდექსებით: products[0][id] [cite: 137-141]
        formattedProducts.forEach((p, i) => {
            formData[`products[${i}][id]`] = p.id;
            formData[`products[${i}][title]`] = p.title;
            formData[`products[${i}][amount]`] = String(p.amount);
            formData[`products[${i}][price]`] = String(p.price);
            formData[`products[${i}][type]`] = p.type;
        });

        // 4. მოთხოვნა
        const response = await axios.post(
            'https://ganvadeba.credo.ge/widget_api/order.php',
            qs.stringify(formData),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0, // არ გადაყვეს ავტომატურად
                validateStatus: (status) => status >= 200 && status < 400 
            }
        );

        // 5. URL-ის ძებნა Header-ში ან Body-ში [cite: 18, 142]
        let redirectUrl = response.headers['location'] || 
                          response.headers['refresh']?.split('url=')[1] || 
                          response.data?.URL || 
                          response.data?.data?.URL;

        if (redirectUrl) {
            return res.json({ redirectUrl });
        }

        return res.status(400).json({
            error: "Redirect URL ვერ მოიძებნა",
            credoResponse: response.data,
            headers: response.headers
        });

    } catch (err) {
        console.error("ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(process.env.PORT || 3000);
