"use client";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { applyLocaleChange, getLocaleSettings, previewLocaleChange, reviewLocaleCurrency, setLocaleDelegation } from "@/app/actions/locale";
import { useLocale, useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { CURRENCIES, defaultLocale, formatInstant, POLICY_KEYS, type Language, type LocalePackage } from "@/lib/locale/package";
import { COUNTRIES, currencyForCountry, type Country } from "@/lib/locale/country";
import { messages } from "@/lib/locale/messages";
import { SAMPLE, workflowSample } from "@/lib/locale/samples";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { SkeletonList } from "@/components/ui/skeleton";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { usePanelCommand } from "@/components/fees/fee-utils";

type Settings = Awaited<ReturnType<typeof getLocaleSettings>>;
type Preview = Awaited<ReturnType<typeof previewLocaleChange>>;
type PolicyRow = Settings["policies"][number];

/** Outcome copy that is a result the viewer should see (saved / pending review), not a failure. */
const GOOD_STATUS = new Set(["saved", "pending"]);

/**
 * School language and region (M14, M105). `scope="school"` (default) is the institution authority's panel:
 * school-wide policy, campus overrides and which keys each campus may change. `scope="campus-delegated"` is the
 * campus admin's: their own campus only, and only the keys the authority delegated (G13). Personal language is a
 * different thing and lives in the account menu (PersonalLanguageSetting), never here.
 *
 * A currency change waits for the accountant's independent review (`FINANCE_REVIEW`); that review is
 * `LocaleCurrencyReview` below, mounted where the accountant works (§2.1 row 9).
 *
 * The console's sticky per-tab Save (§4.4) drives it: `hideSave` drops the preview's own "Apply" button, and each new
 * `command` `{ id: "save" }` applies the previewed change — or, when nothing is previewed yet, builds the preview
 * first, so a Save never applies a change the viewer has not seen. `onDirtyChange(dirty, saving)` reports unsaved
 * work (edited fields or a preview not yet applied) and whether a save is running.
 */
export function LocaleSettingsPanel({ scope: mode = "school", hideSave = false, command, onDirtyChange }: {
  scope?: "school" | "campus-delegated";
  hideSave?: boolean;
  command?: { id: string; nonce: number } | null;
  onDirtyChange?: (dirty: boolean, saving: boolean) => void;
} = {}) {
  const [data, setData] = useState<Settings | null>(null);
  // The personal language now lives in PersonalLanguageSetting; this panel follows the live display language.
  const { language } = useLocale();
  const [scope, setScope] = useState("");
  const [draft, setDraft] = useState<LocalePackage>(defaultLocale);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const t = messages(language);
  const campus = data?.campuses.find((c) => c.id === scope);
  const campusOnly = mode === "campus-delegated";
  // G13: delegated campus keys belong to the campus operator only (the principal no longer edits them).
  const canEdit = !!data && ((data.canManage && !campusOnly) || !!scope && ["CAMPUS_ADMIN", "ADMIN"].includes(data.role) && campus?.id === data.ownCampusId);
  const editable = (key: string) => canEdit && (data?.canManage || campus?.localeDelegatedFields.includes(key));
  async function load() { const result = await getLocaleSettings(); setData(result); return result; }
  useEffect(() => { getLocaleSettings().then((result) => { setData(result); const initial = result.canManage && mode === "school" ? "" : result.ownCampusId || ""; setScope(initial); const policy = result.campuses.find((c) => c.id === initial)?.policy || result.school; setDraft(policy); }).catch(() => setStatus("permission")); }, []);
  function reset(next = scope) { const policy = data?.campuses.find((c) => c.id === next)?.policy || data?.school || defaultLocale; setScope(next); setDraft(policy); setOverrides([]); setPreview(null); setStatus(""); }
  function change<K extends keyof LocalePackage>(key: K, value: LocalePackage[K]) { setDraft((old) => ({ ...old, [key]: value })); setOverrides((old) => [...new Set([...old, key])]); setPreview(null); }
  async function run(action: () => Promise<void>) { setBusy(true); setStatus(""); try { await action(); } catch (e) { const message = e instanceof Error ? e.message : "error"; setStatus(message.includes("timezone") ? "timezoneError" : ["permission", "stale", "futureDate", "examWeekend", "calendarScopeLimit"].includes(message) ? message : "error"); } finally { setBusy(false); } }
  const sample = preview ? workflowSample({ ...preview.after, language }) : null;
  const statusText = status ? t[status as keyof typeof t] || t.error : "";
  // A Save pressed in the console shows the new preview where the viewer will read it (once, when it mounts).
  const revealPreview = useRef(false);
  const previewChange = (reveal = false) => run(async () => {
    const settings = scope ? Object.fromEntries(overrides.map((key) => [key, draft[key as keyof LocalePackage]])) : draft;
    const next = await previewLocaleChange({ campusId: scope || null, settings, effectiveDate });
    revealPreview.current = reveal;
    setPreview(next);
  });
  const applyChange = (token: string) => run(async () => {
    const result = await applyLocaleChange(token);
    setStatus(result.status === "FINANCE_REVIEW" ? "pending" : "saved");
    setPreview(null);
    setOverrides([]);
    await load();
  });
  // Unsaved work: edited fields, or a preview that has not been applied.
  const dirty = canEdit && (overrides.length > 0 || preview !== null);
  usePanelCommand(command, {
    save: () => {
      if (!canEdit || busy) return;
      if (preview) void applyChange(preview.token);
      else if (dirty) void previewChange(true);
    },
  }, Boolean(data));
  const reportDirty = useRef(onDirtyChange);
  useEffect(() => { reportDirty.current = onDirtyChange; });
  useEffect(() => { reportDirty.current?.(dirty, busy); }, [dirty, busy]);
  useEffect(() => () => reportDirty.current?.(false, false), []);
  return <section className="sk-panel min-w-0 space-y-5 p-4 sm:p-6" lang={language} dir={language !== "en" ? "rtl" : "ltr"} aria-labelledby="locale-heading" aria-busy={busy}>
    <header><h2 id="locale-heading" className="text-lg font-bold text-ink-strong">{t.title}</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">{t.help}</p></header>
    {!data && !status ? <SkeletonList rows={4} label={t.preparing} /> : null}
    {data ? <>
      {campusOnly
        ? <p className="text-sm text-ink-muted"><span className="font-semibold text-ink-strong">{t.scope}</span>: <bdi>{campus?.name ?? ""}</bdi></p>
        : <label className="block space-y-2 text-sm font-medium text-ink"><span>{t.scope}</span><Select className="w-full min-w-0" value={scope} onChange={(e) => reset(e.target.value)}><option value="">{data.grouped ? t.group : t.school}</option>{data.campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>}
      {!canEdit ? <Alert tone="neutral" live="off" compact>{t.permission}</Alert> : null}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {POLICY_KEYS.map((key) => <div key={key} className="min-w-0 space-y-2"><label htmlFor={`locale-${key}`} className="block text-sm font-medium text-ink">{t[key]}</label>
          {scope ? <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={overrides.includes(key)} disabled={!editable(key)} onChange={(e) => { setOverrides((old) => e.target.checked ? [...old, key] : old.filter((k) => k !== key)); setPreview(null); }} />{t.override}</label> : null}
          {key === "language" ? <Select id={`locale-${key}`} className="w-full min-w-0" value={draft.language} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as Language)}><option value="en">English</option><option value="ur" lang="ur">اردو</option><option value="ar">العربية</option></Select> :
          key === "country" ? <Select id={`locale-${key}`} className="w-full min-w-0" value={draft.country || "OTHER"} disabled={!editable(key) || !editable("currency")} onChange={(e) => { const country = e.target.value as Country; change("country", country); change("currency", currencyForCountry(country)); }}>{COUNTRIES.map((country) => <option key={country} value={country}>{country === "OTHER" ? (language === "ur" ? "دیگر / نامعلوم" : language === "ar" ? "دولة أخرى / غير محددة" : "Other / unknown") : new Intl.DisplayNames([language], { type: "region" }).of(country)}</option>)}</Select> :
          key === "timezone" || key === "currency" ? <><Input id={`locale-${key}`} list={`locale-list-${key}`} value={draft[key]} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as LocalePackage[typeof key])} dir="ltr" /><datalist id={`locale-list-${key}`}>{(key === "timezone" ? Intl.supportedValuesOf("timeZone") : CURRENCIES).map((v) => <option key={v} value={v} />)}</datalist></> :
          key === "calendar" ? <Select id={`locale-${key}`} className="w-full min-w-0" value={draft.calendar} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as LocalePackage["calendar"])}><option value="gregory">{language === "ur" ? "عیسوی" : language === "ar" ? "ميلادي" : "Gregorian"}</option><option value="iso8601">ISO 8601</option></Select> :
          key === "numberingSystem" ? <Select id={`locale-${key}`} className="w-full min-w-0" value={draft.numberingSystem} disabled={!editable(key)} onChange={(e) => change(key, e.target.value as "latn" | "arab")}><option value="latn">0123456789</option><option value="arab">٠١٢٣٤٥٦٧٨٩</option></Select> :
          key === "weekStartsOn" ? <Select id={`locale-${key}`} className="w-full min-w-0" value={draft.weekStartsOn} disabled={!editable(key)} onChange={(e) => change(key, Number(e.target.value))}>{t.days.map((day, i) => <option key={i} value={i}>{day}</option>)}</Select> :
          <div id={`locale-${key}`} className="flex flex-wrap gap-3">{t.days.map((day, i) => <label key={i} className="flex min-h-11 items-center gap-1 text-sm"><Checkbox disabled={!editable(key)} checked={draft.weekend.includes(i)} onChange={(e) => change(key, e.target.checked ? [...draft.weekend, i] : draft.weekend.filter((v) => v !== i))} />{day}</label>)}</div>}
        </div>)}
      </div>
      <div className="space-y-1 text-sm text-ink-muted"><p>{t.dateHelp}</p><p>{t.moneyHelp}</p></div>
      {canEdit ? <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block space-y-2 text-sm font-medium text-ink"><span>{t.effectiveDate}</span><Input type="date" value={effectiveDate} onChange={(e) => { setEffectiveDate(e.target.value); setPreview(null); }} /></label>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy && !preview} disabled={busy} onClick={() => void previewChange()}>{t.preview}</Button>
          <Button variant="outline" disabled={busy} onClick={() => reset()}>{t.reset}</Button>
        </div>
      </div> : null}
      {data.canManage && !campusOnly && campus ? <fieldset className="rounded-2xl border border-border-subtle p-4"><legend className="px-1 text-sm font-semibold text-ink-strong">{t.delegated}</legend><p className="mb-3 text-sm text-ink-muted">{t.delegationHelp}</p><div className="flex flex-wrap gap-4">{POLICY_KEYS.map((key) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><Checkbox disabled={busy} checked={campus.localeDelegatedFields.includes(key)} onChange={(e) => void run(async () => { await setLocaleDelegation(campus.id, e.target.checked ? [...campus.localeDelegatedFields, key] : campus.localeDelegatedFields.filter((v) => v !== key)); await load(); setPreview(null); })} />{t[key]}</label>)}</div></fieldset> : null}
      {preview && sample ? <article ref={(node) => { if (node && revealPreview.current) { revealPreview.current = false; node.scrollIntoView({ block: "nearest" }); } }} className="space-y-4 rounded-2xl border border-border-subtle p-4" id="locale-print-sample"><h3 className="text-base font-bold text-ink-strong">{t.after}</h3><p className="text-sm text-ink-muted">{t.synthetic}</p><dl className="grid gap-3 sm:grid-cols-2">{[[t.attendance, sample.attendance], [t.birthday, sample.birthday], [t.invoice, `${sample.invoiceId} · ${sample.amount}`], [t.report, sample.report], [t.original, SAMPLE.attendanceDate], [t.schedule, sample.future], [t.before, formatInstant(SAMPLE.future, { ...preview.before, language })], [t.historical, formatInstant(SAMPLE.historical, { ...preview.before, language })]].map(([label, value]) => <div key={label}><dt className="text-sm font-semibold text-ink">{label}</dt><dd className="break-words text-sm"><bdi>{value}</bdi></dd></div>)}</dl><h4 className="text-sm font-bold text-ink-strong">{t.events}</h4><p className="text-sm text-ink-muted">{t.eventHelp}</p>{preview.events.length ? preview.events.map((event) => <div key={event.id} className="rounded-xl border border-border-subtle p-3 text-sm"><bdi>{event.title}</bdi><p dir="ltr">{event.date} {event.time}</p><p>{t.utcBefore}: <bdi>{event.beforeZone} · {event.beforeUtc.join(" / ") || "—"}</bdi></p><p>{t.utcAfter}: <bdi>{event.afterZone} · {event.afterUtc.join(" / ") || "—"}</bdi></p></div>) : <p className="text-sm text-ink-muted">{t.noEvents}</p>}<h4 className="text-sm font-bold text-ink-strong">{t.notification}</h4><p className="text-sm"><bdi>{sample.notification}</bdi></p><div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={() => window.print()}>{t.print}</Button>{hideSave ? null : <Button loading={busy} disabled={busy} onClick={() => void applyChange(preview.token)}>{t.apply}</Button>}</div></article> : canEdit ? <p className="text-sm text-ink-muted">{t.empty}</p> : null}
      {data.policies.length ? <ul className="space-y-2" aria-label={t.active}>{data.policies.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle p-3 text-sm"><bdi>{p.effectiveAt.slice(0, 10)}</bdi><Badge size="sm" dot variant={p.status === "FINANCE_REVIEW" ? "warning" : p.status === "ACTIVE" ? "success" : "neutral"}>{p.status === "FINANCE_REVIEW" ? t.review : p.status === "ACTIVE" ? t.active : t.reject}</Badge>{p.status === "FINANCE_REVIEW" && data.role === "ACCOUNTANT" ? <><Button size="sm" disabled={busy} onClick={() => void run(async () => { await reviewLocaleCurrency(p.id, true); await load(); })}>{t.approve}</Button><Button size="sm" disabled={busy} variant="outline" onClick={() => void run(async () => { await reviewLocaleCurrency(p.id, false); await load(); })}>{t.reject}</Button></> : null}</li>)}</ul> : null}
    </> : null}
    {status ? <Alert tone={GOOD_STATUS.has(status) ? (status === "pending" ? "info" : "success") : "danger"} compact live={GOOD_STATUS.has(status) ? "polite" : "assertive"}>{statusText}</Alert> : null}
  </section>;
}

/**
 * The accountant's currency review (§2.1 row 9, audit P4-G2): a school or campus language-and-region change that
 * touches the currency waits in `FINANCE_REVIEW` until an accountant who did not make it approves or rejects it
 * (`reviewLocaleCurrency`, ACCOUNTANT only). It used to live only in the personal Settings dialog, which no longer
 * carries school locale (M105). This renders nothing unless the viewer is an accountant with something to review,
 * so the accountant console can mount it on Today (P8). Both decisions are confirmed (§8.1 R3: money decisions).
 */
export function LocaleCurrencyReview() {
  const ui = useUiText();
  const format = useLocaleFormat();
  const [data, setData] = useState<Settings | null>(null);
  const [deciding, setDeciding] = useState<{ policy: PolicyRow; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await getLocaleSettings()); } catch { setData(null); } }, []);
  useEffect(() => { void load(); }, [load]);

  const pending = data?.role === "ACCOUNTANT" ? data.policies.filter((policy) => policy.status === "FINANCE_REVIEW") : [];
  if (!data || pending.length === 0) return null;
  const where = (policy: PolicyRow) => (policy.campusId ? data.campuses.find((campus) => campus.id === policy.campusId)?.name : null);
  const currencyOf = (policy: PolicyRow) => (policy.settings as { currency?: string }).currency ?? "—";

  const decide = async () => {
    if (!deciding) return;
    setBusy(true);
    try {
      await reviewLocaleCurrency(deciding.policy.id, deciding.approve);
      toast.success(deciding.approve ? ui("Currency change approved. It applies on its effective date.") : ui("Currency change rejected. The current currency stays."));
      setDeciding(null);
      await load();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("The review could not be saved. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="currency-review-title" className="sk-panel space-y-4 p-4 sm:p-6" data-currency-review>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-primary ring-1 ring-brand-100"><Coins className="size-5" /></span>
        <div className="min-w-0">
          <h2 id="currency-review-title" className="text-lg font-bold text-ink-strong">{ui("Currency changes to review ({0})", [format.number(pending.length, 0)])}</h2>
          <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{ui("A language and region change touches the currency. It waits for a finance review by someone who did not make it.")}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {pending.map((policy) => (
          <li key={policy.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4" data-currency-policy={policy.id}>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink-strong">{ui("New currency: {0}", [currencyOf(policy)])}</p>
              <p className="mt-0.5 text-ink-muted">
                {where(policy) ? <bdi>{where(policy)}</bdi> : ui("The whole school")} · {ui("From {0}", [format.date(policy.effectiveAt)])}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" type="button" onClick={() => setDeciding({ policy, approve: true })}>{ui("Approve")}</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setDeciding({ policy, approve: false })}>{ui("Reject")}</Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmAction
        open={Boolean(deciding)}
        tone={deciding?.approve ? "primary" : "danger"}
        title={deciding?.approve ? ui("Approve this currency change?") : ui("Reject this currency change?")}
        description={deciding?.approve
          ? ui("New invoices and fee screens use the new currency from its effective date. Stored amounts are not converted.")
          : ui("The change does not apply; the current currency stays. Whoever made it can propose it again.")}
        confirmLabel={deciding?.approve ? ui("Approve") : ui("Reject")}
        cancelLabel={ui("Keep editing")}
        busy={busy}
        onCancel={() => setDeciding(null)}
        onConfirm={() => void decide()}
      />
    </section>
  );
}
