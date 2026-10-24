import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { schoolToday } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { attendanceForYear, summarizeAttendance } from "@/lib/attendance";
import { attendanceRuleFor } from "@/lib/attendance/rule";
import { listAssignments, saveDraft, submitWork } from "@/lib/assignments/service";
import { localToInstant } from "@/lib/assignments/rules";
import { addAction, requestAppointment, saveGoal } from "@/lib/pathways/service";
import { createEntry, editReflection, eligibleEvidence } from "@/lib/portfolio/service";
import { listSchoolAiExams } from "@/lib/school-ai/exam-service";
import { defineCapability } from "../../define";
import { permission, roles } from "../../gates";
import { InputRequired, WorkflowError } from "../../../errors";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Gate, L10n, Locale, Receipt } from "../../types";

/**
 * Student capabilities (Slice 4): the learner's own goals, counsellor requests, homework drafts and
 * submissions, portfolio entries, honest reads of their own work and attendance, and hand-offs for
 * what someone else decides (a message to a teacher, a record the office must correct).
 *
 * - Every entry is keyed to the caller's own Student row (studentUserId); no input ever names a
 *   student, and an id of someone else's record is SCOPE_DENIED at resolve and again at execute.
 * - While the learner has an online exam attempt in progress, every entry is refused, mirroring the
 *   study assistant (src/lib/study/assistant.ts activeExam).
 * - Draft and reflection text is the learner's own words, quoted verbatim (evidence pointers).
 * - Outcomes are honest: a goal is "private", an appointment "requested", a portfolio entry "sent
 *   for teacher review"; a mark or record correction becomes an office task, never a correction row.
 *
 * `study.ask` is not defined here: free study questions are answered by the planner's existing
 * `assistant.answer` step (registry/domains/tools.ts).
 */
const STUDENT = ["STUDENT"] as const;
const OFFICE = ["CAMPUS_ADMIN", "ADMIN"] as const;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "Use a real date.");
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.");
/** Mirrors src/lib/chat/service.ts MAX_MESSAGE_LENGTH (not imported: that module opens the realtime client). */
const MAX_MESSAGE_LENGTH = 4000;
const PORTFOLIO_LINK = "/student/portfolio";
const WORK_LINK = "/student/assignments";

function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale];
const fill = (locale: Locale, text: L10n, params: Record<string, string | number>) => text[locale].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
const list = (locale: Locale, items: string[]) => items.join(locale === "en" ? "; " : "؛ ");

const receipt = (kind: Receipt["kind"], capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string, detail?: Record<string, unknown>): Receipt =>
  ({ kind, capability, entities, counts, link, replayed: false, ...(detail ? { detail } : {}) });

const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Exact id, then exact title, then every typed word contained in the title. */
function matchTitled<T extends { id: string; title: string }>(rows: readonly T[], text: string): T[] {
  const byId = rows.filter(row => row.id === text.trim());
  if (byId.length) return byId;
  const wanted = fold(text);
  if (!wanted) return [];
  const exact = rows.filter(row => fold(row.title) === wanted);
  if (exact.length) return exact;
  const words = wanted.split(" ");
  return rows.filter(row => { const title = fold(row.title); return words.every(word => title.includes(word)); });
}

// ─── The learner ──────────────────────────────────────────────────

/** The caller's own Student row (pathways ownStudent / study learnerOf). Nothing the model wrote picks it. */
async function ownLearner(ctx: CapabilityContext) {
  if (ctx.user.role !== "STUDENT") throw new WorkflowError("SCOPE_DENIED");
  const student = await prisma.student.findFirst({
    where: { schoolId: ctx.user.schoolId, studentUserId: ctx.user.userId, archivedAt: null },
    select: { id: true, classId: true, campusId: true, class: { select: { academicYear: true, classTeacherId: true } } },
  });
  if (!student) throw new WorkflowError("SCOPE_DENIED");
  return student;
}

/** Mirrors `ownStudent` (pathways) and `learnerOf` (study): only a learner with their own live record. */
const learnerGate: Gate = {
  id: "scope:own-learner", provenance: ["ownStudent", "learnerOf", "studentScope"],
  async check(ctx) {
    if (ctx.user.role !== "STUDENT") return { ok: false, code: "ROLE", whoCan: STUDENT };
    const found = await prisma.student.count({ where: { schoolId: ctx.user.schoolId, studentUserId: ctx.user.userId, archivedAt: null } });
    return found ? { ok: true } : { ok: false, code: "SCOPE" };
  },
};
const GATES = [roles(STUDENT), learnerGate] as const;

/** Mirrors the study assistant's activeExam: nothing runs for a learner while an online exam attempt is open. */
async function examGuard(ctx: CapabilityContext) {
  const exams = await listSchoolAiExams(ctx.user).catch(() => [] as Awaited<ReturnType<typeof listSchoolAiExams>>);
  for (const exam of exams) {
    const attempt = "attempts" in exam && Array.isArray(exam.attempts) ? exam.attempts[0] as { status: string } | undefined : undefined;
    if (attempt?.status === "IN_PROGRESS" && exam.endsAt > ctx.now) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EXAM_IN_PROGRESS" });
  }
}

/** An id the model or a person supplied that is a real record of this school but not the learner's own. */
async function foreignId(text: string | undefined, exists: (id: string) => Promise<unknown>) {
  const id = text?.trim();
  if (id && /^[0-9a-f-]{20,64}$/i.test(id) && await exists(id)) throw new WorkflowError("SCOPE_DENIED");
}

// ─── Goals ────────────────────────────────────────────────────────

const ownGoals = (ctx: CapabilityContext, studentId: string) => prisma.pathwayGoal.findMany({
  where: { schoolId: ctx.user.schoolId, studentId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" }, take: 100,
});
type Goal = Awaited<ReturnType<typeof ownGoals>>[number];

/** One of the learner's own goals, named by title (or chosen by id in an answer). */
async function bindGoal(ctx: CapabilityContext, text: string | undefined, pointer: string): Promise<Goal> {
  const learner = await ownLearner(ctx);
  const goals = await ownGoals(ctx, learner.id);
  if (!goals.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_GOAL" });
  const found = text?.trim() ? matchTitled(goals, text) : goals.length === 1 ? goals : [];
  if (found.length === 1) return found[0];
  if (!found.length) await foreignId(text, id => prisma.pathwayGoal.findFirst({ where: { id, schoolId: ctx.user.schoolId }, select: { id: true } }));
  throw new InputRequired([found.length
    ? { pointer, promptKey: "GOAL_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(goal => ({ value: goal.id, label: goal.title })) }
    : { pointer, promptKey: text?.trim() ? "GOAL_NOT_FOUND" : "GOAL_REQUIRED", options: goals.slice(0, 8).map(goal => ({ value: goal.id, label: goal.title })) }]);
}

/** Re-checks a bound goal id at execute: it must still be the learner's own, live goal. */
async function ownGoal(ctx: CapabilityContext, goalId: string | undefined) {
  const learner = await ownLearner(ctx);
  const goal = goalId ? await prisma.pathwayGoal.findFirst({ where: { id: goalId, schoolId: ctx.user.schoolId, studentId: learner.id, status: { not: "ARCHIVED" } } }) : null;
  if (!goal) throw new WorkflowError("SCOPE_DENIED");
  return goal;
}

const AUDIENCE = z.enum(["COUNSELLOR", "GUARDIAN"]);
type Audience = z.infer<typeof AUDIENCE>;
const sortedAudience = (values: readonly string[]) => [...new Set(values)].sort() as Audience[];
const audienceWords = (ctx: CapabilityContext, audience: readonly string[]) => audience.length
  ? audience.map(value => say(ctx, value === "COUNSELLOR" ? l("My counsellor", "مرشدي", "میرا کونسلر") : l("My parent", "ولي أمري", "میرے والدین"))).join(ctx.locale === "en" ? ", " : "، ")
  : say(ctx, l("Only me", "أنا فقط", "صرف میں"));

const goalSchema = z.strictObject({
  title: z.string().trim().min(3).max(160),
  detail: z.string().trim().max(1000).optional(),
  reviewOn: DATE.optional(),
});
type GoalInput = z.infer<typeof goalSchema>;

const actionSchema = z.strictObject({ goal: z.string().trim().min(1).max(160).optional(), title: z.string().trim().min(3).max(200), dueOn: DATE });
type ActionInput = z.infer<typeof actionSchema> & { goalId?: string };

const shareSchema = z.strictObject({ goal: z.string().trim().min(1).max(160).optional(), audience: z.array(AUDIENCE).max(2) });
type ShareInput = z.infer<typeof shareSchema> & { goalId?: string };

// ─── Counsellor appointments ──────────────────────────────────────

const appointmentSchema = z.strictObject({
  counsellor: z.string().trim().min(1).max(120).optional(),
  date: DATE, time: TIME,
  minutes: z.number().int().min(10).max(120).optional(),
});
type AppointmentInput = z.infer<typeof appointmentSchema> & { counsellorId?: string; startsAt?: string };

async function designatedCounsellors(ctx: CapabilityContext, campusId: string) {
  const rows = await prisma.pathwayCounsellor.findMany({ where: { schoolId: ctx.user.schoolId, campusId, revokedAt: null }, select: { userId: true } });
  const users = rows.length ? await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, id: { in: rows.map(row => row.userId) }, isActive: true }, select: { id: true, fullName: true } }) : [];
  return users.map(user => ({ id: user.id, title: user.fullName ?? "" }));
}

/** Binds a designated counsellor of the learner's campus and a future school-local start time. */
async function bindAppointment(ctx: CapabilityContext, input: AppointmentInput) {
  const learner = await ownLearner(ctx);
  const counsellors = await designatedCounsellors(ctx, learner.campusId);
  if (!counsellors.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_COUNSELLOR" });
  const wanted = input.counsellorId ?? input.counsellor;
  const found = wanted ? matchTitled(counsellors, wanted) : counsellors.length === 1 ? counsellors : [];
  if (found.length !== 1) throw new InputRequired([{
    pointer: "/counsellor", promptKey: found.length ? "COUNSELLOR_AMBIGUOUS" : wanted ? "COUNSELLOR_NOT_FOUND" : "COUNSELLOR_REQUIRED",
    options: (found.length ? found : counsellors).slice(0, 8).map(row => ({ value: row.id, label: row.title })),
  }]);
  const { timezone } = await getLocalePackage(ctx.user.schoolId, learner.campusId);
  let startsAt: Date;
  try { startsAt = localToInstant(`${input.date}T${input.time}`, timezone); } catch { throw new InputRequired([{ pointer: "/time", promptKey: "TIME_INVALID" }]); }
  if (startsAt <= ctx.now) throw new InputRequired([{ pointer: "/date", promptKey: "DATE_IN_PAST" }]);
  return { learner, counsellor: found[0], startsAt, minutes: input.minutes ?? 30 };
}

// ─── Homework ─────────────────────────────────────────────────────

type LearnerList = Extract<Awaited<ReturnType<typeof listAssignments>>, { mode: "learner" | "guardian" }>;
type Work = LearnerList["assignments"][number];

/** The learner's own released work, exactly as the Work screen lists it (listAssignments). */
async function ownWork(ctx: CapabilityContext): Promise<Work[]> {
  await ownLearner(ctx);
  const result = await listAssignments(ctx.user, {}, ctx.now);
  if (result.mode !== "learner") throw new WorkflowError("SCOPE_DENIED");
  return result.assignments;
}

const dueOf = (work: Work) => (work.extension?.dueLocal ?? work.dueLocal ?? "").replace("T", " ");

async function bindWork(ctx: CapabilityContext, text: string, pointer: string): Promise<Work> {
  const rows = await ownWork(ctx);
  const found = matchTitled(rows, text);
  if (found.length === 1) return found[0];
  if (!found.length) await foreignId(text, id => prisma.assignment.findFirst({ where: { id, schoolId: ctx.user.schoolId }, select: { id: true } }));
  throw new InputRequired([found.length
    ? { pointer, promptKey: "ASSIGNMENT_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.id, label: `${row.title} · ${dueOf(row)}` })) }
    : { pointer, promptKey: "ASSIGNMENT_NOT_FOUND" }]);
}

/** Re-checks a bound assignment id at execute against the learner's own list. */
async function ownWorkById(ctx: CapabilityContext, assignmentId: string | undefined) {
  const row = assignmentId ? (await ownWork(ctx)).find(work => work.id === assignmentId) : undefined;
  if (!row) throw new WorkflowError("SCOPE_DENIED");
  return row;
}

const wordsIn = (text: string) => text.trim() ? text.trim().split(/\s+/u).length : 0;

/** Why this work cannot be submitted now, in the domain's own terms (submitWork's checks, read ahead). */
function submitRefusal(work: Work): string | null {
  if (work.submissionMode === "PAPER") return "PAPER_ONLY";
  if (!work.canEditDraft) return work.state === "RETURNED" ? "RETURNED_ASK_TEACHER" : "NOT_OPEN";
  if (!work.canSubmit) return "LATE_NOT_ACCEPTED";
  const file = work.draft?.file;
  if (file && !file.ready) return "FILE_NOT_UPLOADED";
  if (!work.draft?.text?.trim() && !file) return "NO_DRAFT";
  return null;
}

const draftSchema = z.strictObject({ assignment: z.string().trim().min(1).max(160), text: z.string().trim().min(1).max(20000) });
type DraftInput = z.infer<typeof draftSchema> & { assignmentId?: string };
const submitSchema = z.strictObject({ assignment: z.string().trim().min(1).max(160) });
type SubmitInput = z.infer<typeof submitSchema> & { assignmentId?: string };

const STATE_WORD: Record<string, L10n> = {
  OPEN: l("not started", "لم يبدأ", "شروع نہیں ہوا"),
  DRAFT: l("draft saved", "مسودة محفوظة", "مسودہ محفوظ ہے"),
  SUBMITTED: l("submitted", "مُسلَّم", "جمع ہو گیا"),
  RETURNED: l("feedback returned", "أُعيد مع الملاحظات", "رائے کے ساتھ واپس"),
  REOPENED: l("reopened for a new version", "أُعيد فتحه لنسخة جديدة", "نئے ورژن کے لیے دوبارہ کھلا"),
  CLOSED: l("closed", "مغلق", "بند"),
};

// ─── Portfolio ────────────────────────────────────────────────────

const portfolioSchema = z.strictObject({
  assignment: z.string().trim().min(1).max(160),
  reflection: z.string().trim().min(10).max(3000),
  goal: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(160).optional(),
});
type PortfolioInput = z.infer<typeof portfolioSchema> & { earlierVersionId?: string; laterVersionId?: string | null; outcomeId?: string | null; assignmentTitle?: string };

/**
 * The evidence the portfolio screen offers the learner (eligibleEvidence): their first attempt at the
 * named homework whose feedback was returned, and their latest later revision if there is one.
 */
async function bindPortfolio(ctx: CapabilityContext, input: PortfolioInput): Promise<PortfolioInput> {
  await ownLearner(ctx);
  const { attempts } = await eligibleEvidence(ctx.user, null);
  const returned = [...new Map(attempts.filter(row => row.hasFeedback).map(row => [row.assignmentId, { id: row.assignmentId, title: row.title }])).values()];
  const named = matchTitled(returned, input.assignment);
  if (named.length !== 1) {
    if (!named.length) {
      await foreignId(input.assignment, id => prisma.assignment.findFirst({ where: { id, schoolId: ctx.user.schoolId }, select: { id: true } }));
      if (!returned.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_RETURNED_FEEDBACK" });
    }
    throw new InputRequired([{ pointer: "/assignment", promptKey: named.length ? "ASSIGNMENT_AMBIGUOUS" : "ASSIGNMENT_NOT_FOUND", options: (named.length ? named : returned).slice(0, 8).map(row => ({ value: row.id, label: row.title })) }]);
  }
  const mine = attempts.filter(row => row.assignmentId === named[0].id);
  const earlier = mine.find(row => row.hasFeedback)!;
  const later = [...mine].reverse().find(row => row.id !== earlier.id && +new Date(row.submittedAt) > +new Date(earlier.submittedAt)) ?? null;
  let outcomeId: string | null = null;
  if (earlier.goals.length) {
    const wanted = input.goal ? fold(input.goal) : "";
    const chosen = earlier.goals.length === 1 ? earlier.goals : earlier.goals.filter(goal => goal.id === input.goal || (wanted && (fold(goal.title).includes(wanted) || (goal.code && fold(goal.code) === wanted))));
    if (chosen.length !== 1) throw new InputRequired([{ pointer: "/goal", promptKey: "GOAL_REQUIRED", options: earlier.goals.slice(0, 8).map(goal => ({ value: goal.id, label: [goal.code, goal.title].filter(Boolean).join(" · ") })) }]);
    outcomeId = chosen[0].id;
  }
  return { ...input, earlierVersionId: earlier.id, laterVersionId: later?.id ?? null, outcomeId, assignmentTitle: earlier.title || named[0].title };
}

/** An entry the learner already made from exactly this evidence (not removed). */
async function sameEntry(ctx: CapabilityContext, studentId: string, input: PortfolioInput) {
  return prisma.portfolioEntry.findFirst({ where: { schoolId: ctx.user.schoolId, studentId, earlierVersionId: input.earlierVersionId, laterVersionId: input.laterVersionId ?? null, removedAt: null }, select: { id: true, status: true, version: true } });
}

// ─── Help from a teacher ──────────────────────────────────────────

const helpSchema = z.strictObject({
  message: z.string().trim().min(3).max(MAX_MESSAGE_LENGTH),
  teacher: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(120).optional(),
});
type HelpInput = z.infer<typeof helpSchema> & { teacherId?: string };

/** Teachers of the learner's own class: the class teacher and each subject's teacher (chat policy's teacherSharesStudent). */
async function myTeachers(ctx: CapabilityContext) {
  const learner = await ownLearner(ctx);
  if (!learner.classId) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_CLASS" });
  const subjects = await prisma.subject.findMany({ where: { schoolId: ctx.user.schoolId, classId: learner.classId, teacherId: { not: null } }, select: { name: true, teacherId: true }, orderBy: { name: "asc" } });
  const ids = [...new Set([learner.class?.classTeacherId, ...subjects.map(row => row.teacherId)].filter((id): id is string => !!id))];
  const users = ids.length ? await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, id: { in: ids }, isActive: true }, select: { id: true, fullName: true } }) : [];
  return users.map(user => ({
    id: user.id, title: user.fullName ?? "",
    classTeacher: user.id === learner.class?.classTeacherId,
    subjects: subjects.filter(row => row.teacherId === user.id).map(row => row.name),
  }));
}
type Teacher = Awaited<ReturnType<typeof myTeachers>>[number];
const teacherLabel = (row: Teacher) => [row.title, ...row.subjects].filter(Boolean).join(" · ");

async function bindTeacher(ctx: CapabilityContext, input: HelpInput): Promise<Teacher> {
  const teachers = await myTeachers(ctx);
  if (!teachers.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_TEACHER" });
  if (input.teacherId) {
    const bound = teachers.find(row => row.id === input.teacherId);
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  let found: Teacher[] = [];
  if (input.teacher) {
    found = matchTitled(teachers, input.teacher);
    if (!found.length) await foreignId(input.teacher, id => prisma.user.findFirst({ where: { id, schoolId: ctx.user.schoolId }, select: { id: true } }));
  } else if (input.subject) {
    const wanted = fold(input.subject);
    found = teachers.filter(row => row.subjects.some(name => fold(name) === wanted || fold(name).includes(wanted)));
  } else {
    found = teachers.filter(row => row.classTeacher);
    if (!found.length && teachers.length === 1) found = teachers;
  }
  if (found.length === 1) return found[0];
  throw new InputRequired([{ pointer: "/teacher", promptKey: found.length ? "TEACHER_AMBIGUOUS" : "TEACHER_REQUIRED", options: (found.length ? found : teachers).slice(0, 8).map(row => ({ value: row.id, label: teacherLabel(row) })) }]);
}

// ─── Corrections → office task ────────────────────────────────────

const correctionSchema = z.strictObject({
  /** The learner's own words: what is wrong with their mark or record. */
  request: z.string().trim().min(5).max(500),
  topic: z.enum(["MARK", "ATTENDANCE", "PROFILE", "OTHER"]).default("OTHER"),
  subject: z.string().trim().min(1).max(120).optional(),
});
type CorrectionInput = z.infer<typeof correctionSchema>;
const CORRECTION_LINK: Record<CorrectionInput["topic"], string> = {
  MARK: "/corrections", ATTENDANCE: "/admin?view=attendance", PROFILE: "/admin?view=students", OTHER: "/admin?view=students",
};

// ─── Reads ────────────────────────────────────────────────────────

const workReadSchema = z.strictObject({ which: z.enum(["DUE_THIS_WEEK", "OPEN", "ALL"]).optional() });
const attendanceReadSchema = z.strictObject({ period: z.enum(["THIS_MONTH", "THIS_YEAR"]).optional(), month: MONTH.optional() });

export const STUDENT_ENTRIES: readonly CapabilityEntry[] = [
  defineCapability<GoalInput>({
    key: "pathways.save_goal_private", version: 1, cluster: "C3", inventoryKeys: ["pathways.save_goal"], risk: "CREATE", roles: STUDENT, class: "A",
    classOverride: "Saves the learner's own goal with no audience: only the learner sees it until they confirm sharing it.",
    input: goalSchema, evidence: ["/title"], gates: GATES, scope: { kind: "self" },
    copy: c(["Save a private goal", "Save a goal for yourself; only you can see it until you choose to share it with your counsellor or parent.", "Add a goal: raise my maths mark to 80% before the final exams"],
      ["حفظ هدف خاص", "احفظ هدفاً لنفسك؛ لا يراه أحد غيرك حتى تختار مشاركته مع مرشدك أو ولي أمرك.", "أضف هدفاً: أريد أن أرفع درجتي في الرياضيات إلى ٨٠٪ قبل الامتحانات النهائية"],
      ["ذاتی ہدف محفوظ کریں", "اپنے لیے ہدف محفوظ کریں؛ جب تک آپ کونسلر یا والدین کے ساتھ شیئر نہ کریں، صرف آپ دیکھ سکیں گے۔", "ہدف شامل کریں: فائنل امتحان سے پہلے ریاضی میں 80 فیصد نمبر لینے ہیں"]),
    idempotency: { mode: "natural" }, source: { route: "POST /api/pathways (action=goal)", service: "src/lib/pathways/service.ts:saveGoal", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      await ownLearner(ctx);
      return input;
    },
    async execute(ctx, input) {
      await examGuard(ctx);
      const learner = await ownLearner(ctx);
      // No idempotency key in the domain: the same live goal title is reconciled, never saved twice.
      const existing = (await ownGoals(ctx, learner.id)).find(goal => fold(goal.title) === fold(input.title));
      if (existing) return receipt("write", "pathways.save_goal_private", [{ model: "pathwayGoal", id: existing.id }], { created: 0 }, PORTFOLIO_LINK, { reconciled: true, audience: existing.audience });
      const goal = await saveGoal(ctx.user, { title: input.title, ...(input.detail ? { detail: input.detail } : {}), audience: [], nextReviewOn: input.reviewOn ?? null });
      return receipt("write", "pathways.save_goal_private", [{ model: "pathwayGoal", id: goal.id }], { created: 1 }, PORTFOLIO_LINK, { audience: goal.audience, outcome: "PRIVATE" });
    },
  }),

  defineCapability<ActionInput>({
    key: "pathways.add_action", version: 1, cluster: "C3", inventoryKeys: ["pathways.add_action"], risk: "CREATE", roles: STUDENT, class: "A",
    classOverride: "Adds the learner's own next step, owned by the learner, to one of their own goals; it is seen only by whoever the goal is already shared with.",
    input: actionSchema as z.ZodType<ActionInput>, evidence: ["/title", "/dueOn"], gates: GATES, scope: { kind: "self" }, humanFields: ["goalId"],
    copy: c(["Add a step to my goal", "Add your next step, with a date, to one of your goals.", "For my maths goal: finish the fractions worksheet by Friday"],
      ["إضافة خطوة إلى هدفي", "أضف خطوتك التالية مع موعد إلى أحد أهدافك.", "لهدف الرياضيات: أنهي ورقة الكسور قبل الجمعة"],
      ["ہدف میں قدم شامل کریں", "اپنے کسی ہدف میں اگلا قدم تاریخ کے ساتھ شامل کریں۔", "ریاضی والے ہدف کے لیے: جمعہ تک کسور کی ورک شیٹ مکمل کرنی ہے"]),
    idempotency: { mode: "natural" }, source: { route: "POST /api/pathways (action=action)", service: "src/lib/pathways/service.ts:addAction", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const goal = await bindGoal(ctx, input.goalId ?? input.goal, "/goal");
      const learner = await ownLearner(ctx);
      if (input.dueOn < await schoolToday(ctx.user.schoolId, learner.campusId)) throw new InputRequired([{ pointer: "/dueOn", promptKey: "DATE_IN_PAST" }]);
      return { ...input, goalId: goal.id };
    },
    async execute(ctx, input) {
      await examGuard(ctx);
      const goal = await ownGoal(ctx, input.goalId);
      const dueOn = new Date(`${input.dueOn}T00:00:00Z`);
      const existing = (await prisma.pathwayAction.findMany({ where: { schoolId: ctx.user.schoolId, goalId: goal.id, studentId: goal.studentId, dueOn }, select: { id: true, title: true } })).find(row => fold(row.title) === fold(input.title));
      if (existing) return receipt("write", "pathways.add_action", [{ model: "pathwayAction", id: existing.id }], { created: 0 }, PORTFOLIO_LINK, { reconciled: true });
      const action = await addAction(ctx.user, { goalId: goal.id, title: input.title, owner: "STUDENT", dueOn: input.dueOn });
      return receipt("write", "pathways.add_action", [{ model: "pathwayAction", id: action.id }], { created: 1 }, PORTFOLIO_LINK, { goalId: goal.id, owner: action.owner });
    },
  }),

  defineCapability<ShareInput>({
    key: "pathways.share_goal", version: 1, cluster: "C3", inventoryKeys: ["pathways.save_goal"], risk: "UPDATE", roles: STUDENT, class: "B",
    input: shareSchema as z.ZodType<ShareInput>, evidence: [], gates: GATES, scope: { kind: "self" }, humanFields: ["goalId"],
    copy: c(["Choose who sees my goal", "Share one of your goals with your counsellor or parent, or make it private again. It changes only after you confirm.", "Share my maths goal with my counsellor"],
      ["اختيار من يرى هدفي", "شارك أحد أهدافك مع مرشدك أو ولي أمرك، أو اجعله خاصاً مرة أخرى. لا يتغير إلا بعد تأكيدك.", "شارك هدف الرياضيات مع مرشدي"],
      ["میرا ہدف کون دیکھے", "اپنا کوئی ہدف کونسلر یا والدین کے ساتھ شیئر کریں یا دوبارہ ذاتی بنائیں۔ آپ کی تصدیق کے بعد ہی بدلے گا۔", "میرا ریاضی والا ہدف میرے کونسلر کے ساتھ شیئر کریں"]),
    idempotency: { mode: "convergent" }, source: { route: "POST /api/pathways (action=goal, id)", service: "src/lib/pathways/service.ts:saveGoal", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const goal = await bindGoal(ctx, input.goalId ?? input.goal, "/goal");
      return { ...input, audience: sortedAudience(input.audience), goalId: goal.id };
    },
    async preview(ctx, input) {
      const goal = await ownGoal(ctx, input.goalId);
      const next = sortedAudience(input.audience), now = sortedAudience(goal.audience);
      const unchanged = next.join() === now.join();
      return {
        title: say(ctx, l("Who sees this goal", "من يرى هذا الهدف", "یہ ہدف کون دیکھے گا")),
        lines: [
          { label: say(ctx, l("Goal", "الهدف", "ہدف")), value: goal.title },
          { label: say(ctx, l("Seen now by", "يراه الآن", "ابھی کون دیکھتا ہے")), value: audienceWords(ctx, now) },
          { label: say(ctx, l("After you confirm", "بعد تأكيدك", "تصدیق کے بعد")), value: unchanged ? say(ctx, l("No change", "لا تغيير", "کوئی تبدیلی نہیں")) : audienceWords(ctx, next) },
        ],
        counts: { goals: unchanged ? 0 : 1 },
        confirmLabel: say(ctx, next.length ? l("Share goal", "مشاركة الهدف", "ہدف شیئر کریں") : l("Keep it private", "اجعله خاصاً", "ذاتی رکھیں")),
        basis: { goalId: goal.id, updatedAt: goal.updatedAt.toISOString(), audience: now },
      };
    },
    async execute(ctx, input) {
      await examGuard(ctx);
      const goal = await ownGoal(ctx, input.goalId);
      const next = sortedAudience(input.audience);
      if (next.join() === sortedAudience(goal.audience).join()) return receipt("write", "pathways.share_goal", [{ model: "pathwayGoal", id: goal.id }], { updated: 0 }, PORTFOLIO_LINK, { audience: goal.audience, unchanged: true });
      // saveGoal replaces every field, so the goal's other fields are passed through unchanged.
      const saved = await saveGoal(ctx.user, {
        title: goal.title, ...(goal.detail ? { detail: goal.detail } : {}), audience: next,
        nextReviewOn: goal.nextReviewOn ? goal.nextReviewOn.toISOString().slice(0, 10) : null, status: goal.status as "ACTIVE" | "ACHIEVED" | "ARCHIVED",
      }, goal.id);
      return receipt("write", "pathways.share_goal", [{ model: "pathwayGoal", id: saved.id }], { updated: 1 }, PORTFOLIO_LINK, { audience: saved.audience });
    },
  }),

  defineCapability<AppointmentInput>({
    key: "pathways.request_appointment", version: 1, cluster: "C3", inventoryKeys: ["pathways.request_appointment"], risk: "CREATE", roles: STUDENT, class: "B",
    input: appointmentSchema as z.ZodType<AppointmentInput>, evidence: ["/date", "/time"], gates: GATES, scope: { kind: "self" }, humanFields: ["counsellorId", "startsAt"],
    copy: c(["Ask to meet a counsellor", "Request a meeting with one of your school's counsellors; it stays requested until the counsellor confirms.", "Book a meeting with the counsellor next Tuesday at 11"],
      ["طلب لقاء مع المرشد", "اطلب لقاءً مع أحد مرشدي المدرسة؛ يبقى طلباً حتى يؤكده المرشد.", "احجز لقاءً مع المرشد يوم الثلاثاء القادم الساعة ١١"],
      ["کونسلر سے ملاقات کی درخواست", "اسکول کے کسی کونسلر سے ملاقات کی درخواست کریں؛ کونسلر کی تصدیق تک یہ صرف درخواست رہے گی۔", "اگلے منگل 11 بجے کونسلر سے ملاقات طے کریں"]),
    idempotency: { mode: "natural" }, source: { route: "POST /api/pathways (action=appointment)", service: "src/lib/pathways/service.ts:requestAppointment", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const bound = await bindAppointment(ctx, input);
      return { ...input, counsellorId: bound.counsellor.id, startsAt: bound.startsAt.toISOString(), minutes: bound.minutes };
    },
    async preview(ctx, input) {
      const bound = await bindAppointment(ctx, input);
      return {
        title: say(ctx, l("Ask to meet a counsellor", "طلب لقاء مع المرشد", "کونسلر سے ملاقات کی درخواست")),
        lines: [
          { label: say(ctx, l("Counsellor", "المرشد", "کونسلر")), value: bound.counsellor.title },
          { label: say(ctx, l("When", "الموعد", "کب")), value: `${input.date} ${input.time}` },
          { label: say(ctx, l("Length", "المدة", "دورانیہ")), value: fill(ctx.locale, l("{n} minutes", "{n} دقيقة", "{n} منٹ"), { n: bound.minutes }) },
          { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, l("Requested — the counsellor confirms", "مطلوب — يؤكده المرشد", "درخواست — کونسلر تصدیق کریں گے")) },
        ],
        counts: { appointments: 1 },
        confirmLabel: say(ctx, l("Send request", "إرسال الطلب", "درخواست بھیجیں")),
        basis: { counsellorId: bound.counsellor.id, startsAt: bound.startsAt.toISOString(), minutes: bound.minutes },
      };
    },
    async execute(ctx, input) {
      await examGuard(ctx);
      const bound = await bindAppointment(ctx, input);
      if (input.counsellorId && bound.counsellor.id !== input.counsellorId) throw new WorkflowError("STALE_VERSION");
      // No idempotency key in the domain: the same request (counsellor and start) is reconciled.
      const existing = await prisma.counsellingAppointment.findFirst({ where: { schoolId: ctx.user.schoolId, studentId: bound.learner.id, counsellorId: bound.counsellor.id, startsAt: bound.startsAt, status: { not: "CANCELLED" } }, select: { id: true, status: true } });
      if (existing) return receipt("write", "pathways.request_appointment", [{ model: "counsellingAppointment", id: existing.id }], { created: 0 }, PORTFOLIO_LINK, { reconciled: true, status: existing.status });
      const row = await requestAppointment(ctx.user, { counsellorId: bound.counsellor.id, startsAt: bound.startsAt.toISOString(), minutes: bound.minutes });
      return receipt("write", "pathways.request_appointment", [{ model: "counsellingAppointment", id: row.id }], { created: 1 }, PORTFOLIO_LINK, { status: row.status, outcome: "REQUESTED" });
    },
  }),

  defineCapability<DraftInput>({
    key: "assignments.save_learner_draft", version: 1, cluster: "C4", inventoryKeys: ["assignments.save_learner_draft"], risk: "UPDATE", roles: STUDENT, class: "B",
    input: draftSchema as z.ZodType<DraftInput>, evidence: ["/text"], gates: GATES, scope: { kind: "self" }, humanFields: ["assignmentId"],
    copy: c(["Save my homework draft", "Save your own answer as the draft of a piece of homework; nothing is submitted.", "Save this as my science draft: plants make food in their leaves using sunlight"],
      ["حفظ مسودة واجبي", "احفظ إجابتك بكلماتك كمسودة للواجب؛ لا يُسلَّم شيء.", "احفظ هذا كمسودة واجب العلوم: النباتات تصنع غذاءها في الأوراق بضوء الشمس"],
      ["ہوم ورک کا مسودہ محفوظ کریں", "اپنا جواب اپنے الفاظ میں ہوم ورک کے مسودے کے طور پر محفوظ کریں؛ کچھ جمع نہیں ہوگا۔", "سائنس کے مسودے میں یہ لکھیں: پودے سورج کی روشنی سے پتوں میں خوراک بناتے ہیں"]),
    idempotency: { mode: "convergent" }, source: { route: "POST /api/assignments/[id] (op=draft)", service: "src/lib/assignments/service.ts:saveDraft", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const work = await bindWork(ctx, input.assignmentId ?? input.assignment, "/assignment");
      if (!work.canEditDraft) throw new WorkflowError("DOMAIN_REFUSED", { reason: work.state === "RETURNED" ? "RETURNED_ASK_TEACHER" : "NOT_OPEN" });
      return { ...input, assignmentId: work.id };
    },
    async preview(ctx, input) {
      const work = await ownWorkById(ctx, input.assignmentId);
      const saved = work.draft?.text ?? "";
      const same = saved === input.text;
      return {
        title: say(ctx, l("Save my homework draft", "حفظ مسودة واجبي", "ہوم ورک کا مسودہ محفوظ کریں")),
        lines: [
          { label: say(ctx, l("Homework", "الواجب", "ہوم ورک")), value: work.title },
          { label: say(ctx, l("Due", "موعد التسليم", "آخری تاریخ")), value: dueOf(work) },
          { label: say(ctx, l("Your draft", "مسودتك", "آپ کا مسودہ")), value: fill(ctx.locale, l("{n} words", "{n} كلمة", "{n} الفاظ"), { n: wordsIn(input.text) }) },
          { label: say(ctx, l("What changes", "ما الذي يتغير", "کیا بدلے گا")), value: say(ctx, same ? l("Already saved — no change", "محفوظة مسبقاً — لا تغيير", "پہلے سے محفوظ — کوئی تبدیلی نہیں") : saved ? l("Replaces your saved draft; not submitted", "تحل محل مسودتك المحفوظة؛ غير مُسلَّمة", "محفوظ مسودے کی جگہ لے گا؛ جمع نہیں ہوگا") : l("Saved as a draft; not submitted", "تُحفظ كمسودة؛ غير مُسلَّمة", "مسودے کے طور پر محفوظ؛ جمع نہیں ہوگا")) },
        ],
        counts: { drafts: same ? 0 : 1 },
        confirmLabel: say(ctx, l("Save draft", "حفظ المسودة", "مسودہ محفوظ کریں")),
        basis: { assignmentId: work.id, version: work.version, draftSavedAt: work.draft?.savedAt ?? null },
      };
    },
    async execute(ctx, input) {
      await examGuard(ctx);
      const work = await ownWorkById(ctx, input.assignmentId);
      if (work.draft?.text === input.text) return receipt("draft", "assignments.save_learner_draft", [{ model: "assignment", id: work.id }], { saved: 0 }, `${WORK_LINK}?assignment=${encodeURIComponent(work.id)}`, { unchanged: true });
      const saved = await saveDraft(ctx.user, work.id, { text: input.text }, ctx.now);
      return receipt("draft", "assignments.save_learner_draft", [{ model: "assignment", id: work.id }], { saved: 1 }, `${WORK_LINK}?assignment=${encodeURIComponent(work.id)}`, { savedAt: saved.savedAt, submitted: false });
    },
  }),

  defineCapability<SubmitInput>({
    key: "assignments.submit", version: 1, cluster: "C4", inventoryKeys: ["assignments.submit"], risk: "CREATE", roles: STUDENT, class: "B",
    input: submitSchema as z.ZodType<SubmitInput>, evidence: ["/assignment"], gates: GATES, scope: { kind: "self" }, humanFields: ["assignmentId"],
    copy: c(["Submit my homework", "Hand in the draft you saved for a piece of homework, where online submission is open. You get a receipt.", "Submit my science assignment"],
      ["تسليم واجبي", "سلّم المسودة التي حفظتها للواجب، إن كان التسليم الإلكتروني مفتوحاً. تحصل على إيصال.", "سلّم واجب العلوم"],
      ["ہوم ورک جمع کرائیں", "ہوم ورک کا محفوظ مسودہ جمع کرائیں، جہاں آن لائن جمع کرانا کھلا ہو۔ آپ کو رسید ملے گی۔", "میرا سائنس کا اسائنمنٹ جمع کرا دیں"]),
    idempotency: { mode: "native" }, source: { route: "POST /api/assignments/[id] (op=submit)", service: "src/lib/assignments/service.ts:submitWork", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const work = await bindWork(ctx, input.assignmentId ?? input.assignment, "/assignment");
      const refusal = submitRefusal(work);
      if (refusal) throw new WorkflowError("DOMAIN_REFUSED", { reason: refusal });
      return { ...input, assignmentId: work.id };
    },
    async preview(ctx, input) {
      const work = await ownWorkById(ctx, input.assignmentId);
      const refusal = submitRefusal(work);
      if (refusal) throw new WorkflowError("DOMAIN_REFUSED", { reason: refusal });
      const late = ctx.now > new Date(work.effectiveDueAt);
      const text = work.draft?.text?.trim() ?? "", file = work.draft?.file;
      return {
        title: say(ctx, l("Submit my homework", "تسليم واجبي", "ہوم ورک جمع کرائیں")),
        lines: [
          { label: say(ctx, l("Homework", "الواجب", "ہوم ورک")), value: work.title },
          { label: say(ctx, l("What is sent", "ما سيُسلَّم", "کیا جمع ہوگا")), value: [text ? fill(ctx.locale, l("Your draft saved {at} ({n} words)", "مسودتك المحفوظة {at} ({n} كلمة)", "آپ کا مسودہ جو {at} کو محفوظ ہوا ({n} الفاظ)"), { at: work.draft?.savedAt ? new Date(work.draft.savedAt).toISOString().slice(0, 16).replace("T", " ") : "", n: wordsIn(text) }) : "", file?.name ?? ""].filter(Boolean).join(" + ") },
          { label: say(ctx, l("Due", "موعد التسليم", "آخری تاریخ")), value: dueOf(work) },
          { label: say(ctx, l("On time", "في الموعد", "وقت پر")), value: say(ctx, late ? l("Late — your teacher will see it was late", "متأخر — سيرى معلمك أنه متأخر", "تاخیر سے — استاد کو تاخیر نظر آئے گی") : l("Yes", "نعم", "جی ہاں")) },
          { label: say(ctx, l("After submitting", "بعد التسليم", "جمع کرانے کے بعد")), value: say(ctx, work.resubmission === "NEVER" ? l("You cannot submit again", "لا يمكنك التسليم مرة أخرى", "دوبارہ جمع نہیں کرا سکیں گے") : l("A new version needs your teacher to reopen it after feedback", "النسخة الجديدة تحتاج أن يعيد معلمك فتحه بعد الملاحظات", "نیا ورژن رائے کے بعد استاد کے دوبارہ کھولنے پر ہی ممکن ہے")) },
        ],
        counts: { submissions: 1 },
        confirmLabel: say(ctx, l("Submit", "تسليم", "جمع کرائیں")),
        basis: { assignmentId: work.id, version: work.version, draftSavedAt: work.draft?.savedAt ?? null, fileSha256: file?.sha256 ?? null, versions: work.versions.length, late },
      };
    },
    async execute(ctx, input, { idempotencyKey }) {
      await examGuard(ctx);
      const work = await ownWorkById(ctx, input.assignmentId);
      const row = await submitWork(ctx.user, work.id, { idempotencyKey }, ctx.now);
      return { ...receipt("write", "assignments.submit", [{ model: "assignmentSubmissionVersion", id: row.id }], { submitted: row.replayed ? 0 : 1 }, `${WORK_LINK}?assignment=${encodeURIComponent(work.id)}`, { receiptCode: row.receiptCode, version: row.version, late: row.late }), replayed: row.replayed };
    },
  }),

  defineCapability<PortfolioInput>({
    key: "portfolio.student_entry", version: 1, cluster: "C3", inventoryKeys: ["portfolio.create_entry", "portfolio.edit_reflection"], risk: "CREATE", roles: STUDENT, class: "B",
    input: portfolioSchema as z.ZodType<PortfolioInput>, evidence: ["/reflection"], gates: GATES, scope: { kind: "self" },
    humanFields: ["earlierVersionId", "laterVersionId", "outcomeId", "assignmentTitle"],
    copy: c(["Add work to my portfolio", "Add a piece of returned homework to your portfolio with your own reflection; it is sent to your teacher for review.", "Add my fractions homework to my portfolio: I now check each step before moving on"],
      ["إضافة عمل إلى ملف إنجازي", "أضف واجباً أُعيد مع الملاحظات إلى ملف إنجازك مع تأملك بكلماتك؛ يُرسل لمعلمك للمراجعة.", "أضف واجب الكسور إلى ملف إنجازي: صرت أتحقق من كل خطوة"],
      ["پورٹ فولیو میں کام شامل کریں", "واپس شدہ ہوم ورک اپنے الفاظ میں تاثرات کے ساتھ پورٹ فولیو میں شامل کریں؛ یہ استاد کو جائزے کے لیے جائے گا۔", "کسور والا ہوم ورک میرے پورٹ فولیو میں ڈالیں: اب میں ہر قدم چیک کرتا ہوں"]),
    idempotency: { mode: "native" }, source: { route: "POST /api/portfolio", service: "src/lib/portfolio/service.ts:createEntry+editReflection", reuse: "direct" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      return bindPortfolio(ctx, input);
    },
    async preview(ctx, input) {
      const bound = input.earlierVersionId ? input : await bindPortfolio(ctx, input);
      const learner = await ownLearner(ctx);
      const existing = await sameEntry(ctx, learner.id, bound);
      return {
        title: say(ctx, l("Add work to my portfolio", "إضافة عمل إلى ملف إنجازي", "پورٹ فولیو میں کام شامل کریں")),
        lines: [
          { label: say(ctx, l("Homework", "الواجب", "ہوم ورک")), value: bound.assignmentTitle ?? input.assignment },
          { label: say(ctx, l("Evidence", "الدليل", "ثبوت")), value: say(ctx, bound.laterVersionId ? l("First returned attempt and a later revision", "أول محاولة مُعادة ومراجعة لاحقة", "پہلی واپس شدہ کوشش اور بعد کی نظرثانی") : l("First returned attempt", "أول محاولة مُعادة", "پہلی واپس شدہ کوشش")) },
          { label: say(ctx, l("Your reflection", "تأملك", "آپ کے تاثرات")), value: input.reflection },
          { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, existing ? l("Already in your portfolio — nothing new is added", "موجود في ملف إنجازك — لن يُضاف شيء", "پہلے سے پورٹ فولیو میں ہے — کچھ نیا شامل نہیں ہوگا") : l("Sent for teacher review", "يُرسل لمراجعة المعلم", "استاد کے جائزے کے لیے بھیجا جائے گا")) },
        ],
        counts: { entries: existing ? 0 : 1 },
        confirmLabel: say(ctx, l("Send for review", "إرسال للمراجعة", "جائزے کے لیے بھیجیں")),
        basis: { earlierVersionId: bound.earlierVersionId, laterVersionId: bound.laterVersionId, outcomeId: bound.outcomeId, existing: existing?.id ?? null },
      };
    },
    async execute(ctx, input, { idempotencyKey }) {
      await examGuard(ctx);
      const bound = await bindPortfolio(ctx, input);
      // The evidence must still be what the learner confirmed (a new revision since then means a fresh preview).
      if (bound.earlierVersionId !== input.earlierVersionId || bound.laterVersionId !== (input.laterVersionId ?? null) || bound.outcomeId !== (input.outcomeId ?? null)) throw new WorkflowError("STALE_VERSION");
      const learner = await ownLearner(ctx);
      const existing = await sameEntry(ctx, learner.id, bound);
      const repeated = await prisma.portfolioEntry.findFirst({ where: { schoolId: ctx.user.schoolId, studentId: learner.id, idempotencyKey }, select: { id: true } });
      if (existing && existing.id !== repeated?.id) return receipt("write", "portfolio.student_entry", [{ model: "portfolioEntry", id: existing.id }], { created: 0 }, PORTFOLIO_LINK, { reconciled: true, status: existing.status });
      const entry = await createEntry(ctx.user, {
        earlierVersionId: bound.earlierVersionId, laterVersionId: bound.laterVersionId, outcomeId: bound.outcomeId,
        reflection: input.reflection, ...(input.title ? { title: input.title } : {}), idempotencyKey,
      });
      // The learner's reflection goes to the teacher: the same "send for review" the portfolio screen offers.
      const sent = entry.status === "PROPOSED" ? entry : await editReflection(ctx.user, { entryId: entry.id, knownVersion: entry.version, reflection: input.reflection, propose: true });
      return { ...receipt("write", "portfolio.student_entry", [{ model: "portfolioEntry", id: entry.id }], { created: repeated ? 0 : 1 }, PORTFOLIO_LINK, { status: sent.status, outcome: "SENT_FOR_REVIEW" }), replayed: !!repeated };
    },
  }),

  defineCapability<HelpInput>({
    key: "study.request_help", version: 1, cluster: "C4", inventoryKeys: ["study.request_help", "chat.start_direct", "chat.send_message"], risk: "COMMUNICATION", roles: STUDENT, class: "C",
    input: helpSchema as z.ZodType<HelpInput>, evidence: ["/message"], gates: GATES, scope: { kind: "self" }, humanFields: ["teacherId"],
    copy: c(["Ask my teacher for help", "Drafts a message to your class teacher or a subject teacher; it opens in Messages and you send it yourself.", "I still don't get fractions, ask my teacher for help"],
      ["طلب المساعدة من معلمي", "يكتب مسودة رسالة لمعلم الفصل أو معلم المادة؛ تُفتح في الرسائل وترسلها أنت.", "ما زلت لا أفهم الكسور، اطلب المساعدة من معلمتي"],
      ["استاد سے مدد مانگیں", "کلاس ٹیچر یا مضمون کے استاد کے لیے پیغام کا مسودہ؛ یہ پیغامات میں کھلے گا اور آپ خود بھیجیں گے۔", "مجھے ابھی تک کسور سمجھ نہیں آئے، میری ٹیچر سے مدد مانگیں"]),
    source: { route: "POST /api/chat/conversations/[id]/messages", service: "src/lib/chat/service.ts (Messages screen)", reuse: "handoff-only" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      const teacher = await bindTeacher(ctx, input);
      return { ...input, teacherId: teacher.id };
    },
    handoff: {
      kind: "DOMAIN_SCREEN",
      async prepare(ctx, input) {
        await examGuard(ctx);
        const teacher = await bindTeacher(ctx, input);
        // Read only: the existing direct thread, if any. Nothing is created or sent here.
        const pairKey = [ctx.user.userId, teacher.id].sort().join(":");
        const thread = await prisma.conversation.findFirst({ where: { schoolId: ctx.user.schoolId, kind: "DIRECT", pairKey, isLocked: false }, select: { id: true } });
        return {
          kind: "DOMAIN_SCREEN", targetRoles: STUDENT, link: thread ? `/messages?c=${encodeURIComponent(thread.id)}` : "/messages",
          prefill: { recipientId: teacher.id, conversationId: thread?.id ?? null, draft: input.message },
          detail: { recipient: teacherLabel(teacher), outcome: "DRAFT_READY" },
        };
      },
    },
  }),

  defineCapability<CorrectionInput>({
    key: "corrections.request_office", version: 1, cluster: "C4", inventoryKeys: ["corrections.request_office"], risk: "CREATE", roles: STUDENT, class: "C",
    input: correctionSchema, evidence: ["/request"], gates: GATES, scope: { kind: "self" },
    copy: c(["Ask the office to check a mark or record", "Students cannot change or correct marks and records themselves, so this sends your request to the campus office, who decide.", "My English mark in the mid-term looks wrong, please check it"],
      ["طلب مراجعة درجة أو سجل من الإدارة", "لا يمكن للطالب تعديل الدرجات أو السجلات بنفسه، لذا يُرسل طلبك إلى إدارة الحرم لتقرر.", "درجتي في الإنجليزية في اختبار منتصف الفصل تبدو خاطئة، أرجو مراجعتها"],
      ["دفتر سے نمبر یا ریکارڈ چیک کروائیں", "طالب علم خود نمبر یا ریکارڈ درست نہیں کر سکتا، اس لیے آپ کی درخواست کیمپس آفس کو جائے گی، وہی فیصلہ کریں گے۔", "مڈ ٹرم میں میرے انگریزی کے نمبر غلط لگ رہے ہیں، براہِ کرم چیک کریں"]),
    source: { route: "POST /api/corrections (families refused)", service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (ROLE_TASK)", reuse: "handoff-only" },
    async resolve(ctx, input) {
      await examGuard(ctx);
      await ownLearner(ctx);
      return input;
    },
    handoff: {
      kind: "ROLE_TASK",
      async prepare(ctx, input) {
        const learner = await ownLearner(ctx);
        // corrections/service.ts permit(): families never request corrections, so no correction row is
        // made here; the office decides whether a teacher files one or the record is fixed in review.
        return {
          kind: "ROLE_TASK", targetRoles: OFFICE, link: CORRECTION_LINK[input.topic],
          prefill: { request: input.request, topic: input.topic, studentId: learner.id, ...(input.subject ? { subject: input.subject } : {}) },
          detail: { outcome: "SENT_TO_OFFICE" },
        };
      },
    },
  }),

  defineCapability<z.infer<typeof workReadSchema>>({
    key: "read.student.assignments", version: 1, cluster: "C4", inventoryKeys: ["read.student.assignments"], risk: "READ", roles: STUDENT, class: "A",
    input: workReadSchema, evidence: [], gates: GATES, scope: { kind: "self" }, idempotency: { mode: "convergent" },
    copy: c(["My homework", "See your homework: what is due this week, what is open and what was returned.", "What homework is due this week?"],
      ["واجباتي", "اطّلع على واجباتك: ما يُسلَّم هذا الأسبوع وما هو مفتوح وما أُعيد.", "ما الواجبات المطلوبة هذا الأسبوع؟"],
      ["میرا ہوم ورک", "اپنا ہوم ورک دیکھیں: اس ہفتے کیا جمع کرانا ہے، کیا کھلا ہے اور کیا واپس آیا۔", "اس ہفتے کون سا ہوم ورک جمع کرانا ہے؟"]),
    source: { route: "GET /api/assignments", service: "src/lib/assignments/service.ts:listAssignments", reuse: "direct" },
    async execute(ctx, input) {
      await examGuard(ctx);
      const which = input.which ?? "OPEN";
      const week = ctx.now.getTime() + 7 * 86_400_000;
      const rows = (await ownWork(ctx)).filter(work => which === "ALL" || (work.canEditDraft && (which === "OPEN" || new Date(work.effectiveDueAt).getTime() <= week)));
      const locale = ctx.locale;
      const intro = which === "DUE_THIS_WEEK" ? l("Due in the next 7 days ({n}): {list}.", "المطلوب خلال ٧ أيام ({n}): {list}.", "اگلے 7 دن میں جمع کرانا ہے ({n}): {list}۔")
        : which === "OPEN" ? l("Open work ({n}): {list}.", "الأعمال المفتوحة ({n}): {list}.", "کھلا کام ({n}): {list}۔")
          : l("All your work ({n}): {list}.", "كل أعمالك ({n}): {list}.", "آپ کا سارا کام ({n}): {list}۔");
      const none = which === "DUE_THIS_WEEK" ? l("Nothing is due in the next 7 days.", "لا شيء مطلوب خلال ٧ أيام.", "اگلے 7 دن میں کچھ جمع نہیں کرانا۔")
        : l("You have no open work right now.", "لا توجد أعمال مفتوحة الآن.", "ابھی کوئی کام کھلا نہیں۔");
      const text = rows.length
        ? fill(locale, intro, { n: rows.length, list: list(locale, rows.slice(0, 15).map(work => `${work.title} (${fill(locale, l("due {at}", "التسليم {at}", "آخری تاریخ {at}"), { at: dueOf(work) })}, ${(STATE_WORD[work.state] ?? STATE_WORD.OPEN)[locale]}${work.overdue && work.canEditDraft ? `, ${l("overdue", "متأخر", "تاخیر")[locale]}` : ""})`)) })
        : none[locale];
      return receipt("read", "read.student.assignments", rows.map(work => ({ model: "assignment", id: work.id })), { assignments: rows.length, overdue: rows.filter(work => work.overdue && work.canEditDraft).length }, WORK_LINK, {
        which, text, assignments: rows.map(work => ({ id: work.id, title: work.title, due: dueOf(work), state: work.state, overdue: work.overdue, canSubmit: work.canSubmit })),
      });
    },
  }),

  defineCapability<z.infer<typeof attendanceReadSchema>>({
    key: "read.student.attendance", version: 1, cluster: "C5", inventoryKeys: ["read.student.attendance"], risk: "READ", roles: STUDENT, class: "A",
    input: attendanceReadSchema, evidence: [], gates: [...GATES, permission("attendance", "view")], scope: { kind: "self" }, idempotency: { mode: "convergent" },
    copy: c(["My attendance", "Your attendance for this month or this school year, counted by your school's rule.", "What is my attendance this month?"],
      ["حضوري", "حضورك لهذا الشهر أو هذا العام الدراسي، محسوباً بقاعدة مدرستك.", "كم نسبة حضوري هذا الشهر؟"],
      ["میری حاضری", "اس مہینے یا اس تعلیمی سال کی آپ کی حاضری، آپ کے اسکول کے اصول کے مطابق۔", "میری اس مہینے کی حاضری کتنی ہے؟"]),
    source: { route: "/student/attendance (getStudentDashboardData)", service: "src/lib/attendance.ts:summarizeAttendance", reuse: "direct" },
    async execute(ctx, input) {
      await examGuard(ctx);
      const learner = await ownLearner(ctx);
      const today = await schoolToday(ctx.user.schoolId, learner.campusId);
      const month = input.month ?? (input.period === "THIS_MONTH" ? today.slice(0, 7) : null);
      const records = await prisma.attendance.findMany({ where: { schoolId: ctx.user.schoolId, studentId: learner.id }, select: { id: true, date: true, status: true, class: { select: { academicYear: true } } }, orderBy: { date: "desc" }, take: 400 });
      // Same scoping as the learner's own Attendance screen: this school year's days, then the month if asked.
      const year = attendanceForYear(records, learner.class?.academicYear);
      const rows = month ? year.filter(row => row.date.toISOString().startsWith(month)) : year;
      const summary = summarizeAttendance(rows, await attendanceRuleFor(ctx.user.schoolId));
      const locale = ctx.locale;
      const when = month ? fill(locale, l("In {m}", "في {m}", "{m} میں"), { m: month }) : l("This school year", "هذا العام الدراسي", "اس تعلیمی سال میں")[locale];
      const text = summary.counted
        ? fill(locale, l("{when}: you attended {a} of {c} counted days ({r}%). Absent {ab}, late {lt}, on leave {lv}.", "{when}: حضرت {a} من {c} يوماً محسوباً ({r}٪). غياب {ab}، تأخر {lt}، إجازة {lv}.", "{when}: آپ {c} میں سے {a} گنے گئے دن حاضر رہے ({r} فیصد)۔ غیر حاضر {ab}، تاخیر {lt}، چھٹی {lv}۔"),
          { when, a: summary.attended, c: summary.counted, r: summary.rate ?? 0, ab: summary.absent, lt: summary.late, lv: summary.leave })
        : fill(locale, l("{when}: no attendance has been recorded yet.", "{when}: لم يُسجَّل حضور بعد.", "{when}: ابھی کوئی حاضری درج نہیں ہوئی۔"), { when });
      return receipt("read", "read.student.attendance", [{ model: "student", id: learner.id }], { days: summary.total, counted: summary.counted, attended: summary.attended, absent: summary.absent }, "/student/attendance", {
        month, rate: summary.rate, summary, text,
      });
    },
  }),
];
