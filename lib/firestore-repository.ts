import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { firestore } from "./firebase";
import { type Account } from "./auth-service";
import { type Database, type Clinic, type Patient, type Appointment, type Reminder } from "./clinic";

export const firestoreRepository = {
  subscribeDeliveries(account: Account, onUpdate: (records: MessageDelivery[]) => void, onError: (error: Error) => void): () => void {
    const source = account.role === "admin"
      ? collection(firestore, "messageDeliveries")
      : query(collection(firestore, "messageDeliveries"), where("clinicId", "==", account.clinicId));
    return onSnapshot(source, snapshot => onUpdate(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as MessageDelivery))), onError);
  },
  saveClinic: (clinic: Clinic) => setDoc(doc(firestore, "clinics", clinic.id), clinic),
  savePatient: (patient: Patient) => setDoc(doc(firestore, "patients", patient.id), patient),
  saveAppointment: (appointment: Appointment) => setDoc(doc(firestore, "appointments", appointment.id), appointment),
  saveReminder: (reminder: Reminder) => setDoc(doc(firestore, "reminders", reminder.id), reminder),

  subscribeDatabase(account: Account, onUpdate: (db: Database) => void, onError: (error: Error) => void): () => void {
    const clinicId = account.clinicId;
    let clinics: Clinic[] = [], patients: Patient[] = [], appointments: Appointment[] = [], reminders: Reminder[] = [];
    const ready = new Set<string>();
    let stopped = false;
    const notify = () => {
      if (stopped || ready.size !== 4) return;
      onUpdate({ version: 1, activeClinicId: clinicId ?? clinics[0]?.id ?? "", clinics, patients, appointments, reminders });
    };
    const listen = <T,>(name: string, update: (records: T[]) => void) => {
      const source = account.role === "admin"
        ? collection(firestore, name)
        : name === "clinics"
          ? null
          : query(collection(firestore, name), where("clinicId", "==", clinicId));
      if (!source) {
        return onSnapshot(doc(firestore, "clinics", clinicId!), snap => {
          update(snap.exists() ? [snap.data() as T] : []);
          ready.add(name); notify();
        }, onError);
      }
      return onSnapshot(source, snap => {
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
  createdAt?: { toDate: () => Date }; updatedAt?: { toDate: () => Date };
};
