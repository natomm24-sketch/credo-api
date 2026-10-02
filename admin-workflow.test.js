const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const originalLoad = Module._load;
Module._load = function loadWithAxiosStub(request, parent, isMain) {
  if (request === 'axios') return {};
  return originalLoad.call(this, request, parent, isMain);
};
const tracker = require('./tracker');
Module._load = originalLoad;

const { extractAdminWorkflow } = tracker.statusHelpers;

test('extracts the saved admin status and comment from draft attributes', () => {
  assert.deepEqual(extractAdminWorkflow([
    { key: 'other_attribute', value: 'keep me' },
    { key: 'ezzy_admin_status', value: 'NO_ANSWER' },
    { key: 'ezzy_admin_comment', value: 'დარეკვა ხვალ დილით' },
  ]), {
    adminStatus: 'NO_ANSWER',
    adminComment: 'დარეკვა ხვალ დილით',
  });
});

test('ignores unsupported workflow statuses', () => {
  assert.deepEqual(extractAdminWorkflow([
    { key: 'ezzy_admin_status', value: 'PAID' },
  ]), {
    adminStatus: '',
    adminComment: '',
  });
});
