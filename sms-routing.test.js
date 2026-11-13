const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const trackerSource = fs.readFileSync(path.join(__dirname, 'tracker.js'), 'utf8');

function route(pathname) {
  const start = source.indexOf(`app.post('${pathname}'`);
  assert.notEqual(start, -1, `${pathname} route is missing`);
  const end = source.indexOf("app.post('", start + 10);
  return source.slice(start, end === -1 ? source.length : end);
}

test('legacy COD and verified Keepz callbacks use their own configurable SMS', () => {
  assert.match(route('/api/create-order-and-cod-ezzy'), /sendEzzyOrderSms\(\{ type: 'cod'/);
  const callback = route('/api/keepz-callback');
  const refreshStart = source.indexOf('async function refreshKeepzPayment');
  const refreshEnd = source.indexOf("app.post('/api/keepz-callback'", refreshStart);
  const refresh = source.slice(refreshStart, refreshEnd);
  assert.match(callback, /refreshKeepzPayment\(integratorOrderId/);
  assert.match(refresh, /type: paymentType === 'courier' \? 'cod' : 'card'/);
  assert.match(refresh, /delivery_fee:[\s\S]*?remaining_amount:/);
  assert.match(refresh, /if \(paymentType === 'card' && !wasSuccessful\) \{[\s\S]*?sendMetaPurchase/);
  assert.match(refresh, /markKeepzDraftSuccessful/);
  assert.match(refresh, /EZZY-KEEPZ-SMS-SENT/);
  assert.doesNotMatch(callback, /completeKeepzDraft|\/complete\.json/);
});

test('bank application creation preserves redirects without sending an early SMS', () => {
  for (const pathname of [
    '/api/create-order-and-bog-ezzy',
    '/api/create-order-and-bog-part-ezzy',
    '/api/create-order-and-tbc-ezzy',
    '/api/create-order-and-tbc-cart-ezzy',
    '/api/create-order-and-credo-ezzy',
  ]) {
    const body = route(pathname);
    assert.match(body, /redirectUrl:/, `${pathname} must keep its redirect response`);
    assert.doesNotMatch(body, /sendEzzyOrderSms/, `${pathname} must not send SMS before bank approval`);
  }
});

test('verified successful bank statuses send one deduplicated Ezzy SMS', () => {
  const bogCallback = route('/api/bog-installment-callback');
  assert.match(bogCallback, /fetchBogStatus\([\s\S]*?force: true/);
  assert.match(bogCallback, /callbackWasSuccessful[\s\S]*?sendEzzyOrderSms/);
  assert.match(bogCallback, /BANK_SMS_SENT_TAG/);

  assert.match(trackerSource, /result\.statusId === 'success'[\s\S]*?sendSuccessfulBankSms\(record, smsType/);
  assert.match(trackerSource, /result\.statusId === 8[\s\S]*?sendSuccessfulBankSms\(record, 'tbc'/);
  assert.match(trackerSource, /result\.statusId === 12[\s\S]*?sendSuccessfulBankSms\(record, 'credo'/);
  assert.match(trackerSource, /tags\.some\([\s\S]*?BANK_SMS_SENT_TAG/);
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

