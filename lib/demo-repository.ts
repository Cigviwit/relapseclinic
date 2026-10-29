import { seed, addDays, type Database } from './clinic';
import type { Account } from './auth-service';
import type { Repository, MessageDelivery, DoctorDigestDelivery } from './firestore-repository';
import type { Prescription } from './prescription';

/**
 * In-memory data for trying the workspace on localhost without Firebase.
 * Open http://localhost:5173/?demo — nothing is saved or sent.
 */
export function isDemoMode() {
  if (typeof window === 'undefined') return false;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return local && new URLSearchParams(window.location.search).has('demo');
}

export const demoAccount = { user: { email: 'reception@greenleaf.demo', uid: 'demo' }, role: 'admin', clinicId: null } as unknown as Account;

function demoData() {
  const db = seed();
  const date = db.appointments[0].date;
  db.patients.forEach((p, i) => { p.language = (['en', 'hi', 'mr'] as const)[i % 3]; });
  const dental = db.clinics[0];
  Object.assign(dental, { name: 'Greenleaf Dental Care', rxPad: { specialty: 'dental', style: 'classic', accent: '#1f5fbf', tagline: 'Complete family dental care', footer: 'Mon–Sat 9 AM – 7 PM · For emergencies call the clinic number', paper: 'A5' } });
  dental.doctors = [
    { id: 'priya', name: 'Dr. Priya Nair', specialty: 'Endodontist', qualification: 'BDS, MDS (Conservative Dentistry & Endodontics)', regNo: 'A-12345', padSpecialty: 'dental' },
    { id: 'arjun', name: 'Dr. Arjun Mehta', specialty: 'Pedodontist', qualification: 'BDS, MDS (Pediatric Dentistry)', regNo: 'A-23456', padSpecialty: 'dental' },
  ];
  const reasons = ['Toothache', 'Root canal – session 2', 'Scaling & polishing', 'Extraction', 'Filling', 'Check-up'];
  db.appointments.forEach((a, i) => { a.reason = reasons[i % reasons.length]; });
  // A couple of past visits with no outcome yet, so the front-desk queue has work in it.
  db.appointments.push(
    { id: 'past1', clinicId: 'greenleaf', patientId: 'p3', doctorId: 'priya', date: addDays(date, -1), time: '11:00', duration: 30, reason: 'Follow-up visit', status: 'scheduled' },
    { id: 'past2', clinicId: 'greenleaf', patientId: 'p5', doctorId: 'arjun', date: addDays(date, -2), time: '16:30', duration: 30, reason: 'Pediatric consultation', status: 'scheduled' },
  );
  const deliveries: MessageDelivery[] = db.appointments.filter(a => a.clinicId === 'greenleaf').slice(0, 9).map((a, i) => ({
    id: 'd' + i, clinicId: a.clinicId, appointmentId: a.id, patientId: a.patientId, slot: i % 2 ? 'appointment_day' : 'booked',
    appointmentDate: a.date, appointmentTime: a.time, status: i === 4 ? 'failed' : 'accepted', error: i === 4 ? 'Template rejected by provider' : undefined,
  }));
  const prescriptions: Prescription[] = [{
    id: 'rx1', clinicId: 'greenleaf', patientId: 'p0', doctorId: 'priya', appointmentId: 'a0', date, age: '34', sex: 'M', specialty: 'dental',
    vitals: { bp: '124/80', pulse: '', temp: '', weight: '', spo2: '' }, history: 'Diabetic', complaints: 'Pain in lower left back tooth for 3 days, worse at night', teeth: [36],
    findings: 'Deep occlusal caries, tender on percussion', diagnosis: 'Irreversible pulpitis', procedures: 'RCT – access opening', plan: 'Root canal treatment\nCrown',
    medicines: [
      { id: 'm1', name: 'Tab Amoxicillin + Clavulanate 625 mg', frequency: '1-0-1', timing: 'after', days: '5', notes: '' },
      { id: 'm2', name: 'Tab Aceclofenac + Paracetamol', frequency: '1-0-1', timing: 'after', days: '3', notes: 'Only if there is pain' },
    ], advice: 'Avoid chewing on the treated side\nComplete the full course of antibiotics', tests: 'IOPA 36', followUp: addDays(date, 7), createdAt: new Date().toISOString(), sentAt: new Date().toISOString(),
  }];
  return { db, deliveries, prescriptions, digests: [] as DoctorDigestDelivery[] };
}

export function createDemoRepository(): Repository {
  const state = demoData();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const watch = (fn: () => void) => { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; };
  const upsert = <T extends { id: string }>(list: T[], item: T) => [...list.filter(x => x.id !== item.id), item];
  const later = () => new Promise<void>(resolve => setTimeout(() => { emit(); resolve(); }, 120));
  return {
    subscribeDatabase: (_a, onUpdate) => watch(() => onUpdate({ ...state.db } as Database)),
    subscribeDeliveries: (_a, onUpdate) => watch(() => onUpdate(state.deliveries)),
    subscribeDoctorDigests: (_a, onUpdate) => watch(() => onUpdate(state.digests)),
    subscribePrescriptions: (_a, onUpdate) => watch(() => onUpdate(state.prescriptions)),
    saveClinic: async c => { state.db.clinics = state.db.clinics.map(x => x.id === c.id ? c : x); return later(); },
    savePatient: async p => { state.db.patients = upsert(state.db.patients, p); return later(); },
    saveAppointment: async a => { state.db.appointments = upsert(state.db.appointments, a); return later(); },
    savePrescription: async rx => { state.prescriptions = upsert(state.prescriptions, rx); return later(); },
    sendPrescription: async (id, pdf) => {
      const rx = state.prescriptions.find(p => p.id === id)!;
      console.info(`Demo: would send a ${Math.round(pdf.length * 0.75 / 1024)} KB prescription PDF via MSG91`);
      state.prescriptions = upsert(state.prescriptions, { ...rx, sentAt: new Date().toISOString() });
      state.deliveries = [...state.deliveries, { id: 'rx-' + id + Date.now(), clinicId: rx.clinicId, appointmentId: rx.appointmentId, patientId: rx.patientId, slot: 'prescription', appointmentDate: rx.date, appointmentTime: '', status: 'accepted' }];
      await later();
      return { status: 'accepted' as const };
    },
  };
}
