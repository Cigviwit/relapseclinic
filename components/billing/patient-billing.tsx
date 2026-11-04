import { useState } from 'react';
import { toast } from 'sonner';
import { IndianRupee, Plus, Wallet } from 'lucide-react';
import { dateLabel } from '@/lib/clinic';
import { billLabel, closingId, formatMoney,patientAccount, reversalOf, reversedIds, type LedgerEntry } from '@/lib/billing';
import { Modal, Status } from '../kit';
import { LedgerRow } from './bill-detail';
import { MoneyForm, ReasonForm } from './money-form';
import type { Workspace } from '../workspace/types';

/** The patient page's account: balance, bills, and money that is not tied to one bill. */
export function PatientBilling({ w, patientId }: { w: Workspace; patientId: string }) {
  const [money, setMoney] = useState<'payment' | 'refund' | null>(null);
  const [reversing, setReversing] = useState<LedgerEntry | null>(null);
  const bills = w.bills.filter(b => b.patientId === patientId).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const mine = w.ledger.filter(e => e.patientId === patientId);
  const account = patientAccount(bills, mine);
  const reversed = reversedIds(mine);
  // Bill payments are corrected from the bill; these have no bill to open.
  const loose = mine.filter(e => !e.billId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const name = w.patient(patientId)?.name;
  const closed = w.closings.some(c => c.id === closingId(w.clinic.id, w.now.date));
  return <>
    <div className="sec-row"><h2 className="sec-title">Billing</h2>{w.can.writeBilling && <button className="btn-link" onClick={() => w.newBill({ patientId })}><Plus size={13} />New bill</button>}</div>
    <div className={'account-box' + (account.due ? ' owes' : account.credit ? ' credit' : '')}>
      <IndianRupee size={16} /><span><strong>{account.due ? `${formatMoney(account.due)} due` : account.credit ? `${formatMoney(account.credit)} credit` : 'Nothing due'}</strong><small>{formatMoney(account.billed)} billed · {formatMoney(account.paid)} paid</small></span>
    </div>
    <div className="row-tight wrap account-actions">
      {w.can.writeBilling && <button className="btn btn-sm btn-soft" onClick={() => setMoney('payment')}><Wallet size={14} />{account.due ? 'Take payment' : 'Take advance'}</button>}
      {w.can.correctBilling && account.credit > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setMoney('refund')}>Refund credit</button>}
    </div>
    {bills.slice(0, 6).map(b => { const row = account.byBill.get(b.id); return <button key={b.id} className="visit" onClick={() => w.openBill(b.id)}>
      <span className="visit-date"><strong>{dateLabel(b.date, { day: 'numeric', month: 'short' })}</strong><small>{b.date.slice(0, 4)}</small></span>
      <span><strong>{formatMoney(b.total)}</strong><small>{billLabel(b)}</small></span>
      {b.status === 'void' ? <Status status="cancelled">Void</Status> : row?.due ? <Status status="late">{formatMoney(row.due)} due</Status> : <Status status="completed">Paid</Status>}
    </button>; })}
    {loose.length > 0 && <><h3 className="sec-title">Advances and refunds</h3><ul className="ledger-list">{loose.map(e => <LedgerRow key={e.id} entry={e} isReversed={reversed.has(e.id)} onReverse={closed || !w.can.correctBilling ? undefined : () => setReversing(e)} />)}</ul></>}
    {reversing && <ReasonForm title={`Correct this ${formatMoney(reversing.amount)} entry?`} cta="Record correction" onCancel={() => setReversing(null)} onSubmit={reason => {
      w.repo.addLedgerEntry(w.account, reversalOf(reversing, w.now.date, w.account.name, reason)).catch(e => toast.error(`The correction was not saved: ${e.message}`));
      toast.success('Correction recorded today'); setReversing(null);
    }} />}
    <Modal open={!!money} onClose={() => setMoney(null)} title={money === 'refund' ? 'Refund credit' : account.due ? 'Take payment' : 'Take advance'} subtitle={name}>
      {money && <MoneyForm w={w} patientId={patientId} kind={money} account={account} suggested={money === 'refund' ? account.credit : account.due} onDone={() => setMoney(null)} />}
    </Modal>
  </>;
}
