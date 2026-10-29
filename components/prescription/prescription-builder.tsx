"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, GripVertical, Plus, Printer, Save, Send, Trash2, X } from 'lucide-react';
import { dateLabel, type Patient } from '@/lib/clinic';
import { adviceChips, blankMedicine, cleanPrescription, commonMedicines, dayPresets, followUpPresets, frequencies, medicineInstruction, prescriptionMessage, timings, validatePrescription, vitalsLine, whatsappUrl, type Medicine, type Prescription } from '@/lib/prescription';
import { patientLanguage } from '@/lib/patient-language';
import { Field, Kbd, Select } from '../kit';
import { PatientPicker } from '../patient-picker';
import type { Workspace } from '../workspace/types';

export default function PrescriptionBuilder({ w, initial, onClose }: { w: Workspace; initial: Prescription; onClose: () => void }) {
  const [rx, setRx] = useState(initial);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<'pad' | 'whatsapp'>('pad');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const isSaved = w.prescriptions.some(p => p.id === rx.id);
  const nameRefs = useRef(new Map<string, HTMLInputElement>());
  const focusMed = useRef<string | null>(null);
  const patient = w.patient(rx.patientId);
  const doctor = w.doctor(rx.doctorId);
  const set = (v: Partial<Prescription>) => { setRx(x => ({ ...x, ...v })); setDirty(true); setError(''); };
  const setMed = (id: string, v: Partial<Medicine>) => set({ medicines: rx.medicines.map(m => m.id === id ? { ...m, ...v } : m) });
  const addMed = (after?: string) => { const m = blankMedicine(); focusMed.current = m.id; const i = after ? rx.medicines.findIndex(x => x.id === after) + 1 : rx.medicines.length; set({ medicines: [...rx.medicines.slice(0, i), m, ...rx.medicines.slice(i)] }); };
  useEffect(() => { if (focusMed.current) { nameRefs.current.get(focusMed.current)?.focus(); focusMed.current = null; } });
  // Start typing straight away: the first medicine when the patient is known, otherwise the patient search.
  useEffect(() => {
    const t = setTimeout(() => (initial.patientId ? nameRefs.current.get(initial.medicines[0]?.id) : document.querySelector<HTMLElement>('.rxb .combo input'))?.focus());
    return () => clearTimeout(t);
  }, [initial]);

  // Doctor's own recent medicines first, then the common list.
  const medicineOptions = useMemo(() => {
    const recent = w.prescriptions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap(p => p.medicines.map(m => m.name));
    return Array.from(new Set([...recent, ...commonMedicines]));
  }, [w.prescriptions]);
  const lastForPatient = useMemo(() => w.prescriptions.filter(p => p.patientId === rx.patientId && p.id !== rx.id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))[0], [w.prescriptions, rx.patientId, rx.id]);
  const message = useMemo(() => prescriptionMessage(rx, w.clinic, patient, doctor), [rx, w.clinic, patient, doctor]);
  const lang = patientLanguage(patient?.language);

  function finalize(sent: boolean) {
    validatePrescription(rx, w.patients, w.clinic.doctors);
    const now = new Date().toISOString();
    return cleanPrescription({ ...rx, createdAt: rx.createdAt || now, sentAt: sent ? now : rx.sentAt });
  }
  async function persist(clean: Prescription, okMessage: string) {
    setBusy(true);
    try { await w.repo.savePrescription(clean); setRx(clean); setDirty(false); toast.success(okMessage); }
    catch (e) { toast.error(`Could not save: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }
  function save() { try { void persist(finalize(false), 'Prescription saved'); } catch (e) { setError((e as Error).message); } }
  function send() {
    try {
      const clean = finalize(true);
      if (!patient) throw new Error('Choose the patient first.');
      // Open WhatsApp synchronously inside the click so pop-up blockers allow it.
      window.open(whatsappUrl(patient.phone, prescriptionMessage(clean, w.clinic, patient, doctor)), '_blank', 'noopener');
      void persist(clean, `Opened WhatsApp for ${patient.name}`);
    } catch (e) { setError((e as Error).message); }
  }
  async function copy() { try { await navigator.clipboard.writeText(message); toast.success('Prescription copied'); } catch { toast.error('Copy is blocked in this browser.'); } }
  function print() {
    const pad = document.getElementById('rx-pad'); if (!pad) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Prescription – ${patient?.name || ''}</title><style>${PRINT_CSS}</style></head><body>${pad.outerHTML}</body></html>`); doc.close();
    frame.contentWindow!.focus(); frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
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

  const toggleAdvice = (line: string) => { const lines = rx.advice.split('\n').map(l => l.trim()).filter(Boolean); set({ advice: (lines.includes(line) ? lines.filter(l => l !== line) : [...lines, line]).join('\n') }); };

  return <div className="rxb">
    <header className="rxb-head">
      <div className="rxb-title"><h2>{isSaved ? 'Prescription' : 'New prescription'}</h2><small>{patient ? `${patient.name} · ${dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Choose a patient to begin'}{dirty && isSaved ? ' · unsaved changes' : ''}</small></div>
      <div className="rxb-actions">
        <button className="btn btn-ghost" onClick={copy} title="Copy text"><Copy size={16} /><span>Copy</span></button>
        <button className="btn btn-ghost" onClick={print} title="Print or save as PDF (Ctrl+P)"><Printer size={16} /><span>Print</span></button>
        <button className="btn btn-outline" onClick={save} disabled={busy} title="Save (Ctrl+S)"><Save size={16} /><span>Save</span></button>
        <button className="btn btn-wa" onClick={send} disabled={busy || !patient} title="Send on WhatsApp (Ctrl+Enter)"><Send size={16} /><span>{rx.sentAt ? 'Send again' : 'Send on WhatsApp'}</span></button>
        <button className="btn-icon" aria-label="Close" onClick={close}><X size={20} /></button>
      </div>
    </header>

    <div className="rxb-body">
      <div className="rxb-form">
        <section className="rxb-sec">
          <div className="grid-rx-top">
            <Field label="Patient"><PatientPicker patients={w.patients} value={rx.patientId} onChange={patientId => set({ patientId })} onCreate={w.savePatient} clinicId={w.clinic.id} autoFocus={!rx.patientId} /></Field>
            <Field label="Doctor"><Select label="Doctor" value={rx.doctorId} onChange={doctorId => set({ doctorId })} options={w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Date"><input className="input" type="date" value={rx.date} onChange={e => set({ date: e.target.value })} /></Field>
          </div>
          {lastForPatient && !isSaved && rx.medicines.every(m => !m.name) && <div className="note note-info row-between"><span>Last Rx {dateLabel(lastForPatient.date, { day: 'numeric', month: 'short' })}: {lastForPatient.medicines.map(m => m.name).join(', ') || lastForPatient.diagnosis}</span>
            <button className="btn btn-sm btn-soft" onClick={() => set({ diagnosis: lastForPatient.diagnosis, complaints: lastForPatient.complaints, advice: lastForPatient.advice, tests: lastForPatient.tests, medicines: lastForPatient.medicines.map(m => ({ ...m, id: crypto.randomUUID() })) })}>Repeat it</button></div>}
          <div className="grid-vitals">
            <Field label="Age"><input className="input" inputMode="numeric" maxLength={3} value={rx.age} onChange={e => set({ age: e.target.value.replace(/\D/g, '') })} placeholder="yrs" /></Field>
            <Field label="Sex"><Select label="Sex" value={rx.sex} onChange={v => set({ sex: v as Prescription['sex'] })} options={[{ value: '', label: '—' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'O', label: 'Other' }]} /></Field>
            <Field label="BP"><input className="input" value={rx.vitals.bp} onChange={e => set({ vitals: { ...rx.vitals, bp: e.target.value } })} placeholder="120/80" maxLength={9} /></Field>
            <Field label="Pulse"><input className="input" inputMode="numeric" value={rx.vitals.pulse} onChange={e => set({ vitals: { ...rx.vitals, pulse: e.target.value } })} placeholder="/min" maxLength={3} /></Field>
            <Field label="Temp °F"><input className="input" inputMode="decimal" value={rx.vitals.temp} onChange={e => set({ vitals: { ...rx.vitals, temp: e.target.value } })} placeholder="98.6" maxLength={5} /></Field>
            <Field label="Weight kg"><input className="input" inputMode="decimal" value={rx.vitals.weight} onChange={e => set({ vitals: { ...rx.vitals, weight: e.target.value } })} maxLength={5} /></Field>
            <Field label="SpO₂ %"><input className="input" inputMode="numeric" value={rx.vitals.spo2} onChange={e => set({ vitals: { ...rx.vitals, spo2: e.target.value } })} maxLength={3} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Complaints"><textarea className="input" rows={2} value={rx.complaints} maxLength={2000} onChange={e => set({ complaints: e.target.value })} placeholder="e.g. Fever and cough for 3 days" /></Field>
            <Field label="Diagnosis"><textarea className="input" rows={2} value={rx.diagnosis} maxLength={1000} onChange={e => set({ diagnosis: e.target.value })} placeholder="e.g. Acute upper respiratory infection" /></Field>
          </div>
        </section>

        <section className="rxb-sec">
          <div className="sec-row"><h3 className="rx-symbol">℞ Medicines</h3><small className="muted">Enter in a name adds the next row</small></div>
          <datalist id="rx-medicines">{medicineOptions.map(m => <option key={m} value={m} />)}</datalist>
          <ol className="meds">{rx.medicines.map((m, i) => <li key={m.id} className="med">
            <div className="med-top"><span className="med-n"><GripVertical size={14} />{i + 1}</span>
              <input ref={el => { if (el) nameRefs.current.set(m.id, el); else nameRefs.current.delete(m.id); }} className="input med-name" list="rx-medicines" placeholder="Medicine, strength (e.g. Tab Paracetamol 650 mg)" value={m.name} maxLength={120}
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
          <Field label="Advice"><div className="chips chips-xs">{adviceChips.map(a => <button type="button" key={a} className={'chip' + (rx.advice.split('\n').map(l => l.trim()).includes(a) ? ' on' : '')} onClick={() => toggleAdvice(a)}>{a}</button>)}</div>
            <textarea className="input" rows={3} value={rx.advice} maxLength={3000} onChange={e => set({ advice: e.target.value })} placeholder="One instruction per line" /></Field>
          <div className="grid-2">
            <Field label="Tests / investigations"><input className="input" value={rx.tests} maxLength={1000} onChange={e => set({ tests: e.target.value })} placeholder="e.g. CBC, HbA1c" /></Field>
            <Field label="Follow-up"><div className="row-tight wrap"><input className="input input-sm" type="date" min={rx.date} value={rx.followUp} onChange={e => set({ followUp: e.target.value })} />
              {followUpPresets(rx.date).map(f => <button type="button" key={f.label} className={'chip' + (rx.followUp === f.value ? ' on' : '')} onClick={() => set({ followUp: rx.followUp === f.value ? '' : f.value })}>{f.label}</button>)}</div></Field>
          </div>
          {rx.followUp && patient && <button className="btn btn-sm btn-ghost" onClick={() => w.book({ patientId: patient.id, doctorId: rx.doctorId, date: rx.followUp })}>Book the follow-up visit now →</button>}
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="shortcut-hint"><Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> save · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> send on WhatsApp · <Kbd>Ctrl</Kbd>+<Kbd>P</Kbd> print</p>
      </div>

      <aside className="rxb-preview">
        <div className="seg seg-sm" role="tablist" aria-label="Preview"><button role="tab" aria-selected={preview === 'pad'} className={preview === 'pad' ? 'on' : ''} onClick={() => setPreview('pad')}>Printed pad</button><button role="tab" aria-selected={preview === 'whatsapp'} className={preview === 'whatsapp' ? 'on' : ''} onClick={() => setPreview('whatsapp')}>WhatsApp</button></div>
        {preview === 'pad' ? <Pad rx={rx} w={w} patient={patient} /> : <div className="wa-preview"><div className="wa-bar">{patient ? <><strong>{patient.name}</strong><small>{patient.phone}</small></> : <small>No patient selected</small>}</div><div className="wa-chat"><div className="wa-bubble">{waFormat(message)}</div></div>
          <p className="muted small">Opens WhatsApp on this computer with the message filled in — press send there. {patient && !patient.consent && 'This patient has not consented to automatic reminders; sending their own prescription is fine if they asked for it.'}</p></div>}
      </aside>
    </div>
  </div>;
}

/** Renders WhatsApp *bold* and _italic_ in the preview bubble. */
function waFormat(text: string) {
  return text.split('\n').map((line, i) => <div key={i}>{line ? line.split(/(\*[^*]+\*|_[^_]+_)/g).map((part, j) => part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <b key={j}>{part.slice(1, -1)}</b> : part.startsWith('_') && part.endsWith('_') && part.length > 2 ? <i key={j}>{part.slice(1, -1)}</i> : part) : ' '}</div>);
}

function Pad({ rx, w, patient }: { rx: Prescription; w: Workspace; patient?: Patient }) {
  const d = w.doctor(rx.doctorId);
  const meds = rx.medicines.filter(m => m.name.trim());
  const vitals = vitalsLine(rx.vitals);
  return <article className="pad" id="rx-pad">
    <header className="pad-head"><div><h3>{w.clinic.name}</h3><p>{w.clinic.address}</p><p>{w.clinic.phone}</p></div><div className="pad-doc"><strong>{d?.name}</strong><p>{d?.specialty}</p></div></header>
    <div className="pad-patient"><span><b>Patient:</b> {patient?.name || '—'}{rx.age && `, ${rx.age} y`}{rx.sex && ` / ${rx.sex}`}</span><span><b>Date:</b> {dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    {vitals && <p className="pad-line"><b>Vitals:</b> {vitals}</p>}
    {rx.complaints && <p className="pad-line"><b>Complaints:</b> {rx.complaints}</p>}
    {rx.diagnosis && <p className="pad-line"><b>Diagnosis:</b> {rx.diagnosis}</p>}
    <div className="pad-rx">℞</div>
    {meds.length ? <ol className="pad-meds">{meds.map(m => <li key={m.id}><strong>{m.name}</strong><span>{medicineInstruction(m)}</span>{m.notes && <em>{m.notes}</em>}</li>)}</ol> : <p className="pad-placeholder">Medicines appear here as you type.</p>}
    {rx.tests && <p className="pad-line"><b>Tests:</b> {rx.tests}</p>}
    {rx.advice && <div className="pad-line"><b>Advice:</b><ul>{rx.advice.split('\n').filter(l => l.trim()).map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
    {rx.followUp && <p className="pad-line"><b>Follow-up:</b> {dateLabel(rx.followUp, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>}
    <footer className="pad-sign"><span>{d?.name}</span></footer>
  </article>;
}

const PRINT_CSS = `@page{size:A5;margin:12mm}body{font:12px/1.5 system-ui,"Segoe UI",Arial,sans-serif;color:#111;margin:0}
.pad-head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0b6b60;padding-bottom:8px;margin-bottom:10px}.pad-head h3{margin:0;font-size:17px;color:#0b6b60}.pad-head p{margin:0;color:#444}.pad-doc{text-align:right}.pad-doc p{margin:0;color:#444}
.pad-patient{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:4px 0 8px;margin-bottom:8px}.pad-line{margin:6px 0}.pad-line ul{margin:2px 0 0 18px;padding:0}
.pad-rx{font:700 26px Georgia,serif;color:#0b6b60;margin:8px 0 2px}.pad-meds{margin:0 0 10px 18px;padding:0}.pad-meds li{margin:0 0 8px}.pad-meds strong{display:block}.pad-meds span{color:#333}.pad-meds em{display:block;color:#555;font-size:11px}
.pad-placeholder{color:#999}.pad-sign{margin-top:40px;text-align:right}.pad-sign span{display:inline-block;border-top:1px solid #333;padding-top:4px;min-width:160px;text-align:center}`;
