"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame, PanelTitle } from "@/components/shared-admin";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";

// SKO-469: issue certificates and ID cards from approved template versions. Reception previews the exact
// text for the chosen pupil (missing fields block issuing), a leader approves identity-sensitive documents,
// downloads are the frozen document, and a correction is a reissue with a reason and a new serial.

type Ui = ReturnType<typeof useUiText>;
type Template = { id: string; kind: "STUDENT_CERTIFICATE" | "ID_CARD"; name: string; language: "en" | "ar" | "ur"; pageSize: string; requiresApproval: boolean; currentVersion: number; draft: { title: string; body: string }; approved: { version: number; title: string; body: string; approvedAt: string } | null };
type Status = "PENDING_APPROVAL" | "ISSUED" | "REJECTED" | "REVOKED" | "SUPERSEDED";
type Issue = { id: string; serial: string; status: Status; title: string; language: string; issuedAt: string | null; createdAt: string; version: number; previousId: string | null; reissueReason: string | null; decisionNote: string | null; artifactHash: string; verifyToken: string; templateId: string; student: { id: string; fullName: string; rollNo: string }; templateVersion: { version: number; kind: string }; successors: { serial: string; status: Status }[]; requestedBy: string | null; approvedBy: string | null };
type Student = { id: string; fullName: string; rollNo: string; admissionNo: string | null; className: string };
type Preview = { title: string; body: string; missing: string[]; language: string; kind: string; templateVersion: number; requiresApproval: boolean; hasPhoto: boolean; schoolName: string };
const VARIABLES = ["studentName", "studentNameUr", "rollNo", "admissionNo", "className", "section", "dateOfBirth", "guardianName", "nationality", "schoolName", "campusName", "issueDate", "serial", "photo"];
const statusLabel = (ui: Ui, status: Status) => ({ PENDING_APPROVAL: ui("Waiting for approval"), ISSUED: ui("Issued"), REJECTED: ui("Rejected"), REVOKED: ui("Revoked"), SUPERSEDED: ui("Replaced") })[status];
const kindLabel = (ui: Ui, kind: string) => kind === "ID_CARD" ? ui("ID card") : ui("Certificate");
const languageLabel = (ui: Ui, language: string) => ({ en: ui("English"), ar: ui("Arabic"), ur: ui("Urdu") } as Record<string, string>)[language] ?? language;
const fieldLabel = (ui: Ui, field: string) => ({ studentName: ui("Student name"), studentNameUr: ui("Student name (Urdu)"), rollNo: ui("Roll number"), admissionNo: ui("Admission number"), className: ui("Class"), section: ui("Section"), dateOfBirth: ui("Date of birth"), guardianName: ui("Guardian name"), nationality: ui("Nationality"), photo: ui("Photo") } as Record<string, string>)[field] ?? field;

async function send(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/front-desk/certificates", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(typeof json.error === "string" ? json.error : "The change was not saved.");
  return json;
}

export function CertificatesDesk() {
  const ui = useUiText();
  const [tab, setTab] = useState<"documents" | "templates">("documents");
  const [templates, setTemplates] = useState<Template[]>([]), [canApprove, setCanApprove] = useState(false);
  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/front-desk/certificates", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success) { setTemplates(json.data); setCanApprove(Boolean(json.canApprove)); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void loadTemplates(), 0); return () => clearTimeout(timer); }, [loadTemplates]);
  return <div className="sk-panel space-y-4 p-5" data-certificates-desk>
    <PanelTitle icon={FileText} title={ui("Certificates and ID cards")} />
    <div className="flex gap-1 rounded-2xl bg-muted p-1" role="tablist" aria-label={ui("Certificates and ID cards")}>
      {(["documents", "templates"] as const).map(value => <Button key={value} role="tab" aria-selected={tab === value} data-selected={tab === value} variant="choice" size="sm" className="flex-1" onClick={() => setTab(value)}>{value === "documents" ? ui("Documents") : ui("Templates")}</Button>)}
    </div>
    {tab === "documents" ? <DocumentsTab templates={templates} canApprove={canApprove} /> : <TemplatesTab templates={templates} canApprove={canApprove} onChanged={() => void loadTemplates()} />}
  </div>;
}

function DocumentsTab({ templates, canApprove }: { templates: Template[]; canApprove: boolean }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [rows, setRows] = useState<Issue[]>([]), [status, setStatus] = useState(""), [q, setQ] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [issueOpen, setIssueOpen] = useState<{ reissue?: Issue } | null>(null), [deciding, setDeciding] = useState<{ issue: Issue; action: "approve" | "reject" | "revoke" } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const params = new URLSearchParams({ issues: "1" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const response = await fetch(`/api/front-desk/certificates?${params}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) throw new Error(response.status === 403 ? ui("You do not have access to certificates for this campus.") : json.error || ui("Documents could not be loaded."));
      setRows(json.data);
    } catch (failure) { setLoadError(failure instanceof Error ? ui(failure.message) : ui("Documents could not be loaded.")); } finally { setLoading(false); }
  }, [status, q, ui]);
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [load, q]);
  const download = async (issue: Issue) => {
    setDownloading(issue.id);
    try {
      const response = await fetch(`/api/front-desk/certificates?download=${encodeURIComponent(issue.id)}`, { cache: "no-store" });
      if (!response.ok) { const json = await response.json().catch(() => ({})); throw new Error(json.error || "The PDF could not be generated. The document itself is safe and unchanged; try the download again."); }
      const state = response.headers.get("X-Document-State");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `${issue.serial}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (state === "REVOKED") toast.warning(ui("Downloaded {0}. This document is revoked; its verification link says so.", [issue.serial]));
      else if (state === "SUPERSEDED") toast.warning(ui("Downloaded {0}. A newer document has replaced it.", [issue.serial]));
      else toast.success(ui("Downloaded {0}.", [issue.serial]));
    } catch (failure) { toast.error(failure instanceof TypeError ? ui("The download was interrupted. Nothing changed; try again.") : ui(failure instanceof Error ? failure.message : "The download failed.")); }
    finally { setDownloading(null); }
  };
  const approved = templates.filter(template => template.currentVersion > 0);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <FormField name="certificate-filter-status" label={ui("Show")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="">{ui("All documents")}</option><option value="PENDING_APPROVAL">{ui("Waiting for approval")}</option><option value="ISSUED">{ui("Issued")}</option><option value="REVOKED">{ui("Revoked")}</option><option value="SUPERSEDED">{ui("Replaced")}</option><option value="REJECTED">{ui("Rejected")}</option></Select></FormField>
        <FormField name="certificate-filter-q" label={ui("Search serial, title or pupil")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
      </div>
      <Button onClick={() => setIssueOpen({})} disabled={!approved.length} title={!approved.length ? ui("Approve a template first.") : undefined}><Plus className="size-4" aria-hidden="true" />{ui("Issue document")}</Button>
    </div>
    {!approved.length ? <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900" data-no-approved-template>{ui("No template is approved yet. Create one under Templates; a campus leader approves it before documents can be issued.")}</p> : null}
    {loading && !rows.length ? <p role="status" className="text-sm text-ink-muted">{ui("Loading documents…")}</p>
      : loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700"><span>{loadError}</span><Button size="sm" variant="secondary" onClick={() => void load()}>{ui("Retry")}</Button></div>
      : !rows.length ? <p className="rounded-2xl bg-muted p-4 text-sm">{status || q ? ui("No documents match these filters.") : ui("No documents issued yet.")}</p>
      : <ul className="space-y-2" aria-label={ui("Documents")}>{rows.map(row => <li key={row.id} className="space-y-2 rounded-2xl border border-border p-3 text-sm" data-issue={row.serial} data-issue-status={row.status}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 font-bold"><bdi dir="ltr">{row.serial}</bdi> · <bdi>{row.title}</bdi></p>
          <span className={`rounded-lg px-2 py-0.5 text-2xs font-bold ${row.status === "ISSUED" ? "bg-emerald-50 text-emerald-700" : row.status === "PENDING_APPROVAL" ? "bg-amber-50 text-amber-800" : "bg-muted"}`}>{statusLabel(ui, row.status)}</span>
        </div>
        <p className="text-xs text-ink-muted"><bdi>{row.student.fullName}</bdi> · <bdi dir="ltr">{row.student.rollNo}</bdi> · {kindLabel(ui, row.templateVersion.kind)} · {ui("Template version {0}", [row.templateVersion.version])} · {languageLabel(ui, row.language)}</p>
        <p className="text-xs text-ink-muted">{row.requestedBy ? <>{ui("Requested by")} <bdi>{row.requestedBy}</bdi></> : null}{row.approvedBy && row.status !== "REJECTED" ? <> · {ui("Approved by")} <bdi>{row.approvedBy}</bdi></> : null}{row.issuedAt ? <> · <bdi>{dateTime(row.issuedAt)}</bdi></> : null}</p>
        {row.reissueReason ? <p className="text-xs">{ui("Reissue reason")}: <bdi>{row.reissueReason}</bdi></p> : null}
        {row.decisionNote ? <p className="text-xs">{row.status === "REVOKED" ? ui("Revoked because") : row.status === "REJECTED" ? ui("Rejected because") : ui("Note")}: <bdi>{row.decisionNote}</bdi></p> : null}
        {row.successors.length ? <p className="text-xs">{ui("Replaced by")} <bdi dir="ltr">{row.successors.map(s => s.serial).join(", ")}</bdi></p> : null}
        <div className="flex flex-wrap gap-2">
          {row.issuedAt && ["ISSUED", "REVOKED", "SUPERSEDED"].includes(row.status) ? <Button size="sm" variant="secondary" disabled={downloading === row.id} onClick={() => void download(row)} aria-label={ui("Download {0}", [row.serial])}>{downloading === row.id ? ui("Preparing PDF…") : ui("Download PDF")}</Button> : null}
          {canApprove && row.status === "PENDING_APPROVAL" ? <><Button size="sm" onClick={() => setDeciding({ issue: row, action: "approve" })}>{ui("Review and approve")}</Button><Button size="sm" variant="ghost" onClick={() => setDeciding({ issue: row, action: "reject" })}>{ui("Reject")}</Button></> : null}
          {["ISSUED", "REVOKED"].includes(row.status) && !row.successors.some(s => ["ISSUED", "PENDING_APPROVAL"].includes(s.status)) ? <Button size="sm" variant="secondary" onClick={() => setIssueOpen({ reissue: row })}>{ui("Reissue")}</Button> : null}
          {canApprove && row.status === "ISSUED" ? <Button size="sm" variant="ghost" onClick={() => setDeciding({ issue: row, action: "revoke" })}>{ui("Revoke")}</Button> : null}
        </div>
      </li>)}</ul>}
    {issueOpen ? <IssueDialog templates={approved} reissue={issueOpen.reissue} onClose={() => setIssueOpen(null)} onDone={() => { setIssueOpen(null); void load(); }} /> : null}
    {deciding ? <DecisionDialog issue={deciding.issue} action={deciding.action} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); void load(); }} /> : null}
  </div>;
}

function IssueDialog({ templates, reissue, onClose, onDone }: { templates: Template[]; reissue?: Issue; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [templateId, setTemplateId] = useState(reissue?.templateId ?? templates[0]?.id ?? ""), [student, setStudent] = useState<Student | null>(reissue ? { id: reissue.student.id, fullName: reissue.student.fullName, rollNo: reissue.student.rollNo, admissionNo: null, className: "" } : null);
  const [query, setQuery] = useState(""), [matches, setMatches] = useState<Student[]>([]), [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (reissue || query.trim().length < 2) return;
    const timer = setTimeout(() => void fetch(`/api/front-desk/certificates?students=${encodeURIComponent(query.trim())}`, { cache: "no-store" }).then(r => r.json()).then(json => json.success && setMatches(json.data)).catch(() => undefined), 250);
    return () => clearTimeout(timer);
  }, [query, reissue]);
  useEffect(() => {
    if (!student || !templateId) return;
    let cancelled = false;
    void send("POST", { action: "preview", templateId, studentId: student.id }).then(json => { if (!cancelled) { setPreview(json.data); setError(""); } }).catch(failure => { if (!cancelled) { setPreview(null); setError(ui(failure instanceof Error ? failure.message : "The preview failed.")); } });
    return () => { cancelled = true; };
  }, [student, templateId, ui]);
  const issue = async () => {
    if (!student || !preview) return;
    if (preview.missing.length) { setError(ui("Complete the missing fields in the pupil's record before issuing.")); return; }
    if (reissue && reason.trim().length < 5) { setError(ui("Give the reason for reissuing (at least 5 characters).")); return; }
    const payload = { action: "issue", templateId, studentId: student.id, ...(reissue ? { previousId: reissue.id, reissueReason: reason } : {}) };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const json = await send("POST", { ...payload, idempotencyKey: attempt.current.key });
      toast.success(json.data.status === "ISSUED" ? ui("{0} issued.", [json.data.serial]) : ui("{0} sent for a leader's approval.", [json.data.serial]));
      onDone();
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Retrying will not issue the document twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  return <ModalFrame title={reissue ? ui("Reissue {0}", [reissue.serial]) : ui("Issue document")} eyebrow={ui("Certificates and ID cards")} size="lg" onClose={onClose} dirty={Boolean(student || reason)}>
    <div className="space-y-3" data-issue-dialog>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-issue-error>{error}</p> : null}
      <FormField name="issue-template" label={ui("Template")}><Select value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.map(template => <option key={template.id} value={template.id}>{template.name} · {kindLabel(ui, template.kind)} · {languageLabel(ui, template.language)} · v{template.currentVersion}</option>)}</Select></FormField>
      {reissue ? <p className="text-sm">{ui("Pupil")}: <bdi className="font-bold">{reissue.student.fullName}</bdi> · <bdi dir="ltr">{reissue.student.rollNo}</bdi></p> : <>
        <FormField name="issue-student" label={ui("Find the pupil (name, roll or admission number)")}><Input value={query} onChange={event => { setQuery(event.target.value); setStudent(null); setPreview(null); }} /></FormField>
        {!student && matches.length ? <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label={ui("Matching pupils")}>{matches.map(match => <li key={match.id}><Button variant="choice" className="w-full justify-start text-start" onClick={() => setStudent(match)} data-student-option={match.rollNo}><bdi className="font-bold">{match.fullName}</bdi>&nbsp;· <bdi dir="ltr">{match.rollNo}</bdi>{match.admissionNo ? <>&nbsp;· <bdi dir="ltr">{match.admissionNo}</bdi></> : null}&nbsp;· <bdi>{match.className}</bdi></Button></li>)}</ul> : null}
        {!student && query.trim().length >= 2 && !matches.length ? <p className="text-xs text-ink-muted">{ui("No pupil in this campus matches.")}</p> : null}
        {student ? <p className="text-sm" data-chosen-student>{ui("Pupil")}: <bdi className="font-bold">{student.fullName}</bdi> · <bdi dir="ltr">{student.rollNo}</bdi>{student.className ? <> · <bdi>{student.className}</bdi></> : null}</p> : null}
      </>}
      {preview ? <section className="space-y-2 rounded-xl border border-border p-3" aria-label={ui("Preview")} data-issue-preview>
        <p className="text-xs font-semibold uppercase text-ink-subtle">{ui("Preview")} · {kindLabel(ui, preview.kind)} · {languageLabel(ui, preview.language)} · {ui("Template version {0}", [preview.templateVersion])}</p>
        <div dir={preview.language === "en" ? "ltr" : "rtl"} lang={preview.language} className="space-y-1 rounded-lg bg-white p-3 text-sm">
          <p className="font-bold">{preview.schoolName}</p>
          <p className="text-base font-bold">{preview.title}</p>
          <p className="whitespace-pre-wrap leading-relaxed">{preview.body}</p>
        </div>
        {preview.missing.length ? <p role="alert" className="text-xs font-bold text-rose-700" data-preview-missing>{ui("Missing from the pupil's record: {0}", [preview.missing.map(field => fieldLabel(ui, field)).join(", ")])}</p> : null}
        <p className="text-xs text-ink-muted">{preview.requiresApproval ? ui("A campus leader must approve this document before it can be downloaded.") : ui("This document is issued as soon as you confirm.")}</p>
      </section> : null}
      {reissue ? <FormField name="issue-reason" label={ui("Reason for reissue")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField> : null}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void issue()} disabled={busy || !preview || preview.missing.length > 0} aria-busy={busy}>{busy ? ui("Saving…") : preview?.requiresApproval ? ui("Request approval") : ui("Issue")}</Button></div>
    </div>
  </ModalFrame>;
}

function DecisionDialog({ issue, action, onClose, onDone }: { issue: Issue; action: "approve" | "reject" | "revoke"; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async () => {
    if (action !== "approve" && note.trim().length < 5) { setError(ui("Give the reason (at least 5 characters).")); return; }
    setBusy(true); setError("");
    try { await send("PATCH", { id: issue.id, version: issue.version, action, note }); toast.success(action === "approve" ? ui("{0} approved and issued.", [issue.serial]) : action === "reject" ? ui("{0} rejected.", [issue.serial]) : ui("{0} revoked. Its verification link now shows it as revoked.", [issue.serial])); onDone(); }
    catch (failure) { setError(ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  const title = action === "approve" ? ui("Approve {0}", [issue.serial]) : action === "reject" ? ui("Reject {0}", [issue.serial]) : ui("Revoke {0}", [issue.serial]);
  return <ModalFrame title={title} eyebrow={ui("Certificates and ID cards")} onClose={onClose} dirty={Boolean(note)}>
    <div className="space-y-3" data-decision={action}>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      <p className="text-sm"><bdi className="font-bold">{issue.title}</bdi> · <bdi>{issue.student.fullName}</bdi> · <bdi dir="ltr">{issue.student.rollNo}</bdi></p>
      {action === "approve" ? <p className="text-xs text-ink-muted">{ui("Check the pupil's name, dates and the template version. Approving issues the document with today's date.")}</p> : null}
      <FormField name="decision-note" label={action === "approve" ? ui("Note (optional)") : ui("Reason (required)")}><Input value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} disabled={busy} variant={action === "approve" ? "default" : "destructive"}>{busy ? ui("Saving…") : action === "approve" ? ui("Approve and issue") : action === "reject" ? ui("Reject") : ui("Revoke")}</Button></div>
    </div>
  </ModalFrame>;
}

function TemplatesTab({ templates, canApprove, onChanged }: { templates: Template[]; canApprove: boolean; onChanged: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [editing, setEditing] = useState<Template | "new" | null>(null), [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, work: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try { await work(); toast.success(message); onChanged(); }
    catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(null); }
  };
  return <div className="space-y-3">
    <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />{ui("New template")}</Button></div>
    {!templates.length ? <p className="rounded-2xl bg-muted p-4 text-sm">{ui("No templates yet. Create one, then ask a campus leader to approve it.")}</p>
      : <ul className="space-y-2" aria-label={ui("Templates")}>{templates.map(template => {
        const changed = !template.approved || template.approved.title !== template.draft.title || template.approved.body !== template.draft.body;
        return <li key={template.id} className="space-y-1 rounded-2xl border border-border p-3 text-sm" data-template={template.name} data-template-version={template.currentVersion}>
          <p className="font-bold"><bdi>{template.name}</bdi> · {kindLabel(ui, template.kind)} · {languageLabel(ui, template.language)}</p>
          <p className="text-xs text-ink-muted">{template.approved ? ui("Approved version {0} · {1}", [template.approved.version, dateTime(template.approved.approvedAt)]) : ui("Draft — not approved")}{changed && template.approved ? ` · ${ui("Draft has unapproved changes")}` : ""}{template.requiresApproval ? ` · ${ui("Each document needs a leader's approval")}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(template)}>{ui("Edit draft")}</Button>
            {canApprove && changed ? <Button size="sm" disabled={busy === template.id} onClick={() => void run(template.id, () => send("POST", { action: "approve-template", id: template.id }), ui("Template approved. New documents use this version."))}>{ui("Approve this draft")}</Button> : null}
            {!template.currentVersion ? <Button size="sm" variant="ghost" disabled={busy === `delete-${template.id}`} onClick={() => void run(`delete-${template.id}`, async () => { const response = await fetch(`/api/front-desk/certificates?id=${encodeURIComponent(template.id)}`, { method: "DELETE" }); const json = await response.json().catch(() => ({})); if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved."); }, ui("Draft deleted."))}>{ui("Delete draft")}</Button> : null}
          </div>
        </li>;
      })}</ul>}
    {editing ? <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} /> : null}
  </div>;
}

function TemplateDialog({ template, onClose, onDone }: { template: Template | null; onClose: () => void; onDone: () => void }) {
  const ui = useUiText();
  const [form, setForm] = useState({ name: template?.name ?? "", kind: template?.kind ?? "STUDENT_CERTIFICATE", language: template?.language ?? "en", pageSize: template?.pageSize ?? "A4", requiresApproval: template?.requiresApproval ?? true, title: template?.draft.title ?? "", body: template?.draft.body ?? "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [field]: event.target.value }));
  const save = async () => {
    setBusy(true); setError("");
    try { await send("POST", { action: "save-template", id: template?.id, ...form }); toast.success(ui("Draft saved. A campus leader approves it before it is used.")); onDone(); }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your draft is kept; try again.") : ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  return <ModalFrame title={template ? ui("Edit template draft") : ui("New template")} eyebrow={ui("Certificates and ID cards")} size="lg" onClose={onClose} dirty={Boolean(form.body || form.title)}>
    <div className="space-y-3" data-template-dialog>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-template-error>{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="template-name" label={ui("Template name")}><Input value={form.name} maxLength={120} onChange={set("name")} /></FormField>
        <FormField name="template-kind" label={ui("Type")}><Select value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as Template["kind"], pageSize: event.target.value === "ID_CARD" ? "ID_CARD" : current.pageSize === "ID_CARD" ? "A4" : current.pageSize, requiresApproval: event.target.value === "ID_CARD" ? true : current.requiresApproval }))}><option value="STUDENT_CERTIFICATE">{ui("Certificate")}</option><option value="ID_CARD">{ui("ID card")}</option></Select></FormField>
        <FormField name="template-language" label={ui("Document language")}><Select value={form.language} onChange={set("language")}><option value="en">{ui("English")}</option><option value="ar">{ui("Arabic")}</option><option value="ur">{ui("Urdu")}</option></Select></FormField>
        <FormField name="template-page" label={ui("Page size")}><Select value={form.pageSize} onChange={set("pageSize")} disabled={form.kind === "ID_CARD"}><option value="A4">A4</option><option value="A5">A5</option><option value="LETTER">{ui("Letter")}</option>{form.kind === "ID_CARD" ? <option value="ID_CARD">{ui("ID card")}</option> : null}</Select></FormField>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.requiresApproval} disabled={form.kind === "ID_CARD"} onChange={event => setForm(current => ({ ...current, requiresApproval: event.target.checked }))} />{ui("Each document needs a campus leader's approval (always on for ID cards)")}</label>
      <FormField name="template-title" label={ui("Document title")}><Input value={form.title} maxLength={120} dir={form.language === "en" ? "ltr" : "rtl"} onChange={set("title")} /></FormField>
      <FormField name="template-body" label={ui("Document text")}><Textarea value={form.body} rows={6} maxLength={4000} dir={form.language === "en" ? "ltr" : "rtl"} onChange={set("body")} /></FormField>
      <p className="text-xs text-ink-muted">{ui("Insert pupil details with {{variable}}. Available:")} <bdi dir="ltr" className="break-words font-mono">{VARIABLES.map(name => `{{${name}}}`).join(" ")}</bdi></p>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void save()} disabled={busy}>{busy ? ui("Saving…") : ui("Save draft")}</Button></div>
    </div>
  </ModalFrame>;
}
