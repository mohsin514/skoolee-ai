import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCampusSeats } from "@/lib/auth/seats";
import { isStandaloneOwner } from "@/lib/auth/institution";
import { getLocalePackage } from "@/lib/locale/store";
import { membershipAuthority } from "@/lib/membership-access";
import type { UserRole } from "@/lib/roles";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The campus operator's first-login questionnaire (Appendix D, ADMIN and CAMPUS_ADMIN): the Campus
 * Blueprint. It replaces the 18 free-text keys of the old guided setup. The wizard's facts (school,
 * timezone, academic year, weekends) are shown and never asked again; every answer is typed and
 * compiles to reviewed setup operations without a model call. Seats decide reach: fees appear only
 * while no accountant holds the desk, and year activation goes to the principal when one is active.
 */
export interface OperatorPrefill {
  campusName: string;
  country: string;
  currency: string;
  standalone: boolean;
  /** Same authority the STAFF setup operation checks (school-setup-service setupMembership). */
  canInviteStaff: boolean;
  seats: { principal: boolean; accountant: boolean };
  /** The wizard's year; its label and dates are passed back unchanged (the operation never overwrites a cycle). */
  cycle: { id: string; label: string; academicYear: number; status: string; startDate: string | null; endDate: string | null } | null;
  existing: { classes: Array<{ name: string; section: string | null; teachingMode?: string }>; subjects: number; rooms: number; periods: number; pendingInvites: number };
  weekend: number[];
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });

/** Grade ladder rows (Pakistan and Gulf conventions share the numbered grades). */
export const GRADES = [
  { id: "PG", name: "Playgroup", band: "EARLY" }, { id: "NUR", name: "Nursery", band: "EARLY" }, { id: "KG", name: "KG", band: "EARLY" },
  ...Array.from({ length: 12 }, (_, index) => ({ id: `G${index + 1}`, name: `Grade ${index + 1}`, band: index < 5 ? "PRIMARY" : index < 8 ? "MIDDLE" : "SENIOR" })),
] as const;
export const BANDS = { EARLY: l("Early years", "الطفولة المبكرة", "ابتدائی جماعتیں (پری)"), PRIMARY: l("Primary (1–5)", "الابتدائي (1–5)", "پرائمری (1–5)"), MIDDLE: l("Middle (6–8)", "المتوسط (6–8)", "مڈل (6–8)"), SENIOR: l("Senior (9–12)", "الثانوي (9–12)", "سینئر (9–12)") } as const;
export type Band = keyof typeof BANDS;

/** Starting subject chips per band; the person adds or removes freely. */
function subjectPreset(band: Band, country: string): string[] {
  const arabic = ["SA", "AE", "QA", "KW", "BH", "OM", "EG", "JO"].includes(country);
  const language = arabic ? "Arabic" : "Urdu", religion = arabic ? "Islamic Studies" : "Islamiyat";
  switch (band) {
    case "EARLY": return ["English", language, "Mathematics", "General Knowledge"];
    case "PRIMARY": return ["English", language, "Mathematics", "Science", religion, "Social Studies", "Computer"];
    case "MIDDLE": return ["English", language, "Mathematics", "Science", religion, "History", "Geography", "Computer Science"];
    case "SENIOR": return ["English", language, "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", religion, ...(arabic ? [] : ["Pakistan Studies"])];
  }
}

const SECTION_LETTERS = "ABCDEFGHIJKL";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const STAFF_ROLES = ["TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;

async function prefill(ctx: CapabilityContext): Promise<OperatorPrefill> {
  const { user } = ctx;
  const campusId = ctx.campusId ?? "";
  const scope = { schoolId: user.schoolId, campusId };
  const [campus, seats, cycle, classes, subjects, rooms, periods, invites, locale, actor] = await Promise.all([
    prisma.campus.findFirst({ where: { id: campusId, schoolId: user.schoolId }, select: { name: true } }),
    getCampusSeats(user.schoolId, campusId),
    prisma.academicCycle.findFirst({ where: { ...scope, status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: [{ status: "asc" }, { academicYear: "desc" }], select: { id: true, label: true, academicYear: true, status: true, startDate: true, endDate: true } }),
    prisma.class.findMany({ where: { ...scope, archivedAt: null }, select: { name: true, section: true, teachingMode: true }, take: 400 }),
    prisma.subject.count({ where: { class: { ...scope, archivedAt: null } } }),
    prisma.classRoom.count({ where: scope }),
    prisma.periodDefinition.count({ where: { ...scope, timeType: "CLASS" } }),
    prisma.staffInvitation.count({ where: { schoolId: user.schoolId, campusId, status: "pending" } }).catch(() => 0),
    getLocalePackage(user.schoolId, campusId || null),
    prisma.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId }, select: { role: true, campusId: true, isInstitutionOwner: true, canManageMemberships: true } }),
  ]);
  return {
    campusName: campus?.name ?? "", country: locale.country ?? "OTHER", currency: locale.currency ?? "USD", standalone: isStandaloneOwner(user),
    canInviteStaff: actor ? membershipAuthority({ role: actor.role, institutionKind: user.institutionKind, isInstitutionOwner: actor.isInstitutionOwner, canManageMemberships: actor.canManageMemberships, campusId: actor.campusId }).canManage : false,
    seats: { principal: seats.principal, accountant: seats.accountant },
    cycle: cycle ? { id: cycle.id, label: cycle.label, academicYear: cycle.academicYear, status: cycle.status, startDate: cycle.startDate?.toISOString().slice(0, 10) ?? null, endDate: cycle.endDate?.toISOString().slice(0, 10) ?? null } : null,
    existing: { classes, subjects, rooms, periods, pendingInvites: invites }, weekend: locale.weekend,
  };
}

const sectionsOf = (answers: Record<string, unknown>) => (answers.gradeLadder ?? {}) as Record<string, number>;
const bandsInUse = (answers: Record<string, unknown>) => [...new Set(GRADES.filter(grade => (sectionsOf(answers)[grade.id] ?? 0) > 0).map(grade => grade.band))] as Band[];
const totalSections = (answers: Record<string, unknown>) => Object.values(sectionsOf(answers)).reduce((sum, count) => sum + (count || 0), 0);
const financeDesk = (p: OperatorPrefill) => !p.seats.accountant;
const fmt = (n: number, currency: string) => `${currency} ${n.toLocaleString("en")}`;

function operatorQuestionnaire(key: string, roles: readonly UserRole[]): QuestionnaireDefinition<OperatorPrefill> {
  return {
    key, roles, version: 1,
    title: l("Your campus, built live", "حرمك المدرسي، يُبنى أمامك", "آپ کا کیمپس، ابھی تیار"),
    sheets: [l("Classes", "الفصول", "کلاسیں"), l("The school day", "اليوم الدراسي", "اسکول کا دن"), l("People", "الأشخاص", "لوگ"), l("Money and policies", "المال والسياسات", "فیس اور پالیسیاں")],
    prefill,
    known: (p, locale) => [
      { label: l("Campus", "الحرم", "کیمپس"), value: p.campusName },
      { label: l("Academic year", "العام الدراسي", "تعلیمی سال"), value: p.cycle ? `${p.cycle.label} · ${p.cycle.status === "ACTIVE" ? l("active", "نشط", "فعال")[locale] : l("draft", "مسودة", "مسودہ")[locale]}` : l("Not created yet", "لم يُنشأ بعد", "ابھی نہیں بنا")[locale], editLink: "/admin?view=settings" },
      { label: l("Currency", "العملة", "کرنسی"), value: p.currency },
      { label: l("Principal", "المدير", "پرنسپل"), value: p.seats.principal ? l("In post", "معيّن", "موجود")[locale] : l("You lead academics for now", "أنت تقود الشؤون الأكاديمية حالياً", "فی الحال تعلیمی امور آپ کے پاس")[locale] },
      { label: l("Accountant", "المحاسب", "اکاؤنٹنٹ"), value: p.seats.accountant ? l("In post", "معيّن", "موجود")[locale] : l("You handle fees for now", "أنت تتولى الرسوم حالياً", "فی الحال فیس آپ کے پاس")[locale] },
      { label: l("Already set up", "مُعدّ مسبقاً", "پہلے سے موجود"), value: [
        `${p.existing.classes.length} ${l("classes", "فصول", "کلاسیں")[locale]}`, `${p.existing.subjects} ${l("subjects", "مواد", "مضامین")[locale]}`,
        `${p.existing.rooms} ${l("rooms", "غرف", "کمرے")[locale]}`, `${p.existing.periods} ${l("periods", "حصص", "پیریڈ")[locale]}`,
      ].join(" · ") },
    ],
    questions: [
      {
        key: "gradeLadder", sheet: 0, required: true, drives: ["academics.setup_year"], cls: "B",
        prompt: l("Which grades do you run, and how many sections each?", "ما الصفوف لديكم، وكم شعبة لكل صف؟", "آپ کون سی جماعتیں چلاتے ہیں، اور ہر ایک کے کتنے سیکشن؟"),
        hint: l("Classes you already have are kept, never duplicated.", "الفصول الموجودة تبقى ولا تتكرر.", "موجودہ کلاسیں برقرار رہیں گی، دہرائی نہیں جائیں گی۔"),
        view: (_p, locale) => ({ kind: "row-steppers", min: 0, max: 12, step: 1, rows: GRADES.map(grade => ({ id: grade.id, label: grade.id.startsWith("G") ? `${l("Grade", "الصف", "جماعت")[locale]} ${grade.id.slice(1)}` : grade.name })) }),
        answer: () => z.partialRecord(z.enum(GRADES.map(grade => grade.id) as [string, ...string[]]), z.number().int().min(0).max(12)).refine(value => Object.values(value).some(count => (count ?? 0) > 0), "At least one section"),
        initial: p => {
          const counts: Record<string, number> = {};
          for (const row of p.existing.classes) { const grade = GRADES.find(item => item.name.toLowerCase() === row.name.toLowerCase()); if (grade) counts[grade.id] = (counts[grade.id] ?? 0) + 1; }
          return Object.keys(counts).length ? counts : undefined;
        },
      },
      {
        key: "teachingMode", sheet: 0, required: true, drives: ["academics.setup_year"], cls: "B",
        prompt: l("One class teacher for everything, or subject teachers?", "معلم واحد لكل المواد أم معلمو مواد؟", "ایک کلاس ٹیچر سب کچھ پڑھائے یا مضمون وار اساتذہ؟"),
        hint: l("Applies to new classes; classes you already have keep their setting.", "ينطبق على الفصول الجديدة فقط.", "صرف نئی کلاسوں پر لاگو؛ موجودہ کلاسیں اپنی ترتیب برقرار رکھیں گی۔"),
        appliesWhen: (_p, answers) => bandsInUse(answers).length > 0,
        view: (_p, locale) => ({ kind: "per-row-choice", rows: (Object.keys(BANDS) as Band[]).map(band => ({ id: band, label: BANDS[band][locale], options: [opt("SINGLE", l("Class teacher", "معلم الفصل", "کلاس ٹیچر"), locale), opt("SUBJECT", l("Subject teachers", "معلمو المواد", "مضمون وار اساتذہ"), locale)] })) }),
        answer: () => z.partialRecord(z.enum(Object.keys(BANDS) as [Band, ...Band[]]), z.enum(["SINGLE", "SUBJECT"])),
        initial: () => ({ EARLY: "SINGLE", PRIMARY: "SUBJECT", MIDDLE: "SUBJECT", SENIOR: "SUBJECT" }),
      },
      {
        key: "subjectsByGrade", sheet: 0, required: true, drives: ["setup.subjects_by_class"], cls: "B",
        prompt: l("Which subjects does each stage study?", "ما المواد في كل مرحلة؟", "ہر مرحلے میں کون سے مضامین ہیں؟"),
        hint: l("Each subject is out of 100 marks; you can change totals later in Subjects.", "كل مادة من 100 درجة ويمكن تغييرها لاحقاً.", "ہر مضمون 100 نمبر کا ہے؛ بعد میں بدل سکتے ہیں۔"),
        appliesWhen: (_p, answers) => bandsInUse(answers).length > 0,
        view: (p, locale) => ({ kind: "row-tags", max: 16, placeholder: "Mathematics", rows: (Object.keys(BANDS) as Band[]).map(band => ({ id: band, label: BANDS[band][locale], suggestions: subjectPreset(band, p.country) })) }),
        answer: () => z.partialRecord(z.enum(Object.keys(BANDS) as [Band, ...Band[]]), z.array(z.string().trim().min(2).max(120)).max(16)),
        initial: p => Object.fromEntries((Object.keys(BANDS) as Band[]).map(band => [band, subjectPreset(band, p.country)])),
      },
      {
        key: "dayShape", sheet: 1, required: true, drives: ["setup.periods"], cls: "B",
        prompt: l("What does a school day look like?", "كيف يبدو اليوم الدراسي؟", "اسکول کا دن کیسا ہوتا ہے؟"),
        hint: l("Your weekend days come from setup and are not asked again.", "أيام العطلة من الإعداد ولا تُسأل مجدداً.", "ہفتہ وار چھٹیاں سیٹ اپ سے آتی ہیں، دوبارہ نہیں پوچھی جائیں گی۔"),
        appliesWhen: p => p.existing.periods === 0,
        view: (_p, locale) => ({ kind: "group", fields: [
          { key: "start", label: l("First period starts", "تبدأ الحصة الأولى", "پہلا پیریڈ شروع")[locale], view: { kind: "text", placeholder: "08:00", time: true } },
          { key: "periods", label: l("Periods a day", "حصص في اليوم", "روزانہ پیریڈ")[locale], view: { kind: "stepper", min: 1, max: 12, step: 1 } },
          { key: "minutes", label: l("Minutes per period", "دقائق الحصة", "فی پیریڈ منٹ")[locale], view: { kind: "stepper", min: 20, max: 90, step: 5 } },
          { key: "breakAfter", label: l("Break after period", "استراحة بعد الحصة", "وقفہ اس پیریڈ کے بعد")[locale], view: { kind: "stepper", min: 0, max: 11, step: 1 } },
          { key: "breakMinutes", label: l("Break minutes", "دقائق الاستراحة", "وقفے کے منٹ")[locale], view: { kind: "stepper", min: 0, max: 60, step: 5 } },
        ] }),
        answer: () => z.strictObject({ start: time, periods: z.number().int().min(1).max(12), minutes: z.number().int().min(20).max(90), breakAfter: z.number().int().min(0).max(11), breakMinutes: z.number().int().min(0).max(60) }),
        initial: () => ({ start: "08:00", periods: 8, minutes: 40, breakAfter: 4, breakMinutes: 20 }),
      },
      {
        key: "rooms", sheet: 1, required: false, drives: ["setup.rooms"], cls: "B",
        prompt: l("How many rooms do you have?", "كم غرفة لديكم؟", "آپ کے پاس کتنے کمرے ہیں؟"),
        hint: l("Bench layout sets exam seating; it can be changed per room later.", "ترتيب المقاعد يحدد مقاعد الامتحان.", "بینچوں کی ترتیب سے امتحانی نشستیں طے ہوتی ہیں۔"),
        appliesWhen: p => p.existing.rooms === 0,
        view: (_p, locale) => ({ kind: "group", fields: [
          { key: "classrooms", label: l("Classrooms", "الفصول", "کلاس روم")[locale], view: { kind: "stepper", min: 0, max: 200, step: 1 } },
          { key: "labs", label: l("Labs", "المختبرات", "لیبز")[locale], view: { kind: "stepper", min: 0, max: 30, step: 1 } },
          { key: "halls", label: l("Halls", "القاعات", "ہال")[locale], view: { kind: "stepper", min: 0, max: 10, step: 1 } },
          { key: "rows", label: l("Bench rows per room", "صفوف المقاعد", "فی کمرہ بینچ قطاریں")[locale], view: { kind: "stepper", min: 1, max: 20, step: 1 } },
          { key: "benches", label: l("Benches per row", "مقاعد في الصف", "فی قطار بینچ")[locale], view: { kind: "stepper", min: 1, max: 12, step: 1 } },
          { key: "seats", label: l("Pupils per bench", "طلاب لكل مقعد", "فی بینچ طلبہ")[locale], view: { kind: "stepper", min: 1, max: 4, step: 1 } },
        ] }),
        answer: () => z.strictObject({ classrooms: z.number().int().min(0).max(200), labs: z.number().int().min(0).max(30), halls: z.number().int().min(0).max(10), rows: z.number().int().min(1).max(20), benches: z.number().int().min(1).max(12), seats: z.number().int().min(1).max(4) }),
        initial: () => ({ classrooms: 0, labs: 0, halls: 0, rows: 5, benches: 4, seats: 2 }),
      },
      {
        key: "staffRoster", sheet: 2, required: false, drives: ["setup.staff_invitations"], cls: "B",
        appliesWhen: p => p.canInviteStaff,
        prompt: l("Who's on your team?", "من في فريقك؟", "آپ کی ٹیم میں کون ہے؟"),
        hint: l("Invitations are prepared, not sent. You send them from Staff & invites, and nobody gets access until they accept.", "تُجهَّز الدعوات ولا تُرسل؛ ترسلها من شاشة الموظفين.", "دعوت نامے تیار ہوں گے، بھیجے نہیں جائیں گے۔ آپ اسٹاف اسکرین سے بھیجیں گے۔"),
        view: (_p, locale) => ({ kind: "table", maxRows: 120, columns: [
          { key: "fullName", label: l("Full name", "الاسم الكامل", "پورا نام")[locale], type: "text" },
          { key: "email", label: l("Email", "البريد", "ای میل")[locale], type: "email" },
          { key: "phone", label: l("Phone", "الهاتف", "فون")[locale], type: "tel" },
          { key: "role", label: l("Role", "الدور", "کردار")[locale], type: "choice", options: [opt("TEACHER", l("Teacher", "معلم", "استاد"), locale), opt("ACCOUNTANT", l("Accountant", "محاسب", "اکاؤنٹنٹ"), locale), opt("LIBRARIAN", l("Librarian", "أمين مكتبة", "لائبریرین"), locale), opt("RECEPTIONIST", l("Receptionist", "موظف استقبال", "استقبالیہ"), locale)] },
        ] }),
        // Incomplete rows are kept while typing; only complete ones compile.
        answer: () => z.array(z.record(z.string(), z.string().max(254))).max(120),
      },
      {
        key: "feePlan", sheet: 3, required: false, drives: ["fees.create_fee_group", "fees.create_fee_type", "fees.create_master_line", "fees.assign_fee_group", "fees.create_fine_rule", "fees.create_discount"], cls: "B",
        prompt: l("What does each stage pay?", "كم تدفع كل مرحلة؟", "ہر مرحلہ کتنی فیس دیتا ہے؟"),
        hint: l("Only fee rules are set up. No invoice is created and nobody is charged.", "تُنشأ قواعد الرسوم فقط، دون فواتير.", "صرف فیس کے قواعد بنیں گے؛ کوئی انوائس یا وصولی نہیں۔"),
        appliesWhen: (p, answers) => financeDesk(p) && bandsInUse(answers).length > 0,
        view: (p, locale) => ({ kind: "group", fields: [
          ...(Object.keys(BANDS) as Band[]).map(band => ({ key: `monthly_${band}`, label: `${BANDS[band][locale]} · ${l("monthly", "شهرياً", "ماہانہ")[locale]} (${p.currency})`, view: { kind: "stepper" as const, min: 0, max: 1_000_000, step: 500 }, optional: true })),
          { key: "admission", label: `${l("Admission fee (once)", "رسوم القبول (مرة)", "داخلہ فیس (ایک بار)")[locale]} (${p.currency})`, view: { kind: "stepper", min: 0, max: 1_000_000, step: 500 }, optional: true },
          { key: "lateFinePerDay", label: `${l("Late fine per day", "غرامة التأخير يومياً", "روزانہ لیٹ جرمانہ")[locale]} (${p.currency})`, view: { kind: "stepper", min: 0, max: 10_000, step: 10 }, optional: true },
          { key: "siblingPercent", label: l("Sibling discount %", "خصم الإخوة %", "بہن بھائی رعایت %")[locale], view: { kind: "stepper", min: 0, max: 100, step: 5 }, optional: true },
        ] }),
        answer: () => z.record(z.string().regex(/^(monthly_(EARLY|PRIMARY|MIDDLE|SENIOR)|admission|lateFinePerDay|siblingPercent)$/), z.number().int().min(0).max(1_000_000)),
      },
      {
        key: "leavePolicy", sheet: 3, required: false, drives: ["leave.create_type", "leave.create_allocation"], cls: "B",
        prompt: l("How many leave days do staff get each year?", "كم يوم إجازة للموظفين سنوياً؟", "عملے کو سالانہ کتنی چھٹیاں ملتی ہیں؟"),
        view: (_p, locale) => ({ kind: "row-steppers", min: 0, max: 60, step: 1, rows: [{ id: "Casual", label: l("Casual", "عارضة", "اتفاقی")[locale] }, { id: "Sick", label: l("Sick", "مرضية", "بیماری")[locale] }, { id: "Annual", label: l("Annual", "سنوية", "سالانہ")[locale] }] }),
        answer: () => z.partialRecord(z.enum(["Casual", "Sick", "Annual"]), z.number().int().min(0).max(60)),
        initial: () => ({ Casual: 10, Sick: 8, Annual: 0 }),
      },
      {
        key: "familyMessaging", sheet: 3, required: false, drives: ["chat.update_school_settings"], cls: "B",
        prompt: l("When can families message staff?", "متى يمكن للأسر مراسلة المعلمين؟", "والدین عملے کو کب پیغام بھیج سکتے ہیں؟"),
        hint: l("Outside these hours messages wait until morning.", "خارج هذه الساعات تنتظر الرسائل حتى الصباح.", "ان اوقات کے باہر پیغامات صبح تک رکیں گے۔"),
        appliesWhen: p => p.standalone,
        view: (_p, locale) => ({ kind: "group", fields: [
          { key: "quietFrom", label: l("Quiet from", "هدوء من", "خاموشی از")[locale], view: { kind: "text", placeholder: "20:00", time: true } },
          { key: "quietTo", label: l("Quiet until", "هدوء حتى", "خاموشی تا")[locale], view: { kind: "text", placeholder: "07:00", time: true } },
          { key: "parentToParent", label: l("Parents can message each other", "مراسلة بين الأسر", "والدین آپس میں پیغام")[locale], view: { kind: "choice", options: [opt("NO", l("No", "لا", "نہیں"), locale), opt("YES", l("Yes", "نعم", "ہاں"), locale)] } },
        ] }),
        answer: () => z.strictObject({ quietFrom: time, quietTo: time, parentToParent: z.enum(["NO", "YES"]) }),
        initial: () => ({ quietFrom: "20:00", quietTo: "07:00", parentToParent: "NO" }),
      },
      {
        key: "studentsRoster", sheet: 2, required: false, drives: ["imports.stage_batch"], cls: "B",
        prompt: l("How will your students come in?", "كيف ستضيف طلابك؟", "طلبہ کیسے شامل ہوں گے؟"),
        view: (_p, locale) => ({ kind: "choice", options: [opt("SPREADSHEET", l("I'll upload a spreadsheet", "سأرفع جدولاً", "میں اسپریڈشیٹ اپ لوڈ کروں گا"), locale), opt("ADMISSIONS", l("Through admissions", "عبر القبول", "داخلوں کے ذریعے"), locale), opt("LATER", l("Later", "لاحقاً", "بعد میں"), locale)] }),
        answer: () => z.enum(["SPREADSHEET", "ADMISSIONS", "LATER"]),
      },
    ],
    compile: compileOperator,
    remains: remainingOperator,
  };
}

export const ADMIN_QUESTIONNAIRE = operatorQuestionnaire("admin", ["ADMIN"]);
export const CAMPUS_ADMIN_QUESTIONNAIRE = operatorQuestionnaire("campus-admin", ["CAMPUS_ADMIN"]);

const key = (name: string, section: string | null) => `${name.toLowerCase()}|${(section ?? "").toLowerCase()}`;
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
const addMinutes = (clock: string, minutes: number) => { const total = Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)) + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };

/** Answers → reviewed setup steps, in dependency order. Pure; chunks keep each step within its operation's row cap. */
export function compileOperator(answers: Record<string, unknown>, p: OperatorPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown, dependsOn: string[] = []) => { const stepKey = `s${steps.length + 1}`; steps.push({ stepKey, capabilityKey, input, fromKey, ...(dependsOn.length ? { dependsOn } : {}) }); return stepKey; };
  const source = "First-login campus questionnaire";

  // Classes: every section the person asked for, in the year the wizard created; existing classes are kept by the operation.
  const modes = (answers.teachingMode ?? {}) as Record<string, "SINGLE" | "SUBJECT">;
  // Existing sections of a grade come first (kept as they are); extra sections take the next free letters.
  const wanted = GRADES.flatMap(grade => {
    const existing = p.existing.classes.filter(row => row.name.toLowerCase() === grade.name.toLowerCase()).map(row => row.section ?? "").filter(Boolean).sort();
    const free = [...SECTION_LETTERS].filter(letter => !existing.includes(letter));
    const sections = [...existing, ...free].slice(0, sectionsOf(answers)[grade.id] ?? 0);
    return sections.map(section => ({ name: grade.name, section, band: grade.band, keptMode: p.existing.classes.find(row => row.name.toLowerCase() === grade.name.toLowerCase() && row.section === section)?.teachingMode }));
  });
  const classSteps: string[] = [];
  if (wanted.length && p.cycle) for (const [index, part] of chunk(wanted, 50).entries()) classSteps.push(add("gradeLadder", "academics.setup_year", {
    operation: "academics.setup_year", existingCycleId: p.cycle.id, academicYear: p.cycle.academicYear, label: p.cycle.label, startDate: p.cycle.startDate, endDate: p.cycle.endDate,
    // An existing class keeps its own teaching mode (the operation never overwrites a class); the answer shapes new ones.
    classes: part.map((row, at) => ({ id: `c${index * 50 + at + 1}`, name: row.name, section: row.section, teachingMode: (row.keptMode === "SINGLE" || row.keptMode === "SUBJECT" ? row.keptMode : modes[row.band] ?? "SUBJECT") as "SINGLE" | "SUBJECT" })),
  }));

  // Subjects bind to those classes by name once they exist (the step waits for every class step).
  const subjects = (answers.subjectsByGrade ?? {}) as Record<string, string[]>;
  const subjectRows = wanted.flatMap(row => (subjects[row.band] ?? []).map(subjectName => ({ className: row.name, section: row.section, subjectName, totalMarks: 100 })));
  if (classSteps.length) for (const part of chunk(subjectRows, 30)) add("subjectsByGrade", "setup.subjects_by_class", { sourceReference: source, rows: part }, classSteps);

  const day = answers.dayShape as { start: string; periods: number; minutes: number; breakAfter: number; breakMinutes: number } | undefined;
  if (day) {
    let clock = day.start;
    const rows = Array.from({ length: day.periods }, (_, index) => {
      const row = { timeType: "CLASS", periodNumber: index + 1, startTime: clock, endTime: addMinutes(clock, day.minutes) };
      clock = addMinutes(row.endTime, index + 1 === day.breakAfter ? day.breakMinutes : 0);
      return row;
    }).filter(row => row.endTime > row.startTime);
    if (rows.length) add("dayShape", "setup.periods", { operation: "setup.apply_changes", action: "PERIODS", sourceReference: source, rows });
  }

  const rooms = answers.rooms as { classrooms: number; labs: number; halls: number; rows: number; benches: number; seats: number } | undefined;
  if (rooms) {
    const layout = { rows: rooms.rows, benchesPerRow: rooms.benches, seatsPerBench: rooms.seats, examSeatsPerBench: 1, building: "Main" };
    const all = [
      ...Array.from({ length: rooms.classrooms }, (_, index) => ({ roomNumber: `Room ${String(index + 1).padStart(2, "0")}`, roomType: "CLASSROOM", ...layout })),
      ...Array.from({ length: rooms.labs }, (_, index) => ({ roomNumber: `Lab ${index + 1}`, roomType: "LAB", ...layout })),
      ...Array.from({ length: rooms.halls }, (_, index) => ({ roomNumber: `Hall ${index + 1}`, roomType: "HALL", ...layout })),
    ];
    for (const part of chunk(all, 30)) add("rooms", "setup.rooms", { operation: "setup.apply_changes", action: "ROOMS", sourceReference: source, rows: part });
  }

  // Only complete, well-formed rows; the operation creates pending invitations, never sends them.
  const staff = (p.canInviteStaff ? (answers.staffRoster ?? []) as Array<Record<string, string>> : []).filter(row => row.fullName?.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(row.email ?? "") && STAFF_ROLES.includes(row.role as never))
    .map(row => ({ fullName: row.fullName.trim(), email: row.email.trim().toLowerCase(), phone: (row.phone ?? "").trim(), role: row.role }));
  const uniqueStaff = [...new Map(staff.map(row => [row.email, row])).values()];
  for (const part of chunk(uniqueStaff, 30)) add("staffRoster", "setup.staff_invitations", { operation: "setup.apply_changes", action: "STAFF", sourceReference: source, rows: part });

  // Fee rules, only while the person holds the finance desk. Names tie the steps together.
  const fees = (answers.feePlan ?? {}) as Record<string, number>;
  if (financeDesk(p)) {
    const tuition = fees && Object.keys(fees).some(name => name.startsWith("monthly_") && fees[name] > 0) ? add("feePlan", "fees.create_fee_type", { name: "Tuition fee" }) : null;
    const admission = fees.admission > 0 ? add("feePlan", "fees.create_fee_type", { name: "Admission fee" }) : null;
    for (const band of bandsInUse(answers)) {
      const monthly = fees[`monthly_${band}`] ?? 0;
      if (!monthly && !admission) continue;
      const groupName = `${BANDS[band].en} fees`;
      const group = add("feePlan", "fees.create_fee_group", { name: groupName });
      const lines = [
        ...(monthly && tuition ? [add("feePlan", "fees.create_master_line", { group: groupName, feeType: "Tuition fee", amount: monthly }, [group, tuition])] : []),
        ...(admission ? [add("feePlan", "fees.create_master_line", { group: groupName, feeType: "Admission fee", amount: fees.admission }, [group, admission])] : []),
      ];
      const grades = [...new Set(wanted.filter(row => row.band === band).map(row => row.name))];
      if (grades.length && classSteps.length) add("feePlan", "fees.assign_fee_group", { group: groupName, grades, academicYear: p.cycle?.academicYear }, [group, ...lines, ...classSteps]);
    }
    if (fees.lateFinePerDay > 0) add("feePlan", "fees.create_fine_rule", { name: "Late fine", type: "PER_DAY", amount: fees.lateFinePerDay });
    if (fees.siblingPercent > 0) add("feePlan", "fees.create_discount", { name: "Sibling discount", type: "PERCENT", amount: fees.siblingPercent });
  }

  const leave = (answers.leavePolicy ?? {}) as Record<string, number>;
  for (const [type, days] of Object.entries(leave)) if (days > 0) {
    const created = add("leavePolicy", "leave.create_type", { name: `${type} leave`, defaultDays: days });
    add("leavePolicy", "leave.create_allocation", { leaveType: `${type} leave`, days }, [created]);
  }

  const messaging = answers.familyMessaging as { quietFrom: string; quietTo: string; parentToParent: "NO" | "YES" } | undefined;
  if (messaging && p.standalone) add("familyMessaging", "chat.update_school_settings", { quietHoursEnabled: true, quietHoursStart: messaging.quietFrom, quietHoursEnd: messaging.quietTo, parentToParent: messaging.parentToParent === "YES" });
  return steps;
}

function remainingOperator(answers: Record<string, unknown>, p: OperatorPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  const staff = Array.isArray(answers.staffRoster) && answers.staffRoster.length > 0;
  if (!p.cycle) tasks.push({ title: l("Create the academic year", "إنشاء العام الدراسي", "تعلیمی سال بنائیں"), who: l("You, in Academic year", "أنت، في العام الدراسي", "آپ، تعلیمی سال میں"), link: "/admin?view=academic-year" });
  else if (p.cycle.status !== "ACTIVE") tasks.push({ title: l("Activate the academic year", "تفعيل العام الدراسي", "تعلیمی سال فعال کریں"), who: p.seats.principal ? l("Your principal", "المدير", "پرنسپل") : l("You", "أنت", "آپ"), link: "/admin?view=academic-year" });
  if (!p.canInviteStaff) tasks.push({ title: l("Invite your staff", "دعوة الموظفين", "عملے کو مدعو کریں"), who: l("Whoever manages memberships for your school", "مسؤول العضويات في مدرستك", "آپ کے اسکول میں رکنیت کا منتظم"), link: "/admin?view=staff" });
  if (staff) tasks.push({ title: l("Send staff invitations (pending until accepted)", "إرسال دعوات الموظفين (معلقة حتى القبول)", "عملے کو دعوت نامے بھیجیں (قبول ہونے تک زیر التوا)"), who: l("You, in Staff & invites", "أنت، في الموظفين والدعوات", "آپ، اسٹاف اور دعوت ناموں میں"), link: "/admin?view=staff" });
  tasks.push({ title: l("Assign class and subject teachers", "تعيين معلمي الفصول والمواد", "کلاس اور مضمون کے اساتذہ مقرر کریں"), who: p.seats.principal ? l("Your principal, once teachers accept", "المدير بعد قبول المعلمين", "پرنسپل، اساتذہ کے قبول کرنے کے بعد") : l("You, once teachers accept", "أنت بعد قبول المعلمين", "آپ، اساتذہ کے قبول کرنے کے بعد"), link: "/admin?view=classes" });
  tasks.push({ title: l("Draft and publish timetables", "إعداد الجداول ونشرها", "ٹائم ٹیبل بنائیں اور شائع کریں"), who: p.seats.principal ? l("Your principal", "المدير", "پرنسپل") : l("You", "أنت", "آپ"), link: "/ai?workflow=timetableSetup" });
  if (p.seats.accountant) tasks.push({ title: l("Fee structure", "هيكل الرسوم", "فیس کا ڈھانچہ"), who: l("Your accountant, in their own setup", "المحاسب في إعداده", "اکاؤنٹنٹ، اپنے سیٹ اپ میں") });
  tasks.push({ title: l("First invoices", "الفواتير الأولى", "پہلے انوائس"), who: p.seats.accountant ? l("Your accountant, in Fees", "المحاسب في الرسوم", "اکاؤنٹنٹ، فیس میں") : l("You, in Fees", "أنت في الرسوم", "آپ، فیس میں"), link: "/admin?view=fees" });
  if (answers.studentsRoster === "SPREADSHEET") tasks.push({ title: l("Upload and review your student spreadsheet", "رفع جدول الطلاب ومراجعته", "طلبہ کی اسپریڈشیٹ اپ لوڈ اور جائزہ"), who: l("You, in Students → Import", "أنت، في الطلاب ← استيراد", "آپ، طلبہ ← درآمد میں"), link: "/admin?view=students" });
  tasks.push({ title: l("Link guardians and give them access", "ربط أولياء الأمور ومنحهم الوصول", "سرپرستوں کو جوڑیں اور رسائی دیں"), who: l("You, in Guardians & access", "أنت، في أولياء الأمور", "آپ، سرپرست اور رسائی میں"), link: "/admin?view=guardians" });
  return tasks;
}
