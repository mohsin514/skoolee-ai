import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import type { AcademicModelConfiguration } from "@/lib/academic/model-config";
import { contentHash } from "@/lib/academic/report-versions";
import { thresholdsForClass } from "@/lib/academic/report-cards";
import { preview as previewCorrection, requestCorrection, type Proposal } from "@/lib/corrections/service";
import { createTemplate } from "@/lib/marks-scan/service";
import { createExamCommand } from "@/lib/exams/create-command";
import { enterBulkMarks } from "@/lib/marks/enter-bulk-command";
import { editableReportWhere, editRemarksCommand, type RemarkLanguage } from "@/lib/reports/edit-remarks-command";
import { defineCapability } from "../../define";
import { ownCampus, permission, roles } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { classRoster, resolvePupils, type Pupil } from "../../../resolve/pupils";
import { assignedClass, assignedClassWhere, assignedSubject, classLabel } from "../../../resolve/scope";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Locale } from "../../types";

/**
 * Teacher assessment (Slice 2): classroom exams, marks, the paper marks sheet, report remarks and mark
 * corrections. The teacher names an exam and pupils in their own words; both are bound here, on the
 * server, among the teacher's own classes only. Marks are never invented: each line carries the
 * teacher's quote, and a mark above the subject total is asked back, not trimmed. Teachers create only
 * quizzes and class tests. A mark correction is a request the academic lead decides on /corrections.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (locale: Locale, copy: L10n, params: Record<string, string | number> = {}) => fill(copy[locale], params);
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const day = (date: Date) => date.toISOString().slice(0, 10);

const TEACHER: readonly ["TEACHER"] = ["TEACHER"];
const TEACHER_TYPES = ["QUIZ", "CLASS_TEST"] as const;
const TYPE_LABEL: Record<string, L10n> = {
  QUIZ: { en: "Quiz", ar: "اختبار قصير", ur: "کوئز" },
  CLASS_TEST: { en: "Class test", ar: "اختبار صفي", ur: "کلاس ٹیسٹ" },
  MID_TERM: { en: "Mid-term exam", ar: "امتحان منتصف الفصل", ur: "مڈٹرم امتحان" },
  FINAL: { en: "Final exam", ar: "الامتحان النهائي", ur: "سالانہ امتحان" },
  CUSTOM: { en: "Special exam", ar: "امتحان خاص", ur: "خصوصی امتحان" },
};
const ACADEMIC_LEAD: L10n = { en: "the academic lead (principal)", ar: "المسؤول الأكاديمي (المدير)", ur: "تعلیمی سربراہ (پرنسپل)" };

/* ─── Exams the teacher may name ──────────────────────────────────────────────────────────────── */

type Openness = "open" | "entered";
const EXAM_SELECT = {
  id: true, title: true, term: true, examType: true, status: true, isLocked: true, classId: true, subjectId: true, academicYear: true, activatedAt: true,
  class: { select: { name: true, section: true, classTeacherId: true } },
  subject: { select: { name: true, totalMarks: true } },
  schedules: { select: { date: true } },
} as const;
interface ExamRow {
  id: string; title: string; term: string; examType: string; status: string; isLocked: boolean; classId: string; subjectId: string | null; academicYear: number; activatedAt: Date | null;
  class: { name: string; section: string | null; classTeacherId: string | null }; subject: { name: string; totalMarks: number } | null; schedules: Array<{ date: Date }>;
}

/** The same visibility rule as GET /api/exams and /api/marks for a teacher. */
function teacherExamWhere(ctx: CapabilityContext, openness: Openness) {
  const userId = ctx.user.userId;
  return {
    schoolId: ctx.user.schoolId, campusId: ctx.campusId ?? "", status: openness === "open" ? { in: ["ACTIVE", "MARKS_ENTRY"] } : { not: "DRAFT" },
    ...(openness === "open" ? { isLocked: false } : {}),
    class: { archivedAt: null },
    OR: [{ class: { classTeacherId: userId } }, { subject: { teacherId: userId } }, { subjectId: null, class: { subjects: { some: { teacherId: userId } } } }],
  };
}

const examDate = (exam: ExamRow) => exam.schedules[0]?.date ?? exam.activatedAt;
export const examLabel = (exam: ExamRow) => [exam.title, classLabel(exam.class), exam.subject?.name, examDate(exam) ? day(examDate(exam)!) : exam.term].filter(Boolean).join(" · ");
const STOP = new Set(["the", "a", "an", "of", "for", "in", "on", "my", "exam", "paper", "marks", "ka", "ki", "ke", "کا", "کی", "کے", "امتحان", "ال"]);

function examWords(exam: ExamRow) {
  const dates = [exam.activatedAt, ...exam.schedules.map(row => row.date)].filter((date): date is Date => Boolean(date))
    .flatMap(date => [day(date), date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }), date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })]);
  const type = TYPE_LABEL[exam.examType];
  return fold([exam.title, exam.term, exam.examType.replace("_", " "), type?.en, type?.ar, type?.ur, exam.subject?.name, classLabel(exam.class), exam.class.name, ...dates].filter(Boolean).join(" ")).split(" ");
}

export function matchExam(exams: readonly ExamRow[], text: string): ExamRow[] {
  const wanted = fold(text);
  const exact = exams.filter(exam => fold(examLabel(exam)) === wanted || fold(exam.title) === wanted);
  if (exact.length) return exact;
  const parts = wanted.split(" ").filter(part => part && !STOP.has(part));
  if (!parts.length) return [...exams];
  return exams.filter(exam => { const words = examWords(exam); return parts.every(part => words.some(word => word.startsWith(part))); });
}

const examOptions = (exams: readonly ExamRow[]) => exams.slice(0, 8).map(exam => ({ value: examLabel(exam), label: examLabel(exam) }));

/**
 * Binds the exam the teacher named among their own exams. An exam id bound earlier (an amended or
 * replanned step) is re-checked against the same scope, never trusted.
 */
async function bindExam(ctx: CapabilityContext, text: string, boundId: string | undefined, openness: Openness): Promise<ExamRow> {
  if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
  if (boundId) {
    const exam = await prisma.exam.findFirst({ where: { id: boundId, ...teacherExamWhere(ctx, openness) }, select: EXAM_SELECT }) as ExamRow | null;
    if (!exam) throw new WorkflowError("SCOPE_DENIED");
    return exam;
  }
  const exams = await prisma.exam.findMany({ where: teacherExamWhere(ctx, openness), select: EXAM_SELECT, orderBy: [{ activatedAt: "desc" }, { title: "asc" }], take: 200 }) as ExamRow[];
  const found = matchExam(exams, text);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer: "/exam", promptKey: "EXAM_AMBIGUOUS", params: { count: found.length }, options: examOptions(found) }
    : { pointer: "/exam", promptKey: "EXAM_NOT_FOUND", options: examOptions(exams) }]);
}

/** The subjects of the exam's class this teacher enters marks for (all of them as class teacher). */
async function bindSubject(ctx: CapabilityContext, exam: ExamRow, subjectId: string | undefined) {
  const subjects = await prisma.subject.findMany({ where: { classId: exam.classId, schoolId: ctx.user.schoolId }, select: { id: true, name: true, totalMarks: true, teacherId: true }, orderBy: { name: "asc" } });
  const isClassTeacher = exam.class.classTeacherId === ctx.user.userId;
  const allowed = subjects.filter(subject => isClassTeacher || subject.teacherId === ctx.user.userId);
  const wanted = exam.subjectId ?? subjectId;
  if (wanted) {
    const subject = allowed.find(row => row.id === wanted);
    if (!subject) throw new WorkflowError("SCOPE_DENIED");
    if (exam.subjectId && subjectId && subjectId !== exam.subjectId) throw new InputRequired([{ pointer: "/subjectId", promptKey: "SUBJECT_NOT_IN_EXAM", options: [{ value: subject.name, label: subject.name }] }]);
    return subject;
  }
  if (allowed.length === 1) return allowed[0];
  if (!allowed.length) throw new WorkflowError("SCOPE_DENIED");
  throw new InputRequired([{ pointer: "/subjectId", promptKey: "SUBJECT_REQUIRED", options: allowed.slice(0, 8).map(subject => ({ value: subject.name, label: subject.name })) }]);
}

/** Pupils already bound (by id, re-checked against the roster) or named (matched on the roster). */
function bindPupils(roster: readonly Pupil[], rows: ReadonlyArray<{ student: string; studentId?: string }>, pointer: (index: number) => string) {
  const byId = new Map(roster.map(pupil => [pupil.id, pupil]));
  const refs = rows.flatMap((row, index) => row.studentId && byId.has(row.studentId) ? [] : [{ pointer: pointer(index), text: row.student }]);
  const named = refs.length ? resolvePupils(roster, refs) : new Map<string, Pupil>();
  const bound = rows.map((row, index) => (row.studentId && byId.get(row.studentId)) || named.get(pointer(index))!);
  const twice = bound.findIndex((pupil, index) => bound.findIndex(other => other.id === pupil.id) !== index);
  if (twice >= 0) throw new InputRequired([{ pointer: pointer(twice), promptKey: "PUPIL_TWICE" }]);
  return bound;
}

/** Collects every question from the pupil binding and the caller's own checks, so one round asks them all. */
function collect(fields: RequiredField[], work: () => void) {
  try { work(); } catch (error) { if (error instanceof InputRequired) fields.push(...error.fields); else throw error; }
}

const DIGITS: Record<string, string> = Object.fromEntries([..."٠١٢٣٤٥٦٧٨٩"].map((digit, index) => [digit, String(index)]).concat([..."۰۱۲۳۴۵۶۷۸۹"].map((digit, index) => [digit, String(index)])));
const numbersIn = (text: string) => (text.replace(/[٠-٩۰-۹]/g, digit => DIGITS[digit]).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
/** A quote that states numbers must state this one ("18 out of 20" supports 18 or 20, never 17). */
const saidSupports = (said: string, value: number) => { const numbers = numbersIn(said); return !numbers.length || numbers.includes(value); };

/* ─── exams.create ────────────────────────────────────────────────────────────────────────────── */

const examCreateInput = z.strictObject({
  classId: z.string().min(1),
  subjectId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  examType: z.enum(TEACHER_TYPES),
  /** The reporting period; when omitted it is derived from the active academic model on the server. */
  term: z.string().trim().min(1).max(100).optional(),
});
type ExamCreateInput = z.infer<typeof examCreateInput>;

async function activeCycleYear(ctx: CapabilityContext) {
  const cycle = await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId ?? "", status: "ACTIVE" }, select: { academicYear: true } });
  if (!cycle) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_ACTIVE_CYCLE" });
  return cycle.academicYear;
}

/** The reporting period that covers today in the class's active academic model; the form's "Term 1" when no model has periods. */
async function deriveTerm(ctx: CapabilityContext, classId: string, academicYear: number) {
  const versions = await prisma.academicModelVersion.findMany({ where: { campusId: ctx.campusId ?? "", academicYear, status: "ACTIVE" }, select: { configuration: true } });
  const periods = versions.map(version => version.configuration as unknown as AcademicModelConfiguration).filter(config => config.classIds?.includes(classId)).flatMap(config => config.terms ?? []);
  if (!periods.length) return "Term 1";
  const today = day(ctx.now);
  const current = periods.filter(period => period.startDate <= today && today <= period.endDate);
  if (current.length === 1) return current[0].label;
  throw new InputRequired([{ pointer: "/term", promptKey: "TERM_REQUIRED", options: [...new Set(periods.map(period => period.label))].slice(0, 8).map(label => ({ value: label, label })) }]);
}

async function examCreatePlan(ctx: CapabilityContext, input: ExamCreateInput) {
  const klass = await assignedClass(ctx, input.classId);
  const subject = input.subjectId ? await assignedSubject(ctx, input.subjectId) : null;
  if (subject && subject.classId !== klass.id) throw new WorkflowError("SCOPE_DENIED");
  const academicYear = await activeCycleYear(ctx);
  const subjects = await prisma.subject.findMany({ where: { classId: klass.id, ...(subject ? { id: subject.id } : {}) }, select: { totalMarks: true } });
  return { klass, subject, academicYear, totalMarks: subjects.reduce((sum, row) => sum + row.totalMarks, 0) };
}

const examsCreate = defineCapability<ExamCreateInput>({
  key: "exams.create", version: 1, cluster: "C4", inventoryKeys: ["exams.create"], risk: "CREATE", roles: TEACHER, class: "B",
  input: examCreateInput, evidence: ["/title"],
  gates: [roles(TEACHER), ownCampus(), permission("exams", "add")], scope: { kind: "assigned-class" },
  copy: c(
    ["Create a quiz or class test", "Create a quiz or class test for a class you teach; term exams are scheduled by the office.", "Make a science quiz for 7B called Chapter 3 quiz"],
    ["إنشاء اختبار قصير أو اختبار صفي", "إنشاء اختبار قصير أو صفي لفصل تدرّسه؛ امتحانات الفصل الدراسي يجدولها المكتب.", "أنشئ اختبار علوم قصيراً للصف 7ب بعنوان اختبار الوحدة 3"],
    ["کوئز یا کلاس ٹیسٹ بنائیں", "اپنی کلاس کے لیے کوئز یا کلاس ٹیسٹ بنائیں؛ ٹرم کے امتحانات دفتر طے کرتا ہے۔", "سات بی کے لیے سائنس کا کوئز بنائیں، نام باب 3 کوئز"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/exams", service: "src/lib/exams/create-command.ts:createExamCommand", reuse: "extracted" },
  async resolve(ctx, input) {
    const plan = await examCreatePlan(ctx, input);
    return { ...input, term: input.term ?? await deriveTerm(ctx, plan.klass.id, plan.academicYear) };
  },
  async preview(ctx, input) {
    const { klass, subject, academicYear, totalMarks } = await examCreatePlan(ctx, input);
    const type = say(ctx.locale, TYPE_LABEL[input.examType]);
    return {
      title: say(ctx.locale, { en: "Create {type}: {title}", ar: "إنشاء {type}: {title}", ur: "{type} بنائیں: {title}" }, { type, title: input.title }),
      lines: [
        { label: say(ctx.locale, { en: "Class", ar: "الفصل", ur: "کلاس" }), value: classLabel(klass) },
        { label: say(ctx.locale, { en: "Subject", ar: "المادة", ur: "مضمون" }), value: subject?.name ?? say(ctx.locale, { en: "All subjects of the class", ar: "كل مواد الفصل", ur: "کلاس کے تمام مضامین" }) },
        { label: say(ctx.locale, { en: "Type", ar: "النوع", ur: "قسم" }), value: type },
        { label: say(ctx.locale, { en: "Term", ar: "الفصل الدراسي", ur: "ٹرم" }), value: `${input.term ?? ""} · ${academicYear}` },
        { label: say(ctx.locale, { en: "Total marks", ar: "الدرجة الكلية", ur: "کل نمبر" }), value: String(totalMarks) },
        { label: say(ctx.locale, { en: "Notifies", ar: "يُبلَّغ", ur: "اطلاع" }), value: say(ctx.locale, { en: "{lead} and the class's teachers (New exam created)", ar: "{lead} ومعلمو الفصل (تم إنشاء امتحان جديد)", ur: "{lead} اور کلاس کے اساتذہ (نیا امتحان بنا)" }, { lead: say(ctx.locale, ACADEMIC_LEAD) }) },
      ],
      counts: { exams: 1 },
      confirmLabel: say(ctx.locale, { en: "Create {type}", ar: "إنشاء {type}", ur: "{type} بنائیں" }, { type }),
      basis: { academicYear, totalMarks, classYear: klass.academicYear },
    };
  },
  async execute(ctx, input) {
    const { klass, academicYear } = await examCreatePlan(ctx, input);
    if (!input.term) throw new WorkflowError("INVALID_INPUT");
    const exam = await createExamCommand(ctx.user, { classId: klass.id, title: input.title, term: input.term, academicYear, subjectId: input.subjectId, examType: input.examType });
    return { kind: "write", capability: "exams.create", entities: [{ model: "exam", id: exam.id }], counts: { exams: 1 }, link: "/teacher/tests", replayed: false, detail: { examId: exam.id, examType: exam.examType, term: exam.term, academicYear: exam.academicYear, totalMarks: exam.totalMarks } };
  },
});

/* ─── marks.enter_bulk ────────────────────────────────────────────────────────────────────────── */

const marksInput = z.strictObject({
  /** The user's own words naming the exam ("science quiz", "Friday's test"). */
  exam: z.string().trim().min(1).max(200),
  subjectId: z.string().min(1).optional(),
  marks: z.array(z.strictObject({
    student: z.string().trim().min(1).max(120),
    marks: z.number().int().min(0).max(1000),
    said: z.string().trim().min(1).max(500),
    /** Bound by the server from `student`; a model-written id is never trusted. */
    studentId: z.string().min(1).optional(),
  })).min(1).max(60),
  /** Bound by the server from `exam`. */
  examId: z.string().min(1).optional(),
});
type MarksInput = z.infer<typeof marksInput>;

async function boundMarks(ctx: CapabilityContext, input: MarksInput) {
  if (!input.examId || !input.subjectId || input.marks.some(row => !row.studentId)) throw new WorkflowError("INVALID_INPUT");
  const exam = await bindExam(ctx, input.exam, input.examId, "open");
  await assignedClass(ctx, exam.classId);
  const subject = await bindSubject(ctx, exam, input.subjectId);
  return { exam, subject };
}

const marksEnterBulk = defineCapability<MarksInput>({
  key: "marks.enter_bulk", version: 1, cluster: "C4", inventoryKeys: ["marks.enter_bulk"], risk: "UPDATE", roles: TEACHER, class: "B",
  input: marksInput, evidence: ["/marks/*/said"], limits: { maxItems: 60 },
  gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
  copy: c(
    ["Enter marks", "Save the marks you state for named pupils in one of your open quizzes, tests or exams.", "Science quiz marks: Ali 18, Sara 15"],
    ["إدخال الدرجات", "حفظ الدرجات التي تذكرها لطلاب محددين في أحد اختباراتك المفتوحة.", "درجات اختبار العلوم: علي 18، سارة 15"],
    ["نمبر درج کریں", "اپنے کھلے کوئز، ٹیسٹ یا امتحان میں نام لے کر بتائے گئے طلبہ کے نمبر محفوظ کریں۔", "سائنس کوئز کے نمبر: علی 18، سارہ 15"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "POST /api/marks", service: "src/lib/marks/enter-bulk-command.ts:enterBulkMarks", reuse: "extracted" },
  async resolve(ctx, input) {
    const exam = await bindExam(ctx, input.exam, input.examId, "open");
    await assignedClass(ctx, exam.classId);
    const subject = await bindSubject(ctx, exam, input.subjectId);
    const roster = await classRoster(ctx, exam.classId);
    const fields: RequiredField[] = [];
    let pupils: Pupil[] = [];
    collect(fields, () => { pupils = bindPupils(roster, input.marks, index => `/marks/${index}/student`); });
    input.marks.forEach((row, index) => {
      if (row.marks > subject.totalMarks) fields.push({ pointer: `/marks/${index}/marks`, promptKey: "MARK_OVER_TOTAL", params: { marks: row.marks, total: subject.totalMarks } });
      else if (!saidSupports(row.said, row.marks)) fields.push({ pointer: `/marks/${index}/marks`, promptKey: "MARK_NOT_SAID", params: { marks: row.marks } });
    });
    if (fields.length) throw new InputRequired(fields);
    return { ...input, examId: exam.id, subjectId: subject.id, marks: input.marks.map((row, index) => ({ ...row, studentId: pupils[index].id })) };
  },
  async preview(ctx, input) {
    const { exam, subject } = await boundMarks(ctx, input);
    const ids = input.marks.map(row => row.studentId!);
    const [pupils, existing] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: ids }, schoolId: ctx.user.schoolId, classId: exam.classId }, select: { id: true, fullName: true } }),
      prisma.mark.findMany({ where: { examId: exam.id, subjectId: subject.id, studentId: { in: ids } }, select: { studentId: true, marksObtained: true, isAbsent: true, isExempt: true } }),
    ]);
    const names = new Map(pupils.map(pupil => [pupil.id, pupil.fullName]));
    const before = new Map(existing.map(mark => [mark.studentId, mark]));
    const replaced = input.marks.filter(row => before.has(row.studentId!)).length;
    const n = input.marks.length;
    return {
      title: say(ctx.locale, { en: "Save marks · {exam} · {subject}", ar: "حفظ الدرجات · {exam} · {subject}", ur: "نمبر محفوظ کریں · {exam} · {subject}" }, { exam: exam.title, subject: subject.name }),
      lines: [
        ...input.marks.map(row => {
          const old = before.get(row.studentId!);
          const was = old ? say(ctx.locale, { en: " (was {old})", ar: " (كانت {old})", ur: " (پہلے {old})" }, { old: old.isAbsent ? say(ctx.locale, { en: "absent", ar: "غائب", ur: "غیر حاضر" }) : `${old.marksObtained}/${subject.totalMarks}` }) : "";
          return { label: names.get(row.studentId!) ?? row.student, value: `${row.marks}/${subject.totalMarks}${was}` };
        }),
        { label: say(ctx.locale, { en: "Notifies", ar: "يُبلَّغ", ur: "اطلاع" }), value: say(ctx.locale, { en: "{lead} and the class teacher (Marks entered)", ar: "{lead} ومعلم الفصل (تم إدخال الدرجات)", ur: "{lead} اور کلاس ٹیچر (نمبر درج ہوئے)" }, { lead: say(ctx.locale, ACADEMIC_LEAD) }) },
      ],
      counts: { marks: n, replaced, new: n - replaced },
      confirmLabel: say(ctx.locale, n === 1 ? { en: "Save 1 mark", ar: "حفظ درجة واحدة", ur: "1 نمبر محفوظ کریں" } : { en: "Save {n} marks", ar: "حفظ {n} درجات", ur: "{n} نمبر محفوظ کریں" }, { n }),
      basis: { status: exam.status, isLocked: exam.isLocked, total: subject.totalMarks, existing: existing.map(mark => [mark.studentId, mark.marksObtained, mark.isAbsent, mark.isExempt]).sort() },
    };
  },
  async execute(ctx, input) {
    const { exam, subject } = await boundMarks(ctx, input);
    const result = await enterBulkMarks(ctx.user, {
      examId: exam.id,
      entries: input.marks.map(row => ({ studentId: row.studentId!, subjectId: subject.id, marksObtained: row.marks, isAbsent: false, isExempt: false })),
      ipAddress: null,
    });
    return { kind: "write", capability: "marks.enter_bulk", entities: [{ model: "exam", id: exam.id }], counts: { saved: result.savedCount, changed: result.changed }, link: `/teacher/marks?classId=${encodeURIComponent(exam.classId)}`, replayed: false, detail: { examId: exam.id, subjectId: subject.id, savedCount: result.savedCount, changed: result.changed } };
  },
});

/* ─── marks_scan.create_template ──────────────────────────────────────────────────────────────── */

const scanInput = z.strictObject({
  exam: z.string().trim().min(1).max(200),
  subjectId: z.string().min(1).optional(),
  rowsPerPage: z.number().int().min(5).max(30).optional(),
  examId: z.string().min(1).optional(),
});
type ScanInput = z.infer<typeof scanInput>;

const marksScanTemplate = defineCapability<ScanInput>({
  key: "marks_scan.create_template", version: 1, cluster: "C4", inventoryKeys: ["marks_scan.create_template"], risk: "CREATE", roles: TEACHER, class: "A",
  classOverride: "Prints a blank paper marks sheet from the class roster; no mark changes until a scanned batch is reviewed and approved.",
  input: scanInput, evidence: [],
  gates: [roles(TEACHER), ownCampus()], scope: { kind: "assigned-class" },
  copy: c(
    ["Print a paper marks sheet", "Prepare a printable marks sheet with the class roster for one of your open exams, to scan back later.", "Print a marks sheet for the 7B science quiz"],
    ["طباعة كشف درجات ورقي", "تحضير كشف درجات قابل للطباعة بأسماء الفصل لأحد اختباراتك المفتوحة، لمسحه لاحقاً.", "اطبع كشف درجات لاختبار العلوم للصف 7ب"],
    ["نمبروں کی کاغذی شیٹ پرنٹ کریں", "اپنے کھلے امتحان کے لیے کلاس کی فہرست والی شیٹ تیار کریں تاکہ بعد میں اسکین ہو سکے۔", "سات بی کے سائنس کوئز کی نمبر شیٹ پرنٹ کریں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/marks-scan (action=template)", service: "src/lib/marks-scan/service.ts:createTemplate", reuse: "direct" },
  async resolve(ctx, input) {
    const exam = await bindExam(ctx, input.exam, input.examId, "open");
    await assignedClass(ctx, exam.classId);
    const subject = await bindSubject(ctx, exam, input.subjectId);
    return { ...input, examId: exam.id, subjectId: subject.id };
  },
  async execute(ctx, input) {
    if (!input.examId || !input.subjectId) throw new WorkflowError("INVALID_INPUT");
    const exam = await bindExam(ctx, input.exam, input.examId, "open");
    await assignedClass(ctx, exam.classId);
    const subject = await bindSubject(ctx, exam, input.subjectId);
    const template = await createTemplate(ctx.user, { examId: exam.id, subjectId: subject.id, ...(input.rowsPerPage ? { rowsPerPage: input.rowsPerPage } : {}) });
    return { kind: "draft", capability: "marks_scan.create_template", entities: [{ model: "markSheetTemplate", id: template.id }], counts: { pages: template.pageCount }, link: `/teacher/marks?classId=${encodeURIComponent(exam.classId)}`, replayed: false, detail: { templateId: template.id, version: template.version, pageCount: template.pageCount } };
  },
});

/* ─── reports.edit_remarks ────────────────────────────────────────────────────────────────────── */

const remarksInput = z.strictObject({
  student: z.string().trim().min(1).max(120),
  /** Narrows to one report ("term 1", "mid-term"); asked back when the pupil has several. */
  term: z.string().trim().min(1).max(100).optional(),
  remark: z.string().trim().min(1).max(4000),
  said: z.string().trim().min(1).max(4000),
  language: z.enum(["EN", "UR", "AR"]).optional(),
  studentId: z.string().min(1).optional(),
  reportCardId: z.string().min(1).optional(),
});
type RemarksInput = z.infer<typeof remarksInput>;
const REMARK_KEY = { EN: "remarksEn", UR: "remarksUr", AR: "remarksAr" } as const;
const LANGUAGE_LABEL: Record<RemarkLanguage, L10n> = { EN: { en: "English", ar: "الإنجليزية", ur: "انگریزی" }, UR: { en: "Urdu", ar: "الأردية", ur: "اردو" }, AR: { en: "Arabic", ar: "العربية", ur: "عربی" } };
const remarkLanguage = (ctx: CapabilityContext, remark: string): RemarkLanguage => /[؀-ۿ]/.test(remark) ? (ctx.locale === "ar" ? "AR" : "UR") : "EN";

const REPORT_INCLUDE = { exam: { select: { id: true, title: true, term: true, academicYear: true } }, student: { select: { id: true, fullName: true } } } as const;
const reportLabel = (report: { exam: { title: string; term: string; academicYear: number } }) => `${report.exam.title} · ${report.exam.term} · ${report.exam.academicYear}`;

async function boundReport(ctx: CapabilityContext, reportCardId: string) {
  const report = await prisma.reportCard.findFirst({ where: { id: reportCardId, schoolId: ctx.user.schoolId, campusId: ctx.campusId ?? "", ...editableReportWhere(ctx.user) }, include: REPORT_INCLUDE });
  if (!report) throw new WorkflowError("SCOPE_DENIED");
  return report;
}

const reportsEditRemarks = defineCapability<RemarksInput>({
  key: "reports.edit_remarks", version: 1, cluster: "C4", inventoryKeys: ["reports.edit_remarks"], risk: "UPDATE", roles: TEACHER, class: "B",
  input: remarksInput, evidence: ["/said"],
  gates: [roles(TEACHER), ownCampus(), permission("reports", "edit")], scope: { kind: "assigned-class" },
  copy: c(
    ["Edit a report card remark", "Write or change the remark on a pupil's report card in your class; the edit clears its approval for the principal to approve again.", "Ali's term 1 remark: works hard and helps others"],
    ["تعديل ملاحظة شهادة", "كتابة أو تغيير ملاحظة شهادة طالب في فصلك؛ التعديل يلغي الاعتماد ليعتمدها المدير من جديد.", "ملاحظة علي للفصل الأول: مجتهد ويساعد زملاءه"],
    ["رپورٹ کارڈ کا ریمارک لکھیں", "اپنی کلاس کے طالب علم کے رپورٹ کارڈ کا ریمارک لکھیں یا بدلیں؛ تبدیلی سے منظوری ختم ہو جاتی ہے اور پرنسپل دوبارہ منظور کرتے ہیں۔", "علی کا پہلی ٹرم کا ریمارک: محنتی ہے اور دوسروں کی مدد کرتا ہے"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "PATCH /api/reports/[id]", service: "src/lib/reports/edit-remarks-command.ts:editRemarksCommand", reuse: "extracted" },
  async resolve(ctx, input) {
    const language = input.language ?? remarkLanguage(ctx, input.remark);
    if (input.reportCardId) {
      const report = await boundReport(ctx, input.reportCardId);
      return { ...input, language, studentId: report.studentId, reportCardId: report.id };
    }
    if (!ctx.campusId) throw new WorkflowError("SCOPE_DENIED");
    const classes = await prisma.class.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId, archivedAt: null, ...assignedClassWhere(ctx.user) }, select: { id: true } });
    const roster: Pupil[] = (await Promise.all(classes.map(row => classRoster(ctx, row.id)))).flat();
    const pupil = resolvePupils(roster, [{ pointer: "/student", text: input.student }]).get("/student")!;
    const reports = await prisma.reportCard.findMany({ where: { studentId: pupil.id, schoolId: ctx.user.schoolId, campusId: ctx.campusId, ...editableReportWhere(ctx.user) }, include: REPORT_INCLUDE, orderBy: { generatedAt: "desc" } });
    const term = input.term ? fold(input.term) : null;
    const found = term ? reports.filter(report => fold(`${report.exam.term} ${report.exam.title}`).includes(term)) : reports;
    if (found.length === 1) return { ...input, language, studentId: pupil.id, reportCardId: found[0].id };
    throw new InputRequired([found.length
      ? { pointer: "/term", promptKey: "REPORT_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(report => ({ value: report.exam.term, label: reportLabel(report) })) }
      : { pointer: input.term ? "/term" : "/student", promptKey: "REPORT_NOT_FOUND", options: reports.slice(0, 8).map(report => ({ value: report.exam.term, label: reportLabel(report) })) }]);
  },
  async preview(ctx, input) {
    if (!input.reportCardId || !input.language) throw new WorkflowError("INVALID_INPUT");
    const report = await boundReport(ctx, input.reportCardId);
    const current = report[REMARK_KEY[input.language]];
    return {
      title: say(ctx.locale, { en: "Report card remark · {name}", ar: "ملاحظة الشهادة · {name}", ur: "رپورٹ کارڈ ریمارک · {name}" }, { name: report.student.fullName }),
      lines: [
        { label: say(ctx.locale, { en: "Report", ar: "الشهادة", ur: "رپورٹ" }), value: reportLabel(report) },
        { label: say(ctx.locale, { en: "Language", ar: "اللغة", ur: "زبان" }), value: say(ctx.locale, LANGUAGE_LABEL[input.language]) },
        { label: say(ctx.locale, { en: "Current remark", ar: "الملاحظة الحالية", ur: "موجودہ ریمارک" }), value: current?.trim() || say(ctx.locale, { en: "None", ar: "لا يوجد", ur: "کوئی نہیں" }) },
        { label: say(ctx.locale, { en: "New remark", ar: "الملاحظة الجديدة", ur: "نیا ریمارک" }), value: input.remark },
        { label: say(ctx.locale, { en: "Approval", ar: "الاعتماد", ur: "منظوری" }), value: say(ctx.locale, report.remarksApproved
          ? { en: "Approved now. Saving clears the approval; {lead} approves the new version again.", ar: "معتمدة الآن. الحفظ يلغي الاعتماد؛ ويعتمد {lead} النسخة الجديدة من جديد.", ur: "ابھی منظور شدہ ہے۔ محفوظ کرنے سے منظوری ختم ہو جائے گی؛ {lead} نیا ورژن دوبارہ منظور کریں گے۔" }
          : { en: "Not approved yet. Saving keeps it unapproved until {lead} approves it.", ar: "غير معتمدة بعد. تبقى كذلك حتى يعتمدها {lead}.", ur: "ابھی منظور نہیں ہوا۔ {lead} کی منظوری تک غیر منظور رہے گا۔" }, { lead: say(ctx.locale, ACADEMIC_LEAD) }) },
      ],
      counts: { reports: 1, approvalCleared: report.remarksApproved ? 1 : 0 },
      confirmLabel: say(ctx.locale, { en: "Save remark", ar: "حفظ الملاحظة", ur: "ریمارک محفوظ کریں" }),
      basis: { current: current ?? null, remarksApproved: report.remarksApproved, currentVersionId: report.currentVersionId, sourceRevision: report.sourceRevision },
    };
  },
  async execute(ctx, input) {
    if (!input.reportCardId || !input.language) throw new WorkflowError("INVALID_INPUT");
    const report = await boundReport(ctx, input.reportCardId);
    const saved = await editRemarksCommand(ctx.user, report.id, input.language, input.remark);
    return { kind: "write", capability: "reports.edit_remarks", entities: [{ model: "reportCard", id: report.id }], counts: { reports: 1, approvalCleared: report.remarksApproved ? 1 : 0 }, link: `/teacher/reports?studentId=${encodeURIComponent(report.studentId)}&exam=${encodeURIComponent(report.examId)}`, replayed: false, detail: { reportCardId: report.id, remarksApproved: saved?.remarksApproved ?? false, currentVersionId: saved?.currentVersionId ?? null } };
  },
});

/* ─── corrections.request_mark ────────────────────────────────────────────────────────────────── */

const correctionInput = z.strictObject({
  exam: z.string().trim().min(1).max(200),
  student: z.string().trim().min(1).max(120),
  subjectId: z.string().min(1).optional(),
  /** The corrected mark; omit with `absent: true` to record that the pupil did not sit the paper. */
  marksObtained: z.number().int().min(0).max(1000).optional(),
  absent: z.boolean().optional(),
  /** Why, for the academic lead (the teacher's own words). */
  reason: z.string().trim().min(1).max(2000),
  /** What families see once the correction is applied and released. */
  publicExplanation: z.string().trim().min(1).max(2000),
  said: z.string().trim().min(1).max(2000),
  markId: z.string().min(1).optional(),
  expectedVersion: z.string().min(1).optional(),
});
type CorrectionInput = z.infer<typeof correctionInput>;

/**
 * The source version /api/corrections binds a proposal to (src/lib/corrections/service.ts `source`,
 * MARK branch). Kept identical so the service's own preview accepts it; a drift is refused there as
 * a changed record, never applied.
 */
async function markVersion(markId: string) {
  const mark = await prisma.mark.findFirstOrThrow({ where: { id: markId }, include: { subject: true, exam: true } });
  const reports = await prisma.reportCard.findMany({ where: { studentId: mark.studentId }, select: { id: true, currentVersionId: true, publishedVersionId: true, sourceRevision: true } });
  const thresholds = await thresholdsForClass(mark.exam.classId, mark.exam.academicYear, prisma);
  const snapshot = { grade: mark.grade, thresholds, marksObtained: mark.marksObtained, isAbsent: mark.isAbsent, maximum: mark.subject.totalMarks, reports };
  return contentHash({ revision: mark.correctionVersion, snapshot });
}

const proposalOf = (input: CorrectionInput): Proposal => ({ kind: "MARK", sourceId: input.markId!, expectedVersion: input.expectedVersion!, marksObtained: input.absent ? 0 : input.marksObtained, isAbsent: input.absent ?? false });

async function correctionPreview(ctx: CapabilityContext, input: CorrectionInput) {
  if (!input.markId || !input.expectedVersion) throw new WorkflowError("INVALID_INPUT");
  try { return await previewCorrection(prisma, ctx.user, proposalOf(input)); }
  catch (error) { if (error instanceof ApiError && error.status === 409) throw new WorkflowError("STALE_VERSION"); throw error; }
}

const correctionsRequestMark = defineCapability<CorrectionInput>({
  key: "corrections.request_mark", version: 1, cluster: "C4", inventoryKeys: ["corrections.request_mark"], risk: "CREATE", roles: TEACHER, class: "B",
  input: correctionInput, evidence: ["/said", "/reason"],
  gates: [roles(TEACHER), ownCampus(), permission("reports", "edit")], scope: { kind: "assigned-class" },
  copy: c(
    ["Request a mark correction", "Ask the academic lead to correct a saved mark on a locked or published result; nothing changes until they approve it.", "Ali's maths mid-term should be 17 not 15, I added it wrong"],
    ["طلب تصحيح درجة", "اطلب من المسؤول الأكاديمي تصحيح درجة محفوظة في نتيجة مقفلة أو منشورة؛ لا يتغير شيء قبل موافقته.", "درجة علي في رياضيات منتصف الفصل 17 وليست 15، أخطأت في الجمع"],
    ["نمبر درست کرنے کی درخواست", "مقفل یا شائع شدہ نتیجے میں محفوظ نمبر درست کرنے کے لیے تعلیمی سربراہ سے درخواست کریں؛ منظوری تک کچھ نہیں بدلتا۔", "علی کے ریاضی کے مڈٹرم میں 15 نہیں 17 نمبر ہیں، جمع میں غلطی ہوئی"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/corrections (action=request, kind=MARK)", service: "src/lib/corrections/service.ts:requestCorrection", reuse: "direct" },
  async resolve(ctx, input) {
    if (input.marksObtained === undefined && !input.absent) throw new InputRequired([{ pointer: "/marksObtained", promptKey: "MARK_REQUIRED" }]);
    if (input.marksObtained !== undefined && !saidSupports(input.said, input.marksObtained)) throw new InputRequired([{ pointer: "/marksObtained", promptKey: "MARK_NOT_SAID", params: { marks: input.marksObtained } }]);
    const exam = await bindExam(ctx, input.exam, undefined, "entered");
    await assignedClass(ctx, exam.classId);
    const pupil = bindPupils(await classRoster(ctx, exam.classId), [{ student: input.student }], () => "/student")[0];
    const isClassTeacher = exam.class.classTeacherId === ctx.user.userId;
    const marks = await prisma.mark.findMany({
      where: { examId: exam.id, studentId: pupil.id, schoolId: ctx.user.schoolId, ...(input.subjectId ? { subjectId: input.subjectId } : {}), ...(isClassTeacher ? {} : { subject: { teacherId: ctx.user.userId } }) },
      select: { id: true, marksObtained: true, subject: { select: { name: true, totalMarks: true } } }, orderBy: { subject: { name: "asc" } },
    });
    if (!marks.length) throw new InputRequired([{ pointer: "/student", promptKey: "MARK_NOT_FOUND" }]);
    if (marks.length > 1) throw new InputRequired([{ pointer: "/subjectId", promptKey: "SUBJECT_REQUIRED", options: marks.slice(0, 8).map(mark => ({ value: mark.subject.name, label: `${mark.subject.name} · ${mark.marksObtained}/${mark.subject.totalMarks}` })) }]);
    if (input.marksObtained !== undefined && input.marksObtained > marks[0].subject.totalMarks) throw new InputRequired([{ pointer: "/marksObtained", promptKey: "MARK_OVER_TOTAL", params: { marks: input.marksObtained, total: marks[0].subject.totalMarks } }]);
    return { ...input, markId: marks[0].id, expectedVersion: await markVersion(marks[0].id) };
  },
  async preview(ctx, input) {
    const p = await correctionPreview(ctx, input);
    const mark = await prisma.mark.findFirstOrThrow({ where: { id: input.markId! }, select: { student: { select: { fullName: true } }, subject: { select: { name: true } }, exam: { select: { title: true } } } });
    const before = p.before as { marksObtained: number; isAbsent: boolean; maximum: number; grade: string | null };
    const after = p.after as { marksObtained?: number; isAbsent?: boolean; grade?: string | null; requiresReportApproval?: boolean };
    const absent = say(ctx.locale, { en: "absent", ar: "غائب", ur: "غیر حاضر" });
    const show = (value: { marksObtained?: number; isAbsent?: boolean; grade?: string | null }) => `${value.isAbsent ? absent : `${value.marksObtained}/${before.maximum}`}${value.grade ? ` (${value.grade})` : ""}`;
    return {
      title: say(ctx.locale, { en: "Mark correction request · {name}", ar: "طلب تصحيح درجة · {name}", ur: "نمبر کی درستی کی درخواست · {name}" }, { name: mark.student.fullName }),
      lines: [
        { label: say(ctx.locale, { en: "Exam", ar: "الامتحان", ur: "امتحان" }), value: `${mark.exam.title} · ${mark.subject.name}` },
        { label: say(ctx.locale, { en: "Mark", ar: "الدرجة", ur: "نمبر" }), value: `${show(before)} → ${show(after)}` },
        { label: say(ctx.locale, { en: "Reason (for the reviewer)", ar: "السبب (للمراجع)", ur: "وجہ (جائزہ لینے والے کے لیے)" }), value: input.reason },
        { label: say(ctx.locale, { en: "Explanation families see once applied", ar: "الشرح الذي تراه الأسرة بعد التطبيق", ur: "منظوری کے بعد والدین کو نظر آنے والی وضاحت" }), value: input.publicExplanation },
        { label: say(ctx.locale, { en: "Decided by", ar: "يقرره", ur: "فیصلہ" }), value: say(ctx.locale, after.requiresReportApproval
          ? { en: "{lead}; the report card is approved again after the change", ar: "{lead}؛ ثم تُعتمد الشهادة من جديد بعد التغيير", ur: "{lead}؛ تبدیلی کے بعد رپورٹ کارڈ دوبارہ منظور ہوگا" }
          : { en: "{lead}; nothing changes until they approve", ar: "{lead}؛ لا يتغير شيء قبل الموافقة", ur: "{lead}؛ منظوری تک کچھ نہیں بدلتا" }, { lead: say(ctx.locale, ACADEMIC_LEAD) }) },
      ],
      counts: { requests: 1 },
      confirmLabel: say(ctx.locale, { en: "Send correction request", ar: "إرسال طلب التصحيح", ur: "درستی کی درخواست بھیجیں" }),
      basis: { hash: p.hash },
    };
  },
  async execute(ctx, input) {
    const p = await correctionPreview(ctx, input);
    // A replay of the same request (same requester, mark and reviewed before/after) returns the pending one.
    const pending = await prisma.correction.findFirst({ where: { schoolId: ctx.user.schoolId, requesterId: ctx.user.userId, kind: "MARK", sourceId: input.markId!, previewHash: p.hash, status: "PENDING", reason: input.reason.trim() }, select: { id: true } });
    const correction = pending ?? await requestCorrection(ctx.user, proposalOf(input), p.hash, { reason: input.reason, publicExplanation: input.publicExplanation });
    return { kind: "write", capability: "corrections.request_mark", entities: [{ model: "correction", id: correction.id }], counts: { requests: 1 }, link: "/corrections?kind=MARK", replayed: Boolean(pending), detail: { correctionId: correction.id, status: "PENDING" } };
  },
});

export const TEACHER_ASSESSMENT_ENTRIES: readonly CapabilityEntry[] = [examsCreate, marksEnterBulk, marksScanTemplate, reportsEditRemarks, correctionsRequestMark];
