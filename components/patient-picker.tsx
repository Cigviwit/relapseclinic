"use client";
import { useId, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { normalizePhone, type Patient } from '@/lib/clinic';
import { searchPatients } from '@/lib/patient-search';
import { patientLanguages, type PatientLanguage } from '@/lib/patient-language';
import { Avatar, Field, Select } from './kit';

/**
 * Type-to-search patient field. When nothing matches, offers to register a new
 * patient inline (name + WhatsApp number) without leaving the current form.
 */
export function PatientPicker({ patients, value, onChange, onCreate, clinicId, autoFocus }: { patients: Patient[]; value: string; onChange: (id: string) => void; onCreate?: (p: Patient) => void; clinicId: string; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [creating, setCreating] = useState<null | { name: string; phone: string; language: PatientLanguage; consent: boolean; error: string }>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = patients.find(p => p.id === value);
  const matches = useMemo(() => searchPatients(patients, q).slice(0, 8), [patients, q]);

  if (creating) {
    const save = () => {
      try {
        if (!creating.name.trim()) throw new Error('Enter the patient’s name.');
        const p: Patient = { id: crypto.randomUUID(), clinicId, name: creating.name.trim(), phone: normalizePhone(creating.phone), consent: creating.consent, language: creating.language };
        onCreate?.(p); onChange(p.id); setCreating(null); setQ('');
      } catch (e) { setCreating({ ...creating, error: (e as Error).message }); }
    };
    return <div className="inline-new">
      <div className="inline-new-head"><UserPlus size={16} /><strong>New patient</strong><button type="button" className="btn-link" onClick={() => setCreating(null)}>Cancel</button></div>
      <div className="grid-2">
        <Field label="Full name"><input className="input" autoFocus value={creating.name} onChange={e => setCreating({ ...creating, name: e.target.value })} maxLength={100} /></Field>
        <Field label="WhatsApp number"><input className="input" type="tel" value={creating.phone} onChange={e => setCreating({ ...creating, phone: e.target.value })} placeholder="98765 43210" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Message language"><Select value={creating.language} onChange={v => setCreating({ ...creating, language: v as PatientLanguage })} options={patientLanguages.map(l => ({ ...l }))} /></Field>
        <label className="check"><input type="checkbox" checked={creating.consent} onChange={e => setCreating({ ...creating, consent: e.target.checked })} /><span>Agrees to WhatsApp reminders</span></label>
      </div>
      {creating.error && <p className="form-error" role="alert">{creating.error}</p>}
      <button type="button" className="btn btn-soft" onClick={save}>Add patient</button>
    </div>;
  }

  if (selected) return <div className="picked">
    <Avatar name={selected.name} /><div className="picked-text"><strong>{selected.name}</strong><small>{selected.phone}{!selected.consent && ' · no WhatsApp consent'}</small></div>
    <button type="button" className="btn-icon" aria-label="Change patient" onClick={() => { onChange(''); setTimeout(() => inputRef.current?.focus()); }}><X size={16} /></button>
  </div>;

  const startCreate = () => {
    const digits = q.replace(/[^\d+]/g, '');
    const looksLikePhone = digits.replace(/\D/g, '').length >= 6;
    setCreating({ name: looksLikePhone ? '' : q.trim(), phone: looksLikePhone ? q.trim() : '+91 ', language: 'en', consent: true, error: '' });
  };
  const options = matches.length;
  return <div className="combo">
    <div className="combo-input"><Search size={16} />
      <input ref={inputRef} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-label="Search patient by name or phone" placeholder="Search name or phone…" autoFocus={autoFocus} value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); setCursor(0); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, options)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (cursor < options) onChange(matches[cursor].id); else if (onCreate) startCreate(); }
        }} />
    </div>
    {open && <ul className="combo-list" id={listId} role="listbox">
      {matches.map((p, i) => <li key={p.id} role="option" aria-selected={i === cursor} className={i === cursor ? 'active' : ''} onMouseDown={e => { e.preventDefault(); onChange(p.id); }} onMouseEnter={() => setCursor(i)}>
        <Avatar name={p.name} size="sm" /><span><strong>{p.name}</strong><small>{p.phone}</small></span></li>)}
      {!matches.length && <li className="combo-empty">No patient matches “{q}”</li>}
      {onCreate && <li role="option" aria-selected={cursor === options} className={'combo-create' + (cursor === options ? ' active' : '')} onMouseDown={e => { e.preventDefault(); startCreate(); }}><UserPlus size={16} /> {q.trim() ? <>Add “{q.trim()}” as new patient</> : 'Add a new patient'}</li>}
    </ul>}
  </div>;
}
