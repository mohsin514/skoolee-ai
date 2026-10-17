"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame, PanelTitle } from "@/components/shared-admin";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { FIELD_TYPES, IDENTITY_FIELDS, IDENTITY_KEYS, answerProblems, label, starterDefinition, visibleDocuments, visibleFields, type Answers, type FieldDef, type FormDefinition, type Language } from "@/lib/admissions/form-rules";

// SKO-398: the admissions desk. Work starts from ownership and the next action; the review shows the exact
// form version an application was answered on, keeps office notes apart from messages to the family, lists
// possible duplicates before enrollment, and converting is its own step after acceptance.

type Ui = ReturnType<typeof useUiText>;
type Status = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "INFO_REQUESTED" | "OFFERED" | "WAITLISTED" | "ACCEPTED" | "DECLINED" | "REJECTED" | "WITHDRAWN" | "ENROLLED";
type Row = { id: string; reference: string; status: Status; channel: string; childName: string; submittedAt: string | null; nextContactAt: string | null; version: number; owner: { id: string; fullName: string } | null; formVersion: { version: number; form: { name: string } }; lastFamilyContact: string | null; overdue: boolean };
type Person = { id: string; fullName: string };
type ClassOption = { id: string; name: string; section: string | null };
type Form = { id: string; name: string; draft: FormDefinition; currentVersion: number; publicToken: string; isOpen: boolean; published: { version: number; publishedAt: string } | null };
type Event = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; officeNote: string | null; familyMessage: string | null; actorName: string | null; createdAt: string };
type Detail = { id: string; reference: string; status: Status; channel: string; version: number; answers: Answers; childName: string; intakeClassId: string | null; nextContactAt: string | null; owner: Person | null; enquiry: { id: string; name: string; source: string } | null; convertedStudent: { id: string; fullName: string; rollNo: string } | null; formVersion: { version: number; definition: FormDefinition; form: { name: string } }; missing: string[]; submissions: { id: string; submittedAt: string; submittedBy: string; formVersion: { version: number } }[]; documents: { id: string; key: string; fileName: string; sizeBytes: number; uploadedBy: string; uploadedAt: string }[]; duplicates: { applications: { id: string; reference: string; status: string; childName: string }[]; students: { id: string; fullName: string; rollNo: string; admissionNo: string | null; className: string; archived: boolean; dateOfBirth: string | null }[] }; events: Event[] };

const statusLabel = (ui: Ui, status: string) => ({ DRAFT: ui("Draft"), SUBMITTED: ui("New"), UNDER_REVIEW: ui("In review"), INFO_REQUESTED: ui("Waiting for family"), OFFERED: ui("Offered"), WAITLISTED: ui("Waitlisted"), ACCEPTED: ui("Accepted — ready to enrol"), DECLINED: ui("Declined"), REJECTED: ui("Not offered"), WITHDRAWN: ui("Withdrawn"), ENROLLED: ui("Enrolled") } as Record<string, string>)[status] ?? status;
const eventLabel = (ui: Ui, kind: string) => ({ CREATED: ui("Started"), SUBMITTED: ui("Sent"), ASSIGNED: ui("Owner or next contact set"), STAGE: ui("Stage changed"), INFO_REQUESTED: ui("Information requested"), NOTE: ui("Office note"), ACCEPTED: ui("Offer accepted"), DUPLICATE_DECISION: ui("Duplicate decision"), ENROLLED: ui("Enrolled"), WITHDRAWN: ui("Withdrawn") } as Record<string, string>)[kind] ?? kind;
const className = (cls: ClassOption) => [cls.name, cls.section].filter(Boolean).join(" ");

async function send(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/admissions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json;
}
const errorText = (ui: Ui, failure: unknown) => failure instanceof TypeError ? ui("The connection failed before the server answered. Nothing was lost; try again.") : ui(failure instanceof Error ? failure.message : "The change was not saved.");

export function AdmissionsDesk() {
  const ui = useUiText();
  const [tab, setTab] = useState<"applications" | "forms">("applications");
  const [forms, setForms] = useState<Form[]>([]), [owners, setOwners] = useState<Person[]>([]), [classes, setClasses] = useState<ClassOption[]>([]);
  const loadForms = useCallback(async () => { const response = await fetch("/api/admissions?forms=1", { cache: "no-store" }); const json = await response.json().catch(() => ({})); if (response.ok && json.success) setForms(json.data); }, []);
  useEffect(() => {
    const timer = setTimeout(() => void loadForms(), 0);
    void fetch("/api/admissions?owners=1", { cache: "no-store" }).then(r => r.json()).then(json => json.success && setOwners(json.data)).catch(() => undefined);
    void fetch("/api/admissions?classes=1", { cache: "no-store" }).then(r => r.json()).then(json => json.success && setClasses(json.data)).catch(() => undefined);
    return () => clearTimeout(timer);
  }, [loadForms]);
  return <div className="sk-panel space-y-4 p-5" data-admissions-desk>
    <PanelTitle icon={ClipboardList} title={ui("Admissions")} />
    <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label={ui("Admissions")}>
      {(["applications", "forms"] as const).map(value => <Button key={value} role="tab" aria-selected={tab === value} data-selected={tab === value} variant="choice" size="sm" className="flex-1" onClick={() => setTab(value)}>{value === "applications" ? ui("Applications") : ui("Application forms")}</Button>)}
    </div>
    {tab === "applications" ? <Pipeline forms={forms} owners={owners} classes={classes} /> : <FormsTab forms={forms} onChanged={() => void loadForms()} />}
  </div>;
}

function Pipeline({ forms, owners, classes }: { forms: Form[]; owners: Person[]; classes: ClassOption[] }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<Row[]>([]), [counts, setCounts] = useState({ active: 0, unassigned: 0, overdue: 0, mine: 0 });
  const [view, setView] = useState("mine"), [status, setStatus] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null), [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams({ view });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/admissions?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to admissions for this campus.") : json.error || ui("Applications could not be loaded."));
      setRows(json.data); setCounts(json.counts);
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Applications could not be loaded.")); } finally { setLoading(false); }
  }, [view, status, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  const published = forms.filter(form => form.currentVersion > 0);
  return <div className="space-y-4">
    <p className="flex flex-wrap gap-3 text-sm font-bold" aria-live="polite" data-admission-counts>
      <span>{ui("Active: {0}", [counts.active])}</span>
      <span>{ui("Assigned to me: {0}", [counts.mine])}</span>
      <span className={counts.unassigned ? "text-amber-800" : ""} data-unassigned={counts.unassigned}>{ui("Unassigned: {0}", [counts.unassigned])}</span>
      <span className={counts.overdue ? "text-rose-700" : ""} data-overdue={counts.overdue}>{ui("Follow-up overdue: {0}", [counts.overdue])}</span>
    </p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-3">
        <FormField name="admission-filter-view" label={ui("Show")}><Select value={view} onChange={event => setView(event.target.value)}><option value="mine">{ui("Needs my action")}</option><option value="unassigned">{ui("Unassigned")}</option><option value="overdue">{ui("Follow-up overdue")}</option><option value="active">{ui("All active")}</option><option value="all">{ui("All applications")}</option></Select></FormField>
        <FormField name="admission-filter-status" label={ui("Stage")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="">{ui("Any stage")}</option>{["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED", "ENROLLED", "DECLINED", "REJECTED", "WITHDRAWN", "DRAFT"].map(value => <option key={value} value={value}>{statusLabel(ui, value)}</option>)}</Select></FormField>
        <FormField name="admission-filter-q" label={ui("Search reference, child or phone")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
      </div>
      <Button onClick={() => setCreating(true)} disabled={!published.length} title={!published.length ? ui("Publish an application form first.") : undefined}><Plus className="size-4" aria-hidden="true" />{ui("Enter an application")}</Button>
    </div>
    {loading && !rows.length ? <p role="status" className="text-sm text-ink-muted">{ui("Loading applications…")}</p>
      : loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><span>{loadError}</span><Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></div>
      : !rows.length ? <p className="rounded-2xl bg-muted p-4 text-sm" data-admissions-empty>{view === "mine" && !status && !q ? ui("Nothing needs your action. Unassigned applications are under Unassigned.") : ui("No applications match these filters. Share a published form's link with families, or enter an application.")}</p>
      : <ul className="space-y-2" aria-label={ui("Applications")}>{rows.map(row => <li key={row.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-sm ${row.overdue ? "border-rose-200 bg-rose-50/40" : "border-border"}`} data-application={row.reference} data-application-status={row.status}>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-bold"><bdi dir="ltr">{row.reference}</bdi> · <bdi>{row.childName || ui("(name not given yet)")}</bdi></p>
          <p className="text-xs text-ink-muted"><bdi>{row.formVersion.form.name}</bdi> · {ui("Form version {0}", [row.formVersion.version])}{row.channel === "STAFF" ? ` · ${ui("Entered by staff")}` : ""}{row.lastFamilyContact ? <> · {ui("Last family contact")} <bdi>{dateTime(row.lastFamilyContact)}</bdi></> : null}</p>
          <p className="text-xs text-ink-muted">{row.owner ? <>{ui("Owner")}: <bdi>{row.owner.fullName}</bdi></> : <span className="font-bold text-amber-800">{ui("Unassigned")}</span>}{row.nextContactAt ? <> · <span className={row.overdue ? "font-bold text-rose-800" : ""}>{ui("Next contact")} <bdi>{dateTime(row.nextContactAt)}</bdi></span></> : null}</p>
        </div>
        <span className="rounded-lg bg-muted px-2 py-0.5 text-[10px] font-black">{statusLabel(ui, row.status)}</span>
        <Button size="sm" variant="secondary" onClick={() => setOpenId(row.id)} aria-label={ui("Review application {0}", [row.reference])}>{ui("Review")}</Button>
      </li>)}</ul>}
    {openId ? <ReviewDialog id={openId} owners={owners} classes={classes} onClose={() => { setOpenId(null); void load(); }} /> : null}
    {creating ? <EntryDialog forms={published} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); void load(); }} /> : null}
  </div>;
}

/** Renders a form version's questions; used for staff-entered applications. */
function Questions({ definition, answers, onChange, problems }: { definition: FormDefinition; answers: Answers; onChange: (key: string, value: string | boolean) => void; problems: Record<string, string> }) {
  const ui = useUiText();
  const { language } = useLocale();
  return <div className="space-y-3">{visibleFields(definition, answers).map(field => <div key={field.key}>
    {field.section ? <p className="pt-2 text-xs font-black uppercase text-ink-subtle">{label(field.section, language as Language)}</p> : null}
    {field.type === "checkbox" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={answers[field.key] === true} onChange={event => onChange(field.key, event.target.checked)} />{label(field.label, language as Language)}</label>
      : <FormField name={`entry-${field.key}`} label={label(field.label, language as Language)} required={field.required} error={problems[field.key] ? ui(problems[field.key]) : undefined}>
        {field.type === "select" ? <Select value={String(answers[field.key] ?? "")} onChange={event => onChange(field.key, event.target.value)}><option value="">{ui("Choose…")}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{label(option.label, language as Language)}</option>)}</Select>
          : field.type === "textarea" ? <Textarea value={String(answers[field.key] ?? "")} rows={2} onChange={event => onChange(field.key, event.target.value)} />
          : <Input value={String(answers[field.key] ?? "")} type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"} dir={["phone", "email"].includes(field.type) ? "ltr" : undefined} onChange={event => onChange(field.key, event.target.value)} />}
      </FormField>}
  </div>)}</div>;
}

function EntryDialog({ forms, onClose, onCreated }: { forms: Form[]; onClose: () => void; onCreated: (id: string) => void }) {
  const ui = useUiText();
  const [formId, setFormId] = useState(forms[0]?.id ?? ""), [childName, setChildName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const create = async () => {
    setBusy(true); setError("");
    try { const json = await send("POST", { action: "start", formId, answers: childName.trim() ? { childName: childName.trim() } : {} }); toast.success(ui("Application {0} started. Complete it, attach documents and send it for the family.", [json.data.reference])); onCreated(json.data.id); }
    catch (failure) { setError(errorText(ui, failure)); } finally { setBusy(false); }
  };
  return <ModalFrame title={ui("Enter an application")} eyebrow={ui("Admissions")} subtitle={ui("For a family applying in person or by phone. The same form version and rules apply.")} onClose={onClose}>
    <div className="space-y-3">
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      <FormField name="entry-form" label={ui("Form")}><Select value={formId} onChange={event => setFormId(event.target.value)}>{forms.map(form => <option key={form.id} value={form.id}>{form.name} · v{form.currentVersion}</option>)}</Select></FormField>
      <FormField name="entry-child" label={ui("Child's full name")}><Input value={childName} onChange={event => setChildName(event.target.value)} /></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{ui("Cancel")}</Button><Button onClick={() => void create()} disabled={busy}>{busy ? ui("Saving…") : ui("Start application")}</Button></div>
    </div>
  </ModalFrame>;
}

function ReviewDialog({ id, owners, classes, onClose }: { id: string; owners: Person[]; classes: ClassOption[]; onClose: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [detail, setDetail] = useState<Detail | null>(null), [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [ownerId, setOwnerId] = useState(""), [nextContact, setNextContact] = useState(""), [officeNote, setOfficeNote] = useState(""), [familyMessage, setFamilyMessage] = useState("");
  const [intakeClassId, setIntakeClassId] = useState(""), [rollNo, setRollNo] = useState(""), [choice, setChoice] = useState<"new" | "existing" | "">(""), [matchId, setMatchId] = useState(""), [reason, setReason] = useState("");
  const [answers, setAnswers] = useState<Answers>({}), [consent, setConsent] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/admissions?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) { setLoadError(ui(json.error || "This application could not be loaded.")); return; }
    const data: Detail = json.data;
    setDetail(data); setOwnerId(data.owner?.id ?? ""); setNextContact(data.nextContactAt ? data.nextContactAt.slice(0, 16) : ""); setIntakeClassId(data.intakeClassId ?? classes[0]?.id ?? ""); setAnswers(data.answers);
  }, [id, ui, classes]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const run = async (body: Record<string, unknown>, message: string, method = "PATCH") => {
    if (!detail) return;
    setBusy(true); setError("");
    try { await send(method, { id, version: detail.version, ...body }); toast.success(message); setOfficeNote(""); setFamilyMessage(""); await load(); }
    catch (failure) { setError(errorText(ui, failure)); } finally { setBusy(false); }
  };
  const definition = detail?.formVersion.definition;
  const staffDraft = detail && detail.channel === "STAFF" && ["DRAFT", "INFO_REQUESTED"].includes(detail.status);
  const draftProblems = useMemo(() => definition ? Object.fromEntries(answerProblems(definition, answers, [...new Set((detail?.documents ?? []).map(d => d.key))], true).map(p => [p.key, p.message])) : {}, [definition, answers, detail]);
  const hasDuplicates = Boolean(detail && (detail.duplicates.students.length || detail.duplicates.applications.length));
  const uploadFile = async (key: string, file: File) => {
    setBusy(true); setError("");
    try { const body = new FormData(); body.set("applicationId", id); body.set("key", key); body.set("file", file); const response = await fetch("/api/admissions/documents", { method: "POST", body }); const json = await response.json().catch(() => ({})); if (!response.ok || !json.success) throw new Error(json.error || "The upload failed."); toast.success(ui("Document attached.")); await load(); }
    catch (failure) { setError(errorText(ui, failure)); } finally { setBusy(false); }
  };
  const stageButtons: [string, string, string][] = !detail ? [] : ([
    ["review", ui("Start review"), "SUBMITTED"], ["offer", ui("Offer a place"), "UNDER_REVIEW,WAITLISTED"], ["waitlist", ui("Waitlist"), "UNDER_REVIEW,OFFERED"],
    ["record-acceptance", ui("Record acceptance"), "OFFERED"], ["record-decline", ui("Record decline"), "OFFERED"], ["reject", ui("Do not offer"), "SUBMITTED,UNDER_REVIEW,WAITLISTED"], ["withdraw", ui("Withdraw"), "DRAFT,SUBMITTED,UNDER_REVIEW,INFO_REQUESTED,OFFERED,WAITLISTED,ACCEPTED"],
  ] as [string, string, string][]).filter(([, , from]) => from.split(",").includes(detail.status));
  return <ModalFrame title={detail ? ui("Application {0}", [detail.reference]) : ui("Application")} eyebrow={ui("Admissions")} size="lg" onClose={onClose} dirty={Boolean(officeNote || familyMessage || reason)}>
    {loadError ? <p role="alert" className="text-sm font-bold text-rose-700">{loadError}</p> : !detail || !definition ? <p role="status" className="text-sm">{ui("Loading applications…")}</p> : <div className="space-y-4" data-application-review={detail.reference}>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-review-error>{error}</p> : null}
      <p className="text-sm font-bold" data-review-status={detail.status}>{statusLabel(ui, detail.status)} · <bdi>{detail.formVersion.form.name}</bdi> · {ui("Form version {0}", [detail.formVersion.version])}{detail.enquiry ? <> · {ui("From enquiry")} <bdi>{detail.enquiry.name}</bdi> ({detail.enquiry.source})</> : null}</p>
      {detail.convertedStudent ? <p className="rounded-xl bg-emerald-50 p-3 text-sm" data-converted>{ui("Enrolled as {0}, roll {1}.", [detail.convertedStudent.fullName, detail.convertedStudent.rollNo])}</p> : null}

      {staffDraft ? <section className="space-y-2 rounded-xl border border-border p-3" aria-label={ui("Answers")}>
        <p className="text-xs font-black uppercase text-ink-subtle">{ui("Answers (entered by staff)")}</p>
        <Questions definition={definition} answers={answers} onChange={(key, value) => setAnswers(current => ({ ...current, [key]: value }))} problems={draftProblems} />
        <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "save-answers", answers }, ui("Answers saved."), "POST")}>{ui("Save answers")}</Button>
      </section> : <section className="space-y-1 rounded-xl border border-border p-3 text-sm" aria-label={ui("Submitted answers")}>
        <p className="text-xs font-black uppercase text-ink-subtle">{ui("Submitted answers")} · {detail.submissions.length ? ui("Sent {0} time(s), last {1}", [detail.submissions.length, dateTime(detail.submissions[detail.submissions.length - 1].submittedAt)]) : ui("Not sent yet")}</p>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{visibleFields(definition, detail.answers).map(field => <div key={field.key}><dt className="text-xs text-ink-muted">{label(field.label, "en")}</dt><dd className="font-semibold"><bdi>{typeof detail.answers[field.key] === "boolean" ? (detail.answers[field.key] ? ui("Yes") : ui("No")) : field.type === "select" ? (field.options?.find(option => option.value === detail.answers[field.key])?.label.en ?? String(detail.answers[field.key] ?? "—")) : String(detail.answers[field.key] ?? "—")}</bdi></dd></div>)}</dl>
      </section>}

      <section className="space-y-1 rounded-xl border border-border p-3 text-sm" aria-label={ui("Documents")}>
        <p className="text-xs font-black uppercase text-ink-subtle">{ui("Documents")}</p>
        {visibleDocuments(definition, detail.answers).map(document => {
          const files = detail.documents.filter(file => file.key === document.key);
          return <div key={document.key} className="flex flex-wrap items-center gap-2" data-review-document={document.key} data-present={files.length > 0}>
            <span className={files.length ? "text-emerald-800" : document.required ? "font-bold text-rose-700" : "text-ink-muted"}>{files.length ? "✓" : document.required ? "✗" : "·"} {label(document.label, "en")}{document.required ? "" : ` (${ui("optional")})`}</span>
            {files.map(file => <a key={file.id} className="text-xs font-bold text-primary underline" href={`/api/admissions?document=${encodeURIComponent(file.id)}`}><bdi>{file.fileName}</bdi></a>)}
            {["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "ACCEPTED"].includes(detail.status) ? <label className="cursor-pointer text-xs text-primary">{ui("Attach")}<input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadFile(document.key, file); }} /></label> : null}
          </div>;
        })}
        {detail.missing.length ? <p className="text-xs font-bold text-rose-700" data-review-missing>{ui("Missing: {0}", [detail.missing.join(", ")])}</p> : null}
      </section>
      {staffDraft ? <div className="space-y-2 rounded-xl border border-border p-3">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{ui("The family has read and agreed to this statement:")} {label(definition.consent, "en")}</label>
        <Button disabled={busy || !consent} onClick={() => void run({ action: "staff-submit", consent: true }, ui("Application sent."))}>{ui("Send on the family's behalf")}</Button>
      </div> : null}

      {hasDuplicates ? <section className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" aria-label={ui("Possible duplicates")} data-duplicates>
        <p className="font-black">{ui("Possible duplicates")}</p>
        {detail.duplicates.students.map(student => <p key={student.id} data-duplicate-student={student.id}>{ui("Pupil")}: <bdi>{student.fullName}</bdi> · <bdi dir="ltr">{student.rollNo}</bdi> · <bdi>{student.className}</bdi>{student.dateOfBirth ? <> · <bdi dir="ltr">{student.dateOfBirth}</bdi></> : null}{student.archived ? ` · ${ui("archived")}` : ""}</p>)}
        {detail.duplicates.applications.map(other => <p key={other.id}>{ui("Application")}: <bdi dir="ltr">{other.reference}</bdi> · <bdi>{other.childName}</bdi> · {statusLabel(ui, other.status)}</p>)}
      </section> : null}

      {!["ENROLLED", "DECLINED", "REJECTED", "WITHDRAWN"].includes(detail.status) ? <div className="grid items-end gap-3 sm:grid-cols-3">
        <FormField name="review-owner" label={ui("Owner")}><Select value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">{ui("Unassigned")}</option>{owners.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</Select></FormField>
        <FormField name="review-next" label={ui("Next contact")}><Input type="datetime-local" value={nextContact} onChange={event => setNextContact(event.target.value)} /></FormField>
        <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "assign", ownerId: ownerId || null, nextContactAt: nextContact ? new Date(nextContact).toISOString() : null }, ui("Owner and next contact saved."))}>{ui("Save owner and next contact")}</Button>
      </div> : null}

      {!["ENROLLED"].includes(detail.status) && !staffDraft ? <section className="space-y-2 rounded-xl border border-border p-3" aria-label={ui("Next step")}>
        <FormField name="review-office-note" label={ui("Office note (staff only)")}><Textarea value={officeNote} rows={2} maxLength={2000} onChange={event => setOfficeNote(event.target.value)} /></FormField>
        <FormField name="review-family-message" label={ui("Message to the family (they will see this)")}><Textarea value={familyMessage} rows={2} maxLength={2000} onChange={event => setFamilyMessage(event.target.value)} /></FormField>
        {stageButtons.some(([action]) => action === "offer") ? <FormField name="review-intake" label={ui("Class offered")}><Select value={intakeClassId} onChange={event => setIntakeClassId(event.target.value)}>{classes.map(cls => <option key={cls.id} value={cls.id}>{className(cls)}</option>)}</Select></FormField> : null}
        <div className="flex flex-wrap gap-2">
          {["SUBMITTED", "UNDER_REVIEW"].includes(detail.status) ? <Button size="sm" variant="secondary" disabled={busy || familyMessage.trim().length < 2} onClick={() => void run({ action: "request-info", familyMessage, officeNote: officeNote || undefined }, ui("Request sent to the family."))}>{ui("Request information")}</Button> : null}
          {stageButtons.map(([action, text]) => <Button key={action} size="sm" variant={action === "offer" || action === "record-acceptance" ? "default" : "secondary"} disabled={busy} onClick={() => void run({ action, officeNote: officeNote || undefined, familyMessage: familyMessage || undefined, intakeClassId: action === "offer" ? intakeClassId : undefined }, ui("Saved."))}>{text}</Button>)}
          <Button size="sm" variant="ghost" disabled={busy || officeNote.trim().length < 2} onClick={() => void run({ action: "note", officeNote }, ui("Note added."))}>{ui("Add office note")}</Button>
        </div>
      </section> : null}

      {detail.status === "ACCEPTED" ? <section className="space-y-2 rounded-xl border-2 border-primary/30 p-3" aria-label={ui("Enrol")} data-convert>
        <p className="text-sm font-black">{ui("Enrol the child")}</p>
        <p className="text-xs text-ink-muted">{ui("This creates the pupil record once. Guardian sign-in invitations are sent separately from the pupil's record and can be retried there.")}</p>
        {hasDuplicates ? <fieldset className="space-y-1 text-sm"><legend className="text-xs font-bold">{ui("This child may already be on the school's records. Choose:")}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="duplicate-choice" checked={choice === "new"} onChange={() => setChoice("new")} />{ui("Enrol as a new pupil (not the same child)")}</label>
          {detail.duplicates.students.map(student => <label key={student.id} className="flex items-center gap-2"><input type="radio" name="duplicate-choice" checked={choice === "existing" && matchId === student.id} onChange={() => { setChoice("existing"); setMatchId(student.id); }} />{ui("Link the existing pupil")} <bdi>{student.fullName}</bdi> · <bdi dir="ltr">{student.rollNo}</bdi></label>)}
          <FormField name="duplicate-reason" label={ui("Reason for this decision")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField>
        </fieldset> : null}
        {choice !== "existing" ? <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="convert-class" label={ui("Class")}><Select value={intakeClassId} onChange={event => setIntakeClassId(event.target.value)}>{classes.map(cls => <option key={cls.id} value={cls.id}>{className(cls)}</option>)}</Select></FormField>
          <FormField name="convert-roll" label={ui("Roll number")}><Input value={rollNo} dir="ltr" maxLength={32} onChange={event => setRollNo(event.target.value)} /></FormField>
        </div> : null}
        <Button disabled={busy || (hasDuplicates && (!choice || reason.trim().length < 5)) || (choice !== "existing" && !rollNo.trim())} onClick={() => void run({ action: "convert", classId: intakeClassId, rollNo, familyMessage: familyMessage || undefined, ...(hasDuplicates ? { duplicate: { choice, studentId: matchId || undefined, reason } } : {}) }, ui("Enrolled. The application is linked to the pupil record."), "POST")}>{busy ? ui("Saving…") : ui("Enrol")}</Button>
      </section> : null}

      <section aria-label={ui("History")}>
        <p className="mb-2 text-xs font-black uppercase text-ink-subtle">{ui("History")}</p>
        <ol className="space-y-1.5 text-xs" data-application-history>{detail.events.map(event => <li key={event.id} className="rounded-lg bg-muted/60 px-3 py-2" data-event={event.kind}>
          <p className="font-bold">{eventLabel(ui, event.kind)}{event.toStatus ? ` → ${statusLabel(ui, event.toStatus)}` : ""} · <bdi>{dateTime(event.createdAt)}</bdi> · {event.actorName ? <bdi>{event.actorName}</bdi> : ui("Family")}</p>
          {event.officeNote ? <p className="whitespace-pre-wrap"><span className="font-bold">{ui("Office note")}:</span> <bdi>{event.officeNote}</bdi></p> : null}
          {event.familyMessage ? <p className="whitespace-pre-wrap text-primary"><span className="font-bold">{ui("To family")}:</span> <bdi>{event.familyMessage}</bdi></p> : null}
        </li>)}</ol>
      </section>
    </div>}
  </ModalFrame>;
}

function FormsTab({ forms, onChanged }: { forms: Form[]; onChanged: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [editing, setEditing] = useState<Form | "new" | null>(null), [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, body: Record<string, unknown>, message: string) => {
    setBusy(key);
    try { await send("POST", body); toast.success(message); onChanged(); } catch (failure) { toast.error(errorText(ui, failure)); } finally { setBusy(null); }
  };
  const link = (form: Form) => `${typeof window === "undefined" ? "" : window.location.origin}/apply/${form.publicToken}`;
  return <div className="space-y-3">
    <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />{ui("New application form")}</Button></div>
    {!forms.length ? <p className="rounded-2xl bg-muted p-4 text-sm">{ui("No application forms yet. Start from the suggested form and adjust it for your school.")}</p>
      : <ul className="space-y-2" aria-label={ui("Application forms")}>{forms.map(form => {
        const changed = JSON.stringify(form.draft) !== JSON.stringify((form.published as unknown as { definition?: unknown })?.definition);
        return <li key={form.id} className="space-y-1 rounded-2xl border border-border p-3 text-sm" data-admission-form={form.name}>
          <p className="font-bold"><bdi>{form.name}</bdi></p>
          <p className="text-xs text-ink-muted">{form.published ? ui("Published version {0} · {1}", [form.published.version, dateTime(form.published.publishedAt)]) : ui("Draft — not published")}{form.published && changed ? ` · ${ui("Draft has unpublished changes")}` : ""} · {form.isOpen ? ui("Accepting applications") : ui("Closed to new applications")}</p>
          {form.published ? <p className="flex flex-wrap items-center gap-2 text-xs"><bdi dir="ltr" className="break-all" data-form-link>{link(form)}</bdi><Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(link(form)); toast.success(ui("Link copied.")); }}><Copy className="size-3" aria-hidden="true" />{ui("Copy link")}</Button></p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(form)}>{ui("Edit draft")}</Button>
            {changed || !form.published ? <Button size="sm" disabled={busy === form.id} onClick={() => void run(form.id, { action: "publish-form", id: form.id }, ui("Published. New applications use this version; applications already started keep theirs."))}>{ui("Publish")}</Button> : null}
            {form.published ? <Button size="sm" variant="ghost" disabled={busy === `open-${form.id}`} onClick={() => void run(`open-${form.id}`, { action: "open-form", id: form.id, isOpen: !form.isOpen }, form.isOpen ? ui("Closed to new applications.") : ui("Accepting applications."))}>{form.isOpen ? ui("Stop accepting") : ui("Start accepting")}</Button> : null}
          </div>
        </li>;
      })}</ul>}
    {editing ? <FormEditor form={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} /> : null}
  </div>;
}

const optionsText = (field: FieldDef) => (field.options ?? []).map(option => [option.value, option.label.en, option.label.ar ?? "", option.label.ur ?? ""].join(" | ")).join("\n");
const parseOptions = (text: string) => text.split("\n").map(line => line.split("|").map(part => part.trim())).filter(parts => parts[0]).map(([value, en, ar, ur]) => ({ value, label: { en: en || value, ...(ar ? { ar } : {}), ...(ur ? { ur } : {}) } }));

function FormEditor({ form, onClose, onSaved }: { form: Form | null; onClose: () => void; onSaved: () => void }) {
  const ui = useUiText();
  const [name, setName] = useState(form?.name ?? ""), [definition, setDefinition] = useState<FormDefinition>(form?.draft ?? starterDefinition());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const updateField = (index: number, patch: Partial<FieldDef>) => setDefinition(current => ({ ...current, fields: current.fields.map((field, i) => i === index ? { ...field, ...patch } : field) }));
  const move = (index: number, delta: number) => setDefinition(current => { const fields = [...current.fields]; const [field] = fields.splice(index, 1); fields.splice(Math.max(0, Math.min(fields.length, index + delta)), 0, field); return { ...current, fields }; });
  const save = async () => {
    setBusy(true); setError("");
    try { await send("POST", { action: "save-form", id: form?.id, name, definition }); toast.success(ui("Draft saved. Publish it when it is ready for families.")); onSaved(); }
    catch (failure) { setError(errorText(ui, failure)); } finally { setBusy(false); }
  };
  return <ModalFrame title={form ? ui("Edit application form") : ui("New application form")} eyebrow={ui("Admissions")} size="lg" onClose={onClose} dirty>
    <div className="space-y-4" data-form-editor>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-form-error>{error}</p> : null}
      <FormField name="form-name" label={ui("Form name")}><Input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></FormField>
      <p className="text-xs text-ink-muted">{ui("Write each question in English and, where families need it, in Arabic and Urdu. Publishing freezes a version; applications already started keep the version they began with.")}</p>
      <ol className="space-y-3">{definition.fields.map((field, index) => <li key={index} className="space-y-2 rounded-xl border border-border p-3" data-editor-field={field.key}>
        <div className="grid gap-2 sm:grid-cols-3">
          <FormField name={`field-en-${index}`} label={ui("Question (English)")}><Input value={field.label.en} onChange={event => updateField(index, { label: { ...field.label, en: event.target.value } })} /></FormField>
          <FormField name={`field-ar-${index}`} label={ui("Question (Arabic)")}><Input dir="rtl" value={field.label.ar ?? ""} onChange={event => updateField(index, { label: { ...field.label, ar: event.target.value } })} /></FormField>
          <FormField name={`field-ur-${index}`} label={ui("Question (Urdu)")}><Input dir="rtl" value={field.label.ur ?? ""} onChange={event => updateField(index, { label: { ...field.label, ur: event.target.value } })} /></FormField>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <FormField name={`field-key-${index}`} label={ui("Key")}><Input dir="ltr" value={field.key} onChange={event => updateField(index, { key: event.target.value })} /></FormField>
          <FormField name={`field-type-${index}`} label={ui("Answer type")}><Select value={field.type} onChange={event => updateField(index, { type: event.target.value as FieldDef["type"] })}>{FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</Select></FormField>
          <FormField name={`field-identity-${index}`} label={ui("Pupil record field")}><Select value={field.identity ?? ""} onChange={event => updateField(index, { identity: (event.target.value || undefined) as FieldDef["identity"] })}><option value="">{ui("None")}</option>{IDENTITY_FIELDS.map(identity => <option key={identity} value={identity}>{identity}</option>)}</Select></FormField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={field.required} onChange={event => updateField(index, { required: event.target.checked })} />{ui("Required")}</label>
        </div>
        {field.type === "select" ? <FormField name={`field-options-${index}`} label={ui("Options, one per line: value | English | Arabic | Urdu")}><Textarea dir="ltr" rows={3} value={optionsText(field)} onChange={event => updateField(index, { options: parseOptions(event.target.value) })} /></FormField> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <FormField name={`field-if-${index}`} label={ui("Only ask when this question…")}><Select value={field.showIf?.field ?? ""} onChange={event => updateField(index, { showIf: event.target.value ? { field: event.target.value, equals: field.showIf?.equals ?? "" } : undefined })}><option value="">{ui("Always ask")}</option>{definition.fields.slice(0, index).map(earlier => <option key={earlier.key} value={earlier.key}>{earlier.label.en || earlier.key}</option>)}</Select></FormField>
          {field.showIf ? <FormField name={`field-equals-${index}`} label={ui("…has this answer")}><Input dir="ltr" value={field.showIf.equals} onChange={event => updateField(index, { showIf: { field: field.showIf!.field, equals: event.target.value } })} /></FormField> : null}
        </div>
        <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}>{ui("Move up")}</Button><Button size="sm" variant="ghost" onClick={() => move(index, 1)} disabled={index === definition.fields.length - 1}>{ui("Move down")}</Button><Button size="sm" variant="ghost" onClick={() => setDefinition(current => ({ ...current, fields: current.fields.filter((_, i) => i !== index) }))}>{ui("Remove")}</Button></div>
      </li>)}</ol>
      <Button variant="secondary" onClick={() => setDefinition(current => ({ ...current, fields: [...current.fields, { key: `question${current.fields.length + 1}`, type: "text", required: false, label: { en: "" } }] }))}>{ui("Add a question")}</Button>
      <section className="space-y-2" aria-label={ui("Documents")}>
        <p className="text-sm font-black">{ui("Documents")}</p>
        {definition.documents.map((document, index) => <div key={index} className="grid items-end gap-2 rounded-xl border border-border p-3 sm:grid-cols-4" data-editor-document={document.key}>
          <FormField name={`doc-en-${index}`} label={ui("Document (English)")}><Input value={document.label.en} onChange={event => setDefinition(current => ({ ...current, documents: current.documents.map((d, i) => i === index ? { ...d, label: { ...d.label, en: event.target.value } } : d) }))} /></FormField>
          <FormField name={`doc-ar-${index}`} label={ui("Document (Arabic)")}><Input dir="rtl" value={document.label.ar ?? ""} onChange={event => setDefinition(current => ({ ...current, documents: current.documents.map((d, i) => i === index ? { ...d, label: { ...d.label, ar: event.target.value } } : d) }))} /></FormField>
          <FormField name={`doc-key-${index}`} label={ui("Key")}><Input dir="ltr" value={document.key} onChange={event => setDefinition(current => ({ ...current, documents: current.documents.map((d, i) => i === index ? { ...d, key: event.target.value } : d) }))} /></FormField>
          <div className="flex items-center gap-3 pb-2 text-sm"><label className="flex items-center gap-1"><input type="checkbox" checked={document.required} onChange={event => setDefinition(current => ({ ...current, documents: current.documents.map((d, i) => i === index ? { ...d, required: event.target.checked } : d) }))} />{ui("Required")}</label><Button size="sm" variant="ghost" onClick={() => setDefinition(current => ({ ...current, documents: current.documents.filter((_, i) => i !== index) }))}>{ui("Remove")}</Button></div>
        </div>)}
        <Button variant="secondary" onClick={() => setDefinition(current => ({ ...current, documents: [...current.documents, { key: `document${current.documents.length + 1}`, required: false, label: { en: "" } }] }))}>{ui("Add a document")}</Button>
      </section>
      <fieldset className="space-y-1 text-sm"><legend className="text-sm font-black">{ui("Find possible duplicates by")}</legend>
        {IDENTITY_KEYS.map(key => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={definition.identityKeys.includes(key)} onChange={event => setDefinition(current => ({ ...current, identityKeys: event.target.checked ? [...current.identityKeys, key] : current.identityKeys.filter(k => k !== key) }))} />{key === "nationalId" ? ui("National ID / birth registration number") : key === "nameAndDob" ? ui("Child's name and date of birth") : ui("Guardian phone and child's name")}</label>)}
      </fieldset>
      <FormField name="form-consent" label={ui("Consent statement (English)")}><Textarea rows={2} value={definition.consent.en} onChange={event => setDefinition(current => ({ ...current, consent: { ...current.consent, en: event.target.value } }))} /></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void save()} disabled={busy}>{busy ? ui("Saving…") : ui("Save draft")}</Button></div>
    </div>
  </ModalFrame>;
}
