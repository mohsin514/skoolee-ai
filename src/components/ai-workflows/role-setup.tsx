"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Backpack, BookOpenCheck, Building2, CalendarClock, Check, CheckCircle2, ConciergeBell, Crown,
  GraduationCap, HeartHandshake, Library, Lightbulb, Network, PartyPopper, Plus, Sparkles, Trash2, Wallet, type LucideIcon,
} from "lucide-react";
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
import { InkHeading } from "@/components/ui/ink-heading";
import { ChoiceCard, ProgressDots, SegmentedChoice, StepPill, arrowSelect } from "@/components/ui/choice-card";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import type { SheetView } from "@/lib/ai-workflows/questionnaire/service";
import type { Option, QuestionView } from "@/lib/ai-workflows/questionnaire/types";
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
  saving: { en: "Saving…", ar: "جارٍ الحفظ…", ur: "محفوظ ہو رہا ہے…" },
  saved: { en: "Saved · you can leave and come back", ar: "محفوظ · يمكنك العودة لاحقاً", ur: "محفوظ · آپ بعد میں واپس آ سکتے ہیں" },
  remains: { en: "Still to do, and who does it", ar: "ما تبقى ومن يقوم به", ur: "باقی کام، اور کون کرے گا" },
  ready: { en: "Your workspace is ready", ar: "مساحة عملك جاهزة", ur: "آپ کی ورک اسپیس تیار ہے" },
  readyHint: { en: "Everything you confirmed is set up. Here is what happened, and what is left for whom.", ar: "تم إعداد كل ما أكدته. إليك ما حدث وما تبقى ولمن.", ur: "آپ کی تصدیق کردہ ہر چیز تیار ہے۔ یہ رہا کیا ہوا، اور کس کے لیے کیا باقی ہے۔" },
  buildingHint: { en: "Your answers are turning into a working setup. Steps that need you will ask here.", ar: "تتحول إجاباتك إلى إعداد فعلي. الخطوات التي تحتاجك ستسألك هنا.", ur: "آپ کے جوابات ایک چلتے سیٹ اپ میں بدل رہے ہیں۔ جن مراحل کو آپ کی ضرورت ہو وہ یہاں پوچھیں گے۔" },
  busy: { en: "Busy in your timetable", ar: "مشغول في جدولك", ur: "ٹائم ٹیبل میں مصروف" },
  weeks: { en: "Weeks ahead", ar: "أسابيع قادمة", ur: "آئندہ ہفتے" },
  planTest: { en: "Plan a test", ar: "خطط لاختبار", ur: "ٹیسٹ طے کریں" },
  notYet: { en: "Not yet", ar: "ليس بعد", ur: "ابھی نہیں" },
  total: { en: "Total marks", ar: "الدرجة الكلية", ur: "کل نمبر" },
  addRow: { en: "Add a person", ar: "إضافة شخص", ur: "شخص شامل کریں" },
  edit: { en: "Change my answers", ar: "تغيير إجاباتي", ur: "میرے جوابات تبدیل کریں" },
  board: { en: "Campus launch board", ar: "لوحة إطلاق الفروع", ur: "کیمپس لانچ بورڈ" },
  tileCampus: { en: "Campus ✓", ar: "الفرع ✓", ur: "کیمپس ✓" },
  tileLeaderNONE: { en: "No administrator yet", ar: "لا مدير بعد", ur: "ابھی کوئی منتظم نہیں" },
  tileLeaderINVITED: { en: "Invitation pending", ar: "الدعوة معلقة", ur: "دعوت زیر التوا" },
  tileLeaderJOINED: { en: "Administrator joined", ar: "انضم المدير", ur: "منتظم شامل ہو گئے" },
  tileSetupNEW: { en: "Setup not started", ar: "لم يبدأ الإعداد", ur: "سیٹ اپ شروع نہیں" },
  tileSetupBUSY: { en: "Setting up", ar: "قيد الإعداد", ur: "سیٹ اپ جاری" },
  tileSetupREADY: { en: "Set up", ar: "جاهز", ur: "تیار" },
  remove: { en: "Remove", ar: "إزالة", ur: "ہٹائیں" },
  stale: { en: "This sheet changed in another tab. The latest answers are shown.", ar: "تغيّرت الصفحة في نافذة أخرى. تظهر أحدث الإجابات.", ur: "یہ شیٹ دوسرے ٹیب میں بدلی۔ تازہ جوابات دکھائے جا رہے ہیں۔" },
  eyebrow: { en: "First-time setup · {0} questions · about {1} min", ar: "الإعداد الأول · {0} أسئلة · نحو {1} دقيقة", ur: "پہلا سیٹ اپ · {0} سوالات · تقریباً {1} منٹ" },
  intro: { en: "Answer in your own time. Every answer saves as you go, and the panel shows what will be set up before anything changes.", ar: "أجب على راحتك. تُحفظ كل إجابة فوراً، وتعرض اللوحة ما سيُجهَّز قبل أي تغيير.", ur: "اپنے وقت پر جواب دیں۔ ہر جواب فوراً محفوظ ہوتا ہے، اور پینل دکھاتا ہے کہ کچھ بدلنے سے پہلے کیا تیار ہوگا۔" },
  answered: { en: "answered", ar: "مُجاب", ur: "جواب دیے" },
  ofTotal: { en: "{0} of {1}", ar: "{0} من {1}", ur: "{1} میں سے {0}" },
  stepOf: { en: "Step {0} of {1}", ar: "الخطوة {0} من {1}", ur: "مرحلہ {0} از {1}" },
  required: { en: "Required", ar: "مطلوب", ur: "ضروری" },
  optional: { en: "Optional", ar: "اختياري", ur: "اختیاری" },
  picked: { en: "{0} selected", ar: "تم اختيار {0}", ur: "{0} منتخب" },
  items: { en: "items ready to set up", ar: "عناصر جاهزة للإعداد", ur: "چیزیں سیٹ اپ کے لیے تیار" },
  open: { en: "Open", ar: "فتح", ur: "کھولیں" },
  sheetDone: { en: "This step is complete", ar: "اكتملت هذه الخطوة", ur: "یہ مرحلہ مکمل ہے" },
  allSet: { en: "All required answers are in. Build when you are ready.", ar: "اكتملت الإجابات المطلوبة. ابنِ متى كنت جاهزاً.", ur: "تمام ضروری جوابات مکمل ہیں۔ جب تیار ہوں تو بنائیں۔" },
  requiredLeft: { en: "{0} required left", ar: "تبقى {0} مطلوبة", ur: "{0} ضروری باقی" },
  showMe: { en: "Show me", ar: "أرني", ur: "دکھائیں" },
  readyChip: { en: "Ready to build", ar: "جاهز للبناء", ur: "بنانے کے لیے تیار" },
  upNext: { en: "Up next: {0}", ar: "التالي: {0}", ur: "اگلا: {0}" },
  continueTo: { en: "Continue", ar: "متابعة", ur: "جاری رکھیں" },
  previewPill: { en: "{0} ready", ar: "{0} جاهز", ur: "{0} تیار" },
  dots: { en: "Questions on this step", ar: "أسئلة هذه الخطوة", ur: "اس مرحلے کے سوالات" },
  dotDone: { en: "Question {0}, answered", ar: "السؤال {0}، مُجاب", ur: "سوال {0}، جواب دیا" },
  dotOpen: { en: "Question {0}, not answered yet", ar: "السؤال {0}، لم يُجب بعد", ur: "سوال {0}، ابھی جواب نہیں" },
  keysAnswer: { en: "answer", ar: "للإجابة", ur: "جواب" },
  keysNext: { en: "next question", ar: "السؤال التالي", ur: "اگلا سوال" },
};
const c = (key: string, language: Lang, ...values: Array<string | number>) => t(COPY, key, language, ...values);

/** One mark per questionnaire, so each role's sheet opens on its own face. */
const ROLE_ICON: Record<string, LucideIcon> = {
  admin: Building2, "campus-admin": Building2, group: Network, owner: Crown, principal: GraduationCap, teacher: BookOpenCheck,
  accountant: Wallet, librarian: Library, receptionist: ConciergeBell, parent: HeartHandshake, student: Backpack,
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WorkflowRequestError(body?.code ?? "INTERNAL");
  return body as T;
}

const delay = (ms: number) => ({ ["--sk-delay" as string]: `${ms}ms` }) as CSSProperties;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The first control a keyboard jump lands on inside a question card (a disabled stepper button is skipped). */
const FIRST_CONTROL = '[tabindex="0"]:not(:disabled), input:not(:disabled), button:not([tabindex="-1"]):not(:disabled), select:not(:disabled)';

/** Counts a number up (or down) to its new value over a short ease-out, so changes are felt, not just shown. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now(), origin = from.current, still = reducedMotion();
    let frame = 0;
    const tick = (now: number) => {
      const progress = still ? 1 : Math.min(1, (now - start) / 650);
      const value = Math.round(origin + (target - origin) * (1 - (1 - progress) ** 3));
      from.current = value; setShown(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

const optionGrid = (options: Option[]) => cn("grid gap-2.5", options.some(option => option.detail) || options.length > 4 ? "sm:grid-cols-2" : options.length > 1 ? "sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" : "");

/** Renders one question's input. Values match the server's answer schemas exactly. */
function Field({ view, value, onChange, label, language, hotkeys = false }: { view: QuestionView; value: unknown; onChange: (value: unknown) => void; label: string; language: Lang; hotkeys?: boolean }) {
  switch (view.kind) {
    case "choice":
      return (
        <div className={optionGrid(view.options)} role="radiogroup" aria-label={label} onKeyDown={event => arrowSelect(event, view.options, value, onChange)}>
          {view.options.map((option, index) => <ChoiceCard key={option.value} option={option} shape="radio" selected={value === option.value} hotkey={hotkeys && index < 9 ? String(index + 1) : undefined} tabbable={value === option.value || (!view.options.some(item => item.value === value) && index === 0)} onSelect={() => onChange(option.value)} />)}
        </div>
      );
    case "multi": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          <div className={optionGrid(view.options)} role="group" aria-label={label}>
            {view.options.map((option, index) => <ChoiceCard key={option.value} option={option} shape="check" selected={picked.includes(option.value)} hotkey={hotkeys && index < 9 ? String(index + 1) : undefined} onSelect={() => onChange(picked.includes(option.value) ? picked.filter(item => item !== option.value) : [...picked, option.value])} />)}
          </div>
          {picked.length > 0 && <p className="sk-fade-in text-xs font-medium text-primary" aria-live="polite">{c("picked", language, picked.length)}</p>}
        </div>
      );
    }
    case "tags":
      return <TagList label={label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} max={view.max} placeholder={view.placeholder} suggestions={view.suggestions} validate={view.url ? tag => /^https:\/\/\S+\.\S+/.test(tag) : undefined} />;
    case "stepper":
      return <Stepper label={label} value={typeof value === "number" ? value : null} onChange={onChange} min={view.min} max={view.max} step={view.step} unit={view.unit} />;
    case "text":
      return <Input aria-label={label} dir={view.time ? "ltr" : "auto"} inputMode={view.time ? "numeric" : undefined} placeholder={view.placeholder} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} />;
    case "per-row-choice": {
      const rows = (value ?? {}) as Record<string, string>;
      const set = (rowId: string, next: string) => { const copy = { ...rows }; if (next) copy[rowId] = next; else delete copy[rowId]; onChange(copy); };
      return (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface-subtle">{view.rows.map(row => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3" data-row={row.id}>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-strong" dir="auto">
              {rows[row.id] ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <span className="size-4 rounded-full border-2 border-edge" aria-hidden />}
              {row.label}
            </span>
            {row.options.length <= 4
              ? <SegmentedChoice label={row.label} options={row.options} value={rows[row.id] ?? ""} onChange={next => set(row.id, next)} />
              : <Select aria-label={row.label} className="sm:w-56" value={rows[row.id] ?? ""} onChange={event => set(row.id, event.target.value)}>
                  <option value="">—</option>
                  {row.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>}
          </li>
        ))}</ul>
      );
    }
    case "schedule": {
      const current = (value ?? { slots: [], weeks: 2 }) as { slots: string[]; weeks: number };
      return (
        <div className="space-y-4">
          <AvailabilityGrid label={label} busyLabel={c("busy", language)} days={view.days} value={current.slots} onChange={slots => onChange({ ...current, slots })} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-ink-strong"><CalendarClock className="size-4 text-primary" aria-hidden />{c("weeks", language)}</span>
            <Stepper label={c("weeks", language)} value={current.weeks} min={view.weeks.min} max={view.weeks.max} onChange={weeks => onChange({ ...current, weeks })} />
          </div>
        </div>
      );
    }
    case "test-rows": {
      const rows = (value ?? {}) as Record<string, { date: string; totalMarks: number }>;
      return (
        <div className="grid gap-3">{view.rows.map(row => {
          const planned = rows[row.id];
          const set = (next: { date: string; totalMarks: number } | null) => { const copy = { ...rows }; if (next) copy[row.id] = next; else delete copy[row.id]; onChange(copy); };
          return (
            <div key={row.id} className={cn("space-y-3 rounded-2xl border p-4 transition-colors", planned ? "border-brand-300 bg-surface-selected" : "border-border-subtle bg-surface-subtle")} data-test-row={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink-strong" dir="auto">{row.label}</span>
                <SegmentedChoice label={row.label} options={[{ value: "plan", label: c("planTest", language) }, { value: "none", label: c("notYet", language) }]} value={planned ? "plan" : "none"} onChange={next => set(next === "plan" ? planned ?? { date: view.minDate, totalMarks: row.defaultTotal } : null)} />
              </div>
              {planned && (
                <div className="sk-enter flex flex-wrap items-end gap-3">
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
        <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label={label}>{view.rows.map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-2.5" data-row={row.id}>
            <span className="text-sm font-semibold text-ink-strong" dir="auto">{row.label}</span>
            <Stepper label={row.label} value={rows[row.id] ?? view.min} min={view.min} max={view.max} step={view.step} unit={view.unit} onChange={next => onChange({ ...rows, [row.id]: next })} />
          </div>
        ))}</div>
      );
    }
    case "row-tags": {
      const rows = (value ?? {}) as Record<string, string[]>;
      return (
        <div className="grid gap-3">{view.rows.map(row => (
          <div key={row.id} className="space-y-2 rounded-2xl border border-border-subtle bg-surface-subtle p-4" data-row={row.id}>
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-strong" dir="auto">{row.label}{(rows[row.id]?.length ?? 0) > 0 && <Badge variant="secondary">{rows[row.id].length}</Badge>}</span>
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
            <div key={index} className="sk-enter-scale grid items-center gap-2 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:grid-cols-[auto_repeat(auto-fit,minmax(9rem,1fr))_auto]" data-table-row={index}>
              <span className="hidden size-8 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 sm:grid" aria-hidden>{index + 1}</span>
              {view.columns.map(column => column.type === "choice"
                ? <Select key={column.key} aria-label={column.label} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)}><option value="">{column.label}</option>{column.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
                : <Input key={column.key} aria-label={column.label} placeholder={column.label} type={column.type} dir={column.type === "text" ? "auto" : "ltr"} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)} />)}
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, at) => at !== index))}><Trash2 aria-hidden />{c("remove", language)}</Button>
            </div>
          ))}
          {rows.length < view.maxRows && (
            <Button type="button" variant="outline" className="w-full border-dashed text-primary" onClick={() => onChange([...rows, {}])}><Plus aria-hidden />{c("addRow", language)}</Button>
          )}
        </div>
      );
    }
    case "group": {
      const current = (value ?? {}) as Record<string, unknown>;
      return (
        <div className="grid gap-4 sm:grid-cols-2">{view.fields.map(field => (
          <div key={field.key} className={cn("space-y-2", (field.view.kind === "choice" || field.view.kind === "multi" || field.view.kind === "tags") && "sm:col-span-2")}>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-strong">{field.label}{field.optional && <span className="text-xs font-medium text-ink-muted">· {c("optional", language)}</span>}</span>
            <Field view={field.view} label={field.label} language={language} value={current[field.key]} onChange={next => { const copy = { ...current }; if (next === "" || next === undefined) delete copy[field.key]; else copy[field.key] = field.view.kind === "stepper" ? Number(next) : next; onChange(copy); }} />
          </div>
        ))}</div>
      );
    }
  }
}

/** The completion ring on the ink cover: answered questions over all that apply. */
function Ring({ value, total, label, complete }: { value: number; total: number; label: string; complete: boolean }) {
  const radius = 34, circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? value / total : 0;
  return (
    <div className="relative grid size-16 shrink-0 place-items-center sm:size-24" role="img" aria-label={`${value} / ${total} ${label}`} data-complete={complete || undefined}>
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" className="sk-quiz-ring-track" />
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" strokeLinecap="round" className="sk-quiz-ring-value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} />
      </svg>
      <span className="text-center leading-none" aria-hidden>
        <span data-numeric className="block text-base font-extrabold text-white sm:text-2xl">{Math.round(ratio * 100)}%</span>
        <span className="mt-1 hidden text-2xs font-medium uppercase tracking-wider text-brand-200 sm:block">{label}</span>
      </span>
    </div>
  );
}

function Panel({ title, icon: Icon, children, className, ...props }: { title: string; icon?: LucideIcon; children: ReactNode; className?: string } & Record<`data-${string}`, unknown>) {
  return (
    <section className={cn("sk-panel space-y-3 p-4 sm:p-5", className)} {...props}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">{Icon && <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-primary"><Icon className="size-4" aria-hidden /></span>}{title}</h2>
      {children}
    </section>
  );
}

/**
 * "Your week, built live" (design-ux, Slice 2). Short resumable sheets; every answer is saved as it is
 * given and the side panel shows what Build will set up (pending ghosts) before anything runs. Build
 * compiles confirmed answers without a model call; the Run Sheet then takes over. One component serves
 * every role's questionnaire; the role only changes the questions, the mark and the copy.
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
  const top = useRef<HTMLDivElement | null>(null);
  const preview = useRef<HTMLElement | null>(null);
  // The question the keyboard talks to (digits answer it, Enter moves on). Null follows the first open one.
  const [active, setActive] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);

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

  const cardOf = (key: string) => document.querySelector<HTMLElement>(`[data-ai-question-key="${CSS.escape(key)}"]`);
  const nextOpen = (key: string) => {
    const onPage = sheet?.questions.filter(question => question.sheet === page) ?? [];
    return onPage.slice(onPage.findIndex(question => question.key === key) + 1).find(question => !confirmedRef.current.includes(question.key)) ?? null;
  };
  /** Brings a question into view and makes it the active one; from the keyboard, focus lands on its first control. */
  const focusQuestion = (key: string, viaKeyboard: boolean) => {
    setActive(key);
    const element = cardOf(key);
    if (!element) return;
    element.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    if (viaKeyboard) element.querySelector<HTMLElement>(FIRST_CONTROL)?.focus({ preventScroll: true });
  };

  // A single-tap answer glides to the next open question on this step, so the sheet reads like a conversation.
  const advanceFrom = (key: string) => {
    const next = nextOpen(key);
    if (!next) return;
    setActive(next.key);
    window.setTimeout(() => {
      const element = cardOf(next.key);
      if (element && element.getBoundingClientRect().top > window.innerHeight * 0.55) element.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    }, 260);
  };

  const goTo = (next: number) => {
    setPage(next); setActive(null);
    top.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const questions = useMemo(() => sheet?.questions.filter(question => question.sheet === page) ?? [], [sheet, page]);
  const missingRequired = sheet?.questions.filter(question => question.required && !confirmed.includes(question.key)) ?? [];
  const total = sheet?.willCreate.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const last = sheet ? page === sheet.sheets.length - 1 : false;
  const answeredCount = sheet?.questions.filter(question => confirmed.includes(question.key)).length ?? 0;
  const questionCount = sheet?.questions.length ?? 0;
  const sheetState = (index: number) => {
    const inSheet = sheet?.questions.filter(question => question.sheet === index) ?? [];
    const answered = inSheet.filter(question => confirmed.includes(question.key)).length;
    const done = inSheet.length > 0 && inSheet.every(question => confirmed.includes(question.key) || !question.required) && answered > 0;
    return { answered, count: inSheet.length, done };
  };
  const numberOf = (key: string) => (sheet?.questions.findIndex(question => question.key === key) ?? 0) + 1;
  const activeKey = questions.some(question => question.key === active) ? active : (questions.find(question => !confirmed.includes(question.key)) ?? questions[0])?.key ?? null;
  const ready = Boolean(sheet) && missingRequired.length === 0 && total > 0;
  const shownTotal = useCountUp(total);

  /** "Show me": the first required question still open, on whichever step holds it. */
  const jumpToMissing = () => {
    const first = missingRequired[0];
    if (!first) return;
    if (first.sheet === page) { focusQuestion(first.key, true); return; }
    pendingScroll.current = first.key; setPage(first.sheet); setActive(first.key);
  };
  useEffect(() => {
    const key = pendingScroll.current;
    if (!key) return;
    pendingScroll.current = null;
    const element = cardOf(key);
    element?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    element?.querySelector<HTMLElement>(FIRST_CONTROL)?.focus({ preventScroll: true });
  }, [page]);

  // Keyboard flow (pointer screens): 1–9 answer the active choice question, Enter moves to the next open one.
  const onKey = useRef<(event: globalThis.KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    onKey.current = event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (run && !editing)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='listbox']")) return;
      const question = questions.find(item => item.key === activeKey);
      if (!question) return;
      const view = question.view;
      if (/^[1-9]$/.test(event.key) && (view.kind === "choice" || view.kind === "multi")) {
        const option = view.options[Number(event.key) - 1];
        if (!option) return;
        event.preventDefault();
        if (view.kind === "choice") { answer(question.key, option.value); advanceFrom(question.key); return; }
        const picked = Array.isArray(answers[question.key]) ? (answers[question.key] as string[]) : [];
        answer(question.key, picked.includes(option.value) ? picked.filter(item => item !== option.value) : [...picked, option.value]);
        return;
      }
      if (event.key === "Enter" && !target?.closest("button, a, [role='radio']")) {
        const next = nextOpen(question.key);
        if (next) { event.preventDefault(); focusQuestion(next.key, true); }
        else if (!last) { event.preventDefault(); goTo(page + 1); }
      }
    };
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

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
  const RoleIcon = ROLE_ICON[questionnaireKey] ?? Sparkles;
  if (!sheet) return problem
    ? <div className="mx-auto max-w-3xl p-4 sm:p-6"><Alert tone="danger" data-ai-error={problem}>{ERROR_WORDS[problem as keyof typeof ERROR_WORDS]?.[language] ?? problem}</Alert></div>
    : <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6"><Skeleton className="h-44 w-full rounded-3xl" /><div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><div className="space-y-4"><Skeleton className="h-40 w-full rounded-3xl" /><Skeleton className="h-40 w-full rounded-3xl" /></div><Skeleton className="h-64 w-full rounded-3xl" /></div></div>;

  const board = sheet.board?.length ? (
    <Panel title={c("board", language)} icon={Network} data-ai-launch-board>
      <ul className="sk-stagger space-y-2">{sheet.board.map(tile => (
        <li key={tile.campusId} data-ai-tile={tile.campusId} className="space-y-1.5 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-ink-strong" dir="auto"><Building2 className="size-4 text-primary" aria-hidden />{tile.campus}</p>
          <div className="flex flex-wrap gap-1">
            <Badge variant="success">{c("tileCampus", language)}</Badge>
            <Badge variant={tile.leader === "JOINED" ? "success" : tile.leader === "INVITED" ? "warning" : "neutral"}>{c(`tileLeader${tile.leader}`, language)}</Badge>
            {tile.setup && <Badge variant={tile.setup === "READY" ? "success" : "info"}>{c(`tileSetup${tile.setup === "READY" ? "READY" : tile.setup === "NEW" ? "NEW" : "BUSY"}`, language)}</Badge>}
          </div>
        </li>
      ))}</ul>
    </Panel>
  ) : null;

  const ghosts = (
    <aside ref={preview} className="scroll-mt-6 space-y-4 lg:sticky lg:top-6 lg:self-start" data-ai-ghosts aria-live="polite">
      <section className="sk-panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border-subtle bg-gradient-to-br from-brand-50 to-transparent p-4 sm:p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-white shadow-md"><Sparkles className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-strong">{c("willCreate", language)}</h2>
            <p className="text-xs text-ink-muted"><span key={total} data-numeric className="sk-enter-scale inline-block text-lg font-extrabold text-primary">{shownTotal}</span> {c("items", language)}</p>
          </div>
        </div>
        <div className="space-y-2 p-4 sm:p-5">
          {sheet.willCreate.length === 0 ? <p className="text-sm text-ink-muted">{c("nothingYet", language)}</p> : (
            <ul className="space-y-2">{sheet.willCreate.map(item => (
              <li key={`${item.capabilityKey}:${item.count}`} data-ai-ghost={item.capabilityKey} className="sk-quiz-ghost flex items-start gap-2.5 rounded-xl p-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block font-semibold leading-snug text-ink-strong">{item.title}{item.count > 1 && <span data-numeric className="ms-1.5 text-primary">× {item.count}</span>}</span>
                  <Badge size="sm" variant={item.cls === "A" ? "success" : item.cls === "B" ? "warning" : "info"}>{c(item.cls === "A" ? "runs" : item.cls === "B" ? "confirm" : "handoff", language)}</Badge>
                </span>
              </li>
            ))}</ul>
          )}
          {sheet.notConnected.length > 0 && <p className="text-xs text-ink-muted" data-ai-not-connected>{c("later", language)} ({sheet.notConnected.map(item => item.capabilityKey).join(", ")})</p>}
        </div>
      </section>
      {board}
      {sheet.known.length > 0 && (
        <Panel title={c("known", language)} icon={RoleIcon}>
          <dl className="grid gap-2 text-sm">{sheet.known.map(fact => (
            <div key={fact.label} className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-subtle px-3 py-2">
              <dt className="text-ink-muted">{fact.label}</dt>
              <dd className="text-end font-semibold text-ink-strong" dir="auto">{fact.editLink ? <Link className="underline-offset-4 hover:text-primary hover:underline" href={fact.editLink}>{fact.value}</Link> : fact.value}</dd>
            </div>
          ))}</dl>
        </Panel>
      )}
    </aside>
  );

  if (run && !editing) {
    const done = run.status === "COMPLETED";
    return (
      <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup-run>
        <div className="min-w-0 space-y-5">
          <header className="sk-ink-cover sk-enter flex flex-wrap items-center gap-5 p-6 sm:p-8">
            <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/20">{done ? <PartyPopper className="size-8 text-brand-100" aria-hidden /> : <RoleIcon className="size-8 text-brand-100" aria-hidden />}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="flex items-center gap-2">{done && <CheckCircle2 className="size-7 shrink-0 text-brand-200" aria-hidden />}<InkHeading as="h2" text={done ? c("ready", language) : sheet.title} className="text-3xl sm:text-4xl" /></h1>
              <p className="max-w-xl text-sm text-brand-100">{c(done ? "readyHint" : "buildingHint", language)}</p>
            </div>
          </header>
          <RunSheet run={run} language={language} busy={busy} error={error} onCommand={(body, clickKey) => void send(body, clickKey)} />
          <Button type="button" variant="outline" data-ai-edit-answers onClick={() => { setEditing(true); setPage(0); }}><ArrowLeft className="rtl:rotate-180" aria-hidden />{c("edit", language)}</Button>
          {sheet.remains.length > 0 && (
            <Panel title={c("remains", language)} icon={CalendarClock} data-ai-remains>
              <ul className="sk-stagger grid gap-2 text-sm">{sheet.remains.map(task => (
                <li key={task.title} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2.5">
                  <span className="min-w-0"><span className="block font-semibold text-ink-strong">{task.title}</span><span className="text-xs text-ink-muted">{task.who}</span></span>
                  {task.link && <Link className="sk-nudge-trigger inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-brand-50" href={task.link}>{c("open", language)}<ArrowRight className="sk-nudge size-4 rtl:rotate-180" aria-hidden /></Link>}
                </li>
              ))}</ul>
            </Panel>
          )}
        </div>
        {ghosts}
      </div>
    );
  }

  const current = sheetState(page);
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup={sheet.key}>
      <div className="min-w-0 space-y-5" ref={top}>
        <header className="sk-ink-cover sk-enter space-y-5 p-5 sm:space-y-6 sm:p-8">
          <span className="sk-quiz-orb" data-tone="brand" aria-hidden />
          <span className="sk-quiz-orb" data-tone="berry" aria-hidden />
          <div className="flex items-start justify-between gap-4 sm:gap-5">
            <div className="min-w-0 flex-1 space-y-3">
              {ready ? (
                <p className="sk-quiz-ready-chip sk-enter-scale inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"><CheckCircle2 className="size-3.5" aria-hidden />{c("readyChip", language)}</p>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
                  <RoleIcon className="size-3.5" aria-hidden />{c("eyebrow", language, questionCount, Math.max(2, Math.ceil(questionCount * 0.5)))}
                </p>
              )}
              <InkHeading text={sheet.title} className="text-3xl sm:text-4xl" />
              <p className="hidden max-w-xl text-sm leading-relaxed text-brand-100 sm:block">{c("intro", language)}</p>
            </div>
            <Ring value={answeredCount} total={questionCount} label={c("answered", language)} complete={missingRequired.length === 0} />
          </div>
          <ol className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label={sheet.title}>{sheet.sheets.map((label, index) => {
            const state = sheetState(index);
            return (
              <li key={label} className="shrink-0 snap-start">
                <StepPill index={index} label={label} meta={`${state.answered}/${state.count}`} current={index === page} done={state.done} onSelect={() => goTo(index)} />
              </li>
            );
          })}</ol>
          <p className="flex min-h-5 items-center gap-2 text-xs font-medium text-brand-100" role="status">
            {saving === "saving" && <><span className="sk-quiz-live-dot" aria-hidden />{c("saving", language)}</>}
            {saving === "saved" && <><CheckCircle2 className="size-4 text-brand-200" aria-hidden />{c("saved", language)}</>}
          </p>
        </header>
        {problem === "STALE_VERSION" && <Alert tone="warning">{c("stale", language)}</Alert>}
        {problem && problem !== "STALE_VERSION" && ERROR_WORDS[problem as keyof typeof ERROR_WORDS] && <Alert tone="danger" data-ai-error={problem}>{ERROR_WORDS[problem as keyof typeof ERROR_WORDS]![language]}</Alert>}
        <div key={page} className="space-y-4">{questions.map((question, index) => {
          const isConfirmed = confirmed.includes(question.key);
          const singleTap = question.view.kind === "choice";
          const isActive = question.key === activeKey;
          return (
            <section key={question.key} data-ai-question-key={question.key} data-ai-confirmed={isConfirmed || undefined} data-answered={isConfirmed || undefined} data-active={isActive || undefined}
              className="sk-quiz-card sk-enter scroll-mt-6 space-y-4 p-4 sm:p-6" style={delay(Math.min(index, 8) * 60)} onFocusCapture={() => setActive(question.key)} onPointerDown={() => setActive(question.key)}>
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="sk-quiz-num" aria-hidden>{isConfirmed ? <Check className="size-5" strokeWidth={3} /> : String(numberOf(question.key)).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider", question.required ? "bg-brand-50 text-brand-700" : "bg-surface-subtle text-ink-muted")}>{c(question.required ? "required" : "optional", language)}</span>
                    {question.cls !== "A" && <Badge variant={question.cls === "B" ? "warning" : "info"} size="sm">{c(question.cls === "B" ? "confirm" : "handoff", language)}</Badge>}
                    {!question.connected && <Badge variant="neutral" size="sm">{c("later", language)}</Badge>}
                  </div>
                  <h2 className="text-base font-semibold leading-snug text-ink-strong sm:text-lg">{question.prompt}{question.required && <span className="sr-only"> ({c("required", language)})</span>}</h2>
                  {question.hint && <p className="flex items-start gap-1.5 text-sm text-ink-muted"><Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /><span>{question.hint}</span></p>}
                </div>
              </div>
              <Field view={question.view} label={question.prompt} language={language} hotkeys={isActive} value={answers[question.key]} onChange={value => { answer(question.key, value); if (singleTap) advanceFrom(question.key); }} />
              {answers[question.key] !== undefined && !isConfirmed && (
                <div className="flex justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => { answer(question.key, answers[question.key]); advanceFrom(question.key); }}><Check aria-hidden />{c("keep", language)}</Button></div>
              )}
            </section>
          );
        })}</div>
        {current.done && !last && (
          <div className="sk-quiz-done sk-enter-scale flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5" role="status">
            <span className="flex items-center gap-3">
              <span className="sk-quiz-done-mark"><PartyPopper className="size-5" aria-hidden /></span>
              <span><span className="block font-semibold text-ink-strong">{c("sheetDone", language)}</span><span className="text-sm text-ink-muted">{c("upNext", language, sheet.sheets[page + 1])}</span></span>
            </span>
            <Button type="button" className="sk-nudge-trigger" onClick={() => goTo(page + 1)}>{c("continueTo", language)}<ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden /></Button>
          </div>
        )}
        <footer className="sk-quiz-dock sticky bottom-3 z-10 space-y-3 rounded-3xl p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <Progress size="sm" className="flex-1" value={page + 1} max={sheet.sheets.length} label={c("stepOf", language, page + 1, sheet.sheets.length)} />
            <Button type="button" size="sm" variant="secondary" className="min-h-9 lg:hidden" onClick={() => preview.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" })}>
              <Sparkles aria-hidden /><span data-numeric>{c("previewPill", language, shownTotal)}</span>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2">
              {page > 0 && <Button type="button" variant="outline" onClick={() => goTo(page - 1)}><ArrowLeft className="rtl:rotate-180" aria-hidden />{c("back", language)}</Button>}
              <Button type="button" variant="ghost" onClick={() => void defer()}>{c("notNow", language)}</Button>
            </div>
            <div className="order-last flex w-full flex-col items-center gap-1 sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
              <ProgressDots label={c("dots", language)} onSelect={key => focusQuestion(key, false)} items={questions.map(question => ({ id: question.key, current: question.key === activeKey, done: confirmed.includes(question.key), label: c(confirmed.includes(question.key) ? "dotDone" : "dotOpen", language, numberOf(question.key)) }))} />
              <span className="hidden flex-wrap items-center justify-center gap-1.5 text-center text-xs font-medium text-ink-muted sm:inline-flex">
                {c("stepOf", language, page + 1, sheet.sheets.length)} · {c("ofTotal", language, answeredCount, questionCount)} {c("answered", language)}
                <span className={cn("hidden items-center gap-1", !last && "xl:inline-flex")} aria-hidden>· <kbd className="sk-kbd">1</kbd>–<kbd className="sk-kbd">9</kbd> {c("keysAnswer", language)} · <kbd className="sk-kbd">↵</kbd> {c("keysNext", language)}</span>
              </span>
            </div>
            {last ? (
              <div className="ms-auto flex flex-col items-end gap-1">
                <Button type="button" size="lg" data-ai-build className={cn(ready && !building && "sk-cta-shine")} loading={building} disabled={missingRequired.length > 0 || total === 0} onClick={() => void build()}>{!building && <Sparkles aria-hidden />}{c("build", language, total)}</Button>
                {missingRequired.length > 0
                  ? <p className="flex items-center gap-1 text-xs text-ink-muted">{c("requiredLeft", language, missingRequired.length)} · <Button type="button" variant="link" size="sm" className="min-h-6 px-1 py-0" onClick={jumpToMissing}>{c("showMe", language)}</Button></p>
                  : <p className="text-xs text-ink-muted">{total > 0 ? c("allSet", language) : ""}</p>}
              </div>
            ) : <Button type="button" className="sk-nudge-trigger" onClick={() => goTo(page + 1)}>{c("next", language)}<ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden /></Button>}
          </div>
        </footer>
      </div>
      {ghosts}
    </div>
  );
}
