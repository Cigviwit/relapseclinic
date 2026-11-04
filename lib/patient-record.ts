import { normalizePhone, zonedNow } from './clinic.ts';
import type { Vitals } from './prescription.ts';

export type AllergyStatus = 'unknown' | 'none' | 'known';
export type Allergy = { id: string; substance: string; reaction: string; severity: '' | 'mild' | 'moderate' | 'severe' };
export type Habit = '' | 'never' | 'former' | 'current';
/** One per patient, id = patientId. Holds what is true of the patient now; visits and notes hold what happened. */
export type PatientRecord = {
  id: string; clinicId: string; patientId: string;
  fileNo: string; dob: string; dobEstimated: boolean; sex: '' | 'M' | 'F' | 'O'; bloodGroup: string; occupation: string; address: string;
  emergencyName: string; emergencyPhone: string;
  allergyStatus: AllergyStatus; allergies: Allergy[];
  conditions: string; medications: string; surgeries: string; familyHistory: string; tobacco: Habit; alcohol: Habit; notes: string;
  version: number; updatedAt: string; updatedBy: string;
};
/** Append-only: a mistake is fixed by a new note whose `corrects` names the old one. */
export type PatientNote = { id: string; clinicId: string; patientId: string; doctorId: string; date: string; text: string; vitals?: Vitals; corrects?: string; appointmentId?: string; createdAt: string; createdBy: string; createdByName?: string };
export type RecordChange = { field: string; from: unknown; to: unknown };
/** Written only by the recordPatientRecordChange function. */
export type RecordAudit = { id: string; clinicId: string; patientId: string; version: number; changes: RecordChange[]; changedAt: string; changedBy: string };

export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const blankAllergy = (): Allergy => ({ id: crypto.randomUUID(), substance: '', reaction: '', severity: '' });
export function blankPatientRecord(clinicId: string, patientId: string): PatientRecord {
  return { id: patientId, clinicId, patientId, fileNo: '', dob: '', dobEstimated: false, sex: '', bloodGroup: '', occupation: '', address: '', emergencyName: '', emergencyPhone: '', allergyStatus: 'unknown', allergies: [], conditions: '', medications: '', surgeries: '', familyHistory: '', tobacco: '', alcohol: '', notes: '', version: 0, updatedAt: '', updatedBy: '' };
}

const realDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const ageMonths = (dob: string, today: string) => { const [y, m, d] = dob.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number); return (ty - y) * 12 + tm - m - (td < d ? 1 : 0); };

/** Whole years for a prescription's age field; blank under one year, where years would mislead. */
export const ageYears = (dob: string, today: string) => { if (!dob) return ''; const months = ageMonths(dob, today); return months >= 12 ? String(Math.floor(months / 12)) : ''; };
/** "34 y", "8 mo" under two years, "~45 y" when the date of birth was worked out from a stated age. */
export function ageLabel(r: Pick<PatientRecord, 'dob' | 'dobEstimated'>, today: string) {
  if (!r.dob) return '';
  const months = ageMonths(r.dob, today);
  return (r.dobEstimated ? '~' : '') + (months < 24 ? `${months} mo` : `${Math.floor(months / 12)} y`);
}
/** Many patients know their age but not their birth date. Storing a date keeps the age from going stale. */
export function estimatedDob(age: number, today: string) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y - age, m - 1, d)).toISOString().slice(0, 10);
}

/** Trims and validates; returns the record to save. Empty allergy rows are dropped, and a list only exists when status is "known". */
export function prepareRecord(r: PatientRecord, today: string): PatientRecord {
  const t = (s: string) => s.trim();
  const allergies = r.allergyStatus === 'known' ? r.allergies.map(a => ({ ...a, substance: t(a.substance), reaction: t(a.reaction) })).filter(a => a.substance || a.reaction) : [];
  if (r.dob && (!realDate(r.dob) || r.dob > today)) throw new Error('Enter a date of birth that is not in the future.');
  if (r.dob && ageMonths(r.dob, today) > 130 * 12) throw new Error('Enter a date of birth within the last 130 years.');
  if (r.allergyStatus === 'known' && !allergies.length) throw new Error('Add the allergy, or choose “No known allergies”.');
  if (allergies.some(a => !a.substance)) throw new Error('Name what the patient is allergic to.');
  return { ...r, allergies, fileNo: t(r.fileNo), occupation: t(r.occupation), address: t(r.address), emergencyName: t(r.emergencyName), emergencyPhone: r.emergencyPhone.trim() ? normalizePhone(r.emergencyPhone) : '', conditions: t(r.conditions), medications: t(r.medications), surgeries: t(r.surgeries), familyHistory: t(r.familyHistory), notes: t(r.notes) };
}

const hasVitals = (v?: Vitals) => !!v && Object.values(v).some(x => x.trim());
export function prepareNote(n: PatientNote, today: string): PatientNote {
  if (!n.text.trim() && !hasVitals(n.vitals)) throw new Error('Write the note or enter a vital sign.');
  if (!realDate(n.date) || n.date > today) throw new Error('Choose a visit date that is not in the future.');
  if (!n.doctorId) throw new Error('Choose the doctor for this note.');
  const { vitals, corrects, appointmentId, ...rest } = n;
  return { ...rest, text: n.text.trim(), ...(hasVitals(vitals) ? { vitals } : {}), ...(corrects ? { corrects } : {}), ...(appointmentId ? { appointmentId } : {}) };
}

/** The notes still in force: a note that has been corrected is left out. */
export const currentNotes = (notes: PatientNote[]) => { const replaced = new Set(notes.flatMap(n => n.corrects ? [n.corrects] : [])); return notes.filter(n => !replaced.has(n.id)); };
/**
 * Everything recorded for one visit. Notes from before visits were linked, or written from the patient's page,
 * count if they share the visit's date and doctor.
 */
export function visitNotes(appointment: { id: string; date: string; doctorId: string }, notes: PatientNote[]) {
  return currentNotes(notes).filter(n => n.appointmentId === appointment.id || (!n.appointmentId && n.date === appointment.date && n.doctorId === appointment.doctorId));
}

/** What a note replaced, most recent first. */
export function earlierVersions(note: PatientNote, notes: PatientNote[]) {
  const out: PatientNote[] = []; let at = note.corrects;
  while (at) { const prev = notes.find(n => n.id === at); if (!prev || out.includes(prev)) break; out.push(prev); at = prev.corrects; }
  return out;
}

type Dated = { date: string; createdAt?: string; time?: string };
export type TimelineItem<V, R> = { kind: 'note'; date: string; item: PatientNote } | { kind: 'rx'; date: string; item: R } | { kind: 'visit'; date: string; item: V };
/** Newest day first. Within a day: notes, then prescriptions, then the visit they belong to. */
export function patientTimeline<V extends Dated, R extends Dated>(visits: V[], rxs: R[], notes: PatientNote[]): TimelineItem<V, R>[] {
  const rank = { note: 0, rx: 1, visit: 2 };
  const stamp = (x: TimelineItem<V, R>) => x.kind === 'visit' ? x.item.time || '' : x.item.createdAt || '';
  const items: TimelineItem<V, R>[] = [...currentNotes(notes).map(item => ({ kind: 'note' as const, date: item.date, item })), ...rxs.map(item => ({ kind: 'rx' as const, date: item.date, item })), ...visits.map(item => ({ kind: 'visit' as const, date: item.date, item }))];
  return items.sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind] || stamp(b).localeCompare(stamp(a)));
}

/** Summary for the prescription's history line. Only says "no known allergies" when someone recorded that. */
export function historyLine(r: PatientRecord) {
  const allergy = r.allergyStatus === 'known' ? `Allergic to ${r.allergies.map(a => a.substance).join(', ')}` : r.allergyStatus === 'none' ? 'No known allergies' : '';
  return [allergy, r.conditions.split('\n').map(s => s.trim()).filter(Boolean).join(', ')].filter(Boolean).join('; ');
}
export type RxPrefill = { age: string; sex: PatientRecord['sex']; history: string };
export const emptyPrefill: RxPrefill = { age: '', sex: '', history: '' };
export const rxPrefill = (r: PatientRecord | null, today: string): RxPrefill => r ? { age: ageYears(r.dob, today), sex: r.sex, history: historyLine(r) } : emptyPrefill;
/** Replaces only what the last prefill wrote, so anything typed stays and one patient's history never carries over to the next. */
export function applyRxPrefill<T extends RxPrefill>(rx: T, previous: RxPrefill, next: RxPrefill): T {
  return { ...rx, age: rx.age === previous.age ? next.age : rx.age, sex: rx.sex === previous.sex ? next.sex : rx.sex, history: rx.history === previous.history ? next.history : rx.history };
}

const metaFields = new Set(['id', 'clinicId', 'patientId', 'version', 'updatedAt', 'updatedBy']);
const comparable = (v: unknown) => JSON.stringify(v === undefined || v === null || v === false || (Array.isArray(v) && !v.length) ? '' : v);
/** Mirrors recordChanges in functions/reminder-logic.js, which writes the real audit trail; this one feeds the demo. */
export function recordChanges(before: Record<string, unknown> = {}, after: Record<string, unknown>): RecordChange[] {
  return Object.keys(after).filter(f => !metaFields.has(f) && comparable(before[f]) !== comparable(after[f])).map(field => ({ field, from: before[field] ?? null, to: after[field] ?? null }));
}
export const recordFieldLabels: Record<string, string> = { fileNo: 'File number', dob: 'Date of birth', dobEstimated: 'Estimated date of birth', sex: 'Sex', bloodGroup: 'Blood group', occupation: 'Occupation', address: 'Address', emergencyName: 'Emergency contact', emergencyPhone: 'Emergency phone', allergyStatus: 'Allergy status', allergies: 'Allergies', conditions: 'Conditions', medications: 'Current medicines', surgeries: 'Surgeries', familyHistory: 'Family history', tobacco: 'Tobacco', alcohol: 'Alcohol', notes: 'Notes' };
export function changeValue(value: unknown) {
  if (Array.isArray(value)) return (value as Allergy[]).map(a => a.substance).join(', ') || '—';
  if (value === true) return 'Yes';
  return value === null || value === false || value === '' ? '—' : String(value);
}
/** Clinic-local date of a stored instant, since a late entry is written on a different day from the visit. */
export const localDate = (iso: string, timezone: string) => iso ? zonedNow(timezone, new Date(iso)).date : '';
