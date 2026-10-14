"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, CheckCircle2, Crop, FileStack, Loader2, RotateCw, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { ModalSurface, useModalSurface } from "@/components/ui/modal";
import type { Language } from "@/lib/locale/package";
import type { SourceData } from "@/lib/school-ai/types";
import { EMPTY_SCAN_CROP, MAX_SCAN_BYTES, MAX_SCAN_PAGES, type ScanCrop, type ScanPoint, type scanQuality } from "@/lib/school-ai/scan";
import { prepareScanImage, straightenScanImage } from "./scan-image";
import { scanCopy } from "./scan-copy";
import { useWorkspaceDraft } from "./draft-safety";
import styles from "./school-ai.module.css";

type ScanPage = { id: string; original: File; file: File; url: string; width: number; height: number; quality: ReturnType<typeof scanQuality> };
function CloseScanner({ label }: { label: string }) { const modal = useModalSurface(); return <Button variant="outline" disabled={!modal.dismissible} onClick={modal.requestClose}><X aria-hidden="true" />{label}</Button>; }

export function ScanComposer({ language, campusId, scope, documentKind, onUpload, onClose }: {
  language: Language; campusId?: string | null; scope: { subjectId?: string; classId?: string }; documentKind: SourceData["documentKind"];
  onUpload: (file: File, origin: "camera", kind: SourceData["documentKind"], signal?: AbortSignal) => Promise<void>; onClose: () => void;
}) {
  const t = scanCopy(language);
  const [pages, setPages] = useState<ScanPage[]>([]), [selected, setSelected] = useState("");
  const [title, setTitle] = useState(""), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [crop, setCrop] = useState<ScanCrop>({ ...EMPTY_SCAN_CROP });
  const [corners,setCorners]=useState<ScanPoint[]|null>(null);
  const [waiting, setWaiting] = useState(false);
  const request = useRef<AbortController | null>(null);
  const files = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>()), mounted = useRef(true), prepared = useRef<File | null>(null), inFlight = useRef(false);
  const active = pages.find(page => page.id === selected), cropPending = Object.values(crop).some(Boolean);
  useWorkspaceDraft(pages.length > 0 || busy);
  useEffect(() => { mounted.current = true; const current = urls.current; return () => { mounted.current = false; request.current?.abort(); current.forEach(url => URL.revokeObjectURL(url)); current.clear(); }; }, []);
  const objectUrl = (file: File) => { const url = URL.createObjectURL(file); urls.current.add(url); return url; };
  const forget = (url: string) => { URL.revokeObjectURL(url); urls.current.delete(url); };
  const changed = () => { prepared.current = null; setChecked(false); setError(""); };
  const safePageChange = (action: () => void) => { if (corners) setError(t.perspectivePending); else if (cropPending) setError(t.cropPending); else { setError(""); action(); } };
  const add = async (chosen: File[]) => {
    if (inFlight.current || !chosen.length) return;
    if (corners) { setError(t.perspectivePending); return; }
    if (cropPending) { setError(t.cropPending); return; }
    if (pages.length + chosen.length > MAX_SCAN_PAGES || [...pages.map(page => page.original), ...chosen].reduce((sum, file) => sum + file.size, 0) > MAX_SCAN_BYTES) { setError(t.invalid); return; }
    inFlight.current = true; setBusy(true); setError("");
    const added: ScanPage[] = [];
    try {
      for (const original of chosen) { const processed = await prepareScanImage(original); if (!mounted.current) return; added.push({ ...processed, original, id: crypto.randomUUID(), url: objectUrl(processed.file) }); }
      if (pages.reduce((sum, page) => sum + page.file.size, 0) + added.reduce((sum, page) => sum + page.file.size, 0) > MAX_SCAN_BYTES) throw new Error("SCAN_LIMIT");
      changed(); setPages(previous => [...previous, ...added]); setSelected(added[0].id);
    } catch { added.forEach(page => forget(page.url)); if (mounted.current) setError(t.invalid); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const edit = async (operation: "rotate" | "crop" | "reset" | "straighten") => {
    if (!active || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const next = operation === "straighten" && corners ? await straightenScanImage(active.file,corners) : await prepareScanImage(operation === "reset" ? active.original : active.file, operation === "crop" ? crop : EMPTY_SCAN_CROP, operation === "rotate");
      if (!mounted.current) return;
      const url = objectUrl(next.file); forget(active.url); changed(); setCorners(null); setCrop({ ...EMPTY_SCAN_CROP }); setPages(previous => previous.map(page => page.id === active.id ? { ...page, ...next, url } : page));
    } catch { if (mounted.current) setError(operation === "straighten" ? t.cornersInvalid : t.invalid); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const move = (delta: number) => { safePageChange(() => { const index = pages.findIndex(page => page.id === selected); if (index < 0 || index + delta < 0 || index + delta >= pages.length) return; const next = [...pages]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; changed(); setPages(next); }); };
  const save = async () => {
    if (inFlight.current || !checked || !title.trim() || !pages.length || cropPending || corners) return;
    inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController(); request.current = controller; setWaiting(true);
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      if (!prepared.current) {
        const form = new FormData(); pages.forEach((page, index) => form.append("pages", page.file, `page-${index + 1}.jpg`));
        form.append("documentKind", documentKind); if (campusId) form.append("campusId", campusId); if (scope.subjectId && scope.classId) { form.append("subjectId", scope.subjectId); form.append("classId", scope.classId); }
        const response = await fetch("/api/school-ai/scan", { method: "POST", body: form, signal: controller.signal });
        if (!response.ok) throw new Error("SCAN_FAILED");
        const blob = await response.blob();
        if (!mounted.current) return;
        prepared.current = new File([blob], `${title.trim().replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 160)}.pdf`, { type: "application/pdf" });
      }
      await onUpload(prepared.current, "camera", documentKind, controller.signal);
      if (mounted.current) { setPages([]); onClose(); }
    } catch { if (mounted.current) setError(controller.signal.aborted ? t.cancelled : t.failure); }
    finally { clearTimeout(timeout); request.current = null; inFlight.current = false; if (mounted.current) { setBusy(false); setWaiting(false); } }
  };
  return <ModalSurface fullscreen ariaLabel={t.title} onClose={onClose} dirty={pages.length > 0} dismissible={!busy} disableBackdropClose><section className="flex h-full min-h-0 flex-col bg-card" dir={language === "en" ? "ltr" : "rtl"} aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 md:px-8"><span className="flex items-center gap-3 font-bold"><FileStack aria-hidden="true" className="text-primary" />{t.open}</span><CloseScanner label={t.close} /></header>
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-6xl space-y-5"><div><h1 className="text-2xl font-extrabold md:text-4xl">{t.title}</h1><p className="mt-3 max-w-3xl text-ink-muted">{t.intro}</p><p className="mt-2 text-xs text-ink-muted">{t.local}</p></div>
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || pages.length >= MAX_SCAN_PAGES} onClick={() => files.current?.click()}><Upload aria-hidden="true" />{t.add}</Button><Button variant="outline" disabled={busy || pages.length >= MAX_SCAN_PAGES} onClick={() => camera.current?.click()}><Camera aria-hidden="true" />{t.camera}</Button><span className="text-xs text-ink-muted">{t.limits}</span></div>
      <Input ref={files} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label={t.add} className="hidden" tabIndex={-1} onChange={event => { const chosen = Array.from(event.target.files ?? []); event.target.value = ""; void add(chosen); }} /><Input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={t.camera} className="hidden" tabIndex={-1} onChange={event => { const chosen = Array.from(event.target.files ?? []); event.target.value = ""; void add(chosen); }} />
      {error && <p role="alert" className="rounded-xl bg-status-error-surface p-4 text-sm text-status-error-text">{error}</p>}
      {waiting && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4"><Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" /><p className="flex-1 text-sm">{t.working}</p><Button variant="outline" onClick={() => request.current?.abort()}>{t.cancel}</Button></div>}
      {pages.length ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"><section className="min-w-0 space-y-4"><div className="flex gap-2 overflow-x-auto pb-2" aria-label={t.selected}>{pages.map((page, index) => <Button key={page.id} variant="choice" disabled={busy} aria-pressed={page.id === selected} className="shrink-0" onClick={() => safePageChange(() => setSelected(page.id))}>{t.page} {index + 1}</Button>)}</div>{active && <><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || pages[0].id === selected} onClick={() => move(-1)}><ArrowUp aria-hidden="true" />{t.previous}</Button><Button variant="outline" disabled={busy || pages.at(-1)?.id === selected} onClick={() => move(1)}><ArrowDown aria-hidden="true" />{t.next}</Button><Button variant="ghost" disabled={busy} onClick={() => safePageChange(() => { forget(active.url); const remaining = pages.filter(page => page.id !== selected); changed(); setPages(remaining); setSelected(remaining[0]?.id ?? ""); })}>{t.remove}</Button></div><div className="overflow-auto rounded-2xl border border-border bg-surface-subtle p-3">
        {/* Local, revocable browser-only photo preview. */}
        <div className="relative mx-auto" style={{maxWidth:`min(100%, ${58*active.width/active.height}vh)`}}><img src={active.url} alt={`${t.preview} ${pages.findIndex(page => page.id === selected) + 1}`} className="h-auto w-full shadow-sm" width={active.width} height={active.height} />{corners&&<svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full"><polygon points={corners.map(point=>`${point.x*1000},${point.y*1000}`).join(" ")} fill="rgba(0,100,255,0.08)" stroke="var(--primary)" strokeWidth="6"/>{corners.map((point,index)=><g key={index}><circle cx={point.x*1000} cy={point.y*1000} r="16" fill="var(--primary)"/><text x={Math.max(25,Math.min(950,point.x*1000))} y={Math.max(45,Math.min(970,point.y*1000))} fontSize="35" fill="var(--foreground)">{index+1}</text></g>)}</svg>}</div>
      </div>{active.quality.blurRisk&&<p className="text-sm text-status-warning-text">{t.blur}</p>}{active.quality.lowContrast&&<p className="text-sm text-status-warning-text">{t.contrast}</p>}<p className="text-xs text-ink-muted">{t.qualityHint}</p>{Math.min(active.width, active.height) < 800 && <p className="text-sm text-status-warning-text">{t.small}</p>}</>}</section>
      <aside className="min-w-0 space-y-4"><section className="sk-panel space-y-4 p-5"><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || cropPending || Boolean(corners)} onClick={() => void edit("rotate")}><RotateCw aria-hidden="true" />{t.rotate}</Button><Button variant="ghost" disabled={busy} onClick={() => void edit("reset")}><Undo2 aria-hidden="true" />{t.reset}</Button></div><h2 className="flex items-center gap-2 font-bold"><Crop aria-hidden="true" className="size-4" />{t.crop}</h2><p className="text-xs leading-relaxed text-ink-muted">{t.cropHint}</p><div className="grid grid-cols-2 gap-3">{(["top", "right", "bottom", "left"] as const).map(edge => <FormField key={edge} name={`scan-crop-${edge}`} label={`${t[edge]} %`}><Input type="number" min={0} max={40} step={1} disabled={busy || Boolean(corners)} value={crop[edge]} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value <= 40) { setCrop(previous => ({ ...previous, [edge]: value })); setChecked(false); } }} /></FormField>)}</div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !cropPending} onClick={() => void edit("crop")}>{t.cropApply}</Button><Button variant="ghost" disabled={busy || !cropPending} onClick={() => setCrop({ ...EMPTY_SCAN_CROP })}>{t.clearCrop}</Button></div></section>
        <section className="sk-panel space-y-4 p-5"><h2 className="font-bold">{t.perspective}</h2><p className="text-xs text-ink-muted">{t.perspectiveHint}</p>{corners?<><div className="space-y-3">{corners.map((point,index)=><div key={index}><p className="mb-2 text-sm font-semibold">{t.corner} {index+1}</p><div className="grid grid-cols-2 gap-2">{(["x","y"] as const).map(axis=><FormField key={axis} name={`scan-corner-${index}-${axis}`} label={t[axis]}><Input type="number" min={0} max={100} step={0.1} disabled={busy} value={Math.round(point[axis]*1000)/10} onChange={event=>{setCorners(previous=>previous?.map((row,i)=>i===index?{...row,[axis]:Number(event.target.value)/100}:row)??null);setChecked(false);}}/></FormField>)}</div></div>)}</div><Button type="button" variant="outline" disabled={busy} onClick={()=>void edit("straighten")}>{t.straighten}</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setCorners(null)}>{t.clearCorners}</Button></>:<Button type="button" variant="outline" disabled={busy||cropPending} onClick={()=>{setCorners([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);setChecked(false);}}>{t.perspective}</Button>}</section>
        <section className="sk-panel space-y-4 p-5"><FormField name="scan-document-title" label={t.titleLabel} required><Input value={title} maxLength={160} disabled={busy} onChange={event => { setTitle(event.target.value); prepared.current = null; }} /></FormField><label className="flex items-start gap-3 text-sm leading-relaxed"><Checkbox className="mt-1" checked={checked} disabled={busy || cropPending || Boolean(corners)} onChange={event => setChecked(event.target.checked)} /><span>{t.checked}</span></label><p className="text-xs leading-relaxed text-ink-muted">{t.saveHint}</p><Button className="w-full whitespace-normal" disabled={busy || !checked || !title.trim() || cropPending || Boolean(corners)} onClick={() => void save()}>{busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <CheckCircle2 aria-hidden="true" />}{busy ? t.working : t.review}</Button></section>
      </aside></div> : <div className={`${styles.empty} sk-panel py-16`}><Camera aria-hidden="true" className="mx-auto mb-4 size-10 text-primary" /><h2 className="text-lg font-bold">{t.empty}</h2></div>}
    </div></div>
  </section></ModalSurface>;
}
