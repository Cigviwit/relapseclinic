import { useState } from 'react';
import { permanentTeeth, primaryTeeth, toothName } from '@/lib/rx-templates';

/** Molars/premolars/canines/incisors get slightly different shapes so the chart reads at a glance. */
function kind(fdi: number) { const n = fdi % 10, primary = fdi >= 50; return n <= 2 ? 'incisor' : n === 3 ? 'canine' : (primary ? n >= 4 : n >= 6) ? 'molar' : 'premolar'; }

export function ToothChart({ value, onChange, readOnly }: { value: number[]; onChange?: (teeth: number[]) => void; readOnly?: boolean }) {
  const [primary, setPrimary] = useState(() => value.some(t => t >= 50));
  const set = new Set(value);
  const rows = primary ? primaryTeeth : permanentTeeth;
  const toggle = (t: number) => onChange?.(set.has(t) ? value.filter(x => x !== t) : [...value, t]);
  const tooth = (t: number) => readOnly
    ? <span key={t} className={`tooth tooth-${kind(t)}${set.has(t) ? ' on' : ''}`}>{t}</span>
    : <button type="button" key={t} className={`tooth tooth-${kind(t)}${set.has(t) ? ' on' : ''}`} aria-pressed={set.has(t)} title={`${t} · ${toothName(t)}`} onClick={() => toggle(t)}>{t}</button>;
  const half = rows.upper.length / 2;
  return <div className={'tchart' + (readOnly ? ' tchart-ro' : '')}>
    {!readOnly && <div className="tchart-bar"><div className="seg seg-sm"><button type="button" className={!primary ? 'on' : ''} onClick={() => setPrimary(false)}>Adult</button><button type="button" className={primary ? 'on' : ''} onClick={() => setPrimary(true)}>Child (milk teeth)</button></div>
      {value.length > 0 && <button type="button" className="btn-link" onClick={() => onChange?.([])}>Clear</button>}</div>}
    <div className="tchart-grid">
      <small className="tchart-side">R</small>
      <div className="tchart-arch">
        <div className="tchart-row">{rows.upper.slice(0, half).map(tooth)}<i className="tchart-mid" />{rows.upper.slice(half).map(tooth)}</div>
        <div className="tchart-row tchart-lower">{rows.lower.slice(0, half).map(tooth)}<i className="tchart-mid" />{rows.lower.slice(half).map(tooth)}</div>
      </div>
      <small className="tchart-side">L</small>
    </div>
    {!readOnly && value.length > 0 && <p className="tchart-sel">{[...value].sort((a, b) => a - b).map(t => <span key={t}><b>{t}</b> {toothName(t)}</span>)}</p>}
  </div>;
}
