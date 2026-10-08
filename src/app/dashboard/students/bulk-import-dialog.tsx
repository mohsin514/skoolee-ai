"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv";
import { useUiText } from "@/components/locale/LocaleProvider";

interface ClassRecord { id: string; name: string; section?: string | null; academicYear: number }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; classes: ClassRecord[]; defaultClassId: string; onSuccess: () => void }
interface ImportRow { rowNumber: number; source: Record<string, string>; proposal: Record<string, unknown> | null; state: string; selected: boolean; matchKey: string | null; matchLabel?: string | null; errors: string[] }
interface Batch { id: string; campusId: string; kind: string; state: string; expiresAt: string; summary: { total: number; accepted: number; rejected: number; skipped: number; unresolved: number }; rows?: ImportRow[]; receipt?: Record<string, any> | null }
interface ReversalAnalysis { eligible: boolean; dependencies: Array<{ studentName: string; rollNo: string; references: string[] }>; missing: string[]; action: string }

const CSV_TEMPLATE = "fullName,rollNo,classId,gender,dateOfBirth,phone,studentEmail,guardianName,guardianPhone,guardianWhatsapp,guardianEmail,address,city,medicalNotes\nAli Ahmed Khan,V-A-001,,MALE,2010-03-15,+92 3001234567,ali@example.com,Ahmed Khan,+92 3001234567,,ahmed@example.com,123 Mosque Lane,Lahore,None";

export function BulkImportDialog({ open, onOpenChange, classes, defaultClassId, onSuccess }: Props) {
  const t = useUiText();
  const input = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<ReversalAnalysis | null>(null);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const rows = batch?.rows || [];
  const committed = !!batch && ["COMMITTED", "PARTIAL", "REVERSED"].includes(batch.state);
  const batchUrl = (id: string) => "/api/import-batches/" + id + (batch?.campusId ? "?campusId=" + encodeURIComponent(batch.campusId) : "");

  const reset = () => { setFileName(""); setBatch(null); setAnalysis(null); setConfirmReverse(false); if (input.current) input.current.value = ""; };
  const changeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error(t("Only CSV files are accepted")); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t("File size must be under 5MB")); return; }
    setFileName(file.name); setBatch(null); setBusy(true);
    try {
      const response = await fetch("/api/import-batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "STUDENT_ROSTER", sourceName: file.name, csvText: await file.text(), defaultClassId }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Could not validate this file"));
      setBatch(result.data as Batch); toast.success(t("File validated. Review every row before commit."));
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not validate this file")); }
    finally { setBusy(false); }
  };
  const selectRow = async (row: ImportRow, selected: boolean) => {
    if (!batch) return;
    try {
      const response = await fetch(batchUrl(batch.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [{ rowNumber: row.rowNumber, selected }] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Could not save row selection"));
      setBatch(result.data as Batch);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not save row selection")); }
  };
  const updateProposal = async (row: ImportRow, proposal: Record<string, unknown>) => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(batchUrl(batch.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [{ rowNumber: row.rowNumber, proposal }] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Could not save row decision"));
      setBatch(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not save row decision")); }
    finally { setBusy(false); }
  };
  const skipRow = async (row: ImportRow) => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(batchUrl(batch.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: [{ rowNumber: row.rowNumber, skip: true }] }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Could not save row decision"));
      setBatch(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not save row decision")); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!batch || batch.summary.accepted < 1) return;
    setBusy(true);
    try {
      const response = await fetch("/api/students?campusId=" + encodeURIComponent(batch.campusId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _importBatchId: batch.id }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Import failed"));
      const receipt = result.receipt || null;
      const summary = receipt?.summary || {};
      setBatch({ ...batch, state: result.importBatchState || (summary.skipped || summary.rejected || summary.unresolved ? "PARTIAL" : "COMMITTED"), rows: undefined, receipt, summary: { total: summary.total || batch.summary.total, accepted: summary.committed || batch.summary.accepted, skipped: summary.skipped || 0, rejected: summary.rejected || 0, unresolved: summary.unresolved || 0 } });
      toast.success(result.message || t("Import committed. Review the batch receipt."));
      if (result.guardianInviteFailures?.length || result.studentInviteFailures?.length) toast.warning(t("Some account invitation emails could not be sent."));
      onSuccess();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Import failed")); }
    finally { setBusy(false); }
  };
  const checkReversal = async () => {
    if (!batch) return;
    try {
      const response = await fetch(batchUrl(batch.id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reversal-check" }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Could not check reversal dependencies"));
      setAnalysis(result.data as ReversalAnalysis);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not check reversal dependencies")); }
  };
  const reverse = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(batchUrl(batch.id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse" }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("Reversal failed"));
      setBatch({ ...batch, state: "REVERSED", rows: undefined, receipt: result.data.receipt }); setAnalysis(null); setConfirmReverse(false);
      toast.success(t("Batch reversed. The reversal receipt is retained.")); onSuccess();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Reversal failed")); }
    finally { setBusy(false); }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["\uFEFF", CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "student_import_template.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const downloadErrors = () => batch && downloadCSV("student_import_" + batch.id + "_corrections.csv", [["row", "match_key", "validation_errors", "source_row"], ...rows.filter((row) => row.errors.length).map((row) => [row.rowNumber, row.matchKey || "", row.errors.join("; "), JSON.stringify(row.source)])]);
  const close = () => { if (committed) onSuccess(); reset(); onOpenChange(false); };

  return <Dialog open={open} onOpenChange={close}><DialogContent size="md">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#8127cf]" />{t("Bulk Student Import")}</DialogTitle><DialogDescription>{t("Upload and validate first. Live pupil records change only when you commit this reviewed batch.")}</DialogDescription></DialogHeader>
    <div className="space-y-4" dir="auto">
      {committed && batch ? <section aria-live="polite" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <p className="font-bold">{batch.state === "REVERSED" ? t("Batch reversed") : t("Batch receipt")}</p>
        <p>{t("{0} pupil records committed; {1} skipped; {2} need correction.", [batch.summary.accepted, batch.summary.skipped, batch.summary.rejected + batch.summary.unresolved])}</p>
        <p className="font-mono text-xs" dir="ltr">{batch.id}</p>
        {analysis && <div className="space-y-2 rounded-xl bg-white p-3 text-sm"><p className="font-bold">{analysis.eligible ? t("Reversal is eligible") : t("Reversal is blocked")}</p><p>{t(analysis.action)}</p>{analysis.dependencies.map((item) => <p key={item.studentName + item.rollNo} className="text-rose-700">{item.studentName} ({item.rollNo}): {item.references.join(", ")}</p>)}{analysis.missing.length > 0 && <p>{t("Some pupil records are no longer available in this campus.")}</p>}</div>}
        {confirmReverse && analysis?.eligible && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><p>{t("This deletes only unchanged pupils created by this batch. The action is recorded in the receipt.")}</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => setConfirmReverse(false)}>{t("Cancel")}</Button><Button variant="destructive" disabled={busy} onClick={() => void reverse()}>{t("Reverse batch")}</Button></div></div>}
        {batch.state !== "REVERSED" && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void checkReversal()}>{t("Check reversal")}</Button>{analysis?.eligible && !confirmReverse && <Button variant="destructive" onClick={() => setConfirmReverse(true)}>{t("Reverse batch")}</Button>}</div>}
      </section> : <>
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#cfc2d6]/30 bg-[#fbf0fe]/30 p-6">
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void changeFile(event)} />
          {fileName ? <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#8127cf]" /><span className="font-bold">{fileName}</span><button type="button" aria-label={t("Choose a different file")} className="p-1" onClick={reset}><X className="h-4 w-4" /></button></div> : <><Upload className="h-8 w-8 text-[#8127cf]/50" /><p className="text-sm font-bold">{t("Choose a CSV to stage a preview. Upload does not commit records.")}</p></>}
          <div className="flex flex-wrap justify-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />{fileName ? t("Choose Different File") : t("Choose CSV File")}</Button><Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4" />{t("Download Template")}</Button></div>
        </div>
        {busy && <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t("Validating rows. Live records are unchanged.")}</p>}
        {batch && <section className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap gap-2 text-xs font-bold"><Badge variant="success">{t("{0} selected", [batch.summary.accepted])}</Badge><Badge variant="destructive">{t("{0} rejected", [batch.summary.rejected])}</Badge><Badge>{t("{0} skipped", [batch.summary.skipped])}</Badge><Badge>{t("{0} unresolved", [batch.summary.unresolved])}</Badge><span>{t("{0} total rows", [batch.summary.total])}</span></div>
          <p className="text-xs text-ink-muted">{t("Match key: campus + class + roll number. Existing pupils are never overwritten. Staging expires {0}.", [new Date(batch.expiresAt).toLocaleString()])}</p>
          {rows.some((row) => row.errors.length) && <Button size="sm" variant="outline" onClick={downloadErrors}><Download className="h-4 w-4" />{t("Download corrections")}</Button>}
          <div className="max-h-80 overflow-auto rounded-2xl border border-[#cfc2d6]/15"><table className="w-full text-sm"><thead><tr><th>{t("Include")}</th><th dir="ltr">{t("Row")}</th><th>{t("Name")}</th><th>{t("Roll No")}</th><th>{t("Match key")}</th><th>{t("Status")}</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.rowNumber} className="border-t"><td>{row.state === "ACCEPTED" && <input type="checkbox" aria-label={t("Include row {0}", [row.rowNumber])} checked={row.selected} onChange={(event) => void selectRow(row, event.target.checked)} />}</td><td dir="ltr">{row.rowNumber}</td><td>{String(row.proposal?.fullName || "—")}</td><td dir="ltr">{row.proposal && (row.state === "UNRESOLVED" || row.state === "REJECTED") ? <input key={String(row.proposal.rollNo)} aria-label={t("Roll number for row {0}", [row.rowNumber])} defaultValue={String(row.proposal.rollNo || "")} className="w-24 rounded border px-1" onBlur={(event) => { if (event.currentTarget.value !== String(row.proposal?.rollNo || "")) void updateProposal(row, { rollNo: event.currentTarget.value }); }} /> : String(row.proposal?.rollNo || "—")}</td><td dir="ltr">{row.matchKey || "—"}{row.matchLabel && <span className="block" dir="auto">{row.matchLabel}</span>}{row.proposal && (row.state === "UNRESOLVED" || row.state === "REJECTED") && <div className="mt-1 flex flex-wrap gap-1"><select aria-label={t("Class for row {0}", [row.rowNumber])} className="max-w-32 rounded border px-1" value={String(row.proposal.classId || "")} onChange={(event) => void updateProposal(row, { classId: event.target.value })}>{classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}{cls.section ? " · " + cls.section : ""}</option>)}</select><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void skipRow(row)}>{t("Skip row")}</Button></div>}</td><td><Badge variant={row.state === "ACCEPTED" ? "success" : row.state === "SKIPPED" ? "outline" : "destructive"}>{t(row.state)}</Badge>{row.errors.length > 0 && <span className="mt-1 block max-w-56 text-xs text-rose-700" role="note">{row.errors.join("; ")}</span>}</td></tr>)}
          </tbody></table></div>
        </section>}
      </>}
    </div>
    <DialogFooter><Button type="button" variant="outline" onClick={close}>{committed ? t("Done") : t("Cancel")}</Button>{batch?.state === "STAGED" && <Button type="button" onClick={() => void commit()} disabled={busy || batch.summary.accepted === 0}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" />{t("Committing...")}</> : <><CheckCircle2 className="h-4 w-4" />{t("Commit {0} selected pupils", [batch.summary.accepted])}</>}</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}
