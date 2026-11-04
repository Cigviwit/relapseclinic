import { useState } from 'react';
import { toast } from 'sonner';
import { QrCode } from '../qr-code';
import { closingId, formatMoney, parseRupees, paymentMethods, rupeesText, upiUri, validateEntry, validUpiId, type LedgerEntry, type PatientAccount, type PaymentMethod } from '@/lib/billing';
import { Chips, Field, FormError } from '../kit';
import type { Workspace } from '../workspace/types';

/** Records a payment, an advance (no bill) or a refund. The money itself moves outside RelapseClinic. */
export function MoneyForm({ w, patientId, kind, billId, billNote, account, suggested, onDone }: { w: Workspace; patientId: string; kind: 'payment' | 'refund'; billId?: string; billNote?: string; account: PatientAccount; suggested: number; onDone: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amountText, setAmountText] = useState(suggested > 0 ? rupeesText(suggested) : '');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const closed = w.closings.some(c => c.id === closingId(w.clinic.id, w.now.date));
  const amount = (() => { try { return parseRupees(amountText); } catch { return 0; } })();
  const { upiId, upiName } = w.clinic.billing || {};
  const showQr = kind === 'payment' && method === 'upi' && !!upiId && validUpiId(upiId) && amount > 0;
  const extra = kind === 'payment' && billId ? amount - suggested : 0;

  function save() {
    try {
      const entry: LedgerEntry = { id: crypto.randomUUID(), clinicId: w.clinic.id, patientId, kind, method, amount: parseRupees(amountText), date: w.now.date, collectedBy: w.account.name, createdAt: new Date().toISOString(), ...(billId ? { billId } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) };
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
    <Field label={kind === 'refund' ? 'Amount returned (₹)' : 'Amount received (₹)'} hint={kind === 'refund' ? `${formatMoney(account.credit)} credit available` : `Recorded under ${w.account.name}`}><input className="input" inputMode="decimal" value={amountText} onChange={e => setAmountText(e.target.value)} /></Field>
    {extra > 0 && <p className="note note-info">{formatMoney(extra)} more than this bill’s balance. It will pay other open bills, then stay as credit.</p>}
    {kind === 'payment' && method === 'upi' && !upiId && <p className="note">Add the clinic’s UPI ID in Settings to show a QR code here.</p>}
    {showQr && <div className="upi-box"><QrCode label="UPI payment QR code" value={upiUri(upiId!, upiName || w.clinic.name, amount, billNote || `Payment to ${w.clinic.name}`)} />
      <div><strong>Scan to pay {formatMoney(amount)}</strong><small>{upiId}</small><p className="note note-warn">RelapseClinic cannot see this payment. Check the clinic’s own soundbox or bank app before recording it, not the patient’s screen.</p></div>
    </div>}
    {method !== 'cash' && <Field label="Reference (optional)" hint={method === 'upi' ? 'UPI transaction ID, useful when matching the bank statement' : undefined}><input className="input" value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></Field>}
    {kind === 'refund' && <p className="note note-warn">This only records the refund. Return the cash or send the UPI yourself.</p>}
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" onClick={save}>{kind === 'refund' ? 'Record refund' : `Record ${amount ? formatMoney(amount) : 'payment'}`}</button></div>
  </div>;
}

/** A reason is required for voiding a bill or correcting an entry. The record carries the signed-in person's name. */
export function ReasonForm({ title, cta, onCancel, onSubmit }: { title: string; cta: string; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return <div className="reason-form">
    <strong>{title}</strong>
    <Field label="Reason"><input className="input" autoFocus value={reason} maxLength={200} onChange={e => setReason(e.target.value)} /></Field>
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-ghost" onClick={onCancel}>Keep as is</button><button type="button" className="btn btn-danger" onClick={() => { if (!reason.trim()) { setError('Enter the reason.'); return; } onSubmit(reason.trim()); }}>{cta}</button></div>
  </div>;
}
