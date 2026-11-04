import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download, ExternalLink, FilePenLine, GripVertical, Lock, Plus, Printer, Save, Send, Trash2, X } from 'lucide-react';
import { dateLabel } from '@/lib/clinic';
import { amendPrescription, blankMedicine, cleanPrescription, dayPresets, followUpPresets, frequencies, medicineInstruction, prescriptionMessage, timings, validatePrescription, whatsappUrl, type Medicine, type Prescription } from '@/lib/prescription';
import { padFor, specialties, type Specialty } from '@/lib/rx-templates';
import { elementToPdf, toBase64 } from '@/lib/pdf';
import { patientLanguage } from '@/lib/patient-language';
import { applyRxPrefill, emptyPrefill, rxPrefill } from '@/lib/patient-record';
import { usePatientRecord } from '@/hooks/use-patient-record';
import { allergyConflicts, unreviewedConflicts } from '@/lib/allergy-check';
import { applyTemplate, templateFromRx, withCatalogDefaults } from '@/lib/catalog';
import { AllergyBanner } from '../workspace/patient-record';
import { Field, Kbd, Select } from '../kit';
import { PatientPicker } from '../patient-picker';
import { Pad } from './pad';
import { ToothChart } from './tooth-chart';
import type { Workspace } from '../workspace/types';

type TextField = 'history' | 'complaints' | 'findings' | 'diagnosis' | 'procedures' | 'plan' | 'advice';

export default function PrescriptionBuilder({ w, initial, onClose }: { w: Workspace; initial: Prescription; onClose: () => void }) {
  const [rx, setRx] = useState(initial);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<'pad' | 'whatsapp'>('pad');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  // A prescription older than the live window is not in w.prescriptions, but only a saved one has createdAt.
  const isSaved = !!rx.createdAt || w.prescriptions.some(p => p.id === rx.id);
  const isFinal = rx.status === 'final';
  const canWrite = w.can.writeRx && (w.account.role !== 'doctor' || rx.doctorId === w.account.doctorId);
  const locked = isFinal || !canWrite;
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const exportRef = useRef<HTMLDivElement>(null);
  const focusMed = useRef<string | null>(null);
  const patient = w.patient(rx.patientId);
  const doctor = w.doctor(rx.doctorId);
  const pad = { ...padFor(w.clinic.rxPad), specialty: rx.specialty };
  const preset = specialties[rx.specialty];
  const has = (s: (typeof preset.sections)[number]) => preset.sections.includes(s);
  const set = (v: Partial<Prescription>) => { setRx(x => ({ ...x, ...v })); setDirty(true); setError(''); };
  const setMed = (id: string, v: Partial<Medicine>) => set({ medicines: rx.medicines.map(m => { if (m.id !== id) return m; const next = { ...m, ...v }; return v.name !== undefined ? withCatalogDefaults(next, w.catalog) : next; }) });
  const addMed = (after?: string) => { const m = blankMedicine(); focusMed.current = m.id; const i = after ? rx.medicines.findIndex(x => x.id === after) + 1 : rx.medicines.length; set({ medicines: [...rx.medicines.slice(0, i), m, ...rx.medicines.slice(i)] }); };
  useEffect(() => { if (focusMed.current) { nameRefs.current.get(focusMed.current)?.focus(); focusMed.current = null; } });
  // Start typing straight away: the first medicine when the patient is known, otherwise the patient search.
  useEffect(() => {
    const t = setTimeout(() => (initial.patientId ? document.querySelector<HTMLElement>('.rxb-form [data-first]') : document.querySelector<HTMLElement>('.rxb .combo input'))?.focus());
    return () => clearTimeout(t);
  }, [initial]);

  // This clinic's own recent medicines first, then the specialty's common list.
  const medicineOptions = useMemo(() => {
    const recent = w.prescriptions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap(p => p.medicines.map(m => m.name));
    return Array.from(new Set([...w.catalog.medicines.map(m => m.name), ...recent, ...preset.medicines]));
  }, [w.prescriptions, w.catalog, preset]);
  const lastForPatient = useMemo(() => w.prescriptions.filter(p => p.patientId === rx.patientId && p.id !== rx.id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0], [w.prescriptions, rx.patientId, rx.id]);
  const lang = patientLanguage(patient?.language);
  const record = usePatientRecord(w.repo, w.clinic.id, w.can.readRecords ? rx.patientId : '');
  const allergies = record.status === 'ready' ? record.value?.allergies || [] : [];
  const conflicts = allergyConflicts(rx.medicines, allergies);
  const unreviewed = unreviewedConflicts(conflicts, rx.allergyOverride);
  // New drafts start from the patient's record. Doesn't mark the draft dirty: nothing has been typed yet.
  const prefilled = useRef(emptyPrefill);
  useEffect(() => {
    if (isSaved || locked || rx.amends || record.status !== 'ready') return;
    const next = rxPrefill(record.value, rx.date);
    const previous = prefilled.current; prefilled.current = next;
    setRx(x => applyRxPrefill(x, previous, next));
  }, [record, isSaved, locked, rx.amends, rx.date]);

  /** Chips add or remove one entry in a text field; separator is ", " for short lists, newline for steps. */
  const entries = (field: TextField, sep: string) => rx[field].split(sep === '\n' ? '\n' : /,\s*/).map(s => s.trim()).filter(Boolean);
  const toggle = (field: TextField, value: string, sep = '\n') => { const list = entries(field, sep); set({ [field]: (list.includes(value) ? list.filter(v => v !== value) : [...list, value]).join(sep) }); };
  const chips = (field: TextField, options: string[], sep = '\n') => options.length > 0 && <div className="chips chips-xs">{options.map(o => <button type="button" key={o} className={'chip' + (entries(field, sep).includes(o) ? ' on' : '')} onClick={() => toggle(field, o, sep)}>{o}</button>)}</div>;

  /** The checked prescription with the given status. Already-final ones stay exactly as they are. */
  function prepared(status: Prescription['status']) {
    if (isFinal) return rx;
    validatePrescription(rx, w.patients, w.clinic.doctors);
    return cleanPrescription({ ...rx, status, createdAt: rx.createdAt || new Date().toISOString() });
  }
  /** Printing or sending a draft finalises it first, so what a patient holds always matches the record. */
  function forPatient() {
    if (!isFinal && !canWrite) throw new Error('This draft has not been finalised by the doctor yet.');
    if (!isFinal && unreviewed.length) throw new Error(`Review the allergy warning for ${unreviewed[0].medicine} first.`);
    return prepared('final');
  }
  async function persist(clean: Prescription) {
    if (clean.status === 'final' && isFinal) return;
    await w.repo.savePrescription(w.account, clean);
    setRx({ ...clean, finalizedBy: clean.status === 'final' ? w.account.name : undefined });
    setDirty(false);
  }
  async function run(label: string, task: () => Promise<void>) {
    if (busy) return false;
    setBusy(label);
    try { await task(); return true; } catch (e) { setError((e as Error).message); toast.error((e as Error).message); return false; } finally { setBusy(''); }
  }
  const pdf = () => elementToPdf(exportRef.current!.firstElementChild as HTMLElement, pad.paper);
  const fileName = () => `Prescription ${patient?.name || ''} ${rx.date}.pdf`.replace(/[^\w .-]+/g, '').replace(/\s+/g, '-');

  function save() { try { if (locked) return; const clean = prepared('draft'); void run('Saving…', async () => { await persist(clean); toast.success('Draft saved'); }); } catch (e) { setError((e as Error).message); } }
  function finish() { try { const clean = forPatient(); void run('Finalising…', async () => { await persist(clean); toast.success('Prescription finalised'); }); } catch (e) { setError((e as Error).message); } }
  function chooseTemplate(id: string) { const t = w.catalog.templates.find(x => x.id === id); if (t) { setRx(x => applyTemplate(x, t)); setDirty(true); } }
  function saveAsTemplate() {
    const name = window.prompt('Name this template, for example “After extraction”:');
    if (name === null) return;
    try { const template = templateFromRx(rx, name); w.repo.saveCatalog({ ...w.catalog, templates: [...w.catalog.templates, template] }).then(() => toast.success('Template saved')).catch(e => toast.error((e as Error).message)); }
    catch (e) { setError((e as Error).message); }
  }
  function amend() { if (dirty && !window.confirm('Discard unsaved changes to this prescription?')) return; w.writeRx({ item: amendPrescription(rx, w.now.date) }); }
  async function viewOriginal() {
    try { const original = rx.amends ? await w.repo.getPrescription(rx.amends) : null; if (original) w.writeRx({ item: original }); else toast.error('The original prescription could not be found.'); }
    catch (e) { toast.error((e as Error).message); }
  }
  function send() {
    let clean: Prescription;
    try {
      clean = forPatient();
      if (!patient) throw new Error('Choose the patient first.');
      if (!w.can.sendRx) throw new Error('Your role cannot send prescriptions.');
      if (!patient.consent) throw new Error(`${patient.name} has not agreed to WhatsApp messages. Record consent in their profile, or use “My WhatsApp”.`);
    } catch (e) { setError((e as Error).message); return; }
    void run('Preparing PDF…', async () => {
      await persist(clean);
      const file = await pdf();
      setBusy('Sending…');
      const result = await w.repo.sendPrescription(clean.id, toBase64(file), fileName());
      if (result.status !== 'accepted') throw new Error(result.error || 'WhatsApp could not confirm the message. Check Messages before sending again.');
      setRx(x => ({ ...x, sentAt: new Date().toISOString() }));
      setDirty(false);
      toast.success(`Prescription sent to ${patient!.name} on WhatsApp`);
    });
  }
  function sendFromMyWhatsapp() {
    try {
      const clean = forPatient();
      if (!patient) throw new Error('Choose the patient first.');
      // Open WhatsApp synchronously inside the click so pop-up blockers allow it.
      window.open(whatsappUrl(patient.phone, prescriptionMessage(clean, w.clinic, patient, doctor)), '_blank', 'noopener');
      void run('Saving…', () => persist(clean));
    } catch (e) { setError((e as Error).message); }
  }
  function download() {
    let clean: Prescription;
    try { clean = forPatient(); } catch (e) { setError((e as Error).message); return; }
    void run('Preparing PDF…', async () => {
      await persist(clean);
      const url = URL.createObjectURL(new Blob([await pdf() as BlobPart], { type: 'application/pdf' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName() });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }
  function print() {
    let clean: Prescription;
    try { clean = forPatient(); } catch (e) { setError((e as Error).message); return; }
    void run('Finalising…', () => persist(clean)).then(ok => { if (ok) printNow(); });
  }
  function printNow() {
    const node = exportRef.current?.firstElementChild; if (!node) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map(s => s.outerHTML).join('');
    const doc = frame.contentDocument!;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${fileName()}</title>${styles}<style>@page{size:${pad.paper};margin:0}html,body{background:#fff;margin:0}.pad{box-shadow:none;border-radius:0;width:100%;min-height:100vh}</style></head><body>${node.outerHTML}</body></html>`); doc.close();
    setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 1000); }, 300);
  }
  function close() { if (dirty && !window.confirm('Discard unsaved changes to this prescription?')) return; onClose(); }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); print(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const text = (field: TextField, label: string, placeholder: string, options: string[] = [], sep = '\n', rows = 2) =>
    <Field label={label}>{chips(field, options, sep)}<textarea className="input" rows={rows} data-first={field === 'complaints' || undefined} value={rx[field]} maxLength={field === 'advice' ? 3000 : 2000} onChange={e => set({ [field]: e.target.value })} placeholder={placeholder} /></Field>;

  return <div className="rxb">
    <header className="rxb-head">
      <div className="rxb-title"><h2>{rx.amends && !isFinal ? 'Amending prescription' : isSaved ? 'Prescription' : 'New prescription'}</h2><small>{patient ? `${patient.name} · ${dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Choose a patient to begin'}{isFinal ? ' · final' : ' · draft'}{rx.sentAt ? ' · sent' : dirty && isSaved ? ' · unsaved changes' : ''}</small></div>
      <div className="rxb-actions">
        <button className="btn btn-ghost" onClick={print} title="Print (Ctrl+P)"><Printer size={16} /><span>Print</span></button>
        <button className="btn btn-ghost" onClick={download} disabled={!!busy} title="Download PDF"><Download size={16} /><span>PDF</span></button>
        {isFinal && w.can.writeRx && canWrite && <button className="btn btn-outline" onClick={amend} disabled={!!busy} title="Make a corrected copy. This one stays on record."><FilePenLine size={16} /><span>Amend</span></button>}
        <button className="btn btn-ghost" onClick={sendFromMyWhatsapp} disabled={!!busy || !patient} title="Open WhatsApp on this computer with the prescription as text"><ExternalLink size={16} /><span>My WhatsApp</span></button>
        {!locked && <button className="btn btn-outline" onClick={save} disabled={!!busy} title="Save draft (Ctrl+S)"><Save size={16} /><span>Save draft</span></button>}
        {!locked && <button className="btn btn-primary" onClick={finish} disabled={!!busy || !patient} title="Lock this prescription under your name"><CheckCircle2 size={16} /><span>Finalise</span></button>}
        {w.can.sendRx && <button className="btn btn-wa" onClick={send} disabled={!!busy || !patient} title="Send the PDF from the clinic’s WhatsApp number (Ctrl+Enter)"><Send size={16} /><span>{busy || (rx.sentAt ? 'Send again' : 'Send on WhatsApp')}</span></button>}
        <button className="btn-icon" aria-label="Close" onClick={close}><X size={20} /></button>
      </div>
    </header>

    <div className="rxb-body">
      <div className="rxb-form">
        {isFinal && <p className="note note-info row-tight"><Lock size={15} /><span>Final{rx.finalizedBy ? `, by ${rx.finalizedBy}` : ''}. It cannot be changed. {canWrite ? 'Use Amend to make a corrected copy.' : ''}</span></p>}
        {!isFinal && !canWrite && <p className="note note-warn row-tight"><Lock size={15} /><span>This is a draft by the doctor. You can read it, but it cannot be printed or sent until it is finalised.</span></p>}
        {rx.amends && <p className="note row-between"><span>This replaces an earlier prescription, which stays on record.</span><button type="button" className="btn btn-sm btn-ghost" onClick={() => void viewOriginal()}>View original</button></p>}
        <fieldset className="rxb-fields" disabled={locked}>
        <section className="rxb-sec">
          <div className="grid-rx-top">
            <Field label="Patient"><PatientPicker patients={w.patients} value={rx.patientId} onChange={patientId => set({ patientId })} onCreate={w.savePatient} clinicId={w.clinic.id} autoFocus={!rx.patientId} /></Field>
            <Field label="Doctor"><Select label="Doctor" className={w.account.role === 'doctor' ? 'is-fixed' : ''} value={rx.doctorId} onChange={doctorId => { const d = w.doctor(doctorId); set({ doctorId, ...(d?.padSpecialty && !isSaved ? { specialty: d.padSpecialty } : {}) }); }} options={w.clinic.doctors.filter(d => w.account.role !== 'doctor' || d.id === w.account.doctorId || d.id === rx.doctorId).map(d => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Date"><input className="input" type="date" value={rx.date} onChange={e => set({ date: e.target.value })} /></Field>
            <Field label="Pad"><Select label="Prescription pad" value={rx.specialty} onChange={v => set({ specialty: v as Specialty })} options={Object.entries(specialties).map(([value, s]) => ({ value, label: s.label }))} /></Field>
          </div>
          {lastForPatient && !isSaved && rx.medicines.every(m => !m.name) && <div className="note note-info row-between"><span>Last visit {dateLabel(lastForPatient.date, { day: 'numeric', month: 'short' })}: {lastForPatient.diagnosis || lastForPatient.medicines.map(m => m.name).join(', ')}{lastForPatient.teeth?.length ? ` · teeth ${lastForPatient.teeth.join(', ')}` : ''}</span>
            <button className="btn btn-sm btn-soft" onClick={() => set({ history: lastForPatient.history, diagnosis: lastForPatient.diagnosis, plan: lastForPatient.plan, teeth: lastForPatient.teeth || [], medicines: lastForPatient.medicines.map(m => ({ ...m, id: crypto.randomUUID() })), advice: lastForPatient.advice })}>Copy forward</button></div>}
          {rx.patientId && w.can.readRecords && <AllergyBanner live={record} compact />}
          <div className="grid-vitals">
            <Field label="Age"><input className="input" inputMode="numeric" maxLength={3} value={rx.age} onChange={e => set({ age: e.target.value.replace(/\D/g, '') })} placeholder="yrs" /></Field>
            <Field label="Sex"><Select label="Sex" value={rx.sex} onChange={v => set({ sex: v as Prescription['sex'] })} options={[{ value: '', label: '—' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]} /></Field>
            {has('vitals') && preset.vitals.includes('bp') && <Field label="BP"><input className="input" value={rx.vitals.bp} onChange={e => set({ vitals: { ...rx.vitals, bp: e.target.value } })} placeholder="120/80" maxLength={9} /></Field>}
            {has('vitals') && preset.vitals.includes('pulse') && <Field label="Pulse"><input className="input" inputMode="numeric" value={rx.vitals.pulse} onChange={e => set({ vitals: { ...rx.vitals, pulse: e.target.value } })} placeholder="/min" maxLength={3} /></Field>}
            {has('vitals') && preset.vitals.includes('temp') && <Field label="Temp °F"><input className="input" inputMode="decimal" value={rx.vitals.temp} onChange={e => set({ vitals: { ...rx.vitals, temp: e.target.value } })} placeholder="98.6" maxLength={5} /></Field>}
            {has('vitals') && preset.vitals.includes('weight') && <Field label="Weight kg"><input className="input" inputMode="decimal" value={rx.vitals.weight} onChange={e => set({ vitals: { ...rx.vitals, weight: e.target.value } })} maxLength={5} /></Field>}
            {has('vitals') && preset.vitals.includes('spo2') && <Field label="SpO₂ %"><input className="input" inputMode="numeric" value={rx.vitals.spo2} onChange={e => set({ vitals: { ...rx.vitals, spo2: e.target.value } })} maxLength={3} /></Field>}
          </div>
          {has('history') && text('history', preset.labels.history || 'Medical history & allergies', 'e.g. Diabetic, allergic to penicillin', preset.history, ', ', 1)}
          {has('complaints') && text('complaints', preset.labels.complaints || 'Complaints', rx.specialty === 'dental' ? 'e.g. Pain in lower left back tooth for 3 days' : 'e.g. Fever and cough for 3 days')}
        </section>

        {has('teeth') && <section className="rxb-sec"><h3 className="sec-h">Teeth involved <small className="muted">click to mark · FDI numbering</small></h3><ToothChart value={rx.teeth} onChange={teeth => set({ teeth })} /></section>}

        {(has('findings') || has('diagnosis') || has('procedures') || has('plan')) && <section className="rxb-sec">
          {has('findings') && text('findings', preset.labels.findings || 'Findings', rx.specialty === 'dental' ? 'e.g. Deep occlusal caries, tender on percussion' : 'Examination findings')}
          {has('diagnosis') && text('diagnosis', 'Diagnosis', 'Select above or type', preset.diagnoses, ', ')}
          {has('procedures') && text('procedures', preset.labels.procedures || 'Procedure', 'One per line', preset.procedures)}
          {has('plan') && text('plan', preset.labels.plan || 'Plan', 'One per line', preset.plans)}
        </section>}

        <section className="rxb-sec">
          <div className="sec-row"><h3 className="rx-symbol">℞ Medicines</h3><span className="row-tight wrap">
            {w.catalog.templates.length > 0 && <Select label="Use a template" className="input-sm" value="" onChange={chooseTemplate} options={[{ value: '', label: 'Use a template…' }, ...w.catalog.templates.map(t => ({ value: t.id, label: t.name }))]} />}
            <button type="button" className="btn-link" onClick={saveAsTemplate}>Save as template</button>
            <small className="muted">Enter in a name adds the next row</small></span></div>
          {conflicts.length > 0 && <div className={'note ' + (unreviewed.length ? 'note-error' : 'note-warn')} role="alert">
            <strong>Allergy warning</strong>
            <ul className="plain-list">{conflicts.map((c, i) => <li key={i}>{c.medicine} {c.reason}{c.severity ? ` (recorded as ${c.severity})` : ''}.</li>)}</ul>
            {unreviewed.length > 0 ? <button type="button" className="btn btn-sm btn-danger" onClick={() => set({ allergyOverride: [...new Set(conflicts.map(c => c.medicine))] })}>I have checked this and still want to prescribe</button> : <small>Reviewed. This confirmation is saved with the prescription.</small>}
          </div>}
          <datalist id="rx-medicines">{medicineOptions.map(m => <option key={m} value={m} />)}</datalist>
          <div className="chips chips-xs med-quick">{preset.medicines.slice(0, 8).map(name => <button type="button" key={name} className="chip" onClick={() => { const empty = rx.medicines.find(m => !m.name.trim()); if (empty) setMed(empty.id, { name }); else set({ medicines: [...rx.medicines, { ...blankMedicine(), name }] }); }}>+ {name.replace(/^(Tab|Cap|Syp) /, '')}</button>)}</div>
          <ol className="meds">{rx.medicines.map((m, i) => <li key={m.id} className="med">
            <div className="med-top"><span className="med-n"><GripVertical size={14} />{i + 1}</span>
              <input ref={el => { if (el) nameRefs.current.set(m.id, el); else nameRefs.current.delete(m.id); }} className="input med-name" list="rx-medicines" placeholder="Medicine and strength (e.g. Tab Ibuprofen 400 mg)" value={m.name} maxLength={120}
                onChange={e => setMed(m.id, { name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMed(m.id); } }} aria-label={`Medicine ${i + 1}`} />
              <button className="btn-icon" aria-label={`Remove medicine ${i + 1}`} onClick={() => set({ medicines: rx.medicines.length > 1 ? rx.medicines.filter(x => x.id !== m.id) : [blankMedicine()] })}><Trash2 size={16} /></button></div>
            <div className="med-grid">
              <div className="med-field"><small>Dose</small><div className="chips chips-xs">{frequencies.slice(0, 6).map(f => <button type="button" key={f} className={'chip' + (m.frequency === f ? ' on' : '')} onClick={() => setMed(m.id, { frequency: f })}>{f}</button>)}
                <input className="input input-xs" value={frequencies.slice(0, 6).includes(m.frequency) ? '' : m.frequency} placeholder="other" list="rx-freq" aria-label="Custom dose" onChange={e => setMed(m.id, { frequency: e.target.value || '1-0-1' })} /></div></div>
              <div className="med-field"><small>When</small><Select label="When to take" className="input-sm" value={m.timing} onChange={v => setMed(m.id, { timing: v as Medicine['timing'] })} options={timings.map(t => ({ value: t.value, label: t.label }))} /></div>
              <div className="med-field"><small>Days</small><div className="row-tight"><input className="input input-sm days" inputMode="numeric" maxLength={3} value={m.days} onChange={e => setMed(m.id, { days: e.target.value.replace(/\D/g, '') })} aria-label="Number of days" />
                <div className="chips chips-xs">{dayPresets.map(d => <button type="button" key={d} className={'chip' + (m.days === d ? ' on' : '')} onClick={() => setMed(m.id, { days: d })}>{d}</button>)}</div></div></div>
            </div>
            <input className="input input-sm med-note" placeholder="Note for patient (optional)" value={m.notes} maxLength={200} onChange={e => setMed(m.id, { notes: e.target.value })} aria-label="Medicine note" />
            {m.name && <small className="med-read">{medicineInstruction(m)}{lang !== 'en' && <> · <span lang={lang}>{medicineInstruction(m, lang)}</span></>}</small>}
          </li>)}</ol>
          <datalist id="rx-freq">{frequencies.map(f => <option key={f} value={f} />)}<option value="1-1-0" /><option value="½-0-½" /><option value="0-1-1" /></datalist>
          <button className="btn btn-ghost" onClick={() => addMed()}><Plus size={16} />Add medicine</button>
        </section>

        <section className="rxb-sec">
          {text('advice', 'Advice', 'One instruction per line', preset.advice, '\n', 3)}
          <div className="grid-2">
            <Field label="Tests / investigations"><input className="input" value={rx.tests} maxLength={1000} onChange={e => set({ tests: e.target.value })} placeholder={rx.specialty === 'dental' ? 'e.g. IOPA 36, OPG' : 'e.g. CBC, HbA1c'} /></Field>
            <Field label="Next visit"><div className="row-tight wrap"><input className="input input-sm" type="date" min={rx.date} value={rx.followUp} onChange={e => set({ followUp: e.target.value })} />
              {followUpPresets(rx.date).map(f => <button type="button" key={f.label} className={'chip' + (rx.followUp === f.value ? ' on' : '')} onClick={() => set({ followUp: rx.followUp === f.value ? '' : f.value })}>{f.label}</button>)}</div></Field>
          </div>
          {rx.followUp && patient && <button className="btn btn-sm btn-ghost" onClick={() => w.book({ patientId: patient.id, doctorId: rx.doctorId, date: rx.followUp })}>Book the next visit now →</button>}
        </section>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="shortcut-hint"><Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> save draft · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> send on WhatsApp · <Kbd>Ctrl</Kbd>+<Kbd>P</Kbd> print</p>
      </div>

      <aside className="rxb-preview">
        <div className="seg seg-sm" role="tablist" aria-label="Preview"><button role="tab" aria-selected={preview === 'pad'} className={preview === 'pad' ? 'on' : ''} onClick={() => setPreview('pad')}>Pad (PDF)</button><button role="tab" aria-selected={preview === 'whatsapp'} className={preview === 'whatsapp' ? 'on' : ''} onClick={() => setPreview('whatsapp')}>WhatsApp</button></div>
        {preview === 'pad' ? <Pad rx={rx} clinic={w.clinic} doctor={doctor} patient={patient} pad={pad} /> : <div className="wa-preview"><div className="wa-bar">{patient ? <><strong>{patient.name}</strong><small>{patient.phone}</small></> : <small>No patient selected</small>}</div>
          <div className="wa-chat"><div className="wa-bubble wa-doc"><div className="wa-file"><span>PDF</span><div><strong>{fileName()}</strong><small>Prescription · {pad.paper}</small></div></div>
            <div>Hello {patient?.name || '…'}, your prescription from {doctor?.name} at {w.clinic.name} dated {dateLabel(rx.date, { day: 'numeric', month: 'long', year: 'numeric' })} is attached. For any questions, please call {w.clinic.phone}.</div></div></div>
          <p className="muted small">Sent from the clinic’s WhatsApp number through MSG91, using the approved prescription template with the PDF attached.{patient && !patient.consent && ' This patient has no WhatsApp consent recorded.'}</p></div>}
      </aside>
    </div>
    {/* Fixed-width copy used for PDF and print, so output is identical on any screen size. */}
    <div className="pad-export" ref={exportRef} aria-hidden><Pad rx={rx} clinic={w.clinic} doctor={doctor} patient={patient} pad={pad} /></div>
  </div>;
}
