import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { canManageFinance } from "@/lib/api/scope";
import { getLocalePackage } from "@/lib/locale/store";
import { formatMoney, parseMoney } from "@/lib/locale/package";
import { getActiveAcademicYear } from "@/lib/academic/cycle";
import { createFeeGroup } from "@/lib/fees/fee-group-command";
import { createFeeType, feeTypeCode } from "@/lib/fees/fee-type-command";
import { createMasterLine } from "@/lib/fees/master-line-command";
import { assignFeeGroup } from "@/lib/fees/group-assignment-command";
import { createFineRule } from "@/lib/fees/fine-rule-command";
import { createDiscount, discountCode } from "@/lib/fees/discount-command";
import type { PermissionAction } from "@/lib/permissions";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { assignedClass, classLabel } from "../../../resolve/scope";
import { classRoster, matchPupil, pupilLabel, type Pupil } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * Fee set-up for the finance desk (shared with the ACCOUNTANT slice): fee groups, fee types, the amount a
 * fee type costs in a group (master line), which classes a group serves, late fines and discounts. Each
 * write calls the same command its POST route calls. The model names groups and fee types in words, so a
 * step can refer to a group an earlier step of the same plan creates: `resolve` binds a name that already
 * exists, and `execute` looks every name up again when it runs. Amounts are typed in the currency's whole
 * units, as the user says them ("Rs 2,500"), and stored in its minor unit (paisa). Reminders to families
 * are never sent from here: they are a hand-off to the Reports & reminders screen.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const NAME = z.string().trim().min(1).max(120);
/** Whole currency units as the user says them; converted to the stored minor unit on the server. */
const AMOUNT = z.number().int().min(0).max(100_000_000);

/** POST /api/fees/* guards: canManageFinance + assertPermission("fees", action); operators only while the accountant seat is empty. */
const FINANCE_ROLES: readonly UserRole[] = ["ACCOUNTANT", "ADMIN", "CAMPUS_ADMIN"];
const financeGates = (action: PermissionAction) => [
  roles(FINANCE_ROLES), predicate("canManageFinance", canManageFinance, FINANCE_ROLES), permission("fees", action), ownCampus(),
  seatVacantForOperator("accountant", "ACCOUNTANT"),
];

/** The job's campus must be the actor's own (mirrors resolveCampusId for campus roles). */
function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}

/** The fee set-up screen for this actor: the finance desk's own view, or the campus admin's Fees view. */
const setupLink = (ctx: CapabilityContext, tab: "types" | "groups" | "master" | "assign" | "discounts" | "fines") =>
  ctx.user.role === "ACCOUNTANT" ? `/accountant?view=fee-structures&tab=${tab}` : "/admin?view=fees&tab=structures";
const reminderLink = (ctx: CapabilityContext) => ctx.user.role === "ACCOUNTANT" ? "/accountant?view=fee-reports&tab=defaulters" : "/admin?view=fees&tab=reports";

async function money(ctx: CapabilityContext, currency?: string) {
  const policy = await getLocalePackage(ctx.user.schoolId, ctx.campusId);
  const code = currency ?? policy.currency;
  return {
    currency: code,
    toMinor: (amount: number) => parseMoney(String(amount), code).minor,
    show: (minor: number) => formatMoney({ minor, currency: code }, policy),
  };
}

// ─── name binding ─────────────────────────────────────────────────────────

const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/**
 * One row whose name is the one the user said (exact, then case and spacing folded). Several equally good
 * rows become a question; none returns null, so the caller decides whether a later step may still create it.
 */
function byName<T extends { id: string; name: string; code?: string }>(rows: readonly T[], said: string, pointer: string, promptKey: string): T | null {
  const exact = rows.filter(row => row.name === said.trim());
  if (exact.length === 1) return exact[0];
  const wanted = fold(said);
  const folded = rows.filter(row => fold(row.name) === wanted || (row.code !== undefined && fold(row.code) === fold(feeTypeCode(said))));
  if (folded.length === 1) return folded[0];
  if (folded.length > 1) throw new InputRequired([{ pointer, promptKey, params: { count: folded.length }, options: folded.slice(0, 8).map(row => ({ value: row.name, label: row.code ? `${row.name} · ${row.code}` : row.name })) }]);
  return null;
}

const groupsOf = (campusId: string) => prisma.feeGroup.findMany({ where: { campusId }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } });
const typesOf = (campusId: string) => prisma.feeType.findMany({ where: { campusId }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
const findGroup = async (campusId: string, said: string) => byName(await groupsOf(campusId), said, "/group", "FEE_GROUP_AMBIGUOUS");
const findType = async (campusId: string, said: string) => byName(await typesOf(campusId), said, "/feeType", "FEE_TYPE_AMBIGUOUS");

const notYet = (ctx: CapabilityContext) => say(ctx, l("not set up yet: an earlier step of this plan creates it", "غير موجود بعد: تُنشئه خطوة سابقة في هذه الخطة", "ابھی موجود نہیں: اس منصوبے کا پچھلا مرحلہ اسے بنائے گا"));
const alreadyLine = (ctx: CapabilityContext) => ({ label: say(ctx, l("Already set up", "موجود مسبقاً", "پہلے سے موجود")), value: say(ctx, l("This is already on file; nothing new is created.", "هذا مسجل مسبقاً؛ لن يُنشأ شيء جديد.", "یہ پہلے سے درج ہے؛ کچھ نیا نہیں بنے گا۔")) });

function receipt(capability: string, model: string, id: string, created: boolean, link: string, detail: Record<string, unknown> = {}): Receipt {
  // A row already on file with the same name is this step's own earlier write (or an identical one): reconciled.
  return { kind: "write", capability, entities: [{ model, id }], counts: { created: created ? 1 : 0 }, link, replayed: false, detail: created ? detail : { reconciled: true, ...detail } };
}

// ─── fees.create_fee_group ────────────────────────────────────────────────

const groupInput = z.strictObject({ name: NAME, description: z.string().trim().max(500).optional() });
type GroupInput = z.infer<typeof groupInput>;

const CREATE_GROUP = defineCapability<GroupInput>({
  key: "fees.create_fee_group", version: 1, cluster: "C6", inventoryKeys: ["fees.create_fee_group"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: groupInput, evidence: ["/name"],
  gates: financeGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Create a fee group", "Add a fee package (for example \"Grades 1-5\") that fee amounts and classes are attached to.", "Create a fee group called Grades 1-5"],
    ["إنشاء مجموعة رسوم", "إضافة باقة رسوم (مثل \"الصفوف 1-5\") تُربط بها مبالغ الرسوم والفصول.", "أنشئ مجموعة رسوم باسم الصفوف 1-5"],
    ["فیس گروپ بنائیں", "فیس کا ایک پیکج (مثلاً \"جماعت 1 تا 5\") بنائیں جس سے فیس کی رقمیں اور کلاسیں جوڑی جاتی ہیں۔", "جماعت 1 تا 5 کے نام سے فیس گروپ بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/groups", service: "src/lib/fees/fee-group-command.ts:createFeeGroup", reuse: "extracted" },
  async resolve(ctx, input) {
    const existing = byName(await groupsOf(ownCampusId(ctx)), input.name, "/name", "FEE_GROUP_AMBIGUOUS");
    return existing ? { ...input, name: existing.name } : input;
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const existing = byName(await groupsOf(campusId), input.name, "/name", "FEE_GROUP_AMBIGUOUS");
    const { currency } = await money(ctx);
    return {
      title: say(ctx, l("Create a fee group", "إنشاء مجموعة رسوم", "فیس گروپ بنائیں")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        ...(input.description ? [{ label: say(ctx, l("Description", "الوصف", "تفصیل")), value: input.description }] : []),
        { label: say(ctx, l("Currency", "العملة", "کرنسی")), value: existing?.currency ?? currency },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { groups: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Create fee group", "إنشاء المجموعة", "فیس گروپ بنائیں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const existing = byName(await groupsOf(campusId), input.name, "/name", "FEE_GROUP_AMBIGUOUS");
    if (existing) return receipt("fees.create_fee_group", "feeGroup", existing.id, false, setupLink(ctx, "groups"));
    const group = await createFeeGroup(ctx.user, { campusId, name: input.name, description: input.description ?? null });
    return receipt("fees.create_fee_group", "feeGroup", group.id, true, setupLink(ctx, "groups"), { currency: group.currency });
  },
});

// ─── fees.create_fee_type ─────────────────────────────────────────────────

const typeInput = z.strictObject({
  name: NAME,
  /** Defaults to the name in the route's code form ("Admission fee" → "ADMISSION_FEE"). */
  code: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(500).optional(),
});
type TypeInput = z.infer<typeof typeInput>;

async function bindType(ctx: CapabilityContext, input: TypeInput) {
  const campusId = ownCampusId(ctx);
  const types = await typesOf(campusId);
  const sameName = types.filter(type => fold(type.name) === fold(input.name));
  const existing = sameName.length === 1 ? sameName[0] : sameName.find(type => type.name === input.name.trim()) ?? null;
  if (!existing && sameName.length > 1) throw new InputRequired([{ pointer: "/name", promptKey: "FEE_TYPE_AMBIGUOUS", params: { count: sameName.length }, options: sameName.map(type => ({ value: type.name, label: `${type.name} · ${type.code}` })) }]);
  const code = existing?.code ?? feeTypeCode(input.code ?? input.name);
  const taken = !existing ? types.find(type => type.code === code) : undefined;
  return { campusId, existing, code, taken };
}

const CREATE_TYPE = defineCapability<TypeInput>({
  key: "fees.create_fee_type", version: 1, cluster: "C6", inventoryKeys: ["fees.create_fee_type"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: typeInput, evidence: ["/name"],
  gates: financeGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Create a fee type", "Add a fee head such as tuition, admission or transport; its amount is set per fee group.", "Add a fee type called Tuition"],
    ["إنشاء نوع رسوم", "إضافة بند رسوم مثل الرسوم الدراسية أو القبول أو النقل؛ يُحدَّد مبلغه لكل مجموعة.", "أضف نوع رسوم باسم الرسوم الدراسية"],
    ["فیس کی قسم بنائیں", "ٹیوشن، داخلہ یا ٹرانسپورٹ جیسی فیس کی مد بنائیں؛ اس کی رقم ہر فیس گروپ میں الگ طے ہوتی ہے۔", "ٹیوشن فیس کے نام سے فیس کی قسم بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/types", service: "src/lib/fees/fee-type-command.ts:createFeeType", reuse: "extracted" },
  async resolve(ctx, input) {
    const { existing, code, taken } = await bindType(ctx, input);
    if (taken) throw new InputRequired([{ pointer: "/code", promptKey: "FEE_TYPE_CODE_TAKEN", params: { code } }]);
    return existing ? { ...input, name: existing.name, code: existing.code } : { ...input, code };
  },
  async preview(ctx, input) {
    const { existing, code } = await bindType(ctx, input);
    return {
      title: say(ctx, l("Create a fee type", "إنشاء نوع رسوم", "فیس کی قسم بنائیں")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        { label: say(ctx, l("Code", "الرمز", "کوڈ")), value: code },
        ...(input.description ? [{ label: say(ctx, l("Description", "الوصف", "تفصیل")), value: input.description }] : []),
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { types: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Create fee type", "إنشاء نوع الرسوم", "فیس کی قسم بنائیں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing, code, taken } = await bindType(ctx, input);
    if (existing) return receipt("fees.create_fee_type", "feeType", existing.id, false, setupLink(ctx, "types"));
    if (taken) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FEE_TYPE_CODE_TAKEN", code });
    const type = await createFeeType(ctx.user, { campusId, name: input.name, code, description: input.description ?? null });
    return receipt("fees.create_fee_type", "feeType", type.id, true, setupLink(ctx, "types"), { code: type.code });
  },
});

// ─── fees.create_master_line ──────────────────────────────────────────────

const lineInput = z.strictObject({
  /** The fee group's name ("Grades 1-5"); it may be created by an earlier step of the same plan. */
  group: NAME,
  /** The fee type's name or code ("Tuition"); it may be created by an earlier step of the same plan. */
  feeType: NAME,
  amount: AMOUNT,
  dueDate: DAY.optional(),
});
type LineInput = z.infer<typeof lineInput>;

async function bindLine(ctx: CapabilityContext, input: LineInput) {
  const campusId = ownCampusId(ctx);
  const [group, type] = await Promise.all([findGroup(campusId, input.group), findType(campusId, input.feeType)]);
  const existing = group && type ? await prisma.feesMasterLine.findUnique({ where: { feeGroupId_feeTypeId: { feeGroupId: group.id, feeTypeId: type.id } }, select: { id: true, amount: true } }) : null;
  const units = await money(ctx, group?.currency);
  return { campusId, group, type, existing, units, minor: units.toMinor(input.amount) };
}

const CREATE_LINE = defineCapability<LineInput>({
  key: "fees.create_master_line", version: 1, cluster: "C6", inventoryKeys: ["fees.create_master_line"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: lineInput, evidence: ["/amount"],
  gates: financeGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Set a fee amount for a group", "Set how much one fee type costs in a fee group, for example tuition in Grades 1-5.", "Tuition for Grades 1-5 is Rs 4,500"],
    ["تحديد مبلغ رسوم لمجموعة", "تحديد قيمة نوع رسوم واحد داخل مجموعة، مثل الرسوم الدراسية للصفوف 1-5.", "الرسوم الدراسية للصفوف 1-5 هي 450 ريالاً"],
    ["گروپ کی فیس کی رقم طے کریں", "کسی فیس گروپ میں ایک فیس کی قسم کی رقم طے کریں، مثلاً جماعت 1 تا 5 کی ٹیوشن۔", "جماعت 1 تا 5 کی ٹیوشن فیس 4500 روپے رکھ دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/master-lines", service: "src/lib/fees/master-line-command.ts:createMasterLine", reuse: "extracted" },
  async resolve(ctx, input) {
    if (input.dueDate && !isRealDay(input.dueDate)) throw new InputRequired([{ pointer: "/dueDate", promptKey: "DATE_INVALID" }]);
    const { group, type, existing, minor, units } = await bindLine(ctx, input);
    if (existing && existing.amount !== minor) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FEE_LINE_EXISTS", amount: units.show(existing.amount) });
    // A name not on file yet stays as written: an earlier step may create it, and execute binds it then.
    return { ...input, group: group?.name ?? input.group, feeType: type?.name ?? input.feeType };
  },
  async preview(ctx, input) {
    const { group, type, existing, minor, units } = await bindLine(ctx, input);
    return {
      title: say(ctx, l("Set a fee amount", "تحديد مبلغ الرسوم", "فیس کی رقم طے کریں")),
      lines: [
        { label: say(ctx, l("Fee group", "مجموعة الرسوم", "فیس گروپ")), value: group ? group.name : `${input.group} (${notYet(ctx)})` },
        { label: say(ctx, l("Fee type", "نوع الرسوم", "فیس کی قسم")), value: type ? type.name : `${input.feeType} (${notYet(ctx)})` },
        { label: say(ctx, l("Amount", "المبلغ", "رقم")), value: units.show(minor) },
        ...(input.dueDate ? [{ label: say(ctx, l("Due date", "تاريخ الاستحقاق", "آخری تاریخ")), value: input.dueDate }] : []),
        { label: say(ctx, l("Invoices", "الفواتير", "انوائس")), value: say(ctx, l("Invoices already issued keep their amounts; new invoices use this one.", "الفواتير الصادرة تبقى كما هي؛ الفواتير الجديدة تستخدم هذا المبلغ.", "پہلے سے جاری انوائس ویسے ہی رہیں گی؛ نئی انوائس میں یہ رقم لگے گی۔")) },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { lines: existing ? 0 : 1, amountMinor: minor },
      confirmLabel: `${say(ctx, l("Set amount", "تحديد المبلغ", "رقم طے کریں"))} · ${units.show(minor)}`,
      basis: { input, group: group?.id ?? null, type: type?.id ?? null, existing: existing?.id ?? null, currency: units.currency },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    // Bound again by name now: a group or type an earlier step created exists by the time this runs.
    const { campusId, group, type, existing, minor, units } = await bindLine(ctx, input);
    if (!group) throw new WorkflowError("NOT_FOUND", { missing: "group" });
    if (!type) throw new WorkflowError("NOT_FOUND", { missing: "feeType" });
    if (existing) {
      if (existing.amount !== minor) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FEE_LINE_EXISTS", amount: units.show(existing.amount) });
      return receipt("fees.create_master_line", "feesMasterLine", existing.id, false, setupLink(ctx, "master"));
    }
    const line = await createMasterLine(ctx.user, { campusId, feeGroupId: group.id, feeTypeId: type.id, amount: minor, currency: group.currency, dueDate: input.dueDate ?? null });
    return { ...receipt("fees.create_master_line", "feesMasterLine", line.id, true, setupLink(ctx, "master"), { feeGroupId: group.id, feeTypeId: type.id }), counts: { created: 1, amountMinor: line.amount } };
  },
});

// ─── fees.assign_fee_group ────────────────────────────────────────────────

const assignInput = z.strictObject({
  /** The fee group's name; it may be created by an earlier step of the same plan. */
  group: NAME,
  /** Class sections the user named, as class handles. */
  classIds: z.array(z.string().min(1)).max(80).optional(),
  /** Whole grades the user named ("5", "Grade 6"): every section of that class on the campus. */
  grades: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  /** Defaults to the campus's active academic year. */
  academicYear: z.number().int().min(2000).max(2100).optional(),
});
type AssignInput = z.infer<typeof assignInput>;

const gradeWord = (value: string) => fold(value).replace(/^(grade|class|year|std|standard|الصف|صف|جماعت|کلاس)\s*/u, "").trim();

const ASSIGN_GROUP = defineCapability<AssignInput>({
  key: "fees.assign_fee_group", version: 1, cluster: "C6", inventoryKeys: ["fees.assign_fee_group"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: assignInput, evidence: [],
  gates: financeGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Assign a fee group to classes", "Choose which classes or grades a fee group charges for the academic year.", "Use the Grades 1-5 fee group for grades 1 to 5"],
    ["ربط مجموعة رسوم بالفصول", "اختيار الفصول أو الصفوف التي تُطبَّق عليها مجموعة الرسوم في العام الدراسي.", "طبّق مجموعة رسوم الصفوف 1-5 على الصفوف من 1 إلى 5"],
    ["فیس گروپ کلاسوں کو دیں", "طے کریں کہ تعلیمی سال میں کون سی کلاسوں یا جماعتوں پر یہ فیس گروپ لگے گا۔", "جماعت 1 تا 5 والا فیس گروپ جماعت 1 سے 5 تک لگا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/assignments", service: "src/lib/fees/group-assignment-command.ts:assignFeeGroup", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    if (!input.classIds?.length && !input.grades?.length) throw new InputRequired([{ pointer: "/classIds", promptKey: "FEE_ASSIGN_CLASSES_NEEDED" }]);
    for (const classId of input.classIds ?? []) await assignedClass(ctx, classId);
    const ids = new Set(input.classIds ?? []);
    if (input.grades?.length) {
      const classes = await prisma.class.findMany({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      const unclear: RequiredField[] = [];
      input.grades.forEach((grade, index) => {
        const found = classes.filter(row => fold(row.name) === fold(grade) || gradeWord(row.name) === gradeWord(grade));
        if (!found.length) unclear.push({ pointer: `/grades/${index}`, promptKey: "FEE_GRADE_NOT_FOUND", options: [...new Set(classes.map(row => row.name))].slice(0, 8).map(name => ({ value: name, label: name })) });
        for (const row of found) ids.add(row.id);
      });
      if (unclear.length) throw new InputRequired(unclear);
    }
    const group = await findGroup(campusId, input.group);
    return { ...input, group: group?.name ?? input.group, classIds: [...ids].sort(), academicYear: input.academicYear ?? await getActiveAcademicYear(campusId) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const academicYear = input.academicYear ?? await getActiveAcademicYear(campusId);
    const classes = await Promise.all((input.classIds ?? []).map(classId => assignedClass(ctx, classId)));
    const group = await findGroup(campusId, input.group);
    const already = group ? await prisma.feeGroupAssignment.count({ where: { feeGroupId: group.id, academicYear, classId: { in: classes.map(row => row.id) } } }) : 0;
    return {
      title: say(ctx, l("Assign a fee group", "ربط مجموعة رسوم", "فیس گروپ لگائیں")),
      lines: [
        { label: say(ctx, l("Fee group", "مجموعة الرسوم", "فیس گروپ")), value: group ? group.name : `${input.group} (${notYet(ctx)})` },
        { label: say(ctx, l("Classes", "الفصول", "کلاسیں")), value: classes.map(classLabel).join(", ") },
        { label: say(ctx, l("Academic year", "العام الدراسي", "تعلیمی سال")), value: String(academicYear) },
        ...(already ? [{ label: say(ctx, l("Already assigned", "مربوطة مسبقاً", "پہلے سے لگا ہوا")), value: String(already) }] : []),
      ],
      counts: { classes: classes.length - already, alreadyAssigned: already },
      confirmLabel: `${say(ctx, l("Assign to classes", "ربط بالفصول", "کلاسوں کو لگائیں"))} · ${classes.length - already}`,
      basis: { input, group: group?.id ?? null, already },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const academicYear = input.academicYear ?? await getActiveAcademicYear(campusId);
    const group = await findGroup(campusId, input.group);
    if (!group) throw new WorkflowError("NOT_FOUND", { missing: "group" });
    const entities: Receipt["entities"] = [];
    let assigned = 0, alreadyAssigned = 0;
    for (const classId of input.classIds ?? []) {
      await assignedClass(ctx, classId);
      const existing = await prisma.feeGroupAssignment.findUnique({ where: { feeGroupId_classId_academicYear: { feeGroupId: group.id, classId, academicYear } }, select: { id: true } });
      if (existing) { alreadyAssigned++; entities.push({ model: "feeGroupAssignment", id: existing.id }); continue; }
      const created = await assignFeeGroup(ctx.user, { campusId, feeGroupId: group.id, classId, academicYear });
      assigned++; entities.push({ model: "feeGroupAssignment", id: created.id });
    }
    return { kind: "write", capability: "fees.assign_fee_group", entities, counts: { assigned, alreadyAssigned }, link: setupLink(ctx, "assign"), replayed: false, detail: { feeGroupId: group.id, academicYear, ...(assigned ? {} : { reconciled: true }) } };
  },
});

// ─── fees.create_fine_rule ────────────────────────────────────────────────

const fineInput = z.strictObject({
  /** The rule's name ("Late fine"). */
  name: NAME,
  /** PERCENT of the balance, a FLAT amount, or an amount PER_DAY late. */
  type: z.enum(["PERCENT", "FLAT", "PER_DAY"]),
  /** A percent (0-100) for PERCENT; whole currency units otherwise. */
  amount: AMOUNT,
  /** Days after the due date before the fine starts; the route's default is 0. */
  graceDays: z.number().int().min(0).max(365).optional(),
});
type FineInput = z.infer<typeof fineInput>;

async function bindFine(ctx: CapabilityContext, input: FineInput) {
  const campusId = ownCampusId(ctx);
  const units = await money(ctx);
  const value = input.type === "PERCENT" ? input.amount : units.toMinor(input.amount);
  const rules = await prisma.feeFineRule.findMany({ where: { campusId }, select: { id: true, name: true, type: true, value: true, graceDays: true } });
  const existing = byName(rules, input.name, "/name", "FEE_FINE_RULE_AMBIGUOUS");
  const same = existing ? existing.type === input.type && existing.value === value && existing.graceDays === (input.graceDays ?? 0) : false;
  return { campusId, units, value, existing, same };
}
const fineValue = (ctx: CapabilityContext, type: string, value: number, show: (minor: number) => string) =>
  type === "PERCENT" ? `${value}%` : type === "PER_DAY" ? `${show(value)} ${say(ctx, l("per day", "لكل يوم", "فی دن"))}` : show(value);

const CREATE_FINE = defineCapability<FineInput>({
  key: "fees.create_fine_rule", version: 1, cluster: "C6", inventoryKeys: ["fees.create_fine_rule"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: fineInput, evidence: ["/name", "/amount"],
  gates: financeGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Set a late fee fine", "Add the fine charged when fees are paid late: a percent, a fixed amount, or an amount per day after a grace period.", "Charge a late fine of Rs 50 per day after 10 days"],
    ["تحديد غرامة التأخير", "إضافة غرامة السداد المتأخر: نسبة أو مبلغ ثابت أو مبلغ لكل يوم بعد مهلة.", "غرامة تأخير 5 ريالات لكل يوم بعد 10 أيام"],
    ["لیٹ فیس جرمانہ طے کریں", "دیر سے فیس جمع ہونے پر جرمانہ لگائیں: فیصد، مقررہ رقم، یا مہلت کے بعد ہر دن کی رقم۔", "10 دن کے بعد روزانہ 50 روپے لیٹ فیس جرمانہ لگا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/fine-rules", service: "src/lib/fees/fine-rule-command.ts:createFineRule", reuse: "extracted" },
  async resolve(ctx, input) {
    if (input.type === "PERCENT" && input.amount > 100) throw new InputRequired([{ pointer: "/amount", promptKey: "FEE_PERCENT_OVER_100" }]);
    const { existing, same } = await bindFine(ctx, input);
    if (existing && !same) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FINE_RULE_EXISTS", name: existing.name });
    return existing ? { ...input, name: existing.name } : input;
  },
  async preview(ctx, input) {
    const { existing, value, units } = await bindFine(ctx, input);
    return {
      title: say(ctx, l("Set a late fee fine", "تحديد غرامة التأخير", "لیٹ فیس جرمانہ")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        { label: say(ctx, l("Fine", "الغرامة", "جرمانہ")), value: fineValue(ctx, input.type, value, units.show) },
        { label: say(ctx, l("Grace period", "المهلة", "مہلت")), value: `${input.graceDays ?? 0} ${say(ctx, l("days", "أيام", "دن"))}` },
        { label: say(ctx, l("Invoices", "الفواتير", "انوائس")), value: say(ctx, l("Applies to late invoices from now on; nothing is charged today.", "تُطبَّق على الفواتير المتأخرة من الآن؛ لا يُحتسب شيء اليوم.", "اب سے دیر والی انوائس پر لگے گا؛ آج کچھ وصول نہیں ہوگا۔")) },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { rules: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Save fine rule", "حفظ الغرامة", "جرمانہ محفوظ کریں"))} · ${fineValue(ctx, input.type, value, units.show)}`,
      basis: { input, existing: existing?.id ?? null, value },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing, same, value } = await bindFine(ctx, input);
    if (existing) {
      if (!same) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FINE_RULE_EXISTS", name: existing.name });
      return receipt("fees.create_fine_rule", "feeFineRule", existing.id, false, setupLink(ctx, "fines"));
    }
    const rule = await createFineRule(ctx.user, { campusId, name: input.name, type: input.type, value, graceDays: input.graceDays ?? 0 });
    return receipt("fees.create_fine_rule", "feeFineRule", rule.id, true, setupLink(ctx, "fines"), { type: rule.type, value: rule.value });
  },
});

// ─── fees.create_discount ─────────────────────────────────────────────────

const discountInput = z.strictObject({
  /** The discount's name ("Sibling discount"). */
  name: NAME,
  type: z.enum(["PERCENT", "FLAT"]),
  /** A percent (0-100) for PERCENT; whole currency units for FLAT. */
  amount: AMOUNT,
  /** Defaults to the name in the route's code form ("Sibling discount" → "SIBLING_DISCOUNT"). */
  code: z.string().trim().min(1).max(40).optional(),
  /** A student category the user named; the discount then applies to every pupil in it. */
  category: z.string().trim().min(1).max(80).optional(),
  /** Bound by the server from `category`; never taken from the model. */
  categoryId: z.string().min(1).max(64).optional(),
});
type DiscountInput = z.infer<typeof discountInput>;

async function bindDiscount(ctx: CapabilityContext, input: DiscountInput) {
  const campusId = ownCampusId(ctx);
  const units = await money(ctx);
  const value = input.type === "PERCENT" ? input.amount : units.toMinor(input.amount);
  const discounts = await prisma.feeDiscount.findMany({ where: { campusId }, select: { id: true, name: true, code: true, type: true, value: true, categoryId: true } });
  const sameName = discounts.filter(row => fold(row.name) === fold(input.name));
  const existing = sameName.length === 1 ? sameName[0] : sameName.find(row => row.name === input.name.trim()) ?? null;
  if (!existing && sameName.length > 1) throw new InputRequired([{ pointer: "/name", promptKey: "FEE_DISCOUNT_AMBIGUOUS", params: { count: sameName.length }, options: sameName.map(row => ({ value: row.code, label: `${row.name} · ${row.code}` })) }]);
  const code = existing?.code ?? discountCode(input.code ?? input.name);
  const taken = !existing ? discounts.find(row => row.code === code) : undefined;
  const same = existing ? existing.type === input.type && existing.value === value && existing.categoryId === (input.categoryId ?? null) : false;
  return { campusId, units, value, existing, code, taken, same };
}
const discountValue = (type: string, value: number, show: (minor: number) => string) => type === "PERCENT" ? `${value}%` : show(value);

const CREATE_DISCOUNT = defineCapability<DiscountInput>({
  key: "fees.create_discount", version: 1, cluster: "C6", inventoryKeys: ["fees.create_discount"], risk: "CREATE", roles: FINANCE_ROLES, class: "B",
  input: discountInput, evidence: ["/name", "/amount"], humanFields: ["categoryId"],
  gates: financeGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Create a fee discount", "Add a named discount (percent or fixed amount), such as a sibling or staff-child discount. Giving it to pupils is a separate step.", "Create a 10% sibling discount"],
    ["إنشاء خصم رسوم", "إضافة خصم باسم (نسبة أو مبلغ ثابت) مثل خصم الإخوة أو أبناء الموظفين. منحه للطلاب خطوة منفصلة.", "أنشئ خصم إخوة بنسبة 10٪"],
    ["فیس رعایت بنائیں", "نام کے ساتھ رعایت (فیصد یا مقررہ رقم) بنائیں، جیسے بہن بھائی یا اسٹاف کے بچوں کی رعایت۔ طلبہ کو دینا الگ مرحلہ ہے۔", "بہن بھائیوں کے لیے 10 فیصد رعایت بنا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/fees/discounts", service: "src/lib/fees/discount-command.ts:createDiscount", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    if (input.type === "PERCENT" && input.amount > 100) throw new InputRequired([{ pointer: "/amount", promptKey: "FEE_PERCENT_OVER_100" }]);
    let bound: DiscountInput = { ...input, categoryId: undefined };
    if (input.category) {
      const categories = await prisma.studentCategory.findMany({ where: { campusId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      const category = byName(categories, input.category, "/category", "STUDENT_CATEGORY_AMBIGUOUS");
      if (!category) throw new InputRequired([{ pointer: "/category", promptKey: "STUDENT_CATEGORY_NOT_FOUND", params: { count: categories.length }, options: categories.slice(0, 8).map(row => ({ value: row.name, label: row.name })) }]);
      bound = { ...bound, category: category.name, categoryId: category.id };
    }
    const { existing, code, taken, same } = await bindDiscount(ctx, bound);
    if (taken) throw new InputRequired([{ pointer: "/code", promptKey: "FEE_DISCOUNT_CODE_TAKEN", params: { code } }]);
    if (existing && !same) throw new WorkflowError("DOMAIN_REFUSED", { reason: "DISCOUNT_EXISTS", name: existing.name });
    return { ...bound, name: existing?.name ?? bound.name, code };
  },
  async preview(ctx, input) {
    const { existing, code, value, units } = await bindDiscount(ctx, input);
    return {
      title: say(ctx, l("Create a fee discount", "إنشاء خصم رسوم", "فیس رعایت بنائیں")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        { label: say(ctx, l("Code", "الرمز", "کوڈ")), value: code },
        { label: say(ctx, l("Discount", "الخصم", "رعایت")), value: discountValue(input.type, value, units.show) },
        { label: say(ctx, l("Applies to", "يُطبَّق على", "کن پر لاگو")), value: input.category
          ? `${say(ctx, l("Every pupil in the category", "كل طلاب الفئة", "اس زمرے کے سب طلبہ"))}: ${input.category}`
          : say(ctx, l("No pupil yet; give it to pupils on the Discounts screen.", "لا أحد بعد؛ امنحه للطلاب من شاشة الخصومات.", "ابھی کسی کو نہیں؛ رعایت کی اسکرین پر طلبہ کو دیں۔")) },
        ...(existing ? [alreadyLine(ctx)] : []),
      ],
      counts: { discounts: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Create discount", "إنشاء الخصم", "رعایت بنائیں"))} · ${discountValue(input.type, value, units.show)}`,
      basis: { input, existing: existing?.id ?? null, value },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const { campusId, existing, code, taken, same, value, units } = await bindDiscount(ctx, input);
    if (existing) {
      if (!same) throw new WorkflowError("DOMAIN_REFUSED", { reason: "DISCOUNT_EXISTS", name: existing.name });
      return receipt("fees.create_discount", "feeDiscount", existing.id, false, setupLink(ctx, "discounts"));
    }
    if (taken) throw new WorkflowError("DOMAIN_REFUSED", { reason: "FEE_DISCOUNT_CODE_TAKEN", code });
    const discount = await createDiscount(ctx.user, { campusId, name: input.name, code, type: input.type, value, categoryId: input.categoryId ?? null, currency: units.currency });
    return receipt("fees.create_discount", "feeDiscount", discount.id, true, setupLink(ctx, "discounts"), { code: discount.code, type: discount.type, value: discount.value });
  },
});

// ─── fees.send_due_reminder ───────────────────────────────────────────────

/**
 * Reminders reach families on WhatsApp, so they are sent only from Reports & reminders, by the person, one
 * family or the whole defaulter list at a time. This hand-off opens that screen with the pupil (or class)
 * already chosen and the outstanding invoice it would remind about. Nothing is sent from here.
 */
const remindInput = z.strictObject({
  /** The pupil the user named ("Ali Raza", "roll 12"); left out for every family with dues. */
  student: z.string().trim().min(1).max(120).optional(),
  /** Narrows the pupil search, or the defaulter list, to one class. */
  classId: z.string().min(1).optional(),
});
type RemindInput = z.infer<typeof remindInput>;

async function remindRoster(ctx: CapabilityContext, input: RemindInput): Promise<Pupil[]> {
  const campusId = ownCampusId(ctx);
  if (input.classId) return classRoster(ctx, (await assignedClass(ctx, input.classId)).id);
  return prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "active", archivedAt: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { fullName: "asc" } });
}

async function remindPupil(ctx: CapabilityContext, input: RemindInput) {
  if (!input.student) return null;
  const found = matchPupil(await remindRoster(ctx, input), input.student);
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer: "/student", promptKey: "PUPIL_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(pupil => ({ value: pupil.rollNo, label: pupilLabel(pupil) })) }
    : { pointer: "/student", promptKey: "PUPIL_NOT_FOUND" }]);
}

const DUE = { status: { in: ["PENDING", "OVERDUE"] as Array<"PENDING" | "OVERDUE"> }, balanceDue: { gt: 0 } };

const SEND_REMINDER = defineCapability<RemindInput>({
  key: "fees.send_due_reminder", version: 1, cluster: "C6", inventoryKeys: ["fees.send_due_reminder"], risk: "COMMUNICATION", roles: FINANCE_ROLES, class: "C",
  input: remindInput, evidence: [],
  gates: [roles(FINANCE_ROLES), permission("fees", "edit"), ownCampus(), seatVacantForOperator("accountant", "ACCOUNTANT")], scope: { kind: "own-campus" },
  copy: c(
    ["Remind families about fee dues", "Open Reports & reminders with the family already chosen; you send the WhatsApp reminder there.", "Remind Ali Raza's parents about his unpaid fee"],
    ["تذكير الأسر بالرسوم المستحقة", "فتح شاشة التقارير والتذكيرات والأسرة محددة؛ ترسل تذكير واتساب من هناك.", "ذكّر والدي علي رضا بالرسوم غير المدفوعة"],
    ["والدین کو واجب الادا فیس کی یاد دہانی", "رپورٹس اور یاد دہانی کی اسکرین خاندان منتخب کر کے کھولیں؛ واٹس ایپ یاد دہانی آپ وہیں سے بھیجیں گے۔", "علی رضا کے والدین کو بقایا فیس کی یاد دہانی کروا دیں"],
  ),
  source: { route: "POST /api/fees/remind", service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (DOMAIN_SCREEN)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    if (input.classId) await assignedClass(ctx, input.classId);
    const pupil = await remindPupil(ctx, input);
    return pupil ? { ...input, student: pupil.fullName } : input;
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const campusId = ownCampusId(ctx);
      const pupil = await remindPupil(ctx, input);
      if (pupil) {
        const invoice = await prisma.invoice.findFirst({ where: { schoolId: ctx.user.schoolId, campusId, studentId: pupil.id, ...DUE }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], select: { id: true, balanceDue: true, dueDate: true, status: true, currency: true } });
        if (!invoice) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OUTSTANDING_DUES" });
        return { kind: "DOMAIN_SCREEN", targetRoles: [], link: reminderLink(ctx), prefill: { studentId: pupil.id, invoiceId: invoice.id, balanceDueMinor: invoice.balanceDue, currency: invoice.currency, dueDate: invoice.dueDate.toISOString().slice(0, 10), status: invoice.status }, detail: { sent: false } };
      }
      const classId = input.classId ? (await assignedClass(ctx, input.classId)).id : null;
      const defaulters = await prisma.student.count({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null, ...(classId ? { classId } : {}), invoices: { some: DUE } } });
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: reminderLink(ctx), prefill: { scope: "DEFAULTERS", ...(classId ? { classId } : {}), defaulters }, detail: { sent: false } };
    },
  },
});

export const ADMIN_FEE_ENTRIES: readonly CapabilityEntry[] = [CREATE_GROUP, CREATE_TYPE, CREATE_LINE, ASSIGN_GROUP, CREATE_FINE, CREATE_DISCOUNT, SEND_REMINDER];
