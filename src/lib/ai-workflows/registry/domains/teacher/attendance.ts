import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canMarkAttendance } from "@/lib/api/scope";
import { schoolToday } from "@/lib/datetime";
import { SchoolAiError } from "@/lib/school-ai/access";
import { operationDate } from "@/lib/school-ai/school-operations";
import { previewAttendance } from "@/lib/school-ai/school-operations-service";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { slotsOf, versionsFor } from "@/lib/timetable/versions";
import { saveAttendanceRegister } from "@/lib/attendance/save-register-command";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { classRoster, resolvePupils, type Pupil } from "../../../resolve/pupils";
import { assignedClass, assignedClassWhere, classLabel } from "../../../resolve/scope";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Locale, PreviewModel } from "../../types";

/**
 * Teacher attendance (Slice 2). The flagship: "7B register: Ali and Sara absent" becomes a preview of
 * the two named pupils, and nobody else is marked unless the person presses "Mark the other N present"
 * (D12: `remaining` is a human field the planner never fills). Names are bound on the server against
 * the class roster; a quote that negates its status ("not absent", "غیر حاضر نہیں") is asked back.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (locale: Locale, copy: L10n, params: Record<string, string | number> = {}) => fill(copy[locale], params);

// The register write (attendanceSchema / attendanceProposalSchema) accepts these three only; LATE is
// an AttendanceStatus of the SKO-405 register (/api/attendance/register), not of this quick-mark path.
const STATUSES = ["PRESENT", "ABSENT", "LEAVE"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABEL: Record<Status, L10n> = {
  PRESENT: { en: "Present", ar: "حاضر", ur: "حاضر" },
  ABSENT: { en: "Absent", ar: "غائب", ur: "غیر حاضر" },
  LEAVE: { en: "On leave", ar: "إجازة", ur: "چھٹی" },
};

export const saveRegisterInput = z.strictObject({
  classId: z.string().min(1).max(64),
  date: operationDate,
  entries: z.array(z.strictObject({
    /** The user's words for the pupil ("Ali", "roll 12"); bound to `studentId` by the resolver. */
    student: z.string().trim().min(1).max(120),
    status: z.enum(STATUSES),
    /** The user's exact words about this pupil (evidence). */
    said: z.string().trim().min(1).max(500),
    /** Set only by the server resolver; the planner treats a model-written id as missing. */
    studentId: z.string().min(1).max(64).optional(),
  })).min(1).max(250),
  /** Only a person sets PRESENT, through the preview action; unmentioned pupils stay unmarked otherwise. */
  remaining: z.enum(["UNMARKED", "PRESENT"]).default("UNMARKED"),
});
export type SaveRegisterInput = z.output<typeof saveRegisterInput>;

// ── Negation guard ────────────────────────────────────────────────────────────────────────────────
// Status words per language as token sequences (after `normal`). Longest match first, so Urdu/Arabic
// "غیر حاضر" (absent) is one ABSENT phrase and its "غیر" is not read as a negation of "حاضر".
const PHRASES: Array<{ status: Status; words: string[] }> = ([
  ["ABSENT", ["غیر حاضر", "غیرحاضر", "غائب", "غائبة", "غائبا", "غياب", "absent", "away", "missing", "ghair hazir", "ghair haazir", "ghaib", "ghayab"]],
  ["PRESENT", ["حاضر", "حاضرة", "حاضرا", "موجود", "present", "here", "hazir", "haazir"]],
  ["LEAVE", ["چھٹی", "رخصت", "إجازة", "leave", "chutti", "chhutti"]],
] as Array<[Status, string[]]>).flatMap(([status, words]) => words.map(word => ({ status, words: tokenize(word) })))
  .sort((a, b) => b.words.length - a.words.length);
/** English and Arabic negate before the status word ("not absent", "ليس غائبا", "غير غائب"). */
const NEGATE_BEFORE = new Set(["not", "isn't", "isnt", "wasn't", "wasnt", "aren't", "arent", "weren't", "werent", "never", "ليس", "ليست", "لا", "لم", "غير"].map(word => normal(word)));
/** Urdu negates after it ("غیر حاضر نہیں", "غائب نہیں تھا", "ghair hazir nahi"). */
const NEGATE_AFTER = new Set(["نہیں", "نہ", "nahi", "nahin", "nai"].map(word => normal(word)));

function normal(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // harakat, superscript alef, tatweel
    // Arabic and Urdu letter forms fold together, so "غير" and "غیر", "نهیں" and "نہیں" compare equal.
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[ةه]/g, "ہ").replace(/[أإ]/g, "ا")
    .replace(/[‘’`´]/g, "'");
}
function tokenize(text: string) { return normal(text).split(/[^\p{L}\p{N}']+/u).filter(Boolean); }

/** Finds status phrases in a quote and whether each is negated. */
export function statusMentions(said: string): Array<{ status: Status; negated: boolean }> {
  const tokens = tokenize(said), found: Array<{ status: Status; negated: boolean }> = [];
  for (let index = 0; index < tokens.length;) {
    const phrase = PHRASES.find(item => item.words.every((word, offset) => tokens[index + offset] === word));
    if (!phrase) { index++; continue; }
    const end = index + phrase.words.length;
    // "is not on leave", "چھٹی پر نہیں": one filler word may sit between a negation and its status word.
    const before = tokens.slice(Math.max(0, index - 2), index), after = tokens.slice(end, end + 2);
    const negated = before.some(word => NEGATE_BEFORE.has(word)) || after.some(word => NEGATE_AFTER.has(word));
    found.push({ status: phrase.status, negated });
    index = end;
  }
  return found;
}

/**
 * True when the user's own words do not support the status: the status word is negated ("Sara is not
 * absent", "سارہ غیر حاضر نہیں", "سارة ليست غائبة"), or the words name only a different status.
 * "Ali not here" for ABSENT is consistent (a negated presence), so it passes.
 */
export function negatesStatus(said: string, status: Status): boolean {
  const mentions = statusMentions(said);
  const own = mentions.filter(item => item.status === status);
  if (own.some(item => item.negated)) return true;
  if (own.length) return false;
  // No word for this status: a plain, un-negated word for another status contradicts it.
  return mentions.some(item => !item.negated);
}

// ── Shared register reads ─────────────────────────────────────────────────────────────────────────
const dayInstant = (date: string) => new Date(`${date}T00:00:00Z`);

/** Maps the reviewed register's refusals to workflow codes; anything else is left to toWorkflowError. */
const REFUSALS = new Set(["SCHOOL_OPERATIONS_DATE", "SCHOOL_OPERATIONS_CALENDAR", "SCHOOL_OPERATIONS_YEAR", "SCHOOL_OPERATIONS_ENROLLMENT", "SCHOOL_OPERATIONS_REGISTER_LOCKED", "SCHOOL_OPERATIONS_SCOPE"]);
function domainError(error: unknown): never {
  if (error instanceof SchoolAiError && error.code && REFUSALS.has(error.code)) throw new WorkflowError("DOMAIN_REFUSED", { reason: error.code });
  if (error instanceof ApiError && error.status === 404) throw new WorkflowError("SCOPE_DENIED");
  throw error;
}

async function refuseFutureDay(ctx: CapabilityContext, campusId: string, date: string) {
  if (date > await schoolToday(ctx.user.schoolId, campusId)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FUTURE_DAY" });
}

interface RegisterPlan {
  cls: Awaited<ReturnType<typeof assignedClass>>;
  roster: Pupil[];
  existing: Array<{ id: string; studentId: string; status: string; version: number; isLocked: boolean }>;
  /** What will be written: the mentioned pupils, plus the unmarked rest only when `remaining` is PRESENT. */
  writes: Array<{ studentId: string; status: Status }>;
  /** Pupils neither mentioned nor already marked for the day. */
  rest: Pupil[];
}

/** Re-checks scope, day and the bound pupils, and works out exactly what a save would write. */
async function planRegister(ctx: CapabilityContext, input: SaveRegisterInput): Promise<RegisterPlan> {
  const cls = await assignedClass(ctx, input.classId);
  await refuseFutureDay(ctx, cls.campusId, input.date);
  const roster = await classRoster(ctx, cls.id);
  const onRoster = new Set(roster.map(pupil => pupil.id));
  if (input.entries.some(entry => !entry.studentId)) throw new WorkflowError("INVALID_INPUT");
  // A pupil who left the class (or a forged id) since binding: the person reviews again.
  if (input.entries.some(entry => !onRoster.has(entry.studentId!))) throw new WorkflowError("STALE_VERSION");
  const existing = await prisma.attendance.findMany({
    where: { schoolId: ctx.user.schoolId, date: dayInstant(input.date), studentId: { in: [...onRoster] } },
    select: { id: true, studentId: true, status: true, version: true, isLocked: true }, orderBy: { id: "asc" },
  });
  const mentioned = new Set(input.entries.map(entry => entry.studentId!));
  const marked = new Set(existing.map(row => row.studentId));
  const rest = roster.filter(pupil => !mentioned.has(pupil.id) && !marked.has(pupil.id));
  const writes = [
    ...input.entries.map(entry => ({ studentId: entry.studentId!, status: entry.status })),
    ...(input.remaining === "PRESENT" ? rest.map(pupil => ({ studentId: pupil.id, status: "PRESENT" as const })) : []),
  ];
  return { cls, roster, existing, writes, rest };
}

/** Classes this teacher reaches on their campus, with each register's counts for one day. */
async function registerStatus(ctx: CapabilityContext, date: string) {
  if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
  const classes = await prisma.class.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, archivedAt: null, ...assignedClassWhere(ctx.user) },
    select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }],
  });
  const students = classes.length ? await prisma.student.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, classId: { in: classes.map(cls => cls.id) }, status: "active", archivedAt: null },
    select: { id: true, classId: true },
  }) : [];
  const rows = students.length ? await prisma.attendance.findMany({
    where: { schoolId: ctx.user.schoolId, date: dayInstant(date), studentId: { in: students.map(student => student.id) } },
    select: { studentId: true, status: true },
  }) : [];
  const status = new Map(rows.map(row => [row.studentId, row.status]));
  return classes.map(cls => {
    const pupils = students.filter(student => student.classId === cls.id).map(student => status.get(student.id) ?? null);
    const count = (value: string) => pupils.filter(item => item === value).length;
    const marked = pupils.filter(Boolean).length;
    return { classId: cls.id, className: classLabel(cls), total: pupils.length, marked, unmarked: pupils.length - marked, present: count("PRESENT"), absent: count("ABSENT"), leave: count("LEAVE"), complete: pupils.length > 0 && marked === pupils.length };
  });
}
type RegisterRow = Awaited<ReturnType<typeof registerStatus>>[number];

const REGISTER_TEXT = {
  none: { en: "You have no assigned classes on this campus.", ar: "لا توجد لديك فصول مسندة في هذا الفرع.", ur: "اس کیمپس پر آپ کی کوئی کلاس تفویض نہیں ہے۔" },
  notMarked: { en: "{cls}: not marked yet ({total} pupils)", ar: "{cls}: لم يُسجَّل بعد ({total} طالبًا)", ur: "{cls}: ابھی حاضری نہیں لگی ({total} طلبہ)" },
  marked: { en: "{cls}: {present} present, {absent} absent, {leave} on leave", ar: "{cls}: {present} حاضر، {absent} غائب، {leave} إجازة", ur: "{cls}: {present} حاضر، {absent} غیر حاضر، {leave} چھٹی" },
  partial: { en: "{cls}: {marked} of {total} marked, {unmarked} still to mark", ar: "{cls}: سُجّل {marked} من {total}، وبقي {unmarked}", ur: "{cls}: {total} میں سے {marked} کی حاضری لگی، {unmarked} باقی" },
  day: { en: "Registers for {date}: ", ar: "سجلات {date}: ", ur: "{date} کے رجسٹر: " },
} satisfies Record<string, L10n>;
function registerSentence(locale: Locale, date: string, rows: RegisterRow[]) {
  if (!rows.length) return REGISTER_TEXT.none[locale];
  const parts = rows.map(row => {
    const params = { cls: row.className, total: row.total, marked: row.marked, unmarked: row.unmarked, present: row.present, absent: row.absent, leave: row.leave };
    if (!row.marked) return say(locale, REGISTER_TEXT.notMarked, params);
    return say(locale, row.complete ? REGISTER_TEXT.marked : REGISTER_TEXT.partial, params);
  });
  return say(locale, REGISTER_TEXT.day, { date }) + parts.join(locale === "en" ? "; " : "؛ ") + (locale === "ur" ? "۔" : ".");
}

const PREVIEW_TEXT = {
  title: { en: "{cls} register · {date}", ar: "سجل حضور {cls} · {date}", ur: "{cls} حاضری رجسٹر · {date}" },
  was: { en: "{status} (was {previous})", ar: "{status} (كان {previous})", ur: "{status} (پہلے {previous})" },
  others: { en: "Everyone else", ar: "بقية الطلاب", ur: "باقی طلبہ" },
  othersUnmarked: { en: "{n} not marked", ar: "{n} بلا تسجيل", ur: "{n} کی حاضری نہیں لگے گی" },
  othersPresent: { en: "{n} present", ar: "{n} حاضر", ur: "{n} حاضر" },
  restAction: { en: "Mark the other {n} present", ar: "سجّل الـ{n} الباقين حاضرين", ur: "باقی {n} کو حاضر لگائیں" },
  confirm: { en: "Save register · {present} present, {absent} absent", ar: "حفظ السجل · {present} حاضر، {absent} غائب", ur: "رجسٹر محفوظ کریں · {present} حاضر، {absent} غیر حاضر" },
  confirmLeave: { en: ", {leave} on leave", ar: "، {leave} إجازة", ur: "، {leave} چھٹی" },
  confirmUnmarked: { en: ", {unmarked} unmarked", ar: "، {unmarked} بلا تسجيل", ur: "، {unmarked} بغیر حاضری" },
} satisfies Record<string, L10n>;
const statusLabel = (locale: Locale, status: string) => (STATUS_LABEL as Record<string, L10n>)[status]?.[locale] ?? status;
const pupilName = (locale: Locale, pupil: Pupil) => locale === "ur" && pupil.nameUr ? pupil.nameUr : pupil.fullName;

const TEACHER_AND_OPERATORS = ["TEACHER", "ADMIN", "CAMPUS_ADMIN"] as const;

export const TEACHER_ATTENDANCE_ENTRIES: readonly CapabilityEntry[] = [
  defineCapability<SaveRegisterInput>({
    key: "attendance.mark_class", version: 1, cluster: "C5", inventoryKeys: ["attendance.mark_class"], risk: "CREATE", class: "B",
    roles: TEACHER_AND_OPERATORS,
    copy: {
      ...c(
        ["Save a class register", "Record who is absent or on leave in one of your classes for a day; pupils you don't name stay unmarked unless you choose to mark them present.", "7B register: Ali and Sara absent, Hamza on leave"],
        ["حفظ سجل الحضور", "تسجيل الغائبين ومن في إجازة في أحد فصولك ليوم محدد؛ من لا تذكره يبقى بلا تسجيل ما لم تختر تسجيله حاضرًا.", "سجل 7ب: علي وسارة غائبان، حمزة في إجازة"],
        ["کلاس کا حاضری رجسٹر محفوظ کریں", "اپنی کلاس میں کسی دن کے غیر حاضر اور چھٹی والے طلبہ درج کریں؛ جن کا نام نہ لیں ان کی حاضری نہیں لگتی جب تک آپ خود انہیں حاضر نہ کریں۔", "7B رجسٹر: علی اور سارہ غیر حاضر، حمزہ چھٹی پر"],
      ),
      questions: {
        "/date": { en: "Which day is this register for?", ar: "لأي يوم هذا السجل؟", ur: "یہ رجسٹر کس دن کا ہے؟" },
        "/entries": { en: "Which pupils are absent or on leave?", ar: "من الغائب أو في إجازة؟", ur: "کون سے طلبہ غیر حاضر یا چھٹی پر ہیں؟" },
      },
    },
    input: saveRegisterInput, // The date is shown on the preview the teacher saves; with no date said, the planner uses school today.
    evidence: ["/entries/*/said"], humanFields: ["remaining"],
    gates: [roles(TEACHER_AND_OPERATORS), predicate("canMarkAttendance", canMarkAttendance, TEACHER_AND_OPERATORS), ownCampus(), permission("attendance", "add")],
    scope: { kind: "assigned-class" }, limits: { maxItems: 250 },
    // Not convergent: a replay re-sends ATTENDANCE_SUBMITTED, and once rows exist the register write needs
    // attendance.edit, which teachers do not hold by default. The intent ledger reconciles instead.
    idempotency: { mode: "natural" },
    source: { route: "POST /api/attendance", service: "src/lib/attendance/save-register-command.ts:saveAttendanceRegister", reuse: "extracted" },

    async resolve(ctx, input) {
      const cls = await assignedClass(ctx, input.classId);
      const unclear: RequiredField[] = input.entries.flatMap((entry, index) => negatesStatus(entry.said, entry.status)
        ? [{ pointer: `/entries/${index}/said`, promptKey: "PUPIL_NEGATED", params: { index, status: entry.status } }] : []);
      let bound = new Map<string, Pupil>();
      try {
        bound = resolvePupils(await classRoster(ctx, cls.id), input.entries.map((entry, index) => ({ pointer: `/entries/${index}/student`, text: entry.student })));
      } catch (error) {
        if (!(error instanceof InputRequired)) throw error;
        unclear.push(...error.fields);
      }
      if (unclear.length) throw new InputRequired(unclear);
      // Ids are always re-bound from the user's words; an id already on the input is never trusted.
      return { ...input, classId: cls.id, entries: input.entries.map((entry, index) => ({ ...entry, studentId: bound.get(`/entries/${index}/student`)!.id })) };
    },

    async preview(ctx, input): Promise<PreviewModel> {
      const plan = await planRegister(ctx, input);
      // The reviewed register's own checks (holiday, weekend, year, enrollment, lock, edit permission), read-only.
      await schoolAiTransaction(ctx.user, tx => previewAttendance(ctx.user, { id: "ai-register-preview", version: 1, campusId: plan.cls.campusId, data: { proposal: { operation: "attendance.record_register", classId: plan.cls.id, date: input.date, entries: plan.writes, observationConfirmed: true } } as unknown as Prisma.JsonValue }, tx)).catch(domainError);
      const locale = ctx.locale, byId = new Map(plan.roster.map(pupil => [pupil.id, pupil]));
      const before = new Map(plan.existing.map(row => [row.studentId, row.status]));
      const final = new Map<string, string>(before);
      for (const write of plan.writes) final.set(write.studentId, write.status);
      const statuses = plan.roster.map(pupil => final.get(pupil.id) ?? null);
      const count = (value: string) => statuses.filter(item => item === value).length;
      const counts = { marked: statuses.filter(Boolean).length, unmarked: statuses.filter(item => !item).length, present: count("PRESENT"), absent: count("ABSENT"), leave: count("LEAVE") };
      const lines = input.entries.map(entry => {
        const status = statusLabel(locale, entry.status), previous = before.get(entry.studentId!);
        return { label: pupilName(locale, byId.get(entry.studentId!)!), value: previous && previous !== entry.status ? say(locale, PREVIEW_TEXT.was, { status, previous: statusLabel(locale, previous) }) : status };
      });
      if (plan.rest.length) lines.push({ label: PREVIEW_TEXT.others[locale], value: say(locale, input.remaining === "PRESENT" ? PREVIEW_TEXT.othersPresent : PREVIEW_TEXT.othersUnmarked, { n: plan.rest.length }) });
      const confirmLabel = say(locale, PREVIEW_TEXT.confirm, counts) + (counts.leave ? say(locale, PREVIEW_TEXT.confirmLeave, counts) : "") + (counts.unmarked ? say(locale, PREVIEW_TEXT.confirmUnmarked, counts) : "");
      return {
        title: say(locale, PREVIEW_TEXT.title, { cls: classLabel(plan.cls), date: input.date }),
        lines, counts, confirmLabel,
        ...(input.remaining === "UNMARKED" && plan.rest.length ? { actions: [{ id: "rest-present", label: say(locale, PREVIEW_TEXT.restAction, { n: plan.rest.length }), patch: { remaining: "PRESENT" }, expect: plan.rest.length }] } : {}),
        // A concurrent mark, edit or roster change alters the hash, so the person confirms again.
        basis: { roster: plan.roster.map(pupil => pupil.id), existing: plan.existing.map(row => [row.id, row.studentId, row.status, row.version, row.isLocked]) },
      };
    },

    async execute(ctx, input) {
      const plan = await planRegister(ctx, input);
      const saved = await saveAttendanceRegister(ctx.user, { classId: plan.cls.id, date: input.date, entries: plan.writes }, { notification: "await" }).catch(domainError);
      return {
        kind: "write", capability: "attendance.save_register", entities: saved.records.map(record => ({ model: "attendance", id: record.id })),
        counts: { saved: saved.summary.total, present: saved.summary.present, absent: saved.summary.absent, leave: saved.summary.leave, alerts: saved.absenceAlerts.length },
        link: ctx.user.role === "TEACHER" ? `/teacher/attendance?classId=${plan.cls.id}&date=${input.date}` : "/admin?view=attendance",
        replayed: false, detail: { classId: plan.cls.id, date: input.date, summary: saved.summary, absenceAlerts: saved.absenceAlerts.length },
      };
    },
  }),

  defineCapability<{ date?: string }>({
    key: "read.teacher.register_status", version: 1, cluster: "C5", inventoryKeys: ["read.teacher.register_status"], risk: "READ", class: "A", roles: ["TEACHER"],
    copy: c(
      ["Check my registers", "See which of your classes have their register marked for a day, with counts.", "Have I marked attendance for all my classes today?"],
      ["حالة سجلاتي", "اعرف أي فصولك سُجّل حضورها ليوم ما مع الأعداد.", "هل سجلت الحضور لكل فصولي اليوم؟"],
      ["میرے رجسٹر کی صورتحال", "دیکھیں کن کلاسوں کی حاضری لگ چکی ہے اور کتنے حاضر یا غیر حاضر ہیں۔", "کیا آج میری سب کلاسوں کی حاضری لگ گئی؟"],
    ),
    input: z.strictObject({ date: operationDate.optional() }), evidence: [],
    gates: [roles(["TEACHER"]), predicate("canMarkAttendance", canMarkAttendance, ["TEACHER"]), ownCampus(), permission("attendance", "view")],
    scope: { kind: "assigned-class" }, idempotency: { mode: "convergent" },
    source: { route: "GET /api/attendance", service: "src/lib/ai-workflows/registry/domains/teacher/attendance.ts:registerStatus", reuse: "direct" },
    async execute(ctx, input) {
      const date = input.date ?? await schoolToday(ctx.user.schoolId, ctx.campusId);
      const rows = await registerStatus(ctx, date);
      return {
        kind: "read", capability: "read.teacher.register_status", entities: rows.map(row => ({ model: "class", id: row.classId })),
        counts: { classes: rows.length, complete: rows.filter(row => row.complete).length, open: rows.filter(row => !row.complete).length },
        link: "/teacher/attendance", replayed: false, detail: { date, classes: rows, text: registerSentence(ctx.locale, date, rows) },
      };
    },
  }),

  defineCapability({
    key: "read.teacher.today", version: 1, cluster: "C5", inventoryKeys: ["read.teacher.today"], risk: "READ", class: "A", roles: ["TEACHER"],
    copy: c(
      ["My day", "Your lessons today from the published timetable, and which registers still need marking.", "What do I have today?"],
      ["يومي", "حصصك اليوم من الجدول المنشور، والسجلات التي لم تُسجَّل بعد.", "ماذا لدي اليوم؟"],
      ["میرا آج کا دن", "شائع شدہ ٹائم ٹیبل سے آج کے پیریڈ، اور کن رجسٹروں کی حاضری باقی ہے۔", "آج میرے کون سے پیریڈ ہیں؟"],
    ),
    input: z.strictObject({}), evidence: [],
    gates: [roles(["TEACHER"]), ownCampus()],
    scope: { kind: "self" }, idempotency: { mode: "convergent" },
    source: { route: "GET /api/timetable/teacher", service: "src/lib/timetable/versions.ts:versionsFor", reuse: "direct" },
    async execute(ctx) {
      if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
      const today = await schoolToday(ctx.user.schoolId, ctx.campusId);
      const weekday = dayInstant(today).getUTCDay() || 7; // timetable days run 1 (Mon) … 7 (Sun)
      // SKO-403: each class's published version in force today, never a working draft (as the route).
      const [boards, taught] = await Promise.all([
        prisma.timetable.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, status: "PUBLISHED" }, select: { id: true, class: { select: { id: true, name: true, section: true } } } }),
        prisma.subject.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, teacherId: ctx.user.userId }, select: { id: true } }),
      ]);
      const mine = new Set(taught.map(subject => subject.id));
      const lessons: Array<{ slotId: string; periodNumber: number; startTime: string; endTime: string; slotType: string; subject: string | null; classId: string; className: string; room: string | null }> = [];
      for (const board of boards) {
        const { inForce } = await versionsFor(board.id, today);
        for (const slot of slotsOf(inForce)) {
          if (slot.dayOfWeek !== weekday || (slot.teacherId !== ctx.user.userId && !(slot.subjectId && mine.has(slot.subjectId)))) continue;
          lessons.push({ slotId: slot.id, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, slotType: slot.slotType, subject: slot.subjectName, classId: board.class.id, className: classLabel(board.class), room: slot.roomNumber });
        }
      }
      lessons.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.periodNumber - b.periodNumber);
      const registers = await registerStatus(ctx, today);
      const locale = ctx.locale;
      const lessonText = lessons.length
        ? say(locale, { en: "Today you have {n} lessons: {list}.", ar: "لديك اليوم {n} حصص: {list}.", ur: "آج آپ کے {n} پیریڈ ہیں: {list}۔" }, { n: lessons.length, list: lessons.map(lesson => `${lesson.startTime} ${[lesson.subject, lesson.className].filter(Boolean).join(" · ")}`).join(locale === "en" ? ", " : "، ") })
        : say(locale, { en: "You have no lessons on the published timetable today.", ar: "لا توجد لديك حصص في الجدول المنشور اليوم.", ur: "شائع شدہ ٹائم ٹیبل میں آج آپ کا کوئی پیریڈ نہیں۔" });
      return {
        kind: "read", capability: "read.teacher.today", entities: lessons.map(lesson => ({ model: "timetableSlot", id: lesson.slotId })),
        counts: { lessons: lessons.length, registersOpen: registers.filter(row => !row.complete).length },
        link: "/teacher/timetable", replayed: false,
        detail: { date: today, lessons, registers, text: `${lessonText} ${registerSentence(locale, today, registers)}` },
      };
    },
  }),
];
