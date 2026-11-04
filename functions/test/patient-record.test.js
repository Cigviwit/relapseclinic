const test = require('node:test');
const assert = require('node:assert/strict');
const { recordChanges } = require('../reminder-logic');

const base = { id: 'p', clinicId: 'c', patientId: 'p', allergyStatus: 'unknown', allergies: [], conditions: '', version: 1, updatedAt: 't1', updatedBy: 'u' };

test('audit records changed fields with old and new values, ignoring bookkeeping', () => {
  const after = { ...base, allergyStatus: 'known', allergies: [{ substance: 'Penicillin' }], version: 2, updatedAt: 't2' };
  assert.deepEqual(recordChanges(base, after), [
    { field: 'allergyStatus', from: 'unknown', to: 'known' },
    { field: 'allergies', from: [], to: [{ substance: 'Penicillin' }] },
  ]);
});

test('a save that changes nothing writes no audit entry', () => {
  assert.deepEqual(recordChanges(base, { ...base, version: 2, updatedAt: 't2' }), []);
});

test('creating a record lists only the fields that hold something', () => {
  assert.deepEqual(recordChanges(undefined, { ...base, conditions: 'Diabetes' }).map(c => c.field), ['allergyStatus', 'conditions']);
});
