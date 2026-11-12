const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SMS_OFFICE_ENDPOINT,
  createSmsOfficeClient,
  normalizeGeorgianMobile,
  smsReference,
} = require('./sms-office');

test('normalizes supported Georgian mobile formats', () => {
  assert.equal(normalizeGeorgianMobile('555 12 34 56'), '995555123456');
  assert.equal(normalizeGeorgianMobile('+995 555 12 34 56'), '995555123456');
  assert.equal(normalizeGeorgianMobile('00995555123456'), '995555123456');
});

test('rejects invalid phone numbers before calling SMSOffice', () => {
  assert.throws(() => normalizeGeorgianMobile('1234'), { code: 'INVALID_SMS_DESTINATION' });
});

test('skips safely when credentials are not configured', async () => {
  const client = createSmsOfficeClient();
  assert.deepEqual(await client.sendOrderMessage({ type: 'cod', phone: '555123456' }), {
    sent: false,
    skipped: true,
    reason: 'not_configured',
  });
});

test('skips safely until the message text is configured', async () => {
  const client = createSmsOfficeClient({ apiKey: 'secret-key', sender: 'EZZY' });
  assert.deepEqual(await client.sendOrderMessage({ type: 'cod', phone: '555123456' }), {
    sent: false,
    skipped: true,
    reason: 'text_not_configured',
  });
});

test('sends URL-encoded SMSOffice request without exposing the key in the result', async () => {
  let request;
  const sendRequest = async (url, body, options) => {
    request = { url, body, options };
    return { Success: true, Output: 'accepted' };
  };
  const client = createSmsOfficeClient({
    apiKey: 'secret-key',
    sender: 'EZZY',
    texts: { cod: 'EZZY: შეკვეთა მიღებულია.' },
    request: sendRequest,
  });
  const result = await client.sendOrderMessage({ type: 'cod', phone: '+995 555 12 34 56', draftOrderId: '1234567890123456789' });

  assert.equal(request.url, SMS_OFFICE_ENDPOINT);
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(request.options.timeout, 10000);
  const payload = new URLSearchParams(request.body);
  assert.equal(payload.get('key'), 'secret-key');
  assert.equal(payload.get('destination'), '995555123456');
  assert.equal(payload.get('sender'), 'EZZY');
  assert.equal(payload.get('content'), 'EZZY: შეკვეთა მიღებულია.');
  assert.equal(payload.get('reference'), smsReference('1234567890123456789'));
  assert.deepEqual(result, { sent: true, reference: 'ezzy-567890123456789' });
  assert.equal(JSON.stringify(result).includes('secret-key'), false);
});

test('fills courier delivery and remaining amount placeholders', async () => {
  let submitted;
  const client = createSmsOfficeClient({
    apiKey: 'secret-key',
    sender: 'ezzy.ge',
    texts: { cod: 'მიწოდება {delivery_fee}₾, დარჩენილი {remaining_amount}₾.' },
    request: async (_url, body) => {
      submitted = new URLSearchParams(body);
      return { Success: true };
    },
  });

  await client.sendOrderMessage({
    type: 'cod',
    phone: '555123456',
    variables: { delivery_fee: 8, remaining_amount: 149 },
  });

  assert.equal(submitted.get('content'), 'მიწოდება 8₾, დარჩენილი 149₾.');
  assert.equal(submitted.get('content').includes('{'), false);
});

test('sends a one-time login code with runtime content', async () => {
  let submitted;
  const client = createSmsOfficeClient({
    apiKey: 'secret-key',
    sender: 'ezzy.ge',
    request: async (_url, body) => {
      submitted = new URLSearchParams(body);
      return { Success: true };
    },
  });

  const result = await client.sendMessage({
    phone: '555123456',
    content: 'ezzy.ge: პირად კაბინეტში შესვლის კოდია 123456. კოდი მოქმედებს 5 წუთი.',
    reference: 'login-abc',
  });

  assert.equal(submitted.get('sender'), 'ezzy.ge');
  assert.equal(submitted.get('content').includes('123456'), true);
  assert.deepEqual(result, { sent: true, reference: 'login-abc' });
});

test('treats an SMSOffice rejection as an error', async () => {
  const request = async () => ({ Success: false, ErrorCode: 150 });
  const client = createSmsOfficeClient({
    apiKey: 'secret-key',
    sender: 'EZZY',
    texts: { cod: 'Order received' },
    request,
  });
  await assert.rejects(
    client.sendOrderMessage({ type: 'cod', phone: '555123456' }),
    error => error.code === 'SMSOFFICE_REJECTED' && error.providerCode === 150,
  );
});

test('validates sender and content before contacting SMSOffice', async () => {
  const request = async () => assert.fail('request must not be called');
  const invalidSender = createSmsOfficeClient({
    apiKey: 'secret-key', sender: 'ქართული', texts: { cod: 'Order received' }, request,
  });
  await assert.rejects(
    invalidSender.sendOrderMessage({ type: 'cod', phone: '555123456' }),
    { code: 'INVALID_SMS_SENDER' },
  );

  const longText = createSmsOfficeClient({
    apiKey: 'secret-key', sender: 'EZZY', texts: { cod: 'a'.repeat(1001) }, request,
  });
  await assert.rejects(
    longText.sendOrderMessage({ type: 'cod', phone: '555123456' }),
    { code: 'INVALID_SMS_CONTENT' },
  );
});
