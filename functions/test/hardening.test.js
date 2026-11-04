const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingError } = require('../booking-logic');
const { dayTotals } = require('../closing-logic');
const { auditEntry, changedFields, actorOf } = require('../audit-logic');
const { changeError, cleanStaff } = require('../staff-logic');
const { isFresh, PDF_LINK_DAYS } = require('../file-retention');
const { mergeRecords } = require('../merge-logic');
const { sniffType, cleanFileName } = require('../file-logic');

const clinic = { id: 'c1', opens: '09:00', closes: '19:00', doctors: [{ id: 'd1' }, { id: 'd2' }] };
const patient = { clinicId: 'c1' };
const visit = (over = {}) => ({ id: 'a', clinicId: 'c1', patientId: 'p', doctorId: 'd1', date: '2026-11-10', time: '10:00', duration: 30, status: 'scheduled', ...over });

test('booking refuses an overlap for the same doctor and allows the next free slot', () => {
  const others = [visit({ id: 'b', time: '10:15' })];
  assert.match(bookingError(clinic, patient, visit(), others), /already has an appointment/);
  assert.equal(bookingError(clinic, patient, visit({ time: '10:45' }), others), null);
  assert.equal(bookingError(clinic, patient, visit({ doctorId: 'd2' }), others), null);
});

test('a cancelled visit frees its slot and an appointment does not clash with itself', () => {
  assert.equal(bookingError(clinic, patient, visit(), [visit({ id: 'b', status: 'cancelled' })]), null);
  assert.equal(bookingError(clinic, patient, visit(), [visit()]), null);
});

test('booking refuses another clinic’s patient, an unknown doctor, and times outside hours', () => {
  assert.match(bookingError(clinic, { clinicId: 'other' }, visit(), []), /from this clinic/);
  assert.match(bookingError(clinic, undefined, visit(), []), /from this clinic/);
  assert.match(bookingError(clinic, patient, visit({ doctorId: 'nope' }), []), /from this clinic/);
  assert.match(bookingError(clinic, patient, visit({ time: '08:45' }), []), /clinic hours/);
  assert.match(bookingError(clinic, patient, visit({ time: '18:45' }), []), /clinic hours/);
  assert.match(bookingError(clinic, patient, visit({ duration: 3 }), []), /duration/);
});

test('booking follows doctor sessions, leave and clinic holidays', () => {
  const weekly = { 2: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '20:00' }] };
  const c = { id: 'c1', opens: '09:00', closes: '21:00', doctors: [{ id: 'd1', name: 'Dr A', weekly, leave: [{ id: 'l', from: '2026-11-17', to: '2026-11-18', reason: 'conference' }] }], closedDates: [{ date: '2026-11-24', reason: 'Diwali' }] };
  const at = (date, time, duration = 30) => bookingError(c, patient, visit({ date, time, duration }), []);
  assert.equal(at('2026-11-10', '09:00'), null, 'Tuesday morning session');
  assert.equal(at('2026-11-10', '17:30'), null, 'Tuesday evening session');
  assert.match(at('2026-11-10', '13:00'), /works 9:00 AM–1:00 PM and 5:00 PM–8:00 PM/, 'the gap between sessions');
  assert.match(at('2026-11-10', '12:45'), /works/, 'running past the end of a session');
  assert.match(at('2026-11-11', '10:00'), /does not work on Wednesdays/);
  assert.match(at('2026-11-17', '10:00'), /on leave \(conference\)/);
  assert.match(at('2026-11-24', '10:00'), /closed for Diwali/);
});

test('merging records never loses an allergy, and only says none if neither lists one', () => {
  const penicillin = { id: '1', substance: 'Penicillin', reaction: 'Rash', severity: 'severe' };
  const latex = { id: '2', substance: 'Latex', reaction: '', severity: '' };
  const both = mergeRecords({ allergyStatus: 'known', allergies: [penicillin] }, { allergyStatus: 'known', allergies: [{ ...penicillin, id: '3', substance: ' penicillin ' }, latex] });
  assert.deepEqual(both.allergies.map((a) => a.substance), ['Penicillin', 'Latex']);
  assert.equal(both.allergyStatus, 'known');
  assert.equal(mergeRecords({ allergyStatus: 'none', allergies: [] }, { allergyStatus: 'known', allergies: [latex] }).allergyStatus, 'known', 'a known allergy beats no known allergies');
  assert.equal(mergeRecords({ allergyStatus: 'unknown', allergies: [] }, { allergyStatus: 'none', allergies: [] }).allergyStatus, 'none');
  assert.equal(mergeRecords({ allergyStatus: 'unknown', allergies: [] }, { allergyStatus: 'unknown', allergies: [] }).allergyStatus, 'unknown');
  assert.equal(mergeRecords(undefined, { allergyStatus: 'known', allergies: [latex] }).allergyStatus, 'known');
});

test('merging records combines history and prefers the kept record for single values', () => {
  const merged = mergeRecords({ allergies: [], conditions: 'Diabetes\nHypertension', bloodGroup: 'B+', dob: '1990-01-01', dobEstimated: false, address: '' }, { allergies: [], conditions: 'diabetes\nAsthma', bloodGroup: 'O+', dob: '1991-01-01', dobEstimated: true, address: 'Pune' });
  assert.equal(merged.conditions, 'Diabetes\nHypertension\nAsthma');
  assert.deepEqual([merged.bloodGroup, merged.dob, merged.dobEstimated, merged.address], ['B+', '1990-01-01', false, 'Pune']);
});

test('moving records in a merge writes one log entry, not one per record', () => {
  assert.equal(auditEntry('bills', 'b', { clinicId: 'c', patientId: 'old' }, { clinicId: 'c', patientId: 'new', mergedFrom: 'old' }), null);
  assert.deepEqual(auditEntry('appointments', 'a', { clinicId: 'c', patientId: 'new', mergedFrom: 'old', time: '10:00' }, { clinicId: 'c', patientId: 'new', time: '11:00', updatedBy: 'u' }).fields, ['mergedFrom', 'time'], 'a reschedule that drops the marker is still logged');
  assert.equal(auditEntry('bills', 'b', { clinicId: 'c', patientId: 'new', mergedFrom: 'old', note: '' }, { clinicId: 'c', patientId: 'new', mergedFrom: 'old', note: 'x' }).action, 'update', 'later changes are still logged');
});

test('uploads are recognised by their contents, not their names', () => {
  const pad = (head, length = 140) => Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, length - head.length))]);
  assert.equal(sniffType(pad('%PDF-1.7')), 'application/pdf');
  assert.equal(sniffType(pad([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'image/webp');
  assert.equal(sniffType(Buffer.concat([Buffer.alloc(128), Buffer.from('DICM')])), 'application/dicom');
  assert.equal(sniffType(pad('<script>alert(1)</script>')), null, 'a web page renamed .jpg');
  assert.equal(sniffType(Buffer.alloc(0)), null);
});

test('file names cannot carry paths or control characters', () => {
  assert.equal(cleanFileName('../../etc/passwd'), '.. .. etc passwd');
  assert.equal(cleanFileName('a\u0000b.pdf'), 'a b.pdf');
  assert.equal(cleanFileName(''), 'file');
  assert.equal(cleanFileName('x'.repeat(300)).length, 120);
});

test('day totals count payments, refunds and reversals on the day recorded', () => {
  const entries = [
    { date: 'D', kind: 'payment', method: 'cash', amount: 500 },
    { date: 'D', kind: 'refund', method: 'cash', amount: 100 },
    { date: 'D', kind: 'reversal', reversesKind: 'payment', method: 'upi', amount: 200 },
    { date: 'D', kind: 'reversal', reversesKind: 'refund', method: 'card', amount: 50 },
    { date: 'other', kind: 'payment', method: 'cash', amount: 999 },
  ];
  const bills = [{ date: 'D', total: 700, status: 'active' }, { date: 'earlier', total: 300, status: 'void', voidedOn: 'D' }, { date: 'D', total: 40, status: 'void', voidedOn: 'D' }];
  assert.deepEqual(dayTotals('D', bills, entries), { collected: { cash: 400, upi: -200, card: 50, other: 0 }, billed: 400 });
});

test('the activity log records field names, never their values', () => {
  const entry = auditEntry('patients', 'p1', { clinicId: 'c1', name: 'A', phone: '1' }, { clinicId: 'c1', name: 'B', phone: '1', updatedBy: 'u1' });
  assert.deepEqual(entry, { clinicId: 'c1', collection: 'patients', docId: 'p1', action: 'update', fields: ['name'], patientId: 'p1', actorUid: 'u1' });
  assert.ok(!JSON.stringify(entry).includes('"B"'));
});

test('system bookkeeping alone is not logged; creates and deletes are', () => {
  assert.equal(auditEntry('bills', 'b1', { clinicId: 'c1' }, { clinicId: 'c1', number: '2026-27/00001' }), null);
  assert.equal(auditEntry('prescriptions', 'r', { clinicId: 'c1' }, { clinicId: 'c1', sentAt: 'now' }), null);
  assert.deepEqual(auditEntry('treatmentPlans', 't', { clinicId: 'c1', version: 1, title: 'a' }, { clinicId: 'c1', version: 2, title: 'b' }).fields, ['title'], 'the version number is bookkeeping');
  assert.equal(auditEntry('bills', 'b1', undefined, { clinicId: 'c1', patientId: 'p', createdByUid: 'u' }).action, 'create');
  assert.equal(auditEntry('users', 'u1', { clinicId: 'c1' }, undefined).action, 'delete');
  assert.equal(auditEntry('clinics', 'c1', undefined, { name: 'x', updatedBy: 'admin' }).clinicId, 'c1');
  assert.deepEqual(changedFields({ a: 1, b: [1] }, { a: 1, b: [2], c: 3 }), ['b', 'c']);
});

test('the actor of a void is whoever voided it, not whoever billed it', () => {
  assert.equal(actorOf({ status: 'void', voidedByUid: 'v', createdByUid: 'c' }), 'v');
  assert.equal(actorOf({ status: 'active', createdByUid: 'c' }), 'c');
  assert.equal(actorOf({}), 'system');
});

test('a clinic always keeps an active owner, and nobody can deactivate themselves', () => {
  const owner = { uid: 'o', role: 'owner' };
  assert.match(changeError({ uid: 'x' }, owner, { role: 'doctor', active: true }, 1), /at least one active owner/);
  assert.match(changeError({ uid: 'x' }, owner, { role: 'owner', active: false }, 1), /at least one active owner/);
  assert.equal(changeError({ uid: 'x' }, owner, { role: 'doctor', active: true }, 2), null);
  assert.match(changeError({ uid: 'o' }, owner, { role: 'owner', active: false }, 2), /your own login/);
  assert.match(changeError({ uid: 'x' }, { uid: 'o' }, { role: 'doctor', active: true }, 1), /at least one active owner/, 'an account with no role counts as an owner');
});

test('a doctor login must name its doctor; other roles drop the link', () => {
  const clinicD = { doctors: [{ id: 'd1' }] };
  assert.throws(() => cleanStaff({ name: 'A', email: 'a@b.co', role: 'doctor' }, clinicD), /which doctor/);
  assert.throws(() => cleanStaff({ name: 'A', email: 'a@b.co', role: 'doctor', doctorId: 'x' }, clinicD), /from this clinic/);
  assert.throws(() => cleanStaff({ name: 'A', email: 'a@b.co', role: 'admin' }, clinicD), /Choose a role/);
  assert.equal(cleanStaff({ name: ' A ', email: ' A@B.co ', role: 'frontdesk', doctorId: 'd1' }, clinicD).doctorId, '');
  assert.deepEqual(cleanStaff({ name: ' A ', email: ' A@B.co ', role: 'doctor', doctorId: 'd1' }, clinicD), { name: 'A', email: 'a@b.co', role: 'doctor', doctorId: 'd1' });
});

test('a prescription PDF link stops working after the retention period', () => {
  const now = Date.UTC(2026, 10, 5);
  assert.equal(isFresh(now - (PDF_LINK_DAYS - 1) * 864e5, now), true);
  assert.equal(isFresh(now - PDF_LINK_DAYS * 864e5, now), false);
  assert.equal(isFresh(undefined, now), false);
});
