import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BarChart3, CalendarDays, CalendarPlus, FileText, Home, IndianRupee, LogOut, MessageCircle, Search, Settings, Users } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { type Appointment, type Clinic, type Database, type Patient, clockLabel, initials, validateAppointment, zonedNow } from '@/lib/clinic';
import { firestoreRepository, type ClinicData, type DoctorDigestDelivery, type MessageDelivery, type Repository } from '@/lib/firestore-repository';
import { createDemoRepository, demoAccount, isDemoMode } from '@/lib/demo-repository';
import { historyStart, mergeById } from '@/lib/data-window';
import { permissionsFor, roleLabel } from '@/lib/permissions';
import { IdleLock } from './idle-lock';
import { authService, getAccount, type Account } from '@/lib/auth-service';
import { blankPrescription, currentPrescriptions, repeatPrescription, withDefaults, type Prescription } from '@/lib/prescription';
import { unresolvedVisits } from '@/lib/unresolved';
import type { Bill, DayClosing, LedgerEntry } from '@/lib/billing';
import AuthView from '@/components/auth/auth-view';
import { Logo } from '@/components/logo';
import { Kbd, Modal, Select } from '@/components/kit';
import { AppointmentForm, PatientForm } from '@/components/clinic-forms';
import TodayView from '@/components/workspace/today-view';
import PatientsView from '@/components/workspace/patients-view';
import AppointmentDrawer from '@/components/workspace/appointment-drawer';
import type { BillOptions, BookOptions, Page, RxOptions, Workspace } from '@/components/workspace/types';

// Less-used screens load on demand so the first paint stays small.
const ScheduleView = lazy(() => import('@/components/workspace/schedule-view'));
const ImpactView = lazy(() => import('@/components/workspace/impact-view'));
const BillingView = lazy(() => import('@/components/workspace/billing-view'));
const BillEditor = lazy(() => import('@/components/billing/bill-editor'));
const BillDetail = lazy(() => import('@/components/billing/bill-detail'));
const SettingsView = lazy(() => import('@/components/workspace/settings-view'));
const PrescriptionBuilder = lazy(() => import('@/components/prescription/prescription-builder'));
const CommandPalette = lazy(() => import('@/components/workspace/command-palette'));
const AdminCreateClinic = lazy(() => import('@/components/auth/admin-create-clinic'));
const RecordsViews = { Prescriptions: lazy(() => import('@/components/workspace/records-views').then(m => ({ default: m.PrescriptionsView }))), Messages: lazy(() => import('@/components/workspace/records-views').then(m => ({ default: m.MessagesView }))) };

const pages: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <Home size={19} /> },
  { id: 'schedule', label: 'Schedule', icon: <CalendarDays size={19} /> },
  { id: 'patients', label: 'Patients', icon: <Users size={19} /> },
  { id: 'billing', label: 'Billing', icon: <IndianRupee size={19} /> },
  { id: 'rx', label: 'Prescriptions', icon: <FileText size={19} /> },
  { id: 'messages', label: 'Messages', icon: <MessageCircle size={19} /> },
  { id: 'impact', label: 'Impact', icon: <BarChart3 size={19} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={19} /> },
];
// The page lives in the URL hash (#patients/<id>) so refresh and back/forward keep your place.
const subscribeHash = (fn: () => void) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };
const useHash = () => useSyncExternalStore(subscribeHash, () => location.hash, () => '');
const setHash = (p: Page, id?: string) => { location.hash = '#' + p + (id ? '/' + id : ''); };
const noSubscribe = () => () => {};
const PATIENT_SAVE_WAIT_MS = 4000;

function Splash({ text }: { text: string }) {
  return <div className="splash"><Logo /><div className="splash-bar"><i /></div><p>{text}</p></div>;
}

export default function ClinicApp() {
  const demo = useSyncExternalStore(noSubscribe, isDemoMode, () => false);
  const repo = useMemo<Repository>(() => demo ? createDemoRepository() : firestoreRepository, [demo]);
  const [signedIn, setAccount] = useState<Account | null>(null);
  const [authPending, setAuthChecking] = useState(true);
  const account = useMemo(() => demo ? demoAccount() : signedIn, [demo, signedIn]);
  const authChecking = !demo && authPending;
  const [clinics, setClinics] = useState<Clinic[] | null>(null);
  const [clinicData, setClinicData] = useState<{ clinicId: string; data: ClinicData } | null>(null);
  const [olderAppointments, setOlderAppointments] = useState<Appointment[]>([]);
  const [deliveries, setDeliveries] = useState<MessageDelivery[]>([]);
  const [digests, setDigests] = useState<DoctorDigestDelivery[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [closings, setClosings] = useState<DayClosing[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState(() => { try { return localStorage.getItem('activeClinic') || ''; } catch { return ''; } });
  const [hashPage, hashId] = useHash().slice(1).split('/');
  const patientId = hashId || null;
  const [scheduleDate, setScheduleDate] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [booking, setBooking] = useState<BookOptions | null>(null);
  const [patientModal, setPatientModal] = useState<{ item?: Patient } | null>(null);
  const [clinicModal, setClinicModal] = useState(false);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [rxDraft, setRxDraft] = useState<Prescription | null>(null);
  const [billDraft, setBillDraft] = useState<BillOptions | null>(null);
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  const [confirmBox, setConfirmBox] = useState<{ title: string; body: string; action: () => void; danger?: boolean; cta?: string } | null>(null);
  const [palette, setPalette] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (demo) return;
    return authService.subscribeAuthState(async user => {
      if (!user) { setAccount(null); setClinics(null); setClinicData(null); setAuthChecking(false); return; }
      try { setAccount(await getAccount(user)); setLoadError(''); }
      catch (error) { setLoadError((error as Error).message); setAccount(null); }
      finally { setAuthChecking(false); }
    });
  }, [demo]);

  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    const unsub = repo.subscribeClinics(account, setClinics, e => setLoadError(e.message));
    return () => { unsub(); clearInterval(timer); };
  }, [account, repo]);

  const clinic = clinics ? clinics.find(c => c.id === (account?.role === 'platform' ? selectedClinicId : account?.clinicId)) || (account?.role === 'platform' ? clinics[0] : undefined) : undefined;
  const clinicId = clinic?.id || '';
  const now = clinic ? zonedNow(clinic.timezone) : { date: '', time: '' };
  const can = useMemo(() => permissionsFor(account?.role || 'billing'), [account?.role]);
  const rxOn = clinic?.prescriptionsEnabled === true && can.readRx;
  const billingOn = clinic?.billingEnabled === true && can.readBilling;
  const navPages = pages.filter(p => (p.id !== 'rx' || rxOn) && (p.id !== 'billing' || billingOn));
  const page = (navPages.some(p => p.id === hashPage) ? hashPage : 'today') as Page;
  // Fixed for the session, so the live listeners are not rebuilt as the clock ticks.
  const from = useMemo(() => clinicId && clinic ? historyStart(zonedNow(clinic.timezone).date) : '', [clinicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadedRanges = useRef(new Set<string>());
  // Only the clinic on screen is listened to, including for the platform administrator.
  useEffect(() => {
    if (!clinicId || !from) return;
    const onError = (e: Error) => setLoadError(e.message);
    const unsubs = [
      repo.subscribeClinicData(clinicId, from, data => { setClinicData({ clinicId, data }); setLoadError(''); }, onError),
      repo.subscribeDeliveries(clinicId, from, setDeliveries, onError),
      repo.subscribeDoctorDigests(clinicId, from, setDigests, onError),
    ];
    const ranges = loadedRanges.current;
    return () => { unsubs.forEach(u => u()); setOlderAppointments([]); ranges.clear(); };
  }, [repo, clinicId, from]);
  useEffect(() => {
    if (!clinicId || !from || !rxOn) { setPrescriptions([]); return; }
    return repo.subscribePrescriptions(clinicId, from, setPrescriptions, e => console.warn('Prescriptions unavailable:', e.message));
  }, [repo, clinicId, from, rxOn]);
  useEffect(() => {
    if (!clinicId || !billingOn) { setBills([]); setLedger([]); setClosings([]); return; }
    const onError = (e: Error) => console.warn('Billing unavailable:', e.message);
    const unsubs = [repo.subscribeBills(clinicId, setBills, onError), repo.subscribeLedger(clinicId, setLedger, onError), repo.subscribeDayClosings(clinicId, setClosings, onError)];
    return () => unsubs.forEach(u => u());
  }, [repo, clinicId, billingOn]);

  const loadRange = useCallback((rangeFrom: string, rangeTo: string) => {
    if (!clinicId || !from || rangeFrom >= from) return;
    const key = `${rangeFrom}_${rangeTo}`;
    if (loadedRanges.current.has(key)) return;
    loadedRanges.current.add(key);
    repo.loadAppointments(clinicId, rangeFrom, rangeTo).then(list => setOlderAppointments(x => mergeById(x, list))).catch(e => { loadedRanges.current.delete(key); toast.error((e as Error).message); });
  }, [repo, clinicId, from]);

  const live = clinicData && clinicData.clinicId === clinicId ? clinicData.data : null;
  const db = useMemo<Database | null>(() => clinics && (live || !clinicId) ? { version: 1, activeClinicId: clinicId, clinics, patients: live?.patients || [], appointments: mergeById(olderAppointments, live?.appointments || []), reminders: live?.reminders || [] } : null, [clinics, live, clinicId, olderAppointments]);
  // Booking waits for a patient added moments earlier in the same form.
  const patientSave = useRef<Promise<unknown>>(Promise.resolve());

  const scoped = useMemo(() => {
    if (!db || !clinic) return null;
    const patients = db.patients.filter(p => p.clinicId === clinic.id);
    const byId = new Map(patients.map(p => [p.id, p]));
    const doctors = new Map(clinic.doctors.map(d => [d.id, d]));
    return {
      patients, byId, doctors,
      appointments: db.appointments.filter(a => a.clinicId === clinic.id),
      deliveries: deliveries.filter(d => d.clinicId === clinic.id),
      digests: digests.filter(d => d.clinicId === clinic.id),
      prescriptions: rxOn ? currentPrescriptions(prescriptions.filter(r => r.clinicId === clinic.id).map(withDefaults)) : [],
      bills: bills.filter(b => b.clinicId === clinic.id),
      ledger: ledger.filter(e => e.clinicId === clinic.id),
      closings: closings.filter(c => c.clinicId === clinic.id),
    };
  }, [db, clinic, rxOn, deliveries, digests, prescriptions, bills, ledger, closings]);

  const go = (p: Page, pid?: string) => { setHash(p, pid); setDetail(null); };

  // Single-key shortcuts for the front desk; ignored while typing or when a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A locked screen must not open anything on top of itself.
      if (document.querySelector('.lock-screen[open]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return; }
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input,textarea,select,[contenteditable]') || document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === '/') { e.preventDefault(); setPalette(true); }
      else if (k === 'n') { e.preventDefault(); setBooking({}); }
      else if (k === 'p') { e.preventDefault(); setPatientModal({}); }
      else if (k === 'r' && clinic && rxOn && can.writeRx) { e.preventDefault(); setRxDraft(blankPrescription(clinic, now.date, '', account?.doctorId || '')); }
      else if (k === 'b' && billingOn && can.writeBilling) { e.preventDefault(); setBillDraft({}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clinic, now.date, billingOn, rxOn, can, account?.doctorId]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (t: unknown, o: unknown) => void } }).modelContext;
    if (!context) return;
    const controller = new AbortController();
    try {
      Promise.resolve(context.registerTool({ name: 'navigate_clinic_workspace', title: 'Open clinic workspace section', description: 'Navigate to a section of the clinic workspace. Does not create records.',
        inputSchema: { type: 'object', properties: { section: { type: 'string', enum: pages.map(p => p.id) } }, required: ['section'], additionalProperties: false }, annotations: { readOnlyHint: false },
        execute: ({ section }: { section: Page }) => { if (!pages.some(p => p.id === section)) throw new Error('Unknown workspace section'); setHash(section); return { section }; } }, { signal: controller.signal })).catch(() => {});
    } catch { /* not supported */ }
    return () => controller.abort();
  }, []);

  if (authChecking) return <Splash text="Signing you in…" />;
  if (!account) return <><Toaster position="top-center" richColors /><AuthView error={loadError} /></>;
  if (!db && loadError) return <div className="splash" role="alert"><Logo /><p>{loadError}</p><button className="btn btn-outline" onClick={() => authService.signOut()}>Sign out</button></div>;
  if (clinics && !clinic && account.role !== 'platform') return <div className="splash" role="alert"><Logo /><p>This login’s clinic could not be found. Contact your clinic owner.</p><button className="btn btn-outline" onClick={() => authService.signOut()}>Sign out</button></div>;
  if (clinics && !clinic) return <><Toaster position="top-center" richColors /><div className="first-run"><Logo /><h1>Create the first clinic</h1><p className="muted">No clinics yet. Set up a clinic and its owner’s login.</p><Suspense fallback={null}><AdminCreateClinic repo={repo} onCreated={() => {}} /></Suspense><button className="btn btn-ghost" onClick={() => authService.signOut()}>Sign out</button></div></>;
  if (!db || !clinic || !scoped) return <Splash text="Loading your clinic…" />;

  async function setStatus(a: Appointment, status: Appointment['status']) {
    try {
      await repo.setAppointmentStatus(a.id, status);
      // Visits loaded from further back are not live, so the copy on screen is updated by hand.
      setOlderAppointments(list => list.map(x => x.id === a.id ? { ...x, status } : x));
      toast.success(status === 'completed' ? `${scoped!.byId.get(a.patientId)?.name || 'Visit'} marked seen` : status === 'missed' ? 'Marked missed — follow-up will be sent if consented' : `Appointment ${status}`);
    } catch (e) { toast.error((e as Error).message); }
  }
  /** Waits for the server: only it can say the slot is still free. A refusal stays in the form, which remains open. */
  async function saveAppointment(a: Appointment) {
    validateAppointment(db!, a);
    // Offline, that save never finishes, so wait only briefly: the server gives the clear answer either way.
    await Promise.race([patientSave.current.catch(() => {}), new Promise(resolve => setTimeout(resolve, PATIENT_SAVE_WAIT_MS))]);
    await repo.bookAppointment(a);
    toast.success(`Booked ${scoped!.byId.get(a.patientId)?.name || ''} · ${clockLabel(a.time)}`);
    setBooking(null); setDetail(null);
  }
  function savePatient(p: Patient) {
    const saving = repo.savePatient(p);
    patientSave.current = saving;
    saving.then(() => toast.success('Patient saved')).catch(e => toast.error(e.message));
  }

  const w: Workspace = {
    account, db, clinic, repo, now, doctorFilter, setDoctorFilter, can, rxOn, loadRange,
    patients: scoped.patients, appointments: scoped.appointments, deliveries: scoped.deliveries, digests: scoped.digests, prescriptions: scoped.prescriptions,
    patient: id => scoped.byId.get(id), doctor: id => scoped.doctors.get(id), doctorName: id => scoped.doctors.get(id)?.name || 'Doctor',
    go, book: o => { setDetail(null); setBooking(o || {}); }, openAppointment: setDetail,
    editPatient: p => setPatientModal({ item: p }), savePatient,
    writeRx: (o: RxOptions = {}) => {
      // A doctor writes under their own name, whichever doctor the visit was booked with.
      const own = account.role === 'doctor' ? account.doctorId : '';
      setDetail(null);
      setRxDraft(o.item || (o.repeat ? repeatPrescription(o.repeat, now.date, own || o.doctorId, o.appointmentId) : blankPrescription(clinic, now.date, o.patientId, own || o.doctorId || (doctorFilter !== 'all' ? doctorFilter : '') || account.doctorId, o.appointmentId)));
    },
    billingOn, bills: scoped.bills, ledger: scoped.ledger, closings: scoped.closings,
    newBill: o => { setDetail(null); setBillDraft(o || {}); }, openBill: id => { setDetail(null); setOpenBillId(id); },
    setStatus, confirm: setConfirmBox,
    confirmMissed: a => setConfirmBox({ title: 'Mark as missed?', body: `${scoped.byId.get(a.patientId)?.name || 'The patient'} will get a WhatsApp follow-up now if they consented to messages.`, cta: 'Mark missed', action: () => { void setStatus(a, 'missed'); setDetail(null); } }),
  };

  const issues = scoped.deliveries.filter(d => d.status === 'failed' || d.status === 'unknown').length;
  const pending = unresolvedVisits(scoped.appointments, now.date).length;
  const badge: Partial<Record<Page, number>> = { today: pending, messages: issues };
  const switchClinic = (id: string) => { setSelectedClinicId(id); try { localStorage.setItem('activeClinic', id); } catch { /* ignore */ } setDoctorFilter('all'); setScheduleDate(''); go('today'); };
  const clinicPicker = account.role === 'platform' && db.clinics.length > 1
    ? <Select label="Active clinic" className="clinic-select" value={clinic.id} onChange={switchClinic} options={db.clinics.map(c => ({ value: c.id, label: c.name }))} />
    : <strong className="clinic-name">{clinic.name}</strong>;
  const loading = <div className="page"><div className="skeleton h-title" /><div className="skeleton h-card" /></div>;

  return <><Toaster position="bottom-center" richColors closeButton />{!demo && <IdleLock minutes={clinic.autoLockMinutes} email={account.user.email || ''} name={account.name} />}<div className="app">
    <aside className="side">
      <div className="side-top"><Logo /></div>
      <div className="side-clinic">{clinicPicker}<small>{clinic.address}</small></div>
      <nav className="side-nav" aria-label="Main">{navPages.map(p => <a key={p.id} href={'#' + p.id} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined}>{p.icon}<span>{p.label}</span>{!!badge[p.id] && <em className="badge">{badge[p.id]}</em>}</a>)}</nav>
      <div className="side-help"><p><Kbd>N</Kbd> appointment</p>{rxOn && can.writeRx && <p><Kbd>R</Kbd> prescription</p>}{billingOn && can.writeBilling && <p><Kbd>B</Kbd> bill</p>}<p><Kbd>P</Kbd> patient</p><p><Kbd>/</Kbd> search</p></div>
      <div className="side-user"><span className="avatar t1 avatar-sm">{initials(account.name || 'U')}</span><span className="side-email" title={account.user.email || ''}>{account.name}<br /><small className="muted">{roleLabel(account.role)}</small></span><button className="btn-icon" title="Sign out" aria-label="Sign out" onClick={() => demo ? location.assign(location.origin + location.pathname) : authService.signOut()}><LogOut size={16} /></button></div>
    </aside>

    <div className="main">
      <header className="top">
        <div className="top-mobile-logo"><Logo compact />{clinicPicker}</div>
        <button className="top-search" onClick={() => setPalette(true)}><Search size={16} /><span>Search patients, actions…</span><Kbd>Ctrl K</Kbd></button>
        <div className="top-right">
          <span className="top-clock" title={clinic.timezone}>{clockLabel(now.time)}</span>
          {rxOn && can.writeRx && <button className="btn btn-outline btn-top" onClick={() => w.writeRx()}><FileText size={16} /><span>Prescription</span></button>}
          <button className="btn btn-primary btn-top" onClick={() => w.book()}><CalendarPlus size={16} /><span>Appointment</span></button>
          <a className="btn-icon top-settings" href="#settings" aria-label="Settings"><Settings size={18} /></a>
        </div>
      </header>
      {demo && <div className="demo-banner">Demo mode — sample data in this browser only. Nothing is saved or sent.</div>}
      {loadError && <div className="note note-error top-error" role="alert">{loadError}</div>}
      <main className="content">
        <Suspense fallback={loading}>
          {page === 'today' && <TodayView w={w} />}
          {page === 'schedule' && <ScheduleView w={w} date={scheduleDate || now.date} setDate={setScheduleDate} />}
          {page === 'patients' && <PatientsView w={w} selectedId={patientId && scoped.byId.has(patientId) ? patientId : null} select={id => go('patients', id || undefined)} />}
          {page === 'billing' && <BillingView w={w} />}
          {page === 'rx' && <RecordsViews.Prescriptions w={w} />}
          {page === 'messages' && <RecordsViews.Messages w={w} />}
          {page === 'impact' && <ImpactView w={w} />}
          {page === 'settings' && <SettingsView w={w} demo={demo} onCreateClinic={() => setClinicModal(true)} />}
        </Suspense>
      </main>
    </div>

    <nav className="tabbar" aria-label="Main">{navPages.slice(0, 5).map(p => <a key={p.id} href={'#' + p.id} className={page === p.id ? 'on' : ''}>{p.icon}<span>{p.id === 'rx' ? 'Rx' : p.label}</span>{!!badge[p.id] && <em className="badge">{badge[p.id]}</em>}</a>)}</nav>

    <Modal open={!!booking} onClose={() => setBooking(null)} title={booking?.item?.status === 'scheduled' && scoped.appointments.some(a => a.id === booking.item!.id) ? 'Reschedule appointment' : 'New appointment'} subtitle={clinic.name}>
      {booking && <AppointmentForm db={db} clinic={clinic} date={booking.date || booking.item?.date || now.date} appointment={booking.item} patientId={booking.patientId} doctorId={booking.doctorId || (doctorFilter !== 'all' ? doctorFilter : undefined)} time={booking.time} onSave={saveAppointment} onCreatePatient={savePatient} />}
    </Modal>
    <Modal open={!!patientModal} onClose={() => setPatientModal(null)} title={patientModal?.item ? 'Edit patient' : 'Add patient'}>
      {patientModal && <PatientForm clinicId={clinic.id} patient={patientModal.item} onSave={p => { savePatient(p); setPatientModal(null); if (!patientModal.item) go('patients', p.id); }} />}
    </Modal>
    <Modal open={!!detail} onClose={() => setDetail(null)} title="Appointment" variant="drawer">
      {detail && <AppointmentDrawer w={w} appointment={detail} onClose={() => setDetail(null)} />}
    </Modal>
    <Modal open={clinicModal} onClose={() => setClinicModal(false)} title="Create clinic account" wide>
      {clinicModal && <Suspense fallback={null}><AdminCreateClinic repo={repo} onCreated={() => setClinicModal(false)} /></Suspense>}
    </Modal>
    <Modal open={!!confirmBox} onClose={() => setConfirmBox(null)} title={confirmBox?.title}>
      {confirmBox && <div className="confirm"><p>{confirmBox.body}</p><div className="form-foot"><button className="btn btn-ghost" onClick={() => setConfirmBox(null)}>Keep as is</button><button data-autofocus className={'btn ' + (confirmBox.danger ? 'btn-danger' : 'btn-primary')} onClick={() => { confirmBox.action(); setConfirmBox(null); }}>{confirmBox.cta || 'Confirm'}</button></div></div>}
    </Modal>
    <Modal open={!!billDraft} onClose={() => setBillDraft(null)} title="New bill" subtitle={clinic.name} wide>
      {billDraft && <Suspense fallback={null}><BillEditor w={w} options={billDraft} onSaved={id => { setBillDraft(null); setOpenBillId(id); }} /></Suspense>}
    </Modal>
    <Modal open={!!openBillId} onClose={() => setOpenBillId(null)} title="Bill" wide>
      {openBillId && <Suspense fallback={null}><BillDetail key={openBillId} w={w} billId={openBillId} onClose={() => setOpenBillId(null)} /></Suspense>}
    </Modal>
    <RxDialog open={!!rxDraft}>{rxDraft && <Suspense fallback={<div className="rxb-loading">Opening prescription…</div>}><PrescriptionBuilder key={rxDraft.id} w={w} initial={rxDraft} onClose={() => setRxDraft(null)} /></Suspense>}</RxDialog>
    {palette && <Suspense fallback={null}><CommandPalette w={w} open={palette} onClose={() => setPalette(false)} pages={navPages} /></Suspense>}
  </div></>;
}

/** Full-screen native dialog for the prescription builder (it handles its own close/confirm). */
function RxDialog({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLDialogElement | null>(null);
  useEffect(() => { if (!el) return; if (open && !el.open) el.showModal(); if (!open && el.open) el.close(); }, [open, el]);
  return <dialog ref={setEl} className="dlg dlg-full" onCancel={e => e.preventDefault()}>{children}</dialog>;
}
