import { addDays, dateLabel, type Clinic, type Patient } from './clinic.ts';
import { permanentTeeth, primaryTeeth } from './rx-templates.ts';

// --- Treatment plans ---
export type PlanItemStatus = 'planned' | 'in_progress' | 'done' | 'declined';
export type PlanItem = { id: string; procedure: string; teeth: number[]; estimate: number; status: PlanItemStatus; note?: string };
export type TreatmentPlan = { id: string; clinicId: string; patientId: string; doctorId: string; title: string; items: PlanItem[]; status: 'active' | 'closed'; createdAt: string; version: number; updatedBy?: string };
export const planItemStatuses: { value: PlanItemStatus; label: string }[] = [{ value: 'planned', label: 'Planned' }, { value: 'in_progress', label: 'In progress' }, { value: 'done', label: 'Done' }, { value: 'declined', label: 'Declined' }];

const allTeeth = new Set([...permanentTeeth.upper, ...permanentTeeth.lower, ...primaryTeeth.upper, ...primaryTeeth.lower]);
/** "36, 37" becomes [36, 37]. Numbers that are not real teeth are refused, because a wrong tooth on a plan is a clinical error. */
export function parseTeeth(text: string): number[] {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const teeth = parts.map(Number);
  const bad = parts.find((part, i) => !allTeeth.has(teeth[i]) || !/^\d+$/.test(part));
  if (bad) throw new Error(`${bad} is not a tooth number. Use FDI numbers such as 36.`);
  return [...new Set(teeth)].sort((a, b) => a - b);
}

export function planTotals(items: PlanItem[]) {
  const live = items.filter(i => i.status !== 'declined');
  return { total: live.reduce((sum, i) => sum + i.estimate, 0), done: live.filter(i => i.status === 'done').reduce((sum, i) => sum + i.estimate, 0), count: live.length, finished: live.filter(i => i.status === 'done').length };
}

/** Active bills that already charged for this treatment. A root canal billed per sitting has several, so this warns rather than refuses. */
export const billsForItem = <B extends { patientId: string; status: string; lines: { description: string }[] }>(bills: B[], patientId: string, procedure: string) =>
  bills.filter(b => b.patientId === patientId && b.status === 'active' && b.lines.some(l => l.description.trim().toLowerCase() === procedure.trim().toLowerCase()));

export function validatePlan(plan: TreatmentPlan) {
  if (!plan.patientId) throw new Error('Choose the patient first.');
  if (!plan.doctorId) throw new Error('Choose the doctor.');
  if (!plan.items.length) throw new Error('Add at least one treatment.');
  for (const item of plan.items) {
    if (!item.procedure.trim()) throw new Error('Every treatment needs a name.');
    if (!Number.isInteger(item.estimate) || item.estimate < 0) throw new Error(`Check the estimate for ${item.procedure}.`);
  }
}

// --- Lab work ---
export type LabStatus = 'sent' | 'received' | 'fitted' | 'redo' | 'cancelled';
export type LabCase = { id: string; clinicId: string; patientId: string; doctorId: string; labName: string; work: string; teeth: number[]; shade?: string; sentOn: string; dueOn: string; status: LabStatus; note?: string; createdAt: string; updatedBy?: string };
export const labWorkTypes = ['PFM crown', 'Zirconia crown', 'Metal crown', 'Bridge', 'Complete denture', 'Partial denture', 'Night guard', 'Retainer', 'Aligners', 'Implant crown'];
export const labStatusLabel: Record<LabStatus, string> = { sent: 'At the lab', received: 'Back from lab', fitted: 'Fitted', redo: 'Sent back for redo', cancelled: 'Cancelled' };
export const OPEN_LAB: LabStatus[] = ['sent', 'received', 'redo'];
/** Work still at the lab that should be back by now. Work already back needs fitting, not chasing. */
export const labOverdue = (c: Pick<LabCase, 'status' | 'dueOn'>, today: string) => (c.status === 'sent' || c.status === 'redo') && c.dueOn < today;
export const nextLabSteps = (status: LabStatus): LabStatus[] => status === 'sent' ? ['received', 'cancelled'] : status === 'received' ? ['fitted', 'redo'] : status === 'redo' ? ['received', 'cancelled'] : [];
/** Most urgent first: overdue work, then the soonest due. */
export const sortLabs = (cases: LabCase[]) => [...cases].sort((a, b) => a.dueOn.localeCompare(b.dueOn));

export function validateLabCase(c: LabCase) {
  if (!c.patientId) throw new Error('Choose the patient first.');
  if (!c.work.trim()) throw new Error('Enter the work being made.');
  if (!c.labName.trim()) throw new Error('Enter the lab’s name.');
  if (!c.sentOn || !c.dueOn) throw new Error('Enter when it was sent and when it is due back.');
  if (c.dueOn < c.sentOn) throw new Error('It cannot be due back before it was sent.');
}

// --- Recalls ---
export type Recall = { id: string; clinicId: string; patientId: string; due: string; reason: string; status: 'due' | 'booked' | 'dismissed'; createdAt: string; updatedBy?: string };
export const recallPresets = [{ label: '3 months', months: 3 }, { label: '6 months', months: 6 }, { label: '1 year', months: 12 }];
/** Whole calendar months later, staying within the month: 31 Aug + 6 months is 28 Feb, not 3 Mar. */
export function monthsLater(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last), 12)).toISOString().slice(0, 10);
}
/** Oldest first, including those already past. The two-week look-ahead gives time to call before the date. */
export const recallsToCall = (recalls: Recall[], today: string) => recalls.filter(r => r.status === 'due' && r.due <= addDays(today, 14)).sort((a, b) => a.due.localeCompare(b.due));
export function recallMessage(recall: Recall, patient: Patient, clinic: Clinic) {
  return `Hello ${patient.name}, it is time for your ${recall.reason.toLowerCase()} at ${clinic.name}${recall.due ? `, due around ${dateLabel(recall.due, { day: 'numeric', month: 'long' })}` : ''}. Please reply or call ${clinic.phone} to book a time that suits you.`;
}
