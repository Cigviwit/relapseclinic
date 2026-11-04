import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { addDays, clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { doctorDay } from '@/lib/availability';
import { Chips } from '../kit';
import { DoctorFilter } from './today-view';
import type { Workspace } from './types';

const PX = 1.6; // pixels per minute in the day grid
const MONTH_CELL_MAX = 3; // appointments shown in a month cell before "+N more"
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const mondayOf = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
// Moves by whole calendar months, clamping the day so 31 Jan + 1 lands on 28 Feb rather than in March.
const addMonths = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(day, last), 12)).toISOString().slice(0, 10);
};

export default function ScheduleView({ w, date, setDate }: { w: Workspace; date: string; setDate: (d: string) => void }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const { clinic, now } = w;
  const open = minutes(clinic.opens), close = minutes(clinic.closes);
  const startHour = Math.floor(open / 60) * 60;
  const doctors = clinic.doctors.filter(d => w.doctorFilter === 'all' || d.id === w.doctorFilter);
  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));
  const monthKey = date.slice(0, 7);
  const monthStart = mondayOf(monthKey + '-01');
  const monthEnd = addDays(addMonths(monthKey + '-01', 1), -1);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(monthStart, i)).filter((_, i) => addDays(monthStart, i - i % 7) <= monthEnd);
  const openDay = (d: string) => { setDate(d); setView('day'); };
  const on = (d: string) => w.appointments.filter(a => a.date === d && a.status !== 'cancelled' && (w.doctorFilter === 'all' || a.doctorId === w.doctorFilter)).sort((a, b) => a.time.localeCompare(b.time));
  const shift = (n: number) => setDate(view === 'month' ? addMonths(date, n) : addDays(date, n * (view === 'day' ? 1 : 7)));
  const nowMin = minutes(now.time);
  // Looking further back than the workspace keeps live: fetch that stretch once.
  const rangeFrom = view === 'month' ? monthStart : view === 'week' ? week[0] : date;
  const rangeTo = view === 'month' ? monthEnd : view === 'week' ? week[6] : date;
  const { loadRange } = w;
  useEffect(() => { loadRange(rangeFrom, rangeTo); }, [loadRange, rangeFrom, rangeTo]);

  // The stretches of the day a doctor is not working, shaded on the grid.
  const offBlocks = (doctorId: string) => {
    const gaps: [number, number][] = [];
    let at = open;
    for (const s of doctorDay(clinic, doctorId, date).sessions) { if (minutes(s.start) > at) gaps.push([at, minutes(s.start)]); at = Math.max(at, minutes(s.end)); }
    if (at < close) gaps.push([at, close]);
    return gaps;
  };

  const block = (a: Appointment) => {
    const p = w.patient(a.patientId);
    return <button key={a.id} className={'ev ev-' + a.status} style={{ top: (minutes(a.time) - startHour) * PX, height: Math.max(a.duration * PX - 2, 22) }} onClick={e => { e.stopPropagation(); w.openAppointment(a); }}>
      <strong>{p?.name || 'Patient'}</strong><small>{clockLabel(a.time)} · {a.reason}</small>
    </button>;
  };

  return <div className="page">
    <header className="page-head">
      <div><p className="eyebrow">Schedule</p><h1>{view === 'day' ? dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }) : view === 'month' ? dateLabel(date, { month: 'long', year: 'numeric' }) : `${dateLabel(week[0], { day: 'numeric', month: 'short' })} – ${dateLabel(week[6], { day: 'numeric', month: 'short', year: 'numeric' })}`}</h1></div>
      <button className="btn btn-primary" onClick={() => w.book({ date })}><Plus size={16} />New appointment</button>
    </header>
    <div className="toolbar">
      <div className="row-tight">
        <button className="btn-icon btn-outline" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <button className="btn btn-sm btn-outline" onClick={() => setDate(now.date)}>Today</button>
        <button className="btn-icon btn-outline" aria-label="Next" onClick={() => shift(1)}><ChevronRight size={18} /></button>
        <input className="input input-sm" type="date" aria-label="Go to date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
      </div>
      <Chips label="View" size="sm" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      <DoctorFilter w={w} />
    </div>

    {view === 'week' && <div className="week">{week.map(d => { const list = on(d); return <div key={d} className={'week-col' + (d === now.date ? ' is-today' : '') + (d === date ? ' is-sel' : '')}>
      <button className="week-day" onClick={() => openDay(d)}><small>{dateLabel(d, { weekday: 'short' })}</small><strong>{Number(d.slice(-2))}</strong><span>{list.length || ''}</span></button>
      <div className="week-list">{list.map(a => <button key={a.id} className={'wk-ev ev-' + a.status} onClick={() => w.openAppointment(a)}><small>{clockLabel(a.time)}</small>{w.patient(a.patientId)?.name}</button>)}
        {d >= now.date && <button className="wk-add" onClick={() => w.book({ date: d })} aria-label={`Book on ${dateLabel(d)}`}><Plus size={14} /></button>}</div>
    </div>; })}</div>}

    {view === 'month' && <div className="month card card-flush">
      <div className="mo-head">{week.map(d => <span key={d}>{dateLabel(d, { weekday: 'short' })}</span>)}</div>
      <div className="mo-grid">{monthDays.map(d => { const list = on(d); const extra = list.length - MONTH_CELL_MAX; return <div key={d} className={'mo-cell' + (d.slice(0, 7) !== monthKey ? ' is-out' : '') + (d === now.date ? ' is-today' : '')}>
        <div className="mo-top">
          <button className="mo-day" aria-label={`Open ${dateLabel(d)}, ${list.length} booked`} onClick={() => openDay(d)}>{Number(d.slice(-2))}</button>
          {d >= now.date && <button className="mo-add" onClick={() => w.book({ date: d })} aria-label={`Book on ${dateLabel(d)}`}><Plus size={14} /></button>}
        </div>
        <div className="mo-list">{list.slice(0, MONTH_CELL_MAX).map(a => { const name = w.patient(a.patientId)?.name || 'Patient'; return <button key={a.id} className={'mo-ev ev-' + a.status} title={`${clockLabel(a.time)} · ${name}`} onClick={() => w.openAppointment(a)}><small>{clockLabel(a.time)}</small> {name}</button>; })}
          {extra > 0 && <button className="mo-more" onClick={() => openDay(d)}>+{extra} more</button>}</div>
        {list.length > 0 && <button className="mo-count" aria-hidden tabIndex={-1} onClick={() => openDay(d)}>{list.length}</button>}
      </div>; })}</div>
    </div>}

    {view === 'day' && <div className="daygrid card card-flush">
      <div className="dg-head" style={{ gridTemplateColumns: `56px repeat(${doctors.length}, minmax(160px, 1fr))` }}><span />{doctors.map(d => <div key={d.id} className="dg-doc"><strong>{d.name}</strong><small>{d.specialty} · {on(date).filter(a => a.doctorId === d.id).length} booked</small>{doctorDay(clinic, d.id, date).off && <small className="text-danger">{doctorDay(clinic, d.id, date).off}</small>}</div>)}</div>
      <div className="dg-body" style={{ gridTemplateColumns: `56px repeat(${doctors.length}, minmax(160px, 1fr))`, height: (close - startHour) * PX + 8 }}>
        <div className="dg-hours">{Array.from({ length: Math.ceil((close - startHour) / 60) + 1 }, (_, i) => startHour + i * 60).filter(m => m <= close).map(m => <span key={m} style={{ top: (m - startHour) * PX }}>{clockLabel(hhmm(m)).replace(':00', '')}</span>)}</div>
        {doctors.map(d => <div key={d.id} className="dg-col" style={{ backgroundSize: `100% ${30 * PX}px`, backgroundPositionY: `${(startHour % 30) * PX}px` }}
          onClick={e => {
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            const t = Math.floor((y / PX + startHour) / 15) * 15;
            if (t < open || t >= close) return;
            if (!doctorDay(clinic, d.id, date).sessions.some(s => t >= minutes(s.start) && t < minutes(s.end))) return;
            if (date < now.date || (date === now.date && t < nowMin)) return;
            w.book({ date, doctorId: d.id, time: hhmm(t) });
          }}>
          {open > startHour && <div className="dg-closed" style={{ top: 0, height: (open - startHour) * PX }} />}
          {offBlocks(d.id).map(([from, to]) => <div key={from} className="dg-closed" style={{ top: (from - startHour) * PX, height: (to - from) * PX }} />)}
          {on(date).filter(a => a.doctorId === d.id).map(block)}
        </div>)}
        {date === now.date && nowMin >= startHour && nowMin <= close && <div className="dg-now" style={{ top: (nowMin - startHour) * PX }}><span>{clockLabel(now.time)}</span></div>}
      </div>
      <p className="dg-tip">Click an empty space to book that doctor at that time.</p>
    </div>}
  </div>;
}
