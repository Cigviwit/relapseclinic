"use client";

import { useState, type FormEvent } from "react";
import { CalendarCheck2, FileText, MessageCircle, ShieldCheck } from "lucide-react";
import { authService } from "@/lib/auth-service";
import { Logo } from "@/components/logo";

export default function AuthView({ error: outerError }: { error?: string }) {
  const [mode, setMode] = useState<"clinic" | "admin">("clinic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authService.signIn({ email, password, rememberMe, role: mode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  const shownError = error || outerError;
  return <div className="auth">
    <section className="auth-side" aria-hidden>
      <Logo light />
      <div className="auth-pitch">
        <h2>The front desk, without the chaos.</h2>
        <ul>
          <li><CalendarCheck2 size={18} />Book in seconds with live free slots</li>
          <li><FileText size={18} />Write a prescription and send it on WhatsApp</li>
          <li><MessageCircle size={18} />Automatic reminders and missed-visit follow-ups</li>
        </ul>
      </div>
      <small>Your clinic’s data stays private to your clinic account.</small>
    </section>
    <main className="auth-main">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mobile-logo"><Logo /></div>
        <h1>Sign in</h1>
        <p className="muted">{mode === "admin" ? "Administrator access to every clinic." : "Use the login your clinic was given."}</p>
        <div className="seg" role="tablist" aria-label="Account type">
          <button type="button" role="tab" aria-selected={mode === "clinic"} className={mode === "clinic" ? "on" : ""} onClick={() => { setMode("clinic"); setError(""); }}>Clinic</button>
          <button type="button" role="tab" aria-selected={mode === "admin"} className={mode === "admin" ? "on" : ""} onClick={() => { setMode("admin"); setError(""); }}><ShieldCheck size={15} />Admin</button>
        </div>
        {shownError && <div className="note note-error" role="alert">{shownError}</div>}
        <label className="field"><span className="field-label">Email</span><input className="input input-lg" id="login-email" type="email" required autoFocus autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field"><span className="field-label">Password</span><input className="input input-lg" id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /><span>Keep me signed in on this computer</span></label>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  </div>;
}
