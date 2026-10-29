"use client";
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { Chips } from '../kit';
import { DoctorFilter } from './today-view';
import type { Workspace } from './types';

const PX = 1.6; // pixels per minute in the day grid
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default function ScheduleView({ w, date, setDate }: { w: Workspace; date: string; setDate: (d: string) => void }) {
  const [view, setView] = useState<'day' | 'week'>('day');
  const { clinic, now } = w;
  const open = minutes(clinic.opens), close = minutes(clinic.closes);
  const startHour = Math.floor(open / 60) * 60;
  const doctors = clinic.doctors.filter(d => w.doctorFilter === 'all' || d.id === w.doctorFilter);
  const monday = addDays(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const on = (d: string) => w.appointments.filter(a => a.date === d && a.status !== 'cancelled' && (w.doctorFilter === 'all' || a.doctorId === w.doctorFilter)).sort((a, b) => a.time.localeCompare(b.time));
  const step = view === 'day' ? 1 : 7;
  const nowMin = minutes(now.time);

  const block = (a: Appointment) => {
    const p = w.patient(a.patientId);
    return <button key={a.id} className={'ev ev-' + a.status} style={{ top: (minutes(a.time) - startHour) * PX, height: Math.max(a.duration * PX - 2, 22) }} onClick={e => { e.stopPropagation(); w.openAppointment(a); }}>
      <strong>{p?.name || 'Patient'}</strong><small>{clockLabel(a.time)} · {a.reason}</small>
    </button>;
  };

  return <div className="page">
    <header className="page-head">
      <div><p className="eyebrow">Schedule</p><h1>{view === 'day' ? dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }) : `${dateLabel(week[0], { day: 'numeric', month: 'short' })} – ${dateLabel(week[6], { day: 'numeric', month: 'short', year: 'numeric' })}`}</h1></div>
      <button className="btn btn-primary" onClick={() => w.book({ date })}><Plus size={16} />New appointment</button>
    </header>
    <div className="toolbar">
      <div className="row-tight">
        <button className="btn-icon btn-outline" aria-label="Previous" onClick={() => setDate(addDays(date, -step))}><ChevronLeft size={18} /></button>
        <button className="btn btn-sm btn-outline" onClick={() => setDate(now.date)}>Today</button>
        <button className="btn-icon btn-outline" aria-label="Next" onClick={() => setDate(addDays(date, step))}><ChevronRight size={18} /></button>
        <input className="input input-sm" type="date" aria-label="Go to date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
      </div>
      <Chips label="View" size="sm" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }]} />
      <DoctorFilter w={w} />
    </div>

    {view === 'week' && <div className="week">{week.map(d => { const list = on(d); return <div key={d} className={'week-col' + (d === now.date ? ' is-today' : '') + (d === date ? ' is-sel' : '')}>
      <button className="week-day" onClick={() => { setDate(d); setView('day'); }}><small>{dateLabel(d, { weekday: 'short' })}</small><strong>{Number(d.slice(-2))}</strong><span>{list.length || ''}</span></button>
      <div className="week-list">{list.map(a => <button key={a.id} className={'wk-ev ev-' + a.status} onClick={() => w.openAppointment(a)}><small>{clockLabel(a.time)}</small>{w.patient(a.patientId)?.name}</button>)}
        {d >= now.date && <button className="wk-add" onClick={() => w.book({ date: d })} aria-label={`Book on ${dateLabel(d)}`}><Plus size={14} /></button>}</div>
    </div>; })}</div>}

    {view === 'day' && <div className="daygrid card card-flush">
      <div className="dg-head" style={{ gridTemplateColumns: `56px repeat(${doctors.length}, minmax(160px, 1fr))` }}><span />{doctors.map(d => <div key={d.id} className="dg-doc"><strong>{d.name}</strong><small>{d.specialty} · {on(date).filter(a => a.doctorId === d.id).length} booked</small></div>)}</div>
      <div className="dg-body" style={{ gridTemplateColumns: `56px repeat(${doctors.length}, minmax(160px, 1fr))`, height: (close - startHour) * PX + 8 }}>
        <div className="dg-hours">{Array.from({ length: Math.ceil((close - startHour) / 60) + 1 }, (_, i) => startHour + i * 60).filter(m => m <= close).map(m => <span key={m} style={{ top: (m - startHour) * PX }}>{clockLabel(hhmm(m)).replace(':00', '')}</span>)}</div>
        {doctors.map(d => <div key={d.id} className="dg-col" style={{ backgroundSize: `100% ${30 * PX}px`, backgroundPositionY: `${(startHour % 30) * PX}px` }}
          onClick={e => {
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            const t = Math.floor((y / PX + startHour) / 15) * 15;
            if (t < open || t >= close) return;
            if (date < now.date || (date === now.date && t < nowMin)) return;
            w.book({ date, doctorId: d.id, time: hhmm(t) });
          }}>
          {open > startHour && <div className="dg-closed" style={{ top: 0, height: (open - startHour) * PX }} />}
          {on(date).filter(a => a.doctorId === d.id).map(block)}
        </div>)}
        {date === now.date && nowMin >= startHour && nowMin <= close && <div className="dg-now" style={{ top: (nowMin - startHour) * PX }}><span>{clockLabel(now.time)}</span></div>}
      </div>
      <p className="dg-tip">Click an empty space to book that doctor at that time.</p>
    </div>}
  </div>;
}
