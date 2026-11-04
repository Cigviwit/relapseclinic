import { useState } from 'react';
import { toast } from 'sonner';
import { Pill, Trash2 } from 'lucide-react';
import { addCatalogMedicine } from '@/lib/catalog';
import { frequencies, timings, type MedicineTiming } from '@/lib/prescription';
import { Field, FormError, Select } from '../kit';
import type { Workspace } from './types';

/** The clinic's own medicines with their usual dose, and its saved prescription templates. */
export function CatalogSettings({ w }: { w: Workspace }) {
  const { catalog } = w;
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('1-0-1');
  const [timing, setTiming] = useState<MedicineTiming>('after');
  const [days, setDays] = useState('5');
  const [error, setError] = useState('');
  const save = (next: typeof catalog) => w.repo.saveCatalog(next).catch(e => toast.error((e as Error).message));
  function add() {
    try {
      void save(addCatalogMedicine(catalog, { id: crypto.randomUUID(), name, frequency, timing, days: days.trim(), notes: '' }));
      setName(''); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  return <>
    <h2 className="card-title"><Pill size={16} />Medicines and templates</h2>
    <p className="muted">Medicines listed here come first when writing a prescription, and choosing one fills in its usual dose.</p>
    <div className="grid-2">
      <Field label="Medicine and strength"><input className="input" maxLength={120} placeholder="Tab Amoxicillin 500 mg" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Usual dose"><input className="input" list="rx-freq-settings" maxLength={20} value={frequency} onChange={e => setFrequency(e.target.value)} /></Field>
    </div>
    <datalist id="rx-freq-settings">{frequencies.map(f => <option key={f} value={f} />)}</datalist>
    <div className="grid-2">
      <Field label="When"><Select label="When to take" value={timing} onChange={v => setTiming(v as MedicineTiming)} options={timings.map(t => ({ value: t.value, label: t.label }))} /></Field>
      <Field label="Days"><input className="input" inputMode="numeric" maxLength={3} value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} /></Field>
    </div>
    <FormError error={error} />
    <button type="button" className="btn btn-sm btn-soft" onClick={add}>Add medicine</button>
    {catalog.medicines.length > 0 && <ul className="plain-list">{catalog.medicines.map(m => <li key={m.id} className="row-between"><span>{m.name}<small> {m.frequency} · {timings.find(t => t.value === m.timing)?.label}{m.days ? ` · ${m.days} days` : ''}</small></span><button type="button" className="btn-icon" aria-label={`Remove ${m.name}`} onClick={() => void save({ ...catalog, medicines: catalog.medicines.filter(x => x.id !== m.id) })}><Trash2 size={14} /></button></li>)}</ul>}
    <h3 className="sec-title">Prescription templates</h3>
    {catalog.templates.length ? <ul className="plain-list">{catalog.templates.map(t => <li key={t.id} className="row-between"><span>{t.name}<small> {t.medicines.map(m => m.name).join(', ') || 'Advice only'}</small></span><button type="button" className="btn-icon" aria-label={`Remove template ${t.name}`} onClick={() => void save({ ...catalog, templates: catalog.templates.filter(x => x.id !== t.id) })}><Trash2 size={14} /></button></li>)}</ul>
      : <p className="muted small">Write a prescription and choose “Save as template” to reuse it, for example for care after an extraction.</p>}
  </>;
}
