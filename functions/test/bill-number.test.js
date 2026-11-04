const test = require('node:test');
const assert = require('node:assert/strict');
const { financialYear, billNumber } = require('../bill-number');

test('financial year turns over on 1 April', () => {
  assert.equal(financialYear('2026-03-31'), '2025-26');
  assert.equal(financialYear('2026-04-01'), '2026-27');
  assert.equal(financialYear('2099-12-31'), '2099-00');
});

test('bill numbers are padded and fit the GST limit', () => {
  assert.equal(billNumber('2026-11-04', 42), '2026-27/00042');
  assert.ok(billNumber('2026-11-04', 99999).length <= 16);
});
