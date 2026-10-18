"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAssignmentCopy, type AssignmentCopy } from "./assignment-copy";
import { Banner, call, fileHref, fill, formatAt, Pill, RubricTable, shortSha, stateTone, type Criterion, type Feedback, type Receipt } from "./shared";
import { Textarea } from "@/components/ui/textarea";

// SKO-409 learner and family view. Learners draft, upload and submit with a server receipt;
// families read status and returned feedback only. Unreturned feedback never reaches either.
type Item = {
  id: string; title: string; instructions: string; version: number; studentId: string; studentName: string;
  rubric: { version: number; criteria: Criterion[]; totalPoints: number } | null; timezone: string; dueAt: string; effectiveDueAt: string;
  extension: { dueAt: string; reason: string } | null; submissionMode: "ONLINE" | "PAPER" | "BOTH"; allowedTypes: string[]; latePolicy: string; resubmission: string;
  resources: { id: string; title: string }[]; state: keyof AssignmentCopy["states"]; overdue: boolean; canSubmit: boolean; canEditDraft: boolean;
  draft: { text: string; savedAt: string | null; file: { name: string | null; sizeBytes: number | null; ready: boolean; sha256: string | null } | null } | null;
  versions: (Receipt & { feedback: Feedback; rubric: Criterion[] })[];
};
const ACCEPT: Record<string, string> = { PDF: ".pdf,application/pdf", IMAGE: ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp", WORD: ".doc,.docx", TEXT: ".txt,text/plain" };
const store = {
  get(name: string) { try { return window.localStorage.getItem(name); } catch { return null; } },
  set(name: string, value: string) { try { window.localStorage.setItem(name, value); } catch { /* storage unavailable: server draft still works */ } },
  remove(name: string) { try { window.localStorage.removeItem(name); } catch { /* ignore */ } },
};

export function LearnerAssignments({ audience }: { audience: "learner" | "guardian" }) {
  const { language } = useLocale();
  const t = getAssignmentCopy(language), rtl = language === "ar" || language === "ur";
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  // SKO-418: Today deep-links here with ?open=<assignment>; Back returns to Today.
  const ui = useUiText();
  const params = useSearchParams(), requested = params.get("open"), fromToday = params.get("from") === "today";
  const [missing, setMissing] = useState(false), linked = useRef(false);
  const load = useCallback(async () => setItems((await call("/api/assignments")).assignments), []);
  useEffect(() => { load().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed })); }, [load, t.failed]);
  useEffect(() => {
    if (!items || !requested || linked.current) return;
    linked.current = true;
    const match = items.find(item => item.id === requested);
    if (match) setSelected(`${match.id}:${match.studentId}`); else setMissing(true);
  }, [items, requested]);

  if (!items) return <div dir={rtl ? "rtl" : "ltr"} className="space-y-3"><Banner status={status} />{!status && <p className="text-sm text-slate-600" aria-busy="true">{t.loading}</p>}</div>;
  const current = items.find(item => `${item.id}:${item.studentId}` === selected);
  if (current) return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-4">
    {fromToday ? <Link href="/student" className="text-sm font-semibold text-primary underline" data-back-today>{ui("Back to Today")}</Link> : null}
    <Button type="button" variant="link" className="px-0" onClick={() => { setSelected(null); setStatus(null); setReceipt(null); }}>{t.back}</Button>
    <Banner status={status} />
    <AssignmentView t={t} language={language} item={current} audience={audience} reload={load} setStatus={setStatus} receipt={receipt} setReceipt={setReceipt} />
  </div>;
  return <div dir={rtl ? "rtl" : "ltr"} className="min-w-0 space-y-4">
    <Banner status={status} />
    {missing ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-task-unavailable>{ui("This task is no longer assigned to your account.")} {fromToday ? <Link href="/student" className="font-semibold underline">{ui("Back to Today")}</Link> : null}</div> : null}
    {audience === "guardian" && <p className="text-xs text-slate-600">{t.workHidden}</p>}
    {items.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">{audience === "guardian" ? t.guardianEmpty : t.learnerEmpty}</p>
      : <ul className="grid gap-3" aria-label={t.title}>{items.map(item => { const latest = item.versions[0]; return <li key={`${item.id}:${item.studentId}`} className="min-w-0 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold [overflow-wrap:anywhere]" dir="auto">{item.title}</p>
            <p className="text-xs text-slate-500">{audience === "guardian" && <><bdi>{item.studentName}</bdi> · </>}{t.due} {formatAt(item.effectiveDueAt, language, item.timezone)}{item.extension ? ` · ${t.extended}` : ""}</p>
          </div>
          <span className="flex flex-wrap gap-1"><Pill tone={stateTone(item.state)}>{t.states[item.state]}</Pill>{latest?.late && <Pill tone="amber">{t.lateTag}</Pill>}{!latest && item.overdue && <Pill tone="red">{t.overdue}</Pill>}</span>
        </div>
        <div className="mt-3"><Button type="button" variant="outline" size="sm" onClick={() => setSelected(`${item.id}:${item.studentId}`)}>{t.open}<span className="sr-only">: {item.title}</span></Button></div>
      </li>; })}</ul>}
  </div>;
}

function AssignmentView({ t, language, item, audience, reload, setStatus, receipt, setReceipt }: { t: AssignmentCopy; language: string; item: Item; audience: "learner" | "guardian"; reload: () => Promise<void>; setStatus: (value: { tone: "ok" | "error"; text: string } | null) => void; receipt: ReceiptResult | null; setReceipt: (value: ReceiptResult) => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (receipt) receiptRef.current?.focus(); }, [receipt]);
  const labels = { criterion: t.criterion, points: t.points, comment: t.criterionComment, total: t.total, outOf: t.outOf };
  const latest = item.versions[0];
  return <article aria-labelledby="asg-title" className="min-w-0 space-y-4">
    <header className="min-w-0 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 id="asg-title" className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]" dir="auto">{item.title}</h2><Pill tone={stateTone(item.state)}>{t.states[item.state]}</Pill></div>
      <p className="mt-1 text-sm text-slate-700">{t.due} {formatAt(item.effectiveDueAt, language, item.timezone)} <span className="text-xs text-slate-500">({item.timezone})</span> · {t.version} {item.version}{item.rubric ? ` · ${t.rubricVersion} ${item.rubric.version}` : ""}</p>
      {item.extension && <p className="mt-1 text-sm text-emerald-800">{fill(t.extensionGranted, { time: formatAt(item.extension.dueAt, language, item.timezone) })}</p>}
      {item.state === "RETURNED" && <p className="mt-1 text-sm font-semibold text-emerald-800">{t.returnedNote}</p>}
      {item.state === "REOPENED" && <p className="mt-1 text-sm font-semibold text-amber-800">{t.revisionNote}</p>}
      {audience === "guardian" && <p className="mt-1 text-sm"><bdi>{item.studentName}</bdi></p>}
    </header>
    <section aria-labelledby="asg-what" className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
      <h3 id="asg-what" className="text-sm font-semibold">{t.instructionsTitle}</h3>
      <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]" dir="auto">{item.instructions}</p>
      {item.resources.length > 0 && <div><h4 className="text-xs font-semibold">{t.materials}</h4><ul className="mt-1 grid gap-1">{item.resources.map(r => <li key={r.id}><a className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-violet-700 underline" href={`/api/resources/${r.id}/file`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /><bdi>{r.title}</bdi></a></li>)}</ul></div>}
      <p className="text-xs text-slate-600">{t.acceptedFormats}: {item.submissionMode === "PAPER" ? t.modes.PAPER : [t.textAnswers, ...item.allowedTypes.map(g => t.fileTypeNames[g as keyof typeof t.fileTypeNames] ?? g)].join(", ")} · {t.latePolicies[item.latePolicy as keyof typeof t.latePolicies]} · {t.resubmissions[item.resubmission as keyof typeof t.resubmissions]}</p>
      {item.rubric && <div><h4 className="mb-1 text-xs font-semibold">{t.rubric} · {t.version} {item.rubric.version}</h4><RubricTable criteria={item.rubric.criteria} labels={labels} /></div>}
    </section>
    {audience === "learner" && item.submissionMode === "PAPER" && !latest && <p className="rounded-xl border bg-slate-50 p-3 text-sm">{t.handInOnPaper}</p>}
    {receipt && <div ref={receiptRef} tabIndex={-1} role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-semibold">{fill(t.receiptSaved, { time: formatAt(receipt.submittedAt, language, item.timezone), code: receipt.receiptCode })}</p>
      <p className="text-xs">{t.version} {receipt.version} · {t.checksum} <bdi className="font-mono">{shortSha(receipt.artifactSha256)}</bdi>{receipt.late ? ` · ${t.lateTag}` : ""}{receipt.replayed ? ` · ${t.replayed}` : ""}</p>
    </div>}
    {audience === "learner" && item.canEditDraft && (item.state === "SUBMITTED"
      ? <details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t.replace}</summary><div className="mt-3"><Work key={`${item.id}:${latest?.version ?? 0}:${item.state}`} t={t} language={language} item={item} reload={reload} setStatus={setStatus} onReceipt={setReceipt} /></div></details>
      : <Work key={`${item.id}:${latest?.version ?? 0}:${item.state}`} t={t} language={language} item={item} reload={reload} setStatus={setStatus} onReceipt={setReceipt} />)}
    {audience === "learner" && !item.canEditDraft && item.state !== "RETURNED" && item.state !== "SUBMITTED" && !latest && item.submissionMode !== "PAPER" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t.cannotSubmit}</p>}
    <section aria-labelledby="asg-versions" className="min-w-0 space-y-3">
      <h3 id="asg-versions" className="text-sm font-semibold">{audience === "guardian" ? t.childVersions : t.yourVersions} ({item.versions.length})</h3>
      {item.versions.length === 0 ? <p className="text-sm text-slate-600">{t.notSubmitted}</p> : <ol className="grid gap-3">{item.versions.map(v => <li key={v.id} className="min-w-0 rounded-xl border bg-white p-4">
        <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t.version} {v.version}</span><span>{t.receipt} <bdi className="font-semibold">{v.receiptCode}</bdi></span>{v.late && <Pill tone="amber">{t.lateTag}</Pill>}{v.mode === "PAPER" && <Pill>{t.paperTag}</Pill>}</p>
        <p className="text-xs text-slate-600">{v.mode === "PAPER" ? t.receivedAt : t.submittedAt} {formatAt(v.receivedAt, language, item.timezone)}{audience === "learner" ? <> · {t.checksum} <bdi className="font-mono">{shortSha(v.artifactSha256)}</bdi></> : null}</p>
        {v.text && <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]" dir="auto">{v.text}</p>}
        {audience === "learner" && v.file && <a className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-violet-700 underline" href={fileHref(item.id, v.id)}><Download className="h-4 w-4" aria-hidden />{t.download}: <bdi>{v.file.name}</bdi></a>}
        <div className="mt-3 border-t pt-3">{v.feedback ? <div className="space-y-2">
          <p className="text-sm font-semibold text-emerald-800">{t.feedback} · {t.returnedOn} <bdi>{formatAt(v.feedback.returnedAt, language, item.timezone)}</bdi> · {t.total} <span dir="ltr">{v.feedback.totalPoints} / {v.rubric.reduce((n, c) => n + c.maxPoints, 0)}</span> · {t.formative}</p>
          <RubricTable criteria={v.rubric} scores={v.feedback.criteria} labels={labels} />
          {v.feedback.comment && <p className="text-sm" dir="auto">{v.feedback.comment}</p>}
        </div> : <p className="text-xs text-slate-500">{t.noFeedback}</p>}</div>
      </li>)}</ol>}
    </section>
  </article>;
}

type ReceiptResult = { receiptCode: string; submittedAt: string; replayed: boolean; artifactSha256: string; version: number; late: boolean };
type Upload = { state: "idle" | "uploading" | "uploaded" | "failed"; file: File | null; name: string | null; sha256: string | null };
function Work({ t, language, item, reload, setStatus, onReceipt }: { t: AssignmentCopy; language: string; item: Item; reload: () => Promise<void>; setStatus: (value: { tone: "ok" | "error"; text: string } | null) => void; onReceipt: (value: ReceiptResult) => void }) {
  const draftKey = `sko409-draft:${item.id}`, submitKey = `sko409-submit:${item.id}`;
  const local = (() => { try { return JSON.parse(store.get(draftKey) ?? "null") as { text: string; at: string } | null; } catch { return null; } })();
  const serverAt = item.draft?.savedAt ? new Date(item.draft.savedAt).getTime() : 0;
  const useLocal = !!local && new Date(local.at).getTime() > serverAt && local.text !== (item.draft?.text ?? "");
  const [text, setText] = useState(useLocal ? local!.text : item.draft?.text ?? "");
  const [saved, setSaved] = useState<"server" | "local" | "none">(useLocal ? "local" : item.draft?.savedAt ? "server" : "none");
  const [upload, setUpload] = useState<Upload>(item.draft?.file ? { state: item.draft.file.ready ? "uploaded" : "failed", file: null, name: item.draft.file.name, sha256: item.draft.file.sha256 } : { state: "idle", file: null, name: null, sha256: null });
  const [phase, setPhase] = useState<"idle" | "submitting" | "failed">("idle");
  const post = (body: Record<string, unknown>) => call(`/api/assignments/${item.id}`, body);
  const accept = item.allowedTypes.map(g => ACCEPT[g]).filter(Boolean).join(",");

  const saveServer = async () => { await post({ op: "draft", text }); store.remove(draftKey); setSaved("server"); };
  async function sendFile(file: File) {
    setUpload({ state: "uploading", file, name: file.name, sha256: null });
    try {
      const { result } = await post({ op: "file", fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size });
      const put = await fetch(result.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(t.uploadFailed);
      const confirmed = await post({ op: "confirm" });
      setUpload({ state: "uploaded", file, name: file.name, sha256: confirmed.result.sha256 });
    } catch (error) {
      setUpload({ state: "failed", file, name: file.name, sha256: null });
      setStatus({ tone: "error", text: error instanceof Error && error.message !== "Request failed" ? error.message : t.uploadFailed });
    }
  }
  async function submit() {
    // One key per intended submission, kept across retries and reloads until a receipt arrives.
    const idempotencyKey = store.get(submitKey) ?? `s-${crypto.randomUUID()}`;
    store.set(submitKey, idempotencyKey);
    setPhase("submitting"); setStatus(null);
    try {
      if (saved !== "server") await saveServer();
      const { result } = await post({ op: "submit", idempotencyKey });
      store.remove(submitKey); store.remove(draftKey);
      onReceipt(result); setPhase("idle");
      await reload();
    } catch (error) {
      setPhase("failed");
      setStatus({ tone: "error", text: `${error instanceof Error && error.message !== "Request failed" ? `${error.message} ` : ""}${t.submitFailed}` });
    }
  }
  return <section aria-labelledby="asg-work" className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
    <h3 id="asg-work" className="text-sm font-semibold">{t.yourAnswer}</h3>
    {item.overdue && <p className="text-sm text-amber-800">{item.canSubmit ? t.lateAccepted : t.overdue}</p>}
    <label className="grid gap-1 text-xs font-semibold"><span className="sr-only">{t.yourAnswer}</span>
      <Textarea dir="auto" rows={7} maxLength={20000} value={text} aria-describedby="asg-draft-state" className="min-h-40 rounded-md border px-3 py-2 text-sm font-normal"
        onChange={event => { setText(event.target.value); setSaved("local"); store.set(draftKey, JSON.stringify({ text: event.target.value, at: new Date().toISOString() })); }} /></label>
    <p id="asg-draft-state" role="status" className={`text-xs ${saved === "local" ? "text-amber-800" : "text-slate-600"}`}>{saved === "server" ? `${t.savedDraft} ${item.draft?.savedAt ? formatAt(item.draft.savedAt, language, item.timezone) : ""}` : saved === "local" ? t.savedLocally : t.notSaved}</p>
    {item.allowedTypes.length > 0 && <div className="grid gap-1 text-xs">
      <span className="font-semibold">{t.attach}</span>
      <label className="flex min-w-0 flex-wrap items-center gap-2">
        <input type="file" accept={accept} className="peer sr-only" aria-label={t.attach} aria-describedby="asg-upload-state" onChange={event => { const file = event.target.files?.[0]; if (file) void sendFile(file); event.target.value = ""; }} />
        <span aria-hidden className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-field-border bg-white px-3 text-sm font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500">{t.chooseFile}</span>
        <span className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere]"><bdi>{upload.name ?? t.noFile}</bdi></span>
      </label>
      <p id="asg-upload-state" role="status" className="flex flex-wrap items-center gap-2">
        {upload.state === "uploading" && <><span className="inline-block h-2 w-24 animate-pulse rounded bg-violet-300 motion-reduce:animate-none" role="progressbar" aria-label={t.uploading} />{t.uploading} <bdi>{upload.name}</bdi></>}
        {upload.state === "uploaded" && <span className="text-emerald-800">{t.uploaded}: <bdi>{upload.name}</bdi> · {t.checksum} <bdi className="font-mono">{shortSha(upload.sha256)}</bdi></span>}
        {upload.state === "failed" && <><span className="text-rose-800">{t.uploadFailed} <bdi>{upload.name}</bdi></span>{upload.file && <Button type="button" size="sm" variant="outline" onClick={() => void sendFile(upload.file!)}><RotateCcw aria-hidden />{t.retry}</Button>}</>}
      </p>
    </div>}
    {phase === "submitting" && <p role="status" className="text-sm text-slate-700">{t.submitting}</p>}
    <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-xl bg-white/95 py-1">
      <Button type="button" disabled={phase === "submitting" || upload.state === "uploading" || !item.canSubmit} onClick={() => void submit()}>{phase === "failed" ? t.retry : t.submit}</Button>
      <Button type="button" variant="outline" disabled={phase === "submitting"} onClick={() => saveServer().catch(error => setStatus({ tone: "error", text: error instanceof Error ? error.message : t.failed }))}>{t.saveDraft}</Button>
    </div>
  </section>;
}
