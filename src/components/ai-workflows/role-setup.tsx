"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, Backpack, BadgeCheck, BookOpenCheck, Building2, CalendarClock, Check, CheckCircle2, Circle, Clock,
  ConciergeBell, Crown, GraduationCap, HeartHandshake, Info, Library, Lightbulb, ListChecks, Minus, Network, PartyPopper, PenLine, Pencil, Plus, Send,
  Sparkles, Trash2, Wallet, type LucideIcon,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper, asciiDigits } from "@/components/ui/stepper";
import { TagList } from "@/components/ui/tag-list";
import { AvailabilityGrid } from "@/components/ui/availability-grid";
import { InkHeading } from "@/components/ui/ink-heading";
import { ChoiceCard, ProgressDots, SegmentedChoice, StepPill, arrowSelect } from "@/components/ui/choice-card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { InfoTip } from "@/components/ui/tooltip";
import { FieldError } from "@/components/ui/form-field";
import { LiveAnnouncer } from "@/components/ui/live-announcer";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import type { SheetView } from "@/lib/ai-workflows/questionnaire/service";
import type { Option, QuestionView } from "@/lib/ai-workflows/questionnaire/types";
import type { RunView, StepUiState } from "@/lib/ai-workflows/view";
import { CLASS_WORDS, UI, errorWords, t, type Lang } from "./run-copy";
import { RunSheet } from "./run-sheet";
import { WorkflowRequestError, useWorkflowRun } from "./use-workflow-run";
import { ClassGlyph, ClassMark, DONE_STATES, STATE_LANE, StateNode, type StepClass } from "./workflow-marks";
import { Num } from "./workflow-format";
import { useSeenTransition } from "./use-seen-transition";

const COPY: Record<string, Record<Lang, string>> = {
  known: { en: "Your school as we know it", ar: "مدرستك كما نعرفها", ur: "آپ کا اسکول، جیسا ہم جانتے ہیں" },
  willCreate: { en: "What Build will set up", ar: "ما سيُجهَّز عند البناء", ur: "بلڈ سے کیا تیار ہوگا" },
  built: { en: "What Build set up", ar: "ما جهّزه البناء", ur: "بلڈ نے کیا تیار کیا" },
  nothingYet: { en: "Answer a question and it appears here before anything is saved.", ar: "أجب عن سؤال ليظهر هنا قبل حفظ أي شيء.", ur: "سوال کا جواب دیں، کچھ محفوظ ہونے سے پہلے یہاں نظر آئے گا۔" },
  laterCount: { en: "Kept as a task for now: {0}", ar: "يبقى مهمة حالياً: {0}", ur: "فی الحال کام کے طور پر: {0}" },
  keep: { en: "Looks right", ar: "يبدو صحيحاً", ur: "درست ہے" },
  next: { en: "Next", ar: "التالي", ur: "اگلا" },
  back: { en: "Back", ar: "السابق", ur: "پیچھے" },
  notNow: { en: "Not now", ar: "ليس الآن", ur: "ابھی نہیں" },
  build: { en: "Build my setup · {0}", ar: "ابنِ إعدادي · {0}", ur: "میرا سیٹ اپ بنائیں · {0}" },
  dirty: { en: "Not saved yet", ar: "لم يُحفظ بعد", ur: "ابھی محفوظ نہیں" },
  saving: { en: "Saving…", ar: "جارٍ الحفظ…", ur: "محفوظ ہو رہا ہے…" },
  saved: { en: "Answers saved", ar: "حُفظت الإجابات", ur: "جوابات محفوظ" },
  saveFailed: { en: "Couldn't save", ar: "تعذّر الحفظ", ur: "محفوظ نہیں ہو سکا" },
  tryAgain: { en: "Try again", ar: "حاول مجدداً", ur: "دوبارہ کوشش کریں" },
  remains: { en: "Still to do, and who does it", ar: "ما تبقى ومن يقوم به", ur: "باقی کام، اور کون کرے گا" },
  afterBuild: { en: "After Build, still to do", ar: "بعد البناء، ما يتبقى", ur: "بلڈ کے بعد، باقی کام" },
  nothingLeft: { en: "Nothing left for anyone.", ar: "لم يتبقَّ شيء لأحد.", ur: "کسی کے لیے کچھ باقی نہیں۔" },
  ready: { en: "Your workspace is ready", ar: "مساحة عملك جاهزة", ur: "آپ کی ورک اسپیس تیار ہے" },
  readyHint: { en: "Everything you confirmed is set up. Here is what happened, and what is left for whom.", ar: "تم إعداد كل ما أكدته. إليك ما حدث وما تبقى ولمن.", ur: "آپ کی تصدیق کردہ ہر چیز تیار ہے۔ یہ رہا کیا ہوا، اور کس کے لیے کیا باقی ہے۔" },
  mostly: { en: "Mostly set up · {0} still need someone", ar: "أُعدّ معظمها · {0} بانتظار أحد", ur: "زیادہ تر تیار · {0} ابھی کسی کے منتظر" },
  mostlyHint: { en: "What saved is listed with its receipt. The rest is waiting for you or for the person who decides.", ar: "ما حُفظ مُدرج مع إيصاله. والباقي بانتظارك أو بانتظار صاحب القرار.", ur: "جو محفوظ ہوا وہ رسید کے ساتھ درج ہے۔ باقی آپ کا یا فیصلہ کرنے والے کا منتظر ہے۔" },
  nothingSaved: { en: "Nothing was saved yet", ar: "لم يُحفظ شيء بعد", ur: "ابھی کچھ محفوظ نہیں ہوا" },
  nothingSavedHint: { en: "No school records changed. Your answers are kept, so you can change them and build again.", ar: "لم تتغير أي سجلات. إجاباتك محفوظة، فيمكنك تعديلها والبناء مجدداً.", ur: "اسکول کا کوئی ریکارڈ نہیں بدلا۔ آپ کے جوابات محفوظ ہیں، انہیں بدل کر دوبارہ بنا سکتے ہیں۔" },
  settingUp: { en: "Setting up · {0} of {1} saved", ar: "قيد الإعداد · حُفظ {0} من {1}", ur: "سیٹ اپ جاری · {1} میں سے {0} محفوظ" },
  buildingHint: { en: "Your answers are turning into a working setup. Steps that need you will ask here.", ar: "تتحول إجاباتك إلى إعداد فعلي. الخطوات التي تحتاجك ستسألك هنا.", ur: "آپ کے جوابات ایک چلتے سیٹ اپ میں بدل رہے ہیں۔ جن مراحل کو آپ کی ضرورت ہو وہ یہاں پوچھیں گے۔" },
  busy: { en: "Busy in your timetable", ar: "مشغول في جدولك", ur: "ٹائم ٹیبل میں مصروف" },
  weeks: { en: "Weeks ahead", ar: "أسابيع قادمة", ur: "آئندہ ہفتے" },
  planTest: { en: "Plan a test", ar: "خطط لاختبار", ur: "ٹیسٹ طے کریں" },
  notYet: { en: "Not yet", ar: "ليس بعد", ur: "ابھی نہیں" },
  total: { en: "Total marks", ar: "الدرجة الكلية", ur: "کل نمبر" },
  testDate: { en: "Test date", ar: "تاريخ الاختبار", ur: "ٹیسٹ کی تاریخ" },
  addRow: { en: "Add a row", ar: "إضافة صف", ur: "قطار شامل کریں" },
  removeRow: { en: "Remove row {0}", ar: "إزالة الصف {0}", ur: "قطار {0} ہٹائیں" },
  rowN: { en: "Row {0}", ar: "الصف {0}", ur: "قطار {0}" },
  noRows: { en: "No rows yet. Add one, or skip this question.", ar: "لا صفوف بعد. أضف صفاً أو تخطَّ هذا السؤال.", ur: "ابھی کوئی قطار نہیں۔ ایک شامل کریں، یا یہ سوال چھوڑ دیں۔" },
  notSet: { en: "Not set", ar: "غير محدد", ur: "طے نہیں" },
  timeFormat: { en: "Use 24-hour time, e.g. 08:00", ar: "استخدم نظام 24 ساعة، مثل 08:00", ur: "24 گھنٹے کا وقت لکھیں، جیسے 08:00" },
  urlInvalid: { en: "Use a full https:// link", ar: "استخدم رابطاً كاملاً يبدأ بـ https://", ur: "مکمل https:// لنک لکھیں" },
  pickAtLeast: { en: "Pick at least {0}", ar: "اختر {0} على الأقل", ur: "کم از کم {0} منتخب کریں" },
  edit: { en: "Change my answers", ar: "تغيير إجاباتي", ur: "میرے جوابات تبدیل کریں" },
  editGuard: { en: "Changing an answer stops the steps still waiting. What's already saved stays.", ar: "تغيير إجابة يوقف الخطوات المنتظرة، ويبقى ما حُفظ.", ur: "جواب بدلنے سے منتظر مراحل رک جائیں گے؛ جو محفوظ ہو چکا وہ رہے گا۔" },
  backToRun: { en: "Back to my setup", ar: "العودة إلى إعدادي", ur: "اپنے سیٹ اپ پر واپس" },
  board: { en: "Campus launch board", ar: "لوحة إطلاق الفروع", ur: "کیمپس لانچ بورڈ" },
  boardProgress: { en: "{0} of {1} campuses set up", ar: "أُعدّ {0} من {1} فروع", ur: "{1} میں سے {0} کیمپس تیار" },
  tileCampus: { en: "Campus created", ar: "أُنشئ الفرع", ur: "کیمپس بن گیا" },
  tileLeaderNONE: { en: "No administrator yet", ar: "لا مدير بعد", ur: "ابھی کوئی منتظم نہیں" },
  tileLeaderINVITED: { en: "Invitation pending", ar: "الدعوة معلقة", ur: "دعوت زیر التوا" },
  tileLeaderJOINED: { en: "Administrator joined", ar: "انضم المدير", ur: "منتظم شامل ہو گئے" },
  tileSetupNEW: { en: "Setup not started", ar: "لم يبدأ الإعداد", ur: "سیٹ اپ شروع نہیں" },
  tileSetupBUSY: { en: "Setting up", ar: "قيد الإعداد", ur: "سیٹ اپ جاری" },
  tileSetupDEFERRED: { en: "Postponed", ar: "مؤجَّل", ur: "مؤخر" },
  tileSetupPARTIAL: { en: "Partly set up", ar: "أُعدّ جزئياً", ur: "جزوی طور پر تیار" },
  tileSetupREADY: { en: "Set up", ar: "جاهز", ur: "تیار" },
  tileSetupNONE: { en: "Waits for its administrator", ar: "ينتظر مديره", ur: "اپنے منتظم کا منتظر" },
  stale: { en: "This sheet changed in another tab. The latest answers are shown.", ar: "تغيّرت الصفحة في نافذة أخرى. تظهر أحدث الإجابات.", ur: "یہ شیٹ دوسرے ٹیب میں بدلی۔ تازہ جوابات دکھائے جا رہے ہیں۔" },
  fieldError: { en: "This answer wasn't saved. Check it and try again.", ar: "لم تُحفظ هذه الإجابة. راجعها وحاول مجدداً.", ur: "یہ جواب محفوظ نہیں ہوا۔ دیکھ کر دوبارہ کوشش کریں۔" },
  goToAnswer: { en: "Go to that answer", ar: "انتقل إلى تلك الإجابة", ur: "اس جواب پر جائیں" },
  eyebrow: { en: "First-time setup · {0} questions · about {1} min", ar: "الإعداد الأول · {0} أسئلة · نحو {1} دقيقة", ur: "پہلا سیٹ اپ · {0} سوالات · تقریباً {1} منٹ" },
  intro: { en: "Answer in your own time. Every answer saves as you go, and the panel shows what will be set up before anything changes.", ar: "أجب على راحتك. تُحفظ كل إجابة فوراً، وتعرض اللوحة ما سيُجهَّز قبل أي تغيير.", ur: "اپنے وقت پر جواب دیں۔ ہر جواب فوراً محفوظ ہوتا ہے، اور پینل دکھاتا ہے کہ کچھ بدلنے سے پہلے کیا تیار ہوگا۔" },
  answered: { en: "answered", ar: "مُجاب", ur: "جواب دیے" },
  ofTotal: { en: "{0} of {1}", ar: "{0} من {1}", ur: "{1} میں سے {0}" },
  stepOf: { en: "Step {0} of {1}", ar: "الخطوة {0} من {1}", ur: "مرحلہ {0} از {1}" },
  stepNamed: { en: "Step {0} of {1}: {2}", ar: "الخطوة {0} من {1}: {2}", ur: "مرحلہ {0} از {1}: {2}" },
  completed: { en: "(completed)", ar: "(مكتملة)", ur: "(مکمل)" },
  required: { en: "Required", ar: "مطلوب", ur: "ضروری" },
  optional: { en: "Optional", ar: "اختياري", ur: "اختیاری" },
  picked: { en: "{0} selected", ar: "تم اختيار {0}", ur: "{0} منتخب" },
  items: { en: "items ready to set up", ar: "عناصر جاهزة للإعداد", ur: "چیزیں سیٹ اپ کے لیے تیار" },
  sheetDone: { en: "This step is complete", ar: "اكتملت هذه الخطوة", ur: "یہ مرحلہ مکمل ہے" },
  laneCaption: { en: "{0} saved on Build · {1} you review first · {2} go to their owners. Nothing changes until you confirm.", ar: "{0} يُحفظ عند البناء · {1} تراجعه أولاً · {2} يذهب لأصحابه. لا يتغير شيء قبل تأكيدك.", ur: "{0} بلڈ پر محفوظ · {1} پہلے آپ دیکھیں گے · {2} متعلقہ افراد کو۔ آپ کی تصدیق تک کچھ نہیں بدلتا۔" },
  buildSentence: { en: "Build will set up {0}: {1} for you to review, {2} for their owners.", ar: "سيُجهّز البناء {0}: {1} لمراجعتك، و{2} لأصحابها.", ur: "بلڈ {0} تیار کرے گا: {1} آپ کے جائزے کے لیے، {2} متعلقہ افراد کے لیے۔" },
  needAnswer: { en: "Answer at least one question to build.", ar: "أجب عن سؤال واحد على الأقل للبناء.", ur: "بنانے کے لیے کم از کم ایک سوال کا جواب دیں۔" },
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
  resumed: { en: "Picked up where you left off", ar: "تابعنا من حيث توقفت", ur: "وہیں سے جاری جہاں چھوڑا تھا" },
  fromRecords: { en: "From your records · check it", ar: "من سجلاتك · راجعه", ur: "آپ کے ریکارڈ سے · دیکھ لیں" },
  loading: { en: "Loading your setup", ar: "جارٍ تحميل إعدادك", ur: "آپ کا سیٹ اپ لوڈ ہو رہا ہے" },
  change: { en: "Change", ar: "تغيير", ur: "بدلیں" },
  changeFact: { en: "Change {0}", ar: "تغيير {0}", ur: "{0} بدلیں" },
  lanePending: { en: "Still to run", ar: "لم يبدأ بعد", ur: "ابھی چلنا باقی" },
};
const c = (key: string, language: Lang, ...values: Array<string | number>) => t(COPY, key, language, ...values);

/** One mark per questionnaire, so each role's sheet opens on its own face. */
const ROLE_ICON: Record<string, LucideIcon> = {
  admin: Building2, "campus-admin": Building2, group: Network, owner: Crown, principal: GraduationCap, teacher: BookOpenCheck,
  accountant: Wallet, librarian: Library, receptionist: ConciergeBell, parent: HeartHandshake, student: Backpack,
};

/** A rejected answer names the question it belongs to (params.field), so the sheet can land on it. */
class SetupRequestError extends WorkflowRequestError {
  constructor(code: string, readonly field: string | null) { super(code); }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new SetupRequestError(body?.code ?? "INTERNAL", typeof body?.params?.field === "string" ? body.params.field : null);
  return body as T;
}

const delay = (ms: number) => ({ ["--sk-delay" as string]: `${ms}ms` }) as CSSProperties;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The first control a keyboard jump lands on inside a question card (a disabled stepper button is skipped). */
const FIRST_CONTROL = '[tabindex="0"]:not(:disabled), input:not(:disabled), button:not([tabindex="-1"]):not(:disabled), select:not(:disabled)';
const TERMINAL = new Set(["COMPLETED", "CANCELLED", "EXPIRED", "FAILED"]);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";
type Lane = "saved" | "waiting" | "withOwner" | "notRun" | "pending";
const LANES: Array<{ lane: Lane; icon: LucideIcon; tile: string; label: () => Record<Lang, string> }> = [
  { lane: "saved", icon: Check, tile: "bg-status-success-surface text-status-success-text", label: () => UI.laneSaved },
  { lane: "waiting", icon: PenLine, tile: "bg-status-warning-surface text-status-warning-text", label: () => UI.laneWaiting },
  { lane: "withOwner", icon: Send, tile: "bg-status-info-surface text-status-info-text", label: () => UI.laneWithOwner },
  { lane: "notRun", icon: Minus, tile: "border border-dashed border-border-subtle bg-surface-subtle text-ink-subtle", label: () => UI.laneNotRun },
  { lane: "pending", icon: Circle, tile: "bg-surface-subtle text-ink-subtle", label: () => COPY.lanePending },
];

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

/** Lane totals for a run, from step states only (receipt-backed for "saved"). */
function laneCounts(run: RunView): Record<Lane, number> {
  const counts: Record<Lane, number> = { saved: 0, waiting: 0, withOwner: 0, notRun: 0, pending: 0 };
  for (const step of run.steps) counts[STATE_LANE[step.state]] += 1;
  return counts;
}

/** The honest headline for a Build: only a fully executed run is "ready". */
function heroKind(run: RunView | null): "ready" | "mostly" | "nothing" | "progress" {
  if (!run) return "progress";
  if (!TERMINAL.has(run.status)) return "progress";
  const lanes = laneCounts(run);
  const practice = run.steps.some(step => step.state === "practice");
  if (practice || run.outcome === "NOTHING_DONE" || lanes.saved === 0) return "nothing";
  if (run.status === "COMPLETED" && run.outcome === "EXECUTED" && lanes.waiting + lanes.withOwner + lanes.notRun + lanes.pending === 0) return "ready";
  return "mostly";
}

const optionGrid = (options: Option[]) => cn("grid gap-2.5", options.some(option => option.detail) || options.length > 4 ? "sm:grid-cols-2" : options.length > 1 ? "sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]" : "");

/** A time of day as HH:MM. The native control is preferred; a typed value is checked on blur. */
function TimeField({ value, onChange, label, language, invalid }: { value: string; onChange: (value: string) => void; label: string; language: Lang; invalid?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const errorId = useId();
  const ok = (text: string) => text === "" || TIME.test(text);
  return (
    <div className="space-y-1.5">
      <Input type="time" step={300} dir="ltr" className="tabular-nums sm:w-44" aria-label={label} aria-invalid={bad || invalid || undefined} aria-describedby={bad ? errorId : undefined}
        value={draft ?? value} onChange={event => { const next = asciiDigits(event.target.value); setDraft(next); setBad(false); if (ok(next)) onChange(next); }}
        onBlur={() => { if (draft !== null && !ok(draft)) setBad(true); else setDraft(null); }} />
      {bad && <FieldError id={errorId}>{c("timeFormat", language)}</FieldError>}
    </div>
  );
}

/** Structured rows the person types: columns side by side from tablet width, stacked with labels on a phone. */
function TableField({ view, value, onChange, label, language }: { view: Extract<QuestionView, { kind: "table" }>; value: unknown; onChange: (value: unknown) => void; label: string; language: Lang }) {
  const rows = Array.isArray(value) ? (value as Array<Record<string, string>>) : [];
  const group = useRef<HTMLDivElement | null>(null);
  const focusRow = useRef<number | null>(null);
  const set = (index: number, key: string, next: string) => onChange(rows.map((row, at) => (at === index ? { ...row, [key]: next } : row)));
  const cols = { ["--sk-cols" as string]: `auto repeat(${view.columns.length}, minmax(0, 1fr)) 2.75rem` } as CSSProperties;
  useEffect(() => {
    const index = focusRow.current;
    if (index === null) return;
    focusRow.current = null;
    group.current?.querySelector<HTMLElement>(`[data-table-row="${index}"] input, [data-table-row="${index}"] select`)?.focus();
  }, [rows.length]);
  return (
    <div className="space-y-3" role="group" aria-label={label} ref={group}>
      {rows.length > 0 && (
        <div className="hidden items-end gap-2 px-3 text-xs font-medium text-ink-muted md:grid md:grid-cols-(--sk-cols)" style={cols} aria-hidden>
          <span className="w-8" />{view.columns.map(column => <span key={column.key} className="min-w-0 truncate">{column.label}</span>)}<span />
        </div>
      )}
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-border-subtle bg-surface-subtle px-4 py-5 text-center text-sm text-ink-muted">{c("noRows", language)}</p>}
      {rows.map((row, index) => (
        <div key={index} className="sk-enter-scale grid items-center gap-2 rounded-2xl border border-border-subtle bg-surface-subtle p-3 md:grid-cols-(--sk-cols)" style={cols} data-table-row={index}>
          <div className="flex items-center justify-between gap-2 md:contents">
            <Badge size="sm" variant="neutral" className="md:hidden">{c("rowN", language, "")}<Num value={index + 1} /></Badge>
            <span className="hidden size-8 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 md:grid" aria-hidden><Num value={index + 1} /></span>
            <IconButton label={c("removeRow", language, index + 1)} className="md:order-last" onClick={() => onChange(rows.filter((_, at) => at !== index))}><Trash2 aria-hidden /></IconButton>
          </div>
          {view.columns.map(column => (
            <div key={column.key} className="min-w-0 space-y-1">
              <span className="block text-2xs font-medium text-ink-muted md:hidden" aria-hidden>{column.label}</span>
              {column.type === "choice"
                ? <Select aria-label={column.label} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)}><option value="">{column.label}</option>{column.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select>
                : <Input aria-label={column.label} placeholder={column.label} type={column.type} dir={column.type === "text" ? "auto" : "ltr"} value={row[column.key] ?? ""} onChange={event => set(index, column.key, event.target.value)} />}
            </div>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rows.length < view.maxRows && (
          <Button type="button" variant="outline" className="w-full border-dashed text-primary sm:w-auto" onClick={() => { focusRow.current = rows.length; onChange([...rows, {}]); }}><Plus aria-hidden />{c("addRow", language)}</Button>
        )}
        {rows.length >= view.maxRows - 5 && <span className="text-xs text-ink-muted"><Num value={rows.length} /> / <Num value={view.maxRows} /></span>}
      </div>
    </div>
  );
}

/** A group's fields, each with its own visible label tied to its controls. */
function GroupField({ view, value, onChange, language }: { view: Extract<QuestionView, { kind: "group" }>; value: unknown; onChange: (value: unknown) => void; language: Lang }) {
  const base = useId();
  const current = (value ?? {}) as Record<string, unknown>;
  const wide = new Set(["choice", "multi", "tags", "table", "row-steppers", "row-tags", "per-row-choice", "test-rows", "schedule"]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">{view.fields.map(field => (
      <div key={field.key} role="group" aria-labelledby={`${base}-${field.key}`} className={cn("min-w-0 space-y-2", wide.has(field.view.kind) && "sm:col-span-2")}>
        <span id={`${base}-${field.key}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong">{field.label}{field.optional && <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-2xs font-medium text-ink-muted">{c("optional", language)}</span>}</span>
        <Field view={field.view} label={field.label} language={language} value={current[field.key]} onChange={next => { const copy = { ...current }; if (next === "" || next === undefined) delete copy[field.key]; else copy[field.key] = field.view.kind === "stepper" ? Number(next) : next; onChange(copy); }} />
      </div>
    ))}</div>
  );
}

/** Renders one question's input. Values match the server's answer schemas exactly. */
function Field({ view, value, onChange, label, language, hotkeys = false, invalid = false }: { view: QuestionView; value: unknown; onChange: (value: unknown) => void; label: string; language: Lang; hotkeys?: boolean; invalid?: boolean }) {
  switch (view.kind) {
    case "choice":
      return (
        <div className={optionGrid(view.options)} role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} onKeyDown={event => arrowSelect(event, view.options, value, onChange)}>
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
          {view.min && picked.length < view.min ? <p className="text-xs text-ink-muted">{c("pickAtLeast", language, view.min)}</p> : null}
        </div>
      );
    }
    case "tags":
      return <TagList label={label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} max={view.max} placeholder={view.placeholder} suggestions={view.suggestions} validate={view.url ? tag => /^https:\/\/\S+\.\S+/.test(tag) : undefined} invalidMessage={view.url ? c("urlInvalid", language) : undefined} />;
    case "stepper":
      return <Stepper label={label} invalid={invalid} value={typeof value === "number" ? value : null} onChange={onChange} min={view.min} max={view.max} step={view.step} unit={view.unit} />;
    case "text":
      return view.time
        ? <TimeField label={label} language={language} invalid={invalid} value={typeof value === "string" ? value : ""} onChange={onChange} />
        : <Input aria-label={label} aria-invalid={invalid || undefined} dir="auto" placeholder={view.placeholder} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} />;
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
                  <label className="min-w-0 space-y-1">
                    <span className="block text-2xs font-medium text-ink-muted">{c("testDate", language)}</span>
                    <Input type="date" dir="ltr" className="tabular-nums sm:w-48" aria-label={c("testDate", language)} min={view.minDate} value={planned.date} onChange={event => { if (event.target.value) set({ ...planned, date: event.target.value }); }} />
                  </label>
                  <div className="space-y-1">
                    <span className="block text-2xs font-medium text-ink-muted" aria-hidden>{c("total", language)}</span>
                    <Stepper label={c("total", language)} value={planned.totalMarks} min={5} max={100} step={5} onChange={totalMarks => set({ ...planned, totalMarks })} />
                  </div>
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
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle px-4 py-2.5" data-row={row.id}>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-semibold text-ink-strong [overflow-wrap:anywhere]" dir="auto">{row.label}</span>
              {rows[row.id] === undefined && <span className="block text-2xs text-ink-muted">{c("notSet", language)}</span>}
            </span>
            <Stepper label={row.label} value={rows[row.id] ?? null} min={view.min} max={view.max} step={view.step} unit={view.unit} onChange={next => onChange({ ...rows, [row.id]: next })} />
          </div>
        ))}</div>
      );
    }
    case "row-tags": {
      const rows = (value ?? {}) as Record<string, string[]>;
      return (
        <div className="grid gap-3">{view.rows.map(row => (
          <div key={row.id} className="min-w-0 space-y-2 rounded-2xl border border-border-subtle bg-surface-subtle p-4" data-row={row.id}>
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-strong" dir="auto">{row.label}{(rows[row.id]?.length ?? 0) > 0 && <Badge variant="secondary"><Num value={rows[row.id].length} /></Badge>}</span>
            <TagList label={row.label} value={rows[row.id] ?? []} max={view.max} placeholder={view.placeholder} suggestions={row.suggestions} onChange={next => onChange({ ...rows, [row.id]: next })} />
          </div>
        ))}</div>
      );
    }
    case "table":
      return <TableField view={view} value={value} onChange={onChange} label={label} language={language} />;
    case "group":
      return <GroupField view={view} value={value} onChange={onChange} language={language} />;
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

function Panel({ title, icon: Icon, children, className, aside, ...props }: { title: string; icon?: LucideIcon; children: ReactNode; className?: string; aside?: ReactNode } & Record<`data-${string}`, unknown>) {
  return (
    <section className={cn("sk-panel space-y-3 p-4 sm:p-5", className)} data-static {...props}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-strong">{Icon && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-primary"><Icon className="size-4" aria-hidden /></span>}{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** What is left after Build, and for whom. Rows with and without links share one alignment. */
function RemainsList({ remains, language }: { remains: SheetView["remains"]; language: Lang }) {
  if (remains.length === 0) return <EmptyState size="sm" icon={CheckCircle2} title={c("nothingLeft", language)} />;
  return (
    <ul className="sk-stagger grid gap-2 text-sm">{remains.map((task, index) => (
      <li key={`${index}:${task.title}`} className="grid gap-2 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <span className="min-w-0 space-y-1">
          <span className="block font-semibold text-ink-strong [overflow-wrap:anywhere]" dir="auto">{task.title}</span>
          <Badge size="sm" variant="neutral" className="w-fit max-w-full"><span className="[overflow-wrap:anywhere]" dir="auto">{task.who}</span></Badge>
        </span>
        {task.link && <Link className={buttonVariants({ variant: "outline", size: "sm", className: "sk-nudge-trigger w-full sm:w-auto" })} href={task.link}>{t(UI, "openItsScreen", language)}<ArrowRight className="sk-nudge size-4 rtl:rotate-180" aria-hidden /></Link>}
      </li>
    ))}</ul>
  );
}

/** "What Build set up": the run's own steps in honest lanes, nothing guessed. */
function BuiltPanel({ run, language }: { run: RunView; language: Lang }) {
  const total = run.steps.length;
  const saved = run.steps.filter(step => DONE_STATES.has(step.state)).length;
  const byLane = new Map<Lane, RunView["steps"]>();
  for (const step of run.steps) byLane.set(STATE_LANE[step.state], [...(byLane.get(STATE_LANE[step.state]) ?? []), step]);
  return (
    <section className="sk-panel overflow-hidden" data-static data-ai-built>
      <div className="space-y-3 border-b border-border-subtle bg-gradient-to-br from-brand-50 to-transparent p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-white shadow-md"><ListChecks className="size-5" aria-hidden /></span>
          <h2 className="min-w-0 text-sm font-semibold text-ink-strong">{c("built", language)}</h2>
        </div>
        <Progress size="sm" tone="success" value={saved} max={Math.max(1, total)} label={c("built", language)} valueText={t(UI, "savedOf", language, saved, total)} showValue />
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {LANES.filter(lane => (byLane.get(lane.lane)?.length ?? 0) > 0).map(({ lane, icon: Icon, tile, label }) => {
          const steps = byLane.get(lane)!;
          return (
            <div key={lane} className="space-y-2" data-ai-lane={lane}>
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-strong">
                <span aria-hidden className={cn("inline-grid size-5 shrink-0 place-items-center rounded-lg", tile)}><Icon className="size-3" /></span>
                <span className="sk-eyebrow">{label()[language]}</span>
                <Badge size="sm" variant="neutral" className="ms-auto"><Num value={steps.length} /></Badge>
              </p>
              <ul className="space-y-1">{steps.map(step => (
                <li key={step.id} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1">
                  <StateNode state={step.state} size="sm" />
                  <TruncatedText text={step.title} lines={2} className="flex-1 text-sm text-ink-strong" />
                  {step.receipt?.link && DONE_STATES.has(step.state) && (
                    <Link href={step.receipt.link} aria-label={`${t(UI, "openRecord", language)}: ${step.title}`} className={buttonVariants({ variant: "ghost", size: "sm", className: "min-w-11 shrink-0 px-2" })}>
                      <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}</ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "Your week, built live" (design-ux, Slice 2). Short resumable sheets; every answer is saved as it is
 * given and the side panel shows what Build will set up (pending ghosts) before anything runs. Build
 * compiles confirmed answers without a model call; the Run Sheet then takes over. One component serves
 * every role's questionnaire; the role only changes the questions, the mark and the copy.
 */
export function RoleSetup({ questionnaireKey, homeHref, badge }: { questionnaireKey: string; homeHref: string; badge?: ReactNode }) {
  const { language } = useLocale();
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetView | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [initialRun, setInitialRun] = useState<RunView | null>(null);
  const [building, setBuilding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [askEdit, setAskEdit] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  // Back to the answers from a build: saving a change supersedes what still waits; what saved stays.
  const [editing, setEditing] = useState(false);
  const { run, busy, error, send } = useWorkflowRun(initialRun);
  const pending = useRef<{ answers: Record<string, unknown>; confirmed: string[] } | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | null>(null);
  const version = useRef(0);
  const firstLoad = useRef(true);
  const deferred = useRef(false);
  const focusHero = useRef(false);
  const top = useRef<HTMLDivElement | null>(null);
  const preview = useRef<HTMLElement | null>(null);
  const heroHeading = useRef<HTMLHeadingElement | null>(null);
  const sheetHeading = useRef<HTMLHeadingElement | null>(null);
  // The question the keyboard talks to (digits answer it, Enter moves on). Null follows the first open one.
  const [active, setActive] = useState<string | null>(null);
  const pendingScroll = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { sheet: next } = await call<{ sheet: SheetView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}?lang=${language}`);
    version.current = next.version;
    setSheet(next);
    // Answers still waiting to save (a stale reload, a failed save) stay on screen.
    setAnswers({ ...Object.fromEntries(next.questions.filter(question => question.value !== null).map(question => [question.key, question.value])), ...(pending.current?.answers ?? {}) });
    setConfirmed([...new Set([...next.questions.filter(question => question.confirmed).map(question => question.key), ...(pending.current?.confirmed ?? [])])]);
    if (next.run) setInitialRun(next.run);
    if (firstLoad.current) {
      firstLoad.current = false;
      // Smart resume, from server state only: the first step that still needs a required answer,
      // else one holding an unconfirmed prefilled answer, else the last step.
      const needs = next.questions.find(question => question.required && !question.confirmed)
        ?? next.questions.find(question => question.value !== null && !question.confirmed);
      setPage(needs ? needs.sheet : Math.max(0, next.sheets.length - 1));
      if (next.questions.some(question => question.confirmed) && !next.run) setResumed(true);
    }
  }, [questionnaireKey, language]);
  useEffect(() => { void load().catch(thrown => setProblem(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL")); }, [load]);

  const cardOf = (key: string) => document.querySelector<HTMLElement>(`[data-ai-question-key="${CSS.escape(key)}"]`);
  /** Brings a question into view and makes it the active one; from the keyboard, focus lands on its first control. */
  const focusQuestion = (key: string, viaKeyboard: boolean) => {
    setActive(key);
    const element = cardOf(key);
    if (!element) return;
    element.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    if (viaKeyboard) element.querySelector<HTMLElement>(FIRST_CONTROL)?.focus({ preventScroll: true });
  };
  /** Any question, on whichever step holds it. */
  const jumpTo = (key: string) => {
    const question = sheet?.questions.find(item => item.key === key);
    if (!question) return;
    if (question.sheet === page) { focusQuestion(key, true); return; }
    pendingScroll.current = key; setPage(question.sheet); setActive(key);
  };
  const jumpRef = useRef(jumpTo);
  useEffect(() => { jumpRef.current = jumpTo; });

  /**
   * Saves are serialised: a flush waits for the one in flight, then sends the latest answers. "Saved"
   * shows only when the server confirmed and nothing newer is waiting. A failed save keeps its answers.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    const work = pending.current;
    if (!work) return true;
    pending.current = null; setSaving("saving");
    const attempt = (async () => {
      try {
        const { version: next } = await call<{ version: number }>(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "PUT", body: JSON.stringify({ version: version.current, answers: work.answers, confirmedKeys: work.confirmed }) });
        version.current = next;
        const { sheet: fresh } = await call<{ sheet: SheetView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}?lang=${language}`);
        version.current = fresh.version; setSheet(fresh); setProblem(null); setFieldError(null);
        // A question that just started to apply (meeting details after hours) brings its defaults in.
        setAnswers(current => ({ ...Object.fromEntries(fresh.questions.filter(question => question.value !== null).map(question => [question.key, question.value])), ...current }));
        return true;
      } catch (thrown) {
        const code = thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL";
        // Keep the answers: anything newer wins over what failed.
        pending.current = { answers: { ...work.answers, ...(pending.current?.answers ?? {}) }, confirmed: pending.current?.confirmed ?? work.confirmed };
        setProblem(code);
        if (code === "INVALID_INPUT" && thrown instanceof SetupRequestError && thrown.field) {
          setFieldError(thrown.field);
          const field = thrown.field;
          window.setTimeout(() => jumpRef.current(field), 0);
        }
        if (code === "STALE_VERSION") await load().catch(() => undefined);
        return false;
      }
    })();
    inFlight.current = attempt;
    const ok = await attempt;
    if (inFlight.current === attempt) inFlight.current = null;
    setSaving(ok ? (pending.current === null ? "saved" : "dirty") : "failed");
    return ok && pending.current === null;
  }, [questionnaireKey, language, load]);

  // Quick taps arrive before a re-render, so confirmations accumulate in a ref, never from render state.
  const confirmedRef = useRef<string[]>([]);
  useEffect(() => { confirmedRef.current = confirmed; }, [confirmed]);
  const answer = (key: string, value: unknown) => {
    if (!confirmedRef.current.includes(key)) confirmedRef.current = [...confirmedRef.current, key];
    const nextConfirmed = confirmedRef.current;
    setAnswers(current => ({ ...current, [key]: value })); setConfirmed(nextConfirmed); setSaving("dirty");
    if (fieldError === key) setFieldError(null);
    pending.current = { answers: { ...(pending.current?.answers ?? {}), [key]: value }, confirmed: nextConfirmed };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; void flush(); }, 600);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const flushNow = async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    return flush();
  };

  const nextOpen = (key: string) => {
    const onPage = sheet?.questions.filter(question => question.sheet === page) ?? [];
    return onPage.slice(onPage.findIndex(question => question.key === key) + 1).find(question => !confirmedRef.current.includes(question.key)) ?? null;
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

  const focusSheet = useRef(false);
  const goTo = (next: number) => {
    setPage(next); setActive(null);
    focusSheet.current = true;
    if (sheet) setAnnounce(c("stepNamed", language, next + 1, sheet.sheets.length, sheet.sheets[next] ?? ""));
    top.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  const questions = useMemo(() => sheet?.questions.filter(question => question.sheet === page) ?? [], [sheet, page]);
  const missingRequired = sheet?.questions.filter(question => question.required && !confirmed.includes(question.key)) ?? [];
  const total = sheet?.willCreate.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const classTotals = useMemo(() => {
    const totals: Record<StepClass, number> = { A: 0, B: 0, C: 0, X: 0 };
    for (const item of sheet?.willCreate ?? []) totals[item.cls] += item.count;
    for (const item of sheet?.notConnected ?? []) totals.X += item.count;
    return totals;
  }, [sheet]);
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

  // One sentence per totals change, never the whole aside.
  const blueprintSentence = sheet ? c("buildSentence", language, total, classTotals.B, classTotals.C) : null;
  const [blueprintAnnounce, setBlueprintAnnounce] = useState<string | null>(null);
  const lastSentence = useRef<string | null>(null);
  useEffect(() => {
    if (blueprintSentence === null) return;
    if (lastSentence.current !== null && lastSentence.current !== blueprintSentence) setBlueprintAnnounce(blueprintSentence);
    lastSentence.current = blueprintSentence;
  }, [blueprintSentence]);
  // A changed count flashes once; the first paint never does.
  const seenCounts = useRef<Map<string, number> | null>(null);
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!sheet) return;
    const before = seenCounts.current;
    const now = new Map(sheet.willCreate.map(item => [item.capabilityKey, item.count]));
    if (before) setFlashing(new Set([...now].filter(([key, count]) => before.has(key) && before.get(key) !== count).map(([key]) => key)));
    seenCounts.current = now;
  }, [sheet]);

  // The run hero: honest headline, celebration only for a completion seen in this mount.
  const kind = heroKind(run);
  const celebrate = useSeenTransition(run ? `${run.id}|${kind}|${run.status}|${run.outcome}` : "idle", value => value === "idle" || value.endsWith("|ready|COMPLETED|EXECUTED"));
  useEffect(() => {
    if (focusHero.current && run && !editing) { focusHero.current = false; heroHeading.current?.focus({ preventScroll: true }); }
  }, [run, editing]);

  /** "Show me": the first required question still open, on whichever step holds it. */
  const jumpToMissing = () => { const first = missingRequired[0]; if (first) jumpTo(first.key); };
  useEffect(() => {
    const key = pendingScroll.current;
    if (key) {
      pendingScroll.current = null;
      const element = cardOf(key);
      element?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      element?.querySelector<HTMLElement>(FIRST_CONTROL)?.focus({ preventScroll: true });
      focusSheet.current = false;
      return;
    }
    if (focusSheet.current) { focusSheet.current = false; sheetHeading.current?.focus({ preventScroll: true }); }
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
    setBuilding(true);
    if (!(await flushNow())) { setBuilding(false); return; }
    setProblem(null);
    try {
      const { run: next } = await call<{ run: RunView }>(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "POST", body: JSON.stringify({ action: "build", version: version.current, language }) });
      focusHero.current = true; setInitialRun(next); setEditing(false);
    }
    catch (thrown) { setProblem(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL"); }
    finally { setBuilding(false); }
  };
  /** "Not now" saves what is waiting first, posts the deferral once and moves on without a full reload. */
  const defer = async () => {
    if (deferred.current) return;
    deferred.current = true; setLeaving(true);
    if (!(await flushNow())) { deferred.current = false; setLeaving(false); return; }
    await call(`/api/ai-workflows/questionnaire/${questionnaireKey}`, { method: "POST", body: JSON.stringify({ action: "defer" }) }).catch(() => undefined);
    router.push(homeHref);
  };

  const dir = language === "en" ? "ltr" : "rtl";
  const RoleIcon = ROLE_ICON[questionnaireKey] ?? Sparkles;
  if (!sheet) return problem
    ? <div className="mx-auto max-w-3xl" dir={dir}><ErrorState variant="page" className="mx-auto" description={errorWords(problem, language)} retryLabel={c("tryAgain", language)} onRetry={() => { setProblem(null); return load().catch(thrown => setProblem(thrown instanceof WorkflowRequestError ? thrown.code : "INTERNAL")); }} /></div>
    : (
      <div className="mx-auto max-w-6xl space-y-4" role="status" aria-busy="true" data-ai-setup-loading>
        <span className="sr-only">{c("loading", language)}</span>
        <Skeleton className="h-44 w-full rounded-3xl" /><div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><div className="space-y-4"><Skeleton className="h-40 w-full rounded-3xl" /><Skeleton className="h-40 w-full rounded-3xl" /></div><Skeleton className="h-64 w-full rounded-3xl" /></div>
      </div>
    );

  const tiles = sheet.board ?? [];
  const tileStage = (setup: string | null): { label: string; state: StepUiState } =>
    setup === null ? { label: c("tileSetupNONE", language), state: "planned" }
      : setup === "READY" ? { label: c("tileSetupREADY", language), state: "saved" }
      : setup === "NEW" ? { label: c("tileSetupNEW", language), state: "planned" }
      : setup === "DEFERRED" ? { label: c("tileSetupDEFERRED", language), state: "skipped" }
      : setup === "PARTIAL" ? { label: c("tileSetupPARTIAL", language), state: "needs_input" }
      : { label: c("tileSetupBUSY", language), state: "draft" };
  const tilesReady = tiles.filter(tile => tile.setup === "READY").length;
  const board = tiles.length ? (
    <Panel title={c("board", language)} icon={Network} data-ai-launch-board>
      <Progress size="sm" value={tilesReady} max={tiles.length} label={c("board", language)} valueText={c("boardProgress", language, tilesReady, tiles.length)} showValue />
      <ul className="sk-stagger space-y-2">{tiles.map(tile => {
        const stage = tileStage(tile.setup);
        const leader: StepUiState = tile.leader === "JOINED" ? "saved" : tile.leader === "INVITED" ? "handed_off" : "planned";
        const milestones: Array<{ key: string; label: string; state: StepUiState }> = [
          { key: "campus", label: c("tileCampus", language), state: "saved" },
          { key: "leader", label: c(`tileLeader${tile.leader}`, language), state: leader },
          { key: "setup", label: stage.label, state: stage.state },
        ];
        return (
          <li key={tile.campusId} data-ai-tile={tile.campusId} data-ai-tile-stage={tile.setup ?? "NO_LEADER"} className="space-y-2.5 rounded-2xl border border-border-subtle bg-surface-subtle p-3 text-sm">
            <p className="flex min-w-0 items-center gap-2 font-semibold text-ink-strong"><Building2 className="size-4 shrink-0 text-primary" aria-hidden /><TruncatedText text={tile.campus} className="flex-1" /></p>
            <ol className="sk-ai-rail gap-1.5" data-axis="inline">
              {milestones.flatMap((milestone, index) => [
                ...(index > 0 ? [<li key={`${milestone.key}-link`} data-part="link" data-done={milestone.state === "saved" || undefined} aria-hidden />] : []),
                <li key={milestone.key} className="flex min-w-0 shrink items-center gap-1.5"><StateNode state={milestone.state} size="sm" /><span className="text-2xs font-medium leading-tight text-ink-muted">{milestone.label}</span></li>,
              ])}
            </ol>
          </li>
        );
      })}</ul>
    </Panel>
  ) : null;

  const known = sheet.known.length > 0 ? (
    <Panel title={c("known", language)} icon={RoleIcon} data-ai-known>
      <dl className="grid gap-2 text-sm">{sheet.known.map((fact, index) => (
        <div key={`${index}:${fact.label}`} data-ai-fact={index} className="grid grid-cols-[minmax(0,40%)_1fr] items-baseline gap-3 rounded-xl bg-surface-subtle px-3 py-2">
          <dt className="text-ink-muted [overflow-wrap:anywhere]">{fact.label}</dt>
          <dd className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 text-end font-semibold text-ink-strong">
            <bdi className="min-w-0 [overflow-wrap:anywhere]">{fact.value}</bdi>
            {fact.editLink && <Link href={fact.editLink} aria-label={c("changeFact", language, fact.label)} className={buttonVariants({ variant: "link", size: "sm", className: "min-h-8 gap-1 px-1 py-0" })}>{c("change", language)}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>}
          </dd>
        </div>
      ))}</dl>
    </Panel>
  ) : null;

  const laneOrder: StepClass[] = ["A", "B", "C"];
  const laneSize: Record<StepClass, "short" | "long"> = { A: "long", B: "long", C: "short", X: "short" };
  const ghosts = (
    <aside ref={preview} className="scroll-mt-6 space-y-4 lg:sticky lg:top-6 lg:self-start" data-ai-ghosts>
      <section className="sk-panel overflow-hidden" data-static>
        <div className="flex items-center gap-3 border-b border-border-subtle bg-gradient-to-br from-brand-50 to-transparent p-4 sm:p-5">
          <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-white shadow-md"><Sparkles className="size-5" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-strong">{c("willCreate", language)}</h2>
            <p className="text-xs text-ink-muted"><span key={total} data-numeric className="sk-enter-scale inline-block text-lg font-extrabold text-primary">{shownTotal}</span> {c("items", language)}</p>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {sheet.willCreate.length === 0 ? <p className="text-sm text-ink-muted">{c("nothingYet", language)}</p> : laneOrder.filter(cls => sheet.willCreate.some(item => item.cls === cls)).map(cls => (
            <div key={cls} className="space-y-2" data-ai-lane={cls}>
              <p className="flex items-center gap-2">
                <ClassMark cls={cls} size={laneSize[cls]} language={language} />
                <Badge size="sm" variant="neutral" className="ms-auto"><Num value={classTotals[cls]} /></Badge>
              </p>
              <ul className="space-y-2">{sheet.willCreate.filter(item => item.cls === cls).map(item => (
                <li key={`${item.capabilityKey}:${item.count}`} data-ai-ghost={item.capabilityKey} className="sk-quiz-ghost flex items-start gap-2.5 rounded-xl p-3 text-sm">
                  <ClassGlyph cls={item.cls} className="mt-0.5" />
                  <span className="min-w-0 flex-1 font-semibold leading-snug text-ink-strong [overflow-wrap:anywhere]">{item.title}</span>
                  {item.count > 1 && <Badge size="sm" variant="outline" className={cn("shrink-0", flashing.has(item.capabilityKey) && "sk-ai-flash")}><bdi>× <Num value={item.count} /></bdi></Badge>}
                </li>
              ))}</ul>
            </div>
          ))}
          {sheet.notConnected.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-ink-muted" data-ai-not-connected>
              <ClassGlyph cls="X" />
              <span>{c("laterCount", language, "")}<Num value={classTotals.X} /></span>
              <InfoTip content={CLASS_WORDS.X.help[language]} label={CLASS_WORDS.X.short[language]} />
            </p>
          )}
        </div>
      </section>
      {sheet.remains.length > 0 && (
        <CollapsiblePanel icon={CalendarClock} title={c("afterBuild", language)} defaultOpen={false} data-ai-remains-preview>
          <div className="p-4 pt-0 sm:p-5 sm:pt-0"><RemainsList remains={sheet.remains} language={language} /></div>
        </CollapsiblePanel>
      )}
      {board}
      {known}
      <LiveAnnouncer message={blueprintAnnounce} />
    </aside>
  );

  if (run && !editing) {
    const lanes = laneCounts(run);
    const saved = run.steps.filter(step => DONE_STATES.has(step.state)).length;
    const needSomeone = lanes.waiting + lanes.withOwner + lanes.pending || run.steps.length - saved;
    const practice = run.steps.some(step => step.state === "practice");
    const stillMoving = lanes.waiting + lanes.pending > 0;
    const HeroIcon = kind === "ready" ? PartyPopper : kind === "mostly" ? Clock : kind === "nothing" ? Info : RoleIcon;
    const headline = kind === "ready" ? c("ready", language) : kind === "mostly" ? c("mostly", language, needSomeone) : kind === "nothing" ? c("nothingSaved", language) : sheet.title;
    const hint = kind === "ready" ? c("readyHint", language) : kind === "mostly" ? c("mostlyHint", language) : kind === "nothing" ? c("nothingSavedHint", language) : c("buildingHint", language);
    const startEdit = () => { setAskEdit(false); setEditing(true); setPage(0); };
    return (
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup-run data-ai-setup-outcome={run.outcome ?? run.status}>
        <div className="min-w-0 space-y-5">
          <header className="sk-ink-cover sk-enter space-y-4 p-6 sm:p-8" data-ai-celebrate={celebrate || undefined}>
            <span className="sk-quiz-orb" data-tone="brand" aria-hidden />
            <span className="sk-quiz-orb" data-tone="berry" aria-hidden />
            {badge ? <div className="flex flex-wrap items-center gap-2">{badge}</div> : null}
            <div className="flex flex-wrap items-center gap-5">
              <span className={cn("grid size-16 shrink-0 place-items-center rounded-3xl bg-white/10 ring-1 ring-white/20", celebrate && "sk-check-pop")} aria-hidden><HeroIcon className="size-8 text-brand-100" /></span>
              <div className="min-w-0 flex-1 space-y-2">
                <InkHeading as="h1" ref={heroHeading} tabIndex={-1} text={headline} swashKey={celebrate ? "celebrate" : "static"} className="text-3xl sm:text-4xl [overflow-wrap:anywhere]" />
                {kind === "progress" && <p className="text-sm font-semibold text-brand-100">{c("settingUp", language, saved, run.steps.length)}</p>}
                <p className="max-w-xl text-sm text-brand-100">{hint}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="w-full sm:w-auto" data-ai-edit-answers onClick={() => (stillMoving ? setAskEdit(true) : startEdit())}><Pencil aria-hidden />{c("edit", language)}</Button>
            </div>
          </header>
          {practice && <Alert tone="warning" title={t(UI, "practiceTitle", language)} data-ai-practice>{t(UI, "practiceTip", language)}</Alert>}
          <RunSheet key={run.id} chrome="compact" headingLevel={2} celebrate={false} run={run} language={language} busy={busy} error={error} onCommand={(body, clickKey) => void send(body, clickKey)} />
          <Panel title={c("remains", language)} icon={CalendarClock} data-ai-remains>
            <RemainsList remains={sheet.remains} language={language} />
          </Panel>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <BuiltPanel run={run} language={language} />
          {board}
          {known}
        </aside>
        <ConfirmAction open={askEdit} tone="warning" title={c("edit", language)} description={c("editGuard", language)} confirmLabel={c("edit", language)} onConfirm={startEdit} onCancel={() => setAskEdit(false)} />
      </div>
    );
  }

  const current = sheetState(page);
  const saveLine = (
    <p className="flex min-h-5 flex-wrap items-center gap-2 text-xs font-medium text-brand-100" role="status" data-ai-save-state={saving}>
      {saving === "dirty" && <><span className="size-2 rounded-full border border-brand-200" aria-hidden />{c("dirty", language)}</>}
      {saving === "saving" && <><span className="sk-quiz-live-dot" aria-hidden />{c("saving", language)}</>}
      {saving === "saved" && <><CheckCircle2 className="size-4 text-brand-200" aria-hidden />{c("saved", language)}</>}
      {saving === "failed" && <><AlertTriangle className="size-4 text-brand-200" aria-hidden />{c("saveFailed", language)} · <Button type="button" variant="link" size="sm" className="min-h-6 px-1 py-0 text-white underline" onClick={() => void flushNow()}>{c("tryAgain", language)}</Button></>}
    </p>
  );
  const footCaption = missingRequired.length > 0
    ? <p className="flex items-center gap-1 text-xs text-ink-muted">{c("requiredLeft", language, missingRequired.length)} · <Button type="button" variant="link" size="sm" className="min-h-6 px-1 py-0" onClick={jumpToMissing}>{c("showMe", language)}</Button></p>
    : total === 0
      ? <p className="text-xs text-ink-muted">{c("needAnswer", language)}</p>
      : <p className="max-w-sm text-end text-xs text-ink-muted">{c("laneCaption", language, classTotals.A, classTotals.B, classTotals.C)}</p>;
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]" dir={dir} data-ai-setup={sheet.key}>
      <div className="min-w-0 space-y-5" ref={top}>
        <header className="sk-ink-cover sk-enter space-y-5 p-5 sm:space-y-6 sm:p-8">
          <span className="sk-quiz-orb" data-tone="brand" aria-hidden />
          <span className="sk-quiz-orb" data-tone="berry" aria-hidden />
          <div className="flex items-start justify-between gap-4 sm:gap-5">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {ready ? (
                  <p className="sk-quiz-ready-chip sk-enter-scale inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"><CheckCircle2 className="size-3.5" aria-hidden />{c("readyChip", language)}</p>
                ) : (
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-100 ring-1 ring-white/15">
                    <RoleIcon className="size-3.5" aria-hidden />{c("eyebrow", language, questionCount, Math.max(2, Math.ceil(questionCount * 0.5)))}
                  </p>
                )}
                {badge}
              </div>
              <InkHeading text={sheet.title} className="text-3xl sm:text-4xl" />
              <p className="hidden max-w-xl text-sm leading-relaxed text-brand-100 sm:block">{c("intro", language)}</p>
            </div>
            <Ring value={answeredCount} total={questionCount} label={c("answered", language)} complete={missingRequired.length === 0} />
          </div>
          <ol className="-mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label={sheet.title}>{sheet.sheets.map((label, index) => {
            const state = sheetState(index);
            return (
              <li key={label} className="shrink-0 snap-start">
                <StepPill index={index} label={<><span aria-hidden>{label}</span><span className="sr-only">{c("stepNamed", language, index + 1, sheet.sheets.length, label)}{state.done ? ` ${c("completed", language)}` : ""}</span></>} meta={`${state.answered}/${state.count}`} current={index === page} done={state.done} onSelect={() => goTo(index)} />
              </li>
            );
          })}</ol>
          {saveLine}
        </header>
        {editing && run && (
          <Alert tone="info" actions={<Button type="button" size="sm" variant="outline" data-ai-back-to-run onClick={() => setEditing(false)}><ArrowLeft className="rtl:rotate-180" aria-hidden />{c("backToRun", language)}</Button>}>{c("editGuard", language)}</Alert>
        )}
        {resumed && !editing && <Alert tone="info" compact onDismiss={() => setResumed(false)}>{c("resumed", language)}</Alert>}
        {problem === "STALE_VERSION" && <Alert tone="warning">{c("stale", language)}</Alert>}
        {problem && problem !== "STALE_VERSION" && (
          <Alert tone="danger" data-ai-error={problem} actions={fieldError ? <Button type="button" size="sm" variant="link" onClick={() => jumpTo(fieldError)}>{c("goToAnswer", language)}</Button> : undefined}>{errorWords(problem, language)}</Alert>
        )}
        <h2 ref={sheetHeading} tabIndex={-1} className="sk-eyebrow scroll-mt-6 text-xs font-semibold text-ink-muted outline-none">{c("stepNamed", language, page + 1, sheet.sheets.length, sheet.sheets[page] ?? "")}</h2>
        <div key={page} className="space-y-4">{questions.map((question, index) => {
          const isConfirmed = confirmed.includes(question.key);
          const singleTap = question.view.kind === "choice";
          const isActive = question.key === activeKey;
          const hasError = fieldError === question.key;
          const prefilled = question.value !== null && !isConfirmed;
          return (
            <section key={question.key} data-ai-question-key={question.key} data-ai-confirmed={isConfirmed || undefined} data-answered={isConfirmed || undefined} data-active={isActive || undefined} data-ai-question-error={hasError || undefined}
              className={cn("sk-quiz-card sk-enter scroll-mt-6 space-y-4 p-4 sm:p-6", hasError && "sk-ai-attention border-status-error-border")} style={delay(Math.min(index, 8) * 60)} onFocusCapture={() => setActive(question.key)} onPointerDown={() => setActive(question.key)}>
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="sk-quiz-num" aria-hidden>{isConfirmed ? <Check className="size-5" strokeWidth={3} /> : String(numberOf(question.key)).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider", question.required ? "bg-brand-50 text-brand-700" : "bg-surface-subtle text-ink-muted")}>{c(question.required ? "required" : "optional", language)}</span>
                    {question.cls !== "A" && <Badge variant={question.cls === "B" ? "warning" : "info"} size="sm">{CLASS_WORDS[question.cls].short[language]}</Badge>}
                    {!question.connected && <Badge variant="neutral" size="sm">{CLASS_WORDS.X.short[language]}</Badge>}
                    {prefilled && <Badge variant="secondary" size="sm"><BadgeCheck aria-hidden />{c("fromRecords", language)}</Badge>}
                  </div>
                  <h3 className="text-base font-semibold leading-snug text-ink-strong sm:text-lg">{question.prompt}{question.required && <span className="sr-only"> ({c("required", language)})</span>}</h3>
                  {question.hint && <p className="flex items-start gap-1.5 text-sm text-ink-muted"><Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /><span>{question.hint}</span></p>}
                </div>
              </div>
              <Field view={question.view} label={question.prompt} language={language} hotkeys={isActive} invalid={hasError} value={answers[question.key]} onChange={value => { answer(question.key, value); if (singleTap) advanceFrom(question.key); }} />
              {hasError && <FieldError>{c("fieldError", language)}</FieldError>}
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
              {page > 0 && <Button type="button" variant="outline" data-ai-back onClick={() => goTo(page - 1)}><ArrowLeft className="rtl:rotate-180" aria-hidden />{c("back", language)}</Button>}
              <Button type="button" variant="ghost" data-ai-defer loading={leaving} onClick={() => void defer()}>{c("notNow", language)}</Button>
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
                {footCaption}
              </div>
            ) : <Button type="button" className="sk-nudge-trigger" data-ai-next onClick={() => goTo(page + 1)}>{c("next", language)}<ArrowRight className="sk-nudge rtl:rotate-180" aria-hidden /></Button>}
          </div>
        </footer>
        <LiveAnnouncer message={announce} />
      </div>
      {ghosts}
    </div>
  );
}
