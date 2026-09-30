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

function digestDue(clinic, local) {
  const time = clinic.doctorDigestTime || '18:00';
  return clinic.doctorDigestEnabled === true && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) &&
    local.time >= time && local.time < addMinutes(time, 15);
}

function addMinutes(time, count) {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + count;
  return total >= 1440 ? '24:00' : `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function doctorDigest(doctor, clinic, date, appointments, patients) {
  const visits = appointments.filter((a) => a.doctorId === doctor.id && a.status === 'scheduled')
    .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const day = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${date}T12:00:00Z`));
  const lines = visits.map((a, i) => {
    const patient = patients.get(a.patientId);
    if (!patient || patient.clinicId !== clinic.id) return null;
    const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true })
      .format(new Date(`2000-01-01T${a.time}:00Z`));
    return `${i + 1}. ${time} - ${patient.name} (${a.duration} min)`;
  }).filter(Boolean);
  if (lines.length !== visits.length) throw new Error('A digest appointment has no patient in this clinic');
  const schedule = lines.length ? lines.join('\n') : 'No appointments scheduled.';
  return {
    count: visits.length,
    subject: `${clinic.name}: ${visits.length} appointment${visits.length === 1 ? '' : 's'} on ${day}`,
    text: `Hello ${doctor.name},\n\nYou have ${visits.length} appointment${visits.length === 1 ? '' : 's'} tomorrow, ${day}, at ${clinic.name}.\n\n${schedule}\n\nThis list was prepared when this email was sent. Check the clinic calendar for later changes.`,
  };
}

function doctorDigestId(clinicId, doctorId, date) {
  return createHash('sha256').update(JSON.stringify([clinicId, doctorId, date])).digest('hex');
}

function manualDoctorDigestId(clinicId, doctorId, date, requestId) {
  return createHash('sha256').update(JSON.stringify(['manual', clinicId, doctorId, date, requestId])).digest('hex');
}

module.exports = { addDays, localNow, slotFor, missedDueNow, deliveryId, bodyValues, msg91Payload, hasReplacementAppointment, digestDue, doctorDigest, doctorDigestId, manualDoctorDigestId };
