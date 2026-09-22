# ClinicLoop

Mobile-first clinic scheduling and WhatsApp follow-up frontend demo.

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

- `app/clinic-app.tsx`: clinic-scoped workspace, calendar, patient histories, reminders, enrollment.
- `components/clinic-forms.tsx`: accessible forms with shared validation.
- `lib/clinic.ts`: typed records, demo repository, messaging interface, validation, timezone helpers, fictional seed data.
- `tests/clinic.test.mjs`: booking collisions, working hours, clinic isolation, consent, simulation, date rollover, phone validation, and persistence tests.

## Demo behavior

Data stays in localStorage for the current browser and origin. No credentials or backend integrations are included. Reset from Clinic settings restores fictional data. Daily opening/closing hours apply to every day. Appointments use clinic-local dates and times; changing timezone preserves their wall-clock times. The app checks for due reminders every 30 seconds while open; it does not deliver messages or run background jobs. Simulations record the exact message preview and timestamp.

## Later integrations

Replace `DataRepository` with a Firebase implementation, adding authenticated staff membership, tenant-scoped Firestore rules, server-side booking conflict checks, and concurrent-write protection. UI-level clinic filtering is demo organization, not a security boundary.

Replace `MessagingService` with an authenticated backend endpoint for MSG91. Keep its key on the server, validate tenant membership and current consent, use the shared sender with clinic-identifying approved templates, and add a reliable scheduler and delivery webhooks. Simulated status must stay distinct from real delivery states. No browser timer should deliver production messages.
