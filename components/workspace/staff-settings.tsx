import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, UserPlus, Users } from 'lucide-react';
import { roleLabel, roleOptions, type StaffRole } from '@/lib/permissions';
import type { StaffMember } from '@/lib/firestore-repository';
import { Field, FormError, Select } from '../kit';
import type { Workspace } from './types';

/** The link is the only way a new person gets in, so it stays on screen until it is dismissed. */
function SetupLink({ link, name, onDone }: { link: string; name: string; onDone: () => void }) {
  return <div className="note note-info">
    <p><strong>Send this link to {name}.</strong> It lets them set their own password. Treat it like a password and share it directly with them.</p>
    <p className="setup-link">{link}</p>
    <div className="row-tight"><button type="button" className="btn btn-sm btn-soft" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'), () => toast.error('Copy the link by hand.'))}><Copy size={14} />Copy link</button><button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>Done</button></div>
  </div>;
}

export function StaffSettings({ w }: { w: Workspace }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [failed, setFailed] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'frontdesk' as StaffRole, doctorId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const { repo, clinic } = w;
  const help = roleOptions.find(r => r.value === form.role)?.help;
  const doctors = clinic.doctors.map(d => ({ value: d.id, label: d.name }));

  useEffect(() => repo.subscribeStaff(clinic.id, setStaff, e => setFailed(e.message)), [repo, clinic.id]);

  async function add() {
    if (form.role === 'doctor' && !form.doctorId) { setError('Choose which doctor this login belongs to.'); return; }
    setBusy(true); setError('');
    try {
      const { setupLink } = await repo.createStaff({ clinicId: clinic.id, ...form, doctorId: form.role === 'doctor' ? form.doctorId : '' });
      setLink({ name: form.name.trim(), url: setupLink });
      setForm({ name: '', email: '', role: 'frontdesk', doctorId: '' }); setAdding(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const update = (member: StaffMember, change: { role?: StaffRole; doctorId?: string; active?: boolean }) => repo.updateStaff({ uid: member.uid, ...change }).then(() => toast.success(`${member.name} updated`)).catch(e => toast.error(e.message));
  const newLink = (member: StaffMember) => repo.staffSetupLink(member.uid).then(url => setLink({ name: member.name, url })).catch(e => toast.error(e.message));

  return <>
    <h2 className="card-title"><Users size={16} />Staff logins</h2>
    <p className="muted">Each person signs in as themselves, so every note, bill and payment carries their name.</p>
    {failed && <p className="note note-error">{failed}</p>}
    {link && <SetupLink link={link.url} name={link.name} onDone={() => setLink(null)} />}
    {(staff || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(m => <div key={m.uid} className={'staff-row' + (m.active ? '' : ' is-off')}>
      <div><strong>{m.name}</strong>{!m.active && ' (deactivated)'}<small>{m.email}{m.role === 'doctor' && m.doctorId ? ` · ${w.doctorName(m.doctorId)}` : ''}</small></div>
      <div className="row-tight wrap">
        <Select label={`Role for ${m.name}`} className="input-sm" value={m.role} onChange={v => {
          const role = v as StaffRole;
          if (role === 'doctor' && !m.doctorId) { const first = clinic.doctors[0]; if (first) void update(m, { role, doctorId: first.id }); return; }
          void update(m, { role });
        }} options={roleOptions.map(r => ({ value: r.value, label: r.label }))} />
        {m.role === 'doctor' && <Select label={`Doctor for ${m.name}`} className="input-sm" value={m.doctorId} onChange={doctorId => void update(m, { doctorId })} options={doctors} />}
        <button type="button" className="btn-icon" title="New password link" aria-label={`New password link for ${m.name}`} onClick={() => void newLink(m)}><KeyRound size={15} /></button>
        <button type="button" className={'btn btn-sm ' + (m.active ? 'btn-ghost text-danger' : 'btn-soft')} onClick={() => w.confirm(m.active
          ? { title: `Deactivate ${m.name}?`, body: 'They lose access straight away. Everything they recorded stays, under their name.', cta: 'Deactivate', danger: true, action: () => void update(m, { active: false }) }
          : { title: `Reactivate ${m.name}?`, body: 'They can sign in again with their existing password.', cta: 'Reactivate', action: () => void update(m, { active: true }) })}>{m.active ? 'Deactivate' : 'Reactivate'}</button>
      </div>
    </div>)}
    {staff && !staff.length && <p className="muted">No staff logins yet.</p>}
    {adding ? <div className="form">
      <div className="grid-2">
        <Field label="Full name"><input className="input" autoFocus value={form.name} maxLength={100} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Role" hint={help}><Select label="Role" value={form.role} onChange={v => setForm({ ...form, role: v as StaffRole, doctorId: v === 'doctor' ? form.doctorId || clinic.doctors[0]?.id || '' : '' })} options={roleOptions.map(r => ({ value: r.value, label: r.label }))} /></Field>
        {form.role === 'doctor' && <Field label="Which doctor"><Select label="Which doctor" value={form.doctorId} onChange={doctorId => setForm({ ...form, doctorId })} options={doctors} /></Field>}
      </div>
      <FormError error={error} />
      <div className="form-foot"><button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void add()}>{busy ? 'Adding…' : 'Add staff member'}</button></div>
    </div> : <button type="button" className="btn btn-soft btn-block" onClick={() => setAdding(true)}><UserPlus size={15} />Add staff member</button>}
    <p className="muted small">Signed in as {w.account.name} ({roleLabel(w.account.role)}).</p>
  </>;
}
