import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getLocalePackage } from "@/lib/locale/store";
import type { CapabilityContext, L10n, Locale } from "../../registry/types";
import type { CompiledStep, Option, QuestionnaireDefinition, RemainingTask } from "../types";
import { BANDS, GRADES, type Band } from "./operator";

/**
 * The accountant's first-login sheet (Appendix D, ACCOUNTANT): books and fee structure in about five
 * minutes. Fee heads an operator already set up are shown as "from your school's setup" and kept.
 * Everything compiles to reviewed setup steps; nothing posts, charges or invoices: the first invoice run,
 * opening balances, reminders and tax sign-off stay hand-offs for the person who applies them.
 * Bank account numbers are never asked here; only names, numbers go on the native form.
 */
export interface AccountantPrefill {
  currency: string;
  feeTypes: string[];
  feeGroups: string[];
  /** Grades present on the campus, by band, for the class fee grid. */
  grades: Array<{ name: string; band: Band }>;
  hasInvoices: boolean;
}

const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const opt = (value: string, label: L10n, locale: Locale): Option => ({ value, label: label[locale] });
const HEADS = ["Tuition fee", "Admission fee", "Annual fund", "Exam fee", "Transport fee", "Lab fee", "Computer fee"];
const METHODS = { CASH: l("Cash at the office", "نقداً في المكتب", "دفتر میں نقد"), BANK_TRANSFER: l("Bank transfer", "تحويل بنكي", "بینک ٹرانسفر"), CHEQUE: l("Cheque", "شيك", "چیک"), CARD: l("Card at the office", "بطاقة في المكتب", "دفتر میں کارڈ"), WALLET: l("Mobile wallet", "محفظة إلكترونية", "موبائل والٹ") } as const;
const DISCOUNTS = { SIBLING: l("Siblings", "الإخوة", "بہن بھائی"), STAFF_CHILD: l("Staff children", "أبناء الموظفين", "عملے کے بچے"), MERIT: l("Merit", "التفوق", "میرٹ"), NEED: l("Financial need", "الحاجة المالية", "مالی ضرورت") } as const;

async function prefill(ctx: CapabilityContext): Promise<AccountantPrefill> {
  const { user } = ctx;
  const campusId = ctx.campusId ?? "";
  const [types, groups, classes, invoices, locale] = await Promise.all([
    prisma.feeType.findMany({ where: { campusId }, select: { name: true }, orderBy: { name: "asc" }, take: 50 }),
    prisma.feeGroup.findMany({ where: { campusId }, select: { name: true }, orderBy: { name: "asc" }, take: 50 }).catch(() => []),
    prisma.class.findMany({ where: { schoolId: user.schoolId, campusId, archivedAt: null }, select: { name: true }, take: 400 }),
    prisma.invoice.count({ where: { schoolId: user.schoolId, campusId } }),
    getLocalePackage(user.schoolId, campusId || null),
  ]);
  const names = new Set(classes.map(row => row.name.toLowerCase()));
  return {
    currency: locale.currency ?? "USD", feeTypes: types.map(row => row.name), feeGroups: groups.map(row => row.name), hasInvoices: invoices > 0,
    grades: GRADES.filter(grade => names.has(grade.name.toLowerCase())).map(grade => ({ name: grade.name, band: grade.band as Band })),
  };
}

const bandsOf = (p: AccountantPrefill) => [...new Set(p.grades.map(grade => grade.band))];

export const ACCOUNTANT_QUESTIONNAIRE: QuestionnaireDefinition<AccountantPrefill> = {
  key: "accountant", roles: ["ACCOUNTANT"], version: 1,
  title: l("Your books, set up", "دفاترك جاهزة", "آپ کے کھاتے تیار"),
  sheets: [l("Where money comes in", "مصادر المال", "رقم کہاں آتی ہے"), l("Fees", "الرسوم", "فیس")],
  prefill,
  known: (p, locale) => [
    { label: l("Currency", "العملة", "کرنسی"), value: p.currency },
    { label: l("Fee heads from your school's setup", "بنود الرسوم من إعداد المدرسة", "اسکول سیٹ اپ سے فیس کی مدیں"), value: p.feeTypes.join(", ") || "—" },
    { label: l("Invoices already in Skoolee", "فواتير موجودة", "پہلے سے موجود انوائس"), value: p.hasInvoices ? l("Yes", "نعم", "ہاں")[locale] : l("Not yet", "ليس بعد", "ابھی نہیں")[locale] },
  ],
  questions: [
    {
      key: "collectionAccounts", sheet: 0, required: false, drives: ["accounts.create_bank_account"], cls: "B",
      prompt: l("Which bank accounts receive fee money? Names only.", "ما الحسابات البنكية التي تستقبل الرسوم؟ الأسماء فقط.", "فیس کس بینک اکاؤنٹ میں آتی ہے؟ صرف نام۔"),
      hint: l("Account numbers are added on the Accounts screen, never here.", "تُضاف أرقام الحسابات في شاشة الحسابات فقط.", "اکاؤنٹ نمبر صرف اکاؤنٹس اسکرین پر لکھے جاتے ہیں۔"),
      view: () => ({ kind: "tags", max: 6, placeholder: "Meezan Bank – Fees" }),
      answer: () => z.array(z.string().trim().min(2).max(80).refine(name => !/\d{6,}/.test(name.replace(/[\s-]/g, "")), "Names only, no account numbers")).max(6),
    },
    {
      key: "paymentMethods", sheet: 0, required: true, drives: ["accounts.create_payment_method"], cls: "B",
      prompt: l("How do families pay?", "كيف تدفع الأسر؟", "والدین کیسے ادائیگی کرتے ہیں؟"),
      view: (_p, locale) => ({ kind: "multi", min: 1, options: (Object.keys(METHODS) as Array<keyof typeof METHODS>).map(value => opt(value, METHODS[value], locale)) }),
      answer: () => z.array(z.enum(Object.keys(METHODS) as [keyof typeof METHODS, ...Array<keyof typeof METHODS>])).min(1),
      initial: () => ["CASH", "BANK_TRANSFER"],
    },
    {
      key: "feeHeads", sheet: 1, required: true, drives: ["fees.create_fee_type"], cls: "B",
      prompt: l("Which fees does the school charge?", "ما الرسوم التي تفرضها المدرسة؟", "اسکول کون سی فیسیں لیتا ہے؟"),
      hint: l("Heads already set up are kept.", "البنود الموجودة تبقى.", "پہلے سے موجود مدیں برقرار رہیں گی۔"),
      view: p => ({ kind: "tags", max: 12, placeholder: "Tuition fee", suggestions: HEADS.filter(head => !p.feeTypes.some(name => name.toLowerCase() === head.toLowerCase())) }),
      answer: () => z.array(z.string().trim().min(2).max(80)).min(1).max(12),
      initial: p => (p.feeTypes.length ? p.feeTypes : ["Tuition fee", "Admission fee"]),
    },
    {
      key: "classFeeGrid", sheet: 1, required: false, drives: ["fees.create_fee_group", "fees.create_master_line", "fees.assign_fee_group"], cls: "B",
      prompt: l("What is the monthly tuition for each stage?", "ما الرسوم الشهرية لكل مرحلة؟", "ہر مرحلے کی ماہانہ ٹیوشن فیس کتنی ہے؟"),
      hint: l("Only fee rules are set up. No invoice is created and nobody is charged.", "تُنشأ القواعد فقط دون فواتير.", "صرف قواعد بنیں گے؛ کوئی انوائس یا وصولی نہیں۔"),
      appliesWhen: p => p.grades.length > 0,
      view: (p, locale) => ({ kind: "row-steppers", min: 0, max: 1_000_000, step: 500, unit: p.currency, rows: bandsOf(p).map(band => ({ id: band, label: BANDS[band][locale] })) }),
      answer: () => z.partialRecord(z.enum(Object.keys(BANDS) as [Band, ...Band[]]), z.number().int().min(0).max(1_000_000)),
    },
    {
      key: "lateFeeRule", sheet: 1, required: false, drives: ["fees.create_fine_rule"], cls: "B",
      prompt: l("Charge a late fee after the due date?", "رسوم تأخير بعد الموعد؟", "آخری تاریخ کے بعد لیٹ فیس؟"),
      view: (p, locale) => ({ kind: "group", fields: [
        { key: "type", label: l("How", "الطريقة", "طریقہ")[locale], view: { kind: "choice", options: [opt("NONE", l("No late fee", "بلا غرامة", "کوئی لیٹ فیس نہیں"), locale), opt("PER_DAY", l("Per day late", "عن كل يوم", "فی دن"), locale), opt("FLAT", l("One flat amount", "مبلغ ثابت", "ایک مقررہ رقم"), locale)] } },
        { key: "amount", label: `${l("Amount", "المبلغ", "رقم")[locale]} (${p.currency})`, view: { kind: "stepper", min: 0, max: 100_000, step: 10 }, optional: true },
      ] }),
      answer: () => z.strictObject({ type: z.enum(["NONE", "PER_DAY", "FLAT"]), amount: z.number().int().min(0).max(100_000).optional() }),
      initial: () => ({ type: "NONE" }),
    },
    {
      key: "discountTypes", sheet: 1, required: false, drives: ["fees.create_discount"], cls: "B",
      prompt: l("Which discounts do you give, and how much?", "ما الخصومات وكم نسبتها؟", "کون سی رعایتیں، اور کتنی؟"),
      view: (_p, locale) => ({ kind: "row-steppers", min: 0, max: 100, step: 5, unit: "%", rows: (Object.keys(DISCOUNTS) as Array<keyof typeof DISCOUNTS>).map(id => ({ id, label: DISCOUNTS[id][locale] })) }),
      answer: () => z.partialRecord(z.enum(Object.keys(DISCOUNTS) as [keyof typeof DISCOUNTS, ...Array<keyof typeof DISCOUNTS>]), z.number().int().min(0).max(100)),
    },
  ],
  compile: compileAccountant,
  remains: remainingAccountant,
};

export function compileAccountant(answers: Record<string, unknown>, p: AccountantPrefill): CompiledStep[] {
  const steps: CompiledStep[] = [];
  const add = (fromKey: string, capabilityKey: string, input: unknown, dependsOn: string[] = []) => { const stepKey = `s${steps.length + 1}`; steps.push({ stepKey, capabilityKey, input, fromKey, ...(dependsOn.length ? { dependsOn } : {}) }); return stepKey; };
  for (const name of (answers.collectionAccounts as string[] | undefined) ?? []) add("collectionAccounts", "accounts.create_bank_account", { name });
  for (const method of (answers.paymentMethods as Array<keyof typeof METHODS> | undefined) ?? []) add("paymentMethods", "accounts.create_payment_method", { name: METHODS[method].en, kind: method });
  const known = new Set(p.feeTypes.map(name => name.toLowerCase()));
  const typeSteps = new Map<string, string>();
  for (const head of (answers.feeHeads as string[] | undefined) ?? []) if (!known.has(head.toLowerCase())) typeSteps.set(head.toLowerCase(), add("feeHeads", "fees.create_fee_type", { name: head }));
  const tuition = ((answers.feeHeads as string[] | undefined) ?? []).find(head => /tuition/i.test(head)) ?? p.feeTypes.find(name => /tuition/i.test(name));
  const grid = (answers.classFeeGrid ?? {}) as Partial<Record<Band, number>>;
  if (tuition) for (const band of bandsOf(p)) {
    const amount = grid[band] ?? 0;
    if (!amount) continue;
    const groupName = `${BANDS[band].en} fees`;
    const group = p.feeGroups.some(name => name.toLowerCase() === groupName.toLowerCase()) ? null : add("classFeeGrid", "fees.create_fee_group", { name: groupName });
    const line = add("classFeeGrid", "fees.create_master_line", { group: groupName, feeType: tuition, amount }, [group, typeSteps.get(tuition.toLowerCase())].filter((key): key is string => Boolean(key)));
    add("classFeeGrid", "fees.assign_fee_group", { group: groupName, grades: p.grades.filter(grade => grade.band === band).map(grade => grade.name) }, [line]);
  }
  const late = answers.lateFeeRule as { type: "NONE" | "PER_DAY" | "FLAT"; amount?: number } | undefined;
  if (late && late.type !== "NONE" && late.amount) add("lateFeeRule", "fees.create_fine_rule", { name: "Late fee", type: late.type, amount: late.amount });
  for (const [kind, percent] of Object.entries((answers.discountTypes ?? {}) as Record<keyof typeof DISCOUNTS, number>) as Array<[keyof typeof DISCOUNTS, number]>) if (percent > 0) add("discountTypes", "fees.create_discount", { name: `${DISCOUNTS[kind].en} discount`, type: "PERCENT", amount: percent });
  return steps;
}

function remainingAccountant(answers: Record<string, unknown>, p: AccountantPrefill): RemainingTask[] {
  const tasks: RemainingTask[] = [];
  if (Array.isArray(answers.collectionAccounts) && answers.collectionAccounts.length) tasks.push({ title: l("Add account numbers to your bank accounts", "أضف أرقام الحسابات البنكية", "بینک اکاؤنٹس میں اکاؤنٹ نمبر لکھیں"), who: l("You, in Accounts", "أنت، في الحسابات", "آپ، اکاؤنٹس میں"), link: "/accountant?view=accounts" });
  tasks.push(
    { title: l("Preview and run the first invoices", "معاينة الفواتير الأولى وإصدارها", "پہلے انوائس دیکھیں اور جاری کریں"), who: l("You, in Fees → Invoices", "أنت، في الرسوم", "آپ، فیس ← انوائس میں"), link: "/accountant?view=invoices" },
    ...(p.hasInvoices ? [] : [{ title: l("Bring in balances owed from before Skoolee", "إدخال الأرصدة السابقة", "پرانے بقایا جات درج کریں"), who: l("You, in Fees → Carry forward", "أنت، في الرسوم", "آپ، فیس میں"), link: "/accountant?view=fee-reports" }]),
    { title: l("Turn on due-date reminders", "تفعيل تذكيرات الاستحقاق", "آخری تاریخ کی یاد دہانیاں فعال کریں"), who: l("You, in Fee reports", "أنت، في تقارير الرسوم", "آپ، فیس رپورٹس میں"), link: "/accountant?view=fee-reports" },
    { title: l("Tax on fees, if your school charges it", "الضريبة على الرسوم إن وُجدت", "فیس پر ٹیکس، اگر لاگو ہو"), who: l("You, then your approver signs off", "أنت ثم يوقّع المعتمد", "آپ، پھر منظور کنندہ دستخط کرے"), link: "/accountant?view=tax" },
  );
  return tasks;
}
