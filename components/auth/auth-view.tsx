"use client";

import { useState, type FormEvent } from "react";
import { HeartPulse, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { authService } from "@/lib/auth-service";

export default function AuthView() {
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
      toast.success("Signed in successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="auth-container"><div className="auth-card">
    <div className="auth-brand"><span className="auth-brand-icon"><HeartPulse size={26}/></span><h1>RelapseClinic<span className="brand-dot">.</span></h1></div>
    <p className="auth-subtitle">Connected clinic scheduling & WhatsApp follow-up workspace</p>
    <div className="auth-tabs" role="tablist" aria-label="Account type">
      <button type="button" role="tab" aria-selected={mode === "clinic"} className={mode === "clinic" ? "auth-tab active" : "auth-tab"} onClick={() => { setMode("clinic"); setError(""); }}>Clinic login</button>
      <button type="button" role="tab" aria-selected={mode === "admin"} className={mode === "admin" ? "auth-tab active" : "auth-tab"} onClick={() => { setMode("admin"); setError(""); }}><ShieldCheck size={16}/>Admin login</button>
    </div>
    {error && <div className="auth-error-banner" role="alert">{error}</div>}
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-field"><label htmlFor="login-email"><Mail size={15}/> Email address</label><Input id="login-email" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></div>
      <div className="auth-field"><label htmlFor="login-password"><Lock size={15}/> Password</label><Input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
      <div className="auth-checkbox-row"><label className="auth-remember-label"><Checkbox checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)}/><span>Remember me on this browser</span></label></div>
      <button type="submit" className="primary auth-submit-btn" disabled={loading}>{loading ? "Signing in…" : mode === "admin" ? "Sign in as admin" : "Sign in to clinic"}</button>
    </form>
  </div></div>;
}
