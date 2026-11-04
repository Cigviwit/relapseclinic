import type { Medicine, Prescription } from './prescription.ts';

/** The clinic's own medicine list and saved prescription templates, such as "After extraction". */
export type CatalogMedicine = Omit<Medicine, 'id'> & { id: string };
export type RxTemplate = Pick<Prescription, 'diagnosis' | 'procedures' | 'plan' | 'advice' | 'tests'> & { id: string; name: string; medicines: CatalogMedicine[] };
export type Catalog = { id: string; clinicId: string; medicines: CatalogMedicine[]; templates: RxTemplate[] };
export const emptyCatalog = (clinicId: string): Catalog => ({ id: clinicId, clinicId, medicines: [], templates: [] });

const key = (name: string) => name.trim().toLowerCase();
export const findMedicine = (catalog: Catalog, name: string) => catalog.medicines.find(m => key(m.name) === key(name));

/** Choosing a listed medicine fills in its usual dose, unless the doctor has already written notes for this row. */
export function withCatalogDefaults(row: Medicine, catalog: Catalog): Medicine {
  const found = findMedicine(catalog, row.name);
  if (!found || row.notes.trim()) return row;
  return { ...row, frequency: found.frequency, timing: found.timing, days: found.days, notes: found.notes };
}

export function addCatalogMedicine(catalog: Catalog, medicine: CatalogMedicine): Catalog {
  if (!medicine.name.trim()) throw new Error('Enter the medicine name.');
  if (findMedicine(catalog, medicine.name)) throw new Error(`${medicine.name.trim()} is already on the list.`);
  return { ...catalog, medicines: [...catalog.medicines, { ...medicine, name: medicine.name.trim() }].sort((a, b) => a.name.localeCompare(b.name)) };
}

/** A template adds to what is written rather than replacing it, so nothing typed is lost. */
export function applyTemplate(rx: Prescription, template: RxTemplate): Prescription {
  const join = (current: string, extra: string) => !extra.trim() ? current : !current.trim() ? extra : current.split('\n').includes(extra) ? current : `${current}\n${extra}`;
  const typed = rx.medicines.filter(m => m.name.trim());
  const names = new Set(typed.map(m => key(m.name)));
  const added = template.medicines.filter(m => !names.has(key(m.name))).map(m => ({ ...m, id: crypto.randomUUID() }));
  return { ...rx, diagnosis: join(rx.diagnosis, template.diagnosis), procedures: join(rx.procedures, template.procedures), plan: join(rx.plan, template.plan), advice: join(rx.advice, template.advice), tests: join(rx.tests, template.tests), medicines: [...typed, ...added].length ? [...typed, ...added] : rx.medicines };
}

export function templateFromRx(rx: Prescription, name: string): RxTemplate {
  if (!name.trim()) throw new Error('Enter a name for the template.');
  return { id: crypto.randomUUID(), name: name.trim(), diagnosis: rx.diagnosis.trim(), procedures: rx.procedures.trim(), plan: rx.plan.trim(), advice: rx.advice.trim(), tests: rx.tests.trim(), medicines: rx.medicines.filter(m => m.name.trim()).map(m => ({ ...m, id: crypto.randomUUID() })) };
}
