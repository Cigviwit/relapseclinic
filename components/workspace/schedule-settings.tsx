import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { addDays, dateLabel, type Clinic, type Doctor } from '@/lib/clinic';
import { cleanWeekly, strandedVisits, weekdayNames, type ClosedDate, type Leave, type Session, type WeeklyHours } from '@/lib/availability';
import { Field, FormError, Select } from '../kit';
import type { Workspace } from './types';

const DAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'];
const blankWeek = (clinic: Clinic): WeeklyHours => Object.fromEntries(DAY_ORDER.map(d => [d, d === '0' ? [] : [{ start: clinic.opens, end: clinic.closes }]]));

function DoctorHours({ w, doctor, onSave }: { w: Workspace; doctor: Doctor; onSave: (d: Doctor) => void }) {
  const [week, setWeek] = useState<WeeklyHours | null>(doctor.weekly || null);
  const [error, setError] = useState('');
  const setDay = (day: string, sessions: Session[]) => { setWeek(x => ({ ...x!, [day]: sessions })); setError(''); };
  const save = () => {
    try { onSave({ ...doctor, ...(week ? { weekly: cleanWeekly(week, w.clinic.opens, w.clinic.closes) } : { weekly: undefined }) }); }
    catch (e) { setError((e as Error).message); }
  };
  if (!week) return <div className="row-between"><span className="muted">Follows clinic hours every day.</span><button type="button" className="btn btn-sm btn-soft" onClick={() => setWeek(blankWeek(w.clinic))}>Set own hours</button></div>;
  return <div className="form">
    <div className="week-hours">{DAY_ORDER.map(day => {
      const sessions = week[day] || [];
      const edit = (i: number, patch: Partial<Session>) => setDay(day, sessions.map((s, n) => n === i ? { ...s, ...patch } : s));
      return <div className="week-hours-row" key={day}>
        <strong>{weekdayNames[Number(day)].slice(0, 3)}</strong>
        <div className="row-tight wrap">
          {!sessions.length && <span className="muted small">Off</span>}
          {sessions.map((s, i) => <span className="row-tight" key={i}>
            <input className="input input-sm" type="time" aria-label={`${weekdayNames[Number(day)]} session ${i + 1} start`} value={s.start} onChange={e => edit(i, { start: e.target.value })} />
            <span className="muted">to</span>
            <input className="input input-sm" type="time" aria-label={`${weekdayNames[Number(day)]} session ${i + 1} end`} value={s.end} onChange={e => edit(i, { end: e.target.value })} />
            <button type="button" className="btn-icon" aria-label={`Remove ${weekdayNames[Number(day)]} session ${i + 1}`} onClick={() => setDay(day, sessions.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
          </span>)}
          {sessions.length < 3 && <button type="button" className="btn-link" onClick={() => setDay(day, [...sessions, { start: sessions.length ? sessions[sessions.length - 1].end : w.clinic.opens, end: w.clinic.closes }])}><Plus size={13} />Session</button>}
        </div>
      </div>;
    })}</div>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-ghost" onClick={() => { setWeek(null); onSave({ ...doctor, weekly: undefined }); }}>Use clinic hours</button><button type="button" className="btn btn-primary" onClick={save}>Save hours</button></div>
  </div>;
}

function DoctorLeave({ w, doctor, onSave }: { w: Workspace; doctor: Doctor; onSave: (d: Doctor) => void }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState('');
  const upcoming = (doctor.leave || []).filter(l => l.to >= w.now.date).sort((a, b) => a.from.localeCompare(b.from));
  const add = () => {
    if (!from || (to && to < from)) { setError('Choose when the leave starts and ends.'); return; }
    const leave: Leave = { id: crypto.randomUUID(), from, to: to || from, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    // Finished leave is dropped here, so the clinic record does not grow for ever.
    onSave({ ...doctor, leave: [...upcoming, leave] }); setFrom(''); setTo(''); setReason(''); setError('');
  };
  return <div className="form">
    {upcoming.map(l => <div className="row-between" key={l.id}><span>{dateLabel(l.from, { day: 'numeric', month: 'short' })}{l.to !== l.from ? ` – ${dateLabel(l.to, { day: 'numeric', month: 'short' })}` : ''}{l.reason ? ` · ${l.reason}` : ''}</span><button type="button" className="btn-icon" aria-label="Remove leave" onClick={() => onSave({ ...doctor, leave: upcoming.filter(x => x.id !== l.id) })}><Trash2 size={14} /></button></div>)}
    <div className="grid-3">
      <Field label="From"><input className="input" type="date" min={w.now.date} value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="To"><input className="input" type="date" min={from || w.now.date} value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Field label="Reason (optional)"><input className="input" maxLength={80} value={reason} onChange={e => setReason(e.target.value)} /></Field>
    </div>
    <FormError error={error} />
    <button type="button" className="btn btn-sm btn-soft" onClick={add}>Add leave</button>
  </div>;
}

export function ScheduleSettings({ w }: { w: Workspace }) {
  const { clinic } = w;
  const [doctorId, setDoctorId] = useState(clinic.doctors[0]?.id || '');
  const doctor = clinic.doctors.find(d => d.id === doctorId);
  const [date, setDate] = useState(''), [reason, setReason] = useState('');
  const closed = (clinic.closedDates || []).filter(c => c.date >= w.now.date).sort((a, b) => a.date.localeCompare(b.date));

  async function persist(next: Clinic) {
    try {
      await w.repo.saveClinic(next);
      const stranded = strandedVisits(w.appointments, next, w.now.date);
      if (stranded.length) toast.warning(`Saved. ${stranded.length} booked visit${stranded.length === 1 ? ' is' : 's are'} now outside these hours and need rescheduling.`);
      else toast.success('Schedule saved');
    } catch (e) { toast.error((e as Error).message); }
  }
  const saveDoctor = (d: Doctor) => { const { weekly, ...rest } = d; void persist({ ...clinic, doctors: clinic.doctors.map(x => x.id === d.id ? (weekly ? d : rest) : x) }); };
  const closeDate = () => {
    if (!date) return;
    const entry: ClosedDate = { date, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    void persist({ ...clinic, closedDates: [...closed.filter(c => c.date !== date), entry] }); setDate(''); setReason('');
  };
  const stranded = strandedVisits(w.appointments, clinic, w.now.date);

  return <>
    <h2 className="card-title"><CalendarOff size={16} />Doctor schedules and holidays</h2>
    <p className="muted">Booking only offers times when the doctor is working. Changing hours does not move visits already booked.</p>
    {stranded.length > 0 && <div className="note note-warn"><strong>{stranded.length} booked visit{stranded.length === 1 ? ' is' : 's are'} outside working hours.</strong><ul className="mini-list">{stranded.slice(0, 6).map(a => <li key={a.id}><button type="button" onClick={() => w.openAppointment(a)}>{dateLabel(a.date, { day: 'numeric', month: 'short' })} · {w.patient(a.patientId)?.name || 'Patient'} · {w.doctorName(a.doctorId)}</button></li>)}</ul></div>}
    {clinic.doctors.length > 1 && <Select label="Doctor" value={doctorId} onChange={setDoctorId} options={clinic.doctors.map(d => ({ value: d.id, label: d.name }))} />}
    {doctor && <>
      <h3 className="sec-title">Working hours</h3>
      <DoctorHours key={doctor.id + (doctor.weekly ? 'own' : 'clinic')} w={w} doctor={doctor} onSave={saveDoctor} />
      <h3 className="sec-title">Leave</h3>
      <DoctorLeave key={doctor.id} w={w} doctor={doctor} onSave={saveDoctor} />
    </>}
    <h3 className="sec-title">Clinic closed</h3>
    {closed.map(c => <div className="row-between" key={c.date}><span>{dateLabel(c.date, { weekday: 'short', day: 'numeric', month: 'short' })}{c.reason ? ` · ${c.reason}` : ''}</span><button type="button" className="btn-icon" aria-label="Open this day again" onClick={() => void persist({ ...clinic, closedDates: closed.filter(x => x.date !== c.date) })}><Trash2 size={14} /></button></div>)}
    <div className="grid-2">
      <Field label="Date"><input className="input" type="date" min={w.now.date} max={addDays(w.now.date, 730)} value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Reason (optional)"><input className="input" placeholder="e.g. Diwali" maxLength={80} value={reason} onChange={e => setReason(e.target.value)} /></Field>
    </div>
    <button type="button" className="btn btn-sm btn-soft" disabled={!date} onClick={closeDate}>Close this day</button>
  </>;
}
