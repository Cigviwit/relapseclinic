"use client";
import { useMemo, useState } from 'react';
import { AlertCircle, FileText, MessageCircle, Plus, Search } from 'lucide-react';
import { clockLabel, dateLabel } from '@/lib/clinic';
import { patientLanguageLabel } from '@/lib/patient-language';
import { Avatar, Chips, Empty, Status } from '../kit';
import type { Workspace } from './types';

export function PrescriptionsView({ w }: { w: Workspace }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return w.prescriptions.filter(rx => !term || [w.patient(rx.patientId)?.name, rx.diagnosis, ...rx.medicines.map(m => m.name)].some(s => s?.toLowerCase().includes(term)))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  }, [w, q]);
  const todayCount = w.prescriptions.filter(r => r.date === w.now.date).length;
  return <div className="page">
    <header className="page-head">
      <div><p className="eyebrow">{todayCount} written today</p><h1>Prescriptions</h1></div>
      <button className="btn btn-primary" onClick={() => w.writeRx()}><Plus size={16} />New prescription</button>
    </header>
    <section className="card card-flush">
      <div className="card-pad"><div className="search"><Search size={16} /><input className="input" type="search" placeholder="Search patient, diagnosis or medicine" value={q} onChange={e => setQ(e.target.value)} aria-label="Search prescriptions" /></div></div>
      {list.length ? <div className="table" role="table">
        <div className="tr th" role="row"><span>Date</span><span>Patient</span><span>Diagnosis & medicines</span><span>Doctor</span><span>Status</span></div>
        {list.map(rx => { const p = w.patient(rx.patientId); return <button key={rx.id} className="tr" role="row" onClick={() => w.writeRx({ item: rx })}>
          <span className="td-date">{dateLabel(rx.date, { day: 'numeric', month: 'short' })}</span>
          <span className="td-who"><Avatar name={p?.name || '?'} size="sm" />{p?.name || 'Patient removed'}</span>
          <span className="td-main"><strong>{rx.diagnosis || '—'}</strong><small>{rx.medicines.map(m => m.name).join(', ') || 'Advice only'}</small></span>
          <span className="td-muted">{w.doctorName(rx.doctorId)}</span>
          <span>{rx.sentAt ? <Status status="accepted">Sent</Status> : <Status status="scheduled">Saved</Status>}</span>
        </button>; })}
      </div> : <Empty icon={<FileText size={22} />} title={q ? 'No matches' : 'No prescriptions yet'}>Write one from Today’s queue, a patient’s page, or press <kbd className="kbd">R</kbd>.</Empty>}
    </section>
  </div>;
}

const slotLabel: Record<string, string> = { booked: 'Booking confirmation', two_days_before: '2-day reminder', appointment_day: 'Appointment-day reminder', missed_day_one: 'Missed visit · follow-up', missed_day_seven: 'Missed visit · day 7', prescription: 'Prescription (PDF)' };

export function MessagesView({ w }: { w: Workspace }) {
  const issues = w.deliveries.filter(d => d.status === 'failed' || d.status === 'unknown');
  const [filter, setFilter] = useState<'all' | 'issues'>(issues.length ? 'issues' : 'all');
  const list = (filter === 'issues' ? issues : w.deliveries).slice().sort((a, b) => (b.appointmentDate + b.appointmentTime).localeCompare(a.appointmentDate + a.appointmentTime));
  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">Automatic WhatsApp</p><h1>Messages</h1></div>
      <Chips label="Filter" size="sm" value={filter} onChange={setFilter} options={[{ value: 'issues', label: `Issues (${issues.length})` }, { value: 'all', label: `All (${w.deliveries.length})` }]} /></header>
    <p className="lede">{w.clinic.prescriptionsEnabled && 'Prescriptions sent from the builder appear here too. '}Patients with consent get a confirmation when booked, a reminder 2 days before and at 8 AM on the day. Marking a visit Missed sends a follow-up right away and again 7 days after the visit. “Sent” means the provider accepted it.</p>
    <section className="card card-flush">
      {list.length ? <div className="table" role="table">
        <div className="tr th" role="row"><span>Visit</span><span>Patient</span><span>Message</span><span>Language</span><span>Status</span></div>
        {list.map(d => { const p = w.patient(d.patientId); const a = w.appointments.find(x => x.id === d.appointmentId); return <button key={d.id} className="tr" role="row" onClick={() => a && w.openAppointment(a)}>
          <span className="td-date">{dateLabel(d.appointmentDate, { day: 'numeric', month: 'short' })}<small>{d.appointmentTime ? clockLabel(d.appointmentTime) : ''}</small></span>
          <span className="td-who"><Avatar name={p?.name || '?'} size="sm" />{p?.name || 'Patient removed'}</span>
          <span className="td-main"><strong>{slotLabel[d.slot] || d.slot}</strong>{d.error && <small className="text-danger"><AlertCircle size={12} /> {d.error}</small>}</span>
          <span className="td-muted">{d.patientLanguage ? patientLanguageLabel(d.patientLanguage).replace('English + ', '+ ') : '—'}</span>
          <span><Status status={d.status} /></span>
        </button>; })}
      </div> : <Empty icon={<MessageCircle size={22} />} title={filter === 'issues' ? 'No message problems' : 'No messages yet'}>{filter === 'issues' ? 'Every WhatsApp message was accepted.' : 'Messages appear after a patient with consent is booked.'}</Empty>}
    </section>
  </div>;
}
