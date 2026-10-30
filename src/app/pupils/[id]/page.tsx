"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { friendlyErrorMessage } from "@/components/ui/toast";
import { ArrowRight, CalendarCheck, FileText, GraduationCap, History, ReceiptText } from "lucide-react";
import { DeskStats, StatTile } from "@/components/ui/desk";
import { use, useCallback, useEffect, useState } from "react";
import { LocaleProvider, useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { enrollmentLabels } from "@/lib/students/labels";
import { LearningTransferPanel } from "@/components/learning/learning-transfer";
import { PageHeader } from "@/components/ui/page-header";

type Period = { id: string; className: string; campusName: string; curriculum: string; academicYear: number; rollNo: string; startDate: string; endDate: string | null; status: string; origin: string; _count: { attendance: number; invoices: number; reports: number } };
type Data = { pupil: { id: string; fullName: string; admissionNo: string | null; consolidatedIntoId: string | null; enrollments: Period[] }; classes: { id: string; name: string; section: string | null; academicYear: number; campus: { name: string } }[]; proposals: { id: string; effectiveDate: string; rollNo: string; targetClassId: string; reason: string; status: string }[]; events: { id:string; title:string; createdAt:string }[]; documents: { id: string; fileName: string; uploadedAt: string }[]; canManage: boolean; canConsolidate: boolean };
type Impact = { preserved: { attendance: number; reports: number; invoices: number }; targetOccupancy: number };
type Duplicate = { token: string; blockers: string[]; counts: Record<string,number>; source: { fullName: string; id: string }; target: { fullName: string; id: string } };
async function request(url: string, body?: unknown) {
 const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
 const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed"); return data;
}
/** Label wrapping its control: the label text stays the control's exact accessible name. */
const fieldLabel = "grid min-w-0 gap-1.5 text-sm font-semibold text-ink-strong";
const tile = "rounded-xl bg-card/85 px-3 py-2.5 ring-1 ring-border-subtle";
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <LocaleProvider><Pupil id={id} /></LocaleProvider>; }
function Pupil({ id }: { id: string }) {
 const locale = useLocale(), format = useLocaleFormat(), t = enrollmentLabels[locale.language];
 const [data,setData] = useState<Data | null>(null), [loading,setLoading] = useState(true), [error,setError] = useState("");
 const [busy,setBusy] = useState(false), [success,setSuccess] = useState(false);
 // Which action is running, so only its own button shows the spinner (every action still disables the rest via `busy`).
 const [pending,setPending] = useState<string | null>(null);
 const [targetClassId,setTarget] = useState(""), [effectiveDate,setDate] = useState(""), [rollNo,setRoll] = useState(""), [reason,setReason] = useState("");
 const [impact,setImpact] = useState<Impact | null>(null), [proposalId,setProposal] = useState(""), [reviewed,setReviewed] = useState(false);
 const [duplicateTarget,setDuplicateTarget] = useState(""), [duplicate,setDuplicate] = useState<Duplicate | null>(null), [verifySource,setVerifySource] = useState(""), [verifyTarget,setVerifyTarget] = useState("");
 const load = useCallback(async () => { setLoading(true); try { setData(await request(`/api/students/enrollments?studentId=${encodeURIComponent(id)}`)); setError(""); } catch(e) { setError(friendlyErrorMessage(e)); } finally { setLoading(false); } },[id]);
 useEffect(() => { void load(); },[load]);
 const current = data?.pupil.enrollments.find(p => p.status === "ACTIVE" && !p.endDate);
 const run = async (fn: () => Promise<void>, action = "") => { setBusy(true); setPending(action); setError(""); setSuccess(false); try { await fn(); } catch(e) { setError(friendlyErrorMessage(e)); } finally { setBusy(false); setPending(null); } };
 const payload = { studentId:id, fromEnrollmentId:current?.id, targetClassId,effectiveDate,rollNo,reason };
 const reset = () => { setImpact(null); setProposal(""); setReviewed(false); };
 const savedProposals = data?.proposals.filter(p=>p.status==="PROPOSED") ?? [];
 return <div dir={locale.language === "en" ? "ltr" : "rtl"} className="mx-auto w-full min-w-0 max-w-5xl space-y-6 text-ink">
  {/* The frame's page card is the surface: the header sits on it directly (no card-in-card). */}
  <div className="border-b border-border-subtle pb-5">
   {/* The pupil's name is data: isolated in <bdi> and never looked up as a UI key (R7). Until it loads, the
       page's own title stands in, so the eyebrow is added only once the name is shown. */}
   <PageHeader
    icon={GraduationCap}
    eyebrow={data?.pupil.fullName ? t.title : undefined}
    title={data?.pupil.fullName ? <bdi>{data.pupil.fullName}</bdi> : t.title}
    status={<div className="min-w-0 space-y-0.5 text-sm text-ink-muted">
     <p className="break-all">{t.identity}: <bdi className="font-medium text-ink">{id}</bdi></p>
     {data && <p>{t.admission}: <bdi className="font-medium text-ink">{data.pupil.admissionNo || "—"}</bdi></p>}
     {current && <p className="mt-2 break-words font-semibold text-ink-strong">{t.current}: <bdi>{current.campusName}</bdi> · <bdi>{current.className}</bdi> · <bdi>{current.rollNo}</bdi></p>}
    </div>}
   />
  </div>
  {error && <Alert id="enrollment-error" tone="danger" actions={<Button variant="outline" size="sm" onClick={() => void load()}>{t.retry}</Button>}>{error}</Alert>}
  {loading && !data ? <SkeletonRegion label={t.loading} className="space-y-4">
   <div className="sk-panel space-y-3 p-5"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
   <div className="sk-panel space-y-3 p-5"><Skeleton className="h-5 w-1/4" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/5" /></div>
  </SkeletonRegion> : loading ? <p role="status" className="text-sm text-ink-subtle">{t.loading}</p> : null}
  {success && <Alert tone="success">{t.success}</Alert>}
  {data?.pupil.consolidatedIntoId && <Alert tone="info" live="off">{t.alias}: <a className="sk-link break-all" href={`/pupils/${data.pupil.consolidatedIntoId}`}><bdi>{data.pupil.consolidatedIntoId}</bdi></a></Alert>}
  {data && !current && !data.pupil.consolidatedIntoId && <Alert tone="warning" live="off">{t.empty}</Alert>}
  {data?.canManage && current && !data.pupil.consolidatedIntoId && <section aria-labelledby="change-title" className="sk-panel space-y-5 p-4 sm:p-6">
   <h2 id="change-title" className="text-lg font-bold text-ink-strong">{t.change}</h2>
   <Alert tone="info" live="off"><p>{t.notice}</p><p className="mt-1 text-xs text-ink-muted">{t.policy}</p></Alert>
   <form onSubmit={e => { e.preventDefault(); void run(async () => { setImpact(await request("/api/students/enrollments",{...payload,action:"preview"})); }, "preview"); }} className="space-y-4">
    <fieldset disabled={busy || !!impact} className="grid gap-4 sm:grid-cols-2">
     <label className={fieldLabel}>{t.target}<Select aria-label={t.target} required className="block w-full" value={targetClassId} onChange={e=>setTarget(e.target.value)}><option value="">{t.choose}</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.campus.name} · {c.name} {c.section} · {c.academicYear}</option>)}</Select></label>
     <label className={fieldLabel}>{t.date}<Input aria-invalid={/date|overlap|Attendance|boundary/i.test(error)} aria-describedby={error ? "enrollment-error" : undefined} required className="w-full" type="date" value={effectiveDate} onChange={e=>setDate(e.target.value)} /></label>
     <label className={fieldLabel}>{t.roll}<Input required className="block w-full" value={rollNo} onChange={e=>setRoll(e.target.value)} /></label>
     <label className={fieldLabel}>{t.reason}<Input required maxLength={1000} className="block w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label>
    </fieldset>
    {!impact && <div className="flex justify-end"><Button type="submit" variant="default" loading={pending === "preview"} disabled={busy}>{t.preview}</Button></div>}
   </form>
   {impact && <div className="space-y-4 rounded-2xl border border-status-brand-border bg-status-brand-surface p-4 shadow-xs sm:p-5" aria-live="polite">
    <h3 className="text-base font-bold text-ink-strong">{t.preserved}</h3>
    {/* What the move keeps: each count stays with the pupil's record. */}
    <DeskStats>
     {[{ label: t.attendance, value: impact.preserved.attendance, icon: CalendarCheck }, { label: t.reports, value: impact.preserved.reports, icon: FileText }, { label: t.invoices, value: impact.preserved.invoices, icon: ReceiptText }].map((item, index) => <StatTile key={item.label} index={index} icon={item.icon} tone="success" label={item.label} value={item.value} />)}
    </DeskStats>
    <p className="text-sm text-ink">{t.occupancy}: <span className="font-semibold tabular-nums text-ink-strong">{impact.targetOccupancy}</span></p>
    <Alert tone="warning" live="off">{t.capacity}</Alert>
    <p className="break-all text-xs text-ink-subtle"><bdi>{effectiveDate}</bdi> · <bdi>{id}</bdi></p>
    {proposalId ? <label className="flex items-start gap-3 text-sm font-medium leading-relaxed text-ink"><Checkbox checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-0.5" />{t.reviewed}</label> : null}
    <div className="flex flex-wrap items-center justify-end gap-2">
     <Button variant="outline" disabled={busy} onClick={reset}>{t.clear}</Button>
     {!proposalId ? <Button variant="default" loading={pending === "propose"} disabled={busy} onClick={()=>void run(async()=>{ const result=await request("/api/students/enrollments",{...payload,action:"propose"});setProposal(result.proposal.id); }, "propose")}>{t.save}</Button> : <Button variant="default" loading={pending === "confirm"} disabled={busy || !reviewed} onClick={()=>void run(async()=>{await request("/api/students/enrollments",{studentId:id,action:"confirm",proposalId,reviewed,capacityChecked:reviewed});reset();await load();setSuccess(true);}, "confirm")}>{t.confirm}</Button>}
    </div>
   </div>}
   {savedProposals.length > 0 && <details className="rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4"><summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-ink-strong">{t.proposals} <Badge variant="secondary" size="sm" className="tabular-nums">{savedProposals.length}</Badge></summary><ul className="mt-2 space-y-2">{savedProposals.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-border-subtle"><span className="min-w-0 break-all text-ink"><bdi className="tabular-nums">{p.effectiveDate.slice(0,10)}</bdi> · <bdi>{p.rollNo}</bdi> · <bdi className="text-ink-subtle">{p.id}</bdi></span><Button variant="outline" size="sm" loading={pending === `proposal-${p.id}`} disabled={busy} onClick={()=>void run(async()=>{setTarget(p.targetClassId);setDate(p.effectiveDate.slice(0,10));setRoll(p.rollNo);setReason(p.reason);setImpact(await request("/api/students/enrollments",{studentId:id,fromEnrollmentId:current.id,targetClassId:p.targetClassId,effectiveDate:p.effectiveDate.slice(0,10),rollNo:p.rollNo,reason:p.reason,action:"preview"}));setProposal(p.id);setReviewed(false);}, `proposal-${p.id}`)}>{t.preview}</Button></li>)}</ul></details>}
  </section>}
  {data && <section aria-labelledby="history-title" className="space-y-4"><h2 id="history-title" className="flex items-center gap-2 text-lg font-bold text-ink-strong"><History aria-hidden="true" className="size-5 text-primary" />{t.history}</h2><ol className="space-y-3">{data.pupil.enrollments.map(period=><li key={period.id} className="sk-panel space-y-1.5 p-4 sm:p-5"><h3 className="break-words text-base font-semibold text-ink-strong"><bdi>{period.campusName}</bdi> · <bdi>{period.className}</bdi></h3><p className="text-sm text-ink"><time dateTime={period.startDate.slice(0,10)}>{format.date(period.startDate)}</time> — {period.endDate ? <time dateTime={period.endDate.slice(0,10)}>{format.date(period.endDate)}</time> : period.status === "ACTIVE" ? t.active : t.ended}</p><p className="text-xs tabular-nums text-ink-subtle"><bdi>{period.startDate.slice(0,10)} / {period.endDate?.slice(0,10) || "—"}</bdi></p><p className="text-sm text-ink-muted">{t.roll}: <bdi className="font-medium text-ink">{period.rollNo}</bdi> · {t.year}: <span className="tabular-nums">{period.academicYear}</span></p><p className="text-sm text-ink-muted">{t.curriculum}: {period.curriculum}</p>{period.origin.startsWith("LEGACY") && <Alert tone="warning" compact live="off" className="mt-2">{t.legacy}</Alert>}<Sources studentId={id} period={period} /></li>)}</ol></section>}
  {!!data?.documents.length && <section className="sk-panel space-y-2 p-4 sm:p-5"><h2 className="text-lg font-bold text-ink-strong">{t.documents}</h2><ul className="divide-y divide-border-subtle">{data.documents.map(d=><li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm"><a className="sk-link min-w-0 break-all" href={`/api/students/enrollments?studentId=${encodeURIComponent(id)}&documentId=${encodeURIComponent(d.id)}`}>{d.fileName}</a><span className="shrink-0 text-xs text-ink-subtle">{format.date(d.uploadedAt)}</span></li>)}</ul></section>}
  {!!data?.events.length && <ol className="sk-panel divide-y divide-border-subtle px-4 py-1 sm:px-5">{data.events.map(event=><li key={event.id} className="py-2.5 text-sm text-ink"><time dateTime={event.createdAt} className="text-ink-subtle tabular-nums">{format.date(event.createdAt)}</time> · {event.title}</li>)}</ol>}
  {data?.canConsolidate && !data.pupil.consolidatedIntoId && <section className="sk-panel space-y-4 p-4 sm:p-6"><h2 className="text-lg font-bold text-ink-strong">{t.duplicate}</h2><p className="text-sm leading-relaxed text-ink-muted">{t.duplicateHint}</p><label className={fieldLabel}>{t.targetId}<Input className="block w-full" value={duplicateTarget} onChange={e=>{setDuplicateTarget(e.target.value);setDuplicate(null);}} /></label><div className="flex justify-end"><Button variant="default" loading={pending === "duplicate-preview"} disabled={busy || !duplicateTarget} onClick={()=>void run(async()=>setDuplicate(await request("/api/students/consolidation",{action:"preview",sourceId:id,targetId:duplicateTarget})), "duplicate-preview")}>{t.preview}</Button></div>
   {duplicate && <div className="space-y-4 border-t border-border-subtle pt-4"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 break-all text-sm font-medium text-ink-strong"><span><bdi>{duplicate.source.fullName}</bdi> <bdi className="font-normal text-ink-subtle">{duplicate.source.id}</bdi></span><ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle rtl:rotate-180" /><span><bdi>{duplicate.target.fullName}</bdi> <bdi className="font-normal text-ink-subtle">{duplicate.target.id}</bdi></span></p><dl className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">{Object.entries(duplicate.counts).filter(([,count])=>count>0).map(([model,count])=><div key={model} className={tile}><dt className="text-xs font-medium text-ink-muted">{{studentEnrollment:t.history,studentTimelineEvent:t.history,studentDocument:t.documents,attendance:t.attendance,invoice:t.invoices,reportCard:t.reports}[model] || model.replace(/([A-Z])/g," $1")}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-ink-strong">{count}</dd></div>)}</dl>{duplicate.blockers.length ? <Alert tone="danger" title={t.blocked}><ul className="list-disc space-y-1 ps-5">{duplicate.blockers.map(b=><li key={b}>{b}</li>)}</ul></Alert> : <><div className="grid gap-4 sm:grid-cols-2"><label className={fieldLabel}>{t.verifySource}<Input className="block w-full" value={verifySource} onChange={e=>setVerifySource(e.target.value)} /></label><label className={fieldLabel}>{t.verifyTarget}<Input className="block w-full" value={verifyTarget} onChange={e=>setVerifyTarget(e.target.value)} /></label></div><label className={fieldLabel}>{t.reason}<Input className="block w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label><div className="flex justify-end"><Button variant="default" loading={pending === "consolidate"} disabled={busy || verifySource!==id || verifyTarget!==duplicateTarget || !reason.trim()} onClick={()=>void run(async()=>{await request("/api/students/consolidation",{action:"confirm",sourceId:id,targetId:duplicateTarget,verifiedSourceId:verifySource,verifiedTargetId:verifyTarget,token:duplicate.token,reason});setDuplicate(null);await load();}, "consolidate")}>{t.consolidate}</Button></div></>}</div>}
  </section>}
  {/* SKO-471: evidence from a previous school, mapped by teachers into a bridge plan. */}
  {data && !data.pupil.consolidatedIntoId ? <LearningTransferPanel studentId={id} /> : null}
 </div>;
}
function Sources({ studentId, period }: { studentId: string; period: Period }) {
 const t=enrollmentLabels[useLocale().language], format=useLocaleFormat();
 const [data,setData]=useState<{ attendance: {id:string;date:string;status:string}[]; invoices:{id:string;invoiceNumber:string;invoiceDate:string;balanceDue:number;currency:string}[]; reports:{id:string;generatedAt:string;status:string;exam:{title:string}}[] } | null>(null),[error,setError]=useState("");
 return <details className="mt-3 border-t border-border-subtle pt-2" onToggle={e=>{if(e.currentTarget.open && !data) void request(`/api/students/enrollments?studentId=${encodeURIComponent(studentId)}&enrollmentId=${encodeURIComponent(period.id)}`).then(setData).catch(e=>setError(friendlyErrorMessage(e)));}}><summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-brand-700">{t.sources} · <span className="tabular-nums">{period._count.attendance + period._count.reports + period._count.invoices}</span></summary>{error && <Alert tone="danger" compact className="mt-2">{error}</Alert>}{!data && !error && <SkeletonRegion label={t.loading} className="space-y-2 pt-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></SkeletonRegion>}{data && <div className="space-y-1.5 pt-2 text-sm text-ink-muted"><p className="text-xs text-ink-subtle">{t.limit}</p>{data.attendance.map(a=><p key={a.id}>{t.attendance} · {format.date(a.date)} · {a.status} · <bdi className="break-all text-ink-subtle">{a.id}</bdi></p>)}{data.reports.map(r=><p key={r.id}><a className="sk-link" href={`/api/reports/download?reportCardId=${encodeURIComponent(r.id)}&studentId=${encodeURIComponent(studentId)}&redirect=1`}>{t.reports} · {r.exam.title}</a> · {format.date(r.generatedAt)} · <bdi className="break-all text-ink-subtle">{r.id}</bdi></p>)}{data.invoices.map(i=><p key={i.id}>{t.invoices} · {i.invoiceNumber} · {format.date(i.invoiceDate)} · <span className="tabular-nums">{format.money(i.balanceDue,i.currency)}</span> · <bdi className="break-all text-ink-subtle">{i.id}</bdi></p>)}{!data.attendance.length && !data.reports.length && !data.invoices.length && <p>{t.noSources}</p>}</div>}</details>;
}
