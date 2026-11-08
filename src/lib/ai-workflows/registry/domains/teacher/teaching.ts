import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { createAssignment } from "@/lib/assignments/service";
import { localToInstant } from "@/lib/assignments/rules";
import { createResource } from "@/lib/resources/service";
import { createEntry } from "@/lib/portfolio/service";
import { createActivity } from "@/lib/activities/service";
import { objectiveLabels } from "@/lib/curriculum/service";
import { getLocalePackage } from "@/lib/locale/store";
import { defineCapability } from "../../define";
import { ownCampus, permission, roles } from "../../gates";
import { InputRequired, WorkflowError } from "../../../errors";
import { assignedClass, assignedClassWhere, assignedSubject, classLabel } from "../../../resolve/scope";
import { classRoster, pupilLabel, resolvePupils } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Gate, L10n, Receipt } from "../../types";

/**
 * Teaching capabilities for teachers: homework drafts, link resources, portfolio entries, activities,
 * and hand-offs for everything a person decides on its own screen (releasing homework, publishing a
 * resource, messaging families, opening Exam Studio). Every write calls the domain service the screen
 * uses; class and subject scope is re-checked on the bound ids at resolve and again at execute.
 */
const TEACHER = ["TEACHER"] as const;
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "Use a real date.");
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const id = () => z.string().trim().min(1).max(64);
/** Mirrors src/lib/chat/service.ts MAX_MESSAGE_LENGTH (not imported: that module opens the realtime client). */
const MAX_MESSAGE_LENGTH = 4000;

function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale];
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

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

/** Classes the actor reaches on the job's campus (teachers: the ones they lead or teach in). */
async function reachableClasses(ctx: CapabilityContext) {
  if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
  return prisma.class.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, archivedAt: null, ...assignedClassWhere(ctx.user) }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }] });
}

/** A subject of exactly this class, in the actor's scope. */
async function subjectOfClass(ctx: CapabilityContext, subjectId: string, classId: string) {
  const subject = await assignedSubject(ctx, subjectId);
  if (subject.classId !== classId) throw new WorkflowError("SCOPE_DENIED");
  return subject;
}

const handoff = (link: string, prefill: Record<string, unknown>, detail?: Record<string, unknown>) => ({ targetRoles: TEACHER, link, prefill, ...(detail ? { detail } : {}) });

// ─── Homework ─────────────────────────────────────────────────────
const assignmentCreateSchema = z.strictObject({
  classId: id(), subjectId: id().optional(),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().max(8000),
  dueDate: DATE,
});
type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
/** A draft's due time: end of the due day in the school's own timezone (resolved again on release). */
const dueLocalOf = (dueDate: string) => `${dueDate}T23:59`;

async function existingDraft(ctx: CapabilityContext, input: AssignmentCreateInput) {
  return prisma.assignment.findFirst({
    where: { schoolId: ctx.user.schoolId, classId: input.classId, subjectId: input.subjectId ?? null, title: input.title, dueLocal: dueLocalOf(input.dueDate), ownerId: ctx.user.userId },
    select: { id: true, status: true }, orderBy: { createdAt: "asc" },
  });
}

const releaseSchema = z.strictObject({ assignment: z.string().trim().min(1).max(160) });
type ReleaseInput = z.infer<typeof releaseSchema> & { assignmentId?: string };

/** The actor's own DRAFT homework in a class they still teach, named by title (or chosen by id in an answer). */
async function ownDraftAssignment(ctx: CapabilityContext, text: string, pointer: string) {
  const classes = await reachableClasses(ctx);
  const rows = await prisma.assignment.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId!, ownerId: ctx.user.userId, status: "DRAFT", classId: { in: classes.map(row => row.id) } },
    select: { id: true, title: true, classId: true, dueLocal: true, currentVersion: true }, orderBy: { updatedAt: "desc" }, take: 200,
  });
  const found = matchTitled(rows, text);
  if (found.length === 1) return found[0];
  const label = (row: typeof rows[number]) => [row.title, classLabel(classes.find(klass => klass.id === row.classId)!), row.dueLocal?.slice(0, 10)].filter(Boolean).join(" · ");
  throw new InputRequired([found.length
    ? { pointer, promptKey: "ASSIGNMENT_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.id, label: label(row) })) }
    : { pointer, promptKey: "ASSIGNMENT_NOT_FOUND" }]);
}

// ─── Resources ────────────────────────────────────────────────────
const httpsUrl = z.string().trim().url().max(2048).refine(value => /^https:\/\//i.test(value), "Use an https link.");
const resourceCreateSchema = z.strictObject({ classId: id().optional(), subjectId: id().optional(), title: z.string().trim().min(3).max(160), url: httpsUrl });
type ResourceCreateInput = z.infer<typeof resourceCreateSchema>;

/** Binds a missing class: the only class the teacher teaches, else a question listing them. */
async function classOrAsk(ctx: CapabilityContext, classId: string | undefined, pointer: string) {
  if (classId) return assignedClass(ctx, classId);
  const classes = await reachableClasses(ctx);
  if (classes.length === 1) return assignedClass(ctx, classes[0].id);
  throw new InputRequired([{ pointer, promptKey: "CLASS_REQUIRED", options: classes.slice(0, 8).map(row => ({ value: row.id, label: classLabel(row) })) }]);
}

/** The same link already in this class's library (any author, not retired). */
async function sameLink(ctx: CapabilityContext, classId: string, url: string) {
  const variants = [...new Set([url, new URL(url).toString()])];
  return prisma.learningResource.findFirst({ where: { schoolId: ctx.user.schoolId, classId, status: { not: "RETIRED" }, versions: { some: { linkUrl: { in: variants } } } }, select: { id: true, title: true, status: true } });
}

const publishSchema = z.strictObject({ resource: z.string().trim().min(1).max(160) });
type PublishInput = z.infer<typeof publishSchema> & { resourceId?: string };

async function ownDraftResource(ctx: CapabilityContext, text: string, pointer: string) {
  const classes = await reachableClasses(ctx);
  const rows = await prisma.learningResource.findMany({
    where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId!, ownerId: ctx.user.userId, status: "DRAFT", classId: { in: classes.map(row => row.id) } },
    select: { id: true, title: true, classId: true, latestVersion: true }, orderBy: { updatedAt: "desc" }, take: 200,
  });
  const found = matchTitled(rows, text);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer, promptKey: "RESOURCE_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.id, label: `${row.title} · ${classLabel(classes.find(klass => klass.id === row.classId)!)}` })) }
    : { pointer, promptKey: "RESOURCE_NOT_FOUND" }]);
}

// ─── Portfolio ────────────────────────────────────────────────────
const portfolioSchema = z.strictObject({
  classId: id(), student: z.string().trim().min(1).max(120), assignment: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(200).optional(), title: z.string().trim().min(1).max(160).optional(),
});
type PortfolioInput = z.infer<typeof portfolioSchema> & { studentId?: string; earlierVersionId?: string; laterVersionId?: string | null; outcomeId?: string | null; assignmentTitle?: string; studentLabel?: string };

/**
 * Picks the evidence the portfolio screen would offer: the learner's first attempt at the named
 * homework whose feedback was returned, and their latest later revision if there is one.
 */
async function bindPortfolio(ctx: CapabilityContext, input: PortfolioInput): Promise<PortfolioInput> {
  const klass = await assignedClass(ctx, input.classId);
  const pupil = resolvePupils(await classRoster(ctx, klass.id), [{ pointer: "/student", text: input.student }]).get("/student")!;
  const assignments = await prisma.assignment.findMany({ where: { schoolId: ctx.user.schoolId, classId: klass.id, status: { not: "DRAFT" } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 300 });
  const named = matchTitled(assignments, input.assignment);
  if (named.length !== 1) throw new InputRequired([named.length
    ? { pointer: "/assignment", promptKey: "ASSIGNMENT_AMBIGUOUS", params: { count: named.length }, options: named.slice(0, 8).map(row => ({ value: row.id, label: row.title })) }
    : { pointer: "/assignment", promptKey: "ASSIGNMENT_NOT_FOUND" }]);
  const versions = await prisma.assignmentSubmissionVersion.findMany({ where: { schoolId: ctx.user.schoolId, studentId: pupil.id, assignmentId: named[0].id }, include: { feedback: true }, orderBy: { version: "asc" } });
  const earlier = versions.find(row => row.feedback?.status === "RETURNED" && row.feedback.returnedAt);
  if (!earlier) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_RETURNED_FEEDBACK" });
  const later = [...versions].reverse().find(row => row.id !== earlier.id && row.submittedAt > earlier.submittedAt) ?? null;
  const release = await prisma.assignmentVersion.findFirst({ where: { schoolId: ctx.user.schoolId, assignmentId: named[0].id, version: earlier.assignmentVersion }, select: { objectives: true } });
  const objectives = release?.objectives as { curriculumId: string; curriculumVersion: number; outcomeIds: string[] } | null;
  let outcomeId: string | null = null;
  if (objectives?.outcomeIds.length) {
    const goals = await objectiveLabels(prisma, ctx.user, objectives.curriculumId, objectives.curriculumVersion, objectives.outcomeIds);
    const wanted = input.goal ? fold(input.goal) : "";
    const chosen = goals.length === 1 ? goals : goals.filter(goal => goal.id === input.goal || (wanted && (fold(goal.title).includes(wanted) || (goal.code && fold(goal.code) === wanted))));
    if (chosen.length !== 1) throw new InputRequired([{ pointer: "/goal", promptKey: "GOAL_REQUIRED", options: goals.slice(0, 8).map(goal => ({ value: goal.id, label: [goal.code, goal.title].filter(Boolean).join(" · ") })) }]);
    outcomeId = chosen[0].id;
  }
  return { ...input, classId: klass.id, studentId: pupil.id, studentLabel: pupilLabel(pupil), earlierVersionId: earlier.id, laterVersionId: later?.id ?? null, outcomeId, assignmentTitle: named[0].title };
}

// ─── Activities ───────────────────────────────────────────────────
/**
 * Mirrors the `activityStaff` duty (src/lib/navigation/capabilities.ts): a teacher reaches the
 * Activities desk only while they coordinate or staff a published, upcoming activity. The service's own
 * `canPublish` (campus operations or a teacher) runs again inside createActivity.
 */
const activityStaffGate: Gate = {
  id: "duty:activityStaff", provenance: ["activityStaff", "canPublish"],
  async check(ctx) {
    if (ctx.user.role !== "TEACHER") return { ok: false, code: "ROLE", whoCan: TEACHER };
    const count = await prisma.activity.count({ where: { schoolId: ctx.user.schoolId, status: "PUBLISHED", endsAt: { gte: new Date() }, OR: [{ coordinatorId: ctx.user.userId }, { staffIds: { has: ctx.user.userId } }] } });
    return count > 0 ? { ok: true } : { ok: false, code: "ROLE" };
  },
};

const activitySchema = z.strictObject({
  kind: z.enum(["CLUB", "SPORT"]),
  title: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).optional(), location: z.string().trim().min(1).max(160),
  date: DATE, startTime: TIME, endTime: TIME,
  capacity: z.number().int().min(1).max(2000),
  classIds: z.array(id()).max(30).optional(),
  cancellationTerms: z.string().trim().min(1).max(600),
}).refine(value => value.endTime > value.startTime, { message: "The activity must end after it starts.", path: ["endTime"] });
type ActivityInput = z.infer<typeof activitySchema>;

async function activityTimes(ctx: CapabilityContext, input: ActivityInput) {
  const { timezone } = await getLocalePackage(ctx.user.schoolId, ctx.campusId);
  return { startsAt: localToInstant(`${input.date}T${input.startTime}`, timezone), endsAt: localToInstant(`${input.date}T${input.endTime}`, timezone) };
}
async function activityClasses(ctx: CapabilityContext, classIds: readonly string[] = []) {
  return Promise.all([...new Set(classIds)].map(classId => assignedClass(ctx, classId)));
}

// ─── Family messages and Exam Studio ──────────────────────────────
const chatSchema = z.strictObject({ classId: id(), message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) });
const studioSchema = z.strictObject({ classId: id().optional(), subjectId: id().optional() });

const receipt = (kind: Receipt["kind"], capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string, detail?: Record<string, unknown>): Receipt =>
  ({ kind, capability, entities, counts, link, replayed: false, ...(detail ? { detail } : {}) });

export const TEACHER_TEACHING_ENTRIES: readonly CapabilityEntry[] = [
  defineCapability<AssignmentCreateInput>({
    key: "assignments.create", version: 1, cluster: "C4", inventoryKeys: ["assignments.create"], risk: "CREATE", roles: TEACHER, class: "B",
    input: assignmentCreateSchema, evidence: ["/title", "/dueDate"], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
    copy: c(["Draft homework", "Create homework for one of your classes as a draft; nothing reaches learners until you release it on the Homework screen.", "Set homework for 7B maths: exercise 4.2, due Thursday"],
      ["مسودة واجب منزلي", "إنشاء واجب لأحد فصولك كمسودة؛ لا يصل للطلاب حتى تنشره من شاشة الواجبات.", "واجب رياضيات 7ب: تمرين 4.2، التسليم الخميس"],
      ["ہوم ورک کا مسودہ", "اپنی کسی کلاس کے لیے ہوم ورک بطور مسودہ بنائیں؛ ہوم ورک اسکرین سے جاری کرنے تک طلبہ کو نہیں ملے گا۔", "7بی ریاضی کا ہوم ورک: مشق 4.2، جمعرات تک"]),
    idempotency: { mode: "natural" }, source: { route: "POST /api/assignments", service: "src/lib/assignments/service.ts:createAssignment", reuse: "direct" },
    async resolve(ctx, input) {
      const klass = await assignedClass(ctx, input.classId);
      if (input.subjectId) await subjectOfClass(ctx, input.subjectId, klass.id);
      return input;
    },
    async preview(ctx, input) {
      const klass = await assignedClass(ctx, input.classId);
      const subject = input.subjectId ? await subjectOfClass(ctx, input.subjectId, klass.id) : null;
      const existing = await existingDraft(ctx, input);
      return {
        title: say(ctx, l("Draft homework", "مسودة واجب منزلي", "ہوم ورک کا مسودہ")),
        lines: [
          { label: say(ctx, l("Class", "الفصل", "کلاس")), value: classLabel(klass) },
          ...(subject ? [{ label: say(ctx, l("Subject", "المادة", "مضمون")), value: subject.name }] : []),
          { label: say(ctx, l("Title", "العنوان", "عنوان")), value: input.title },
          { label: say(ctx, l("Due", "موعد التسليم", "آخری تاریخ")), value: input.dueDate },
          { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, existing ? l("Already drafted — nothing new is created", "موجودة كمسودة — لن يُنشأ شيء جديد", "مسودہ پہلے سے موجود ہے — نیا نہیں بنے گا") : l("Draft, not released", "مسودة، غير منشورة", "مسودہ، جاری نہیں")) },
        ],
        counts: { assignments: existing ? 0 : 1 },
        confirmLabel: say(ctx, l("Save draft", "حفظ المسودة", "مسودہ محفوظ کریں")),
        basis: { input, existing: existing?.id ?? null },
      };
    },
    async execute(ctx, input) {
      const klass = await assignedClass(ctx, input.classId);
      if (input.subjectId) await subjectOfClass(ctx, input.subjectId, klass.id);
      // No idempotency key in the domain: reconcile the same draft by this author before writing again.
      const existing = await existingDraft(ctx, input);
      if (existing) return receipt("draft", "assignments.create", [{ model: "assignment", id: existing.id }], { created: 0 }, "/teacher/assignments", { reconciled: true, status: existing.status });
      const assignment = await createAssignment(ctx.user, { classId: klass.id, subjectId: input.subjectId ?? null, title: input.title, instructions: input.instructions, dueLocal: dueLocalOf(input.dueDate) });
      return receipt("draft", "assignments.create", [{ model: "assignment", id: assignment.id }], { created: 1 }, "/teacher/assignments", { status: assignment.status });
    },
  }),

  defineCapability<ReleaseInput>({
    key: "assignments.release", version: 1, cluster: "C4", inventoryKeys: ["assignments.release"], risk: "PUBLISH", roles: TEACHER, class: "C",
    input: releaseSchema as z.ZodType<ReleaseInput>, evidence: [], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" }, humanFields: ["assignmentId"],
    copy: c(["Release homework", "Releasing sends the homework to learners, so it opens on the Homework screen ready for you to press Release.", "Release the fractions homework for 6A"],
      ["نشر الواجب", "النشر يرسل الواجب للطلاب، لذا يُفتح في شاشة الواجبات جاهزاً لتضغط نشر.", "انشر واجب الكسور لـ 6أ"],
      ["ہوم ورک جاری کریں", "جاری کرنے سے ہوم ورک طلبہ تک پہنچتا ہے، اس لیے یہ ہوم ورک اسکرین پر کھلے گا اور آپ خود جاری کریں گے۔", "6اے کا کسور والا ہوم ورک جاری کریں"]),
    source: { route: "POST /api/assignments/[id]", service: "src/lib/assignments/service.ts:releaseAssignment", reuse: "handoff-only" },
    async resolve(ctx, input) {
      const row = await ownDraftAssignment(ctx, input.assignmentId ?? input.assignment, "/assignment");
      return { ...input, assignmentId: row.id };
    },
    handoff: {
      kind: "DOMAIN_SCREEN",
      async prepare(ctx, input) {
        const row = await ownDraftAssignment(ctx, input.assignmentId ?? input.assignment, "/assignment");
        await assignedClass(ctx, row.classId);
        return { kind: "DOMAIN_SCREEN", ...handoff(`/teacher/assignments?assignment=${encodeURIComponent(row.id)}`, { assignmentId: row.id, expectedVersion: row.currentVersion ?? 0 }, { title: row.title }) };
      },
    },
  }),

  defineCapability<ResourceCreateInput>({
    key: "resources.create", version: 1, cluster: "C4", inventoryKeys: ["resources.create"], risk: "CREATE", roles: TEACHER, class: "A",
    classOverride: "Saves a link as a staff-only DRAFT; learners and families see nothing until it is published on the Resources screen, and the same link in a class is never added twice.",
    input: resourceCreateSchema, evidence: ["/url"], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
    copy: c(["Save a link to class resources", "Add a web link to a class's resource library as a staff-only draft; publishing it to learners is done on the Resources screen.", "Save https://example.org/fractions to 6A resources as 'Fractions video'"],
      ["حفظ رابط في مصادر الفصل", "إضافة رابط إلى مكتبة مصادر الفصل كمسودة للمعلمين فقط؛ النشر للطلاب من شاشة المصادر.", "احفظ رابط فيديو الكسور في مصادر 6أ"],
      ["کلاس کے وسائل میں لنک محفوظ کریں", "کلاس کی وسائل لائبریری میں لنک صرف عملے کے مسودے کے طور پر؛ طلبہ کے لیے اشاعت وسائل اسکرین سے ہوگی۔", "کسور کی ویڈیو کا لنک 6اے کے وسائل میں محفوظ کریں"]),
    idempotency: { mode: "convergent" }, source: { route: "POST /api/resources", service: "src/lib/resources/service.ts:createResource", reuse: "direct" },
    async resolve(ctx, input) {
      const klass = await classOrAsk(ctx, input.classId, "/classId");
      if (input.subjectId) await subjectOfClass(ctx, input.subjectId, klass.id);
      return { ...input, classId: klass.id };
    },
    async preview(ctx, input) {
      const klass = await classOrAsk(ctx, input.classId, "/classId");
      const duplicate = await sameLink(ctx, klass.id, input.url);
      return {
        title: say(ctx, l("Save a link to class resources", "حفظ رابط في مصادر الفصل", "کلاس کے وسائل میں لنک محفوظ کریں")),
        lines: [
          { label: say(ctx, l("Class", "الفصل", "کلاس")), value: classLabel(klass) },
          { label: say(ctx, l("Title", "العنوان", "عنوان")), value: duplicate?.title ?? input.title },
          { label: say(ctx, l("Link", "الرابط", "لنک")), value: input.url },
          { label: say(ctx, l("Who sees it", "من يراه", "کون دیکھے گا")), value: say(ctx, duplicate ? l("Already in this class's library", "موجود في مكتبة الفصل", "اس کلاس کی لائبریری میں پہلے سے موجود") : l("Staff only, draft", "المعلمون فقط، مسودة", "صرف عملہ، مسودہ")) },
        ],
        counts: { resources: duplicate ? 0 : 1 }, basis: { input, duplicate: duplicate?.id ?? null },
      };
    },
    async execute(ctx, input) {
      const klass = await classOrAsk(ctx, input.classId, "/classId");
      if (input.subjectId) await subjectOfClass(ctx, input.subjectId, klass.id);
      const duplicate = await sameLink(ctx, klass.id, input.url);
      if (duplicate) return receipt("draft", "resources.create", [{ model: "learningResource", id: duplicate.id }], { created: 0 }, "/teacher/resources", { duplicate: true, status: duplicate.status });
      const host = new URL(input.url).hostname;
      const { resource } = await createResource(ctx.user, {
        classId: klass.id, subjectId: input.subjectId ?? null, title: input.title, kind: "OTHER", audience: "STAFF", language: ctx.locale,
        description: `Web link from ${host}`.slice(0, 2000), content: { link: input.url },
      });
      return receipt("draft", "resources.create", [{ model: "learningResource", id: resource.id }], { created: 1 }, "/teacher/resources", { status: resource.status, audience: resource.audience });
    },
  }),

  defineCapability<PublishInput>({
    key: "resources.publish", version: 1, cluster: "C4", inventoryKeys: ["resources.publish"], risk: "PUBLISH", roles: TEACHER, class: "C",
    input: publishSchema as z.ZodType<PublishInput>, evidence: [], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" }, humanFields: ["resourceId"],
    copy: c(["Publish a resource", "Publishing shows a resource to learners or families, so it opens on the Resources screen for you to choose the audience and publish.", "Publish the fractions worksheet for 6A"],
      ["نشر مصدر", "النشر يُظهر المصدر للطلاب أو الأسر، لذا يُفتح في شاشة المصادر لتختار الجمهور وتنشر.", "انشر ورقة عمل الكسور لـ 6أ"],
      ["وسیلہ شائع کریں", "اشاعت سے وسیلہ طلبہ یا والدین کو نظر آتا ہے، اس لیے یہ وسائل اسکرین پر کھلے گا جہاں آپ خود شائع کریں گے۔", "6اے کی کسور والی ورک شیٹ شائع کریں"]),
    source: { route: "POST /api/resources/[id]", service: "src/lib/resources/service.ts:publishResource", reuse: "handoff-only" },
    async resolve(ctx, input) {
      const row = await ownDraftResource(ctx, input.resourceId ?? input.resource, "/resource");
      return { ...input, resourceId: row.id };
    },
    handoff: {
      kind: "DOMAIN_SCREEN",
      async prepare(ctx, input) {
        const row = await ownDraftResource(ctx, input.resourceId ?? input.resource, "/resource");
        await assignedClass(ctx, row.classId);
        return { kind: "DOMAIN_SCREEN", ...handoff(`/teacher/resources?resource=${encodeURIComponent(row.id)}`, { resourceId: row.id, classId: row.classId, version: row.latestVersion }, { title: row.title }) };
      },
    },
  }),

  defineCapability<PortfolioInput>({
    key: "portfolio.create_entry", version: 1, cluster: "C3", inventoryKeys: ["portfolio.create_entry"], risk: "CREATE", roles: TEACHER, class: "B",
    input: portfolioSchema as z.ZodType<PortfolioInput>, evidence: ["/student", "/assignment"], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
    humanFields: ["studentId", "earlierVersionId", "laterVersionId", "outcomeId", "assignmentTitle", "studentLabel"],
    copy: c(["Add a portfolio entry", "Add a learner's returned homework (and a later revision) to their portfolio as evidence of progress; the learner writes the reflection.", "Add Ali's fractions homework to his portfolio"],
      ["إضافة إلى ملف الإنجاز", "إضافة واجب أُعيد تصحيحه (ومراجعة لاحقة) إلى ملف إنجاز الطالب كدليل على التقدم.", "أضف واجب الكسور لعلي إلى ملف إنجازه"],
      ["پورٹ فولیو میں اندراج", "طالب علم کا واپس شدہ ہوم ورک (اور بعد کی نظرثانی) اس کے پورٹ فولیو میں پیش رفت کے ثبوت کے طور پر شامل کریں۔", "علی کا کسور والا ہوم ورک اس کے پورٹ فولیو میں شامل کریں"]),
    idempotency: { mode: "native" }, source: { route: "POST /api/portfolio", service: "src/lib/portfolio/service.ts:createEntry", reuse: "direct" },
    resolve: bindPortfolio,
    async preview(ctx, input) {
      const bound = input.earlierVersionId ? input : await bindPortfolio(ctx, input);
      return {
        title: say(ctx, l("Add a portfolio entry", "إضافة إلى ملف الإنجاز", "پورٹ فولیو میں اندراج")),
        lines: [
          { label: say(ctx, l("Learner", "الطالب", "طالب علم")), value: bound.studentLabel ?? input.student },
          { label: say(ctx, l("Homework", "الواجب", "ہوم ورک")), value: bound.assignmentTitle ?? input.assignment },
          { label: say(ctx, l("Evidence", "الدليل", "ثبوت")), value: say(ctx, bound.laterVersionId ? l("First returned attempt and a later revision", "أول محاولة مُعادة ومراجعة لاحقة", "پہلی واپس شدہ کوشش اور بعد کی نظرثانی") : l("First returned attempt", "أول محاولة مُعادة", "پہلی واپس شدہ کوشش")) },
        ],
        counts: { entries: 1 },
        basis: { studentId: bound.studentId, earlierVersionId: bound.earlierVersionId, laterVersionId: bound.laterVersionId, outcomeId: bound.outcomeId },
      };
    },
    async execute(ctx, input, { idempotencyKey }) {
      const bound = await bindPortfolio(ctx, input);
      // The evidence must still be what the person confirmed (a new revision since then means a fresh preview).
      if (bound.studentId !== input.studentId || bound.earlierVersionId !== input.earlierVersionId || bound.laterVersionId !== (input.laterVersionId ?? null) || bound.outcomeId !== (input.outcomeId ?? null)) throw new WorkflowError("STALE_VERSION");
      const entry = await createEntry(ctx.user, {
        studentId: bound.studentId, earlierVersionId: bound.earlierVersionId, laterVersionId: bound.laterVersionId, outcomeId: bound.outcomeId,
        ...(input.title ? { title: input.title } : {}), idempotencyKey,
      });
      return receipt("write", "portfolio.create_entry", [{ model: "portfolioEntry", id: entry.id }], { created: 1 }, "/teacher/portfolio", { status: entry.status });
    },
  }),

  defineCapability<ActivityInput>({
    key: "activities.create", version: 1, cluster: "C4", inventoryKeys: ["activities.create"], risk: "CREATE", roles: TEACHER, class: "B",
    input: activitySchema, evidence: ["/title", "/location", "/date", "/capacity", "/cancellationTerms"], gates: [roles(TEACHER), ownCampus(), activityStaffGate], scope: { kind: "own-campus" },
    copy: c(["Set up a club or sports activity", "Create a free club or sport session families can request places in; trips and paid activities are set up on the Activities screen.", "Start a chess club on 5 November, 2 to 3 pm in the library, 20 places, for 7A and 7B"],
      ["إنشاء نادٍ أو نشاط رياضي", "إنشاء نادٍ أو نشاط رياضي مجاني يطلب فيه أولياء الأمور أماكن؛ الرحلات والأنشطة المدفوعة من شاشة الأنشطة.", "نادي شطرنج يوم 5 نوفمبر من 2 إلى 3 في المكتبة، 20 مقعداً"],
      ["کلب یا کھیل کی سرگرمی بنائیں", "مفت کلب یا کھیل کی سرگرمی بنائیں جس میں والدین جگہ مانگ سکیں؛ ٹرپ اور فیس والی سرگرمیاں سرگرمیوں کی اسکرین سے۔", "5 نومبر کو 2 سے 3 بجے لائبریری میں شطرنج کلب، 20 جگہیں، 7اے اور 7بی کے لیے"]),
    idempotency: { mode: "natural" }, source: { route: "POST /api/activities (action=create)", service: "src/lib/activities/service.ts:createActivity", reuse: "direct" },
    async resolve(ctx, input) {
      await activityClasses(ctx, input.classIds);
      await activityTimes(ctx, input);
      return input;
    },
    async preview(ctx, input) {
      const classes = await activityClasses(ctx, input.classIds);
      return {
        title: say(ctx, l("Set up an activity", "إنشاء نشاط", "سرگرمی بنائیں")),
        lines: [
          { label: say(ctx, l("Activity", "النشاط", "سرگرمی")), value: `${input.title} · ${input.kind}` },
          { label: say(ctx, l("When", "الموعد", "کب")), value: `${input.date} ${input.startTime}–${input.endTime}` },
          { label: say(ctx, l("Where", "المكان", "کہاں")), value: input.location },
          { label: say(ctx, l("Places", "المقاعد", "جگہیں")), value: String(input.capacity) },
          { label: say(ctx, l("Open to", "متاح لـ", "کن کے لیے")), value: classes.length ? classes.map(classLabel).join(", ") : say(ctx, l("All classes on the campus", "كل فصول الحرم", "کیمپس کی تمام کلاسیں")) },
          { label: say(ctx, l("Cost", "التكلفة", "فیس")), value: say(ctx, l("Free", "مجاني", "مفت")) },
          { label: say(ctx, l("Cancellation terms", "شروط الإلغاء", "منسوخی کی شرائط")), value: input.cancellationTerms },
        ],
        counts: { activities: 1 },
        confirmLabel: say(ctx, l("Create activity", "إنشاء النشاط", "سرگرمی بنائیں")),
        basis: input,
      };
    },
    async execute(ctx, input) {
      const classes = await activityClasses(ctx, input.classIds);
      const { startsAt, endsAt } = await activityTimes(ctx, input);
      // No idempotency key in the domain: reconcile the same activity by this coordinator before writing again.
      const existing = await prisma.activity.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId!, coordinatorId: ctx.user.userId, title: input.title, startsAt }, select: { id: true } });
      if (existing) return receipt("write", "activities.create", [{ model: "activity", id: existing.id }], { created: 0 }, "/activities", { reconciled: true });
      const activity = await createActivity(ctx.user, {
        kind: input.kind, title: input.title, description: input.description ?? "", location: input.location, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
        capacity: input.capacity, classIds: classes.map(row => row.id), costAmount: 0, cancellationTerms: input.cancellationTerms,
      });
      return receipt("write", "activities.create", [{ model: "activity", id: activity.id }], { created: 1 }, "/activities");
    },
  }),

  defineCapability<z.infer<typeof chatSchema>>({
    key: "chat.send_message", version: 1, cluster: "C5", inventoryKeys: ["chat.send_message"], risk: "COMMUNICATION", roles: TEACHER, class: "C",
    input: chatSchema, evidence: [], gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
    copy: c(["Draft a message to a class's families", "Drafts a message for the families of one of your classes; it opens in Messages and you send it yourself.", "Tell 5A parents the science project is due next Monday"],
      ["صياغة رسالة لأسر الفصل", "صياغة رسالة لأولياء أمور أحد فصولك؛ تُفتح في الرسائل وترسلها أنت.", "أبلغ أولياء أمور 5أ أن مشروع العلوم يُسلَّم الاثنين القادم"],
      ["کلاس کے والدین کے لیے پیغام کا مسودہ", "آپ کی کلاس کے والدین کے لیے پیغام کا مسودہ؛ یہ پیغامات میں کھلے گا اور آپ خود بھیجیں گے۔", "5اے کے والدین کو بتائیں کہ سائنس پراجیکٹ اگلے پیر تک جمع کرانا ہے"]),
    source: { route: "POST /api/chat/conversations/[id]/messages", service: "src/lib/chat/service.ts (Messages screen)", reuse: "handoff-only" },
    async resolve(ctx, input) { await assignedClass(ctx, input.classId); return input; },
    handoff: {
      kind: "DOMAIN_SCREEN",
      async prepare(ctx, input) {
        const klass = await assignedClass(ctx, input.classId);
        // Read only: the class channel if it exists. Nothing is created or sent here.
        const channel = await prisma.conversation.findFirst({ where: { schoolId: ctx.user.schoolId, kind: "CLASS", classId: klass.id, isLocked: false }, select: { id: true } });
        return { kind: "DOMAIN_SCREEN", ...handoff(`/messages?class=${encodeURIComponent(klass.id)}`, { classId: klass.id, conversationId: channel?.id ?? null, audience: "FAMILIES", draft: input.message }, { classLabel: classLabel(klass) }) };
      },
    },
  }),

  defineCapability<z.infer<typeof studioSchema>>({
    key: "exam_studio.open", version: 1, cluster: "C9", inventoryKeys: ["studio.next_step"], risk: "READ", roles: TEACHER, class: "C",
    input: studioSchema, evidence: [], gates: [roles(TEACHER), permission("ai", "view"), permission("exams", "view")], scope: { kind: "assigned-class" },
    copy: c(["Open Exam Studio", "Opens Exam Studio for a class and subject to write, review or seal a paper there.", "Open Exam Studio for 8B physics"],
      ["فتح استوديو الامتحانات", "يفتح استوديو الامتحانات لفصل ومادة لكتابة ورقة أو مراجعتها أو ختمها.", "افتح الاستوديو لفيزياء 8ب"],
      ["ایگزام اسٹوڈیو کھولیں", "کسی کلاس اور مضمون کے لیے ایگزام اسٹوڈیو کھولیں تاکہ وہاں پرچہ لکھیں، جانچیں یا سیل کریں۔", "8بی فزکس کے لیے ایگزام اسٹوڈیو کھولیں"]),
    source: { route: "/ai/studio", service: "src/app/ai/studio/page.tsx (Exam Studio)", reuse: "handoff-only" },
    async resolve(ctx, input) {
      const subject = input.subjectId ? await assignedSubject(ctx, input.subjectId) : null;
      const classId = input.classId ?? subject?.classId;
      if (classId) await assignedClass(ctx, classId);
      if (subject && classId && subject.classId !== classId) throw new WorkflowError("SCOPE_DENIED");
      return { ...input, ...(classId ? { classId } : {}) };
    },
    handoff: {
      kind: "DEEP_LINK",
      async prepare(ctx, input) {
        const subject = input.subjectId ? await assignedSubject(ctx, input.subjectId) : null;
        const classId = input.classId ?? subject?.classId ?? null;
        if (classId) await assignedClass(ctx, classId);
        if (subject && classId && subject.classId !== classId) throw new WorkflowError("SCOPE_DENIED");
        const query = new URLSearchParams({ ...(classId ? { classId } : {}), ...(subject ? { subjectId: subject.id } : {}) }).toString();
        return { kind: "DEEP_LINK", ...handoff(`/ai/studio${query ? `?${query}` : ""}`, { classId, subjectId: subject?.id ?? null }, { outcome: "ANSWERED" }) };
      },
    },
  }),
];
