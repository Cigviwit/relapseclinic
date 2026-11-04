import type { Appointment } from './clinic.ts';

/**
 * Who is in the clinic right now. A booked visit moves arrived → with the doctor → seen.
 * Tokens are the order people arrived that day, worked out from arrival times rather than stored,
 * so two desks can never hand out the same number. They stay fixed as people leave.
 */
export type VisitStage = 'arrived' | 'with_doctor';
export type QueueEntry = { appointment: Appointment; token: number };

export function dayTokens(appointments: Appointment[], date: string) {
  // Cancelled visits keep their place: someone leaving must not renumber everyone after them.
  const arrived = appointments.filter(a => a.date === date && a.arrivedAt)
    .sort((a, b) => a.arrivedAt!.localeCompare(b.arrivedAt!) || a.id.localeCompare(b.id));
  return new Map(arrived.map((a, i) => [a.id, i + 1]));
}

/** Longest wait first, because that is who should be called next. */
export function clinicQueue(appointments: Appointment[], date: string) {
  const tokens = dayTokens(appointments, date);
  const entries = appointments.filter(a => a.date === date && a.status === 'scheduled' && tokens.has(a.id))
    .map(appointment => ({ appointment, token: tokens.get(appointment.id)! }))
    .sort((a, b) => a.token - b.token);
  return { waiting: entries.filter(e => e.appointment.stage === 'arrived'), withDoctor: entries.filter(e => e.appointment.stage === 'with_doctor') };
}

/** Whole minutes since a stored time, never negative: clocks on different computers disagree slightly. */
export const minutesSince = (iso: string | undefined, now: number) => iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0;
