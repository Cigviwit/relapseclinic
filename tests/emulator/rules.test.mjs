// Runs against the Firestore emulator: npm run test:emulator
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

let env;
const C = 'clinic1', OTHER = 'clinic2';
const staff = {
  owner: { uid: 'owner', email: 'o@x.co', name: 'Olivia Owner', clinicId: C, role: 'owner', doctorId: 'd1', active: true },
  doctor: { uid: 'doctor', email: 'd@x.co', name: 'Dr Dev', clinicId: C, role: 'doctor', doctorId: 'd2', active: true },
  frontdesk: { uid: 'frontdesk', email: 'f@x.co', name: 'Farah Desk', clinicId: C, role: 'frontdesk', doctorId: '', active: true },
  billing: { uid: 'billing', email: 'b@x.co', name: 'Bilal Bills', clinicId: C, role: 'billing', doctorId: '', active: true },
  former: { uid: 'former', email: 'x@x.co', name: 'Former Staff', clinicId: C, role: 'owner', doctorId: '', active: false },
  outsider: { uid: 'outsider', email: 'y@x.co', name: 'Other Clinic', clinicId: OTHER, role: 'owner', doctorId: '', active: true },
  legacy: { uid: 'legacy', email: 'clinic@x.co', clinicId: C, createdAt: 'then' },
};
const as = (who) => env.authenticatedContext(who).firestore();
const admin = () => env.authenticatedContext('platform', { platformAdmin: true }).firestore();
const clinicDoc = (id = C) => ({ id, name: 'Clinic', address: 'Addr', phone: '+911234567890', timezone: 'Asia/Kolkata', opens: '09:00', closes: '19:00', doctors: [{ id: 'd1', name: 'Dr One' }, { id: 'd2', name: 'Dr Two' }], prescriptionsEnabled: true, billingEnabled: true });
const patient = (uid, over = {}) => ({ id: 'p9', clinicId: C, name: 'New', phone: '+911234567891', consent: true, updatedBy: uid, updatedAt: serverTimestamp(), ...over });
const rx = (uid, over = {}) => ({ id: 'rx9', clinicId: C, patientId: 'p1', doctorId: 'd2', date: '2026-11-05', medicines: [], createdAt: '2026-11-05T10:00:00Z', status: 'draft', updatedBy: uid, updatedAt: serverTimestamp(), ...over });
const bill = (who, over = {}) => ({ id: 'b9', clinicId: C, patientId: 'p1', doctorId: 'd1', date: '2026-11-05', lines: [{ id: 'l', description: 'Scaling', qty: 1, unitPrice: 100, taxRate: 0 }], subtotal: 100, discount: 0, tax: 0, total: 100, status: 'active', createdBy: staff[who].name, createdAt: serverTimestamp(), createdByUid: who, ...over });
const payment = (who, over = {}) => ({ id: 'e9', clinicId: C, patientId: 'p1', kind: 'payment', method: 'cash', amount: 100, date: '2026-11-05', collectedBy: staff[who].name, createdAt: serverTimestamp(), createdByUid: who, ...over });
const note = (who, over = {}) => ({ id: 'n9', clinicId: C, patientId: 'p1', doctorId: 'd2', date: '2026-11-05', text: 'Visit', createdAt: serverTimestamp(), createdBy: who, createdByName: staff[who].name, ...over });
const record = (who, over = {}) => ({ id: 'p2', clinicId: C, patientId: 'p2', allergyStatus: 'unknown', allergies: [], version: 1, updatedAt: serverTimestamp(), updatedBy: who, ...over });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-relapseclinic', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const s of Object.values(staff)) await setDoc(doc(db, 'users', s.uid), s);
    await setDoc(doc(db, 'clinics', C), clinicDoc());
    await setDoc(doc(db, 'clinics', OTHER), clinicDoc(OTHER));
    await setDoc(doc(db, 'patients', 'p1'), { id: 'p1', clinicId: C, name: 'Asha', phone: '+911234567890', consent: true });
    await setDoc(doc(db, 'patients', 'p2'), { id: 'p2', clinicId: C, name: 'Ravi', phone: '+911234567892', consent: true });
    await setDoc(doc(db, 'appointments', 'a1'), { id: 'a1', clinicId: C, patientId: 'p1', doctorId: 'd1', date: '2026-11-05', time: '10:00', duration: 30, reason: 'Check-up', status: 'scheduled' });
    await setDoc(doc(db, 'prescriptions', 'rx1'), { id: 'rx1', clinicId: C, patientId: 'p1', doctorId: 'd2', date: '2026-11-05', medicines: [], createdAt: 'then', status: 'final' });
    await setDoc(doc(db, 'prescriptions', 'legacy'), { id: 'legacy', clinicId: C, patientId: 'p1', doctorId: 'd2', date: '2026-11-05', medicines: [], createdAt: 'then' });
    await setDoc(doc(db, 'patientRecords', 'p1'), { id: 'p1', clinicId: C, patientId: 'p1', allergyStatus: 'unknown', allergies: [], version: 1 });
    await setDoc(doc(db, 'patientNotes', 'n1'), { id: 'n1', clinicId: C, patientId: 'p1', doctorId: 'd2', date: '2026-11-05', text: 'Private', createdAt: 'then', createdBy: 'doctor' });
    await setDoc(doc(db, 'bills', 'b1'), { id: 'b1', clinicId: C, patientId: 'p1', doctorId: 'd1', date: '2026-11-05', total: 100, status: 'active' });
    await setDoc(doc(db, 'ledgerEntries', 'e1'), { id: 'e1', clinicId: C, patientId: 'p1', kind: 'payment', method: 'cash', amount: 100, date: '2026-11-05' });
    await setDoc(doc(db, 'auditLog', 'l1'), { clinicId: C, collection: 'patients', action: 'update' });
  });
});

// --- Clinic boundaries ---
test('a clinic cannot see or change another clinic’s data', async () => {
  const db = as('outsider');
  await assertFails(getDoc(doc(db, 'patients', 'p1')));
  await assertFails(getDoc(doc(db, 'clinics', C)));
  await assertFails(getDocs(query(collection(db, 'patients'), where('clinicId', '==', C))));
  await assertFails(setDoc(doc(db, 'patients', 'p9'), patient('outsider')));
});

test('nobody signed out can read anything', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'patients', 'p1')));
  await assertFails(getDoc(doc(db, 'clinics', C)));
});

test('a deactivated person loses access at once, whatever their role', async () => {
  const db = as('former');
  await assertSucceeds(getDoc(doc(db, 'users', 'former')));
  await assertFails(getDoc(doc(db, 'patients', 'p1')));
  await assertFails(getDoc(doc(db, 'clinics', C)));
  await assertFails(setDoc(doc(db, 'patients', 'p9'), patient('former')));
});

test('an account from before roles existed still works as the owner', async () => {
  const db = as('legacy');
  await assertSucceeds(getDoc(doc(db, 'auditLog', 'l1')));
  staff.legacy.name = 'clinic@x.co';
  await assertSucceeds(setDoc(doc(db, 'bills', 'b9'), bill('legacy')));
  delete staff.legacy.name;
});

// --- Staff records ---
test('no browser can write a staff record or give itself a role', async () => {
  await assertFails(setDoc(doc(as('owner'), 'users', 'new'), { uid: 'new', clinicId: C, role: 'owner' }));
  await assertFails(updateDoc(doc(as('frontdesk'), 'users', 'frontdesk'), { role: 'owner' }));
  await assertFails(setDoc(doc(admin(), 'users', 'new'), { uid: 'new', clinicId: C, role: 'owner' }));
});

test('only an owner lists the clinic’s staff; everyone reads their own profile', async () => {
  const list = (db) => getDocs(query(collection(db, 'users'), where('clinicId', '==', C)));
  await assertSucceeds(list(as('owner')));
  await assertSucceeds(list(admin()));
  await assertFails(list(as('frontdesk')));
  await assertFails(list(as('outsider')));
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'users', 'frontdesk')));
  await assertFails(getDoc(doc(as('frontdesk'), 'users', 'owner')));
});

// --- Clinic settings ---
test('only the owner and platform admin change clinic settings; only the admin flips feature switches', async () => {
  await assertSucceeds(updateDoc(doc(as('owner'), 'clinics', C), { name: 'Renamed', updatedBy: 'owner' }));
  await assertFails(updateDoc(doc(as('doctor'), 'clinics', C), { name: 'Nope', updatedBy: 'doctor' }));
  await assertFails(updateDoc(doc(as('frontdesk'), 'clinics', C), { name: 'Nope', updatedBy: 'frontdesk' }));
  await assertFails(updateDoc(doc(as('owner'), 'clinics', C), { billingEnabled: false, updatedBy: 'owner' }));
  await assertSucceeds(updateDoc(doc(admin(), 'clinics', C), { billingEnabled: false, updatedBy: 'platform' }));
  await assertFails(updateDoc(doc(as('owner'), 'clinics', C), { name: 'Forged', updatedBy: 'doctor' }), 'the stamp must be the writer');
});

test('browsers cannot create clinics', async () => {
  await assertFails(setDoc(doc(admin(), 'clinics', 'c3'), { ...clinicDoc('c3'), updatedBy: 'platform' }));
});

// --- Appointments ---
test('a browser cannot book, move or re-open an appointment directly', async () => {
  const db = as('owner');
  await assertFails(setDoc(doc(db, 'appointments', 'a9'), { id: 'a9', clinicId: C, patientId: 'p1', doctorId: 'd1', date: '2026-11-05', time: '11:00', duration: 30, reason: 'x', status: 'scheduled', updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { time: '12:00', updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { status: 'scheduled', updatedBy: 'owner', updatedAt: serverTimestamp() }));
});

test('any staff member can record the outcome of a visit, stamped with their own id', async () => {
  await assertSucceeds(updateDoc(doc(as('frontdesk'), 'appointments', 'a1'), { status: 'missed', updatedBy: 'frontdesk', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('frontdesk'), 'appointments', 'a1'), { status: 'completed', updatedBy: 'frontdesk', updatedAt: serverTimestamp() }), 'correcting missed to seen');
  await assertFails(updateDoc(doc(as('owner'), 'appointments', 'a1'), { status: 'cancelled', updatedBy: 'owner', updatedAt: serverTimestamp() }), 'a completed visit stays completed');
});

test('an outcome cannot be forged in another person’s name or changed by another clinic', async () => {
  await assertFails(updateDoc(doc(as('frontdesk'), 'appointments', 'a1'), { status: 'missed', updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('outsider'), 'appointments', 'a1'), { status: 'missed', updatedBy: 'outsider', updatedAt: serverTimestamp() }));
});

test('staff move a booked visit through the queue, stamped with their own id and the real time', async () => {
  const db = as('frontdesk');
  const stamp = { updatedBy: 'frontdesk', updatedAt: serverTimestamp() };
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'with_doctor', startedAt: serverTimestamp(), ...stamp }), 'cannot skip arriving');
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'arrived', arrivedAt: new Date(0), ...stamp }), 'cannot backdate an arrival');
  await assertSucceeds(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'arrived', arrivedAt: serverTimestamp(), ...stamp }));
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'with_doctor', startedAt: serverTimestamp(), time: '12:00', ...stamp }), 'cannot move the time along the way');
  await assertSucceeds(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'with_doctor', startedAt: serverTimestamp(), ...stamp }));
  await assertSucceeds(updateDoc(doc(db, 'appointments', 'a1'), { status: 'completed', finishedAt: serverTimestamp(), ...stamp }));
  await assertFails(updateDoc(doc(db, 'appointments', 'a1'), { stage: 'arrived', arrivedAt: serverTimestamp(), ...stamp }), 'a finished visit stays finished');
});

test('an arrival made by mistake can be undone', async () => {
  const db = as('frontdesk');
  const stamp = { updatedBy: 'frontdesk', updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'appointments', 'a1'), { stage: 'arrived', arrivedAt: serverTimestamp(), ...stamp });
  await assertSucceeds(updateDoc(doc(db, 'appointments', 'a1'), { stage: deleteField(), arrivedAt: deleteField(), startedAt: deleteField(), ...stamp }));
  await assertFails(updateDoc(doc(as('outsider'), 'appointments', 'a1'), { stage: 'arrived', arrivedAt: serverTimestamp(), updatedBy: 'outsider', updatedAt: serverTimestamp() }));
});

// --- Patients ---
test('patient saves are stamped with who saved them', async () => {
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'patients', 'p9'), patient('frontdesk')));
  await assertFails(setDoc(doc(as('frontdesk'), 'patients', 'p8'), patient('owner', { id: 'p8' })));
  await assertFails(setDoc(doc(as('frontdesk'), 'patients', 'p7'), { id: 'p7', clinicId: C, name: 'No stamp', phone: '+911234567891', consent: true }));
});

test('family links survive on the patient, and a browser cannot mark a patient merged', async () => {
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'patients', 'p9'), patient('frontdesk', { familyId: 'f1' })));
  await assertFails(setDoc(doc(as('owner'), 'patients', 'p8'), patient('owner', { id: 'p8', mergedInto: 'p1' })));
});

test('a merged patient cannot be saved, so a merge cannot be undone by accident', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'patients', 'merged'), { id: 'merged', clinicId: C, name: 'Old', phone: '+911234567893', consent: true, mergedInto: 'p1' }));
  await assertFails(setDoc(doc(as('owner'), 'patients', 'merged'), patient('owner', { id: 'merged' })));
  await assertFails(updateDoc(doc(as('owner'), 'patients', 'merged'), { familyId: 'f', updatedBy: 'owner', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as('owner'), 'patients', 'merged')));
});

// --- Waitlist ---
const waiting = (who, over = {}) => ({ id: 'w9', clinicId: C, patientId: 'p1', doctorId: '', status: 'waiting', createdAt: 'now', updatedBy: who, updatedAt: serverTimestamp(), ...over });

test('staff keep the waitlist, and entries can only move on, never be erased', async () => {
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'waitlist', 'w9'), waiting('frontdesk')));
  await assertFails(setDoc(doc(as('frontdesk'), 'waitlist', 'w8'), waiting('owner', { id: 'w8' })), 'stamp must be the writer');
  await assertFails(setDoc(doc(as('frontdesk'), 'waitlist', 'w7'), waiting('frontdesk', { id: 'w7', status: 'booked' })));
  await assertFails(setDoc(doc(as('outsider'), 'waitlist', 'w6'), waiting('outsider', { id: 'w6' })));
  await assertFails(setDoc(doc(as('frontdesk'), 'waitlist', 'w5'), waiting('frontdesk', { id: 'w5', patientId: 'missing' })));
  await assertFails(updateDoc(doc(as('frontdesk'), 'waitlist', 'w9'), { patientId: 'p2', updatedBy: 'frontdesk', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('billing'), 'waitlist', 'w9'), { status: 'booked', updatedBy: 'billing', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('billing'), 'waitlist', 'w9'), { status: 'removed', updatedBy: 'billing', updatedAt: serverTimestamp() }), 'already resolved');
  await assertFails(deleteDoc(doc(as('owner'), 'waitlist', 'w9')));
});

// --- Dental records ---
const plan = (who, over = {}) => ({ id: 'tp9', clinicId: C, patientId: 'p1', doctorId: 'd2', title: 'Plan', items: [{ id: 'i', procedure: 'Crown', teeth: [36], estimate: 100, status: 'planned' }], status: 'active', createdAt: 'now', version: 1, updatedBy: who, updatedAt: serverTimestamp(), ...over });
const lab = (who, over = {}) => ({ id: 'lc9', clinicId: C, patientId: 'p1', doctorId: 'd2', labName: 'Lab', work: 'Crown', teeth: [36], sentOn: '2026-11-05', dueOn: '2026-11-10', status: 'sent', createdAt: 'now', updatedBy: who, updatedAt: serverTimestamp(), ...over });
const recall = (who, over = {}) => ({ id: 'rc9', clinicId: C, patientId: 'p1', due: '2027-05-05', reason: 'Check-up', status: 'due', createdAt: 'now', updatedBy: who, updatedAt: serverTimestamp(), ...over });

test('doctors and owners write treatment plans; a stale edit is refused and plans are never erased', async () => {
  await assertSucceeds(setDoc(doc(as('doctor'), 'treatmentPlans', 'tp9'), plan('doctor')));
  await assertFails(setDoc(doc(as('frontdesk'), 'treatmentPlans', 'tp8'), plan('frontdesk', { id: 'tp8' })));
  await assertFails(setDoc(doc(admin(), 'treatmentPlans', 'tp7'), plan('platform', { id: 'tp7' })));
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'treatmentPlans', 'tp9')));
  await assertSucceeds(getDoc(doc(admin(), 'treatmentPlans', 'tp9')));
  await assertFails(getDoc(doc(as('billing'), 'treatmentPlans', 'tp9')));
  await assertFails(setDoc(doc(as('doctor'), 'treatmentPlans', 'tp9'), plan('doctor', { version: 1 })), 'version must rise');
  await assertSucceeds(setDoc(doc(as('owner'), 'treatmentPlans', 'tp9'), plan('owner', { version: 2, status: 'closed' })));
  await assertFails(setDoc(doc(as('owner'), 'treatmentPlans', 'tp9'), plan('owner', { version: 3, patientId: 'p2' })), 'cannot move to another patient');
  await assertFails(deleteDoc(doc(as('owner'), 'treatmentPlans', 'tp9')));
});

test('clinical staff track lab work and recalls; billing and other clinics cannot', async () => {
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'labCases', 'lc9'), lab('frontdesk')));
  await assertFails(setDoc(doc(as('billing'), 'labCases', 'lc8'), lab('billing', { id: 'lc8' })));
  await assertFails(setDoc(doc(as('outsider'), 'labCases', 'lc7'), lab('outsider', { id: 'lc7' })));
  await assertFails(setDoc(doc(as('frontdesk'), 'labCases', 'lc6'), lab('frontdesk', { id: 'lc6', dueOn: '2026-11-01' })), 'due before sent');
  await assertSucceeds(setDoc(doc(as('doctor'), 'labCases', 'lc9'), lab('doctor', { status: 'received' })));
  await assertFails(deleteDoc(doc(as('owner'), 'labCases', 'lc9')));
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'recalls', 'rc9'), recall('frontdesk')));
  await assertFails(setDoc(doc(as('frontdesk'), 'recalls', 'rc8'), recall('owner', { id: 'rc8' })), 'stamp must be the writer');
  await assertFails(setDoc(doc(as('billing'), 'recalls', 'rc7'), recall('billing', { id: 'rc7' })));
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'recalls', 'rc9'), recall('frontdesk', { status: 'booked' })));
  await assertFails(deleteDoc(doc(as('owner'), 'recalls', 'rc9')));
});

test('those who prescribe keep the medicine list', async () => {
  const catalog = (who) => ({ id: C, clinicId: C, medicines: [], templates: [], updatedBy: who, updatedAt: serverTimestamp() });
  await assertSucceeds(setDoc(doc(as('doctor'), 'clinicCatalogs', C), catalog('doctor')));
  await assertFails(setDoc(doc(as('frontdesk'), 'clinicCatalogs', C), catalog('frontdesk')));
  await assertFails(setDoc(doc(as('outsider'), 'clinicCatalogs', C), catalog('outsider')));
  await assertFails(setDoc(doc(admin(), 'clinicCatalogs', C), catalog('platform')));
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'clinicCatalogs', C)));
  await assertFails(getDoc(doc(as('billing'), 'clinicCatalogs', C)));
  await assertFails(deleteDoc(doc(as('owner'), 'clinicCatalogs', C)));
});

test('a prescription keeps the allergy confirmation, and a note can be linked to its visit', async () => {
  await assertSucceeds(setDoc(doc(as('doctor'), 'prescriptions', 'rx9'), rx('doctor', { allergyOverride: ['Tab Augmentin'] })));
  await assertSucceeds(setDoc(doc(as('doctor'), 'patientNotes', 'n9'), note('doctor', { appointmentId: 'a1' })));
});

// --- Clinical privacy ---
test('visit notes are for doctors and owners only, and the platform admin cannot read them', async () => {
  await assertSucceeds(getDoc(doc(as('doctor'), 'patientNotes', 'n1')));
  await assertSucceeds(getDoc(doc(as('owner'), 'patientNotes', 'n1')));
  await assertFails(getDoc(doc(as('frontdesk'), 'patientNotes', 'n1')));
  await assertFails(getDoc(doc(as('billing'), 'patientNotes', 'n1')));
  await assertFails(getDoc(doc(admin(), 'patientNotes', 'n1')));
  await assertFails(getDocs(query(collection(admin(), 'patientNotes'), where('clinicId', '==', C))));
});

test('a note carries the writer’s real name, and cannot be changed afterwards', async () => {
  await assertSucceeds(setDoc(doc(as('doctor'), 'patientNotes', 'n9'), note('doctor')));
  await assertFails(setDoc(doc(as('doctor'), 'patientNotes', 'n8'), note('doctor', { id: 'n8', createdByName: 'Olivia Owner' })));
  await assertFails(setDoc(doc(as('frontdesk'), 'patientNotes', 'n7'), note('frontdesk', { id: 'n7' })));
  await assertFails(updateDoc(doc(as('doctor'), 'patientNotes', 'n9'), { text: 'Changed' }));
  await assertFails(deleteDoc(doc(as('owner'), 'patientNotes', 'n9')));
});

test('billing staff cannot open medical records or prescriptions', async () => {
  await assertFails(getDoc(doc(as('billing'), 'patientRecords', 'p1')));
  await assertFails(getDoc(doc(as('billing'), 'prescriptions', 'rx1')));
  await assertSucceeds(getDoc(doc(as('billing'), 'patients', 'p1')));
});

test('front desk maintains the medical record form; the platform admin only reads it', async () => {
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'patientRecords', 'p1')));
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'patientRecords', 'p2'), record('frontdesk')));
  await assertSucceeds(getDoc(doc(admin(), 'patientRecords', 'p1')));
  await assertFails(setDoc(doc(admin(), 'patientRecords', 'p2'), record('platform')));
  await assertFails(setDoc(doc(as('billing'), 'patientRecords', 'p2'), record('billing')));
});

test('patient files are listed for clinical staff and the admin, and no browser writes the list', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'patientFiles', 'f1'), { id: 'f1', clinicId: C, patientId: 'p1', name: 'x.png' }));
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'patientFiles', 'f1')));
  await assertSucceeds(getDoc(doc(as('doctor'), 'patientFiles', 'f1')));
  await assertSucceeds(getDoc(doc(admin(), 'patientFiles', 'f1')));
  await assertFails(getDoc(doc(as('billing'), 'patientFiles', 'f1')));
  await assertFails(getDoc(doc(as('outsider'), 'patientFiles', 'f1')));
  await assertFails(setDoc(doc(as('owner'), 'patientFiles', 'f2'), { id: 'f2', clinicId: C, patientId: 'p1' }));
  await assertFails(deleteDoc(doc(as('owner'), 'patientFiles', 'f1')));
});

test('the activity log is readable by owners and the platform admin, and written by nobody', async () => {
  await assertSucceeds(getDoc(doc(as('owner'), 'auditLog', 'l1')));
  await assertSucceeds(getDoc(doc(admin(), 'auditLog', 'l1')));
  await assertFails(getDoc(doc(as('doctor'), 'auditLog', 'l1')));
  await assertFails(setDoc(doc(as('owner'), 'auditLog', 'l2'), { clinicId: C }));
  await assertFails(deleteDoc(doc(admin(), 'auditLog', 'l1')));
});

// --- Prescriptions ---
test('a doctor writes prescriptions under their own name only; front desk and admin cannot write', async () => {
  await assertSucceeds(setDoc(doc(as('doctor'), 'prescriptions', 'rx9'), rx('doctor')));
  await assertFails(setDoc(doc(as('doctor'), 'prescriptions', 'rx8'), rx('doctor', { id: 'rx8', doctorId: 'd1' })));
  await assertSucceeds(setDoc(doc(as('owner'), 'prescriptions', 'rx7'), rx('owner', { id: 'rx7' })));
  await assertFails(setDoc(doc(as('frontdesk'), 'prescriptions', 'rx6'), rx('frontdesk', { id: 'rx6' })));
  await assertFails(setDoc(doc(admin(), 'prescriptions', 'rx5'), rx('platform', { id: 'rx5' })));
});

test('front desk and the platform admin can read prescriptions', async () => {
  await assertSucceeds(getDoc(doc(as('frontdesk'), 'prescriptions', 'rx1')));
  await assertSucceeds(getDoc(doc(admin(), 'prescriptions', 'rx1')));
});

test('a draft can change and be finalised; a final prescription never changes', async () => {
  const db = as('doctor');
  await assertSucceeds(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor')));
  await assertSucceeds(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { diagnosis: 'Caries' })));
  const final = { status: 'final', finalizedAt: serverTimestamp(), finalizedBy: 'Dr Dev' };
  await assertSucceeds(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { diagnosis: 'Caries', ...final })));
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { diagnosis: 'Changed', ...final })));
  await assertFails(updateDoc(doc(db, 'prescriptions', 'rx9'), { status: 'draft', updatedBy: 'doctor', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'prescriptions', 'rx9')));
});

test('a prescription from before drafts existed counts as final', async () => {
  await assertFails(setDoc(doc(as('doctor'), 'prescriptions', 'legacy'), rx('doctor', { id: 'legacy' })));
});

test('finalising needs the real name and time, and a browser cannot mark a prescription sent', async () => {
  const db = as('doctor');
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { status: 'final', finalizedAt: serverTimestamp(), finalizedBy: 'Someone Else' })));
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { status: 'final' })));
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { sentAt: 'now' })));
});

test('an amendment must point at a prescription for the same patient', async () => {
  const db = as('doctor');
  await assertSucceeds(setDoc(doc(db, 'prescriptions', 'rx9'), rx('doctor', { amends: 'rx1' })));
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx8'), rx('doctor', { id: 'rx8', patientId: 'p2', amends: 'rx1' })));
  await assertFails(setDoc(doc(db, 'prescriptions', 'rx7'), rx('doctor', { id: 'rx7', amends: 'missing' })));
});

// --- Billing ---
test('the name on a bill or payment is the signed-in person’s, not typed', async () => {
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'bills', 'b9'), bill('frontdesk')));
  await assertFails(setDoc(doc(as('frontdesk'), 'bills', 'b8'), bill('frontdesk', { id: 'b8', createdBy: 'Olivia Owner' })));
  await assertSucceeds(setDoc(doc(as('frontdesk'), 'ledgerEntries', 'e9'), payment('frontdesk')));
  await assertFails(setDoc(doc(as('frontdesk'), 'ledgerEntries', 'e8'), payment('frontdesk', { id: 'e8', collectedBy: 'Olivia Owner' })));
});

test('the platform admin reads billing but cannot write it', async () => {
  await assertSucceeds(getDoc(doc(admin(), 'bills', 'b1')));
  await assertSucceeds(getDoc(doc(admin(), 'ledgerEntries', 'e1')));
  await assertFails(setDoc(doc(admin(), 'bills', 'b9'), { ...bill('owner'), createdByUid: 'platform' }));
  await assertFails(setDoc(doc(admin(), 'ledgerEntries', 'e9'), { ...payment('owner'), createdByUid: 'platform' }));
});

const voiding = (who) => ({ status: 'void', voidReason: 'Wrong patient', voidedOn: '2026-11-05', voidedBy: staff[who].name, voidedAt: serverTimestamp(), voidedByUid: who });

test('only owners and billing staff can void a bill', async () => {
  await assertFails(updateDoc(doc(as('frontdesk'), 'bills', 'b1'), voiding('frontdesk')));
  await assertFails(updateDoc(doc(as('doctor'), 'bills', 'b1'), voiding('doctor')));
  await assertSucceeds(updateDoc(doc(as('billing'), 'bills', 'b1'), voiding('billing')));
});

test('only owners and billing staff can refund or reverse a payment', async () => {
  const refund = (who, id) => payment(who, { id, kind: 'refund' });
  await assertFails(setDoc(doc(as('frontdesk'), 'ledgerEntries', 'r1'), refund('frontdesk', 'r1')));
  await assertSucceeds(setDoc(doc(as('owner'), 'ledgerEntries', 'r2'), refund('owner', 'r2')));
  const reversal = (who) => payment(who, { id: 'rev_e1', kind: 'reversal', reverses: 'e1', reversesKind: 'payment' });
  await assertFails(setDoc(doc(as('frontdesk'), 'ledgerEntries', 'rev_e1'), reversal('frontdesk')));
  await assertSucceeds(setDoc(doc(as('billing'), 'ledgerEntries', 'rev_e1'), reversal('billing')));
});

test('no browser can write a closing, and a closed day takes no new money', async () => {
  await assertFails(setDoc(doc(as('owner'), 'dayClosings', `${C}_2026-11-05`), { id: `${C}_2026-11-05`, clinicId: C, date: '2026-11-05' }));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'dayClosings', `${C}_2026-11-05`), { clinicId: C, date: '2026-11-05' }));
  await assertFails(setDoc(doc(as('owner'), 'bills', 'b9'), bill('owner')));
  await assertFails(setDoc(doc(as('owner'), 'ledgerEntries', 'e9'), payment('owner')));
  await assertFails(updateDoc(doc(as('owner'), 'bills', 'b1'), voiding('owner')));
});

test('a bill’s arithmetic must add up and billing can be switched off', async () => {
  await assertFails(setDoc(doc(as('owner'), 'bills', 'b9'), bill('owner', { total: 1 })));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'clinics', C), { billingEnabled: false }));
  await assertFails(setDoc(doc(as('owner'), 'bills', 'b9'), bill('owner')));
});
