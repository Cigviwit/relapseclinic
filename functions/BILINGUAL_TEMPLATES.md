# English-first bilingual WhatsApp templates

The patient form offers **English only**, **English + Marathi**, and **English + Hindi**. Existing patients without a preference use English. Editing a preference affects subsequent messages; it does not resend previous messages. Consent is still required.

## Add the four templates in MSG91

1. In MSG91, choose **WhatsApp → Templates → Create Template**, using the same integrated sender as the existing English templates.
2. Create each template below with the proposed name and **Utility** category. Paste the entire body, including both paragraphs and the blank line between them. English must remain first. These are single messages, not two separate sends.
3. Choose Marathi (`mr`) or Hindi (`hi`) for the matching template. The four templates have been created on the Relapse sender (`917276221423`) and are in Meta review as of 11 October 2026. Enabled in MSG91 does not mean approved by Meta.
4. Provide sample values for all placeholders in their exact numbered order. Wait until each template is approved and enabled.
5. Copy the approved template name and **language code from its generated API example** into the secret configuration below. The saved patient preference (`en`, `mr`, `hi`) is separate from the provider template language code.
6. After approval, deploy the messaging functions, Firestore rules and website. The checked-in `bilingual-config.json` provides the exact submitted Marathi and Hindi template names and codes automatically. The existing English-only secret remains valid; optional `bilingualTemplates` overrides in that secret take precedence.

The server selects one approved bilingual template. Its English paragraph gets the original variables; its translated paragraph gets additional variables, a numeric DD/MM/YYYY date and 24-hour HH:mm time. Patient, doctor and clinic names remain as entered.

Reference: [MSG91 template creation guide](https://msg91.com/help/whatsapp/how-to-create-a-template-for-whatsapp).

## Placeholder samples

Appointment templates use 12 placeholders:

| Placeholder | Value | Sample |
| --- | --- | --- |
| 1, 7 | Patient name | Aarav Sharma |
| 2, 8 | Clinic name | Greenleaf Clinic |
| 3, 9 | Doctor name | Dr. Priya Nair |
| 4 | English appointment date | 10 October 2026 |
| 5 | English appointment time | 10:30 am |
| 6, 12 | Clinic contact | +919876543210 |
| 10 | Translated paragraph date | 10/10/2026 |
| 11 | Translated paragraph time | 10:30 |

Missed-visit templates use 10 placeholders:

| Placeholder | Value | Sample |
| --- | --- | --- |
| 1, 6 | Patient name | Aarav Sharma |
| 2, 8 | Doctor name | Dr. Priya Nair |
| 3, 7 | Clinic name | Greenleaf Clinic |
| 4 | English missed date | 10 October 2026 |
| 5, 10 | Clinic contact | +919876543210 |
| 9 | Translated paragraph missed date | 10/10/2026 |

## Bodies to copy

### Marathi — appointment

Name: `clinic_appointment_en_mr_v1`

```text
Hello {{1}}, your appointment at {{2}} with {{3}} is scheduled for {{4}} at {{5}}. If you need to reschedule, please call {{6}}. Thank you.

नमस्कार {{7}}, {{8}} येथे {{9}} यांच्यासोबत तुमची भेट {{10}} रोजी {{11}} वाजता ठरलेली आहे. भेटीची वेळ बदलायची असल्यास कृपया {{12}} वर फोन करा. धन्यवाद.
```

### Marathi — missed

Name: `clinic_missed_visit_en_mr_v1`

```text
Hello {{1}}, we missed you for your appointment with {{2}} at {{3}} on {{4}}. To arrange another visit, please call {{5}}. If you have already rescheduled, you can ignore this message.

नमस्कार {{6}}, {{7}} येथे {{8}} यांच्यासोबत {{9}} रोजी ठरलेल्या भेटीसाठी तुम्ही येऊ शकला नाहीत. दुसरी भेट ठरवण्यासाठी कृपया {{10}} वर फोन करा. तुम्ही आधीच नवीन भेट ठरवली असल्यास या संदेशाकडे दुर्लक्ष करा.
```

### Hindi — appointment

Name: `clinic_appointment_en_hi_v1`

```text
Hello {{1}}, your appointment at {{2}} with {{3}} is scheduled for {{4}} at {{5}}. If you need to reschedule, please call {{6}}. Thank you.

नमस्ते {{7}}, {{8}} में {{9}} के साथ आपकी मुलाकात {{10}} को {{11}} बजे तय है. समय बदलने के लिए कृपया {{12}} पर फोन करें. धन्यवाद.
```

### Hindi — missed

Name: `clinic_missed_visit_en_hi_v1`

```text
Hello {{1}}, we missed you for your appointment with {{2}} at {{3}} on {{4}}. To arrange another visit, please call {{5}}. If you have already rescheduled, you can ignore this message.

नमस्ते {{6}}, {{7}} में {{8}} के साथ {{9}} को तय मुलाकात के लिए आप नहीं आ सके. दूसरी मुलाकात तय करने के लिए कृपया {{10}} पर फोन करें. यदि आपने पहले ही नई मुलाकात तय कर ली है, तो इस संदेश को अनदेखा करें.
```

## Secret configuration

The following names and codes are built into `functions/bilingual-config.json` and match the generated MSG91 API examples. You only need to merge this object into `MSG91_CONFIG` if overriding those defaults. Preserve the existing auth key, sender, namespace and English template settings.

```json
{
  "bilingualTemplates": {
    "mr": {
      "language": "mr",
      "appointmentTemplate": "clinic_appointment_en_mr_v1",
      "missedTemplate": "clinic_missed_visit_en_mr_v1"
    },
    "hi": {
      "language": "hi",
      "appointmentTemplate": "clinic_appointment_en_hi_v1",
      "missedTemplate": "clinic_missed_visit_en_hi_v1"
    }
  }
}
```

The existing top-level `appointmentTemplate`, `missedTemplate`, and `language` still control English-only messages. No secret is included in website code.

If an explicit template override is incomplete, the delivery is recorded as **failed** with a configuration error before contacting MSG91. Staff can see it in Appointment messages. Existing delivery claims prevent automatic retries; correcting configuration does not replay failed historical messages. Configure approved templates before deploying the feature to production.

Deploy from `clinicloop` after all four templates are approved:

```sh
npx firebase-tools deploy --only firestore:rules,functions --project relapse-clinic-db
npm run build
```

Deploy the website through its existing hosting workflow after the build. `npm run build` alone does not publish it. No existing patient migration is needed. The four templates have been submitted to MSG91. Rules, functions and website remain undeployed pending template approval. The verified default routing requires no secret change.

The machine-readable copy in `functions/bilingual-templates.json` matches the bodies above. Updating local copy does not update an approved MSG91 template; submit the updated version and update the configured name instead.

## Integration verification

The translated missed-visit paragraph uses {{6}} patient, {{7}} clinic, {{8}} doctor, {{9}} date and {{10}} phone. Both the submitted templates and server values use this order. Appointment templates have 12 body variables and missed-visit templates have 10. Tests verify every booking/reminder slot, English-first formatting and language routing. No messages were sent to real patients during verification.
