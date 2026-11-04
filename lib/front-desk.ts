import type { Patient } from './clinic.ts';

export type WaitlistEntry = { id: string; clinicId: string; patientId: string; doctorId: string; note?: string; status: 'waiting' | 'booked' | 'removed'; createdAt: string; updatedBy?: string };

const cleanName = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
const digits = (phone: string) => phone.replace(/\D/g, '').slice(-10);

/** Edit distance, stopping early: anything over `limit` counts as different. */
function closeSpelling(a: string, b: string, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] <= limit;
}

/** "Rohan Patel" matches "Patel Rohan" and "Rohan Patell". Short names need an exact match, because two letters apart is a different name. */
export function similarNames(a: string, b: string) {
  const x = cleanName(a).sort(), y = cleanName(b).sort();
  if (!x.length || !y.length) return false;
  const joinedX = x.join(' '), joinedY = y.join(' ');
  if (joinedX === joinedY) return true;
  return Math.min(joinedX.length, joinedY.length) >= 6 && closeSpelling(joinedX, joinedY);
}

export type PossibleDuplicate = { patient: Patient; reason: 'phone-and-name' | 'same-phone' | 'same-name' };

/** People already on file who might be this person. Families often share a number, so a matching phone alone only prompts a look. */
export function possibleDuplicates(patients: Patient[], candidate: { id?: string; name: string; phone: string }): PossibleDuplicate[] {
  const phone = digits(candidate.phone);
  const out: PossibleDuplicate[] = [];
  for (const patient of patients) {
    if (patient.id === candidate.id) continue;
    const samePhone = phone.length >= 10 && digits(patient.phone) === phone;
    const sameName = similarNames(patient.name, candidate.name);
    if (samePhone && sameName) out.push({ patient, reason: 'phone-and-name' });
    else if (samePhone) out.push({ patient, reason: 'same-phone' });
    else if (sameName) out.push({ patient, reason: 'same-name' });
  }
  const rank = { 'phone-and-name': 0, 'same-phone': 1, 'same-name': 2 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

/** Pairs worth an owner's review: the same number and a similar name. Family members with different names are left alone. */
export function duplicatePairs(patients: Patient[]) {
  const byPhone = new Map<string, Patient[]>();
  for (const p of patients) { const key = digits(p.phone); byPhone.set(key, [...(byPhone.get(key) || []), p]); }
  const pairs: [Patient, Patient][] = [];
  for (const group of byPhone.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (similarNames(group[i].name, group[j].name)) pairs.push([group[i], group[j]]);
  }
  return pairs;
}

export const familyMembers = (patients: Patient[], patient: Patient) => patient.familyId ? patients.filter(p => p.familyId === patient.familyId && p.id !== patient.id) : [];
/** The family two people end up sharing: the one either already has, or a new one. */
export const sharedFamilyId = (a: Patient, b: Patient, fresh: () => string) => a.familyId || b.familyId || fresh();
