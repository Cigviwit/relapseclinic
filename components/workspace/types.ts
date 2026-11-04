import type { Account } from '@/lib/auth-service';
import type { Appointment, Clinic, Database, Doctor, Patient } from '@/lib/clinic';
import type { DoctorDigestDelivery, MessageDelivery, Repository } from '@/lib/firestore-repository';
import type { Prescription } from '@/lib/prescription';
import type { Bill, DayClosing, LedgerEntry } from '@/lib/billing';
import type { Permissions } from '@/lib/permissions';
import type { VisitStage } from '@/lib/queue';
import type { WaitlistEntry } from '@/lib/front-desk';
import type { Catalog } from '@/lib/catalog';
import type { LabCase, Recall } from '@/lib/dental';

export type Page = 'today' | 'schedule' | 'patients' | 'billing' | 'rx' | 'lab' | 'messages' | 'impact' | 'settings';

export type BookOptions = { patientId?: string; doctorId?: string; date?: string; time?: string; item?: Appointment; waitlistId?: string; recallId?: string };
export type BillOptions = { patientId?: string; doctorId?: string; appointmentId?: string; reason?: string; price?: number };
export type RxOptions = { patientId?: string; doctorId?: string; appointmentId?: string; item?: Prescription; repeat?: Prescription };

/** Everything a workspace page needs, computed once per render in the shell. */
export type Workspace = {
  account: Account; db: Database; clinic: Clinic; repo: Repository;
  /** What the signed-in person may do. Screens use this to hide what the rules would refuse. */
  can: Permissions;
  /** Digital prescriptions are on for this clinic and this person may see them. */
  rxOn: boolean;
  /** Fetches appointments older than the workspace keeps live, for looking back through the schedule. */
  loadRange: (from: string, to: string) => void;
  patients: Patient[]; appointments: Appointment[]; prescriptions: Prescription[];
  deliveries: MessageDelivery[]; digests: DoctorDigestDelivery[];
  patient: (id: string) => Patient | undefined; doctor: (id: string) => Doctor | undefined; doctorName: (id: string) => string;
  now: { date: string; time: string }; doctorFilter: string; setDoctorFilter: (id: string) => void;
  go: (page: Page, patientId?: string) => void;
  book: (o?: BookOptions) => void; openAppointment: (a: Appointment) => void;
  editPatient: (p?: Patient) => void; savePatient: (p: Patient) => void;
  writeRx: (o?: RxOptions) => void;
  /** On when the administrator enabled billing for this clinic and this person may see it. */
  billingOn: boolean; bills: Bill[]; ledger: LedgerEntry[]; closings: DayClosing[];
  newBill: (o?: BillOptions) => void; openBill: (id: string) => void;
  setStatus: (a: Appointment, status: Appointment['status']) => Promise<void>;
  setStage: (a: Appointment, stage: VisitStage | null) => void;
  waitlist: WaitlistEntry[];
  catalog: Catalog; recalls: Recall[]; openLabs: LabCase[];
  addWalkIn: (patientId?: string) => void;
  confirmMissed: (a: Appointment) => void;
  confirm: (c: { title: string; body: string; action: () => void; danger?: boolean; cta?: string }) => void;
};
