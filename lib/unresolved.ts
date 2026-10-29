import type { Appointment } from './clinic';

/**
 * Visits still marked Scheduled on a day that has already ended. Reception must
 * resolve each one (Attended / Missed / Cancelled); until they do, no missed-visit
 * follow-up is sent. Oldest first, so the longest-waiting patient is at the top.
 */
export function unresolvedVisits(appointments: Appointment[], today: string): Appointment[] {
  return appointments
    .filter(a => a.status === 'scheduled' && a.date < today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
