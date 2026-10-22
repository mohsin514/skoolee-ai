"use client";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { datePickerMessages } from "@/lib/locale/date-picker-messages";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { friendlyErrorMessage } from "@/components/ui/toast";
import { Download, FilePen, FileText, History, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { useNavigationAccess } from "@/components/nav/NavigationAccess";
import { useShellSession } from "@/components/role-dashboard/ScopeBadge";
import { consoleForRole, leafForPath } from "@/lib/navigation/role-nav";
import { correctionCopy } from "@/lib/corrections/copy";
import { type LocalePackage, formatMoney, parseMoney, localeTag } from "@/lib/locale/package";
type Data = Record<string, any>;
type Kind = "MARK" | "PAYMENT";
/**
 * The kinds this viewer may open (role-ux G28a): mark corrections for teachers and the academic lead, payment
 * corrections for the finance desk and campus admins. Families see the applied history of both. Derived from the
 * server-computed access map when the shell has it; otherwise both are offered and the API decides (a refused
 * kind is dropped after its first 403).
 */
function permittedKinds(access: Record<string, boolean> | null | undefined, family: boolean): Kind[] {
    if (family || !access || !("campusOps" in access)) return ["MARK", "PAYMENT"];
    const kinds: Kind[] = [];
    if (access.academicLead || (access.exams && !access.campusOps && !access.financeDesk)) kinds.push("MARK");
    if (access.financeDesk || access.campusOps) kinds.push("PAYMENT");
    return kinds.length ? kinds : ["MARK", "PAYMENT"];
}
type Tone = "info" | "success" | "danger";
/** Field guidance and fallback messages for this screen; the shared labels stay in correctionCopy. */
const guidance = {
    en: { reasonHint: "Seen by staff reviewers only. Families never see it.", explanationHint: "Families see this once the correction is applied and released.", noteHint: "Optional. Staff only; families never see private notes.", outOf: (max: number) => `Out of ${max}.`, submitNeeds: "Add a reason and a public explanation, then confirm your review, to request this correction.", noneFromDate: "No corrections from this date", clearDate: "Clear date", loadFailed: "Could not load corrections. Try again.", requestFailed: "Could not complete this request. Try again.", approvePaymentTitle: "Approve this payment correction?", approveMarkTitle: "Approve this mark correction?", approvePaymentBody: "A compensating payment is recorded and the original receipt stays in history. This cannot be undone; a later change needs a new correction.", approveMarkBody: "The mark changes and a new report version goes for approval before families see it. This cannot be undone; a later change needs a new correction.", rejectTitle: "Reject this correction?", rejectBody: "The original record stays as it is, and the requester sees that the correction was rejected.", keepEditing: "Keep editing", decisionReason: "Reason for this decision", decisionReasonHint: "For example: checked the bank statement and the original receipt.", titles: { "Record corrections": "Record corrections", "Mark corrections": "Mark corrections", "Payment corrections": "Payment corrections" } as Record<string, string>, kindMarks: "Marks", kindPayments: "Payments", requestCorrection: "Request correction" },
    ar: { reasonHint: "يراه المراجعون من الموظفين فقط، ولا تراه العائلات.", explanationHint: "تراه العائلات بعد تطبيق التصحيح ونشره.", noteHint: "اختياري. للموظفين فقط، ولا ترى العائلات الملاحظات الخاصة.", outOf: (max: number) => `من أصل ${max}.`, submitNeeds: "أضف السبب والتوضيح العام، ثم أكد مراجعتك، لطلب هذا التصحيح.", noneFromDate: "لا توجد تصحيحات من هذا التاريخ", clearDate: "مسح التاريخ", loadFailed: "تعذر تحميل التصحيحات. حاول مرة أخرى.", requestFailed: "تعذر إكمال هذا الطلب. حاول مرة أخرى.", approvePaymentTitle: "اعتماد تصحيح الدفعة هذا؟", approveMarkTitle: "اعتماد تصحيح الدرجة هذا؟", approvePaymentBody: "تُسجَّل دفعة تعويضية ويبقى الإيصال الأصلي في السجل. لا يمكن التراجع عن ذلك؛ وأي تغيير لاحق يحتاج إلى تصحيح جديد.", approveMarkBody: "تتغير الدرجة وتُرسل نسخة جديدة من التقرير للاعتماد قبل أن تراها العائلات. لا يمكن التراجع عن ذلك؛ وأي تغيير لاحق يحتاج إلى تصحيح جديد.", rejectTitle: "رفض هذا التصحيح؟", rejectBody: "يبقى السجل الأصلي كما هو، ويرى مقدّم الطلب أن التصحيح قد رُفض.", keepEditing: "متابعة التحرير", decisionReason: "سبب هذا القرار", decisionReasonHint: "مثال: رُوجع كشف الحساب البنكي والإيصال الأصلي.", titles: { "Record corrections": "تصحيحات السجلات", "Mark corrections": "تصحيحات الدرجات", "Payment corrections": "تصحيحات الدفعات" } as Record<string, string>, kindMarks: "الدرجات", kindPayments: "الدفعات", requestCorrection: "طلب تصحيح" },
    ur: { reasonHint: "صرف عملے کے جائزہ لینے والے دیکھتے ہیں؛ خاندان اسے کبھی نہیں دیکھتے۔", explanationHint: "تصحیح لاگو اور شائع ہونے کے بعد خاندان یہ دیکھتے ہیں۔", noteHint: "اختیاری۔ صرف عملے کے لیے؛ خاندان نجی نوٹس کبھی نہیں دیکھتے۔", outOf: (max: number) => `کل ${max} میں سے۔`, submitNeeds: "یہ تصحیح طلب کرنے کے لیے وجہ اور عوامی وضاحت شامل کریں، پھر اپنے جائزے کی تصدیق کریں۔", noneFromDate: "اس تاریخ سے کوئی تصحیح نہیں", clearDate: "تاریخ صاف کریں", loadFailed: "تصحیحات لوڈ نہیں ہو سکیں۔ دوبارہ کوشش کریں۔", requestFailed: "یہ درخواست مکمل نہیں ہو سکی۔ دوبارہ کوشش کریں۔", approvePaymentTitle: "کیا ادائیگی کی یہ تصحیح منظور کریں؟", approveMarkTitle: "کیا نمبروں کی یہ تصحیح منظور کریں؟", approvePaymentBody: "ایک تلافی ادائیگی درج ہوتی ہے اور اصل رسید ریکارڈ میں رہتی ہے۔ اسے واپس نہیں لیا جا سکتا؛ بعد کی کسی تبدیلی کے لیے نئی تصحیح درکار ہوگی۔", approveMarkBody: "نمبر بدل جاتے ہیں اور خاندانوں کے دیکھنے سے پہلے رپورٹ کا نیا ورژن منظوری کے لیے جاتا ہے۔ اسے واپس نہیں لیا جا سکتا؛ بعد کی کسی تبدیلی کے لیے نئی تصحیح درکار ہوگی۔", rejectTitle: "کیا یہ تصحیح مسترد کریں؟", rejectBody: "اصل ریکارڈ جوں کا توں رہتا ہے، اور درخواست دہندہ دیکھتا ہے کہ تصحیح مسترد کر دی گئی۔", keepEditing: "ترمیم جاری رکھیں", decisionReason: "اس فیصلے کی وجہ", decisionReasonHint: "مثلاً: بینک اسٹیٹمنٹ اور اصل رسید جانچی گئی۔", titles: { "Record corrections": "ریکارڈ کی تصحیحات", "Mark corrections": "نمبروں کی تصحیحات", "Payment corrections": "ادائیگیوں کی تصحیحات" } as Record<string, string>, kindMarks: "نمبر", kindPayments: "ادائیگیاں", requestCorrection: "تصحیح کی درخواست" },
};
export default function CorrectionClient({ actorId, schoolId, initialLanguage, initialKind, initialLocale }: {
    initialLocale: LocalePackage;
    actorId: string;
    schoolId: string;
    initialLanguage: string;
    initialKind: string;
}) {
    // The shell's account menu owns the language; this screen follows the viewer's preference.
    const lang = initialLanguage in correctionCopy ? initialLanguage : "en";
    const t = correctionCopy[lang as keyof typeof correctionCopy];
    const g = guidance[lang as keyof typeof guidance] ?? guidance.en;
    const navigation = useNavigationAccess();
    const [refused, setRefused] = useState<Kind[]>([]);
    const [kind, setKindState] = useState(initialKind), [data, setData] = useState<Data>({ records: { canRequest: false, items: [] }, history: [] }), [selected, setSelected] = useState(""), [form, setForm] = useState<Data>({ score: "", absent: false, reason: "", publicExplanation: "", privateNote: "", allocations: {}, credit: "" }), [preview, setPreview] = useState<Data | null>(null), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [date, setDate] = useState("");
    // Presentation only: which request is running (for its button's spinner) and how the feedback reads.
    const [pending, setPending] = useState(""), [tone, setTone] = useState<Tone>("info");
    // The approve / reject decision waiting on its confirmation (R3).
    const [deciding, setDeciding] = useState<{ row: Data; action: "approve" | "reject" } | null>(null);
    const feedback = useRef<HTMLDivElement>(null);
    const key = `skoolee:draft:v1:correction:${schoolId}:${actorId}:${kind}`;
    // The server says whether this viewer may file a request (P8-03): `records` is `{ canRequest, items }`. An older
    // array reply is read as a requester's list so a stale tab keeps working.
    const catalogItems: Data[] = Array.isArray(data.records) ? data.records : data.records?.items ?? [];
    const canRequest = Array.isArray(data.records) ? data.records.length > 0 : data.records?.canRequest === true;
    const record = catalogItems.find((r: Data) => r.id === selected);
    const policy = { ...initialLocale, language: lang as "en" | "ar" | "ur" };
    const money = (minor: number, currency: string) => formatMoney({ minor, currency }, policy);
    const notify = (text: string, next: Tone) => { setMessage(text); setTone(next); };
    const kinds = useMemo(() => permittedKinds(navigation.status === "ready" ? navigation.access as Record<string, boolean> | null : null, data.family === true).filter(k => !refused.includes(k)), [navigation.status, navigation.access, data.family, refused]);
    // Keep `?kind=` in the address (notifications and the Today queue deep-link here) without a router round trip.
    const setKind = (next: string) => {
        setKindState(next);
        const params = new URLSearchParams(window.location.search);
        params.set("kind", next);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
    };
    useEffect(() => { if (kinds.length && !kinds.includes(kind as Kind)) setKindState(kinds[0]); }, [kinds, kind]);
    async function load() { setBusy(true); try {
        const r = await fetch(`/api/corrections?kind=${kind}`, { cache: "no-store" });
        const d = await r.json();
        if (r.status === 403 && !refused.includes(kind as Kind) && kinds.length > 1) {
            // This kind is not ours: drop it and move to the one that is, without an error banner.
            setRefused(current => [...current, kind as Kind]);
            return;
        }
        if (!r.ok)
            throw new Error(d.error ?? t.denied);
        setData(d);
    }
    catch (e) {
        setData({ records: { canRequest: false, items: [] }, history: [] });
        notify(friendlyErrorMessage(e, g.loadFailed), "danger");
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { setPreview(null); setReviewed(false); setSelected(""); void load(); try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (saved && saved.expiresAt > Date.now()) {
            setSelected(saved.selected);
            setForm(saved.form);
        }
        else
            setForm({ score: "", absent: false, reason: "", publicExplanation: "", privateNote: "", allocations: {}, credit: "" });
    }
    catch { } }, [kind]);
    const change = (k: string, v: any) => { setForm(f => ({ ...f, [k]: v })); setPreview(null); setReviewed(false); };
    function proposal() { if (!record) throw new Error(g.requestFailed); const original = record.original; return { kind, sourceId: selected, expectedVersion: record.version, ...(kind === "MARK" ? { marksObtained: Number(form.score), isAbsent: form.absent } : { allocations: original.allocations.map((a: Data) => ({ invoiceId: a.invoiceId, minor: parseMoney(form.allocations[a.invoiceId] || "0", original.currency).minor })), unappliedMinor: parseMoney(form.credit || "0", original.currency).minor }) }; }
    async function post(payload: Data) { setBusy(true); setPending(`${payload.action}:${payload.id ?? ""}`); setMessage(""); try {
        const r = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error ?? g.requestFailed);
        return d;
    }
    catch (e) {
        notify(friendlyErrorMessage(e, g.requestFailed), "danger");
        return null;
    }
    finally {
        setBusy(false);
        setPending("");
        setTimeout(() => feedback.current?.focus(), 0);
    } }
    const running = (name: string, id = "") => busy && pending === `${name}:${id}`;
    function evidence(value: Data) {
        if ("marksObtained" in value)
            return <p className="text-sm text-ink tabular-nums"><bdi className="font-semibold text-ink-strong">{value.marksObtained} / {value.maximum} · {value.grade}</bdi> {value.isAbsent ? <Badge variant="warning" size="sm">{t.absent}</Badge> : ""}</p>;
        const currency = value.reversal?.currency ?? value.currency;
        return <div className="space-y-2 text-sm text-ink tabular-nums"><p><bdi className="font-semibold text-ink-strong">{money(value.reversal?.minor ?? value.amount, currency)}</bdi> · <bdi>{value.receiptNo}</bdi></p>{value.remaining && <p>{t.proposed}: <bdi>{money(value.remaining.minor, currency)}</bdi></p>}{value.invoices?.map((i: Data) => <div key={i.id} className="space-y-0.5 border-t border-border-subtle pt-2"><bdi className="block break-all text-xs text-ink-subtle">{i.id}</bdi><p>{t.paid}: <bdi>{money(i.paidMinor ?? i.paid, currency)}</bdi></p><p>{t.balance}: <bdi>{money(i.balanceMinor ?? i.balance, currency)}</bdi></p></div>)}<p>{t.credit}: <bdi>{money(value.unappliedMinor ?? 0, currency)}</bdi></p></div>;
    }
    const button = buttonVariants({ variant: "outline", size: "sm" });
    const visibleHistory = data.history.filter((c: Data) => !date || c.requestedAt >= date);
    const statusBadge = (status: string) => status === "APPLIED" ? <Badge variant="success" dot>{t.applied}</Badge> : status === "REJECTED" ? <Badge variant="danger" dot>{t.rejected}</Badge> : <Badge variant="warning" dot>{t.pending}</Badge>;
    const missingText = !form.reason.trim() || !form.publicExplanation.trim();
    // Requesters (the finance desk for payments, teachers for marks) open this screen to file a request, so
    // "Request correction" is the one PageHeader primary and takes them to the record picker (role-ux §4.4b).
    // Approvers (campus operators, the academic lead) see a queue with no primary.
    const recordField = useRef<HTMLSelectElement>(null);
    // Requester or not is the server's answer for this kind (P8-03), never a guess from the access map: a campus
    // admin holding the finance desk requests payment corrections; the principal and the group admin never request.
    const requester = !data.family && canRequest;
    // The title is the registry label of the viewer's own leaf (§4.3): "Payment corrections" at the finance desk,
    // "Mark corrections" for the principal, "Record corrections" elsewhere.
    const session = useShellSession();
    const leafLabel = session?.role ? leafForPath(consoleForRole(session.role), "/corrections")?.label : undefined;
    const title = g.titles[leafLabel ?? "Record corrections"] ?? t.title;
    const startRequest = () => { const field = recordField.current; if (!field) return; field.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); field.focus({ preventScroll: true }); };
    return <div dir={lang === "en" ? "ltr" : "rtl"} lang={lang} className="mx-auto w-full min-w-0 max-w-5xl space-y-6 pb-16">
  <PageHeader title={title} description={t.intro} primaryAction={requester ? { id: "request-correction", label: g.requestCorrection, icon: FilePen, onClick: startRequest } : undefined} tabs={kinds.length > 1 ? <ViewTabs ariaLabel="Correction kinds" value={kind} onChange={setKind} items={kinds.map(k => ({ id: k, label: k === "MARK" ? g.kindMarks : g.kindPayments }))} /> : undefined} />
  <div ref={feedback} tabIndex={-1} role="status" aria-live="polite" className="break-words">{message ? <Alert tone={tone} live="off">{message}</Alert> : null}</div>
  {requester && <section className="sk-panel space-y-5 p-4 sm:p-6" aria-label={t.review}>
  <FormField name="record" label={t.record}><Select ref={recordField} className="w-full" value={selected} onChange={e => { setSelected(e.target.value); setPreview(null); setReviewed(false); }}><option value="">{t.reviewFirst}</option>{catalogItems.map((r: Data) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></FormField>
  {record && <><div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0 space-y-3 rounded-2xl border border-border-subtle bg-surface-subtle p-4"><h2 className="text-sm font-semibold text-ink-strong">{t.original}</h2>{evidence(record.original)}<details className="text-xs text-ink-subtle"><summary className="cursor-pointer font-medium text-ink-muted">{t.version}</summary><bdi className="mt-1 block break-all">{record.version}</bdi></details></div><div className="min-w-0 space-y-4 rounded-2xl border border-status-brand-border bg-card p-4 shadow-xs"><h2 className="text-sm font-semibold text-ink-strong">{t.proposed}</h2>{kind === "MARK" ? <><FormField name="score" label={t.value} hint={record.original.maximum != null ? g.outOf(record.original.maximum) : undefined}><Input className="block w-full tabular-nums" type="number" min="0" max={record.original.maximum} value={form.score} onChange={e => change("score", e.target.value)}/></FormField><label className="flex min-h-11 items-center gap-2 text-sm font-medium text-ink"><Checkbox checked={form.absent} onChange={e => { change("absent", e.target.checked); if (e.target.checked)
                change("score", "0"); }}/> {t.absent}</label></> : <>{record.original.allocations.map((a: Data) => <label key={a.invoiceId} className="block min-w-0 space-y-1.5 break-all text-sm font-semibold text-ink"><span>{t.amount}: <bdi className="tabular-nums">{money(a.minor, record.original.currency)}</bdi></span><small className="block text-xs font-normal text-ink-subtle"><bdi>{a.invoiceId}</bdi></small><Input aria-label={`${t.amount} ${a.invoiceId}`} inputMode="decimal" className={"block w-full tabular-nums"} value={form.allocations[a.invoiceId] ?? ""} onChange={e => change("allocations", { ...form.allocations, [a.invoiceId]: e.target.value })}/></label>)}<FormField name="credit" label={<>{t.credit}: <bdi className="tabular-nums">{money(record.original.unappliedMinor, record.original.currency)}</bdi></>}><Input inputMode="decimal" className={"block w-full tabular-nums"} value={form.credit} onChange={e => change("credit", e.target.value)}/></FormField></>}</div></div>
  {["reason", "publicExplanation", "privateNote"].map((field, i) => <FormField key={field} name={field} label={[t.reason, t.explanation, t.note][i]} required={i < 2} hint={[g.reasonHint, g.explanationHint, g.noteHint][i]} showCount><Textarea className={"block w-full"} required={i < 2} maxLength={i < 2 ? 2000 : 4000} value={form[field]} onChange={e => change(field, e.target.value)}/></FormField>)}</>}
  <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4"><Button variant={preview ? "outline" : "default"} disabled={busy || !record} loading={running("preview")} onClick={async () => { try {
            const d = await post({ action: "preview", proposal: proposal() });
            if (d)
                setPreview(d);
        }
        catch (e) {
            notify(friendlyErrorMessage(e, g.requestFailed), "danger");
        } }}>{t.review}</Button><Button variant="outline"  onClick={() => { sessionStorage.setItem(key, JSON.stringify({ selected, form, expiresAt: Date.now() + 86400000 })); notify(t.saved, "success"); }}>{t.save}</Button><Button variant="ghost"  onClick={() => { sessionStorage.removeItem(key); setForm({ score: "", absent: false, reason: "", publicExplanation: "", privateNote: "", allocations: {}, credit: "" }); setPreview(null); }}>{t.clear}</Button><Button variant="ghost" className="sm:ms-auto" disabled={busy} onClick={() => { setPreview(null); setReviewed(false); void load(); }}><RefreshCw aria-hidden="true" className={busy && !pending ? "animate-spin motion-reduce:animate-none" : undefined} />{t.refresh}</Button></div>
  {preview && <div className="sk-enter space-y-4 rounded-2xl border border-status-brand-border bg-status-brand-surface p-4 sm:p-5" aria-live="polite"><div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0 space-y-2"><h3 className="text-sm font-semibold text-ink-strong">{t.original}</h3>{evidence(preview.before)}</div><div className="min-w-0 space-y-2"><h3 className="text-sm font-semibold text-ink-strong">{t.proposed}</h3>{evidence(preview.after)}</div></div><Alert tone="info" live="off" compact>{kind === "MARK" ? t.report : t.finance}</Alert>{preview.separateApprover && <Alert tone="warning" live="off" compact>{t.separation}</Alert>}<label className="flex items-start gap-3 text-sm font-medium leading-relaxed text-ink"><Checkbox className="mt-0.5" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{t.confirm}</label>{(!reviewed || missingText) && <p className="text-xs leading-relaxed text-ink-subtle">{g.submitNeeds}</p>}<Button variant="default" disabled={busy || !reviewed || !form.reason.trim() || !form.publicExplanation.trim()} loading={running("request")} onClick={async () => { const d = await post({ action: "request", proposal: proposal(), reviewHash: preview.hash, reason: form.reason, publicExplanation: form.publicExplanation, privateNote: form.privateNote }); if (d) {
            notify(t.success, "success");
            setPreview(null);
            sessionStorage.removeItem(key);
            await load();
        } }}>{t.submit}</Button></div>}
  </section>}
  <section className="space-y-4" aria-label={t.history}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-ink-strong">{t.history}</h2><div className="flex flex-wrap items-center gap-2"><a className={button} href={`/api/corrections?kind=${kind}&export=1`}><Download aria-hidden="true" />{t.export}</a><label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">{t.date}<DatePicker label={t.date} locale={localeTag(policy)} messages={datePickerMessages[policy.language]} dir={lang === "en" ? "ltr" : "rtl"} weekStartsOn={policy.weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6} todayDate={new Intl.DateTimeFormat("en-CA", { timeZone: policy.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} value={date} onChange={e => setDate(e.target.value)}/></label></div></div><Alert tone="neutral" live="off" compact>{t.restricted}</Alert>{!data.history.length && <div className="sk-panel"><EmptyState size="sm" icon={History} title={t.empty} /></div>}{data.history.length > 0 && !visibleHistory.length && <div className="sk-panel"><EmptyState size="sm" icon={History} title={g.noneFromDate} secondaryAction={<Button variant="outline" size="sm" onClick={() => setDate("")}>{g.clearDate}</Button>} /></div>}
  <ol className="space-y-4 border-s-2 border-border-subtle ps-4">{visibleHistory.map((c: Data) => <li key={c.id} className="sk-panel space-y-4 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><bdi className="min-w-0 break-all font-mono text-xs text-ink-subtle">{c.id}</bdi>{statusBadge(c.status)}</div><div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0 space-y-2 rounded-xl bg-surface-subtle p-3"><h3 className="text-xs font-semibold text-ink-muted">{t.original}</h3>{evidence(c.before)}</div><div className="min-w-0 space-y-2 rounded-xl bg-surface-subtle p-3"><h3 className="text-xs font-semibold text-ink-muted">{t.proposed}</h3>{evidence(c.after)}</div></div><p className="text-sm leading-relaxed text-ink">{c.publicExplanation}</p><p className="text-xs text-ink-subtle">{c.requesterName} · <time className="tabular-nums">{new Date(c.requestedAt).toLocaleString(lang, { timeZone: policy.timezone })}</time>{c.approverName && ` · ${c.approverName}`}</p>{c.reason && <p className="text-sm leading-relaxed text-ink-muted"><span className="font-semibold text-ink">{t.reason}:</span> {c.reason}</p>}{c.privateNote && <p className="text-sm leading-relaxed text-ink-muted"><span className="font-semibold text-ink">{t.note}:</span> {c.privateNote}</p>}{c.status === "APPLIED" && !c.released && <Badge variant="info" dot>{t.awaitingReport}</Badge>}<div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3"><a className={button} href={`/api/corrections?kind=${kind}&receipt=${c.id}`}><FileText aria-hidden="true" />{t.receipt}</a>{kind === "PAYMENT" ? <a className={button} href={`/api/corrections?kind=PAYMENT&original=${c.sourceId}`}>{t.source}</a> : c.before.reports?.filter((r: Data) => r.publishedVersionId).map((r: Data) => <a key={r.id} className={button} href={`/api/reports/download?reportCardId=${r.id}&versionId=${r.publishedVersionId}&redirect=1`}>{t.source}</a>)}{c.status === "PENDING" && c.canApprove && <><Button variant="outline" size="sm" disabled={busy} loading={running("reject", c.id)} onClick={() => setDeciding({ row: c, action: "reject" })}>{t.reject}</Button><Button size="sm" disabled={busy} loading={running("approve", c.id)} onClick={() => setDeciding({ row: c, action: "approve" })}>{t.approve}</Button></>}{c.status === "PENDING" && !c.canApprove && !data.family && <p className="basis-full text-xs leading-relaxed text-ink-subtle">{t.separation}</p>}</div></li>)}</ol></section>
  <ConfirmAction
    open={Boolean(deciding)}
    tone={deciding?.action === "approve" ? "warning" : "danger"}
    title={deciding?.action === "reject" ? g.rejectTitle : kind === "PAYMENT" ? g.approvePaymentTitle : g.approveMarkTitle}
    description={deciding?.action === "reject" ? g.rejectBody : kind === "PAYMENT" ? g.approvePaymentBody : g.approveMarkBody}
    confirmLabel={deciding?.action === "reject" ? t.reject : t.approve}
    cancelLabel={g.keepEditing}
    busy={busy}
    // A payment decision is a money decision (R3, §4.5.5, P8-10): the approver types why, kept in the audit row.
    requireReason={kind === "PAYMENT" ? { label: g.decisionReason, minLength: 10, placeholder: g.decisionReasonHint } : undefined}
    onCancel={() => setDeciding(null)}
    onConfirm={async (reason?: string) => {
        const decision = deciding;
        if (!decision)
            return;
        const d = await post({ action: decision.action, id: decision.row.id, reviewHash: decision.row.previewHash, ...(reason ? { reason } : {}) });
        setDeciding(null);
        if (d) {
            if (decision.action === "approve")
                notify(t.success, "success");
            await load();
        }
    }}
  />
 </div>;
}
