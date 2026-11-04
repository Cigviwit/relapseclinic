import type { Appointment, Clinic } from './clinic.ts';

/**
 * When a doctor can be booked. Many dental clinics run a morning and an evening session, so a day is a
 * list of sessions. A doctor with no weekly hours set follows the clinic's hours every day.
 * Mirrors functions/availability.js, which enforces the same answers; a test keeps the two in step.
 */
export type Session = { start: string; end: string };
export type WeeklyHours = Record<string, Session[]>;
export type Leave = { id: string; from: string; to: string; reason?: string };
export type ClosedDate = { date: string; reason?: string };

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const label = (t: string) => `${Number(t.slice(0, 2)) % 12 || 12}:${t.slice(3)} ${Number(t.slice(0, 2)) >= 12 ? 'PM' : 'AM'}`;
export const weekdayOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay();
export const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The sessions a doctor works on a date, or why they are not available. */
export function doctorDay(clinic: Pick<Clinic, 'opens' | 'closes' | 'doctors' | 'closedDates'>, doctorId: string, date: string): { sessions: Session[]; off?: string } {
  const closed = clinic.closedDates?.find(c => c.date === date);
  if (closed) return { sessions: [], off: `The clinic is closed${closed.reason ? ` for ${closed.reason}` : ''} on this day.` };
  const doctor = clinic.doctors.find(d => d.id === doctorId);
  const leave = doctor?.leave?.find(l => l.from <= date && date <= l.to);
  if (leave) return { sessions: [], off: `${doctor!.name} is on leave${leave.reason ? ` (${leave.reason})` : ''} on this day.` };
  if (!doctor?.weekly) return { sessions: [{ start: clinic.opens, end: clinic.closes }] };
  const sessions = doctor.weekly[String(weekdayOf(date))] || [];
  return sessions.length ? { sessions } : { sessions: [], off: `${doctor.name} does not work on ${weekdayNames[weekdayOf(date)]}s.` };
}

/** Why this time cannot be booked with this doctor, or null. */
export function availabilityError(clinic: Pick<Clinic, 'opens' | 'closes' | 'doctors' | 'closedDates'>, doctorId: string, date: string, time: string, duration: number): string | null {
  const { sessions, off } = doctorDay(clinic, doctorId, date);
  if (off) return off;
  const start = mins(time), end = start + duration;
  if (sessions.some(s => start >= mins(s.start) && end <= mins(s.end))) return null;
  const hours = sessions.map(s => `${label(s.start)}–${label(s.end)}`).join(' and ');
  return clinic.doctors.find(d => d.id === doctorId)?.weekly ? `This doctor works ${hours} on this day.` : `Appointments must fit within clinic hours: ${hours}.`;
}

/** Checks a doctor's weekly hours before saving. Returns the hours in time order. */
export function cleanWeekly(weekly: WeeklyHours, opens: string, closes: string): WeeklyHours {
  const out: WeeklyHours = {};
  for (const [day, sessions] of Object.entries(weekly)) {
    const sorted = [...sessions].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((s, i) => {
      if (!/^\d{2}:\d{2}$/.test(s.start) || !/^\d{2}:\d{2}$/.test(s.end) || mins(s.start) >= mins(s.end)) throw new Error(`${weekdayNames[Number(day)]}: each session must end after it starts.`);
      if (mins(s.start) < mins(opens) || mins(s.end) > mins(closes)) throw new Error(`${weekdayNames[Number(day)]}: sessions must be within clinic hours, ${label(opens)}–${label(closes)}.`);
      if (i && mins(s.start) < mins(sorted[i - 1].end)) throw new Error(`${weekdayNames[Number(day)]}: sessions cannot overlap.`);
    });
    out[day] = sorted;
  }
  return out;
}

/** Booked visits that a change of hours or leave has left outside the doctor's availability. They are not moved automatically. */
export function strandedVisits(appointments: Appointment[], clinic: Pick<Clinic, 'opens' | 'closes' | 'doctors' | 'closedDates'>, today: string) {
  return appointments.filter(a => a.status === 'scheduled' && !a.walkIn && a.date >= today && availabilityError(clinic, a.doctorId, a.date, a.time, a.duration));
}
