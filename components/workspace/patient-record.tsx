import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CircleHelp, History, NotebookPen, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { dateLabel } from '@/lib/clinic';
import { blankVitals, vitalsLine, type Vitals } from '@/lib/prescription';
import { ageLabel, ageYears, blankAllergy, blankPatientRecord, bloodGroups, changeValue, earlierVersions, estimatedDob, localDate, prepareNote, prepareRecord, recordFieldLabels, type Allergy, type AllergyStatus, type Habit, type PatientNote, type PatientRecord } from '@/lib/patient-record';
import { useRecordAudit, type Live } from '@/hooks/use-patient-record';
import { Chips, Field, FormError, Select } from '../kit';
import type { Workspace } from './types';

const shortDate = (date: string) => dateLabel(date, { day: 'numeric', month: 'short', year: 'numeric' });
const sexLabel: Record<string, string> = { M: 'Male', F: 'Female', O: 'Other' };
const habitLabel: Record<string, string> = { never: 'Never', former: 'Former', current: 'Current' };
const allergyText = (a: Allergy) => a.substance + (a.reaction || a.severity ? ` (${[a.severity, a.reaction].filter(Boolean).join(', ').toLowerCase()})` : '');

/** Only says "none" or "not recorded" once the record has actually loaded; a failed load must never read as no allergies. */
export function AllergyBanner({ live, compact }: { live: Live<PatientRecord | null>; compact?: boolean }) {
  if (live.status === 'loading') return compact ? null : <div className="skeleton allergy-skel" />;
  if (live.status === 'error') return <p className="allergy note note-warn"><AlertTriangle size={16} /><span>Could not load allergies. Ask the patient before prescribing.</span></p>;
  const r = live.value;
  if (r?.allergyStatus === 'known') return <p className="allergy note note-error" role="alert"><AlertTriangle size={16} /><span><strong>Allergies:</strong> {r.allergies.map(allergyText).join('; ')}</span></p>;
  if (r?.allergyStatus === 'none') return compact ? null : <p className="allergy note"><ShieldCheck size={16} /><span>No known allergies</span></p>;
  return <p className="allergy note note-warn"><CircleHelp size={16} /><span>Allergies not recorded. Ask the patient.</span></p>;
}

/** Age, sex and contact details for the top of the patient page. */
export function RecordFacts({ r, today }: { r: PatientRecord | null | undefined; today: string }) {
  if (!r) return null;
  const facts = [
    r.dob && ['Age', `${ageLabel(r, today)}${r.dobEstimated ? '' : ` · born ${shortDate(r.dob)}`}`], r.sex && ['Sex', sexLabel[r.sex]], r.bloodGroup && ['Blood group', r.bloodGroup], r.fileNo && ['File no.', r.fileNo],
    r.occupation && ['Occupation', r.occupation], r.address && ['Address', r.address], (r.emergencyName || r.emergencyPhone) && ['Emergency contact', [r.emergencyName, r.emergencyPhone].filter(Boolean).join(' · ')],
  ].filter(Boolean) as string[][];
  return facts.length ? <dl className="pd-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null;
}

export function MedicalSummary({ w, live, onEdit }: { w: Workspace; live: Live<PatientRecord | null>; onEdit: () => void }) {
  const r = live.status === 'ready' ? live.value : null;
  const blocks = r ? [['Conditions', r.conditions], ['Current medicines', r.medications], ['Surgeries', r.surgeries], ['Family history', r.familyHistory], ['Tobacco', habitLabel[r.tobacco]], ['Alcohol', habitLabel[r.alcohol]], ['Notes', r.notes]].filter(([, v]) => v) : [];
  return <>
    <div className="sec-row"><h2 className="sec-title">Medical background</h2>{live.status === 'ready' && w.can.writeRecords && <button className="btn-link" onClick={onEdit}><Pencil size={13} />{r ? 'Edit' : 'Add'}</button>}</div>
    {live.status === 'error' && <p className="note note-warn">The medical record could not be loaded.</p>}
    {live.status === 'ready' && (blocks.length ? <dl className="med-bg">{blocks.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="muted">Nothing recorded yet.</p>)}
    {r && <p className="muted small rec-stamp">Updated {r.updatedAt ? shortDate(localDate(r.updatedAt, w.clinic.timezone)) : 'just now'}</p>}
    {r && <AuditLog w={w} patientId={r.patientId} />}
  </>;
}

function AuditLog({ w, patientId }: { w: Workspace; patientId: string }) {
  const [open, setOpen] = useState(false);
  return <details className="audit" onToggle={e => setOpen(e.currentTarget.open)}><summary><History size={13} />Change history</summary>{open && <AuditEntries w={w} patientId={patientId} />}</details>;
}
function AuditEntries({ w, patientId }: { w: Workspace; patientId: string }) {
  const live = useRecordAudit(w.repo, w.clinic.id, patientId);
  if (live.status === 'loading') return <p className="muted small">Loading…</p>;
  if (live.status === 'error') return <p className="muted small">Change history is not available.</p>;
  const entries = [...live.value].sort((a, b) => b.version - a.version);
  if (!entries.length) return <p className="muted small">No changes recorded yet.</p>;
  return <ol className="audit-list">{entries.map(e => <li key={e.id}><strong>{e.changedAt ? shortDate(localDate(e.changedAt, w.clinic.timezone)) : 'Just now'}</strong>
    {e.changes.map(c => <span key={c.field}>{recordFieldLabels[c.field] || c.field}: {changeValue(c.from)} → {changeValue(c.to)}</span>)}</li>)}</ol>;
}

export function PatientRecordForm({ w, patientId, live, onDone }: { w: Workspace; patientId: string; live: PatientRecord | null; onDone: () => void }) {
  const [r, setR] = useState<PatientRecord>(live || blankPatientRecord(w.clinic.id, patientId));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (v: Partial<PatientRecord>) => { setR(x => ({ ...x, ...v })); setError(''); };
  const setAllergy = (id: string, v: Partial<Allergy>) => set({ allergies: r.allergies.map(a => a.id === id ? { ...a, ...v } : a) });
  const setStatus = (allergyStatus: AllergyStatus) => set({ allergyStatus, allergies: allergyStatus === 'known' && !r.allergies.length ? [blankAllergy()] : r.allergies });
  const stale = (live?.version || 0) !== r.version;
  const text = (key: 'conditions' | 'medications' | 'surgeries' | 'familyHistory', label: string, placeholder: string) => <Field label={label}><textarea className="input" rows={2} maxLength={2000} value={r[key]} onChange={e => set({ [key]: e.target.value })} placeholder={placeholder} /></Field>;
  const habit = (key: 'tobacco' | 'alcohol', label: string) => <Field label={label}><Chips<Habit | 'none'> size="sm" label={label} value={r[key] || 'none'} onChange={v => set({ [key]: v === 'none' ? '' : v })} options={[{ value: 'none', label: 'Not asked' }, { value: 'never', label: 'Never' }, { value: 'former', label: 'Former' }, { value: 'current', label: 'Current' }]} /></Field>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    try {
      const clean = prepareRecord(r, w.now.date);
      setBusy(true);
      // Waits for the server: an allergy must not look saved until it is.
      await w.repo.savePatientRecord(w.account, clean);
      toast.success('Medical record saved');
      onDone();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return <form className="form" onSubmit={submit}>
    {stale && <div className="note note-warn row-between"><span>Someone else just saved this record. Load their version before you save.</span><button type="button" className="btn btn-sm btn-soft" onClick={() => { setR(live!); setError(''); }}>Load latest</button></div>}
    <fieldset className="fs"><legend>Allergies</legend>
      <Chips<AllergyStatus> label="Allergy status" value={r.allergyStatus} onChange={setStatus} options={[{ value: 'unknown', label: 'Not asked yet' }, { value: 'none', label: 'No known allergies' }, { value: 'known', label: 'Has allergies' }]} />
      {r.allergyStatus === 'known' && <>{r.allergies.map(a => <div className="allergy-row" key={a.id}>
        <Field label="Allergic to"><input className="input" value={a.substance} maxLength={100} onChange={e => setAllergy(a.id, { substance: e.target.value })} placeholder="e.g. Penicillin" /></Field>
        <Field label="Reaction"><input className="input" value={a.reaction} maxLength={150} onChange={e => setAllergy(a.id, { reaction: e.target.value })} placeholder="e.g. Rash" /></Field>
        <Field label="Severity"><Select label="Severity" value={a.severity} onChange={v => setAllergy(a.id, { severity: v as Allergy['severity'] })} options={[{ value: '', label: '—' }, { value: 'mild', label: 'Mild' }, { value: 'moderate', label: 'Moderate' }, { value: 'severe', label: 'Severe' }]} /></Field>
        <button type="button" className="btn-icon" aria-label="Remove allergy" onClick={() => set({ allergies: r.allergies.filter(x => x.id !== a.id) })}><Trash2 size={16} /></button>
      </div>)}<button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => set({ allergies: [...r.allergies, blankAllergy()] })}><Plus size={15} />Add allergy</button></>}
    </fieldset>
    <fieldset className="fs"><legend>Personal details</legend>
      <div className="grid-3-even">
        <Field label="Date of birth"><input className="input" type="date" max={w.now.date} value={r.dobEstimated ? '' : r.dob} onChange={e => set({ dob: e.target.value, dobEstimated: false })} /></Field>
        <Field label="Or age in years" hint={r.dobEstimated ? 'Saved as an estimate.' : undefined}><input className="input" inputMode="numeric" maxLength={3} value={r.dobEstimated ? ageYears(r.dob, w.now.date) : ''} onChange={e => { const age = e.target.value.replace(/\D/g, ''); set(age ? { dob: estimatedDob(Number(age), w.now.date), dobEstimated: true } : { dob: '', dobEstimated: false }); }} placeholder={r.dob && !r.dobEstimated ? ageLabel(r, w.now.date) : 'yrs'} /></Field>
        <Field label="Sex"><Select label="Sex" value={r.sex} onChange={v => set({ sex: v as PatientRecord['sex'] })} options={[{ value: '', label: '—' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]} /></Field>
      </div>
      <div className="grid-3-even">
        <Field label="Blood group"><Select label="Blood group" value={r.bloodGroup} onChange={bloodGroup => set({ bloodGroup })} options={[{ value: '', label: '—' }, ...bloodGroups.map(value => ({ value, label: value }))]} /></Field>
        <Field label="File number"><input className="input" value={r.fileNo} maxLength={40} onChange={e => set({ fileNo: e.target.value })} placeholder="Paper file, if any" /></Field>
        <Field label="Occupation"><input className="input" value={r.occupation} maxLength={100} onChange={e => set({ occupation: e.target.value })} /></Field>
      </div>
      <Field label="Address"><input className="input" value={r.address} maxLength={300} onChange={e => set({ address: e.target.value })} /></Field>
      <div className="grid-2">
        <Field label="Emergency contact"><input className="input" value={r.emergencyName} maxLength={100} onChange={e => set({ emergencyName: e.target.value })} placeholder="Name and relation" /></Field>
        <Field label="Emergency phone"><input className="input" type="tel" value={r.emergencyPhone} onChange={e => set({ emergencyPhone: e.target.value })} placeholder="+91 98765 43210" /></Field>
      </div>
    </fieldset>
    <fieldset className="fs"><legend>Medical background</legend>
      {text('conditions', 'Conditions', 'One per line, e.g. Type 2 diabetes')}
      {text('medications', 'Current medicines', 'Long-term medicines from any doctor, with dose')}
      {text('surgeries', 'Surgeries & hospital stays', 'e.g. Appendectomy, 2016')}
      {text('familyHistory', 'Family history', 'e.g. Father: diabetes')}
      <div className="grid-2">{habit('tobacco', 'Tobacco')}{habit('alcohol', 'Alcohol')}</div>
      <Field label="Notes"><textarea className="input" rows={2} maxLength={3000} value={r.notes} onChange={e => set({ notes: e.target.value })} placeholder="Anything else the next doctor should know" /></Field>
    </fieldset>
    <FormError error={error} />
    <div className="form-foot"><button className="btn btn-primary" type="submit" disabled={busy || stale}>{busy ? 'Saving…' : 'Save record'}</button></div>
  </form>;
}

const vitalFields: { key: keyof Vitals; label: string; placeholder: string; max: number }[] = [{ key: 'bp', label: 'BP', placeholder: '120/80', max: 9 }, { key: 'pulse', label: 'Pulse', placeholder: '/min', max: 3 }, { key: 'temp', label: 'Temp °F', placeholder: '98.6', max: 5 }, { key: 'weight', label: 'Weight kg', placeholder: '', max: 5 }, { key: 'spo2', label: 'SpO₂ %', placeholder: '', max: 3 }];

export function NoteComposer({ w, patientId, correcting, appointment, onDone }: { w: Workspace; patientId: string; correcting?: PatientNote; appointment?: { id: string; date: string; doctorId: string }; onDone: () => void }) {
  const [text, setText] = useState(correcting?.text || '');
  const [date, setDate] = useState(correcting?.date || appointment?.date || w.now.date);
  const [doctorId, setDoctorId] = useState(correcting?.doctorId || appointment?.doctorId || w.account.doctorId || (w.doctorFilter !== 'all' ? w.doctorFilter : w.clinic.doctors[0]?.id || ''));
  const [vitals, setVitals] = useState<Vitals>(correcting?.vitals || blankVitals());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    try {
      const note = prepareNote({ id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, doctorId, date, text, vitals, corrects: correcting?.id, appointmentId: correcting?.appointmentId || appointment?.id, createdAt: '', createdBy: '', createdByName: w.account.name }, w.now.date);
      setBusy(true);
      await w.repo.addPatientNote(w.account, note);
      toast.success(correcting ? 'Correction saved' : 'Note saved');
      onDone();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return <form className="note-form" onSubmit={submit}>
    {correcting && <p className="muted small">Correcting the note from {shortDate(correcting.date)}. The original stays on the record.</p>}
    <textarea className="input" rows={3} maxLength={5000} autoFocus value={text} onChange={e => { setText(e.target.value); setError(''); }} placeholder="What happened at this visit?" aria-label="Note" />
    <details className="note-vitals" open={Object.values(vitals).some(Boolean)}><summary>Vitals</summary><div className="note-vitals-grid">{vitalFields.map(f => <Field key={f.key} label={f.label}><input className="input" value={vitals[f.key]} maxLength={f.max} placeholder={f.placeholder} onChange={e => setVitals(v => ({ ...v, [f.key]: e.target.value }))} /></Field>)}</div></details>
    <div className="note-form-row">
      <input className="input input-date" type="date" aria-label="Visit date" max={w.now.date} value={date} onChange={e => setDate(e.target.value)} />
      {w.clinic.doctors.length > 1 && <Select label="Doctor" value={doctorId} onChange={setDoctorId} options={w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))} />}
      <span className="note-form-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button><button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? 'Saving…' : correcting ? 'Save correction' : 'Save note'}</button></span>
    </div>
    <FormError error={error} />
  </form>;
}

export function NoteCard({ w, note, all, onCorrect }: { w: Workspace; note: PatientNote; all: PatientNote[]; onCorrect: () => void }) {
  const earlier = earlierVersions(note, all);
  const written = localDate(note.createdAt, w.clinic.timezone);
  const vitals = note.vitals ? vitalsLine(note.vitals) : '';
  return <article className="note-card">
    <div className="note-card-top"><span className="row-tight"><NotebookPen size={14} /><strong>{shortDate(note.date)}</strong></span>{w.can.writeNotes && <button className="btn-link" onClick={onCorrect}>Correct</button>}</div>
    {note.text && <p className="note-text">{note.text}</p>}
    {vitals && <p className="muted small">{vitals}</p>}
    <small className="muted">{note.createdByName || w.doctorName(note.doctorId)}{written && written !== note.date ? ` · written ${shortDate(written)}` : ''}</small>
    {earlier.length > 0 && <details className="note-earlier"><summary>Corrected · show original</summary>{earlier.map(n => <div key={n.id}><small className="muted">Written {n.createdAt ? shortDate(localDate(n.createdAt, w.clinic.timezone)) : ''}</small><p className="note-text"><s>{n.text}</s></p></div>)}</details>}
  </article>;
}
