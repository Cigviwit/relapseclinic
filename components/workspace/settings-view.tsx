import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, FileText, IndianRupee, LogOut, Mail } from 'lucide-react';
import { roleLabel } from '@/lib/permissions';
import { StaffSettings } from './staff-settings';
import { ScheduleSettings } from './schedule-settings';
import { DuplicatesCard } from './front-desk-cards';
import { ActivityLog, AutoLockSetting, DataExport, TwoStepSetting } from './security-settings';
import { dateLabel, minutes, today, type Clinic } from '@/lib/clinic';
import { authService } from '@/lib/auth-service';
import { ClinicForm } from '../clinic-forms';
import { PadSettings } from '../prescription/pad-settings';
import { BillingSettingsForm } from '../billing/billing-settings';
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
    // The form may hold an older copy; the prescription switch is only changed by the administrator below.
    w.repo.saveClinic({ ...form, doctors, ...(clinic.rxPad ? { rxPad: clinic.rxPad } : {}), ...(clinic.prescriptionsEnabled !== undefined ? { prescriptionsEnabled: clinic.prescriptionsEnabled } : {}), ...(clinic.billingEnabled !== undefined ? { billingEnabled: clinic.billingEnabled } : {}), ...(clinic.billing ? { billing: clinic.billing } : {}), ...(clinic.autoLockMinutes !== undefined ? { autoLockMinutes: clinic.autoLockMinutes } : {}), ...(clinic.closedDates ? { closedDates: clinic.closedDates } : {}) }).then(() => toast.success('Clinic settings saved')).catch(e => toast.error(e.message));
  }
  function savePad(rxPad: RxPad, doctors: Doctor[]) {
    w.repo.saveClinic({ ...clinic, rxPad, doctors }).then(() => toast.success('Prescription pad saved')).catch(e => toast.error(e.message));
  }
  function togglePrescriptions(target: Clinic, enabled: boolean) {
    w.repo.setPrescriptionsEnabled(target.id, enabled).then(() => toast.success(`Digital prescriptions ${enabled ? 'enabled' : 'disabled'} for ${target.name}`)).catch(e => toast.error(e.message));
  }
  function toggleBilling(target: Clinic, enabled: boolean) {
    w.repo.setBillingEnabled(target.id, enabled).then(() => toast.success(`Billing ${enabled ? 'enabled' : 'disabled'} for ${target.name}`)).catch(e => toast.error(e.message));
  }
  async function sendDigest() {
    if (sending) return;
    if (demo) return toast.info('Demo mode — no emails are sent.');
    setSending(true);
    try {
      const { callFunction } = await import('@/lib/firebase');
      const data = await callFunction<{ clinicId: string; requestId: string }, { date: string; accepted: number; failed: number; unknown: number; already_sent: number }>('sendDoctorDigestNow', { clinicId: clinic.id, requestId: crypto.randomUUID() }, 300000);
      const summary = `${data.accepted} of ${clinic.doctors.length} doctor emails accepted for ${dateLabel(data.date)}`;
      if (data.failed || data.unknown) toast.error(`${summary}. ${data.failed} failed; ${data.unknown} uncertain.`);
      else if (data.already_sent) toast.info(`${summary}. ${data.already_sent} already sent for this request.`);
      else toast.success(summary);
    } catch (error) { toast.error((error as Error).message || 'Could not send doctor digests.'); }
    finally { setSending(false); }
  }

  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">{clinic.name}</p><h1>Settings</h1></div></header>
    {w.can.editClinic && clinic.prescriptionsEnabled && <section className="card" id="pad"><h2 className="card-title"><FileText size={16} />Prescription pad</h2><PadSettings key={clinic.id} clinic={clinic} onSave={savePad} /></section>}
    {w.can.editClinic && w.billingOn && <section className="card" id="billing-settings"><h2 className="card-title"><IndianRupee size={16} />Billing</h2><BillingSettingsForm key={clinic.id} w={w} /></section>}
    <div className="split">
      <div className="rail">
        {w.can.editClinic && <section className="card"><ClinicForm key={clinic.id} clinic={clinic} onSave={save} /></section>}
        {w.can.editClinic && <section className="card" id="schedule"><ScheduleSettings key={clinic.id} w={w} /></section>}
        {w.can.manageStaff && <section className="card" id="staff"><StaffSettings key={clinic.id} w={w} /></section>}
        {w.can.exportData && <section className="card" id="duplicates"><DuplicatesCard w={w} /></section>}
        {w.can.readAudit && <section className="card" id="activity"><ActivityLog key={clinic.id} w={w} /></section>}
        {w.can.exportData && <section className="card" id="data"><DataExport w={w} /></section>}
      </div>
      <aside className="rail">
        {w.account.role !== 'billing' && <section className="card">
          <h2 className="card-title"><Mail size={16} />Doctor email digest</h2>
          <p className="muted">Tomorrow’s list · {clinic.doctorDigestEnabled ? `daily at ${clinic.doctorDigestTime || '18:00'}` : 'automatic sending off'}</p>
          <button className="btn btn-soft btn-block" onClick={sendDigest} disabled={sending || missingEmail}>{sending ? 'Sending…' : 'Send tomorrow’s list now'}</button>
          {missingEmail && <p className="field-hint">Add an email for every doctor to enable sending.</p>}
          <ul className="mini-list">{digests.map(r => <li key={r.id} className="digest"><span><strong>{w.doctorName(r.doctorId)}</strong><small>{dateLabel(r.date, { day: 'numeric', month: 'short' })} · {r.count} appt{r.count === 1 ? '' : 's'}{r.mode === 'manual' ? ' · manual' : ''}</small>{r.error && <small className="text-danger">{r.error}</small>}</span><Status status={r.status} /></li>)}</ul>
          {!digests.length && <p className="muted">No digests sent yet.</p>}
        </section>}
        {w.can.editClinic && <section className="card"><AutoLockSetting w={w} /></section>}
        {!demo && <section className="card"><TwoStepSetting /></section>}
        <section className="card">
          <h2 className="card-title">Account</h2>
          <p className="muted break"><strong>{w.account.name}</strong> · {roleLabel(w.account.role)}<br />{w.account.user.email}</p>
          <button className="btn btn-ghost btn-block" onClick={() => authService.signOut()}><LogOut size={15} />Sign out</button>
        </section>
        {w.can.adminFeatures && <section className="card"><h2 className="card-title"><Building2 size={16} />Clinics</h2><p className="muted">Create a clinic and its owner’s login. Switch clinics from the sidebar.</p><button className="btn btn-soft btn-block" onClick={onCreateClinic}>Create clinic</button></section>}
        {w.can.adminFeatures && <section className="card">
          <h2 className="card-title"><FileText size={16} />Digital prescriptions</h2>
          <p className="muted">Off for every clinic until you turn it on here. Clinics cannot change this themselves.</p>
          {w.db.clinics.map(c => <label className="check check-box" key={c.id}><input type="checkbox" checked={c.prescriptionsEnabled === true} onChange={e => togglePrescriptions(c, e.target.checked)} /><span><strong>{c.name}</strong><small>{c.address}</small></span></label>)}
        </section>}
        {w.can.adminFeatures && <section className="card">
          <h2 className="card-title"><IndianRupee size={16} />Billing</h2>
          <p className="muted">Off for every clinic until you turn it on here. Clinics cannot change this themselves.</p>
          {w.db.clinics.map(c => <label className="check check-box" key={c.id}><input type="checkbox" checked={c.billingEnabled === true} onChange={e => toggleBilling(c, e.target.checked)} /><span><strong>{c.name}</strong><small>{c.address}</small></span></label>)}
        </section>}
      </aside>
    </div>
  </div>;
}
