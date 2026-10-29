"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, FileText, LogOut, Mail } from 'lucide-react';
import { dateLabel, minutes, today, type Clinic } from '@/lib/clinic';
import { authService } from '@/lib/auth-service';
import { ClinicForm } from '../clinic-forms';
import { PadSettings } from '../prescription/pad-settings';
import type { RxPad } from '@/lib/rx-templates';
import type { Doctor } from '@/lib/clinic';
import { Status } from '../kit';
import type { Workspace } from './types';

export default function SettingsView({ w, onCreateClinic, demo }: { w: Workspace; onCreateClinic: () => void; demo: boolean }) {
  const { clinic } = w;
  const [sending, setSending] = useState(false);
  const missingEmail = !clinic.doctors.length || clinic.doctors.some(d => !/^\S+@\S+\.\S+$/.test(d.email || ''));
  const digests = w.digests.slice().sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)).slice(0, 8);

  function save(form: Clinic) {
    if (w.appointments.some(a => a.status === 'scheduled' && a.date >= today(form.timezone) && (minutes(a.time) < minutes(form.opens) || minutes(a.time) + a.duration > minutes(form.closes))))
      return toast.error('Some upcoming appointments fall outside these hours. Reschedule them before changing clinic hours.');
    // Keep pad details from the latest clinic record; this form only edits clinic and doctor basics.
    const doctors = form.doctors.map(d => { const live = clinic.doctors.find(x => x.id === d.id); return live ? { ...live, name: d.name, specialty: d.specialty, email: d.email } : d; });
    w.repo.saveClinic({ ...form, doctors, ...(clinic.rxPad ? { rxPad: clinic.rxPad } : {}) }).then(() => toast.success('Clinic settings saved')).catch(e => toast.error(e.message));
  }
  function savePad(rxPad: RxPad, doctors: Doctor[]) {
    w.repo.saveClinic({ ...clinic, rxPad, doctors }).then(() => toast.success('Prescription pad saved')).catch(e => toast.error(e.message));
  }
  async function sendDigest() {
    if (sending) return;
    if (demo) return toast.info('Demo mode — no emails are sent.');
    setSending(true);
    try {
      const [{ getFunctions, httpsCallable }, { app }] = await Promise.all([import('firebase/functions'), import('@/lib/firebase')]);
      const send = httpsCallable<{ clinicId: string; requestId: string }, { date: string; accepted: number; failed: number; unknown: number; already_sent: number }>(getFunctions(app, 'asia-south1'), 'sendDoctorDigestNow');
      const { data } = await send({ clinicId: clinic.id, requestId: crypto.randomUUID() });
      const summary = `${data.accepted} of ${clinic.doctors.length} doctor emails accepted for ${dateLabel(data.date)}`;
      if (data.failed || data.unknown) toast.error(`${summary}. ${data.failed} failed; ${data.unknown} uncertain.`);
      else if (data.already_sent) toast.info(`${summary}. ${data.already_sent} already sent for this request.`);
      else toast.success(summary);
    } catch (error) { toast.error((error as Error).message || 'Could not send doctor digests.'); }
    finally { setSending(false); }
  }

  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">{clinic.name}</p><h1>Settings</h1></div></header>
    <section className="card" id="pad"><h2 className="card-title"><FileText size={16} />Prescription pad</h2><PadSettings key={clinic.id} clinic={clinic} onSave={savePad} /></section>
    <div className="split">
      <section className="card"><ClinicForm key={clinic.id} clinic={clinic} onSave={save} /></section>
      <aside className="rail">
        <section className="card">
          <h2 className="card-title"><Mail size={16} />Doctor email digest</h2>
          <p className="muted">Tomorrow’s list · {clinic.doctorDigestEnabled ? `daily at ${clinic.doctorDigestTime || '18:00'}` : 'automatic sending off'}</p>
          <button className="btn btn-soft btn-block" onClick={sendDigest} disabled={sending || missingEmail}>{sending ? 'Sending…' : 'Send tomorrow’s list now'}</button>
          {missingEmail && <p className="field-hint">Add an email for every doctor to enable sending.</p>}
          <ul className="mini-list">{digests.map(r => <li key={r.id} className="digest"><span><strong>{w.doctorName(r.doctorId)}</strong><small>{dateLabel(r.date, { day: 'numeric', month: 'short' })} · {r.count} appt{r.count === 1 ? '' : 's'}{r.mode === 'manual' ? ' · manual' : ''}</small>{r.error && <small className="text-danger">{r.error}</small>}</span><Status status={r.status} /></li>)}</ul>
          {!digests.length && <p className="muted">No digests sent yet.</p>}
        </section>
        <section className="card">
          <h2 className="card-title">Account</h2>
          <p className="muted break">Signed in as <strong>{w.account.user.email}</strong></p>
          <button className="btn btn-ghost btn-block" onClick={() => authService.signOut()}><LogOut size={15} />Sign out</button>
        </section>
        {w.account.role === 'admin' && <section className="card"><h2 className="card-title"><Building2 size={16} />Clinic accounts</h2><p className="muted">Create a separate login for each clinic. Switch clinics from the sidebar.</p><button className="btn btn-soft btn-block" onClick={onCreateClinic}>Create clinic account</button></section>}
      </aside>
    </div>
  </div>;
}
