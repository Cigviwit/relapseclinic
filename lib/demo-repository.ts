import { seed, addDays, validateAppointment } from './clinic';
import type { Account } from './auth-service';
import { staleRecordMessage, type AuditEntry, type Repository, type MessageDelivery, type DoctorDigestDelivery, type StaffMember } from './firestore-repository';
import { roleOptions, type Role } from './permissions';
import type { Prescription } from './prescription';
import { blankPatientRecord, recordChanges, type PatientNote, type PatientRecord, type RecordAudit } from './patient-record';
import { closingId, daySummary, makeClosing, type Bill, type DayClosing, type LedgerEntry } from './billing';

/**
 * In-memory data for trying the workspace on localhost without Firebase.
 * Open http://localhost:5173/?demo — nothing is saved or sent.
 * ?demo=frontdesk (or doctor, billing, platform) shows the workspace as that role.
 */
export function isDemoMode() {
  if (typeof window === 'undefined') return false;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  return local && new URLSearchParams(window.location.search).has('demo');
}

const demoNames: Record<string, string> = { owner: 'Dr. Priya Nair', doctor: 'Dr. Arjun Mehta', frontdesk: 'Asha Kulkarni', billing: 'Bilal Shaikh', platform: 'Platform administrator' };
export function demoAccount() {
  const asked = new URLSearchParams(window.location.search).get('demo') || 'owner';
  const role = (asked in demoNames ? asked : 'owner') as Role;
  return { user: { email: `${role}@greenleaf.demo`, uid: 'demo-' + role }, role, clinicId: role === 'platform' ? null : 'greenleaf', name: demoNames[role], doctorId: role === 'doctor' ? 'arjun' : role === 'owner' ? 'priya' : '' } as unknown as Account;
}

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
    ], advice: 'Avoid chewing on the treated side\nComplete the full course of antibiotics', tests: 'IOPA 36', followUp: addDays(date, 7), createdAt: new Date().toISOString(), sentAt: new Date().toISOString(), status: 'final', finalizedBy: 'Dr. Priya Nair',
  }];
  const stamp = new Date().toISOString();
  const records: PatientRecord[] = [
    { ...blankPatientRecord('greenleaf', 'p0'), fileNo: 'GL-1024', dob: addDays(date, -34 * 365 - 40), sex: 'M', bloodGroup: 'B+', occupation: 'Teacher', address: '12th Main, Indiranagar, Bengaluru', emergencyName: 'Sunita Sharma (wife)', emergencyPhone: '+918000000150', allergyStatus: 'known', allergies: [{ id: 'al1', substance: 'Penicillin', reaction: 'Rash and swelling', severity: 'severe' }], conditions: 'Type 2 diabetes\nHypertension', medications: 'Metformin 500 mg twice daily\nTelmisartan 40 mg once daily', surgeries: 'Appendectomy, 2016', familyHistory: 'Father: diabetes', tobacco: 'former', alcohol: 'never', version: 2, updatedAt: stamp, updatedBy: 'demo' },
    { ...blankPatientRecord('greenleaf', 'p1'), dob: addDays(date, -58 * 365), dobEstimated: true, sex: 'F', allergyStatus: 'none', version: 1, updatedAt: stamp, updatedBy: 'demo' },
  ];
  const notes: PatientNote[] = [
    { id: 'n1', clinicId: 'greenleaf', patientId: 'p0', doctorId: 'priya', date: addDays(date, -21), text: 'Sensitivity on lower left molar, worse with cold. Advised review if it persists.', vitals: { bp: '130/84', pulse: '78', temp: '', weight: '74', spo2: '' }, createdAt: stamp, createdBy: 'demo', createdByName: 'Dr. Priya Nair' },
  ];
  const audit: RecordAudit[] = [
    { id: 'p0_2', clinicId: 'greenleaf', patientId: 'p0', version: 2, changes: [{ field: 'allergyStatus', from: 'unknown', to: 'known' }, { field: 'allergies', from: [], to: records[0].allergies }], changedAt: stamp, changedBy: 'demo' },
  ];
  Object.assign(dental, { billingEnabled: true, billing: { upiId: 'greenleafdental@okhdfc', upiName: 'Greenleaf Dental Care', fees: [
    { id: 'f1', name: 'Consultation', price: 50000 }, { id: 'f2', name: 'Scaling & polishing', price: 150000 }, { id: 'f3', name: 'Filling', price: 120000 },
    { id: 'f4', name: 'Extraction', price: 100000 }, { id: 'f5', name: 'Root canal – per sitting', price: 350000 }, { id: 'f6', name: 'IOPA X-ray', price: 20000 },
  ] } });
  const demoBill = (id: string, number: string, patientId: string, day: string, appointmentId: string | undefined, description: string, price: number): Bill => ({ id, number, clinicId: 'greenleaf', patientId, doctorId: 'priya', date: day, ...(appointmentId ? { appointmentId } : {}), lines: [{ id: id + 'l', description, qty: 1, unitPrice: price, taxRate: 0 }], subtotal: price, discount: 0, tax: 0, total: price, status: 'active', createdBy: 'Asha Kulkarni', createdAt: stamp });
  const demoPay = (id: string, patientId: string, day: string, billId: string | undefined, method: LedgerEntry['method'], amount: number): LedgerEntry => ({ id, clinicId: 'greenleaf', patientId, kind: 'payment', method, amount, date: day, ...(billId ? { billId } : {}), collectedBy: 'Asha Kulkarni', createdAt: stamp });
  const bills: Bill[] = [
    demoBill('b1', '2026-27/00001', 'p0', date, 'a0', 'Consultation', 50000),
    demoBill('b2', '2026-27/00002', 'p1', date, 'a1', 'Root canal – per sitting', 350000),
    demoBill('b3', '2026-27/00003', 'p5', addDays(date, -6), undefined, 'Extraction', 100000),
  ];
  const ledger: LedgerEntry[] = [demoPay('e1', 'p0', date, 'b1', 'upi', 50000), demoPay('e2', 'p1', date, 'b2', 'cash', 200000), demoPay('e3', 'p2', addDays(date, -2), undefined, 'upi', 500000)];
  const staff: StaffMember[] = roleOptions.map((r, i) => ({ uid: 'demo-' + r.value, clinicId: 'greenleaf', name: demoNames[r.value], email: `${r.value}@greenleaf.demo`, role: r.value, doctorId: r.value === 'doctor' ? 'arjun' : r.value === 'owner' ? 'priya' : '', active: i < 4 }));
  const activity: AuditEntry[] = [
    { id: 'l1', clinicId: 'greenleaf', collection: 'patients', docId: 'p0', action: 'update', fields: ['phone'], patientId: 'p0', actorUid: 'demo-frontdesk', actorName: 'Asha Kulkarni', at: stamp },
    { id: 'l2', clinicId: 'greenleaf', collection: 'bills', docId: 'b1', action: 'create', fields: [], patientId: 'p0', actorUid: 'demo-frontdesk', actorName: 'Asha Kulkarni', at: stamp },
    { id: 'l3', clinicId: 'greenleaf', collection: 'prescriptions', docId: 'rx1', action: 'create', fields: [], patientId: 'p0', actorUid: 'demo-owner', actorName: 'Dr. Priya Nair', at: stamp },
  ];
  return { db, deliveries, prescriptions, records, notes, audit, digests: [] as DoctorDigestDelivery[], bills, ledger, closings: [] as DayClosing[], staff, activity };
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
  const log = (entry: Pick<AuditEntry, 'collection' | 'docId' | 'action' | 'fields' | 'patientId'>) => {
    const me = demoAccount();
    state.activity = [{ ...entry, id: crypto.randomUUID(), clinicId: 'greenleaf', actorUid: me.user.uid, actorName: me.name, at: new Date().toISOString() }, ...state.activity];
  };
  const inClinic = <T extends { clinicId: string }>(list: T[], clinicId: string) => list.filter(x => x.clinicId === clinicId);
  return {
    subscribeClinics: (_a, onUpdate) => watch(() => onUpdate(state.db.clinics)),
    subscribeClinicData: (clinicId, _from, onUpdate) => watch(() => onUpdate({ patients: inClinic(state.db.patients, clinicId), appointments: inClinic(state.db.appointments, clinicId), reminders: inClinic(state.db.reminders, clinicId) })),
    subscribeDeliveries: (clinicId, _from, onUpdate) => watch(() => onUpdate(inClinic(state.deliveries, clinicId))),
    subscribeDoctorDigests: (clinicId, _from, onUpdate) => watch(() => onUpdate(inClinic(state.digests, clinicId))),
    subscribePrescriptions: (clinicId, _from, onUpdate) => watch(() => onUpdate(inClinic(state.prescriptions, clinicId))),
    subscribePatientHistory: (_c, patientId, includeRx, onUpdate) => watch(() => onUpdate({ appointments: state.db.appointments.filter(a => a.patientId === patientId), prescriptions: includeRx ? state.prescriptions.filter(r => r.patientId === patientId) : [] })),
    loadAppointments: async (clinicId, from, to) => inClinic(state.db.appointments, clinicId).filter(a => a.date >= from && a.date <= to),
    getPrescription: async id => state.prescriptions.find(p => p.id === id) || null,
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
    addPatientNote: async (account, n) => { state.notes = [...state.notes, { ...n, createdAt: new Date().toISOString(), createdBy: account.user.uid, createdByName: account.name }]; return later(); },
    saveClinic: async c => { state.db.clinics = state.db.clinics.map(x => x.id === c.id ? c : x); log({ collection: 'clinics', docId: c.id, action: 'update', fields: [] }); return later(); },
    setPrescriptionsEnabled: async (id, prescriptionsEnabled) => { state.db.clinics = state.db.clinics.map(x => x.id === id ? { ...x, prescriptionsEnabled } : x); return later(); },
    savePatient: async p => { state.db.patients = upsert(state.db.patients, p); log({ collection: 'patients', docId: p.id, action: 'update', fields: [], patientId: p.id }); return later(); },
    bookAppointment: async a => {
      validateAppointment(state.db, a);
      state.db.appointments = upsert(state.db.appointments, a);
      log({ collection: 'appointments', docId: a.id, action: 'create', fields: [], patientId: a.patientId });
      return later();
    },
    setAppointmentStatus: async (id, status) => {
      state.db.appointments = state.db.appointments.map(a => a.id === id ? { ...a, status } : a);
      log({ collection: 'appointments', docId: id, action: 'update', fields: ['status'] });
      return later();
    },
    savePrescription: async (account, rx) => {
      if (state.prescriptions.find(p => p.id === rx.id)?.status === 'final') throw new Error('A final prescription cannot be changed.');
      state.prescriptions = upsert(state.prescriptions, { ...rx, ...(rx.status === 'final' ? { finalizedBy: account.name, finalizedAt: new Date().toISOString() } : {}) });
      log({ collection: 'prescriptions', docId: rx.id, action: 'update', fields: rx.status === 'final' ? ['status'] : [], patientId: rx.patientId });
      return later();
    },
    subscribeBills: (clinicId, onUpdate) => watch(() => onUpdate(inClinic(state.bills, clinicId))),
    subscribeLedger: (clinicId, onUpdate) => watch(() => onUpdate(inClinic(state.ledger, clinicId))),
    subscribeDayClosings: (clinicId, onUpdate) => watch(() => onUpdate(inClinic(state.closings, clinicId))),
    setBillingEnabled: async (id, billingEnabled) => { state.db.clinics = state.db.clinics.map(x => x.id === id ? { ...x, billingEnabled } : x); return later(); },
    saveBill: async (account, b) => {
      if (isClosed(b.clinicId, b.date)) throw new Error(closedMessage);
      state.bills = upsert(state.bills, { ...b, createdBy: account.name, number: `2026-27/${String(state.bills.length + 1).padStart(5, '0')}` });
      log({ collection: 'bills', docId: b.id, action: 'create', fields: [], patientId: b.patientId });
      return later();
    },
    voidBill: async (account, id, change) => {
      if (state.bills.some(b => b.id === id && isClosed(b.clinicId, change.voidedOn))) throw new Error(closedMessage);
      state.bills = state.bills.map(b => b.id === id ? { ...b, ...change, voidedBy: account.name, status: 'void' as const } : b);
      log({ collection: 'bills', docId: id, action: 'update', fields: ['status', 'voidReason'] });
      return later();
    },
    addLedgerEntry: async (account, e) => {
      if (isClosed(e.clinicId, e.date)) throw new Error(closedMessage);
      state.ledger = [...state.ledger, { ...e, collectedBy: account.name, createdAt: new Date().toISOString() }];
      log({ collection: 'ledgerEntries', docId: e.id, action: 'create', fields: [], patientId: e.patientId });
      return later();
    },
    closeDay: async ({ clinicId, date, countedCash, note }) => {
      if (isClosed(clinicId, date)) throw new Error(closedMessage);
      state.closings = upsert(state.closings, makeClosing(clinicId, date, daySummary(date, state.bills, state.ledger), countedCash, demoAccount().name, note || ''));
      log({ collection: 'dayClosings', docId: closingId(clinicId, date), action: 'create', fields: [] });
      return later();
    },
    sendPrescription: async (id, pdf) => {
      const rx = state.prescriptions.find(p => p.id === id)!;
      console.info(`Demo: would send a ${Math.round(pdf.length * 0.75 / 1024)} KB prescription PDF via MSG91`);
      state.prescriptions = upsert(state.prescriptions, { ...rx, sentAt: new Date().toISOString() });
      state.deliveries = [...state.deliveries, { id: 'rx-' + id + Date.now(), clinicId: rx.clinicId, appointmentId: rx.appointmentId, patientId: rx.patientId, slot: 'prescription', appointmentDate: rx.date, appointmentTime: '', status: 'accepted' }];
      await later();
      return { status: 'accepted' as const };
    },
    subscribeStaff: (clinicId, onUpdate) => watch(() => onUpdate(inClinic(state.staff, clinicId))),
    createStaff: async input => {
      const uid = crypto.randomUUID();
      state.staff = [...state.staff, { uid, ...input, active: true }];
      log({ collection: 'users', docId: uid, action: 'create', fields: [] });
      await later();
      return { uid, setupLink: 'https://example.invalid/demo-password-link' };
    },
    updateStaff: async ({ uid, ...change }) => {
      const defined = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
      state.staff = state.staff.map(m => m.uid === uid ? { ...m, ...defined } : m);
      log({ collection: 'users', docId: uid, action: 'update', fields: Object.keys(defined) });
      return later();
    },
    staffSetupLink: async () => 'https://example.invalid/demo-password-link',
    createClinic: async () => ({ setupLink: 'https://example.invalid/demo-password-link' }),
    subscribeAuditLog: (clinicId, onUpdate) => watch(() => onUpdate(inClinic(state.activity, clinicId).slice(0, 200))),
    exportClinicData: async clinicId => {
      log({ collection: 'clinics', docId: clinicId, action: 'export', fields: [] });
      emit();
      return { patients: inClinic(state.db.patients, clinicId), appointments: inClinic(state.db.appointments, clinicId), patientRecords: inClinic(state.records, clinicId), patientNotes: inClinic(state.notes, clinicId), prescriptions: inClinic(state.prescriptions, clinicId), bills: inClinic(state.bills, clinicId), ledgerEntries: inClinic(state.ledger, clinicId), dayClosings: inClinic(state.closings, clinicId) };
    },
  };
}
