import { collection, deleteField, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, type DocumentData, type QueryDocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import { auth, callFunction, firestore, ServerUnreachable } from "./firebase";
import { type Account } from "./auth-service";
import { type Clinic, type Patient, type Appointment, type Reminder } from "./clinic";
import { withDefaults, type Prescription } from "./prescription";
import { type Bill, type DayClosing, type LedgerEntry } from "./billing";
import { blankPatientRecord, type PatientNote, type PatientRecord, type RecordAudit } from "./patient-record";
import { mergeById } from "./data-window";
import type { VisitStage } from "./queue";
import type { WaitlistEntry } from "./front-desk";
import type { PatientFile } from "./patient-file";
import type { Catalog } from "./catalog";
import { OPEN_LAB, type LabCase, type Recall, type TreatmentPlan } from "./dental";
import { plainValue } from "./csv";
import type { StaffRole } from "./permissions";

type Unsubscribe = () => void;
type OnError = (error: Error) => void;
export type ClinicData = { patients: Patient[]; appointments: Appointment[]; reminders: Reminder[] };
export type PatientHistory = { appointments: Appointment[]; prescriptions: Prescription[] };
export type StaffMember = { uid: string; clinicId: string; name: string; email: string; role: StaffRole; doctorId: string; active: boolean };
export type NewStaff = { clinicId: string; name: string; email: string; role: StaffRole; doctorId: string };
export type AuditEntry = { id: string; clinicId: string; collection: string; docId: string; action: 'create' | 'update' | 'delete' | 'export' | 'merge'; fields: string[]; patientId?: string; actorUid: string; actorName: string; at: string };

export type Repository = {
  subscribeClinics(account: Account, onUpdate: (clinics: Clinic[]) => void, onError: OnError): Unsubscribe;
  /** One clinic's patients, its appointments since `from` and any older visit still needing an outcome. */
  subscribeClinicData(clinicId: string, from: string, onUpdate: (data: ClinicData) => void, onError: OnError): Unsubscribe;
  subscribeDeliveries(clinicId: string, from: string, onUpdate: (records: MessageDelivery[]) => void, onError: OnError): Unsubscribe;
  subscribeDoctorDigests(clinicId: string, from: string, onUpdate: (records: DoctorDigestDelivery[]) => void, onError: OnError): Unsubscribe;
  subscribePrescriptions(clinicId: string, from: string, onUpdate: (records: Prescription[]) => void, onError: OnError): Unsubscribe;
  /** Every visit and prescription for one patient, while that patient is open. */
  subscribePatientHistory(clinicId: string, patientId: string, includeRx: boolean, onUpdate: (history: PatientHistory) => void, onError: OnError): Unsubscribe;
  /** Visits outside the live window, for looking back through the schedule. */
  loadAppointments(clinicId: string, from: string, to: string): Promise<Appointment[]>;
  getPrescription(id: string): Promise<Prescription | null>;
  saveClinic(clinic: Clinic): Promise<void>;
  /** Administrator only; firestore.rules rejects it from clinic accounts. */
  setPrescriptionsEnabled(clinicId: string, enabled: boolean): Promise<void>;
  savePatient(patient: Patient): Promise<void>;
  /** Books or reschedules on the server, which refuses a clash. Fails when offline. */
  bookAppointment(appointment: Appointment): Promise<void>;
  /** Records what happened to a booked visit. */
  setAppointmentStatus(appointmentId: string, status: Appointment['status']): Promise<void>;
  /** Adds someone to today's queue now. Fails when offline. The server sets the date and time. */
  bookWalkIn(appointment: Pick<Appointment, 'id' | 'clinicId' | 'patientId' | 'doctorId' | 'reason'>): Promise<void>;
  /** Moves a booked visit through the queue; `null` undoes an arrival made by mistake. */
  setVisitStage(appointmentId: string, stage: VisitStage | null): Promise<void>;
  /** `status: 'final'` locks the prescription for good, under the signed-in person's name. */
  savePrescription(account: Account, prescription: Prescription): Promise<void>;
  /** Sends the PDF through the clinic's MSG91 WhatsApp number. */
  sendPrescription(prescriptionId: string, pdfBase64: string, fileName: string): Promise<SendResult>;
  /** The patient-record calls below listen to one patient at a time, while that patient is open. */
  subscribePatientRecord(clinicId: string, patientId: string, onUpdate: (record: PatientRecord | null) => void, onError: OnError): Unsubscribe;
  subscribePatientNotes(clinicId: string, patientId: string, onUpdate: (notes: PatientNote[]) => void, onError: OnError): Unsubscribe;
  subscribeRecordAudit(clinicId: string, patientId: string, onUpdate: (entries: RecordAudit[]) => void, onError: OnError): Unsubscribe;
  /** `record.version` is the version the edit started from. Refused if someone has saved since. */
  savePatientRecord(account: Account, record: PatientRecord): Promise<void>;
  addPatientNote(account: Account, note: PatientNote): Promise<void>;
  subscribeBills(clinicId: string, onUpdate: (records: Bill[]) => void, onError: OnError): Unsubscribe;
  subscribeLedger(clinicId: string, onUpdate: (records: LedgerEntry[]) => void, onError: OnError): Unsubscribe;
  subscribeDayClosings(clinicId: string, onUpdate: (records: DayClosing[]) => void, onError: OnError): Unsubscribe;
  /** Administrator only; firestore.rules rejects it from clinic accounts. */
  setBillingEnabled(clinicId: string, enabled: boolean): Promise<void>;
  saveBill(account: Account, bill: Bill): Promise<void>;
  voidBill(account: Account, billId: string, change: { voidReason: string; voidedOn: string }): Promise<void>;
  addLedgerEntry(account: Account, entry: LedgerEntry): Promise<void>;
  /** The server works out the totals from the stored entries. */
  closeDay(input: { clinicId: string; date: string; countedCash: number; note?: string }): Promise<void>;
  subscribeWaitlist(clinicId: string, onUpdate: (entries: WaitlistEntry[]) => void, onError: OnError): Unsubscribe;
  addToWaitlist(entry: WaitlistEntry): Promise<void>;
  setWaitlistStatus(id: string, status: 'booked' | 'removed'): Promise<void>;
  linkFamily(a: Patient, b: Patient, familyId: string): Promise<void>;
  unlinkFamily(patient: Patient): Promise<void>;
  /** Owner only. Moves everything from one patient to the other on the server. It cannot be undone. */
  mergePatients(clinicId: string, keepId: string, mergeId: string): Promise<void>;
  subscribePatientFiles(clinicId: string, patientId: string, onUpdate: (files: PatientFile[]) => void, onError: OnError): Unsubscribe;
  uploadPatientFile(input: { clinicId: string; patientId: string; name: string; kind: string; note?: string; data: string }): Promise<void>;
  getPatientFile(id: string): Promise<{ name: string; contentType: string; data: string }>;
  removePatientFile(id: string, reason: string): Promise<void>;
  subscribeCatalog(clinicId: string, onUpdate: (catalog: Catalog | null) => void, onError: OnError): Unsubscribe;
  saveCatalog(catalog: Catalog): Promise<void>;
  subscribePlans(clinicId: string, patientId: string, onUpdate: (plans: TreatmentPlan[]) => void, onError: OnError): Unsubscribe;
  /** `plan.version` is the version the edit started from. Refused if someone has saved since. */
  savePlan(plan: TreatmentPlan): Promise<void>;
  subscribeOpenLabCases(clinicId: string, onUpdate: (cases: LabCase[]) => void, onError: OnError): Unsubscribe;
  subscribePatientLabCases(clinicId: string, patientId: string, onUpdate: (cases: LabCase[]) => void, onError: OnError): Unsubscribe;
  saveLabCase(labCase: LabCase): Promise<void>;
  subscribeDueRecalls(clinicId: string, onUpdate: (recalls: Recall[]) => void, onError: OnError): Unsubscribe;
  saveRecall(recall: Recall): Promise<void>;
  subscribeStaff(clinicId: string, onUpdate: (staff: StaffMember[]) => void, onError: OnError): Unsubscribe;
  createStaff(input: NewStaff): Promise<{ uid: string; setupLink: string }>;
  updateStaff(input: { uid: string; name?: string; role?: StaffRole; doctorId?: string; active?: boolean }): Promise<void>;
  staffSetupLink(uid: string): Promise<string>;
  createClinic(clinic: Clinic, ownerName: string, ownerEmail: string): Promise<{ setupLink: string }>;
  subscribeAuditLog(clinicId: string, onUpdate: (entries: AuditEntry[]) => void, onError: OnError): Unsubscribe;
  /** Everything this person may read for the clinic, as plain data. The download is recorded in the activity log first. */
  exportClinicData(clinicId: string, onProgress?: (name: string) => void): Promise<Record<string, unknown[]>>;
};
export type SendResult = { status: 'accepted' | 'failed' | 'unknown'; error?: string };
export const staleRecordMessage = "This record could not be saved because it changed on another screen. Reopen it and try again.";

/** Server timestamps become ISO strings here so the rest of the app only sees strings. */
const iso = (value: unknown) => (value as { toDate?: () => Date } | null)?.toDate?.().toISOString() ?? "";
const inClinic = (name: string, clinicId: string) => query(collection(firestore, name), where("clinicId", "==", clinicId));
const forPatient = (name: string, clinicId: string, patientId: string) => query(collection(firestore, name), where("clinicId", "==", clinicId), where("patientId", "==", patientId));
const since = (name: string, field: string, clinicId: string, from: string) => query(collection(firestore, name), where("clinicId", "==", clinicId), where(field, ">=", from));
const rows = (snap: QuerySnapshot<DocumentData>) => snap.docs.map(d => d.data({ serverTimestamps: "estimate" }));
/** Offline with nothing cached, Firestore reports an empty result. That means "unknown", not "no allergies recorded". */
const unconfirmed = (snap: QuerySnapshot<DocumentData>) => snap.empty && snap.metadata.fromCache;
/** Firestore refuses undefined fields; optional fields are simply left out. */
const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const uid = () => auth.currentUser?.uid ?? "";
const toAppointment = (row: DocumentData) => ({ ...row, ...(row.arrivedAt ? { arrivedAt: iso(row.arrivedAt) } : {}), ...(row.startedAt ? { startedAt: iso(row.startedAt) } : {}), ...(row.finishedAt ? { finishedAt: iso(row.finishedAt) } : {}) }) as Appointment;
const toPrescription = (row: DocumentData) => withDefaults({ ...row, finalizedAt: iso(row.finalizedAt) } as unknown as Prescription);

// File contents stay in Cloud Storage: the download lists them and they are fetched one at a time.
const EXPORTED = ["patients", "appointments", "patientRecords", "patientNotes", "prescriptions", "bills", "ledgerEntries", "dayClosings", "messageDeliveries", "waitlist", "patientFiles", "treatmentPlans", "labCases", "recalls"];
const EXPORT_PAGE = 500;

export const firestoreRepository: Repository = {
  subscribeClinics(account, onUpdate, onError) {
    if (account.role === "platform") return onSnapshot(collection(firestore, "clinics"), snap => onUpdate(snap.docs.map(d => d.data() as Clinic)), onError);
    return onSnapshot(doc(firestore, "clinics", account.clinicId!), snap => onUpdate(snap.exists() ? [snap.data() as Clinic] : []), onError);
  },
  subscribeClinicData(clinicId, from, onUpdate, onError) {
    const parts: { patients?: Patient[]; recent?: Appointment[]; unresolved?: Appointment[]; reminders?: Reminder[] } = {};
    const notify = () => {
      const { patients, recent, unresolved, reminders } = parts;
      if (patients && recent && unresolved && reminders) onUpdate({ patients, reminders, appointments: mergeById(unresolved, recent) });
    };
    const listen = <K extends keyof typeof parts>(key: K, source: Parameters<typeof onSnapshot>[0], convert: (row: DocumentData) => unknown = row => row) => onSnapshot(source as ReturnType<typeof inClinic>, snap => { parts[key] = rows(snap).map(convert) as (typeof parts)[K]; notify(); }, onError);
    const unsubs = [
      listen("patients", inClinic("patients", clinicId)),
      listen("recent", since("appointments", "date", clinicId, from), toAppointment),
      // A visit nobody resolved stays on the front desk's list, however old it is.
      listen("unresolved", query(collection(firestore, "appointments"), where("clinicId", "==", clinicId), where("status", "==", "scheduled"), where("date", "<", from)), toAppointment),
      listen("reminders", inClinic("reminders", clinicId)),
    ];
    return () => unsubs.forEach(u => u());
  },
  subscribeDeliveries: (clinicId, from, onUpdate, onError) => onSnapshot(since("messageDeliveries", "appointmentDate", clinicId, from), snap => onUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() }) as MessageDelivery)), onError),
  subscribeDoctorDigests: (clinicId, from, onUpdate, onError) => onSnapshot(since("doctorDigestDeliveries", "date", clinicId, from), snap => onUpdate(snap.docs.map(d => ({ id: d.id, ...d.data() }) as DoctorDigestDelivery)), onError),
  subscribePrescriptions: (clinicId, from, onUpdate, onError) => onSnapshot(since("prescriptions", "date", clinicId, from), snap => onUpdate(rows(snap).map(toPrescription)), onError),
  subscribePatientHistory(clinicId, patientId, includeRx, onUpdate, onError) {
    let appointments: Appointment[] | null = null, prescriptions: Prescription[] | null = includeRx ? null : [];
    const notify = () => { if (appointments && prescriptions) onUpdate({ appointments, prescriptions }); };
    const unsubs = [onSnapshot(forPatient("appointments", clinicId, patientId), snap => { appointments = rows(snap).map(toAppointment); notify(); }, onError)];
    if (includeRx) unsubs.push(onSnapshot(forPatient("prescriptions", clinicId, patientId), snap => { prescriptions = rows(snap).map(toPrescription); notify(); }, onError));
    return () => unsubs.forEach(u => u());
  },
  async loadAppointments(clinicId, from, to) {
    const snap = await getDocs(query(collection(firestore, "appointments"), where("clinicId", "==", clinicId), where("date", ">=", from), where("date", "<=", to)));
    return rows(snap).map(toAppointment);
  },
  async getPrescription(id) {
    const snap = await getDoc(doc(firestore, "prescriptions", id));
    return snap.exists() ? toPrescription(snap.data()) : null;
  },
  subscribePatientRecord: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("patientRecords", clinicId, patientId), { includeMetadataChanges: true }, snap => {
    if (unconfirmed(snap)) return;
    const [row] = rows(snap);
    onUpdate(row ? { ...blankPatientRecord(clinicId, patientId), ...row, updatedAt: iso(row.updatedAt) } as PatientRecord : null);
  }, onError),
  subscribePatientNotes: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("patientNotes", clinicId, patientId), { includeMetadataChanges: true }, snap => {
    if (!unconfirmed(snap)) onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt) }) as PatientNote));
  }, onError),
  subscribeRecordAudit: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("patientRecordAudit", clinicId, patientId), snap => onUpdate(rows(snap).map(row => ({ ...row, changedAt: iso(row.changedAt) }) as RecordAudit)), onError),
  async savePatientRecord(account, record) {
    try { await setDoc(doc(firestore, "patientRecords", record.id), { ...record, version: record.version + 1, updatedAt: serverTimestamp(), updatedBy: account.user.uid }); }
    catch (e) { throw (e as { code?: string }).code === "permission-denied" && record.version > 0 ? new Error(staleRecordMessage) : e; }
  },
  addPatientNote: (account, note) => setDoc(doc(firestore, "patientNotes", note.id), { ...note, createdAt: serverTimestamp(), createdBy: account.user.uid, createdByName: account.name }),
  subscribeBills: (clinicId, onUpdate, onError) => onSnapshot(inClinic("bills", clinicId), snap => onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt) }) as Bill)), onError),
  subscribeLedger: (clinicId, onUpdate, onError) => onSnapshot(inClinic("ledgerEntries", clinicId), snap => onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt) }) as LedgerEntry)), onError),
  subscribeDayClosings: (clinicId, onUpdate, onError) => onSnapshot(inClinic("dayClosings", clinicId), snap => onUpdate(rows(snap).map(row => ({ ...row, closedAt: iso(row.closedAt) }) as DayClosing)), onError),
  setBillingEnabled: (clinicId, enabled) => updateDoc(doc(firestore, "clinics", clinicId), { billingEnabled: enabled, updatedBy: uid() }),
  saveBill: (account, bill) => setDoc(doc(firestore, "bills", bill.id), { ...defined(bill), createdBy: account.name, createdAt: serverTimestamp(), createdByUid: account.user.uid }),
  voidBill: (account, billId, change) => updateDoc(doc(firestore, "bills", billId), { ...change, voidedBy: account.name, status: "void", voidedAt: serverTimestamp(), voidedByUid: account.user.uid }),
  addLedgerEntry: (account, entry) => setDoc(doc(firestore, "ledgerEntries", entry.id), { ...defined(entry), collectedBy: account.name, createdAt: serverTimestamp(), createdByUid: account.user.uid }),
  closeDay: input => callFunction("closeDay", input),
  saveClinic: (clinic: Clinic) => setDoc(doc(firestore, "clinics", clinic.id), { ...defined(clinic), updatedBy: uid() }),
  setPrescriptionsEnabled: (clinicId, enabled) => updateDoc(doc(firestore, "clinics", clinicId), { prescriptionsEnabled: enabled, updatedBy: uid() }),
  savePatient: (patient: Patient) => setDoc(doc(firestore, "patients", patient.id), { ...defined(patient), updatedBy: uid(), updatedAt: serverTimestamp() }),
  bookAppointment: appointment => callFunction("bookAppointment", { appointment }),
  setAppointmentStatus: (appointmentId, status) => updateDoc(doc(firestore, "appointments", appointmentId), { status, ...(status === "completed" ? { finishedAt: serverTimestamp() } : {}), updatedBy: uid(), updatedAt: serverTimestamp() }),
  bookWalkIn: appointment => callFunction("bookWalkIn", { appointment }),
  setVisitStage(appointmentId, stage) {
    const stamp = { updatedBy: uid(), updatedAt: serverTimestamp() };
    const change = stage === "arrived" ? { stage, arrivedAt: serverTimestamp() } : stage === "with_doctor" ? { stage, startedAt: serverTimestamp() } : { stage: deleteField(), arrivedAt: deleteField(), startedAt: deleteField() };
    return updateDoc(doc(firestore, "appointments", appointmentId), { ...change, ...stamp });
  },
  savePrescription(account, prescription) {
    // The send time, finalising details and stamps are set here or on the server, never carried over from the form.
    const { sentAt: _sentAt, finalizedAt: _finalizedAt, finalizedBy: _finalizedBy, ...rest } = prescription; // eslint-disable-line @typescript-eslint/no-unused-vars
    const finalized = rest.status === "final" ? { finalizedAt: serverTimestamp(), finalizedBy: account.name } : {};
    return setDoc(doc(firestore, "prescriptions", rest.id), { ...defined(rest), ...finalized, updatedBy: account.user.uid, updatedAt: serverTimestamp() });
  },
  async sendPrescription(prescriptionId, pdf, fileName) {
    try { return await callFunction<unknown, SendResult>("sendPrescription", { prescriptionId, pdf, fileName, requestId: crypto.randomUUID() }); }
    catch (error) {
      // It may have gone through. Each try is a new message, so nobody should be told simply to try again.
      if (error instanceof ServerUnreachable) return { status: "unknown", error: "WhatsApp did not confirm the message. Check Messages before sending again." };
      throw error;
    }
  },
  subscribeCatalog: (clinicId, onUpdate, onError) => onSnapshot(doc(firestore, "clinicCatalogs", clinicId), snap => onUpdate(snap.exists() ? snap.data() as Catalog : null), onError),
  saveCatalog: catalog => setDoc(doc(firestore, "clinicCatalogs", catalog.id), { id: catalog.id, clinicId: catalog.clinicId, medicines: catalog.medicines, templates: catalog.templates, updatedBy: uid(), updatedAt: serverTimestamp() }),
  subscribePlans: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("treatmentPlans", clinicId, patientId), snap => onUpdate(rows(snap) as TreatmentPlan[]), onError),
  async savePlan(plan) {
    try { await setDoc(doc(firestore, "treatmentPlans", plan.id), { ...defined(plan), version: plan.version + 1, updatedBy: uid(), updatedAt: serverTimestamp() }); }
    catch (e) { throw (e as { code?: string }).code === "permission-denied" && plan.version > 0 ? new Error(staleRecordMessage) : e; }
  },
  subscribeOpenLabCases: (clinicId, onUpdate, onError) => onSnapshot(query(collection(firestore, "labCases"), where("clinicId", "==", clinicId), where("status", "in", OPEN_LAB)), snap => onUpdate(rows(snap) as LabCase[]), onError),
  subscribePatientLabCases: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("labCases", clinicId, patientId), snap => onUpdate(rows(snap) as LabCase[]), onError),
  saveLabCase: labCase => setDoc(doc(firestore, "labCases", labCase.id), { ...defined(labCase), updatedBy: uid(), updatedAt: serverTimestamp() }),
  subscribeDueRecalls: (clinicId, onUpdate, onError) => onSnapshot(query(collection(firestore, "recalls"), where("clinicId", "==", clinicId), where("status", "==", "due")), snap => onUpdate(rows(snap) as Recall[]), onError),
  saveRecall: recall => setDoc(doc(firestore, "recalls", recall.id), { ...defined(recall), updatedBy: uid(), updatedAt: serverTimestamp() }),
  subscribePatientFiles: (clinicId, patientId, onUpdate, onError) => onSnapshot(forPatient("patientFiles", clinicId, patientId), snap => onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt), removedAt: iso(row.removedAt) }) as PatientFile)), onError),
  uploadPatientFile: input => callFunction("uploadPatientFile", input, 120000),
  getPatientFile: id => callFunction("getPatientFile", { id }, 120000),
  removePatientFile: (id, reason) => callFunction("removePatientFile", { id, reason }),
  subscribeWaitlist: (clinicId, onUpdate, onError) => onSnapshot(query(collection(firestore, "waitlist"), where("clinicId", "==", clinicId), where("status", "==", "waiting")), snap => onUpdate(snap.docs.map(d => d.data() as WaitlistEntry)), onError),
  addToWaitlist: entry => setDoc(doc(firestore, "waitlist", entry.id), { ...defined(entry), updatedBy: uid(), updatedAt: serverTimestamp() }),
  setWaitlistStatus: (id, status) => updateDoc(doc(firestore, "waitlist", id), { status, updatedBy: uid(), updatedAt: serverTimestamp() }),
  linkFamily(a, b, familyId) {
    const batch = writeBatch(firestore);
    for (const p of [a, b]) batch.update(doc(firestore, "patients", p.id), { familyId, updatedBy: uid(), updatedAt: serverTimestamp() });
    return batch.commit();
  },
  unlinkFamily: patient => updateDoc(doc(firestore, "patients", patient.id), { familyId: deleteField(), updatedBy: uid(), updatedAt: serverTimestamp() }),
  mergePatients: (clinicId, keepId, mergeId) => callFunction("mergePatients", { clinicId, keepId, mergeId }, 300000),
  subscribeStaff: (clinicId, onUpdate, onError) => onSnapshot(inClinic("users", clinicId), snap => onUpdate(snap.docs.map(d => { const v = d.data(); return { uid: d.id, clinicId: v.clinicId, name: v.name || v.email, email: v.email, role: v.role || "owner", doctorId: v.doctorId || "", active: v.active !== false } as StaffMember; })), onError),
  createStaff: input => callFunction("createStaff", input),
  updateStaff: input => callFunction("updateStaff", input),
  staffSetupLink: async staffUid => (await callFunction<{ uid: string }, { setupLink: string }>("staffSetupLink", { uid: staffUid })).setupLink,
  createClinic: (clinic, ownerName, ownerEmail) => callFunction("createClinic", { clinic, ownerName, ownerEmail }),
  subscribeAuditLog: (clinicId, onUpdate, onError) => onSnapshot(query(collection(firestore, "auditLog"), where("clinicId", "==", clinicId), orderBy("at", "desc"), limit(200)), snap => onUpdate(snap.docs.map(d => { const v = d.data({ serverTimestamps: "estimate" }); return { ...v, id: d.id, at: iso(v.at) } as AuditEntry; })), onError),
  async exportClinicData(clinicId, onProgress) {
    await callFunction("recordDataExport", { clinicId });
    const out: Record<string, unknown[]> = {};
    for (const name of EXPORTED) {
      onProgress?.(name);
      const items: unknown[] = [];
      let last: QueryDocumentSnapshot | undefined;
      for (;;) {
        const page = await getDocs(query(collection(firestore, name), where("clinicId", "==", clinicId), orderBy(documentId()), limit(EXPORT_PAGE), ...(last ? [startAfter(last)] : [])));
        items.push(...page.docs.map(d => plainValue({ id: d.id, ...d.data() })));
        if (page.size < EXPORT_PAGE) break;
        last = page.docs[page.docs.length - 1];
      }
      out[name] = items;
    }
    return out;
  },
};

export type MessageDelivery = {
  id: string; clinicId: string; appointmentId: string; patientId: string;
  slot: string; appointmentDate: string; appointmentTime: string;
  status: 'sending' | 'accepted' | 'failed' | 'unknown'; error?: string;
  patientLanguage?: Patient['language']; templateName?: string; templateLanguage?: string;
  createdAt?: { toDate: () => Date }; updatedAt?: { toDate: () => Date };
};

export type DoctorDigestDelivery = {
  id: string; clinicId: string; doctorId: string; date: string; count: number;
  status: 'sending' | 'accepted' | 'failed' | 'unknown'; error?: string;
  mode?: 'scheduled' | 'manual'; createdAt?: { toDate: () => Date };
};
