import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { type Clinic, type Patient, type Appointment, type Database, addDays, clockLabel, normalizePhone, validateClinic, validateAppointment, zonedNow } from '@/lib/clinic';
import { patientLanguages, patientLanguage, type PatientLanguage } from '@/lib/patient-language';
import { freeSlots } from '@/lib/schedule';
import { possibleDuplicates } from '@/lib/front-desk';
import { doctorDay } from '@/lib/availability';
import { Chips, Field, FormError, Select } from './kit';
import { PatientPicker } from './patient-picker';

export function PatientForm({ clinicId, patient, patients = [], onSave, onOpenExisting }: { clinicId: string; patient?: Patient; patients?: Patient[]; onSave: (p: Patient) => void; onOpenExisting?: (id: string) => void }) {
  const [name, setName] = useState(patient?.name || '');
  const [phone, setPhone] = useState(patient?.phone || '+91 ');
  const [consent, setConsent] = useState(patient?.consent ?? true);
  const [language, setLanguage] = useState<PatientLanguage>(patientLanguage(patient?.language));
  const [error, setError] = useState('');
  const duplicates = useMemo(() => name.trim().length >= 3 || phone.replace(/\D/g, '').length >= 10 ? possibleDuplicates(patients, { id: patient?.id, name, phone }) : [], [patients, patient?.id, name, phone]);
  return <form className="form" onSubmit={e => { e.preventDefault(); try { if (!name.trim()) throw new Error('Enter the patient’s name.'); onSave({ ...(patient?.familyId ? { familyId: patient.familyId } : {}), id: patient?.id || crypto.randomUUID(), clinicId, name: name.trim(), phone: normalizePhone(phone), consent, language }); } catch (err) { setError((err as Error).message); } }}>
    <Field label="Full name"><input className="input" required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aarav Sharma" maxLength={100} /></Field>
    <Field label="WhatsApp number" hint="10-digit Indian numbers get +91 added automatically."><input className="input" required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" /></Field>
    <Field label="Message language" hint="Messages start in English; the chosen language is added below."><Chips label="Message language" value={language} onChange={setLanguage} options={patientLanguages.map(l => ({ value: l.value, label: l.value === 'en' ? 'English' : l.label.replace('English + ', '+ ') }))} /></Field>
    <label className="check check-box"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span><strong>WhatsApp consent</strong><small>Patient agrees to appointment and missed-visit reminders on WhatsApp.</small></span></label>
    {!patient && duplicates.length > 0 && <div className="note note-warn"><strong>Already on file?</strong><ul className="plain-list">{duplicates.slice(0, 4).map(({ patient: d, reason }) => <li key={d.id} className="row-between"><span>{d.name}<small> · {d.phone}{reason === 'same-phone' ? ' · same number, could be family' : ''}</small></span>{onOpenExisting && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenExisting(d.id)}>Open</button>}</li>)}</ul></div>}
    <FormError error={error} />
    <div className="form-foot"><button className="btn btn-primary" type="submit">{patient ? 'Save changes' : 'Add patient'}</button></div>
  </form>;
}

const visitTypes = ['Check-up', 'Toothache', 'Scaling & polishing', 'Filling', 'Root canal', 'Extraction', 'Follow-up visit'];

export function AppointmentForm({ db, clinic, date, appointment, patientId, doctorId, time, onSave, onCreatePatient }: { db: Database; clinic: Clinic; date: string; appointment?: Appointment; patientId?: string; doctorId?: string; time?: string; onSave: (a: Appointment) => Promise<void>; onCreatePatient: (p: Patient) => void }) {
  const [a, setA] = useState<Appointment>(appointment || { id: crypto.randomUUID(), clinicId: clinic.id, patientId: patientId || '', doctorId: doctorId || clinic.doctors[0]?.id || '', date, time: time || '', duration: 15, reason: 'Check-up', status: 'scheduled' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [manualTime, setManualTime] = useState(false);
  const change = (v: Partial<Appointment>) => { setA(x => ({ ...x, ...v })); setError(''); };
  const patients = useMemo(() => db.patients.filter(p => p.clinicId === clinic.id && !p.mergedInto), [db.patients, clinic.id]);
  const slots = useMemo(() => freeSlots(db.appointments, clinic, a.doctorId, a.date, a.duration, a.id), [db.appointments, clinic, a.doctorId, a.date, a.duration, a.id]);
  const today = zonedNow(clinic.timezone).date;
  const chosen = patients.find(p => p.id === a.patientId);
  const slotGroups = [['Morning', (t: string) => t < '12:00'], ['Afternoon', (t: string) => t >= '12:00' && t < '17:00'], ['Evening', (t: string) => t >= '17:00']] as const;
  return <form className="form" onSubmit={e => { e.preventDefault(); try { if (!a.patientId) throw new Error('Choose or add the patient.'); if (!a.time) throw new Error('Pick a time slot.'); const now = zonedNow(clinic.timezone); if (`${a.date}T${a.time}` <= `${now.date}T${now.time}`) throw new Error('Choose a future appointment time.'); validateAppointment(db, a); setSaving(true); onSave(a).catch(err => setError((err as Error).message)).finally(() => setSaving(false)); } catch (err) { setError((err as Error).message); } }}>
    <Field label="Patient"><PatientPicker patients={patients} value={a.patientId} onChange={patientId => change({ patientId })} onCreate={onCreatePatient} clinicId={clinic.id} autoFocus={!a.patientId} /></Field>
    {chosen && !chosen.consent && <p className="note note-warn">No WhatsApp consent — booking will be saved without reminders.</p>}
    {clinic.doctors.length > 1 && <Field label="Doctor">{clinic.doctors.length <= 4
      ? <Chips label="Doctor" value={a.doctorId} onChange={doctorId => change({ doctorId, time: '' })} options={clinic.doctors.map(d => ({ value: d.id, label: d.name }))} />
      : <Select label="Doctor" value={a.doctorId} onChange={doctorId => change({ doctorId, time: '' })} options={clinic.doctors.map(d => ({ value: d.id, label: d.name }))} />}</Field>}
    <div className="grid-2">
      <Field label="Date"><div className="row-tight wrap"><input className="input input-date" required type="date" min={today} value={a.date} onChange={e => change({ date: e.target.value, time: '' })} />
        <button type="button" className={'chip' + (a.date === today ? ' on' : '')} onClick={() => change({ date: today, time: '' })}>Today</button>
        <button type="button" className={'chip' + (a.date === addDays(today, 1) ? ' on' : '')} onClick={() => change({ date: addDays(today, 1), time: '' })}>Tomorrow</button></div></Field>
      <Field label="Length"><Chips label="Appointment length" value={String(a.duration)} onChange={v => change({ duration: Number(v), time: '' })} options={['10', '15', '20', '30', '45', '60'].map(v => ({ value: v, label: `${v}m` }))} /></Field>
    </div>
    <div className="field"><span className="field-label">Time <button type="button" className="btn-link" onClick={() => setManualTime(m => !m)}>{manualTime ? 'Show free slots' : 'Type a time'}</button></span>
      {manualTime ? <input className="input" type="time" required value={a.time} onChange={e => change({ time: e.target.value })} />
        : slots.length ? <div className="slots">{slotGroups.map(([label, test]) => { const list = slots.filter(test); return list.length ? <div key={label} className="slot-group"><small>{label}</small><div className="slot-chips">{list.map(t => <button type="button" key={t} className={'slot' + (a.time === t ? ' on' : '')} onClick={() => change({ time: t })}>{clockLabel(t)}</button>)}</div></div> : null; })}</div>
          : <p className="note">{doctorDay(clinic, a.doctorId, a.date).off ? `${doctorDay(clinic, a.doctorId, a.date).off} Try another date.` : `No free ${a.duration}-minute slots for this doctor on this day. Try another date or a shorter length.`}</p>}
      {appointment && a.time && !slots.includes(a.time) && !manualTime && <span className="field-hint">Current time: {clockLabel(a.time)}</span>}
    </div>
    <Field label="Visit type"><div className="chips chips-sm">{visitTypes.map(v => <button type="button" key={v} className={'chip' + (a.reason === v ? ' on' : '')} onClick={() => change({ reason: v })}>{v}</button>)}</div>
      <input className="input" required value={a.reason} maxLength={100} onChange={e => change({ reason: e.target.value })} aria-label="Visit type" /></Field>
    <FormError error={error} />
    <div className="form-foot"><span className="muted">Open {clockLabel(clinic.opens)} – {clockLabel(clinic.closes)}</span><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Booking…' : <>{appointment ? 'Save appointment' : 'Book appointment'}{a.time ? ` · ${clockLabel(a.time)}` : ''}</>}</button></div>
  </form>;
}

export function WalkInForm({ clinic, patients, patientId, doctorId, onSave, onCreatePatient }: { clinic: Clinic; patients: Patient[]; patientId?: string; doctorId?: string; onSave: (a: Pick<Appointment, 'id' | 'clinicId' | 'patientId' | 'doctorId' | 'reason'>) => Promise<void>; onCreatePatient: (p: Patient) => void }) {
  const [patient, setPatient] = useState(patientId || '');
  const [doctor, setDoctor] = useState(doctorId || clinic.doctors[0]?.id || '');
  const [reason, setReason] = useState('Check-up');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  return <form className="form" onSubmit={e => {
    e.preventDefault();
    if (!patient) { setError('Choose or add the patient.'); return; }
    if (!reason.trim()) { setError('Enter the reason for the visit.'); return; }
    setSaving(true); setError('');
    onSave({ id, clinicId: clinic.id, patientId: patient, doctorId: doctor, reason: reason.trim() }).catch(err => setError((err as Error).message)).finally(() => setSaving(false));
  }}>
    <Field label="Patient"><PatientPicker patients={patients} value={patient} onChange={setPatient} onCreate={onCreatePatient} clinicId={clinic.id} autoFocus={!patient} /></Field>
    {clinic.doctors.length > 1 && <Field label="Doctor"><Select label="Doctor" value={doctor} onChange={setDoctor} options={clinic.doctors.map(d => ({ value: d.id, label: d.name }))} /></Field>}
    <Field label="Reason"><div className="chips chips-sm">{visitTypes.map(v => <button type="button" key={v} className={'chip' + (reason === v ? ' on' : '')} onClick={() => setReason(v)}>{v}</button>)}</div>
      <input className="input" required value={reason} maxLength={100} onChange={e => setReason(e.target.value)} aria-label="Reason" /></Field>
    <FormError error={error} />
    <div className="form-foot"><span className="muted">No slot needed. They see the doctor between bookings.</span><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add to queue'}</button></div>
  </form>;
}

export function ClinicForm({ clinic, onSave, busy }: { clinic?: Clinic; onSave: (c: Clinic) => void; busy?: boolean }) {
  const [c, setC] = useState<Clinic>(clinic || { id: crypto.randomUUID(), name: '', address: '', phone: '+91 ', timezone: 'Asia/Kolkata', opens: '09:00', closes: '19:00', doctors: [{ id: crypto.randomUUID(), name: '', specialty: 'Dentist' }], rxPad: { specialty: 'dental' } });
  const [error, setError] = useState('');
  const change = (v: Partial<Clinic>) => setC({ ...c, ...v });
  const zones = useMemo(() => Array.from(new Set(['Asia/Kolkata', c.timezone, ...Intl.supportedValuesOf('timeZone')])), [c.timezone]);
  return <form className="form" onSubmit={e => { e.preventDefault(); try { const clean = { ...c, name: c.name.trim(), address: c.address.trim(), phone: normalizePhone(c.phone), doctorDigestTime: c.doctorDigestTime || '18:00', doctors: c.doctors.map(d => ({ ...d, name: d.name.trim(), specialty: d.specialty.trim(), email: d.email?.trim().toLowerCase() || '' })) }; validateClinic(clean); setError(''); onSave(clean); } catch (err) { setError((err as Error).message); } }}>
    <fieldset className="fs"><legend>Clinic</legend>
      <div className="grid-2"><Field label="Clinic / hospital name"><input className="input" required value={c.name} maxLength={100} onChange={e => change({ name: e.target.value })} /></Field><Field label="Contact number"><input className="input" required type="tel" value={c.phone} onChange={e => change({ phone: e.target.value })} /></Field></div>
      <Field label="Address"><input className="input" required value={c.address} maxLength={250} onChange={e => change({ address: e.target.value })} /></Field>
      <div className="grid-3"><Field label="Opens"><input className="input" required type="time" value={c.opens} onChange={e => change({ opens: e.target.value })} /></Field><Field label="Closes"><input className="input" required type="time" value={c.closes} onChange={e => change({ closes: e.target.value })} /></Field><Field label="Timezone"><Select label="Timezone" value={c.timezone} onChange={timezone => change({ timezone })} options={zones.map(z => ({ value: z, label: z.replaceAll('_', ' ') }))} /></Field></div>
    </fieldset>
    <fieldset className="fs"><legend>Doctors</legend>
      {c.doctors.map((d, i) => <div className="doctor-row" key={d.id}>
        <Field label={`Doctor ${i + 1}`}><input className="input" required value={d.name} placeholder="Dr. Priya Nair" onChange={e => change({ doctors: c.doctors.map(x => x.id === d.id ? { ...x, name: e.target.value } : x) })} /></Field>
        <Field label="Specialty"><input className="input" value={d.specialty} placeholder="Dentist" onChange={e => change({ doctors: c.doctors.map(x => x.id === d.id ? { ...x, specialty: e.target.value } : x) })} /></Field>
        <Field label="Email"><input className="input" type="email" value={d.email || ''} placeholder="doctor@clinic.com" onChange={e => change({ doctors: c.doctors.map(x => x.id === d.id ? { ...x, email: e.target.value } : x) })} /></Field>
        {!clinic && c.doctors.length > 1 ? <button type="button" className="btn-icon" aria-label="Remove doctor" onClick={() => change({ doctors: c.doctors.filter(x => x.id !== d.id) })}><Trash2 size={16} /></button> : <span />}
      </div>)}
      <button type="button" className="btn btn-ghost" onClick={() => change({ doctors: [...c.doctors, { id: crypto.randomUUID(), name: '', specialty: '' }] })}><Plus size={16} />Add doctor</button>
    </fieldset>
    <fieldset className="fs"><legend>Evening email to doctors</legend>
      <label className="check check-box"><input type="checkbox" checked={c.doctorDigestEnabled === true} onChange={e => change({ doctorDigestEnabled: e.target.checked })} /><span><strong>Send each doctor tomorrow’s list</strong><small>Patient names, times and durations, emailed daily. Needs an email for every doctor.</small></span></label>
      <Field label="Send at (clinic time)" className="w-sm"><input className="input" type="time" value={c.doctorDigestTime || '18:00'} onChange={e => change({ doctorDigestTime: e.target.value })} /></Field>
    </fieldset>
    <FormError error={error} />
    <div className="form-foot"><button className="btn btn-primary" type="submit" disabled={busy}>{clinic ? 'Save settings' : 'Create clinic'}</button></div>
  </form>;
}
