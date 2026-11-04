"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { billTotals, closingId, formatMoney, parseRupees, patientAccount, rupeesText, validateBill, type Bill } from '@/lib/billing';
import { Field, FormError, Select } from '../kit';
import { PatientPicker } from '../patient-picker';
import { StaffField, useStaffName } from './money-form';
import type { BillOptions, Workspace } from '../workspace/types';

type Row = { id: string; description: string; qty: string; price: string; taxRate: string };
const money = (text: string) => { try { return parseRupees(text || '0'); } catch { return 0; } };

export default function BillEditor({ w, options, onSaved }: { w: Workspace; options: BillOptions; onSaved: (id: string) => void }) {
  const fees = w.clinic.billing?.fees || [];
  const gst = !!w.clinic.billing?.gstEnabled;
  const fromFee = (name: string, price = '', taxRate = 0): Row => ({ id: crypto.randomUUID(), description: name, qty: '1', price, taxRate: String(taxRate) });
  const [patientId, setPatientId] = useState(options.patientId || '');
  const [doctorId, setDoctorId] = useState(options.doctorId || (w.doctorFilter !== 'all' ? w.doctorFilter : w.clinic.doctors[0]?.id) || '');
  const [rows, setRows] = useState<Row[]>(() => {
    const match = options.reason ? fees.find(f => f.name.toLowerCase() === options.reason!.toLowerCase()) : undefined;
    if (match) return [fromFee(match.name, rupeesText(match.price), match.taxRate)];
    return [fromFee(options.reason || '')];
  });
  const [discountText, setDiscountText] = useState('');
  const [note, setNote] = useState('');
  const [by, setBy] = useStaffName();
  const [error, setError] = useState('');
  const closed = w.closings.some(c => c.id === closingId(w.clinic.id, w.now.date));
  const totals = billTotals(rows.map(r => ({ qty: Number(r.qty) || 0, unitPrice: money(r.price), taxRate: Number(r.taxRate) || 0 })), money(discountText));
  const credit = patientId ? patientAccount(w.bills.filter(b => b.patientId === patientId), w.ledger.filter(e => e.patientId === patientId)).credit : 0;
  const change = (id: string, patch: Partial<Row>) => setRows(list => list.map(r => r.id === id ? { ...r, ...patch } : r));

  function addFee(name: string, price: number, taxRate = 0) {
    // Picking a fee fills the first empty row, so the common one-item bill takes one tap.
    const blank = rows.find(r => !r.description.trim() && !r.price);
    const row = { description: name, price: rupeesText(price), taxRate: String(taxRate) };
    if (blank) change(blank.id, row); else setRows(list => [...list, { ...fromFee(''), ...row }]);
  }

  function save() {
    try {
      const lines = rows.filter(r => r.description.trim() || r.price).map(r => {
        const qty = Number(r.qty), taxRate = Number(r.taxRate) || 0;
        if (taxRate < 0 || taxRate > 100) throw new Error(`Check the GST rate for ${r.description}.`);
        return { id: r.id, description: r.description.trim(), qty, unitPrice: parseRupees(r.price), taxRate };
      });
      const discount = discountText.trim() ? parseRupees(discountText) : 0;
      const bill: Bill = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, doctorId, date: w.now.date, lines, ...billTotals(lines, discount), status: 'active', createdBy: by.trim(), createdAt: new Date().toISOString(), ...(options.appointmentId ? { appointmentId: options.appointmentId } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
      validateBill(bill);
      w.repo.saveBill(w.account, bill).catch(e => toast.error(`The bill for ${w.patient(patientId)?.name || 'this patient'} was not saved: ${e.message}`));
      onSaved(bill.id);
    } catch (e) { setError((e as Error).message); }
  }

  if (closed) return <p className="note note-warn">Today is closed, so no more bills can be made today.</p>;
  return <div className="form bill-editor">
    <Field label="Patient"><PatientPicker patients={w.patients} value={patientId} onChange={setPatientId} onCreate={w.savePatient} clinicId={w.clinic.id} autoFocus={!patientId} /></Field>
    {w.clinic.doctors.length > 1 && <Field label="Doctor"><Select label="Doctor" value={doctorId} onChange={setDoctorId} options={w.clinic.doctors.map(d => ({ value: d.id, label: d.name }))} /></Field>}
    {fees.length > 0 && <div className="fee-chips" aria-label="Fee list">{fees.map(f => <button type="button" key={f.id} className="chip" onClick={() => addFee(f.name, f.price, f.taxRate)}>{f.name} · {formatMoney(f.price)}</button>)}</div>}
    <div className="bill-rows">
      {rows.map(r => <div className={'bill-row' + (gst ? ' has-gst' : '')} key={r.id}>
        <Field label="Item"><input className="input" value={r.description} maxLength={150} placeholder="e.g. Consultation" onChange={e => change(r.id, { description: e.target.value })} /></Field>
        <Field label="Qty"><input className="input" inputMode="numeric" value={r.qty} onChange={e => change(r.id, { qty: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Price (₹)"><input className="input" inputMode="decimal" value={r.price} placeholder="0" onChange={e => change(r.id, { price: e.target.value })} /></Field>
        {gst && <Field label="GST %"><input className="input" inputMode="decimal" value={r.taxRate} onChange={e => change(r.id, { taxRate: e.target.value })} /></Field>}
        <button type="button" className="btn-icon bill-row-x" aria-label={`Remove ${r.description || 'item'}`} disabled={rows.length === 1} onClick={() => setRows(list => list.filter(x => x.id !== r.id))}><Trash2 size={16} /></button>
      </div>)}
      <button type="button" className="btn-link" onClick={() => setRows(list => [...list, fromFee('')])}><Plus size={14} />Add item</button>
    </div>
    <div className="grid-2">
      <Field label="Discount (₹)"><input className="input" inputMode="decimal" value={discountText} placeholder="0" onChange={e => setDiscountText(e.target.value)} /></Field>
      <StaffField w={w} value={by} onChange={setBy} label="Billed by" />
    </div>
    <Field label="Note (optional)"><input className="input" value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></Field>
    <dl className="bill-totals">
      <div><dt>Subtotal</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
      {totals.discount > 0 && <div><dt>Discount</dt><dd>−{formatMoney(totals.discount)}</dd></div>}
      {totals.tax > 0 && <div><dt>GST</dt><dd>{formatMoney(totals.tax)}</dd></div>}
      <div className="bill-total"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
    </dl>
    {credit > 0 && <p className="note note-info">This patient has {formatMoney(credit)} credit. It will be used on this bill automatically.</p>}
    <FormError error={error} />
    <div className="form-foot"><span className="muted">A saved bill cannot be edited, only voided.</span><button type="button" className="btn btn-primary" onClick={save}>Save bill</button></div>
  </div>;
}
