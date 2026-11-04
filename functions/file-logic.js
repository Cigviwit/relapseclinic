// Patient documents: X-rays, reports and signed consent forms. Browsers never touch the bucket:
// every upload and download passes through these functions, so the role checks live in one place.
const { randomUUID } = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { ServiceError, resolveActor } = require('./access');

// Callable requests are capped at 10 MB, and base64 adds a third.
const MAX_FILE_BYTES = 7 * 1024 * 1024;
const KINDS = ['xray', 'report', 'consent', 'photo', 'other'];
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** What a file really is, from its first bytes. A file named .jpg that is something else is refused. */
function sniffType(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (bytes.length >= 132 && bytes.subarray(128, 132).toString('latin1') === 'DICM') return 'application/dicom';
  return null;
}

const cleanFileName = (name) => String(name || 'file').replace(/[\\/\0-\x1f]/g, ' ').trim().slice(0, 120) || 'file';
const filePath = (clinicId, patientId, id) => `patient-files/${clinicId}/${patientId}/${id}`;

async function uploadPatientFile(db, bucket, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to upload files.');
  const { clinicId, patientId, name, kind, note, data } = input || {};
  for (const value of [clinicId, patientId]) if (typeof value !== 'string' || !ID.test(value)) throw new ServiceError('invalid-argument', 'Choose a patient.');
  const actor = await resolveActor(db, caller, clinicId, ['owner', 'doctor', 'frontdesk'], 'upload patient files');
  if (!KINDS.includes(kind)) throw new ServiceError('invalid-argument', 'Choose what kind of file this is.');
  if (typeof data !== 'string' || !data) throw new ServiceError('invalid-argument', 'Choose a file.');
  if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw new ServiceError('invalid-argument', 'The note is too long.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_FILE_BYTES) throw new ServiceError('invalid-argument', 'This file is larger than 7 MB. Scan it at a lower resolution and try again.');
  const contentType = sniffType(bytes);
  if (!contentType) throw new ServiceError('invalid-argument', 'Only PDF, JPEG, PNG, WebP and DICOM files can be uploaded.');
  const patient = (await db.doc(`patients/${patientId}`).get()).data();
  if (!patient || patient.clinicId !== clinicId) throw new ServiceError('failed-precondition', 'Choose a patient from this clinic.');
  const id = randomUUID();
  const path = filePath(clinicId, patientId, id);
  await bucket.file(path).save(bytes, { contentType, resumable: false });
  const record = { id, clinicId, patientId, name: cleanFileName(name), kind, contentType, size: bytes.length, path, ...(note ? { note } : {}), createdBy: actor.name, createdByUid: actor.uid, createdAt: FieldValue.serverTimestamp() };
  try { await db.doc(`patientFiles/${id}`).set(record); }
  catch (error) { await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => {}); throw error; }
  return { id };
}

async function loadFileRecord(db, id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new ServiceError('invalid-argument', 'A file is required.');
  const ref = db.doc(`patientFiles/${id}`);
  const file = (await ref.get()).data();
  return { ref, file };
}

async function getPatientFile(db, bucket, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to open files.');
  const { file } = await loadFileRecord(db, input?.id);
  if (!file) throw new ServiceError('not-found', 'That file could not be found.');
  await resolveActor(db, caller, file.clinicId, ['owner', 'doctor', 'frontdesk', 'platform'], 'open patient files');
  if (file.removedAt) throw new ServiceError('failed-precondition', 'That file has been removed.');
  const [bytes] = await bucket.file(file.path).download();
  return { name: file.name, contentType: file.contentType, data: bytes.toString('base64') };
}

/** Hides a file uploaded by mistake, with a reason. The bytes stay, because a clinical record should not vanish. */
async function removePatientFile(db, caller, input) {
  if (!caller?.uid) throw new ServiceError('unauthenticated', 'Sign in to remove files.');
  const reason = typeof input?.reason === 'string' ? input.reason.trim() : '';
  if (!reason || reason.length > 200) throw new ServiceError('invalid-argument', 'Enter why this file is being removed.');
  const { ref, file } = await loadFileRecord(db, input?.id);
  if (!file) throw new ServiceError('not-found', 'That file could not be found.');
  const actor = await resolveActor(db, caller, file.clinicId, ['owner', 'doctor'], 'remove patient files');
  await ref.update({ removedAt: FieldValue.serverTimestamp(), removedBy: actor.name, removedReason: reason, updatedBy: actor.uid });
  return { id: file.id };
}

module.exports = { MAX_FILE_BYTES, sniffType, cleanFileName, uploadPatientFile, getPatientFile, removePatientFile };
