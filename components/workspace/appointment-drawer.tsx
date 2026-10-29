"use client";
import { CalendarClock, Check, FileText, MessageCircle, Phone, UserRound, UserX, XCircle } from 'lucide-react';
import { clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { AppointmentTimeline } from '../appointment-timeline';
import { Avatar, Status } from '../kit';
import type { Workspace } from './types';

export default function AppointmentDrawer({ w, appointment, onClose }: { w: Workspace; appointment: Appointment; onClose: () => void }) {
  const a = w.appointments.find(x => x.id === appointment.id) || appointment;
  const p = w.patient(a.patientId);
  const ended = w.now.date > a.date || (w.now.date === a.date && minutes(w.now.time) >= minutes(a.time) + a.duration);
  const rx = w.prescriptions.find(r => r.appointmentId === a.id);
  return <div className="drawer">
    <div className="drawer-who"><Avatar name={p?.name || '?'} size="lg" /><div><h3>{p?.name || 'Patient removed'}</h3><p className="muted">{p?.phone}</p></div><Status status={a.status} /></div>
    <dl className="facts">
      <div><dt>When</dt><dd>{dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {clockLabel(a.time)} <small>({a.duration} min)</small></dd></div>
      <div><dt>Doctor</dt><dd>{w.doctorName(a.doctorId)}</dd></div>
      <div><dt>Visit</dt><dd>{a.reason}</dd></div>
    </dl>
    <div className="drawer-actions">
      {a.status === 'scheduled' && <>
        <button className="btn btn-primary" onClick={() => { void w.setStatus(a, 'completed'); onClose(); }}><Check size={16} />Mark seen</button>
        {ended && <button className="btn btn-outline" onClick={() => w.confirmMissed(a)}><UserX size={16} />Mark missed</button>}
        <button className="btn btn-outline" onClick={() => w.book({ item: a })}><CalendarClock size={16} />Reschedule</button>
      </>}
      {a.status === 'missed' && <>
        <button className="btn btn-primary" onClick={() => w.book({ item: { ...a, id: crypto.randomUUID(), status: 'scheduled', date: w.now.date, time: '' } })}><CalendarClock size={16} />Rebook visit</button>
        <button className="btn btn-outline" onClick={() => { void w.setStatus(a, 'completed'); }}>Correct to seen</button>
      </>}
      {a.status !== 'cancelled' && a.status !== 'missed' && <button className="btn btn-soft" onClick={() => w.writeRx(rx ? { item: rx } : { patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id })}><FileText size={16} />{rx ? 'View prescription' : 'Write prescription'}</button>}
      {p && <a className="btn btn-ghost" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
      {p && <a className="btn btn-ghost" href={`tel:${p.phone}`}><Phone size={16} />Call</a>}
      <button className="btn btn-ghost" onClick={() => { onClose(); w.go('patients', a.patientId); }}><UserRound size={16} />Patient history</button>
      {a.status === 'scheduled' && <button className="btn btn-ghost text-danger" onClick={() => w.confirm({ title: 'Cancel this appointment?', body: 'It stays in the patient’s history and the time slot becomes free.', cta: 'Cancel appointment', danger: true, action: () => { void w.setStatus(a, 'cancelled'); onClose(); } })}><XCircle size={16} />Cancel appointment</button>}
    </div>
    <AppointmentTimeline appointment={a} deliveries={w.deliveries} consent={!!p?.consent} />
  </div>;
}
