import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { currentRules } from "@/lib/library/desk";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";

/**
 * The librarian's first-login sheet (Appendix D, LIBRARIAN): loan rules, shelf sections and the first
 * titles. Money is never set here (RT12): fines and lost-book charges are asked as intent only and go
 * to the campus administrator to decide; the loan rules saved here keep their money fields unchanged.
 */
export interface LibrarianPrefill {
  rules: { loanDays: number; maxLoans: number; maxRenewals: number; holdDays: number; finePerDay: number; lostCharge: number; currency: string };
  categories: string[];
  subjects: string[];
  books: number;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const COMMON_SECTIONS = ["Fiction", "Reference", "Urdu literature", "Islamic studies", "Science", "Children's books"];

async function prefill(ctx: CapabilityContext): Promise<LibrarianPrefill> {
  const { user } = ctx;
  const campusId = ctx.campusId ?? "";
  const [rules, categories, subjects, books] = await Promise.all([
    currentRules(prisma, user.schoolId, campusId),
    prisma.bookCategory.findMany({ where: { schoolId: user.schoolId, campusId }, select: { name: true }, take: 60 }).catch(() => []),
    prisma.subject.findMany({ where: { schoolId: user.schoolId, campusId }, select: { name: true }, distinct: ["name"], take: 40 }),
    prisma.book.count({ where: { schoolId: user.schoolId, campusId } }),
  ]);
  return {
    rules: { loanDays: rules.loanDays, maxLoans: rules.maxLoans, maxRenewals: rules.maxRenewals, holdDays: rules.holdDays, finePerDay: rules.finePerDay, lostCharge: rules.lostCharge, currency: rules.currency },
    categories: categories.map(row => row.name), subjects: subjects.map(row => row.name), books,
  };
}

const n = (min: number, max: number) => z.number().int().min(min).max(max);

export const LIBRARIAN_QUESTIONNAIRE: QuestionnaireDefinition<LibrarianPrefill> = {
  key: "librarian", roles: ["LIBRARIAN"], version: 1,
  title: l("Your library, ready to lend", "مكتبتك جاهزة للإعارة", "آپ کی لائبریری، اجرا کے لیے تیار"),
  sheets: [l("Loan rules", "قواعد الإعارة", "اجرا کے قواعد"), l("Shelves and titles", "الرفوف والعناوين", "شیلف اور کتابیں")],
  prefill,
  known: (p, locale) => [
    { label: l("Books in Skoolee", "الكتب في Skoolee", "اسکولی میں کتابیں"), value: String(p.books) },
    { label: l("Late fine now", "غرامة التأخير الحالية", "موجودہ لیٹ جرمانہ"), value: p.rules.finePerDay ? `${p.rules.currency} ${p.rules.finePerDay}/${l("day", "يوم", "دن")[locale]}` : l("None", "لا يوجد", "کوئی نہیں")[locale] },
  ],
  questions: [
    {
      key: "loanRules", sheet: 0, required: true, drives: ["library.desk_save_rules"], cls: "B",
      prompt: l("How long can books be borrowed, and how many at a time?", "كم مدة الإعارة، وكم كتاباً في المرة؟", "کتاب کتنے دن کے لیے، اور ایک وقت میں کتنی؟"),
      view: (_p, locale) => ({ kind: "group", fields: [
        { key: "loanDays", label: l("Days per loan", "أيام الإعارة", "اجرا کے دن")[locale], view: { kind: "stepper", min: 1, max: 60, step: 1 } },
        { key: "maxLoans", label: l("Books per reader", "كتب لكل قارئ", "فی قاری کتابیں")[locale], view: { kind: "stepper", min: 1, max: 10, step: 1 } },
        { key: "maxRenewals", label: l("Renewals allowed", "مرات التجديد", "تجدید کی اجازت")[locale], view: { kind: "stepper", min: 0, max: 5, step: 1 } },
        { key: "holdDays", label: l("Days a reserved book waits", "أيام انتظار الحجز", "محفوظ کتاب کتنے دن رکے")[locale], view: { kind: "stepper", min: 1, max: 14, step: 1 } },
      ] }),
      answer: () => z.strictObject({ loanDays: n(1, 60), maxLoans: n(1, 10), maxRenewals: n(0, 5), holdDays: n(1, 14) }),
      initial: p => ({ loanDays: p.rules.loanDays, maxLoans: p.rules.maxLoans, maxRenewals: p.rules.maxRenewals, holdDays: p.rules.holdDays }),
    },
    {
      key: "lateFines", sheet: 0, required: true, drives: ["library.desk_save_rules_money"], cls: "C",
      prompt: l("Do you want to charge late fines?", "هل تريد فرض غرامات تأخير؟", "کیا لیٹ جرمانہ لینا چاہتے ہیں؟"),
      hint: l("Money rules are decided by your campus administrator; your proposal goes to them.", "قواعد المال يقررها مدير الحرم.", "رقم کے قواعد کیمپس منتظم طے کرتے ہیں؛ آپ کی تجویز ان کے پاس جائے گی۔"),
      view: (p, locale) => ({ kind: "group", fields: [
        { key: "charge", label: l("Late fines", "غرامات التأخير", "لیٹ جرمانہ")[locale], view: { kind: "choice", options: [opt("NO", l("No fines", "بلا غرامات", "کوئی جرمانہ نہیں"), locale), opt("YES", l("Propose a fine", "اقترح غرامة", "جرمانے کی تجویز"), locale)] } },
        { key: "perDay", label: `${l("Per day", "يومياً", "فی دن")[locale]} (${p.rules.currency})`, view: { kind: "stepper", min: 0, max: 1000, step: 5 }, optional: true },
      ] }),
      answer: () => z.strictObject({ charge: z.enum(["NO", "YES"]), perDay: n(0, 1000).optional() }),
      initial: p => ({ charge: p.rules.finePerDay ? "YES" : "NO", ...(p.rules.finePerDay ? { perDay: p.rules.finePerDay } : {}) }),
    },
    {
      key: "sections", sheet: 1, required: false, drives: ["library.category_create"], cls: "A",
      prompt: l("Which shelf sections do you use?", "ما أقسام الرفوف لديك؟", "آپ کون سے شیلف حصے استعمال کرتے ہیں؟"),
      view: p => ({ kind: "tags", max: 20, placeholder: "Fiction", suggestions: [...new Set([...COMMON_SECTIONS, ...p.subjects])].filter(name => !p.categories.some(existing => existing.toLowerCase() === name.toLowerCase())) }),
      answer: () => z.array(z.string().trim().min(2).max(60)).max(20),
    },
    {
      key: "firstTitles", sheet: 1, required: false, drives: ["library.book_create"], cls: "A",
      prompt: l("Add the titles you have now (more can come later)", "أضف العناوين الموجودة الآن", "ابھی موجود کتابیں شامل کریں (باقی بعد میں)"),
      hint: l("A title with the same ISBN is merged, never duplicated.", "العنوان بنفس الرقم الدولي يُدمج ولا يتكرر.", "ایک ہی آئی ایس بی این والی کتاب ملا دی جاتی ہے، دہرائی نہیں جاتی۔"),
      view: (_p, locale) => ({ kind: "table", maxRows: 100, columns: [
        { key: "title", label: l("Title", "العنوان", "عنوان")[locale], type: "text" },
        { key: "author", label: l("Author", "المؤلف", "مصنف")[locale], type: "text" },
        { key: "isbn", label: "ISBN", type: "text" },
        { key: "copies", label: l("Copies", "النسخ", "نسخے")[locale], type: "text" },
      ] }),
      answer: () => z.array(z.record(z.string(), z.string().max(200))).max(100),
    },
  ],
  compile: compileLibrarian,
  remains: remainingLibrarian,
};

export function compileLibrarian(answers: Record<string, unknown>, p: LibrarianPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown) => steps.push({ stepKey: `s${steps.length + 1}`, capabilityKey, input, fromKey });
  const rules = answers.loanRules as { loanDays: number; maxLoans: number; maxRenewals: number; holdDays: number } | undefined;
  if (rules && (rules.loanDays !== p.rules.loanDays || rules.maxLoans !== p.rules.maxLoans || rules.maxRenewals !== p.rules.maxRenewals || rules.holdDays !== p.rules.holdDays)) add("loanRules", "library.desk_save_rules", rules);
  const fines = answers.lateFines as { charge: "NO" | "YES"; perDay?: number } | undefined;
  if (fines?.charge === "YES" && fines.perDay && fines.perDay !== p.rules.finePerDay) add("lateFines", "library.desk_save_rules_money", { finePerDay: fines.perDay });
  for (const name of (answers.sections as string[] | undefined) ?? []) if (!p.categories.some(existing => existing.toLowerCase() === name.toLowerCase())) add("sections", "library.category_create", { name });
  const books = ((answers.firstTitles ?? []) as Array<Record<string, string>>).filter(row => row.title?.trim().length >= 1).map(row => ({ title: row.title.trim(), ...(row.author?.trim() ? { author: row.author.trim() } : {}), ...(row.isbn?.trim() ? { isbn: row.isbn.trim() } : {}), copiesTotal: Math.max(0, Math.min(10000, Number.parseInt(row.copies ?? "1", 10) || 1)) }));
  for (let index = 0; index < books.length; index += 100) add("firstTitles", "library.book_create", { books: books.slice(index, index + 100) });
  return steps;
}

function remainingLibrarian(answers: Record<string, unknown>): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if ((answers.lateFines as { charge?: string } | undefined)?.charge === "YES") tasks.push({ title: l("Approve the late fine", "اعتماد غرامة التأخير", "لیٹ جرمانے کی منظوری"), who: l("Your campus administrator", "مدير الحرم", "کیمپس منتظم") });
  tasks.push(
    { title: l("Add borrowers (pupils and staff)", "إضافة المستعيرين", "قارئین شامل کریں (طلبہ اور عملہ)"), who: l("You, in Members", "أنت، في الأعضاء", "آپ، ممبرز میں"), link: "/librarian?view=members" },
    { title: l("Label copies with accession numbers", "ترقيم النسخ", "نسخوں پر نمبر لگائیں"), who: l("You, in Catalogue", "أنت، في الفهرس", "آپ، کیٹلاگ میں"), link: "/librarian?view=catalogue" },
  );
  return tasks;
}
