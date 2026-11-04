// Booking runs here, not in the browser, so two front desks cannot take the same slot.
const { FieldValue } = require('firebase-admin/firestore');
const { ServiceError, resolveActor, CLINIC_ROLES } = require('./access');
const { availabilityError } = require('./availability');

const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Why this booking cannot be made, or null. Mirrors validateAppointment in lib/clinic.ts, which gives the same answer before the form is sent. */
function bookingError(clinic, patient, a, others) {
  if (!clinic || !patient || patient.clinicId !== clinic.id || !clinic.doctors.some((d) => d.id === a.doctorId)) return 'Choose a patient and doctor from this clinic.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time) || !Number.isInteger(a.duration) || a.duration < 5 || a.duration > 240) return 'Enter a valid date, time, and duration from 5 to 240 minutes.';
  const start = minutes(a.time), end = start + a.duration;
  const unavailable = availabilityError(clinic, a.doctorId, a.date, a.time, a.duration);
  if (unavailable) return unavailable;
  const clash = others.some((b) => b.id !== a.id && b.clinicId === a.clinicId && b.doctorId === a.doctorId && b.date === a.date && b.status !== 'cancelled' && start < minutes(b.time) + b.duration && end > minutes(b.time));
  return clash ? 'This doctor already has an appointment at that time. Choose another slot.' : null;
}

function cleanAppointment(input) {
  const a = input || {};
  for (const field of ['id', 'clinicId', 'patientId', 'doctorId']) {
    if (typeof a[field] !== 'string' || !ID.test(a[field])) throw new ServiceError('invalid-argument', 'A valid appointment is required.');
  }
  if (typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 100) throw new ServiceError('invalid-argument', 'Enter the visit type.');
  if (typeof a.date !== 'string' || typeof a.time !== 'string') throw new ServiceError('invalid-argument', 'Enter a valid date and time.');
  return { id: a.id, clinicId: a.clinicId, patientId: a.patientId, doctorId: a.doctorId, date: a.date, time: a.time, duration: a.duration, reason: a.reason.trim(), status: 'scheduled' };
}

/** Creates or reschedules an appointment. The query inside the transaction means two simultaneous bookings cannot both pass the overlap check. */
async function bookAppointment(db, auth, input) {
  const a = cleanAppointment(input);
  const actor = await resolveActor(db, auth, a.clinicId, [...CLINIC_ROLES, 'platform'], 'book appointments');
  const ref = db.doc(`appointments/${a.id}`);
  const sameDay = db.collection('appointments').where('clinicId', '==', a.clinicId).where('doctorId', '==', a.doctorId).where('date', '==', a.date);
  await db.runTransaction(async (tx) => {
    const [clinicSnap, patientSnap, existing, others] = await Promise.all([tx.get(db.doc(`clinics/${a.clinicId}`)), tx.get(db.doc(`patients/${a.patientId}`)), tx.get(ref), tx.get(sameDay)]);
    if (existing.exists && (existing.data().clinicId !== a.clinicId || existing.data().status !== 'scheduled')) throw new ServiceError('failed-precondition', 'Only a booked appointment can be rescheduled. Make a new booking instead.');
    const error = bookingError(clinicSnap.data(), patientSnap.data(), a, others.docs.map((d) => ({ ...d.data(), id: d.id })));
    if (error) throw new ServiceError('failed-precondition', error);
    tx.set(ref, { ...a, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
  });
  return { id: a.id };
}

module.exports = { bookingError, bookAppointment };
