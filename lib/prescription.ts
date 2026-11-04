import { addDays, dateLabel, type Clinic, type Doctor, type Patient } from './clinic.ts';
import { patientLanguage } from './patient-language.ts';
import { specialties, type Specialty } from './rx-templates.ts';

export type MedicineTiming = '' | 'after' | 'before' | 'with' | 'empty' | 'bedtime';
export type Medicine = { id: string; name: string; frequency: string; timing: MedicineTiming; days: string; notes: string };
export type Vitals = { bp: string; pulse: string; temp: string; weight: string; spo2: string };
export type Prescription = {
  id: string; clinicId: string; patientId: string; doctorId: string; appointmentId: string;
  date: string; age: string; sex: '' | 'M' | 'F' | 'O'; specialty: Specialty;
  vitals: Vitals; history: string; complaints: string; teeth: number[]; findings: string; diagnosis: string;
  procedures: string; plan: string;
  medicines: Medicine[]; advice: string; tests: string; followUp: string;
  createdAt: string; sentAt: string;
  /** A draft may change. A final prescription never does: a mistake is fixed by a new one whose `amends` names it. */
  status: 'draft' | 'final'; amends?: string; finalizedBy?: string; finalizedAt?: string;
};

export const frequencies = ['1-0-1', '1-0-0', '0-0-1', '1-1-1', '0-1-0', '1-1-1-1', 'SOS', 'Once a week'];
export const timings: { value: MedicineTiming; label: string }[] = [
  { value: 'after', label: 'After food' }, { value: 'before', label: 'Before food' },
  { value: 'with', label: 'With food' }, { value: 'empty', label: 'Empty stomach' },
  { value: 'bedtime', label: 'At bedtime' }, { value: '', label: 'Any time' },
];
export const dayPresets = ['3', '5', '7', '10', '15', '30'];

export const blankMedicine = (): Medicine => ({ id: crypto.randomUUID(), name: '', frequency: '1-0-1', timing: 'after', days: '5', notes: '' });
export const blankVitals = (): Vitals => ({ bp: '', pulse: '', temp: '', weight: '', spo2: '' });
export function blankPrescription(clinic: Clinic, date: string, patientId = '', doctorId = '', appointmentId = ''): Prescription {
  const doctor = clinic.doctors.find(d => d.id === doctorId) || clinic.doctors[0];
  const specialty = doctor?.padSpecialty || clinic.rxPad?.specialty || 'general';
  return { id: crypto.randomUUID(), clinicId: clinic.id, patientId, doctorId: doctor?.id || '', appointmentId, date, age: '', sex: '', specialty, vitals: blankVitals(), history: '', complaints: '', teeth: [], findings: '', diagnosis: '', procedures: '', plan: '', medicines: [blankMedicine()], advice: '', tests: '', followUp: '', createdAt: '', sentAt: '', status: 'draft' };
}

/** Prescriptions saved before specialty pads and drafts existed lack the newer fields. Those older ones count as final. */
export function withDefaults(rx: Partial<Prescription> & Pick<Prescription, 'id' | 'clinicId'>): Prescription {
  return { patientId: '', doctorId: '', appointmentId: '', date: '', age: '', sex: '', specialty: 'general', history: '', complaints: '', teeth: [], findings: '', diagnosis: '', procedures: '', plan: '', medicines: [], advice: '', tests: '', followUp: '', createdAt: '', sentAt: '', status: 'final', ...rx, vitals: { ...blankVitals(), ...rx.vitals } };
}

/** "36, 37" with tooth names for the patient-facing message. */
export const teethText = (teeth: number[]) => [...teeth].sort((a, b) => a - b).join(', ');

/** Copy a previous prescription into a new draft dated today (for "repeat last Rx"). */
export function repeatPrescription(previous: Prescription, date: string, doctorId?: string, appointmentId = ''): Prescription {
  return { ...previous, id: crypto.randomUUID(), date, doctorId: doctorId || previous.doctorId, appointmentId, vitals: blankVitals(), followUp: '', createdAt: '', sentAt: '', status: 'draft', amends: undefined, finalizedBy: undefined, finalizedAt: undefined, medicines: previous.medicines.map(m => ({ ...m, id: crypto.randomUUID() })) };
}

/** A new draft to correct a final prescription, keeping everything it said. It replaces the old one once finalised. */
export function amendPrescription(previous: Prescription, date: string): Prescription {
  return { ...previous, id: crypto.randomUUID(), date, createdAt: '', sentAt: '', status: 'draft', amends: previous.id, finalizedBy: undefined, finalizedAt: undefined, medicines: previous.medicines.map(m => ({ ...m, id: crypto.randomUUID() })) };
}

/** The prescriptions still in force. One is replaced only once its amendment is final: an unfinished draft replaces nothing. */
export function currentPrescriptions<T extends Pick<Prescription, 'id' | 'amends' | 'status'>>(all: T[]): T[] {
  const replaced = new Set(all.flatMap(rx => rx.amends && rx.status === 'final' ? [rx.amends] : []));
  return all.filter(rx => !replaced.has(rx.id));
}

export const followUpPresets = (date: string) => [{ label: '3 days', value: addDays(date, 3) }, { label: '1 week', value: addDays(date, 7) }, { label: '2 weeks', value: addDays(date, 14) }, { label: '1 month', value: addDays(date, 30) }];

const words = {
  en: { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night', sos: 'only when needed', weekly: 'once a week', days: 'days', day: 'day', timing: { after: 'after food', before: 'before food', with: 'with food', empty: 'on an empty stomach', bedtime: 'at bedtime', '': '' } },
  hi: { morning: 'सुबह', afternoon: 'दोपहर', evening: 'शाम', night: 'रात', sos: 'ज़रूरत होने पर', weekly: 'हफ़्ते में एक बार', days: 'दिन', day: 'दिन', timing: { after: 'खाने के बाद', before: 'खाने से पहले', with: 'खाने के साथ', empty: 'खाली पेट', bedtime: 'सोने से पहले', '': '' } },
  mr: { morning: 'सकाळी', afternoon: 'दुपारी', evening: 'संध्याकाळी', night: 'रात्री', sos: 'गरज असल्यास', weekly: 'आठवड्यातून एकदा', days: 'दिवस', day: 'दिवस', timing: { after: 'जेवणानंतर', before: 'जेवणापूर्वी', with: 'जेवणासोबत', empty: 'उपाशीपोटी', bedtime: 'झोपण्यापूर्वी', '': '' } },
} as const;
type Lang = keyof typeof words;

/** "1-0-1" → "morning, night". Unknown patterns are returned unchanged. */
export function frequencyText(frequency: string, lang: Lang = 'en') {
  const w = words[lang];
  if (frequency === 'SOS') return w.sos;
  if (frequency === 'Once a week') return w.weekly;
  const parts = frequency.split('-');
  if (!parts.every(p => /^\d+(\.\d+)?$|^½$/.test(p)) || (parts.length !== 3 && parts.length !== 4)) return frequency;
  const slots = parts.length === 3 ? [w.morning, w.afternoon, w.night] : [w.morning, w.afternoon, w.evening, w.night];
  return parts.map((p, i) => p === '0' ? '' : p === '1' ? slots[i] : `${slots[i]} (${p})`).filter(Boolean).join(', ');
}

export function medicineInstruction(m: Medicine, lang: Lang = 'en') {
  const w = words[lang];
  const days = m.days.trim() ? `${m.days.trim()} ${m.days.trim() === '1' ? w.day : w.days}` : '';
  return [frequencyText(m.frequency, lang), w.timing[m.timing], days].filter(Boolean).join(' · ');
}

export function validatePrescription(rx: Prescription, patients: Patient[], doctors: Doctor[]) {
  if (!patients.some(p => p.id === rx.patientId && p.clinicId === rx.clinicId)) throw new Error('Choose the patient for this prescription.');
  if (!doctors.some(d => d.id === rx.doctorId)) throw new Error('Choose the prescribing doctor.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rx.date)) throw new Error('Choose a valid prescription date.');
  const meds = rx.medicines.filter(m => m.name.trim());
  if (!meds.length && !rx.advice.trim() && !rx.tests.trim() && !rx.procedures.trim() && !rx.plan.trim()) throw new Error('Add at least one medicine, treatment, test or advice.');
  if (meds.some(m => m.days.trim() && !/^\d{1,3}$/.test(m.days.trim()))) throw new Error('Enter medicine duration as a number of days.');
  if (rx.followUp && rx.followUp < rx.date) throw new Error('Follow-up date must be after the prescription date.');
}

/** Drops empty medicine rows and trims text before saving. */
export function cleanPrescription(rx: Prescription): Prescription {
  const t = (s: string) => s.trim();
  return { ...rx, age: t(rx.age), history: t(rx.history), complaints: t(rx.complaints), findings: t(rx.findings), diagnosis: t(rx.diagnosis), procedures: t(rx.procedures), plan: t(rx.plan), advice: t(rx.advice), tests: t(rx.tests), teeth: [...rx.teeth].sort((a, b) => a - b),
    vitals: { bp: t(rx.vitals.bp), pulse: t(rx.vitals.pulse), temp: t(rx.vitals.temp), weight: t(rx.vitals.weight), spo2: t(rx.vitals.spo2) },
    medicines: rx.medicines.filter(m => m.name.trim()).map(m => ({ ...m, name: t(m.name), days: t(m.days), notes: t(m.notes) })) };
}

export function vitalsLine(v: Vitals) {
  return [v.bp && `BP ${v.bp} mmHg`, v.pulse && `Pulse ${v.pulse}/min`, v.temp && `Temp ${v.temp}°F`, v.weight && `Wt ${v.weight} kg`, v.spo2 && `SpO₂ ${v.spo2}%`].filter(Boolean).join(' · ');
}

/** Plain-text prescription formatted for WhatsApp (*bold* markup). Adds the patient's language under each dosage line. */
export function prescriptionMessage(rx: Prescription, clinic: Clinic, patient: Patient | undefined, doctor: Doctor | undefined) {
  const lang = patientLanguage(patient?.language) as Lang;
  const lines: string[] = [`*${clinic.name}*`];
  if (doctor) lines.push(`${doctor.name}${doctor.specialty ? ` · ${doctor.specialty}` : ''}`);
  lines.push(`Date: ${dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}`, '');
  const who = [patient?.name, [rx.age && `${rx.age} y`, rx.sex].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  if (who) lines.push(`*Patient:* ${who}`);
  const preset = specialties[rx.specialty] || specialties.general;
  const label = (k: keyof typeof preset.labels, fallback: string) => preset.labels[k] || fallback;
  const vitals = vitalsLine(rx.vitals);
  if (vitals) lines.push(`*Vitals:* ${vitals}`);
  if (rx.history.trim()) lines.push(`*${label('history', 'Medical history')}:* ${rx.history.trim()}`);
  if (rx.complaints.trim()) lines.push(`*${label('complaints', 'Complaints')}:* ${rx.complaints.trim()}`);
  if (rx.teeth.length) lines.push(`*Teeth:* ${teethText(rx.teeth)}`);
  if (rx.findings.trim()) lines.push(`*${label('findings', 'Findings')}:* ${rx.findings.trim()}`);
  if (rx.diagnosis.trim()) lines.push(`*Diagnosis:* ${rx.diagnosis.trim()}`);
  if (rx.procedures.trim()) lines.push(`*${label('procedures', 'Procedure')}:* ${rx.procedures.trim()}`);
  if (rx.plan.trim()) lines.push(`*${label('plan', 'Plan')}:* ${rx.plan.trim()}`);
  const meds = rx.medicines.filter(m => m.name.trim());
  if (meds.length) {
    lines.push('', '*℞ Medicines*');
    meds.forEach((m, i) => {
      lines.push(`${i + 1}. *${m.name.trim()}*`, `    ${medicineInstruction(m)}`);
      if (lang !== 'en') lines.push(`    ${medicineInstruction(m, lang)}`);
      if (m.notes.trim()) lines.push(`    _${m.notes.trim()}_`);
    });
  }
  if (rx.tests.trim()) lines.push('', `*Tests:* ${rx.tests.trim()}`);
  if (rx.advice.trim()) lines.push('', '*Advice:*', ...rx.advice.trim().split('\n').map(l => `• ${l.replace(/^[•\-*]\s*/, '')}`));
  if (rx.followUp) lines.push('', `*Follow-up:* ${dateLabel(rx.followUp, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`);
  lines.push('', `${clinic.name} · ${clinic.phone}`, clinic.address);
  return lines.join('\n');
}

/** wa.me click-to-chat link; opens WhatsApp (app or web) with the message ready to send. */
export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
