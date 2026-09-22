# RelapseClinic

Clinic scheduling and WhatsApp follow-up workspace backed by Firebase Authentication and Firestore.

## Run

Requires Node.js 22.13+.

```sh
npm install
npm run dev
npm run build
node --experimental-strip-types --test tests/clinic.test.mjs
npx tsc --noEmit
```

The development preview uses port 5173. On Windows installations with a broken npm shell shim, use `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"` in place of `npm`.

## Structure

- `app/clinic-app.tsx`: clinic-scoped workspace, calendar, patient histories, reminders, and admin clinic switching.
- `components/clinic-forms.tsx`: accessible forms with shared validation.
- `lib/clinic.ts`: typed records, messaging interface, validation, and timezone helpers.
- `tests/clinic.test.mjs`: booking collisions, working hours, clinic isolation, consent, simulation, date rollover, phone validation, and persistence tests.

## Accounts and access

Clinic registration is closed. The designated Firebase admin account signs in through **Admin login**, creates each clinic and its own email/password account, and can view every clinic. A clinic account can only query its linked clinic and its own patients, appointments, and reminders. `firestore.rules` enforces this on the backend; deploy changes with `npx firebase-tools deploy --only firestore:rules --project relapse-clinic-db`.

Daily opening/closing hours apply to every day. Appointments use clinic-local dates and times; changing timezone preserves their wall-clock times. The app checks for due reminders every 30 seconds while open; it does not deliver messages or run background jobs. Simulations record the exact message preview and timestamp.

## Later integrations

Add server-side booking conflict checks and concurrent-write protection before using the scheduler for high-volume booking.

Replace `MessagingService` with an authenticated backend endpoint for MSG91. Keep its key on the server, validate tenant membership and current consent, use the shared sender with clinic-identifying approved templates, and add a reliable scheduler and delivery webhooks. Simulated status must stay distinct from real delivery states. No browser timer should deliver production messages.
