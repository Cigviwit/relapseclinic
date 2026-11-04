import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { permissionsFor, roleOptions } from '../lib/permissions.ts';
import { HISTORY_DAYS, historyStart, mergeById } from '../lib/data-window.ts';
import { DEFAULT_LOCK_MINUTES, isIdle, lockMinutes } from '../lib/idle.ts';
import { plainValue, toCsv } from '../lib/csv.ts';
import { addDays, seed, validateAppointment } from '../lib/clinic.ts';
import { amendPrescription, blankPrescription, cleanPrescription, currentPrescriptions, repeatPrescription, withDefaults } from '../lib/prescription.ts';
import { daySummary } from '../lib/billing.ts';

const require = createRequire(import.meta.url);
const { bookingError } = require('../functions/booking-logic.js');
const { dayTotals } = require('../functions/closing-logic.js');

// --- Who can do what ---
test('every role is denied by default and only the owner manages the clinic', () => {
  for (const r of ['doctor', 'frontdesk', 'billing']) {
    const can = permissionsFor(r);
    assert.equal(can.manageStaff, false, r);
    assert.equal(can.editClinic, false, r);
    assert.equal(can.readAudit, false, r);
    assert.equal(can.exportData, false, r);
    assert.equal(can.adminFeatures, false, r);
  }
  const owner = permissionsFor('owner');
  assert.ok(owner.manageStaff && owner.editClinic && owner.readAudit && owner.exportData);
  assert.equal(owner.adminFeatures, false);
});

test('only doctors and owners read or write visit notes and write prescriptions', () => {
  const writers = ['owner', 'doctor'];
  for (const r of ['owner', 'doctor', 'frontdesk', 'billing', 'platform']) {
    const can = permissionsFor(r);
    assert.equal(can.readNotes, writers.includes(r), `${r} notes`);
    assert.equal(can.writeRx, writers.includes(r), `${r} rx`);
  }
});

test('billing staff see no medical information', () => {
  const can = permissionsFor('billing');
  assert.deepEqual([can.readRecords, can.readNotes, can.readRx, can.sendRx], [false, false, false, false]);
  assert.ok(can.readBilling && can.correctBilling);
});

test('voids and refunds need the owner or billing role', () => {
  assert.deepEqual(['owner', 'doctor', 'frontdesk', 'billing', 'platform'].filter(r => permissionsFor(r).correctBilling), ['owner', 'billing']);
});

test('the platform admin reads nearly everything and writes no clinical or billing record', () => {
  const can = permissionsFor('platform');
  assert.ok(can.readRecords && can.readRx && can.readBilling && can.readAudit && can.adminFeatures);
  assert.deepEqual([can.readNotes, can.writeRecords, can.writeNotes, can.writeRx, can.sendRx, can.writeBilling, can.correctBilling, can.closeDay, can.exportData], Array(9).fill(false));
});

test('every role has a label and an explanation', () => {
  assert.deepEqual(roleOptions.map(r => r.value), ['owner', 'doctor', 'frontdesk', 'billing']);
  assert.ok(roleOptions.every(r => r.label && r.help));
});

// --- Live data window ---
test('the workspace keeps six months of history live', () => {
  assert.equal(HISTORY_DAYS, 180);
  assert.equal(historyStart('2026-11-05'), addDays('2026-11-05', -180));
});

test('merging records keeps one of each, preferring the later list', () => {
  const merged = mergeById([{ id: 'a', v: 'old' }, { id: 'b', v: 1 }], [{ id: 'a', v: 'live' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(x => x.id === 'a').v, 'live');
});

// --- Screen lock ---
test('the screen locks once the limit passes, and can be turned off', () => {
  const m = 60_000;
  assert.equal(lockMinutes(undefined), DEFAULT_LOCK_MINUTES);
  assert.equal(lockMinutes(0), 0);
  assert.equal(isIdle(0, 14 * m, 15), false);
  assert.equal(isIdle(0, 15 * m, 15), true);
  assert.equal(isIdle(0, 999 * m, 0), false);
});

// --- Exports ---
test('CSV quotes what needs quoting and defuses spreadsheet formulas', () => {
  const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: '=HYPERLINK("http://evil")', d: '+91 98', e: -5, f: '@cmd', g: null }], ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  const [, row] = csv.split('\r\n');
  assert.ok(row.startsWith('"x,y","say ""hi""",'));
  assert.ok(row.includes(`"'=HYPERLINK(""http://evil"")"`));
  assert.ok(row.includes(`'+91 98`));
  assert.ok(row.includes(',-5,'), 'real numbers stay numbers');
  assert.ok(row.includes(`'@cmd`));
});

test('exported records turn timestamps into plain text, however deep', () => {
  const when = new Date('2026-11-05T10:00:00Z');
  assert.deepEqual(plainValue({ at: { toDate: () => when }, list: [{ at: { toDate: () => when } }], n: 1, s: null }), { at: when.toISOString(), list: [{ at: when.toISOString() }], n: 1, s: null });
});

// --- Prescriptions ---
const db = seed(), clinic = db.clinics[0];

test('new prescriptions start as drafts; ones from before drafts existed count as final', () => {
  assert.equal(blankPrescription(clinic, '2026-11-05').status, 'draft');
  assert.equal(withDefaults({ id: 'x', clinicId: 'c' }).status, 'final');
  assert.equal(withDefaults({ id: 'x', clinicId: 'c', status: 'draft' }).status, 'draft');
});

test('amending keeps the content, points back at the original, and starts as a new draft', () => {
  const original = cleanPrescription({ ...blankPrescription(clinic, '2026-11-01', 'p0', 'priya'), diagnosis: 'Caries', status: 'final', createdAt: 'then', sentAt: 'then', finalizedBy: 'Dr A', medicines: [{ id: 'm', name: 'Tab X', frequency: '1-0-1', timing: 'after', days: '3', notes: '' }] });
  const next = amendPrescription(original, '2026-11-05');
  assert.notEqual(next.id, original.id);
  assert.equal(next.amends, original.id);
  assert.deepEqual([next.status, next.createdAt, next.sentAt, next.finalizedBy, next.date, next.diagnosis], ['draft', '', '', undefined, '2026-11-05', 'Caries']);
  assert.notEqual(next.medicines[0].id, 'm');
  assert.equal(next.medicines[0].name, 'Tab X');
  assert.equal(original.status, 'final');
});

test('a prescription drops out of the current list once its amendment is final, even through several', () => {
  const list = [{ id: 'a', status: 'final' }, { id: 'b', amends: 'a', status: 'final' }, { id: 'c', amends: 'b', status: 'final' }, { id: 'd', status: 'final' }];
  assert.deepEqual(currentPrescriptions(list).map(r => r.id), ['c', 'd']);
});

test('an unfinished amendment does not hide the final prescription it would replace', () => {
  const list = [{ id: 'a', status: 'final' }, { id: 'b', amends: 'a', status: 'draft' }];
  assert.deepEqual(currentPrescriptions(list).map(r => r.id), ['a', 'b']);
});

test('repeating a final prescription starts a separate draft that does not replace it', () => {
  const repeated = repeatPrescription({ ...blankPrescription(clinic, '2026-11-01', 'p0', 'priya'), status: 'final', amends: 'older', finalizedBy: 'Dr A' }, '2026-11-05');
  assert.deepEqual([repeated.status, repeated.amends, repeated.finalizedBy], ['draft', undefined, undefined]);
});

// --- Browser and server must agree ---
test('the browser check and the server check agree on every booking', () => {
  const c = { id: 'c1', name: 'x', address: 'x', phone: '+911234567890', timezone: 'Asia/Kolkata', opens: '09:00', closes: '19:00', doctors: [{ id: 'd1', name: 'A', specialty: '' }, { id: 'd2', name: 'B', specialty: '' }] };
  const patients = [{ id: 'p1', clinicId: 'c1', name: 'A', phone: '+911234567891', consent: true }, { id: 'p2', clinicId: 'other', name: 'B', phone: '+911234567892', consent: true }];
  const base = { id: 'n', clinicId: 'c1', patientId: 'p1', doctorId: 'd1', date: '2026-11-10', time: '10:00', duration: 30, reason: 'x', status: 'scheduled' };
  const existing = [{ ...base, id: 'e1', time: '11:00' }, { ...base, id: 'e2', time: '14:00', status: 'cancelled' }, { ...base, id: 'e3', time: '15:00', status: 'missed' }, { ...base, id: 'e4', time: '16:00', status: 'completed' }, { ...base, id: 'e5', doctorId: 'd2', time: '10:00' }, { ...base, id: 'e6', date: '2026-11-11' }];
  const shapes = [{}, { time: '10:45' }, { time: '11:15' }, { time: '11:30' }, { time: '14:00' }, { time: '15:15' }, { time: '16:15' }, { time: '08:45' }, { time: '18:45' }, { time: '18:30' }, { time: '09:00' }, { doctorId: 'd2' }, { doctorId: 'nope' }, { patientId: 'p2' }, { patientId: 'gone' }, { duration: 4 }, { duration: 241 }, { duration: 7.5 }, { date: 'nope' }, { time: '25:00' }, { id: 'e1', time: '11:15' }, { id: 'e1' }];
  const appointmentDb = { clinics: [c], patients, appointments: existing };
  for (const shape of shapes) {
    const a = { ...base, ...shape };
    let browser = null;
    try { validateAppointment(appointmentDb, a); } catch (e) { browser = e.message; }
    assert.equal(bookingError(c, patients.find(p => p.id === a.patientId), a, existing), browser, JSON.stringify(shape));
  }
});

test('the browser’s day summary and the server’s closing totals agree', () => {
  const date = '2026-11-05';
  const entries = [
    { date, kind: 'payment', method: 'cash', amount: 50000 }, { date, kind: 'payment', method: 'upi', amount: 120000 }, { date, kind: 'refund', method: 'cash', amount: 1000 },
    { date, kind: 'reversal', reversesKind: 'payment', method: 'upi', amount: 20000 }, { date, kind: 'reversal', reversesKind: 'refund', method: 'cash', amount: 1000 }, { date, kind: 'payment', method: 'card', amount: 7 }, { date, kind: 'payment', method: 'other', amount: 9 },
    { date: '2026-11-04', kind: 'payment', method: 'cash', amount: 999 },
  ];
  const bills = [{ date, total: 90000, status: 'active' }, { date, total: 500, status: 'void', voidedOn: date }, { date: '2026-11-01', total: 7000, status: 'void', voidedOn: date }, { date: '2026-11-04', total: 1, status: 'active' }];
  const browser = daySummary(date, bills, entries);
  const server = dayTotals(date, bills, entries);
  assert.deepEqual(server.collected, browser.collected);
  assert.equal(server.billed, browser.billed);
});
