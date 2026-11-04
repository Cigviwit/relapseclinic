import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MultiFactorResolver } from 'firebase/auth';
import { authService, TwoStepRequired } from '@/lib/auth-service';
import { isIdle, lockMinutes, markActive, readLastActive as read } from '@/lib/idle';
import { Logo } from '@/components/logo';
import { Field, FormError } from '@/components/kit';

/**
 * Locks an unattended workspace. The last activity is stored across tabs and reloads, so closing
 * the tab or refreshing does not skip the lock. The page underneath stays in place, so a half-written
 * prescription is still there after unlocking.
 */
export function IdleLock({ minutes, email, name }: { minutes?: number; email: string; name: string }) {
  const limit = lockMinutes(minutes);
  const [locked, setLocked] = useState(() => { const last = read(); return last > 0 && isIdle(last, Date.now(), limit); });
  const lastSeen = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (locked || limit <= 0) return;
    const touch = () => { const t = Date.now(); if (t - lastSeen.current > 5000) { lastSeen.current = t; markActive(t); } };
    touch();
    const events = ['pointerdown', 'keydown', 'scroll', 'pointermove'] as const;
    events.forEach(e => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => { if (isIdle(Math.max(read(), lastSeen.current), Date.now(), limit)) setLocked(true); }, 15000);
    return () => { events.forEach(e => window.removeEventListener(e, touch)); clearInterval(timer); };
  }, [locked, limit]);

  useEffect(() => {
    const d = dialog.current; if (!d) return;
    if (locked && !d.open) d.showModal();
    if (!locked && d.open) d.close();
  }, [locked]);

  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (resolver) await authService.finishTwoStep(resolver, code);
      else await authService.confirmPassword(password);
      markActive(); lastSeen.current = Date.now();
      setPassword(''); setCode(''); setResolver(null); setLocked(false);
    } catch (e) {
      if (e instanceof TwoStepRequired) setResolver(e.resolver);
      else setError((e as Error).message);
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="dlg lock-screen" onCancel={e => e.preventDefault()}>
    {locked && <form className="lock-card" onSubmit={unlock}>
      <Logo />
      <div><h1 className="h-sm">Screen locked</h1><p className="muted">{name} · {email}</p></div>
      {resolver
        ? <Field label="Code from your authenticator app"><input className="input input-lg" autoFocus inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} /></Field>
        : <Field label="Password"><input className="input input-lg" autoFocus type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>}
      <FormError error={error} />
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Checking…' : 'Unlock'}</button>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => void authService.signOut()}>Sign out instead</button>
    </form>}
  </dialog>;
}
