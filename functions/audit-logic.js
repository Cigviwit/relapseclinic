// The activity log: who changed what, and when. Field names only, so it never becomes a second copy of medical data.
const AUDITED = ['clinics', 'patients', 'appointments', 'prescriptions', 'bills', 'ledgerEntries', 'dayClosings', 'users', 'waitlist', 'patientFiles', 'treatmentPlans', 'labCases', 'recalls', 'clinicCatalogs'];
/** Bookkeeping written by the system, not by a person. A change to only these is not worth logging. */
const SYSTEM_FIELDS = new Set(['number', 'sentAt', 'updatedAt', 'updatedBy', 'version']);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function changedFields(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => !SYSTEM_FIELDS.has(f) && !same(before[f], after[f])).sort();
}

/** Who made this write. Rules force each of these fields to the caller's own uid. */
function actorOf(after) {
  return after?.voidedByUid && after.status === 'void' ? after.voidedByUid : after?.updatedBy || after?.closedByUid || after?.createdByUid || 'system';
}

/** The log entry for one write, or null if nothing a person did changed. */
function auditEntry(collection, docId, before, after) {
  // A merge moves many records at once and writes one log entry for all of them.
  if (before && after?.mergedFrom && before.mergedFrom !== after.mergedFrom) return null;
  const action = !before ? 'create' : !after ? 'delete' : 'update';
  const fields = action === 'update' ? changedFields(before, after) : [];
  if (action === 'update' && !fields.length) return null;
  const doc = after || before;
  const clinicId = collection === 'clinics' ? docId : doc.clinicId;
  if (!clinicId) return null;
  const patientId = collection === 'patients' ? docId : doc.patientId;
  return { clinicId, collection, docId, action, fields, ...(patientId ? { patientId } : {}), actorUid: actorOf(after) };
}

module.exports = { AUDITED, changedFields, actorOf, auditEntry };
