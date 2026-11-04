import { CalendarClock, Check, DoorOpen, FileText, IndianRupee, MessageCircle, Phone, Stethoscope, Undo2, UserRound, UserX, XCircle } from 'lucide-react';
import { clockLabel, dateLabel, minutes, type Appointment } from '@/lib/clinic';
import { useState } from 'react';
import { usePatientNotes } from '@/hooks/use-patient-record';
import { visitNotes } from '@/lib/patient-record';
import { vitalsLine } from '@/lib/prescription';
import { NoteComposer } from './patient-record';
import { AppointmentTimeline } from '../appointment-timeline';
import { Avatar, Status } from '../kit';
import type { Workspace } from './types';

export default function AppointmentDrawer({ w, appointment, onClose }: { w: Workspace; appointment: Appointment; onClose: () => void }) {
  const a = w.appointments.find(x => x.id === appointment.id) || appointment;
  const p = w.patient(a.patientId);
  const ended = w.now.date > a.date || (w.now.date === a.date && minutes(w.now.time) >= minutes(a.time) + a.duration);
  const rx = w.prescriptions.find(r => r.appointmentId === a.id);
  const bill = w.bills.find(b => b.appointmentId === a.id && b.status === 'active');
  const notes = usePatientNotes(w.repo, w.clinic.id, w.can.readNotes ? a.patientId : '');
  const [writing, setWriting] = useState(false);
  const linked = notes.status === 'ready' ? visitNotes(a, notes.value) : [];
  return <div className="drawer">
    <div className="drawer-who"><Avatar name={p?.name || '?'} size="lg" /><div><h3>{p?.name || 'Patient removed'}</h3><p className="muted">{p?.phone}</p></div><Status status={a.status} /></div>
    <dl className="facts">
      <div><dt>When</dt><dd>{dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {clockLabel(a.time)} <small>({a.duration} min)</small></dd></div>
      <div><dt>Doctor</dt><dd>{w.doctorName(a.doctorId)}</dd></div>
      <div><dt>Visit</dt><dd>{a.reason}</dd></div>
    </dl>
    <div className="drawer-actions">
      {a.status === 'scheduled' && <>
        {!a.stage && a.date === w.now.date && <button className="btn btn-primary" onClick={() => w.setStage(a, 'arrived')}><DoorOpen size={16} />Patient arrived</button>}
        {a.stage === 'arrived' && <button className="btn btn-primary" onClick={() => w.setStage(a, 'with_doctor')}><Stethoscope size={16} />Send in</button>}
        <button className={'btn ' + (a.stage === 'with_doctor' ? 'btn-primary' : 'btn-outline')} onClick={() => { void w.setStatus(a, 'completed'); onClose(); }}><Check size={16} />Mark seen</button>
        {a.stage && <button className="btn btn-ghost" onClick={() => w.setStage(a, null)}><Undo2 size={16} />Undo arrival</button>}
        {!a.stage && ended && <button className="btn btn-outline" onClick={() => w.confirmMissed(a)}><UserX size={16} />Mark missed</button>}
        {!a.stage && <button className="btn btn-outline" onClick={() => w.book({ item: a })}><CalendarClock size={16} />Reschedule</button>}
      </>}
      {a.status === 'missed' && <>
        <button className="btn btn-primary" onClick={() => w.book({ item: { ...a, id: crypto.randomUUID(), status: 'scheduled', date: w.now.date, time: '' } })}><CalendarClock size={16} />Rebook visit</button>
        <button className="btn btn-outline" onClick={() => { void w.setStatus(a, 'completed'); }}>Correct to seen</button>
      </>}
      {w.rxOn && (rx || w.can.writeRx) && a.status !== 'cancelled' && a.status !== 'missed' && <button className="btn btn-soft" onClick={() => w.writeRx(rx ? { item: rx } : { patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id })}><FileText size={16} />{rx ? 'View prescription' : 'Write prescription'}</button>}
      {w.billingOn && (bill || w.can.writeBilling) && a.status !== 'cancelled' && a.status !== 'missed' && <button className="btn btn-soft" onClick={() => bill ? w.openBill(bill.id) : w.newBill({ patientId: a.patientId, doctorId: a.doctorId, appointmentId: a.id, reason: a.reason })}><IndianRupee size={16} />{bill ? 'View bill' : 'Make bill'}</button>}
      {p && <a className="btn btn-ghost" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
      {p && <a className="btn btn-ghost" href={`tel:${p.phone}`}><Phone size={16} />Call</a>}
      <button className="btn btn-ghost" onClick={() => { onClose(); w.go('patients', a.patientId); }}><UserRound size={16} />Patient history</button>
      {a.status === 'scheduled' && <button className="btn btn-ghost text-danger" onClick={() => w.confirm({ title: 'Cancel this appointment?', body: 'It stays in the patient’s history and the time slot becomes free.', cta: 'Cancel appointment', danger: true, action: () => { void w.setStatus(a, 'cancelled'); onClose(); } })}><XCircle size={16} />Cancel appointment</button>}
    </div>
    {w.can.readNotes && a.status !== 'cancelled' && a.date <= w.now.date && <section className="visit-record">
      <div className="sec-row"><h3 className="sec-title">Visit record</h3>{w.can.writeNotes && !writing && <button type="button" className="btn-link" onClick={() => setWriting(true)}>Add note and vitals</button>}</div>
      {writing && <NoteComposer w={w} patientId={a.patientId} appointment={a} onDone={() => setWriting(false)} />}
      {linked.map(n => <div className="note-card" key={n.id}>{n.text && <p className="note-text">{n.text}</p>}{n.vitals && <p className="muted small">{vitalsLine(n.vitals)}</p>}<small className="muted">{n.createdByName || w.doctorName(n.doctorId)}</small></div>)}
      {notes.status === 'ready' && !linked.length && !writing && <p className="muted small">Nothing noted for this visit yet.</p>}
    </section>}
    <AppointmentTimeline appointment={a} deliveries={w.deliveries} consent={!!p?.consent} />
  </div>;
}
