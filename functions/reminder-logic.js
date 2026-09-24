const { createHash } = require('node:crypto');

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localNow(timezone, now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name) => parts.find((p) => p.type === name).value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

function slotFor(appointment, local) {
  if (local.time < '08:00' || local.time >= '08:15') return null;
  if (appointment.status === 'scheduled') {
    if (appointment.date === addDays(local.date, 2)) return 'two_days_before';
    if (appointment.date === local.date && local.time <= appointment.time) return 'appointment_day';
  }
  if (appointment.status === 'missed') {
    if (appointment.date === addDays(local.date, -1)) return 'missed_day_one';
    if (appointment.date === addDays(local.date, -7)) return 'missed_day_seven';
  }
  return null;
}

function missedDueNow(appointment, local) {
  return appointment.status === 'missed' &&
    `${local.date}T${local.time}` >= `${appointment.date}T${appointment.time}`;
}

function deliveryId(appointment, slot) {
  const fingerprint = createHash('sha256').update(JSON.stringify([
    appointment.clinicId, appointment.id, appointment.patientId,
    appointment.doctorId, appointment.date, appointment.time, slot,
  ])).digest('hex').slice(0, 24);
  return `${appointment.id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)}_${slot}_${fingerprint}`;
}

function bodyValues(appointment, patient, clinic, slot) {
  const doctor = clinic.doctors.find((item) => item.id === appointment.doctorId)?.name;
  if (!doctor) throw new Error('Appointment doctor no longer exists');
  const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${appointment.date}T12:00:00Z`));
  if (slot.startsWith('missed_')) return [patient.name, doctor, clinic.name, day, clinic.phone];
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(`2000-01-01T${appointment.time}:00Z`));
  return [patient.name, clinic.name, doctor, day, time, clinic.phone];
}

function msg91Payload(config, to, templateName, values, deliveryIdValue) {
  const components = Object.fromEntries(values.map((value, i) => [`body_${i + 1}`, { type: 'text', value: String(value) }]));
  return {
    integrated_number: config.integratedNumber.replace(/\D/g, ''),
    content_type: 'template',
    CRQID: deliveryIdValue,
    payload: {
      messaging_product: 'whatsapp', type: 'template',
      template: {
        name: templateName,
        language: { code: config.language || 'en', policy: 'deterministic' },
        namespace: config.namespace,
        to_and_components: [{ to: [to.replace(/\D/g, '')], components }],
      },
    },
  };
}

function hasReplacementAppointment(appointment, otherAppointments) {
  return otherAppointments.some((other) => other.id !== appointment.id &&
    other.clinicId === appointment.clinicId && other.patientId === appointment.patientId &&
    other.date > appointment.date && ['scheduled', 'completed'].includes(other.status));
}

module.exports = { addDays, localNow, slotFor, missedDueNow, deliveryId, bodyValues, msg91Payload, hasReplacementAppointment };
