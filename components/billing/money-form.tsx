"use client";
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import qrcode from 'qrcode-generator';
import { closingId, formatMoney, parseRupees, paymentMethods, rupeesText, upiUri, validateEntry, validUpiId, type LedgerEntry, type PatientAccount, type PaymentMethod } from '@/lib/billing';
import { Chips, Field, FormError } from '../kit';
import type { Workspace } from '../workspace/types';

/** The name on a bill or payment, remembered on this computer until each person has their own login. */
export function useStaffName() {
  const [name, setName] = useState(() => { try { return localStorage.getItem('billingStaff') || ''; } catch { return ''; } });
  return [name, (value: string) => { setName(value); try { localStorage.setItem('billingStaff', value); } catch { /* storage unavailable */ } }] as const;
}

export function StaffField({ w, value, onChange, label }: { w: Workspace; value: string; onChange: (v: string) => void; label: string }) {
  const names = useMemo(() => [...new Set(w.ledger.map(e => e.collectedBy))].sort(), [w.ledger]);
  return <Field label={label}>
    <input className="input" list="billing-staff" value={value} maxLength={100} placeholder="Your name" onChange={e => onChange(e.target.value)} />
    <datalist id="billing-staff">{names.map(n => <option key={n} value={n} />)}</datalist>
  </Field>;
}

export function UpiQr({ uri }: { uri: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M'); qr.addData(uri); qr.make();
    const size = qr.getModuleCount();
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
    return { size, path };
  }, [uri]);
  return <svg className="upi-qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label="UPI payment QR code"><rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fff" /><path d={path} fill="#000" /></svg>;
}

/** Records a payment, an advance (no bill) or a refund. The money itself moves outside ClinicLoop. */
export function MoneyForm({ w, patientId, kind, billId, billNote, account, suggested, onDone }: { w: Workspace; patientId: string; kind: 'payment' | 'refund'; billId?: string; billNote?: string; account: PatientAccount; suggested: number; onDone: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountText, setAmountText] = useState(suggested > 0 ? rupeesText(suggested) : '');
  const [reference, setReference] = useState('');
  const [by, setBy] = useStaffName();
  const [error, setError] = useState('');
  const closed = w.closings.some(c => c.id === closingId(w.clinic.id, w.now.date));
  const amount = (() => { try { return parseRupees(amountText); } catch { return 0; } })();
  const { upiId, upiName } = w.clinic.billing || {};
  const showQr = kind === 'payment' && method === 'upi' && !!upiId && validUpiId(upiId) && amount > 0;
  const extra = kind === 'payment' && billId ? amount - suggested : 0;

  function save() {
    try {
      const entry: LedgerEntry = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, kind, method, amount: parseRupees(amountText), date: w.now.date, collectedBy: by.trim(), createdAt: new Date().toISOString(), ...(billId ? { billId } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) };
      validateEntry(entry, account);
      // Not awaited: offline, the write waits for the connection while the screen updates straight away.
      w.repo.addLedgerEntry(w.account, entry).catch(e => toast.error(`${formatMoney(entry.amount)} from ${w.patient(patientId)?.name || 'this patient'} was not saved: ${e.message}`));
      toast.success(kind === 'refund' ? `Refund of ${formatMoney(entry.amount)} recorded` : `${formatMoney(entry.amount)} recorded`);
      onDone();
    } catch (e) { setError((e as Error).message); }
  }

  if (closed) return <p className="note note-warn">Today is closed, so no more payments can be recorded today.</p>;
  return <div className="money-form">
    <Field label="Method"><Chips label="Method" size="sm" value={method} onChange={setMethod} options={paymentMethods} /></Field>
    <div className="grid-2">
      <Field label={kind === 'refund' ? 'Amount returned (₹)' : 'Amount received (₹)'} hint={kind === 'refund' ? `${formatMoney(account.credit)} credit available` : undefined}><input className="input" inputMode="decimal" value={amountText} onChange={e => setAmountText(e.target.value)} /></Field>
      <StaffField w={w} value={by} onChange={setBy} label={kind === 'refund' ? 'Returned by' : 'Collected by'} />
    </div>
    {extra > 0 && <p className="note note-info">{formatMoney(extra)} more than this bill’s balance. It will pay other open bills, then stay as credit.</p>}
    {kind === 'payment' && method === 'upi' && !upiId && <p className="note">Add the clinic’s UPI ID in Settings to show a QR code here.</p>}
    {showQr && <div className="upi-box"><UpiQr uri={upiUri(upiId!, upiName || w.clinic.name, amount, billNote || `Payment to ${w.clinic.name}`)} />
      <div><strong>Scan to pay {formatMoney(amount)}</strong><small>{upiId}</small><p className="note note-warn">ClinicLoop cannot see this payment. Check the clinic’s own soundbox or bank app before recording it, not the patient’s screen.</p></div>
    </div>}
    {method !== 'cash' && <Field label="Reference (optional)" hint={method === 'upi' ? 'UPI transaction ID, useful when matching the bank statement' : undefined}><input className="input" value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></Field>}
    {kind === 'refund' && <p className="note note-warn">This only records the refund. Return the cash or send the UPI yourself.</p>}
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" onClick={save}>{kind === 'refund' ? 'Record refund' : `Record ${amount ? formatMoney(amount) : 'payment'}`}</button></div>
  </div>;
}

/** A reason and a name: required for voiding a bill or correcting an entry. */
export function ReasonForm({ w, title, cta, onCancel, onSubmit }: { w: Workspace; title: string; cta: string; onCancel: () => void; onSubmit: (reason: string, by: string) => void }) {
  const [reason, setReason] = useState('');
  const [by, setBy] = useStaffName();
  const [error, setError] = useState('');
  return <div className="reason-form">
    <strong>{title}</strong>
    <div className="grid-2">
      <Field label="Reason"><input className="input" autoFocus value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></Field>
      <StaffField w={w} value={by} onChange={setBy} label="Your name" />
    </div>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-ghost" onClick={onCancel}>Keep as is</button><button type="button" className="btn btn-danger" onClick={() => { if (!reason.trim() || !by.trim()) { setError('Enter the reason and your name.'); return; } onSubmit(reason.trim(), by.trim()); }}>{cta}</button></div>
  </div>;
}
