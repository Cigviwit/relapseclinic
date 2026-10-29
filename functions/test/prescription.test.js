const test = require('node:test');
const assert = require('node:assert/strict');
const { msg91Payload, prescriptionValues, prescriptionFileName, prescriptionDeliveryId } = require('../reminder-logic');

const clinic = { name: 'Greenleaf Dental Care', phone: '+919876543210', doctors: [{ id: 'd1', name: 'Dr. Priya Nair' }] };
const patient = { name: 'Aarav Sharma', phone: '+919812345678' };
const rx = { id: 'rx1', doctorId: 'd1', date: '2026-10-29' };

test('prescription template values follow the approved placeholder order', () => {
  assert.deepEqual(prescriptionValues(rx, patient, clinic), ['Aarav Sharma', 'Dr. Priya Nair', 'Greenleaf Dental Care', '29 October 2026', '+919876543210']);
  assert.throws(() => prescriptionValues({ ...rx, doctorId: 'gone' }, patient, clinic), /doctor/);
});

test('prescription payload carries the PDF as a document header', () => {
  const settings = { integratedNumber: '+91 72762 21423', namespace: 'ns', language: 'en' };
  const payload = msg91Payload(settings, patient.phone, 'clinic_prescription_v1', prescriptionValues(rx, patient, clinic), 'rx_1',
    { type: 'document', value: 'https://example.test/f.pdf', filename: 'Rx.pdf' });
  const target = payload.payload.template.to_and_components[0];
  assert.deepEqual(target.to, ['919812345678']);
  assert.deepEqual(target.components.header_1, { type: 'document', value: 'https://example.test/f.pdf', filename: 'Rx.pdf' });
  assert.equal(target.components.body_5.value, '+919876543210');
  assert.equal(payload.integrated_number, '917276221423');
  // Appointment messages keep working without a header.
  assert.equal(msg91Payload(settings, patient.phone, 't', ['a'], 'x').payload.template.to_and_components[0].components.header_1, undefined);
});

test('prescription file names and delivery IDs are safe and stable', () => {
  assert.equal(prescriptionFileName('Prescription Aarav/Sharma 2026-10-29'), 'Prescription-AaravSharma-2026-10-29.pdf');
  assert.equal(prescriptionFileName('Rx.pdf'), 'Rx.pdf');
  assert.equal(prescriptionFileName(''), 'Prescription.pdf');
  assert.match(prescriptionDeliveryId('rx1', 'req'), /^rx_[0-9a-f]{32}$/);
  assert.equal(prescriptionDeliveryId('rx1', 'req'), prescriptionDeliveryId('rx1', 'req'));
  assert.notEqual(prescriptionDeliveryId('rx1', 'req'), prescriptionDeliveryId('rx1', 'other'));
});
