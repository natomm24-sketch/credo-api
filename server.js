const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');
const Keepz = require('./keepz');
const { v4: uuidv4 } = require('uuid');

const app = express();
const pendingOrders = {};
const KEEPZ_INTEGRATOR_ID_EZZY =
  "bc5a2ee3-b20f-4b94-af42-770e0276bc58";
/* ===================== CREDO ===================== */

// EZZY (ახალი შპს)
const MERCHANT_ID_EZZY = "20504";
const SECRET_EZZY = "secret!@#";

// COMFORTMIX (ძველი შპს)
const MERCHANT_ID_COMFORT = "21118";
const SECRET_COMFORT = "Vq6h3J0+fI";

/* ===================== TBC EZZY ===================== */

const TBC_API_KEY_EZZY =
"t8HeSIPjlWbAPhhUcKiqXw3PO2HmXwSE";

const TBC_API_SECRET_EZZY =
"1uSdWMKbLu5bqcGs";

const TBC_MERCHANT_KEY_EZZY =
"404665563-54822600-e8fb-47cc-9eda-76e36501c0b6";

const TBC_CAMPAIGN_ID_EZZY =
529;


/* ===================== TBC COMFORTMIX ===================== */

const TBC_API_KEY_COMFORT =
"HH5Jiu9Ldzk6ka7m4NvPrSYW9Nk2ezEH";

const TBC_API_SECRET_COMFORT =
"XGlVzNoHWuthRLaO";

const TBC_MERCHANT_COMFORT =
"405757140-c326230e-e884-4565-be96-d41349469b31";

const TBC_CAMPAIGN_COMFORT =
529;

const KEEPZ_PUBLIC_KEY_EZZY = `
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArjz9QG4JfIczP6dQ1TQvVmQDmJLOao0hW4B3MsirlCEmDh0SQWTHTTQxdwOpmhDgkSWXRkAqJJchY96eswnn0R82lFIW2GegBFwk34gbzOch/Bsm7SL1F3foZQVpy3QPspZAJZl2ov/2bi4xOVDytJI4SdRZfLLdFwwDmqg6Z2+mIvKOLHHxUP0vpBoEIkekgo5bHQFtWYIIw7Ws3ZF2i9lHVYfUcaoxrHS3Xe3cf5u/xDVIOYssRBJz7xyxdC6FUJFTxZdjoqyxetfNCuhUDbjcsIsDORmKMGNAIw8NA/mKKTSGD1i7lkU++MkYNI3Nis8E9D102TqwrRKQ7Xs6HEDfR5ycN0aa3vsGiTlnjig063VmNMCZqqilEWtVV/uZJ4rxy5SVfmZpiYwpJkuDdGkRYVZpwEzNFJOFwpo/tLwYgtNxb8+FUap9ff8oCxk6+pXnTvPCL7wtYvqQNekPtvgIpYXHG8rTyra5RpEe5Tv00tPYceD6u0633x1CZFLXLc766xU/TYAHwpIxU6Ajeu1hEUs2kow4nzDebm0IYDw2C2YViHO/bdpbnq9fqpNGDivdQsPQ59NJwgowxBwU6ORGbd8aqCO6ZOkTUiQs1DHvCMVT/KZdsj3UcXB5aeAoOEx+ycx+cHpXXyOR1RZqH7k0F/lk9L8BoI1rtN3NbikCAwEAAQ==
`;

const KEEPZ_PRIVATE_KEY_EZZY = `
MIIJQQIBADANBgkqhkiG9w0BAQEFAASCCSswggknAgEAAoICAQCkdhJob4UQuoVTBPCjMYFrsxv9O+184wcDcDB8WnZXnUt6T6Uk4nfBE79R1FjAsiM9hQBWhP+4CLCmnff6emoG9HcbrTrcInjEfFpDOeE7FJhwzpLbBk4Y4WibxwHkGTkI5gN1Q5X1JbKcEyR8SymZ8ttnnJyd7fmMznFC4cnvGLNbsSmrQBq9eLNz4WdZeF3EHFGXaSJXmYx1h3EksWSA8ywkEpzVxyKNTfR5/Nau1wpltbjAOmFW7fcoQnslrVHQO9ItFeYcGheB+XbuILyOaOflLD6J9dTPVIT93CT+3+2QcVuI0olhD5SUa8PxkrCu/ZlqNw7S04xkOycXE8kk88eanqbC9vlkNp5+2w1BJTroKVQbBf3WPqvZxPtNeF+r2CHIOOYiBQwGd3FWsJlTs/ZCNjpchGs4wF08NTQ0lCaegR56Swr5wuHUydnYCNhMVtT5GnaRtBCKrHJ7vzqDpmaS42VZkU5TeabphjgXDvUopcdn6EKnQ8n/7x3qBQSwNazr9uSZ/kCLkXkeTCtZOUYpyZLCtmik+8woFbUYggK+9UaWRQAQpwVZS7lEDp0EF/1Hvq5n2xokA7hZHrJx6tpydWkhZP1z9yTQkGdOMDU32FmSLfacA1TpCivevs9wjIWMUF8khyDpM3dLMrgoQ608H3SCE1UFgVi5yi0NrQIDAQABAoICAE7wgZtxU/yYmuAjceHTJFzuptOhTTfxvO8QjaVSwpUBYjY+PnV64qJheSas90DfAH1J9sSQqDHMsgX3swyeb4ARHY7CUotRXIhra+Pyx0JVe2pCLUlGOHxGzbBgEG9NEAxOY4CIxVTbGGVD5vJmHXzQjjGogaBolqzYdpL0z7mdMJIlcmvJpEwnwHMx0Sqn1NIKCbvUcfB8Omg7b7p+D1C56AkUigUuxU3wChX3n5BilZIGbLyQCSLxq/2+E2AdVjTOUe7kIQSCHaB8fnKEch0lC5H777TGs7QkzIURgwx3rY70akw9SkW1dcrcAzxT/cyw20+ZR9s4QZ3mqrev/o6gvjR9bEnzMKJwgrRYvkueED4bHZb/WKMDwBmvdpVTRVYjfMGedDw7c6xzCtQiml2MtshJFrVce2PaH+RNJ7cwMYsEnM0acUtBGxQB9ZIczam1X0fUko4rcmyFn/8KmzFlNicNSJoI2HzqDQ6h6AfVgjZrbfHi+IgcCSTaQ6m2w1+VWkRGghXCV+YS3GiC16YgLE9kTnhtwBvDy1kDnnoccRePAloPdtiOZBRz9hfBB1AzbI9Vc39CULVy5P+szVMTFkvDHigUmchRwhHH1cAZ34Cpx1P3wIae9nmEi+Or16JkAMeweZilb926sybwytdHra0TTJp55PwkpZD9zzh9AoIBAQC2VT/0xSrlGbfEBocQ6MwTVoxsj6RTjr6mIS+KCBpT9BUA61ZEmZfRar0NS/iwPVqiJAssmZU48dPMQAB7bjsYVOl+2S+1suRZK79qitOP8aWbCiXMC7c44JhMlSq55yrJJRTG9rNpwpjJGUhongpxWIs4iHGxsG++rqoWkiSlFUp6izTkyCn0TEzzyMPeWS8xvu4MiC0IXcoVu0jhkZerXDvQyqolhcrS7Uqx4vvI2OESgtg+wc5bdTd9fSvCHqjP/i45QQib2ZrQ7RtfkWsTgueXlwVvRXnLf/IhhwZqCnPU76XFnKvYal6LP26DlovWfZv2wMUj1SiKkYztqXaHAoIBAQDm6FadJZvyoo0p4wCXZWu3X4bqSUjY9nEnBcAE/gRbiMC4gi1nybCj8+fPA+84388NT1ioOScJtliQLjS104N3PVb65ia1a9RBkDdMuYUmFNjbFVYN2tHF/va+hcku2B6/MohcjARO/rsJA7lLUPBSwdjpNebIti2vPFHnWmW5aate8dE8jnM95v4M4C+Yni2k6ERzBslOXdnuWX1Z/CZPnQgJaMwZ3wnZTBO2GKBZoXVhi+TLQHT1yQKZG58FFauob5E3zaw/+1I5M1uO/z7W8KWcc7GX8URWTusE0qT7YNBA6AZJYk+LTM9nMiCrkY7dPWOesu0RfRA2aYI8LPMrAoIBABHWFxKPsxmEQYjIhq/txgDiR4xbJN0Tqqy/tFHRZxntV5ymaOL/D23p/iJt2x8KcXJJClrLj2Bpr6lcXW+1ocxIiirhfhxNKq9aazg16mo7XlLjVD04rCzBM8TSFsLmzTWuDfFEstpWsfGCKqYpR6Y83imil1SliNjjZzocA7+ubIG+WmdC+W+vgxuZ+ScoHEjGf6z0KUuXOSyVDJUcU/TsaeGL4ccX5nZpxhPOu4izRpkz+YlyFgi2V75L31r2+taV69mn9fqg99cWSsY3iHz5IkSe/mYbKsXwdzQ2bDc1XI1pABNrtxfNmAARLXNr57QMx5QE2YQe1v9vK5UYLcMCggEAAb9gaHAQbhWs29RL/NlXp1uhucQ0OPAkixcQDPmfLtIqIztY/KAaJiOCbZ6qANQwzPj8wskr8nbe1LiEzZt8MzrTnbKAOH9Ia/abdIky6MbfnUjcDd7KF6WGWIrKqwAXu3q2bXzhy3dCEx9kF53VM8sjySAPTxWR4vGh7Q5SFsUl9uH9o2ewl5dX9OD9ezo3PjhDzFsQyvcK3zLuL/AomhGmLewNH2UAvhRFUet9yy/do49be+5Q9EtBKcd7vJ4dXnj5sGJuG03boXMyDjMAVsAbgMOfZHb+/Wg7fx3ZAc4JxXP8GDIWSAecyjsm5CWF30bHqjvQb4FyzfaedbYhYQKCAQBw16EAMqDWqe+HQnd/WDVNebK5ACcz1p43p3/C6yV83bzepPvHjbrV6w0ODtl3X4bSjG+LcfI3ejEg+3I1023qv3DWwuXKtXgsGThXCvbxrb2E+72oSoxj4SPf4vur4tJPhpe0OTePtMrHIf6pwCzbruA6pVePbOtEFf+pMlhUwlMzZJlRKdEvUyl+fc5X2X4bkCrwEp6r66OxjfF5FVrj52LtmgZOtZs+UroQiWacLvixAFpHuyUzGZcdag1cTFQ7hjHIpqZMkOgUhwkvo88VQCYztu8uWE8esiKilngnUOgZHQ+1QzZuRnXXRq8rbiuMuBqoDQsRpxmJOnhdBLHY
`;
app.use(cors({ origin: '*' }));
app.use(express.json());


const SHOP = "ezzy-ge.myshopify.com";
const ACCESS_TOKEN = "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";


const SHOPIFY_STORE = 'ezzy-ge.myshopify.com';

const SHOPIFY_CLIENT_ID = '3f09333ae04b00e338137653ea48a8e2';
const SHOPIFY_CLIENT_SECRET = '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';


const KEEPZ_INTEGRATOR_ID = "5e03f8e2-8eb8-42ff-9175-56a53a4dd96c";
const KEEPZ_PUBLIC_KEY = "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAufnkp1l18mSJQcZ2JkB32Hp7m0X9m1lnmgGshQDvoqVqqmq0/165WH04sFlQimKe5zGKSVkrEAR2A2uu9nhH/kSU6fPl19VyLg+DH7VaGawN68HfdUeLv4Vauni1/L1y2eh4WNzuqkI9lIAIeY2zWwx+nKs8areFn0Sw8s6zD8ehbHCK2cT0HObcvZcf2n4THHxhvpdlkGPkoGMnDC/cZRdRa5DPyNBuhKDIno38zMfnsCDTZ56NkSzjB7lrO1oHQX5ilRx578/+FvpbvR3WXdotKfE/QejpE6Ty5kBMGz3zMbW0iRvWWA4Cf26dJg3pgOeQ39YJX3mrRDmnQe7EgHePswDi6NL0UEc/NJr8Wug8k+Ggx/q/a754c6aPkKC/VUy4Rrzn3JBODB7v9+SJ/T8JMkiOYkl8SZARtidboj25US2GAb3a7NxIdLC4nosN6OrYoffav6awnoUVjbcTSXYonk4XNGIViwdP+PS4BaX/Thoa4aUm7rv1drDGvaCmXZCce4elps1NnsZjWdS/JfTAN82XqDc2Vse6EEikiQb5z4zEZeqoEMRrzKC+YTmX1mw+0G9bUKzsmRJ3nftFmyn/fdj71x7zJXzeNZtuEg3TgveVWfehUsEIp9JnD0bHyBkX2/sgMnIzj7nq3sKa7SnCGJPC4ehkmeQeEpKqZW8CAwEAAQ==";
const KEEPZ_PRIVATE_KEY = "MIIJQgIBADANBgkqhkiG9w0BAQEFAASCCSwwggkoAgEAAoICAQDJrSqjCucNVYP8aeK6/bF8Z8lRnf/kYsVI+d5KHG+4i7G+ZhaSElA+ljTcub0zFsxVUXinuTsdtRI40DVreNUFqwYo7b6Gl46Rob/PogVnBlqu9MhQMULsLeCDxZnk6TpUXWCRi6Mfvs0AGg/Vv1fnsokFzRF8DyNM7AA+REqyonoQeoviJ3VN4GJalVciImCLTheS/vGDYAx4MQkwtHhXNqfv92ivkhK5/Lz9RcyUL3S2aqlvN2LI7A/gREM6KM8L7eEB3H/Q/NtFQIXyV1z4EWnX1ct4uDrCnYjvVCrv4o9KBm9QrItkh1RjWH+Kjv0lFdSMv0RAydDMS8SM2IvdEABAIhAYVBxKSiytfoutsoRSJ3cYKY2coAgpGIm3Dsex3BYD5v0zZoqtLqpFtwC7OVRtjSm143ctJI/AnAHtX/HBpC9t8THnlkAc9LYTiwv3LBe2H46PNootQo/4ep6oxvlk7UJuoyiUgVNSCbPwpHzWVs4ZyspiZtPj7RxzRfsmI9JbNpazeofEKxsFKJluwfJOBdWfr+M99QKdgHqGnhOfLaE7iqHngQf+8TgHfNAWzd14UZPEm0/Perjwkdg7oMWgDsKqR8WEDRewiWFUVJOQfUFc7MNQ+kVxmWwAum8C52nOBClPSabvKWVFAYdd8x8IfzXg5p+JMFsMFI4hSwIDAQABAoICAAxsS1URxdvPabrxttK37+fu6LrLVcj2wJpXMfc0uzkN+dv1o+xJjoHcdNMn6dysyddzllAWm+qfjcjMIo5FOjIIL+/zfSoDSff0k8ExhM2s2YcvcutlrW6pAMx9LpaoOzyZJ+qvRFQfR7d644DSMZMHL2OZFzuiHxWM8BLl2Aga9BPxyI4cyiAK82QLEPv8TCAoplEavTvPfdUliCBk7YjJyByDDALMp7SnOekMFKcIKVNXTKqaKc6go/W3nsCFZQOiGpsnvwPbn5IrgFTGRubNA80U0VzVVGFKnPXJJH/0X8k6jj7U8h02LN+Vwv2BA1z2dEpbOdQX2nHLNQdMC4lthYjQqcU+UmjTAoIWtUHbySmlawYPLLJqmZk996XoHqRen03cha0skMqrV7AMknmS9/mKZlOMX5T0FWtClB78SgfzJ/cGC25oss9EbyFIUbSEftnwe0KDfG/NvcfdkbWZh76+e7jZfN8SJOCxAowYOtR4+p/3mYnID8VGJR7w5puTlAwvJ8Gia1RJ+NgAgkRQphN+vzEJs6Z0ZuCQ0PixEquxp7dYtlTAdJzqtVqvwBOIJuBMFpp1zlqraX62xuPSLMf+bn3t7dmyAqsJ3fYz8ckeiY0RjFPWeyg5/ruYlk4WF1ez5fpPDjjKwmOWpkiqkb4t6KfY27K7l84Z7wHxAoIBAQDibm9WcrNZ6vKai0eJqgg6vyjA8CCXKeme15ZJJApztu1IZKn4m2SaWSwKq2krYqwFAsomfgPMmNXi5SDZV9tjIyQIiPc3ASBRDei1eBXVnOUY6tP6SQMMJTx5TiFH4QzIGu3o7ZLNMY51fWrUp7l8pQ8qy0q77rs6HJr6X+YGKsnyUYzpINRJiIlLgUgLXg+rNVEdAgGh5Krf7uQ1vaStDxQ9YF4R0WFuvKSZrlkeXU0y3d2uHHdEE4SYlYXNSnj/GvOJpJuMUw4iDS99ZpIkxsCRAC3WHCmCf6ERscwW+EJ3BHNI9ciKyG3lXRz4SfIiBRBk2l8lSUNWin8WyDKZAoIBAQDkAy1uCvqQUHggjHcw+bUg1DoKmUNm1wLCiUyDHibhrFp4MSl+jNJFH/zJzIzBO2D6xKNQW4tc3mIvUP/Eu5maUzKuXNRTLaRytozR9KPCj6zq8qRsWHHttfbtDHiwpK1bDN27cJzaW7BPcAIaBLndZnojAAWki4mmPpaCFtjWMh0FlNwM6MpRNpvAAyIsPm0sBTTqLZ1dJ3deC3trfQ50c2d4P8l4M2tTFGnLYIAyhJa7wd/TKMLyW0WCDnuOG1MVS2qOeMd+A3KQ6FI2uFw5UBLuLYz/WughRvFeYmdpkt1Ul/itxyPBTwKRIZAokwJenUA54mcWyKIZUh+u4UWDAoIBAFD0WNwYgCUKyhgU6cu/Pdf7Fk/8yjohYwRGYdXei9oZMbarPtXCgPJqJUPfSueXDJdyCuI+NY+FqRrI/riWH7rPCof+qBxDS9GO3n9a4ruPr5z8ADPAvNUvzvIzy9ROEurMLfkUT2MLb7pzz6keGkQFI2oSarLMRKYfKg2QEcZsr+zx2SZUdXGg3i1fmGlwBLwagNiVKg4+mhUb7P2FwwWYmYzkEl3edS5JRbQoUHZ5tysThblFNiLhs4t2EfN2x9G1ShMRBgfiffAQtMTp0iBR6vEsljaxtOmSRfz0i1o/AkxZC/qu3Tc5N4lEhCIFFguxsc3NAS1shyW+uHdltikCggEBANRsIWbj04ufbErmkiSOfrCXB3vYTXMB3RBf2WhOLusQJzjSlFXR3BOKOXfHmVpsd20oxP2YS725cL+kNqSSIggkepL26NiVLR+x8n+n6ujX8cDxTT2jKIDNhb5SYB4xTVAGLIzz3S2RPjDDqTGUNZSOZDs3SgqB9TtsE8wefOUQyvjoNhnQxqvitDeus6eEgTEBqMqCtJiUrCBxkgoR9+WFnl/pDUlung5IdkeDH+vwmn1RobSXxQcFATypQXKjAkRUfnE9FJ3RmGpoBi/0kfbTIs/CoBlGF/zomvXTt4Qjzw+Aha1gWW8+rKWJH0StsQd0eOF0i5YuVNZCLEJAnQECggEASxwEAazRnMk3EnL7IedhCL0MrKoWZnqwwDLLer1yjUKDI/tPMx9GYPkHjo3mwADPVjyAGm3lsDUPAqdblH843mX8+aiIPXQwjJD3Xat6fsV6bOPnLgzmKaOocLcVE6Q13eMqZUr6YlCEu8A1AcpFXbXA7KajMmZYGL89pEOMqwm1eHkLBf48jyRklNGKOwQBV8YUTXnqv5igsC8OZHF6etbIi0dieIIPJlP6UaWg05toeu1GLuW9NQyljdWoVtKd7uT6ZPFiBRJ859kkrRf3ket7o3tjAB8u2xB+TgR0qsj9DQ2s2dGJFjpXQ5N5BabUijhrOOfexVqoSnH1Qobw6g==";

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ===================== BOG EZZY ===================== */

const BOG_CLIENT_ID_EZZY =
"10001646";

const BOG_CLIENT_SECRET_EZZY =
"ocoUoCrhHpbk";

/* ===================== CREDO ===================== */

app.post('/api/credo-order', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const orderCode = 'ORD_' + Date.now();

    const formattedProducts = products.map(p => ({
      id: String(p.id),
      title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
      amount: Number(p.amount || 1),
      price: Number(p.price),
      type: 0
    }));

    let stringToHash = '';
    formattedProducts.forEach(p => {
      stringToHash += p.id + p.title + p.amount + p.price + "0";
    });
    stringToHash += SECRET_EZZY;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');
console.log("CREDO MERCHANT:", MERCHANT_ID_EZZY);

console.log("CREDO REQUEST:", {
  merchantId: MERCHANT_ID_EZZY,
  orderCode,
  products: formattedProducts
});
    
    const data = {
      merchantId: MERCHANT_ID_EZZY,
      orderCode: orderCode,
      check: check,
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = 0;
    });

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
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
      error: err.response?.data || err.message
    });
  }
});

/* ===================== SHOPIFY + CREDO FLOW ===================== */

app.post('/api/create-order-and-credo', async (req, res) => {
  try {
    const products = Array.isArray(req.body.products) ? req.body.products : [];
    const amount = Number(req.body.amount);

    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `Credo Order
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "CREDO",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const draftOrder = shopifyResponse.data.draft_order;

    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order',
      { products },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json({
      draftOrderId: draftOrder.id,
      redirectUrl: credoResponse.data.redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== TBC ===================== */

app.post('/api/tbc-order', async (req, res) => {
  try {
     console.log("FULL BODY:", req.body);
    console.log("PRODUCTS FROM FRONT:", req.body.products);
    
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products" });
    }

    /* TOKEN */
    const tokenResponse = await axios.post(
      'https://api.tbcbank.ge/oauth/token',
      qs.stringify({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
  TBC_API_KEY_EZZY + ':' + TBC_API_SECRET_EZZY
).toString('base64')
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    /* INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: TBC_MERCHANT_KEY_EZZY,
campaignId: TBC_CAMPAIGN_ID_EZZY,
     priceTotal: Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
),

currency: "GEL",

invoiceId: "INV_" + Date.now(),

products: products.map(p => ({
  
  name: p.product_title
    ? `${p.product_title} - ${p.title}`
    : (p.title || "Product"),

  price:
    Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price),

  quantity: Number(p.amount) || 1

}))
  },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    console.log("STATUS:", tbcResponse.status);
    console.log("HEADERS:", tbcResponse.headers);
    console.log("DATA:", tbcResponse.data);

    const redirectUrl = tbcResponse.headers.location;

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        status: tbcResponse.status,
        headers: tbcResponse.headers,
        data: tbcResponse.data
      });
    }

    return res.json({ redirectUrl });

  } catch (err) {
    console.log("TBC ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});

/* ===================== BOG ORDER EZZY ===================== */

app.post('/api/bog-order', async (req, res) => {

  try {

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!products.length) {
      return res.status(400).json({
        error: "No products"
      });
    }

    /* TOKEN */

    const tokenResponse = await axios.post(

      'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token',

      qs.stringify({
        grant_type: 'client_credentials'
      }),

      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization':
            'Basic ' +
            Buffer.from(
              BOG_CLIENT_ID_EZZY +
              ':' +
              BOG_CLIENT_SECRET_EZZY
            ).toString('base64')
        }
      }

    );

    const accessToken =
      tokenResponse.data.access_token;
    const amount = Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
);

const cartItems = products.map(p => ({

  total_item_amount:
    (Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price))
    * (Number(p.amount) || 1),

  item_description:
    p.product_title
      ? `${p.product_title} - ${p.title}`
      : (p.title || "Product"),

  total_item_qty:
    Number(p.amount) || 1,

  item_vendor_code:
    String(p.id),

  product_image_url:
    "https://ezzy.ge",

  item_site_detail_url:
    "https://ezzy.ge"

}));
console.log("BOG TOKEN OK");
console.log("ACCESS TOKEN EXISTS:", !!accessToken);
    const checkoutResponse = await axios.post(

  'https://installment.bog.ge/v1/installment/checkout',

  {
    intent: "LOAN",

    installment_month: 12,

    installment_type: "STANDARD",

    shop_order_id: "BOG_" + Date.now(),

    success_redirect_url:
      "https://ezzy.ge/pages/payment-success",

    fail_redirect_url:
      "https://ezzy.ge/payment-fail",

    reject_redirect_url:
      "https://ezzy.ge/payment-fail",

    validate_items: true,

    locale: "ka",

    purchase_units: [
      {
        amount: {
          currency_code: "GEL",
          value: amount
        }
      }
    ],

    cart_items: cartItems

  },

  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }

);

console.log(
  "BOG CHECKOUT:",
  checkoutResponse.data
);
    return res.json({
      success: true,
      accessTokenExists: !!accessToken
    });

  } catch (err) {

    console.log(
      "BOG ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      error:
        err.response?.data || err.message
    });

  }

});

/* ===================== TBC COMFORTMIX ===================== */

app.post('/api/tbc-order-comfortmix', async (req, res) => {
  try {
     console.log("FULL BODY:", req.body);
    console.log("PRODUCTS FROM FRONT:", req.body.products);
    
    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (products.length === 0) {
      return res.status(400).json({ error: "No products" });
    }

    /* TOKEN */
    const tokenResponse = await axios.post(
      'https://api.tbcbank.ge/oauth/token',
      qs.stringify({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
  TBC_API_KEY_COMFORT + ':' + TBC_API_SECRET_COMFORT
).toString('base64')
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    /* INSTALLMENT */
    const tbcResponse = await axios.post(
      'https://api.tbcbank.ge/v1/online-installments/applications',
      {
        merchantKey: TBC_MERCHANT_COMFORT,
campaignId: TBC_CAMPAIGN_COMFORT,
     priceTotal: Number(
  products.reduce((sum, p) => {

    const rawPrice = Number(p.price);

    return sum + (
      (rawPrice > 10000 ? rawPrice / 100 : rawPrice)
      * (Number(p.amount) || 1)
    );

  }, 0)
),

currency: "GEL",

invoiceId: "INV_" + Date.now(),

products: products.map(p => ({
  
  name: p.product_title
    ? `${p.product_title} - ${p.title}`
    : (p.title || "Product"),

  price:
    Number(p.price) > 10000
      ? Number(p.price) / 100
      : Number(p.price),

  quantity: Number(p.amount) || 1

}))
  },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    console.log("STATUS:", tbcResponse.status);
    console.log("HEADERS:", tbcResponse.headers);
    console.log("DATA:", tbcResponse.data);

    const redirectUrl = tbcResponse.headers.location;

    if (!redirectUrl) {
      return res.status(400).json({
        error: "No redirect URL",
        status: tbcResponse.status,
        headers: tbcResponse.headers,
        data: tbcResponse.data
      });
    }

    return res.json({ redirectUrl });

  } catch (err) {
    console.log("TBC ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, shop } = req.query;

    const response = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: '3f09333ae04b00e338137653ea48a8e2',
        client_secret: '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',
        code: code
      }
    );

    console.log("KEEPZ RESPONSE:", response.data);
res.json(response.data);

  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== SHOPIFY + CREDO (COMFORTMIX) ===================== */

const SHOP_COMFORT = "comfortmix.myshopify.com";
const ACCESS_TOKEN_COMFORT ="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";

app.post('/api/create-order-and-credo-comfortmix', async (req, res) => {
  try {
    console.log("BODY RECEIVED:", req.body);
    const products = req.body.products || [];

    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `Credo Order (Comfortmix)
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "CREDO",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
          'Content-Type': 'application/json'
        }
      }
    );

    const draftOrder = shopifyResponse.data.draft_order;

    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order-comfortmix',
      { products },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.json({
      draftOrderId: draftOrder.id,
      redirectUrl: credoResponse.data.redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.post('/api/credo-order-comfortmix', async (req, res) => {
  try {

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    const orderCode = 'ORD_' + Date.now();

    const formattedProducts = products.map(p => ({
      id: String(p.id),
      title: String(p.title).replace(/[^\x00-\x7F]/g, '').trim() || "Product",
      amount: Number(p.amount || 1),
      price: Number(p.price),
      type: 0
    }));

    let stringToHash = '';

    formattedProducts.forEach(p => {
      stringToHash +=
        p.id +
        p.title +
        p.amount +
        p.price +
        "0";
    });

    stringToHash += SECRET_COMFORT;

    const check = crypto
      .createHash('md5')
      .update(stringToHash)
      .digest('hex');
    console.log("CREDO MERCHANT:", MERCHANT_ID_COMFORT);

console.log("CREDO REQUEST:", {
  merchantId: MERCHANT_ID_COMFORT,
  orderCode,
  products: formattedProducts
});


    const data = {
      merchantId: MERCHANT_ID_COMFORT,
      orderCode,
      check,
      installmentLength: 12
    };

    formattedProducts.forEach((p, i) => {
      data[`products[${i}][id]`] = p.id;
      data[`products[${i}][title]`] = p.title;
      data[`products[${i}][amount]`] = p.amount;
      data[`products[${i}][price]`] = p.price;
      data[`products[${i}][type]`] = 0;
    });

    const response = await axios.post(
      'https://ganvadeba.credo.ge/widget_api/index.php',
      qs.stringify(data),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        maxRedirects: 0,
        validateStatus: () => true
      }
    );

    const redirectUrl =
      response.headers.location ||
      (response.headers.refresh &&
      response.headers.refresh.includes('url=')
        ? response.headers.refresh.split('url=')[1]
        : null) ||
      response.data?.URL ||
      response.data?.data?.URL;

    if (redirectUrl) {
      return res.json({ redirectUrl });
    }

    return res.status(400).json({
      error: 'No redirect URL',
      bankResponse: response.data
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }
});
/* ===================== SHOPIFY + BANK (UNIFIED) ===================== */

app.post('/api/create-order-and-bank', async (req, res) => {
  try {
    const { products, bank } = req.body;

    // Shopify order
    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          }))
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
          'Content-Type': 'application/json'
        }
      }
    );

    let redirectUrl;

    // 🔥 ბანკის არჩევა
    if (bank === "izi") {
      redirectUrl = await sendToCredo({
        products,
        merchantId: MERCHANT_ID_IZI,
        secret: SECRET_IZI
      });
    }

    if (bank === "comfort") {
      redirectUrl = await sendToCredo({
        products,
        merchantId: MERCHANT_ID_COMFORT,
        secret: SECRET_COMFORT
      });
    }

    return res.json({
      draftOrderId: shopifyResponse.data.draft_order.id,
      redirectUrl
    });

  } catch (err) {
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
/* ===================== KEEPZ ===================== */

app.post('/api/keepz-order', async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    const products = Array.isArray(req.body.products) ? req.body.products : [];

    if (!products.length) {
      return res.status(400).json({ error: "No products" });
    }

    // 🔒 თანხის დაცული გამოთვლა backend-ზე
    let total = 0;

for (const p of products) {

  const shopifyRes = await axios.get(
    `https://${SHOP}/admin/api/2024-01/variants/${p.id}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN
      }
    }
  );

  const realPrice = Number(shopifyRes.data.variant.price);

  total += realPrice * (Number(p.amount) || 1);
}

const amount = Number(total.toFixed(2));

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    console.log("FINAL AMOUNT:", amount);

    const keepz = new Keepz(
  KEEPZ_PUBLIC_KEY_EZZY,
  KEEPZ_PRIVATE_KEY_EZZY
);
    const orderId = uuidv4();
    pendingOrders[orderId] = {
  customer: req.body.customer,
  products: req.body.products,
  createdAt: Date.now()
};

    const orderData = {
      amount: amount,
      currency: "GEL",
     integratorId: KEEPZ_INTEGRATOR_ID_EZZY,
      integratorOrderId: orderId,
      receiverId: "a5c389e9-2823-4e8d-a8ef-193be7f3c5ab",
      receiverType: "BRANCH",
      directLinkProvider: "DEFAULT",
      language: "KA",

      // 🔥 redirect-ები დალაგებული
      successRedirectUri:
`https://ezzy.ge/pages/payment-success?orderId=${orderId}&amount=${amount}&productId=${req.body.products[0].id}`,
      failRedirectUri: `https://ezzy.ge/payment-fail`,

      // 🔥 KEEPZ callback
      callbackUri: "https://api.ezzy.ge/api/keepz-callback"
    };

    const encrypted = keepz.encrypt(orderData);

    const response = await axios.post(
      "https://gateway.keepz.me/ecommerce-service/api/integrator/order",
      {
        identifier: KEEPZ_INTEGRATOR_ID_EZZY,
        encryptedData: encrypted.encryptedData,
        encryptedKeys: encrypted.encryptedKeys,
        aes: true
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    console.log("RAW KEEPZ RESPONSE:", response.data);

    let decrypted;

    try {
      decrypted = keepz.decrypt(
        response.data.encryptedData,
        response.data.encryptedKeys
      );

      console.log("DECRYPTED:", decrypted);

    } catch (err) {
      console.error("DECRYPT ERROR:", err);
      return res.status(500).json({ error: "Decryption failed" });
    }

const redirect =
  decrypted?.redirectUrl ||
  decrypted?.paymentUrl ||
  decrypted?.urlForQR ||
  decrypted?.redirectUri;

if (!redirect) {
  return res.status(500).json({
    error: "No redirect URL",
    debug: decrypted
  });
}

return res.json({
  redirectUrl: redirect,
  orderId: orderId
});

    return res.json({
      redirectUrl: decrypted.redirectUrl,
      orderId: orderId
    });

  } catch (err) {
    console.error("KEEPZ ERROR:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || err.message
    });
  }
});
app.post('/api/keepz-callback', async (req, res) => {
  try {
    console.log("KEEPZ CALLBACK:", req.body);

    const { status, integratorOrderId } = req.body;

    // მხოლოდ წარმატებული გადახდა
    if (status !== "SUCCESS") {
      return res.sendStatus(200);
    }

    // ⚠️ აქ უნდა გქონდეს შენახული products (შემდეგ ეტაპზე დავამატებთ)
    const products = req.body.products || [];

    if (!products.length) {
      console.log("No products in callback");
      return res.sendStatus(200);
    }

    // Shopify order შექმნა
    const shopifyResponse = await axios.post(
      `https://${SHOP}/admin/api/2024-01/orders.json`,
      {
        order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          financial_status: "paid",
          note: `Keepz Order ID: ${integratorOrderId}`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("SHOPIFY ORDER CREATED:", shopifyResponse.data.order.id);

    res.sendStatus(200);

  } catch (err) {
    console.error("CALLBACK ERROR:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});
app.post('/api/keepz-success', async (req, res) => {

  try {

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        error: 'Order ID required'
      });
    }

    const savedOrder = pendingOrders[orderId];

    if (!savedOrder) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    console.log('SUCCESS ORDER:', savedOrder);
   await axios.post(

  `https://${SHOPIFY_STORE}/admin/api/2026-04/orders.json`,

  {
    order: {

      line_items: savedOrder.products.map(p => ({
        variant_id: Number(p.id),
        quantity: p.amount
      })),

     customer: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone
},

billing_address: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone,
  country: "Georgia"
},

      financial_status: 'paid',
note: `Name: ${savedOrder.customer.name}
Phone: ${savedOrder.customer.phone}`,
      tags: 'KEEPZ'

    }
  },

  {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  }

);
    return res.json({
      success: true
    });

  } catch (e) {

    console.log(
  'SHOPIFY ERROR:',
  JSON.stringify(e.response?.data || e, null, 2)
);

    return res.status(500).json({
      error: 'Server error'
    });

  }

});
/* ===================== KEEPZ (COMFORTMIX) ===================== */

app.post('/api/keepz-order-comfortmix', async (req, res) => {

  try {

    console.log("REQ BODY:", req.body);

    const products = Array.isArray(req.body.products)
      ? req.body.products
      : [];

    if (!products.length) {

      return res.status(400).json({
        error: "No products"
      });

    }

    // 🔒 უსაფრთხო თანხის გამოთვლა Shopify-დან
    let total = 0;

    for (const p of products) {

      const shopifyRes = await axios.get(

        `https://${SHOP_COMFORT}/admin/api/2024-01/variants/${p.id}.json`,

        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT
          }
        }

      );

      const realPrice =
        Number(shopifyRes.data.variant.price);

      total +=
        realPrice * (Number(p.amount) || 1);

    }

    const amount =
      Number(total.toFixed(2));

    if (!amount || isNaN(amount)) {

      return res.status(400).json({
        error: "Invalid amount"
      });

    }

    console.log("FINAL AMOUNT:", amount);

    const keepz = new Keepz(
      KEEPZ_PUBLIC_KEY,
      KEEPZ_PRIVATE_KEY
    );

    const orderId = uuidv4();

    pendingOrders[orderId] = {

      customer: req.body.customer,

      products: req.body.products,

      createdAt: Date.now(),

      store: 'comfortmix'

    };

    const orderData = {

      amount: amount,

      currency: "GEL",

      integratorId: KEEPZ_INTEGRATOR_ID,

      integratorOrderId: orderId,

      receiverId:
        "d10d0e01-e70f-41eb-b7ba-8fd14e425f3f",

      receiverType: "BRANCH",

      directLinkProvider: "DEFAULT",

      language: "KA",

      successRedirectUri:
`https://comfortmix.ge/pages/payment-success?orderId=${orderId}&amount=${amount}&productId=${req.body.products[0].id}`,

      failRedirectUri:
`https://comfortmix.ge/payment-fail`,

      callbackUri:
"https://api.ezzy.ge/api/keepz-callback-comfortmix"

    };

    const encrypted =
      keepz.encrypt(orderData);

    const response = await axios.post(

      "https://gateway.keepz.me/ecommerce-service/api/integrator/order",

      {
        identifier: KEEPZ_INTEGRATOR_ID,

        encryptedData:
          encrypted.encryptedData,

        encryptedKeys:
          encrypted.encryptedKeys,

        aes: true
      },

      {
        headers: {
          "Content-Type": "application/json"
        }
      }

    );

    console.log(
      "RAW KEEPZ RESPONSE:",
      response.data
    );

    let decrypted;

    try {

      decrypted = keepz.decrypt(

        response.data.encryptedData,

        response.data.encryptedKeys

      );

      console.log(
        "DECRYPTED:",
        decrypted
      );

    } catch (err) {

      console.error(
        "DECRYPT ERROR:",
        err
      );

      return res.status(500).json({
        error: "Decryption failed"
      });

    }

    const redirect =

      decrypted?.redirectUrl ||

      decrypted?.paymentUrl ||

      decrypted?.urlForQR ||

      decrypted?.redirectUri;

    if (!redirect) {

      return res.status(500).json({

        error: "No redirect URL",

        debug: decrypted

      });

    }

    return res.json({

      redirectUrl: redirect,

      orderId: orderId

    });

  } catch (err) {

    console.error(

      "KEEPZ ERROR:",

      err.response?.data || err.message

    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});


/* ===================== KEEPZ SUCCESS (COMFORTMIX) ===================== */

app.post('/api/keepz-success-comfortmix', async (req, res) => {

  try {

    const { orderId } = req.body;

    if (!orderId) {

      return res.status(400).json({
        error: 'Order ID required'
      });

    }

    const savedOrder =
      pendingOrders[orderId];

    if (!savedOrder) {

      return res.status(404).json({
        error: 'Order not found'
      });

    }

    console.log(
      'SUCCESS ORDER:',
      savedOrder
    );

    await axios.post(

      `https://${SHOP_COMFORT}/admin/api/2026-04/orders.json`,

      {
        order: {

          line_items:
            savedOrder.products.map(p => ({

              variant_id: Number(p.id),

              quantity: p.amount

            })),

          customer: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone
},

billing_address: {
  first_name: savedOrder.customer.name,
  phone: savedOrder.customer.phone,
  country: "Georgia"
},

          financial_status: 'paid',

          note:
`Name: ${savedOrder.customer.name}
Phone: ${savedOrder.customer.phone}`,

          tags: 'KEEPZ, COMFORTMIX'

        }
      },

      {
        headers: {

          'X-Shopify-Access-Token':
            ACCESS_TOKEN_COMFORT,

          'Content-Type':
            'application/json'

        }
      }

    );

    return res.json({
      success: true
    });

  } catch (e) {

    console.log(

      'SHOPIFY ERROR:',

      JSON.stringify(
        e.response?.data || e,
        null,
        2
      )

    );

    return res.status(500).json({
      error: 'Server error'
    });

  }

});
app.post('/api/create-order-and-tbc-comfortmix', async (req, res) => {
  try {

    const products = req.body.products || [];

    // 1. Shopify draft order
    const shopifyResponse = await axios.post(
      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,
      {
        draft_order: {
          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),
          customer: {
            first_name: req.body.name || "Customer"
          },
          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },
          note: `TBC Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,
          tags: "TBC",
          use_customer_default_address: false
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
          'Content-Type': 'application/json'
        }
      }
    );

    // 2. TBC redirect
    const tbcResponse = await axios.post(
      'https://api.ezzy.ge/api/tbc-order-comfortmix',
      { products },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({
      draftOrderId: shopifyResponse.data.draft_order.id,
      redirectUrl: tbcResponse.data.redirectUrl
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }
});
app.post('/api/create-order-and-cod-comfortmix', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP_COMFORT}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Cash On Delivery
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "კურიერთან",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN_COMFORT,
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({
      success: true,
      draftOrderId: shopifyResponse.data.draft_order.id
    });

  } catch (err) {

    return res.status(500).json({
      error: err.response?.data || err.message
    });

  }

});
/* ===================== SHOPIFY + TBC (EZZY) ===================== */

app.post('/api/create-order-and-tbc-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    // Shopify draft order
    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `TBC Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "TBC",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }

    );

    // TBC redirect
    const tbcResponse = await axios.post(

      'https://api.ezzy.ge/api/tbc-order',

      { products },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({

      draftOrderId:
        shopifyResponse.data.draft_order.id,

      redirectUrl:
        tbcResponse.data.redirectUrl

    });

  } catch (err) {

    console.log(
      "EZZY TBC ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + CREDO (EZZY) ===================== */

app.post('/api/create-order-and-credo-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    // Shopify draft order
    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Credo Installment
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "CREDO",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }

    );

    // Credo redirect
    const credoResponse = await axios.post(
  'https://api.ezzy.ge/api/credo-order',

      { products },

      {
        headers: {
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({

      draftOrderId:
        shopifyResponse.data.draft_order.id,

      redirectUrl:
        credoResponse.data.redirectUrl

    });

  } catch (err) {

    console.log(
      "EZZY CREDO ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
/* ===================== SHOPIFY + COD (EZZY) ===================== */

app.post('/api/create-order-and-cod-ezzy', async (req, res) => {

  try {

    const products = req.body.products || [];

    const shopifyResponse = await axios.post(

      `https://${SHOP}/admin/api/2024-01/draft_orders.json`,

      {
        draft_order: {

          line_items: products.map(p => ({
            variant_id: Number(p.id),
            quantity: p.amount || 1
          })),

          customer: {
            first_name: req.body.name || "Customer"
          },

          shipping_address: {
            first_name: req.body.name || "Customer",
            address1: req.body.address || "",
            phone: req.body.phone || "",
            country: "Georgia"
          },

          note: `Cash On Delivery
Name: ${req.body.name}
Phone: ${req.body.phone}
Address: ${req.body.address}`,

          tags: "კურიერთან",

          use_customer_default_address: false

        }
      },

      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }

    );

    return res.json({

      success: true,

      draftOrderId:
        shopifyResponse.data.draft_order.id

    });

  } catch (err) {

    console.log(
      "EZZY COD ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({

      error:
        err.response?.data || err.message

    });

  }

});
app.get('/api/test-bog', async (req, res) => {

  const response = await axios.post(
    'https://api.ezzy.ge/api/bog-order',
    {
      products: [
        {
          id: "1",
          title: "Test",
          price: 100,
          amount: 1
        }
      ]
    }
  );

  res.json(response.data);

});
app.listen(process.env.PORT || 3000);
