# RelapseClinic

Clinic management for small dental clinics in India: appointments, patient records, prescriptions, billing and WhatsApp follow-ups, backed by Firebase. The specialty presets in `lib/rx-templates.ts` leave room for other specialties such as dermatology.

## Run

Requires Node.js 22.13+.

```sh
npm install
npm --prefix functions install
npm run dev           # http://localhost:5173
npm run build         # typecheck, then a static bundle in dist/
npm test              # logic tests, no Firebase needed
npm run test:emulator # access rules and server logic; needs Java 21 and firebase-tools
npm run test:all      # everything CI runs, except the build
```

Try the UI without signing in at `http://localhost:5173/?demo` (localhost only; sample data in memory, nothing is saved or sent). `?demo=frontdesk`, `?demo=doctor`, `?demo=billing` and `?demo=platform` show the workspace as that role.

Deploying, backups, restores and staging are in [docs/RUNBOOK.md](docs/RUNBOOK.md). **This release must be deployed in the order given there**, because the old app and the new rules do not work together.

On Windows installations with a broken npm shell shim, use `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"` in place of `npm`.

## Structure

- `app/clinic-app.tsx`: app shell: auth, live Firestore subscriptions, navigation (URL hash), keyboard shortcuts, dialogs. Less-used screens are lazy-loaded. `app/idle-lock.tsx` is the screen lock and `app/error-boundary.tsx` catches a crashed screen.
- `components/workspace/`: Today, Schedule, Patients, Prescriptions, Messages, Impact, Settings (including staff logins and the activity log), the appointment drawer and the Ctrl+K command palette.
- `components/prescription/prescription-builder.tsx`: prescription builder with live pad / WhatsApp preview, print and send.
- `lib/permissions.ts`: what each role may do. `lib/clinic.ts`: records and validation. `lib/schedule.ts`: free slots and the day queue. `lib/prescription.ts`, `lib/billing.ts`, `lib/patient-record.ts`: the logic for each area. `lib/firestore-repository.ts` is all Firestore access; `lib/demo-repository.ts` is the same interface in memory.
- `firestore.rules`, `storage.rules`: what the database enforces. `functions/`: Cloud Functions: booking, day closing, staff logins, the activity log, messaging and PDF retention.
- `tests/`: logic tests. `tests/emulator/`: access rules and server logic against the Firebase emulators. `functions/test/`: function logic.

## Front desk workflow

**Today** is the home screen: today’s queue with a “now” line, one-click Seen / Missed / Rx on every row, past visits still needing an outcome, who is up next and tomorrow’s list. Shortcuts: `N` new appointment, `R` prescription, `P` add patient, `/` or `Ctrl+K` search. Booking shows the doctor’s free slots for the chosen length; a new patient can be added inline from the search box.

Try the UI without signing in at `http://localhost:5173/?demo` (localhost only; sample data in memory, nothing is saved or sent).

## Prescriptions

Digital prescriptions are off for every clinic by default. Only the administrator can turn them on, per clinic, in **Settings → Digital prescriptions** (`prescriptionsEnabled` on the clinic; `firestore.rules` and `sendPrescription` enforce it). While off, the clinic sees no prescription screens or shortcuts; records already written are kept and reappear if it is turned back on.

Write a prescription from Today’s queue, an appointment, a patient’s page or with `R`. **Settings → Prescription pad** chooses the clinic’s specialty (Dental, General physician, Pediatrics, Dermatology), layout (Classic, Colour band, Minimal), colour, A5/A4 paper, tagline and footer, plus each doctor’s qualification, registration number and own pad specialty. The specialty decides which sections the builder shows and its quick-pick lists (`lib/rx-templates.ts`).

The **Dental** pad adds medical history and allergies, an FDI tooth chart (adult and milk teeth), clinical findings, diagnosis, treatment done today and treatment advised, with dental medicines and post-procedure advice. The selected teeth are drawn on the printed pad.

**Send on WhatsApp** saves the prescription, renders the pad to a PDF in the browser (`lib/pdf.ts`) and sends it from the clinic’s MSG91 WhatsApp number (`sendPrescription` function; see [functions/MSG91_SETUP.md](functions/MSG91_SETUP.md#prescription-template-pdf) for the template to get approved). **My WhatsApp** is the fallback: it opens WhatsApp on the computer with the prescription as text. **PDF** downloads the same file; **Print** prints it. For Hindi or Marathi patients each dosage line is repeated in their language. Shortcuts: `Ctrl+S` save, `Ctrl+Enter` send, `Ctrl+P` print.

**Drafts and final prescriptions.** A prescription starts as a draft that can change. Finalising locks it under the signed-in person's name, and printing, downloading or sending finalises it first, so what a patient holds always matches the record. A final prescription never changes: **Amend** makes a corrected copy whose `amends` names the original, which stays on record. Prescriptions from before this existed count as final. A doctor writes only under their own name; an owner may write for any doctor.

Prescriptions are stored in the `prescriptions` Firestore collection. Sent PDFs are in Cloud Storage for 30 days, as long as the WhatsApp link works, then `purgePrescriptionFiles` removes them; the prescription itself stays and can be printed again.

## Patient records

A patient's page shows allergies first, then personal details, medical background and one history combining visits, prescriptions and notes. Records work whether or not digital prescriptions are on. New prescriptions start with the patient's age, sex and history, and show their allergies; this is a reminder, and the app does not check medicines against allergies.

- `patients`: name, phone, consent and language only. Every open screen syncs this whole collection, and the messaging functions read it, so medical details stay out of it.
- `patientRecords/{patientId}`: what is true of the patient now, loaded only while that patient is open. `version` must rise by exactly 1 on each save, so `firestore.rules` refuses an edit based on an out-of-date copy.
- `patientNotes`: visit notes and vitals. They cannot be edited or deleted; a correction is a new note whose `corrects` names the old one. `createdAt` and `createdBy` are enforced by the rules.
- `patientRecordAudit`: what changed in each record save, written only by the `recordPatientRecordChange` function.

Visit notes are for owners and doctors, and are the one thing the platform administrator cannot read. Front desk staff keep the medical record form up to date, and billing staff see neither.

Allergy status is `unknown`, `none` or `known`, because an empty list does not tell a doctor that someone asked. `createdBy` and `createdByName` identify the person who wrote a note, and the rules check both.


## Billing

Billing is off for every clinic by default. Only the administrator can turn it on, per clinic, in **Settings → Billing** (`billingEnabled`, enforced by `firestore.rules`). The administrator can read a clinic's bills but cannot change them.

RelapseClinic records money; it never moves it. There is no payment gateway: patients pay by cash, card machine or the clinic's own UPI, and staff record what happened. The UPI QR uses the standard `upi://pay` link with the amount filled in, so nothing reports back; staff check the clinic's soundbox or bank app before recording it.

Make a bill from Today's queue, an appointment, a patient's page or with `B`. **Settings → Billing** holds the fee list, the clinic's UPI ID and optional GST details. The logic lives in `lib/billing.ts`:

- **Bills are never edited or deleted.** A wrong bill is voided with a reason. Money paid on it becomes patient credit.
- **Ledger entries are never edited or deleted.** A wrong entry is corrected by a new reversal dated the day of the correction. A refund records that money went back; staff still return it themselves.
- **Balances are calculated, not stored.** Money marked for a bill goes to that bill; advances and overpayments pay the oldest open bills, and the rest is credit.
- **Closing a day is permanent.** Billing → Daily closing sends the cash count to the `closeDay` function, which works out the totals from the stored entries, so a browser cannot record different numbers. The rules then refuse new entries on that date. Closing needs a live connection.
- **Bill numbers come from the server.** The `assignBillNumber` function gives each bill the next number once it syncs (`2026-27/00001`, per clinic, restarting each financial year). Until then a bill shows a provisional label.

Anyone who bills can record payments. Voids, refunds and corrections are for owners and billing staff.

## Impact dashboard

The **Impact** page proves the value of the follow-ups: messages sent (accepted by MSG91), missed visits followed up, missed visits rebooked, and estimated recovered visits (a follow-up was sent and the patient has a later booked or completed visit). Enter an average visit fee to estimate recovered revenue. Logic lives in `lib/impact.ts`.

## Accounts and access

Clinic registration is closed. The platform administrator creates each clinic and its owner; the owner adds the rest of the staff under **Settings → Staff logins**. Each person signs in as themselves and sets their own password through a link, so every note, prescription, bill and payment carries their real name. That name comes from their profile and the rules check it, so it cannot be typed in.

| Role | Can do |
|---|---|
| **Owner** | Everything in the clinic: staff, settings, corrections, activity log, data download |
| **Doctor** | Medical records, visit notes and their own prescriptions, plus bills and payments |
| **Front desk** | Patients, booking, the medical record form, bills, payments and closing the day. Reads and sends prescriptions. No visit notes |
| **Billing** | Patients, booking, bills, payments, voids and refunds, closing the day. No medical information |
| **Platform administrator** | Reads everything except visit notes. Changes clinic settings, feature switches, patients, appointments and staff. Never writes clinical or billing records |

`firestore.rules` and the functions enforce this table; `lib/permissions.ts` is the same table for hiding what would be refused. Only Cloud Functions write `users/{uid}`, so nobody can give themselves a role. Deactivating a person takes effect immediately and keeps everything they recorded. A clinic always keeps one active owner. The platform administrator is identified by a `platformAdmin` auth claim, set with `scripts/set-platform-admin.cjs`.

**The platform administrator can read patient, medical, prescription and billing records.** Clinics should be told this in their agreement.

Screens lock after 15 minutes without activity (owners can change this), and closing the tab does not skip the lock. Each person can also turn on two-step login with an authenticator app, once it is enabled for the project; see the runbook.

**Activity log:** `audit_*` functions record who created or changed clinics, patients, appointments, prescriptions, bills, payments, closings and staff logins in `auditLog`. It stores field names, never values, so it does not become a second copy of medical data. Nobody can edit it. Reads are not logged, because Firestore cannot report them.

**Your data:** owners can download everything from **Settings → Your data**. The full download is recorded in the activity log.

Daily opening/closing hours apply to every day. Appointments use clinic-local dates and times; changing timezone preserves their wall-clock times. Firebase Cloud Functions send MSG91 booking confirmations and check reminders every five minutes. Marking a past visit Missed sends the first missed-visit message immediately.

## Booking

Appointments are booked and rescheduled by the `bookAppointment` function, which checks for clashes in a transaction, so two front desks cannot take the same slot. It needs a connection: offline, the form says so and stays open. Browsers can only record what happened to a booked visit (seen, missed, cancelled). `validateAppointment` in `lib/clinic.ts` gives the same answer in the form, and a test keeps the two in step.

## How much data stays live

To keep a clinic's fifth year as fast as its first, screens listen only to the clinic on screen and to the last 6 months of appointments, prescriptions and messages (`lib/data-window.ts`). Opening a patient loads their whole history, and looking back through the schedule loads that stretch. Older visits still awaiting an outcome stay on the list.

Patients, bills and payments stay fully loaded. The patient list is small and drives search, and balances are worked out from a patient's whole history. This suits a small clinic for years; a clinic reaching tens of thousands of bills would need stored balances.

## WhatsApp production setup

See [functions/MSG91_SETUP.md](functions/MSG91_SETUP.md) for the exact template copy, secret structure, and deploy steps. The older manual reminder records remain visible in patient history as drafts; they do not trigger WhatsApp delivery.

Clinics can also enable a next-day **email digest for each doctor** in Clinic settings. It sends at the clinic's chosen local time and includes tomorrow's appointment count, patient names, times, and durations. See [functions/DOCTOR_EMAIL_SETUP.md](functions/DOCTOR_EMAIL_SETUP.md) for email provider and deployment setup.

## Patient message language

Add/edit patient includes English only, English + Marathi and English + Hindi. Each approved bilingual template sends English first and the selected translation below it in one WhatsApp message. Existing patients default to English; future messages read the current saved preference. See [functions/BILINGUAL_TEMPLATES.md](functions/BILINGUAL_TEMPLATES.md) for template submission, configuration and deployment.
