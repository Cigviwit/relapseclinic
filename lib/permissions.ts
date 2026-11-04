/**
 * What each person may do, for deciding which screens and buttons to show.
 * firestore.rules and the Cloud Functions enforce the same table; this only keeps people from hitting a refusal.
 */
export type StaffRole = 'owner' | 'doctor' | 'frontdesk' | 'billing';
export type Role = StaffRole | 'platform';

export type Permissions = {
  manageStaff: boolean; editClinic: boolean; readAudit: boolean; exportData: boolean; adminFeatures: boolean;
  readRecords: boolean; writeRecords: boolean; readNotes: boolean; writeNotes: boolean;
  readRx: boolean; writeRx: boolean; sendRx: boolean;
  readBilling: boolean; writeBilling: boolean; correctBilling: boolean; closeDay: boolean;
};

const nothing: Permissions = { manageStaff: false, editClinic: false, readAudit: false, exportData: false, adminFeatures: false, readRecords: false, writeRecords: false, readNotes: false, writeNotes: false, readRx: false, writeRx: false, sendRx: false, readBilling: false, writeBilling: false, correctBilling: false, closeDay: false };

const table: Record<Role, Partial<Permissions>> = {
  owner: { manageStaff: true, editClinic: true, readAudit: true, exportData: true, readRecords: true, writeRecords: true, readNotes: true, writeNotes: true, readRx: true, writeRx: true, sendRx: true, readBilling: true, writeBilling: true, correctBilling: true, closeDay: true },
  doctor: { readRecords: true, writeRecords: true, readNotes: true, writeNotes: true, readRx: true, writeRx: true, sendRx: true, readBilling: true, writeBilling: true },
  frontdesk: { readRecords: true, writeRecords: true, readRx: true, sendRx: true, readBilling: true, writeBilling: true, closeDay: true },
  billing: { readBilling: true, writeBilling: true, correctBilling: true, closeDay: true },
  // Reads everything except visit notes. Changes clinic settings and staff, and never clinical or billing records.
  platform: { manageStaff: true, editClinic: true, readAudit: true, adminFeatures: true, readRecords: true, readRx: true, readBilling: true },
};

export const permissionsFor = (role: Role): Permissions => ({ ...nothing, ...table[role] });

export const roleOptions: { value: StaffRole; label: string; help: string }[] = [
  { value: 'owner', label: 'Owner', help: 'Everything, including staff, settings, corrections and the activity log.' },
  { value: 'doctor', label: 'Doctor', help: 'Medical records, visit notes and their own prescriptions. Can bill and take payments.' },
  { value: 'frontdesk', label: 'Front desk', help: 'Patients, booking, the medical record form, bills and payments. Reads and sends prescriptions, but no visit notes.' },
  { value: 'billing', label: 'Billing', help: 'Patients, booking, bills and payments, including voids and refunds. No medical information.' },
];
export const roleLabel = (role: Role) => role === 'platform' ? 'Platform administrator' : roleOptions.find(r => r.value === role)?.label || role;
