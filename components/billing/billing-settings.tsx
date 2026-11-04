import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { parseRupees, rupeesText, validUpiId, type BillingSettings } from '@/lib/billing';
import { Field, FormError } from '../kit';
import type { Workspace } from '../workspace/types';

type FeeRow = { id: string; name: string; price: string; taxRate: string };

export function BillingSettingsForm({ w }: { w: Workspace }) {
  const current = w.clinic.billing;
  const [fees, setFees] = useState<FeeRow[]>(() => (current?.fees || []).map(f => ({ id: f.id, name: f.name, price: rupeesText(f.price), taxRate: String(f.taxRate || 0) })));
  const [upiId, setUpiId] = useState(current?.upiId || '');
  const [upiName, setUpiName] = useState(current?.upiName || w.clinic.name);
  const [gstEnabled, setGstEnabled] = useState(!!current?.gstEnabled);
  const [gstin, setGstin] = useState(current?.gstin || '');
  const [error, setError] = useState('');
  const change = (id: string, patch: Partial<FeeRow>) => setFees(list => list.map(f => f.id === id ? { ...f, ...patch } : f));

  function save() {
    try {
      if (upiId.trim() && !validUpiId(upiId)) throw new Error('Enter a UPI ID such as clinicname@okhdfc.');
      if (gstEnabled && !/^[0-9A-Z]{15}$/.test(gstin.trim().toUpperCase())) throw new Error('A GSTIN has 15 letters and numbers.');
      const billing: BillingSettings = {
        fees: fees.filter(f => f.name.trim()).map(f => {
          const taxRate = Number(f.taxRate) || 0;
          return { id: f.id, name: f.name.trim(), price: parseRupees(f.price), ...(gstEnabled && taxRate ? { taxRate } : {}) };
        }),
        ...(upiId.trim() ? { upiId: upiId.trim(), upiName: upiName.trim() || w.clinic.name } : {}),
        ...(gstEnabled ? { gstEnabled: true, gstin: gstin.trim().toUpperCase() } : {}),
      };
      setError('');
      w.repo.saveClinic({ ...w.clinic, billing }).then(() => toast.success('Billing settings saved')).catch(e => toast.error(e.message));
    } catch (e) { setError((e as Error).message); }
  }

  return <div className="form">
    <h3 className="sec-title">Fee list</h3>
    <div className="bill-rows">
      {fees.map(f => <div className={'bill-row fee-row' + (gstEnabled ? ' has-gst' : '')} key={f.id}>
        <Field label="Service"><input className="input" value={f.name} maxLength={100} onChange={e => change(f.id, { name: e.target.value })} /></Field>
        <Field label="Price (₹)"><input className="input" inputMode="decimal" value={f.price} onChange={e => change(f.id, { price: e.target.value })} /></Field>
        {gstEnabled && <Field label="GST %"><input className="input" inputMode="decimal" value={f.taxRate} onChange={e => change(f.id, { taxRate: e.target.value })} /></Field>}
        <button type="button" className="btn-icon bill-row-x" aria-label={`Remove ${f.name || 'service'}`} onClick={() => setFees(list => list.filter(x => x.id !== f.id))}><Trash2 size={16} /></button>
      </div>)}
      <button type="button" className="btn-link" onClick={() => setFees(list => [...list, { id: crypto.randomUUID(), name: '', price: '', taxRate: '0' }])}><Plus size={14} />Add service</button>
    </div>
    <h3 className="sec-title">UPI QR code</h3>
    <div className="grid-2">
      <Field label="Clinic UPI ID" hint="Money goes straight to this account. A merchant UPI ID is safer than a personal one."><input className="input" value={upiId} placeholder="clinicname@okhdfc" onChange={e => setUpiId(e.target.value)} /></Field>
      <Field label="Name shown to the patient"><input className="input" value={upiName} maxLength={100} onChange={e => setUpiName(e.target.value)} /></Field>
    </div>
    <h3 className="sec-title">GST</h3>
    <label className="check"><input type="checkbox" checked={gstEnabled} onChange={e => setGstEnabled(e.target.checked)} /><span>This clinic charges GST on some items</span></label>
    {gstEnabled && <><Field label="GSTIN"><input className="input" value={gstin} maxLength={15} onChange={e => setGstin(e.target.value)} /></Field>
      <p className="note note-warn">Many clinical services are exempt from GST. Ask your CA which items need it and at what rate before charging it.</p></>}
    <FormError error={error} />
    <div className="form-foot"><button type="button" className="btn btn-primary" onClick={save}>Save billing settings</button></div>
  </div>;
}
