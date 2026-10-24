import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canLeadAcademics, canManageAcademics, canManageCampusOps } from "@/lib/api/scope";
import { isCampusOperator, isInstitutionAuthority } from "@/lib/auth/institution";
import { daysToTenths, tenthsToDays } from "@/lib/leave";
import { createLeaveType } from "@/lib/leave/create-type-command";
import { createLeaveAllocation, findLeaveAllocation } from "@/lib/leave/create-allocation-command";
import { canManageChatSettings, getChatSettings, type ChatSettings } from "@/lib/chat/policy";
import { updateChatSettings } from "@/lib/chat/settings-command";
import { applyInstitutionPreset } from "@/lib/staff/hierarchy";
import { INSTITUTION_PRESETS, INSTITUTION_TYPES } from "@/lib/staff/hierarchy-presets";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { matchPupil, pupilLabel } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * ADMIN / CAMPUS_ADMIN people, leave policy and settings capabilities. Leave types and allowances, the staff
 * rank ladder preset and the school's messaging rules are class B writes through the same commands the screens'
 * routes call. Sending invitations, changing guardian access, deciding applications and deciding leave are
 * class C: the step opens the existing screen with the record prefilled, and the person acts there.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

const OPERATORS: readonly UserRole[] = ["ADMIN", "CAMPUS_ADMIN"];
const AUTHORITY: readonly UserRole[] = ["SUPER_ADMIN", "ADMIN"];
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}@.]+/gu, " ").trim();

/** The job's campus must be the actor's own (mirrors resolveCampusId for campus-pinned roles). */
function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}

/** "Ali" matches "Ali Raza"; "Ali R" matches by prefix of each word; an exact name wins over prefixes. */
function matchName<T>(rows: readonly T[], said: string, names: (row: T) => Array<string | null | undefined>): T[] {
  const wanted = fold(said);
  if (!wanted) return [];
  const of = (row: T) => names(row).filter((name): name is string => Boolean(name)).map(fold);
  const exact = rows.filter(row => of(row).includes(wanted));
  if (exact.length) return exact;
  const parts = wanted.split(" ");
  return rows.filter(row => of(row).some(name => { const words = name.split(" "); return parts.every((part, index) => words[index]?.startsWith(part) || words.includes(part)); }));
}

const reconciled = (error: unknown) => error instanceof ApiError && error.status === 409;

// ─── leave.create_type ────────────────────────────────────────────────────

const LEAVE_SETUP_GATES = [roles(OPERATORS), predicate("canManageCampusOps", canManageCampusOps, OPERATORS), permission("leave", "add"), ownCampus()];
const LEAVE_TYPES_LINK = "/admin?view=leave&tab=types";
const LEAVE_ALLOCATIONS_LINK = "/admin?view=leave&tab=allocations";

const typeInput = z.strictObject({
  /** The leave type's name as the user said it ("Casual Leave"). */
  name: z.string().trim().min(1).max(80),
  /** Default days per year shown on the type (the route's `defaultDays`; it stores at least 0.1 day). */
  defaultDays: z.number().min(0).max(366).optional(),
});
type TypeInput = z.infer<typeof typeInput>;

/** The campus's type with this name, ignoring case, so "casual leave" never sits beside "Casual Leave". */
const typeNamed = (campusId: string, name: string) =>
  prisma.leaveType.findFirst({ where: { campusId, name: { equals: name.trim(), mode: "insensitive" } }, select: { id: true, name: true, defaultDays: true } });

const LEAVE_CREATE_TYPE = defineCapability<TypeInput>({
  key: "leave.create_type", version: 1, cluster: "C2", inventoryKeys: ["leave.create_type"], risk: "CREATE", roles: OPERATORS, class: "B",
  input: typeInput, evidence: ["/name"],
  gates: LEAVE_SETUP_GATES, scope: { kind: "own-campus" },
  copy: c(
    ["Add a leave type", "Create a staff leave type on this campus, such as Casual, Sick or Annual leave. An existing type with the same name is kept.", "Add Casual Leave with 10 days a year"],
    ["إضافة نوع إجازة", "إنشاء نوع إجازة للموظفين في هذا الحرم مثل العارضة أو المرضية أو السنوية. يُبقى النوع الموجود بالاسم نفسه.", "أضف الإجازة العارضة بعشرة أيام في السنة"],
    ["چھٹی کی قسم شامل کریں", "اس کیمپس پر عملے کی چھٹی کی قسم بنائیں، جیسے اتفاقیہ، بیماری یا سالانہ چھٹی۔ اسی نام کی موجودہ قسم برقرار رہے گی۔", "اتفاقیہ چھٹی شامل کریں، سال میں 10 دن"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/leave/types", service: "src/lib/leave/create-type-command.ts:createLeaveType", reuse: "extracted" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    return { ...input, name: input.name.trim() };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const existing = await typeNamed(campusId, input.name);
    const days = tenthsToDays(daysToTenths(input.defaultDays ?? 0));
    return {
      title: say(ctx, l("Add a leave type", "إضافة نوع إجازة", "چھٹی کی قسم شامل کریں")),
      lines: [
        { label: say(ctx, l("Leave type", "نوع الإجازة", "چھٹی کی قسم")), value: input.name },
        { label: say(ctx, l("Default days a year", "الأيام الافتراضية في السنة", "سال کے طے شدہ دن")), value: String(days) },
        { label: say(ctx, l("What happens", "ماذا سيحدث", "کیا ہوگا")), value: existing
          ? `${say(ctx, l("This campus already has this leave type; it is kept as it is.", "يوجد هذا النوع في الحرم مسبقاً؛ يبقى كما هو.", "اس کیمپس پر یہ قسم پہلے سے موجود ہے؛ اسے ویسے ہی رکھا جائے گا۔"))} (${existing.name})`
          : say(ctx, l("Staff can apply for it once you give them days on the allocations tab.", "يمكن للموظفين طلبها بعد تخصيص الأيام لهم.", "الاٹمنٹ میں دن دینے کے بعد عملہ اس کے لیے درخواست دے سکے گا۔")) },
      ],
      counts: { types: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Add leave type", "إضافة النوع", "قسم شامل کریں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const keep = (row: { id: string; name: string }): Receipt => ({ kind: "write", capability: "leave.create_type", entities: [{ model: "leaveType", id: row.id }], counts: { types: 0 }, link: LEAVE_TYPES_LINK, replayed: false, detail: { reconciled: true, name: row.name } });
    const existing = await typeNamed(campusId, input.name);
    if (existing) return keep(existing);
    try {
      const type = await createLeaveType(ctx.user, { campusId, name: input.name, defaultDays: input.defaultDays ?? 0 });
      return { kind: "write", capability: "leave.create_type", entities: [{ model: "leaveType", id: type.id }], counts: { types: 1 }, link: LEAVE_TYPES_LINK, replayed: false, detail: { name: type.name, defaultDays: type.defaultDays } };
    } catch (error) {
      // A concurrent create of the same name: the campus now has it, which is what was asked for.
      const raced = reconciled(error) ? await typeNamed(campusId, input.name) : null;
      if (raced) return keep(raced);
      throw error;
    }
  },
});

// ─── leave.create_allocation ──────────────────────────────────────────────

/** The roles the allocations tab offers (ALLOCATION_ROLE_LABELS without the legacy ADMIN duplicate). */
const ALLOCATION_ROLES = ["TEACHER", "PRINCIPAL", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN", "CAMPUS_ADMIN"] as const;
type AllocationRole = (typeof ALLOCATION_ROLES)[number];
const ROLE_WORDS: Record<AllocationRole, L10n> = {
  TEACHER: l("Teachers", "المعلمون", "اساتذہ"),
  PRINCIPAL: l("Principals", "المديرون", "پرنسپل"),
  ACCOUNTANT: l("Accountants", "المحاسبون", "اکاؤنٹنٹ"),
  RECEPTIONIST: l("Receptionists", "موظفو الاستقبال", "ریسپشنسٹ"),
  LIBRARIAN: l("Librarians", "أمناء المكتبة", "لائبریرین"),
  CAMPUS_ADMIN: l("Campus admins", "مسؤولو الحرم", "کیمپس ایڈمن"),
};

const allocationInput = z.strictObject({
  /** The user's words for the leave type ("casual"); bound by name in `resolve`, or in `execute` when an earlier step creates it. */
  leaveType: z.string().trim().min(1).max(80),
  /** Days a year for each person in the role. */
  days: z.number().min(0.5).max(366),
  /** Which staff roles get the days. Left out, every staff role gets them ("all staff"). */
  roles: z.array(z.enum(ALLOCATION_ROLES)).min(1).max(ALLOCATION_ROLES.length).optional(),
  /** The allocation year; the allocations tab and the route default to the current calendar year. */
  academicYear: z.number().int().min(2000).max(2100).optional(),
  /** Bound by the server from `leaveType`; never taken from the model. */
  leaveTypeId: z.string().min(1).max(64).optional(),
});
type AllocationInput = z.infer<typeof allocationInput>;

const norm = (text: string) => text.toLocaleLowerCase().replace(/\bleaves?\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function matchLeaveType<T extends { id: string; name: string }>(types: readonly T[], said: string): T[] {
  const wanted = norm(said);
  const exact = types.filter(type => type.name.toLocaleLowerCase() === said.toLocaleLowerCase() || norm(type.name) === wanted);
  if (exact.length || !wanted) return exact;
  return types.filter(type => { const name = norm(type.name); return Boolean(name) && (name.includes(wanted) || wanted.includes(name)); });
}
const allocationRoles = (input: AllocationInput): AllocationRole[] => [...new Set(input.roles ?? ALLOCATION_ROLES)];
const allocationYear = (ctx: CapabilityContext, input: AllocationInput) => input.academicYear ?? ctx.now.getFullYear();

/** The campus's leave type for this step: the bound id (re-checked), else the one type the name matches. */
async function allocationType(campusId: string, input: AllocationInput) {
  if (input.leaveTypeId) {
    const bound = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, campusId }, select: { id: true, name: true } });
    if (!bound) throw new WorkflowError("NOT_FOUND");
    return { type: bound, matches: [bound] };
  }
  const types = await prisma.leaveType.findMany({ where: { campusId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const matches = matchLeaveType(types, input.leaveType);
  return { type: matches.length === 1 ? matches[0] : null, matches };
}

const LEAVE_CREATE_ALLOCATION = defineCapability<AllocationInput>({
  key: "leave.create_allocation", version: 1, cluster: "C2", inventoryKeys: ["leave.create_allocation"], risk: "CREATE", roles: OPERATORS, class: "B",
  input: allocationInput, evidence: ["/leaveType", "/days"], humanFields: ["leaveTypeId"],
  gates: LEAVE_SETUP_GATES, scope: { kind: "own-campus" },
  copy: c(
    ["Give staff leave days", "Set how many days a year of a leave type each staff role gets on this campus, for all staff or chosen roles. Existing allowances are kept.", "Give all teachers 12 days of casual leave this year"],
    ["تخصيص أيام إجازة للموظفين", "تحديد عدد أيام نوع الإجازة سنوياً لكل دور وظيفي في هذا الحرم، لكل الموظفين أو لأدوار محددة. تُبقى المخصصات الموجودة.", "أعطِ كل المعلمين 12 يوماً من الإجازة العارضة هذا العام"],
    ["عملے کو چھٹی کے دن دیں", "اس کیمپس پر ہر عہدے کو کسی چھٹی کی قسم کے سال میں کتنے دن ملیں، سب عملے یا منتخب عہدوں کے لیے طے کریں۔ موجودہ کوٹہ برقرار رہے گا۔", "اس سال تمام اساتذہ کو 12 اتفاقیہ چھٹیاں دے دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/leave/allocations", service: "src/lib/leave/create-allocation-command.ts:createLeaveAllocation", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    const year = allocationYear(ctx, input);
    const { type, matches } = await allocationType(campusId, input);
    if (!type && matches.length > 1) throw new InputRequired([{ pointer: "/leaveType", promptKey: "LEAVE_TYPE_AMBIGUOUS", params: { count: matches.length }, options: matches.slice(0, 8).map(row => ({ value: row.name, label: row.name })) }]);
    // No match yet: an earlier step of this plan may create the type, so it is bound by name when this step runs.
    return { ...input, roles: allocationRoles(input), academicYear: year, ...(type ? { leaveType: type.name, leaveTypeId: type.id } : {}) };
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const year = allocationYear(ctx, input);
    const wanted = allocationRoles(input);
    const { type } = await allocationType(campusId, input).catch(() => ({ type: null }));
    // Only the allowances already on file change what this step does; whether the type exists yet does not
    // (an earlier step may create it), so it is not part of the preview the person confirms.
    const kept = type ? (await Promise.all(wanted.map(async role => ({ role, row: await findLeaveAllocation(campusId, type.id, year, role, null) })))).filter(item => item.row) : [];
    const keptRoles = new Set(kept.map(item => item.role));
    const fresh = wanted.filter(role => !keptRoles.has(role));
    const days = tenthsToDays(daysToTenths(input.days));
    const roleList = (list: readonly AllocationRole[]) => list.map(role => say(ctx, ROLE_WORDS[role])).join(", ");
    return {
      title: say(ctx, l("Give staff leave days", "تخصيص أيام إجازة للموظفين", "عملے کو چھٹی کے دن دیں")),
      lines: [
        { label: say(ctx, l("Leave type", "نوع الإجازة", "چھٹی کی قسم")), value: input.leaveType },
        { label: say(ctx, l("Days a year, each", "الأيام سنوياً لكل شخص", "سال کے دن، فی کس")), value: String(days) },
        { label: say(ctx, l("Year", "السنة", "سال")), value: String(year) },
        { label: say(ctx, l("Given to", "تُعطى لـ", "کن کو")), value: input.roles && input.roles.length < ALLOCATION_ROLES.length ? roleList(wanted) : `${say(ctx, l("All staff", "كل الموظفين", "تمام عملہ"))} (${roleList(wanted)})` },
        ...(kept.length ? [{ label: say(ctx, l("Already set, kept as they are", "محددة مسبقاً وتبقى كما هي", "پہلے سے طے، ویسے ہی رہیں گے")), value: kept.map(item => `${say(ctx, ROLE_WORDS[item.role])} · ${tenthsToDays(item.row!.days)}`).join(", ") }] : []),
      ],
      counts: { allocations: fresh.length, kept: kept.length },
      confirmLabel: `${say(ctx, l("Save allowances", "حفظ المخصصات", "کوٹہ محفوظ کریں"))} · ${fresh.length}`,
      basis: { input, kept: kept.map(item => item.row!.id) },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const year = allocationYear(ctx, input);
    const { type, matches } = await allocationType(campusId, input);
    if (!type) throw new WorkflowError("DOMAIN_REFUSED", { reason: matches.length ? "LEAVE_TYPE_AMBIGUOUS" : "LEAVE_TYPE_NOT_FOUND" });
    const entities: Receipt["entities"] = [];
    let created = 0, kept = 0;
    for (const role of allocationRoles(input)) {
      const existing = await findLeaveAllocation(campusId, type.id, year, role, null);
      if (existing) { entities.push({ model: "leaveAllocation", id: existing.id }); kept += 1; continue; }
      try {
        const row = await createLeaveAllocation(ctx.user, { campusId, leaveTypeId: type.id, role, days: input.days, academicYear: year });
        entities.push({ model: "leaveAllocation", id: row.id }); created += 1;
      } catch (error) {
        const raced = reconciled(error) ? await findLeaveAllocation(campusId, type.id, year, role, null) : null;
        if (!raced) throw error;
        entities.push({ model: "leaveAllocation", id: raced.id }); kept += 1;
      }
    }
    return { kind: "write", capability: "leave.create_allocation", entities, counts: { allocations: created, kept }, link: LEAVE_ALLOCATIONS_LINK, replayed: false, detail: { leaveTypeId: type.id, academicYear: year, ...(created === 0 ? { reconciled: true } : {}) } };
  },
});

// ─── chat.update_school_settings ──────────────────────────────────────────

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const chatInput = z.strictObject({
  studentToStudent: z.boolean().optional(),
  parentToParent: z.boolean().optional(),
  studentToSupport: z.boolean().optional(),
  parentToSupport: z.boolean().optional(),
  attachmentsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  /** 24-hour "HH:mm" in school time. */
  quietHoursStart: TIME.optional(),
  quietHoursEnd: TIME.optional(),
});
type ChatInput = z.infer<typeof chatInput>;
const CHAT_FIELDS: Record<keyof ChatSettings, L10n> = {
  studentToStudent: l("Pupils message each other", "مراسلة الطلاب لبعضهم", "طلبہ کی آپس میں بات چیت"),
  parentToParent: l("Parents message each other", "مراسلة أولياء الأمور لبعضهم", "والدین کی آپس میں بات چیت"),
  studentToSupport: l("Pupils message office staff", "مراسلة الطلاب لموظفي المكتب", "طلبہ کا دفتری عملے سے رابطہ"),
  parentToSupport: l("Parents message office staff", "مراسلة أولياء الأمور لموظفي المكتب", "والدین کا دفتری عملے سے رابطہ"),
  attachmentsEnabled: l("Attachments", "المرفقات", "اٹیچمنٹ"),
  quietHoursEnabled: l("Quiet hours", "ساعات الهدوء", "خاموش اوقات"),
  quietHoursStart: l("Quiet hours start", "بداية ساعات الهدوء", "خاموش اوقات کا آغاز"),
  quietHoursEnd: l("Quiet hours end", "نهاية ساعات الهدوء", "خاموش اوقات کا اختتام"),
};
const chatKeys = (input: ChatInput) => (Object.keys(CHAT_FIELDS) as Array<keyof ChatSettings>).filter(key => input[key] !== undefined);
const chatValue = (ctx: CapabilityContext, value: boolean | string) => typeof value === "string" ? value : say(ctx, value ? l("On", "مفعّل", "آن") : l("Off", "متوقف", "بند"));

const CHAT_SETTINGS = defineCapability<ChatInput>({
  key: "chat.update_school_settings", version: 1, cluster: "C5", inventoryKeys: ["chat.update_school_settings"], risk: "UPDATE", roles: AUTHORITY, class: "B",
  input: chatInput, evidence: [],
  // canManageChatSettings is the route's guard: the institution authority (a standalone school's admin; in a
  // group, only the super admin). A group's campus ADMIN or CAMPUS_ADMIN fails it.
  gates: [roles(AUTHORITY), predicate("canManageChatSettings", canManageChatSettings, AUTHORITY)], scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Change the school's messaging rules", "Choose who may message whom (pupils, parents, office staff), whether attachments are allowed, and the quiet hours for staff notifications.", "Turn off parent-to-parent chat and set quiet hours from 9 pm to 7 am"],
    ["تغيير قواعد المراسلة في المدرسة", "اختيار من يراسل من (الطلاب، أولياء الأمور، موظفو المكتب)، والسماح بالمرفقات، وساعات الهدوء لإشعارات الموظفين.", "أوقف مراسلة أولياء الأمور لبعضهم واجعل ساعات الهدوء من 9 مساءً إلى 7 صباحاً"],
    ["اسکول کے پیغام رسانی کے اصول بدلیں", "طے کریں کون کس کو پیغام بھیج سکتا ہے (طلبہ، والدین، دفتری عملہ)، اٹیچمنٹ کی اجازت، اور عملے کی اطلاعات کے خاموش اوقات۔", "والدین کی آپس کی چیٹ بند کر دیں اور رات 9 سے صبح 7 تک خاموش اوقات رکھیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "PATCH /api/chat/settings", service: "src/lib/chat/settings-command.ts:updateChatSettings", reuse: "extracted" },
  async resolve(_ctx, input) {
    if (!chatKeys(input).length) throw new InputRequired([{ pointer: "/parentToParent", promptKey: "CHAT_SETTINGS_NOTHING_TO_CHANGE" }]);
    return input;
  },
  async preview(ctx, input) {
    const current = await getChatSettings(ctx.user.schoolId);
    const keys = chatKeys(input);
    const changed = keys.filter(key => current[key] !== input[key]);
    return {
      title: say(ctx, l("Change the messaging rules", "تغيير قواعد المراسلة", "پیغام رسانی کے اصول بدلیں")),
      lines: keys.map(key => ({
        label: say(ctx, CHAT_FIELDS[key]),
        value: current[key] === input[key]
          ? `${chatValue(ctx, current[key])} · ${say(ctx, l("no change", "دون تغيير", "کوئی تبدیلی نہیں"))}`
          : `${chatValue(ctx, current[key])} → ${chatValue(ctx, input[key]!)}`,
      })),
      counts: { changes: changed.length },
      confirmLabel: `${say(ctx, l("Save messaging rules", "حفظ قواعد المراسلة", "اصول محفوظ کریں"))} · ${changed.length}`,
      basis: { input, current },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const before = await getChatSettings(ctx.user.schoolId);
    const changes = chatKeys(input).filter(key => before[key] !== input[key]).length;
    const saved = await updateChatSettings(ctx.user, input);
    return { kind: "write", capability: "chat.update_school_settings", entities: [{ model: "chatSetting", id: saved.id }], counts: { changes }, link: "/messages", replayed: false, ...(changes ? {} : { detail: { reconciled: true } }) };
  },
});

// ─── staff.apply_hierarchy_preset ─────────────────────────────────────────

const presetInput = z.strictObject({ type: z.enum(INSTITUTION_TYPES) });
type PresetInput = z.infer<typeof presetInput>;
const PRESET_LABELS: Record<PresetInput["type"], L10n> = {
  SCHOOL: l("School (K-12)", "مدرسة (K-12)", "اسکول (K-12)"),
  COLLEGE: l("College", "كلية", "کالج"),
  UNIVERSITY: l("University", "جامعة", "یونیورسٹی"),
  ACADEMY: l("Academy / Training Institute", "أكاديمية / معهد تدريب", "اکیڈمی / تربیتی ادارہ"),
  CUSTOM: l("Start from scratch", "البدء من الصفر", "شروع سے خود بنائیں"),
};

/** What applyInstitutionPreset will add: names the school (ranks) or campus (units) does not have yet. */
async function presetPlan(ctx: CapabilityContext, campusId: string, type: PresetInput["type"]) {
  const preset = INSTITUTION_PRESETS[type];
  const [ranks, units, headTaken, school] = await Promise.all([
    prisma.staffDesignation.findMany({ select: { name: true } }),
    prisma.department.findMany({ where: { campusId }, select: { name: true } }),
    prisma.staffDesignation.count({ where: { isInstitutionHead: true } }),
    prisma.school.findUnique({ where: { id: ctx.user.schoolId }, select: { institutionType: true } }),
  ]);
  const haveRanks = new Set(ranks.map(row => row.name.toLowerCase())), haveUnits = new Set(units.map(row => row.name.toLowerCase()));
  const newRanks = preset.designations.filter(seed => !haveRanks.has(seed.name.toLowerCase()));
  const newUnits = preset.departments.filter(seed => !haveUnits.has(seed.name.toLowerCase()));
  return {
    newRanks: newRanks.map(seed => seed.name), newUnits: newUnits.map(seed => seed.name),
    keptRanks: preset.designations.length - newRanks.length, keptUnits: preset.departments.length - newUnits.length,
    headDemoted: headTaken > 0 && newRanks.some(seed => seed.isInstitutionHead), institutionType: school?.institutionType ?? null,
  };
}
const list = (names: string[]) => names.length > 6 ? `${names.slice(0, 6).join(", ")} +${names.length - 6}` : names.join(", ");

const HIERARCHY_PRESET = defineCapability<PresetInput>({
  key: "staff.apply_hierarchy_preset", version: 1, cluster: "C2", inventoryKeys: ["staff.apply_hierarchy_preset"], risk: "CREATE", roles: OPERATORS, class: "B",
  input: presetInput, evidence: ["/type"],
  gates: [roles(OPERATORS), predicate("canManageCampusOps", canManageCampusOps, OPERATORS), permission("staff", "add"), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Set up the staff ranks", "Add the rank ladder and departments for your kind of institution (school, college, university or academy). Ranks and departments you already have are kept.", "We are a K-12 school, set up the staff ranks and departments"],
    ["إعداد الرتب الوظيفية", "إضافة سلم الرتب والأقسام لنوع مؤسستك (مدرسة، كلية، جامعة، أكاديمية). تبقى الرتب والأقسام الموجودة.", "نحن مدرسة K-12، جهّز الرتب الوظيفية والأقسام"],
    ["عملے کے عہدے ترتیب دیں", "اپنے ادارے کی قسم (اسکول، کالج، یونیورسٹی یا اکیڈمی) کے لیے عہدوں کی سیڑھی اور شعبے شامل کریں۔ موجودہ عہدے اور شعبے برقرار رہیں گے۔", "ہم K-12 اسکول ہیں، عملے کے عہدے اور شعبے ترتیب دے دیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/staff/designations", service: "src/lib/staff/hierarchy.ts:applyInstitutionPreset", reuse: "direct" },
  async resolve(ctx, input) { ownCampusId(ctx); return input; },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    const plan = await presetPlan(ctx, campusId, input.type);
    const none = say(ctx, l("None", "لا شيء", "کوئی نہیں"));
    return {
      title: say(ctx, l("Set up the staff ranks", "إعداد الرتب الوظيفية", "عملے کے عہدے ترتیب دیں")),
      lines: [
        { label: say(ctx, l("Structure", "الهيكل", "ڈھانچہ")), value: say(ctx, PRESET_LABELS[input.type]) },
        { label: say(ctx, l("Ranks to add", "رتب ستُضاف", "شامل ہونے والے عہدے")), value: plan.newRanks.length ? `${plan.newRanks.length} · ${list(plan.newRanks)}` : none },
        { label: say(ctx, l("Departments to add on this campus", "أقسام ستُضاف في هذا الحرم", "اس کیمپس پر شامل ہونے والے شعبے")), value: plan.newUnits.length ? `${plan.newUnits.length} · ${list(plan.newUnits)}` : none },
        { label: say(ctx, l("Already there, kept", "موجودة وتبقى", "پہلے سے موجود، برقرار")), value: `${plan.keptRanks + plan.keptUnits}` },
        { label: say(ctx, l("Institution type", "نوع المؤسسة", "ادارے کی قسم")), value: `${plan.institutionType ?? "—"} → ${input.type}` },
        ...(plan.headDemoted ? [{ label: say(ctx, l("Institution head", "رأس المؤسسة", "ادارے کا سربراہ")), value: say(ctx, l("You already have an institution head; the preset's head is added as an ordinary leadership rank.", "لديك رأس للمؤسسة؛ تُضاف رتبة الرأس في القالب كرتبة قيادية عادية.", "آپ کا سربراہ پہلے سے موجود ہے؛ سانچے کا سربراہ عام قیادتی عہدے کے طور پر شامل ہوگا۔")) }] : []),
        { label: say(ctx, l("What stays", "ما يبقى", "کیا برقرار رہے گا")), value: say(ctx, l("Nothing you already have is renamed, moved or removed.", "لا يُعاد تسمية أو نقل أو حذف أي شيء موجود.", "موجودہ کسی چیز کا نام، جگہ یا وجود نہیں بدلے گا۔")) },
      ],
      counts: { designations: plan.newRanks.length, departments: plan.newUnits.length },
      confirmLabel: `${say(ctx, l("Add ranks and departments", "إضافة الرتب والأقسام", "عہدے اور شعبے شامل کریں"))} · ${plan.newRanks.length + plan.newUnits.length}`,
      basis: { input, plan },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    const result = await applyInstitutionPreset({ user: ctx.user, campusId, type: input.type });
    return { kind: "write", capability: "staff.apply_hierarchy_preset", entities: [{ model: "school", id: ctx.user.schoolId }], counts: { designations: result.designationsAdded, departments: result.departmentsAdded }, link: "/admin?view=staff-hierarchy&tab=ladder", replayed: false, detail: { type: input.type, ...(result.designationsAdded + result.departmentsAdded === 0 ? { reconciled: true } : {}) } };
  },
});

// ─── staff.invite_send / staff.resend_invitation ──────────────────────────

/**
 * Mirrors assertStaffWriter (src/app/api/staff/route.ts): campus operations AND a membership right — the
 * institution authority, or a campus admin holding the delegated `canManageMemberships` flag.
 */
const INVITE_GATES = [
  roles(OPERATORS),
  predicate("canManageCampusOps", canManageCampusOps, OPERATORS),
  predicate("isInstitutionAuthority", user => isInstitutionAuthority(user) || user.canManageMemberships === true, AUTHORITY),
  ownCampus(),
];
const INVITE_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"] as const;
const inviteInput = z.strictObject({
  /** The invitees as the user named them (an email address, or the name captured on the invitation). Left out: every match of `role`. */
  people: z.array(z.string().trim().min(2).max(254)).min(1).max(50).optional(),
  role: z.enum(INVITE_ROLES).optional(),
});
type InviteInput = z.infer<typeof inviteInput>;
type Invite = { id: string; email: string; role: string; deliveryStatus: string; profile: unknown };
const inviteName = (invite: Invite) => (invite.profile && typeof invite.profile === "object" && typeof (invite.profile as { fullName?: unknown }).fullName === "string" ? (invite.profile as { fullName: string }).fullName : null);

/**
 * The campus's pending invitations this step is about. `unsent` picks the rows created without a delivery
 * (setup's STAFF operation leaves deliveryStatus "unknown"); otherwise rows already delivered or failed.
 */
async function pendingInvites(ctx: CapabilityContext, input: InviteInput, unsent: boolean) {
  const campusId = ownCampusId(ctx);
  const rows: Invite[] = await prisma.staffInvitation.findMany({
    where: { campusId, status: "pending", campus: { schoolId: ctx.user.schoolId }, ...(input.role ? { role: input.role } : {}), deliveryStatus: unsent ? "unknown" : { not: "unknown" } },
    select: { id: true, email: true, role: true, deliveryStatus: true, profile: true }, orderBy: { createdAt: "asc" },
  });
  if (!input.people) return rows;
  const bound = new Map<string, Invite>(), unclear: RequiredField[] = [];
  input.people.forEach((said, index) => {
    const byEmail = rows.filter(row => row.email.toLowerCase() === said.toLowerCase());
    const found = byEmail.length ? byEmail : matchName(rows, said, row => [inviteName(row), row.email.split("@")[0]]);
    if (found.length === 1) bound.set(found[0].id, found[0]);
    else unclear.push(found.length
      ? { pointer: `/people/${index}`, promptKey: "INVITATION_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.email, label: `${inviteName(row) ?? row.email} · ${row.role}` })) }
      : { pointer: `/people/${index}`, promptKey: unsent ? "INVITATION_UNSENT_NOT_FOUND" : "INVITATION_NOT_FOUND" });
  });
  if (unclear.length) throw new InputRequired(unclear);
  return [...bound.values()];
}
/** Teachers' invitations sit on the Teachers screen; everyone else's on Staff & invites. */
const invitesLink = (rows: readonly Invite[]) => rows.every(row => row.role === "TEACHER") ? "/admin?view=teachers" : "/admin?view=leadership";

function inviteHandoff(key: "staff.invite_send" | "staff.resend_invitation", unsent: boolean) {
  return {
    kind: "DOMAIN_SCREEN" as const,
    async prepare(ctx: CapabilityContext, input: InviteInput) {
      const rows = await pendingInvites(ctx, input, unsent);
      if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: unsent ? "NO_UNSENT_INVITATIONS" : "NO_PENDING_INVITATIONS" });
      // The person sends from the screen; nothing is emailed here. Only ids and roles leave the domain.
      return { kind: "DOMAIN_SCREEN" as const, targetRoles: [], link: invitesLink(rows), prefill: { capability: key, inviteIds: rows.map(row => row.id), roles: [...new Set(rows.map(row => row.role))], count: rows.length } };
    },
  };
}

const INVITE_SEND = defineCapability<InviteInput>({
  key: "staff.invite_send", version: 1, cluster: "C2", inventoryKeys: ["staff.invite"], risk: "COMMUNICATION", roles: OPERATORS, class: "C",
  input: inviteInput, evidence: [],
  gates: INVITE_GATES, scope: { kind: "own-campus" },
  copy: c(
    ["Send staff invitations", "Open Staff & invites with the invitations that have not been sent yet, so you can send them yourself.", "Send the invitations to the new teachers"],
    ["إرسال دعوات الموظفين", "فتح شاشة الموظفين والدعوات مع الدعوات التي لم تُرسل بعد لترسلها بنفسك.", "أرسل الدعوات للمعلمين الجدد"],
    ["عملے کو دعوت نامے بھیجیں", "عملہ اور دعوت نامے کی اسکرین ان دعوت ناموں کے ساتھ کھولیں جو ابھی نہیں بھیجے گئے، تاکہ آپ خود بھیج سکیں۔", "نئے اساتذہ کو دعوت نامے بھیج دیں"],
  ),
  source: { route: "POST /api/staff", service: "src/app/actions/invite.ts:resendInvitation (from the Staff & invites screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await pendingInvites(ctx, input, true); return input; },
  handoff: inviteHandoff("staff.invite_send", true),
});

const RESEND_INVITATION = defineCapability<InviteInput>({
  key: "staff.resend_invitation", version: 1, cluster: "C2", inventoryKeys: ["staff.resend_invitation"], risk: "COMMUNICATION", roles: ["ADMIN"], class: "C",
  input: inviteInput, evidence: [],
  gates: INVITE_GATES, scope: { kind: "own-campus" },
  copy: c(
    ["Resend staff invitations", "Open Staff & invites with the pending invitations picked out, so you can resend them yourself. Each resend issues a fresh link.", "Resend the invitation to the principal"],
    ["إعادة إرسال دعوات الموظفين", "فتح شاشة الموظفين والدعوات مع الدعوات المعلّقة المحددة لتعيد إرسالها بنفسك. كل إعادة ترسل رابطاً جديداً.", "أعد إرسال الدعوة إلى المدير"],
    ["عملے کے دعوت نامے دوبارہ بھیجیں", "زیر التوا دعوت ناموں کے ساتھ عملہ اور دعوت نامے کی اسکرین کھولیں تاکہ آپ خود دوبارہ بھیجیں۔ ہر بار نیا لنک جاتا ہے۔", "پرنسپل کو دعوت نامہ دوبارہ بھیج دیں"],
  ),
  source: { route: "PUT /api/staff", service: "src/app/actions/invite.ts:resendInvitation (from the Staff & invites screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await pendingInvites(ctx, input, false); return input; },
  handoff: inviteHandoff("staff.resend_invitation", false),
});

// ─── guardians.change_access ──────────────────────────────────────────────

const guardianInput = z.strictObject({
  /** The child as the user named them (name or roll number), matched among this campus's active pupils. */
  student: z.string().trim().min(1).max(120),
  change: z.enum(["ADD_GUARDIAN", "CHANGE_PERMISSIONS", "SUSPEND", "REVOKE", "RESTORE"]),
  /** The guardian as the user named them (name or email); required for anything but adding one. */
  guardian: z.string().trim().min(2).max(254).optional(),
  /** The user's own words for why, carried to the screen's reason box. */
  reason: z.string().trim().min(5).max(500).optional(),
});
type GuardianInput = z.infer<typeof guardianInput>;

async function guardianTarget(ctx: CapabilityContext, input: GuardianInput) {
  const campusId = ownCampusId(ctx);
  const roster = await prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "active", archivedAt: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { fullName: "asc" } });
  const pupils = matchPupil(roster, input.student);
  if (pupils.length !== 1) throw new InputRequired([pupils.length
    ? { pointer: "/student", promptKey: "PUPIL_AMBIGUOUS", params: { count: pupils.length }, options: pupils.slice(0, 8).map(pupil => ({ value: pupil.rollNo, label: pupilLabel(pupil) })) }
    : { pointer: "/student", promptKey: "PUPIL_NOT_FOUND" }]);
  const student = pupils[0];
  if (input.change === "ADD_GUARDIAN" && !input.guardian) return { student, relationship: null };
  if (!input.guardian) throw new InputRequired([{ pointer: "/guardian", promptKey: "GUARDIAN_NEEDED" }]);
  const links = await prisma.guardianRelationship.findMany({ where: { schoolId: ctx.user.schoolId, campusId, studentId: student.id }, select: { id: true, fullName: true, email: true, status: true } });
  const byEmail = links.filter(link => link.email.toLowerCase() === input.guardian!.toLowerCase());
  const found = byEmail.length ? byEmail : matchName(links, input.guardian, link => [link.fullName]);
  if (found.length > 1) throw new InputRequired([{ pointer: "/guardian", promptKey: "GUARDIAN_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(link => ({ value: link.email, label: `${link.fullName} · ${link.status}` })) }]);
  if (!found.length && input.change !== "ADD_GUARDIAN") throw new InputRequired([{ pointer: "/guardian", promptKey: "GUARDIAN_NOT_FOUND" }]);
  return { student, relationship: found[0] ?? null };
}

const GUARDIAN_ACCESS = defineCapability<GuardianInput>({
  key: "guardians.change_access", version: 1, cluster: "C3", inventoryKeys: ["guardians.change_access"], risk: "ACCESS_GRANT", roles: OPERATORS, class: "C",
  input: guardianInput, evidence: ["/student"],
  gates: [roles(OPERATORS), predicate("canManageCampusOps", canManageCampusOps, OPERATORS), permission("students", "edit"), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Change a guardian's access", "Open Guardians & access on the child, with the guardian and the change picked out. You review and apply it there.", "Suspend Mr Tariq's access to Ayesha's records"],
    ["تغيير صلاحية ولي أمر", "فتح شاشة أولياء الأمور والصلاحيات على الطالب مع ولي الأمر والتغيير المحدد. تراجعه وتطبقه هناك.", "أوقف صلاحية السيد طارق على سجلات عائشة"],
    ["سرپرست کی رسائی بدلیں", "بچے کے لیے سرپرست اور رسائی کی اسکرین کھولیں، سرپرست اور تبدیلی منتخب ہوگی۔ آپ وہیں دیکھ کر لاگو کریں گے۔", "عائشہ کے ریکارڈ تک طارق صاحب کی رسائی معطل کر دیں"],
  ),
  source: { route: "POST /api/students/[id]/guardians", service: "src/components/GuardianAccessManager.tsx (preview → apply on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await guardianTarget(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { student, relationship } = await guardianTarget(ctx, input);
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: `/admin?view=guardians&student=${encodeURIComponent(student.id)}`, prefill: { studentId: student.id, change: input.change, ...(relationship ? { relationshipId: relationship.id, currentStatus: relationship.status } : {}), ...(input.reason ? { reason: input.reason } : {}) } };
    },
  },
});

// ─── admissions.decide_application ────────────────────────────────────────

/** The route's TRANSITIONS for the decisions (src/lib/admissions/service.ts). */
const DECISIONS = {
  OFFER: { action: "offer", from: ["UNDER_REVIEW", "WAITLISTED"] },
  WAITLIST: { action: "waitlist", from: ["UNDER_REVIEW", "OFFERED"] },
  REJECT: { action: "reject", from: ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED"] },
  RECORD_ACCEPTANCE: { action: "record-acceptance", from: ["OFFERED"] },
  RECORD_DECLINE: { action: "record-decline", from: ["OFFERED"] },
} as const;
const DECIDABLE = ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED", "OFFERED"];
const applicationInput = z.strictObject({
  /** The applicant as the user named them (child's name or the application reference). */
  applicant: z.string().trim().min(1).max(120),
  /** The decision the user has in mind; the screen pre-selects it and the person decides. */
  decision: z.enum(["OFFER", "WAITLIST", "REJECT", "RECORD_ACCEPTANCE", "RECORD_DECLINE"]).optional(),
});
type ApplicationInput = z.infer<typeof applicationInput>;

async function pendingApplication(ctx: CapabilityContext, input: ApplicationInput) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.admissionApplication.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: { in: DECIDABLE } }, select: { id: true, reference: true, childName: true, status: true, version: true }, orderBy: { submittedAt: "asc" } });
  const byReference = rows.filter(row => row.reference.toLowerCase() === input.applicant.toLowerCase());
  const found = byReference.length ? byReference : matchName(rows, input.applicant, row => [row.childName]);
  if (found.length !== 1) throw new InputRequired([found.length
    ? { pointer: "/applicant", promptKey: "APPLICATION_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.reference, label: `${row.childName} · ${row.reference} · ${row.status}` })) }
    : { pointer: "/applicant", promptKey: "APPLICATION_NOT_FOUND" }]);
  const application = found[0];
  if (input.decision && !(DECISIONS[input.decision].from as readonly string[]).includes(application.status)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "DECISION_NOT_AVAILABLE", status: application.status });
  return application;
}

const ADMISSIONS_DECIDE = defineCapability<ApplicationInput>({
  key: "admissions.decide_application", version: 1, cluster: "C3", inventoryKeys: ["admissions.decide_application"], risk: "APPROVAL_DECISION", roles: OPERATORS, class: "C",
  input: applicationInput, evidence: ["/applicant"],
  // canDecide (src/lib/admissions/service.ts): admissions.edit AND a campus operator.
  gates: [roles(OPERATORS), predicate("isCampusOperator", isCampusOperator, OPERATORS), permission("admissions", "edit"), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Decide an admission application", "Open the application on the admissions screen, with the decision you have in mind picked out. You offer, waitlist or decline it there.", "Offer a place to Hamza Ali"],
    ["البت في طلب قبول", "فتح الطلب في شاشة القبول مع القرار الذي تريده محدداً. تمنح المقعد أو تضعه في الانتظار أو ترفضه هناك.", "امنح مقعداً لحمزة علي"],
    ["داخلے کی درخواست کا فیصلہ", "داخلہ اسکرین پر درخواست کھولیں، آپ کا ارادہ کردہ فیصلہ منتخب ہوگا۔ سیٹ دینا، انتظار میں رکھنا یا مسترد کرنا آپ وہیں کریں گے۔", "حمزہ علی کو داخلہ دے دیں"],
  ),
  source: { route: "PATCH /api/admissions", service: "src/lib/admissions/service.ts:actOnApplication (from the admissions screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await pendingApplication(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const application = await pendingApplication(ctx, input);
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: "/admin?view=admissions&tab=applications", prefill: { recordId: application.id, version: application.version, reference: application.reference, status: application.status, ...(input.decision ? { action: DECISIONS[input.decision].action } : {}) } };
    },
  },
});

// ─── leave.review ─────────────────────────────────────────────────────────

const reviewInput = z.strictObject({
  /** The staff member as the user named them. */
  staff: z.string().trim().min(1).max(120),
  /** The leave dates the user gave, to pick one request when the person has several. */
  from: DAY.optional(),
  to: DAY.optional(),
  /** What the user has in mind; the screen pre-selects it and the reviewer decides. */
  decision: z.enum(["APPROVE", "DECLINE"]).optional(),
});
type ReviewInput = z.infer<typeof reviewInput>;

async function pendingLeave(ctx: CapabilityContext, input: ReviewInput) {
  const campusId = ownCampusId(ctx);
  const unclear: RequiredField[] = [];
  if (input.from && !isRealDay(input.from)) unclear.push({ pointer: "/from", promptKey: "DATE_INVALID" });
  if (input.to && !isRealDay(input.to)) unclear.push({ pointer: "/to", promptKey: "DATE_INVALID" });
  if (unclear.length) throw new InputRequired(unclear);
  const from = input.from ?? input.to, to = input.to ?? input.from;
  const rows = await prisma.leaveRequest.findMany({
    where: { campusId, status: "PENDING", ...(from && to ? { fromDate: { lte: new Date(`${to}T23:59:59Z`) }, toDate: { gte: new Date(`${from}T00:00:00Z`) } } : {}) },
    select: { id: true, userId: true, fromDate: true, toDate: true, user: { select: { fullName: true, role: true } }, leaveType: { select: { name: true } } }, orderBy: { fromDate: "asc" },
  });
  const found = matchName(rows, input.staff, row => [row.user.fullName]);
  const span = (row: (typeof rows)[number]) => `${row.fromDate.toISOString().slice(0, 10)} → ${row.toDate.toISOString().slice(0, 10)}`;
  if (found.length !== 1) throw new InputRequired([found.length
    ? { pointer: "/staff", promptKey: "LEAVE_REQUEST_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.id, label: `${row.user.fullName} · ${row.leaveType.name} · ${span(row)}` })) }
    : { pointer: "/staff", promptKey: "LEAVE_REQUEST_NOT_FOUND" }]);
  const request = found[0];
  // No one decides their own leave (the route has no such guard yet; this hand-off never routes one back).
  if (request.userId === ctx.user.userId) throw new WorkflowError("DOMAIN_REFUSED", { reason: "OWN_LEAVE" });
  return { request, campusId };
}

const LEAVE_REVIEW = defineCapability<ReviewInput>({
  key: "leave.review", version: 1, cluster: "C2", inventoryKeys: ["leave.review"], risk: "APPROVAL_DECISION", roles: [...OPERATORS, "PRINCIPAL"], class: "C",
  input: reviewInput, evidence: ["/staff"],
  gates: [roles(OPERATORS), predicate("canManageAcademics", canManageAcademics, OPERATORS), permission("leave", "edit"), ownCampus()], scope: { kind: "own-campus" },
  copy: c(
    ["Review a leave request", "Open Leave approvals on the staff member's pending request. You approve or decline it there; teachers' leave goes to the principal when one is in post.", "Approve Sana's leave for Thursday and Friday"],
    ["مراجعة طلب إجازة", "فتح شاشة اعتماد الإجازات على طلب الموظف المعلّق. توافق أو ترفض هناك؛ إجازات المعلمين تذهب للمدير إن وُجد.", "وافق على إجازة سناء يومي الخميس والجمعة"],
    ["چھٹی کی درخواست دیکھیں", "عملے کے رکن کی زیر التوا درخواست پر چھٹی کی منظوری کی اسکرین کھولیں۔ منظوری یا انکار آپ وہیں کریں گے؛ پرنسپل موجود ہوں تو اساتذہ کی چھٹی ان کے پاس جائے گی۔", "ثناء کی جمعرات اور جمعہ کی چھٹی منظور کر دیں"],
  ),
  source: { route: "PATCH /api/leave/review", service: "src/components/shared-admin/index.tsx:LeaveManagementPanel (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { await pendingLeave(ctx, input); return input; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { request, campusId } = await pendingLeave(ctx, input);
      // The route's §7.6 rule: teaching staff's leave is the academic lead's (the principal, or the operator while
      // no principal is in post); everyone else's is the campus operator's.
      const principalDecides = request.user.role === "TEACHER" && !(await canLeadAcademics(ctx.user, campusId));
      return {
        kind: "DOMAIN_SCREEN", targetRoles: principalDecides ? ["PRINCIPAL"] : [],
        link: principalDecides ? "/principal?view=leave&tab=queue" : "/admin?view=leave&tab=queue",
        prefill: { recordId: request.id, staffUserId: request.userId, from: request.fromDate.toISOString().slice(0, 10), to: request.toDate.toISOString().slice(0, 10), ...(input.decision ? { decision: input.decision === "APPROVE" ? "APPROVED" : "REJECTED" } : {}) },
      };
    },
  },
});

export const ADMIN_PEOPLE_ENTRIES: readonly CapabilityEntry[] = [
  LEAVE_CREATE_TYPE, LEAVE_CREATE_ALLOCATION, CHAT_SETTINGS, HIERARCHY_PRESET,
  INVITE_SEND, RESEND_INVITATION, GUARDIAN_ACCESS, ADMISSIONS_DECIDE, LEAVE_REVIEW,
];
