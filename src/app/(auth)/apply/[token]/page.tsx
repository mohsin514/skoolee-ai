"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { useUiText } from "@/components/locale/LocaleProvider";
import { answerProblems, label, visibleDocuments, visibleFields, type Answers, type FormDefinition, type Language, type Problem } from "@/lib/admissions/form-rules";

// SKO-398: a family's admission application. No account: the draft is found again with its reference and a
// resume key, which lives in this browser and in the "continue later" link's #fragment (never sent as part of
// a URL to the server). The family sees its own answers, the stage and messages written for it — nothing else.

type PublicForm = { formName: string; schoolName: string; campusName: string; isOpen: boolean; version: number; definition: FormDefinition };
type Document = { id: string; key: string; fileName: string; sizeBytes: number };
type View = { reference: string; stage: string; editable: boolean; schoolName: string; campusName: string; formVersion: number; definition: FormDefinition; answers: Answers; documents: Document[]; missing: string[]; messages: { message: string; at: string }[]; submittedAt: string | null };
type Saved = { reference: string; resumeKey: string };
const storageKey = (token: string) => `skoolee:application:${token}`;

async function call(method: "GET" | "POST", path: string, body?: Record<string, unknown>, resumeKey?: string) {
  const response = await fetch(path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(resumeKey ? { "x-resume-key": resumeKey } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw Object.assign(new Error(typeof json.error === "string" ? json.error : "Something went wrong. Your answers are still on this page; try again."), { status: response.status });
  return json.data;
}

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>();
  const { language, setLanguage } = useAuthLanguage();
  const ui = useUiText();
  const lang = language as Language;
  const [form, setForm] = useState<PublicForm | null>(null), [view, setView] = useState<View | null>(null), [saved, setSaved] = useState<Saved | null>(null);
  const [answers, setAnswers] = useState<Answers>({}), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loadError, setLoadError] = useState("");
  const [showProblems, setShowProblems] = useState(false), [uploading, setUploading] = useState<Record<string, "uploading" | "failed">>({});
  const dirty = useRef(false);

  const remember = useCallback((value: Saved) => { setSaved(value); try { window.localStorage.setItem(storageKey(token), JSON.stringify(value)); } catch { /* private mode: the continue-later link still works */ } }, [token]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded: PublicForm = await call("GET", `/api/public/admissions?form=${encodeURIComponent(token)}`);
        if (cancelled) return;
        setForm(loaded);
        const fromLink = new URLSearchParams(window.location.hash.slice(1));
        let resume: Saved | null = fromLink.get("ref") && fromLink.get("key") ? { reference: fromLink.get("ref")!, resumeKey: fromLink.get("key")! } : null;
        if (!resume) { try { resume = JSON.parse(window.localStorage.getItem(storageKey(token)) ?? "null"); } catch { resume = null; } }
        if (resume) {
          try {
            const current: View = await call("GET", `/api/public/admissions?reference=${encodeURIComponent(resume.reference)}`, undefined, resume.resumeKey);
            if (cancelled) return;
            remember(resume); setView(current); setAnswers(current.answers);
          } catch { try { window.localStorage.removeItem(storageKey(token)); } catch { /* ignore */ } }
        }
      } catch (failure) { if (!cancelled) setLoadError(failure instanceof Error ? failure.message : "This application link could not be opened."); }
    })();
    return () => { cancelled = true; };
  }, [token, remember]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const definition = view?.definition ?? form?.definition ?? null;
  const uploadedKeys = useMemo(() => [...new Set((view?.documents ?? []).map(document => document.key))], [view]);
  const problems: Problem[] = useMemo(() => definition ? answerProblems(definition, answers, uploadedKeys, true) : [], [definition, answers, uploadedKeys]);
  const problemFor = (key: string) => showProblems ? problems.find(problem => problem.key === key)?.message : undefined;
  const set = (key: string, value: string | boolean) => { dirty.current = true; setAnswers(current => ({ ...current, [key]: value })); };

  /** Saves the draft, creating the application on the first save. */
  const save = async (): Promise<Saved | null> => {
    if (!definition) return null;
    setBusy(true); setError(""); setNotice("");
    try {
      let current = saved;
      if (!current) { current = await call("POST", "/api/public/admissions", { action: "start", form: token, answers }) as Saved; remember(current); }
      const next: View = await call("POST", "/api/public/admissions", { action: "save", reference: current.reference, answers }, current.resumeKey);
      setView(next); dirty.current = false;
      setNotice(next.missing.length ? ui("Your application is saved. {0} required item(s) remain.", [next.missing.length]) : ui("Your application is saved and ready to send."));
      return current;
    } catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed. Your answers are still on this page; try saving again.") : ui(failure instanceof Error ? failure.message : "Saving failed.")); return null; }
    finally { setBusy(false); }
  };
  const upload = async (key: string, file: File) => {
    const current = saved ?? await save();
    if (!current) return;
    setUploading(state => ({ ...state, [key]: "uploading" })); setError("");
    try {
      const body = new FormData(); body.set("reference", current.reference); body.set("key", key); body.set("file", file);
      const response = await fetch("/api/public/admissions/documents", { method: "POST", headers: { "x-resume-key": current.resumeKey }, body });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(json.error || "The upload failed.");
      setView(await call("GET", `/api/public/admissions?reference=${encodeURIComponent(current.reference)}`, undefined, current.resumeKey));
      setUploading(state => { const next = { ...state }; delete next[key]; return next; });
    } catch (failure) { setUploading(state => ({ ...state, [key]: "failed" })); setError(failure instanceof TypeError ? ui("The upload was interrupted. Choose the file again to retry.") : ui(failure instanceof Error ? failure.message : "The upload failed.")); }
  };
  const submit = async () => {
    setShowProblems(true);
    if (problems.length || !consent) { setError(problems.length ? ui("Some answers need attention. They are marked below.") : ui("Confirm the statement at the end before sending.")); return; }
    const current = await save();
    if (!current) return;
    setBusy(true);
    try { const next: View = await call("POST", "/api/public/admissions", { action: "submit", reference: current.reference, consent: true }, current.resumeKey); setView(next); setNotice(""); dirty.current = false; }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the school answered. Sending again will not create a second application.") : ui(failure instanceof Error ? failure.message : "Sending failed.")); }
    finally { setBusy(false); }
  };
  const respond = async (accept: boolean) => {
    if (!saved) return;
    setBusy(true); setError("");
    try { setView(await call("POST", "/api/public/admissions", { action: accept ? "accept" : "decline", reference: saved.reference }, saved.resumeKey)); }
    catch (failure) { setError(ui(failure instanceof Error ? failure.message : "Sending failed.")); }
    finally { setBusy(false); }
  };
  const continueLink = saved && typeof window !== "undefined" ? `${window.location.origin}/apply/${token}#ref=${saved.reference}&key=${saved.resumeKey}` : "";

  const stageText: Record<string, string> = { DRAFT: ui("Draft — not sent yet"), RECEIVED: ui("Received — the school is reviewing it"), INFO_REQUESTED: ui("The school needs more information"), OFFERED: ui("A place has been offered"), WAITLISTED: ui("On the waiting list"), ACCEPTED: ui("You accepted the offer — the school will confirm enrollment"), ENROLLED: ui("Enrolled"), CLOSED: ui("Closed") };

  return <main className="mx-auto min-h-screen max-w-2xl space-y-5 px-4 py-6" data-apply-page>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-bold uppercase text-ink-subtle">{ui("Admission application")}</p><h1 className="text-xl font-black"><bdi>{form?.schoolName ?? ""}</bdi></h1>{form?.campusName ? <p className="text-sm text-ink-muted"><bdi>{form.campusName}</bdi></p> : null}</div>
      <FormField name="apply-language" label={ui("Language")}><Select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></FormField>
    </div>
    {loadError ? <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{ui(loadError)}</p> : !form || !definition ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{ui("Loading the application form…")}</p> : <>
      {view && !view.editable ? <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-live="polite" data-apply-status={view.stage}>
        <p className="flex items-center gap-2 text-base font-black"><CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />{stageText[view.stage] ?? view.stage}</p>
        <p className="text-sm">{ui("Your reference")}: <bdi dir="ltr" className="font-black" data-apply-reference>{view.reference}</bdi></p>
        {saved ? <div className="space-y-1 text-xs"><p className="text-ink-muted">{ui("To check your application later or on another device, keep this link private:")}</p><p className="break-all"><bdi dir="ltr" data-apply-status-link>{continueLink}</bdi></p></div> : null}
      </section> : null}
      {view?.messages.length ? <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label={ui("Messages from the school")}>
        <p className="text-sm font-black">{ui("Messages from the school")}</p>
        {view.messages.map((message, index) => <p key={index} className="whitespace-pre-wrap text-sm" data-family-message><bdi>{message.message}</bdi></p>)}
      </section> : null}
      {view?.stage === "OFFERED" ? <div className="flex flex-wrap gap-2"><Button onClick={() => void respond(true)} disabled={busy}>{ui("Accept the offered place")}</Button><Button variant="ghost" onClick={() => void respond(false)} disabled={busy}>{ui("Decline")}</Button></div> : null}
      {!form.isOpen && !view ? <p className="rounded-2xl bg-muted p-4 text-sm">{ui("The school is not accepting applications through this link at the moment.")}</p> : null}
      {(!view || view.editable) && (form.isOpen || view) ? <form className="space-y-5" onSubmit={event => { event.preventDefault(); void submit(); }} noValidate data-apply-form>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700" data-apply-error>{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" data-apply-notice>{notice}</p> : null}
        {visibleFields(definition, answers).map(field => <div key={field.key} className="space-y-3">
          {field.section ? <h2 className="pt-2 text-base font-black">{label(field.section, lang)}</h2> : null}
          {field.type === "checkbox" ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={answers[field.key] === true} onChange={event => set(field.key, event.target.checked)} aria-invalid={Boolean(problemFor(field.key))} />{label(field.label, lang)}{field.required ? " *" : ""}</label>
            : <FormField name={`apply-${field.key}`} label={label(field.label, lang)} required={field.required} error={problemFor(field.key) ? ui(problemFor(field.key)!) : undefined} hint={field.help ? label(field.help, lang) : undefined}>
              {field.type === "select" ? <Select value={String(answers[field.key] ?? "")} onChange={event => set(field.key, event.target.value)}><option value="">{ui("Choose…")}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{label(option.label, lang)}</option>)}</Select>
                : field.type === "textarea" ? <Textarea value={String(answers[field.key] ?? "")} rows={3} maxLength={2000} onChange={event => set(field.key, event.target.value)} />
                : <Input value={String(answers[field.key] ?? "")} type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"} inputMode={field.type === "phone" ? "tel" : undefined} dir={["phone", "email"].includes(field.type) ? "ltr" : undefined} maxLength={200} onChange={event => set(field.key, event.target.value)} />}
            </FormField>}
        </div>)}
        {visibleDocuments(definition, answers).length ? <section className="space-y-3" aria-label={ui("Documents")}>
          <h2 className="pt-2 text-base font-black">{ui("Documents")}</h2>
          {visibleDocuments(definition, answers).map(document => {
            const files = (view?.documents ?? []).filter(file => file.key === document.key);
            return <div key={document.key} className="space-y-1 rounded-xl border border-border p-3" data-apply-document={document.key}>
              <p className="text-sm font-bold">{label(document.label, lang)}{document.required ? " *" : ` (${ui("optional")})`}</p>
              {files.map(file => <p key={file.id} className="text-xs text-emerald-800"><bdi>{file.fileName}</bdi> · {Math.ceil(file.sizeBytes / 1024)} KB</p>)}
              {problemFor(document.key) ? <p className="text-xs font-bold text-rose-700" role="alert">{ui(problemFor(document.key)!)}</p> : null}
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-primary"><FileUp className="size-4" aria-hidden="true" />{uploading[document.key] === "uploading" ? ui("Uploading…") : files.length ? ui("Replace or add a file") : ui("Choose a file")}
                <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" disabled={uploading[document.key] === "uploading"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(document.key, file); }} data-apply-upload={document.key} />
              </label>
              {uploading[document.key] === "failed" ? <p className="text-xs text-rose-700">{ui("The upload did not finish. Choose the file again.")}</p> : null}
              <p className="text-[11px] text-ink-muted">{ui("PDF, JPG or PNG, up to 5 MB.")}</p>
            </div>;
          })}
        </section> : null}
        <label className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} data-apply-consent />{label(definition.consent, lang)}</label>
        {saved ? <div className="space-y-1 rounded-xl border border-dashed border-border p-3 text-xs" data-apply-continue>
          <p>{ui("Your reference")}: <bdi dir="ltr" className="font-black">{saved.reference}</bdi></p>
          <p>{ui("To continue on another device, keep this link private and open it there:")}</p>
          <p className="break-all"><bdi dir="ltr">{continueLink}</bdi></p>
        </div> : null}
        <div className="sticky bottom-0 flex flex-wrap gap-2 bg-background/95 py-3">
          <Button type="button" variant="secondary" onClick={() => void save()} disabled={busy}>{ui("Save and continue later")}</Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? ui("Sending…") : ui("Send application")}</Button>
        </div>
      </form> : null}
    </>}
  </main>;
}
