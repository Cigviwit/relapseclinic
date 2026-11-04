// Marks a login as the platform administrator. Rules and functions check this claim instead of a hardcoded id.
// Run once for the administrator, BEFORE deploying the new rules:
//   GOOGLE_APPLICATION_CREDENTIALS=key.json node scripts/set-platform-admin.cjs admin@example.com relapse-clinic-db
const { createRequire } = require('node:module');
const load = createRequire(require('node:path').join(__dirname, '../functions/index.js'));
const { initializeApp, applicationDefault } = load('firebase-admin/app');
const { getAuth } = load('firebase-admin/auth');

async function main() {
  const [email, projectId] = process.argv.slice(2);
  if (!email || !projectId) throw new Error('Usage: node scripts/set-platform-admin.cjs <email> <project-id>');
  initializeApp({ credential: applicationDefault(), projectId });
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, platformAdmin: true });
  console.log(`${email} is now the platform administrator on ${projectId}. They must sign out and back in.`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
