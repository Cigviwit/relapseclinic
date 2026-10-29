# MSG91 appointment messaging

The two **Utility** WhatsApp templates are approved and enabled on the Relapse sender (`917276221423`) in English. Keep the numbered placeholders in this order.

## Appointment template

Suggested name: `clinic_appointment_v1`

```text
Hello {{1}}, your appointment at {{2}} with {{3}} is scheduled for {{4}} at {{5}}. If you need to reschedule, please call {{6}}. Thank you.
```

Variables: patient name, clinic name, doctor name, appointment date, appointment time, clinic phone. The same approved text is sent when the visit is booked or rescheduled, two days before, and on the appointment day.

## Missed appointment template

Suggested name: `clinic_missed_visit_v1`

```text
Hello {{1}}, we missed you for your appointment with {{2}} at {{3}} on {{4}}. To arrange another visit, please call {{5}}. If you have already rescheduled, you can ignore this message.
```

Variables: patient name, doctor name, clinic name, missed appointment date, clinic phone. The app sends the first missed-visit message immediately when staff marks the visit **Missed**, even if that happens days after the appointment. This replaces the next-day message. The second follow-up is due at 8 AM seven days after the original appointment, if that date is still ahead. A later scheduled or completed visit suppresses these messages.

## Server setup

Use the integrated WhatsApp number, template namespace, approved template names, and MSG91 auth key from the same MSG91 account. Set the Firebase Secret Manager secret `MSG91_CONFIG` to one JSON object:

```json
{
  "enabled": true,
  "integratedNumber": "917276221423",
  "namespace": "8e0e16f7_84c8_48cd_afcd_84c4d6753ed3",
  "language": "en",
  "appointmentTemplate": "clinic_appointment_v1",
  "missedTemplate": "clinic_missed_visit_v1"
}
```

The deployed secret also includes an `authKey`, stored only in Firebase Secret Manager. To rotate it, set a new `MSG91_CONFIG` version through a hidden prompt or stdin, then redeploy both functions to bind that version. Never put the auth key in source, a command argument, or a browser URL. The scheduler runs every five minutes and sends within the 8:00–8:14 AM window in each clinic's local timezone. A Firestore delivery record claims each message once. Failed and uncertain requests appear in the website's Appointment messages view. `accepted` means MSG91 accepted the API request, not that WhatsApp delivered it.

The browser never receives the auth key.

## Patient message languages

For English-first Marathi and Hindi messages, follow [BILINGUAL_TEMPLATES.md](BILINGUAL_TEMPLATES.md). It includes all four additional template bodies, sample placeholder values and the `bilingualTemplates` secret configuration. English-only patients continue to use the two existing templates.

## Prescription template (PDF)

Prescriptions are sent from the clinic's WhatsApp number as a PDF attachment. WhatsApp only lets a business start a conversation with an approved template, and template variables cannot contain line breaks, so the prescription itself travels as the PDF and the template carries a short note.

Create a **Utility** template in MSG91 → WhatsApp → Templates:

- Name: `clinic_prescription_v1`
- Language: English
- Header: **Document** (upload any sample PDF for review)
- Body:

```text
Hello {{1}}, your prescription from {{2}} at {{3}} dated {{4}} is attached. For any questions, please call {{5}}.
```

Variables: patient name, doctor name, clinic name, prescription date, clinic phone. Sample values for review: `Aarav Sharma`, `Dr. Priya Nair`, `Greenleaf Dental Care`, `29 October 2026`, `+918000000001`.

After Meta approves it, add `"prescriptionTemplate": "clinic_prescription_v1"` to the `MSG91_CONFIG` secret (keep every existing field, including `authKey`) and redeploy the functions:

```sh
npx firebase-tools functions:secrets:set MSG91_CONFIG --project relapse-clinic-db
npx firebase-tools deploy --only functions,firestore:rules --project relapse-clinic-db
```

The first command prompts for the whole JSON value without echoing it. Optional: `"prescriptionLanguage"` if the template is approved under a code other than `en`.

How it works: the browser renders the prescription pad (the same one that prints) to a PDF and calls `sendPrescription`. The function checks clinic access and WhatsApp consent, records a `prescription` row in `messageDeliveries` (shown on the Messages page), stores the PDF in `prescriptionFiles` (no client access), and asks MSG91 to send the template with a document link served by `prescriptionFile`. That link carries a random 48-character token and stops working after 30 days. Until the template is configured, staff can still use **My WhatsApp** in the builder, which opens WhatsApp on that computer with the prescription as text.
