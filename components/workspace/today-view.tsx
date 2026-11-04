import { Fragment, useMemo } from 'react';
import { AlertTriangle, CalendarPlus, Check, ChevronRight, Clock, DoorOpen, FileText, IndianRupee, Phone, Stethoscope, Undo2, UserPlus, UserX } from 'lucide-react';
import { clinicQueue, dayTokens, minutesSince } from '@/lib/queue';
import { addDays, clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { unresolvedVisits } from '@/lib/unresolved';
import { dayBuckets } from '@/lib/schedule';
import { Avatar, Chips, Empty, Status } from '../kit';
import { WaitlistCard } from './front-desk-cards';
import { LabDueCard, RecallsDueCard } from './dental-cards';
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
  const billFor = (a: Appointment) => w.bills.find(x => x.appointmentId === a.id && x.status === 'active');
  // Numbered across the whole clinic, then filtered, so a patient has one token whichever doctor is selected.
  const queue = useMemo(() => {
    const all = clinicQueue(appointments, now.date);
    return { waiting: all.waiting.filter(e => mine(e.appointment)), withDoctor: all.withDoctor.filter(e => mine(e.appointment)) };
  }, [appointments, now.date, doctorFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokens = useMemo(() => dayTokens(appointments, now.date), [appointments, now.date]);
  const nowMs = new Date().getTime();
  // Someone in the waiting room comes before a booking whose time has merely arrived.
  const next = queue.waiting[0]?.appointment || b.current[0] || b.upcoming[0];
  const nowLine = b.active.findIndex(a => minutes(a.time) > minutes(now.time));

  const row = (a: Appointment) => {
    const p = w.patient(a.patientId); const rx = rxFor(a); const bill = billFor(a);
    const ended = minutes(a.time) + a.duration <= minutes(now.time);
    const isNow = b.current.includes(a);
    return <div key={a.id} className={`q-row q-${a.status}${isNow ? ' q-now' : ''}`}>
      <button className="q-main" onClick={() => w.openAppointment(a)} aria-label={`Open ${p?.name} at ${clockLabel(a.time)}`}>
        <span className="q-time"><strong>{clockLabel(a.time).replace(/ (AM|PM)/, '')}</strong><small>{clockLabel(a.time).slice(-2)} · {a.duration}m</small></span>
        <Avatar name={p?.name || '?'} />
        <span className="q-who"><strong>{p?.name || 'Patient removed'}</strong><small>{a.reason}{w.clinic.doctors.length > 1 && doctorFilter === 'all' ? ` · ${w.doctorName(a.doctorId)}` : ''}</small></span>
        {a.status === 'scheduled' && a.stage === 'with_doctor' ? <Status status="now">With doctor · #{tokens.get(a.id)}</Status> : a.status === 'scheduled' && a.stage === 'arrived' ? <Status status="now">Waiting · #{tokens.get(a.id)}</Status> : isNow ? <Status status="late">Due now</Status> : a.status === 'scheduled' && ended ? <Status status="late">Awaiting outcome</Status> : <Status status={a.status} />}
      </button>
      <div className="q-actions">
        {a.status === 'scheduled' && !a.stage && <button className="btn btn-sm btn-soft" onClick={() => w.setStage(a, 'arrived')} title="Patient has arrived"><DoorOpen size={15} /><span>Arrived</span></button>}
        {a.status === 'scheduled' && a.stage === 'arrived' && <button className="btn btn-sm btn-soft" onClick={() => w.setStage(a, 'with_doctor')} title="Send in to the doctor"><Stethoscope size={15} /><span>Send in</span></button>}
        {a.status === 'scheduled' && <button className={'btn btn-sm ' + (a.stage === 'with_doctor' ? 'btn-soft' : 'btn-ghost')} onClick={() => w.setStatus(a, 'completed')} title="Mark as seen"><Check size={15} /><span>Seen</span></button>}
        {a.status === 'scheduled' && a.stage && <button className="btn btn-sm btn-ghost" onClick={() => w.setStage(a, null)} title="Undo the arrival"><Undo2 size={15} /></button>}
        {a.status === 'scheduled' && !a.stage && ended && <button className="btn btn-sm btn-ghost" onClick={() => w.confirmMissed(a)} title="Mark as missed"><UserX size={15} /><span>Missed</span></button>}
        {w.rxOn && a.status !== 'cancelled' && a.status !== 'missed' && (rx
          ? <button className="btn btn-sm btn-ghost" onClick={() => w.writeRx({ item: rx })} title="View prescription"><FileText size={15} /><span>Rx{rx.sentAt ? ' ✓' : ''}</span></button>
          : w.can.writeRx && <button className="btn btn-sm btn-ghost" onClick={() => w.writeRx({ patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id })} title="Write prescription"><FileText size={15} /><span>Rx</span></button>)}
        {w.billingOn && a.status !== 'cancelled' && a.status !== 'missed' && (bill
          ? <button className="btn btn-sm btn-ghost" onClick={() => w.openBill(bill.id)} title="Open bill"><IndianRupee size={15} /><span>Bill ✓</span></button>
          : w.can.writeBilling && <button className="btn btn-sm btn-ghost" onClick={() => w.newBill({ patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id, reason: a.reason })} title="Make bill"><IndianRupee size={15} /><span>Bill</span></button>)}
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
      <div className={'stat' + (queue.waiting.length ? ' stat-warn' : '')}><span>Waiting now</span><strong>{queue.waiting.length}</strong><small>{queue.waiting[0] ? `longest ${minutesSince(queue.waiting[0].appointment.arrivedAt, nowMs)} min` : 'waiting room empty'}</small></div>
      <div className="stat stat-accent"><span>Still to see</span><strong>{b.upcoming.length + b.current.length}</strong><small>{next ? `next at ${clockLabel(next.time)}` : 'all done'}</small></div>
      <div className="stat"><span>Seen</span><strong>{b.seen.length}</strong><small>{b.active.length ? Math.round(b.seen.length / b.active.length * 100) : 0}% of today</small></div>
      <button className={'stat' + (b.overdue.length + unresolved.length ? ' stat-warn' : '')} onClick={() => document.getElementById('needs-outcome')?.scrollIntoView({ behavior: 'smooth' })}><span>Need outcome</span><strong>{b.overdue.length + unresolved.length}</strong><small>seen or missed?</small></button>
    </div>

    {unresolved.length > 0 && <section className="card card-warn" id="needs-outcome">
      <div className="card-head"><AlertTriangle size={18} /><div><h2>{unresolved.length} earlier visit{unresolved.length === 1 ? '' : 's'} still need an outcome</h2><p>Marking Missed sends the patient a WhatsApp follow-up (if they consented).</p></div></div>
      <div className="outcome-list">{unresolved.map(a => { const p = w.patient(a.patientId); return <div className="outcome" key={a.id}>
        <button className="outcome-who" onClick={() => w.openAppointment(a)}><strong>{p?.name || 'Patient removed'}</strong><small>{dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {clockLabel(a.time)} · {w.doctorName(a.doctorId)}</small></button>
        <div className="row-tight"><button className="btn btn-sm btn-soft" onClick={() => w.setStatus(a, 'completed')}><Check size={15} />Attended</button><button className="btn btn-sm btn-ghost" onClick={() => w.confirmMissed(a)}><UserX size={15} />Missed</button></div>
      </div>; })}</div>
    </section>}

    {issues.length > 0 && <button className="note note-warn row-between block-link" onClick={() => w.go('messages')}><span>{issues.length} WhatsApp message{issues.length === 1 ? '' : 's'} had a problem.</span><ChevronRight size={15} /></button>}

    <div className="split">
      <section className="card card-flush">
        <div className="card-head card-head-row"><h2>Today’s visits</h2><button className="btn btn-sm btn-primary" onClick={() => w.addWalkIn()}><UserPlus size={15} />Add walk-in</button></div>
        {b.active.length ? <div className="queue">{b.active.map((a, i) => <Fragment key={a.id}>{i === nowLine && i > 0 && <div className="now-line"><span>Now · {clockLabel(now.time)}</span></div>}{row(a)}</Fragment>)}</div>
          : <Empty icon={<Clock size={22} />} title="No appointments today">Add a walk-in or schedule ahead.<br /><button className="btn btn-soft btn-sm" onClick={() => w.book({ date: now.date })}><CalendarPlus size={15} />Book appointment</button></Empty>}
      </section>

      <aside className="rail">
        {queue.withDoctor.length > 0 && <section className="card">
          <div className="card-head card-head-row"><h2>With the doctor</h2></div>
          <ul className="mini-list">{queue.withDoctor.map(({ appointment: a, token }) => <li key={a.id}><button onClick={() => w.openAppointment(a)}><span className="mini-time">#{token}</span><span>{w.patient(a.patientId)?.name}{w.clinic.doctors.length > 1 ? ` · ${w.doctorName(a.doctorId)}` : ''} · {minutesSince(a.startedAt, nowMs)} min</span></button></li>)}</ul>
        </section>}
        {queue.waiting.length > 0 && <section className="card">
          <div className="card-head card-head-row"><h2>Waiting room</h2></div>
          <ul className="mini-list">{queue.waiting.map(({ appointment: a, token }) => <li key={a.id}><button onClick={() => w.openAppointment(a)}><span className="mini-time">#{token}</span><span>{w.patient(a.patientId)?.name}{a.walkIn ? ' · walk-in' : ''}{w.clinic.doctors.length > 1 ? ` · ${w.doctorName(a.doctorId)}` : ''} · {minutesSince(a.arrivedAt, nowMs)} min</span></button></li>)}</ul>
        </section>}
        {next ? <section className="card next-card">
          <p className="eyebrow">{next.stage === 'arrived' ? `Waiting · #${tokens.get(next.id)}` : `Up next · ${clockLabel(next.time)}`}</p>
          {(() => { const p = w.patient(next.patientId); return <>
            <div className="next-who"><Avatar name={p?.name || '?'} size="lg" /><div><strong>{p?.name}</strong><small>{next.reason}</small><small>{w.doctorName(next.doctorId)}</small></div></div>
            <div className="next-actions">
              {w.rxOn && w.can.writeRx && <button className="btn btn-primary" onClick={() => w.writeRx({ patientId: next.patientId, doctorId: next.doctorId, appointmentId: next.id })}><FileText size={16} />Write Rx</button>}
              {next.stage === 'arrived' ? <button className="btn btn-soft" onClick={() => w.setStage(next, 'with_doctor')}><Stethoscope size={16} />Send in</button> : <button className="btn btn-soft" onClick={() => w.setStage(next, 'arrived')}><DoorOpen size={16} />Arrived</button>}
              {p && <a className="btn btn-ghost" href={`tel:${p.phone}`}><Phone size={16} />Call</a>}
            </div>
          </>; })()}
        </section> : <section className="card next-card next-empty"><p className="eyebrow">Up next</p><strong>Queue is clear</strong><small>No more patients waiting today.</small></section>}

        <WaitlistCard w={w} />
        {w.can.readRecords && <RecallsDueCard w={w} />}
        {w.can.readRecords && <LabDueCard w={w} />}
        <section className="card">
          <div className="card-head card-head-row"><h2>Tomorrow</h2><button className="btn-link" onClick={() => w.go('schedule')}>Schedule<ChevronRight size={14} /></button></div>
          {tomorrow.length ? <ul className="mini-list">{tomorrow.slice(0, 6).map(a => <li key={a.id}><button onClick={() => w.openAppointment(a)}><span className="mini-time">{clockLabel(a.time)}</span><span>{w.patient(a.patientId)?.name}</span></button></li>)}
            {tomorrow.length > 6 && <li className="muted">+{tomorrow.length - 6} more</li>}</ul> : <p className="muted">Nothing booked yet.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
