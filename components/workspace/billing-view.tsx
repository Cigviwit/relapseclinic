"use client";
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { IndianRupee, Lock, Plus, Search, Wallet } from 'lucide-react';
import { addDays, dateLabel } from '@/lib/clinic';
import { billLabel, closingId, daySummary, duesList, formatMoney, makeClosing, parseRupees, patientAccount, paymentMethods, reversedIds } from '@/lib/billing';
import { Avatar, Chips, Empty, Field, FormError, Status } from '../kit';
import { LedgerRow } from '../billing/bill-detail';
import { StaffField, useStaffName } from '../billing/money-form';
import type { Workspace } from './types';

export default function BillingView({ w }: { w: Workspace }) {
  const [tab, setTab] = useState<'day' | 'bills' | 'dues'>('day');
  const dues = useMemo(() => duesList(w.bills, w.ledger), [w.bills, w.ledger]);
  const today = useMemo(() => daySummary(w.now.date, w.bills, w.ledger), [w.now.date, w.bills, w.ledger]);
  const totalDue = dues.reduce((sum, d) => sum + d.due, 0);
  return <div className="page">
    <header className="page-head">
      <div><p className="eyebrow">{dateLabel(w.now.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Billing</h1></div>
      <button className="btn btn-primary" onClick={() => w.newBill()}><Plus size={16} />New bill</button>
    </header>
    <div className="stats stats-4">
      <div className="stat stat-accent"><span>Collected today</span><strong>{formatMoney(today.total)}</strong><small>{today.entries.length} entr{today.entries.length === 1 ? 'y' : 'ies'}</small></div>
      <div className="stat"><span>Cash today</span><strong>{formatMoney(today.collected.cash)}</strong><small>should be in the drawer</small></div>
      <div className="stat"><span>UPI and card today</span><strong>{formatMoney(today.collected.upi + today.collected.card)}</strong><small>check against the bank</small></div>
      <button className={'stat' + (totalDue ? ' stat-warn' : '')} onClick={() => setTab('dues')}><span>Dues</span><strong>{formatMoney(totalDue)}</strong><small>{dues.length} patient{dues.length === 1 ? '' : 's'}</small></button>
    </div>
    <Chips label="Billing section" size="sm" value={tab} onChange={setTab} options={[{ value: 'day', label: 'Daily closing' }, { value: 'bills', label: 'Bills' }, { value: 'dues', label: `Dues (${dues.length})` }]} />
    {tab === 'day' && <DayTab w={w} />}
    {tab === 'bills' && <BillsTab w={w} />}
    {tab === 'dues' && <section className="card card-flush">
      {dues.length ? <div className="table billing-table" role="table">
        <div className="tr th" role="row"><span>Since</span><span>Patient</span><span>Open bills</span><span>Phone</span><span>Due</span></div>
        {dues.map(d => { const p = w.patient(d.patientId); return <button key={d.patientId} className="tr" role="row" onClick={() => w.go('patients', d.patientId)}>
          <span className="td-date">{dateLabel(d.since, { day: 'numeric', month: 'short' })}</span>
          <span className="td-who"><Avatar name={p?.name || '?'} size="sm" />{p?.name || 'Patient removed'}</span>
          <span className="td-muted">{d.bills} bill{d.bills === 1 ? '' : 's'}</span>
          <span className="td-muted">{p?.phone}</span>
          <strong>{formatMoney(d.due)}</strong>
        </button>; })}
      </div> : <Empty icon={<Wallet size={22} />} title="No dues">Every bill has been paid.</Empty>}
    </section>}
  </div>;
}

function DayTab({ w }: { w: Workspace }) {
  const [date, setDate] = useState(w.now.date);
  const [countedText, setCountedText] = useState('');
  const [note, setNote] = useState('');
  const [by, setBy] = useStaffName();
  const [error, setError] = useState('');
  const summary = daySummary(date, w.bills, w.ledger);
  const closing = w.closings.find(c => c.id === closingId(w.clinic.id, date));
  const reversed = reversedIds(w.ledger);
  const entries = [...summary.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counted = (() => { try { return parseRupees(countedText); } catch { return null; } })();
  const unclosedEarlier = useMemo(() => {
    const days = new Set([...w.ledger.map(e => e.date), ...w.bills.map(b => b.date)]);
    return [...days].filter(d => d < w.now.date && !w.closings.some(c => c.date === d)).sort();
  }, [w.ledger, w.bills, w.closings, w.now.date]);

  function close() {
    try {
      if (!by.trim()) throw new Error('Enter your name.');
      if (counted === null) throw new Error('Count the cash in the drawer and enter the amount.');
      // Entries still waiting to sync from another device would be refused after closing, so closing needs a live connection.
      if (!navigator.onLine) throw new Error('Connect to the internet before closing the day, so entries from other computers are included.');
      w.repo.closeDay(w.account, makeClosing(w.clinic.id, date, summary, counted, by.trim(), note.trim())).then(() => { toast.success(`${dateLabel(date, { day: 'numeric', month: 'short' })} closed`); setCountedText(''); setNote(''); }).catch(e => toast.error(`The day was not closed: ${e.message}`));
      setError('');
    } catch (e) { setError((e as Error).message); }
  }

  const shown = closing ? closing.collected : summary.collected;
  return <div className="split">
    <section className="card card-flush">
      <div className="card-head card-head-row"><h2>Entries</h2><input className="input input-date" type="date" aria-label="Day" value={date} max={w.now.date} onChange={e => { if (e.target.value) setDate(e.target.value); }} /></div>
      {entries.length ? <ul className="ledger-list ledger-pad">{entries.map(e => <LedgerRow key={e.id} entry={e} isReversed={reversed.has(e.id)} who={w.patient(e.patientId)?.name || 'Patient removed'} />)}</ul>
        : <Empty icon={<IndianRupee size={22} />} title="Nothing recorded">Payments recorded on this day appear here.</Empty>}
    </section>
    <aside className="rail">
      <section className="card">
        <h2 className="card-title">{closing ? <><Lock size={15} />Day closed</> : date === w.now.date ? 'Close today' : `Close ${dateLabel(date, { day: 'numeric', month: 'short' })}`}</h2>
        <dl className="bill-totals">
          {paymentMethods.map(m => <div key={m.value}><dt>{m.label}</dt><dd>{formatMoney(shown[m.value])}</dd></div>)}
          <div className="bill-total"><dt>Collected</dt><dd>{formatMoney(Object.values(shown).reduce((a, b) => a + b, 0))}</dd></div>
          <div><dt>Billed</dt><dd>{formatMoney(closing ? closing.billed : summary.billed)}</dd></div>
        </dl>
        {closing ? <>
          <dl className="bill-totals">
            <div><dt>Cash counted</dt><dd>{formatMoney(closing.countedCash)}</dd></div>
            <div className={closing.difference ? 'bill-due' : ''}><dt>Difference</dt><dd>{formatMoney(closing.difference)}</dd></div>
          </dl>
          <p className="muted small">Closed by {closing.closedBy}.{closing.note ? ` ${closing.note}` : ''} Later corrections appear on the day they are made.</p>
        </> : <div className="form">
          <div className="grid-2">
            <Field label="Cash counted (₹)"><input className="input" inputMode="decimal" value={countedText} onChange={e => setCountedText(e.target.value)} /></Field>
            <StaffField w={w} value={by} onChange={setBy} label="Closed by" />
          </div>
          {counted !== null && counted !== summary.collected.cash && <p className="note note-warn">{formatMoney(Math.abs(counted - summary.collected.cash))} {counted > summary.collected.cash ? 'more' : 'less'} than recorded. Closing keeps this difference on record.</p>}
          <Field label="Note (optional)"><input className="input" value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></Field>
          <FormError error={error} />
          <button className="btn btn-primary btn-block" onClick={close}>Close the day</button>
          <p className="muted small">Once closed, no new entries can be added to this day and its totals stay fixed.</p>
        </div>}
      </section>
      {unclosedEarlier.length > 0 && <section className="card"><h2 className="card-title">Not closed yet</h2><ul className="mini-list">{unclosedEarlier.slice(-5).map(d => <li key={d}><button onClick={() => setDate(d)}>{dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</button></li>)}</ul></section>}
    </aside>
  </div>;
}

function BillsTab({ w }: { w: Workspace }) {
  const [q, setQ] = useState('');
  const [days, setDays] = useState<'30' | 'all'>('30');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const from = days === 'all' ? '' : addDays(w.now.date, -30);
    return w.bills.filter(b => b.date >= from && (!term || [w.patient(b.patientId)?.name, b.number, ...b.lines.map(l => l.description)].some(s => s?.toLowerCase().includes(term))))
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  }, [w, q, days]);
  return <section className="card card-flush">
    <div className="card-pad row-between">
      <div className="search"><Search size={16} /><input className="input" type="search" placeholder="Search patient, bill number or item" value={q} onChange={e => setQ(e.target.value)} aria-label="Search bills" /></div>
      <Chips label="Period" size="sm" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: 'all', label: 'All' }]} />
    </div>
    {list.length ? <div className="table billing-table" role="table">
      <div className="tr th" role="row"><span>Date</span><span>Patient</span><span>Items</span><span>Total</span><span>Status</span></div>
      {list.map(b => {
        const row = patientAccount(w.bills.filter(x => x.patientId === b.patientId), w.ledger.filter(e => e.patientId === b.patientId)).byBill.get(b.id);
        const p = w.patient(b.patientId);
        return <button key={b.id} className="tr" role="row" onClick={() => w.openBill(b.id)}>
          <span className="td-date">{dateLabel(b.date, { day: 'numeric', month: 'short' })}</span>
          <span className="td-who"><Avatar name={p?.name || '?'} size="sm" />{p?.name || 'Patient removed'}</span>
          <span className="td-main"><strong>{b.lines.map(l => l.description).join(', ')}</strong><small>{billLabel(b)}</small></span>
          <span className="td-muted">{formatMoney(b.total)}</span>
          <span>{b.status === 'void' ? <Status status="cancelled">Void</Status> : row?.due ? <Status status="late">{formatMoney(row.due)} due</Status> : <Status status="completed">Paid</Status>}</span>
        </button>;
      })}
    </div> : <Empty icon={<IndianRupee size={22} />} title={q ? 'No matches' : 'No bills yet'}>Make one from Today’s queue, a patient’s page, or press <kbd className="kbd">B</kbd>.</Empty>}
  </section>;
}
