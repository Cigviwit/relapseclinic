import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, History, Lock, ShieldCheck } from 'lucide-react';
import { authService } from '@/lib/auth-service';
import { dateLabel, zonedNow } from '@/lib/clinic';
import { downloadFile, toCsv } from '@/lib/csv';
import { DEFAULT_LOCK_MINUTES, lockMinutes } from '@/lib/idle';
import type { AuditEntry } from '@/lib/firestore-repository';
import type { TotpSecret } from 'firebase/auth';
import { Field, FormError, Select } from '../kit';
import { QrCode } from '../qr-code';
import type { Workspace } from './types';

const collectionLabel: Record<string, string> = { clinics: 'clinic settings', patients: 'a patient', appointments: 'an appointment', prescriptions: 'a prescription', bills: 'a bill', ledgerEntries: 'a payment', dayClosings: 'a day closing', users: 'a staff login', waitlist: 'a waitlist entry', patientFiles: 'a patient file' };
const actionLabel: Record<AuditEntry['action'], string> = { create: 'Added', update: 'Changed', delete: 'Removed', export: 'Downloaded all data from', merge: 'Merged duplicate records into' };

export function ActivityLog({ w }: { w: Workspace }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState('');
  const { repo, clinic } = w;
  useEffect(() => repo.subscribeAuditLog(clinic.id, setEntries, e => setFailed(e.message)), [repo, clinic.id]);
  const when = (at: string) => { const z = zonedNow(clinic.timezone, new Date(at)); return `${dateLabel(z.date, { day: 'numeric', month: 'short' })}, ${z.time}`; };
  return <>
    <h2 className="card-title"><History size={16} />Activity log</h2>
    <p className="muted">The last 200 changes in this clinic and who made them. It lists which fields changed, not their contents. Nobody can edit it.</p>
    {failed && <p className="note note-error">{failed}</p>}
    {entries && !entries.length && <p className="muted">Nothing recorded yet.</p>}
    <ul className="activity">{(entries || []).map(e => <li key={e.id}>
      <span><strong>{e.actorName}</strong> {actionLabel[e.action].toLowerCase()} {collectionLabel[e.collection] || e.collection}{e.patientId && w.patient(e.patientId) ? ` for ${w.patient(e.patientId)!.name}` : ''}{e.fields.length ? <small> · {e.fields.join(', ')}</small> : ''}</span>
      <small>{e.at ? when(e.at) : ''}</small>
    </li>)}</ul>
  </>;
}

export function DataExport({ w }: { w: Workspace }) {
  const [busy, setBusy] = useState('');
  const stamp = w.now.date;
  const base = w.clinic.name.replace(/[^\w]+/g, '-');
  async function everything() {
    setBusy('Preparing…');
    try {
      const data = await w.repo.exportClinicData(w.clinic.id, name => setBusy(`Reading ${name}…`));
      downloadFile(`${base}-all-data-${stamp}.json`, JSON.stringify({ clinic: w.clinic, exportedAt: new Date().toISOString(), ...data }, null, 1), 'application/json');
      toast.success('Download ready');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(''); }
  }
  function patients() {
    downloadFile(`${base}-patients-${stamp}.csv`, toCsv(w.patients, ['name', 'phone', 'consent', 'language']), 'text/csv');
  }
  function payments() {
    const name = (id: string) => w.patient(id)?.name || '';
    downloadFile(`${base}-payments-${stamp}.csv`, toCsv(w.ledger.map(e => ({ ...e, patient: name(e.patientId), rupees: e.amount / 100 })), ['date', 'patient', 'kind', 'method', 'rupees', 'reference', 'note', 'collectedBy']), 'text/csv');
  }
  return <>
    <h2 className="card-title"><Download size={16} />Your data</h2>
    <p className="muted">This data belongs to your clinic. Downloads contain patient information, so store them carefully. The full download is recorded in the activity log.</p>
    <div className="row-tight wrap">
      <button type="button" className="btn btn-soft" disabled={!!busy} onClick={() => void everything()}><Download size={15} />{busy || 'Download everything'}</button>
      <button type="button" className="btn btn-ghost" onClick={patients}>Patients (CSV)</button>
      {w.billingOn && <button type="button" className="btn btn-ghost" onClick={payments}>Payments (CSV)</button>}
    </div>
  </>;
}

export function AutoLockSetting({ w }: { w: Workspace }) {
  const current = lockMinutes(w.clinic.autoLockMinutes);
  const options = [5, 10, 15, 30, 60, 0].map(m => ({ value: String(m), label: m ? `After ${m} minutes` : 'Never (not recommended)' }));
  return <>
    <h2 className="card-title"><Lock size={16} />Screen lock</h2>
    <p className="muted">Locks an unattended computer so the next person needs a password. Default: {DEFAULT_LOCK_MINUTES} minutes.</p>
    <Select label="Lock the screen" value={String(current)} onChange={v => w.repo.saveClinic({ ...w.clinic, autoLockMinutes: Number(v) }).then(() => toast.success('Screen lock updated')).catch(e => toast.error(e.message))} options={options} />
  </>;
}

/** Each person's own setting: a code from an authenticator app on top of the password. */
export function TwoStepSetting() {
  const [enabled, setEnabled] = useState(() => authService.twoStepEnabled());
  const [setup, setSetup] = useState<{ secret: TotpSecret; uri: string; key: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (task: () => Promise<void>) => { setBusy(true); setError(''); try { await task(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <>
    <h2 className="card-title"><ShieldCheck size={16} />Two-step login</h2>
    <p className="muted">{enabled ? 'On. Signing in needs your password and a code from your authenticator app.' : 'Asks for a code from an authenticator app when you sign in, so a stolen password is not enough. Recommended for owners.'}</p>
    {setup ? <div className="form">
      <QrCode value={setup.uri} label="Scan with your authenticator app" />
      <Field label="Or type this key into the app"><code className="setup-link">{setup.key}</code></Field>
      <Field label="6-digit code from the app"><input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)} /></Field>
      <FormError error={error} />
      <div className="form-foot"><button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(async () => { await authService.confirmTwoStep(setup.secret, code); setEnabled(true); setSetup(null); setCode(''); toast.success('Two-step login is on'); })}>Turn on</button></div>
    </div> : <>
      <FormError error={error} />
      {enabled
        ? <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void act(async () => { await authService.turnOffTwoStep(); setEnabled(false); toast.success('Two-step login is off'); })}>Turn off</button>
        : <button type="button" className="btn btn-soft btn-block" disabled={busy} onClick={() => void act(async () => setSetup(await authService.startTwoStep()))}>Set up two-step login</button>}
    </>}
  </>;
}
