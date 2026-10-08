"use client";
import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { NavGuardPrompt } from "./confirm-action";
import type { useFormDraft } from "@/lib/hooks/use-form-draft";
import type { DraftValues } from "@/lib/drafts/store";

type Controller = ReturnType<typeof useFormDraft<DraftValues>>;
export function DraftRecovery({ draft, saving = false, excluded, labels = {} }: { draft: Controller; saving?: boolean; excluded?: string; labels?: Record<string, string> }) {
  const [reviewing, setReviewing] = useState(false);
  const [choices, setChoices] = useState<Record<string, "draft" | "server">>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (field: string) => labels[field] ?? field.replace(/([A-Z])/g, " $1").replace(/[_:]/g, " ");
  return <>
    <div className="my-3 space-y-2 rounded-xl border border-border bg-surface-muted p-3 text-sm text-ink">
      <p role="status" aria-live="polite">{saving ? "Saving to the server…" : draft.storageError ? "Changes are only in this form. Device recovery is unavailable; keep this tab open." : draft.recovery ? "A draft is available. Review it before restoring." : draft.savedAt ? <>Draft saved in this tab at <time dateTime={new Date(draft.savedAt).toISOString()}>{new Date(draft.savedAt).toLocaleString()}</time>. Not yet saved to the server.</> : draft.dirty ? "Unsaved changes — checking device recovery…" : "No unsaved changes."}</p>
      <p className="text-ink-muted">Eligible drafts expire after 24 hours, on sign out, or when this tab closes.{excluded ? ` ${excluded}` : ""}</p>
      {draft.recovery && <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { setChoices({}); setError(""); setReviewing(true); }}>Review recovered draft</Button><Button type="button" variant="outline" onClick={draft.discard}>Discard draft</Button></div>}
    </div>
    <NavGuardPrompt {...draft.guard} />
    {reviewing && draft.recovery && <Modal title="Recover your work" onClose={() => setReviewing(false)} size="lg">
      <p className="mb-3 text-sm">Draft saved {new Date(draft.recovery.savedAt).toLocaleString()}. Expires {new Date(draft.recovery.expiresAt).toLocaleString()}. Discarding this draft does not change the school record.</p>
      {draft.conflicts.length > 0 ? <p role="alert">This record changed. Resolve {draft.conflicts.length} conflicting fields before restoring.</p> : <p>Review the saved input before applying it to this form.</p>}
      <div className="my-4 space-y-4">{Object.entries(draft.recovery.values).map(([field, value]) => <fieldset key={field} className="min-w-0 rounded-lg border border-border p-3">
        <legend className="px-1 font-semibold">{label(field)}</legend>
        <p className="break-words text-sm">Current: {typeof draft.baseline[field] === "object" ? JSON.stringify(draft.baseline[field]) : String(draft.baseline[field] ?? "(empty)")}</p><p className="break-words text-sm">Draft: {typeof value === "object" ? JSON.stringify(value) : String(value ?? "(empty)")}</p>
        {draft.conflicts.includes(field) && <div className="mt-2 flex flex-wrap gap-4">{(["server", "draft"] as const).map(choice => <label key={choice} className="flex items-center gap-2"><input type="radio" name={`recover-${field}`} checked={choices[field] === choice} onChange={() => setChoices(prev => ({ ...prev, [field]: choice }))} />Use {choice === "server" ? "current" : "draft"} value</label>)}</div>}
      </fieldset>)}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || draft.conflicts.some(k => !choices[k])} onClick={async () => { setBusy(true); try { await draft.accept(choices); setReviewing(false); } catch (error) { setChoices({}); setError(error instanceof Error ? error.message : "Recovery could not be verified. Keep this form open and try again."); } finally { setBusy(false); } }}>Apply selected draft</Button><Button type="button" variant="outline" onClick={() => { draft.discard(); setReviewing(false); }}>Discard draft</Button></div>
    </Modal>}
  </>;
}
