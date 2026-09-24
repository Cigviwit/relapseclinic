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

Daily opening/closing hours apply to every day. Appointments use clinic-local dates and times; changing timezone preserves their wall-clock times. The website records appointments and consent in Firestore. Firebase Cloud Functions send MSG91 booking confirmations and check reminders every five minutes. Marking a past visit Missed sends the first missed-visit message immediately; it replaces the next-day follow-up. The second follow-up is due at 8 AM seven days after the original appointment if that date has not passed. A scheduled recovery check catches recently marked missed visits whose event was not processed.

## WhatsApp production setup

See [functions/MSG91_SETUP.md](functions/MSG91_SETUP.md) for the exact template copy, secret structure, and deploy steps. The older manual reminder records remain visible in patient history as drafts; they do not trigger WhatsApp delivery.
