"use client";
import { useEffect, useState } from "react";
import { applyLocaleChange, getLocaleSettings, previewLocaleChange, reviewLocaleCurrency, saveLanguagePreference, setLocaleDelegation } from "@/app/actions/locale";
import { CURRENCIES, defaultLocale, formatInstant, POLICY_KEYS, type Language, type LocalePackage } from "@/lib/locale/package";
import { messages } from "@/lib/locale/messages";
import { SAMPLE, workflowSample } from "@/lib/locale/samples";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = Awaited<ReturnType<typeof getLocaleSettings>>;
type Preview = Awaited<ReturnType<typeof previewLocaleChange>>;
const fieldClass = "w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base";
export function LocaleSettingsPanel() {
  const [data, setData] = useState<Settings | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [scope, setScope] = useState("");
  const [draft, setDraft] = useState<LocalePackage>(defaultLocale);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const t = messages(language);
  const campus = data?.campuses.find((c) => c.id === scope);
  const canEdit = !!data && (data.canManage || !!scope && ["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"].includes(data.role) && campus?.id === data.ownCampusId);
  const editable = (key: string) => canEdit && (data?.canManage || campus?.localeDelegatedFields.includes(key));
  async function load() { const result = await getLocaleSettings(); setData(result); return result; }
  useEffect(() => { getLocaleSettings().then((result) => { setData(result); const initial = result.canManage ? "" : result.ownCampusId || ""; setScope(initial); const policy = result.campuses.find((c) => c.id === initial)?.policy || result.school; setDraft(policy); setLanguage((result.personal as Language) || policy.language); }).catch(() => setStatus("permission")); }, []);
  function reset(next = scope) { const policy = data?.campuses.find((c) => c.id === next)?.policy || data?.school || defaultLocale; setScope(next); setDraft(policy); setOverrides([]); setPreview(null); setStatus(""); }
  function change<K extends keyof LocalePackage>(key: K, value: LocalePackage[K]) { setDraft((old) => ({ ...old, [key]: value })); setOverrides((old) => [...new Set([...old, key])]); setPreview(null); }
  async function run(action: () => Promise<void>) { setBusy(true); setStatus(""); try { await action(); } catch (e) { const message = e instanceof Error ? e.message : "error"; setStatus(message.includes("timezone") ? "timezoneError" : ["permission", "stale", "futureDate"].includes(message) ? message : "error"); } finally { setBusy(false); } }
  const sample = preview ? workflowSample({ ...preview.after, language }) : null;
  return <section className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 sm:p-6" lang={language} dir={language === "ar" ? "rtl" : "ltr"} aria-labelledby="locale-heading">
    <header><h2 id="locale-heading" className="text-xl font-bold">{t.title}</h2><p className="mt-2 text-sm text-slate-600">{t.help}</p></header>
    <label className="block space-y-2"><span>{t.personal}</span><select className={fieldClass} value={data?.personal || ""} disabled={busy || !data} onChange={(e) => { const value = e.target.value as Language | ""; void run(async () => { await saveLanguagePreference(value || null); setLanguage(value || draft.language); await load(); }); }}><option value="">{t.inherit}</option><option value="en" lang="en">English</option><option value="ar" lang="ar">العربية</option></select></label>
    {!data && !status ? <p role="status">{t.preparing}</p> : null}
    {data ? <>
      <label className="block space-y-2"><span>{t.scope}</span><select className={fieldClass} value={scope} onChange={(e) => reset(e.target.value)}><option value="">{data.grouped ? t.group : t.school}</option>{data.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {!canEdit ? <p>{t.permission}</p> : null}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {POLICY_KEYS.map((key) => <div key={key} className="min-w-0 space-y-2"><label htmlFor={`locale-${key}`} className="block font-medium">{t[key]}</label>
          {scope ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overrides.includes(key)} disabled={!editable(key)} onChange={(e) => { setOverrides((old) => e.target.checked ? [...old, key] : old.filter((k) => k !== key)); setPreview(null); }} />{t.override}</label> : null}
          {key === "language" ? <select id={`locale-${key}`} className={fieldClass} value={draft.language} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as Language)}><option value="en">English</option><option value="ar">العربية</option></select> :
          key === "timezone" || key === "currency" ? <><Input id={`locale-${key}`} list={`locale-list-${key}`} value={draft[key]} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as LocalePackage[typeof key])} dir="ltr" /><datalist id={`locale-list-${key}`}>{(key === "timezone" ? Intl.supportedValuesOf("timeZone") : CURRENCIES).map((v) => <option key={v} value={v} />)}</datalist></> :
          key === "calendar" ? <select id={`locale-${key}`} className={fieldClass} value={draft.calendar} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as LocalePackage["calendar"])}><option value="gregory">{language === "ar" ? "ميلادي" : "Gregorian"}</option><option value="iso8601">ISO 8601</option></select> :
          key === "numberingSystem" ? <select id={`locale-${key}`} className={fieldClass} value={draft.numberingSystem} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as "latn" | "arab")}><option value="latn">0123456789</option><option value="arab">٠١٢٣٤٥٦٧٨٩</option></select> :
          key === "weekStartsOn" ? <select id={`locale-${key}`} className={fieldClass} value={draft.weekStartsOn} disabled={!editable(key)} onChange={(e) => change(key, Number(e.target.value))}>{t.days.map((day, i) => <option key={i} value={i}>{day}</option>)}</select> :
          <div id={`locale-${key}`} className="flex flex-wrap gap-3">{t.days.map((day, i) => <label key={i} className="flex items-center gap-1"><input type="checkbox" disabled={!editable(key)} checked={draft.weekend.includes(i)} onChange={(e) => change(key, e.target.checked ? [...draft.weekend, i] : draft.weekend.filter((v) => v !== i))} />{day}</label>)}</div>}
        </div>)}
      </div>
      <p className="text-sm text-slate-600">{t.dateHelp}</p><p className="text-sm text-slate-600">{t.moneyHelp}</p>
      {canEdit ? <><label className="block space-y-2"><span>{t.effectiveDate}</span><Input type="date" value={effectiveDate} onChange={(e) => { setEffectiveDate(e.target.value); setPreview(null); }} /></label><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void run(async () => { const settings = scope ? Object.fromEntries(overrides.map((key) => [key, draft[key as keyof LocalePackage]])) : draft; setPreview(await previewLocaleChange({ campusId: scope || null, settings, effectiveDate })); })}>{t.preview}</Button><Button variant="outline" disabled={busy} onClick={() => reset()}>{t.reset}</Button></div></> : null}
      {data.canManage && campus ? <fieldset className="rounded-xl border p-4"><legend>{t.delegated}</legend><p className="mb-3 text-sm">{t.delegationHelp}</p><div className="flex flex-wrap gap-4">{POLICY_KEYS.map((key) => <label key={key} className="flex gap-2"><input type="checkbox" disabled={busy} checked={campus.localeDelegatedFields.includes(key)} onChange={(e) => void run(async () => { await setLocaleDelegation(campus.id, e.target.checked ? [...campus.localeDelegatedFields, key] : campus.localeDelegatedFields.filter((v) => v !== key)); await load(); setPreview(null); })} />{t[key]}</label>)}</div></fieldset> : null}
      {preview && sample ? <article className="space-y-4 rounded-xl border p-4" id="locale-print-sample"><h3 className="text-lg font-bold">{t.after}</h3><p>{t.synthetic}</p><dl className="grid gap-3 sm:grid-cols-2">{[[t.attendance, sample.attendance], [t.birthday, sample.birthday], [t.invoice, `${sample.invoiceId} · ${sample.amount}`], [t.report, sample.report], [t.original, SAMPLE.attendanceDate], [t.schedule, sample.future], [t.before, formatInstant(SAMPLE.future, { ...preview.before, language })], [t.historical, formatInstant(SAMPLE.historical, { ...preview.before, language })]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="break-words"><bdi>{value}</bdi></dd></div>)}</dl><h4 className="font-bold">{t.notification}</h4><p><bdi>{sample.notification}</bdi></p><div className="flex flex-wrap gap-3 print:hidden"><Button variant="outline" onClick={() => window.print()}>{t.print}</Button><Button disabled={busy} onClick={() => void run(async () => { const result = await applyLocaleChange(preview.token); setStatus(result.status === "FINANCE_REVIEW" ? "pending" : "saved"); setPreview(null); await load(); })}>{t.apply}</Button></div></article> : <p className="text-sm">{t.empty}</p>}
      {data.policies.map((p) => <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><bdi>{p.effectiveAt}</bdi><span>{p.status === "FINANCE_REVIEW" ? t.review : p.status === "ACTIVE" ? t.active : t.reject}</span>{p.status === "FINANCE_REVIEW" && data.role === "ACCOUNTANT" ? <><Button disabled={busy} onClick={() => void run(async () => { await reviewLocaleCurrency(p.id, true); await load(); })}>{t.approve}</Button><Button disabled={busy} variant="outline" onClick={() => void run(async () => { await reviewLocaleCurrency(p.id, false); await load(); })}>{t.reject}</Button></> : null}</div>)}
    </> : null}
    {status ? <p role={status === "saved" || status === "pending" ? "status" : "alert"}>{t[status as keyof typeof t] || t.error}</p> : null}
  </section>;
}
