import { minutes, zonedNow, type Appointment, type Clinic } from './clinic.ts';

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Start times (HH:MM) at which `doctorId` is free for `duration` minutes on `date`,
 * inside clinic hours and not in the past (clinic timezone).
 */
export function freeSlots(appointments: Appointment[], clinic: Clinic, doctorId: string, date: string, duration: number, excludeId?: string, step = 15, now = new Date()) {
  const busy = appointments.filter(a => a.clinicId === clinic.id && a.doctorId === doctorId && a.date === date && a.status !== 'cancelled' && a.id !== excludeId)
    .map(a => [minutes(a.time), minutes(a.time) + a.duration]);
  const local = zonedNow(clinic.timezone, now);
  const earliest = date < local.date ? Infinity : date === local.date ? minutes(local.time) + 1 : -Infinity;
  const slots: string[] = [];
  if (!(duration > 0)) return slots;
  for (let t = minutes(clinic.opens); t + duration <= minutes(clinic.closes); t += step) {
    if (t < earliest) continue;
    if (busy.some(([s, e]) => t < e && t + duration > s)) continue;
    slots.push(hhmm(t));
  }
  return slots;
}

/** Splits a clinic day's appointments into what is done, happening now, and still to come. */
export function dayBuckets(appointments: Appointment[], nowTime: string) {
  const now = minutes(nowTime);
  const active = appointments.filter(a => a.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const open = active.filter(a => a.status === 'scheduled');
  const current = open.filter(a => minutes(a.time) <= now && minutes(a.time) + a.duration > now);
  const overdue = open.filter(a => minutes(a.time) + a.duration <= now);
  const upcoming = open.filter(a => minutes(a.time) > now);
  return { active, current, overdue, upcoming, seen: active.filter(a => a.status === 'completed'), missed: active.filter(a => a.status === 'missed') };
}
