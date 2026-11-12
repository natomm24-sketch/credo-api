const SMS_OFFICE_ENDPOINT = 'https://smsoffice.ge/api/v2/send/';

function normalizeGeorgianMobile(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('995')) digits = digits.slice(3);
  if (!/^5\d{8}$/.test(digits)) {
    const error = new Error('Invalid Georgian mobile number');
    error.code = 'INVALID_SMS_DESTINATION';
    throw error;
  }
  return `995${digits}`;
}

function smsReference(draftOrderId) {
  const suffix = String(draftOrderId || '').replace(/\D/g, '').slice(-15);
  return suffix ? `ezzy-${suffix}` : undefined;
}

async function defaultRequest(url, body, options) {
  const response = await fetch(url, {
    method: 'POST',
    body,
    headers: options.headers,
    signal: AbortSignal.timeout(options.timeout),
  });
  if (!response.ok) throw new Error(`SMSOffice HTTP ${response.status}`);
  return response.json();
}

function createSmsOfficeClient({ apiKey, sender, texts = {}, request = defaultRequest } = {}) {
  const key = String(apiKey || '').trim();
  const senderName = String(sender || '').trim();

  async function sendMessage({ phone, content, reference }) {
    if (!key || !senderName) {
      return { sent: false, skipped: true, reason: 'not_configured' };
    }
    const cleanContent = String(content || '').replace(/\s+/g, ' ').trim();
    if (!cleanContent) {
      return { sent: false, skipped: true, reason: 'text_not_configured' };
    }
    if (!/^[A-Za-z0-9.-]{1,11}$/.test(senderName)) {
      const error = new Error('Invalid SMSOffice sender');
      error.code = 'INVALID_SMS_SENDER';
      throw error;
    }
    if (cleanContent.length > 1000) {
      const error = new Error('SMSOffice content is too long');
      error.code = 'INVALID_SMS_CONTENT';
      throw error;
    }

    const payload = new URLSearchParams({
      key,
      destination: normalizeGeorgianMobile(phone),
      sender: senderName,
      content: cleanContent,
    });
    if (reference) payload.set('reference', String(reference).slice(0, 50));

    const result = await request(SMS_OFFICE_ENDPOINT, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });
    const success = result.Success === true || result.Success === 1 || result.Success === 'true';
    if (!success) {
      const error = new Error('SMSOffice rejected the message');
      error.code = 'SMSOFFICE_REJECTED';
      error.providerCode = result.ErrorCode;
      throw error;
    }

    return { sent: true, reference };
  }

  async function sendOrderMessage({ type, phone, draftOrderId }) {
    return sendMessage({ phone, content: texts[type], reference: smsReference(draftOrderId) });
  }

  return { sendMessage, sendOrderMessage };
}

module.exports = {
  SMS_OFFICE_ENDPOINT,
  createSmsOfficeClient,
  normalizeGeorgianMobile,
  smsReference,
};
