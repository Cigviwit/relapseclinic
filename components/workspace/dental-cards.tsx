import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, ClipboardList, FlaskConical, IndianRupee, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { dateLabel, type Patient } from '@/lib/clinic';
import { formatMoney, parseRupees, rupeesText } from '@/lib/billing';
import { whatsappUrl } from '@/lib/prescription';
import { labOverdue, labStatusLabel, labWorkTypes, monthsLater, nextLabSteps, parseTeeth, planItemStatuses, planTotals, recallMessage, recallPresets, recallsToCall, sortLabs, validateLabCase, validatePlan, type LabCase, type LabStatus, type PlanItem, type PlanItemStatus, type Recall, type TreatmentPlan } from '@/lib/dental';
import { padFor, specialties } from '@/lib/rx-templates';
import { Avatar, Empty, Field, FormError, Modal, Select, Status } from '../kit';
import { PatientPicker } from '../patient-picker';
import { ToothChart } from '../prescription/tooth-chart';
import type { Workspace } from './types';

const short = (date: string) => dateLabel(date, { day: 'numeric', month: 'short' });

// --- Treatment plans ---
type Row = { id: string; procedure: string; teeth: string; estimate: string };
const blankRow = (): Row => ({ id: crypto.randomUUID(), procedure: '', teeth: '', estimate: '' });

function PlanEditor({ w, patientId, onDone }: { w: Workspace; patientId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [doctorId, setDoctorId] = useState(w.account.role === 'doctor' ? w.account.doctorId : w.account.doctorId || w.clinic.doctors[0]?.id || '');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const preset = specialties[padFor(w.clinic.rxPad).specialty];
  const options = useMemo(() => [...new Set([...preset.plans, ...preset.procedures, ...(w.clinic.billing?.fees || []).map(f => f.name)])], [preset, w.clinic.billing?.fees]);
  const edit = (id: string, patch: Partial<Row>) => setRows(list => list.map(r => r.id === id ? { ...r, ...patch } : r));
  const chooseProcedure = (row: Row, name: string) => { const fee = w.clinic.billing?.fees.find(f => f.name === name); edit(row.id, { procedure: name, ...(fee && !row.estimate ? { estimate: rupeesText(fee.price) } : {}) }); };
  async function save() {
    try {
      const items: PlanItem[] = rows.filter(r => r.procedure.trim()).map(r => ({ id: r.id, procedure: r.procedure.trim(), teeth: parseTeeth(r.teeth), estimate: r.estimate.trim() ? parseRupees(r.estimate) : 0, status: 'planned' }));
      const plan: TreatmentPlan = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, doctorId, title: title.trim() || 'Treatment plan', items, status: 'active', createdAt: new Date().toISOString(), version: 0 };
      validatePlan(plan);
      setBusy(true);
      await w.repo.savePlan(plan);
      toast.success('Treatment plan saved'); onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="form">
    <div className="grid-2">
      <Field label="Title (optional)"><input className="input" autoFocus maxLength={100} placeholder="e.g. Full mouth rehabilitation" value={title} onChange={e => setTitle(e.target.value)} /></Field>
      {w.clinic.doctors.length > 1 && w.account.role !== 'doctor' && <Field label="Doctor"><Select label="Doctor" value={doctorId} onChange={setDoctorId} options={w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))} /></Field>}
    </div>
    <datalist id="plan-procedures">{options.map(o => <option key={o} value={o} />)}</datalist>
    {rows.map(r => <div className="plan-row" key={r.id}>
      <Field label="Treatment"><input className="input" list="plan-procedures" maxLength={150} value={r.procedure} onChange={e => chooseProcedure(r, e.target.value)} /></Field>
      <Field label="Teeth"><input className="input" inputMode="numeric" placeholder="36, 37" value={r.teeth} onChange={e => edit(r.id, { teeth: e.target.value })} /></Field>
      <Field label="Estimate (₹)"><input className="input" inputMode="decimal" value={r.estimate} onChange={e => edit(r.id, { estimate: e.target.value })} /></Field>
      <button type="button" className="btn-icon" aria-label="Remove treatment" disabled={rows.length === 1} onClick={() => setRows(list => list.filter(x => x.id !== r.id))}><Trash2 size={15} /></button>
    </div>)}
    <button type="button" className="btn-link" onClick={() => setRows(list => [...list, blankRow()])}><Plus size={14} />Add treatment</button>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save plan</button></div>
  </div>;
}

function PlanCard({ w, plan }: { w: Workspace; plan: TreatmentPlan }) {
  const canEdit = w.can.writeRx;
  const totals = planTotals(plan.items);
  const teeth = [...new Set(plan.items.filter(i => i.status !== 'declined').flatMap(i => i.teeth))];
  const save = (next: TreatmentPlan) => w.repo.savePlan(next).catch(e => toast.error((e as Error).message));
  const setItem = (item: PlanItem, status: PlanItemStatus) => {
    const items = plan.items.map(i => i.id === item.id ? { ...i, status } : i);
    void save({ ...plan, items });
  };
  return <article className="plan-card">
    <div className="row-between"><strong>{plan.title}</strong><small className="muted">{totals.finished}/{totals.count} done · {formatMoney(totals.done)} of {formatMoney(totals.total)}</small></div>
    {teeth.length > 0 && <details className="note-vitals"><summary>Teeth involved: {[...teeth].sort((a, b) => a - b).join(', ')}</summary><ToothChart value={teeth} readOnly /></details>}
    <ul className="plain-list">{plan.items.map(item => <li key={item.id} className={item.status === 'declined' ? 'plan-item is-off' : 'plan-item'}>
      <span className="plan-item-main"><strong>{item.procedure}</strong><small>{item.teeth.length ? `Tooth ${item.teeth.join(', ')} · ` : ''}{formatMoney(item.estimate)}</small></span>
      <span className="row-tight">
        {canEdit && plan.status === 'active' ? <Select label={`Status of ${item.procedure}`} className="input-sm" value={item.status} onChange={v => setItem(item, v as PlanItemStatus)} options={planItemStatuses} /> : <Status status="scheduled">{planItemStatuses.find(s => s.value === item.status)?.label}</Status>}
        {w.billingOn && w.can.writeBilling && item.status !== 'declined' && <button type="button" className="btn-icon" title="Make a bill" aria-label={`Bill ${item.procedure}`} onClick={() => w.newBill({ patientId: plan.patientId, doctorId: plan.doctorId, reason: item.procedure, price: item.estimate })}><IndianRupee size={14} /></button>}
      </span>
    </li>)}</ul>
    {canEdit && <div className="form-foot"><button type="button" className="btn-link" onClick={() => void save({ ...plan, status: plan.status === 'active' ? 'closed' : 'active' })}>{plan.status === 'active' ? 'Close plan' : 'Reopen plan'}</button></div>}
  </article>;
}

export function TreatmentPlans({ w, patientId }: { w: Workspace; patientId: string }) {
  const [plans, setPlans] = useState<TreatmentPlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const { repo } = w;
  const clinicId = w.clinic.id;
  useEffect(() => repo.subscribePlans(clinicId, patientId, setPlans, () => setFailed(true)), [repo, clinicId, patientId]);
  const list = (plans || []).slice().sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'active' ? -1 : 1));
  return <>
    <div className="sec-row"><h2 className="sec-title"><ClipboardList size={13} /> Treatment plans</h2>{w.can.writeRx && <button type="button" className="btn-link" onClick={() => setAdding(true)}><Plus size={13} />New plan</button>}</div>
    {failed && <p className="note note-warn">Treatment plans could not be loaded.</p>}
    {plans && !list.length && !failed && <p className="muted small">No treatment plan yet.</p>}
    {list.map(plan => <PlanCard key={plan.id} w={w} plan={plan} />)}
    <Modal open={adding} onClose={() => setAdding(false)} title="New treatment plan" subtitle={w.patient(patientId)?.name} wide>{adding && <PlanEditor w={w} patientId={patientId} onDone={() => setAdding(false)} />}</Modal>
  </>;
}

// --- Lab work ---
function LabForm({ w, patientId, onDone }: { w: Workspace; patientId?: string; onDone: () => void }) {
  const [patient, setPatient] = useState(patientId || '');
  const [work, setWork] = useState('');
  const [labName, setLabName] = useState('');
  const [teeth, setTeeth] = useState('');
  const [shade, setShade] = useState('');
  const [sentOn, setSentOn] = useState(w.now.date);
  const [dueOn, setDueOn] = useState('');
  const [doctorId, setDoctorId] = useState(w.account.doctorId || w.clinic.doctors[0]?.id || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const knownLabs = useMemo(() => [...new Set(w.openLabs.map(c => c.labName))].sort(), [w.openLabs]);
  async function save() {
    try {
      const entry: LabCase = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId: patient, doctorId, labName: labName.trim(), work: work.trim(), teeth: parseTeeth(teeth), ...(shade.trim() ? { shade: shade.trim() } : {}), sentOn, dueOn, status: 'sent', createdAt: new Date().toISOString() };
      validateLabCase(entry);
      setBusy(true);
      await w.repo.saveLabCase(entry);
      toast.success('Lab work recorded'); onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="form">
    {!patientId && <Field label="Patient"><PatientPicker patients={w.patients} value={patient} onChange={setPatient} clinicId={w.clinic.id} autoFocus /></Field>}
    <datalist id="lab-work">{labWorkTypes.map(o => <option key={o} value={o} />)}</datalist>
    <datalist id="lab-names">{knownLabs.map(o => <option key={o} value={o} />)}</datalist>
    <div className="grid-2">
      <Field label="Work"><input className="input" list="lab-work" maxLength={100} value={work} onChange={e => setWork(e.target.value)} /></Field>
      <Field label="Lab"><input className="input" list="lab-names" maxLength={100} value={labName} onChange={e => setLabName(e.target.value)} /></Field>
    </div>
    <div className="grid-3">
      <Field label="Teeth"><input className="input" inputMode="numeric" placeholder="36" value={teeth} onChange={e => setTeeth(e.target.value)} /></Field>
      <Field label="Shade (optional)"><input className="input" maxLength={20} placeholder="A2" value={shade} onChange={e => setShade(e.target.value)} /></Field>
      {w.clinic.doctors.length > 1 && <Field label="Doctor"><Select label="Doctor" value={doctorId} onChange={setDoctorId} options={w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))} /></Field>}
    </div>
    <div className="grid-2">
      <Field label="Sent on"><input className="input" type="date" value={sentOn} onChange={e => setSentOn(e.target.value)} /></Field>
      <Field label="Due back"><input className="input" type="date" min={sentOn} value={dueOn} onChange={e => setDueOn(e.target.value)} /></Field>
    </div>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save</button></div>
  </div>;
}

function LabRow({ w, item, showPatient }: { w: Workspace; item: LabCase; showPatient?: boolean }) {
  const overdue = labOverdue(item, w.now.date);
  const move = (status: LabStatus) => w.repo.saveLabCase({ ...item, status }).catch(e => toast.error((e as Error).message));
  return <li className="plan-item">
    <span className="plan-item-main"><strong>{showPatient ? `${w.patient(item.patientId)?.name || 'Patient'} · ` : ''}{item.work}</strong><small>{item.teeth.length ? `Tooth ${item.teeth.join(', ')} · ` : ''}{item.shade ? `Shade ${item.shade} · ` : ''}{item.labName} · due {short(item.dueOn)}</small></span>
    <span className="row-tight wrap">
      {overdue ? <Status status="late">Overdue</Status> : <Status status={item.status === 'fitted' ? 'completed' : item.status === 'cancelled' ? 'cancelled' : 'scheduled'}>{labStatusLabel[item.status]}</Status>}
      {w.can.writeRecords && nextLabSteps(item.status).map(step => <button key={step} type="button" className="btn btn-sm btn-ghost" onClick={() => void move(step)}>{step === 'received' ? 'Received' : step === 'fitted' ? 'Fitted' : step === 'redo' ? 'Redo' : 'Cancel'}</button>)}
    </span>
  </li>;
}

export function PatientLabCases({ w, patientId }: { w: Workspace; patientId: string }) {
  const [cases, setCases] = useState<LabCase[] | null>(null);
  const [adding, setAdding] = useState(false);
  const { repo } = w;
  const clinicId = w.clinic.id;
  useEffect(() => repo.subscribePatientLabCases(clinicId, patientId, setCases, () => setCases([])), [repo, clinicId, patientId]);
  return <>
    <div className="sec-row"><h2 className="sec-title"><FlaskConical size={13} /> Lab work</h2>{w.can.writeRecords && <button type="button" className="btn-link" onClick={() => setAdding(true)}><Plus size={13} />Record</button>}</div>
    {cases && !cases.length && <p className="muted small">No lab work.</p>}
    <ul className="plain-list">{sortLabs(cases || []).reverse().map(item => <LabRow key={item.id} w={w} item={item} />)}</ul>
    <Modal open={adding} onClose={() => setAdding(false)} title="Record lab work" subtitle={w.patient(patientId)?.name} wide>{adding && <LabForm w={w} patientId={patientId} onDone={() => setAdding(false)} />}</Modal>
  </>;
}

export function LabView({ w }: { w: Workspace }) {
  const [adding, setAdding] = useState(false);
  const list = sortLabs(w.openLabs);
  const overdue = list.filter(c => labOverdue(c, w.now.date)).length;
  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">{overdue ? `${overdue} overdue` : 'Nothing overdue'}</p><h1>Lab work</h1></div>{w.can.writeRecords && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} />Record lab work</button>}</header>
    <section className="card">{list.length ? <ul className="plain-list">{list.map(item => <LabRow key={item.id} w={w} item={item} showPatient />)}</ul> : <Empty icon={<FlaskConical size={22} />} title="No open lab work">Crowns, bridges and dentures sent to a lab appear here until they are fitted.</Empty>}</section>
    <Modal open={adding} onClose={() => setAdding(false)} title="Record lab work" wide>{adding && <LabForm w={w} onDone={() => setAdding(false)} />}</Modal>
  </div>;
}

export function LabDueCard({ w }: { w: Workspace }) {
  const list = sortLabs(w.openLabs).filter(c => labOverdue(c, w.now.date) || c.status === 'received');
  if (!list.length) return null;
  return <section className="card">
    <div className="card-head card-head-row"><h2>Lab work to chase or fit</h2><button type="button" className="btn-link" onClick={() => w.go('lab')}>All</button></div>
    <ul className="plain-list">{list.slice(0, 6).map(item => <LabRow key={item.id} w={w} item={item} showPatient />)}</ul>
  </section>;
}

// --- Recalls ---
export function PatientRecalls({ w, patient }: { w: Workspace; patient: Patient }) {
  const mine = w.recalls.filter(r => r.patientId === patient.id && r.status === 'due').sort((a, b) => a.due.localeCompare(b.due));
  const add = (months: number) => {
    const recall: Recall = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId: patient.id, due: monthsLater(w.now.date, months), reason: 'Check-up and cleaning', status: 'due', createdAt: new Date().toISOString() };
    w.repo.saveRecall(recall).then(() => toast.success(`Recall set for ${short(recall.due)}`)).catch(e => toast.error((e as Error).message));
  };
  return <>
    <h2 className="sec-title"><BellRing size={13} /> Recall</h2>
    {mine.map(r => <div key={r.id} className="row-between"><span>{r.reason}<small className="muted"> · due {short(r.due)}</small></span>{w.can.writeRecords && <button type="button" className="btn-icon" aria-label="Remove recall" onClick={() => w.repo.saveRecall({ ...r, status: 'dismissed' }).catch(e => toast.error((e as Error).message))}><X size={14} /></button>}</div>)}
    {!mine.length && <p className="muted small">No recall set.</p>}
    {w.can.writeRecords && <div className="chips chips-xs"><span className="muted small">Remind in</span>{recallPresets.map(p => <button key={p.months} type="button" className="chip" onClick={() => add(p.months)}>{p.label}</button>)}</div>}
  </>;
}

/** Patients due for a check-up. Messages open on this computer, so no WhatsApp template is needed and staff choose who to contact. */
export function RecallsDueCard({ w }: { w: Workspace }) {
  const list = recallsToCall(w.recalls, w.now.date);
  if (!list.length) return null;
  return <section className="card">
    <div className="card-head card-head-row"><h2>Recalls due</h2><span className="count">{list.length}</span></div>
    <ul className="plain-list">{list.slice(0, 8).map(r => {
      const p = w.patient(r.patientId);
      return <li key={r.id} className="plan-item">
        <button type="button" className="btn-link-plain row-tight" onClick={() => w.go('patients', r.patientId)}><Avatar name={p?.name || '?'} size="sm" /><span><strong>{p?.name || 'Patient'}</strong><small className="muted"> {r.reason} · {short(r.due)}</small></span></button>
        <span className="row-tight">
          {p?.consent && <a className="btn-icon" title="Message on WhatsApp" aria-label={`Message ${p.name} on WhatsApp`} href={whatsappUrl(p.phone, recallMessage(r, p, w.clinic))} target="_blank" rel="noreferrer"><MessageCircle size={15} /></a>}
          <button type="button" className="btn btn-sm btn-soft" onClick={() => w.book({ patientId: r.patientId, recallId: r.id })}>Book</button>
          {w.can.writeRecords && <button type="button" className="btn-icon" aria-label={`Dismiss recall for ${p?.name || 'patient'}`} onClick={() => w.repo.saveRecall({ ...r, status: 'dismissed' }).catch(e => toast.error((e as Error).message))}><X size={14} /></button>}
        </span>
      </li>;
    })}</ul>
    {list.length > 8 && <p className="muted small">+{list.length - 8} more</p>}
  </section>;
}
