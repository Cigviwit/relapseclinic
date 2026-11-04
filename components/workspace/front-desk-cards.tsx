import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, GitMerge, Unlink, UserPlus, Users, X } from 'lucide-react';
import { dateLabel, type Patient } from '@/lib/clinic';
import { localDate } from '@/lib/patient-record';
import { duplicatePairs, familyMembers, sharedFamilyId } from '@/lib/front-desk';
import { Field, FormError, Modal, Select } from '../kit';
import { PatientPicker } from '../patient-picker';
import type { Workspace } from './types';

/** Patients who want an earlier slot. Today's list, with the longest wait first. */
export function WaitlistCard({ w }: { w: Workspace }) {
  const entries = w.waitlist.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!entries.length) return null;
  return <section className="card">
    <div className="card-head card-head-row"><h2>Waitlist</h2><span className="count">{entries.length}</span></div>
    <ul className="plain-list">{entries.map(e => <li key={e.id} className="row-between">
      <button type="button" className="btn-link-plain" onClick={() => w.go('patients', e.patientId)}><strong>{w.patient(e.patientId)?.name || 'Patient'}</strong><small>{e.doctorId ? w.doctorName(e.doctorId) : 'Any doctor'}{e.note ? ` · ${e.note}` : ''}{e.createdAt ? ` · since ${dateLabel(localDate(e.createdAt, w.clinic.timezone), { day: 'numeric', month: 'short' })}` : ''}</small></button>
      <span className="row-tight">
        <button type="button" className="btn btn-sm btn-soft" onClick={() => w.book({ patientId: e.patientId, doctorId: e.doctorId || undefined, waitlistId: e.id })}><CalendarPlus size={14} />Book</button>
        <button type="button" className="btn-icon" aria-label={`Remove ${w.patient(e.patientId)?.name || 'patient'} from the waitlist`} onClick={() => w.repo.setWaitlistStatus(e.id, 'removed').catch(err => toast.error((err as Error).message))}><X size={14} /></button>
      </span>
    </li>)}</ul>
  </section>;
}

export function AddToWaitlist({ w, patientId, onDone }: { w: Workspace; patientId: string; onDone: () => void }) {
  const [doctorId, setDoctorId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true); setError('');
    try {
      await w.repo.addToWaitlist({ id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, doctorId, ...(note.trim() ? { note: note.trim() } : {}), status: 'waiting', createdAt: new Date().toISOString() });
      toast.success('Added to the waitlist'); onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="form">
    {w.clinic.doctors.length > 1 && <Field label="Doctor"><Select label="Doctor" value={doctorId} onChange={setDoctorId} options={[{ value: '', label: 'Any doctor' }, ...w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))]} /></Field>}
    <Field label="When suits them (optional)"><input className="input" autoFocus maxLength={200} placeholder="e.g. Weekday evenings, needs a long slot" value={note} onChange={e => setNote(e.target.value)} /></Field>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>Add to waitlist</button></div>
  </div>;
}

/** Everyone in the patient's family, for sharing an account of who to call and who else is due. */
export function FamilySection({ w, patient }: { w: Workspace; patient: Patient }) {
  const [linking, setLinking] = useState(false);
  const [other, setOther] = useState('');
  const [error, setError] = useState('');
  const members = familyMembers(w.patients, patient);
  const candidates = useMemo(() => w.patients.filter(p => p.id !== patient.id), [w.patients, patient.id]);
  async function link() {
    const chosen = w.patient(other);
    if (!chosen) { setError('Choose a patient.'); return; }
    try {
      await w.repo.linkFamily(patient, chosen, sharedFamilyId(patient, chosen, () => crypto.randomUUID()));
      toast.success(`${chosen.name} linked`); setLinking(false); setOther(''); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  return <>
    <div className="sec-row"><h2 className="sec-title"><Users size={13} /> Family</h2><button type="button" className="btn-link" onClick={() => setLinking(true)}><UserPlus size={13} />Link</button></div>
    {members.length ? <ul className="plain-list">{members.map(m => <li key={m.id} className="row-between"><button type="button" className="btn-link-plain" onClick={() => w.go('patients', m.id)}><strong>{m.name}</strong><small>{m.phone}</small></button></li>)}
      <li><button type="button" className="btn-link" onClick={() => w.repo.unlinkFamily(patient).catch(e => toast.error((e as Error).message))}><Unlink size={13} />Remove {patient.name} from this family</button></li></ul>
      : <p className="muted small">No family members linked.</p>}
    <Modal open={linking} onClose={() => setLinking(false)} title="Link family member" subtitle={patient.name}>
      {linking && <div className="form">
        <Field label="Family member"><PatientPicker patients={candidates} value={other} onChange={setOther} clinicId={w.clinic.id} autoFocus /></Field>
        <FormError error={error} />
        <div className="form-foot"><button type="button" className="btn btn-primary" onClick={() => void link()}>Link</button></div>
      </div>}
    </Modal>
  </>;
}

export function DuplicatesCard({ w }: { w: Workspace }) {
  const pairs = useMemo(() => duplicatePairs(w.patients), [w.patients]);
  const [busy, setBusy] = useState(false);
  const merge = (keep: Patient, other: Patient) => w.confirm({
    title: `Merge ${other.name} into ${keep.name}?`,
    body: `All of ${other.name}’s visits, prescriptions, notes, bills and files move to ${keep.name}. Allergies and medical history from both are kept. This cannot be undone.`,
    cta: 'Merge', danger: true,
    action: () => { setBusy(true); w.repo.mergePatients(w.clinic.id, keep.id, other.id).then(() => toast.success('Patients merged')).catch(e => toast.error((e as Error).message)).finally(() => setBusy(false)); },
  });
  return <>
    <h2 className="card-title"><GitMerge size={16} />Possible duplicate patients</h2>
    {pairs.length ? <>
      <p className="muted">Same phone number and a similar name. Family members with different names are not listed.</p>
      <ul className="plain-list">{pairs.map(([a, b]) => <li key={a.id + b.id}>
        <strong>{a.name}</strong> and <strong>{b.name}</strong><small> · {a.phone}</small>
        <div className="row-tight wrap"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => merge(a, b)}>Keep {a.name}</button><button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => merge(b, a)}>Keep {b.name}</button></div>
      </li>)}</ul></> : <p className="muted">None found.</p>}
  </>;
}

