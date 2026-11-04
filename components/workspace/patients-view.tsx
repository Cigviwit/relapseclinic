"use client";
import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, FileText, MessageCircle, Pencil, Phone, Repeat2, Search, UserPlus, Users, X } from 'lucide-react';
import { clockLabel, dateLabel, reminderMessage, reminderStatus } from '@/lib/clinic';
import { patientLanguageLabel } from '@/lib/patient-language';
import { searchPatients } from '@/lib/patient-search';
import { Avatar, Empty, Status } from '../kit';
import { PatientBilling } from '../billing/patient-billing';
import type { Workspace } from './types';

export default function PatientsView({ w, selectedId, select }: { w: Workspace; selectedId: string | null; select: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const sorted = useMemo(() => [...w.patients].sort((a, b) => a.name.localeCompare(b.name)), [w.patients]);
  const list = useMemo(() => searchPatients(sorted, q), [sorted, q]);
  const lastVisit = useMemo(() => { const m = new Map<string, string>(); for (const a of w.appointments) if (a.status !== 'cancelled' && a.date <= w.now.date && (m.get(a.patientId) || '') < a.date) m.set(a.patientId, a.date); return m; }, [w.appointments, w.now.date]);
  const p = selectedId ? w.patient(selectedId) : undefined;

  return <div className={'page page-split' + (p ? ' has-detail' : '')}>
    <section className="pl card card-flush">
      <div className="pl-head">
        <div className="card-head-row"><h1 className="h-sm">Patients <span className="count">{w.patients.length}</span></h1><button className="btn btn-sm btn-primary" onClick={() => w.editPatient()}><UserPlus size={15} />Add</button></div>
        <div className="search"><Search size={16} /><input className="input" type="search" placeholder="Name or phone number" value={q} onChange={e => setQ(e.target.value)} autoFocus aria-label="Search patients"
          onKeyDown={e => { if (e.key === 'Enter' && list[0]) select(list[0].id); }} /></div>
      </div>
      <div className="pl-list" role="list">{list.map(x => <button role="listitem" key={x.id} className={'pl-row' + (x.id === selectedId ? ' on' : '')} onClick={() => select(x.id)}>
        <Avatar name={x.name} /><span className="pl-text"><strong>{x.name}</strong><small>{x.phone}{lastVisit.get(x.id) ? ` · last ${dateLabel(lastVisit.get(x.id)!, { day: 'numeric', month: 'short' })}` : ''}</small></span>
        {!x.consent && <span className="dot-warn" title="No WhatsApp consent" />}
      </button>)}
        {!list.length && <Empty icon={<Users size={22} />} title={q ? 'No matching patients' : 'No patients yet'}>{q ? <button className="btn btn-sm btn-soft" onClick={() => w.editPatient()}>Add “{q}”</button> : 'Add your first patient to start booking.'}</Empty>}
      </div>
    </section>

    <section className="pd">
      {p ? <PatientDetail w={w} id={p.id} onBack={() => select(null)} /> : <div className="card pd-empty"><Empty icon={<Users size={22} />} title="Select a patient">History, prescriptions and quick actions appear here.</Empty></div>}
    </section>
  </div>;
}

function PatientDetail({ w, id, onBack }: { w: Workspace; id: string; onBack: () => void }) {
  const p = w.patient(id)!;
  const visits = w.appointments.filter(a => a.patientId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const upcoming = visits.filter(a => a.status === 'scheduled' && a.date >= w.now.date).reverse();
  const past = visits.filter(a => !upcoming.includes(a));
  const rxs = w.prescriptions.filter(r => r.patientId === id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const reminders = w.db.reminders.filter(r => r.patientId === id && r.clinicId === w.clinic.id);
  const missed = visits.filter(a => a.status === 'missed').length;

  return <div className="card pd-card">
    <button className="btn-link pd-back" onClick={onBack}><ArrowLeft size={16} />All patients</button>
    <div className="pd-hero">
      <Avatar name={p.name} size="lg" />
      <div className="pd-id"><h1>{p.name}</h1>
        <p className="muted">{p.phone} · {patientLanguageLabel(p.language)}</p>
        <div className="row-tight">{p.consent ? <Status status="completed"><Check size={12} /> WhatsApp consent</Status> : <Status status="missed"><X size={12} /> No WhatsApp consent</Status>}{missed > 0 && <Status status="late">{missed} missed visit{missed === 1 ? '' : 's'}</Status>}</div>
      </div>
    </div>
    <div className="pd-actions">
      <button className="btn btn-primary" onClick={() => w.book({ patientId: id })}><CalendarPlus size={16} />Book</button>
      {w.clinic.prescriptionsEnabled && <button className="btn btn-soft" onClick={() => w.writeRx({ patientId: id })}><FileText size={16} />Write Rx</button>}
      {rxs[0] && <button className="btn btn-ghost" onClick={() => w.writeRx({ patientId: id, repeat: rxs[0] })}><Repeat2 size={16} />Repeat last Rx</button>}
      <a className="btn btn-ghost" href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>
      <a className="btn btn-ghost" href={`tel:${p.phone}`}><Phone size={16} />Call</a>
      <button className="btn btn-ghost" onClick={() => w.editPatient(p)}><Pencil size={16} />Edit</button>
    </div>

    <div className="pd-grid">
      <section>
        <h2 className="sec-title">Upcoming</h2>
        {upcoming.length ? upcoming.map(a => <button key={a.id} className="visit visit-up" onClick={() => w.openAppointment(a)}><span className="visit-date"><strong>{dateLabel(a.date, { day: 'numeric', month: 'short' })}</strong><small>{clockLabel(a.time)}</small></span><span><strong>{a.reason}</strong><small>{w.doctorName(a.doctorId)}</small></span><Status status={a.status} /></button>) : <p className="muted">No upcoming visits.</p>}
        <h2 className="sec-title">History</h2>
        {past.length ? past.map(a => <button key={a.id} className="visit" onClick={() => w.openAppointment(a)}><span className="visit-date"><strong>{dateLabel(a.date, { day: 'numeric', month: 'short' })}</strong><small>{a.date.slice(0, 4)}</small></span><span><strong>{a.reason}</strong><small>{w.doctorName(a.doctorId)} · {clockLabel(a.time)}</small></span><Status status={a.status} /></button>) : <p className="muted">No past visits.</p>}
      </section>
      <section>
        {w.billingOn && <PatientBilling w={w} patientId={id} />}
        {w.clinic.prescriptionsEnabled && <><h2 className="sec-title">Prescriptions</h2>
        {rxs.length ? rxs.map(rx => <button key={rx.id} className="rx-card" onClick={() => w.writeRx({ item: rx })}>
          <div className="rx-card-top"><strong>{dateLabel(rx.date, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>{rx.sentAt ? <Status status="accepted">Sent</Status> : <Status status="scheduled">Saved</Status>}</div>
          {rx.diagnosis && <p className="rx-dx">{rx.diagnosis}</p>}
          <small>{rx.medicines.map(m => m.name).join(', ') || 'Advice only'}</small>
        </button>) : <p className="muted">No prescriptions yet.</p>}</>}
        {reminders.length > 0 && <><h2 className="sec-title">Older manual reminders</h2>{reminders.map(r => <div className="legacy" key={r.id}><small>{dateLabel(r.date)} · {clockLabel(r.time)} · {reminderStatus(r, w.clinic)}</small><p>{r.sentMessage || reminderMessage(w.clinic, r)}</p></div>)}</>}
      </section>
    </div>
  </div>;
}
