"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, ExternalLink, FileText, Loader2, Plus, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskStatus } from "@/components/ui/task-patterns";
import { schoolAICopy, interpolateAI } from "@/lib/school-ai/copy";
import type { Language } from "@/lib/locale/package";
import type { AiWorkspaceRecord, SourceData } from "@/lib/school-ai/types";
import { workspaceErrorText, type SaveRecord, type RecordAction } from "./workspace-client";
import styles from "./school-ai.module.css";
import { useWorkspaceDraft, useWorkspaceDraftNavigation } from "./draft-safety";
import { SourceImagePreview } from "./source-image-preview";
import { RosterImport } from "./roster-import";
import { DocumentJobsPanel } from "./document-jobs-panel";
import { PhoneCaptureButton } from "./phone-capture";
import { ScanComposer } from "./scan-composer";
import { scanCopy } from "./scan-copy";
import { SourceStructureReview } from "./source-structure-review";
import { sourceStructureApprovalIssues } from "@/lib/school-ai/intake";

export const SOURCE_KINDS = ["syllabus", "paper", "answer_script", "register", "fee_sheet", "timetable", "staff_list", "policy", "other"] as const;
export function SourceLibrary({ language, records, canCreate, canApprove, onSave, onAction, onUpload, scope, uploading, campusId, canImportRoster, canArchive, onRecord }: {
  language: Language; records: AiWorkspaceRecord[]; canCreate: boolean; canApprove: boolean;
  onSave: SaveRecord; onAction: RecordAction; onUpload: (file: File, origin: "upload" | "camera", documentKind: SourceData["documentKind"], signal?: AbortSignal) => Promise<void>;
  scope: { subjectId?: string; classId?: string }; uploading: boolean;
  campusId?: string | null; canImportRoster?: boolean; canArchive?: boolean; onRecord: (record: AiWorkspaceRecord) => void;
}) {
  const c = schoolAICopy(language);
  const guard = useWorkspaceDraftNavigation();
  const [showArchived,setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [kind, setKind] = useState<SourceData["documentKind"]>("syllabus");
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const sources = records.filter(record => record.kind === "SOURCE" && (showArchived || record.status !== "ARCHIVED"));
  const selectedRecord = sources.find(record => record.id === selected);
  const upload = (file: File | undefined, origin: "upload" | "camera") => { if (file) void onUpload(file, origin, kind).catch(() => {}); };
  return <div className="space-y-5">
    {canImportRoster && <RosterImport key={campusId ?? "no-campus"} language={language} campusId={campusId} />}
    <section className={`sk-panel ${styles.panel}`}><h2 className={styles.sectionTitle}>{c.uploadTitle}</h2><p className={styles.description}>{c.uploadHint}</p>
      <div className="flex flex-wrap items-end gap-3"><FormField name="source-kind" label={c.documentKind} className="min-w-48 flex-1"><Select value={kind} disabled={uploading} onChange={event => setKind(event.target.value as SourceData["documentKind"])}>{SOURCE_KINDS.map(key => <option key={key} value={key}>{c[key]}</option>)}</Select></FormField>
        <Button disabled={!canCreate || uploading} onClick={() => uploadRef.current?.click()}>{uploading ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}{uploading ? c.uploadWorking : c.attach}</Button><Button variant="outline" disabled={!canCreate || uploading} title={c.scanHint} onClick={() => cameraRef.current?.click()}><Camera aria-hidden="true" />{c.scan}</Button><Button variant="outline" disabled={!canCreate || uploading} onClick={() => guard(() => setScanning(true))}><Camera aria-hidden="true" />{scanCopy(language).open}</Button><Button variant="ghost" disabled={!canCreate || uploading} onClick={() => guard(() => { setCreating(true); setSelected(null); })}><Plus aria-hidden="true" />{c.manualSource}</Button>
        {campusId && <PhoneCaptureButton scope={{...scope,campusId,documentKind:kind,language}} disabled={!canCreate || uploading} />}
      </div><p className="mt-3 text-xs text-ink-muted">{c.uploadSize}</p>
      <Input ref={uploadRef} type="file" className="hidden" tabIndex={-1} aria-label={c.attach} accept="application/pdf,image/jpeg,image/png,image/webp,text/plain,text/csv,.csv" onChange={event => { upload(event.target.files?.[0], "upload"); event.target.value = ""; }} />
      <Input ref={cameraRef} type="file" className="hidden" tabIndex={-1} aria-label={c.scan} capture="environment" accept="image/jpeg,image/png,image/webp" onChange={event => { upload(event.target.files?.[0], "camera"); event.target.value = ""; }} />
    </section>
    <div className={styles.sourceGrid}><section className={`sk-panel ${styles.panel}`}><h2 className="mb-4 font-bold">{c.sources}</h2><label className="mb-4 flex items-center gap-2 text-sm"><Checkbox checked={showArchived} onChange={e=>guard(()=>{setShowArchived(e.target.checked);setSelected(null);setCreating(false);})}/>{language==="ar"?"عرض المؤرشف":language==="ur"?"آرکائیو بھی دکھائیں":"Include archived sources"}</label>{!sources.length ? <div className={styles.empty}><span className={styles.emptyIcon}><FileText aria-hidden="true" /></span><h3 className="font-bold">{c.noSources}</h3><p className={styles.description}>{c.noSourcesHint}</p></div> : <div className={styles.recordList}>{sources.map(record => <Button key={record.id} variant="choice" aria-pressed={selected === record.id} className="w-full justify-start text-start" onClick={() => guard(() => { setSelected(record.id); setCreating(false); })}><span className="min-w-0 flex-1"><span className="block break-words">{record.title}</span><span className="mt-1 block text-xs font-medium text-ink-muted">{c[record.status]} · {interpolateAI(c.version, { version: record.version })}</span></span></Button>)}</div>}</section>
      {selectedRecord || creating ? <SourceEditor key={selectedRecord ? `${selectedRecord.id}:${selectedRecord.version}` : "new"} language={language} record={selectedRecord} documentKind={kind} scope={scope} canApprove={canApprove && selectedRecord?.status !== "ARCHIVED"} canCreate={canCreate && selectedRecord?.status !== "ARCHIVED"} canArchive={Boolean(canArchive)} onSave={onSave} onAction={onAction} onCreated={record => { onRecord(record); setSelected(record.id); setCreating(false); }} /> : <section className={`sk-panel ${styles.panel}`}><div className={styles.empty}><FileText aria-hidden="true" className="mx-auto mb-3 size-8 text-ink-muted" /><p className="font-semibold">{c.selectRecord}</p></div></section>}
    </div>
    {scanning && <ScanComposer language={language} campusId={campusId} scope={scope} documentKind={kind} onUpload={onUpload} onClose={() => setScanning(false)} />}
  </div>;
}
function SourceEditor({ language, record, documentKind, scope, canApprove, canCreate, canArchive, onSave, onAction, onCreated }: {
  language: Language; record?: AiWorkspaceRecord; documentKind: SourceData["documentKind"]; scope: { subjectId?: string; classId?: string }; canApprove: boolean; canCreate: boolean; canArchive: boolean; onSave: SaveRecord; onAction: RecordAction; onCreated: (record: AiWorkspaceRecord) => void;
}) {
  const c = schoolAICopy(language);
  const originalData = (record?.data || { documentKind, extractedText: "", fileName: "", mimeType: "text/plain", origin: "manual", extractionStatus: "needs_review", uncertainties: [], ...scope }) as SourceData;
  const [title, setTitle] = useState(record?.title || "");
  const [text, setText] = useState(originalData.extractedText);
  const [structure,setStructure]=useState({sourcePages:originalData.sourcePages,expectedPageCount:originalData.expectedPageCount,missingPages:originalData.missingPages,structureReviewed:originalData.structureReviewed});
  const structureDirty=JSON.stringify(structure)!==JSON.stringify({sourcePages:originalData.sourcePages,expectedPageCount:originalData.expectedPageCount,missingPages:originalData.missingPages,structureReviewed:originalData.structureReviewed});
  const structureIssues=sourceStructureApprovalIssues({...structure,extractedText:text});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(Boolean(record && originalData.extractionStatus !== "needs_review" && !originalData.uncertainties?.length));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const reviewChanges = reviewed && (originalData.extractionStatus === "needs_review" || Boolean(originalData.uncertainties?.length));
  const dirty = !record || record.title !== title || originalData.extractedText !== text || reviewChanges || structureDirty;
  useWorkspaceDraft(dirty && Boolean(record || title.trim() || text.trim()));
  const run = async (action: "save" | "approve" | "review") => {
    if (!title.trim() || !text.trim()) { setError(c.required); return; }
    if (action !== "save" && (!reviewed || dirty)) { setError(dirty ? c.reviewBeforeApproval : c.sourceReviewRequired); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = dirty ? await onSave("SOURCE", title.trim(), { ...originalData,...structure, extractedText: text, ...(reviewed ? { extractionStatus: originalData.origin === "manual" ? "manual" : "extracted", uncertainties: [] } : originalData.extractedText !== text || structureDirty ? { extractionStatus: "needs_review" } : {}) }, record, idempotencyKey) : record!;
      const result = action !== "save" ? await onAction(saved, action) : saved;
      onCreated(result); setNotice(c.saved);
    } catch (error) { setError(workspaceErrorText(error, c)); }
    finally { setBusy(false); }
  };
  return <section className={`sk-panel ${styles.panel}`} aria-busy={busy}><div className="mb-5 flex items-center justify-between gap-3"><h2 className={styles.sectionTitle}>{record ? c.reviewRecord : c.manualSource}</h2>{record && <TaskStatus attention={record.status !== "APPROVED"}>{c[record.status]}</TaskStatus>}</div>
    <div className="space-y-5"><FormField name="source-title" label={c.sourceTitle} required><Input value={title} maxLength={180} disabled={busy || !canCreate} onChange={event => setTitle(event.target.value)} /></FormField>
      {typeof originalData.storageKey === "string" && record && <Link className={buttonVariants({ variant: "outline" })} href={`/api/school-ai/sources/${encodeURIComponent(record.id)}/file`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />{c.original}</Link>}
      <div className={record && originalData.storageKey && ["image/jpeg", "image/png", "image/webp"].includes(originalData.mimeType) ? styles.documentReview : undefined}>
        {record && originalData.storageKey && ["image/jpeg", "image/png", "image/webp"].includes(originalData.mimeType) && <SourceImagePreview key={record.id} recordId={record.id} mimeType={originalData.mimeType} language={language} regions={structure.sourcePages?.find(page=>page.page===1)?.regions} onRegionSelect={id=>{const element=document.getElementById(`document-region-1-${id}`);if(element instanceof HTMLDetailsElement){element.open=true;element.scrollIntoView({block:"center"});}}} />}
        <FormField name="source-extracted-text" label={c.extractedText} hint={c.sourceReviewHint}><Textarea value={text} onChange={event => { setText(event.target.value); setReviewed(false); }} maxLength={80000} rows={16} disabled={busy || !canCreate} /></FormField>
      </div>
      <SourceStructureReview language={language} pages={structure.sourcePages??[]} expectedPageCount={structure.expectedPageCount} missingPages={structure.missingPages} structureReviewed={structure.structureReviewed} disabled={busy||!canCreate} onChange={changes=>{const{extractedText,...metadata}=changes;setStructure(previous=>({...previous,...metadata}));if(extractedText!==undefined)setText(extractedText);setReviewed(false);}}/>
      {originalData.uncertainties && originalData.uncertainties.length > 0 && <div className={styles.notice}><div><h3 className="font-bold">{c.missing}</h3><ul className="mt-2 list-disc space-y-1 ps-5">{originalData.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></div></div>}
      <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed"><Checkbox checked={reviewed} disabled={busy || !canCreate || structureIssues.length>0} onChange={event => setReviewed(event.target.checked)} className="mt-1" /><span>{c.sourceReviewed}</span></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
      {record && originalData.storageKey && <DocumentJobsPanel language={language} record={record} canCreate={canCreate && !dirty} canDelete={canArchive} onRecord={onCreated} />}
      <div className="flex flex-wrap gap-2">{record && canArchive && record.status!=="ARCHIVED" && <Button variant="ghost" disabled={busy || dirty} onClick={()=>{setBusy(true);void onAction(record,"archive").then(onCreated).catch(error=>setError(workspaceErrorText(error,c))).finally(()=>setBusy(false));}}>{c.archive}</Button>}<Button disabled={busy || !canCreate || !dirty} onClick={() => void run("save")}>{busy ? c.saving : c.save}</Button>{canApprove && <Button variant="outline" title={dirty ? c.reviewBeforeApproval : c.sourceReviewRequired} disabled={busy || dirty || !reviewed || record?.status === "APPROVED"} onClick={() => void run("approve")}><CheckCircle2 aria-hidden="true" />{c.approve}</Button>}{canCreate && !canApprove && <Button variant="outline" disabled={busy || dirty || !reviewed || record?.status !== "DRAFT"} onClick={() => void run("review")}>{c.submitReview}</Button>}</div>
    </div>
  </section>;
}
