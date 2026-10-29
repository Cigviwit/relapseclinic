import { addDays, dateLabel, type Clinic, type Doctor, type Patient } from './clinic.ts';
import { patientLanguage } from './patient-language.ts';

export type MedicineTiming = '' | 'after' | 'before' | 'with' | 'empty' | 'bedtime';
export type Medicine = { id: string; name: string; frequency: string; timing: MedicineTiming; days: string; notes: string };
export type Vitals = { bp: string; pulse: string; temp: string; weight: string; spo2: string };
export type Prescription = {
  id: string; clinicId: string; patientId: string; doctorId: string; appointmentId: string;
  date: string; age: string; sex: '' | 'M' | 'F' | 'O';
  vitals: Vitals; complaints: string; diagnosis: string;
  medicines: Medicine[]; advice: string; tests: string; followUp: string;
  createdAt: string; sentAt: string;
};

export const frequencies = ['1-0-1', '1-0-0', '0-0-1', '1-1-1', '0-1-0', '1-1-1-1', 'SOS', 'Once a week'];
export const timings: { value: MedicineTiming; label: string }[] = [
  { value: 'after', label: 'After food' }, { value: 'before', label: 'Before food' },
  { value: 'with', label: 'With food' }, { value: 'empty', label: 'Empty stomach' },
  { value: 'bedtime', label: 'At bedtime' }, { value: '', label: 'Any time' },
];
export const dayPresets = ['3', '5', '7', '10', '15', '30'];
export const adviceChips = ['Drink plenty of fluids', 'Take adequate rest', 'Avoid oily and spicy food', 'Steam inhalation twice daily', 'Warm salt-water gargles', 'Walk 30 minutes daily', 'Complete the full course of antibiotics', 'Return immediately if symptoms worsen'];
export const commonMedicines = [
  'Tab Paracetamol 500 mg', 'Tab Paracetamol 650 mg', 'Tab Dolo 650', 'Tab Ibuprofen 400 mg', 'Tab Aceclofenac 100 mg',
  'Tab Cetirizine 10 mg', 'Tab Levocetirizine 5 mg', 'Tab Montelukast 10 mg', 'Tab Fexofenadine 120 mg',
  'Tab Pantoprazole 40 mg', 'Cap Omeprazole 20 mg', 'Tab Rabeprazole 20 mg', 'Tab Domperidone 10 mg', 'Tab Ondansetron 4 mg',
  'Cap Amoxicillin 500 mg', 'Tab Amoxicillin + Clavulanate 625 mg', 'Tab Azithromycin 500 mg', 'Tab Cefixime 200 mg', 'Tab Ciprofloxacin 500 mg', 'Tab Metronidazole 400 mg', 'Tab Doxycycline 100 mg',
  'Tab Metformin 500 mg', 'Tab Glimepiride 1 mg', 'Tab Amlodipine 5 mg', 'Tab Telmisartan 40 mg', 'Tab Losartan 50 mg', 'Tab Atorvastatin 10 mg', 'Tab Rosuvastatin 10 mg', 'Tab Aspirin 75 mg',
  'Tab Thyroxine 50 mcg', 'Tab Vitamin D3 60000 IU', 'Tab Calcium + Vitamin D3', 'Cap Vitamin B-complex', 'Tab Folic acid 5 mg', 'Tab Iron + Folic acid',
  'Syp Paracetamol 250 mg/5 ml', 'Syp Cetirizine 5 mg/5 ml', 'Syp Ambroxol', 'Syp Dextromethorphan', 'ORS sachet',
  'Inhaler Salbutamol 100 mcg', 'Inhaler Budesonide + Formoterol', 'Drops Ciprofloxacin eye/ear', 'Nasal spray Oxymetazoline', 'Cream Clotrimazole 1%', 'Ointment Mupirocin 2%', 'Gel Diclofenac',
];

export const blankMedicine = (): Medicine => ({ id: crypto.randomUUID(), name: '', frequency: '1-0-1', timing: 'after', days: '5', notes: '' });
export const blankVitals = (): Vitals => ({ bp: '', pulse: '', temp: '', weight: '', spo2: '' });
export function blankPrescription(clinic: Clinic, date: string, patientId = '', doctorId = '', appointmentId = ''): Prescription {
  return { id: crypto.randomUUID(), clinicId: clinic.id, patientId, doctorId: doctorId || clinic.doctors[0]?.id || '', appointmentId, date, age: '', sex: '', vitals: blankVitals(), complaints: '', diagnosis: '', medicines: [blankMedicine()], advice: '', tests: '', followUp: '', createdAt: '', sentAt: '' };
}

/** Copy a previous prescription into a new draft dated today (for "repeat last Rx"). */
export function repeatPrescription(previous: Prescription, date: string, doctorId?: string, appointmentId = ''): Prescription {
  return { ...previous, id: crypto.randomUUID(), date, doctorId: doctorId || previous.doctorId, appointmentId, vitals: blankVitals(), followUp: '', createdAt: '', sentAt: '', medicines: previous.medicines.map(m => ({ ...m, id: crypto.randomUUID() })) };
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
  if (!meds.length && !rx.advice.trim() && !rx.tests.trim()) throw new Error('Add at least one medicine, test or advice.');
  if (meds.some(m => m.days.trim() && !/^\d{1,3}$/.test(m.days.trim()))) throw new Error('Enter medicine duration as a number of days.');
  if (rx.followUp && rx.followUp < rx.date) throw new Error('Follow-up date must be after the prescription date.');
}

/** Drops empty medicine rows and trims text before saving. */
export function cleanPrescription(rx: Prescription): Prescription {
  const t = (s: string) => s.trim();
  return { ...rx, age: t(rx.age), complaints: t(rx.complaints), diagnosis: t(rx.diagnosis), advice: t(rx.advice), tests: t(rx.tests),
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
  const vitals = vitalsLine(rx.vitals);
  if (vitals) lines.push(`*Vitals:* ${vitals}`);
  if (rx.complaints.trim()) lines.push(`*Complaints:* ${rx.complaints.trim()}`);
  if (rx.diagnosis.trim()) lines.push(`*Diagnosis:* ${rx.diagnosis.trim()}`);
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
