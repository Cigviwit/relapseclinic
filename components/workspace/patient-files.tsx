import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileImage, FileText, Trash2, Upload } from 'lucide-react';
import { dateLabel } from '@/lib/clinic';
import { localDate } from '@/lib/patient-record';
import { downloadBytes, fileKinds, fromBase64, MAX_UPLOAD_BYTES, sizeLabel, toBase64Async, type PatientFile } from '@/lib/patient-file';
import { Field, FormError, Modal, Select } from '../kit';
import type { Workspace } from './types';

function Uploader({ w, patientId, onDone }: { w: Workspace; patientId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState('xray');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload() {
    if (!file) { setError('Choose a file.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError('This file is larger than 7 MB. Scan it at a lower resolution and try again.'); return; }
    setBusy(true); setError('');
    try {
      await w.repo.uploadPatientFile({ clinicId: w.clinic.id, patientId, name: file.name, kind, ...(note.trim() ? { note: note.trim() } : {}), data: await toBase64Async(file) });
      toast.success('File uploaded'); onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <div className="form">
    <Field label="File" hint="PDF, JPEG, PNG, WebP or DICOM, up to 7 MB."><input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.dcm,application/pdf,image/jpeg,image/png,image/webp,application/dicom" onChange={e => setFile(e.target.files?.[0] || null)} /></Field>
    <Field label="Kind"><Select label="Kind of file" value={kind} onChange={setKind} options={fileKinds.map(k => ({ ...k }))} /></Field>
    <Field label="Note (optional)"><input className="input" maxLength={300} placeholder="e.g. IOPA 36, before RCT" value={note} onChange={e => setNote(e.target.value)} /></Field>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" disabled={busy || !file} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload'}</button></div>
  </div>;
}

export function PatientFiles({ w, patientId }: { w: Workspace; patientId: string }) {
  const [files, setFiles] = useState<PatientFile[] | null>(null);
  const [failed, setFailed] = useState('');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null);
  const [removing, setRemoving] = useState<PatientFile | null>(null);
  const [reason, setReason] = useState('');
  const [opening, setOpening] = useState('');
  const urlRef = useRef('');
  const { repo } = w;
  const clinicId = w.clinic.id;
  useEffect(() => repo.subscribePatientFiles(clinicId, patientId, setFiles, e => setFailed(e.message)), [repo, clinicId, patientId]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const shown = (files || []).filter(f => !f.removedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canUpload = w.can.writeRecords;

  async function open(file: PatientFile) {
    setOpening(file.id);
    try {
      const { data, contentType, name } = await repo.getPatientFile(file.id);
      const bytes = fromBase64(data);
      if (!contentType.startsWith('image/')) { downloadBytes(bytes, name, contentType); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType }));
      setViewing({ name, url: urlRef.current });
    } catch (e) { toast.error((e as Error).message); } finally { setOpening(''); }
  }
  async function remove() {
    if (!removing || !reason.trim()) return;
    try { await repo.removePatientFile(removing.id, reason.trim()); toast.success('File removed'); setRemoving(null); setReason(''); }
    catch (e) { toast.error((e as Error).message); }
  }

  return <>
    <div className="sec-row"><h2 className="sec-title">X-rays and documents</h2>{canUpload && <button type="button" className="btn-link" onClick={() => setAdding(true)}><Upload size={13} />Upload</button>}</div>
    {failed && <p className="note note-warn">Files could not be loaded.</p>}
    {files && !shown.length && !failed && <p className="muted small">No files yet.</p>}
    <ul className="plain-list">{shown.map(f => <li key={f.id} className="row-between">
      <button type="button" className="btn-link-plain file-row" onClick={() => void open(f)}>
        {f.contentType.startsWith('image/') ? <FileImage size={16} /> : <FileText size={16} />}
        <span><strong>{f.name}{opening === f.id ? ' · opening…' : ''}</strong><small>{fileKinds.find(k => k.value === f.kind)?.label} · {f.createdAt ? dateLabel(localDate(f.createdAt, w.clinic.timezone), { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {sizeLabel(f.size)}{f.note ? ` · ${f.note}` : ''}</small></span>
      </button>
      <span className="row-tight">
        {!f.contentType.startsWith('image/') && <Download size={14} className="muted" aria-hidden />}
        {w.can.writeNotes && <button type="button" className="btn-icon" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f)}><Trash2 size={14} /></button>}
      </span>
    </li>)}</ul>
    <Modal open={adding} onClose={() => setAdding(false)} title="Upload a file">{adding && <Uploader w={w} patientId={patientId} onDone={() => setAdding(false)} />}</Modal>
    <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name} wide>{viewing && <img className="file-preview" src={viewing.url} alt={viewing.name} />}</Modal>
    <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove this file?" subtitle={removing?.name}>
      {removing && <div className="form">
        <p className="muted">It disappears from this patient’s page but stays on record, with your name and reason.</p>
        <Field label="Reason"><input className="input" autoFocus maxLength={200} placeholder="e.g. Uploaded to the wrong patient" value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <div className="form-foot"><button type="button" className="btn btn-danger" disabled={!reason.trim()} onClick={() => void remove()}>Remove</button></div>
      </div>}
    </Modal>
  </>;
}
