import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { ClinicForm } from "@/components/clinic-forms";
import { Field, FormError } from "@/components/kit";
import type { Repository } from "@/lib/firestore-repository";

// This form usually sits in a modal <dialog>, which covers the toaster, so problems are shown inline, not as toasts.
export default function AdminCreateClinic({ repo, onCreated }: { repo: Repository; onCreated: () => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  if (link) return <div className="form">
    <p className="note note-info"><strong>Clinic created.</strong> Send this link to {ownerName || "the owner"} so they can set their password. Treat it like a password.</p>
    <p className="setup-link">{link}</p>
    {copied && <p className="muted" role="status">{copied}</p>}
    <div className="form-foot"><button type="button" className="btn btn-soft" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied("Link copied."), () => setCopied("Copy the link by hand."))}><Copy size={14} />Copy link</button><button type="button" className="btn btn-primary" onClick={onCreated}>Done</button></div>
  </div>;

  return <div className="form">
    <fieldset className="fs"><legend>Clinic owner</legend>
      <p className="muted">The owner signs in as themselves and adds the rest of the staff.</p>
      <div className="grid-2">
        <Field label="Owner’s name"><input className="input" required maxLength={100} value={ownerName} onChange={event => { setOwnerName(event.target.value); setError(""); }} /></Field>
        <Field label="Owner’s email"><input className="input" type="email" required value={ownerEmail} onChange={event => { setOwnerEmail(event.target.value); setError(""); }} /></Field>
      </div>
    </fieldset>
    <ClinicForm busy={busy} onSave={async clinic => {
      if (!ownerName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())) { setError("Enter the owner’s name and a valid email."); return; }
      if (busy) return;
      setBusy(true); setError("");
      try {
        setLink((await repo.createClinic(clinic, ownerName.trim(), ownerEmail.trim())).setupLink);
        toast.success("Clinic created.");
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : "Could not create the clinic.");
      } finally { setBusy(false); }
    }} />
    <FormError error={error} />
  </div>;
}
