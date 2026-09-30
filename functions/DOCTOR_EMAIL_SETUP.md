# Next-day doctor email digest

Clinic settings can enable a daily digest and choose its send time (default **6:00 PM**, in the clinic timezone). Each doctor needs an email address. The email lists that doctor's scheduled appointments for the next calendar day, sorted by time, with patient names and visit durations. It also sends a zero-count email when the doctor has no appointments. The list is a snapshot at send time; later changes remain visible in the calendar.

The Firebase scheduler checks every five minutes and sends once per doctor and appointment date. Delivery records are in `doctorDigestDeliveries`; the clinic can see accepted, failed, and uncertain outcomes in Clinic settings. Gmail accepting an SMTP message does not prove inbox delivery. An uncertain request is not retried automatically because Gmail may have already accepted it.

Clinic settings also has **Send tomorrow’s digest now**. It immediately sends a fresh next-day snapshot to every doctor with a valid email, including a zero-count digest when a doctor has no visits. It works independently of the daily schedule and can send again after the scheduled email. Manual attempts appear in the same activity list and are marked as manual. The action requires a signed-in admin or a user assigned to that clinic. Each click uses a unique request ID so network retries of the same request do not duplicate emails.

## Gmail SMTP setup

This implementation sends through `smtp.gmail.com` on port 465 with TLS. Turn on [Google 2-Step Verification](https://support.google.com/accounts/answer/185833?hl=en) for the sending account and generate an app password. Set the Firebase Secret Manager secret `DOCTOR_EMAIL_CONFIG` to a JSON object:

```json
{
  "enabled": true,
  "user": "relapseclinic0@gmail.com",
  "appPassword": "YOUR_16_CHARACTER_GOOGLE_APP_PASSWORD"
}
```

Keep the app password only in Secret Manager. Deploy the updated Cloud Functions and Firestore rules, then add each doctor's email and enable the digest in Clinic settings. With the secret absent or `enabled: false`, no doctor emails are sent. The existing `MSG91_CONFIG` still controls patient WhatsApp reminders independently. The Resend key is not used for doctor digests.

On Windows, run `powershell -ExecutionPolicy Bypass -File functions/set-doctor-gmail-secret.ps1` from the `clinicloop` directory to enter the app password in a masked local prompt. The script sends the resulting JSON directly to Firebase Secret Manager. After changing the secret, redeploy the scheduled Cloud Function so it binds the new version.

The email includes patient names and appointment times. Use doctor-controlled inboxes and a sending setup appropriate for the clinic's privacy requirements.
