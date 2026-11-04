# RelapseClinic runbook

## Deploying this release to an existing project

Order matters: the new rules refuse the old app, and the old app refuses the new rules.

1. **Back up first.** `gcloud firestore export gs://<bucket>/before-staff-logins --project relapse-clinic-db`
2. **Enable Cloud Storage** for the project if it is not already on (Firebase console → Storage). Prescription PDFs now live there.
3. **Mark the platform administrator.** `node scripts/set-platform-admin.cjs <admin-email> relapse-clinic-db`, then sign out and back in.
4. **Migrate the old clinic logins.** `node scripts/migrate-staff.cjs relapse-clinic-db`, read the output, then again with `--apply`. Each old shared login becomes that clinic's owner, named by its email.
5. **Deploy the backend.** `npx firebase-tools deploy --only firestore,storage,functions --project relapse-clinic-db`. Indexes can take several minutes to build.
6. **Deploy the website** to Vercel straight after, so the old app is not left talking to the new rules.
7. **Check it:** sign in as the owner, book an appointment, write and finalise a prescription, take a payment, and confirm each appears under Settings → Activity log.

Scripts need `GOOGLE_APPLICATION_CREDENTIALS` pointing at a service account key. Delete the key afterwards.

### Optional: two-step login

Two-step login uses authenticator apps, which Firebase provides through Identity Platform:

1. Firebase console → Authentication → upgrade to Identity Platform.
2. Turn on TOTP for the project, as described in Firebase's "Add TOTP multi-factor authentication" guide.

Until then, the Settings screen reports that it is not switched on, and sign-in is unaffected.

## Backups

- **Turn on:** `scripts/setup-backups.sh relapse-clinic-db` (daily, kept for 14 weeks).
- **Check:** `gcloud firestore backups list --project relapse-clinic-db --format="table(name,state,snapshotTime)"`

### Restoring

A restore creates a **new database**. It never overwrites the live one, so a failed attempt cannot make things worse.

1. Find the backup: `gcloud firestore backups list --project relapse-clinic-db`
2. Restore it: `gcloud firestore databases restore --project relapse-clinic-db --source-backup=<backup-name> --destination-database=restore-check`
3. Inspect it in the Firebase console and compare record counts.
4. To go live from it, copy the needed collections back, or export from the restored database and import into `(default)`.

**Practise this every quarter**, and record the date and how long it took here. An untested backup is only a hope.

| Date | Backup used | Time taken | Result |
|---|---|---|---|
| *not yet run* | | | |

## What is kept, and for how long

| Data | Kept | Removed by |
|---|---|---|
| Patients, records, notes, prescriptions, bills, payments | Indefinitely | Nothing. Needs a clinic retention policy before the launch phase |
| Sent prescription PDFs | 30 days | `purgePrescriptionFiles`, daily. The prescription itself stays and can be printed again |
| Activity log | Indefinitely | Nothing yet |
| Firestore backups | 14 weeks | The backup schedule |

## Watching for problems

- **Browser and server errors:** Google Cloud console → Error Reporting. Browser errors arrive through `reportClientError` and show `source: browser`. Set a notification channel there, so errors reach you without anyone having to look.
- **WhatsApp failures:** the Messages screen shows them to the clinic.

## Staging

Keep a second Firebase project for trying releases, so production data is never used for testing:

1. Create the project and enable Firestore, Auth, Storage and Functions.
2. `npx firebase-tools use --add`, with the alias `staging`.
3. `npx firebase-tools deploy --only firestore,storage,functions --project staging`
4. Build the website with the `VITE_FIREBASE_*` values from `.env.example`.

## Running everything locally

Needs Java 21 and `firebase-tools`.

```sh
npm run test:emulator                 # rules and server logic against the emulators
npm run dev                           # http://localhost:5173/?demo needs no Firebase at all
```

`?demo=frontdesk`, `?demo=doctor`, `?demo=billing` and `?demo=platform` show the workspace as that role.
