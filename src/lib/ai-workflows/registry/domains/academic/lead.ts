import { createHash } from "node:crypto";
import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canLeadAcademics, canManageOperations } from "@/lib/api/scope";
import { isCampusOperator } from "@/lib/auth/institution";
import { notify } from "@/lib/notifications/in-app";
import { updateClassWithTeacherAssignment, updateSubjectWithTeacherAssignment } from "@/lib/api/teacher-assignments";
import { createCampusSubjects } from "@/lib/academic/subject-write";
import { coverBoard, proposeCover, setCapacity } from "@/lib/staff/workload";
import { createManualTimetable } from "@/lib/timetable/manual";
import { withExamSchedulingWrite } from "@/lib/academic/exam-scheduling-write";
import { createExamSession } from "@/lib/academic/exam-sessions";
import { normaliseExamTerm } from "@/lib/academic/exam-terms";
import { listExamInvigilation, updateExamInvigilation } from "@/lib/academic/exam-invigilation";
import { academicModelCohortKey, createAcademicModelDraft } from "@/lib/academic/model-draft-command";
import { DEFAULT_ACADEMIC_MODEL, type AcademicModelConfiguration } from "@/lib/academic/model-config";
import { createFramework } from "@/lib/improvement/service";
import { saveLearningAction } from "@/lib/learning/actions";
import { resolve as resolvePolicy } from "@/lib/group-policy/service";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { classLabel } from "../../../resolve/scope";
import { classRoster, pupilLabel, resolvePupils } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Gate, L10n, Receipt } from "../../types";

/**
 * The academic lead's capabilities (design-slices §9): the PRINCIPAL, or a campus operator (ADMIN /
 * CAMPUS_ADMIN) only while the campus has no active principal (canLeadAcademics). Staffing, subjects, weekly
 * caps, draft timetables, exam sessions and duties, grading-model drafts, inspection frameworks, cover
 * proposals and learning-action drafts are class B writes through the services the screens use. Deciding
 * corrections, activating plans or models, approving reports and everything Exam Studio owns (datesheet
 * publication, principal review) are class C: the step opens the screen where a person decides. Periods,
 * rooms and holidays are the campus admin's, so the principal can only ask for them (ROLE_TASK).
 * The seat is re-read at resolve and again at execute: a principal appointed mid-plan stops an operator's step.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

const LEADS: readonly UserRole[] = ["PRINCIPAL", "ADMIN", "CAMPUS_ADMIN"];
const OPERATORS: readonly UserRole[] = ["ADMIN", "CAMPUS_ADMIN"];
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ID = z.string().min(1).max(128);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}@.]+/gu, " ").trim();
/** "maths" finds "Mathematics", "physics" finds "Physics (theory)": plural endings dropped, then a substring. */
const loose = (value: string) => fold(value).replace(/s\b/g, "");
const subjectMatches = (name: string, said: string) => Boolean(loose(said)) && loose(name).includes(loose(said));
const reconciled = (error: unknown) => error instanceof ApiError && error.status === 409;
/** Key-order-free JSON (Postgres jsonb does not keep the order a configuration was written in). */
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);

/** Every lead entry: the role, the academic-lead seat (operators only while it is vacant), the route's leader predicate and the campus. */
const leadGates = (...more: Gate[]): Gate[] => [
  roles(LEADS), seatVacantForOperator("principal", "PRINCIPAL"), predicate("canManageOperations", canManageOperations, LEADS), ownCampus(), ...more,
];

function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}
/** canLeadAcademics, read fresh (never the context's cached seats): an operator stops once a principal is in post. */
async function leadCampus(ctx: CapabilityContext) {
  const campusId = ownCampusId(ctx);
  if (!(await canLeadAcademics(ctx.user, campusId))) throw new WorkflowError(isCampusOperator(ctx.user) ? "SEAT_HELD" : "SCOPE_DENIED");
  return campusId;
}

/** The lead's own console: the principal's, or the campus admin's while they stand in. */
const consoleLink = (ctx: CapabilityContext, principalView: string, adminView = principalView) =>
  ctx.user.role === "PRINCIPAL" ? `/principal?view=${principalView}` : `/admin?view=${adminView}`;

/** "Noor" matches "Noor Fatima"; "Ms Noor" drops the title; an exact name (or email) wins over prefixes. */
const HONORIFIC = /^(mr|mrs|ms|miss|sir|madam|dr|prof|ustad|ustadh|ustaz|ustani|maam|ma am|mam|استاد|استانی|مس|مسٹر|سر|میڈم|الأستاذ|الأستاذة|أستاذ|أستاذة)\s+/u;
function matchName<T>(rows: readonly T[], said: string, names: (row: T) => Array<string | null | undefined>): T[] {
  const wanted = fold(said).replace(HONORIFIC, "").trim();
  if (!wanted) return [];
  const of = (row: T) => names(row).filter((name): name is string => Boolean(name)).map(fold);
  const exact = rows.filter(row => of(row).includes(wanted));
  if (exact.length) return exact;
  const parts = wanted.split(" ");
  return rows.filter(row => of(row).some(name => { const words = name.split(" "); return parts.every((part, index) => words[index]?.startsWith(part) || words.includes(part)); }));
}

type Person = { id: string; fullName: string; email: string };
/** An active staff member of this campus in one of `allowed`, named by the user; a bound id is re-checked instead. */
async function campusPerson(ctx: CapabilityContext, campusId: string, said: string, pointer: string, allowed: readonly UserRole[], boundId?: string): Promise<Person> {
  const where = { schoolId: ctx.user.schoolId, campusId, isActive: true, role: { in: [...allowed] } };
  if (boundId) {
    const bound = await prisma.user.findFirst({ where: { ...where, id: boundId }, select: { id: true, fullName: true, email: true } });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const people = await prisma.user.findMany({ where, select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } });
  const found = matchName(people, said, row => [row.fullName, row.email]);
  if (found.length === 1) return found[0];
  const sameName = new Set(found.map(row => fold(row.fullName))).size < found.length;
  throw new InputRequired([found.length
    ? { pointer, promptKey: "STAFF_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: sameName ? row.email : row.fullName, label: `${row.fullName} · ${row.email}` })) }
    : { pointer, promptKey: "STAFF_NOT_FOUND", params: { name: said.slice(0, 80) } }]);
}

/** A live class of this campus (the planner's class handle); anything else is out of scope. */
async function campusClass(ctx: CapabilityContext, campusId: string, classId: string) {
  const klass = await prisma.class.findFirst({
    where: { id: classId, schoolId: ctx.user.schoolId, campusId, archivedAt: null },
    select: { id: true, name: true, section: true, status: true, academicYear: true, teachingMode: true, classTeacherId: true, classTeacher: { select: { fullName: true } }, _count: { select: { subjects: true } } },
  });
  if (!klass) throw new WorkflowError("SCOPE_DENIED");
  return klass;
}

const write = (capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string, detail?: Record<string, unknown>, kind: Receipt["kind"] = "write"): Receipt =>
  ({ kind, capability, entities, counts, link, replayed: false, ...(detail ? { detail } : {}) });

const NOBODY = l("Nobody yet", "لا أحد بعد", "ابھی کوئی نہیں");

// ─── academic.class.assign_teacher ────────────────────────────────────────

const classTeacherInput = z.strictObject({
  classId: ID,
  /** The teacher as the user named them ("Ms Sana"); bound to an active teacher of this campus. */
  teacher: z.string().trim().min(1).max(120),
  /** Bound by the server from `teacher`. */
  teacherId: ID.optional(),
});
type ClassTeacherInput = z.infer<typeof classTeacherInput>;
const CLASS_TEACHER_ROLES: readonly UserRole[] = ["TEACHER", "PRINCIPAL"];

const CLASS_ASSIGN_TEACHER = defineCapability<ClassTeacherInput>({
  key: "academic.class.assign_teacher", version: 1, cluster: "C1", inventoryKeys: ["academic.class.assign_teacher"], risk: "UPDATE", roles: LEADS, class: "B",
  input: classTeacherInput, evidence: ["/teacher"], humanFields: ["teacherId"],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Choose a class teacher", "Make an active teacher of this campus the class teacher of a class. In a single-teacher class they also take its subjects.", "Make Sana the class teacher of 7B"],
    ["تعيين معلم الفصل", "اجعل معلماً نشطاً في هذا الحرم معلم الفصل. في فصل المعلم الواحد يتولى مواده أيضاً.", "اجعل سناء معلمة الصف 7ب"],
    ["کلاس ٹیچر مقرر کریں", "اس کیمپس کے کسی فعال استاد کو کلاس کا کلاس ٹیچر بنائیں۔ ایک استاد والی کلاس میں مضامین بھی انہی کے پاس جائیں گے۔", "ثناء کو 7بی کی کلاس ٹیچر بنا دیں"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "PATCH /api/classes (classTeacherId)", service: "src/lib/api/teacher-assignments.ts:updateClassWithTeacherAssignment", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    await campusClass(ctx, campusId, input.classId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", CLASS_TEACHER_ROLES, input.teacherId);
    return { ...input, teacher: teacher.fullName, teacherId: teacher.id };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const klass = await campusClass(ctx, campusId, input.classId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", CLASS_TEACHER_ROLES, input.teacherId);
    const same = klass.classTeacherId === teacher.id;
    const single = klass.teachingMode === "SINGLE" && klass._count.subjects > 0 && !same;
    return {
      title: say(ctx, l("Choose a class teacher", "تعيين معلم الفصل", "کلاس ٹیچر مقرر کریں")),
      lines: [
        { label: say(ctx, l("Class", "الفصل", "کلاس")), value: classLabel(klass) },
        { label: say(ctx, l("Class teacher now", "معلم الفصل الحالي", "موجودہ کلاس ٹیچر")), value: klass.classTeacher?.fullName ?? say(ctx, NOBODY) },
        { label: say(ctx, l("New class teacher", "معلم الفصل الجديد", "نیا کلاس ٹیچر")), value: same ? `${teacher.fullName} · ${say(ctx, l("already set, nothing changes", "معيّن مسبقاً، لا تغيير", "پہلے سے مقرر، کچھ نہیں بدلے گا"))}` : teacher.fullName },
        ...(single ? [{ label: say(ctx, l("Subjects", "المواد", "مضامین")), value: say(ctx, l(`This is a single-teacher class: all ${klass._count.subjects} subjects and their timetable lessons move to ${teacher.fullName}.`, `فصل بمعلم واحد: تنتقل كل المواد (${klass._count.subjects}) وحصصها إلى ${teacher.fullName}.`, `یہ ایک استاد والی کلاس ہے: تمام ${klass._count.subjects} مضامین اور ان کے پیریڈ ${teacher.fullName} کو منتقل ہوں گے۔`)) }] : []),
      ],
      counts: { changes: same ? 0 : 1, subjects: single ? klass._count.subjects : 0 },
      confirmLabel: `${say(ctx, l("Save class teacher", "حفظ معلم الفصل", "کلاس ٹیچر محفوظ کریں"))} · ${classLabel(klass)}`,
      basis: { input, current: klass.classTeacherId, mode: klass.teachingMode },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const klass = await campusClass(ctx, campusId, input.classId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", CLASS_TEACHER_ROLES, input.teacherId);
    const link = consoleLink(ctx, "classes");
    if (klass.classTeacherId === teacher.id) return write("academic.class.assign_teacher", [{ model: "class", id: klass.id }], { changes: 0 }, link, { reconciled: true, classTeacherId: teacher.id });
    const { existing, cls } = await updateClassWithTeacherAssignment(ctx.user, { id: klass.id, classTeacherId: teacher.id });
    notify("CLASS_UPDATED", { schoolId: ctx.user.schoolId, campusId: existing.campusId, actorId: ctx.user.userId, actorName: ctx.user.fullName, className: cls.name, section: cls.section ?? undefined, classId: klass.id });
    return write("academic.class.assign_teacher", [{ model: "class", id: klass.id }], { changes: 1 }, link, { classTeacherId: teacher.id, previousClassTeacherId: existing.classTeacherId });
  },
});

// ─── academic.subject.create ──────────────────────────────────────────────

const subjectCreateInput = z.strictObject({
  classId: ID,
  /** Subject names as the user said them, with total marks when given (the screen's default is 100). */
  subjects: z.array(z.strictObject({ name: z.string().trim().min(1).max(120), totalMarks: z.number().int().min(1).max(1000).optional() })).min(1).max(20),
  /** "for all sections of grade 6": the same subject goes to every active section of this class name and year. */
  allSections: z.boolean().optional(),
});
type SubjectCreateInput = z.infer<typeof subjectCreateInput>;
const subjectKey = (name: string) => name.normalize("NFKC").trim().toLowerCase();

async function subjectTargets(ctx: CapabilityContext, campusId: string, input: SubjectCreateInput) {
  const klass = await campusClass(ctx, campusId, input.classId);
  if (klass.status !== "ACTIVE") throw new WorkflowError("DOMAIN_REFUSED", { reason: "CLASS_NOT_ACTIVE" });
  const targets = input.allSections
    ? await prisma.class.findMany({ where: { schoolId: ctx.user.schoolId, campusId, name: klass.name, academicYear: klass.academicYear, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true } })
    : [{ id: klass.id, name: klass.name, section: klass.section }];
  const existing = await prisma.subject.findMany({ where: { schoolId: ctx.user.schoolId, campusId, classId: { in: targets.map(row => row.id) } }, select: { name: true, classId: true } });
  const missing = (name: string) => targets.filter(target => !existing.some(row => row.classId === target.id && subjectKey(row.name) === subjectKey(name)));
  return { klass, targets, missing };
}
const uniqueSubjects = (input: SubjectCreateInput) => input.subjects.filter((row, index) => input.subjects.findIndex(other => subjectKey(other.name) === subjectKey(row.name)) === index);

const SUBJECT_CREATE = defineCapability<SubjectCreateInput>({
  key: "academic.subject.create", version: 1, cluster: "C1", inventoryKeys: ["academic.subject.create"], risk: "CREATE", roles: LEADS, class: "B",
  input: subjectCreateInput, evidence: ["/subjects/*/name"],
  gates: leadGates(permission("exams", "add")), scope: { kind: "own-campus" },
  copy: c(
    ["Add subjects to a class", "Add missing subjects with their total marks to an active class, or to every section of it. A subject the class already has is kept.", "Add Computer Science out of 75 to all grade 9 sections"],
    ["إضافة مواد لفصل", "أضف المواد الناقصة بدرجاتها الكلية إلى فصل نشط أو إلى كل شعبه. تبقى المادة الموجودة كما هي.", "أضف علوم الحاسوب من 75 لكل شعب الصف التاسع"],
    ["کلاس میں مضامین شامل کریں", "کسی فعال کلاس یا اس کے تمام سیکشنز میں کل نمبروں کے ساتھ نئے مضامین شامل کریں۔ پہلے سے موجود مضمون برقرار رہے گا۔", "نویں جماعت کے تمام سیکشنز میں کمپیوٹر سائنس 75 نمبر کا شامل کریں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/subjects", service: "src/lib/academic/subject-write.ts:createCampusSubjects", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    await subjectTargets(ctx, campusId, input);
    return { ...input, subjects: uniqueSubjects(input).map(row => ({ name: row.name.trim(), totalMarks: row.totalMarks ?? 100 })) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const { klass, targets, missing } = await subjectTargets(ctx, campusId, input);
    const rows = uniqueSubjects(input).map(row => ({ row, missing: missing(row.name) }));
    const fresh = rows.reduce((sum, item) => sum + item.missing.length, 0);
    return {
      title: say(ctx, l("Add subjects to a class", "إضافة مواد لفصل", "کلاس میں مضامین شامل کریں")),
      lines: [
        { label: say(ctx, l("Class", "الفصل", "کلاس")), value: input.allSections ? `${klass.name} · ${targets.map(classLabel).join(", ")}` : classLabel(klass) },
        ...rows.map(({ row, missing: gaps }) => ({ label: `${row.name} · ${row.totalMarks ?? 100}`, value: gaps.length ? gaps.map(classLabel).join(", ") : say(ctx, l("Already there, kept as it is", "موجودة مسبقاً وتبقى", "پہلے سے موجود، ویسا ہی رہے گا")) })),
      ],
      counts: { subjects: fresh, kept: rows.filter(item => !item.missing.length).length },
      confirmLabel: `${say(ctx, l("Add subjects", "إضافة المواد", "مضامین شامل کریں"))} · ${fresh}`,
      basis: { input, missing: rows.map(item => item.missing.map(target => target.id)) },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const entities: Receipt["entities"] = [];
    let created = 0, kept = 0;
    for (const row of uniqueSubjects(input)) {
      const { missing } = await subjectTargets(ctx, campusId, input);
      if (!missing(row.name).length) { kept += 1; continue; }
      try {
        const { subject, cls, createdCount } = await createCampusSubjects(ctx.user, { classId: input.classId, name: row.name, totalMarks: row.totalMarks ?? 100, applyToAllSections: input.allSections === true });
        notify("SUBJECT_CREATED", { schoolId: ctx.user.schoolId, campusId: cls.campusId, actorId: ctx.user.userId, actorName: ctx.user.fullName, subjectName: subject.name, className: [subject.class?.name, subject.class?.section].filter(Boolean).join(" "), classId: subject.classId, teacherId: subject.teacherId ?? undefined });
        entities.push({ model: "subject", id: subject.id }); created += createdCount;
      } catch (error) {
        // A concurrent add of the same subject: the class now has it, which is what was asked for.
        if (!reconciled(error)) throw error;
        kept += 1;
      }
    }
    return write("academic.subject.create", entities, { subjects: created, kept }, consoleLink(ctx, "classes"), created === 0 ? { reconciled: true } : undefined);
  },
});

// ─── academic.subject.assign_teacher ──────────────────────────────────────

const subjectTeacherInput = z.strictObject({ subjectId: ID, teacher: z.string().trim().min(1).max(120), teacherId: ID.optional() });
type SubjectTeacherInput = z.infer<typeof subjectTeacherInput>;
/** subject-write.ts / teacher-assignments.ts: a subject teacher is an active TEACHER of the campus. */
const SUBJECT_TEACHER_ROLES: readonly UserRole[] = ["TEACHER"];

async function campusSubject(ctx: CapabilityContext, campusId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId: ctx.user.schoolId, campusId, class: { archivedAt: null } },
    select: { id: true, name: true, teacherId: true, teacher: { select: { fullName: true } }, class: { select: { name: true, section: true } }, _count: { select: { timetableSlots: true } } },
  });
  if (!subject) throw new WorkflowError("SCOPE_DENIED");
  return subject;
}

const SUBJECT_ASSIGN_TEACHER = defineCapability<SubjectTeacherInput>({
  key: "academic.subject.assign_teacher", version: 1, cluster: "C1", inventoryKeys: ["academic.subject.assign_teacher"], risk: "UPDATE", roles: LEADS, class: "B",
  input: subjectTeacherInput, evidence: ["/teacher"], humanFields: ["teacherId"],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Choose a subject teacher", "Give a class's subject to an active teacher of this campus; its timetable lessons follow.", "Give 9A Physics to Mr Imran"],
    ["تعيين معلم مادة", "أسند مادة الفصل إلى معلم نشط في هذا الحرم، وتنتقل حصصها معها.", "أسند فيزياء 9أ إلى الأستاذ عمران"],
    ["مضمون کا استاد مقرر کریں", "کلاس کا مضمون اس کیمپس کے کسی فعال استاد کو دیں؛ اس کے ٹائم ٹیبل پیریڈ بھی ساتھ جائیں گے۔", "9اے کی فزکس سر عمران کو دے دیں"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "PATCH /api/subjects (teacherId)", service: "src/lib/api/teacher-assignments.ts:updateSubjectWithTeacherAssignment", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    await campusSubject(ctx, campusId, input.subjectId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", SUBJECT_TEACHER_ROLES, input.teacherId);
    return { ...input, teacher: teacher.fullName, teacherId: teacher.id };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const subject = await campusSubject(ctx, campusId, input.subjectId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", SUBJECT_TEACHER_ROLES, input.teacherId);
    const same = subject.teacherId === teacher.id;
    return {
      title: say(ctx, l("Choose a subject teacher", "تعيين معلم مادة", "مضمون کا استاد مقرر کریں")),
      lines: [
        { label: say(ctx, l("Subject", "المادة", "مضمون")), value: `${subject.name} · ${classLabel(subject.class)}` },
        { label: say(ctx, l("Teacher now", "المعلم الحالي", "موجودہ استاد")), value: subject.teacher?.fullName ?? say(ctx, NOBODY) },
        { label: say(ctx, l("New teacher", "المعلم الجديد", "نیا استاد")), value: same ? `${teacher.fullName} · ${say(ctx, l("already set, nothing changes", "معيّن مسبقاً، لا تغيير", "پہلے سے مقرر، کچھ نہیں بدلے گا"))}` : teacher.fullName },
        ...(subject._count.timetableSlots && !same ? [{ label: say(ctx, l("Timetable", "الجدول", "ٹائم ٹیبل")), value: say(ctx, l(`${subject._count.timetableSlots} timetable lessons move to the new teacher.`, `تنتقل ${subject._count.timetableSlots} حصة إلى المعلم الجديد.`, `${subject._count.timetableSlots} پیریڈ نئے استاد کو منتقل ہوں گے۔`)) }] : []),
      ],
      counts: { changes: same ? 0 : 1, lessons: same ? 0 : subject._count.timetableSlots },
      confirmLabel: `${say(ctx, l("Save subject teacher", "حفظ معلم المادة", "استاد محفوظ کریں"))} · ${subject.name}`,
      basis: { input, current: subject.teacherId },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const current = await campusSubject(ctx, campusId, input.subjectId);
    const teacher = await campusPerson(ctx, campusId, input.teacher, "/teacher", SUBJECT_TEACHER_ROLES, input.teacherId);
    const link = consoleLink(ctx, "classes");
    if (current.teacherId === teacher.id) return write("academic.subject.assign_teacher", [{ model: "subject", id: current.id }], { changes: 0 }, link, { reconciled: true, teacherId: teacher.id });
    const { existing, subject } = await updateSubjectWithTeacherAssignment(ctx.user, { id: current.id, teacherId: teacher.id });
    if (subject.teacher) notify("SUBJECT_TEACHER_ASSIGNED", { schoolId: ctx.user.schoolId, campusId: existing.campusId, actorId: ctx.user.userId, actorName: ctx.user.fullName, teacherName: subject.teacher.fullName, subjectName: subject.name, className: [subject.class?.name, subject.class?.section].filter(Boolean).join(" "), teacherId: subject.teacherId ?? undefined });
    return write("academic.subject.assign_teacher", [{ model: "subject", id: subject.id }], { changes: 1 }, link, { teacherId: teacher.id, previousTeacherId: existing.teacherId });
  },
});

// ─── staff.set_workload_capacity ──────────────────────────────────────────

const workloadInput = z.strictObject({
  /** Most periods a week, as the user said it (0–80). */
  periodsPerWeek: z.number().int().min(0).max(80),
  /** Named teachers; left out, every active teacher of the campus gets the cap. */
  teachers: z.array(z.string().trim().min(1).max(120)).min(1).max(100).optional(),
  /** Bound by the server from `teachers` (or the whole teaching staff). */
  teacherIds: z.array(ID).max(200).optional(),
});
type WorkloadInput = z.infer<typeof workloadInput>;

async function workloadRows(ctx: CapabilityContext, campusId: string, ids: readonly string[]) {
  const rows = await prisma.user.findMany({ where: { id: { in: [...ids] }, schoolId: ctx.user.schoolId, campusId, isActive: true, role: "TEACHER" }, select: { id: true, fullName: true, staffProfile: { select: { contractedPeriodsPerWeek: true } } }, orderBy: { fullName: "asc" } });
  if (rows.length !== new Set(ids).size) throw new WorkflowError("SCOPE_DENIED");
  return rows;
}

const WORKLOAD_CAPACITY = defineCapability<WorkloadInput>({
  key: "staff.set_workload_capacity", version: 1, cluster: "C2", inventoryKeys: ["staff.set_workload_capacity"], risk: "UPDATE", roles: LEADS, class: "B",
  input: workloadInput, evidence: ["/periodsPerWeek"], humanFields: ["teacherIds"],
  gates: leadGates(), scope: { kind: "own-campus" },
  copy: c(
    ["Set teachers' weekly lesson cap", "Set the most periods a week for all teachers or named ones; cover suggestions warn before anyone goes over it.", "No teacher should teach more than 30 periods a week"],
    ["تحديد الحد الأسبوعي للحصص", "حدد أقصى عدد حصص أسبوعياً لكل المعلمين أو لمعلمين محددين؛ تنبّه اقتراحات البديل قبل تجاوزه.", "لا يدرّس أي معلم أكثر من 30 حصة أسبوعياً"],
    ["اساتذہ کی ہفتہ وار پیریڈ کی حد", "تمام یا منتخب اساتذہ کے لیے ہفتے میں زیادہ سے زیادہ پیریڈ مقرر کریں؛ متبادل کی تجاویز حد سے پہلے خبردار کریں گی۔", "کوئی استاد ہفتے میں 30 سے زیادہ پیریڈ نہ پڑھائے"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "PATCH /api/staff/workload", service: "src/lib/staff/workload.ts:setCapacity", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    if (input.teacherIds?.length) { await workloadRows(ctx, campusId, input.teacherIds); return input; }
    let ids: string[];
    if (input.teachers?.length) {
      const bound: string[] = [], unclear: RequiredField[] = [];
      for (const [index, said] of input.teachers.entries()) {
        try { bound.push((await campusPerson(ctx, campusId, said, `/teachers/${index}`, ["TEACHER"])).id); }
        catch (error) { if (error instanceof InputRequired) unclear.push(...error.fields); else throw error; }
      }
      if (unclear.length) throw new InputRequired(unclear);
      ids = [...new Set(bound)];
    } else {
      ids = (await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, campusId, isActive: true, role: "TEACHER" }, select: { id: true }, orderBy: { fullName: "asc" } })).map(row => row.id);
      if (!ids.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_TEACHERS" });
    }
    return { ...input, teacherIds: ids };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const rows = await workloadRows(ctx, campusId, input.teacherIds ?? []);
    const changing = rows.filter(row => (row.staffProfile?.contractedPeriodsPerWeek ?? null) !== input.periodsPerWeek);
    const unset = say(ctx, l("not set", "غير محدد", "مقرر نہیں"));
    return {
      title: say(ctx, l("Set teachers' weekly lesson cap", "تحديد الحد الأسبوعي للحصص", "اساتذہ کی ہفتہ وار پیریڈ کی حد")),
      lines: [
        { label: say(ctx, l("Periods a week", "الحصص أسبوعياً", "ہفتہ وار پیریڈ")), value: String(input.periodsPerWeek) },
        ...rows.slice(0, 40).map(row => ({ label: row.fullName, value: `${row.staffProfile?.contractedPeriodsPerWeek ?? unset} → ${input.periodsPerWeek}` })),
      ],
      counts: { changes: changing.length, unchanged: rows.length - changing.length },
      confirmLabel: `${say(ctx, l("Save caps", "حفظ الحدود", "حد محفوظ کریں"))} · ${changing.length}`,
      basis: { input, current: rows.map(row => [row.id, row.staffProfile?.contractedPeriodsPerWeek ?? null]) },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const rows = await workloadRows(ctx, campusId, input.teacherIds ?? []);
    let changed = 0;
    for (const row of rows) {
      if ((row.staffProfile?.contractedPeriodsPerWeek ?? null) === input.periodsPerWeek) continue;
      await setCapacity(ctx.user, campusId, row.id, input.periodsPerWeek);
      changed += 1;
    }
    return write("staff.set_workload_capacity", rows.map(row => ({ model: "staffProfile", id: row.id })), { changes: changed, unchanged: rows.length - changed }, consoleLink(ctx, "timetable"), { periodsPerWeek: input.periodsPerWeek, ...(changed === 0 ? { reconciled: true } : {}) });
  },
});

// ─── timetable.create ─────────────────────────────────────────────────────

const timetableInput = z.strictObject({ classId: ID, term: z.enum(["ANNUAL", "TERM_1", "TERM_2", "TERM_3"]).optional() });
type TimetableInput = z.infer<typeof timetableInput>;

/** createManualTimetable's own overlap rule: a term board conflicts with ANNUAL and itself; ANNUAL with any. */
async function existingBoard(ctx: CapabilityContext, campusId: string, classId: string, academicYear: number, term: string) {
  const termScope = ["TERM_1", "TERM_2", "TERM_3"].includes(term) ? { OR: [{ term: { in: ["ANNUAL", term] } }, { term: { notIn: ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] } }] } : {};
  return prisma.timetable.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, classId, academicYear, ...termScope }, select: { id: true, term: true, status: true } });
}
const campusPeriods = (ctx: CapabilityContext, campusId: string) => prisma.periodDefinition.findMany({ where: { schoolId: ctx.user.schoolId, campusId, timeType: "CLASS" }, orderBy: { periodNumber: "asc" }, take: 30, select: { periodNumber: true, startTime: true, endTime: true } });

const TIMETABLE_CREATE = defineCapability<TimetableInput>({
  key: "timetable.create", version: 1, cluster: "C3", inventoryKeys: ["timetable.create"], risk: "CREATE", roles: LEADS, class: "B",
  input: timetableInput, evidence: [],
  gates: leadGates(permission("timetable", "add")), scope: { kind: "own-campus" },
  copy: c(
    ["Start a blank class timetable", "Create an empty DRAFT timetable board for one class on the campus bell times, to fill on Timetable & cover. Publishing stays a separate step.", "Start a term 2 timetable for 8A"],
    ["إنشاء جدول فارغ لفصل", "إنشاء لوحة جدول فارغة بحالة مسودة لفصل واحد على أوقات الحصص، تُملأ في شاشة الجدول. النشر خطوة منفصلة.", "ابدأ جدول الفصل الثاني للصف 8أ"],
    ["کلاس کا خالی ٹائم ٹیبل بنائیں", "کیمپس کے پیریڈ اوقات پر ایک کلاس کا خالی ڈرافٹ ٹائم ٹیبل بنائیں، جسے ٹائم ٹیبل اسکرین پر بھرا جائے۔ اشاعت الگ مرحلہ ہے۔", "8اے کا دوسری ٹرم کا ٹائم ٹیبل شروع کریں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/timetable", service: "src/lib/timetable/manual.ts:createManualTimetable", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const klass = await campusClass(ctx, campusId, input.classId);
    if (klass.status !== "ACTIVE") throw new WorkflowError("DOMAIN_REFUSED", { reason: "CLASS_NOT_ACTIVE" });
    return { ...input, term: input.term ?? "ANNUAL" };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const klass = await campusClass(ctx, campusId, input.classId);
    const term = input.term ?? "ANNUAL";
    const [existing, periods] = await Promise.all([existingBoard(ctx, campusId, klass.id, klass.academicYear, term), campusPeriods(ctx, campusId)]);
    return {
      title: say(ctx, l("Start a blank class timetable", "إنشاء جدول فارغ لفصل", "کلاس کا خالی ٹائم ٹیبل بنائیں")),
      lines: [
        { label: say(ctx, l("Class", "الفصل", "کلاس")), value: `${classLabel(klass)} · ${klass.academicYear}` },
        { label: say(ctx, l("Term", "الفصل الدراسي", "ٹرم")), value: term },
        { label: say(ctx, l("Bell times", "أوقات الحصص", "پیریڈ کے اوقات")), value: periods.length ? periods.map(row => `${row.periodNumber}: ${row.startTime}–${row.endTime}`).join(", ") : say(ctx, l("The standard school day (no campus periods are set yet)", "اليوم الدراسي القياسي (لم تُحدد حصص الحرم بعد)", "معیاری اسکول دن (کیمپس کے پیریڈ ابھی مقرر نہیں)")) },
        { label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: existing
          ? say(ctx, l(`This class already has a ${existing.term} timetable (${existing.status}); it is kept and nothing new is made.`, `للفصل جدول ${existing.term} (${existing.status}) يبقى كما هو.`, `اس کلاس کا ${existing.term} ٹائم ٹیبل (${existing.status}) پہلے سے ہے؛ وہی رہے گا۔`))
          : say(ctx, l("A DRAFT board is created; teachers, students and families see nothing until it is published.", "تُنشأ لوحة مسودة؛ لا يراها أحد حتى تُنشر.", "ایک ڈرافٹ بنے گا؛ اشاعت تک کوئی اسے نہیں دیکھے گا۔")) },
      ],
      counts: { timetables: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Create draft timetable", "إنشاء مسودة الجدول", "ڈرافٹ ٹائم ٹیبل بنائیں"))} · ${classLabel(klass)}`,
      basis: { input, existing: existing?.id ?? null, periods },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const klass = await campusClass(ctx, campusId, input.classId);
    const term = input.term ?? "ANNUAL";
    const link = consoleLink(ctx, "timetable");
    const keep = (row: { id: string; status: string }) => write("timetable.create", [{ model: "timetable", id: row.id }], { timetables: 0 }, link, { reconciled: true, status: row.status }, "draft");
    const existing = await existingBoard(ctx, campusId, klass.id, klass.academicYear, term);
    if (existing) return keep(existing);
    const periods = await campusPeriods(ctx, campusId);
    try {
      const timetable = await createManualTimetable(ctx.user, campusId, { classId: klass.id, academicYear: klass.academicYear, term, ...(periods.length ? { periods: periods.map(row => ({ period: row.periodNumber, start: row.startTime, end: row.endTime })) } : {}) });
      notify("TIMETABLE_CREATED", { schoolId: ctx.user.schoolId, campusId, actorId: ctx.user.userId, actorName: ctx.user.fullName, className: timetable.class.name });
      return write("timetable.create", [{ model: "timetable", id: timetable.id }], { timetables: 1, slots: timetable.slots.length }, link, { status: timetable.status, term }, "draft");
    } catch (error) {
      const raced = reconciled(error) ? await existingBoard(ctx, campusId, klass.id, klass.academicYear, term) : null;
      if (raced) return keep(raced);
      throw error;
    }
  },
});

// ─── exams.session.create ─────────────────────────────────────────────────

const sessionInput = z.strictObject({
  title: z.string().trim().min(3).max(160),
  examType: z.enum(["MID_TERM", "FINAL"]),
  /** "Term 1", "term 2", "annual"; normalised to the stored labels. */
  term: z.string().trim().min(1).max(40).optional(),
  classIds: z.array(ID).min(1).max(60),
  startDate: DAY,
  endDate: DAY,
  notes: z.string().trim().max(1000).optional(),
  /** Bound by the server: the campus's active academic year (else the classes' own). */
  academicYear: z.number().int().min(2000).max(2100).optional(),
});
type SessionInput = z.infer<typeof sessionInput>;
const sessionTerm = (input: SessionInput) => (input.term ? normaliseExamTerm(input.term) : null) ?? "Term 1";

async function sessionClasses(ctx: CapabilityContext, campusId: string, classIds: readonly string[]) {
  const ids = [...new Set(classIds)];
  const rows = await prisma.class.findMany({ where: { id: { in: ids }, schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, name: true, section: true, status: true, academicYear: true, _count: { select: { subjects: true } } }, orderBy: [{ name: "asc" }, { section: "asc" }] });
  if (rows.length !== ids.length) throw new WorkflowError("SCOPE_DENIED");
  return rows;
}
const sessionNamed = (ctx: CapabilityContext, campusId: string, input: SessionInput, academicYear: number) =>
  prisma.examSession.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, title: input.title.trim(), term: sessionTerm(input), academicYear, examType: input.examType }, select: { id: true, status: true } });

const EXAM_SESSION_CREATE = defineCapability<SessionInput>({
  key: "exams.session.create", version: 1, cluster: "C4", inventoryKeys: ["exams.session.create"], risk: "CREATE", roles: LEADS, class: "B",
  input: sessionInput, evidence: ["/startDate", "/endDate"], humanFields: ["academicYear"],
  gates: leadGates(permission("exams", "add")), scope: { kind: "own-campus" },
  copy: c(
    ["Plan an exam session", "Create a mid-term or final session in PLANNING with one exam per class. Papers, the datesheet and the seal stay in Exam Studio.", "Plan mid-terms 10 to 20 December for grades 6 to 8"],
    ["تخطيط دورة امتحانات", "إنشاء دورة منتصف الفصل أو نهائية بحالة التخطيط مع امتحان لكل فصل. الأوراق وجدول الامتحانات والختم في استوديو الامتحانات.", "خطط لامتحانات منتصف الفصل من 10 إلى 20 ديسمبر للصفوف 6 إلى 8"],
    ["امتحانی سیشن کی منصوبہ بندی", "مڈ ٹرم یا فائنل سیشن پلاننگ کی حالت میں بنائیں، ہر کلاس کا ایک امتحان۔ پرچے، ڈیٹ شیٹ اور سیل ایگزام اسٹوڈیو میں رہیں گے۔", "چھٹی سے آٹھویں جماعت کے مڈ ٹرم 10 سے 20 دسمبر تک رکھیں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/academic/exam-sessions", service: "src/lib/academic/exam-sessions.ts:createExamSession (in withExamSchedulingWrite)", reuse: "wrapper" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const unclear: RequiredField[] = [];
    if (!isRealDay(input.startDate)) unclear.push({ pointer: "/startDate", promptKey: "DATE_INVALID" });
    if (!isRealDay(input.endDate)) unclear.push({ pointer: "/endDate", promptKey: "DATE_INVALID" });
    if (!unclear.length && input.endDate < input.startDate) unclear.push({ pointer: "/endDate", promptKey: "DATE_BEFORE_START" });
    if (unclear.length) throw new InputRequired(unclear);
    const classes = await sessionClasses(ctx, campusId, input.classIds);
    if (classes.every(row => row._count.subjects === 0)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CLASSES_HAVE_NO_SUBJECTS" });
    const cycle = await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, status: "ACTIVE" }, select: { academicYear: true } });
    return { ...input, classIds: classes.map(row => row.id), term: sessionTerm(input), academicYear: input.academicYear ?? cycle?.academicYear ?? classes[0].academicYear };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const classes = await sessionClasses(ctx, campusId, input.classIds);
    const academicYear = input.academicYear ?? classes[0].academicYear;
    const [existing, already] = await Promise.all([
      sessionNamed(ctx, campusId, input, academicYear),
      prisma.exam.findMany({ where: { campusId, classId: { in: classes.map(row => row.id) }, term: sessionTerm(input), academicYear, examType: input.examType }, select: { classId: true } }),
    ]);
    const has = new Set(already.map(row => row.classId));
    const sitting = classes.filter(row => row.status === "ACTIVE" && row._count.subjects > 0 && !has.has(row.id));
    const left = classes.filter(row => !sitting.includes(row));
    return {
      title: say(ctx, l("Plan an exam session", "تخطيط دورة امتحانات", "امتحانی سیشن کی منصوبہ بندی")),
      lines: [
        { label: say(ctx, l("Session", "الدورة", "سیشن")), value: `${input.title} · ${input.examType === "FINAL" ? say(ctx, l("Final", "نهائي", "فائنل")) : say(ctx, l("Mid-term", "منتصف الفصل", "مڈ ٹرم"))} · ${sessionTerm(input)} · ${academicYear}` },
        { label: say(ctx, l("Dates", "التواريخ", "تاریخیں")), value: `${input.startDate} → ${input.endDate}` },
        { label: say(ctx, l("Classes sitting it", "الفصول المشاركة", "شریک کلاسیں")), value: sitting.map(classLabel).join(", ") || "—" },
        ...(left.length ? [{ label: say(ctx, l("Left out (no subjects, not active, or already has this exam)", "مستبعدة (بلا مواد أو غير نشطة أو لديها الامتحان)", "شامل نہیں (مضامین نہیں، غیر فعال، یا امتحان پہلے سے)")), value: left.map(classLabel).join(", ") }] : []),
        { label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: existing
          ? say(ctx, l("This session already exists; it is kept as it is.", "الدورة موجودة مسبقاً وتبقى كما هي.", "یہ سیشن پہلے سے موجود ہے؛ ویسا ہی رہے گا۔"))
          : say(ctx, l("The session starts in PLANNING. Papers, the datesheet and publishing are done in Exam Studio.", "تبدأ الدورة بحالة التخطيط. الأوراق والجدول والنشر في استوديو الامتحانات.", "سیشن پلاننگ میں شروع ہوگا۔ پرچے، ڈیٹ شیٹ اور اشاعت ایگزام اسٹوڈیو میں ہوں گے۔")) },
      ],
      counts: { sessions: existing ? 0 : 1, exams: existing ? 0 : sitting.length },
      confirmLabel: `${say(ctx, l("Create exam session", "إنشاء الدورة", "سیشن بنائیں"))} · ${sitting.length}`,
      basis: { input, existing: existing?.id ?? null, sitting: sitting.map(row => row.id) },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const classes = await sessionClasses(ctx, campusId, input.classIds);
    const academicYear = input.academicYear ?? classes[0].academicYear;
    const link = consoleLink(ctx, "exam-cycles");
    const existing = await sessionNamed(ctx, campusId, input, academicYear);
    if (existing) return write("exams.session.create", [{ model: "examSession", id: existing.id }], { sessions: 0, exams: 0 }, link, { reconciled: true, status: existing.status });
    const created = await withExamSchedulingWrite(ctx.user, campusId, "add", tx => createExamSession({
      db: tx, schoolId: ctx.user.schoolId, campusId, userId: ctx.user.userId, title: input.title, term: sessionTerm(input), academicYear, examType: input.examType,
      classIds: classes.map(row => row.id), startDate: input.startDate, endDate: input.endDate, notes: input.notes ?? null,
    }));
    notify("EXAM_SESSION_SCHEDULED", { schoolId: ctx.user.schoolId, campusId, actorId: ctx.user.userId, sessionId: created.session.id, sessionTitle: input.title, classIds: classes.map(row => row.id) });
    return write("exams.session.create", [{ model: "examSession", id: created.session.id }], { sessions: 1, exams: created.created }, link, { status: created.session.status, skipped: created.skipped, noSubjects: created.noSubjects });
  },
});

// ─── exams.invigilation.assign ────────────────────────────────────────────

const invigilationInput = z.strictObject({
  /** The exam session as the user named it ("mid-terms"). */
  session: z.string().trim().min(1).max(160),
  /** Narrows the duty: the class sitting, the subject, the paper's date and the room. */
  classId: ID.optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  date: DAY.optional(),
  room: z.string().trim().min(1).max(128).optional(),
  /** The invigilator as the user named them. */
  teacher: z.string().trim().min(1).max(120),
  /** Bound by the server: the duty, the invigilator and the duty's hash as it was previewed. */
  examRoomId: ID.optional(),
  teacherId: ID.optional(),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
type InvigilationInput = z.infer<typeof invigilationInput>;

async function campusSession(ctx: CapabilityContext, campusId: string, said: string) {
  const sessions = await prisma.examSession.findMany({ where: { schoolId: ctx.user.schoolId, campusId }, select: { id: true, title: true, term: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { title: "asc" }] });
  const found = matchName(sessions, said, row => [row.title, `${row.title} ${row.term}`]);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer: "/session", promptKey: "EXAM_SESSION_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: `${row.title} ${row.term}`, label: `${row.title} · ${row.term} · ${row.academicYear}` })) }
    : { pointer: "/session", promptKey: "EXAM_SESSION_NOT_FOUND" }]);
}

async function invigilationDuty(ctx: CapabilityContext, campusId: string, input: InvigilationInput) {
  const session = await campusSession(ctx, campusId, input.session);
  const roster = await listExamInvigilation(ctx.user, session.id);
  let duties = roster.duties;
  if (input.examRoomId) duties = duties.filter(duty => duty.examRoomId === input.examRoomId);
  else {
    const klass = input.classId ? await campusClass(ctx, campusId, input.classId) : null;
    if (klass) duties = duties.filter(duty => fold(duty.className) === fold([klass.name, klass.section].filter(Boolean).join(" · ")));
    if (input.subject) duties = duties.filter(duty => subjectMatches(duty.subjectName, input.subject!));
    if (input.date) duties = duties.filter(duty => duty.date === input.date);
    if (input.room) duties = duties.filter(duty => duty.examRoomId === input.room || fold(duty.roomNumber) === fold(input.room!));
  }
  if (input.examRoomId && !duties.length) throw new WorkflowError("NOT_FOUND");
  if (duties.length !== 1) throw new InputRequired([duties.length
    ? { pointer: "/room", promptKey: "EXAM_DUTY_AMBIGUOUS", params: { count: duties.length }, options: duties.slice(0, 8).map(duty => ({ value: duty.examRoomId, label: `${duty.className} · ${duty.subjectName} · ${duty.date} · ${duty.roomNumber}` })) }
    : { pointer: "/date", promptKey: "EXAM_DUTY_NOT_FOUND" }]);
  const duty = duties[0];
  if (!duty.editable) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EXAM_NOT_EDITABLE" });
  const teacher = input.teacherId ? roster.teachers.find(row => row.id === input.teacherId) : null;
  if (input.teacherId && !teacher) throw new WorkflowError("SCOPE_DENIED");
  const found = teacher ? [teacher] : matchName(roster.teachers, input.teacher, row => [row.fullName]);
  if (found.length !== 1) throw new InputRequired([found.length
    ? { pointer: "/teacher", promptKey: "STAFF_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.fullName, label: row.fullName })) }
    : { pointer: "/teacher", promptKey: "STAFF_NOT_FOUND", params: { name: input.teacher.slice(0, 80) } }]);
  return { session, duty, teacher: found[0] };
}

const INVIGILATION_ASSIGN = defineCapability<InvigilationInput>({
  key: "exams.invigilation.assign", version: 1, cluster: "C4", inventoryKeys: ["exams.invigilation.assign"], risk: "UPDATE", roles: LEADS, class: "B",
  input: invigilationInput, evidence: ["/teacher"], humanFields: ["examRoomId", "teacherId", "expectedHash"],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Choose an invigilator", "Put a teacher on one exam-room duty of a session. If the duty or datesheet changed after you saw it, nothing is saved.", "Put Bilal on the 12 December physics paper in room 101"],
    ["تعيين مراقب امتحان", "عيّن معلماً لمهمة مراقبة قاعة في دورة امتحانات. إن تغيّرت المهمة أو الجدول بعد المعاينة فلن يُحفظ شيء.", "عيّن بلال لمراقبة امتحان الفيزياء يوم 12 ديسمبر في القاعة 101"],
    ["نگران مقرر کریں", "سیشن کے کسی امتحانی کمرے کی ڈیوٹی پر استاد لگائیں۔ اگر دیکھنے کے بعد ڈیوٹی یا ڈیٹ شیٹ بدل گئی تو کچھ محفوظ نہیں ہوگا۔", "12 دسمبر کے فزکس کے پرچے پر کمرہ 101 میں بلال کی ڈیوٹی لگائیں"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "PATCH /api/academic/exam-schedule/invigilation", service: "src/lib/academic/exam-invigilation.ts:updateExamInvigilation (expectedHash)", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const { duty, teacher } = await invigilationDuty(ctx, campusId, input);
    return { ...input, teacher: teacher.fullName, examRoomId: duty.examRoomId, teacherId: teacher.id, expectedHash: duty.expectedHash };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const { session, duty, teacher } = await invigilationDuty(ctx, campusId, input);
    const same = duty.teacherId === teacher.id;
    return {
      title: say(ctx, l("Choose an invigilator", "تعيين مراقب امتحان", "نگران مقرر کریں")),
      lines: [
        { label: say(ctx, l("Session", "الدورة", "سیشن")), value: session.title },
        { label: say(ctx, l("Paper", "الورقة", "پرچہ")), value: `${duty.className} · ${duty.subjectName} · ${duty.date}${duty.startTime ? ` ${duty.startTime}–${duty.endTime}` : ""}` },
        { label: say(ctx, l("Room", "القاعة", "کمرہ")), value: duty.roomNumber },
        { label: say(ctx, l("Invigilator now", "المراقب الحالي", "موجودہ نگران")), value: duty.teacherName ?? say(ctx, NOBODY) },
        { label: say(ctx, l("New invigilator", "المراقب الجديد", "نیا نگران")), value: same ? `${teacher.fullName} · ${say(ctx, l("already set, nothing changes", "معيّن مسبقاً، لا تغيير", "پہلے سے مقرر، کچھ نہیں بدلے گا"))}` : teacher.fullName },
      ],
      counts: { duties: same ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Save duty", "حفظ المهمة", "ڈیوٹی محفوظ کریں"))} · ${teacher.fullName}`,
      basis: { input, expectedHash: duty.expectedHash },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    if (!input.examRoomId || !input.teacherId || !input.expectedHash) throw new WorkflowError("STALE_VERSION");
    const { duty, teacher } = await invigilationDuty(ctx, campusId, input);
    const link = consoleLink(ctx, "exam-cycles");
    if (duty.teacherId === teacher.id) return write("exams.invigilation.assign", [{ model: "examRoom", id: duty.examRoomId }], { duties: 0 }, link, { reconciled: true, teacherId: teacher.id });
    // The domain refuses (409 → STALE_VERSION) if the duty or datesheet changed since the person saw it.
    const saved = await updateExamInvigilation(ctx.user, { examRoomId: duty.examRoomId, teacherId: teacher.id, expectedHash: input.expectedHash });
    return write("exams.invigilation.assign", [{ model: "examRoom", id: duty.examRoomId }], { duties: 1 }, link, { teacherId: saved.duty.teacherId, previousTeacherId: duty.teacherId });
  },
});

// ─── academic.model.create_draft ──────────────────────────────────────────

const weights = z.strictObject({ quiz: z.number().int().min(0).max(100), classTest: z.number().int().min(0).max(100), midTerm: z.number().int().min(0).max(100), final: z.number().int().min(0).max(100) })
  .refine(value => value.quiz + value.classTest + value.midTerm + value.final === 100, "The four weights add up to 100.");
const modelDraftInput = z.strictObject({
  /** Sections of one class (cohort) in the same year, e.g. all grade 9 sections. */
  classIds: z.array(ID).min(1).max(20),
  /** The user's weights, or the school's standard ones when they said so. */
  weights: z.union([z.literal("SCHOOL_DEFAULT"), weights]),
  passPercent: z.number().int().min(0).max(100).optional(),
  title: z.string().trim().min(3).max(100).optional(),
  effectiveFrom: DAY.optional(),
});
type ModelDraftInput = z.infer<typeof modelDraftInput>;

async function cohort(ctx: CapabilityContext, campusId: string, classIds: readonly string[]) {
  const ids = [...new Set(classIds)];
  const rows = await prisma.class.findMany({ where: { id: { in: ids }, schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, name: true, section: true, status: true, academicYear: true, subjects: { select: { id: true, name: true }, orderBy: { name: "asc" } } }, orderBy: { section: "asc" } });
  if (rows.length !== ids.length) throw new WorkflowError("SCOPE_DENIED");
  if (rows.some(row => row.status !== "ACTIVE")) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CLASS_NOT_ACTIVE" });
  if (new Set(rows.map(row => row.name.trim().toLocaleLowerCase())).size !== 1 || new Set(rows.map(row => row.academicYear)).size !== 1) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ONE_COHORT" });
  return rows;
}

/** The POST /api/academic-models body the Curriculum & grading screen would send for this cohort. */
function modelDraftBody(campusId: string, input: ModelDraftInput, classes: Awaited<ReturnType<typeof cohort>>) {
  const academicYear = classes[0].academicYear;
  const mappings = new Map<string, { code: string; label: string; subjectIds: string[] }>();
  for (const subject of classes.flatMap(row => row.subjects)) {
    const code = academicModelCohortKey(subject.name).toUpperCase() || subject.id;
    const row = mappings.get(code) ?? { code, label: subject.name.trim(), subjectIds: [] };
    row.subjectIds.push(subject.id); mappings.set(code, row);
  }
  const base = DEFAULT_ACADEMIC_MODEL;
  const configuration: AcademicModelConfiguration = {
    ...base,
    classIds: classes.map(row => row.id),
    subjectMappings: [...mappings.values()],
    grading: {
      ...base.grading,
      ...(input.weights === "SCHOOL_DEFAULT" ? {} : { quizWeight: input.weights.quiz, classTestWeight: input.weights.classTest, midTermWeight: input.weights.midTerm, finalWeight: input.weights.final }),
      ...(input.passPercent !== undefined ? { passingPercentage: input.passPercent } : {}),
    },
    progression: { ...base.progression, ...(input.passPercent !== undefined ? { passPercentage: input.passPercent } : {}) },
  };
  return { campusId, academicYear, configuration, effectiveFrom: input.effectiveFrom ?? `${academicYear}-01-01`, ...(input.title ? { title: input.title } : {}) };
}

const MODEL_CREATE_DRAFT = defineCapability<ModelDraftInput>({
  key: "academic.model.create_draft", version: 1, cluster: "C4", inventoryKeys: ["academic.model.create_draft"], risk: "CREATE", roles: LEADS, class: "B",
  input: modelDraftInput, evidence: ["/weights"],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Draft a grading model", "Save a DRAFT grading model for one class's sections: assessment weights, pass mark, grade bands and subject mapping. Activating it is a separate step on Curriculum & grading.", "Grade 9 is quizzes 10, tests 20, mid-term 30 and final 40, pass at 40"],
    ["مسودة نموذج التقييم", "حفظ مسودة نموذج تقييم لشعب فصل واحد: أوزان التقييم ودرجة النجاح وفئات التقدير وربط المواد. التفعيل خطوة منفصلة في شاشة المنهج والتقييم.", "الصف التاسع: اختبارات قصيرة 10 واختبارات 20 ومنتصف الفصل 30 والنهائي 40 والنجاح 40"],
    ["گریڈنگ ماڈل کا ڈرافٹ", "ایک کلاس کے سیکشنز کے لیے گریڈنگ ماڈل کا ڈرافٹ محفوظ کریں: جائزوں کا وزن، پاس نمبر، گریڈ اور مضامین۔ اسے فعال کرنا نصاب اور گریڈنگ اسکرین پر الگ مرحلہ ہے۔", "نویں جماعت: کوئز 10، ٹیسٹ 20، مڈ ٹرم 30 اور فائنل 40، پاسنگ 40"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/academic-models", service: "src/lib/academic/model-draft-command.ts:createAcademicModelDraft", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const classes = await cohort(ctx, campusId, input.classIds);
    return { ...input, classIds: classes.map(row => row.id) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const classes = await cohort(ctx, campusId, input.classIds);
    const body = modelDraftBody(campusId, input, classes);
    const grading = body.configuration.grading;
    const previous = await prisma.academicModelVersion.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, academicYear: body.academicYear, cohortKey: academicModelCohortKey(classes[0].name) }, orderBy: { version: "desc" }, select: { version: true } });
    return {
      title: say(ctx, l("Draft a grading model", "مسودة نموذج التقييم", "گریڈنگ ماڈل کا ڈرافٹ")),
      lines: [
        { label: say(ctx, l("Cohort", "الفوج", "جماعت")), value: `${classes[0].name} · ${classes.map(classLabel).join(", ")} · ${body.academicYear}` },
        { label: say(ctx, l("Weights", "الأوزان", "وزن")), value: `${say(ctx, l("Quiz", "اختبار قصير", "کوئز"))} ${grading.quizWeight} · ${say(ctx, l("Class test", "اختبار", "ٹیسٹ"))} ${grading.classTestWeight} · ${say(ctx, l("Mid-term", "منتصف الفصل", "مڈ ٹرم"))} ${grading.midTermWeight} · ${say(ctx, l("Final", "نهائي", "فائنل"))} ${grading.finalWeight}${input.weights === "SCHOOL_DEFAULT" ? ` (${say(ctx, l("school standard", "المعتمد في المدرسة", "اسکول کا معیاری"))})` : ""}` },
        { label: say(ctx, l("Pass mark", "درجة النجاح", "پاسنگ نمبر")), value: `${grading.passingPercentage}%` },
        { label: say(ctx, l("Grade bands", "فئات التقدير", "گریڈ")), value: grading.thresholds.map(row => `${row.label} ≥ ${row.minimum}`).join(", ") },
        { label: say(ctx, l("Subjects mapped", "المواد المربوطة", "منسلک مضامین")), value: body.configuration.subjectMappings.map(row => row.label).join(", ") || "—" },
        { label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: say(ctx, l(`Saved as DRAFT version ${(previous?.version ?? 0) + 1}. Results do not change until it is activated on Curriculum & grading.`, `يُحفظ كمسودة الإصدار ${(previous?.version ?? 0) + 1}. لا تتغير النتائج حتى التفعيل.`, `ڈرافٹ ورژن ${(previous?.version ?? 0) + 1} کے طور پر محفوظ ہوگا۔ فعال ہونے تک نتائج نہیں بدلیں گے۔`)) },
      ],
      counts: { drafts: 1 },
      confirmLabel: `${say(ctx, l("Save grading draft", "حفظ المسودة", "ڈرافٹ محفوظ کریں"))} · ${classes[0].name}`,
      basis: { input, body, previous: previous?.version ?? 0 },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const classes = await cohort(ctx, campusId, input.classIds);
    const body = modelDraftBody(campusId, input, classes);
    const link = consoleLink(ctx, "academic-rules&tab=curriculum", "settings&tab=academic-rules");
    // A replay finds the draft it made: same cohort and year, by this person, with the same rules.
    const drafts = await prisma.academicModelVersion.findMany({ where: { schoolId: ctx.user.schoolId, campusId, academicYear: body.academicYear, cohortKey: academicModelCohortKey(classes[0].name), status: "DRAFT", createdBy: ctx.user.userId }, orderBy: { version: "desc" }, select: { id: true, version: true, configuration: true, title: true, effectiveFrom: true } });
    const same = drafts.find(row => stable(row.configuration) === stable(body.configuration) && row.effectiveFrom.toISOString().slice(0, 10) === body.effectiveFrom && (!input.title || row.title === input.title));
    if (same) return write("academic.model.create_draft", [{ model: "academicModelVersion", id: same.id }], { drafts: 0 }, link, { reconciled: true, version: same.version, status: "DRAFT" }, "draft");
    const result = await createAcademicModelDraft(ctx.user, body);
    if (!result.ok) throw new WorkflowError("DOMAIN_REFUSED", { reason: "INVALID_CONFIGURATION" });
    return write("academic.model.create_draft", [{ model: "academicModelVersion", id: result.model.id }], { drafts: 1 }, link, { version: result.model.version, status: result.model.status, cohortLabel: result.model.cohortLabel, title: result.model.title }, "draft");
  },
});

// ─── improvement.create_framework ─────────────────────────────────────────

const frameworkInput = z.strictObject({
  /** The standards' name as the user gave it ("PEC school standards"). */
  name: z.string().trim().min(2).max(120),
  version: z.string().trim().min(1).max(40).optional(),
  /** The criteria the user listed; nothing is added from the model's own knowledge. */
  criteria: z.array(z.strictObject({ code: z.string().trim().min(1).max(30), title: z.string().trim().min(2).max(300) })).min(1).max(200),
});
type FrameworkInput = z.infer<typeof frameworkInput>;
const frameworkNamed = (ctx: CapabilityContext, input: FrameworkInput) => prisma.evidenceFramework.findFirst({ where: { schoolId: ctx.user.schoolId, name: input.name, version: input.version ?? "1" }, select: { id: true, status: true } });

const IMPROVEMENT_FRAMEWORK = defineCapability<FrameworkInput>({
  key: "improvement.create_framework", version: 1, cluster: "C8", inventoryKeys: ["improvement.create_framework"], risk: "CREATE", roles: LEADS, class: "B",
  input: frameworkInput, evidence: ["/name", "/criteria/*/title"],
  gates: leadGates(), scope: { kind: "own-campus" },
  copy: c(
    ["Set up inspection standards", "Create the framework your school reports against, with the criteria you list, so evidence can be linked to it. It implies no accreditation outcome.", "Add our board's standards: 1 Leadership, 2 Teaching quality, 3 Learner wellbeing"],
    ["إعداد معايير التفتيش", "أنشئ الإطار الذي تقدّم المدرسة تقاريرها وفقه بالمعايير التي تذكرها، لربط الأدلة به. لا يعني أي نتيجة اعتماد.", "أضف معايير مجلسنا: 1 القيادة، 2 جودة التدريس، 3 رفاه المتعلم"],
    ["معائنے کے معیارات بنائیں", "وہ فریم ورک بنائیں جس کے مطابق اسکول رپورٹ کرتا ہے، آپ کے بتائے معیارات کے ساتھ، تاکہ شواہد اس سے جوڑے جا سکیں۔ اس سے کسی منظوری کا نتیجہ نہیں نکلتا۔", "ہمارے بورڈ کے معیارات شامل کریں: 1 قیادت، 2 تدریس کا معیار، 3 طلبہ کی بہبود"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/improvement (action=framework)", service: "src/lib/improvement/service.ts:createFramework", reuse: "direct" },
  async resolve(ctx, input) {
    await leadCampus(ctx);
    const codes = input.criteria.map(row => row.code.trim().toLowerCase());
    if (new Set(codes).size !== codes.length) throw new InputRequired([{ pointer: "/criteria", promptKey: "CRITERION_CODES_REPEAT" }]);
    return { ...input, version: input.version ?? "1" };
  },
  async preview(ctx, input) {
    ownCampusId(ctx);
    const existing = await frameworkNamed(ctx, input);
    return {
      title: say(ctx, l("Set up inspection standards", "إعداد معايير التفتيش", "معائنے کے معیارات بنائیں")),
      lines: [
        { label: say(ctx, l("Framework", "الإطار", "فریم ورک")), value: `${input.name} · v${input.version ?? "1"}` },
        ...input.criteria.slice(0, 40).map(row => ({ label: row.code, value: row.title })),
        ...(existing ? [{ label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: say(ctx, l("This framework version already exists; it is kept as it is.", "هذا الإصدار موجود ويبقى كما هو.", "یہ ورژن پہلے سے موجود ہے؛ ویسا ہی رہے گا۔")) }] : []),
      ],
      counts: { frameworks: existing ? 0 : 1, criteria: existing ? 0 : input.criteria.length },
      confirmLabel: `${say(ctx, l("Create framework", "إنشاء الإطار", "فریم ورک بنائیں"))} · ${input.criteria.length}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const keep = (row: { id: string; status: string }) => write("improvement.create_framework", [{ model: "evidenceFramework", id: row.id }], { frameworks: 0 }, "/improvement", { reconciled: true, status: row.status });
    const existing = await frameworkNamed(ctx, input);
    if (existing) return keep(existing);
    try {
      const framework = await createFramework(ctx.user, { name: input.name, version: input.version ?? "1", campusId, criteria: input.criteria });
      return write("improvement.create_framework", [{ model: "evidenceFramework", id: framework.id }], { frameworks: 1, criteria: input.criteria.length }, "/improvement", { status: framework.status });
    } catch (error) {
      const raced = reconciled(error) ? await frameworkNamed(ctx, input) : null;
      if (raced) return keep(raced);
      throw error;
    }
  },
});

// ─── staff.propose_cover ──────────────────────────────────────────────────

const coverInput = z.strictObject({
  /** The absent teacher as the user named them ("Ms Noor"). */
  teacher: z.string().trim().min(1).max(120),
  date: DAY,
  /** "periods 2-4": only these periods; left out, every uncovered lesson of theirs that day. */
  periods: z.array(z.number().int().min(1).max(30)).min(1).max(30).optional(),
  /** Who should cover, when the user named someone; otherwise the best free colleague per lesson. */
  coverBy: z.string().trim().min(1).max(120).optional(),
  /** Bound by the server: one duty per lesson. */
  duties: z.array(z.strictObject({ slotId: ID, teacherId: ID })).max(100).optional(),
});
type CoverInput = z.infer<typeof coverInput>;

async function coverLessons(ctx: CapabilityContext, campusId: string, input: CoverInput) {
  if (!isRealDay(input.date)) throw new InputRequired([{ pointer: "/date", promptKey: "DATE_INVALID" }]);
  const board = await coverBoard(ctx.user, campusId, input.date);
  const absent = [...new Set(board.lessons.map(lesson => lesson.absentTeacher).filter((name): name is string => Boolean(name)))];
  const names = matchName(absent, input.teacher, name => [name]);
  if (names.length > 1) throw new InputRequired([{ pointer: "/teacher", promptKey: "STAFF_AMBIGUOUS", params: { count: names.length }, options: names.slice(0, 8).map(name => ({ value: name, label: name })) }]);
  // Cover is planned only for lessons whose teacher is on approved leave that day (workload.ts coverBoard).
  if (!names.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_UNCOVERED_LESSONS" });
  const lessons = board.lessons.filter(lesson => lesson.absentTeacher === names[0] && (!input.periods || input.periods.includes(lesson.period)));
  if (!lessons.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_UNCOVERED_LESSONS" });
  return { board, absentTeacher: names[0], lessons };
}
function chooseCover(lessons: Awaited<ReturnType<typeof coverLessons>>["lessons"], input: CoverInput) {
  const unclear: RequiredField[] = [];
  const duties = lessons.flatMap(lesson => {
    const bound = input.duties?.find(duty => duty.slotId === lesson.slotId);
    const eligible = lesson.candidates.filter(candidate => candidate.eligible);
    const pick = bound ? eligible.find(candidate => candidate.id === bound.teacherId)
      : input.coverBy ? matchName(eligible, input.coverBy, candidate => [candidate.name])[0] : eligible[0];
    if (!pick) {
      if (input.coverBy || bound) unclear.push({ pointer: "/coverBy", promptKey: "COVER_TEACHER_UNAVAILABLE", params: { period: lesson.period }, options: eligible.slice(0, 8).map(candidate => ({ value: candidate.name, label: `${candidate.name}${candidate.reasons.length ? ` · ${candidate.reasons.join("; ")}` : ""}` })) });
      return [];
    }
    return [{ lesson, candidate: pick }];
  });
  if (unclear.length) throw new InputRequired(unclear.slice(0, 1));
  if (!duties.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ELIGIBLE_COVER" });
  return duties;
}
/** proposeCover takes [A-Za-z0-9_-]{8,120}; our step keys already are, anything else is hashed into that shape. */
const coverKey = (key: string) => (/^[A-Za-z0-9_-]{8,114}$/.test(key) ? key : createHash("sha256").update(key).digest("hex").slice(0, 64));

const PROPOSE_COVER = defineCapability<CoverInput>({
  key: "staff.propose_cover", version: 1, cluster: "C3", inventoryKeys: ["staff.propose_cover"], risk: "CREATE", roles: LEADS, class: "B",
  input: coverInput, evidence: ["/teacher", "/date"], humanFields: ["duties"],
  gates: leadGates(), scope: { kind: "own-campus" },
  copy: c(
    ["Arrange cover for an absent teacher", "Propose a free colleague for each lesson of a teacher on approved leave. It goes to cover review as a proposal; the timetable is unchanged until it is approved.", "Cover Ms Noor periods 2-4 tomorrow"],
    ["ترتيب بديل لمعلم غائب", "اقترح زميلاً متفرغاً لكل حصة لمعلم في إجازة معتمدة. يُرسل كمقترح لمراجعة البدلاء؛ لا يتغير الجدول قبل الاعتماد.", "غطِّ حصص الأستاذة نور من الثانية إلى الرابعة غداً"],
    ["غیر حاضر استاد کے متبادل کا انتظام", "منظور شدہ چھٹی پر استاد کے ہر پیریڈ کے لیے فارغ ساتھی تجویز کریں۔ یہ تجویز متبادل کے جائزے میں جائے گی؛ منظوری تک ٹائم ٹیبل نہیں بدلے گا۔", "کل مس نور کے پیریڈ 2 سے 4 کا متبادل لگا دیں"],
  ),
  idempotency: { mode: "native" },
  source: { route: "POST /api/staff/cover", service: "src/lib/staff/workload.ts:proposeCover (a timetable.assign_substitutes proposal)", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const { absentTeacher, lessons } = await coverLessons(ctx, campusId, input);
    const duties = chooseCover(lessons, input);
    return { ...input, teacher: absentTeacher, duties: duties.map(item => ({ slotId: item.lesson.slotId, teacherId: item.candidate.id })) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const { absentTeacher, lessons } = await coverLessons(ctx, campusId, input);
    const duties = chooseCover(lessons, input);
    return {
      title: say(ctx, l("Arrange cover for an absent teacher", "ترتيب بديل لمعلم غائب", "غیر حاضر استاد کے متبادل کا انتظام")),
      lines: [
        { label: say(ctx, l("Absent", "الغائب", "غیر حاضر")), value: `${absentTeacher} · ${input.date}` },
        ...duties.map(({ lesson, candidate }) => ({ label: `P${lesson.period} ${lesson.startTime}–${lesson.endTime} · ${lesson.className}${lesson.subject ? ` · ${lesson.subject}` : ""}`, value: `${candidate.name}${candidate.warnings.length ? ` ⚠ ${candidate.warnings.join("; ")}` : ""}` })),
        ...(duties.length < lessons.length ? [{ label: say(ctx, l("No one free", "لا يوجد متفرغ", "کوئی فارغ نہیں")), value: lessons.filter(lesson => !duties.some(item => item.lesson.slotId === lesson.slotId)).map(lesson => `P${lesson.period}`).join(", ") }] : []),
      ],
      counts: { lessons: duties.length, uncovered: lessons.length - duties.length },
      confirmLabel: `${say(ctx, l("Send cover for review", "إرسال للمراجعة", "جائزے کے لیے بھیجیں"))} · ${duties.length}`,
      basis: { input, duties: duties.map(item => [item.lesson.slotId, item.candidate.id]) },
    };
  },
  async execute(ctx, input, { idempotencyKey }): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const duties = (input.duties ?? []).map(duty => ({ slotId: duty.slotId, teacherId: duty.teacherId, reason: `Cover for ${input.teacher} (approved leave)` }));
    if (!duties.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ELIGIBLE_COVER" });
    const proposal = await proposeCover(ctx.user, campusId, { date: input.date, duties, idempotencyKey: coverKey(idempotencyKey) });
    return write("staff.propose_cover", [{ model: "schoolAiRecord", id: proposal.recordId }], { lessons: proposal.duties }, "/ai?workflow=schoolOperations", { status: proposal.status, reviewedBy: "timetable.assign_substitutes" }, "draft");
  },
});

// ─── learning_actions.save_draft ──────────────────────────────────────────

const learningInput = z.strictObject({
  classId: ID,
  subjectId: ID.optional(),
  /** Learners the user named; or `belowPercent` picks them from their latest marks in the subject. */
  pupils: z.array(z.strictObject({ name: z.string().trim().min(1).max(160) })).min(1).max(30).optional(),
  belowPercent: z.number().min(1).max(100).optional(),
  title: z.string().trim().min(3).max(160),
  /** Why support is needed, in the user's words. */
  concern: z.string().trim().min(3).max(2000),
  goal: z.string().trim().min(10).max(500).optional(),
  /** The responsible adult as the user named them. */
  owner: z.string().trim().min(1).max(120).optional(),
  reviewDate: DAY.optional(),
  nextCheckInDate: DAY.optional(),
  plannedActivity: z.string().trim().max(2000).optional(),
  /** Bound by the server: each learner and the mark that is the evidence for them. */
  learners: z.array(z.strictObject({ studentId: ID, markId: ID.nullable(), label: z.string().max(200) })).max(30).optional(),
  ownerId: ID.optional(),
}).refine(value => Boolean(value.pupils?.length) || value.belowPercent !== undefined || Boolean(value.learners?.length), "Name the learners or give a score threshold.")
  .refine(value => value.belowPercent === undefined || Boolean(value.subjectId), "A score threshold needs a subject.");
type LearningInput = z.infer<typeof learningInput>;
const OWNER_ROLES: readonly UserRole[] = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"];

/** Each learner's most recent scored mark in the subject (absent and exempt papers are not evidence of attainment). */
async function latestMarks(ctx: CapabilityContext, campusId: string, studentIds: readonly string[], subjectId: string) {
  const marks = await prisma.mark.findMany({
    where: { schoolId: ctx.user.schoolId, campusId, subjectId, studentId: { in: [...studentIds] }, isAbsent: false, isExempt: false },
    select: { id: true, studentId: true, marksObtained: true, subject: { select: { name: true, totalMarks: true } }, exam: { select: { title: true, activatedAt: true } } },
    orderBy: [{ exam: { activatedAt: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
  });
  const latest = new Map<string, (typeof marks)[number]>();
  for (const mark of marks) if (!latest.has(mark.studentId)) latest.set(mark.studentId, mark);
  return latest;
}
const markLabel = (mark: { marksObtained: number; subject: { name: string; totalMarks: number }; exam: { title: string } }) => `${mark.exam.title} · ${mark.subject.name} ${mark.marksObtained}/${mark.subject.totalMarks}`.slice(0, 200);

async function learningScope(ctx: CapabilityContext, campusId: string, input: LearningInput) {
  await campusClass(ctx, campusId, input.classId);
  if (input.subjectId && !(await prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: ctx.user.schoolId, campusId, classId: input.classId }, select: { id: true } }))) throw new WorkflowError("SCOPE_DENIED");
  const roster = await classRoster(ctx, input.classId);
  if (input.learners?.length) {
    const ids = new Set(roster.map(pupil => pupil.id));
    if (input.learners.some(row => !ids.has(row.studentId))) throw new WorkflowError("SCOPE_DENIED");
    return input.learners;
  }
  if (input.pupils?.length) {
    const bound = resolvePupils(roster, input.pupils.map((pupil, index) => ({ pointer: `/pupils/${index}/name`, text: pupil.name })));
    const pupils = [...new Map([...bound.values()].map(pupil => [pupil.id, pupil])).values()];
    const marks = input.subjectId ? await latestMarks(ctx, campusId, pupils.map(pupil => pupil.id), input.subjectId) : new Map();
    return pupils.map(pupil => { const mark = marks.get(pupil.id); return { studentId: pupil.id, markId: mark?.id ?? null, label: mark ? `${pupilLabel(pupil)} · ${markLabel(mark)}` : pupilLabel(pupil) }; });
  }
  const marks = await latestMarks(ctx, campusId, roster.map(pupil => pupil.id), input.subjectId!);
  const below = roster.flatMap(pupil => {
    const mark = marks.get(pupil.id);
    return mark && mark.subject.totalMarks > 0 && (mark.marksObtained / mark.subject.totalMarks) * 100 < input.belowPercent! ? [{ studentId: pupil.id, markId: mark.id, label: `${pupilLabel(pupil)} · ${markLabel(mark)}` }] : [];
  });
  if (!below.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_LEARNERS_BELOW_THRESHOLD" });
  if (below.length > 30) throw new WorkflowError("DOMAIN_REFUSED", { reason: "TOO_MANY_LEARNERS", count: below.length });
  return below;
}
const openDraft = (ctx: CapabilityContext, campusId: string, input: LearningInput, studentId: string) =>
  prisma.interventionPlan.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, studentId, title: input.title, status: "DRAFT", createdBy: ctx.user.userId, subjectId: input.subjectId ?? null }, select: { id: true } });

const LEARNING_SAVE_DRAFT = defineCapability<LearningInput>({
  key: "learning_actions.save_draft", version: 1, cluster: "C5", inventoryKeys: ["learning_actions.save_draft"], risk: "CREATE", roles: LEADS, class: "B",
  input: learningInput, evidence: ["/concern"], humanFields: ["learners", "ownerId"],
  gates: leadGates(), scope: { kind: "own-campus" },
  copy: c(
    ["Draft support plans for learners", "Save a DRAFT learning action for each named learner, or for each learner below a score in a subject, with their mark as evidence. Activation is a separate decision.", "Make a support plan for grade 9 learners below 40% in maths"],
    ["مسودة خطط دعم للطلاب", "احفظ مسودة إجراء تعلّم لكل طالب مذكور، أو لكل طالب دون درجة في مادة، مع درجته دليلاً. التفعيل قرار منفصل.", "أنشئ خطة دعم للطلاب الذين حصلوا على أقل من 40% في رياضيات الصف التاسع"],
    ["طلبہ کے لیے مدد کے منصوبوں کا ڈرافٹ", "ہر نامزد طالب علم، یا کسی مضمون میں مقررہ نمبر سے کم والے ہر طالب علم کے لیے، ان کے نمبر بطور ثبوت کے ساتھ لرننگ ایکشن کا ڈرافٹ محفوظ کریں۔ فعال کرنا الگ فیصلہ ہے۔", "نویں جماعت ریاضی میں 40 فیصد سے کم والوں کے لیے مدد کا منصوبہ بنائیں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/learning-actions", service: "src/lib/learning/actions.ts:saveLearningAction", reuse: "direct" },
  async resolve(ctx, input) {
    const campusId = await leadCampus(ctx);
    const unclear: RequiredField[] = [];
    for (const field of ["reviewDate", "nextCheckInDate"] as const) if (input[field] && !isRealDay(input[field]!)) unclear.push({ pointer: `/${field}`, promptKey: "DATE_INVALID" });
    if (unclear.length) throw new InputRequired(unclear);
    const learners = await learningScope(ctx, campusId, input);
    const owner = input.owner ? await campusPerson(ctx, campusId, input.owner, "/owner", OWNER_ROLES, input.ownerId) : null;
    return { ...input, learners, ...(owner ? { owner: owner.fullName, ownerId: owner.id } : {}) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const learners = await learningScope(ctx, campusId, input);
    const kept = (await Promise.all(learners.map(row => openDraft(ctx, campusId, input, row.studentId)))).filter(Boolean).length;
    return {
      title: say(ctx, l("Draft support plans for learners", "مسودة خطط دعم للطلاب", "طلبہ کے لیے مدد کے منصوبوں کا ڈرافٹ")),
      lines: [
        { label: say(ctx, l("Plan", "الخطة", "منصوبہ")), value: input.title },
        { label: say(ctx, l("Concern", "سبب القلق", "تشویش")), value: input.concern },
        ...(input.owner ? [{ label: say(ctx, l("Responsible adult", "المسؤول", "ذمہ دار")), value: input.owner }] : []),
        ...learners.map(row => ({ label: say(ctx, l("Learner", "الطالب", "طالب علم")), value: `${row.label}${row.markId ? "" : ` · ${say(ctx, l("needs an observation as evidence", "يحتاج ملاحظة كدليل", "ثبوت کے لیے مشاہدہ درکار"))}`}` })),
        { label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: say(ctx, l("Each plan is saved as a DRAFT. Nothing is shared with families, and a leader activates it separately.", "تُحفظ كل خطة كمسودة؛ لا تُشارك مع الأسر، ويفعّلها قائد بشكل منفصل.", "ہر منصوبہ ڈرافٹ کے طور پر محفوظ ہوگا؛ والدین کو کچھ نہیں جائے گا، اور فعال کرنا الگ سے ہوگا۔")) },
      ],
      counts: { drafts: learners.length - kept, kept },
      confirmLabel: `${say(ctx, l("Save drafts", "حفظ المسودات", "ڈرافٹ محفوظ کریں"))} · ${learners.length - kept}`,
      basis: { input, learners },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = await leadCampus(ctx);
    const learners = await learningScope(ctx, campusId, input);
    if (input.ownerId) await campusPerson(ctx, campusId, input.owner ?? "", "/owner", OWNER_ROLES, input.ownerId);
    const entities: Receipt["entities"] = [];
    let created = 0, kept = 0;
    for (const learner of learners) {
      const existing = await openDraft(ctx, campusId, input, learner.studentId);
      if (existing) { entities.push({ model: "interventionPlan", id: existing.id }); kept += 1; continue; }
      const mark = learner.markId ? await prisma.mark.findFirst({ where: { id: learner.markId, studentId: learner.studentId, schoolId: ctx.user.schoolId, campusId }, select: { marksObtained: true, subject: { select: { name: true, totalMarks: true } }, exam: { select: { title: true } } } }) : null;
      if (learner.markId && !mark) throw new WorkflowError("STALE_VERSION");
      const evidenceRefs = mark ? [{ kind: "MARK" as const, refId: learner.markId!, label: markLabel(mark) }] : [];
      const plan = await saveLearningAction(ctx.user, {
        version: 0, studentId: learner.studentId, subjectId: input.subjectId ?? null, title: input.title, concern: input.concern,
        evidenceState: evidenceRefs.length ? "CONFIRMED" : "NEEDS_OBSERVATION", evidenceRefs,
        goal: input.goal ?? null, ownerId: input.ownerId ?? null, plannedActivity: input.plannedActivity ?? null,
        reviewDate: input.reviewDate ?? null, nextCheckInDate: input.nextCheckInDate ?? null,
      });
      entities.push({ model: "interventionPlan", id: plan.id }); created += 1;
    }
    return write("learning_actions.save_draft", entities, { drafts: created, kept }, consoleLink(ctx, "learning-actions"), created === 0 ? { reconciled: true } : undefined, "draft");
  },
});

// ─── corrections.decide_mark (C) ──────────────────────────────────────────

const decideMarkInput = z.strictObject({
  /** The learner whose mark correction is pending, as the user named them. */
  student: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(120).optional(),
  /** What the user has in mind; the screen pre-selects it and the lead decides there. */
  decision: z.enum(["APPROVE", "REJECT"]).optional(),
});
type DecideMarkInput = z.infer<typeof decideMarkInput>;

async function pendingMarkCorrection(ctx: CapabilityContext, input: DecideMarkInput) {
  const campusId = await leadCampus(ctx);
  const rows = await prisma.correction.findMany({ where: { schoolId: ctx.user.schoolId, campusId, kind: "MARK", status: "PENDING" }, select: { id: true, sourceId: true, requesterId: true, requesterName: true, requestedAt: true, student: { select: { fullName: true, nameUr: true, rollNo: true } } }, orderBy: { requestedAt: "asc" } });
  let found = matchName(rows, input.student, row => [row.student.fullName, row.student.nameUr, row.student.rollNo]);
  const subjects = new Map((await prisma.mark.findMany({ where: { id: { in: found.map(row => row.sourceId) }, schoolId: ctx.user.schoolId, campusId }, select: { id: true, subject: { select: { name: true } } } })).map(mark => [mark.id, mark.subject.name]));
  if (input.subject) found = found.filter(row => subjectMatches(subjects.get(row.sourceId) ?? "", input.subject!));
  if (found.length !== 1) throw new InputRequired([found.length
    ? { pointer: "/student", promptKey: "CORRECTION_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.student.rollNo, label: `${row.student.fullName} · ${subjects.get(row.sourceId) ?? ""} · ${row.requesterName}` })) }
    : { pointer: "/student", promptKey: "CORRECTION_NOT_FOUND" }]);
  return found[0];
}

const DECIDE_MARK = defineCapability<DecideMarkInput>({
  key: "corrections.decide_mark", version: 1, cluster: "C4", inventoryKeys: ["corrections.decide_mark"], risk: "APPROVAL_DECISION", roles: LEADS, class: "C",
  input: decideMarkInput, evidence: ["/student"],
  gates: leadGates(permission("reports", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Review a mark correction", "Open Mark corrections on the learner's pending request. You see the old and new mark there and approve or reject it yourself.", "Show me the grade 8 maths correction for Hamza and approve it"],
    ["مراجعة تصحيح درجة", "يفتح شاشة تصحيح الدرجات على طلب الطالب المعلّق؛ ترى الدرجة القديمة والجديدة وتقرر بنفسك.", "اعرض تصحيح درجة الرياضيات لحمزة في الصف الثامن ووافق عليه"],
    ["نمبروں کی اصلاح دیکھیں", "طالب علم کی زیر التوا درخواست پر نمبروں کی اصلاح کی اسکرین کھولیں؛ پرانے اور نئے نمبر وہیں دیکھ کر منظوری یا انکار آپ خود کریں۔", "کلاس 8 ریاضی کے نمبروں کی اصلاح کی درخواست دکھائیں اور منظور کر دیں"],
  ),
  source: { route: "POST /api/corrections (action=approve|reject)", service: "src/lib/corrections/service.ts:decideCorrection (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await pendingMarkCorrection(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const row = await pendingMarkCorrection(ctx, input);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: [], link: `/corrections?kind=MARK&id=${encodeURIComponent(row.id)}`,
        prefill: { recordId: row.id, kind: "MARK", ...(input.decision ? { decision: input.decision === "APPROVE" ? "APPLIED" : "REJECTED" } : {}) },
        detail: { requestedBy: row.requesterName, ownRequest: row.requesterId === ctx.user.userId },
      };
    },
  },
});

// ─── learning_actions.activate (C) ────────────────────────────────────────

const activateLearningInput = z.strictObject({ student: z.string().trim().min(1).max(160), plan: z.string().trim().min(1).max(160).optional() });
type ActivateLearningInput = z.infer<typeof activateLearningInput>;

async function draftPlan(ctx: CapabilityContext, input: ActivateLearningInput) {
  const campusId = await leadCampus(ctx);
  const plans = await prisma.interventionPlan.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "DRAFT", studentId: { not: null } }, select: { id: true, version: true, title: true, createdBy: true, studentId: true }, orderBy: { updatedAt: "desc" }, take: 500 });
  const students = new Map((await prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, id: { in: plans.map(row => row.studentId!) } }, select: { id: true, fullName: true, nameUr: true, rollNo: true } })).map(row => [row.id, row]));
  const rows = plans.map(row => ({ ...row, student: students.get(row.studentId!) ?? null }));
  let found = matchName(rows, input.student, row => [row.student?.fullName, row.student?.nameUr, row.student?.rollNo]);
  if (input.plan && found.length > 1) { const wanted = fold(input.plan); found = found.filter(row => fold(row.title).includes(wanted)); }
  if (found.length !== 1) throw new InputRequired([found.length
    ? { pointer: "/plan", promptKey: "LEARNING_ACTION_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.title, label: `${row.student?.fullName ?? ""} · ${row.title}` })) }
    : { pointer: "/student", promptKey: "LEARNING_ACTION_NOT_FOUND" }]);
  return found[0];
}

const LEARNING_ACTIVATE = defineCapability<ActivateLearningInput>({
  key: "learning_actions.activate", version: 1, cluster: "C5", inventoryKeys: ["learning_actions.activate"], risk: "APPROVAL_DECISION", roles: LEADS, class: "C",
  input: activateLearningInput, evidence: ["/student"],
  gates: leadGates(), scope: { kind: "own-campus" },
  copy: c(
    ["Activate a support plan", "Open the learner's draft learning action. You check its evidence, goal, owner and dates there and activate it yourself.", "Activate Ayesha's maths support plan"],
    ["تفعيل خطة دعم", "يفتح مسودة إجراء التعلّم للطالب؛ تراجع الدليل والهدف والمسؤول والتواريخ وتفعّلها بنفسك.", "فعّل خطة دعم الرياضيات لعائشة"],
    ["مدد کا منصوبہ فعال کریں", "طالب علم کا ڈرافٹ لرننگ ایکشن کھولیں؛ ثبوت، ہدف، ذمہ دار اور تاریخیں وہیں دیکھ کر آپ خود فعال کریں۔", "عائشہ کا ریاضی کی مدد کا منصوبہ فعال کر دیں"],
  ),
  source: { route: "POST /api/learning-actions/[id] (action=activate)", service: "src/lib/learning/actions.ts:activateLearningAction (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await draftPlan(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const plan = await draftPlan(ctx, input);
      // The AI never approves a draft: the lead activates it on the screen, and is told when it is their own draft.
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: `${consoleLink(ctx, "learning-actions")}&id=${encodeURIComponent(plan.id)}`, prefill: { recordId: plan.id, version: plan.version, action: "activate" }, detail: { ownDraft: plan.createdBy === ctx.user.userId } };
    },
  },
});

// ─── academic.model.activate (C) ──────────────────────────────────────────

const activateModelInput = z.strictObject({ classId: ID });
type ActivateModelInput = z.infer<typeof activateModelInput>;
/** The GradeWeightConfig values activation writes, under the group-policy GRADING keys (group-policy/service.ts KEYS). */
function gradingValues(configuration: AcademicModelConfiguration): Record<string, unknown> {
  const grading = configuration.grading;
  const band = new Map(grading.thresholds.map(row => [row.label.toUpperCase(), row.minimum]));
  return {
    passingPercentage: grading.passingPercentage, gradeAplus: band.get("A+") ?? 90, gradeA: band.get("A") ?? 80, gradeB: band.get("B") ?? 70, gradeC: band.get("C") ?? 60, gradeD: band.get("D") ?? 50,
    roundingRule: grading.roundingRule, missingMarkPolicy: grading.missingPolicy, absentMarkPolicy: grading.absentPolicy,
  };
}

async function draftModel(ctx: CapabilityContext, input: ActivateModelInput) {
  const campusId = await leadCampus(ctx);
  await campusClass(ctx, campusId, input.classId);
  const drafts = await prisma.academicModelVersion.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "DRAFT", isSharedTemplate: false }, orderBy: { version: "desc" }, select: { id: true, version: true, title: true, cohortLabel: true, academicYear: true, configuration: true } });
  const model = drafts.find(row => ((row.configuration as unknown as AcademicModelConfiguration).classIds ?? []).includes(input.classId));
  if (!model) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_DRAFT_MODEL" });
  // The activation route upserts grading without the group-policy lock; the hand-off adds it (Appendix A correction).
  const incoming = gradingValues(model.configuration as unknown as AcademicModelConfiguration);
  const policy = await resolvePolicy(ctx.user.schoolId, campusId, "GRADING");
  const blocked = policy.rows.filter(row => row.source !== "CAMPUS" && row.key in incoming && JSON.stringify(incoming[row.key]) !== JSON.stringify(row.value));
  if (blocked.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "GRADING_LOCKED", key: blocked[0].key, policyVersion: blocked[0].version ?? 0 });
  return { model, campusId };
}

const MODEL_ACTIVATE = defineCapability<ActivateModelInput>({
  key: "academic.model.activate", version: 1, cluster: "C4", inventoryKeys: ["academic.model.activate"], risk: "PUBLISH", roles: LEADS, class: "C",
  input: activateModelInput, evidence: [],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Activate a grading model", "Open the cohort's draft grading model on Curriculum & grading, where you preview its impact and activate it. It is refused while group grading policy locks a value it would change.", "Activate the grade 9 grading model"],
    ["تفعيل نموذج التقييم", "يفتح مسودة نموذج تقييم الفوج في شاشة المنهج والتقييم لمعاينة الأثر والتفعيل. يُرفض إن كانت سياسة المجموعة تقفل قيمة سيغيّرها.", "فعّل نموذج تقييم الصف التاسع"],
    ["گریڈنگ ماڈل فعال کریں", "جماعت کا ڈرافٹ گریڈنگ ماڈل نصاب اور گریڈنگ اسکرین پر کھولیں، جہاں اثر دیکھ کر فعال کریں۔ اگر گروپ کی گریڈنگ پالیسی کسی قدر کو لاک رکھتی ہو تو یہ رک جائے گا۔", "نویں جماعت کا گریڈنگ ماڈل فعال کریں"],
  ),
  source: { route: "POST /api/academic-models/[id] (action=activate)", service: "src/app/api/academic-models/[id]/route.ts (decided on the screen) + group-policy/service.ts:resolve (GRADING lock)", reuse: "handoff-only" },
  async resolve(ctx, input) { await draftModel(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { model } = await draftModel(ctx, input);
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: consoleLink(ctx, "academic-rules&tab=curriculum", "settings&tab=academic-rules"), prefill: { recordId: model.id, version: model.version, action: "preview" }, detail: { cohortLabel: model.cohortLabel, academicYear: model.academicYear } };
    },
  },
});

// ─── reports.approve_versions (C, deep link) ──────────────────────────────

const approveReportsInput = z.strictObject({ classId: ID.optional(), exam: z.string().trim().min(1).max(160).optional() });
type ApproveReportsInput = z.infer<typeof approveReportsInput>;

const REPORTS_APPROVE = defineCapability<ApproveReportsInput>({
  key: "reports.approve_versions", version: 1, cluster: "C4", inventoryKeys: ["reports.approve_versions"], risk: "APPROVAL_DECISION", roles: LEADS, class: "C",
  input: approveReportsInput, evidence: [],
  gates: leadGates(permission("reports", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Approve report cards", "Open Report cards for the class, where you check blockers and approve the current versions yourself. Publishing to families is separate.", "Approve every grade 9 report card with no blockers"],
    ["اعتماد بطاقات التقارير", "يفتح بطاقات التقارير للفصل لتراجع العوائق وتعتمد الإصدارات بنفسك. النشر للأسر خطوة منفصلة.", "اعتمد كل بطاقات الصف التاسع الخالية من العوائق"],
    ["رپورٹ کارڈ منظور کریں", "کلاس کے رپورٹ کارڈ کھولیں، جہاں رکاوٹیں دیکھ کر موجودہ ورژن آپ خود منظور کریں۔ والدین کو اشاعت الگ ہے۔", "نویں جماعت کے تمام رپورٹ کارڈ جن میں کوئی رکاوٹ نہیں، منظور کر دیں"],
  ),
  source: { route: "POST /api/reports (action=approve)", service: "src/components report cards screen (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const campusId = await leadCampus(ctx); if (input.classId) await campusClass(ctx, campusId, input.classId); return input; },
  handoff: {
    kind: "DEEP_LINK",
    async prepare(ctx, input) {
      const campusId = await leadCampus(ctx);
      if (input.classId) await campusClass(ctx, campusId, input.classId);
      const query = input.classId ? `&classId=${encodeURIComponent(input.classId)}` : "";
      return { kind: "DEEP_LINK", targetRoles: [], link: `${consoleLink(ctx, "report-cards")}${query}`, prefill: { ...(input.classId ? { classId: input.classId } : {}), ...(input.exam ? { exam: input.exam } : {}), action: "approve" } };
    },
  },
});

// ─── Exam Studio deep links (C): datesheet publication and principal review ──

const studioInput = z.strictObject({ classId: ID.optional(), subjectId: ID.optional(), session: z.string().trim().min(1).max(160).optional() });
type StudioInput = z.infer<typeof studioInput>;

/** Read-only checks; Exam Studio owns syllabus → paper → seal → datesheet and its approvals (exam-authority.mayApprove). */
async function studioLink(ctx: CapabilityContext, input: StudioInput, step: "datesheet" | "principal_review") {
  const campusId = await leadCampus(ctx);
  if (input.classId) await campusClass(ctx, campusId, input.classId);
  if (input.subjectId && !(await prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: ctx.user.schoolId, campusId, ...(input.classId ? { classId: input.classId } : {}) }, select: { id: true } }))) throw new WorkflowError("SCOPE_DENIED");
  const query = new URLSearchParams({ ...(input.classId ? { classId: input.classId } : {}), ...(input.subjectId ? { subjectId: input.subjectId } : {}) }).toString();
  return { kind: "DEEP_LINK" as const, targetRoles: [] as UserRole[], link: `/ai/studio${query ? `?${query}` : ""}`, prefill: { step, ...(input.classId ? { classId: input.classId } : {}), ...(input.subjectId ? { subjectId: input.subjectId } : {}), ...(input.session ? { session: input.session } : {}) }, detail: { owner: "EXAM_STUDIO" } };
}

const DATESHEET_PUBLISH = defineCapability<StudioInput>({
  key: "exams.datesheet.publish", version: 1, cluster: "C4", inventoryKeys: ["exams.datesheet.publish"], risk: "PUBLISH", roles: LEADS, class: "C",
  input: studioInput, evidence: [],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Publish the exam datesheet", "Opens Exam Studio, where the datesheet is checked and published once every paper is placed. Nothing is published from here.", "Publish the mid-term datesheet"],
    ["نشر جدول الامتحانات", "يفتح استوديو الامتحانات حيث يُراجع الجدول ويُنشر بعد وضع كل الأوراق. لا يُنشر شيء من هنا.", "انشر جدول امتحانات منتصف الفصل"],
    ["ڈیٹ شیٹ شائع کریں", "ایگزام اسٹوڈیو کھلے گا جہاں تمام پرچے رکھنے کے بعد ڈیٹ شیٹ جانچ کر شائع کی جاتی ہے۔ یہاں سے کچھ شائع نہیں ہوگا۔", "مڈ ٹرم کی ڈیٹ شیٹ شائع کر دیں"],
  ),
  source: { route: "/ai/studio", service: "src/app/ai/studio/page.tsx (Exam Studio owns datesheet publication)", reuse: "handoff-only" },
  async resolve(ctx, input) { await studioLink(ctx, input, "datesheet"); return input; },
  handoff: { kind: "DEEP_LINK", prepare: (ctx, input) => studioLink(ctx, input, "datesheet") },
});

const PRINCIPAL_REVIEW = defineCapability<StudioInput>({
  key: "exams.principal_review", version: 1, cluster: "C4", inventoryKeys: ["exams.principal_review"], risk: "APPROVAL_DECISION", roles: LEADS, class: "C",
  input: studioInput, evidence: [],
  gates: leadGates(permission("exams", "edit")), scope: { kind: "own-campus" },
  copy: c(
    ["Review a locked exam", "Opens Exam Studio, where you mark a locked exam reviewed once every report card is approved. Nothing is reviewed from here.", "Mark the grade 9 physics exam reviewed"],
    ["مراجعة امتحان مقفل", "يفتح استوديو الامتحانات حيث تعتمد مراجعة امتحان مقفل بعد اعتماد كل بطاقات التقارير. لا تتم مراجعة من هنا.", "اعتمد مراجعة امتحان فيزياء الصف التاسع"],
    ["لاک امتحان کا جائزہ", "ایگزام اسٹوڈیو کھلے گا جہاں تمام رپورٹ کارڈ منظور ہونے کے بعد لاک امتحان کو جائزہ شدہ کیا جاتا ہے۔ یہاں سے کچھ نہیں ہوگا۔", "نویں جماعت کے فزکس کے امتحان کا جائزہ مکمل کریں"],
  ),
  source: { route: "/ai/studio", service: "src/app/ai/studio/page.tsx (Exam Studio owns principal review)", reuse: "handoff-only" },
  async resolve(ctx, input) { await studioLink(ctx, input, "principal_review"); return input; },
  handoff: { kind: "DEEP_LINK", prepare: (ctx, input) => studioLink(ctx, input, "principal_review") },
});

// ─── academic.request_operator_setup (C, ROLE_TASK) ───────────────────────

const SETUP_NEEDS = ["PERIODS", "ROOMS", "HOLIDAYS"] as const;
const operatorSetupInput = z.strictObject({
  needs: z.array(z.enum(SETUP_NEEDS)).min(1).max(3),
  /** What the principal wants, in their words ("8 periods of 40 minutes from 7:30"). */
  note: z.string().trim().max(1000).optional(),
});
type OperatorSetupInput = z.infer<typeof operatorSetupInput>;
const SETUP_TABS: Record<(typeof SETUP_NEEDS)[number], string> = { PERIODS: "periods", ROOMS: "rooms", HOLIDAYS: "calendar" };

const REQUEST_OPERATOR_SETUP = defineCapability<OperatorSetupInput>({
  key: "academic.request_operator_setup", version: 1, cluster: "C1", inventoryKeys: ["academic.request_operator_setup"], risk: "CREATE", roles: ["PRINCIPAL"], class: "C",
  input: operatorSetupInput, evidence: [],
  gates: [roles(["PRINCIPAL"]), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Ask the campus admin for periods, rooms or holidays", "Bell times, classrooms and the holiday calendar are set by your campus admin. This sends them the request as a task; nothing is changed by you.", "Ask the campus admin to add exam rooms and the winter holidays"],
    ["طلب الحصص أو القاعات أو العطل من مسؤول الحرم", "أوقات الحصص والقاعات وتقويم العطل يحددها مسؤول الحرم. يُرسل الطلب إليه كمهمة؛ لا تغيّر أنت شيئاً.", "اطلب من مسؤول الحرم إضافة قاعات الامتحان وعطلة الشتاء"],
    ["کیمپس ایڈمن سے پیریڈ، کمرے یا چھٹیاں مانگیں", "پیریڈ کے اوقات، کمرے اور چھٹیوں کا کیلنڈر کیمپس ایڈمن طے کرتے ہیں۔ یہ درخواست انہیں کام کے طور پر جائے گی؛ آپ کچھ نہیں بدلیں گے۔", "کیمپس ایڈمن سے کہیں کہ امتحانی کمرے اور سردیوں کی چھٹیاں شامل کریں"],
  ),
  source: { service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (ROLE_TASK to the campus admin's setup screens)", reuse: "handoff-only" },
  handoff: {
    kind: "ROLE_TASK",
    async prepare(ctx, input) {
      ownCampusId(ctx);
      const needs = [...new Set(input.needs)];
      return { kind: "ROLE_TASK", targetRoles: OPERATORS, link: `/admin?view=settings&tab=${SETUP_TABS[needs[0]]}`, prefill: { needs, ...(input.note ? { note: input.note } : {}), requestedBy: "PRINCIPAL" }, detail: { links: needs.map(need => `/admin?view=settings&tab=${SETUP_TABS[need]}`) } };
    },
  },
});

export const ACADEMIC_LEAD_ENTRIES: readonly CapabilityEntry[] = [
  CLASS_ASSIGN_TEACHER, SUBJECT_CREATE, SUBJECT_ASSIGN_TEACHER, WORKLOAD_CAPACITY, TIMETABLE_CREATE, EXAM_SESSION_CREATE, INVIGILATION_ASSIGN,
  MODEL_CREATE_DRAFT, IMPROVEMENT_FRAMEWORK, PROPOSE_COVER, LEARNING_SAVE_DRAFT,
  DECIDE_MARK, LEARNING_ACTIVATE, MODEL_ACTIVATE, REPORTS_APPROVE, DATESHEET_PUBLISH, PRINCIPAL_REVIEW, REQUEST_OPERATOR_SETUP,
];
