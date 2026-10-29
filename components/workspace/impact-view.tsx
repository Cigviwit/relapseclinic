"use client";
import { useState } from 'react';
import { addDays } from '@/lib/clinic';
import { computeImpact } from '@/lib/impact';
import { Chips } from '../kit';
import type { Workspace } from './types';

const slotName: Record<string, string> = { booked: 'Booking confirmations', two_days_before: '2-day reminders', appointment_day: 'Appointment-day reminders', missed_day_one: 'Missed-visit follow-ups', missed_day_seven: 'Seven-day follow-ups' };

export default function ImpactView({ w }: { w: Workspace }) {
  const [days, setDays] = useState<'30' | '90' | 'all'>('30');
  const [fee, setFee] = useState(() => { try { return localStorage.getItem('impactVisitFee') || ''; } catch { return ''; } });
  const from = days === 'all' ? undefined : addDays(w.now.date, -Number(days));
  const impact = computeImpact(w.appointments, w.deliveries, from ? { from, to: w.now.date } : undefined);
  const max = Math.max(1, ...Object.values(impact.messagesBySlot));
  const feeNum = Number(fee) || 0;
  return <div className="page">
    <header className="page-head"><div><p className="eyebrow">{w.clinic.name}</p><h1>Impact</h1></div>
      <Chips label="Period" size="sm" value={days} onChange={setDays} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }]} /></header>
    <p className="lede">A missed visit counts as recovered when the patient got a follow-up and has a later booked or completed visit.</p>
    <div className="stats stats-4">
      <div className="stat"><span>Messages sent</span><strong>{impact.messagesSent}</strong><small>accepted by WhatsApp provider</small></div>
      <div className="stat"><span>Missed visits followed up</span><strong>{impact.followedUp}<em> / {impact.missedVisits}</em></strong><small>got a WhatsApp message</small></div>
      <div className="stat"><span>Rebooked</span><strong>{impact.rebooked}</strong><small>patient has a later visit</small></div>
      <div className="stat stat-accent"><span>Recovered visits</span><strong>{impact.recoveredVisits}</strong><small>{Math.round(impact.recoveryRate * 100)}% of missed visits</small></div>
    </div>
    <div className="split split-even">
      <section className="card"><h2 className="card-title">Messages by type</h2>
        <ul className="bars">{Object.entries(slotName).map(([k, l]) => <li key={k}><span>{l}</span><span className="bar"><i style={{ width: `${((impact.messagesBySlot[k] || 0) / max) * 100}%` }} /></span><strong>{impact.messagesBySlot[k] || 0}</strong></li>)}</ul>
      </section>
      <section className="card"><h2 className="card-title">Recovered revenue</h2>
        <label className="field"><span className="field-label">Average fee per visit (₹)</span><input className="input" inputMode="numeric" value={fee} placeholder="e.g. 500" onChange={e => { const v = e.target.value.replace(/\D/g, ''); setFee(v); try { localStorage.setItem('impactVisitFee', v); } catch { /* storage unavailable */ } }} /></label>
        <p className="big-number">{feeNum ? `₹${(impact.recoveredVisits * feeNum).toLocaleString('en-IN')}` : '—'}</p>
        <small className="muted">{impact.recoveredVisits} recovered visit{impact.recoveredVisits === 1 ? '' : 's'} × your average fee</small>
      </section>
    </div>
  </div>;
}
