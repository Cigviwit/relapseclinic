// Merging a patient registered twice. Everything moves to the record being kept, and nothing is deleted:
// the old patient stays on file marked as merged, so its id still resolves in old records.
const { FieldValue } = require('firebase-admin/firestore');
const { ServiceError, resolveActor } = require('./access');

const MOVED = ['appointments', 'prescriptions', 'patientNotes', 'bills', 'ledgerEntries', 'messageDeliveries', 'reminders', 'waitlist', 'patientFiles', 'treatmentPlans', 'labCases', 'recalls'];
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const TEXT_FIELDS = ['conditions', 'medications', 'surgeries', 'familyHistory', 'notes'];
const SINGLE_FIELDS = ['fileNo', 'dob', 'sex', 'bloodGroup', 'occupation', 'address', 'emergencyName', 'emergencyPhone', 'tobacco', 'alcohol'];

function joinLines(a = '', b = '') {
  const lines = [...a.split('\n'), ...b.split('\n')].map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  return lines.filter((line) => { const key = line.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).join('\n');
}

/**
 * The record to keep. Safety comes first: an allergy on either record survives, and "no known allergies"
 * only stands if neither record lists one. Free text is combined; a single value from the kept record wins.
 */
function mergeRecords(keep, other) {
  const k = keep || {}, o = other || {};
  const allergies = [...(k.allergies || [])];
  for (const a of o.allergies || []) {
    if (!allergies.some((x) => x.substance.trim().toLowerCase() === a.substance.trim().toLowerCase())) allergies.push(a);
  }
  const allergyStatus = allergies.length ? 'known' : k.allergyStatus === 'none' || o.allergyStatus === 'none' ? 'none' : 'unknown';
  const merged = { allergies, allergyStatus };
  for (const f of TEXT_FIELDS) merged[f] = joinLines(k[f], o[f]);
  for (const f of SINGLE_FIELDS) merged[f] = k[f] || o[f] || '';
  merged.dobEstimated = k.dob ? !!k.dobEstimated : !!o.dobEstimated;
  return merged;
}

async function moveRecords(db, clinicId, fromId, toId) {
  const moved = {};
  for (const name of MOVED) {
    const snap = await db.collection(name).where('clinicId', '==', clinicId).where('patientId', '==', fromId).get();
    moved[name] = snap.size;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { patientId: toId, mergedFrom: fromId }));
      await batch.commit();
    }
  }
  return moved;
}

/** Safe to run again if it stops part way: the old patient is only marked merged once everything has moved. */
async function mergePatients(db, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to merge patients.');
  const { clinicId, keepId, mergeId } = input || {};
  for (const value of [clinicId, keepId, mergeId]) if (typeof value !== 'string' || !ID.test(value)) throw new ServiceError('invalid-argument', 'Choose two patients to merge.');
  if (keepId === mergeId) throw new ServiceError('invalid-argument', 'Choose two different patients.');
  const actor = await resolveActor(db, caller, clinicId, ['owner'], 'merge patients');
  const keepRef = db.doc(`patients/${keepId}`), mergeRef = db.doc(`patients/${mergeId}`);
  const [keepSnap, mergeSnap] = await Promise.all([keepRef.get(), mergeRef.get()]);
  const keep = keepSnap.data(), merging = mergeSnap.data();
  if (!keep || !merging || keep.clinicId !== clinicId || merging.clinicId !== clinicId) throw new ServiceError('failed-precondition', 'Both patients must belong to this clinic.');
  if (keep.mergedInto || merging.mergedInto) throw new ServiceError('failed-precondition', 'One of these patients has already been merged.');

  const moved = await moveRecords(db, clinicId, mergeId, keepId);
  const keepRecordRef = db.doc(`patientRecords/${keepId}`);
  await db.runTransaction(async (tx) => {
    const [keepRecord, otherRecord] = await Promise.all([tx.get(keepRecordRef), tx.get(db.doc(`patientRecords/${mergeId}`))]);
    if (otherRecord.exists) {
      const base = { id: keepId, clinicId, patientId: keepId };
      tx.set(keepRecordRef, { ...base, ...mergeRecords(keepRecord.data(), otherRecord.data()), version: (keepRecord.data()?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    }
    tx.update(mergeRef, { mergedInto: keepId, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    if (!keep.familyId && merging.familyId) tx.update(keepRef, { familyId: merging.familyId, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('auditLog').doc(), { clinicId, collection: 'patients', docId: keepId, action: 'merge', fields: Object.entries(moved).filter(([, n]) => n).map(([name, n]) => `${name}: ${n}`), patientId: keepId, actorUid: actor.uid, actorName: actor.name, at: FieldValue.serverTimestamp() });
  });
  return { keepId, moved };
}

module.exports = { MOVED, mergeRecords, joinLines, mergePatients };
