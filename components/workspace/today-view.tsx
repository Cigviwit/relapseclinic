"use client";
import { Fragment, useMemo } from 'react';
import { AlertTriangle, CalendarPlus, Check, ChevronRight, Clock, FileText, Phone, UserX } from 'lucide-react';
import { addDays, clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { unresolvedVisits } from '@/lib/unresolved';
import { dayBuckets } from '@/lib/schedule';
import { Avatar, Chips, Empty, Status } from '../kit';
import type { Workspace } from './types';

function greeting(time: string) { const h = Number(time.slice(0, 2)); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export function DoctorFilter({ w }: { w: Workspace }) {
  if (w.clinic.doctors.length < 2) return null;
  return <Chips label="Doctor" size="sm" value={w.doctorFilter} onChange={w.setDoctorFilter} options={[{ value: 'all', label: 'All doctors' }, ...w.clinic.doctors.map(d => ({ value: d.id, label: d.name.replace(/^Dr\.?\s*/, 'Dr ') }))]} />;
}

export default function TodayView({ w }: { w: Workspace }) {
  const { now, appointments, doctorFilter } = w;
  const mine = (a: Appointment) => doctorFilter === 'all' || a.doctorId === doctorFilter;
  const todays = useMemo(() => appointments.filter(a => a.date === now.date && mine(a)), [appointments, now.date, doctorFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = dayBuckets(todays, now.time);
  const unresolved = unresolvedVisits(appointments.filter(mine), now.date);
  const tomorrow = appointments.filter(a => a.date === addDays(now.date, 1) && a.status === 'scheduled' && mine(a)).sort((x, y) => x.time.localeCompare(y.time));
  const issues = w.deliveries.filter(d => d.status === 'failed' || d.status === 'unknown');
  const rxFor = (a: Appointment) => w.prescriptions.find(rx => rx.appointmentId === a.id);
  const next = b.current[0] || b.upcoming[0];
  const nowLine = b.active.findIndex(a => minutes(a.time) > minutes(now.time));

  const row = (a: Appointment) => {
    const p = w.patient(a.patientId); const rx = rxFor(a);
    const ended = minutes(a.time) + a.duration <= minutes(now.time);
    const isNow = b.current.includes(a);
    return <div key={a.id} className={`q-row q-${a.status}${isNow ? ' q-now' : ''}`}>
      <button className="q-main" onClick={() => w.openAppointment(a)} aria-label={`Open ${p?.name} at ${clockLabel(a.time)}`}>
        <span className="q-time"><strong>{clockLabel(a.time).replace(/ (AM|PM)/, '')}</strong><small>{clockLabel(a.time).slice(-2)} · {a.duration}m</small></span>
        <Avatar name={p?.name || '?'} />
        <span className="q-who"><strong>{p?.name || 'Patient removed'}</strong><small>{a.reason}{w.clinic.doctors.length > 1 && doctorFilter === 'all' ? ` · ${w.doctorName(a.doctorId)}` : ''}</small></span>
        {isNow ? <Status status="now">In consult</Status> : a.status === 'scheduled' && ended ? <Status status="late">Awaiting outcome</Status> : <Status status={a.status} />}
      </button>
      <div className="q-actions">
        {a.status === 'scheduled' && <button className="btn btn-sm btn-soft" onClick={() => w.setStatus(a, 'completed')} title="Mark as seen"><Check size={15} /><span>Seen</span></button>}
        {a.status === 'scheduled' && ended && <button className="btn btn-sm btn-ghost" onClick={() => w.confirmMissed(a)} title="Mark as missed"><UserX size={15} /><span>Missed</span></button>}
        {a.status !== 'cancelled' && a.status !== 'missed' && (rx
          ? <button className="btn btn-sm btn-ghost" onClick={() => w.writeRx({ item: rx })} title="View prescription"><FileText size={15} /><span>Rx{rx.sentAt ? ' ✓' : ''}</span></button>
          : <button className="btn btn-sm btn-ghost" onClick={() => w.writeRx({ patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id })} title="Write prescription"><FileText size={15} /><span>Rx</span></button>)}
      </div>
    </div>;
  };

  return <div className="page">
    <header className="page-head">
      <div><p className="eyebrow">{dateLabel(now.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>{greeting(now.time)}</h1></div>
      <DoctorFilter w={w} />
    </header>

    <div className="stats">
      <div className="stat"><span>Today</span><strong>{b.active.length}</strong><small>appointments</small></div>
      <div className="stat stat-accent"><span>Still to see</span><strong>{b.upcoming.length + b.current.length}</strong><small>{next ? `next at ${clockLabel(next.time)}` : 'all done'}</small></div>
      <div className="stat"><span>Seen</span><strong>{b.seen.length}</strong><small>{b.active.length ? Math.round(b.seen.length / b.active.length * 100) : 0}% of today</small></div>
      <button className={'stat' + (b.overdue.length + unresolved.length ? ' stat-warn' : '')} onClick={() => document.getElementById('needs-outcome')?.scrollIntoView({ behavior: 'smooth' })}><span>Need outcome</span><strong>{b.overdue.length + unresolved.length}</strong><small>seen or missed?</small></button>
      <button className={'stat' + (issues.length ? ' stat-warn' : '')} onClick={() => w.go('messages')}><span>Message issues</span><strong>{issues.length}</strong><small>WhatsApp failures</small></button>
    </div>

    {unresolved.length > 0 && <section className="card card-warn" id="needs-outcome">
      <div className="card-head"><AlertTriangle size={18} /><div><h2>{unresolved.length} earlier visit{unresolved.length === 1 ? '' : 's'} still need an outcome</h2><p>Marking Missed sends the patient a WhatsApp follow-up (if they consented).</p></div></div>
      <div className="outcome-list">{unresolved.map(a => { const p = w.patient(a.patientId); return <div className="outcome" key={a.id}>
        <button className="outcome-who" onClick={() => w.openAppointment(a)}><strong>{p?.name || 'Patient removed'}</strong><small>{dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {clockLabel(a.time)} · {w.doctorName(a.doctorId)}</small></button>
        <div className="row-tight"><button className="btn btn-sm btn-soft" onClick={() => w.setStatus(a, 'completed')}><Check size={15} />Attended</button><button className="btn btn-sm btn-ghost" onClick={() => w.confirmMissed(a)}><UserX size={15} />Missed</button></div>
      </div>; })}</div>
    </section>}

    <div className="split">
      <section className="card card-flush">
        <div className="card-head card-head-row"><h2>Today’s queue</h2><button className="btn btn-sm btn-ghost" onClick={() => w.book({ date: now.date })}><CalendarPlus size={15} />Add walk-in</button></div>
        {b.active.length ? <div className="queue">{b.active.map((a, i) => <Fragment key={a.id}>{i === nowLine && i > 0 && <div className="now-line"><span>Now · {clockLabel(now.time)}</span></div>}{row(a)}</Fragment>)}</div>
          : <Empty icon={<Clock size={22} />} title="No appointments today">Book a walk-in or schedule ahead.<br /><button className="btn btn-primary btn-sm" onClick={() => w.book({ date: now.date })}>Book appointment</button></Empty>}
      </section>

      <aside className="rail">
        {next ? <section className="card next-card">
          <p className="eyebrow">{b.current.includes(next) ? 'In consult now' : 'Up next'} · {clockLabel(next.time)}</p>
          {(() => { const p = w.patient(next.patientId); return <>
            <div className="next-who"><Avatar name={p?.name || '?'} size="lg" /><div><strong>{p?.name}</strong><small>{next.reason}</small><small>{w.doctorName(next.doctorId)}</small></div></div>
            <div className="next-actions">
              <button className="btn btn-primary" onClick={() => w.writeRx({ patientId: next.patientId, doctorId: next.doctorId, appointmentId: next.id })}><FileText size={16} />Write Rx</button>
              <button className="btn btn-soft" onClick={() => w.setStatus(next, 'completed')}><Check size={16} />Seen</button>
              {p && <a className="btn btn-ghost" href={`tel:${p.phone}`}><Phone size={16} />Call</a>}
            </div>
          </>; })()}
        </section> : <section className="card next-card next-empty"><p className="eyebrow">Up next</p><strong>Queue is clear</strong><small>No more patients waiting today.</small></section>}

        <section className="card">
          <div className="card-head card-head-row"><h2>Tomorrow</h2><button className="btn-link" onClick={() => w.go('schedule')}>Schedule<ChevronRight size={14} /></button></div>
          {tomorrow.length ? <ul className="mini-list">{tomorrow.slice(0, 6).map(a => <li key={a.id}><button onClick={() => w.openAppointment(a)}><span className="mini-time">{clockLabel(a.time)}</span><span>{w.patient(a.patientId)?.name}</span></button></li>)}
            {tomorrow.length > 6 && <li className="muted">+{tomorrow.length - 6} more</li>}</ul> : <p className="muted">Nothing booked yet.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
