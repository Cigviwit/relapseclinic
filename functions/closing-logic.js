// Day closing totals are worked out here from the stored entries, so a browser cannot record different numbers.
const { FieldValue } = require('firebase-admin/firestore');
const { ServiceError, resolveActor } = require('./access');

const METHODS = ['cash', 'upi', 'card', 'other'];
const MAX_AMOUNT = 1000000000;

/** Mirrors signedAmount in lib/billing.ts. Money in is positive; a reversal cancels the original. */
function signedAmount(e) {
  if (e.kind === 'payment') return e.amount;
  if (e.kind === 'refund') return -e.amount;
  return e.reversesKind === 'refund' ? e.amount : -e.amount;
}

/** Mirrors daySummary in lib/billing.ts. `bills` must include those dated this day and those voided this day. */
function dayTotals(date, bills, entries) {
  const collected = { cash: 0, upi: 0, card: 0, other: 0 };
  for (const e of entries) if (e.date === date) collected[METHODS.includes(e.method) ? e.method : 'other'] += signedAmount(e);
  const billed = bills.reduce((sum, b) => sum + (b.date === date ? b.total : 0) - (b.status === 'void' && b.voidedOn === date ? b.total : 0), 0);
  return { collected, billed };
}

async function closeDay(db, auth, input) {
  const { clinicId, date, countedCash, note } = input || {};
  if (typeof clinicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinicId) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ServiceError('invalid-argument', 'A clinic and date are required.');
  if (!Number.isInteger(countedCash) || countedCash < 0 || countedCash > MAX_AMOUNT) throw new ServiceError('invalid-argument', 'Enter the cash counted.');
  if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw new ServiceError('invalid-argument', 'The note is too long.');
  const actor = await resolveActor(db, auth, clinicId, ['owner', 'billing', 'frontdesk'], 'close the day');
  const clinic = await db.doc(`clinics/${clinicId}`).get();
  if (clinic.data()?.billingEnabled !== true) throw new ServiceError('failed-precondition', 'Billing is not enabled for this clinic.');
  const id = `${clinicId}_${date}`;
  const ref = db.doc(`dayClosings/${id}`);
  const inClinic = (name) => db.collection(name).where('clinicId', '==', clinicId);
  return db.runTransaction(async (tx) => {
    const [existing, dated, voided, entries] = await Promise.all([tx.get(ref), tx.get(inClinic('bills').where('date', '==', date)), tx.get(inClinic('bills').where('voidedOn', '==', date)), tx.get(inClinic('ledgerEntries').where('date', '==', date))]);
    if (existing.exists) throw new ServiceError('already-exists', 'That day is already closed.');
    const bills = new Map([...dated.docs, ...voided.docs].map((d) => [d.id, d.data()]));
    const { collected, billed } = dayTotals(date, [...bills.values()], entries.docs.map((d) => d.data()));
    const closing = { id, clinicId, date, collected, billed, countedCash, difference: countedCash - collected.cash, closedBy: actor.name, closedByUid: actor.uid, closedAt: FieldValue.serverTimestamp(), ...(note ? { note } : {}) };
    tx.create(ref, closing);
    return { id, collected, billed, difference: closing.difference };
  });
}

module.exports = { dayTotals, signedAmount, closeDay };
