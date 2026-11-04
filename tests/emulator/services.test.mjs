// Runs the server logic against the Firestore, Auth and Storage emulators: npm run test:emulator
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { bookAppointment, bookWalkIn } = require('./booking-logic');
const { closeDay } = require('./closing-logic');
const { createStaff, updateStaff, staffSetupLink, createClinic } = require('./staff-logic');
const { purgeExpiredFiles, pdfPath } = require('./file-retention');
const { mergePatients } = require('./merge-logic');
const { uploadPatientFile, getPatientFile, removePatientFile, MAX_FILE_BYTES } = require('./file-logic');

let db, auth, bucket;
const C = 'clinic1';
const owner = { uid: 'owner' }, frontdesk = { uid: 'frontdesk' }, outsider = { uid: 'outsider' }, former = { uid: 'former' }, billing = { uid: 'billing' }, doctor = { uid: 'doctor' };
const platform = { uid: 'platform', token: { platformAdmin: true } };
const visit = (over = {}) => ({ id: 'a1', clinicId: C, patientId: 'p1', doctorId: 'd1', date: '2026-11-10', time: '10:00', duration: 30, reason: 'Check-up', status: 'scheduled', ...over });
const profile = (uid, role, clinicId = C, over = {}) => ({ uid, email: `${uid}@x.co`, name: uid.toUpperCase(), clinicId, role, doctorId: '', active: true, ...over });

async function wipe(collection) {
  const snap = await db.collection(collection).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

before(() => {
  initializeApp({ projectId: 'demo-relapseclinic', storageBucket: 'demo-relapseclinic.appspot.com' });
  db = getFirestore(); auth = getAuth(); bucket = getStorage().bucket();
});
beforeEach(async () => {
  for (const name of ['users', 'clinics', 'patients', 'appointments', 'bills', 'ledgerEntries', 'dayClosings', 'prescriptionFiles', 'prescriptions', 'patientRecords', 'patientNotes', 'auditLog', 'waitlist', 'patientFiles']) await wipe(name);
  const { users } = await auth.listUsers();
  await Promise.all(users.map((u) => auth.deleteUser(u.uid)));
  await db.doc(`clinics/${C}`).set({ id: C, name: 'Clinic', opens: '09:00', closes: '19:00', timezone: 'Asia/Kolkata', billingEnabled: true, doctors: [{ id: 'd1' }, { id: 'd2' }] });
  await db.doc('clinics/clinic2').set({ id: 'clinic2', name: 'Other', opens: '09:00', closes: '19:00', timezone: 'Asia/Kolkata', doctors: [{ id: 'dx' }] });
  await db.doc('patients/p1').set({ id: 'p1', clinicId: C, name: 'Asha', phone: '+911234567890', consent: true });
  for (const [uid, role] of [['owner', 'owner'], ['frontdesk', 'frontdesk'], ['billing', 'billing'], ['doctor', 'doctor']]) await db.doc(`users/${uid}`).set(profile(uid, role));
  await db.doc('users/outsider').set(profile('outsider', 'owner', 'clinic2'));
  await db.doc('users/former').set(profile('former', 'owner', C, { active: false }));
});

const refused = (promise, code, pattern) => assert.rejects(promise, (e) => { assert.equal(e.code, code); if (pattern) assert.match(e.message, pattern); return true; });

// --- Booking ---
test('booking saves the appointment with who booked it', async () => {
  await bookAppointment(db, frontdesk, visit());
  const saved = (await db.doc('appointments/a1').get()).data();
  assert.equal(saved.status, 'scheduled');
  assert.equal(saved.updatedBy, 'frontdesk');
  assert.ok(saved.updatedAt);
});

test('two front desks booking the same slot at the same moment: exactly one wins', async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => bookAppointment(db, frontdesk, visit({ id: `race${i}` }))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results.filter((x) => x.status === 'rejected')) assert.match(r.reason.message, /already has an appointment/);
  assert.equal((await db.collection('appointments').get()).size, 1);
});

test('booking refuses a clash, another clinic, a deactivated person and signed-out callers', async () => {
  await bookAppointment(db, frontdesk, visit());
  await refused(bookAppointment(db, frontdesk, visit({ id: 'a2', time: '10:15' })), 'failed-precondition', /already has an appointment/);
  await refused(bookAppointment(db, outsider, visit({ id: 'a3', time: '12:00' })), 'permission-denied');
  await refused(bookAppointment(db, former, visit({ id: 'a4', time: '12:00' })), 'permission-denied');
  await refused(bookAppointment(db, undefined, visit({ id: 'a5', time: '12:00' })), 'unauthenticated');
  await refused(bookAppointment(db, frontdesk, visit({ id: 'a6', time: '12:00', patientId: 'missing' })), 'failed-precondition', /from this clinic/);
});

test('rescheduling moves the appointment and does not clash with itself', async () => {
  await bookAppointment(db, frontdesk, visit());
  await bookAppointment(db, frontdesk, visit({ time: '10:15' }));
  assert.equal((await db.doc('appointments/a1').get()).data().time, '10:15');
});

test('a finished visit cannot be overwritten by booking', async () => {
  await db.doc('appointments/done').set(visit({ id: 'done', status: 'completed', time: '15:00' }));
  await refused(bookAppointment(db, frontdesk, visit({ id: 'done', time: '16:00' })), 'failed-precondition', /Only a booked/);
});

test('another clinic’s appointment id cannot be taken over', async () => {
  await db.doc('appointments/theirs').set(visit({ id: 'theirs', clinicId: 'clinic2', doctorId: 'dx' }));
  await db.doc('patients/p2').set({ id: 'p2', clinicId: C, name: 'B', phone: '+911234567891', consent: true });
  await refused(bookAppointment(db, frontdesk, visit({ id: 'theirs', patientId: 'p2' })), 'failed-precondition');
});

test('a walk-in joins the queue now, on the server clock, even if the slot is taken', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  await bookWalkIn(db, frontdesk, { id: 'w1', clinicId: C, patientId: 'p1', doctorId: 'd1', reason: 'Toothache', date: '1999-01-01', time: '01:00' });
  await bookWalkIn(db, frontdesk, { id: 'w2', clinicId: C, patientId: 'p1', doctorId: 'd1', reason: 'Toothache' });
  const saved = (await db.doc('appointments/w1').get()).data();
  assert.deepEqual([saved.date, saved.walkIn, saved.stage, saved.status, saved.updatedBy], [today, true, 'arrived', 'scheduled', 'frontdesk']);
  assert.ok(saved.arrivedAt);
});

test('a walk-in is refused on a closed day, for a doctor on leave, for another clinic and when repeated', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const walkIn = (over = {}) => ({ id: 'w1', clinicId: C, patientId: 'p1', doctorId: 'd1', reason: 'x', ...over });
  await refused(bookWalkIn(db, outsider, walkIn()), 'permission-denied');
  await refused(bookWalkIn(db, undefined, walkIn()), 'unauthenticated');
  await refused(bookWalkIn(db, frontdesk, walkIn({ patientId: 'missing' })), 'failed-precondition', /from this clinic/);
  await db.doc(`clinics/${C}`).update({ doctors: [{ id: 'd1', name: 'Dr A', leave: [{ id: 'l', from: today, to: today }] }, { id: 'd2' }] });
  await refused(bookWalkIn(db, frontdesk, walkIn()), 'failed-precondition', /on leave/);
  await db.doc(`clinics/${C}`).update({ closedDates: [{ date: today, reason: 'Diwali' }] });
  await refused(bookWalkIn(db, frontdesk, walkIn({ doctorId: 'd2' })), 'failed-precondition', /closed for Diwali/);
  await db.doc(`clinics/${C}`).update({ closedDates: [] });
  await bookWalkIn(db, frontdesk, walkIn({ doctorId: 'd2' }));
  await refused(bookWalkIn(db, frontdesk, walkIn({ doctorId: 'd2' })), 'already-exists');
});

test('someone who has arrived cannot be rescheduled until the arrival is undone', async () => {
  await bookAppointment(db, frontdesk, visit());
  await db.doc('appointments/a1').update({ stage: 'arrived' });
  await refused(bookAppointment(db, frontdesk, visit({ time: '12:00' })), 'failed-precondition', /already arrived/);
});

// --- Day closing ---
const D = '2026-11-05';
const close = (who, over = {}) => closeDay(db, who, { clinicId: C, date: D, countedCash: 400, ...over });

test('closing works out the totals from stored entries and records who closed', async () => {
  await db.doc('bills/b1').set({ clinicId: C, date: D, total: 900, status: 'active' });
  await db.doc('bills/b2').set({ clinicId: C, date: '2026-11-01', total: 300, status: 'void', voidedOn: D });
  await db.doc('ledgerEntries/e1').set({ clinicId: C, date: D, kind: 'payment', method: 'cash', amount: 500 });
  await db.doc('ledgerEntries/e2').set({ clinicId: C, date: D, kind: 'refund', method: 'cash', amount: 50 });
  await db.doc('ledgerEntries/e3').set({ clinicId: C, date: D, kind: 'payment', method: 'upi', amount: 200 });
  await db.doc('ledgerEntries/e4').set({ clinicId: 'clinic2', date: D, kind: 'payment', method: 'cash', amount: 7777 });
  const result = await close(billing);
  assert.deepEqual(result.collected, { cash: 450, upi: 200, card: 0, other: 0 });
  assert.equal(result.billed, 600);
  assert.equal(result.difference, -50);
  const saved = (await db.doc(`dayClosings/${C}_${D}`).get()).data();
  assert.equal(saved.closedBy, 'BILLING');
  assert.equal(saved.closedByUid, 'billing');
});

test('a day closes once, by permitted staff, only when billing is on', async () => {
  await refused(close(doctor), 'permission-denied');
  await refused(close(outsider), 'permission-denied');
  await refused(close(platform), 'permission-denied');
  await close(owner);
  await refused(close(owner), 'already-exists');
  await db.doc(`clinics/${C}`).update({ billingEnabled: false });
  await refused(close(owner, { date: '2026-11-06' }), 'failed-precondition');
});

test('closing refuses a bad cash amount', async () => {
  await refused(close(owner, { countedCash: -1 }), 'invalid-argument');
  await refused(close(owner, { countedCash: 1.5 }), 'invalid-argument');
});

// --- Staff ---
const newStaff = (over = {}) => ({ clinicId: C, name: 'New Person', email: 'New@X.co', role: 'frontdesk', ...over });

test('an owner adds staff: a login, a profile and a link to set a password', async () => {
  const { uid, setupLink } = await createStaff(db, auth, owner, newStaff());
  const saved = (await db.doc(`users/${uid}`).get()).data();
  assert.deepEqual([saved.clinicId, saved.role, saved.name, saved.email, saved.active], [C, 'frontdesk', 'New Person', 'new@x.co', true]);
  assert.match(setupLink, /^https?:\/\//);
  assert.equal((await auth.getUser(uid)).email, 'new@x.co');
  assert.equal(saved.updatedBy, 'owner', 'the activity log can name who added them');
});

test('only an owner or the platform admin can add staff, and only to their own clinic', async () => {
  await refused(createStaff(db, auth, frontdesk, newStaff()), 'permission-denied');
  await refused(createStaff(db, auth, outsider, newStaff()), 'permission-denied');
  await assert.doesNotReject(createStaff(db, auth, platform, newStaff()));
});

test('one email cannot be used for two logins', async () => {
  await createStaff(db, auth, owner, newStaff());
  await refused(createStaff(db, auth, owner, newStaff()), 'already-exists', /own email/);
});

test('deactivating a person disables their login and keeps their history', async () => {
  const { uid } = await createStaff(db, auth, owner, newStaff());
  await updateStaff(db, auth, owner, { uid, active: false });
  assert.equal((await db.doc(`users/${uid}`).get()).data().active, false);
  assert.equal((await auth.getUser(uid)).disabled, true);
  await updateStaff(db, auth, owner, { uid, active: true, role: 'billing' });
  const again = (await db.doc(`users/${uid}`).get()).data();
  assert.deepEqual([again.active, again.role], [true, 'billing']);
  assert.equal((await auth.getUser(uid)).disabled, false);
});

test('the last owner cannot be demoted, and an owner from another clinic cannot touch staff here', async () => {
  const made = await auth.createUser({ email: 'owner@x.co' });
  await db.doc(`users/${made.uid}`).set(profile(made.uid, 'owner'));
  await db.doc('users/owner').delete();
  await refused(updateStaff(db, auth, { uid: made.uid }, { uid: made.uid, role: 'doctor', doctorId: 'd1' }), 'failed-precondition', /at least one active owner/);
  await refused(updateStaff(db, auth, outsider, { uid: 'frontdesk', role: 'owner' }), 'permission-denied');
  await refused(staffSetupLink(db, auth, frontdesk, { uid: made.uid }), 'permission-denied');
});

test('the platform admin creates a clinic with its first owner; nobody else can', async () => {
  const clinic = { id: 'clinic3', name: 'New', doctors: [{ id: 'd' }] };
  await refused(createClinic(db, auth, owner, { clinic, ownerName: 'A', ownerEmail: 'a@x.co' }), 'permission-denied');
  const { uid, setupLink } = await createClinic(db, auth, platform, { clinic, ownerName: 'A', ownerEmail: 'a@x.co' });
  assert.ok(setupLink);
  assert.equal((await db.doc('clinics/clinic3').get()).data().updatedBy, 'platform');
  assert.equal((await db.doc(`users/${uid}`).get()).data().role, 'owner');
  await refused(createClinic(db, auth, platform, { clinic, ownerName: 'B', ownerEmail: 'b@x.co' }), 'already-exists');
});

test('a failed owner login does not leave a clinic behind', async () => {
  await auth.createUser({ email: 'taken@x.co' });
  const clinic = { id: 'clinic4', name: 'New', doctors: [{ id: 'd' }] };
  await refused(createClinic(db, auth, platform, { clinic, ownerName: 'A', ownerEmail: 'taken@x.co' }), 'already-exists');
  assert.equal((await db.doc('clinics/clinic4').get()).exists, false);
});

test('signed-out callers are refused before anything is looked up', async () => {
  await refused(createStaff(db, auth, undefined, newStaff({ clinicId: 'no-such-clinic' })), 'unauthenticated');
  await refused(updateStaff(db, auth, undefined, { uid: 'no-such-person' }), 'unauthenticated');
  await refused(staffSetupLink(db, auth, undefined, { uid: 'no-such-person' }), 'unauthenticated');
  await refused(closeDay(db, undefined, {}), 'unauthenticated');
});

// --- Merging patients ---
async function twoPatients() {
  await db.doc('patients/p2').set({ id: 'p2', clinicId: C, name: 'Asha K', phone: '+911234567890', consent: true, familyId: 'fam' });
  await db.doc('appointments/old').set(visit({ id: 'old', patientId: 'p2', date: '2026-01-01' }));
  await db.doc('prescriptions/rx').set({ id: 'rx', clinicId: C, patientId: 'p2', status: 'final' });
  await db.doc('bills/b').set({ id: 'b', clinicId: C, patientId: 'p2', total: 500, status: 'active' });
  await db.doc('ledgerEntries/e').set({ id: 'e', clinicId: C, patientId: 'p2', amount: 500 });
  await db.doc('patientNotes/n').set({ id: 'n', clinicId: C, patientId: 'p2', text: 'x' });
  await db.doc('patientRecords/p1').set({ id: 'p1', clinicId: C, patientId: 'p1', allergyStatus: 'none', allergies: [], version: 3 });
  await db.doc('patientRecords/p2').set({ id: 'p2', clinicId: C, patientId: 'p2', allergyStatus: 'known', allergies: [{ id: 'a', substance: 'Penicillin' }], conditions: 'Diabetes', version: 1 });
}
const merge = (who, over = {}) => mergePatients(db, who, { clinicId: C, keepId: 'p1', mergeId: 'p2', ...over });

test('merging moves everything to the kept patient and keeps the allergy', async () => {
  await twoPatients();
  const { moved } = await merge(owner);
  assert.equal(moved.bills, 1);
  for (const path of ['appointments/old', 'prescriptions/rx', 'bills/b', 'ledgerEntries/e', 'patientNotes/n']) assert.equal((await db.doc(path).get()).data().patientId, 'p1', path);
  const record = (await db.doc('patientRecords/p1').get()).data();
  assert.deepEqual([record.allergyStatus, record.allergies[0].substance, record.conditions, record.version], ['known', 'Penicillin', 'Diabetes', 4]);
  assert.equal((await db.doc('patients/p2').get()).data().mergedInto, 'p1');
  assert.equal((await db.doc('patients/p1').get()).data().familyId, 'fam');
  assert.equal((await db.collection('auditLog').where('action', '==', 'merge').get()).size, 1);
});

test('only an owner of this clinic can merge, once, and only two real patients of the clinic', async () => {
  await twoPatients();
  await refused(merge(undefined), 'unauthenticated');
  await refused(merge(frontdesk), 'permission-denied');
  await refused(merge(platform), 'permission-denied');
  await refused(merge(outsider), 'permission-denied');
  await refused(merge(owner, { mergeId: 'p1' }), 'invalid-argument');
  await refused(merge(owner, { mergeId: 'missing' }), 'failed-precondition');
  await merge(owner);
  await refused(merge(owner), 'failed-precondition', /already been merged/);
});

// --- Patient files ---
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('image')]);
const upload = (who, over = {}) => uploadPatientFile(db, bucket, who, { clinicId: C, patientId: 'p1', name: 'IOPA 36.png', kind: 'xray', data: pngBytes.toString('base64'), ...over });

test('a file uploads, opens with its contents intact, and records who added it', async () => {
  const { id } = await upload(frontdesk);
  const record = (await db.doc(`patientFiles/${id}`).get()).data();
  assert.deepEqual([record.name, record.contentType, record.createdBy, record.size], ['IOPA 36.png', 'image/png', 'FRONTDESK', pngBytes.length]);
  const opened = await getPatientFile(db, bucket, doctor, { id });
  assert.equal(Buffer.from(opened.data, 'base64').equals(pngBytes), true);
  assert.equal((await getPatientFile(db, bucket, platform, { id })).contentType, 'image/png');
  await bucket.file(record.path).delete();
});

test('uploads are refused by role, clinic, type and size', async () => {
  await refused(upload(undefined), 'unauthenticated');
  await refused(upload(billing), 'permission-denied');
  await refused(upload(platform), 'permission-denied');
  await refused(upload(outsider), 'permission-denied');
  await refused(upload(frontdesk, { patientId: 'missing' }), 'failed-precondition');
  await refused(upload(frontdesk, { data: Buffer.from('<html>').toString('base64') }), 'invalid-argument', /Only PDF/);
  await refused(upload(frontdesk, { kind: 'virus' }), 'invalid-argument');
  await refused(upload(frontdesk, { data: Buffer.alloc(MAX_FILE_BYTES + 1, 1).toString('base64') }), 'invalid-argument', /larger than 7 MB/);
});

test('another clinic and billing staff cannot open a file; a removed file stays on record but cannot be opened', async () => {
  const { id } = await upload(frontdesk);
  await refused(getPatientFile(db, bucket, outsider, { id }), 'permission-denied');
  await refused(getPatientFile(db, bucket, billing, { id }), 'permission-denied');
  await refused(removePatientFile(db, frontdesk, { id, reason: 'x' }), 'permission-denied');
  await refused(removePatientFile(db, doctor, { id }), 'invalid-argument');
  await removePatientFile(db, doctor, { id, reason: 'Wrong patient' });
  const record = (await db.doc(`patientFiles/${id}`).get()).data();
  assert.deepEqual([record.removedBy, record.removedReason], ['DOCTOR', 'Wrong patient']);
  await refused(getPatientFile(db, bucket, doctor, { id }), 'failed-precondition', /removed/);
  assert.equal((await bucket.file(record.path).exists())[0], true);
  await bucket.file(record.path).delete();
});

// --- PDF retention ---
test('expired PDFs are removed from storage and the database; fresh ones stay', async () => {
  const now = Date.UTC(2026, 10, 5);
  const age = (days) => Timestamp.fromMillis(now - days * 864e5);
  await bucket.file(pdfPath('old')).save(Buffer.from('%PDF-old'));
  await bucket.file(pdfPath('new')).save(Buffer.from('%PDF-new'));
  await db.doc('prescriptionFiles/old').set({ path: pdfPath('old'), createdAt: age(31) });
  await db.doc('prescriptionFiles/new').set({ path: pdfPath('new'), createdAt: age(1) });
  await db.doc('prescriptionFiles/legacy').set({ pdf: Buffer.from('%PDF-legacy'), createdAt: age(90) });
  assert.equal(await purgeExpiredFiles(db, bucket, now), 2);
  assert.equal((await db.doc('prescriptionFiles/old').get()).exists, false);
  assert.equal((await db.doc('prescriptionFiles/legacy').get()).exists, false);
  assert.equal((await db.doc('prescriptionFiles/new').get()).exists, true);
  assert.equal((await bucket.file(pdfPath('old')).exists())[0], false);
  assert.equal((await bucket.file(pdfPath('new')).exists())[0], true);
  await bucket.file(pdfPath('new')).delete();
});
