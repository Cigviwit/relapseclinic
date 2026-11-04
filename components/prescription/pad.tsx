import type { CSSProperties } from 'react';
import { dateLabel, type Clinic, type Doctor, type Patient } from '@/lib/clinic';
import { medicineInstruction, teethText, vitalsLine, type Prescription } from '@/lib/prescription';
import { specialties, type RxPad } from '@/lib/rx-templates';
import { patientLanguage } from '@/lib/patient-language';
import { ToothChart } from './tooth-chart';

function Mark({ specialty }: { specialty: RxPad['specialty'] }) {
  // A tooth for dental pads, a cross for everything else.
  return specialty === 'dental'
    ? <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden><path d="M7.2 3C4.6 3 3 5 3 7.7c0 2.6 1.3 4.2 1.9 6.6.6 2.3.8 6.7 2.6 6.7 1.6 0 1.7-3.4 2.4-5.2.4-1 .9-1.4 2.1-1.4s1.7.4 2.1 1.4c.7 1.8.8 5.2 2.4 5.2 1.8 0 2-4.4 2.6-6.7.6-2.4 1.9-4 1.9-6.6C21 5 19.4 3 16.8 3c-1.9 0-2.9 1-4.8 1S9.1 3 7.2 3Z" fill="currentColor" /></svg>
    : <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor" /></svg>;
}

/**
 * The printed prescription. Rendered on screen for preview, for printing and as the
 * image inside the PDF sent on WhatsApp, so all three always match.
 */
export function Pad({ rx, clinic, doctor, patient, pad, id }: { rx: Prescription; clinic: Clinic; doctor?: Doctor; patient?: Patient; pad: RxPad; id?: string }) {
  const preset = specialties[pad.specialty];
  const label = (k: keyof typeof preset.labels, fallback: string) => preset.labels[k] || fallback;
  const meds = rx.medicines.filter(m => m.name.trim());
  const vitals = vitalsLine(rx.vitals);
  const lang = patientLanguage(patient?.language);
  const line = (title: string, text: string) => text.trim() ? <p className="pad-line"><b>{title}:</b> {text}</p> : null;
  const list = (title: string, text: string) => text.trim() ? <div className="pad-line"><b>{title}:</b><ul>{text.split('\n').filter(l => l.trim()).map((l, i) => <li key={i}>{l.replace(/^[•\-*]\s*/, '')}</li>)}</ul></div> : null;
  return <article className={`pad pad-${pad.style} pad-${pad.paper}`} id={id} style={{ '--pad-accent': pad.accent } as CSSProperties}>
    <header className="pad-head">
      <span className="pad-mark"><Mark specialty={pad.specialty} /></span>
      <div className="pad-clinic"><h3>{clinic.name}</h3>{pad.tagline && <p className="pad-tagline">{pad.tagline}</p>}<p>{clinic.address}</p><p>☎ {clinic.phone}</p></div>
      <div className="pad-doc"><strong>{doctor?.name}</strong>{doctor?.qualification && <p>{doctor.qualification}</p>}{doctor?.specialty && <p>{doctor.specialty}</p>}{doctor?.regNo && <p>Reg. No. {doctor.regNo}</p>}</div>
    </header>
    <div className="pad-patient"><span><b>Patient:</b> {patient?.name || '—'}{rx.age && `, ${rx.age} y`}{rx.sex && ` / ${rx.sex}`}</span><span><b>Date:</b> {dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
    {vitals && line('Vitals', vitals)}
    {line(label('history', 'Medical history'), rx.history)}
    {line(label('complaints', 'Complaints'), rx.complaints)}
    {rx.teeth.length > 0 && <div className="pad-teeth"><p className="pad-line"><b>Teeth:</b> {teethText(rx.teeth)}</p><ToothChart value={rx.teeth} readOnly /></div>}
    {line(label('findings', 'Findings'), rx.findings)}
    {line('Diagnosis', rx.diagnosis)}
    {list(label('procedures', 'Procedure'), rx.procedures)}
    <div className="pad-rx">℞</div>
    {meds.length ? <ol className="pad-meds">{meds.map(m => <li key={m.id}><strong>{m.name}</strong><span>{medicineInstruction(m)}</span>{lang !== 'en' && <span lang={lang}>{medicineInstruction(m, lang)}</span>}{m.notes && <em>{m.notes}</em>}</li>)}</ol> : <p className="pad-placeholder">{rx.procedures || rx.plan ? 'No medicines prescribed.' : 'Medicines appear here as you type.'}</p>}
    {list(label('plan', 'Plan'), rx.plan)}
    {line('Tests', rx.tests)}
    {list('Advice', rx.advice)}
    {rx.followUp && line('Next visit', dateLabel(rx.followUp, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
    <footer className="pad-foot"><div className="pad-sign"><span>{doctor?.name}</span></div>{pad.footer && <p className="pad-note">{pad.footer}</p>}</footer>
  </article>;
}
