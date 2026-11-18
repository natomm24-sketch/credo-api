const DEFAULT_LIMIT = 8;
const DEFAULT_MAX_DRAFT_ORDERS = 500;
const PAGE_SIZE = 100;

function rankDraftOrderProducts(draftOrders, limit = DEFAULT_LIMIT) {
  const totals = new Map();
  let sequence = 0;

  for (const draftOrder of draftOrders || []) {
    for (const lineItem of draftOrder?.lineItems?.nodes || []) {
      const product = lineItem?.product;
      const handle = String(product?.handle || '').trim();
      const id = String(product?.legacyResourceId || '').trim();
      if (!handle || !id) continue;

      const quantity = Math.max(0, Number(lineItem.quantity) || 0);
      if (!quantity) continue;

      const current = totals.get(id) || { id, handle, quantity: 0, sequence: sequence++ };
      current.quantity += quantity;
      current.handle = handle;
      totals.set(id, current);
    }
  }

  return Array.from(totals.values())
    .sort((left, right) => right.quantity - left.quantity || left.sequence - right.sequence)
    .slice(0, limit)
    .map(({ sequence: _sequence, ...product }) => product);
}

async function fetchPopularDraftOrderProducts(graphql, options = {}) {
  const limit = Math.max(1, Number(options.limit) || DEFAULT_LIMIT);
  const maxDraftOrders = Math.max(1, Number(options.maxDraftOrders) || DEFAULT_MAX_DRAFT_ORDERS);
  const draftOrders = [];
  let after = null;

  while (draftOrders.length < maxDraftOrders) {
    const first = Math.min(PAGE_SIZE, maxDraftOrders - draftOrders.length);
    const data = await graphql(`
      query DraftOrderProductPopularity($first: Int!, $after: String) {
        draftOrders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
          nodes {
            lineItems(first: 100) {
              nodes {
                quantity
                product {
                  legacyResourceId
                  handle
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { first, after });

    const connection = data?.draftOrders;
    if (!connection) break;
    draftOrders.push(...(connection.nodes || []));
    if (!connection.pageInfo?.hasNextPage || !connection.pageInfo?.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return rankDraftOrderProducts(draftOrders, limit);
}

module.exports = {
  fetchPopularDraftOrderProducts,
  rankDraftOrderProducts,
};

