"use client";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { datePickerMessages } from "@/lib/locale/date-picker-messages";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { correctionCopy } from "@/lib/corrections/copy";
import { type LocalePackage, formatMoney, parseMoney, localeTag } from "@/lib/locale/package";
type Data = Record<string, any>;
export default function CorrectionClient({ actorId, schoolId, initialLanguage, initialKind, initialLocale }: {
    initialLocale: LocalePackage;
    actorId: string;
    schoolId: string;
    initialLanguage: string;
    initialKind: string;
}) {
    const [lang, setLang] = useState(initialLanguage in correctionCopy ? initialLanguage : "en");
    const t = correctionCopy[lang as keyof typeof correctionCopy];
    const [kind, setKind] = useState(initialKind), [data, setData] = useState<Data>({ records: [], history: [] }), [selected, setSelected] = useState(""), [form, setForm] = useState<Data>({ score: "", absent: false, reason: "", publicExplanation: "", privateNote: "", allocations: {}, credit: "" }), [preview, setPreview] = useState<Data | null>(null), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [date, setDate] = useState("");
    const feedback = useRef<HTMLParagraphElement>(null);
    const key = `skoolee:draft:v1:correction:${schoolId}:${actorId}:${kind}`;
    const record = data.records.find((r: Data) => r.id === selected);
    const policy = { ...initialLocale, language: lang as "en" | "ar" | "ur" };
    const money = (minor: number, currency: string) => formatMoney({ minor, currency }, policy);
    async function load() { setBusy(true); try {
        const r = await fetch(`/api/corrections?kind=${kind}`, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error ?? t.denied);
        setData(d);
    }
    catch (e) {
        setData({ records: [], history: [] });
        setMessage(String(e instanceof Error ? e.message : e));
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
    function proposal() { const original = record.original; return { kind, sourceId: selected, expectedVersion: record.version, ...(kind === "MARK" ? { marksObtained: Number(form.score), isAbsent: form.absent } : { allocations: original.allocations.map((a: Data) => ({ invoiceId: a.invoiceId, minor: parseMoney(form.allocations[a.invoiceId] || "0", original.currency).minor })), unappliedMinor: parseMoney(form.credit || "0", original.currency).minor }) }; }
    async function post(payload: Data) { setBusy(true); setMessage(""); try {
        const r = await fetch("/api/corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error ?? "Request failed");
        return d;
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
        return null;
    }
    finally {
        setBusy(false);
        setTimeout(() => feedback.current?.focus(), 0);
    } }
    function evidence(value: Data) {
        if ("marksObtained" in value)
            return <p><bdi>{value.marksObtained} / {value.maximum} · {value.grade}</bdi> {value.isAbsent ? t.absent : ""}</p>;
        const currency = value.reversal?.currency ?? value.currency;
        return <div className="space-y-2"><p><bdi>{money(value.reversal?.minor ?? value.amount, currency)}</bdi> · <bdi>{value.receiptNo}</bdi></p>{value.remaining && <p>{t.proposed}: <bdi>{money(value.remaining.minor, currency)}</bdi></p>}{value.invoices?.map((i: Data) => <div key={i.id} className="border-t pt-2"><bdi className="block break-all text-xs">{i.id}</bdi><p>{t.paid}: <bdi>{money(i.paidMinor ?? i.paid, currency)}</bdi></p><p>{t.balance}: <bdi>{money(i.balanceMinor ?? i.balance, currency)}</bdi></p></div>)}<p>{t.credit}: <bdi>{money(value.unappliedMinor ?? 0, currency)}</bdi></p></div>;
    }
    const button = buttonVariants({ variant: "outline" });
    return <main dir={lang === "en" ? "ltr" : "rtl"} lang={lang} className="mx-auto max-w-5xl space-y-6 p-4 pb-16 sm:p-8">
  <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">{t.title}</h1><p>{t.intro}</p></div><Select aria-label="Language" value={lang} onChange={e => setLang(e.target.value)} ><option value="en">English</option><option value="ar">العربية</option><option value="ur">اردو</option></Select></header>
  <nav className="flex gap-2">{["MARK", "PAYMENT"].map(k => <Button variant="choice" key={k}  aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "MARK" ? t.marks : t.payment}</Button>)}<Button variant="outline"  onClick={() => history.back()}>{t.back}</Button></nav>
  <p ref={feedback} tabIndex={-1} role="status" aria-live="polite" className="break-words text-purple-800">{message}</p>
  {!data.family && <section className="sk-panel space-y-4 p-4" aria-label={t.review}>
  <label className="block">{t.record}<Select className={"mt-1 w-full"} value={selected} onChange={e => { setSelected(e.target.value); setPreview(null); setReviewed(false); }}><option value="">{t.reviewFirst}</option>{data.records.map((r: Data) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></label>
  {record && <><div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0 rounded-lg bg-slate-50 p-4"><h2 className="font-semibold">{t.original}</h2>{evidence(record.original)}<details><summary>{t.version}</summary><bdi className="break-all text-xs">{record.version}</bdi></details></div><div className="sk-panel space-y-3 p-4"><h2 className="font-semibold">{t.proposed}</h2>{kind === "MARK" ? <><label className="block">{t.value}<Input className={"block w-full"} type="number" min="0" max={record.original.maximum} value={form.score} onChange={e => change("score", e.target.value)}/></label><label><Checkbox checked={form.absent} onChange={e => { change("absent", e.target.checked); if (e.target.checked)
                change("score", "0"); }}/> {t.absent}</label></> : <>{record.original.allocations.map((a: Data) => <label key={a.invoiceId} className="block break-all">{t.amount}: <bdi>{money(a.minor, record.original.currency)}</bdi><small className="block"><bdi>{a.invoiceId}</bdi></small><Input aria-label={`${t.amount} ${a.invoiceId}`} inputMode="decimal" className={"block w-full"} value={form.allocations[a.invoiceId] ?? ""} onChange={e => change("allocations", { ...form.allocations, [a.invoiceId]: e.target.value })}/></label>)}<label className="block">{t.credit}: <bdi>{money(record.original.unappliedMinor, record.original.currency)}</bdi><Input inputMode="decimal" className={"block w-full"} value={form.credit} onChange={e => change("credit", e.target.value)}/></label></>}</div></div>
  {["reason", "publicExplanation", "privateNote"].map((field, i) => <label key={field} className="block">{[t.reason, t.explanation, t.note][i]}<Textarea className={"mt-1 block w-full"} required={i < 2} maxLength={i < 2 ? 2000 : 4000} value={form[field]} onChange={e => change(field, e.target.value)}/></label>)}</>}
  <div className="flex flex-wrap gap-2"><Button variant="outline"  disabled={busy || !record} onClick={async () => { try {
            const d = await post({ action: "preview", proposal: proposal() });
            if (d)
                setPreview(d);
        }
        catch (e) {
            setMessage(String(e));
        } }}>{t.review}</Button><Button variant="outline"  onClick={() => { sessionStorage.setItem(key, JSON.stringify({ selected, form, expiresAt: Date.now() + 86400000 })); setMessage(t.saved); }}>{t.save}</Button><Button variant="outline"  onClick={() => { sessionStorage.removeItem(key); setForm({ score: "", absent: false, reason: "", publicExplanation: "", privateNote: "", allocations: {}, credit: "" }); setPreview(null); }}>{t.clear}</Button><Button variant="outline"  disabled={busy} onClick={() => { setPreview(null); setReviewed(false); void load(); }}>{t.refresh}</Button></div>
  {preview && <div className="space-y-3 rounded-lg bg-purple-50 p-4" aria-live="polite"><div className="grid gap-4 sm:grid-cols-2"><div><h3>{t.original}</h3>{evidence(preview.before)}</div><div><h3>{t.proposed}</h3>{evidence(preview.after)}</div></div><p>{kind === "MARK" ? t.report : t.finance}</p>{preview.separateApprover && <p>{t.separation}</p>}<label className="flex items-start gap-2"><Checkbox checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{t.confirm}</label><Button variant="default" disabled={busy || !reviewed || !form.reason.trim() || !form.publicExplanation.trim()} onClick={async () => { const d = await post({ action: "request", proposal: proposal(), reviewHash: preview.hash, reason: form.reason, publicExplanation: form.publicExplanation, privateNote: form.privateNote }); if (d) {
            setMessage(t.success);
            setPreview(null);
            sessionStorage.removeItem(key);
            await load();
        } }}>{t.submit}</Button></div>}
  </section>}
  <section className="space-y-4" aria-label={t.history}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{t.history}</h2><a className={button} href={`/api/corrections?kind=${kind}&export=1`}>{t.export}</a><label>{t.date}<DatePicker className="ms-2" label={t.date} locale={localeTag(policy)} messages={datePickerMessages[policy.language]} dir={lang === "en" ? "ltr" : "rtl"} weekStartsOn={policy.weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6} todayDate={new Intl.DateTimeFormat("en-CA", { timeZone: policy.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} value={date} onChange={e => setDate(e.target.value)}/></label></div><p>{t.restricted}</p>{!data.history.length && <p>{t.empty}</p>}
  <ol className="space-y-4 border-s-2 ps-4">{data.history.filter((c: Data) => !date || c.requestedAt >= date).map((c: Data) => <li key={c.id} className="sk-panel space-y-3 p-4"><div className="flex flex-wrap justify-between gap-2"><bdi className="break-all font-mono text-xs">{c.id}</bdi><strong>{c.status === "APPLIED" ? t.applied : c.status === "REJECTED" ? t.rejected : t.pending}</strong></div><div className="grid gap-4 sm:grid-cols-2"><div><h3>{t.original}</h3>{evidence(c.before)}</div><div><h3>{t.proposed}</h3>{evidence(c.after)}</div></div><p>{c.publicExplanation}</p><p>{c.requesterName} · <time>{new Date(c.requestedAt).toLocaleString(lang, { timeZone: policy.timezone })}</time>{c.approverName && ` · ${c.approverName}`}</p>{c.reason && <p>{t.reason}: {c.reason}</p>}{c.privateNote && <p>{t.note}: {c.privateNote}</p>}{c.status === "APPLIED" && !c.released && <p>{t.awaitingReport}</p>}<div className="flex flex-wrap gap-2"><a className={button} href={`/api/corrections?kind=${kind}&receipt=${c.id}`}>{t.receipt}</a>{kind === "PAYMENT" ? <a className={button} href={`/api/corrections?kind=PAYMENT&original=${c.sourceId}`}>{t.source}</a> : c.before.reports?.filter((r: Data) => r.publishedVersionId).map((r: Data) => <a key={r.id} className={button} href={`/api/reports/download?reportCardId=${r.id}&versionId=${r.publishedVersionId}&redirect=1`}>{t.source}</a>)}{c.status === "PENDING" && c.canApprove && <><Button variant="outline"  disabled={busy} onClick={async () => { const d = await post({ action: "approve", id: c.id, reviewHash: c.previewHash }); if (d) {
        setMessage(t.success);
        await load();
    } }}>{t.approve}</Button><Button variant="outline"  disabled={busy} onClick={async () => { if (await post({ action: "reject", id: c.id, reviewHash: c.previewHash }))
        await load(); }}>{t.reject}</Button></>}{c.status === "PENDING" && !c.canApprove && !data.family && <p>{t.separation}</p>}</div></li>)}</ol></section>
 </main>;
}
