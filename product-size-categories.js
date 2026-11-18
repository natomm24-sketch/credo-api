const crypto = require('crypto');

const CATEGORY_TAGS = ['EZZY-WOMEN', 'EZZY-MEN', 'EZZY-UNISEX'];
const WEBHOOK_TOPICS = ['PRODUCTS_CREATE', 'PRODUCTS_UPDATE'];

function numericSize(value) {
  const match = String(value || '').trim().replace(',', '.').match(/^(\d{2}(?:\.5)?)$/);
  if (!match) return null;
  const size = Number(match[1]);
  return size >= 20 && size <= 60 ? size : null;
}

function productSizes(product) {
  const sizes = [];
  for (const variant of product?.variants?.nodes || product?.variants || []) {
    const selectedOptions = variant.selectedOptions || [];
    for (const option of selectedOptions) {
      if (/size|ზომ/i.test(option.name || '')) sizes.push(numericSize(option.value));
    }
    for (const key of ['option1', 'option2', 'option3']) sizes.push(numericSize(variant[key]));
    for (const part of String(variant.title || '').split(/\s*\/\s*/)) sizes.push(numericSize(part));
  }
  for (const option of product?.options || []) {
    if (!/size|ზომ/i.test(option.name || '')) continue;
    for (const value of option.values || []) sizes.push(numericSize(value));
  }
  return Array.from(new Set(sizes.filter((size) => size !== null))).sort((a, b) => a - b);
}

function categoryTagsForProduct(product) {
  const sizes = productSizes(product);
  const hasWomenSize = sizes.some((size) => size >= 36 && size <= 40);
  const hasMenSize = sizes.some((size) => size >= 40);
  const crossesRange = sizes.some((size) => size >= 36 && size < 40) && sizes.some((size) => size > 40);
  return [
    ...(hasWomenSize ? ['EZZY-WOMEN'] : []),
    ...(hasMenSize ? ['EZZY-MEN'] : []),
    ...(crossesRange ? ['EZZY-UNISEX'] : []),
  ];
}

function existingTags(product) {
  if (Array.isArray(product?.tags)) return product.tags;
  return String(product?.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

async function syncProductCategoryTags(graphql, product) {
  const id = String(product?.id || '');
  if (!id) return { changed: false, add: [], remove: [] };
  const current = new Set(existingTags(product));
  const desired = new Set(categoryTagsForProduct(product));
  const add = Array.from(desired).filter((tag) => !current.has(tag));
  const remove = CATEGORY_TAGS.filter((tag) => current.has(tag) && !desired.has(tag));
  if (!add.length && !remove.length) return { changed: false, add, remove };

  const data = await graphql(`
    mutation SyncProductSizeCategories($id: ID!, $add: [String!]!, $remove: [String!]!) {
      add: tagsAdd(id: $id, tags: $add) { userErrors { field message } }
      remove: tagsRemove(id: $id, tags: $remove) { userErrors { field message } }
    }
  `, { id, add, remove });
  const errors = [...(data.add?.userErrors || []), ...(data.remove?.userErrors || [])];
  if (errors.length) throw new Error(errors.map((error) => error.message).join('; '));
  return { changed: true, add, remove };
}

function validWebhookHmac(rawBody, receivedHmac, clientSecret) {
  if (!rawBody?.length || !receivedHmac || !clientSecret) return false;
  const expected = crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64');
  const received = String(receivedHmac);
  return expected.length === received.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function fetchProduct(graphql, id) {
  const data = await graphql(`
    query ProductSizeCategories($id: ID!) {
      product(id: $id) {
        id tags
        options { name values }
        variants(first: 100) { nodes { title selectedOptions { name value } } }
      }
    }
  `, { id });
  return data.product;
}

async function ensureWebhooks(graphql, callbackUrl) {
  const data = await graphql(`
    query ProductSizeCategoryWebhooks {
      webhookSubscriptions(first: 100) {
        nodes {
          topic
          endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
        }
      }
    }
  `);
  const subscriptions = data.webhookSubscriptions?.nodes || [];
  for (const topic of WEBHOOK_TOPICS) {
    if (subscriptions.some((item) => item.topic === topic && item.endpoint?.callbackUrl === callbackUrl)) continue;
    const result = await graphql(`
      mutation CreateProductSizeCategoryWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
          webhookSubscription { id topic }
          userErrors { field message }
        }
      }
    `, { topic, callbackUrl });
    const errors = result.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) throw new Error(errors.map((error) => error.message).join('; '));
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function syncExistingProducts(graphql) {
  let after = null;
  let scanned = 0;
  let changed = 0;
  do {
    const data = await graphql(`
      query ExistingProductSizeCategories($after: String) {
        products(first: 100, after: $after) {
          nodes {
            id tags
            options { name values }
            variants(first: 100) { nodes { title selectedOptions { name value } } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after });
    const connection = data.products;
    for (const product of connection?.nodes || []) {
      scanned += 1;
      try {
        const result = await syncProductCategoryTags(graphql, product);
        if (result.changed) changed += 1;
      } catch (error) {
        console.error('PRODUCT SIZE CATEGORY SYNC ITEM ERROR:', product.id, error.message);
      }
      await wait(80);
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  } while (after);
  return { scanned, changed };
}

function registerProductSizeCategories({ app, graphql, clientSecret, callbackUrl }) {
  app.post('/api/shopify/product-size-categories', (req, res) => {
    const hmac = req.get('x-shopify-hmac-sha256');
    if (!validWebhookHmac(req.rawBody, hmac, clientSecret)) return res.status(401).send('Invalid webhook');
    const numericId = String(req.body?.admin_graphql_api_id || req.body?.id || '').replace(/\D/g, '');
    res.status(200).send('OK');
    if (!numericId) return;
    setImmediate(async () => {
      try {
        const product = await fetchProduct(graphql, `gid://shopify/Product/${numericId}`);
        if (product) await syncProductCategoryTags(graphql, product);
      } catch (error) {
        console.error('PRODUCT SIZE CATEGORY WEBHOOK ERROR:', error.message);
      }
    });
  });

  setTimeout(async () => {
    try {
      await ensureWebhooks(graphql, callbackUrl);
      const result = await syncExistingProducts(graphql);
      console.log('PRODUCT SIZE CATEGORIES READY:', result);
    } catch (error) {
      console.error('PRODUCT SIZE CATEGORIES INIT ERROR:', error.message);
    }
  }, 5000);
}

module.exports = {
  CATEGORY_TAGS,
  categoryTagsForProduct,
  productSizes,
  registerProductSizeCategories,
  syncProductCategoryTags,
  validWebhookHmac,
};

