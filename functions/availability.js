// When a doctor can be booked. Mirrors lib/availability.ts, which gives the same answers in the form; a test keeps the two in step.
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const label = (t) => `${Number(t.slice(0, 2)) % 12 || 12}:${t.slice(3)} ${Number(t.slice(0, 2)) >= 12 ? 'PM' : 'AM'}`;
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function doctorDay(clinic, doctorId, date) {
  const closed = clinic.closedDates?.find((c) => c.date === date);
  if (closed) return { sessions: [], off: `The clinic is closed${closed.reason ? ` for ${closed.reason}` : ''} on this day.` };
  const doctor = clinic.doctors.find((d) => d.id === doctorId);
  const leave = doctor?.leave?.find((l) => l.from <= date && date <= l.to);
  if (leave) return { sessions: [], off: `${doctor.name} is on leave${leave.reason ? ` (${leave.reason})` : ''} on this day.` };
  if (!doctor?.weekly) return { sessions: [{ start: clinic.opens, end: clinic.closes }] };
  const sessions = doctor.weekly[String(weekdayOf(date))] || [];
  return sessions.length ? { sessions } : { sessions: [], off: `${doctor.name} does not work on ${weekdayNames[weekdayOf(date)]}s.` };
}

function availabilityError(clinic, doctorId, date, time, duration) {
  const { sessions, off } = doctorDay(clinic, doctorId, date);
  if (off) return off;
  const start = mins(time), end = start + duration;
  if (sessions.some((s) => start >= mins(s.start) && end <= mins(s.end))) return null;
  const hours = sessions.map((s) => `${label(s.start)}–${label(s.end)}`).join(' and ');
  return clinic.doctors.find((d) => d.id === doctorId)?.weekly ? `This doctor works ${hours} on this day.` : `Appointments must fit within clinic hours: ${hours}.`;
}

module.exports = { doctorDay, availabilityError };
