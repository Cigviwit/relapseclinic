// Gives the old shared clinic logins a role and name, so they become that clinic's owner.
// Safe to run more than once. Shows what it would change unless --apply is passed:
//   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/migrate-staff.cjs relapse-clinic-db [--apply]
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').join(__dirname, '../functions/index.js'));
const { initializeApp, applicationDefault } = load('firebase-admin/app');
const { getFirestore } = load('firebase-admin/firestore');

async function main() {
  const [projectId, flag] = process.argv.slice(2);
  if (!projectId) throw new Error('Usage: node scripts/migrate-staff.cjs <project-id> [--apply]');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const users = await db.collection('users').get();
  let changed = 0;
  for (const snap of users.docs) {
    const user = snap.data();
    const update = { ...(user.role ? {} : { role: 'owner' }), ...(user.name ? {} : { name: user.email }), ...(user.active === undefined ? { active: true } : {}), ...(user.doctorId === undefined ? { doctorId: '' } : {}) };
    if (!Object.keys(update).length) continue;
    changed += 1;
    console.log(`${flag === '--apply' ? 'Updating' : 'Would update'} ${user.email}: ${JSON.stringify(update)}`);
    if (flag === '--apply') await snap.ref.update(update);
  }
  console.log(`${users.size} logins checked, ${changed} ${flag === '--apply' ? 'updated' : 'to update'}.`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
