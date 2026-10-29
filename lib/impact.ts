import type { Appointment } from './clinic';

export type ImpactDelivery = { appointmentId: string; patientId: string; slot: string; status: string };
export type ImpactRange = { from: string; to: string };
export type ImpactReport = {
  messagesSent: number;
  messagesBySlot: Record<string, number>;
  missedVisits: number;
  followedUp: number;
  rebooked: number;
  recoveredVisits: number;
  recoveryRate: number;
};

/**
 * A missed visit counts as recovered when the patient received a missed-visit
 * follow-up and then has a later, non-cancelled appointment. Appointment records
 * carry no creation time, so "later" means a later appointment date.
 */
export function computeImpact(appointments: Appointment[], deliveries: ImpactDelivery[], range?: ImpactRange): ImpactReport {
  const inRange = (date: string) => !range || (date >= range.from && date <= range.to);
  const accepted = deliveries.filter(d => d.status === 'accepted');
  const byId = new Map(appointments.map(a => [a.id, a]));
  const messagesBySlot: Record<string, number> = {};
  let messagesSent = 0;
  for (const d of accepted) {
    const a = byId.get(d.appointmentId);
    if (range && (!a || !inRange(a.date))) continue;
    messagesSent++;
    messagesBySlot[d.slot] = (messagesBySlot[d.slot] || 0) + 1;
  }
  const followedUpIds = new Set(accepted.filter(d => d.slot.startsWith('missed_')).map(d => d.appointmentId));
  let missedVisits = 0, followedUp = 0, rebooked = 0, recoveredVisits = 0;
  for (const m of appointments) {
    if (m.status !== 'missed' || !inRange(m.date)) continue;
    missedVisits++;
    const wasFollowedUp = followedUpIds.has(m.id);
    if (wasFollowedUp) followedUp++;
    const hasRebooking = appointments.some(a => a.id !== m.id && a.clinicId === m.clinicId && a.patientId === m.patientId && a.date > m.date && (a.status === 'scheduled' || a.status === 'completed'));
    if (!hasRebooking) continue;
    rebooked++;
    if (wasFollowedUp) recoveredVisits++;
  }
  return { messagesSent, messagesBySlot, missedVisits, followedUp, rebooked, recoveredVisits, recoveryRate: missedVisits ? recoveredVisits / missedVisits : 0 };
}
