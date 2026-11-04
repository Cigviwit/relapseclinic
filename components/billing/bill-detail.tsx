import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CalendarClock, Download, MessageCircle, Printer, RotateCcw, UserRound } from 'lucide-react';
import { dateLabel } from '@/lib/clinic';
import { billLabel, billMessage, closingId, formatMoney, methodLabel, patientAccount, reversalOf, reversedIds, type Bill, type BillBalance, type LedgerEntry } from '@/lib/billing';
import { elementToPdf } from '@/lib/pdf';
import { whatsappUrl } from '@/lib/prescription';
import { Status } from '../kit';
import { MoneyForm, ReasonForm } from './money-form';
import type { Workspace } from '../workspace/types';

function Receipt({ w, bill, balance, entries }: { w: Workspace; bill: Bill; balance: BillBalance; entries: LedgerEntry[] }) {
  const { clinic } = w;
  const gstin = clinic.billing?.gstEnabled ? clinic.billing.gstin : '';
  const cgst = Math.floor(bill.tax / 2);
  const patient = w.patient(bill.patientId);
  return <div className="receipt">
    <header><h1>{clinic.name}</h1><p>{clinic.address} · {clinic.phone}</p>{gstin && <p>GSTIN {gstin}</p>}</header>
    <h2>{bill.tax > 0 ? 'Tax invoice' : 'Bill'}{bill.status === 'void' && <span className="receipt-void"> · VOID</span>}</h2>
    <div className="receipt-meta"><div><strong>{patient?.name}</strong><span>{patient?.phone}</span></div><div><strong>{billLabel(bill)}</strong><span>{dateLabel(bill.date)}</span><span>{w.doctorName(bill.doctorId)}</span></div></div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th>{bill.tax > 0 && <th>GST</th>}<th>Amount</th></tr></thead>
      <tbody>{bill.lines.map(l => <tr key={l.id}><td>{l.description}</td><td>{l.qty}</td><td>{formatMoney(l.unitPrice)}</td>{bill.tax > 0 && <td>{l.taxRate}%</td>}<td>{formatMoney(l.qty * l.unitPrice)}</td></tr>)}</tbody></table>
    <dl className="receipt-totals">
      {(bill.discount > 0 || bill.tax > 0) && <div><dt>Subtotal</dt><dd>{formatMoney(bill.subtotal)}</dd></div>}
      {bill.discount > 0 && <div><dt>Discount</dt><dd>−{formatMoney(bill.discount)}</dd></div>}
      {bill.tax > 0 && <><div><dt>CGST</dt><dd>{formatMoney(cgst)}</dd></div><div><dt>SGST</dt><dd>{formatMoney(bill.tax - cgst)}</dd></div></>}
      <div className="receipt-total"><dt>Total</dt><dd>{formatMoney(bill.total)}</dd></div>
      {bill.status === 'active' && <><div><dt>Paid</dt><dd>{formatMoney(balance.paid)}</dd></div><div><dt>Balance due</dt><dd>{formatMoney(balance.due)}</dd></div></>}
    </dl>
    {entries.length > 0 && <p className="receipt-paid">{entries.map(e => `${methodLabel(e.method)} ${formatMoney(e.amount)} on ${dateLabel(e.date, { day: 'numeric', month: 'short' })}`).join(' · ')}</p>}
    {bill.note && <p className="receipt-paid">{bill.note}</p>}
  </div>;
}

export default function BillDetail({ w, billId, onClose }: { w: Workspace; billId: string; onClose: () => void }) {
  const bill = w.bills.find(b => b.id === billId);
  const exportRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'idle' | 'collect' | 'void'>('idle');
  const [reversing, setReversing] = useState<LedgerEntry | null>(null);
  if (!bill) return <p className="muted">Opening bill…</p>;

  const patient = w.patient(bill.patientId);
  const mine = w.ledger.filter(e => e.patientId === bill.patientId);
  const account = patientAccount(w.bills.filter(b => b.patientId === bill.patientId), mine);
  const balance = account.byBill.get(bill.id) || { paid: 0, due: 0 };
  const reversed = reversedIds(mine);
  const entries = mine.filter(e => e.billId === bill.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const receiptEntries = entries.filter(e => e.kind === 'payment' && !reversed.has(e.id));
  const closed = w.closings.some(c => c.id === closingId(w.clinic.id, w.now.date));
  const fileName = `Bill ${patient?.name || ''} ${bill.date}.pdf`.replace(/[^\w .-]+/g, '').replace(/\s+/g, '-');

  function voidBill(reason: string) {
    w.repo.voidBill(w.account, bill!.id, { voidReason: reason, voidedOn: w.now.date }).catch(e => toast.error(`The bill was not voided: ${e.message}`));
    toast.success(balance.paid ? `Bill voided. ${formatMoney(balance.paid)} paid on it is now credit.` : 'Bill voided');
    setMode('idle');
  }
  function reverse(entry: LedgerEntry, reason: string) {
    w.repo.addLedgerEntry(w.account, reversalOf(entry, w.now.date, w.account.name, reason)).catch(e => toast.error(`The correction was not saved: ${e.message}`));
    toast.success('Correction recorded today');
    setReversing(null);
  }
  async function download() {
    try {
      const url = URL.createObjectURL(new Blob([await elementToPdf(exportRef.current!.firstElementChild as HTMLElement, 'A5') as BlobPart], { type: 'application/pdf' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast.error((e as Error).message); }
  }
  function print() {
    const node = exportRef.current?.firstElementChild; if (!node) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map(s => s.outerHTML).join('');
    const doc = frame.contentDocument!;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${fileName}</title>${styles}<style>@page{size:A5;margin:0}html,body{background:#fff;margin:0}</style></head><body>${node.outerHTML}</body></html>`); doc.close();
    setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); setTimeout(() => frame.remove(), 1000); }, 300);
  }

  return <div className="bill-detail">
    <div className="row-between">
      <div><strong className="bill-number">{billLabel(bill)}</strong><p className="muted small">{dateLabel(bill.date)} · {w.doctorName(bill.doctorId)} · billed by {bill.createdBy}</p>{!bill.number && <p className="muted small">The final number is assigned once this bill syncs.</p>}</div>
      {bill.status === 'void' ? <Status status="cancelled">Void</Status> : balance.due ? <Status status="late">{balance.paid ? 'Part paid' : 'Unpaid'}</Status> : <Status status="completed">Paid</Status>}
    </div>
    {bill.status === 'void' && <p className="note note-warn">Voided on {dateLabel(bill.voidedOn || bill.date)} by {bill.voidedBy}: {bill.voidReason}</p>}
    <button className="bill-patient" onClick={() => { onClose(); w.go('patients', bill.patientId); }}><UserRound size={15} />{patient?.name || 'Patient removed'}</button>

    <ul className="bill-lines">{bill.lines.map(l => <li key={l.id}><span>{l.description}{l.qty > 1 && <small> × {l.qty}</small>}{l.taxRate > 0 && <small> · GST {l.taxRate}%</small>}</span><strong>{formatMoney(l.qty * l.unitPrice)}</strong></li>)}</ul>
    <dl className="bill-totals">
      {bill.discount > 0 && <div><dt>Discount</dt><dd>−{formatMoney(bill.discount)}</dd></div>}
      {bill.tax > 0 && <div><dt>GST</dt><dd>{formatMoney(bill.tax)}</dd></div>}
      <div className="bill-total"><dt>Total</dt><dd>{formatMoney(bill.total)}</dd></div>
      {bill.status === 'active' && <><div><dt>Paid</dt><dd>{formatMoney(balance.paid)}</dd></div><div className={balance.due ? 'bill-due' : ''}><dt>Balance due</dt><dd>{formatMoney(balance.due)}</dd></div></>}
    </dl>

    {entries.length > 0 && <><h3 className="sec-title">Payments on this bill</h3>
      <ul className="ledger-list">{entries.map(e => <LedgerRow key={e.id} entry={e} isReversed={reversed.has(e.id)} onReverse={!closed && w.can.correctBilling ? () => setReversing(e) : undefined} />)}</ul></>}
    {balance.paid > receiptEntries.reduce((s, e) => s + e.amount, 0) && <p className="muted small">Includes the patient’s advance or credit.</p>}
    {reversing && <ReasonForm title={`Correct ${formatMoney(reversing.amount)} ${methodLabel(reversing.method)}?`} cta="Record correction" onCancel={() => setReversing(null)} onSubmit={reason => reverse(reversing, reason)} />}

    {mode === 'collect' && <MoneyForm w={w} patientId={bill.patientId} kind="payment" billId={bill.id} billNote={`Bill ${billLabel(bill)}`} account={account} suggested={balance.due} onDone={() => setMode('idle')} />}
    {mode === 'void' && <ReasonForm title="Void this bill?" cta="Void bill" onCancel={() => setMode('idle')} onSubmit={voidBill} />}

    {mode === 'idle' && !reversing && <div className="drawer-actions">
      {w.can.writeBilling && bill.status === 'active' && balance.due > 0 && <button className="btn btn-primary" onClick={() => setMode('collect')}><CalendarClock size={16} />Collect {formatMoney(balance.due)}</button>}
      <button className="btn btn-outline" onClick={print}><Printer size={16} />Print</button>
      <button className="btn btn-outline" onClick={() => void download()}><Download size={16} />PDF</button>
      {patient && bill.status === 'active' && <a className="btn btn-outline" href={whatsappUrl(patient.phone, billMessage(bill, w.clinic, patient, balance))} target="_blank" rel="noreferrer"><MessageCircle size={16} />My WhatsApp</a>}
      {w.can.correctBilling && bill.status === 'active' && !closed && <button className="btn btn-ghost text-danger" onClick={() => setMode('void')}><Ban size={16} />Void bill</button>}
    </div>}
    <div className="pad-export" ref={exportRef} aria-hidden><Receipt w={w} bill={bill} balance={balance} entries={receiptEntries} /></div>
  </div>;
}

const kindText: Record<LedgerEntry['kind'], string> = { payment: 'Payment', refund: 'Refund', reversal: 'Correction' };
export function LedgerRow({ entry: e, isReversed, onReverse, who }: { entry: LedgerEntry; isReversed: boolean; onReverse?: () => void; who?: string }) {
  const out = e.kind === 'refund' || (e.kind === 'reversal' && e.reversesKind !== 'refund');
  return <li className={isReversed ? 'ledger-row is-reversed' : 'ledger-row'}>
    <span className="ledger-main"><strong>{who || `${kindText[e.kind]} · ${methodLabel(e.method)}`}</strong><small>{who ? `${kindText[e.kind]} · ${methodLabel(e.method)} · ` : ''}{dateLabel(e.date, { day: 'numeric', month: 'short' })} · {e.collectedBy}{e.reference ? ` · ${e.reference}` : ''}{e.note ? ` · ${e.note}` : ''}{isReversed ? ' · corrected' : ''}</small></span>
    <span className={out ? 'ledger-amt out' : 'ledger-amt'}>{out ? '−' : ''}{formatMoney(e.amount)}</span>
    {onReverse && !isReversed && e.kind !== 'reversal' ? <button className="btn-icon" title="Correct this entry" aria-label="Correct this entry" onClick={onReverse}><RotateCcw size={15} /></button> : <span className="ledger-spacer" />}
  </li>;
}
