import { seed, addDays, type Database } from './clinic';
import type { Account } from './auth-service';
import { staleRecordMessage, type Repository, type MessageDelivery, type DoctorDigestDelivery } from './firestore-repository';
import type { Prescription } from './prescription';
import { blankPatientRecord, recordChanges, type PatientNote, type PatientRecord, type RecordAudit } from './patient-record';
import { closingId, type Bill, type DayClosing, type LedgerEntry } from './billing';

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
  Object.assign(dental, { name: 'Greenleaf Dental Care', prescriptionsEnabled: true, rxPad: { specialty: 'dental', style: 'classic', accent: '#1f5fbf', tagline: 'Complete family dental care', footer: 'Mon–Sat 9 AM – 7 PM · For emergencies call the clinic number', paper: 'A5' } });
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
  const stamp = new Date().toISOString();
  const records: PatientRecord[] = [
    { ...blankPatientRecord('greenleaf', 'p0'), fileNo: 'GL-1024', dob: addDays(date, -34 * 365 - 40), sex: 'M', bloodGroup: 'B+', occupation: 'Teacher', address: '12th Main, Indiranagar, Bengaluru', emergencyName: 'Sunita Sharma (wife)', emergencyPhone: '+918000000150', allergyStatus: 'known', allergies: [{ id: 'al1', substance: 'Penicillin', reaction: 'Rash and swelling', severity: 'severe' }], conditions: 'Type 2 diabetes\nHypertension', medications: 'Metformin 500 mg twice daily\nTelmisartan 40 mg once daily', surgeries: 'Appendectomy, 2016', familyHistory: 'Father: diabetes', tobacco: 'former', alcohol: 'never', version: 2, updatedAt: stamp, updatedBy: 'demo' },
    { ...blankPatientRecord('greenleaf', 'p1'), dob: addDays(date, -58 * 365), dobEstimated: true, sex: 'F', allergyStatus: 'none', version: 1, updatedAt: stamp, updatedBy: 'demo' },
  ];
  const notes: PatientNote[] = [
    { id: 'n1', clinicId: 'greenleaf', patientId: 'p0', doctorId: 'priya', date: addDays(date, -21), text: 'Sensitivity on lower left molar, worse with cold. Advised review if it persists.', vitals: { bp: '130/84', pulse: '78', temp: '', weight: '74', spo2: '' }, createdAt: stamp, createdBy: 'demo' },
  ];
  const audit: RecordAudit[] = [
    { id: 'p0_2', clinicId: 'greenleaf', patientId: 'p0', version: 2, changes: [{ field: 'allergyStatus', from: 'unknown', to: 'known' }, { field: 'allergies', from: [], to: records[0].allergies }], changedAt: stamp, changedBy: 'demo' },
  ];
  Object.assign(dental, { billingEnabled: true, billing: { upiId: 'greenleafdental@okhdfc', upiName: 'Greenleaf Dental Care', fees: [
    { id: 'f1', name: 'Consultation', price: 50000 }, { id: 'f2', name: 'Scaling & polishing', price: 150000 }, { id: 'f3', name: 'Filling', price: 120000 },
    { id: 'f4', name: 'Extraction', price: 100000 }, { id: 'f5', name: 'Root canal – per sitting', price: 350000 }, { id: 'f6', name: 'IOPA X-ray', price: 20000 },
  ] } });
  const demoBill = (id: string, number: string, patientId: string, day: string, appointmentId: string | undefined, description: string, price: number): Bill => ({ id, number, clinicId: 'greenleaf', patientId, doctorId: 'priya', date: day, ...(appointmentId ? { appointmentId } : {}), lines: [{ id: id + 'l', description, qty: 1, unitPrice: price, taxRate: 0 }], subtotal: price, discount: 0, tax: 0, total: price, status: 'active', createdBy: 'Asha', createdAt: stamp });
  const demoPay = (id: string, patientId: string, day: string, billId: string | undefined, method: LedgerEntry['method'], amount: number): LedgerEntry => ({ id, clinicId: 'greenleaf', patientId, kind: 'payment', method, amount, date: day, ...(billId ? { billId } : {}), collectedBy: 'Asha', createdAt: stamp });
  const bills: Bill[] = [
    demoBill('b1', '2026-27/00001', 'p0', date, 'a0', 'Consultation', 50000),
    demoBill('b2', '2026-27/00002', 'p1', date, 'a1', 'Root canal – per sitting', 350000),
    demoBill('b3', '2026-27/00003', 'p5', addDays(date, -6), undefined, 'Extraction', 100000),
  ];
  const ledger: LedgerEntry[] = [demoPay('e1', 'p0', date, 'b1', 'upi', 50000), demoPay('e2', 'p1', date, 'b2', 'cash', 200000), demoPay('e3', 'p2', addDays(date, -2), undefined, 'upi', 500000)];
  return { db, deliveries, prescriptions, records, notes, audit, digests: [] as DoctorDigestDelivery[], bills, ledger, closings: [] as DayClosing[] };
}

export function createDemoRepository(): Repository {
  const state = demoData();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const watch = (fn: () => void) => { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; };
  const upsert = <T extends { id: string }>(list: T[], item: T) => [...list.filter(x => x.id !== item.id), item];
  const later = () => new Promise<void>(resolve => setTimeout(() => { emit(); resolve(); }, 120));
  const isClosed = (clinicId: string, date: string) => state.closings.some(c => c.id === closingId(clinicId, date));
  const closedMessage = 'That day is already closed.';
  return {
    subscribeDatabase: (_a, onUpdate) => watch(() => onUpdate({ ...state.db } as Database)),
    subscribeDeliveries: (_a, onUpdate) => watch(() => onUpdate(state.deliveries)),
    subscribeDoctorDigests: (_a, onUpdate) => watch(() => onUpdate(state.digests)),
    subscribePrescriptions: (_a, onUpdate) => watch(() => onUpdate(state.prescriptions)),
    subscribePatientRecord: (_c, patientId, onUpdate) => watch(() => onUpdate(state.records.find(r => r.patientId === patientId) || null)),
    subscribePatientNotes: (_c, patientId, onUpdate) => watch(() => onUpdate(state.notes.filter(n => n.patientId === patientId))),
    subscribeRecordAudit: (_c, patientId, onUpdate) => watch(() => onUpdate(state.audit.filter(a => a.patientId === patientId))),
    savePatientRecord: async (account, r) => {
      const current = state.records.find(x => x.id === r.id);
      if ((current?.version || 0) !== r.version) throw new Error(staleRecordMessage);
      const saved = { ...r, version: r.version + 1, updatedAt: new Date().toISOString(), updatedBy: account.user.uid };
      const changes = recordChanges(current, saved);
      state.records = upsert(state.records, saved);
      if (changes.length) state.audit = [...state.audit, { id: `${r.id}_${saved.version}`, clinicId: r.clinicId, patientId: r.patientId, version: saved.version, changes, changedAt: saved.updatedAt, changedBy: saved.updatedBy }];
      return later();
    },
    addPatientNote: async (account, n) => { state.notes = [...state.notes, { ...n, createdAt: new Date().toISOString(), createdBy: account.user.uid }]; return later(); },
    saveClinic: async c => { state.db.clinics = state.db.clinics.map(x => x.id === c.id ? c : x); return later(); },
    setPrescriptionsEnabled: async (id, prescriptionsEnabled) => { state.db.clinics = state.db.clinics.map(x => x.id === id ? { ...x, prescriptionsEnabled } : x); return later(); },
    savePatient: async p => { state.db.patients = upsert(state.db.patients, p); return later(); },
    saveAppointment: async a => { state.db.appointments = upsert(state.db.appointments, a); return later(); },
    savePrescription: async rx => { state.prescriptions = upsert(state.prescriptions, rx); return later(); },
    subscribeBills: (_a, onUpdate) => watch(() => onUpdate(state.bills)),
    subscribeLedger: (_a, onUpdate) => watch(() => onUpdate(state.ledger)),
    subscribeDayClosings: (_a, onUpdate) => watch(() => onUpdate(state.closings)),
    setBillingEnabled: async (id, billingEnabled) => { state.db.clinics = state.db.clinics.map(x => x.id === id ? { ...x, billingEnabled } : x); return later(); },
    saveBill: async (_a, b) => {
      if (isClosed(b.clinicId, b.date)) throw new Error(closedMessage);
      state.bills = upsert(state.bills, { ...b, number: `2026-27/${String(state.bills.length + 1).padStart(5, '0')}` });
      return later();
    },
    voidBill: async (_a, id, change) => {
      if (state.bills.some(b => b.id === id && isClosed(b.clinicId, change.voidedOn))) throw new Error(closedMessage);
      state.bills = state.bills.map(b => b.id === id ? { ...b, ...change, status: 'void' as const } : b);
      return later();
    },
    addLedgerEntry: async (_a, e) => {
      if (isClosed(e.clinicId, e.date)) throw new Error(closedMessage);
      state.ledger = [...state.ledger, { ...e, createdAt: new Date().toISOString() }];
      return later();
    },
    closeDay: async (_a, c) => { state.closings = upsert(state.closings, c); return later(); },
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
