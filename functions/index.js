const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { financialYear, billNumber } = require('./bill-number');
const { ServiceError, resolveActor } = require('./access');
const { bookAppointment, bookWalkIn } = require('./booking-logic');
const { closeDay } = require('./closing-logic');
const { AUDITED, auditEntry } = require('./audit-logic');
const { createStaff, updateStaff, staffSetupLink, createClinic } = require('./staff-logic');
const { pdfPath, isFresh, purgeExpiredFiles } = require('./file-retention');
const { recordChanges, addDays, localNow, slotFor, missedDueNow, deliveryId, appointmentMessage, msg91Payload, prescriptionValues, prescriptionFileName, prescriptionDeliveryId, hasReplacementAppointment, digestDue, doctorDigest, doctorDigestId, manualDoctorDigestId } = require('./reminder-logic');

initializeApp();
const db = getFirestore();
const msg91Config = defineSecret('MSG91_CONFIG');
const doctorEmailConfig = defineSecret('DOCTOR_EMAIL_CONFIG');
const region = 'asia-south1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF_BYTES = 950 * 1024;

/** Turns a refusal from the shared logic into the error the browser shows. */
const callable = (handler) => async (request) => {
  try { return await handler(request); }
  catch (error) {
    if (error instanceof ServiceError) throw new HttpsError(error.code, error.message);
    throw error;
  }
};

async function postToMsg91(settings, payload) {
  const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/', {
    method: 'POST',
    headers: { authkey: settings.authKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); } catch { result = { message: raw.slice(0, 300) }; }
  const rejected = !response.ok || result?.type === 'error' || result?.status === 'error' || result?.success === false;
  return { response, result, rejected };
}

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
  // Someone standing at the desk needs no booking confirmation or reminder.
  if (appointment.walkIn && !slot.startsWith('missed_')) return;
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

  let message;
  try {
    message = appointmentMessage(settings, appointment, patient, clinic, slot);
  } catch (error) {
    await ref.update({ status: 'failed', error: String(error.message).slice(0, 300),
      patientLanguage: patient.language || 'en', updatedAt: FieldValue.serverTimestamp() });
    logger.error('Appointment message template configuration failed', { deliveryId: id });
    return;
  }
  try {
    await ref.update({ patientLanguage: message.preference, templateName: message.templateName,
      templateLanguage: message.language });
    const payload = msg91Payload({ ...settings, language: message.language }, patient.phone,
      message.templateName, message.values, id);
    const { response, result, rejected } = await postToMsg91(settings, payload);
    if (rejected) {
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
  const { clinicId, requestId } = request.data || {};
  if (typeof clinicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinicId) ||
      typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpsError('invalid-argument', 'A valid clinic and request ID are required.');
  }
  await callable(() => resolveActor(db, request.auth, clinicId, ['owner', 'doctor', 'frontdesk', 'platform'], 'send digests'))();
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

// Triggers can fire more than once, so the id comes from the version and a retry overwrites itself.
exports.recordPatientRecordChange = onDocumentWritten({
  document: 'patientRecords/{patientId}', region,
}, async (event) => {
  const after = event.data?.after?.data();
  if (!after) return;
  const changes = recordChanges(event.data?.before?.data(), after);
  if (!changes.length) return;
  const id = `${event.params.patientId}_${after.version}`;
  await db.doc(`patientRecordAudit/${id}`).set({ id, clinicId: after.clinicId, patientId: event.params.patientId, version: after.version, changes, changedAt: after.updatedAt, changedBy: after.updatedBy });
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

// Sends a prescription PDF from the clinic's WhatsApp number. The browser renders the
// pad to a PDF; it is stored here and MSG91 fetches it through prescriptionFile.
exports.sendPrescription = onCall({
  region, secrets: [msg91Config], timeoutSeconds: 60, maxInstances: 5, memory: '512MiB',
}, async (request) => {
  const { prescriptionId, pdf, fileName, requestId } = request.data || {};
  if (typeof prescriptionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(prescriptionId) ||
      typeof requestId !== 'string' || !UUID.test(requestId) || typeof pdf !== 'string') {
    throw new HttpsError('invalid-argument', 'A prescription, its PDF and a request ID are required.');
  }
  const bytes = Buffer.from(pdf, 'base64');
  if (bytes.length > MAX_PDF_BYTES) throw new HttpsError('invalid-argument', 'The prescription PDF is too large to send.');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpsError('invalid-argument', 'The attachment is not a PDF.');

  const rxSnap = await db.doc(`prescriptions/${prescriptionId}`).get();
  if (!rxSnap.exists) throw new HttpsError('not-found', 'Save the prescription before sending it.');
  const rx = rxSnap.data();
  await callable(() => resolveActor(db, request.auth, rx.clinicId, ['owner', 'doctor', 'frontdesk'], 'send prescriptions'))();
  // Prescriptions from before drafts existed have no status and count as final.
  if ((rx.status || 'final') !== 'final') throw new HttpsError('failed-precondition', 'Finalise the prescription before sending it.');
  const [clinicSnap, patientSnap] = await Promise.all([db.doc(`clinics/${rx.clinicId}`).get(), db.doc(`patients/${rx.patientId}`).get()]);
  if (!clinicSnap.exists || !patientSnap.exists || patientSnap.data().clinicId !== rx.clinicId) {
    throw new HttpsError('failed-precondition', 'The patient or clinic for this prescription no longer exists.');
  }
  const clinic = clinicSnap.data(), patient = patientSnap.data();
  if (clinic.prescriptionsEnabled !== true) throw new HttpsError('permission-denied', 'Digital prescriptions are not enabled for this clinic.');
  if (!patient.consent) throw new HttpsError('failed-precondition', `${patient.name} has not agreed to WhatsApp messages.`);
  if (!/^\+[1-9]\d{7,14}$/.test(patient.phone)) throw new HttpsError('failed-precondition', 'The patient phone number is not valid.');
  const settings = config();
  if (!settings) throw new HttpsError('failed-precondition', 'WhatsApp sending is turned off for this account.');
  if (typeof settings.prescriptionTemplate !== 'string' || !settings.prescriptionTemplate.trim()) {
    throw new HttpsError('failed-precondition', 'The WhatsApp prescription template is not set up yet. Use "My WhatsApp" for now.');
  }
  let values;
  try { values = prescriptionValues(rx, patient, clinic); }
  catch (error) { throw new HttpsError('failed-precondition', error.message); }

  const id = prescriptionDeliveryId(prescriptionId, requestId);
  const ref = db.doc(`messageDeliveries/${id}`);
  const token = randomBytes(24).toString('hex');
  const name = prescriptionFileName(fileName);
  const claimed = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.create(ref, {
      clinicId: rx.clinicId, appointmentId: rx.appointmentId || '', patientId: rx.patientId, prescriptionId,
      slot: 'prescription', appointmentDate: rx.date, appointmentTime: '', status: 'sending',
      patientLanguage: patient.language || 'en', templateName: settings.prescriptionTemplate,
      requestedBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.doc(`prescriptionFiles/${id}`), {
      clinicId: rx.clinicId, prescriptionId, token, fileName: name, path: pdfPath(id), createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return { status: (await ref.get()).data()?.status || 'unknown', error: 'This send was already requested.' };
  try {
    await getStorage().bucket().file(pdfPath(id)).save(bytes, { contentType: 'application/pdf', resumable: false });
  } catch (error) {
    await ref.update({ status: 'failed', error: 'The prescription PDF could not be stored.', updatedAt: FieldValue.serverTimestamp() });
    logger.error('Prescription PDF upload failed', { deliveryId: id, error: String(error.message) });
    return { status: 'failed', error: 'The prescription PDF could not be stored. Try again.' };
  }

  const project = process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;
  const link = `https://${region}-${project}.cloudfunctions.net/prescriptionFile?id=${id}&t=${token}`;
  try {
    const payload = msg91Payload({ ...settings, language: settings.prescriptionLanguage || 'en' }, patient.phone,
      settings.prescriptionTemplate, values, id, { type: 'document', value: link, filename: name });
    const { response, result, rejected } = await postToMsg91(settings, payload);
    if (rejected) {
      const error = String(result?.message || result?.error || 'MSG91 rejected the message').slice(0, 300);
      await ref.update({ status: 'failed', httpStatus: response.status, error, updatedAt: FieldValue.serverTimestamp() });
      logger.error('MSG91 rejected prescription', { deliveryId: id, httpStatus: response.status });
      return { status: 'failed', error };
    }
    await ref.update({ status: 'accepted', providerMessageId: String(result?.message_id || result?.request_id || ''),
      updatedAt: FieldValue.serverTimestamp() });
    await rxSnap.ref.update({ sentAt: new Date().toISOString() });
    return { status: 'accepted' };
  } catch (error) {
    // A timeout may happen after MSG91 accepted the request. Never retry it blindly.
    await ref.update({ status: 'unknown', error: String(error.message).slice(0, 300), updatedAt: FieldValue.serverTimestamp() });
    logger.error('MSG91 prescription outcome unknown', { deliveryId: id, error: String(error.message) });
    return { status: 'unknown', error: 'WhatsApp did not confirm in time. Check Messages before sending again.' };
  }
});

// Offline devices cannot safely pick the next bill number, so it is assigned here once the bill syncs.
// Triggers can fire more than once; the transaction skips a bill that already has its number.
exports.assignBillNumber = onDocumentCreated({ document: 'bills/{billId}', region }, async (event) => {
  const bill = event.data?.data();
  if (!bill || bill.number) return;
  const year = financialYear(bill.date);
  const counterRef = db.doc(`billCounters/${bill.clinicId}_${year}`);
  await db.runTransaction(async (tx) => {
    const [fresh, counter] = await Promise.all([tx.get(event.data.ref), tx.get(counterRef)]);
    if (!fresh.exists || fresh.data().number) return;
    const next = (counter.data()?.last || 0) + 1;
    tx.set(counterRef, { clinicId: bill.clinicId, year, last: next });
    tx.update(event.data.ref, { number: billNumber(bill.date, next) });
  });
});

// Serves a sent prescription PDF to MSG91/WhatsApp. The link carries a random token
// and stops working once the file's retention period ends.
exports.prescriptionFile = onRequest({ region, maxInstances: 5, invoker: 'public' }, async (req, res) => {
  const id = String(req.query.id || ''), token = String(req.query.t || '');
  if (req.method !== 'GET' || !/^rx_[0-9a-f]{32}$/.test(id) || !/^[0-9a-f]{48}$/.test(token)) { res.status(404).send('Not found'); return; }
  const snap = await db.doc(`prescriptionFiles/${id}`).get();
  const file = snap.data();
  const expected = Buffer.from(file?.token || '', 'utf8'), given = Buffer.from(token, 'utf8');
  const fresh = isFresh(file?.createdAt?.toMillis(), Date.now());
  if (!file || expected.length !== given.length || !timingSafeEqual(expected, given) || !fresh) { res.status(404).send('Not found'); return; }
  // Files sent before the move to Cloud Storage keep their bytes in the document until they expire.
  let pdf;
  try { pdf = file.path ? (await getStorage().bucket().file(file.path).download())[0] : Buffer.from(file.pdf); }
  catch (error) { logger.error('Prescription PDF could not be read', { id, error: String(error.message) }); res.status(404).send('Not found'); return; }
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${file.fileName}"`);
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('X-Robots-Tag', 'noindex');
  res.send(pdf);
});

exports.purgePrescriptionFiles = onSchedule({ schedule: 'every day 02:30', timeZone: 'Asia/Kolkata', region, timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const removed = await purgeExpiredFiles(db, getStorage().bucket(), Date.now());
  if (removed) logger.info('Removed expired prescription PDFs', { removed });
});

const callOptions = { region, maxInstances: 10 };
exports.bookAppointment = onCall(callOptions, callable((request) => bookAppointment(db, request.auth, request.data?.appointment)));
exports.bookWalkIn = onCall(callOptions, callable((request) => bookWalkIn(db, request.auth, request.data?.appointment)));
exports.closeDay = onCall(callOptions, callable((request) => closeDay(db, request.auth, request.data)));
exports.createStaff = onCall(callOptions, callable((request) => createStaff(db, getAuth(), request.auth, request.data)));
exports.updateStaff = onCall(callOptions, callable((request) => updateStaff(db, getAuth(), request.auth, request.data)));
exports.staffSetupLink = onCall(callOptions, callable((request) => staffSetupLink(db, getAuth(), request.auth, request.data)));
exports.createClinic = onCall(callOptions, callable((request) => createClinic(db, getAuth(), request.auth, request.data)));

/** A download of the clinic's data is recorded before the browser builds the file. */
exports.recordDataExport = onCall(callOptions, callable(async (request) => {
  const clinicId = request.data?.clinicId;
  if (typeof clinicId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(clinicId)) throw new ServiceError('invalid-argument', 'A valid clinic is required.');
  const actor = await resolveActor(db, request.auth, clinicId, ['owner'], 'export clinic data');
  await db.collection('auditLog').add({ clinicId, collection: 'clinics', docId: clinicId, action: 'export', fields: [], actorUid: actor.uid, actorName: actor.name, at: FieldValue.serverTimestamp() });
  return { ok: true };
}));

/**
 * Browser errors, so a problem at a clinic is visible without anyone reporting it. Cloud Logging groups these
 * in Error Reporting. The stack and message are all that is sent: no form values, patient ids or page contents.
 */
exports.reportClientError = onCall({ ...callOptions, maxInstances: 2 }, (request) => {
  if (!request.auth?.uid) return { ok: false };
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  logger.error(text(request.data?.message, 300) || 'Browser error', { source: 'browser', uid: request.auth.uid, stack: text(request.data?.stack, 3000), page: text(request.data?.page, 40), release: text(request.data?.release, 40) });
  return { ok: true };
});

// The activity log. Triggers can fire more than once, so the id comes from the event and a retry overwrites itself.
const actorNames = new Map();
async function actorName(uid) {
  if (uid === 'system') return 'System';
  if (!actorNames.has(uid)) {
    const profile = (await db.doc(`users/${uid}`).get()).data();
    if (actorNames.size > 500) actorNames.clear();
    actorNames.set(uid, profile?.name || profile?.email || 'Platform administrator');
  }
  return actorNames.get(uid);
}
for (const name of AUDITED) {
  exports[`audit_${name}`] = onDocumentWritten({ document: `${name}/{docId}`, region }, async (event) => {
    const entry = auditEntry(name, event.params.docId, event.data?.before?.data(), event.data?.after?.data());
    if (!entry) return;
    await db.doc(`auditLog/${event.id}`).set({ ...entry, actorName: await actorName(entry.actorUid), at: event.time ? new Date(event.time) : FieldValue.serverTimestamp() });
  });
}
