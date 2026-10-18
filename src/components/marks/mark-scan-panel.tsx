"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { ModalFrame } from "@/components/shared-admin";
import { useUiText } from "@/components/locale/LocaleProvider";
import { scanQuality } from "@/lib/school-ai/scan";
import { cn } from "@/lib/utils";

// SKO-412: print a marks sheet, photograph its pages, review every mark beside its crop, approve, import.
// Capture, review and import are separate steps; nothing reaches the gradebook before an explicit import
// of an approved scan, and imported marks still go through the usual exam and report approval.

type Ui = ReturnType<typeof useUiText>;
type Cell = { id: string; pageNumber: number; rowNumber: number; studentId: string; name: string; rollNo: string; enrolled: boolean; proposedValue: number | null; proposedAbsent: boolean; confidence: number | null; alternatives: number[]; reviewedValue: number | null; reviewedAbsent: boolean; status: string; corrected: boolean; pageImage: string | null; crop: { top: number; height: number }; current: { marksObtained: number; isAbsent: boolean } | null; changedSinceScan: boolean };
type View = { batch: { id: string; status: string; version: number; receipt: { changed: { studentId: string; before: { marksObtained: number; isAbsent: boolean } | null; after: { marksObtained: number; isAbsent: boolean } }[]; kept: string[]; unchanged: string[]; excluded: number; corrected: number } | null }; template: { id: string; version: number; pageCount: number; maxMarks: number }; exam: { title: string; locked: boolean }; subject: { name: string }; pages: { id: string; pageNumber: number; status: string; reason: string | null }[]; missingPages: number[]; cells: Cell[]; counts: { needsReview: number; reviewed: number; excluded: number } };
type Sheet = { id: string; version: number; maxMarks: number; examTitle: string; subjectName: string; className: string; pages: { page: number; code: string; qr: string; rows: { row: number; rollNo: string; name: string }[] }[] };

async function call(url: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) { const error = new Error(json.error || "The change was not saved.") as Error & { status?: number }; error.status = response.status; throw error; }
  return json.data;
}
const markText = (ui: Ui, m: { marksObtained: number; isAbsent: boolean } | null) => !m ? ui("No mark") : m.isAbsent ? ui("Absent") : String(m.marksObtained);
const key = () => `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Read a photo, measure blur/contrast on a downscaled copy and try to read the page QR. */
async function inspect(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(3, Math.round(bitmap.width * scale)); canvas.height = Math.max(3, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const quality = scanQuality(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  let qr: string | null = null;
  const Detector = (window as unknown as { BarcodeDetector?: new (o: unknown) => { detect: (s: unknown) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Detector) { try { const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap); qr = codes.map(c => c.rawValue).find(v => v.startsWith("SKMS1:")) ?? null; } catch { qr = null; } }
  const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = reject; reader.readAsDataURL(file); });
  return { image, contentType: file.type || "image/jpeg", quality, qr };
}

export function MarkScanPanel({ examId, subjects, onImported }: { examId: string; subjects: { id: string; name: string }[]; onImported: () => void }) {
  const ui = useUiText();
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [sheet, setSheet] = useState<Sheet | null>(null), [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false);
  const [qrText, setQrText] = useState(""), [pending, setPending] = useState<Awaited<ReturnType<typeof inspect>> | null>(null);
  const [editing, setEditing] = useState<Cell | null>(null), [value, setValue] = useState(""), [absent, setAbsent] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, "overwrite" | "keep">>({}), [importOpen, setImportOpen] = useState(false), [commitKey] = useState(key);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!subjectId && subjects[0]) setSubjectId(subjects[0].id); }, [subjects, subjectId]);
  const refresh = useCallback(async (id: string) => setView(await call(`/api/marks-scan/${id}`, "GET")), []);
  const run = async (work: () => Promise<unknown>, done?: string) => { setBusy(true); try { await work(); if (done) toast.success(ui(done)); } catch (e) { toast.error(ui(e instanceof Error ? e.message : "The change was not saved.")); } finally { setBusy(false); } };

  const printSheet = () => run(async () => { const t = await call("/api/marks-scan", "POST", { action: "template", examId, subjectId }); setSheet(await call(`/api/marks-scan/template/${t.id}`, "GET")); });
  const start = () => run(async () => { const list = await call(`/api/marks-scan?examId=${examId}&subjectId=${subjectId}`, "GET"); const latest = list[0]; if (!latest) throw new Error("Print a marks sheet first.");
    // Resume the open scan of the latest sheet version rather than starting over.
    const open = (latest.batches as { id: string; status: string }[]).find(b => ["CAPTURING", "REVIEW", "APPROVED"].includes(b.status));
    await refresh(open ? open.id : (await call("/api/marks-scan", "POST", { action: "start", templateId: latest.id })).id); });
  const chooseFile = async (file: File | undefined) => { if (!file) return; try { const info = await inspect(file); setPending(info); setQrText(info.qr ?? ""); } catch { toast.error(ui("That photo could not be read. Try another one.")); } };
  const sendPage = () => run(async () => {
    if (!view || !pending) return;
    const result = await call(`/api/marks-scan/${view.batch.id}`, "POST", { action: "page", qr: qrText.trim(), image: pending.image, contentType: pending.contentType, sharpness: pending.quality.sharpness, contrast: pending.quality.contrast });
    toast[result.status === "RETAKE" ? "error" : "success"](result.status === "RETAKE" ? ui("Page {0} is too blurred or faint. Retake it.", [String(result.page)]) : result.status === "DUPLICATE" ? ui("Page {0} was already captured.", [String(result.page)]) : ui("Page {0} captured.", [String(result.page)]));
    setPending(null); setQrText(""); if (fileRef.current) fileRef.current.value = ""; await refresh(view.batch.id);
  });
  const openCell = (cell: Cell) => { setEditing(cell); setAbsent(cell.status === "REVIEWED" ? cell.reviewedAbsent : cell.proposedAbsent); setValue(cell.status === "REVIEWED" ? (cell.reviewedValue ?? "").toString() : cell.proposedValue !== null ? String(cell.proposedValue) : ""); };
  const saveCell = (exclude = false) => run(async () => { if (!view || !editing) return; await call(`/api/marks-scan/${view.batch.id}`, "POST", { action: "review", cellId: editing.id, value: Number(value), absent, exclude, knownVersion: view.batch.version }); setEditing(null); await refresh(view.batch.id); });
  const approve = () => run(async () => { if (!view) return; await call(`/api/marks-scan/${view.batch.id}`, "POST", { action: "approve", knownVersion: view.batch.version }); await refresh(view.batch.id); }, "Scan approved. Review the changes, then import.");
  const commit = () => run(async () => {
    if (!view) return;
    try { await call(`/api/marks-scan/${view.batch.id}`, "POST", { action: "commit", commitKey, knownVersion: view.batch.version, decisions }); setImportOpen(false); onImported(); await refresh(view.batch.id); toast.success(ui("Marks imported. Review and publish results through the usual workflow.")); }
    catch (e) { const message = e instanceof Error ? e.message : ""; if (message.includes("CONFLICTS")) { toast.error(ui("Some marks changed since the scan began. Choose for each one.")); await refresh(view.batch.id); return; } throw e; }
  });
  const reverse = () => run(async () => { if (!view) return; try { await call(`/api/marks-scan/${view.batch.id}`, "POST", { action: "reverse" }); onImported(); await refresh(view.batch.id); toast.success(ui("Import reversed.")); } catch (e) { if ((e instanceof Error ? e.message : "").includes("CHANGED_SINCE_IMPORT")) throw new Error("Some marks changed after the import, so it cannot be reversed automatically."); throw e; } });

  const conflicts = view?.cells.filter(c => c.status === "REVIEWED" && c.changedSinceScan) ?? [];
  const changes = view?.cells.filter(c => c.status === "REVIEWED" && (c.current?.marksObtained !== (c.reviewedAbsent ? 0 : c.reviewedValue) || (c.current?.isAbsent ?? false) !== c.reviewedAbsent)) ?? [];
  return <section className="sk-panel space-y-4 p-5" data-mark-scan data-scan-status={view?.batch.status ?? ""}>
    <header><h3 className="text-base font-bold text-ink-strong">{ui("Scan a paper marks sheet")}</h3><p className="text-xs text-ink-muted">{ui("Print the sheet, write the marks, photograph each page. You check every mark before anything reaches the gradebook.")}</p></header>
    <div className="flex flex-wrap items-end gap-2">
      <FormField name="scan-subject" label={ui("Subject")}><Select value={subjectId} onChange={e => setSubjectId(e.target.value)}>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField>
      <Button variant="outline" disabled={busy || !examId || !subjectId} onClick={() => void printSheet()} data-scan-print>{ui("Print marks sheet")}</Button>
      <Button disabled={busy || !examId || !subjectId} onClick={() => void start()} data-scan-start>{ui("Start a scan")}</Button>
    </div>
    {view ? <>
      <p className="text-sm font-semibold text-ink-strong" data-scan-summary>{ui("Sheet version {0}", [String(view.template.version)])} · {ui("Pages {0} of {1}", [String(view.template.pageCount - view.missingPages.length), String(view.template.pageCount)])} · {ui("To review: {0}", [String(view.counts.needsReview)])}{view.exam.locked ? <> · <span className="text-rose-700">{ui("Exam locked")}</span></> : null}</p>
      {["CAPTURING", "REVIEW", "APPROVED"].includes(view.batch.status) ? <div className="space-y-2 rounded-xl border border-dashed p-3" data-scan-capture>
        <p className="text-xs font-semibold text-ink-strong">{ui("Step 1 · Capture")}</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={e => void chooseFile(e.target.files?.[0])} data-scan-file aria-label={ui("Photo of a page")} />
        {pending ? <div className="flex flex-wrap items-end gap-2">
          <p className={cn("text-xs", pending.quality.blurRisk || pending.quality.lowContrast ? "font-bold text-rose-700" : "text-ink-muted")}>{pending.quality.blurRisk ? ui("This photo looks blurred.") : pending.quality.lowContrast ? ui("This photo is very faint.") : ui("Photo looks readable.")}</p>
          <FormField name="scan-code" label={ui("Code under the QR")} hint={ui("Filled in when the QR is read; otherwise type the code printed under it.")}><Input value={qrText} onChange={e => setQrText(e.target.value)} dir="ltr" /></FormField>
          <Button disabled={busy || !qrText.trim()} onClick={() => void sendPage()} data-scan-send>{ui("Add this page")}</Button>
        </div> : null}
        {view.pages.length ? <ul className="text-xs">{view.pages.map(p => <li key={p.id} data-scan-page={p.pageNumber} data-page-status={p.status}>{ui("Page {0}", [String(p.pageNumber)])}: {p.status === "ACCEPTED" ? ui("captured") : p.status === "RETAKE" ? ui("retake needed") : ui("replaced by a newer photo")}</li>)}</ul> : null}
        {view.missingPages.length ? <p className="text-xs font-bold text-amber-800" data-scan-missing>{ui("Still needed: page {0}", [view.missingPages.join(", ")])}</p> : null}
      </div> : null}
      {view.cells.length ? <div className="space-y-2" data-scan-review>
        <p className="text-xs font-semibold text-ink-strong">{ui("Step 2 · Check every mark")}</p>
        <ul className="divide-y divide-edge/20">{view.cells.map(cell => <li key={cell.id} className="flex flex-wrap items-center gap-2 py-1.5" data-scan-cell={cell.studentId} data-cell-status={cell.status}>
          <span className="w-10 text-xs text-ink-muted"><bdi>{cell.rowNumber}</bdi></span>
          <span className="min-w-[160px] flex-1 text-sm font-bold"><bdi>{cell.name}</bdi>{!cell.enrolled ? <span className="ms-2 text-xs text-rose-700">{ui("No longer in the class")}</span> : null}</span>
          <span className="text-xs">{cell.status === "REVIEWED" ? <>{ui("Checked")}: <bdi>{cell.reviewedAbsent ? ui("Absent") : cell.reviewedValue}</bdi></> : cell.status === "EXCLUDED" ? ui("Left out") : cell.proposedValue !== null || cell.proposedAbsent ? <>{ui("Read as")} <bdi>{cell.proposedAbsent ? ui("Absent") : cell.proposedValue}</bdi>{cell.confidence !== null && cell.confidence < 0.9 ? <span className="ms-1 font-bold text-amber-800">{ui("uncertain")}</span> : null}</> : ui("Not read — type it")}</span>
          <Button size="sm" variant={cell.status === "NEEDS_REVIEW" ? "default" : "outline"} disabled={view.batch.status === "COMMITTED" || view.batch.status === "REVERSED"} onClick={() => openCell(cell)} data-scan-check>{cell.status === "NEEDS_REVIEW" ? ui("Check") : ui("Change")}</Button>
        </li>)}</ul>
      </div> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {view.batch.status === "REVIEW" ? <Button disabled={busy || view.counts.needsReview > 0 || view.missingPages.length > 0} onClick={() => void approve()} data-scan-approve>{ui("Approve checked marks")}</Button> : null}
        {view.batch.status === "APPROVED" ? <Button disabled={busy || view.exam.locked} onClick={() => setImportOpen(true)} data-scan-import>{ui("Review import")}</Button> : null}
        {view.batch.status === "COMMITTED" ? <Button variant="outline" disabled={busy} onClick={() => void reverse()} data-scan-reverse>{ui("Reverse this import")}</Button> : null}
      </div>
      {view.batch.receipt ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" data-scan-receipt>{ui("Imported {0} marks · unchanged {1} · left out {2} · kept other changes {3}. Results stay unpublished until approved as usual.", [String(view.batch.receipt.changed.length), String(view.batch.receipt.unchanged.length), String(view.batch.receipt.excluded), String(view.batch.receipt.kept.length)])}{view.batch.status === "REVERSED" ? <> {ui("This import was reversed.")}</> : null}</div> : null}
    </> : null}
    {editing && view ? <ModalFrame title={editing.name} eyebrow={ui("Check this mark")} subtitle={ui("Row {0} · page {1}", [String(editing.rowNumber), String(editing.pageNumber)])} onClose={() => setEditing(null)} wide>
      <div className="space-y-3" data-scan-cell-dialog>
        {editing.pageImage ? <div className="h-24 w-full overflow-hidden rounded-lg border bg-white" aria-label={ui("Photo of this row")} role="img" style={{ backgroundImage: `url(${editing.pageImage})`, backgroundSize: "100% auto", backgroundRepeat: "no-repeat", backgroundPosition: `0 ${(editing.crop.top / Math.max(0.0001, 1 - editing.crop.height)) * 100}%` }} data-scan-crop /> : null}
        {editing.alternatives.length ? <p className="text-sm font-bold text-amber-900">{ui("Please confirm this mark: {0}", [[editing.proposedValue, ...editing.alternatives].filter(v => v !== null).join(" / ")])}</p> : null}
        <div className="flex flex-wrap items-end gap-3">
          <FormField name="scan-value" label={ui("Mark out of {0}", [String(view.template.maxMarks)])}><Input type="number" min={0} max={view.template.maxMarks} step={1} value={value} disabled={absent} onChange={e => setValue(e.target.value)} dir="ltr" /></FormField>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={absent} onChange={e => setAbsent(e.target.checked)} data-scan-absent /> {ui("Absent")}</label>
          <p className="text-xs text-ink-muted">{ui("In the gradebook now: {0}", [markText(ui, editing.current)])}{editing.changedSinceScan ? <> · <span className="font-bold text-amber-800">{ui("changed since this scan began")}</span></> : null}</p>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => void saveCell(true)} data-scan-exclude>{ui("Leave out of this import")}</Button><Button disabled={busy || (!absent && value === "")} onClick={() => void saveCell()} data-scan-confirm>{ui("Confirm")}</Button></div>
      </div>
    </ModalFrame> : null}
    {importOpen && view ? <ModalFrame title={ui("Import marks")} eyebrow={view.exam.title} subtitle={view.subject.name} onClose={() => setImportOpen(false)} wide>
      <div className="space-y-3" data-scan-import-dialog>
        <p className="text-sm">{ui("These marks will change in the gradebook:")}</p>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">{changes.map(c => <li key={c.id} data-import-change={c.studentId}><bdi>{c.name}</bdi>: <bdi>{markText(ui, c.current)}</bdi> → <bdi>{c.reviewedAbsent ? ui("Absent") : c.reviewedValue}</bdi>
          {c.changedSinceScan ? <span className="ms-2 inline-flex gap-2 text-xs font-bold text-amber-900" data-import-conflict={c.studentId}>{ui("Changed by someone else since the scan began:")}
            <label><input type="radio" name={`d-${c.studentId}`} checked={decisions[c.studentId] === "overwrite"} onChange={() => setDecisions({ ...decisions, [c.studentId]: "overwrite" })} data-decide="overwrite" /> {ui("Use the scan")}</label>
            <label><input type="radio" name={`d-${c.studentId}`} checked={decisions[c.studentId] === "keep"} onChange={() => setDecisions({ ...decisions, [c.studentId]: "keep" })} data-decide="keep" /> {ui("Keep the current mark")}</label></span> : null}</li>)}</ul>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setImportOpen(false)}>{ui("Back")}</Button><Button disabled={busy || conflicts.some(c => !decisions[c.studentId])} onClick={() => void commit()} data-scan-commit>{ui("Import {0} marks", [String(changes.filter(c => !(c.changedSinceScan && decisions[c.studentId] === "keep")).length)])}</Button></div>
      </div>
    </ModalFrame> : null}
    {sheet ? <ModalFrame title={ui("Marks sheet")} eyebrow={`${sheet.examTitle} · ${sheet.subjectName}`} subtitle={ui("Sheet version {0} · {1}", [String(sheet.version), sheet.className])} onClose={() => setSheet(null)} wide>
      <div className="space-y-6" data-scan-sheet>
        {sheet.pages.map(page => <div key={page.page} className="space-y-2 break-after-page" data-sheet-page={page.page}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink-strong">{ui("Page {0} of {1}", [String(page.page), String(sheet.pages.length)])}</p><p className="text-xs">{ui("Write a whole mark out of {0}, or A for absent.", [String(sheet.maxMarks)])}</p></div><div className="text-center"><img src={page.qr} alt={ui("Page code")} width={96} height={96} /><p className="font-mono text-2xs" dir="ltr">{page.code}</p></div></div>
          <table className="w-full border-collapse text-sm"><thead><tr><th className="border p-1 text-start">#</th><th className="border p-1 text-start">{ui("Roll")}</th><th className="border p-1 text-start">{ui("Pupil")}</th><th className="border p-1 w-28">{ui("Mark")}</th></tr></thead>
            <tbody>{page.rows.map(r => <tr key={r.row}><td className="border p-1"><bdi>{r.row}</bdi></td><td className="border p-1"><bdi>{r.rollNo}</bdi></td><td className="border p-1"><bdi>{r.name}</bdi></td><td className="border p-1 h-9"></td></tr>)}</tbody></table>
        </div>)}
        <div className="flex justify-end"><Button onClick={() => window.print()}>{ui("Print")}</Button></div>
      </div>
    </ModalFrame> : null}
  </section>;
}
