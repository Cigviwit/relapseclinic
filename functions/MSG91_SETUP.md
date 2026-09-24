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

Variables: patient name, doctor name, clinic name, missed appointment date, clinic phone. The app sends this only after staff marks the visit **Missed**, at 8 AM one and seven days after the visit. A later scheduled or completed visit suppresses these messages.

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
