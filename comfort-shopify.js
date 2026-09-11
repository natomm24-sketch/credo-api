const axios = require('axios');

// Comfortmix credentials and token cache must never fall back to EZZY's tracker.
const shop = 'comfortmix.myshopify.com';
let cachedToken;
let expiresAt = 0;
let pendingToken;

async function getAccessToken() {
  const clientId = process.env.SHOPIFY_COMFORT_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_COMFORT_CLIENT_SECRET;
  if (!clientId && !clientSecret && process.env.SHOPIFY_COMFORT_ACCESS_TOKEN) {
    return process.env.SHOPIFY_COMFORT_ACCESS_TOKEN;
  }
  if (!clientId || !clientSecret) throw new Error('Comfortmix Shopify credentials are not configured');
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
  if (!pendingToken) {
    pendingToken = (async () => {
      const response = await axios.post(
        `https://${shop}/admin/oauth/access_token`,
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
      );
      const { access_token: token, expires_in: lifetime } = response.data || {};
      if (typeof token !== 'string' || !token || !Number.isFinite(Number(lifetime)) || Number(lifetime) <= 60) {
        throw new Error('Comfortmix Shopify returned an invalid token response');
      }
      cachedToken = token;
      expiresAt = Date.now() + Number(lifetime) * 1000;
      return token;
    })().catch(() => {
      throw new Error('Comfortmix Shopify authentication failed');
    }).finally(() => { pendingToken = null; });
  }
  return pendingToken;
}

module.exports = { shop, getAccessToken };
