"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { TagList } from "@/components/ui/tag-list";
import { AvailabilityGrid } from "@/components/ui/availability-grid";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { SheetView } from "@/lib/ai-workflows/questionnaire/service";
import type { QuestionView } from "@/lib/ai-workflows/questionnaire/types";
import type { RunView } from "@/lib/ai-workflows/view";
import { ERROR_WORDS, t } from "./run-copy";
import { RunSheet } from "./run-sheet";
import { WorkflowRequestError, useWorkflowRun } from "./use-workflow-run";

type Lang = "en" | "ar" | "ur";
const COPY: Record<string, Record<Lang, string>> = {
  known: { en: "Your school as we know it", ar: "مدرستك كما نعرفها", ur: "آپ کا اسکول، جیسا ہم جانتے ہیں" },
  willCreate: { en: "What Build will set up", ar: "ما سيُجهَّز عند البناء", ur: "بلڈ سے کیا تیار ہوگا" },
  nothingYet: { en: "Answer a question and it appears here before anything is saved.", ar: "أجب عن سؤال ليظهر هنا قبل حفظ أي شيء.", ur: "سوال کا جواب دیں، کچھ محفوظ ہونے سے پہلے یہاں نظر آئے گا۔" },
  runs: { en: "Saved on Build", ar: "يُحفظ عند البناء", ur: "بلڈ پر محفوظ" },
  confirm: { en: "You review it first", ar: "تراجعه أولاً", ur: "پہلے آپ دیکھیں گے" },
  handoff: { en: "Goes to its owner", ar: "يذهب لصاحبه", ur: "متعلقہ شخص کو جائے گا" },
  later: { en: "Not connected yet: kept as a task", ar: "غير متصل بعد: يبقى مهمة", ur: "ابھی منسلک نہیں: کام کے طور پر رہے گا" },
  keep: { en: "Looks right", ar: "يبدو صحيحاً", ur: "درست ہے" },
  next: { en: "Next", ar: "التالي", ur: "اگلا" },
  back: { en: "Back", ar: "السابق", ur: "پیچھے" },
  notNow: { en: "Not now", ar: "ليس الآن", ur: "ابھی نہیں" },
  build: { en: "Build my setup · {0}", ar: "ابنِ إعدادي · {0}", ur: "میرا سیٹ اپ بنائیں · {0}" },
  needed: { en: "Answer the required questions first.", ar: "أجب عن الأسئلة المطلوبة أولاً.", ur: "پہلے ضروری سوالات کے جواب دیں۔" },
  saving: { en: "Saving…", ar: "جارٍ الحفظ…", ur: "محفوظ ہو رہا ہے…" },
  saved: { en: "Saved · you can leave and come back", ar: "محفوظ · يمكنك العودة لاحقاً", ur: "محفوظ · آپ بعد میں واپس آ سکتے ہیں" },
  remains: { en: "Still to do, and who does it", ar: "ما تبقى ومن يقوم به", ur: "باقی کام، اور کون کرے گا" },
  ready: { en: "Your workspace is ready", ar: "مساحة عملك جاهزة", ur: "آپ کی ورک اسپیس تیار ہے" },
  busy: { en: "Busy in your timetable", ar: "مشغول في جدولك", ur: "ٹائم ٹیبل میں مصروف" },
  weeks: { en: "Weeks ahead", ar: "أسابيع قادمة", ur: "آئندہ ہفتے" },
  planTest: { en: "Plan a test", ar: "خطط لاختبار", ur: "ٹیسٹ طے کریں" },
  notYet: { en: "Not yet", ar: "ليس بعد", ur: "ابھی نہیں" },
  total: { en: "Total marks", ar: "الدرجة الكلية", ur: "کل نمبر" },
  addRow: { en: "Add a person", ar: "إضافة شخص", ur: "شخص شامل کریں" },
  edit: { en: "Change my answers", ar: "تغيير إجاباتي", ur: "میرے جوابات تبدیل کریں" },
  remove: { en: "Remove", ar: "إزالة", ur: "ہٹائیں" },
  stale: { en: "This sheet changed in another tab. The latest answers are shown.", ar: "تغيّرت الصفحة في نافذة أخرى. تظهر أحدث الإجابات.", ur: "یہ شیٹ دوسرے ٹیب میں بدلی۔ تازہ جوابات دکھائے جا رہے ہیں۔" },
};
const c = (key: string, language: Lang, ...values: Array<string | number>) => t(COPY, key, language, ...values);

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WorkflowRequestError(body?.code ?? "INTERNAL");
  return body as T;
}

/** Renders one question's input. Values match the server's answer schemas exactly. */
function Field({ view, value, onChange, label, language }: { view: QuestionView; value: unknown; onChange: (value: unknown) => void; label: string; language: Lang }) {
  switch (view.kind) {
    case "choice":
      return <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>{view.options.map(option => <Button key={option.value} type="button" variant="choice" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</Button>)}</div>;
    case "multi": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return <div className="flex flex-wrap gap-2" role="group" aria-label={label}>{view.options.map(option => <Button key={option.value} type="button" variant="choice" aria-pressed={picked.includes(option.value)} onClick={() => onChange(picked.includes(option.value) ? picked.filter(item => item !== option.value) : [...picked, option.value])}>{option.label}</Button>)}</div>;
    }
    case "tags":
      return <TagList label={label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} max={view.max} placeholder={view.placeholder} suggestions={view.suggestions} validate={view.url ? tag => /^https:\/\/\S+\.\S+/.test(tag) : undefined} />;
    case "stepper":
      return <Stepper label={label} value={typeof value === "number" ? value : null} onChange={onChange} min={view.min} max={view.max} step={view.step} unit={view.unit} />;
    case "text":
      return <Input aria-label={label} dir={view.time ? "ltr" : "auto"} inputMode={view.time ? "numeric" : undefined} placeholder={view.placeholder} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} />;
    case "per-row-choice": {
      const rows = (value ?? {}) as Record<string, string>;
      return (
        <div className="space-y-3">{view.rows.map(row => (
          <label key={row.id} className="block space-y-1 text-sm"><span className="font-medium">{row.label}</span>
            <Select value={rows[row.id] ?? ""} onChange={event => { const next = { ...rows }; if (event.target.value) next[row.id] = event.target.value; else delete next[row.id]; onChange(next); }}>
              <option value="">—</option>
              {row.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </label>
        ))}</div>
      );
    }
    case "schedule": {
      const current = (value ?? { slots: [], weeks: 2 }) as { slots: string[]; weeks: number };
      return (
        <div className="space-y-4">
          <AvailabilityGrid label={label} busyLabel={c("busy", language)} days={view.days} value={current.slots} onChange={slots => onChange({ ...current, slots })} />
          <div className="flex flex-wrap items-center gap-3 text-sm"><span>{c("weeks", language)}</span><Stepper label={c("weeks", language)} value={current.weeks} min={view.weeks.min} max={view.weeks.max} onChange={weeks => onChange({ ...current, weeks })} /></div>
        </div>
      );
    }
    case "test-rows": {
      const rows = (value ?? {}) as Record<string, { date: string; totalMarks: number }>;
      return (
        <div className="space-y-3">{view.rows.map(row => {
          const planned = rows[row.id];
          const set = (next: { date: string; totalMarks: number } | null) => { const copy = { ...rows }; if (next) copy[row.id] = next; else delete copy[row.id]; onChange(copy); };
          return (
            <div key={row.id} className="space-y-2 rounded-xl border border-border p-3" data-test-row={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{row.label}</span>
                <div className="flex gap-2"><Button type="button" size="sm" variant="choice" aria-pressed={Boolean(planned)} onClick={() => set(planned ?? { date: view.minDate, totalMarks: row.defaultTotal })}>{c("planTest", language)}</Button><Button type="button" size="sm" variant="choice" aria-pressed={!planned} onClick={() => set(null)}>{c("notYet", language)}</Button></div>
              </div>
              {planned && (
                <div className="flex flex-wrap items-end gap-3">
                  <DatePicker label={row.label} value={planned.date} min={view.minDate} todayDate={view.minDate} onValueChange={date => set({ ...planned, date })} />
                  <Stepper label={c("total", language)} value={planned.totalMarks} min={5} max={100} step={5} onChange={totalMarks => set({ ...planned, totalMarks })} />
                </div>
              )}
            </div>
          );
        })}</div>
      );
    }
    case "row-steppers": {
      const rows = (value ?? {}) as Record<string, number>;
      return (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2" role="group" aria-label={label}>{view.rows.map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3" data-row={row.id}>
            <span className="text-sm font-medium">{row.label}</span>
            <Stepper label={row.label} value={rows[row.id] ?? view.min} min={view.min} max={view.max} step={view.step} unit={view.unit} onChange={next => onChange({ ...rows, [row.id]: next })} />
          </div>
        ))}</div>
      );
    }
    case "row-tags": {
      const rows = (value ?? {}) as Record<string, string[]>;
      return (
        <div className="space-y-4">{view.rows.map(row => (
          <div key={row.id} className="space-y-1.5" data-row={row.id}><span className="text-sm font-medium">{row.label}</span>
            <TagList label={row.label} value={rows[row.id] ?? []} max={view.max} placeholder={view.placeholder} suggestions={row.suggestions} onChange={next => onChange({ ...rows, [row.id]: next })} />
          </div>
        ))}</div>
      );
    }
    case "table": {
      const rows = Array.isArray(value) ? (value as Array<Record<string, string>>) : [];
      const set = (index: number, key: string, next: string) => onChange(rows.map((row, at) => (at === index ? { ...row, [key]: next } : row)));
      return (
        <div className="space-y-3" role="group" aria-label={label}>
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))_auto]" data-table-row={index}>
              {view.columns.map(column => column.type === "choice"
                ? <Select key={column.key} aria-label={column.label} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)}><option value="">{column.label}</option>{column.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
                : <Input key={column.key} aria-label={column.label} placeholder={column.label} type={column.type} dir={column.type === "text" ? "auto" : "ltr"} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)} />)}
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, at) => at !== index))}>{c("remove", language)}</Button>
            </div>
          ))}
          {rows.length < view.maxRows && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, {}])}>{c("addRow", language)}</Button>}
        </div>
      );
    }
    case "group": {
      const current = (value ?? {}) as Record<string, unknown>;
      return (
        <div className="grid gap-4 sm:grid-cols-2">{view.fields.map(field => (
          <div key={field.key} className="space-y-1.5"><span className="text-sm font-medium">{field.label}</span>
            <Field view={field.view} label={field.label} language={language} value={current[field.key]} onChange={next => { const copy = { ...current }; if (next === "" || next === undefined) delete copy[field.key]; else copy[field.key] = field.view.kind === "stepper" ? Number(next) : next; onChange(copy); }} />
          </div>
        ))}</div>
      );
    }
  }
}

/**
 * "Your week, built live" (design-ux, Slice 2). Three short resumable sheets; every answer is saved
 * as it is given and the left pane shows what Build will set up (pending ghosts) before anything runs.
 * Build compiles confirmed answers without a model call; the Run Sheet then takes over.
 */
export function RoleSetup({ questionnaireKey, homeHref }: { questionnaireKey: string; homeHref: string }) {
  const { language } = useLocale();
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [initialRun, setInitialRun] = useState<RunView | null>(null);
  const [building, setBuilding] = useState(false);
  // Back to the answers from a build: saving a change supersedes what still waits; what saved stays.
  const [editing, setEditing] = useState(false);
  const { run, busy, error, send } = useWorkflowRun(initialRun);
  const pending = useRef<{ answers: Record<string, unknown>; confirmed: string[] } | null>(null);
  const timer = useRef<number | null>(null);
  const version = useRef(0);

  const load = useCallback(async () => {
    const { sheet: next } = await call<{ sheet: SheetView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}?lang=${language}`);
    version.current = next.version;
    setSheet(next);
    setAnswers(Object.fromEntries(next.questions.filter(question => question.value !== null).map(question => [question.key, question.value])));
    setConfirmed(next.questions.filter(question => question.confirmed).map(question => question.key));
    if (next.run) setInitialRun(next.run);
  }, [questionnaireKey, language]);
  useEffect(() => { void load().catch(thrown => setProblem(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL")); }, [load]);

  const flush = useCallback(async () => {
    const work = pending.current;
    if (!work) return;
    pending.current = null; setSaving("saving");
    try {
      const { version: next } = await call<{ version: number }>(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "PUT", body: JSON.stringify({ version: version.current, answers: work.answers, confirmedKeys: work.confirmed }) });
      version.current = next;
      const { sheet: fresh } = await call<{ sheet: SheetView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}?lang=${language}`);
      version.current = fresh.version; setSheet(fresh); setSaving("saved"); setProblem(null);
      // A question that just started to apply (meeting details after hours) brings its defaults in.
      setAnswers(current => ({ ...Object.fromEntries(fresh.questions.filter(question => question.value !== null).map(question => [question.key, question.value])), ...current }));
    } catch (thrown) {
      const code = thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL";
      setSaving("idle"); setProblem(code);
      if (code === "STALE_VERSION") await load().catch(() => undefined);
    }
  }, [questionnaireKey, language, load]);

  // Quick taps arrive before a re-render, so confirmations accumulate in a ref, never from render state.
  const confirmedRef = useRef<string[]>([]);
  useEffect(() => { confirmedRef.current = confirmed; }, [confirmed]);
  const answer = (key: string, value: unknown) => {
    if (!confirmedRef.current.includes(key)) confirmedRef.current = [...confirmedRef.current, key];
    const nextConfirmed = confirmedRef.current;
    setAnswers(current => ({ ...current, [key]: value })); setConfirmed(nextConfirmed);
    pending.current = { answers: { ...(pending.current?.answers ?? {}), [key]: value }, confirmed: nextConfirmed };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const questions = useMemo(() => sheet?.questions.filter(question => question.sheet === page) ?? [], [sheet, page]);
  const missingRequired = sheet?.questions.filter(question => question.required && !confirmed.includes(question.key)) ?? [];
  const total = sheet?.willCreate.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const last = sheet ? page === sheet.sheets.length - 1 : false;

  const build = async () => {
    if (!sheet) return;
    if (timer.current) { window.clearTimeout(timer.current); await flush(); }
    setBuilding(true); setProblem(null);
    try { const { run: next } = await call<{ run: RunView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "POST", body: JSON.stringify({ action: "build", version: version.current, language }) }); setInitialRun(next); setEditing(false); }
    catch (thrown) { setProblem(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setBuilding(false); }
  };
  const defer = async () => { await call(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "POST", body: JSON.stringify({ action: "defer" }) }).catch(() => undefined); window.location.assign(homeHref); };

  const dir = language === "en" ? "ltr" : "rtl";
  if (!sheet) return problem ? <Alert tone="danger" data-ai-error={problem}>{ERROR_WORDS[problem as keyof typeof ERROR_WORDS]?.[language] ?? problem}</Alert> : <div className="space-y-3 p-6"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-48 w-full" /></div>;

  const ghosts = (
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" data-ai-ghosts aria-live="polite">
      <section className="sk-panel space-y-2 p-4">
        <h2 className="text-sm font-semibold text-ink-muted">{c("known", language)}</h2>
        <dl className="space-y-2 text-sm">{sheet.known.map(fact => <div key={fact.label}><dt className="text-ink-muted">{fact.label}</dt><dd className="font-medium" dir="auto">{fact.value}</dd></div>)}</dl>
      </section>
      <section className="sk-panel space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden />{c("willCreate", language)}</h2>
        {sheet.willCreate.length === 0 ? <p className="text-sm text-ink-muted">{c("nothingYet", language)}</p> : (
          <ul className="space-y-2">{sheet.willCreate.map(item => (
            <li key={item.capabilityKey} data-ai-ghost={item.capabilityKey} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border p-2 text-sm">
              <span>{item.title}{item.count > 1 ? ` × ${item.count}` : ""}</span>
              <Badge variant={item.cls === "A" ? "success" : item.cls === "B" ? "warning" : "info"}>{c(item.cls === "A" ? "runs" : item.cls === "B" ? "confirm" : "handoff", language)}</Badge>
            </li>
          ))}</ul>
        )}
        {sheet.notConnected.length > 0 && <p className="text-xs text-ink-muted" data-ai-not-connected>{c("later", language)} ({sheet.notConnected.map(item => item.capabilityKey).join(", ")})</p>}
      </section>
    </aside>
  );

  if (run && !editing) return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup-run>
      <div className="space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">{run.status === "COMPLETED" && <CheckCircle2 className="size-6 text-success" aria-hidden />}{run.status === "COMPLETED" ? c("ready", language) : sheet.title}</h1>
        <RunSheet run={run} language={language} busy={busy} error={error} onCommand={(body, clickKey) => void send(body, clickKey)} />
        <Button type="button" variant="outline" data-ai-edit-answers onClick={() => { setEditing(true); setPage(0); }}>{c("edit", language)}</Button>
        <section className="sk-panel space-y-2 p-4" data-ai-remains>
          <h2 className="font-semibold">{c("remains", language)}</h2>
          <ul className="space-y-2 text-sm">{sheet.remains.map(task => <li key={task.title} className="flex flex-wrap items-center justify-between gap-2"><span>{task.title} · <span className="text-ink-muted">{task.who}</span></span>{task.link && <Link className="underline" href={task.link}>{t({ o: { en: "Open", ar: "فتح", ur: "کھولیں" } }, "o", language)}</Link>}</li>)}</ul>
        </section>
      </div>
      {ghosts}
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup={sheet.key}>
      <div className="space-y-5">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold">{sheet.title}</h1>
          <ol className="flex flex-wrap gap-2" aria-label={sheet.title}>{sheet.sheets.map((label, index) => <li key={label}><Button type="button" size="sm" variant="choice" aria-current={index === page ? "step" : undefined} onClick={() => setPage(index)}>{`${index + 1}. ${label}`}</Button></li>)}</ol>
          <Progress value={((page + 1) / sheet.sheets.length) * 100} label={sheet.sheets[page]} />
          <p className="text-xs text-ink-muted" role="status">{saving === "saving" ? c("saving", language) : saving === "saved" ? c("saved", language) : ""}</p>
        </header>
        {problem === "STALE_VERSION" && <Alert tone="warning">{c("stale", language)}</Alert>}
        {problem && problem !== "STALE_VERSION" && ERROR_WORDS[problem as keyof typeof ERROR_WORDS] && <Alert tone="danger" data-ai-error={problem}>{ERROR_WORDS[problem as keyof typeof ERROR_WORDS]![language]}</Alert>}
        <div className="space-y-4">{questions.map(question => (
          <section key={question.key} data-ai-question-key={question.key} data-ai-confirmed={confirmed.includes(question.key) || undefined} className="sk-panel space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-base font-semibold sm:text-lg">{question.prompt}{question.required && <span className="text-destructive" aria-hidden> *</span>}</h2>
              {!question.connected && <Badge variant="neutral">{c("later", language)}</Badge>}
            </div>
            {question.hint && <p className="text-sm text-ink-muted">{question.hint}</p>}
            <Field view={question.view} label={question.prompt} language={language} value={answers[question.key]} onChange={value => answer(question.key, value)} />
            {answers[question.key] !== undefined && !confirmed.includes(question.key) && <Button type="button" size="sm" variant="outline" onClick={() => answer(question.key, answers[question.key])}>{c("keep", language)}</Button>}
          </section>
        ))}</div>
        <footer className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {page > 0 && <Button type="button" variant="outline" onClick={() => setPage(page - 1)}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{c("back", language)}</Button>}
            <Button type="button" variant="ghost" onClick={() => void defer()}>{c("notNow", language)}</Button>
          </div>
          {last ? (
            <div className="space-y-1 text-end">
              <Button type="button" size="lg" data-ai-build disabled={building || missingRequired.length > 0 || total === 0} onClick={() => void build()}>{c("build", language, total)}</Button>
              {missingRequired.length > 0 && <p className="text-xs text-ink-muted">{c("needed", language)}</p>}
            </div>
          ) : <Button type="button" onClick={() => setPage(page + 1)}>{c("next", language)}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></Button>}
        </footer>
      </div>
      {ghosts}
    </div>
  );
}
