"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarX2, CheckCircle2, Clock, FileUp, Info, Loader2, MessageSquare, type LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonBar } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/tooltip";
import { FieldError, FormField } from "@/components/ui/form-field";
import { useAuthLanguage } from "@/components/locale/AuthLocaleProvider";
import { useUiText } from "@/components/locale/LocaleProvider";
import { answerProblems, label, visibleDocuments, visibleFields, type Answers, type FormDefinition, type Language, type Problem } from "@/lib/admissions/form-rules";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// SKO-398: a family's admission application. No account: the draft is found again with its reference and a
// resume key, which lives in this browser and in the "continue later" link's #fragment (never sent as part of
// a URL to the server). The family sees its own answers, the stage and messages written for it — nothing else.

type PublicForm = { formName: string; schoolName: string; campusName: string; isOpen: boolean; version: number; definition: FormDefinition };
type Document = { id: string; key: string; fileName: string; sizeBytes: number };
type View = { reference: string; stage: string; editable: boolean; schoolName: string; campusName: string; formVersion: number; definition: FormDefinition; answers: Answers; documents: Document[]; missing: string[]; messages: { message: string; at: string }[]; submittedAt: string | null };
type Saved = { reference: string; resumeKey: string };
const storageKey = (token: string) => `skoolee:application:${token}`;
type PendingAction = "save" | "submit" | "accept" | "decline";

/** How each stage reads at a glance; the sentence beside it carries the meaning. */
const STAGE_LOOK: Record<string, { icon: LucideIcon; tile: string }> = {
  RECEIVED: { icon: CheckCircle2, tile: "border-status-success-border bg-status-success-surface text-status-success-text" },
  OFFERED: { icon: CheckCircle2, tile: "border-status-success-border bg-status-success-surface text-status-success-text" },
  ACCEPTED: { icon: CheckCircle2, tile: "border-status-success-border bg-status-success-surface text-status-success-text" },
  ENROLLED: { icon: CheckCircle2, tile: "border-status-success-border bg-status-success-surface text-status-success-text" },
  WAITLISTED: { icon: Clock, tile: "border-status-info-border bg-status-info-surface text-status-info-text" },
  INFO_REQUESTED: { icon: AlertTriangle, tile: "border-status-warning-border bg-status-warning-surface text-status-warning-text" },
};
const NEUTRAL_STAGE = { icon: Info, tile: "border-border-subtle bg-surface-subtle text-ink-muted" };

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
  // Which button started the pending request, so only that one shows a spinner.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null), [confirmDecline, setConfirmDecline] = useState(false);
  const track = async (kind: PendingAction, action: () => Promise<unknown>) => { setPendingAction(kind); try { await action(); } finally { setPendingAction(null); } };

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

  const formVisible = !!form && (!view || view.editable) && (form.isOpen || !!view);
  const stageLook = view ? STAGE_LOOK[view.stage] ?? NEUTRAL_STAGE : NEUTRAL_STAGE;
  const StageIcon = stageLook.icon;
  const referenceTip = <InfoTip content={ui("The school uses this reference to find your application.")} className="-my-1" />;

  return <main className="mx-auto min-h-screen w-full max-w-2xl space-y-6 px-4 py-6 sm:py-10" data-apply-page>
    <header className="sk-enter flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <p className="sk-eyebrow">{ui("Admission application")}</p>
        {form ? <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong text-balance sm:text-3xl"><bdi>{form.schoolName}</bdi></h1> : !loadError ? <SkeletonBar className="mt-2 h-8 w-56 max-w-full" /> : null}
        {form?.campusName ? <p className="mt-1 text-sm text-ink-muted"><bdi>{form.campusName}</bdi></p> : null}
      </div>
      <FormField name="apply-language" label={ui("Language")} className="w-full sm:w-44"><Select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></FormField>
    </header>
    {loadError ? <div className="sk-panel"><ErrorState title={ui("We couldn't open this application form")} description={ui(loadError)} onRetry={() => window.location.reload()} /></div>
      : !form || !definition ? <div role="status" aria-busy="true" className="sk-panel space-y-6 p-5 sm:p-8">
        <span className="sr-only">{ui("Loading the application form…")}</span>
        <SkeletonBar className="h-5 w-1/3" />
        {[0, 1, 2, 3].map(index => <div key={index} className="space-y-2"><SkeletonBar className="h-4 w-1/4" delay={index * 60} /><SkeletonBar className="h-12 w-full" delay={index * 60} /></div>)}
      </div> : <>
      {view && !view.editable ? <section className="sk-enter sk-panel space-y-4 p-5 sm:p-6" aria-live="polite" data-apply-status={view.stage}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={cn("grid size-11 shrink-0 place-items-center rounded-2xl border shadow-xs", stageLook.tile)}><StageIcon className="size-5" /></span>
          <div className="min-w-0 pt-0.5">
            <p className="sk-eyebrow">{ui("Application status")}</p>
            <p className="mt-1 text-lg font-bold leading-snug text-ink-strong">{stageText[view.stage] ?? view.stage}</p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">{ui("Your reference")}: <bdi dir="ltr" className="font-semibold tabular-nums text-ink-strong" data-apply-reference>{view.reference}</bdi>{referenceTip}</p>
        {saved ? <div className="space-y-1.5 rounded-2xl bg-surface-subtle p-3 text-xs leading-relaxed"><p className="text-ink-muted">{ui("To check your application later or on another device, keep this link private:")}</p><p className="break-all text-ink"><bdi dir="ltr" data-apply-status-link>{continueLink}</bdi></p></div> : null}
      </section> : null}
      {view?.messages.length ? <section aria-label={ui("Messages from the school")}>
        <Alert tone="info" icon={MessageSquare} live="off" title={ui("Messages from the school")}>
          <div className="space-y-2">{view.messages.map((message, index) => <p key={index} className="whitespace-pre-wrap" data-family-message><bdi>{message.message}</bdi></p>)}</div>
        </Alert>
      </section> : null}
      {!formVisible && error ? <Alert tone="danger" compact data-apply-error>{error}</Alert> : null}
      {view?.stage === "OFFERED" ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => setConfirmDecline(true)} disabled={busy}>{ui("Decline")}</Button>
        <Button onClick={() => void track("accept", () => respond(true))} disabled={busy} loading={pendingAction === "accept"}>{ui("Accept the offered place")}</Button>
      </div> : null}
      <ConfirmAction open={confirmDecline} tone="danger" title={ui("Decline the offered place?")} description={ui("Your answer is sent to the school straight away.")} confirmLabel={ui("Decline")} busy={pendingAction === "decline"}
        onCancel={() => setConfirmDecline(false)} onConfirm={() => { void track("decline", () => respond(false)).finally(() => setConfirmDecline(false)); }} />
      {!form.isOpen && !view ? <div className="sk-panel"><EmptyState icon={CalendarX2} title={ui("Applications are closed")} description={ui("The school is not accepting applications through this link at the moment.")} /></div> : null}
      {formVisible ? <form className="sk-enter sk-panel space-y-6 p-5 sm:p-8" onSubmit={event => { event.preventDefault(); void track("submit", submit); }} noValidate data-apply-form>
        {visibleFields(definition, answers).map(field => <div key={field.key} className="space-y-3">
          {field.section ? <h2 className="pt-2 text-lg font-bold tracking-tight text-ink-strong">{label(field.section, lang)}</h2> : null}
          {field.type === "checkbox" ? <div className="space-y-1.5">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink"><Checkbox className="mt-0.5" checked={answers[field.key] === true} onChange={event => set(field.key, event.target.checked)} aria-invalid={Boolean(problemFor(field.key))} aria-describedby={problemFor(field.key) ? `apply-${field.key}-error` : undefined} /><span>{label(field.label, lang)}{field.required ? <span className="text-destructive"> *</span> : null}</span></label>
            {problemFor(field.key) ? <FieldError id={`apply-${field.key}-error`}>{ui(problemFor(field.key)!)}</FieldError> : null}
          </div>
            : <FormField name={`apply-${field.key}`} label={label(field.label, lang)} required={field.required} error={problemFor(field.key) ? ui(problemFor(field.key)!) : undefined} hint={field.help ? label(field.help, lang) : undefined}>
              {field.type === "select" ? <Select value={String(answers[field.key] ?? "")} onChange={event => set(field.key, event.target.value)}><option value="">{ui("Choose…")}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{label(option.label, lang)}</option>)}</Select>
                : field.type === "textarea" ? <Textarea value={String(answers[field.key] ?? "")} rows={3} maxLength={2000} onChange={event => set(field.key, event.target.value)} />
                : <Input value={String(answers[field.key] ?? "")} type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"} inputMode={field.type === "phone" ? "tel" : undefined} dir={["phone", "email"].includes(field.type) ? "ltr" : undefined} maxLength={200} onChange={event => set(field.key, event.target.value)} />}
            </FormField>}
        </div>)}
        {visibleDocuments(definition, answers).length ? <section className="space-y-3" aria-label={ui("Documents")}>
          <h2 className="pt-2 text-lg font-bold tracking-tight text-ink-strong">{ui("Documents")}</h2>
          {visibleDocuments(definition, answers).map(document => {
            const files = (view?.documents ?? []).filter(file => file.key === document.key);
            const problem = problemFor(document.key);
            const state = uploading[document.key];
            return <div key={document.key} className={cn("space-y-2.5 rounded-2xl border bg-white p-4 shadow-xs transition-colors", problem || state === "failed" ? "border-status-error-border" : "border-border-subtle")} data-apply-document={document.key}>
              <p className="text-sm font-semibold text-ink-strong">{label(document.label, lang)}{document.required ? <span className="text-destructive"> *</span> : <span className="ms-1.5 text-xs font-normal text-ink-subtle">({ui("optional")})</span>}</p>
              {files.length ? <ul className="space-y-1">{files.map(file => <li key={file.id} className="flex min-w-0 items-center gap-1.5 text-xs text-status-success-text"><CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" /><bdi className="min-w-0 truncate">{file.fileName}</bdi><span className="shrink-0 tabular-nums text-ink-subtle">· {Math.ceil(file.sizeBytes / 1024)} KB</span></li>)}</ul> : null}
              {problem ? <FieldError>{ui(problem)}</FieldError> : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "sk-choice-card", state === "uploading" && "pointer-events-none opacity-70")}>{state === "uploading" ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}{state === "uploading" ? ui("Uploading…") : files.length ? ui("Replace or add a file") : ui("Choose a file")}
                  <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" disabled={state === "uploading"} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(document.key, file); }} data-apply-upload={document.key} />
                </label>
                <p className="text-xs text-ink-subtle">{ui("PDF, JPG or PNG, up to 5 MB.")}</p>
              </div>
              {state === "failed" ? <p className="text-xs font-medium text-status-error-text">{ui("The upload did not finish. Choose the file again.")}</p> : null}
            </div>;
          })}
        </section> : null}
        <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed text-ink transition-colors", showProblems && !consent ? "border-status-error-border bg-status-error-surface" : "border-border-subtle bg-surface-subtle")}><Checkbox className="mt-0.5" checked={consent} onChange={event => setConsent(event.target.checked)} aria-invalid={showProblems && !consent} data-apply-consent /><span>{label(definition.consent, lang)}</span></label>
        {saved ? <div className="space-y-1.5 rounded-2xl border border-dashed border-edge bg-white p-4 text-xs leading-relaxed text-ink-muted" data-apply-continue>
          <p className="flex flex-wrap items-center gap-x-1.5">{ui("Your reference")}: <bdi dir="ltr" className="font-semibold tabular-nums text-ink-strong">{saved.reference}</bdi>{referenceTip}</p>
          <p>{ui("To continue on another device, keep this link private and open it there:")}</p>
          <p className="break-all rounded-xl bg-surface-subtle px-3 py-2 text-ink"><bdi dir="ltr">{continueLink}</bdi></p>
        </div> : null}
        {/* The latest outcome sits with the actions, so it is in view wherever the family pressed them. */}
        <div className="sk-glass sticky bottom-3 z-10 space-y-2.5 rounded-2xl p-3">
          {error ? <Alert tone="danger" compact data-apply-error>{error}</Alert> : null}
          {notice ? <Alert tone="success" compact data-apply-notice>{notice}</Alert> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => void track("save", save)} disabled={busy} loading={pendingAction === "save"}>{ui("Save and continue later")}</Button>
            <Button type="submit" className="flex-1 sm:flex-none" disabled={busy} loading={pendingAction === "submit"}>{pendingAction === "submit" ? ui("Sending…") : ui("Send application")}</Button>
          </div>
        </div>
      </form> : null}
    </>}
  </main>;
}
