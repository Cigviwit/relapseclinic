const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { addDays, localNow, slotFor, deliveryId, bodyValues, msg91Payload, hasReplacementAppointment } = require('./reminder-logic');

initializeApp();
const db = getFirestore();
const msg91Config = defineSecret('MSG91_CONFIG');
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

async function sendAppointment(appointmentId, slot, expectedFingerprint) {
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
  if (slot !== 'booked' && slotFor(appointment, localNow(clinic.timezone, new Date())) !== slot) return;
  if (slot === 'two_days_before' || slot === 'appointment_day') {
    const changed = localNow(clinic.timezone, appointmentSnap.updateTime.toDate());
    const current = localNow(clinic.timezone, new Date());
    if (changed.date === current.date && changed.time >= '08:00') return;
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

exports.sendBookingConfirmation = onDocumentWritten({
  document: 'appointments/{appointmentId}', region, secrets: [msg91Config],
}, async (event) => {
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  if (!after || after.status !== 'scheduled') return;
  if (before?.status === 'scheduled' && appointmentFingerprint(before) === appointmentFingerprint(after)) return;
  await sendAppointment(event.params.appointmentId, 'booked', appointmentFingerprint(after));
});

exports.sendScheduledReminders = onSchedule({
  schedule: 'every 5 minutes', timeZone: 'UTC', region, secrets: [msg91Config],
  timeoutSeconds: 540, maxInstances: 1,
}, async () => {
  if (!config()) return;
  const clinics = await db.collection('clinics').get();
  for (const clinicDoc of clinics.docs) {
    const clinic = clinicDoc.data();
    let local;
    try { local = localNow(clinic.timezone, new Date()); }
    catch (error) { logger.error('Invalid clinic timezone', { clinicId: clinicDoc.id, error: String(error) }); continue; }
    if (local.time < '08:00' || local.time >= '08:15') continue;
    const candidateDates = [local.date, addDays(local.date, 2), addDays(local.date, -1), addDays(local.date, -7)];
    const appointments = await db.collection('appointments')
      .where('clinicId', '==', clinicDoc.id).where('date', 'in', candidateDates).get();
    for (const appointmentDoc of appointments.docs) {
      const appointment = appointmentDoc.data();
      const slot = slotFor(appointment, local);
      if (!slot) continue;
      try { await sendAppointment(appointmentDoc.id, slot); }
      catch (error) { logger.error('Reminder processing failed', { appointmentId: appointmentDoc.id, slot, error: String(error) }); }
    }
  }
});
