"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarPlus, FileText, Search, UserPlus } from 'lucide-react';
import { searchPatients } from '@/lib/patient-search';
import { Avatar, Kbd } from '../kit';
import type { Page, Workspace } from './types';

type Item = { id: string; icon: ReactNode; label: string; hint?: string; run: () => void };

/** Ctrl+K / "/" quick finder: jump to a patient or start a common task. */
export default function CommandPalette({ w, open, onClose, pages }: { w: Workspace; open: boolean; onClose: () => void; pages: { id: Page; label: string; icon: ReactNode }[] }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) { setQ(''); setCursor(0); d.showModal(); } if (!open && d.open) d.close(); }, [open]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const done = (fn: () => void) => () => { onClose(); fn(); };
    const people = (term ? searchPatients(w.patients, q) : []).slice(0, 6).flatMap(p => [
      { id: 'p' + p.id, icon: <Avatar name={p.name} size="sm" />, label: p.name, hint: p.phone, run: done(() => w.go('patients', p.id)) },
    ]);
    const rxEnabled = w.clinic.prescriptionsEnabled === true;
    const actions: Item[] = [
      { id: 'book', icon: <CalendarPlus size={16} />, label: 'New appointment', hint: 'N', run: done(() => w.book()) },
      ...(rxEnabled ? [{ id: 'rx', icon: <FileText size={16} />, label: 'Write prescription', hint: 'R', run: done(() => w.writeRx()) }] : []),
      { id: 'patient', icon: <UserPlus size={16} />, label: 'Add patient', hint: 'P', run: done(() => w.editPatient()) },
      ...pages.map(pg => ({ id: 'go' + pg.id, icon: pg.icon, label: `Go to ${pg.label}`, run: done(() => w.go(pg.id)) })),
    ].filter(a => !term || a.label.toLowerCase().includes(term));
    const forPatient = people.length === 1 ? (() => { const p = w.patients.find(x => 'p' + x.id === people[0].id)!; return [
      { id: 'bk' + p.id, icon: <CalendarPlus size={16} />, label: `Book ${p.name}`, run: done(() => w.book({ patientId: p.id })) },
      ...(rxEnabled ? [{ id: 'rx' + p.id, icon: <FileText size={16} />, label: `Prescription for ${p.name}`, run: done(() => w.writeRx({ patientId: p.id })) }] : []),
    ]; })() : [];
    return [...people, ...forPatient, ...actions];
  }, [q, w, pages, onClose]);

  return <dialog ref={ref} className="dlg dlg-palette" onCancel={e => { e.preventDefault(); onClose(); }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    {open && <div className="palette">
      <div className="palette-input"><Search size={18} /><input autoFocus placeholder="Search patients or type a command…" value={q} aria-label="Search"
        onChange={e => { setQ(e.target.value); setCursor(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); items[cursor]?.run(); }
        }} /><Kbd>Esc</Kbd></div>
      <ul className="palette-list" role="listbox">{items.map((it, i) => <li key={it.id} role="option" aria-selected={i === cursor} className={i === cursor ? 'active' : ''} onMouseEnter={() => setCursor(i)} onMouseDown={e => { e.preventDefault(); it.run(); }}>
        <span className="palette-icon">{it.icon}</span><span className="palette-label">{it.label}</span>{it.hint && <small>{it.hint}</small>}</li>)}
        {!items.length && <li className="palette-empty">Nothing found for “{q}”.</li>}
      </ul>
    </div>}
  </dialog>;
}
