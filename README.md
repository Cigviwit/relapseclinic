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

- `app/clinic-app.tsx`: app shell — auth, live Firestore subscriptions, navigation (URL hash), keyboard shortcuts, dialogs. Less-used screens are lazy-loaded.
- `components/workspace/`: Today (front-desk queue), Schedule (doctor day grid + week), Patients, Prescriptions, Messages, Impact, Settings, appointment drawer and the Ctrl+K command palette.
- `components/prescription/prescription-builder.tsx`: prescription builder with live pad / WhatsApp preview, print and send.
- `components/clinic-forms.tsx`, `components/patient-picker.tsx`, `components/kit.tsx`: forms, type-to-search patient picker with inline “new patient”, and the small native-element UI kit (`<dialog>`, `<select>`).
- `lib/clinic.ts`: typed records, validation, and timezone helpers. `lib/schedule.ts`: free-slot and day-queue logic. `lib/prescription.ts`: prescription model, dosage text (English/Hindi/Marathi) and WhatsApp formatting.
- `tests/clinic.test.mjs`: booking collisions, working hours, clinic isolation, consent, timezones, phone validation, persistence, free slots and prescription formatting.

## Front desk workflow

**Today** is the home screen: today’s queue with a “now” line, one-click Seen / Missed / Rx on every row, past visits still needing an outcome, who is up next and tomorrow’s list. Shortcuts: `N` new appointment, `R` prescription, `P` add patient, `/` or `Ctrl+K` search. Booking shows the doctor’s free slots for the chosen length; a new patient can be added inline from the search box.

Try the UI without signing in at `http://localhost:5173/?demo` (localhost only; sample data in memory, nothing is saved or sent).

## Prescriptions

Digital prescriptions are off for every clinic by default. Only the administrator can turn them on, per clinic, in **Settings → Digital prescriptions** (`prescriptionsEnabled` on the clinic; `firestore.rules` and `sendPrescription` enforce it). While off, the clinic sees no prescription screens or shortcuts; records already written are kept and reappear if it is turned back on.

Write a prescription from Today’s queue, an appointment, a patient’s page or with `R`. **Settings → Prescription pad** chooses the clinic’s specialty (Dental, General physician, Pediatrics, Dermatology), layout (Classic, Colour band, Minimal), colour, A5/A4 paper, tagline and footer, plus each doctor’s qualification, registration number and own pad specialty. The specialty decides which sections the builder shows and its quick-pick lists (`lib/rx-templates.ts`).

The **Dental** pad adds medical history and allergies, an FDI tooth chart (adult and milk teeth), clinical findings, diagnosis, treatment done today and treatment advised, with dental medicines and post-procedure advice. The selected teeth are drawn on the printed pad.

**Send on WhatsApp** saves the prescription, renders the pad to a PDF in the browser (`lib/pdf.ts`) and sends it from the clinic’s MSG91 WhatsApp number (`sendPrescription` function; see [functions/MSG91_SETUP.md](functions/MSG91_SETUP.md#prescription-template-pdf) for the template to get approved). **My WhatsApp** is the fallback: it opens WhatsApp on the computer with the prescription as text. **PDF** downloads the same file; **Print** prints it. For Hindi or Marathi patients each dosage line is repeated in their language. Shortcuts: `Ctrl+S` save, `Ctrl+Enter` send, `Ctrl+P` print.

Prescriptions are stored in the `prescriptions` Firestore collection; sent PDFs in `prescriptionFiles` (server only).

## Patient records

A patient's page shows allergies first, then personal details, medical background and one history combining visits, prescriptions and notes. Records work whether or not digital prescriptions are on. New prescriptions start with the patient's age, sex and history, and show their allergies; this is a reminder, and the app does not check medicines against allergies.

- `patients`: name, phone, consent and language only. Every open screen syncs this whole collection, and the messaging functions read it, so medical details stay out of it.
- `patientRecords/{patientId}`: what is true of the patient now, loaded only while that patient is open. `version` must rise by exactly 1 on each save, so `firestore.rules` refuses an edit based on an out-of-date copy.
- `patientNotes`: visit notes and vitals. They cannot be edited or deleted; a correction is a new note whose `corrects` names the old one. `createdAt` and `createdBy` are enforced by the rules.
- `patientRecordAudit`: what changed in each record save, written only by the `recordPatientRecordChange` function.

These three collections are private to the clinic: the rules use `clinicMember`, so the administrator account cannot read or write them, and the app shows a notice instead. Prescriptions are separate and remain visible to the administrator, including any history copied onto them.

Allergy status is `unknown`, `none` or `known`, because an empty list does not tell a doctor that someone asked. A clinic shares one login, so `createdBy` and `updatedBy` identify the clinic account and a note's `doctorId` is chosen by whoever wrote it.

Deploy the rules before the website, or patient pages will show “could not be loaded” for medical details: `npx firebase-tools deploy --only firestore:rules,functions:recordPatientRecordChange --project relapse-clinic-db`.

## Billing

Billing is off for every clinic by default. Only the administrator can turn it on, per clinic, in **Settings → Billing** (`billingEnabled`, enforced by `firestore.rules`). The administrator cannot read a clinic's bills.

ClinicLoop records money; it never moves it. There is no payment gateway: patients pay by cash, card machine or the clinic's own UPI, and staff record what happened. The UPI QR uses the standard `upi://pay` link with the amount filled in, so nothing reports back; staff check the clinic's soundbox or bank app before recording it.

Make a bill from Today's queue, an appointment, a patient's page or with `B`. **Settings → Billing** holds the fee list, the clinic's UPI ID and optional GST details. The logic lives in `lib/billing.ts`:

- **Bills are never edited or deleted.** A wrong bill is voided with a reason. Money paid on it becomes patient credit.
- **Ledger entries are never edited or deleted.** A wrong entry is corrected by a new reversal dated the day of the correction. A refund records that money went back; staff still return it themselves.
- **Balances are calculated, not stored.** Money marked for a bill goes to that bill; advances and overpayments pay the oldest open bills, and the rest is credit.
- **Closing a day is permanent.** Billing → Daily closing stores the totals and the cash count, and the rules refuse new entries on that date. Closing needs a live connection.
- **Bill numbers come from the server.** The `assignBillNumber` function gives each bill the next number once it syncs (`2026-27/00001`, per clinic, restarting each financial year). Until then a bill shows a provisional label.

"Collected by" is a typed name until staff have their own logins. Tests: `node --experimental-strip-types --test tests/billing.test.mjs`.

## Impact dashboard

The **Impact** page proves the value of the follow-ups: messages sent (accepted by MSG91), missed visits followed up, missed visits rebooked, and estimated recovered visits (a follow-up was sent and the patient has a later booked or completed visit). Enter an average visit fee to estimate recovered revenue. Logic lives in `lib/impact.ts`.

## Accounts and access

Clinic registration is closed. The designated Firebase admin account signs in through **Admin login**, creates each clinic and its own email/password account, and can view every clinic. A clinic account can only query its linked clinic and its own patients, appointments, and reminders. `firestore.rules` enforces this on the backend; deploy changes with `npx firebase-tools deploy --only firestore:rules --project relapse-clinic-db`.

Daily opening/closing hours apply to every day. Appointments use clinic-local dates and times; changing timezone preserves their wall-clock times. The website records appointments and consent in Firestore. Firebase Cloud Functions send MSG91 booking confirmations and check reminders every five minutes. Marking a past visit Missed sends the first missed-visit message immediately; it replaces the next-day follow-up. The second follow-up is due at 8 AM seven days after the original appointment if that date has not passed. A scheduled recovery check catches recently marked missed visits whose event was not processed.

## WhatsApp production setup

See [functions/MSG91_SETUP.md](functions/MSG91_SETUP.md) for the exact template copy, secret structure, and deploy steps. The older manual reminder records remain visible in patient history as drafts; they do not trigger WhatsApp delivery.

Clinics can also enable a next-day **email digest for each doctor** in Clinic settings. It sends at the clinic's chosen local time and includes tomorrow's appointment count, patient names, times, and durations. See [functions/DOCTOR_EMAIL_SETUP.md](functions/DOCTOR_EMAIL_SETUP.md) for email provider and deployment setup.

## Patient message language

Add/edit patient includes English only, English + Marathi and English + Hindi. Each approved bilingual template sends English first and the selected translation below it in one WhatsApp message. Existing patients default to English; future messages read the current saved preference. See [functions/BILINGUAL_TEMPLATES.md](functions/BILINGUAL_TEMPLATES.md) for template submission, configuration and deployment.
