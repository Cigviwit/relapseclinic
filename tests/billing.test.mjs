import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billTotals, collectedBetween, daySummary, duesList, formatMoney, makeClosing, parseRupees, patientAccount, recoveredRevenue, reversalOf, upiUri, validateBill, validateEntry, validUpiId } from '../lib/billing.ts';

const bill = (id, total, o = {}) => ({ id, clinicId: 'c', patientId: 'p', doctorId: 'd', date: '2026-11-01', lines: [{ id: 'l', description: 'Visit', qty: 1, unitPrice: total, taxRate: 0 }], subtotal: total, discount: 0, tax: 0, total, status: 'active', createdBy: 'Asha', createdAt: '2026-11-01T10:00:00Z', ...o });
const pay = (id, amount, o = {}) => ({ id, clinicId: 'c', patientId: 'p', kind: 'payment', method: 'cash', amount, date: '2026-11-01', collectedBy: 'Asha', createdAt: '2026-11-01T10:00:00Z', ...o });

test('rupee parsing keeps exact paise and rejects anything unclear', () => {
  assert.equal(parseRupees('1,500.50'), 150050);
  assert.equal(parseRupees('₹ 19.99'), 1999);
  assert.equal(parseRupees('0.1'), 10);
  for (const bad of ['12.345', '-5', '', 'abc']) assert.throws(() => parseRupees(bad));
  assert.equal(formatMoney(150050), '₹1,500.50');
  assert.equal(formatMoney(10000000), '₹1,00,000');
});

test('bill totals charge tax after the discount', () => {
  assert.deepEqual(billTotals([{ qty: 2, unitPrice: 50000, taxRate: 18 }, { qty: 1, unitPrice: 100000, taxRate: 0 }], 100000), { subtotal: 200000, discount: 100000, tax: 9000, total: 109000 });
  assert.equal(billTotals([], 0).total, 0);
});

test('bills need a patient, a doctor, items and a sane discount', () => {
  assert.doesNotThrow(() => validateBill(bill('b', 500)));
  assert.throws(() => validateBill(bill('b', 500, { patientId: '' })), /patient/);
  assert.throws(() => validateBill(bill('b', 500, { lines: [] })), /item/);
  assert.throws(() => validateBill(bill('b', 500, { discount: 600 })), /discount/);
  assert.throws(() => validateBill(bill('b', 500, { createdBy: ' ' })), /who/);
});

test('part payments leave the rest due on that bill', () => {
  const a = patientAccount([bill('b', 100000)], [pay('1', 40000, { billId: 'b' }), pay('2', 10000, { billId: 'b', method: 'upi' })]);
  assert.deepEqual(a.byBill.get('b'), { paid: 50000, due: 50000 });
  assert.equal(a.due, 50000);
  assert.equal(a.credit, 0);
});

test('advances pay the oldest open bill and the rest stays as credit', () => {
  const a = patientAccount([bill('new', 30000, { date: '2026-11-03' }), bill('old', 50000)], [pay('adv', 60000)]);
  assert.deepEqual(a.byBill.get('old'), { paid: 50000, due: 0 });
  assert.deepEqual(a.byBill.get('new'), { paid: 10000, due: 20000 });
  assert.equal(a.due, 20000);
  const b = patientAccount([bill('b', 10000)], [pay('adv', 25000)]);
  assert.equal(b.credit, 15000);
  assert.equal(b.due, 0);
});

test('overpaying one bill spills onto other bills', () => {
  const a = patientAccount([bill('a', 10000), bill('b', 10000, { date: '2026-11-02' })], [pay('1', 15000, { billId: 'a' })]);
  assert.deepEqual(a.byBill.get('a'), { paid: 10000, due: 0 });
  assert.deepEqual(a.byBill.get('b'), { paid: 5000, due: 5000 });
});

test('voiding a paid bill turns its payment into credit', () => {
  const a = patientAccount([bill('b', 50000, { status: 'void', voidedOn: '2026-11-02' })], [pay('1', 50000, { billId: 'b' })]);
  assert.equal(a.billed, 0);
  assert.equal(a.credit, 50000);
  assert.equal(a.byBill.size, 0);
});

test('refunds reduce credit and cannot exceed it', () => {
  const a = patientAccount([], [pay('1', 50000), pay('r', 20000, { kind: 'refund' })]);
  assert.equal(a.credit, 30000);
  assert.doesNotThrow(() => validateEntry(pay('r2', 30000, { kind: 'refund' }), a));
  assert.throws(() => validateEntry(pay('r2', 30001, { kind: 'refund' }), a), /credit/);
  assert.throws(() => validateEntry(pay('r2', 100, { kind: 'refund', billId: 'b' })), /credit/);
});

test('a reversal cancels the original on the correction day without changing the original day', () => {
  const p = pay('1', 50000, { billId: 'b' });
  const fix = reversalOf(p, '2026-11-02', 'Asha', 'Wrong patient');
  assert.equal(fix.id, 'rev_1');
  const all = [p, fix];
  const a = patientAccount([bill('b', 50000)], all);
  assert.equal(a.due, 50000);
  assert.deepEqual(a.byBill.get('b'), { paid: 0, due: 50000 });
  assert.equal(daySummary('2026-11-01', [], all).total, 50000);
  assert.equal(daySummary('2026-11-02', [], all).total, -50000);
  assert.equal(collectedBetween(all, '2026-11-01', '2026-11-02'), 0);
  assert.throws(() => reversalOf(fix, '2026-11-03', 'Asha', ''), /cannot be reversed/);
});

test('reversing a refund puts the credit back', () => {
  const r = pay('r', 20000, { kind: 'refund' });
  assert.equal(patientAccount([], [pay('1', 50000), r, reversalOf(r, '2026-11-02', 'Asha', '')]).credit, 50000);
});

test('reversing an advance that already paid a bill puts the bill back in dues', () => {
  const p = pay('adv', 50000);
  const a = patientAccount([bill('b', 50000)], [p, reversalOf(p, '2026-11-02', 'Asha', '')]);
  assert.deepEqual(a.byBill.get('b'), { paid: 0, due: 50000 });
  assert.equal(a.due, 50000);
});

test('allocation always adds up to the patient balance', () => {
  const bills = [bill('a', 12345), bill('b', 67890, { date: '2026-11-02' }), bill('c', 500, { status: 'void' }), bill('d', 999, { date: '2026-11-03' })];
  for (const amount of [0, 1, 12345, 50000, 80000, 81234, 90000]) {
    const a = patientAccount(bills, amount ? [pay('1', amount, { billId: 'b' })] : []);
    const rows = [...a.byBill.values()];
    assert.equal(rows.reduce((s, r) => s + r.due, 0) - a.credit, a.balance);
    assert.ok(rows.every(r => r.due >= 0 && r.paid >= 0));
  }
});

test('day summary splits by method and closing records the cash difference', () => {
  const s = daySummary('2026-11-01', [bill('b', 90000), bill('v', 5000, { status: 'void', voidedOn: '2026-11-01' }), bill('other', 7000, { date: '2026-10-31' })], [pay('1', 40000), pay('2', 30000, { method: 'upi' }), pay('3', 10000, { kind: 'refund' }), pay('x', 999, { date: '2026-11-02' })]);
  assert.deepEqual(s.collected, { cash: 30000, upi: 30000, card: 0, other: 0 });
  assert.equal(s.total, 60000);
  assert.equal(s.billed, 90000);
  const c = makeClosing('c', '2026-11-01', s, 29500, 'Asha', '');
  assert.equal(c.id, 'c_2026-11-01');
  assert.equal(c.difference, -500);
  assert.ok(!('note' in c));
});

test('a bill voided on a later day stays in its own day and comes off the correction day', () => {
  const v = bill('v', 5000, { status: 'void', voidedOn: '2026-11-02' });
  assert.equal(daySummary('2026-11-01', [v], []).billed, 5000);
  assert.equal(daySummary('2026-11-02', [v], []).billed, -5000);
});

test('dues list shows only patients who owe, largest first', () => {
  const r = duesList([bill('a', 10000), bill('b', 90000, { patientId: 'q' }), bill('c', 500, { patientId: 'r' }), bill('d', 200000, { patientId: 's' })], [pay('1', 10000, { billId: 'a' }), pay('2', 500, { patientId: 'r' })]);
  assert.deepEqual(r.map(x => [x.patientId, x.due]), [['s', 200000], ['q', 90000]]);
});

test('recovered revenue counts money paid on the return visit once, after a real follow-up', () => {
  const ap = (id, patientId, date, status) => ({ id, clinicId: 'c', patientId, doctorId: 'd', date, time: '10:00', duration: 30, reason: '', status });
  const appts = [ap('m1', 'p', '2026-10-01', 'missed'), ap('m2', 'p', '2026-10-02', 'missed'), ap('back', 'p', '2026-10-10', 'completed'), ap('later', 'p', '2026-10-20', 'completed'), ap('m3', 'q', '2026-10-01', 'missed'), ap('backq', 'q', '2026-10-05', 'completed')];
  const del = [{ appointmentId: 'm1', slot: 'missed_day_one', status: 'accepted' }, { appointmentId: 'm2', slot: 'missed_day_one', status: 'accepted' }, { appointmentId: 'm3', slot: 'missed_day_one', status: 'failed' }];
  const bills = [bill('b1', 50000, { appointmentId: 'back', date: '2026-10-10' }), bill('b2', 70000, { appointmentId: 'later', date: '2026-10-20' }), bill('b3', 9000, { patientId: 'q', appointmentId: 'backq' })];
  const paid = [pay('1', 30000, { billId: 'b1' }), pay('2', 70000, { billId: 'b2' }), pay('3', 9000, { patientId: 'q', billId: 'b3' })];
  assert.deepEqual(recoveredRevenue(appts, del, bills, paid, undefined, '2026-10-31'), { amount: 30000, visits: 1 });
  assert.equal(recoveredRevenue(appts, del, bills, [], '2026-10-05', '2026-10-31').visits, 0);
});

test('UPI link carries the clinic, the exact amount and escaped text', () => {
  assert.equal(upiUri(' clinic@okhdfc ', 'Greenleaf & Sons', 150050, 'Bill 2026-27/00001'), 'upi://pay?pa=clinic%40okhdfc&pn=Greenleaf%20%26%20Sons&am=1500.50&cu=INR&tn=Bill%202026-27%2F00001');
  assert.ok(validUpiId('clinic.name-1@okhdfc'));
  for (const bad of ['clinic', 'a b@upi', 'clinic@']) assert.ok(!validUpiId(bad));
});
