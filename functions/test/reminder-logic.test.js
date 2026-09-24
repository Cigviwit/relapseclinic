const test = require('node:test');
const assert = require('node:assert/strict');
const { localNow, slotFor, missedDueNow, deliveryId, bodyValues, msg91Payload, hasReplacementAppointment } = require('../reminder-logic');

const appointment = { id: 'a1', clinicId: 'c1', patientId: 'p1', doctorId: 'd1', date: '2026-10-10', time: '10:30', status: 'scheduled' };
const clinic = { name: 'Greenleaf Clinic', phone: '+919876543210', doctors: [{ id: 'd1', name: 'Dr. Priya Nair' }] };
const patient = { name: 'Aarav Sharma' };

test('clinic-local 8 AM governs the four scheduled slots', () => {
  assert.deepEqual(localNow('Asia/Kolkata', new Date('2026-10-08T02:30:00Z')), { date: '2026-10-08', time: '08:00' });
  assert.equal(slotFor(appointment, { date: '2026-10-08', time: '07:59' }), null);
  assert.equal(slotFor(appointment, { date: '2026-10-08', time: '08:00' }), 'two_days_before');
  assert.equal(slotFor(appointment, { date: '2026-10-08', time: '08:15' }), null);
  assert.equal(slotFor(appointment, { date: '2026-10-10', time: '08:00' }), 'appointment_day');
  assert.equal(slotFor({ ...appointment, time: '08:00' }, { date: '2026-10-10', time: '08:00' }), 'appointment_day');
  assert.equal(slotFor(appointment, { date: '2026-10-10', time: '10:30' }), null);
  const missed = { ...appointment, status: 'missed' };
  assert.equal(slotFor(missed, { date: '2026-10-11', time: '08:00' }), 'missed_day_one');
  assert.equal(slotFor(missed, { date: '2026-10-17', time: '08:00' }), 'missed_day_seven');
  assert.equal(slotFor({ ...appointment, status: 'completed' }, { date: '2026-10-08', time: '08:00' }), null);
});

test('delivery identity changes on reschedule and remains stable for retries', () => {
  const first = deliveryId(appointment, 'appointment_day');
  assert.equal(first, deliveryId(appointment, 'appointment_day'));
  assert.notEqual(first, deliveryId({ ...appointment, time: '11:00' }, 'appointment_day'));
  assert.notEqual(first, deliveryId(appointment, 'two_days_before'));
});

test('marking a past visit missed makes its first follow-up due immediately', () => {
  const missed = { ...appointment, status: 'missed' };
  assert.equal(missedDueNow(missed, { date: '2026-10-13', time: '15:00' }), true);
  assert.equal(missedDueNow(missed, { date: '2026-10-10', time: '10:29' }), false);
  assert.equal(missedDueNow(appointment, { date: '2026-10-13', time: '15:00' }), false);
  assert.equal(deliveryId(missed, 'missed_day_one'), deliveryId(missed, 'missed_day_one'));
});

test('approved-template variables map in order and include clinic contact', () => {
  const values = bodyValues(appointment, patient, clinic, 'appointment_day');
  assert.deepEqual(values, ['Aarav Sharma', 'Greenleaf Clinic', 'Dr. Priya Nair', '10 October 2026', '10:30 am', '+919876543210']);
  const payload = msg91Payload({ integratedNumber: '+919999999999', namespace: 'namespace', language: 'en' }, '+918888888888', 'appointment_reminder', values, 'delivery1');
  assert.equal(payload.integrated_number, '919999999999');
  assert.equal(payload.payload.template.to_and_components[0].to[0], '918888888888');
  assert.equal(payload.payload.template.to_and_components[0].components.body_6.value, '+919876543210');
  assert.equal(payload.CRQID, 'delivery1');
  assert.deepEqual(bodyValues({ ...appointment, status: 'missed' }, patient, clinic, 'missed_day_one'),
    ['Aarav Sharma', 'Dr. Priya Nair', 'Greenleaf Clinic', '10 October 2026', '+919876543210']);
});

test('a replacement visit suppresses missed-visit follow-ups', () => {
  const missed = { ...appointment, status: 'missed' };
  assert.equal(hasReplacementAppointment(missed, [{ ...appointment, id: 'a2', date: '2026-10-12' }]), true);
  assert.equal(hasReplacementAppointment(missed, [{ ...appointment, id: 'a2', clinicId: 'c2', date: '2026-10-12' }]), false);
  assert.equal(hasReplacementAppointment(missed, [{ ...appointment, id: 'a2', status: 'cancelled', date: '2026-10-12' }]), false);
});
