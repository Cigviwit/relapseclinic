"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClinicForm } from "@/components/clinic-forms";
import { Input } from "@/components/ui/input";
import { authService } from "@/lib/auth-service";

export default function AdminCreateClinic({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return <div className="form-stack">
    <h2>Clinic account</h2>
    <p className="muted">Give each clinic its own email and password. Share these credentials directly with that clinic.</p>
    <label className="auth-field">Clinic login email<Input type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
    <label className="auth-field">Temporary password<Input type="password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)}/></label>
    <div aria-busy={busy}><ClinicForm onSave={async clinic => {
      if (!email.includes("@") || password.length < 6) { toast.error("Enter a clinic email and a password of at least 6 characters."); return; }
      if (busy) return;
      setBusy(true);
      try {
        await authService.createClinicAccount(clinic, email, password);
        toast.success("Clinic account created.");
        setEmail(""); setPassword(""); onCreated();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not create clinic account.");
      } finally { setBusy(false); }
    }}/></div>
  </div>;
}
