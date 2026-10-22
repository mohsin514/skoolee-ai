"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { PanelTitle } from "@/components/shared-admin";
import { Modal } from "@/components/ui/modal";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { forwardCommand, usePanelCommand } from "@/components/fees/fee-utils";
import type { PanelCommand } from "@/components/fees/fee-types";
import { downloadCSV } from "@/lib/csv";

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

/**
 * Certificates and ID cards (role-ux §2.2 #54, M81). The front desk issues documents from approved templates;
 * the campus admin designs and approves templates (`showTemplates`, default true — the receptionist's Documents
 * view passes false). Templates open as a secondary view, never a second tab level. `command`
 * "issue-certificate" opens the issue dialog from the console's PageHeader and "export" saves the documents the
 * filters show as CSV (from Templates it returns to the documents first); `hideHeader` drops the panel title.
 */
export function CertificatesDesk({ showTemplates = true, hideHeader = false, command, onIssueAvailabilityChange }: { showTemplates?: boolean; hideHeader?: boolean; command?: PanelCommand | null; onIssueAvailabilityChange?: (available: boolean) => void }) {
  const ui = useUiText();
  const [tab, setTab] = useState<"documents" | "templates">("documents");
  const [templates, setTemplates] = useState<Template[]>([]), [canApprove, setCanApprove] = useState(false);
  // "Issue certificate" from the header waits for the template list, so it never reports "none approved" mid-load.
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  useEffect(() => { onIssueAvailabilityChange?.(templatesLoaded && templates.some(template => template.currentVersion > 0)); }, [templatesLoaded, templates, onIssueAvailabilityChange]);
  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/front-desk/certificates", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (response.ok && json.success) { setTemplates(json.data); setCanApprove(Boolean(json.canApprove)); }
    } finally { setTemplatesLoaded(true); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void loadTemplates(), 0); return () => clearTimeout(timer); }, [loadTemplates]);
  const templatesOn = showTemplates && tab === "templates";
  // "Export" pressed while Templates is open returns to the documents list and exports it there.
  const [forwarded, setForwarded] = useState<PanelCommand | null>(null);
  usePanelCommand(command, { export: () => { setTab("documents"); setForwarded(forwardCommand(command)); } });
  const documentsCommand = forwarded && command && forwarded.nonce === command.nonce ? forwarded : command;
  return <div className={hideHeader ? "space-y-4" : "sk-panel space-y-4 p-5"} data-certificates-desk>
    {hideHeader && !showTemplates ? null : <div className="flex flex-wrap items-center justify-between gap-2">
      {hideHeader ? <span /> : <PanelTitle icon={FileText} title={ui(templatesOn ? "Certificate templates" : "Certificates and ID cards")} />}
      {showTemplates ? <Button variant="outline" size="sm" onClick={() => setTab(templatesOn ? "documents" : "templates")}>{ui(templatesOn ? "Back to documents" : "Templates")}</Button> : null}
    </div>}
    {templatesOn ? <TemplatesTab templates={templates} canApprove={canApprove} onChanged={() => void loadTemplates()} /> : <DocumentsTab templates={templates} canApprove={canApprove} command={documentsCommand} commandReady={templatesLoaded} showTemplates={showTemplates} />}
  </div>;
}

function DocumentsTab({ templates, canApprove, command, commandReady = true, showTemplates }: { templates: Template[]; canApprove: boolean; command?: PanelCommand | null; commandReady?: boolean; showTemplates: boolean }) {
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
  usePanelCommand(command, { "issue-certificate": () => { if (approved.length) setIssueOpen({}); else toast.info(ui(showTemplates ? "No template is approved yet." : "No template is approved yet. Your campus admin approves certificate templates before documents can be issued.")); } }, commandReady);
  usePanelCommand(command, {
    export: () => {
      if (loadError) return;
      if (!rows.length) { toast.info(ui("Nothing to export yet.")); return; }
      const STATUS_EN: Record<Status, string> = { PENDING_APPROVAL: "Waiting for approval", ISSUED: "Issued", REJECTED: "Rejected", REVOKED: "Revoked", SUPERSEDED: "Replaced" };
      downloadCSV(`documents-${new Date().toISOString().slice(0, 10)}`, [
        ["Serial", "Document", "Kind", "Pupil", "Roll number", "Language", "Status", "Issued", "Requested by", "Approved by"],
        ...rows.map(issue => [issue.serial, issue.title, issue.templateVersion.kind === "ID_CARD" ? "ID card" : "Certificate", issue.student.fullName, issue.student.rollNo, issue.language, STATUS_EN[issue.status], issue.issuedAt?.slice(0, 10) ?? "", issue.requestedBy ?? "", issue.approvedBy ?? ""]),
      ]);
    },
  }, !loading);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <FormField name="certificate-filter-status" label={ui("Show")}><Select value={status} onChange={event => setStatus(event.target.value)}><option value="">{ui("All documents")}</option><option value="PENDING_APPROVAL">{ui("Waiting for approval")}</option><option value="ISSUED">{ui("Issued")}</option><option value="REVOKED">{ui("Revoked")}</option><option value="SUPERSEDED">{ui("Replaced")}</option><option value="REJECTED">{ui("Rejected")}</option></Select></FormField>
        <FormField name="certificate-filter-q" label={ui("Search serial, title or pupil")}><Input value={q} onChange={event => setQ(event.target.value)} /></FormField>
      </div>
      {command !== undefined ? null : approved.length ? <Button onClick={() => setIssueOpen({})}><Plus className="size-4" aria-hidden="true" />{ui("Issue certificate")}</Button> : <Tooltip content={ui("Approve a template first.")}><span tabIndex={0} className="inline-flex"><Button disabled><Plus className="size-4" aria-hidden="true" />{ui("Issue certificate")}</Button></span></Tooltip>}
    </div>
    {!approved.length ? <Alert tone="warning" live="off" data-no-approved-template>{ui(showTemplates ? "No template is approved yet. Create one under Templates and approve it before documents can be issued." : "No template is approved yet. Your campus admin approves certificate templates before documents can be issued.")}</Alert> : null}
    {loading && !rows.length ? <SkeletonList rows={3} label={ui("Loading documents…")} />
      : loadError ? <ErrorState description={loadError} onRetry={() => void load()} retryLabel={ui("Retry")} />
      : !rows.length ? <EmptyState size="sm" icon={FileText} title={status || q ? ui("No documents match these filters.") : ui("No documents issued yet.")} action={!status && !q && approved.length ? <Button onClick={() => setIssueOpen({})}><Plus className="size-4" aria-hidden="true" />{ui("Issue certificate")}</Button> : undefined} />
      : <ul className="space-y-2" aria-label={ui("Documents")}>{rows.map(row => <li key={row.id} className="space-y-2 rounded-2xl border border-border p-3 text-sm" data-issue={row.serial} data-issue-status={row.status}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 font-semibold text-ink-strong"><bdi dir="ltr">{row.serial}</bdi> · <bdi>{row.title}</bdi></p>
          <Badge size="sm" dot variant={row.status === "ISSUED" ? "success" : row.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>{statusLabel(ui, row.status)}</Badge>
        </div>
        <p className="text-xs text-ink-muted"><bdi>{row.student.fullName}</bdi> · <bdi dir="ltr">{row.student.rollNo}</bdi> · {kindLabel(ui, row.templateVersion.kind)} · {ui("Template version {0}", [row.templateVersion.version])} · {languageLabel(ui, row.language)}</p>
        <p className="text-xs text-ink-muted">{row.requestedBy ? <>{ui("Requested by")} <bdi>{row.requestedBy}</bdi></> : null}{row.approvedBy && row.status !== "REJECTED" ? <> · {ui("Approved by")} <bdi>{row.approvedBy}</bdi></> : null}{row.issuedAt ? <> · <bdi>{dateTime(row.issuedAt)}</bdi></> : null}</p>
        {row.reissueReason ? <p className="text-xs">{ui("Reissue reason")}: <bdi>{row.reissueReason}</bdi></p> : null}
        {row.decisionNote ? <p className="text-xs">{row.status === "REVOKED" ? ui("Revoked because") : row.status === "REJECTED" ? ui("Rejected because") : ui("Note")}: <bdi>{row.decisionNote}</bdi></p> : null}
        {row.successors.length ? <p className="text-xs">{ui("Replaced by")} <bdi dir="ltr">{row.successors.map(s => s.serial).join(", ")}</bdi></p> : null}
        <div className="flex flex-wrap gap-2">
          {row.issuedAt && ["ISSUED", "REVOKED", "SUPERSEDED"].includes(row.status) ? <Button size="sm" variant="secondary" disabled={downloading === row.id} onClick={() => void download(row)} aria-label={ui("Download {0}", [row.serial])}>{downloading === row.id ? ui("Preparing PDF…") : ui("Download PDF")}</Button> : null}
          {canApprove && row.status === "PENDING_APPROVAL" ? <><Button size="sm" onClick={() => setDeciding({ issue: row, action: "approve" })}>{ui("Review and approve")}</Button><Button size="sm" variant="outline" onClick={() => setDeciding({ issue: row, action: "reject" })}>{ui("Reject")}</Button></> : null}
          {["ISSUED", "REVOKED"].includes(row.status) && !row.successors.some(s => ["ISSUED", "PENDING_APPROVAL"].includes(s.status)) ? <Button size="sm" variant="secondary" onClick={() => setIssueOpen({ reissue: row })}>{ui("Reissue")}</Button> : null}
          {canApprove && row.status === "ISSUED" ? <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeciding({ issue: row, action: "revoke" })}>{ui("Revoke")}</Button> : null}
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
      toast.success(json.data.status === "ISSUED" ? ui("{0} issued.", [json.data.serial]) : ui("{0} sent to your campus admin for approval.", [json.data.serial]));
      onDone();
    } catch (failure) {
      setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Retrying will not issue the document twice.") : ui(failure instanceof Error ? failure.message : "The change was not saved."));
    } finally { setBusy(false); }
  };
  return <Modal title={reissue ? ui("Reissue {0}", [reissue.serial]) : ui("Issue document")} eyebrow={ui("Certificates and ID cards")} size="lg" onClose={onClose} dirty={Boolean(student || reason)}>
    <div className="space-y-3" data-issue-dialog>
      {error ? <Alert tone="danger" compact data-issue-error>{error}</Alert> : null}
      <FormField name="issue-template" label={ui("Template")}><Select value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.map(template => <option key={template.id} value={template.id}>{template.name} · {kindLabel(ui, template.kind)} · {languageLabel(ui, template.language)} · v{template.currentVersion}</option>)}</Select></FormField>
      {reissue ? <p className="text-sm">{ui("Pupil")}: <bdi className="font-semibold text-ink-strong">{reissue.student.fullName}</bdi> · <bdi dir="ltr">{reissue.student.rollNo}</bdi></p> : <>
        <FormField name="issue-student" label={ui("Find the pupil (name, roll or admission number)")}><Input value={query} onChange={event => { setQuery(event.target.value); setStudent(null); setPreview(null); }} /></FormField>
        {!student && matches.length ? <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label={ui("Matching pupils")}>{matches.map(match => <li key={match.id}><Button variant="choice" className="w-full justify-start text-start" onClick={() => setStudent(match)} data-student-option={match.rollNo}><bdi className="font-semibold text-ink-strong">{match.fullName}</bdi>&nbsp;· <bdi dir="ltr">{match.rollNo}</bdi>{match.admissionNo ? <>&nbsp;· <bdi dir="ltr">{match.admissionNo}</bdi></> : null}&nbsp;· <bdi>{match.className}</bdi></Button></li>)}</ul> : null}
        {!student && query.trim().length >= 2 && !matches.length ? <p className="text-xs text-ink-muted">{ui("No pupil in this campus matches.")}</p> : null}
        {student ? <p className="text-sm" data-chosen-student>{ui("Pupil")}: <bdi className="font-semibold text-ink-strong">{student.fullName}</bdi> · <bdi dir="ltr">{student.rollNo}</bdi>{student.className ? <> · <bdi>{student.className}</bdi></> : null}</p> : null}
      </>}
      {preview ? <section className="space-y-2 rounded-xl border border-border p-3" aria-label={ui("Preview")} data-issue-preview>
        <p className="sk-eyebrow">{ui("Preview")} · {kindLabel(ui, preview.kind)} · {languageLabel(ui, preview.language)} · {ui("Template version {0}", [preview.templateVersion])}</p>
        <div dir={preview.language === "en" ? "ltr" : "rtl"} lang={preview.language} className="space-y-1 rounded-lg border border-edge bg-card p-3 text-sm text-ink">
          <p className="font-semibold text-ink-strong">{preview.schoolName}</p>
          <p className="text-base font-bold text-ink-strong">{preview.title}</p>
          <p className="whitespace-pre-wrap leading-relaxed">{preview.body}</p>
        </div>
        {preview.missing.length ? <Alert tone="danger" compact data-preview-missing>{ui("Missing from the pupil's record: {0}", [preview.missing.map(field => fieldLabel(ui, field)).join(", ")])}</Alert> : null}
        <p className="text-xs text-ink-muted">{preview.requiresApproval ? ui("Sent to your campus admin for approval before it can be downloaded.") : ui("This document is issued as soon as you confirm.")}</p>
      </section> : null}
      {reissue ? <FormField name="issue-reason" label={ui("Reason for reissue")}><Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></FormField> : null}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void issue()} loading={busy} disabled={busy || !preview || preview.missing.length > 0}>{preview?.requiresApproval ? ui("Request approval") : ui("Issue")}</Button></div>
    </div>
  </Modal>;
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
  return <Modal title={title} eyebrow={ui("Certificates and ID cards")} onClose={onClose} dirty={Boolean(note)}>
    <div className="space-y-3" data-decision={action}>
      {error ? <Alert tone="danger" compact>{error}</Alert> : null}
      <p className="text-sm"><bdi className="font-semibold text-ink-strong">{issue.title}</bdi> · <bdi>{issue.student.fullName}</bdi> · <bdi dir="ltr">{issue.student.rollNo}</bdi></p>
      {action === "approve" ? <p className="text-xs text-ink-muted">{ui("Check the pupil's name, dates and the template version. Approving issues the document with today's date.")}</p> : null}
      <FormField name="decision-note" label={action === "approve" ? ui("Note (optional)") : ui("Reason (required)")}><Input value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></FormField>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void submit()} loading={busy} disabled={busy} variant={action === "approve" ? "default" : "destructive"}>{action === "approve" ? ui("Approve and issue") : action === "reject" ? ui("Reject") : ui("Revoke")}</Button></div>
    </div>
  </Modal>;
}

function TemplatesTab({ templates, canApprove, onChanged }: { templates: Template[]; canApprove: boolean; onChanged: () => void }) {
  const ui = useUiText();
  const { dateTime } = useLocaleFormat();
  const [editing, setEditing] = useState<Template | "new" | null>(null), [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const run = async (key: string, work: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try { await work(); toast.success(message); onChanged(); }
    catch (failure) { toast.error(ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(null); }
  };
  return <div className="space-y-3">
    <div className="flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" />{ui("New template")}</Button></div>
    <ConfirmAction
      open={Boolean(deleting)}
      busy={Boolean(deleting && busy === `delete-${deleting.id}`)}
      tone="danger"
      title={ui("Delete this template draft?")}
      description={deleting ? ui("\"{0}\" has never been approved, so no document uses it. Deleting it cannot be undone.", [deleting.name]) : ""}
      confirmLabel={ui("Delete draft")}
      cancelLabel={ui("Keep editing")}
      onConfirm={() => { const template = deleting; setDeleting(null); if (template) void run(`delete-${template.id}`, async () => { const response = await fetch(`/api/front-desk/certificates?id=${encodeURIComponent(template.id)}`, { method: "DELETE" }); const json = await response.json().catch(() => ({})); if (!response.ok || !json.success) throw new Error(json.error || "The change was not saved."); }, ui("Draft deleted.")); }}
      onCancel={() => setDeleting(null)}
    />
    {!templates.length ? <EmptyState size="sm" icon={FileText} title={ui("No templates yet. Create one, then approve it before documents can be issued.")} />
      : <ul className="space-y-2" aria-label={ui("Templates")}>{templates.map(template => {
        const changed = !template.approved || template.approved.title !== template.draft.title || template.approved.body !== template.draft.body;
        return <li key={template.id} className="space-y-1 rounded-2xl border border-border p-3 text-sm" data-template={template.name} data-template-version={template.currentVersion}>
          <p className="font-semibold text-ink-strong"><bdi>{template.name}</bdi> · {kindLabel(ui, template.kind)} · {languageLabel(ui, template.language)}</p>
          <p className="text-xs text-ink-muted">{template.approved ? ui("Approved version {0} · {1}", [template.approved.version, dateTime(template.approved.approvedAt)]) : ui("Draft — not approved")}{changed && template.approved ? ` · ${ui("Draft has unapproved changes")}` : ""}{template.requiresApproval ? ` · ${ui("Each document needs your campus admin's approval")}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(template)}>{ui("Edit draft")}</Button>
            {canApprove && changed ? <Button size="sm" disabled={busy === template.id} onClick={() => void run(template.id, () => send("POST", { action: "approve-template", id: template.id }), ui("Template approved. New documents use this version."))}>{ui("Approve this draft")}</Button> : null}
            {!template.currentVersion ? <Button size="sm" variant="outline" className="text-destructive" disabled={busy === `delete-${template.id}`} onClick={() => setDeleting(template)}>{ui("Delete draft")}</Button> : null}
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
    try { await send("POST", { action: "save-template", id: template?.id, ...form }); toast.success(ui("Draft saved. Approve it before documents use it.")); onDone(); }
    catch (failure) { setError(failure instanceof TypeError ? ui("The connection failed before the server answered. Your draft is kept; try again.") : ui(failure instanceof Error ? failure.message : "The change was not saved.")); }
    finally { setBusy(false); }
  };
  return <Modal title={template ? ui("Edit template draft") : ui("New template")} eyebrow={ui("Certificates and ID cards")} size="lg" onClose={onClose} dirty={Boolean(form.body || form.title)}>
    <div className="space-y-3" data-template-dialog>
      {error ? <Alert tone="danger" compact data-template-error>{error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="template-name" label={ui("Template name")}><Input value={form.name} maxLength={120} onChange={set("name")} /></FormField>
        <FormField name="template-kind" label={ui("Type")}><Select value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as Template["kind"], pageSize: event.target.value === "ID_CARD" ? "ID_CARD" : current.pageSize === "ID_CARD" ? "A4" : current.pageSize, requiresApproval: event.target.value === "ID_CARD" ? true : current.requiresApproval }))}><option value="STUDENT_CERTIFICATE">{ui("Certificate")}</option><option value="ID_CARD">{ui("ID card")}</option></Select></FormField>
        <FormField name="template-language" label={ui("Document language")}><Select value={form.language} onChange={set("language")}><option value="en">{ui("English")}</option><option value="ar">{ui("Arabic")}</option><option value="ur">{ui("Urdu")}</option></Select></FormField>
        <FormField name="template-page" label={ui("Page size")}><Select value={form.pageSize} onChange={set("pageSize")} disabled={form.kind === "ID_CARD"}><option value="A4">A4</option><option value="A5">A5</option><option value="LETTER">{ui("Letter")}</option>{form.kind === "ID_CARD" ? <option value="ID_CARD">{ui("ID card")}</option> : null}</Select></FormField>
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.requiresApproval} disabled={form.kind === "ID_CARD"} onChange={event => setForm(current => ({ ...current, requiresApproval: event.target.checked }))} />{ui("Each document needs your campus admin's approval (always on for ID cards)")}</label>
      <FormField name="template-title" label={ui("Document title")}><Input value={form.title} maxLength={120} dir={form.language === "en" ? "ltr" : "rtl"} onChange={set("title")} /></FormField>
      <FormField name="template-body" label={ui("Document text")}><Textarea value={form.body} rows={6} maxLength={4000} dir={form.language === "en" ? "ltr" : "rtl"} onChange={set("body")} /></FormField>
      <p className="text-xs text-ink-muted">{ui("Insert pupil details with {{variable}}. Available:")} <bdi dir="ltr" className="break-words font-mono">{VARIABLES.map(name => `{{${name}}}`).join(" ")}</bdi></p>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{ui("Cancel")}</Button><Button onClick={() => void save()} loading={busy} disabled={busy}>{ui("Save draft")}</Button></div>
    </div>
  </Modal>;
}
