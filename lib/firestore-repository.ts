import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData, type QuerySnapshot } from "firebase/firestore";
import { firestore } from "./firebase";
import { type Account } from "./auth-service";
import { type Database, type Clinic, type Patient, type Appointment, type Reminder } from "./clinic";
import { type Prescription } from "./prescription";
import { type Bill, type DayClosing, type LedgerEntry } from "./billing";

type Unsubscribe = () => void;
export type Repository = {
  subscribeDatabase(account: Account, onUpdate: (db: Database) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeDeliveries(account: Account, onUpdate: (records: MessageDelivery[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeDoctorDigests(account: Account, onUpdate: (records: DoctorDigestDelivery[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribePrescriptions(account: Account, onUpdate: (records: Prescription[]) => void, onError: (error: Error) => void): Unsubscribe;
  saveClinic(clinic: Clinic): Promise<void>;
  /** Administrator only; firestore.rules rejects it from clinic accounts. */
  setPrescriptionsEnabled(clinicId: string, enabled: boolean): Promise<void>;
  savePatient(patient: Patient): Promise<void>;
  saveAppointment(appointment: Appointment): Promise<void>;
  savePrescription(prescription: Prescription): Promise<void>;
  /** Sends the PDF through the clinic's MSG91 WhatsApp number. */
  sendPrescription(prescriptionId: string, pdfBase64: string, fileName: string): Promise<SendResult>;
  subscribeBills(account: Account, onUpdate: (records: Bill[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeLedger(account: Account, onUpdate: (records: LedgerEntry[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeDayClosings(account: Account, onUpdate: (records: DayClosing[]) => void, onError: (error: Error) => void): Unsubscribe;
  /** Administrator only; firestore.rules rejects it from clinic accounts. */
  setBillingEnabled(clinicId: string, enabled: boolean): Promise<void>;
  saveBill(account: Account, bill: Bill): Promise<void>;
  voidBill(account: Account, billId: string, change: { voidReason: string; voidedOn: string; voidedBy: string }): Promise<void>;
  addLedgerEntry(account: Account, entry: LedgerEntry): Promise<void>;
  closeDay(account: Account, closing: DayClosing): Promise<void>;
};
export type SendResult = { status: 'accepted' | 'failed' | 'unknown'; error?: string };

/** Server timestamps become ISO strings here so the rest of the app only sees strings. */
const iso = (value: unknown) => (value as { toDate?: () => Date } | null)?.toDate?.().toISOString() ?? "";
const rows = (snap: QuerySnapshot<DocumentData>) => snap.docs.map(d => d.data({ serverTimestamps: "estimate" }));
/** Firestore refuses undefined fields; optional billing fields are simply left out. */
const defined = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

/** Admin sees every clinic's records; a clinic account only its own. */
const scoped = (account: Account, name: string) => account.role === "admin"
  ? collection(firestore, name)
  : query(collection(firestore, name), where("clinicId", "==", account.clinicId));

function subscribeCollection<T>(account: Account, name: string, onUpdate: (records: T[]) => void, onError: (error: Error) => void) {
  return onSnapshot(scoped(account, name), snapshot => onUpdate(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as T))), onError);
}

export const firestoreRepository: Repository = {
  subscribeDoctorDigests: (account, onUpdate, onError) => subscribeCollection(account, "doctorDigestDeliveries", onUpdate, onError),
  subscribeDeliveries: (account, onUpdate, onError) => subscribeCollection(account, "messageDeliveries", onUpdate, onError),
  subscribePrescriptions: (account, onUpdate, onError) => subscribeCollection(account, "prescriptions", onUpdate, onError),
  subscribeBills: (account, onUpdate, onError) => onSnapshot(scoped(account, "bills"), snap => onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt) }) as Bill)), onError),
  subscribeLedger: (account, onUpdate, onError) => onSnapshot(scoped(account, "ledgerEntries"), snap => onUpdate(rows(snap).map(row => ({ ...row, createdAt: iso(row.createdAt) }) as LedgerEntry)), onError),
  subscribeDayClosings: (account, onUpdate, onError) => onSnapshot(scoped(account, "dayClosings"), snap => onUpdate(rows(snap).map(row => ({ ...row, closedAt: iso(row.closedAt) }) as DayClosing)), onError),
  setBillingEnabled: (clinicId, enabled) => updateDoc(doc(firestore, "clinics", clinicId), { billingEnabled: enabled }),
  saveBill: (account, bill) => setDoc(doc(firestore, "bills", bill.id), { ...defined(bill), createdAt: serverTimestamp(), createdByUid: account.user.uid }),
  voidBill: (account, billId, change) => updateDoc(doc(firestore, "bills", billId), { ...change, status: "void", voidedAt: serverTimestamp(), voidedByUid: account.user.uid }),
  addLedgerEntry: (account, entry) => setDoc(doc(firestore, "ledgerEntries", entry.id), { ...defined(entry), createdAt: serverTimestamp(), createdByUid: account.user.uid }),
  closeDay: (account, closing) => setDoc(doc(firestore, "dayClosings", closing.id), { ...defined(closing), closedAt: serverTimestamp(), closedByUid: account.user.uid }),
  saveClinic: (clinic: Clinic) => setDoc(doc(firestore, "clinics", clinic.id), clinic),
  setPrescriptionsEnabled: (clinicId, enabled) => updateDoc(doc(firestore, "clinics", clinicId), { prescriptionsEnabled: enabled }),
  savePatient: (patient: Patient) => setDoc(doc(firestore, "patients", patient.id), patient),
  saveAppointment: (appointment: Appointment) => setDoc(doc(firestore, "appointments", appointment.id), appointment),
  savePrescription: (prescription: Prescription) => setDoc(doc(firestore, "prescriptions", prescription.id), prescription),
  async sendPrescription(prescriptionId, pdf, fileName) {
    const [{ getFunctions, httpsCallable }, { app }] = await Promise.all([import("firebase/functions"), import("./firebase")]);
    const send = httpsCallable<{ prescriptionId: string; pdf: string; fileName: string; requestId: string }, SendResult>(getFunctions(app, "asia-south1"), "sendPrescription", { timeout: 70000 });
    return (await send({ prescriptionId, pdf, fileName, requestId: crypto.randomUUID() })).data;
  },

  subscribeDatabase(account, onUpdate, onError) {
    const clinicId = account.clinicId;
    let clinics: Clinic[] = [], patients: Patient[] = [], appointments: Appointment[] = [], reminders: Reminder[] = [];
    const ready = new Set<string>();
    let stopped = false;
    const notify = () => {
      if (stopped || ready.size !== 4) return;
      onUpdate({ version: 1, activeClinicId: clinicId ?? clinics[0]?.id ?? "", clinics, patients, appointments, reminders });
    };
    const listen = <T,>(name: string, update: (records: T[]) => void) => {
      if (account.role !== "admin" && name === "clinics") {
        return onSnapshot(doc(firestore, "clinics", clinicId!), snap => {
          update(snap.exists() ? [snap.data() as T] : []);
          ready.add(name); notify();
        }, onError);
      }
      return onSnapshot(scoped(account, name), snap => {
        update(snap.docs.map(d => d.data() as T));
        ready.add(name); notify();
      }, onError);
    };
    const unsubs = [
      listen<Clinic>("clinics", value => { clinics = value; }),
      listen<Patient>("patients", value => { patients = value; }),
      listen<Appointment>("appointments", value => { appointments = value; }),
      listen<Reminder>("reminders", value => { reminders = value; }),
    ];
    return () => { stopped = true; unsubs.forEach(unsub => unsub()); };
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
