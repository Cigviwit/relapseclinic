import { useState, type FormEvent } from "react";
import type { MultiFactorResolver } from "firebase/auth";
import { CalendarCheck2, FileText, MessageCircle } from "lucide-react";
import { authService, TwoStepRequired } from "@/lib/auth-service";
import { Logo } from "@/components/logo";

export default function AuthView({ error: outerError }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(""); setNotice("");
    try {
      if (resolver) await authService.finishTwoStep(resolver, code);
      else await authService.signIn({ email, password, rememberMe });
    } catch (cause) {
      if (cause instanceof TwoStepRequired) setResolver(cause.resolver);
      else setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }
  async function forgot() {
    setError(""); setNotice("");
    if (!email.includes("@")) { setError("Enter your email first, then choose Forgot password."); return; }
    // The same message either way, so this form cannot be used to find out who has a login.
    await authService.sendPasswordReset(email).catch(() => {});
    setNotice("If that email has a login, a link to reset the password is on its way.");
  }

  const shownError = error || outerError;
  return <div className="auth">
    <section className="auth-side" aria-hidden>
      <Logo light />
      <div className="auth-pitch">
        <h2>Your dental clinic, without the chaos.</h2>
        <ul>
          <li><CalendarCheck2 size={18} />Book in seconds with live free slots</li>
          <li><FileText size={18} />Write a prescription and send it on WhatsApp</li>
          <li><MessageCircle size={18} />Automatic reminders and missed-visit follow-ups</li>
        </ul>
      </div>
    </section>
    <main className="auth-main">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mobile-logo"><Logo /></div>
        <h1>Sign in</h1>
        <p className="muted">{resolver ? "Enter the code from your authenticator app." : "Use the login your clinic gave you."}</p>
        {shownError && <div className="note note-error" role="alert">{shownError}</div>}
        {notice && <div className="note note-info" role="status">{notice}</div>}
        {resolver
          ? <label className="field"><span className="field-label">6-digit code</span><input className="input input-lg" autoFocus inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} /></label>
          : <>
            <label className="field"><span className="field-label">Email</span><input className="input input-lg" id="login-email" type="email" required autoFocus autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label className="field"><span className="field-label">Password</span><input className="input input-lg" id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /><span>Keep me signed in on this computer</span></label>
          </>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>{loading ? "Signing in…" : resolver ? "Continue" : "Sign in"}</button>
        {!resolver && <button type="button" className="btn-link" onClick={() => void forgot()}>Forgot password?</button>}
      </form>
    </main>
  </div>;
}
