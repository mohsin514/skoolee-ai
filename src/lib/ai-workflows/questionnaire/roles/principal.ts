import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import { classLabel } from "../../resolve/scope";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The principal's first-login sheet (Appendix D, PRINCIPAL): about four minutes as the academic lead.
 * Class and subject teachers come from the campus's active teachers; a teacher who has not accepted
 * an invitation yet is not offered. Periods, rooms and holidays belong to the campus operator and are
 * never asked here; year activation, timetable publish and Exam Studio stay on their own screens.
 */
export interface PrincipalPrefill {
  language: string | null;
  cycleStatus: string | null;
  classes: Array<{ id: string; label: string; classTeacherId: string | null }>;
  subjects: Array<{ id: string; label: string; teacherId: string | null }>;
  teachers: Array<{ id: string; name: string }>;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const PRIORITIES = { TEACHERS: l("Every class has its teachers", "لكل فصل معلموه", "ہر کلاس کے اساتذہ"), TIMETABLE: l("Timetables", "الجداول", "ٹائم ٹیبل"), EXAMS: l("Term exam plan", "خطة الامتحانات", "امتحانی منصوبہ"), GRADING: l("Grading rules", "قواعد التقييم", "گریڈنگ کے قواعد") } as const;

async function prefill(ctx: CapabilityContext): Promise<PrincipalPrefill> {
  const { user } = ctx;
  const scope = { schoolId: user.schoolId, campusId: ctx.campusId ?? "" };
  const [profile, cycle, classes, subjects, teachers] = await Promise.all([
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { preferredLanguage: true } }),
    prisma.academicCycle.findFirst({ where: { ...scope, status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: { status: "asc" }, select: { status: true } }),
    prisma.class.findMany({ where: { ...scope, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true, classTeacherId: true }, orderBy: [{ name: "asc" }, { section: "asc" }], take: 120 }),
    prisma.subject.findMany({ where: { class: { ...scope, archivedAt: null, status: "ACTIVE" } }, select: { id: true, name: true, teacherId: true, class: { select: { name: true, section: true } } }, orderBy: { name: "asc" }, take: 400 }),
    prisma.user.findMany({ where: { ...scope, role: "TEACHER", isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 200 }),
  ]);
  return {
    language: profile?.preferredLanguage ?? null, cycleStatus: cycle?.status ?? null,
    classes: classes.map(row => ({ id: row.id, label: classLabel(row), classTeacherId: row.classTeacherId })),
    subjects: subjects.map(row => ({ id: row.id, label: `${row.name} · ${classLabel(row.class)}`, teacherId: row.teacherId })),
    teachers: teachers.map(row => ({ id: row.id, name: row.fullName ?? "" })),
  };
}

const teacherOptions = (p: PrincipalPrefill): Option[] => p.teachers.map(teacher => ({ value: teacher.id, label: teacher.name }));
const assignment = (p: PrincipalPrefill, ids: "classes" | "subjects") => z.record(z.string(), z.string()).refine(value => Object.entries(value).every(([rowId, teacherId]) => p[ids].some(row => row.id === rowId) && p.teachers.some(teacher => teacher.id === teacherId)), "Only this campus's classes and active teachers");

export const PRINCIPAL_QUESTIONNAIRE: QuestionnaireDefinition<PrincipalPrefill> = {
  key: "principal", roles: ["PRINCIPAL"], version: 1,
  title: l("Your academic year, led", "عامك الدراسي بقيادتك", "آپ کا تعلیمی سال، آپ کی قیادت میں"),
  sheets: [l("Priorities", "الأولويات", "ترجیحات"), l("Teachers", "المعلمون", "اساتذہ"), l("Rules", "القواعد", "قواعد")],
  prefill,
  known: (p, locale) => [
    { label: l("Academic year", "العام الدراسي", "تعلیمی سال"), value: p.cycleStatus === "ACTIVE" ? l("Active", "نشط", "فعال")[locale] : p.cycleStatus === "DRAFT" ? l("Draft: start it in Academic year", "مسودة", "مسودہ: تعلیمی سال میں شروع کریں")[locale] : "—" },
    { label: l("Classes without a class teacher", "فصول بلا معلم", "کلاس ٹیچر کے بغیر کلاسیں"), value: String(p.classes.filter(row => !row.classTeacherId).length) },
    { label: l("Subjects without a teacher", "مواد بلا معلم", "استاد کے بغیر مضامین"), value: String(p.subjects.filter(row => !row.teacherId).length) },
    { label: l("Active teachers", "المعلمون النشطون", "فعال اساتذہ"), value: String(p.teachers.length) },
  ],
  questions: [
    {
      key: "firstPriority", sheet: 0, required: true, drives: ["personal.save_plan"], cls: "A",
      prompt: l("What should be ready first?", "ما الذي يجب أن يكون جاهزاً أولاً؟", "سب سے پہلے کیا تیار ہو؟"),
      view: (_p, locale) => ({ kind: "multi", min: 1, options: (Object.keys(PRIORITIES) as Array<keyof typeof PRIORITIES>).map(value => opt(value, PRIORITIES[value], locale)) }),
      answer: () => z.array(z.enum(Object.keys(PRIORITIES) as [keyof typeof PRIORITIES, ...Array<keyof typeof PRIORITIES>])).min(1),
    },
    {
      key: "classTeachers", sheet: 1, required: false, drives: ["academic.class.assign_teacher"], cls: "B",
      prompt: l("Who is the class teacher for each class?", "من معلم كل فصل؟", "ہر کلاس کا کلاس ٹیچر کون ہے؟"),
      hint: l("Only teachers who have joined are listed.", "يظهر المعلمون المنضمون فقط.", "صرف شامل ہونے والے اساتذہ دکھائے گئے ہیں۔"),
      appliesWhen: p => p.classes.some(row => !row.classTeacherId) && p.teachers.length > 0,
      view: p => ({ kind: "per-row-choice", rows: p.classes.filter(row => !row.classTeacherId).map(row => ({ id: row.id, label: row.label, options: teacherOptions(p) })) }),
      answer: p => assignment(p, "classes"),
    },
    {
      key: "subjectTeachers", sheet: 1, required: false, drives: ["academic.subject.assign_teacher"], cls: "B",
      prompt: l("Who teaches each subject?", "من يدرّس كل مادة؟", "ہر مضمون کون پڑھاتا ہے؟"),
      appliesWhen: p => p.subjects.some(row => !row.teacherId) && p.teachers.length > 0,
      view: p => ({ kind: "per-row-choice", rows: p.subjects.filter(row => !row.teacherId).slice(0, 120).map(row => ({ id: row.id, label: row.label, options: teacherOptions(p) })) }),
      answer: p => assignment(p, "subjects"),
    },
    {
      key: "teacherWeeklyCap", sheet: 2, required: false, drives: ["staff.set_workload_capacity"], cls: "B",
      prompt: l("Most lessons a teacher should teach per week", "أقصى عدد حصص أسبوعياً للمعلم", "ایک استاد ہفتے میں زیادہ سے زیادہ کتنے پیریڈ"),
      appliesWhen: p => p.teachers.length > 0,
      view: () => ({ kind: "stepper", min: 10, max: 45, step: 1 }),
      answer: () => z.number().int().min(10).max(45),
    },
    {
      key: "gradingDraft", sheet: 2, required: false, drives: ["academic.model.create_draft"], cls: "B",
      prompt: l("Start a grading draft with the school's default weights?", "بدء مسودة تقييم بالأوزان الافتراضية؟", "اسکول کے طے شدہ اوزان سے گریڈنگ کا مسودہ شروع کریں؟"),
      hint: l("It stays a draft; you adjust and activate it on Curriculum & grading.", "يبقى مسودة وتعدله وتفعله من المناهج.", "یہ مسودہ رہے گا؛ نصاب اور گریڈنگ میں ترمیم اور فعال کریں گے۔"),
      appliesWhen: p => p.classes.length > 0,
      view: (_p, locale) => ({ kind: "choice", options: [opt("YES", l("Yes, start a draft", "نعم، ابدأ مسودة", "جی، مسودہ شروع کریں"), locale), opt("NO", l("Not now", "ليس الآن", "ابھی نہیں"), locale)] }),
      answer: () => z.enum(["YES", "NO"]),
    },
  ],
  compile: compilePrincipal,
  remains: remainingPrincipal,
};

export function compilePrincipal(answers: Record<string, unknown>, p: PrincipalPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  const priorities = (answers.firstPriority as Array<keyof typeof PRIORITIES> | undefined) ?? [];
  if (priorities.length) add("firstPriority", "personal.save_plan", { title: "My first weeks as academic lead", goal: "Get the academic year running", steps: priorities.map(item => ({ title: PRIORITIES[item].en, detail: "", dueDate: null })) });
  // The teacher is passed by name and re-bound by the entry among the campus's active teachers.
  const teacherName = (id: string) => p.teachers.find(teacher => teacher.id === id)?.name;
  for (const [classId, teacherId] of Object.entries((answers.classTeachers as Record<string, string> | undefined) ?? {})) { const teacher = teacherName(teacherId); if (teacher && p.classes.some(row => row.id === classId)) add("classTeachers", "academic.class.assign_teacher", { classId, teacher }); }
  for (const [subjectId, teacherId] of Object.entries((answers.subjectTeachers as Record<string, string> | undefined) ?? {})) { const teacher = teacherName(teacherId); if (teacher && p.subjects.some(row => row.id === subjectId)) add("subjectTeachers", "academic.subject.assign_teacher", { subjectId, teacher }); }
  if (typeof answers.teacherWeeklyCap === "number") add("teacherWeeklyCap", "staff.set_workload_capacity", { periodsPerWeek: answers.teacherWeeklyCap });
  if (answers.gradingDraft === "YES" && p.classes.length) add("gradingDraft", "academic.model.create_draft", { classIds: p.classes.map(row => row.id).slice(0, 50), weights: "SCHOOL_DEFAULT", title: "Grading rules (draft)" });
  return steps;
}

function remainingPrincipal(_answers: Record<string, unknown>, p: PrincipalPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if (p.cycleStatus === "DRAFT") tasks.push({ title: l("Start the academic year", "بدء العام الدراسي", "تعلیمی سال شروع کریں"), who: l("You, in Academic year", "أنت", "آپ، تعلیمی سال میں"), link: "/principal?view=academic-year" });
  tasks.push(
    { title: l("Periods, rooms and holidays", "الحصص والغرف والعطلات", "پیریڈ، کمرے اور چھٹیاں"), who: l("Your campus administrator", "مدير الحرم", "کیمپس منتظم") },
    { title: l("Draft and publish timetables", "إعداد الجداول ونشرها", "ٹائم ٹیبل بنائیں اور شائع کریں"), who: l("You, in Timetable & cover", "أنت، في الجداول", "آپ، ٹائم ٹیبل اور کور میں"), link: "/principal?view=timetable" },
    { title: l("Papers, moderation and sealing", "الأوراق والمراجعة والختم", "پرچے، جانچ اور سیل"), who: l("Exam Studio", "استوديو الامتحانات", "ایگزام اسٹوڈیو"), link: "/ai/studio" },
  );
  if (p.teachers.length === 0) tasks.push({ title: l("Teachers to accept their invitations", "قبول المعلمين للدعوات", "اساتذہ کا دعوت نامے قبول کرنا"), who: l("Your teachers (sent by your administrator)", "المعلمون", "آپ کے اساتذہ (منتظم کے بھیجے ہوئے)") });
  return tasks;
}
