import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { initials } from '@/lib/clinic';

/** Native <dialog>: focus trap, Esc to close and top-layer rendering for free. */
export function Modal({ open, onClose, title, subtitle, children, variant = 'modal', wide }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; variant?: 'modal' | 'drawer' | 'full'; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal focuses the close button; move focus to the first thing worth typing into.
      d.querySelector<HTMLElement>('[data-autofocus], .dlg-body input:not([type=checkbox]):not([type=date]), .dlg-body textarea')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} className={`dlg dlg-${variant}${wide ? ' dlg-wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    {open && <div className="dlg-inner">
      <header className="dlg-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="btn-icon" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
      <div className="dlg-body">{children}</div>
    </div>}
  </dialog>;
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={'field ' + className}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

export function Select({ value, onChange, options, label, className = '' }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string; className?: string }) {
  return <select className={'input select ' + className} aria-label={label} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

/** Single-choice pill group; clicking the active chip again leaves it selected. */
export function Chips<T extends string>({ value, onChange, options, label, size }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'sm' }) {
  return <div className={'chips' + (size ? ' chips-sm' : '')} role="radiogroup" aria-label={label}>{options.map(o => <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'chip on' : 'chip'} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

const tones = ['t0', 't1', 't2', 't3', 't4'];
export function Avatar({ name, size }: { name: string; size?: 'lg' | 'sm' }) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar ${tones[h % tones.length]}${size ? ' avatar-' + size : ''}`} aria-hidden>{initials(name || '?')}</span>;
}

const statusText: Record<string, string> = { scheduled: 'Booked', completed: 'Seen', cancelled: 'Cancelled', missed: 'Missed', accepted: 'Sent', failed: 'Failed', unknown: 'Unknown', sending: 'Sending' };
export function Status({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={'pill pill-' + status}>{children ?? statusText[status] ?? status}</span>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

export function FormError({ error }: { error: string }) {
  return error ? <p className="form-error" role="alert">{error}</p> : null;
}
