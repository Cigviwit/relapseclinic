"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClinicForm } from "@/components/clinic-forms";
import { Field } from "@/components/kit";
import { authService } from "@/lib/auth-service";

export default function AdminCreateClinic({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return <div className="form">
    <fieldset className="fs"><legend>Clinic login</legend>
      <p className="muted">Each clinic gets its own email and password. Share them directly with the clinic.</p>
      <div className="grid-2">
        <Field label="Login email"><input className="input" type="email" required value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <Field label="Temporary password" hint="At least 6 characters."><input className="input" type="password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} /></Field>
      </div>
    </fieldset>
    <ClinicForm busy={busy} onSave={async clinic => {
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
    }} />
  </div>;
}
