"use client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { use, useCallback, useEffect, useState } from "react";
import { LocaleProvider, useLocale, useLocaleFormat } from "@/components/locale/LocaleProvider";
import { enrollmentLabels } from "@/lib/students/labels";

type Period = { id: string; className: string; campusName: string; curriculum: string; academicYear: number; rollNo: string; startDate: string; endDate: string | null; status: string; origin: string; _count: { attendance: number; invoices: number; reports: number } };
type Data = { pupil: { id: string; fullName: string; admissionNo: string | null; consolidatedIntoId: string | null; enrollments: Period[] }; classes: { id: string; name: string; section: string | null; academicYear: number; campus: { name: string } }[]; proposals: { id: string; effectiveDate: string; rollNo: string; targetClassId: string; reason: string; status: string }[]; events: { id:string; title:string; createdAt:string }[]; documents: { id: string; fileName: string; uploadedAt: string }[]; canManage: boolean; canConsolidate: boolean };
type Impact = { preserved: { attendance: number; reports: number; invoices: number }; targetOccupancy: number };
type Duplicate = { token: string; blockers: string[]; counts: Record<string,number>; source: { fullName: string; id: string }; target: { fullName: string; id: string } };
async function request(url: string, body?: unknown) {
 const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
 const data = await response.json(); if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed"); return data;
}
const field = "w-full";
const button = "px-4 py-3";
export default function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <LocaleProvider><Pupil id={id} /></LocaleProvider>; }
function Pupil({ id }: { id: string }) {
 const locale = useLocale(), format = useLocaleFormat(), t = enrollmentLabels[locale.language];
 const [data,setData] = useState<Data | null>(null), [loading,setLoading] = useState(true), [error,setError] = useState("");
 const [busy,setBusy] = useState(false), [success,setSuccess] = useState(false);
 const [targetClassId,setTarget] = useState(""), [effectiveDate,setDate] = useState(""), [rollNo,setRoll] = useState(""), [reason,setReason] = useState("");
 const [impact,setImpact] = useState<Impact | null>(null), [proposalId,setProposal] = useState(""), [reviewed,setReviewed] = useState(false);
 const [duplicateTarget,setDuplicateTarget] = useState(""), [duplicate,setDuplicate] = useState<Duplicate | null>(null), [verifySource,setVerifySource] = useState(""), [verifyTarget,setVerifyTarget] = useState("");
 const load = useCallback(async () => { setLoading(true); try { setData(await request(`/api/students/enrollments?studentId=${encodeURIComponent(id)}`)); setError(""); } catch(e) { setError((e as Error).message); } finally { setLoading(false); } },[id]);
 useEffect(() => { void load(); },[load]);
 const current = data?.pupil.enrollments.find(p => p.status === "ACTIVE" && !p.endDate);
 const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); setSuccess(false); try { await fn(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } };
 const payload = { studentId:id, fromEnrollmentId:current?.id, targetClassId,effectiveDate,rollNo,reason };
 const reset = () => { setImpact(null); setProposal(""); setReviewed(false); };
 return <main dir={locale.language === "en" ? "ltr" : "rtl"} className="mx-auto max-w-5xl space-y-6 p-4 pb-16 text-slate-900 sm:p-8">
  <header className="sticky top-0 z-10 sk-panel p-4 shadow-sm"><p className="text-sm text-purple-700">{t.title}</p><h1 className="break-words text-2xl font-bold">{data?.pupil.fullName || t.title}</h1><p className="break-all text-sm">{t.identity}: <bdi>{id}</bdi></p>{data && <p>{t.admission}: <bdi>{data.pupil.admissionNo || "—"}</bdi></p>}{current && <p className="mt-2 font-medium">{t.current}: {current.campusName} · {current.className} · <bdi>{current.rollNo}</bdi></p>}</header>
  {error && <div id="enrollment-error" role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4">{error} <Button variant="link" className="underline" onClick={() => void load()}>{t.retry}</Button></div>}
  {loading && <p role="status">{t.loading}</p>}
  {success && <p role="status" className="rounded-lg bg-green-50 p-4">{t.success}</p>}
  {data?.pupil.consolidatedIntoId && <p>{t.alias}: <a className="underline" href={`/pupils/${data.pupil.consolidatedIntoId}`}><bdi>{data.pupil.consolidatedIntoId}</bdi></a></p>}
  {data && !current && !data.pupil.consolidatedIntoId && <p>{t.empty}</p>}
  {data?.canManage && current && !data.pupil.consolidatedIntoId && <section aria-labelledby="change-title" className="sk-panel space-y-4 p-5">
   <h2 id="change-title" className="text-xl font-bold">{t.change}</h2><p>{t.notice}</p><p className="text-sm">{t.policy}</p>
   <form onSubmit={e => { e.preventDefault(); void run(async () => { setImpact(await request("/api/students/enrollments",{...payload,action:"preview"})); }); }} className="space-y-4">
    <fieldset disabled={busy || !!impact} className="grid gap-4 sm:grid-cols-2">
     <label>{t.target}<Select aria-label={t.target} required className="block w-full" value={targetClassId} onChange={e=>setTarget(e.target.value)}><option value="">{t.choose}</option>{data.classes.map(c=><option key={c.id} value={c.id}>{c.campus.name} · {c.name} {c.section} · {c.academicYear}</option>)}</Select></label>
     <label>{t.date}<Input aria-invalid={/date|overlap|Attendance|boundary/i.test(error)} aria-describedby={error ? "enrollment-error" : undefined} required className={` ${field} `} type="date" value={effectiveDate} onChange={e=>setDate(e.target.value)} /></label>
     <label>{t.roll}<Input required className="block w-full" value={rollNo} onChange={e=>setRoll(e.target.value)} /></label>
     <label>{t.reason}<Input required maxLength={1000} className="block w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label>
    </fieldset>
    {!impact && <Button variant="default" disabled={busy} className="px-4 py-3">{t.preview}</Button>}
   </form>
   {impact && <div className="space-y-3 rounded-lg bg-purple-50 p-4" aria-live="polite"><h3 className="font-bold">{t.preserved}</h3><p>{t.attendance}: {impact.preserved.attendance} · {t.reports}: {impact.preserved.reports} · {t.invoices}: {impact.preserved.invoices}</p><p>{t.occupancy}: {impact.targetOccupancy}</p><p>{t.capacity}</p><p><bdi>{effectiveDate}</bdi> · <bdi>{id}</bdi></p>
    {!proposalId ? <Button variant="default" disabled={busy} className="px-4 py-3" onClick={()=>void run(async()=>{ const result=await request("/api/students/enrollments",{...payload,action:"propose"});setProposal(result.proposal.id); })}>{t.save}</Button> : <><label className="flex items-start gap-3"><Checkbox  checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className="mt-1" />{t.reviewed}</label><Button variant="default" disabled={busy || !reviewed} className="px-4 py-3" onClick={()=>void run(async()=>{await request("/api/students/enrollments",{studentId:id,action:"confirm",proposalId,reviewed,capacityChecked:reviewed});reset();await load();setSuccess(true);})}>{t.confirm}</Button></>}
    <Button variant="link" disabled={busy} className="ms-3 underline" onClick={reset}>{t.clear}</Button>
   </div>}
   {data.proposals.some(p=>p.status==="PROPOSED") && <details><summary className="cursor-pointer">{t.proposals}</summary><ul>{data.proposals.filter(p=>p.status==="PROPOSED").map(p=><li key={p.id} className="my-2 break-all"><bdi>{p.effectiveDate.slice(0,10)}</bdi> · {p.rollNo} · <bdi>{p.id}</bdi> <Button variant="link" className="underline" disabled={busy} onClick={()=>void run(async()=>{setTarget(p.targetClassId);setDate(p.effectiveDate.slice(0,10));setRoll(p.rollNo);setReason(p.reason);setImpact(await request("/api/students/enrollments",{studentId:id,fromEnrollmentId:current.id,targetClassId:p.targetClassId,effectiveDate:p.effectiveDate.slice(0,10),rollNo:p.rollNo,reason:p.reason,action:"preview"}));setProposal(p.id);setReviewed(false);})}>{t.preview}</Button></li>)}</ul></details>}
  </section>}
  {data && <section aria-labelledby="history-title"><h2 id="history-title" className="mb-4 text-xl font-bold">{t.history}</h2><ol className="space-y-4">{data.pupil.enrollments.map(period=><li key={period.id} className="sk-panel p-5"><h3 className="font-semibold">{period.campusName} · {period.className}</h3><p><time dateTime={period.startDate.slice(0,10)}>{format.date(period.startDate)}</time> — {period.endDate ? <time dateTime={period.endDate.slice(0,10)}>{format.date(period.endDate)}</time> : period.status === "ACTIVE" ? t.active : t.ended}</p><p className="text-sm"><bdi>{period.startDate.slice(0,10)} / {period.endDate?.slice(0,10) || "—"}</bdi></p><p>{t.roll}: <bdi>{period.rollNo}</bdi> · {t.year}: {period.academicYear}</p><p>{t.curriculum}: {period.curriculum}</p>{period.origin.startsWith("LEGACY") && <p className="text-amber-800">{t.legacy}</p>}<Sources studentId={id} period={period} /></li>)}</ol></section>}
  {!!data?.documents.length && <section><h2 className="text-xl font-bold">{t.documents}</h2><ul>{data.documents.map(d=><li key={d.id} className="my-2 break-all"><a className="text-purple-700 underline" href={`/api/students/enrollments?studentId=${encodeURIComponent(id)}&documentId=${encodeURIComponent(d.id)}`}>{d.fileName}</a> · {format.date(d.uploadedAt)}</li>)}</ul></section>}
  {!!data?.events.length && <ol className="space-y-2">{data.events.map(event=><li key={event.id}><time dateTime={event.createdAt}>{format.date(event.createdAt)}</time> · {event.title}</li>)}</ol>}
  {data?.canConsolidate && !data.pupil.consolidatedIntoId && <section className="sk-panel space-y-4 p-5"><h2 className="text-xl font-bold">{t.duplicate}</h2><p>{t.duplicateHint}</p><label className="block">{t.targetId}<Input className="block w-full" value={duplicateTarget} onChange={e=>{setDuplicateTarget(e.target.value);setDuplicate(null);}} /></label><Button variant="default" className="px-4 py-3" disabled={busy || !duplicateTarget} onClick={()=>void run(async()=>setDuplicate(await request("/api/students/consolidation",{action:"preview",sourceId:id,targetId:duplicateTarget})))}>{t.preview}</Button>
   {duplicate && <div className="space-y-3"><p>{duplicate.source.fullName} <bdi>{duplicate.source.id}</bdi> → {duplicate.target.fullName} <bdi>{duplicate.target.id}</bdi></p><dl className="grid grid-cols-2 gap-2">{Object.entries(duplicate.counts).filter(([,count])=>count>0).map(([model,count])=><div key={model}><dt>{{studentEnrollment:t.history,studentTimelineEvent:t.history,studentDocument:t.documents,attendance:t.attendance,invoice:t.invoices,reportCard:t.reports}[model] || model.replace(/([A-Z])/g," $1")}</dt><dd>{count}</dd></div>)}</dl>{duplicate.blockers.length ? <div role="alert"><h3>{t.blocked}</h3><ul>{duplicate.blockers.map(b=><li key={b}>{b}</li>)}</ul></div> : <><label className="block">{t.verifySource}<Input className="block w-full" value={verifySource} onChange={e=>setVerifySource(e.target.value)} /></label><label className="block">{t.verifyTarget}<Input className="block w-full" value={verifyTarget} onChange={e=>setVerifyTarget(e.target.value)} /></label><label className="block">{t.reason}<Input className="block w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label><Button variant="default" className="px-4 py-3" disabled={busy || verifySource!==id || verifyTarget!==duplicateTarget || !reason.trim()} onClick={()=>void run(async()=>{await request("/api/students/consolidation",{action:"confirm",sourceId:id,targetId:duplicateTarget,verifiedSourceId:verifySource,verifiedTargetId:verifyTarget,token:duplicate.token,reason});setDuplicate(null);await load();})}>{t.consolidate}</Button></>}</div>}
  </section>}
 </main>;
}
function Sources({ studentId, period }: { studentId: string; period: Period }) {
 const t=enrollmentLabels[useLocale().language], format=useLocaleFormat();
 const [data,setData]=useState<{ attendance: {id:string;date:string;status:string}[]; invoices:{id:string;invoiceNumber:string;invoiceDate:string;balanceDue:number;currency:string}[]; reports:{id:string;generatedAt:string;status:string;exam:{title:string}}[] } | null>(null),[error,setError]=useState("");
 return <details className="mt-3" onToggle={e=>{if(e.currentTarget.open && !data) void request(`/api/students/enrollments?studentId=${encodeURIComponent(studentId)}&enrollmentId=${encodeURIComponent(period.id)}`).then(setData).catch(e=>setError(e.message));}}><summary className="cursor-pointer text-purple-800 underline">{t.sources} · {period._count.attendance + period._count.reports + period._count.invoices}</summary>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">{t.loading}</p>}{data && <div className="space-y-2 pt-3 text-sm"><p>{t.limit}</p>{data.attendance.map(a=><p key={a.id}>{t.attendance} · {format.date(a.date)} · {a.status} · <bdi className="break-all">{a.id}</bdi></p>)}{data.reports.map(r=><p key={r.id}><a className="text-purple-700 underline" href={`/api/reports/download?reportCardId=${encodeURIComponent(r.id)}&studentId=${encodeURIComponent(studentId)}&redirect=1`}>{t.reports} · {r.exam.title}</a> · {format.date(r.generatedAt)} · <bdi className="break-all">{r.id}</bdi></p>)}{data.invoices.map(i=><p key={i.id}>{t.invoices} · {i.invoiceNumber} · {format.date(i.invoiceDate)} · {format.money(i.balanceDue,i.currency)} · <bdi className="break-all">{i.id}</bdi></p>)}{!data.attendance.length && !data.reports.length && !data.invoices.length && <p>{t.noSources}</p>}</div>}</details>;
}
