"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, History, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { TaskStatus } from "@/components/ui/task-patterns";
import type { Language } from "@/lib/locale/package";
import { normalizeImportHeader } from "@/lib/imports/csv";
import { MAX_ROSTER_BYTES, ROSTER_FIELDS, ROSTER_REQUIRED_FIELDS, RosterMappingError, mapRosterCsv, parseRosterSource, suggestRosterMapping, type RosterField, type RosterMapping, type RosterSource } from "@/lib/school-ai/roster-import";
import { rosterImportCopy } from "./roster-import-copy";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import styles from "./school-ai.module.css";

interface RosterRow { rowNumber: number; state: string; selected: boolean; source?: Record<string, string>; proposal?: Record<string, unknown> | null; errors: string[]; matchLabel?: string | null; result?: Record<string, unknown> }
interface ImportBatch { id: string; campusId: string; state: string; sourceName: string; expiresAt: string; reviewToken: string; rows?: RosterRow[]; summary: { total: number; accepted: number; rejected: number; skipped: number; unresolved: number }; receipt?: { rows?: RosterRow[]; summary?: { created?: number; committed?: number }; externalEffects?: Record<string, unknown> } | null }
interface ClassChoice { id: string; name: string; section: string | null; academicYear: number }
async function importRequest<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body !== undefined ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "failed");
  return response.json();
}

export function RosterImport({ language, campusId }: { language: Language; campusId?: string | null }) {
  const c = rosterImportCopy(language);
  const guard = useWorkspaceDraftNavigation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [classId, setClassId] = useState("");
  const [source, setSource] = useState<RosterSource | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<RosterMapping>({});
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [history, setHistory] = useState<ImportBatch[] | null>(null);
  const [page, setPage] = useState(0);
  const [correction, setCorrection] = useState<{ rowNumber: number; classId: string; values: Record<string, string> } | null>(null);
  useWorkspaceDraft(busy || Boolean(source) || Boolean(correction));
  const query = `?campusId=${encodeURIComponent(campusId ?? "")}`;
  const batchUrl = (id: string) => `/api/import-batches/${encodeURIComponent(id)}${query}`;
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const stateText = (state: string) => state in c ? c[state as keyof typeof c] : state;
  const destination = (id: unknown) => { const item = classes.find(item => item.id === id); return item ? [item.name, item.section, item.academicYear].filter(Boolean).join(" · ") : c.selectClass; };
  const fieldValue = (row: RosterRow, field: RosterField) => typeof row.proposal?.[field] === "string" ? String(row.proposal[field]) : row.source?.[normalizeImportHeader(field)] || "";
  const reviewIssue = (message: string, row: RosterRow) => {
    if (language === "en") return message;
    if (message.includes("already exists")) return c.duplicate;
    if (row.state === "UNRESOLVED" || /repeats|conflicts/.test(message)) return c.identity;
    if (message.startsWith("Excluded")) return c.excluded;
    const field = message.split(":")[0];
    return `${field in c ? c[field as keyof typeof c] : c.details}: ${c.checkValue}`;
  };
  const reset = () => { setSource(null); setBatch(null); setMapping({}); setMappingConfirmed(false); setReviewed(false); setCorrection(null); setError(""); setNotice(""); setPage(0); setHistory(null); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (error) {
      if (error instanceof RosterMappingError) setError(c[error.code === "mapping" ? "mappingError" : error.code]);
      else setError(error instanceof Error && error.message === "conflict" ? c.conflict : c.failed);
    } finally { setBusy(false); }
  };
  const loadBatch = async (id: string) => {
    const result = await importRequest<{ data: ImportBatch }>(batchUrl(id));
    setBatch(result.data); setPage(0); setSource(null); setCorrection(null); setReviewed(false); setHistory(null);
  };
  const chooseFile = (file?: File) => {
    if (!file) return;
    void run(async () => {
      if (file.size > MAX_ROSTER_BYTES) throw new RosterMappingError("size");
      if (!file.name.toLocaleLowerCase("en").endsWith(".csv")) throw new RosterMappingError("format");
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new RosterMappingError("encoding"); }
      const parsed = parseRosterSource(text);
      setSource(parsed); setFileName(file.name); setMapping(suggestRosterMapping(parsed.headers)); setMappingConfirmed(false); setBatch(null); setHistory(null); setCorrection(null); setPage(0);
    });
  };
  const saveCorrection = async (changes: { rowNumber: number; selected?: boolean; skip?: boolean; proposal?: Record<string, string | null> }) => {
    if (!batch) return;
    const result = await importRequest<{ data: ImportBatch }>(batchUrl(batch.id), { reviewToken: batch.reviewToken, rows: [changes] }, "PATCH");
    setBatch(result.data); setReviewed(false); setCorrection(null);
  };
  const rows = batch?.state === "STAGED" ? batch.rows ?? [] : batch?.receipt?.rows ?? [];
  const selectedCount = rows.filter(row => row.state === "ACCEPTED" && row.selected).length;
  const hasEmails = rows.some(row => row.selected && (row.proposal?.guardianEmail || row.proposal?.studentEmail));
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const commit = async () => {
    if (!batch || !reviewed || !selectedCount) return;
    const result = await importRequest<{ importBatchState: string; receipt: ImportBatch["receipt"] }>(`/api/students${query}`, { _importBatchId: batch.id, _reviewToken: batch.reviewToken });
    setBatch({ ...batch, state: result.importBatchState, rows: undefined, receipt: result.receipt }); setReviewed(false); setPage(0);
  };

  return <section className={`sk-panel ${styles.panel}`} aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><h2 className={styles.sectionTitle}>{c.title}</h2><p className={styles.description}>{c.description}</p></div>
      <Button variant={open ? "ghost" : "outline"} disabled={busy || !campusId} onClick={() => guard(() => {
        if (open) { reset(); setOpen(false); }
        else { setOpen(true); void run(async () => { const result = await importRequest<{ classes: ClassChoice[] }>(`/api/school-ai/imports/options${query}`); setClasses(result.classes); }); }
      })}><FileSpreadsheet aria-hidden="true" />{open ? c.close : c.open}</Button>
    </div>
    {!campusId && <p className="mt-2 text-sm text-ink-muted">{c.campus}</p>}
    {open && <div className="mt-5 space-y-5">
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !classes.length} onClick={() => guard(() => fileRef.current?.click())}><Upload aria-hidden="true" />{c.choose}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => guard(() => void run(async () => { const result = await importRequest<{ data: ImportBatch[] }>(`/api/import-batches${query}&kind=STUDENT_ROSTER`); setHistory(result.data.map(item => ({ ...item, rows: undefined, receipt: undefined }))); }))}><History aria-hidden="true" />{c.history}</Button>
      </div>
      <Input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" tabIndex={-1} aria-label={c.choose} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
      <p className="text-sm leading-relaxed text-ink-muted">{c.fileHint}</p>
      {!busy && !classes.length && <p className={styles.notice}>{c.noClasses}</p>}
      {history && <div className="space-y-2">{!history.length ? <p>{c.emptyHistory}</p> : history.map(item => <Button key={item.id} variant="choice" className="w-full justify-between text-start" disabled={busy} onClick={() => guard(() => void run(() => loadBatch(item.id)))}><span className="min-w-0 break-words">{item.sourceName}</span><TaskStatus>{stateText(item.state)}</TaskStatus></Button>)}</div>}
      {source && <div className="space-y-5">
        <div><h3 className="font-bold">{c.mapping}</h3><p className="mt-1 text-sm text-ink-muted">{c.mappingHint}</p><p className="mt-2 break-words text-sm">{fileName} · {number(source.rows.length)} {c.total}</p></div>
        <FormField name="roster-class" label={c.class} required><Select value={classId} disabled={busy} onChange={event => { setClassId(event.target.value); setMappingConfirmed(false); }}><option value="">{c.selectClass}</option>{classes.map(item => <option key={item.id} value={item.id}>{[item.name, item.section, item.academicYear].filter(Boolean).join(" · ")}</option>)}</Select></FormField>
        <div className="grid gap-4 md:grid-cols-2">{ROSTER_FIELDS.map(field => <FormField key={field} name={`roster-map-${field}`} label={c[field]} required={ROSTER_REQUIRED_FIELDS.includes(field)} hint={mapping[field] !== undefined ? `${c.example}: ${source.rows[0]?.[mapping[field]!] || c.noExample}` : undefined}><Select value={mapping[field] ?? ""} disabled={busy} onChange={event => { const value = event.target.value; setMapping(previous => { const next = { ...previous }; if (value === "") delete next[field]; else next[field] = Number(value); return next; }); setMappingConfirmed(false); }}><option value="">{c.ignored}</option>{source.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</Select></FormField>)}</div>
        <label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox className="mt-1" disabled={busy} checked={mappingConfirmed} onChange={event => setMappingConfirmed(event.target.checked)} /><span>{c.confirmMap}</span></label>
        <Button disabled={busy || !classId || !mappingConfirmed} onClick={() => void run(async () => {
          const csvText = mapRosterCsv(source, mapping);
          const result = await importRequest<{ data: ImportBatch }>("/api/import-batches", { kind: "STUDENT_ROSTER", campusId, defaultClassId: classId, sourceName: fileName, csvText });
          setBatch(result.data); setSource(null); setMapping({}); setMappingConfirmed(false); setReviewed(false); setPage(0); setNotice(c.saved);
        })}>{busy ? c.working : c.validate}</Button>
      </div>}
      {batch && <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{batch.state === "STAGED" ? c.review : c.receipt}</h3><p className="mt-1 text-sm text-ink-muted">{batch.state === "STAGED" ? c.previewHint : c.receiptHint}</p></div><TaskStatus attention={["STAGED", "PARTIAL", "EXPIRED"].includes(batch.state)}>{stateText(batch.state)}</TaskStatus></div>
        <p className="break-words text-xs text-ink-muted">{batch.sourceName} · {batch.id}{batch.state === "STAGED" && ` · ${c.expires}: ${new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(batch.expiresAt))}`}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[[c.total, batch.summary.total], [batch.state === "STAGED" ? c.selected : c.COMMITTED, batch.state === "STAGED" ? selectedCount : batch.receipt?.summary?.created ?? batch.receipt?.summary?.committed ?? 0], [c.attention, rows.filter(row => ["REJECTED", "UNRESOLVED"].includes(row.state)).length], [c.skipped, rows.filter(row => row.state === "SKIPPED" || row.state === "ACCEPTED" && !row.selected).length]].map(([label, value]) => <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4" key={label}><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-xl font-bold">{number(Number(value))}</p></div>)}</div>
        <div className="space-y-3">{rows.slice(page * 20, page * 20 + 20).map(row => <article key={row.rowNumber} className="rounded-2xl border border-border-subtle p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs text-ink-muted">{c.row} {number(row.rowNumber)}</p><h4 className="mt-1 break-words font-semibold">{String(fieldValue(row, "fullName") || row.result?.fullName || row.matchLabel || "—")}</h4><p className="mt-1 break-words text-sm text-ink-muted">{c.rollNo}: {String(fieldValue(row, "rollNo") || row.result?.rollNo || "—")}</p></div><TaskStatus attention={["REJECTED", "UNRESOLVED"].includes(row.state)}>{stateText(row.state)}</TaskStatus></div>
          {row.proposal && <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-2 font-medium">{c.details}</summary><dl className="grid gap-2 sm:grid-cols-2">{Object.entries(row.proposal).filter(([key, value]) => key in c && value !== null && value !== "").map(([key, value]) => <div className="min-w-0" key={key}><dt className="text-xs text-ink-muted">{c[key as keyof typeof c]}</dt><dd className="break-words">{String(value)}</dd></div>)}<div><dt className="text-xs text-ink-muted">{c.class}</dt><dd>{destination(row.proposal.classId)}</dd></div></dl></details>}
          {row.result?.classId ? <p className="mt-2 text-sm text-ink-muted">{c.class}: {destination(row.result.classId)}</p> : null}
          {row.errors?.length > 0 && <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink-muted">{row.errors.map((message, index) => <li key={index}>{reviewIssue(message, row)}</li>)}</ul>}
          {batch.state === "STAGED" && <div className="mt-3 flex flex-wrap items-center gap-2">{row.state === "ACCEPTED" && <label className="me-2 flex min-h-11 items-center gap-2 text-sm"><Checkbox disabled={busy || Boolean(correction)} checked={row.selected} onChange={event => void run(() => saveCorrection({ rowNumber: row.rowNumber, selected: event.target.checked }))} />{c.select} {number(row.rowNumber)}</label>}
            <Button variant="outline" disabled={busy || Boolean(correction)} onClick={() => setCorrection({ rowNumber: row.rowNumber, classId: typeof row.proposal?.classId === "string" ? row.proposal.classId : classId, values: Object.fromEntries(ROSTER_FIELDS.map(field => [field, fieldValue(row, field)])) })}>{c.edit}</Button>
            {row.state !== "SKIPPED" && <Button variant="ghost" disabled={busy || Boolean(correction)} onClick={() => void run(() => saveCorrection({ rowNumber: row.rowNumber, skip: true }))}>{c.skip}</Button>}
          </div>}
          {correction?.rowNumber === row.rowNumber && <div className="mt-4 space-y-4 border-t border-border-subtle pt-4"><p className="text-sm text-ink-muted">{c.rowHint}</p>
            <FormField name={`row-${row.rowNumber}-class`} label={c.class} required><Select value={correction.classId} disabled={busy} onChange={event => setCorrection({ ...correction, classId: event.target.value })}><option value="">{c.selectClass}</option>{classes.map(item => <option key={item.id} value={item.id}>{[item.name, item.section, item.academicYear].filter(Boolean).join(" · ")}</option>)}</Select></FormField>
            <div className="grid gap-4 md:grid-cols-2">{ROSTER_FIELDS.map(field => <FormField key={field} name={`row-${row.rowNumber}-${field}`} label={c[field]} required={ROSTER_REQUIRED_FIELDS.includes(field)}>{field === "gender" || field === "guardianRelationship" ? <Select disabled={busy} value={correction.values[field] ?? ""} onChange={event => setCorrection({ ...correction, values: { ...correction.values, [field]: event.target.value } })}><option value="">{c.ignored}</option>{(field === "gender" ? ["male", "female", "other"] as const : ["father", "mother", "uncle", "aunt", "sibling", "other"] as const).map(value => <option key={value} value={field === "gender" ? value.toUpperCase() : value}>{c[value]}</option>)}</Select> : <Input maxLength={4000} disabled={busy} value={correction.values[field] ?? ""} onChange={event => setCorrection({ ...correction, values: { ...correction.values, [field]: event.target.value } })} />}</FormField>)}</div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy || !correction.classId} onClick={() => void run(() => saveCorrection({ rowNumber: correction.rowNumber, proposal: { ...Object.fromEntries(Object.entries(correction.values).map(([key, value]) => [key, value.trim() || null])), classId: correction.classId } }))}>{c.saveRow}</Button><Button variant="ghost" disabled={busy} onClick={() => guard(() => setCorrection(null))}>{c.cancel}</Button></div>
          </div>}
        </article>)}</div>
        {rows.length > 20 && <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={busy || page === 0 || Boolean(correction)} onClick={() => setPage(previous => previous - 1)}>{c.back}</Button><span className="text-sm">{c.page} {number(page + 1)} / {number(pageCount)}</span><Button variant="outline" disabled={busy || page + 1 >= pageCount || Boolean(correction)} onClick={() => setPage(previous => previous + 1)}>{c.next}</Button></div>}
        {batch.state === "STAGED" && <div className="space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4">{hasEmails && <p className="text-sm text-ink-muted">{c.invitations}</p>}<label className="flex min-h-11 items-start gap-3 text-sm"><Checkbox className="mt-1" disabled={busy || !selectedCount || Boolean(correction)} checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>{c.confirm}</span></label><Button disabled={busy || !reviewed || !selectedCount || Boolean(correction)} onClick={() => void run(commit)}><CheckCircle2 aria-hidden="true" />{busy ? c.working : c.create}</Button></div>}
        {batch.receipt?.externalEffects && <section className="rounded-2xl border border-border-subtle p-4"><h4 className="font-semibold">{c.invitationStatus}</h4>{batch.receipt.externalEffects.invitations !== "ATTEMPTED" ? <p className="mt-2 text-sm text-ink-muted">{c.pendingInvitations}</p> : <dl className="mt-3 grid gap-3 sm:grid-cols-2">{(["guardianSent", "guardianFailures", "studentSent", "studentFailures"] as const).map(key => <div key={key}><dt className="text-xs text-ink-muted">{c[key]}</dt><dd className="mt-1 font-semibold">{number(Number(batch.receipt?.externalEffects?.[key] ?? 0))}</dd></div>)}</dl>}</section>}
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => guard(() => void run(async () => { await loadBatch(batch.id); setNotice(c.refreshed); }))}>{c.refresh}</Button><Button variant="ghost" disabled={busy} onClick={() => guard(reset)}>{c.startAgain}</Button></div>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
    </div>}
  </section>;
}
