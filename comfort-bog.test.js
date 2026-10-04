const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

test('Comfortmix exposes BOG installment and part-by-part checkout routes', () => {
  assert.match(serverSource, /app\.post\('\/api\/create-order-and-bog-comfortmix'/);
  assert.match(serverSource, /app\.post\('\/api\/create-order-and-bog-part-comfortmix'/);
  assert.match(serverSource, /app\.post\('\/api\/bog-order-comfortmix'/);
  assert.match(serverSource, /app\.post\('\/api\/bog-part-order-comfortmix'/);
});

test('Comfortmix BOG checkout shares Ezzy credentials but keeps Comfortmix redirects', () => {
  assert.match(
    serverSource,
    /Buffer\.from\(`\$\{BOG_CLIENT_ID_EZZY\}:\$\{BOG_CLIENT_SECRET_EZZY\}`\)/
  );
  assert.match(serverSource, /storefrontUrl: 'https:\/\/comfortmix\.ge'/);
  assert.match(serverSource, /\^\(BOG\|BNPL\|CBOG\|CBNPL\)_/);
});
