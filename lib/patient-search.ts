import type { Patient } from './clinic';

export function searchPatients(patients: Patient[], query: string): Patient[] {
 const term = query.trim().toLocaleLowerCase();
 if (!term) return patients;
 const digits = term.replace(/\D/g, '');
 return patients.filter(patient =>
  patient.name.toLocaleLowerCase().includes(term) ||
  patient.phone.toLocaleLowerCase().includes(term) ||
  (digits.length >= 3 && patient.phone.replace(/\D/g, '').includes(digits))
 );
}
