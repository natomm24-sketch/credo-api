const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function route(pathname) {
  const start = source.indexOf(`app.post('${pathname}'`);
  assert.notEqual(start, -1, `${pathname} route is missing`);
  const end = source.indexOf("app.post('", start + 10);
  return source.slice(start, end === -1 ? source.length : end);
}

test('all Ezzy order methods trigger their own configurable SMS after provider setup', () => {
  assert.match(route('/api/create-order-and-cod-ezzy'), /sendEzzyOrderSms\(\{ type: 'cod'/);
  assert.match(route('/api/create-order-and-bog-ezzy'), /sendEzzyOrderSms\(\{ type: 'bog'/);
  assert.match(route('/api/create-order-and-bog-part-ezzy'), /sendEzzyOrderSms\(\{ type: 'bogPart'/);
  assert.match(route('/api/create-order-and-tbc-ezzy'), /sendEzzyOrderSms\(\{ type: 'tbc'/);
  assert.match(route('/api/create-order-and-tbc-cart-ezzy'), /sendEzzyOrderSms\(\{ type: 'tbc'/);
  assert.match(route('/api/create-order-and-credo-ezzy'), /sendEzzyOrderSms\(\{ type: 'credo'/);
  assert.match(route('/api/keepz-callback'), /sendEzzyOrderSms\(\{[\s\S]*?type: 'card'/);
});

test('Comfortmix routes do not use Ezzy SMSOffice configuration', () => {
  assert.doesNotMatch(route('/api/keepz-order-comfortmix'), /sendEzzyOrderSms/);
  assert.doesNotMatch(route('/api/create-order-and-cod-comfortmix'), /sendEzzyOrderSms/);
});

test('message texts and credentials are loaded only from server environment', () => {
  for (const name of [
    'SMSOFFICE_API_KEY',
    'SMSOFFICE_SENDER',
    'SMSOFFICE_TEXT_COD',
    'SMSOFFICE_TEXT_CARD',
    'SMSOFFICE_TEXT_BOG',
    'SMSOFFICE_TEXT_BOG_PART',
    'SMSOFFICE_TEXT_TBC',
    'SMSOFFICE_TEXT_CREDO',
  ]) {
    assert.match(source, new RegExp(`process\\.env\\.${name}`));
  }
});
