import type { Appointment, Clinic, Patient } from './clinic';

/**
 * ClinicLoop records money; it never moves it. Patients pay the clinic directly
 * (cash, card machine, the clinic's own UPI) and staff record what happened.
 *
 * All amounts are whole paise. Bills and ledger entries are never edited or deleted:
 * a wrong bill is voided, a wrong entry is reversed by a new entry dated the day the
 * correction was made, so a closed day's totals never change.
 */
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'other';
export const paymentMethods: { value: PaymentMethod; label: string }[] = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'other', label: 'Other' }];
export const methodLabel = (m: PaymentMethod) => paymentMethods.find(x => x.value === m)?.label || m;

export type FeeItem = { id: string; name: string; price: number; taxRate?: number };
export type BillingSettings = { fees: FeeItem[]; upiId?: string; upiName?: string; gstEnabled?: boolean; gstin?: string };
export type BillLine = { id: string; description: string; qty: number; unitPrice: number; taxRate: number };
export type Bill = {
  id: string; clinicId: string; patientId: string; doctorId: string; appointmentId?: string; date: string;
  lines: BillLine[]; subtotal: number; discount: number; tax: number; total: number; note?: string;
  /** Assigned by the server once the bill syncs, so offline devices can never reuse a number. */
  number?: string;
  status: 'active' | 'void'; voidReason?: string; voidedOn?: string; voidedBy?: string;
  createdBy: string; createdAt: string;
};
export type LedgerEntry = {
  id: string; clinicId: string; patientId: string; kind: 'payment' | 'refund' | 'reversal';
  /** A payment with no bill is an advance. Refunds never have one: they come out of credit. */
  billId?: string; method: PaymentMethod; amount: number; date: string; reference?: string; note?: string;
  reverses?: string; reversesKind?: 'payment' | 'refund';
  collectedBy: string; createdAt: string;
};
export type DayClosing = {
  id: string; clinicId: string; date: string; collected: Record<PaymentMethod, number>; billed: number;
  countedCash: number; difference: number; note?: string; closedBy: string; closedAt: string;
};

export const MAX_AMOUNT = 1_000_000_000; // ₹1 crore, to catch a slipped decimal point

export function formatMoney(paise: number) {
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(paise);
  return `${sign}₹${(abs / 100).toLocaleString('en-IN', { minimumFractionDigits: abs % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** "1,500.50" becomes 150050. Works on the digits so floating point cannot lose a paisa. */
export function parseRupees(text: string) {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error('Enter an amount in rupees, such as 500 or 499.50.');
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export const rupeesText = (paise: number) => paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100);

export function billTotals(lines: Pick<BillLine, 'qty' | 'unitPrice' | 'taxRate'>[], discount: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  // The discount is shared across lines by value, so tax is charged on what is actually paid.
  const payable = subtotal ? (subtotal - Math.min(discount, subtotal)) / subtotal : 0;
  const tax = lines.reduce((sum, l) => sum + Math.round(l.qty * l.unitPrice * payable * l.taxRate / 100), 0);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export function validateBill(b: Bill) {
  if (!b.patientId) throw new Error('Choose the patient first.');
  if (!b.doctorId) throw new Error('Choose the doctor.');
  if (!b.lines.length) throw new Error('Add at least one item to the bill.');
  for (const l of b.lines) {
    if (!l.description.trim()) throw new Error('Every item needs a description.');
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 999) throw new Error(`Check the quantity for ${l.description}.`);
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new Error(`Check the price for ${l.description}.`);
    if (!(l.taxRate >= 0 && l.taxRate <= 100)) throw new Error(`Check the GST rate for ${l.description}.`);
  }
  if (b.discount < 0 || b.discount > b.subtotal) throw new Error('The discount cannot be more than the bill.');
  if (b.total > MAX_AMOUNT) throw new Error('This bill is too large. Check the amounts.');
  if (!b.createdBy.trim()) throw new Error('Enter who is making this bill.');
}

export function validateEntry(e: LedgerEntry, account?: PatientAccount) {
  if (!e.patientId) throw new Error('Choose the patient first.');
  if (!Number.isInteger(e.amount) || e.amount <= 0) throw new Error('Enter an amount above zero.');
  if (e.amount > MAX_AMOUNT) throw new Error('This amount is too large. Check it and try again.');
  if (!e.collectedBy.trim()) throw new Error('Enter your name so the day’s collection can be checked.');
  if (e.kind === 'refund' && e.billId) throw new Error('Refunds come out of the patient’s credit.');
  if (e.kind === 'refund' && account && e.amount > account.credit) throw new Error(`Only ${formatMoney(account.credit)} of credit is available to refund.`);
}

/** Money in is positive. A reversal cancels the original on the day it was corrected. */
export function signedAmount(e: LedgerEntry) {
  if (e.kind === 'payment') return e.amount;
  if (e.kind === 'refund') return -e.amount;
  return e.reversesKind === 'refund' ? e.amount : -e.amount;
}
export const reversedIds = (entries: LedgerEntry[]) => new Set(entries.filter(e => e.kind === 'reversal').map(e => e.reverses));
export function reversalOf(e: LedgerEntry, date: string, by: string, note: string): LedgerEntry {
  if (e.kind === 'reversal') throw new Error('A correction cannot be reversed. Record the payment again instead.');
  return { id: 'rev_' + e.id, clinicId: e.clinicId, patientId: e.patientId, kind: 'reversal', method: e.method, amount: e.amount, date, note, reverses: e.id, reversesKind: e.kind, collectedBy: by, createdAt: new Date().toISOString(), ...(e.billId ? { billId: e.billId } : {}) };
}

export type BillBalance = { paid: number; due: number };
export type PatientAccount = { billed: number; paid: number; balance: number; due: number; credit: number; byBill: Map<string, BillBalance> };

/**
 * One patient's account. Money marked for a bill goes to that bill first. Everything else
 * (advances, overpayments, money from voided bills) pays the oldest open bills, and what is
 * left over is credit. Allocation is worked out here and never stored, so voiding a bill or
 * reversing a payment needs no follow-up writes.
 */
export function patientAccount(bills: Bill[], entries: LedgerEntry[]): PatientAccount {
  const open = bills.filter(b => b.status === 'active').sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  const reversed = reversedIds(entries);
  const live = entries.filter(e => e.kind !== 'reversal' && !reversed.has(e.id));
  const openIds = new Set(open.map(b => b.id));
  const direct = new Map<string, number>();
  let pool = 0;
  for (const e of live) {
    if (e.billId && e.kind === 'payment' && openIds.has(e.billId)) direct.set(e.billId, (direct.get(e.billId) || 0) + e.amount);
    else pool += signedAmount(e);
  }
  const byBill = new Map<string, BillBalance>();
  for (const b of open) {
    const given = direct.get(b.id) || 0;
    const paid = Math.min(given, b.total);
    pool += given - paid;
    byBill.set(b.id, { paid, due: b.total - paid });
  }
  for (const b of open) {
    const row = byBill.get(b.id)!;
    const used = Math.max(0, Math.min(pool, row.due));
    row.paid += used; row.due -= used; pool -= used;
  }
  // A reversed advance can leave the pool negative: take it back from the newest bills.
  for (const b of [...open].reverse()) {
    if (pool >= 0) break;
    const row = byBill.get(b.id)!;
    const back = Math.min(-pool, row.paid);
    row.paid -= back; row.due += back; pool += back;
  }
  const billed = open.reduce((sum, b) => sum + b.total, 0);
  const paid = live.reduce((sum, e) => sum + signedAmount(e), 0);
  const balance = billed - paid;
  return { billed, paid, balance, due: Math.max(balance, 0), credit: Math.max(-balance, 0), byBill };
}

export type DueRow = { patientId: string; due: number; since: string; bills: number };
/** Patients who owe money, largest first. */
export function duesList(bills: Bill[], entries: LedgerEntry[]): DueRow[] {
  const ids = new Set(bills.map(b => b.patientId));
  const rows: DueRow[] = [];
  for (const patientId of ids) {
    const mine = bills.filter(b => b.patientId === patientId);
    const account = patientAccount(mine, entries.filter(e => e.patientId === patientId));
    if (account.due <= 0) continue;
    const unpaid = mine.filter(b => (account.byBill.get(b.id)?.due || 0) > 0).sort((a, b) => a.date.localeCompare(b.date));
    rows.push({ patientId, due: account.due, since: unpaid[0]?.date || '', bills: unpaid.length });
  }
  return rows.sort((a, b) => b.due - a.due);
}

export const closingId = (clinicId: string, date: string) => `${clinicId}_${date}`;
export type DaySummary = { collected: Record<PaymentMethod, number>; total: number; billed: number; entries: LedgerEntry[] };
/** What the drawer and bank should show for one day: every entry counts on the date it was recorded. */
export function daySummary(date: string, bills: Bill[], entries: LedgerEntry[]): DaySummary {
  const collected: Record<PaymentMethod, number> = { cash: 0, upi: 0, card: 0, other: 0 };
  const dayEntries = entries.filter(e => e.date === date);
  for (const e of dayEntries) collected[e.method] += signedAmount(e);
  const billed = bills.reduce((sum, b) => sum + (b.date === date ? b.total : 0) - (b.status === 'void' && b.voidedOn === date ? b.total : 0), 0);
  return { collected, total: Object.values(collected).reduce((a, b) => a + b, 0), billed, entries: dayEntries };
}
export function makeClosing(clinicId: string, date: string, summary: DaySummary, countedCash: number, closedBy: string, note: string): DayClosing {
  return { id: closingId(clinicId, date), clinicId, date, collected: summary.collected, billed: summary.billed, countedCash, difference: countedCash - summary.collected.cash, closedBy, closedAt: new Date().toISOString(), ...(note ? { note } : {}) };
}

export function collectedBetween(entries: LedgerEntry[], from: string | undefined, to: string) {
  return entries.reduce((sum, e) => sum + ((!from || e.date >= from) && e.date <= to ? signedAmount(e) : 0), 0);
}

/**
 * Money actually collected from recovered patients: for each missed visit that got a follow-up,
 * what was paid on the bill for the patient's next completed visit. Each return visit counts once.
 */
export function recoveredRevenue(appointments: Appointment[], deliveries: { appointmentId: string; slot: string; status: string }[], bills: Bill[], entries: LedgerEntry[], from: string | undefined, to: string) {
  const followedUp = new Set(deliveries.filter(d => d.status === 'accepted' && d.slot.startsWith('missed_')).map(d => d.appointmentId));
  const returnVisits = new Set<string>();
  for (const m of appointments) {
    if (m.status !== 'missed' || !followedUp.has(m.id) || (from && m.date < from) || m.date > to) continue;
    const next = appointments.filter(a => a.patientId === m.patientId && a.status === 'completed' && a.date > m.date).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    if (next) returnVisits.add(next.id);
  }
  let amount = 0;
  for (const b of bills) {
    if (!b.appointmentId || !returnVisits.has(b.appointmentId) || b.status !== 'active') continue;
    amount += patientAccount(bills.filter(x => x.patientId === b.patientId), entries.filter(e => e.patientId === b.patientId)).byBill.get(b.id)?.paid || 0;
  }
  return { amount, visits: returnVisits.size };
}

export const validUpiId = (id: string) => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/.test(id.trim());
/** The standard UPI payment link. The patient's app pays the clinic directly; nothing reports back to us. */
export function upiUri(upiId: string, payeeName: string, amount: number, note: string) {
  const q = (s: string) => encodeURIComponent(s).replace(/'/g, '%27');
  return `upi://pay?pa=${q(upiId.trim())}&pn=${q(payeeName)}&am=${(amount / 100).toFixed(2)}&cu=INR&tn=${q(note.slice(0, 50))}`;
}

export const billLabel = (b: Pick<Bill, 'id' | 'number'>) => b.number || `Provisional ${b.id.slice(0, 6).toUpperCase()}`;
export function billMessage(b: Bill, clinic: Clinic, patient: Patient, balance: BillBalance) {
  const lines = b.lines.map(l => `• ${l.description}${l.qty > 1 ? ` × ${l.qty}` : ''}: ${formatMoney(l.qty * l.unitPrice)}`);
  return [`Hello ${patient.name}, here is your bill from ${clinic.name}.`, '', `Bill ${billLabel(b)}`, ...lines,
    ...(b.discount ? [`Discount: −${formatMoney(b.discount)}`] : []), ...(b.tax ? [`GST: ${formatMoney(b.tax)}`] : []),
    `Total: ${formatMoney(b.total)}`, `Paid: ${formatMoney(balance.paid)}`, ...(balance.due ? [`Balance due: ${formatMoney(balance.due)}`] : []),
    '', `For any questions, please call ${clinic.phone}.`].join('\n');
}
