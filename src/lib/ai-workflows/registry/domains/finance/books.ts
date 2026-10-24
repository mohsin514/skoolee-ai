import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { canManageFinance } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { formatMoney, type Language } from "@/lib/locale/package";
import { createChartAccount, ACCOUNT_TYPES } from "@/lib/accounts/chart-account-command";
import { createBankAccount } from "@/lib/accounts/bank-account-command";
import { createPaymentMethod } from "@/lib/accounts/payment-method-command";
import { assignDiscount } from "@/lib/fees/assign-discount-command";
import { saveDraft as saveTaxDraft } from "@/lib/tax/service";
import { PACKAGES } from "@/lib/tax/packages";
import { setEmployee } from "@/lib/payroll-runs/service";
import type { PermissionAction, PermissionModule } from "@/lib/permissions";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError, toWorkflowError, type RequiredField } from "../../../errors";
import { assignedClass } from "../../../resolve/scope";
import { classRoster, pupilLabel, resolvePupils, type Pupil } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * The accountant's books (Slice 5): chart of accounts, bank accounts by name, payment methods, a tax package
 * draft, discounts given to named pupils and the non-bank payroll fields of one employee; plus two money reads
 * (defaulters, this month's collection). Each write calls the same command or service its route calls.
 *
 * - Bank account numbers, IBANs and card data are never in an input the model writes, a preview line or a
 *   prompt (RT5). A bank account is created by name only; the receipt links to the Accounts screen where the
 *   number is typed. The strict input refuses any number-like field and a name with a long digit run.
 * - Nothing here moves money. Collections, adjustments, invoice runs, payroll runs and tax sign-off are class C
 *   hand-offs owned elsewhere; the tax draft is a DRAFT that only the institution authority can approve.
 * - Pupil names in the defaulters read stay in the receipt detail (for the person's own screen); the model never
 *   receives a roster or a defaulter list.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (ctx: CapabilityContext, text: L10n, params: Record<string, string | number> = {}) => fill(text[ctx.locale] ?? text.en, params);
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const NAME = z.string().trim().min(1).max(120);
/** A name with six or more digits in a row is an account or card number, not a name (RT5). */
const hasNumber = (value: string) => /\d{6,}/.test(value.replace(/[\s-]/g, ""));
const NAME_ONLY = NAME.refine(value => !hasNumber(value), "Names only; account numbers are typed on the Accounts screen");

const FINANCE_ROLES: readonly UserRole[] = ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"];
/** Mirrors each route's guards; operators hold the desk only while the accountant seat is empty. */
const deskGates = (module: PermissionModule, action: PermissionAction, managesFinance = true) => [
  roles(FINANCE_ROLES), ...(managesFinance ? [predicate("canManageFinance", canManageFinance, FINANCE_ROLES)] : []), permission(module, action), ownCampus(),
  seatVacantForOperator("accountant", "ACCOUNTANT"),
];

/** The job's campus must be the actor's own (mirrors resolveCampusId for campus roles). */
function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}
const domain = (error: unknown): never => { throw toWorkflowError(error); };

const accountsLink = (ctx: CapabilityContext, tab: "chart" | "methods" | "banks") => ctx.user.role === "ACCOUNTANT" ? `/accountant?view=accounts&tab=${tab}` : "/admin?view=fees";
const feeLink = (ctx: CapabilityContext, tab: string) => ctx.user.role === "ACCOUNTANT" ? `/accountant?view=fee-structures&tab=${tab}` : "/admin?view=fees&tab=structures";
const reportLink = (ctx: CapabilityContext, tab: "defaulters" | "collection") => ctx.user.role === "ACCOUNTANT" ? `/accountant?view=fee-reports&tab=${tab}` : "/admin?view=fees&tab=reports";
const taxLink = (ctx: CapabilityContext) => ctx.user.role === "ACCOUNTANT" ? "/accountant?view=tax" : "/admin?view=approvals&tab=tax";
const payrollLink = (ctx: CapabilityContext) => ctx.user.role === "ACCOUNTANT" ? "/accountant?view=payroll" : "/admin?view=payroll";

async function moneyFor(ctx: CapabilityContext, campusId: string) {
  const policy = await getLocalePackage(ctx.user.schoolId, campusId, ctx.now, ctx.locale as Language);
  return { policy, show: (minor: number, currency: string) => formatMoney({ minor, currency }, policy) };
}

/** One row whose name the user said (exact, then folded). Several become a question; none returns null. */
function byName<T extends { id: string; name: string; code?: string }>(rows: readonly T[], said: string, pointer: string, promptKey: string): T | null {
  const exact = rows.filter(row => row.name === said.trim());
  if (exact.length === 1) return exact[0];
  const wanted = fold(said);
  const found = rows.filter(row => fold(row.name) === wanted || (row.code !== undefined && fold(row.code) === wanted));
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new InputRequired([{ pointer, promptKey, params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.code ?? row.name, label: row.code ? `${row.name} · ${row.code}` : row.name })) }]);
  return null;
}

const alreadyLine = (ctx: CapabilityContext) => ({ label: say(ctx, l("Already set up", "موجود مسبقاً", "پہلے سے موجود")), value: say(ctx, l("This is already on file; nothing new is created.", "هذا مسجل مسبقاً؛ لن يُنشأ شيء جديد.", "یہ پہلے سے درج ہے؛ کچھ نیا نہیں بنے گا۔")) });

function writeReceipt(capability: string, model: string, id: string, created: boolean, link: string, detail: Record<string, unknown> = {}): Receipt {
  // A row already on file under the same name is this step's own earlier write (or an identical one): reconciled.
  return { kind: "write", capability, entities: [{ model, id }], counts: { created: created ? 1 : 0 }, link, replayed: false, detail: created ? detail : { reconciled: true, ...detail } };
}

// ─── accounts.create_account ──────────────────────────────────────────────

const TYPE_LABEL: Record<string, L10n> = {
  ASSET: l("Asset", "أصل", "اثاثہ"), LIABILITY: l("Liability", "التزام", "واجب الادا"), EQUITY: l("Equity", "حقوق الملكية", "سرمایہ"),
  INCOME: l("Income", "إيراد", "آمدنی"), EXPENSE: l("Expense", "مصروف", "خرچ"),
};
const accountInput = z.strictObject({
  /** The account's name ("Stationery expense", "Canteen income"). */
  name: NAME,
  type: z.enum(ACCOUNT_TYPES as [string, ...string[]]),
});
type AccountInput = z.infer<typeof accountInput>;

async function bindAccount(ctx: CapabilityContext, input: AccountInput) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.chartOfAccount.findMany({ where: { campusId }, select: { id: true, name: true, type: true } });
  return { campusId, existing: byName(rows, input.name, "/name", "ACCOUNT_AMBIGUOUS") };
}

const CREATE_ACCOUNT = defineCapability<AccountInput>({
  key: "accounts.create_account", version: 1, cluster: "C6", inventoryKeys: ["accounts.create_account"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: accountInput, evidence: ["/name"],
  gates: deskGates("accounts", "edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Add an account to the books", "Add an income, expense, asset, liability or equity account to the chart of accounts.", "Add an expense account called Stationery"],
    ["إضافة حساب إلى الدفاتر", "إضافة حساب إيراد أو مصروف أو أصل أو التزام أو حقوق ملكية إلى دليل الحسابات.", "أضف حساب مصروف باسم القرطاسية"],
    ["کھاتے میں نیا اکاؤنٹ", "چارٹ آف اکاؤنٹس میں آمدنی، خرچ، اثاثہ، واجب الادا یا سرمایہ کا اکاؤنٹ بنائیں۔", "اسٹیشنری کے نام سے خرچ کا اکاؤنٹ بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/accounts/chart", service: "src/lib/accounts/chart-account-command.ts:createChartAccount", reuse: "extracted" },
  async resolve(ctx, input) {
    const { existing } = await bindAccount(ctx, input);
    if (existing && existing.type !== input.type) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ACCOUNT_EXISTS_OTHER_TYPE", type: existing.type });
    return existing ? { ...input, name: existing.name } : input;
  },
  async preview(ctx, input) {
    const { existing } = await bindAccount(ctx, input);
    return {
      title: say(ctx, l("Add an account", "إضافة حساب", "اکاؤنٹ بنائیں")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        { label: say(ctx, l("Type", "النوع", "قسم")), value: say(ctx, TYPE_LABEL[input.type]) },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { accounts: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Add account", "إضافة الحساب", "اکاؤنٹ بنائیں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing } = await bindAccount(ctx, input);
    if (existing) {
      if (existing.type !== input.type) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ACCOUNT_EXISTS_OTHER_TYPE", type: existing.type });
      return writeReceipt("accounts.create_account", "chartOfAccount", existing.id, false, accountsLink(ctx, "chart"));
    }
    const account = await createChartAccount(ctx.user, { campusId, name: input.name, type: input.type }).catch(domain);
    return writeReceipt("accounts.create_account", "chartOfAccount", account.id, true, accountsLink(ctx, "chart"), { type: account.type });
  },
});

// ─── accounts.create_bank_account ─────────────────────────────────────────

/**
 * Names only (RT5). There is no field for an account number, IBAN, card, branch code or opening balance, and
 * the strict schema refuses one if the model adds it; a name or bank name carrying a long digit run is refused
 * too. The receipt links to the Accounts screen, where the person types the number on the native form.
 */
export const bankAccountInput = z.strictObject({
  /** What the school calls the account ("Meezan Bank – Fees"). */
  name: NAME_ONLY,
  /** The bank's name ("Meezan Bank"), if the user said it. */
  bankName: NAME_ONLY.optional(),
});
type BankInput = z.infer<typeof bankAccountInput>;

async function bindBank(ctx: CapabilityContext, input: BankInput) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.bankAccount.findMany({ where: { campusId }, select: { id: true, name: true, currency: true, accountNumber: true } });
  return { campusId, existing: byName(rows, input.name, "/name", "BANK_ACCOUNT_AMBIGUOUS") };
}
const numberLater = (ctx: CapabilityContext) => ({ label: say(ctx, l("Account number", "رقم الحساب", "اکاؤنٹ نمبر")), value: say(ctx, l("Not added here. Type it yourself on the Accounts screen.", "لا يُضاف هنا. اكتبه بنفسك في شاشة الحسابات.", "یہاں نہیں لکھا جاتا۔ اکاؤنٹس اسکرین پر خود لکھیں۔")) });

const CREATE_BANK_ACCOUNT = defineCapability<BankInput>({
  key: "accounts.create_bank_account", version: 1, cluster: "C6", inventoryKeys: ["accounts.create_bank_account"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: bankAccountInput, evidence: ["/name"],
  // POST /api/accounts/bank-accounts checks accounts.add only (no canManageFinance).
  gates: deskGates("accounts", "add", false), scope: { kind: "own-campus" },
  copy: c(
    ["Add a bank account by name", "Add the bank account fee money is paid into, by name only. You type the account number yourself on the Accounts screen.", "Add our Meezan Bank fees account"],
    ["إضافة حساب بنكي بالاسم", "إضافة الحساب البنكي الذي تُدفع فيه الرسوم، بالاسم فقط. تكتب رقم الحساب بنفسك في شاشة الحسابات.", "أضف حساب الرسوم في بنك الراجحي"],
    ["بینک اکاؤنٹ کا نام درج کریں", "جس بینک اکاؤنٹ میں فیس آتی ہے اسے صرف نام سے بنائیں۔ اکاؤنٹ نمبر آپ اکاؤنٹس اسکرین پر خود لکھیں گے۔", "میزان بینک والا فیس اکاؤنٹ بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/accounts/bank-accounts", service: "src/lib/accounts/bank-account-command.ts:createBankAccount", reuse: "extracted" },
  async resolve(ctx, input) {
    const { existing } = await bindBank(ctx, input);
    return existing ? { ...input, name: existing.name } : input;
  },
  async preview(ctx, input) {
    const { campusId, existing } = await bindBank(ctx, input);
    const currency = existing?.currency ?? (await getLocalePackage(ctx.user.schoolId, campusId)).currency;
    return {
      title: say(ctx, l("Add a bank account", "إضافة حساب بنكي", "بینک اکاؤنٹ بنائیں")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        ...(input.bankName ? [{ label: say(ctx, l("Bank", "البنك", "بینک")), value: input.bankName }] : []),
        { label: say(ctx, l("Currency", "العملة", "کرنسی")), value: currency },
        numberLater(ctx),
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { bankAccounts: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Add bank account", "إضافة الحساب", "بینک اکاؤنٹ بنائیں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null, currency },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing } = await bindBank(ctx, input);
    if (existing) return writeReceipt("accounts.create_bank_account", "bankAccount", existing.id, false, accountsLink(ctx, "banks"), { numberOnFile: Boolean(existing.accountNumber) });
    // Only the name and bank name are passed: no number, no opening balance.
    const bank = await createBankAccount(ctx.user, { campusId, name: input.name, bankName: input.bankName ?? null }).catch(domain);
    return writeReceipt("accounts.create_bank_account", "bankAccount", bank.id, true, accountsLink(ctx, "banks"), { currency: bank.currency, numberOnFile: false, next: "ADD_ACCOUNT_NUMBER_ON_ACCOUNTS_SCREEN" });
  },
});

// ─── accounts.create_payment_method ───────────────────────────────────────

const paymentMethodInput = z.strictObject({
  /** The method's name as the school says it ("Cash at the office", "JazzCash"). */
  name: NAME_ONLY,
  /** What kind of method it is; shown in the preview, not stored. */
  kind: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "WALLET"]).optional(),
});
type MethodInput = z.infer<typeof paymentMethodInput>;
const KIND_LABEL: Record<string, L10n> = {
  CASH: l("Cash", "نقداً", "نقد"), BANK_TRANSFER: l("Bank transfer", "تحويل بنكي", "بینک ٹرانسفر"), CHEQUE: l("Cheque", "شيك", "چیک"),
  CARD: l("Card", "بطاقة", "کارڈ"), WALLET: l("Mobile wallet", "محفظة إلكترونية", "موبائل والٹ"),
};

async function bindMethod(ctx: CapabilityContext, input: MethodInput) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.paymentMethodRef.findMany({ where: { campusId }, select: { id: true, name: true } });
  return { campusId, existing: byName(rows, input.name, "/name", "PAYMENT_METHOD_AMBIGUOUS") };
}

const CREATE_PAYMENT_METHOD = defineCapability<MethodInput>({
  key: "accounts.create_payment_method", version: 1, cluster: "C6", inventoryKeys: ["accounts.create_payment_method"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: paymentMethodInput, evidence: ["/name"],
  gates: deskGates("accounts", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Add a payment method", "Add a way families pay (cash, bank transfer, cheque, card or a mobile wallet) so payments can be recorded against it.", "Add JazzCash as a payment method"],
    ["إضافة طريقة دفع", "إضافة طريقة تدفع بها الأسر (نقداً أو تحويل أو شيك أو بطاقة أو محفظة) لتُسجّل المدفوعات بها.", "أضف STC Pay كطريقة دفع"],
    ["ادائیگی کا طریقہ شامل کریں", "والدین جس طریقے سے فیس دیتے ہیں (نقد، بینک ٹرانسفر، چیک، کارڈ یا موبائل والٹ) وہ شامل کریں تاکہ ادائیگیاں اسی کے تحت درج ہوں۔", "جاز کیش کو ادائیگی کے طریقے میں شامل کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/accounts/payment-methods", service: "src/lib/accounts/payment-method-command.ts:createPaymentMethod", reuse: "extracted" },
  async resolve(ctx, input) {
    const { existing } = await bindMethod(ctx, input);
    return existing ? { ...input, name: existing.name } : input;
  },
  async preview(ctx, input) {
    const { existing } = await bindMethod(ctx, input);
    return {
      title: say(ctx, l("Add a payment method", "إضافة طريقة دفع", "ادائیگی کا طریقہ")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        ...(input.kind ? [{ label: say(ctx, l("Kind", "النوع", "قسم")), value: say(ctx, KIND_LABEL[input.kind]) }] : []),
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { paymentMethods: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Add payment method", "إضافة الطريقة", "طریقہ شامل کریں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing } = await bindMethod(ctx, input);
    if (existing) return writeReceipt("accounts.create_payment_method", "paymentMethodRef", existing.id, false, accountsLink(ctx, "methods"));
    const method = await createPaymentMethod(ctx.user, { campusId, name: input.name }).catch(domain);
    return writeReceipt("accounts.create_payment_method", "paymentMethodRef", method.id, true, accountsLink(ctx, "methods"));
  },
});

// ─── tax.save_package_draft ───────────────────────────────────────────────

/**
 * A DRAFT tax package for this campus: the package for the campus's own country (latest version), the legal
 * name and the fee types the user says are exempt. The tax number, validation owner, review evidence and the
 * fixture run are added on the Tax screen; the institution authority signs it off there (never from here).
 */
const taxInput = z.strictObject({
  /** The school's registered legal name, as the user said it. */
  legalName: z.string().trim().min(2).max(200),
  /** Fee types the user said are exempt or zero-rated ("Tuition", "Transport"), by name. */
  exemptFeeTypes: z.array(NAME).max(30).optional(),
  /** When invoices should start carrying tax, if the user said. */
  effectiveFrom: DAY.optional(),
});
type TaxInput = z.infer<typeof taxInput>;

async function bindTax(ctx: CapabilityContext, input: TaxInput) {
  const campusId = ownCampusId(ctx);
  const policy = await getLocalePackage(ctx.user.schoolId, campusId);
  const country = policy.country ?? "OTHER";
  const pkg = PACKAGES.find(item => item.versions.some(version => version.country === country));
  if (!pkg) throw new WorkflowError("DOMAIN_REFUSED", { reason: "TAX_NO_PACKAGE", country });
  const version = [...pkg.versions].filter(item => item.country === country).sort((a, b) => b.version - a.version)[0];
  const currency = version.currencies.includes(policy.currency) ? policy.currency : version.currencies[0];
  const types = await prisma.feeType.findMany({ where: { campusId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
  const unclear: RequiredField[] = [];
  const exempt: Array<{ name: string; code: string }> = [];
  (input.exemptFeeTypes ?? []).forEach((said, index) => {
    const found = byName(types, said, `/exemptFeeTypes/${index}`, "FEE_TYPE_AMBIGUOUS");
    if (found) exempt.push({ name: found.name, code: found.code });
    else unclear.push({ pointer: `/exemptFeeTypes/${index}`, promptKey: "FEE_TYPE_NOT_FOUND", options: types.slice(0, 8).map(row => ({ value: row.name, label: row.name })) });
  });
  if (unclear.length) throw new InputRequired(unclear);
  const exemptFeeCodes = [...new Set(exempt.map(row => row.code))].sort();
  const drafts = await prisma.taxActivation.findMany({ where: { schoolId: ctx.user.schoolId, status: "DRAFT", packageCode: pkg.code, packageVersion: version.version, campusIds: { has: campusId } }, select: { id: true, legalName: true, exemptFeeCodes: true, currency: true, effectiveFrom: true }, orderBy: { createdAt: "asc" } });
  const same = (row: (typeof drafts)[number]) => row.legalName === input.legalName.trim() && row.currency === currency
    && [...row.exemptFeeCodes].sort().join(",") === exemptFeeCodes.join(",") && (row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null) === (input.effectiveFrom ?? null);
  return { campusId, pkg, version, currency, exempt, exemptFeeCodes, existing: drafts.find(same) ?? null, other: drafts.find(row => !same(row)) ?? null };
}

const SAVE_TAX_DRAFT = defineCapability<TaxInput>({
  key: "tax.save_package_draft", version: 1, cluster: "C6", inventoryKeys: ["tax.save_package_draft"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: taxInput, evidence: ["/legalName"],
  // saveDraft: assertFeesRead + canManageFinance.
  gates: deskGates("fees", "view"), scope: { kind: "own-campus" },
  copy: c(
    ["Start a tax package draft", "Prepare a draft invoice tax package for your campus's country. You add the tax number and review evidence on the Tax screen; your school's administrator signs it off.", "Start a VAT draft for Al Noor Schools LLC, transport is exempt"],
    ["بدء مسودة حزمة ضريبية", "إعداد مسودة حزمة ضريبة الفواتير لبلد فرعك. تضيف الرقم الضريبي وأدلة المراجعة في شاشة الضريبة، ويعتمدها مسؤول المدرسة.", "ابدأ مسودة ضريبة القيمة المضافة لشركة مدارس النور، والنقل معفى"],
    ["ٹیکس پیکج کا مسودہ بنائیں", "اپنے کیمپس کے ملک کے لیے انوائس ٹیکس پیکج کا مسودہ تیار کریں۔ ٹیکس نمبر اور جائزے کا ثبوت ٹیکس اسکرین پر آپ لکھیں گے؛ منظوری اسکول کے منتظم دیں گے۔", "النور ایجوکیشن سسٹم کے نام سے ٹیکس کا مسودہ بنا دیں، ٹرانسپورٹ فیس مستثنیٰ ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/tax (action=draft)", service: "src/lib/tax/service.ts:saveDraft", reuse: "direct" },
  async resolve(ctx, input) {
    if (input.effectiveFrom && !isRealDay(input.effectiveFrom)) throw new InputRequired([{ pointer: "/effectiveFrom", promptKey: "DATE_INVALID" }]);
    const { exempt, existing, other } = await bindTax(ctx, input);
    // A different draft for the same package is edited on the Tax screen, never overwritten from here.
    if (!existing && other) throw new WorkflowError("DOMAIN_REFUSED", { reason: "TAX_DRAFT_EXISTS" });
    return { ...input, ...(input.exemptFeeTypes ? { exemptFeeTypes: exempt.map(row => row.name) } : {}) };
  },
  async preview(ctx, input) {
    const { pkg, version, currency, exempt, existing } = await bindTax(ctx, input);
    return {
      title: say(ctx, l("Start a tax package draft", "بدء مسودة ضريبية", "ٹیکس مسودہ بنائیں")),
      lines: [
        { label: say(ctx, l("Package", "الحزمة", "پیکج")), value: `${pkg.name} · v${version.version}` },
        { label: say(ctx, l("Legal name", "الاسم القانوني", "قانونی نام")), value: input.legalName },
        { label: say(ctx, l("Currency", "العملة", "کرنسی")), value: currency },
        { label: say(ctx, l("Exempt fee types", "أنواع رسوم معفاة", "مستثنیٰ فیس")), value: exempt.length ? exempt.map(row => row.name).join(", ") : "—" },
        ...(input.effectiveFrom ? [{ label: say(ctx, l("Effective from", "يسري من", "نافذ از")), value: input.effectiveFrom }] : []),
        { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, l("Draft only. Add the tax number and review evidence on the Tax screen; your administrator signs it off.", "مسودة فقط. أضف الرقم الضريبي وأدلة المراجعة في شاشة الضريبة؛ ويعتمدها المسؤول.", "صرف مسودہ۔ ٹیکس نمبر اور جائزے کا ثبوت ٹیکس اسکرین پر لکھیں؛ منظوری منتظم دیں گے۔")) },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { drafts: existing ? 0 : 1 },
      confirmLabel: say(ctx, l("Save tax draft", "حفظ المسودة", "مسودہ محفوظ کریں")),
      basis: { input, packageCode: pkg.code, packageVersion: version.version, currency, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, pkg, version, currency, exemptFeeCodes, existing, other } = await bindTax(ctx, input);
    const receipt = (id: string, created: boolean): Receipt => ({ kind: "draft", capability: "tax.save_package_draft", entities: [{ model: "taxActivation", id }], counts: { created: created ? 1 : 0 }, link: taxLink(ctx), replayed: false, detail: { packageCode: pkg.code, packageVersion: version.version, status: "DRAFT", ...(created ? {} : { reconciled: true }) } });
    if (existing) return receipt(existing.id, false);
    if (other) throw new WorkflowError("DOMAIN_REFUSED", { reason: "TAX_DRAFT_EXISTS" });
    const saved = await saveTaxDraft(ctx.user, { packageCode: pkg.code, packageVersion: version.version, campusIds: [campusId], legalName: input.legalName, exemptFeeCodes, currency, effectiveFrom: input.effectiveFrom ?? null }).catch(domain);
    return receipt(saved.id, true);
  },
});

// ─── fees.assign_discount ─────────────────────────────────────────────────

const discountAssignInput = z.strictObject({
  /** The discount's name or code ("Sibling discount", "SIBLING_DISCOUNT"); it may be created by an earlier step. */
  discount: NAME,
  /** Each pupil the user named, with the user's own words for that pupil (each needs its own quote). */
  students: z.array(z.strictObject({
    /** The pupil's name or roll number as the user said it ("Ali Raza", "roll 12"). */
    name: z.string().trim().min(1).max(120),
    /** The user's words naming this pupil for this discount. */
    said: z.string().trim().min(1).max(500),
  })).min(1).max(60),
  /** Narrows the pupil search to one class (a class handle); otherwise the whole campus. */
  classId: z.string().min(1).optional(),
  /** Bound by the server, in the order of `students`; never taken from the model. */
  studentIds: z.array(z.string().min(1).max(64)).max(60).optional(),
});
type DiscountAssignInput = z.infer<typeof discountAssignInput>;

async function campusRoster(ctx: CapabilityContext, classId?: string): Promise<Pupil[]> {
  const campusId = ownCampusId(ctx);
  if (classId) return classRoster(ctx, (await assignedClass(ctx, classId)).id);
  return prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "active", archivedAt: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { fullName: "asc" } });
}
const discountsOf = (campusId: string) => prisma.feeDiscount.findMany({ where: { campusId }, select: { id: true, name: true, code: true, type: true, value: true, currency: true } });

async function bindPupils(ctx: CapabilityContext, input: DiscountAssignInput) {
  const roster = await campusRoster(ctx, input.classId);
  if (input.studentIds) {
    // Execute and preview re-check every bound id against this actor's roster now.
    if (input.studentIds.length !== input.students.length) throw new WorkflowError("STALE_VERSION");
    const byId = new Map(roster.map(pupil => [pupil.id, pupil]));
    return input.studentIds.map(id => { const pupil = byId.get(id); if (!pupil) throw new WorkflowError("SCOPE_DENIED"); return pupil; });
  }
  const bound = resolvePupils(roster, input.students.map((row, index) => ({ pointer: `/students/${index}/name`, text: row.name })));
  return input.students.map((_, index) => bound.get(`/students/${index}/name`)!);
}

const ASSIGN_DISCOUNT = defineCapability<DiscountAssignInput>({
  key: "fees.assign_discount", version: 1, cluster: "C6", inventoryKeys: ["fees.assign_discount"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: discountAssignInput, evidence: ["/discount", "/students/*/said"], humanFields: ["studentIds"], limits: { maxItems: 60 },
  gates: deskGates("fees", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Give a discount to pupils", "Give an existing fee discount (for example a sibling discount) to the pupils you name. Their next invoices use it.", "Give the sibling discount to Ali Raza and Sara Raza"],
    ["منح خصم لطلاب", "منح خصم رسوم موجود (مثل خصم الإخوة) للطلاب الذين تسمّيهم. تُطبَّق على فواتيرهم القادمة.", "امنح خصم الإخوة لعلي رضا وسارة رضا"],
    ["طلبہ کو رعایت دیں", "موجودہ فیس رعایت (مثلاً بہن بھائی کی رعایت) آپ کے بتائے ہوئے طلبہ کو دیں۔ ان کی اگلی انوائس میں لگے گی۔", "علی رضا اور سارہ رضا کو بہن بھائی والی رعایت دے دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/discount-assignments", service: "src/lib/fees/assign-discount-command.ts:assignDiscount", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    if (input.classId) await assignedClass(ctx, input.classId);
    const pupils = await bindPupils(ctx, { ...input, studentIds: undefined });
    const discount = byName(await discountsOf(campusId), input.discount, "/discount", "FEE_DISCOUNT_AMBIGUOUS");
    return { ...input, discount: discount?.name ?? input.discount, students: input.students.map((row, index) => ({ ...row, name: pupils[index].fullName })), studentIds: pupils.map(pupil => pupil.id) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const pupils = await bindPupils(ctx, input);
    const discount = byName(await discountsOf(campusId), input.discount, "/discount", "FEE_DISCOUNT_AMBIGUOUS");
    const have = discount ? new Set((await prisma.feeDiscountAssignment.findMany({ where: { discountId: discount.id, studentId: { in: pupils.map(pupil => pupil.id) } }, select: { studentId: true } })).map(row => row.studentId)) : new Set<string>();
    const money = await moneyFor(ctx, campusId);
    const value = discount ? (discount.type === "PERCENT" ? `${discount.value}%` : money.show(discount.value, discount.currency)) : say(ctx, l("not set up yet: an earlier step of this plan creates it", "غير موجود بعد: تُنشئه خطوة سابقة في هذه الخطة", "ابھی موجود نہیں: اس منصوبے کا پچھلا مرحلہ اسے بنائے گا"));
    const fresh = pupils.filter(pupil => !have.has(pupil.id));
    return {
      title: say(ctx, l("Give a discount", "منح خصم", "رعایت دیں")),
      lines: [
        { label: say(ctx, l("Discount", "الخصم", "رعایت")), value: `${discount?.name ?? input.discount} · ${value}` },
        { label: say(ctx, l("Pupils", "الطلاب", "طلبہ")), value: pupils.map(pupilLabel).join("; ") },
        ...(have.size ? [{ label: say(ctx, l("Already have it", "لديهم الخصم مسبقاً", "پہلے سے رعایت ہے")), value: String(have.size) }] : []),
        { label: say(ctx, l("Invoices", "الفواتير", "انوائس")), value: say(ctx, l("Invoices already issued keep their amounts; new invoices use the discount.", "الفواتير الصادرة تبقى كما هي؛ الفواتير الجديدة تطبّق الخصم.", "پہلے سے جاری انوائس ویسی رہیں گی؛ نئی انوائس میں رعایت لگے گی۔")) },
      ],
      counts: { pupils: fresh.length, alreadyAssigned: have.size },
      confirmLabel: `${say(ctx, l("Give discount", "منح الخصم", "رعایت دیں"))} · ${fresh.length}`,
      basis: { input, discount: discount?.id ?? null, already: [...have].sort() },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const pupils = await bindPupils(ctx, input);
    const discount = byName(await discountsOf(campusId), input.discount, "/discount", "FEE_DISCOUNT_AMBIGUOUS");
    if (!discount) throw new WorkflowError("NOT_FOUND", { missing: "discount" });
    const entities: Receipt["entities"] = [];
    let assigned = 0, alreadyAssigned = 0;
    for (const pupil of pupils) {
      const existing = await prisma.feeDiscountAssignment.findUnique({ where: { discountId_studentId: { discountId: discount.id, studentId: pupil.id } }, select: { id: true } });
      if (existing) { alreadyAssigned++; entities.push({ model: "feeDiscountAssignment", id: existing.id }); continue; }
      const created = await assignDiscount(ctx.user, { discountId: discount.id, studentId: pupil.id }).catch(domain);
      assigned++; entities.push({ model: "feeDiscountAssignment", id: created.id });
    }
    return { kind: "write", capability: "fees.assign_discount", entities, counts: { assigned, alreadyAssigned }, link: feeLink(ctx, "discounts"), replayed: false, detail: { discountId: discount.id, ...(assigned ? {} : { reconciled: true }) } };
  },
});

// ─── payroll.set_employee_details ─────────────────────────────────────────

/**
 * Non-bank payroll fields only: the employee's id at a payroll provider and their last working day. Bank
 * account, IBAN and salary are never here (they are typed on the native staff and payroll screens).
 */
const STAFF_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
const employeeInput = z.strictObject({
  /** The staff member's name as the user said it. */
  employee: z.string().trim().min(1).max(120),
  /** Their employee id at a payroll provider the campus has set up ("EOBI" → "E-1042"). */
  providers: z.array(z.strictObject({
    /** The provider's code or name, as set up on the Payroll screen. */
    provider: z.string().trim().min(1).max(120),
    employeeId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/u),
  })).max(10).optional(),
  /** The last working day, if the user said one; null clears it. */
  leavingDate: DAY.nullable().optional(),
  /** Bound by the server from `employee`; never taken from the model. */
  userId: z.string().min(1).max(64).optional(),
});
type EmployeeInput = z.infer<typeof employeeInput>;

async function bindEmployee(ctx: CapabilityContext, input: EmployeeInput) {
  const campusId = ownCampusId(ctx);
  const staff = await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, campusId, isActive: true, role: { in: [...STAFF_ROLES] } }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });
  let person: (typeof staff)[number] | undefined;
  if (input.userId) {
    person = staff.find(row => row.id === input.userId);
    if (!person) throw new WorkflowError("SCOPE_DENIED");
  } else {
    const wanted = fold(input.employee);
    const exact = staff.filter(row => fold(row.fullName) === wanted);
    const found = exact.length ? exact : staff.filter(row => { const words = fold(row.fullName).split(" "); return wanted.split(" ").every((part, index) => words[index]?.startsWith(part) || words.includes(part)); });
    if (found.length !== 1) throw new InputRequired([found.length
      ? { pointer: "/employee", promptKey: "STAFF_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.fullName, label: `${row.fullName} · ${row.role}` })) }
      : { pointer: "/employee", promptKey: "STAFF_NOT_FOUND" }]);
    person = found[0];
  }
  const providerRows = await prisma.payrollProvider.findMany({ where: { campusId }, select: { id: true, code: true, name: true }, orderBy: [{ code: "asc" }, { version: "desc" }] });
  const providers = [...new Map(providerRows.map(row => [row.code, row])).values()];
  const unclear: RequiredField[] = [];
  const providerIds: Record<string, string> = {};
  (input.providers ?? []).forEach((row, index) => {
    const found = providers.filter(item => fold(item.code) === fold(row.provider) || fold(item.name) === fold(row.provider));
    if (found.length === 1) providerIds[found[0].code] = row.employeeId;
    else unclear.push({ pointer: `/providers/${index}/provider`, promptKey: found.length ? "PAYROLL_PROVIDER_AMBIGUOUS" : "PAYROLL_PROVIDER_NOT_FOUND", options: (found.length ? found : providers).slice(0, 8).map(item => ({ value: item.code, label: `${item.name} · ${item.code}` })) });
  });
  if (unclear.length) throw new InputRequired(unclear);
  const existing = await prisma.payrollEmployee.findUnique({ where: { schoolId_userId: { schoolId: ctx.user.schoolId, userId: person.id } }, select: { id: true, providerIds: true, leavingDate: true } });
  const before = (existing?.providerIds as Record<string, string> | null) ?? {};
  const leavingBefore = existing?.leavingDate ? existing.leavingDate.toISOString().slice(0, 10) : null;
  const unchanged = Object.entries(providerIds).every(([code, id]) => before[code] === id) && (input.leavingDate === undefined || input.leavingDate === leavingBefore);
  return { person, providerIds, existing, before, leavingBefore, unchanged };
}

const SET_EMPLOYEE = defineCapability<EmployeeInput>({
  key: "payroll.set_employee_details", version: 1, cluster: "C6", inventoryKeys: ["payroll.set_employee_details"], risk: "UPDATE", roles: FINANCE_ROLES, class: "B",
  input: employeeInput, evidence: ["/employee"], humanFields: ["userId"],
  // setEmployee → canPrepare: ACCOUNTANT/CAMPUS_ADMIN/ADMIN + payroll.view, on the actor's own campus.
  gates: deskGates("payroll", "view", false), scope: { kind: "own-campus" },
  copy: c(
    ["Set an employee's payroll details", "Record a staff member's employee id at your payroll provider, or their last working day. Bank details are entered on the payroll screen, never here.", "Ayesha Khan's EOBI id is E-1042 and her last day is 31 December"],
    ["تحديد بيانات رواتب موظف", "سجّل رقم الموظف لدى مزوّد الرواتب أو آخر يوم عمل له. البيانات البنكية تُدخل في شاشة الرواتب فقط.", "رقم فاطمة أحمد لدى مزوّد الرواتب هو E-1042 وآخر يوم لها 31 ديسمبر"],
    ["ملازم کی پے رول تفصیل", "پے رول فراہم کنندہ پر ملازم کی آئی ڈی یا اس کا آخری کام کا دن درج کریں۔ بینک کی تفصیل صرف پے رول اسکرین پر لکھی جاتی ہے۔", "عائشہ خان کی EOBI آئی ڈی E-1042 ہے اور ان کا آخری دن 31 دسمبر ہے"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/payroll/runs (action=employee)", service: "src/lib/payroll-runs/service.ts:setEmployee", reuse: "direct" },
  async resolve(ctx, input) {
    if (input.leavingDate && !isRealDay(input.leavingDate)) throw new InputRequired([{ pointer: "/leavingDate", promptKey: "DATE_INVALID" }]);
    if (!input.providers?.length && input.leavingDate === undefined) throw new InputRequired([{ pointer: "/providers", promptKey: "PAYROLL_DETAIL_NEEDED" }]);
    const { person } = await bindEmployee(ctx, { ...input, userId: undefined });
    return { ...input, employee: person.fullName, userId: person.id };
  },
  async preview(ctx, input) {
    const { person, providerIds, before, leavingBefore, unchanged } = await bindEmployee(ctx, input);
    return {
      title: say(ctx, l("Set payroll details", "تحديد بيانات الرواتب", "پے رول تفصیل")),
      lines: [
        { label: say(ctx, l("Employee", "الموظف", "ملازم")), value: person.fullName },
        ...Object.entries(providerIds).map(([code, id]) => ({ label: `${say(ctx, l("Provider id", "رقم المزوّد", "فراہم کنندہ آئی ڈی"))} · ${code}`, value: before[code] && before[code] !== id ? `${before[code]} → ${id}` : id })),
        ...(input.leavingDate !== undefined ? [{ label: say(ctx, l("Last working day", "آخر يوم عمل", "آخری کام کا دن")), value: `${leavingBefore ?? "—"} → ${input.leavingDate ?? "—"}` }] : []),
        { label: say(ctx, l("Payroll", "الرواتب", "پے رول")), value: say(ctx, l("An approved payroll for this campus goes back for approval after this change.", "أي رواتب معتمدة لهذا الفرع تعود للاعتماد بعد هذا التغيير.", "اس تبدیلی کے بعد اس کیمپس کا منظور شدہ پے رول دوبارہ منظوری کے لیے جائے گا۔")) },
        ...(unchanged ? [alreadyLine(ctx)] : []),
      ],
      counts: { employees: unchanged ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Save payroll details", "حفظ البيانات", "تفصیل محفوظ کریں"))} · ${person.fullName}`,
      basis: { input, before, leavingBefore },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { person, providerIds, existing, unchanged } = await bindEmployee(ctx, input);
    // The same values already on file: nothing is written, so no approved run is sent back for approval.
    if (unchanged && existing) return writeReceipt("payroll.set_employee_details", "payrollEmployee", existing.id, false, payrollLink(ctx), { userId: person.id });
    const saved = await setEmployee(ctx.user, person.id, { ...(Object.keys(providerIds).length ? { providerIds } : {}), ...(input.leavingDate !== undefined ? { leavingDate: input.leavingDate } : {}) }).catch(domain);
    return { ...writeReceipt("payroll.set_employee_details", "payrollEmployee", saved.id, true, payrollLink(ctx), { userId: person.id }), counts: { updated: 1 } };
  },
});

// ─── read.fees.defaulters ─────────────────────────────────────────────────

const READ_GATES = [roles(FINANCE_ROLES), permission("fees", "view"), ownCampus()];
const OPEN = { status: { not: "CANCELLED" as const }, balanceDue: { gt: 0 } };
const dayStart = (day: string) => new Date(`${day}T00:00:00Z`);

async function campusToday(ctx: CapabilityContext, campusId: string) {
  const { timezone } = await getLocalePackage(ctx.user.schoolId, campusId, ctx.now);
  return calendarDateIn(timezone, ctx.now);
}

const defaultersInput = z.strictObject({
  /** Pupils behind by MORE than this many months of fees ("more than 2 months" → 2; "anyone who owes" → 0). */
  moreThanMonths: z.number().int().min(0).max(24).default(0),
  /** Narrows the list to one class (a class handle). */
  classId: z.string().min(1).optional(),
});
type DefaultersInput = z.output<typeof defaultersInput>;

const READ_DEFAULTERS = defineCapability<DefaultersInput>({
  key: "read.fees.defaulters", version: 1, cluster: "C6", inventoryKeys: ["read.fees.defaulters"], risk: "READ", class: "A", roles: FINANCE_ROLES,
  input: defaultersInput as z.ZodType<DefaultersInput>, evidence: [],
  gates: READ_GATES, scope: { kind: "own-campus" }, idempotency: { mode: "convergent" },
  copy: c(
    ["Who owes fees", "See how many pupils owe fees for more than a number of months, and the list, from this campus's invoices.", "Who owes more than 2 months?"],
    ["من عليه رسوم متأخرة", "اعرف عدد الطلاب المتأخرين في الرسوم لأكثر من عدد من الأشهر وقائمتهم من فواتير هذا الفرع.", "من عليه رسوم أكثر من شهرين؟"],
    ["کس کی فیس باقی ہے", "اس کیمپس کی انوائس سے دیکھیں کہ کتنے طلبہ کی فیس کتنے مہینوں سے زیادہ باقی ہے، اور ان کی فہرست۔", "کن بچوں کی دو مہینے سے زیادہ فیس باقی ہے؟"],
  ),
  source: { route: "GET /api/fees/reports/defaulters", service: "src/app/api/fees/reports/defaulters/route.ts (same invoice filter, campus-scoped)", reuse: "direct" },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const classId = input.classId ? (await assignedClass(ctx, input.classId)).id : null;
    const today = await campusToday(ctx, campusId);
    const invoices = await prisma.invoice.findMany({
      where: { schoolId: ctx.user.schoolId, campusId, ...OPEN, dueDate: { lt: dayStart(today) }, ...(classId ? { student: { classId } } : {}) },
      select: { studentId: true, currency: true, balanceDue: true, dueDate: true, student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } } },
      orderBy: { dueDate: "asc" },
    });
    const pupils = new Map<string, { studentId: string; name: string; rollNo: string; className: string; months: Set<string>; owed: Map<string, number>; oldestDue: string }>();
    for (const invoice of invoices) {
      const row = pupils.get(invoice.studentId) ?? { studentId: invoice.studentId, name: invoice.student.fullName, rollNo: invoice.student.rollNo, className: [invoice.student.class.name, invoice.student.class.section].filter(Boolean).join(" "), months: new Set<string>(), owed: new Map<string, number>(), oldestDue: invoice.dueDate.toISOString().slice(0, 10) };
      row.months.add(invoice.dueDate.toISOString().slice(0, 7));
      row.owed.set(invoice.currency, (row.owed.get(invoice.currency) ?? 0) + invoice.balanceDue);
      pupils.set(invoice.studentId, row);
    }
    const list = [...pupils.values()].filter(row => row.months.size > input.moreThanMonths)
      .map(row => ({ studentId: row.studentId, name: row.name, rollNo: row.rollNo, className: row.className, monthsOwed: row.months.size, oldestDue: row.oldestDue, owed: [...row.owed].map(([currency, minor]) => ({ currency, minor })) }))
      .sort((a, b) => b.monthsOwed - a.monthsOwed || a.name.localeCompare(b.name));
    const totals = new Map<string, number>();
    for (const row of list) for (const entry of row.owed) totals.set(entry.currency, (totals.get(entry.currency) ?? 0) + entry.minor);
    const money = await moneyFor(ctx, campusId);
    const sum = [...totals].map(([currency, minor]) => money.show(minor, currency)).join(", ");
    const head = list.length
      ? say(ctx, l("{count} pupils owe fees for more than {months} months ({total}).", "{count} طالباً عليهم رسوم لأكثر من {months} أشهر ({total}).", "{count} طلبہ کی فیس {months} مہینوں سے زیادہ باقی ہے ({total})۔"), { count: list.length, months: input.moreThanMonths, total: sum })
      : say(ctx, l("No pupil owes fees for more than {months} months.", "لا يوجد طالب عليه رسوم لأكثر من {months} أشهر.", "کسی طالب علم کی فیس {months} مہینوں سے زیادہ باقی نہیں۔"), { months: input.moreThanMonths });
    const names = list.slice(0, 10).map(row => `${row.name} (${row.className}, ${row.monthsOwed})`).join(ctx.locale === "en" ? "; " : "؛ ");
    return {
      kind: "read", capability: "read.fees.defaulters", entities: list.map(row => ({ model: "student", id: row.studentId })),
      counts: { defaulters: list.length, invoices: invoices.filter(invoice => list.some(row => row.studentId === invoice.studentId)).length },
      link: reportLink(ctx, "defaulters"), replayed: false,
      // Pupil names live only here, for the person's own receipt; they are never sent to a model.
      detail: { moreThanMonths: input.moreThanMonths, today, totals: [...totals].map(([currency, minor]) => ({ currency, minor })), pupils: list, text: names ? `${head} ${names}${list.length > 10 ? " …" : ""}` : head },
    };
  },
});

// ─── read.fees.collection_summary ─────────────────────────────────────────

const READ_COLLECTION = defineCapability<Record<string, never>>({
  key: "read.fees.collection_summary", version: 1, cluster: "C6", inventoryKeys: ["read.fees.collection_summary"], risk: "READ", class: "A", roles: FINANCE_ROLES,
  input: z.strictObject({}), evidence: [],
  gates: READ_GATES, scope: { kind: "own-campus" }, idempotency: { mode: "convergent" },
  copy: c(
    ["This month's fee collection", "See how much was collected this month, how much falls due this month, and how much is overdue, for each currency.", "How much fee have we collected this month?"],
    ["تحصيل الرسوم هذا الشهر", "اعرف ما تم تحصيله هذا الشهر وما يستحق هذا الشهر وما هو متأخر، لكل عملة.", "كم حصّلنا من الرسوم هذا الشهر؟"],
    ["اس مہینے کی فیس وصولی", "دیکھیں اس مہینے کتنی فیس وصول ہوئی، کتنی اس مہینے واجب ہے اور کتنی تاخیر سے ہے، ہر کرنسی میں۔", "اس مہینے کتنی فیس جمع ہوئی ہے؟"],
  ),
  source: { route: "GET /api/fees/reports/collection", service: "src/app/api/fees/reports/collection/route.ts (same invoice and payment rows, campus-scoped)", reuse: "direct" },
  async execute(ctx): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const today = await campusToday(ctx, campusId);
    const month = today.slice(0, 7);
    const from = dayStart(`${month}-01`);
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const where = { schoolId: ctx.user.schoolId, campusId };
    const [collected, due, overdue] = await Promise.all([
      prisma.payment.groupBy({ by: ["currency"], where: { ...where, paymentDate: { gte: from, lt: next } }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.invoice.groupBy({ by: ["currency"], where: { ...where, status: { not: "CANCELLED" }, dueDate: { gte: from, lt: next } }, _sum: { totalAmount: true, balanceDue: true }, _count: { _all: true } }),
      prisma.invoice.groupBy({ by: ["currency"], where: { ...where, ...OPEN, dueDate: { lt: dayStart(today) } }, _sum: { balanceDue: true }, _count: { _all: true } }),
    ]);
    const currencies = [...new Set([...collected, ...due, ...overdue].map(row => row.currency))].sort();
    const rows = currencies.map(currency => {
      const paid = collected.find(row => row.currency === currency), owing = due.find(row => row.currency === currency), late = overdue.find(row => row.currency === currency);
      return { currency, collected: paid?._sum.amount ?? 0, payments: paid?._count._all ?? 0, dueThisMonth: owing?._sum.totalAmount ?? 0, stillDueThisMonth: owing?._sum.balanceDue ?? 0, overdue: late?._sum.balanceDue ?? 0, overdueInvoices: late?._count._all ?? 0 };
    });
    const money = await moneyFor(ctx, campusId);
    const text = rows.length
      ? rows.map(row => say(ctx, l("{currency}: {collected} collected this month; {due} due this month ({still} still unpaid); {overdue} overdue.", "{currency}: تم تحصيل {collected} هذا الشهر؛ {due} مستحق هذا الشهر ({still} غير مدفوع)؛ {overdue} متأخر.", "{currency}: اس مہینے {collected} وصول؛ اس مہینے {due} واجب ({still} ابھی باقی)؛ {overdue} تاخیر سے۔"),
        { currency: row.currency, collected: money.show(row.collected, row.currency), due: money.show(row.dueThisMonth, row.currency), still: money.show(row.stillDueThisMonth, row.currency), overdue: money.show(row.overdue, row.currency) })).join(" ")
      : say(ctx, l("No invoices or payments this month yet.", "لا فواتير أو مدفوعات هذا الشهر بعد.", "اس مہینے ابھی کوئی انوائس یا ادائیگی نہیں۔"));
    return {
      kind: "read", capability: "read.fees.collection_summary", entities: [{ model: "campus", id: campusId }],
      counts: { payments: rows.reduce((n, row) => n + row.payments, 0), overdueInvoices: rows.reduce((n, row) => n + row.overdueInvoices, 0), currencies: rows.length },
      link: reportLink(ctx, "collection"), replayed: false, detail: { month, today, currencies: rows, text },
    };
  },
});

export const FINANCE_BOOKS_ENTRIES: readonly CapabilityEntry[] = [
  CREATE_ACCOUNT, CREATE_BANK_ACCOUNT, CREATE_PAYMENT_METHOD, SAVE_TAX_DRAFT, ASSIGN_DISCOUNT, SET_EMPLOYEE, READ_DEFAULTERS, READ_COLLECTION,
];
