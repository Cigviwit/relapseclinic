import type { Account } from '@/lib/auth-service';
import type { Appointment, Clinic, Database, Doctor, Patient } from '@/lib/clinic';
import type { DoctorDigestDelivery, MessageDelivery, Repository } from '@/lib/firestore-repository';
import type { Prescription } from '@/lib/prescription';

export type Page = 'today' | 'schedule' | 'patients' | 'rx' | 'messages' | 'impact' | 'settings';

export type BookOptions = { patientId?: string; doctorId?: string; date?: string; time?: string; item?: Appointment };
export type RxOptions = { patientId?: string; doctorId?: string; appointmentId?: string; item?: Prescription; repeat?: Prescription };

/** Everything a workspace page needs, computed once per render in the shell. */
export type Workspace = {
  account: Account; db: Database; clinic: Clinic; repo: Repository;
  patients: Patient[]; appointments: Appointment[]; prescriptions: Prescription[];
  deliveries: MessageDelivery[]; digests: DoctorDigestDelivery[];
  patient: (id: string) => Patient | undefined; doctor: (id: string) => Doctor | undefined; doctorName: (id: string) => string;
  now: { date: string; time: string }; doctorFilter: string; setDoctorFilter: (id: string) => void;
  go: (page: Page, patientId?: string) => void;
  book: (o?: BookOptions) => void; openAppointment: (a: Appointment) => void;
  editPatient: (p?: Patient) => void; savePatient: (p: Patient) => void;
  writeRx: (o?: RxOptions) => void;
  setStatus: (a: Appointment, status: Appointment['status']) => Promise<void>;
  confirmMissed: (a: Appointment) => void;
  confirm: (c: { title: string; body: string; action: () => void; danger?: boolean; cta?: string }) => void;
};
