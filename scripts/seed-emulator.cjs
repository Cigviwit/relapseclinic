// Fills the local emulators with a test clinic, for trying the real sign-in and server flows.
// Refuses to run unless both emulator hosts are set, so it can never touch production.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed-emulator.cjs
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').join(__dirname, '../functions/index.js'));
const { initializeApp } = load('firebase-admin/app');
const { getAuth } = load('firebase-admin/auth');
const { getFirestore } = load('firebase-admin/firestore');

const TEST_PASSWORD = 'local-test-only-1';
const CLINIC = 'demo-dental';

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST first.');
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-relapseclinic' });
  const auth = getAuth(), db = getFirestore();
  await db.doc(`clinics/${CLINIC}`).set({ id: CLINIC, name: 'Local Dental Care', address: 'Pune', phone: '+919800000001', timezone: 'Asia/Kolkata', opens: '09:00', closes: '19:00', prescriptionsEnabled: true, billingEnabled: true, doctors: [{ id: 'dr-a', name: 'Dr. Anita Rao', specialty: 'Endodontist', padSpecialty: 'dental' }, { id: 'dr-b', name: 'Dr. Vivek Joshi', specialty: 'Dentist', padSpecialty: 'dental' }] });
  await db.doc('patients/local-p1').set({ id: 'local-p1', clinicId: CLINIC, name: 'Meena Kulkarni', phone: '+919800000002', consent: false, language: 'en' });
  const people = [['owner', 'Anita Rao', 'dr-a'], ['doctor', 'Vivek Joshi', 'dr-b'], ['frontdesk', 'Sunita Pawar', ''], ['billing', 'Rahul More', '']];
  for (const [role, name, doctorId] of people) {
    const email = `${role}@local.test`;
    const user = await auth.createUser({ email, password: TEST_PASSWORD, displayName: name });
    await db.doc(`users/${user.uid}`).set({ uid: user.uid, email, name, clinicId: CLINIC, role, doctorId, active: true, createdAt: new Date().toISOString() });
  }
  const admin = await auth.createUser({ email: 'platform@local.test', password: TEST_PASSWORD });
  await auth.setCustomUserClaims(admin.uid, { platformAdmin: true });
  console.log(`Seeded. Sign in as owner@, doctor@, frontdesk@, billing@ or platform@local.test with password ${TEST_PASSWORD}`);
}
main().catch(error => { console.error(error); process.exit(1); });
