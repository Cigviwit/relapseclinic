import { useMemo, useState } from 'react';
import type { Clinic, Doctor } from '@/lib/clinic';
import { blankMedicine, blankPrescription, type Prescription } from '@/lib/prescription';
import { padAccents, padFor, padStyles, specialties, type RxPad, type Specialty } from '@/lib/rx-templates';
import { Chips, Field, Select } from '../kit';
import { Pad } from './pad';

const samples: Record<Specialty, Partial<Prescription>> = {
  dental: { history: 'Diabetic', complaints: 'Pain in lower left back tooth for 3 days', teeth: [36], findings: 'Deep occlusal caries, tender on percussion', diagnosis: 'Irreversible pulpitis', procedures: 'RCT – access opening', plan: 'Root canal treatment\nCrown', advice: 'Avoid chewing on the treated side', medicines: [{ ...blankMedicine(), name: 'Tab Amoxicillin + Clavulanate 625 mg' }, { ...blankMedicine(), name: 'Tab Aceclofenac + Paracetamol', days: '3' }] },
  general: { vitals: { bp: '124/80', pulse: '82', temp: '100.4', weight: '72', spo2: '98' }, complaints: 'Fever and body ache for 2 days', diagnosis: 'Acute viral fever', advice: 'Drink plenty of fluids', medicines: [{ ...blankMedicine(), name: 'Tab Paracetamol 650 mg', frequency: '1-1-1', days: '3' }] },
  pediatric: { vitals: { bp: '', pulse: '110', temp: '101', weight: '14', spo2: '' }, complaints: 'Fever and cold for 2 days', diagnosis: 'Upper respiratory infection', advice: 'Give plenty of fluids', medicines: [{ ...blankMedicine(), name: 'Syp Paracetamol 250 mg/5 ml', frequency: '1-1-1', days: '3', notes: '5 ml each time' }] },
  dermatology: { complaints: 'Itchy ring-shaped rash on waist for 2 weeks', findings: 'Annular scaly plaque with active border', diagnosis: 'Tinea corporis', advice: 'Keep the area dry', medicines: [{ ...blankMedicine(), name: 'Cream Luliconazole 1%', frequency: '1-0-1', timing: '', days: '21' }] },
};

/** Clinic-wide pad look plus per-doctor details printed on it. Saves only pad fields, never the rest of the clinic. */
export function PadSettings({ clinic, onSave }: { clinic: Clinic; onSave: (pad: RxPad, doctors: Doctor[]) => void }) {
  const [pad, setPad] = useState<RxPad>(() => padFor(clinic.rxPad));
  const [doctors, setDoctors] = useState(() => clinic.doctors.map(d => ({ id: d.id, qualification: d.qualification || '', regNo: d.regNo || '', padSpecialty: d.padSpecialty || '' as Specialty | '' })));
  const [previewDoctor, setPreviewDoctor] = useState(clinic.doctors[0]?.id || '');
  const change = (v: Partial<RxPad>) => setPad(p => ({ ...p, ...v }));
  const setDoc = (id: string, v: Partial<(typeof doctors)[number]>) => setDoctors(list => list.map(d => d.id === id ? { ...d, ...v } : d));

  const doctorEdits = doctors.find(d => d.id === previewDoctor);
  const shownDoctor = { ...clinic.doctors.find(d => d.id === previewDoctor)!, ...doctorEdits, padSpecialty: doctorEdits?.padSpecialty || undefined };
  const shownPad = { ...pad, specialty: shownDoctor.padSpecialty || pad.specialty };
  const sample = useMemo(() => ({ ...blankPrescription(clinic, new Date().toISOString().slice(0, 10), '', previewDoctor), age: '34', sex: 'M' as const, ...samples[shownPad.specialty] }), [clinic, previewDoctor, shownPad.specialty]);
  // Firestore rejects undefined values, so an unset pad specialty is left out entirely.
  const merged = () => clinic.doctors.map(d => {
    const e = doctors.find(x => x.id === d.id); if (!e) return d;
    const { padSpecialty: _old, ...rest } = d; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, qualification: e.qualification.trim(), regNo: e.regNo.trim(), ...(e.padSpecialty ? { padSpecialty: e.padSpecialty } : {}) };
  });

  return <div className="padset">
    <form className="form" onSubmit={e => { e.preventDefault(); onSave({ ...pad, tagline: pad.tagline.trim(), footer: pad.footer.trim() }, merged()); }}>
      <Field label="Specialty" hint="Sets the sections, medicine list, diagnoses and advice shown when writing a prescription."><Chips label="Specialty" value={pad.specialty} onChange={specialty => change({ specialty })} options={Object.entries(specialties).map(([value, s]) => ({ value: value as Specialty, label: s.label }))} /></Field>
      <div className="grid-2">
        <Field label="Layout"><Chips label="Layout" size="sm" value={pad.style} onChange={style => change({ style })} options={padStyles} /></Field>
        <Field label="Paper"><Chips label="Paper size" size="sm" value={pad.paper} onChange={paper => change({ paper })} options={[{ value: 'A5', label: 'A5' }, { value: 'A4', label: 'A4' }]} /></Field>
      </div>
      <Field label="Colour"><div className="swatches">{padAccents.map(c => <button type="button" key={c} className={'swatch' + (pad.accent === c ? ' on' : '')} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => change({ accent: c })} />)}
        <label className="swatch swatch-custom" title="Custom colour"><input type="color" value={pad.accent} onChange={e => change({ accent: e.target.value })} aria-label="Custom colour" /></label></div></Field>
      <Field label="Tagline under clinic name"><input className="input" value={pad.tagline} maxLength={80} placeholder="e.g. Complete family dental care · Implants · Braces" onChange={e => change({ tagline: e.target.value })} /></Field>
      <Field label="Footer note"><input className="input" value={pad.footer} maxLength={160} placeholder="e.g. Mon–Sat 9 AM – 7 PM · Emergency: call the clinic" onChange={e => change({ footer: e.target.value })} /></Field>

      <fieldset className="fs"><legend>Doctors on the pad</legend>
        {clinic.doctors.map(d => { const e = doctors.find(x => x.id === d.id)!; return <div className="pad-doc-row" key={d.id}>
          <strong>{d.name}</strong>
          <Field label="Qualification"><input className="input input-sm" value={e.qualification} maxLength={120} placeholder="BDS, MDS (Endodontics)" onChange={ev => setDoc(d.id, { qualification: ev.target.value })} onFocus={() => setPreviewDoctor(d.id)} /></Field>
          <Field label="Registration no."><input className="input input-sm" value={e.regNo} maxLength={40} placeholder="A-12345" onChange={ev => setDoc(d.id, { regNo: ev.target.value })} onFocus={() => setPreviewDoctor(d.id)} /></Field>
          <Field label="Pad"><Select label="Pad specialty" className="input-sm" value={e.padSpecialty} onChange={v => { setDoc(d.id, { padSpecialty: v as Specialty | '' }); setPreviewDoctor(d.id); }} options={[{ value: '', label: `Clinic default (${specialties[pad.specialty].label})` }, ...Object.entries(specialties).map(([value, s]) => ({ value, label: s.label }))]} /></Field>
        </div>; })}
      </fieldset>
      <div className="form-foot"><button className="btn btn-primary" type="submit">Save prescription pad</button></div>
    </form>
    <aside className="padset-preview">
      <div className="row-between"><small className="eyebrow">Preview</small>{clinic.doctors.length > 1 && <Select label="Preview doctor" className="input-sm padset-doc" value={previewDoctor} onChange={setPreviewDoctor} options={clinic.doctors.map(d => ({ value: d.id, label: d.name }))} />}</div>
      <Pad rx={sample} clinic={clinic} doctor={shownDoctor} pad={shownPad} patient={{ id: 'sample', clinicId: clinic.id, name: 'Sample Patient', phone: '', consent: true }} />
    </aside>
  </div>;
}
