"use client";
import { useState, useEffect } from "react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { draftCopy } from "@/lib/drafts/messages";
import { Modal } from "./modal";
import { Button } from "./button";
import { NavGuardPrompt } from "./confirm-action";
import type { useFormDraft } from "@/lib/hooks/use-form-draft";
import type { DraftValues } from "@/lib/drafts/store";

type Controller = ReturnType<typeof useFormDraft<DraftValues>>;
export function DraftRecovery({ draft, saving = false, excluded, labels = {}, recordLabel }: { recordLabel?: string; draft: Controller; saving?: boolean; excluded?: string; labels?: Record<string, string> }) {
  const { language } = useLocale();
  const copy = draftCopy(language);
  const date = (value: number) => new Date(value).toLocaleString(language);
  const [reviewing, setReviewing] = useState(false);
  const [choices, setChoices] = useState<Record<string, "draft" | "server">>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReviewing(false); setChoices({}); setError(""); }, [draft.record, draft.schema]);
  const label = (field: string) => labels[field] ?? field.replace(/([A-Z])/g, " $1").replace(/[_:]/g, " ");
  return <>
    <div className="my-3 space-y-2 rounded-xl border border-border bg-surface-muted p-3 text-sm text-ink">
      {recordLabel && <p className="font-semibold break-words">{recordLabel}</p>}
      <p role="status" aria-live="polite">{saving ? copy.saving : draft.storageError ? copy.storage : draft.recovery ? copy.available : draft.savedAt ? <>{copy.saved} <time dateTime={new Date(draft.savedAt).toISOString()}>{date(draft.savedAt)}</time>. {copy.notServer}</> : draft.expired ? copy.expired : draft.acknowledged ? copy.acknowledged : draft.dirty ? copy.checking : copy.clean}</p>
      <p className="text-ink-muted">{copy.retention} {copy.boundary}{excluded ? ` ${excluded}` : ""}</p>
      {draft.recovery && <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={async () => { setChoices({}); setError(""); setBusy(true); try { await draft.prepareReview(); setReviewing(true); } catch (error) { setError(error instanceof Error ? error.message : copy.reviewFailed); } finally { setBusy(false); } }}>{copy.review}</Button><Button type="button" variant="outline" disabled={busy} onClick={draft.discard}>{copy.discard}</Button></div>}
    </div>
    {error && !reviewing && <p role="alert" className="text-destructive">{error}</p>}
    <NavGuardPrompt {...draft.guard} />
    {reviewing && draft.recovery && <Modal title={copy.title} onClose={() => setReviewing(false)} size="lg">
      <p className="mb-3 text-sm">{recordLabel ? `${recordLabel}. ` : ""}{copy.savedAt} {date(draft.recovery.savedAt)}. {copy.expires} {date(draft.recovery.expiresAt)}. {copy.discardHelp}</p>
      {draft.conflicts.length > 0 ? <><p role="alert">{copy.resolve(draft.conflicts.length)}</p><p className="text-ink-muted">{copy.resolveHelp}</p></> : <p>{copy.inspect}</p>}
      <div className="my-4 space-y-4">{Object.entries(draft.recovery.values).map(([field, value]) => <fieldset key={field} className="min-w-0 rounded-lg border border-border p-3">
        <legend className="px-1 font-semibold">{label(field)}</legend>
        <p className="break-words text-sm">{copy.current}: {typeof draft.baseline[field] === "object" ? JSON.stringify(draft.baseline[field]) : String(draft.baseline[field] ?? copy.empty)}</p><p className="break-words text-sm">{copy.draft}: {typeof value === "object" ? JSON.stringify(value) : String(value ?? copy.empty)}</p>
        {draft.conflicts.includes(field) && <div className="mt-2 flex flex-wrap gap-4">{(["server", "draft"] as const).map(choice => <label key={choice} className="flex items-center gap-2"><input type="radio" name={`recover-${field}`} checked={choices[field] === choice} onChange={() => setChoices(prev => ({ ...prev, [field]: choice }))} />{choice === "server" ? copy.currentChoice : copy.draftChoice}</label>)}</div>}
      </fieldset>)}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || draft.conflicts.some(k => !choices[k])} onClick={async () => { setBusy(true); try { await draft.accept(choices); setReviewing(false); } catch (error) { setChoices({}); setError(error instanceof Error ? error.message : copy.reviewFailed); } finally { setBusy(false); } }}>{copy.apply}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { draft.discard(); setReviewing(false); }}>{copy.discard}</Button></div>
    </Modal>}
  </>;
}
