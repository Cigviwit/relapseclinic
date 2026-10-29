import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { firestore } from "./firebase";
import { type Account } from "./auth-service";
import { type Database, type Clinic, type Patient, type Appointment, type Reminder } from "./clinic";
import { type Prescription } from "./prescription";

type Unsubscribe = () => void;
export type Repository = {
  subscribeDatabase(account: Account, onUpdate: (db: Database) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeDeliveries(account: Account, onUpdate: (records: MessageDelivery[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribeDoctorDigests(account: Account, onUpdate: (records: DoctorDigestDelivery[]) => void, onError: (error: Error) => void): Unsubscribe;
  subscribePrescriptions(account: Account, onUpdate: (records: Prescription[]) => void, onError: (error: Error) => void): Unsubscribe;
  saveClinic(clinic: Clinic): Promise<void>;
  savePatient(patient: Patient): Promise<void>;
  saveAppointment(appointment: Appointment): Promise<void>;
  savePrescription(prescription: Prescription): Promise<void>;
};

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
  saveClinic: (clinic: Clinic) => setDoc(doc(firestore, "clinics", clinic.id), clinic),
  savePatient: (patient: Patient) => setDoc(doc(firestore, "patients", patient.id), patient),
  saveAppointment: (appointment: Appointment) => setDoc(doc(firestore, "appointments", appointment.id), appointment),
  savePrescription: (prescription: Prescription) => setDoc(doc(firestore, "prescriptions", prescription.id), prescription),

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
