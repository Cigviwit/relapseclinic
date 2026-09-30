const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { addDays, localNow, slotFor, missedDueNow, deliveryId, bodyValues, msg91Payload, hasReplacementAppointment, digestDue, doctorDigest, doctorDigestId, manualDoctorDigestId } = require('./reminder-logic');

initializeApp();
const db = getFirestore();
const msg91Config = defineSecret('MSG91_CONFIG');
const doctorEmailConfig = defineSecret('DOCTOR_EMAIL_CONFIG');
const region = 'asia-south1';

function config() {
  const value = JSON.parse(msg91Config.value());
  if (value.enabled !== true) return null;
  for (const field of ['authKey', 'integratedNumber', 'namespace', 'appointmentTemplate', 'missedTemplate']) {
    if (!value[field] || typeof value[field] !== 'string') throw new Error(`MSG91_CONFIG is missing ${field}`);
  }
  return value;
}

function appointmentFingerprint(a) {
  return JSON.stringify([a.clinicId, a.patientId, a.doctorId, a.date, a.time]);
}

async function sendAppointment(appointmentId, slot, expectedFingerprint, immediateMissed = false) {
  const settings = config();
  if (!settings) return;
  const appointmentSnap = await db.doc(`appointments/${appointmentId}`).get();
  if (!appointmentSnap.exists) return;
  const appointment = appointmentSnap.data();
  if (expectedFingerprint && appointmentFingerprint(appointment) !== expectedFingerprint) return;
  if (slot === 'booked' && appointment.status !== 'scheduled') return;
  if (slot.startsWith('missed_') && appointment.status !== 'missed') return;
  if ((slot === 'two_days_before' || slot === 'appointment_day') && appointment.status !== 'scheduled') return;

  const [clinicSnap, patientSnap] = await Promise.all([
    db.doc(`clinics/${appointment.clinicId}`).get(),
    db.doc(`patients/${appointment.patientId}`).get(),
  ]);
  if (!clinicSnap.exists || !patientSnap.exists) return;
  const clinic = clinicSnap.data();
  const patient = patientSnap.data();
  if (patient.clinicId !== appointment.clinicId || !patient.consent) return;
  if (slot.startsWith('missed_')) {
    const otherVisits = await db.collection('appointments').where('patientId', '==', appointment.patientId).get();
    if (hasReplacementAppointment({ ...appointment, id: appointmentId },
      otherVisits.docs.map((item) => ({ ...item.data(), id: item.id })))) return;
  }
  const local = localNow(clinic.timezone, new Date());
  if (immediateMissed) {
    if (slot !== 'missed_day_one' || !missedDueNow(appointment, local)) return;
  } else if (slot !== 'booked' && slotFor(appointment, local) !== slot) return;
  if (slot === 'two_days_before' || slot === 'appointment_day') {
    const changed = localNow(clinic.timezone, appointmentSnap.updateTime.toDate());
    const current = localNow(clinic.timezone, new Date());
    if (changed.date === current.date && changed.time >= '08:00') return;
  }
  if (slot === 'missed_day_seven') {
    const firstId = deliveryId({ ...appointment, id: appointmentId }, 'missed_day_one');
    const first = await db.doc(`messageDeliveries/${firstId}`).get();
    const firstAt = first.data()?.createdAt?.toMillis();
    if (firstAt && Date.now() - firstAt < 24 * 60 * 60 * 1000) return;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(patient.phone)) throw new Error('Invalid patient phone');

  const id = deliveryId({ ...appointment, id: appointmentId }, slot);
  const ref = db.doc(`messageDeliveries/${id}`);
  const claimed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    tx.create(ref, {
      clinicId: appointment.clinicId, appointmentId, patientId: appointment.patientId,
      slot, appointmentDate: appointment.date, appointmentTime: appointment.time,
      status: 'sending', createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return;

  const templateName = slot.startsWith('missed_') ? settings.missedTemplate : settings.appointmentTemplate;
  try {
    const payload = msg91Payload(settings, patient.phone, templateName,
      bodyValues(appointment, patient, clinic, slot), id);
    const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
      method: 'POST',
      headers: { authkey: settings.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { result = { message: raw.slice(0, 300) }; }
    if (!response.ok || result?.type === 'error' || result?.status === 'error' || result?.success === false) {
      await ref.update({ status: 'failed', httpStatus: response.status,
        error: String(result?.message || result?.error || 'MSG91 rejected the message').slice(0, 300),
        updatedAt: FieldValue.serverTimestamp() });
      logger.error('MSG91 rejected reminder', { deliveryId: id, httpStatus: response.status });
      return;
    }
    await ref.update({ status: 'accepted', providerMessageId: String(result?.message_id || result?.request_id || ''),
      updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    // A timeout may happen after MSG91 accepted the request. Never retry it blindly.
    await ref.update({ status: 'unknown', error: String(error.message).slice(0, 300),
      updatedAt: FieldValue.serverTimestamp() });
    logger.error('MSG91 reminder outcome unknown', { deliveryId: id, error: String(error.message) });
  }
}

function emailConfig() {
  const raw = doctorEmailConfig.value();
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (value.enabled !== true) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.user || '') || !value.appPassword) {
    throw new Error('DOCTOR_EMAIL_CONFIG needs a Gmail user and appPassword');
  }
  return value;
}

async function sendDoctorDigest(clinicId, doctorId, options = {}) {
  const settings = emailConfig();
  if (!settings) return 'skipped';
  const clinicSnap = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicSnap.exists) return 'skipped';
  const clinic = clinicSnap.data();
  const local = localNow(clinic.timezone, new Date());
  if (!options.manual && !digestDue(clinic, local)) return 'skipped';
  const doctor = clinic.doctors.find((item) => item.id === doctorId);
  if (!doctor?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctor.email)) return 'skipped';
  const date = addDays(local.date, 1);
  const appointments = await db.collection('appointments')
    .where('clinicId', '==', clinicId).where('date', '==', date).get();
  const visits = appointments.docs.map((item) => ({ ...item.data(), id: item.id }));
  const patientIds = [...new Set(visits.filter((a) => a.doctorId === doctorId && a.status === 'scheduled').map((a) => a.patientId))];
  const patientDocs = await Promise.all(patientIds.map((id) => db.doc(`patients/${id}`).get()));
  const patients = new Map(patientDocs.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]));
  const digest = doctorDigest(doctor, clinic, date, visits, patients);
  const id = options.manual
    ? manualDoctorDigestId(clinicId, doctorId, date, options.requestId)
    : doctorDigestId(clinicId, doctorId, date);
  const ref = db.doc(`doctorDigestDeliveries/${id}`);
  const claimed = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    tx.create(ref, { clinicId, doctorId, date, count: digest.count, status: 'sending',
      mode: options.manual ? 'manual' : 'scheduled',
      ...(options.manual ? { requestedBy: options.requestedBy, requestId: options.requestId } : {}),
      createdAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) return 'already_sent';
  try {
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: settings.user, pass: settings.appPassword },
      connectionTimeout: 20000, greetingTimeout: 10000, socketTimeout: 30000,
    });
    const result = await transport.sendMail({
      from: { name: 'RelapseClinic', address: settings.user },
      to: doctor.email, subject: digest.subject, text: digest.text,
    });
    if (!result.accepted?.some((address) => address.toLowerCase() === doctor.email.toLowerCase())) {
      await ref.update({ status: 'failed', error: 'Gmail did not accept the recipient',
        updatedAt: FieldValue.serverTimestamp() });
      return 'failed';
    }
    await ref.update({ status: 'accepted', providerMessageId: String(result.messageId || ''),
      updatedAt: FieldValue.serverTimestamp() });
    return 'accepted';
  } catch (error) {
    // An SMTP connection can fail after Gmail accepts the message. Do not retry blindly.
    await ref.update({ status: 'unknown', error: String(error.message).slice(0, 300),
      updatedAt: FieldValue.serverTimestamp() });
    logger.error('Doctor digest outcome unknown', { clinicId, doctorId, date, error: String(error.message) });
    return 'unknown';
  }
}

exports.sendDoctorDigestNow = onCall({
  region, secrets: [doctorEmailConfig], timeoutSeconds: 540, maxInstances: 2,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to send doctor digests.');
  const { clinicId, requestId } = request.data || {};
  if (typeof clinicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinicId) ||
      typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpsError('invalid-argument', 'A valid clinic and request ID are required.');
  }
  if (uid !== 'zfXlb9MEMQSQDBNYOk5RJFDJcZo1') {
    const profile = await db.doc(`users/${uid}`).get();
    if (!profile.exists || profile.data().clinicId !== clinicId) {
      throw new HttpsError('permission-denied', 'You cannot send digests for this clinic.');
    }
  }
  const clinicSnap = await db.doc(`clinics/${clinicId}`).get();
  if (!clinicSnap.exists) throw new HttpsError('not-found', 'Clinic not found.');
  const doctors = clinicSnap.data().doctors;
  if (!Array.isArray(doctors) || doctors.length === 0) {
    throw new HttpsError('failed-precondition', 'Add a doctor before sending a digest.');
  }
  if (doctors.some((doctor) => !doctor.id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctor.email || ''))) {
    throw new HttpsError('failed-precondition', 'Each doctor needs a valid email address.');
  }
  if (!emailConfig()) throw new HttpsError('failed-precondition', 'Doctor email sending is not configured.');
  const results = { accepted: 0, failed: 0, unknown: 0, already_sent: 0 };
  for (const doctor of doctors) {
    try {
      const status = await sendDoctorDigest(clinicId, doctor.id, { manual: true, requestId, requestedBy: uid });
      if (status in results) results[status] += 1;
    } catch (error) {
      logger.error('Manual doctor digest failed', { clinicId, doctorId: doctor.id, error: String(error) });
      results.failed += 1;
    }
  }
  return { date: addDays(localNow(clinicSnap.data().timezone, new Date()).date, 1), ...results };
});

exports.sendBookingConfirmation = onDocumentWritten({
  document: 'appointments/{appointmentId}', region, secrets: [msg91Config],
}, async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  if (!after || after.status !== 'scheduled') return;
  if (before?.status === 'scheduled' && appointmentFingerprint(before) === appointmentFingerprint(after)) return;
  await sendAppointment(event.params.appointmentId, 'booked', appointmentFingerprint(after));
});

exports.sendMissedVisit = onDocumentWritten({
  document: 'appointments/{appointmentId}', region, secrets: [msg91Config],
}, async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  if (!after || after.status !== 'missed' || before?.status === 'missed') return;
  await sendAppointment(event.params.appointmentId, 'missed_day_one', appointmentFingerprint(after), true);
});

exports.sendScheduledReminders = onSchedule({
  schedule: 'every 5 minutes', timeZone: 'UTC', region, secrets: [msg91Config, doctorEmailConfig],
  timeoutSeconds: 540, maxInstances: 1,
}, async () => {
  const patientMessagingEnabled = !!config();
  const doctorEmailEnabled = !!emailConfig();
  if (!patientMessagingEnabled && !doctorEmailEnabled) return;
  const clinics = await db.collection('clinics').get();
  for (const clinicDoc of clinics.docs) {
    const clinic = clinicDoc.data();
    let local;
    try { local = localNow(clinic.timezone, new Date()); }
    catch (error) { logger.error('Invalid clinic timezone', { clinicId: clinicDoc.id, error: String(error) }); continue; }
    const openingWindow = local.time >= '08:00' && local.time < '08:15';
    const candidateDates = Array.from({ length: 8 }, (_, daysAgo) => addDays(local.date, -daysAgo));
    candidateDates.push(addDays(local.date, 2));
    if (patientMessagingEnabled) {
      const appointments = await db.collection('appointments')
        .where('clinicId', '==', clinicDoc.id).where('date', 'in', candidateDates).get();
      for (const appointmentDoc of appointments.docs) {
        const appointment = appointmentDoc.data();
        // Catch a recently marked Missed visit if its Firestore event was not delivered.
        // The same delivery ID makes this safe alongside the event trigger and day-one job.
        const ageMs = Date.now() - appointmentDoc.updateTime.toMillis();
        if (missedDueNow(appointment, local) && ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000) {
          try { await sendAppointment(appointmentDoc.id, 'missed_day_one', undefined, true); }
          catch (error) { logger.error('Immediate missed-visit recovery failed', { appointmentId: appointmentDoc.id, error: String(error) }); }
        }
        if (!openingWindow) continue;
        const slot = slotFor(appointment, local);
        if (!slot) continue;
        try { await sendAppointment(appointmentDoc.id, slot); }
        catch (error) { logger.error('Reminder processing failed', { appointmentId: appointmentDoc.id, slot, error: String(error) }); }
      }
    }
    if (doctorEmailEnabled && digestDue(clinic, local)) {
      for (const doctor of clinic.doctors) {
        try { await sendDoctorDigest(clinicDoc.id, doctor.id); }
        catch (error) { logger.error('Doctor digest processing failed', { clinicId: clinicDoc.id, doctorId: doctor.id, error: String(error) }); }
      }
    }
  }
});
