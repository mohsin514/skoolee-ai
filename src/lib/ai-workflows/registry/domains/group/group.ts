import { createHash } from "node:crypto";
import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { ApiError, soleChecker } from "@/lib/api/scope";
import { canOwnSubscription, isGroupConsole, isInstitutionAuthority } from "@/lib/auth/institution";
import { assertPlanCapacity, BillingAccessError, getBillingSnapshot } from "@/lib/billing/entitlements";
import { previewPlanChange } from "@/lib/billing/lifecycle";
import { getPlanLimits } from "@/config/plans";
import { defaultBoardFor } from "@/config/boards";
import { schoolCountry } from "@/lib/school/country";
import { createCampusRecord, recordRevision, seedCampusCalendar, updateCampusDetailsCommand, validateCampusInput } from "@/lib/school/campus-commands";
import { createTemplate, KEYS as POLICY_KEYS, preview as previewPolicy, saveDraft, submitForReview, type Domain as PolicyDomain } from "@/lib/group-policy/service";
import { addDomain } from "@/lib/identity/service";
import { readinessView } from "@/lib/readiness/service";
import { createStaffInvitation } from "@/lib/staff/invitation-write";
import { defineCapability } from "../../define";
import { predicate, roles } from "../../gates";
import { InputRequired, WorkflowError } from "../../../errors";
import type { CapabilityContext, CapabilityEntry, EntryCopy, Gate, L10n, Receipt } from "../../types";

/**
 * The group owner's capabilities (design-slices §10, Appendix D SUPER_ADMIN): the SUPER_ADMIN of a school group
 * (isGroupConsole), whose jobs may have no campus or name one campus of its school.
 * - Campuses are created inside plan capacity (the same command as Settings → Add campus, so each one gets its
 *   academic year and weekend) and corrected through the Settings → Campus command.
 * - Group standards are drafted and submitted to a named reviewer: the receipt says "submitted, not live".
 * - Leader invitations are prepared as unsent rows; the owner sends them from People & access with two-step sign-in.
 * - Reviews, override decisions, access changes, deactivation, plan changes and support-access decisions are class C:
 *   the step opens the screen where the owner decides. Nothing is written by them.
 * RT13: a step that names a campus binds exactly one campus of this school; a phrase naming two campuses (or "all
 * campuses") is refused, and a job pinned to a campus may not act on another.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

const GROUP: readonly UserRole[] = ["SUPER_ADMIN"];
const ID = z.string().min(1).max(128);
const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Every group entry: the SUPER_ADMIN role and the group console predicate (a single school's ADMIN is refused). */
const groupGates = (...more: Gate[]): Gate[] => [roles(GROUP), predicate("isGroupConsole", isGroupConsole, GROUP), ...more];
const SUBSCRIPTION_GATE = predicate("canOwnSubscription", canOwnSubscription, GROUP);

/** Re-checked at resolve, preview, execute and prepare: gates see only the context, this sees the live user too. */
function groupOwner(ctx: CapabilityContext) {
  if (!isGroupConsole(ctx.user)) throw new WorkflowError("ROLE_NOT_ALLOWED");
}

const write = (capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string | null, detail?: Record<string, unknown>, kind: Receipt["kind"] = "write"): Receipt =>
  ({ kind, capability, entities, counts, link, replayed: false, ...(detail ? { detail } : {}) });

/** A validator's own Error (plain `Error`, from src/lib/school/details.ts) is a refusal the user can fix. */
function refusal(error: unknown, reason: string): never {
  if (error instanceof BillingAccessError) {
    if (error.code === "PLAN_LIMIT") throw new WorkflowError("DOMAIN_REFUSED", { reason: "PLAN_CAPACITY", suggest: "subscription.request_plan_change" });
    if (error.status === 402) throw new WorkflowError("SUSPENDED");
  }
  if (error instanceof Error && error.constructor === Error) throw new WorkflowError("DOMAIN_REFUSED", { reason });
  throw error;
}

// ─── Names → records ──────────────────────────────────────────────────────

const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}@.]+/gu, " ").trim();
const CAMPUS_WORDS = /(^| )(campus|branch|school|the|کیمپس|برانچ|اسکول|فرع|الفرع|حرم|مدرسة)(?= |$)/gu;
const core = (value: string) => fold(value).replace(CAMPUS_WORDS, " ").replace(/\s+/g, " ").trim();
/** "and", "&", ",", "or" in EN/AR/UR: a phrase that may name more than one campus. */
const SPLIT = /\s*(?:,|،|&|\+|\/|\band\b|\bor\b|\s+و\s*|\s+اور\s+|\s+یا\s+|\s+أو\s+)\s*/u;
const EVERY = /(^| )(all|every|each|both|تمام|سب|ہر|جميع|كل|كلا)( |$)/u;

type CampusRow = { id: string; name: string; city: string | null; regId: string };
const liveCampuses = (ctx: CapabilityContext): Promise<CampusRow[]> =>
  prisma.campus.findMany({ where: { schoolId: ctx.user.schoolId, archivedAt: null }, select: { id: true, name: true, city: true, regId: true }, orderBy: { name: "asc" } });

function matchCampus(rows: readonly CampusRow[], said: string): CampusRow[] {
  const wanted = core(said);
  if (!wanted) return [];
  const exact = rows.filter(row => core(row.name) === wanted || fold(row.regId) === fold(said));
  if (exact.length) return exact;
  const parts = wanted.split(" ");
  return rows.filter(row => { const words = core(row.name).split(" "); return parts.every(part => words.some(word => word.startsWith(part))); });
}
const campusOptions = (rows: readonly CampusRow[]) => rows.slice(0, 8).map(row => ({ value: row.name, label: row.city ? `${row.name} · ${row.city}` : row.name }));

/**
 * RT13: exactly one live campus of this school. Two campuses in one phrase, or "all campuses", are refused (the plan
 * gets one step per campus); a job pinned to a campus may not act on another one.
 */
async function oneCampus(ctx: CapabilityContext, said: string, pointer: string, boundId?: string): Promise<CampusRow> {
  groupOwner(ctx);
  const rows = await liveCampuses(ctx);
  let campus: CampusRow | undefined;
  if (boundId) {
    campus = rows.find(row => row.id === boundId);
    if (!campus) throw new WorkflowError("SCOPE_DENIED");
  } else {
    const whole = matchCampus(rows, said);
    if (whole.length !== 1) {
      const named = new Set(said.split(SPLIT).map(part => part.trim()).filter(Boolean).flatMap(part => { const found = matchCampus(rows, part); return found.length === 1 ? [found[0].id] : []; }));
      if (named.size > 1 || EVERY.test(fold(said))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ONE_CAMPUS_PER_STEP" });
      throw new InputRequired([whole.length
        ? { pointer, promptKey: "CAMPUS_AMBIGUOUS", params: { count: whole.length }, options: campusOptions(whole) }
        : { pointer, promptKey: "CAMPUS_NOT_FOUND", options: campusOptions(rows) }]);
    }
    campus = whole[0];
  }
  if (ctx.campusId && ctx.campusId !== campus.id) throw new WorkflowError("SCOPE_DENIED");
  return campus;
}

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

type Member = { id: string; fullName: string; email: string; role: UserRole; campusId: string | null; isActive: boolean; isInstitutionOwner: boolean; canManageMemberships: boolean; canPurchaseSubscription: boolean; accessVersion: number };
/** A staff member of this school named by the user (name or email); optionally only on one campus (RT13). */
async function schoolMember(ctx: CapabilityContext, said: string, pointer: string, opts: { campusId?: string | null; activeOnly: boolean }): Promise<Member> {
  const people: Member[] = await prisma.user.findMany({
    where: { schoolId: ctx.user.schoolId, role: { notIn: ["STUDENT", "PARENT", "APP_OWNER"] }, ...(opts.activeOnly ? { isActive: true } : {}), ...(opts.campusId ? { campusId: opts.campusId } : {}) },
    select: { id: true, fullName: true, email: true, role: true, campusId: true, isActive: true, isInstitutionOwner: true, canManageMemberships: true, canPurchaseSubscription: true, accessVersion: true }, orderBy: { fullName: "asc" },
  });
  const found = matchName(people, said, row => [row.fullName, row.email]);
  if (found.length === 1) {
    const person = found[0];
    if (person.id === ctx.user.userId) throw new WorkflowError("DOMAIN_REFUSED", { reason: "OWN_ACCOUNT" });
    if (person.isInstitutionOwner) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ACCOUNT_OWNER" });
    return person;
  }
  const sameName = new Set(found.map(row => fold(row.fullName))).size < found.length;
  throw new InputRequired([found.length
    ? { pointer, promptKey: "STAFF_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: sameName ? row.email : row.fullName, label: `${row.fullName} · ${row.email}` })) }
    : { pointer, promptKey: "STAFF_NOT_FOUND", params: { name: said.slice(0, 80) } }]);
}

type TemplateRow = { id: string; title: string; domain: string; campusIds: string[] };
const DOMAIN_WORDS: Record<PolicyDomain, RegExp> = {
  GRADING: /(grad|mark|pass|result|نمبر|گریڈ|درج|علام|نجاح)/u,
  CALENDAR: /(calendar|weekend|term|week|holiday|کیلنڈر|چھٹی|ہفت|تقويم|عطل|أسبوع)/u,
};
/** A group policy template of this school named by its title (or, when only one exists for it, its domain). */
async function groupTemplate(ctx: CapabilityContext, said: string, pointer: string, boundId?: string): Promise<TemplateRow> {
  groupOwner(ctx);
  const rows: TemplateRow[] = await prisma.policyTemplate.findMany({ where: { schoolId: ctx.user.schoolId }, select: { id: true, title: true, domain: true, campusIds: true }, orderBy: { title: "asc" } });
  if (boundId) {
    const bound = rows.find(row => row.id === boundId);
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const wanted = fold(said);
  let found = rows.filter(row => fold(row.title) === wanted);
  if (!found.length) found = rows.filter(row => wanted.length >= 3 && (fold(row.title).includes(wanted) || wanted.includes(fold(row.title))));
  if (!found.length) found = rows.filter(row => DOMAIN_WORDS[row.domain as PolicyDomain]?.test(wanted));
  if (found.length === 1) return found[0];
  throw new InputRequired([{ pointer, promptKey: found.length ? "POLICY_TEMPLATE_AMBIGUOUS" : "POLICY_TEMPLATE_NOT_FOUND", options: (found.length ? found : rows).slice(0, 8).map(row => ({ value: row.title, label: `${row.title} · ${row.domain}` })) }]);
}

const NOT_LIVE = l("Submitted for review, not live. Nothing changes at any campus until the reviewer approves it and its date comes.", "أُرسلت للمراجعة وليست سارية. لا يتغير شيء في أي فرع حتى يوافق المراجع ويحين تاريخها.", "جائزے کے لیے بھیج دی گئی، ابھی نافذ نہیں۔ جب تک جائزہ لینے والا منظور نہ کرے اور تاریخ نہ آ جائے، کسی کیمپس پر کچھ نہیں بدلے گا۔");
const CAMPUSES_LINK = "/super?view=campuses";
const STANDARDS_LINK = "/super?view=standards";
const ACCESS_LINK = "/super?view=access";
const BILLING_LINK = "/super?view=billing";
const APPROVALS_LINK = "/super?view=approvals";

// ─── campus.create (B) ────────────────────────────────────────────────────

const campusFields = {
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(254).optional(),
  website: z.string().trim().max(254).optional(),
  /** The head of campus as printed on letters; an account is invited separately (staff.leader_invite_prepare). */
  principalName: z.string().trim().max(120).optional(),
  board: z.string().trim().max(80).optional(),
};
const campusCreateInput = z.strictObject(campusFields);
type CampusCreateInput = z.infer<typeof campusCreateInput>;
/** Native idempotency: the Campus ID is derived from the step's key, so a replay finds the campus it created. */
const campusRegId = (idempotencyKey: string) => `AI-${sha(idempotencyKey).slice(0, 12).toUpperCase()}`;

async function campusCapacity(ctx: CapabilityContext) {
  try { return await assertPlanCapacity({ schoolId: ctx.user.schoolId, metric: "campuses" }); } catch (error) { return refusal(error, "PLAN_CAPACITY"); }
}
function validCampus(input: CampusCreateInput) {
  try { return validateCampusInput(input); } catch (error) { return refusal(error, "CAMPUS_DETAILS_INVALID"); }
}
async function assertNameFree(ctx: CapabilityContext, name: string, exceptId?: string) {
  const clash = await prisma.campus.findFirst({ where: { schoolId: ctx.user.schoolId, archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CAMPUS_NAME_TAKEN" });
}
/** What seedCampusCalendar will copy: the oldest campus's active year and weekend, or a new year with Sunday off. */
async function calendarSource(ctx: CapabilityContext) {
  const sibling = await prisma.campus.findFirst({ where: { schoolId: ctx.user.schoolId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const cycle = sibling ? await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: sibling.id, status: "ACTIVE" }, select: { label: true } }) : null;
  return { sibling, cycle };
}

const CAMPUS_CREATE = defineCapability<CampusCreateInput>({
  key: "campus.create", version: 2, cluster: "C8", inventoryKeys: ["campus.create"], risk: "CREATE", roles: GROUP, class: "B",
  input: campusCreateInput, evidence: ["/name", "/city"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Add a campus", "Open a new campus in your group, inside your plan's campus allowance. It gets the group's academic year and weekend; its campus admin and principal are invited separately.", "Open a new campus in Johar Town, Lahore"],
    ["إضافة فرع", "افتح فرعاً جديداً في مجموعتك ضمن عدد الفروع في باقتك. يأخذ العام الدراسي وعطلة نهاية الأسبوع للمجموعة؛ ويُدعى مديره ومديره الأكاديمي بشكل منفصل.", "افتح فرعاً جديداً في حي العليا بالرياض"],
    ["نیا کیمپس شامل کریں", "اپنے پلان کی حد کے اندر گروپ میں نیا کیمپس کھولیں۔ اسے گروپ کا تعلیمی سال اور ہفتہ وار چھٹی ملے گی؛ کیمپس ایڈمن اور پرنسپل کو الگ سے دعوت دی جاتی ہے۔", "لاہور میں جوہر ٹاؤن کا نیا کیمپس کھول دیں"],
  ),
  idempotency: { mode: "native" },
  source: { serverAction: "src/app/actions/addCampus.ts", service: "src/lib/school/campus-commands.ts:createCampusRecord", reuse: "extracted" },
  async resolve(ctx, input) {
    groupOwner(ctx);
    const valid = validCampus(input);
    await assertNameFree(ctx, valid.name);
    await campusCapacity(ctx);
    return input;
  },
  async preview(ctx, input) {
    groupOwner(ctx);
    const valid = validCampus(input);
    const capacity = await campusCapacity(ctx);
    const { sibling, cycle } = await calendarSource(ctx);
    const board = valid.board || defaultBoardFor(await schoolCountry(ctx.user.schoolId));
    const year = new Date().getFullYear();
    return {
      title: say(ctx, l("Add a campus", "إضافة فرع", "نیا کیمپس شامل کریں")),
      lines: [
        { label: say(ctx, l("Campus", "الفرع", "کیمپس")), value: valid.name },
        { label: say(ctx, l("City", "المدينة", "شہر")), value: valid.city },
        ...(valid.address ? [{ label: say(ctx, l("Address", "العنوان", "پتا")), value: valid.address }] : []),
        ...(valid.phone ? [{ label: say(ctx, l("Phone", "الهاتف", "فون")), value: valid.phone }] : []),
        ...(valid.email ? [{ label: say(ctx, l("Email", "البريد", "ای میل")), value: valid.email }] : []),
        ...(valid.website ? [{ label: say(ctx, l("Website", "الموقع", "ویب سائٹ")), value: valid.website }] : []),
        ...(valid.principalName ? [{ label: say(ctx, l("Head of campus (printed)", "رئيس الفرع (مطبوع)", "کیمپس سربراہ (چھپا ہوا نام)")), value: valid.principalName }] : []),
        { label: say(ctx, l("Board", "المنهج", "بورڈ")), value: board },
        { label: say(ctx, l("Academic year", "العام الدراسي", "تعلیمی سال")), value: sibling && cycle
          ? say(ctx, l(`${cycle.label}, with the weekend of ${sibling.name}`, `${cycle.label} مع عطلة ${sibling.name}`, `${cycle.label}، ${sibling.name} والی ہفتہ وار چھٹی کے ساتھ`))
          : say(ctx, l(`${year}-${String((year + 1) % 100).padStart(2, "0")}, Sunday off`, `${year}-${String((year + 1) % 100).padStart(2, "0")}، الأحد عطلة`, `${year}-${String((year + 1) % 100).padStart(2, "0")}، اتوار کی چھٹی`)) },
        { label: say(ctx, l("Plan allowance", "حد الباقة", "پلان کی حد")), value: capacity.limit < 0 ? say(ctx, l("No campus limit", "بلا حد للفروع", "کیمپس کی کوئی حد نہیں")) : say(ctx, l(`Campus ${capacity.current + 1} of ${capacity.limit}`, `الفرع ${capacity.current + 1} من ${capacity.limit}`, `${capacity.limit} میں سے کیمپس ${capacity.current + 1}`)) },
        { label: say(ctx, l("Leaders", "القيادة", "قیادت")), value: say(ctx, l("Nobody is invited yet. Prepare the campus admin and principal invitations next.", "لم تُرسل دعوات بعد. جهّز دعوتي مدير الفرع والمدير الأكاديمي بعد ذلك.", "ابھی کسی کو دعوت نہیں گئی۔ اس کے بعد کیمپس ایڈمن اور پرنسپل کے دعوت نامے تیار کریں۔")) },
      ],
      counts: { campuses: 1, calendars: 1 },
      confirmLabel: `${say(ctx, l("Add campus", "إضافة الفرع", "کیمپس شامل کریں"))} · ${valid.name}`,
      basis: { input, used: capacity.current, limit: capacity.limit, sibling: sibling?.id ?? null, cycle: cycle?.label ?? null },
    };
  },
  async execute(ctx, input, { idempotencyKey }) {
    groupOwner(ctx);
    const regId = campusRegId(idempotencyKey);
    const replay = await prisma.campus.findFirst({ where: { schoolId: ctx.user.schoolId, regId }, select: { id: true, name: true } });
    if (replay) {
      // The campus exists from an earlier attempt; make sure it also got its calendar, then report it once.
      if (!(await prisma.academicCycle.count({ where: { schoolId: ctx.user.schoolId, campusId: replay.id } }))) await seedCampusCalendar(ctx.user.schoolId, replay.id);
      const cycle = await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: replay.id, status: "ACTIVE" }, select: { id: true } });
      return write("campus.create", [{ model: "campus", id: replay.id }, ...(cycle ? [{ model: "academicCycle", id: cycle.id }] : [])], { campuses: 0, calendars: 0 }, CAMPUSES_LINK, { reconciled: true, regId, delegationRequired: true });
    }
    const valid = validCampus(input);
    await assertNameFree(ctx, valid.name);
    await campusCapacity(ctx);
    const campus = await createCampusRecord(ctx.user, { ...valid, regId }).catch(error => refusal(error, "CAMPUS_DETAILS_INVALID"));
    const cycle = await prisma.academicCycle.findFirst({ where: { schoolId: ctx.user.schoolId, campusId: campus.id, status: "ACTIVE" }, select: { id: true } });
    return write("campus.create", [{ model: "campus", id: campus.id }, ...(cycle ? [{ model: "academicCycle", id: cycle.id }] : [])], { campuses: 1, calendars: cycle ? 1 : 0 }, CAMPUSES_LINK,
      { regId: campus.regId, delegationRequired: true, next: "staff.leader_invite_prepare" });
  },
});

// ─── campus.update_details (B) ────────────────────────────────────────────

const campusChanges = z.strictObject({ ...campusFields, name: campusFields.name.optional(), city: campusFields.city.optional() })
  .refine(value => Object.values(value).some(field => field !== undefined), "Name at least one detail to change.");
const campusUpdateInput = z.strictObject({
  /** The campus as the user named it; bound to one live campus of this school (RT13). */
  campus: z.string().trim().min(1).max(120),
  /** Bound by the server from `campus`. */
  campusId: ID.optional(),
  changes: campusChanges,
});
type CampusUpdateInput = z.infer<typeof campusUpdateInput>;
const DETAIL_LABELS: Record<keyof z.infer<typeof campusChanges>, L10n> = {
  name: l("Name", "الاسم", "نام"), city: l("City", "المدينة", "شہر"), address: l("Address", "العنوان", "پتا"), phone: l("Phone", "الهاتف", "فون"),
  email: l("Email", "البريد", "ای میل"), website: l("Website", "الموقع", "ویب سائٹ"), principalName: l("Head of campus (printed)", "رئيس الفرع (مطبوع)", "کیمپس سربراہ (چھپا ہوا نام)"), board: l("Board", "المنهج", "بورڈ"),
};

const CAMPUS_UPDATE = defineCapability<CampusUpdateInput>({
  key: "campus.update_details", version: 1, cluster: "C8", inventoryKeys: ["campus.update_details"], risk: "UPDATE", roles: GROUP, class: "B",
  input: campusUpdateInput, evidence: ["/campus", "/changes"], humanFields: ["campusId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Correct a campus's details", "Change one campus's name, city, address, phone, email, website, board or printed head. Each save is recorded in the campus history.", "Change Gulberg campus's phone to 042 3571 0000"],
    ["تصحيح بيانات فرع", "غيّر اسم فرع واحد أو مدينته أو عنوانه أو هاتفه أو بريده أو موقعه أو منهجه أو اسم رئيسه المطبوع. يُسجَّل كل حفظ في سجل الفرع.", "غيّر هاتف فرع العليا إلى 0112345678"],
    ["کیمپس کی تفصیل درست کریں", "کسی ایک کیمپس کا نام، شہر، پتا، فون، ای میل، ویب سائٹ، بورڈ یا سربراہ کا نام بدلیں۔ ہر تبدیلی کیمپس کی تاریخ میں درج ہوتی ہے۔", "گلبرگ کیمپس کا فون نمبر 042 3571 0000 کر دیں"],
  ),
  idempotency: { mode: "convergent" },
  source: { serverAction: "src/app/actions/settings.ts:updateCampusDetails", service: "src/lib/school/campus-commands.ts:updateCampusDetailsCommand", reuse: "extracted" },
  async resolve(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    if (input.changes.name) await assertNameFree(ctx, input.changes.name, campus.id);
    return { ...input, campus: campus.name, campusId: campus.id };
  },
  async preview(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    const current = await prisma.campus.findFirstOrThrow({ where: { id: campus.id, schoolId: ctx.user.schoolId } });
    const rows = (Object.entries(input.changes) as Array<[keyof typeof DETAIL_LABELS, string | undefined]>).filter(([, value]) => value !== undefined);
    const changed = rows.filter(([key, value]) => (current[key] ?? "") !== (value ?? ""));
    const none = say(ctx, l("(blank)", "(فارغ)", "(خالی)"));
    return {
      title: `${say(ctx, l("Correct campus details", "تصحيح بيانات الفرع", "کیمپس کی تفصیل درست کریں"))} · ${current.name}`,
      lines: rows.map(([key, value]) => ({ label: say(ctx, DETAIL_LABELS[key]), value: (current[key] ?? "") === (value ?? "") ? `${value || none} · ${say(ctx, l("already set", "مضبوط مسبقاً", "پہلے سے یہی ہے"))}` : `${current[key] || none} → ${value || none}` })),
      counts: { changes: changed.length },
      confirmLabel: `${say(ctx, l("Save campus details", "حفظ بيانات الفرع", "کیمپس کی تفصیل محفوظ کریں"))} · ${current.name}`,
      basis: { input, revision: recordRevision(current) },
    };
  },
  async execute(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    const result = await updateCampusDetailsCommand(ctx.user, { campusId: campus.id, ...input.changes }).catch(error => refusal(error, "CAMPUS_DETAILS_INVALID"));
    return write("campus.update_details", [{ model: "campus", id: campus.id }], { changes: result.changed.length }, CAMPUSES_LINK, { changed: result.changed, ...(result.changed.length ? {} : { reconciled: true }) });
  },
});

// ─── group_policy.create_template (B) ─────────────────────────────────────

const templateInput = z.strictObject({
  domain: z.enum(["GRADING", "CALENDAR"]),
  title: z.string().trim().min(3).max(120),
  /** The campuses as the user named them; left out, every live campus of the group. */
  campuses: z.array(z.string().trim().min(1).max(120)).min(1).max(50).optional(),
  /** Bound by the server from `campuses`. */
  campusIds: z.array(ID).max(50).optional(),
  /** ISO country codes and curriculum boards the template fits; left out, any. */
  countries: z.array(z.string().trim().regex(/^[A-Za-z]{2}$/)).max(20).optional(),
  boards: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
type TemplateInput = z.infer<typeof templateInput>;

async function templateCampuses(ctx: CapabilityContext, input: TemplateInput): Promise<CampusRow[]> {
  groupOwner(ctx);
  const rows = await liveCampuses(ctx);
  if (input.campusIds) {
    const bound = input.campusIds.map(id => rows.find(row => row.id === id));
    if (bound.some(row => !row)) throw new WorkflowError("SCOPE_DENIED");
    return bound as CampusRow[];
  }
  if (!input.campuses) return rows;
  return input.campuses.map((said, index) => {
    const found = matchCampus(rows, said);
    if (found.length === 1) return found[0];
    throw new InputRequired([found.length
      ? { pointer: `/campuses/${index}`, promptKey: "CAMPUS_AMBIGUOUS", params: { count: found.length }, options: campusOptions(found) }
      : { pointer: `/campuses/${index}`, promptKey: "CAMPUS_NOT_FOUND", options: campusOptions(rows) }]);
  });
}
const sameTemplate = (ctx: CapabilityContext, input: TemplateInput) =>
  prisma.policyTemplate.findFirst({ where: { schoolId: ctx.user.schoolId, domain: input.domain, title: { equals: input.title.trim(), mode: "insensitive" } }, select: { id: true } });
const DOMAIN_NAMES: Record<PolicyDomain, L10n> = { GRADING: l("Grading", "التقييم", "گریڈنگ"), CALENDAR: l("Calendar", "التقويم", "کیلنڈر") };

const POLICY_TEMPLATE = defineCapability<TemplateInput>({
  key: "group_policy.create_template", version: 1, cluster: "C5", inventoryKeys: ["group_policy.create_template"], risk: "CREATE", roles: GROUP, class: "B",
  input: templateInput, evidence: ["/title"], humanFields: ["campusIds"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Start a group standard", "Create a grading or calendar template for your campuses. It sets nothing until a version is drafted, reviewed and its date comes.", "Start a grading standard for all our campuses"],
    ["بدء معيار للمجموعة", "أنشئ قالب تقييم أو تقويم لفروعك. لا يطبّق شيئاً حتى تُكتب نسخة وتُراجع ويحين تاريخها.", "ابدأ معيار تقييم لكل فروعنا"],
    ["گروپ کا معیار شروع کریں", "اپنے کیمپسز کے لیے گریڈنگ یا کیلنڈر کا سانچہ بنائیں۔ جب تک ورژن لکھ کر منظور نہ ہو اور تاریخ نہ آئے، کچھ نافذ نہیں ہوتا۔", "تمام کیمپسز کے لیے گریڈنگ کا معیار شروع کریں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/group-policy (action=template)", service: "src/lib/group-policy/service.ts:createTemplate", reuse: "direct" },
  async resolve(ctx, input) {
    const campuses = await templateCampuses(ctx, input);
    return { ...input, campuses: campuses.map(row => row.name), campusIds: campuses.map(row => row.id) };
  },
  async preview(ctx, input) {
    const campuses = await templateCampuses(ctx, input);
    const existing = await sameTemplate(ctx, input);
    return {
      title: say(ctx, l("Start a group standard", "بدء معيار للمجموعة", "گروپ کا معیار شروع کریں")),
      lines: [
        { label: say(ctx, l("Standard", "المعيار", "معیار")), value: `${input.title} · ${say(ctx, DOMAIN_NAMES[input.domain])}` },
        { label: say(ctx, l("Campuses", "الفروع", "کیمپس")), value: campuses.map(row => row.name).join(", ") },
        ...(input.countries?.length ? [{ label: say(ctx, l("Countries", "الدول", "ممالک")), value: input.countries.map(code => code.toUpperCase()).join(", ") }] : []),
        ...(input.boards?.length ? [{ label: say(ctx, l("Boards", "المناهج", "بورڈ")), value: input.boards.join(", ") }] : []),
        { label: say(ctx, l("What changes now", "ما يتغير الآن", "ابھی کیا بدلے گا")), value: existing ? say(ctx, l("This standard already exists; nothing is added.", "المعيار موجود؛ لن يُضاف شيء.", "یہ معیار پہلے سے موجود ہے؛ کچھ شامل نہیں ہوگا۔")) : say(ctx, l("Nothing at any campus. Draft its values next.", "لا شيء في أي فرع. اكتب قيمه بعد ذلك.", "کسی کیمپس پر کچھ نہیں۔ اس کے بعد اس کی قدریں لکھیں۔")) },
      ],
      counts: { templates: existing ? 0 : 1, campuses: campuses.length },
      basis: { input, campusIds: campuses.map(row => row.id), existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input) {
    const campuses = await templateCampuses(ctx, input);
    const existing = await sameTemplate(ctx, input);
    if (existing) return write("group_policy.create_template", [{ model: "policyTemplate", id: existing.id }], { templates: 0 }, STANDARDS_LINK, { reconciled: true, live: false });
    const created = await createTemplate(ctx.user, { domain: input.domain, title: input.title, campusIds: campuses.map(row => row.id), countries: input.countries ?? [], boards: input.boards ?? [] });
    return write("group_policy.create_template", [{ model: "policyTemplate", id: created.id }], { templates: 1, campuses: campuses.length }, STANDARDS_LINK, { live: false });
  },
});

// ─── group_policy.save_draft (B) ──────────────────────────────────────────

const pct = z.number().min(0).max(100);
const MARK_RULE = z.enum(["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"]);
const policyValues = z.strictObject({
  passingPercentage: pct.optional(), gradeAplus: pct.optional(), gradeA: pct.optional(), gradeB: pct.optional(), gradeC: pct.optional(), gradeD: pct.optional(),
  roundingRule: z.enum(["WHOLE", "ONE_DECIMAL", "TWO_DECIMALS"]).optional(), missingMarkPolicy: MARK_RULE.optional(), absentMarkPolicy: MARK_RULE.optional(),
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  weekend: z.array(z.number().int().min(0).max(6)).max(3).optional(),
  termCount: z.number().int().min(1).max(4).optional(),
  schoolDayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).refine(value => Object.values(value).some(field => field !== undefined), "Set at least one value.");
type PolicyKey = keyof z.infer<typeof policyValues>;
const POLICY_KEY_NAMES = ["passingPercentage", "gradeAplus", "gradeA", "gradeB", "gradeC", "gradeD", "roundingRule", "missingMarkPolicy", "absentMarkPolicy", "weekStartsOn", "weekend", "termCount", "schoolDayStart"] as const satisfies readonly PolicyKey[];
const draftInput = z.strictObject({
  /** The template as the user named it. */
  template: z.string().trim().min(1).max(120),
  templateId: ID.optional(),
  values: policyValues,
  /** Keys a campus may ask to differ (with a reviewed, time-bound override); every other key set is locked. */
  overridableKeys: z.array(z.enum(POLICY_KEY_NAMES)).max(13).optional(),
  note: z.string().trim().max(500).optional(),
});
type DraftInput = z.infer<typeof draftInput>;
const setValues = (values: DraftInput["values"]) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Record<string, unknown>;

async function draftTarget(ctx: CapabilityContext, input: DraftInput) {
  const template = await groupTemplate(ctx, input.template, "/template", input.templateId);
  const domain = template.domain as PolicyDomain;
  const foreign = Object.keys(setValues(input.values)).filter(key => !(key in POLICY_KEYS[domain]));
  if (foreign.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "KEY_NOT_IN_DOMAIN", key: foreign[0] });
  return { template, domain };
}

const POLICY_DRAFT = defineCapability<DraftInput>({
  key: "group_policy.save_draft", version: 1, cluster: "C5", inventoryKeys: ["group_policy.save_draft"], risk: "UPDATE", roles: GROUP, class: "B",
  input: draftInput, evidence: ["/template", "/values"], humanFields: ["templateId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Draft a group standard", "Write the values of a grading or calendar standard and say which ones a campus may ask to change. It stays a draft until you submit it for review.", "Make 40% the pass mark, with A from 80, B from 70 and C from 60, at every campus"],
    ["كتابة مسودة معيار", "اكتب قيم معيار التقييم أو التقويم وحدّد ما يمكن للفرع طلب تغييره. يبقى مسودة حتى ترسله للمراجعة.", "اجعل درجة النجاح 40% مع A من 80 وB من 70 وC من 60 في كل الفروع"],
    ["معیار کا مسودہ لکھیں", "گریڈنگ یا کیلنڈر معیار کی قدریں لکھیں اور بتائیں کہ کیمپس کون سی بدلنے کی درخواست کر سکتا ہے۔ جائزے کے لیے بھیجنے تک یہ مسودہ رہے گا۔", "تمام کیمپسز میں پاسنگ مارکس 40 فیصد، A اسی سے، B ستر سے اور C ساٹھ سے کر دیں"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "POST /api/group-policy (action=draft)", service: "src/lib/group-policy/service.ts:saveDraft", reuse: "direct" },
  async resolve(ctx, input) {
    const { template } = await draftTarget(ctx, input);
    return { ...input, template: template.title, templateId: template.id };
  },
  async preview(ctx, input) {
    const { template, domain } = await draftTarget(ctx, input);
    const latest = await prisma.policyTemplateVersion.findFirst({ where: { schoolId: ctx.user.schoolId, templateId: template.id }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, values: true } });
    const before = (latest?.values ?? {}) as Record<string, unknown>;
    const values = setValues(input.values);
    const show = (value: unknown) => value === undefined ? say(ctx, l("not set", "غير محدد", "طے نہیں")) : Array.isArray(value) ? value.join(", ") : String(value);
    return {
      title: `${say(ctx, l("Draft a group standard", "كتابة مسودة معيار", "معیار کا مسودہ لکھیں"))} · ${template.title}`,
      lines: [
        ...Object.entries(values).map(([key, value]) => ({
          label: POLICY_KEYS[domain][key].label,
          value: `${show(before[key])} → ${show(value)} · ${input.overridableKeys?.includes(key as PolicyKey) ? say(ctx, l("campus may ask to differ", "يمكن للفرع طلب الاختلاف", "کیمپس تبدیلی مانگ سکتا ہے")) : say(ctx, l("locked for every campus", "مقفل لكل الفروع", "ہر کیمپس کے لیے لاک"))}`,
        })),
        { label: say(ctx, l("Status after saving", "الحالة بعد الحفظ", "محفوظ کرنے کے بعد حالت")), value: say(ctx, l("Draft, not live", "مسودة، غير سارية", "مسودہ، ابھی نافذ نہیں")) },
      ],
      counts: { values: Object.keys(values).length },
      confirmLabel: say(ctx, l("Save draft", "حفظ المسودة", "مسودہ محفوظ کریں")),
      basis: { input, latest: latest ? { id: latest.id, version: latest.version, status: latest.status } : null },
    };
  },
  async execute(ctx, input) {
    const { template } = await draftTarget(ctx, input);
    const saved = await saveDraft(ctx.user, { templateId: template.id, values: setValues(input.values), overridableKeys: input.overridableKeys ?? [], note: input.note ?? "" });
    return write("group_policy.save_draft", [{ model: "policyTemplateVersion", id: saved.id }], { values: Object.keys(setValues(input.values)).length }, `${STANDARDS_LINK}&versionId=${encodeURIComponent(saved.id)}`, { status: "DRAFT", live: false, version: saved.version }, "draft");
  },
});

// ─── group_policy.submit_for_review (B) ───────────────────────────────────

const submitInput = z.strictObject({
  template: z.string().trim().min(1).max(120),
  templateId: ID.optional(),
  /** The date the version takes effect once approved. */
  effectiveFrom: DAY,
  /** The reviewing group admin as the user named them ("me" when they are the only one). */
  reviewer: z.string().trim().min(1).max(120).optional(),
  reviewerId: ID.optional(),
});
type SubmitInput = z.infer<typeof submitInput>;
const SELF = /^(me|myself|i|i will|مجھے|میں|خود|أنا|انا|بنفسي)$/u;

async function submitTarget(ctx: CapabilityContext, input: SubmitInput) {
  if (!isRealDay(input.effectiveFrom)) throw new InputRequired([{ pointer: "/effectiveFrom", promptKey: "DATE_INVALID" }]);
  const template = await groupTemplate(ctx, input.template, "/template", input.templateId);
  const draft = await prisma.policyTemplateVersion.findFirst({ where: { schoolId: ctx.user.schoolId, templateId: template.id, status: "DRAFT" }, select: { id: true, version: true } });
  return { template, draft };
}
/** Another active group admin, or the author alone when they are the only one (SD3: a reason is asked at approval). */
async function reviewerFor(ctx: CapabilityContext, input: SubmitInput) {
  const owners = await prisma.user.findMany({ where: { schoolId: ctx.user.schoolId, isActive: true, role: "SUPER_ADMIN" }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } });
  const sole = await soleChecker("policy", ctx.user, null);
  if (input.reviewerId) {
    const bound = owners.find(row => row.id === input.reviewerId);
    if (!bound || (bound.id === ctx.user.userId && !sole)) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const others = owners.filter(row => row.id !== ctx.user.userId);
  const said = input.reviewer ? fold(input.reviewer) : "";
  if (!input.reviewer || SELF.test(said)) {
    if (sole) return owners.find(row => row.id === ctx.user.userId) ?? { id: ctx.user.userId, fullName: ctx.user.fullName ?? "", email: ctx.user.email };
    throw new InputRequired([{ pointer: "/reviewer", promptKey: "POLICY_REVIEWER_REQUIRED", options: others.slice(0, 8).map(row => ({ value: row.fullName, label: `${row.fullName} · ${row.email}` })) }]);
  }
  const found = matchName(others, input.reviewer, row => [row.fullName, row.email]);
  if (found.length === 1) return found[0];
  throw new InputRequired([{ pointer: "/reviewer", promptKey: found.length ? "STAFF_AMBIGUOUS" : "POLICY_REVIEWER_REQUIRED", options: (found.length ? found : others).slice(0, 8).map(row => ({ value: row.fullName, label: `${row.fullName} · ${row.email}` })) }]);
}
async function impact(ctx: CapabilityContext, versionId: string, effectiveFrom: string) {
  const result = await previewPolicy(ctx.user, versionId, effectiveFrom);
  if (result.blocking) throw new WorkflowError("DOMAIN_REFUSED", { reason: "INCOMPATIBLE_CAMPUSES", count: result.blocking });
  return result;
}

const POLICY_SUBMIT = defineCapability<SubmitInput>({
  key: "group_policy.submit_for_review", version: 1, cluster: "C5", inventoryKeys: ["group_policy.submit_for_review"], risk: "UPDATE", roles: GROUP, class: "B",
  input: submitInput, evidence: ["/template", "/effectiveFrom"], humanFields: ["templateId", "reviewerId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Submit a standard for review", "Send the draft of a group standard to another group admin with its start date. It is submitted, not live: nothing changes until they approve it and the date comes.", "Send the grading standard to Hina for review, starting 1 November"],
    ["إرسال معيار للمراجعة", "أرسل مسودة معيار المجموعة إلى مشرف آخر مع تاريخ بدئه. تُرسل ولا تصبح سارية: لا يتغير شيء حتى يوافق ويحين التاريخ.", "أرسل معيار التقييم إلى هند للمراجعة ابتداءً من 1 نوفمبر"],
    ["معیار جائزے کے لیے بھیجیں", "گروپ معیار کا مسودہ شروع کی تاریخ کے ساتھ کسی دوسرے گروپ ایڈمن کو بھیجیں۔ یہ صرف بھیجا جاتا ہے، نافذ نہیں ہوتا: منظوری اور تاریخ آنے تک کچھ نہیں بدلتا۔", "گریڈنگ کا معیار حنا کو جائزے کے لیے بھیج دیں، یکم نومبر سے"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/group-policy (action=submit)", service: "src/lib/group-policy/service.ts:submitForReview", reuse: "direct" },
  async resolve(ctx, input) {
    const { template, draft } = await submitTarget(ctx, input);
    if (!draft) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_DRAFT" });
    const reviewer = await reviewerFor(ctx, input);
    await impact(ctx, draft.id, input.effectiveFrom);
    return { ...input, template: template.title, templateId: template.id, reviewer: reviewer.fullName, reviewerId: reviewer.id };
  },
  async preview(ctx, input) {
    const { template, draft } = await submitTarget(ctx, input);
    if (!draft) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_DRAFT" });
    const reviewer = await reviewerFor(ctx, input);
    const result = await impact(ctx, draft.id, input.effectiveFrom);
    const changes = result.campuses.reduce((sum, row) => sum + row.changes.length, 0);
    const ending = result.campuses.reduce((sum, row) => sum + row.endedOverrides.length, 0);
    const self = reviewer.id === ctx.user.userId;
    return {
      title: `${say(ctx, l("Submit for review", "إرسال للمراجعة", "جائزے کے لیے بھیجیں"))} · ${template.title} v${draft.version}`,
      lines: [
        { label: say(ctx, l("Takes effect", "يسري من", "نافذ ہوگا")), value: input.effectiveFrom },
        { label: say(ctx, l("Reviewer", "المراجع", "جائزہ لینے والا")), value: self ? say(ctx, l("You, as the only group admin. You give a reason when you approve.", "أنت، بصفتك المشرف الوحيد. تكتب سبباً عند الموافقة.", "آپ، واحد گروپ ایڈمن کے طور پر۔ منظوری پر وجہ لکھنی ہوگی۔")) : reviewer.fullName },
        { label: say(ctx, l("Campuses affected", "الفروع المتأثرة", "متاثرہ کیمپس")), value: result.campuses.map(row => row.name).join(", ") || "0" },
        { label: say(ctx, l("Values that will change", "قيم ستتغير", "بدلنے والی قدریں")), value: String(changes) },
        ...(ending ? [{ label: say(ctx, l("Campus overrides that end", "استثناءات تنتهي", "ختم ہونے والی کیمپس رعایتیں")), value: String(ending) }] : []),
        { label: say(ctx, l("Status after this", "الحالة بعد ذلك", "اس کے بعد حالت")), value: say(ctx, NOT_LIVE) },
      ],
      counts: { campuses: result.affected, changes, endedOverrides: ending },
      confirmLabel: say(ctx, l("Submit for review", "إرسال للمراجعة", "جائزے کے لیے بھیجیں")),
      basis: { input, versionId: draft.id, previewHash: result.previewHash, reviewerId: reviewer.id },
    };
  },
  async execute(ctx, input) {
    const { template, draft } = await submitTarget(ctx, input);
    if (!draft) {
      // A replay after a lost response: the draft this step submitted is already waiting for its reviewer.
      const submitted = await prisma.policyTemplateVersion.findFirst({ where: { schoolId: ctx.user.schoolId, templateId: template.id, status: "IN_REVIEW", submittedById: ctx.user.userId }, orderBy: { version: "desc" }, select: { id: true, effectiveFrom: true, reviewerId: true } });
      if (submitted && submitted.effectiveFrom?.toISOString().slice(0, 10) === input.effectiveFrom) return write("group_policy.submit_for_review", [{ model: "policyTemplateVersion", id: submitted.id }], { submitted: 0 }, `${STANDARDS_LINK}&versionId=${encodeURIComponent(submitted.id)}`, { reconciled: true, status: "IN_REVIEW", live: false, reviewerId: submitted.reviewerId });
      throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_DRAFT" });
    }
    const reviewer = await reviewerFor(ctx, input);
    const result = await impact(ctx, draft.id, input.effectiveFrom);
    const done = await submitForReview(ctx.user, { versionId: draft.id, effectiveFrom: input.effectiveFrom, reviewerId: reviewer.id, previewHash: result.previewHash });
    return write("group_policy.submit_for_review", [{ model: "policyTemplateVersion", id: done.id }], { submitted: 1, campuses: result.affected }, `${STANDARDS_LINK}&versionId=${encodeURIComponent(done.id)}`,
      { status: "IN_REVIEW", live: false, reviewerId: done.reviewerId, effectiveFrom: input.effectiveFrom, next: "group_policy.review_version" });
  },
});

// ─── identity.add_domain (B) ──────────────────────────────────────────────

const domainInput = z.strictObject({
  /** The school's email domain, e.g. "beaconhouse.edu.pk". */
  domain: z.string().trim().min(3).max(200).regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i),
  /** The sign-in connection by name, when the school has more than one. */
  connection: z.string().trim().min(1).max(120).optional(),
  connectionId: ID.optional(),
});
type DomainInput = z.infer<typeof domainInput>;
type Connection = { id: string; name: string; verifiedDomains: string[]; pendingDomains: unknown };

async function identityConnection(ctx: CapabilityContext, input: DomainInput): Promise<Connection> {
  groupOwner(ctx);
  const rows: Connection[] = await prisma.identityConnection.findMany({ where: { schoolId: ctx.user.schoolId }, select: { id: true, name: true, verifiedDomains: true, pendingDomains: true }, orderBy: { createdAt: "asc" } });
  if (input.connectionId) {
    const bound = rows.find(row => row.id === input.connectionId);
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  // Saving a connection carries its client secret, which only a person enters (identity.save_connection is human only).
  if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_IDENTITY_CONNECTION" });
  const found = input.connection ? matchName(rows, input.connection, row => [row.name]) : rows;
  if (found.length === 1) return found[0];
  throw new InputRequired([{ pointer: "/connection", promptKey: "IDENTITY_CONNECTION_CHOICE", options: (found.length ? found : rows).slice(0, 8).map(row => ({ value: row.name, label: row.name })) }]);
}
const pendingOf = (connection: Connection) => (Array.isArray(connection.pendingDomains) ? connection.pendingDomains : []) as Array<{ domain: string; token: string }>;

const IDENTITY_DOMAIN = defineCapability<DomainInput>({
  key: "identity.add_domain", version: 1, cluster: "C2", inventoryKeys: ["identity.add_domain"], risk: "UPDATE", roles: GROUP, class: "B",
  input: domainInput, evidence: ["/domain"], humanFields: ["connectionId"],
  gates: groupGates(predicate("isInstitutionAuthority", isInstitutionAuthority, GROUP)), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Add a sign-in domain", "Register your school's email domain on its Google or Microsoft sign-in connection. It stays pending, and nobody signs in with it, until your IT adds the DNS record and it is verified.", "Add beaconhouse.edu.pk as our staff sign-in domain"],
    ["إضافة نطاق تسجيل دخول", "سجّل نطاق بريد مدرستك على اتصال الدخول عبر Google أو Microsoft. يبقى معلقاً ولا يدخل به أحد حتى يضيف قسم التقنية سجل DNS ويُتحقق منه.", "أضف school.edu.sa نطاقاً لدخول الموظفين"],
    ["سائن اِن ڈومین شامل کریں", "اسکول کا ای میل ڈومین گوگل یا مائیکروسافٹ سائن اِن کنکشن پر درج کریں۔ جب تک آئی ٹی DNS ریکارڈ شامل کر کے تصدیق نہ کرے، یہ زیر التوا رہے گا اور کوئی اس سے سائن اِن نہیں کر سکے گا۔", "ہمارے عملے کے سائن اِن کے لیے beaconhouse.edu.pk شامل کریں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/identity (action=add-domain)", service: "src/lib/identity/service.ts:addDomain", reuse: "direct" },
  async resolve(ctx, input) {
    const connection = await identityConnection(ctx, input);
    return { ...input, domain: input.domain.toLowerCase(), connection: connection.name, connectionId: connection.id };
  },
  async preview(ctx, input) {
    const connection = await identityConnection(ctx, input);
    const domain = input.domain.toLowerCase();
    const state = connection.verifiedDomains.includes(domain) ? "VERIFIED" : pendingOf(connection).some(row => row.domain === domain) ? "PENDING" : "NEW";
    return {
      title: say(ctx, l("Add a sign-in domain", "إضافة نطاق تسجيل دخول", "سائن اِن ڈومین شامل کریں")),
      lines: [
        { label: say(ctx, l("Domain", "النطاق", "ڈومین")), value: domain },
        { label: say(ctx, l("Connection", "الاتصال", "کنکشن")), value: connection.name },
        { label: say(ctx, l("Status after saving", "الحالة بعد الحفظ", "محفوظ کرنے کے بعد حالت")), value: state === "VERIFIED"
          ? say(ctx, l("Already verified; nothing changes.", "متحقق منه مسبقاً؛ لا تغيير.", "پہلے سے تصدیق شدہ؛ کچھ نہیں بدلے گا۔"))
          : say(ctx, l(`Pending: add the TXT record _skoolee-verify.${domain} to your DNS. Nobody signs in with it until it is verified.`, `معلّق: أضف سجل TXT ‏_skoolee-verify.${domain} إلى DNS. لا يدخل به أحد قبل التحقق.`, `زیر التوا: DNS میں TXT ریکارڈ _skoolee-verify.${domain} شامل کریں۔ تصدیق تک کوئی اس سے سائن اِن نہیں کرے گا۔`)) },
      ],
      counts: { domains: state === "NEW" ? 1 : 0 },
      basis: { input, connectionId: connection.id, state },
    };
  },
  async execute(ctx, input) {
    const connection = await identityConnection(ctx, input);
    const domain = input.domain.toLowerCase();
    const link = "/identity";
    if (connection.verifiedDomains.includes(domain)) return write("identity.add_domain", [{ model: "identityConnection", id: connection.id }], { domains: 0 }, link, { reconciled: true, domain, status: "VERIFIED" });
    // A replay must not issue a new token: the IT team may already have published the first one.
    const pending = pendingOf(connection).find(row => row.domain === domain);
    if (pending) return write("identity.add_domain", [{ model: "identityConnection", id: connection.id }], { domains: 0 }, link, { reconciled: true, domain, status: "PENDING_VERIFICATION", record: `_skoolee-verify.${domain}`, token: pending.token });
    const added = await addDomain(ctx.user, { id: connection.id, domain });
    return write("identity.add_domain", [{ model: "identityConnection", id: connection.id }], { domains: 1 }, link, { domain: added.domain, status: "PENDING_VERIFICATION", record: added.record, token: added.token });
  },
});

// ─── subscription.preview (A, read) ───────────────────────────────────────

const PUBLISHED_PLANS = ["BASIC", "PRO"] as const;
const subscriptionPreviewInput = z.strictObject({
  /** The plan to compare with; left out, the smallest published plan that fits the campuses wanted. */
  plan: z.enum(PUBLISHED_PLANS).optional(),
  billingPeriod: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  /** "We're opening two more campuses": campuses to add on top of the live ones. */
  extraCampuses: z.number().int().min(0).max(100).optional(),
});
type SubscriptionPreviewInput = z.infer<typeof subscriptionPreviewInput>;
const period = (value?: "MONTHLY" | "ANNUAL") => (value === "ANNUAL" ? "annual" : "monthly") as "annual" | "monthly";

const SUBSCRIPTION_PREVIEW = defineCapability<SubscriptionPreviewInput>({
  key: "subscription.preview", version: 1, cluster: "C6", inventoryKeys: ["subscription.preview"], risk: "READ", roles: GROUP, class: "A",
  input: subscriptionPreviewInput, evidence: [],
  gates: groupGates(SUBSCRIPTION_GATE), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Compare plans", "See what a plan change would cost and allow: campuses, students and teachers against what you use today. Nothing is requested or charged.", "We're opening two more campuses next year — what plan do we need?"],
    ["مقارنة الباقات", "اعرف تكلفة تغيير الباقة وما تسمح به من فروع وطلاب ومعلمين مقارنة باستخدامك الحالي. لا يُطلب ولا يُخصم شيء.", "سنفتح فرعين آخرين العام القادم — أي باقة نحتاج؟"],
    ["پلان کا موازنہ", "دیکھیں پلان بدلنے پر کتنا خرچ اور کتنے کیمپس، طلبہ اور اساتذہ کی اجازت ہوگی، آج کے استعمال کے مقابلے میں۔ نہ کوئی درخواست جاتی ہے نہ رقم کٹتی ہے۔", "اگلے سال دو نئے کیمپس کھول رہے ہیں — کون سا پلان چاہیے؟"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "POST /api/billing/lifecycle (action=preview)", service: "src/lib/billing/lifecycle.ts:previewPlanChange", reuse: "direct" },
  async execute(ctx, input) {
    groupOwner(ctx);
    if (!canOwnSubscription(ctx.user)) throw new WorkflowError("ROLE_NOT_ALLOWED");
    const snapshot = await getBillingSnapshot(ctx.user.schoolId);
    const wanted = snapshot.usage.campuses + (input.extraCampuses ?? 0);
    const plan = input.plan ?? PUBLISHED_PLANS.find(key => { const max = getPlanLimits(key).maxCampuses; return max < 0 || max >= wanted; }) ?? null;
    if (!plan) return write("subscription.preview", [], { campusesWanted: wanted }, BILLING_LINK, { operation: "subscription.preview", campusesWanted: wanted, fits: null, customPlanNeeded: true }, "read");
    const result = await previewPlanChange(ctx.user.schoolId, plan, period(input.billingPeriod));
    const fits = result.proposedCapacity.campuses < 0 || result.proposedCapacity.campuses >= wanted;
    return write("subscription.preview", [], { campusesWanted: wanted, campusesAllowed: result.proposedCapacity.campuses }, BILLING_LINK, { operation: "subscription.preview", campusesWanted: wanted, fits, ...result }, "read");
  },
});

// ─── readiness.view (A, read, per campus) ─────────────────────────────────

const readinessInput = z.strictObject({
  /** One campus to look at; left out, every campus of the group (or the job's campus). */
  campus: z.string().trim().min(1).max(120).optional(),
  campusId: ID.optional(),
});
type ReadinessInput = z.infer<typeof readinessInput>;
type SeatState = "ACTIVE" | "INVITED" | "MISSING";

async function campusReadiness(ctx: CapabilityContext, campus: CampusRow) {
  const schoolId = ctx.user.schoolId, campusId = campus.id;
  const seat = async (roleList: UserRole[]): Promise<SeatState> => {
    if (await prisma.user.count({ where: { schoolId, campusId, isActive: true, role: { in: roleList } } })) return "ACTIVE";
    return (await prisma.staffInvitation.count({ where: { schoolId, campusId, status: "pending", role: { in: roleList } } })) ? "INVITED" : "MISSING";
  };
  const [cycles, weekends, classes, withTeacher, teachers, students, campusAdmin, principal] = await Promise.all([
    prisma.academicCycle.count({ where: { schoolId, campusId, status: "ACTIVE" } }),
    prisma.weekend.count({ where: { schoolId, campusId } }),
    prisma.class.count({ where: { schoolId, campusId, archivedAt: null } }),
    prisma.class.count({ where: { schoolId, campusId, archivedAt: null, classTeacherId: { not: null } } }),
    prisma.user.count({ where: { schoolId, campusId, isActive: true, role: "TEACHER" } }),
    prisma.student.count({ where: { schoolId, campusId, archivedAt: null } }),
    seat(["CAMPUS_ADMIN", "ADMIN"]),
    seat(["PRINCIPAL"]),
  ]);
  const missing = [
    ...(cycles ? [] : ["NO_ACTIVE_YEAR"]), ...(weekends ? [] : ["NO_WEEKEND"]), ...(campusAdmin === "MISSING" ? ["NO_CAMPUS_ADMIN"] : []), ...(principal === "MISSING" ? ["NO_PRINCIPAL"] : []),
    ...(classes ? [] : ["NO_CLASSES"]), ...(classes && withTeacher < classes ? ["CLASSES_WITHOUT_TEACHER"] : []), ...(teachers ? [] : ["NO_TEACHERS"]), ...(students ? [] : ["NO_STUDENTS"]),
  ];
  return { campusId, name: campus.name, activeYear: cycles > 0, weekend: weekends > 0, campusAdmin, principal, classes, classesWithTeacher: withTeacher, teachers, students, missing, ready: missing.length === 0 };
}

const READINESS_VIEW = defineCapability<ReadinessInput>({
  key: "readiness.view", version: 1, cluster: "C8", inventoryKeys: ["readiness.view"], risk: "READ", roles: GROUP, class: "A",
  input: readinessInput, evidence: [], humanFields: ["campusId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Check campus readiness", "See, campus by campus, what is still missing before going live: academic year, weekend, leaders, classes, teachers and pupils, with the group checklist.", "Which campuses are behind on setup and what's missing at each?"],
    ["جاهزية الفروع", "اعرف لكل فرع ما ينقصه قبل التشغيل: العام الدراسي والعطلة والقيادة والفصول والمعلمون والطلاب، مع قائمة المجموعة.", "أي الفروع متأخرة في الإعداد وما الذي ينقص كلاً منها؟"],
    ["کیمپس کی تیاری دیکھیں", "ہر کیمپس کے لیے دیکھیں کہ شروع کرنے سے پہلے کیا باقی ہے: تعلیمی سال، چھٹی، قیادت، کلاسیں، اساتذہ اور طلبہ، گروپ کی فہرست کے ساتھ۔", "کون سے کیمپس سیٹ اپ میں پیچھے ہیں اور ہر ایک میں کیا کمی ہے؟"],
  ),
  idempotency: { mode: "convergent" },
  source: { route: "GET /api/readiness", service: "src/lib/readiness/service.ts:readinessView", reuse: "direct" },
  async resolve(ctx, input) {
    if (!input.campus && !input.campusId) return input;
    const campus = await oneCampus(ctx, input.campus ?? "", "/campus", input.campusId);
    return { ...input, campus: campus.name, campusId: campus.id };
  },
  async execute(ctx, input) {
    groupOwner(ctx);
    const rows = await liveCampuses(ctx);
    const targets = input.campus || input.campusId ? [await oneCampus(ctx, input.campus ?? "", "/campus", input.campusId)]
      : ctx.campusId ? rows.filter(row => row.id === ctx.campusId) : rows;
    if (ctx.campusId && !targets.length) throw new WorkflowError("SCOPE_DENIED");
    const group = await readinessView(ctx.user).catch(error => { if (error instanceof ApiError && error.status === 403) return null; throw error; });
    const campuses = [];
    for (const campus of targets) campuses.push(await campusReadiness(ctx, campus));
    const groupSummary = group && group.lead ? { status: group.readiness.status, ready: group.ready, nextRequired: group.nextRequired, failing: group.checks.filter(check => check.required && !check.passed).map(check => check.id), openTasks: group.tasks.filter(task => task.status === "OPEN").length } : null;
    return write("readiness.view", [], { campuses: campuses.length, behind: campuses.filter(row => !row.ready).length }, "/setup/readiness", { operation: "readiness.view", group: groupSummary, campuses }, "read");
  },
});

// ─── staff.leader_invite_prepare (B) ──────────────────────────────────────

const LEADER_ROLES = ["CAMPUS_ADMIN", "PRINCIPAL"] as const;
const leaderInput = z.strictObject({
  campus: z.string().trim().min(1).max(120),
  campusId: ID.optional(),
  role: z.enum(LEADER_ROLES),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().max(254).email(),
});
type LeaderInput = z.infer<typeof leaderInput>;
const ROLE_NAMES: Record<(typeof LEADER_ROLES)[number], L10n> = { CAMPUS_ADMIN: l("Campus admin", "مدير الفرع", "کیمپس ایڈمن"), PRINCIPAL: l("Principal", "المدير الأكاديمي", "پرنسپل") };

/** The checks createStaffInvitation makes, asked first so the step explains a refusal instead of a 409. */
async function leaderSeat(ctx: CapabilityContext, input: LeaderInput, campus: CampusRow) {
  const schoolId = ctx.user.schoolId, email = input.email.toLowerCase();
  const pending = await prisma.staffInvitation.findFirst({ where: { schoolId, status: "pending", email: { equals: email, mode: "insensitive" } }, select: { id: true, role: true, campusId: true } });
  if (pending) {
    if (pending.role === input.role && pending.campusId === campus.id) return { pending };
    throw new WorkflowError("DOMAIN_REFUSED", { reason: "INVITATION_PENDING_ELSEWHERE" });
  }
  if (await prisma.user.count({ where: { schoolId, isActive: true, email: { equals: email, mode: "insensitive" } } })) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EMAIL_HAS_ACCESS" });
  // One principal per campus; the group admin may add a deputy campus admin beside an existing one.
  if (input.role === "PRINCIPAL") {
    const taken = await prisma.user.count({ where: { schoolId, campusId: campus.id, isActive: true, role: "PRINCIPAL" } }) + await prisma.staffInvitation.count({ where: { schoolId, campusId: campus.id, status: "pending", role: "PRINCIPAL" } });
    if (taken) throw new WorkflowError("DOMAIN_REFUSED", { reason: "LEADER_SEAT_TAKEN" });
  }
  return { pending: null };
}

const LEADER_PREPARE = defineCapability<LeaderInput>({
  key: "staff.leader_invite_prepare", version: 1, cluster: "C2", inventoryKeys: ["staff.invite"], risk: "CREATE", roles: GROUP, class: "B",
  input: leaderInput, evidence: ["/campus", "/fullName", "/email"], humanFields: ["campusId"],
  gates: groupGates(predicate("isInstitutionAuthority", isInstitutionAuthority, GROUP)), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Prepare a leader invitation", "Prepare the campus admin or principal invitation for one campus. Nothing is emailed: you send it yourself from People & access with two-step sign-in.", "Make Sana Malik (sana@example.com) the campus admin of Johar Town"],
    ["تجهيز دعوة قيادي", "جهّز دعوة مدير الفرع أو المدير الأكاديمي لفرع واحد. لا يُرسل بريد: ترسلها بنفسك من شاشة الأشخاص والصلاحيات بالتحقق الثنائي.", "اجعل سارة (sara@example.com) مديرة فرع العليا"],
    ["قیادت کا دعوت نامہ تیار کریں", "کسی ایک کیمپس کے کیمپس ایڈمن یا پرنسپل کا دعوت نامہ تیار کریں۔ کوئی ای میل نہیں جاتی: آپ خود دو مرحلہ سائن اِن کے ساتھ لوگ اور رسائی سے بھیجیں گے۔", "ثناء ملک (sana@example.com) کو جوہر ٹاؤن کی کیمپس ایڈمن بنا دیں"],
  ),
  idempotency: { mode: "natural" },
  source: { route: "POST /api/staff", service: "src/lib/staff/invitation-write.ts:createStaffInvitation (saved unsent)", reuse: "wrapper" },
  async resolve(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    await leaderSeat(ctx, input, campus);
    return { ...input, email: input.email.toLowerCase(), campus: campus.name, campusId: campus.id };
  },
  async preview(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    const { pending } = await leaderSeat(ctx, input, campus);
    return {
      title: `${say(ctx, l("Prepare a leader invitation", "تجهيز دعوة قيادي", "قیادت کا دعوت نامہ تیار کریں"))} · ${campus.name}`,
      lines: [
        { label: say(ctx, l("Person", "الشخص", "شخص")), value: `${input.fullName} · ${input.email.toLowerCase()}` },
        { label: say(ctx, l("Role", "الدور", "عہدہ")), value: say(ctx, ROLE_NAMES[input.role]) },
        { label: say(ctx, l("Campus", "الفرع", "کیمپس")), value: campus.name },
        { label: say(ctx, l("Sending", "الإرسال", "بھیجنا")), value: pending ? say(ctx, l("Already prepared; nothing is added.", "مجهزة مسبقاً؛ لن يُضاف شيء.", "پہلے سے تیار ہے؛ کچھ شامل نہیں ہوگا۔")) : say(ctx, l("Not sent. You send it from People & access with two-step sign-in.", "لا تُرسل الآن. ترسلها من الأشخاص والصلاحيات بالتحقق الثنائي.", "ابھی نہیں بھیجا جائے گا۔ آپ لوگ اور رسائی سے دو مرحلہ سائن اِن کے ساتھ بھیجیں گے۔")) },
      ],
      counts: { invitations: pending ? 0 : 1 },
      confirmLabel: say(ctx, l("Prepare invitation", "تجهيز الدعوة", "دعوت نامہ تیار کریں")),
      basis: { input, campusId: campus.id, pending: pending?.id ?? null },
    };
  },
  async execute(ctx, input) {
    const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
    const { pending } = await leaderSeat(ctx, input, campus);
    if (pending) return write("staff.leader_invite_prepare", [{ model: "staffInvitation", id: pending.id }], { invitations: 0 }, ACCESS_LINK, { reconciled: true, delivery: "NOT_SENT", next: "staff.leader_invite_send" }, "draft");
    const invite = await createStaffInvitation(ctx.user, { email: input.email.toLowerCase(), fullName: input.fullName, role: input.role, campusId: campus.id, profile: { fullName: input.fullName } });
    return write("staff.leader_invite_prepare", [{ model: "staffInvitation", id: invite.id }], { invitations: 1 }, ACCESS_LINK, { delivery: "NOT_SENT", role: input.role, campusId: campus.id, next: "staff.leader_invite_send" }, "draft");
  },
});

// ─── staff.leader_invite_send (C) ─────────────────────────────────────────

const leaderSendInput = z.strictObject({
  campus: z.string().trim().min(1).max(120).optional(),
  campusId: ID.optional(),
  role: z.enum(LEADER_ROLES).optional(),
  /** The invitees by name or email; left out, every unsent leader invitation (of the campus, when named). */
  people: z.array(z.string().trim().min(2).max(254)).min(1).max(50).optional(),
});
type LeaderSendInput = z.infer<typeof leaderSendInput>;
type Invite = { id: string; email: string; role: string; campusId: string; profile: unknown };
const inviteName = (invite: Invite) => (invite.profile && typeof invite.profile === "object" && typeof (invite.profile as { fullName?: unknown }).fullName === "string" ? (invite.profile as { fullName: string }).fullName : null);

async function unsentLeaderInvites(ctx: CapabilityContext, input: LeaderSendInput) {
  groupOwner(ctx);
  const campus = input.campus || input.campusId ? await oneCampus(ctx, input.campus ?? "", "/campus", input.campusId) : null;
  const rows: Invite[] = await prisma.staffInvitation.findMany({
    where: { schoolId: ctx.user.schoolId, status: "pending", deliveryStatus: "unknown", role: input.role ? input.role : { in: [...LEADER_ROLES] }, ...(campus ? { campusId: campus.id } : ctx.campusId ? { campusId: ctx.campusId } : {}) },
    select: { id: true, email: true, role: true, campusId: true, profile: true }, orderBy: { createdAt: "asc" },
  });
  if (!input.people) return rows;
  return input.people.map((said, index) => {
    const byEmail = rows.filter(row => row.email.toLowerCase() === said.toLowerCase());
    const found = byEmail.length ? byEmail : matchName(rows, said, row => [inviteName(row)]);
    if (found.length === 1) return found[0];
    throw new InputRequired([{ pointer: `/people/${index}`, promptKey: found.length ? "INVITATION_AMBIGUOUS" : "INVITATION_UNSENT_NOT_FOUND", options: found.slice(0, 8).map(row => ({ value: row.email, label: `${inviteName(row) ?? row.email} · ${row.role}` })) }]);
  });
}

const LEADER_SEND = defineCapability<LeaderSendInput>({
  key: "staff.leader_invite_send", version: 1, cluster: "C2", inventoryKeys: ["staff.invite"], risk: "COMMUNICATION", roles: GROUP, class: "C",
  input: leaderSendInput, evidence: [], humanFields: ["campusId"],
  gates: groupGates(predicate("isInstitutionAuthority", isInstitutionAuthority, GROUP)), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Send leader invitations", "Open People & access with your prepared campus admin and principal invitations picked out. You send them yourself with two-step sign-in; each person then sets their own password.", "Send the leader invitations for Johar Town"],
    ["إرسال دعوات القيادة", "يفتح الأشخاص والصلاحيات مع دعوات مديري الفروع والمديرين الأكاديميين المجهزة. ترسلها بنفسك بالتحقق الثنائي، ثم يضع كل شخص كلمة مروره.", "أرسل دعوات القيادة لفرع العليا"],
    ["قیادت کے دعوت نامے بھیجیں", "لوگ اور رسائی کی اسکرین تیار شدہ کیمپس ایڈمن اور پرنسپل دعوت ناموں کے ساتھ کھولیں۔ آپ خود دو مرحلہ سائن اِن کے ساتھ بھیجیں؛ ہر شخص اپنا پاس ورڈ خود بنائے گا۔", "جوہر ٹاؤن کی قیادت کے دعوت نامے بھیج دیں"],
  ),
  source: { route: "PUT /api/staff", service: "src/app/actions/invite.ts:resendInvitation (from People & access)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    if (!(await unsentLeaderInvites(ctx, input)).length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_UNSENT_INVITATIONS" });
    return input;
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const rows = await unsentLeaderInvites(ctx, input);
      if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_UNSENT_INVITATIONS" });
      // Nothing is emailed here; the owner sends from the screen with two-step sign-in. Only ids and roles leave the domain.
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: ACCESS_LINK, prefill: { capability: "staff.leader_invite_send", inviteIds: rows.map(row => row.id), roles: [...new Set(rows.map(row => row.role))], count: rows.length }, detail: { mfaRequired: true, mfaVerified: ctx.user.mfaVerified === true } };
    },
  },
});

// ─── group_policy.review_version (C) ──────────────────────────────────────

const reviewInput = z.strictObject({
  template: z.string().trim().min(1).max(120),
  templateId: ID.optional(),
  decision: z.enum(["APPROVE", "RETURN"]).optional(),
});
type ReviewInput = z.infer<typeof reviewInput>;
async function versionInReview(ctx: CapabilityContext, input: ReviewInput) {
  const template = await groupTemplate(ctx, input.template, "/template", input.templateId);
  const version = await prisma.policyTemplateVersion.findFirst({ where: { schoolId: ctx.user.schoolId, templateId: template.id, status: "IN_REVIEW" }, orderBy: { version: "desc" }, select: { id: true, version: true, reviewerId: true, submittedById: true, effectiveFrom: true } });
  if (!version) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_VERSION_IN_REVIEW" });
  return { template, version };
}

const POLICY_REVIEW = defineCapability<ReviewInput>({
  key: "group_policy.review_version", version: 1, cluster: "C5", inventoryKeys: ["group_policy.review_version"], risk: "APPROVAL_DECISION", roles: GROUP, class: "C",
  input: reviewInput, evidence: ["/template"], humanFields: ["templateId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Review a group standard", "Open the version waiting for review in Group standards. You see its impact on every campus there and approve it or return it to draft yourself.", "Open the grading standard waiting for my review"],
    ["مراجعة معيار المجموعة", "يفتح النسخة المنتظرة في معايير المجموعة؛ ترى أثرها على كل فرع وتوافق أو تعيدها مسودة بنفسك.", "افتح معيار التقييم الذي ينتظر مراجعتي"],
    ["گروپ معیار کا جائزہ", "گروپ معیارات میں جائزے کا منتظر ورژن کھولیں۔ ہر کیمپس پر اس کا اثر وہیں دیکھ کر آپ خود منظور کریں یا مسودے میں واپس کریں۔", "میرے جائزے کا منتظر گریڈنگ معیار کھولیں"],
  ),
  source: { route: "POST /api/group-policy (action=review)", service: "src/lib/group-policy/service.ts:review (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const { template } = await versionInReview(ctx, input); return { ...input, template: template.title, templateId: template.id }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { version } = await versionInReview(ctx, input);
      const selfReview = version.submittedById === ctx.user.userId;
      return {
        kind: "DOMAIN_SCREEN", targetRoles: version.reviewerId === ctx.user.userId ? [] : GROUP, link: `${STANDARDS_LINK}&versionId=${encodeURIComponent(version.id)}`,
        prefill: { versionId: version.id, ...(input.decision ? { decision: input.decision } : {}) },
        detail: { namedReviewer: version.reviewerId === ctx.user.userId, selfReview, reasonRequired: selfReview, version: version.version },
      };
    },
  },
});

// ─── group_policy.decide_override (C) ─────────────────────────────────────

const overrideInput = z.strictObject({
  /** The campus that asked (RT13: one campus). */
  campus: z.string().trim().min(1).max(120),
  campusId: ID.optional(),
  /** The setting as the user named it ("weekend", "pass mark"); left out when the campus has one request. */
  setting: z.string().trim().min(2).max(80).optional(),
  decision: z.enum(["APPROVE", "DECLINE"]).optional(),
  note: z.string().trim().max(500).optional(),
});
type OverrideInput = z.infer<typeof overrideInput>;
const ALL_KEY_LABELS = Object.values(POLICY_KEYS).flatMap(domain => Object.entries(domain).map(([key, spec]) => ({ key, label: spec.label })));
async function pendingOverride(ctx: CapabilityContext, input: OverrideInput) {
  const campus = await oneCampus(ctx, input.campus, "/campus", input.campusId);
  const rows = await prisma.policyOverride.findMany({ where: { schoolId: ctx.user.schoolId, campusId: campus.id, status: "PENDING" }, select: { id: true, key: true, requestedById: true, validUntil: true }, orderBy: { createdAt: "asc" } });
  const wanted = input.setting ? fold(input.setting) : "";
  const keys = wanted ? new Set(ALL_KEY_LABELS.filter(row => fold(row.label).includes(wanted) || fold(row.key).includes(wanted.replace(/ /g, "")) || wanted.includes(fold(row.label))).map(row => row.key)) : null;
  const found = keys ? rows.filter(row => keys.has(row.key)) : rows;
  if (found.length === 1) return { campus, override: found[0] };
  if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PENDING_OVERRIDE" });
  throw new InputRequired([{ pointer: "/setting", promptKey: "POLICY_OVERRIDE_CHOICE", options: (found.length ? found : rows).slice(0, 8).map(row => ({ value: ALL_KEY_LABELS.find(item => item.key === row.key)?.label ?? row.key, label: `${ALL_KEY_LABELS.find(item => item.key === row.key)?.label ?? row.key} · ${row.validUntil.toISOString().slice(0, 10)}` })) }]);
}

const POLICY_OVERRIDE = defineCapability<OverrideInput>({
  key: "group_policy.decide_override", version: 1, cluster: "C5", inventoryKeys: ["group_policy.decide_override"], risk: "APPROVAL_DECISION", roles: GROUP, class: "C",
  input: overrideInput, evidence: ["/campus"], humanFields: ["campusId"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Decide a campus exception", "Open Approvals on one campus's request to differ from a group standard. You see the value, reason and dates there and approve or decline it yourself.", "North campus asked to change its weekend for Ramadan — approve it till Eid"],
    ["البت في استثناء فرع", "يفتح الموافقات على طلب فرع واحد للاختلاف عن معيار المجموعة؛ ترى القيمة والسبب والتواريخ وتقرر بنفسك.", "فرع الشمال طلب تغيير عطلته في رمضان — وافق حتى العيد"],
    ["کیمپس کی رعایت کا فیصلہ", "کسی ایک کیمپس کی گروپ معیار سے مختلف رہنے کی درخواست پر منظوری کی اسکرین کھولیں۔ قدر، وجہ اور تاریخیں وہیں دیکھ کر آپ خود منظور یا مسترد کریں۔", "نارتھ کیمپس نے رمضان کے لیے چھٹی بدلنے کو کہا ہے — عید تک منظور کر دیں"],
  ),
  source: { route: "POST /api/group-policy (action=decide-override)", service: "src/lib/group-policy/service.ts:decideOverride (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const { campus } = await pendingOverride(ctx, input); return { ...input, campus: campus.name, campusId: campus.id }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { override } = await pendingOverride(ctx, input);
      const own = override.requestedById === ctx.user.userId;
      return {
        kind: "DOMAIN_SCREEN", targetRoles: own ? GROUP : [], link: `${APPROVALS_LINK}&tab=policy&overrideId=${encodeURIComponent(override.id)}`,
        prefill: { overrideId: override.id, ...(input.decision ? { decision: input.decision } : {}), ...(input.note ? { note: input.note } : {}) },
        detail: { key: override.key, anotherAdminMustDecide: own },
      };
    },
  },
});

// ─── memberships.change_access (C) ────────────────────────────────────────

const ACCESS_ROLES = ["CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
const accessInput = z.strictObject({
  person: z.string().trim().min(2).max(254),
  change: z.enum(["ALLOW_MEMBERSHIP_MANAGEMENT", "REMOVE_MEMBERSHIP_MANAGEMENT", "MOVE_CAMPUS", "CHANGE_ROLE", "REACTIVATE"]),
  /** MOVE_CAMPUS: the campus to move to; otherwise the person's campus, to tell two people apart. */
  campus: z.string().trim().min(1).max(120).optional(),
  role: z.enum(ACCESS_ROLES).optional(),
  reason: z.string().trim().min(10).max(500).optional(),
});
type AccessInput = z.infer<typeof accessInput>;
async function accessTarget(ctx: CapabilityContext, input: AccessInput) {
  groupOwner(ctx);
  const moving = input.change === "MOVE_CAMPUS";
  if (moving && !input.campus) throw new InputRequired([{ pointer: "/campus", promptKey: "CAMPUS_NOT_FOUND" }]);
  if (input.change === "CHANGE_ROLE" && !input.role) throw new InputRequired([{ pointer: "/role", promptKey: "ROLE_REQUIRED" }]);
  const campus = input.campus ? await oneCampus(ctx, input.campus, "/campus") : null;
  const person = await schoolMember(ctx, input.person, "/person", { campusId: moving ? (ctx.campusId ?? null) : campus?.id ?? ctx.campusId, activeOnly: input.change !== "REACTIVATE" });
  return { person, campus };
}

const MEMBERSHIP_ACCESS = defineCapability<AccessInput>({
  key: "memberships.change_access", version: 1, cluster: "C2", inventoryKeys: ["memberships.change_access"], risk: "ACCESS_GRANT", roles: GROUP, class: "C",
  input: accessInput, evidence: ["/person"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Change someone's access", "Open People & access on one person with the change filled in: managing their campus's staff, a move to another campus, a new role or reactivation. You review and confirm it yourself with two-step sign-in.", "Let the Gulberg campus admin invite their own teachers"],
    ["تغيير صلاحيات شخص", "يفتح الأشخاص والصلاحيات على شخص واحد مع التغيير معبأً: إدارة موظفي فرعه أو النقل لفرع آخر أو دور جديد أو إعادة التفعيل. تراجع وتؤكد بنفسك بالتحقق الثنائي.", "اسمح لمدير فرع العليا بدعوة معلميه"],
    ["کسی کی رسائی بدلیں", "لوگ اور رسائی کی اسکرین ایک شخص پر تبدیلی کے ساتھ کھولیں: اپنے کیمپس کا عملہ سنبھالنا، دوسرے کیمپس منتقلی، نیا عہدہ یا دوبارہ فعال کرنا۔ آپ دو مرحلہ سائن اِن کے ساتھ خود جائزہ لے کر تصدیق کریں۔", "گلبرگ کی کیمپس ایڈمن کو اپنے اساتذہ خود بلانے کی اجازت دیں"],
  ),
  source: { route: "PUT /api/memberships", service: "src/app/api/memberships/route.ts (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const { person } = await accessTarget(ctx, input); return { ...input, person: person.email }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const { person, campus } = await accessTarget(ctx, input);
      const next = {
        role: input.change === "CHANGE_ROLE" ? input.role! : person.role,
        campusId: input.change === "MOVE_CAMPUS" ? campus!.id : person.campusId,
        canManageMemberships: input.change === "ALLOW_MEMBERSHIP_MANAGEMENT" ? true : input.change === "REMOVE_MEMBERSHIP_MANAGEMENT" ? false : person.canManageMemberships,
        canPurchaseSubscription: person.canPurchaseSubscription,
        isActive: input.change === "REACTIVATE" ? true : person.isActive,
      };
      return {
        kind: "DOMAIN_SCREEN", targetRoles: [], link: `${ACCESS_LINK}&userId=${encodeURIComponent(person.id)}`,
        prefill: { userId: person.id, expectedVersion: person.accessVersion, ...next, ...(input.reason ? { reason: input.reason } : {}) },
        detail: { change: input.change, mfaRequired: true, mfaVerified: ctx.user.mfaVerified === true, signsOutEverywhere: true },
      };
    },
  },
});

// ─── staff.deactivate (C) ─────────────────────────────────────────────────

const deactivateInput = z.strictObject({
  person: z.string().trim().min(2).max(254),
  /** The person's campus, to tell two people apart (RT13: one campus). */
  campus: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().min(5).max(500).optional(),
});
type DeactivateInput = z.infer<typeof deactivateInput>;
async function deactivateTarget(ctx: CapabilityContext, input: DeactivateInput) {
  groupOwner(ctx);
  const campus = input.campus ? await oneCampus(ctx, input.campus, "/campus") : null;
  return schoolMember(ctx, input.person, "/person", { campusId: campus?.id ?? ctx.campusId, activeOnly: true });
}

const STAFF_DEACTIVATE = defineCapability<DeactivateInput>({
  key: "staff.deactivate", version: 1, cluster: "C2", inventoryKeys: ["staff.deactivate"], risk: "DESTRUCTIVE", roles: GROUP, class: "C",
  input: deactivateInput, evidence: ["/person"],
  gates: groupGates(), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Stop someone's access", "Open People & access on one staff member to deactivate them. You confirm it yourself; they are signed out everywhere and their records stay.", "Block Ahmed's access at the North campus now"],
    ["إيقاف دخول شخص", "يفتح الأشخاص والصلاحيات على موظف واحد لإيقافه. تؤكد بنفسك؛ يُسجَّل خروجه من كل الأجهزة وتبقى سجلاته.", "أوقف دخول أحمد في فرع الشمال فوراً"],
    ["کسی کی رسائی بند کریں", "کسی ایک ملازم کو غیر فعال کرنے کے لیے لوگ اور رسائی کی اسکرین کھولیں۔ تصدیق آپ خود کریں گے؛ وہ ہر جگہ سے سائن آؤٹ ہوں گے اور ریکارڈ محفوظ رہے گا۔", "نارتھ کیمپس پر احمد کی رسائی ابھی بند کر دیں"],
  ),
  source: { route: "PATCH /api/staff", service: "src/app/actions/invite.ts:removeStaff (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const person = await deactivateTarget(ctx, input); return { ...input, person: person.email }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const person = await deactivateTarget(ctx, input);
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: `${ACCESS_LINK}&userId=${encodeURIComponent(person.id)}`, prefill: { userId: person.id, action: "deactivate", ...(input.reason ? { reason: input.reason } : {}) }, detail: { role: person.role, signsOutEverywhere: true, recordsKept: true } };
    },
  },
});

// ─── subscription.request_plan_change (C) ─────────────────────────────────

const planChangeInput = z.strictObject({
  plan: z.enum(PUBLISHED_PLANS),
  billingPeriod: z.enum(["MONTHLY", "ANNUAL"]).optional(),
  reason: z.string().trim().max(1000).optional(),
});
type PlanChangeInput = z.infer<typeof planChangeInput>;

const PLAN_CHANGE = defineCapability<PlanChangeInput>({
  key: "subscription.request_plan_change", version: 1, cluster: "C6", inventoryKeys: ["subscription.request_plan_change"], risk: "FINANCIAL", roles: GROUP, class: "C",
  input: planChangeInput, evidence: ["/plan"],
  gates: groupGates(SUBSCRIPTION_GATE), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Ask for a plan change", "Open Billing & plan with the plan filled in. You send the request yourself; SkooleeAI reviews it before anything is charged.", "Request the Pro plan so we can open more campuses"],
    ["طلب تغيير الباقة", "يفتح الفوترة والباقة مع الباقة معبأة. ترسل الطلب بنفسك، وتراجعه SkooleeAI قبل أي خصم.", "اطلب باقة Pro لنفتح فروعاً أكثر"],
    ["پلان بدلنے کی درخواست", "بلنگ اور پلان کی اسکرین منتخب پلان کے ساتھ کھولیں۔ درخواست آپ خود بھیجیں گے؛ رقم کٹنے سے پہلے SkooleeAI اس کا جائزہ لے گا۔", "مزید کیمپس کے لیے پرو پلان کی درخواست کریں"],
  ),
  source: { route: "POST /api/billing/lifecycle (action=request-change)", service: "src/lib/billing/lifecycle.ts:saveSubscriptionRequest (sent from Billing & plan)", reuse: "handoff-only" },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      groupOwner(ctx);
      if (!canOwnSubscription(ctx.user)) throw new WorkflowError("ROLE_NOT_ALLOWED");
      // A read only: the owner sees the same comparison on the screen before sending the request.
      const comparison = await previewPlanChange(ctx.user.schoolId, input.plan, period(input.billingPeriod));
      return {
        kind: "DOMAIN_SCREEN", targetRoles: [], link: `${BILLING_LINK}&plan=${input.plan}&period=${period(input.billingPeriod)}`,
        prefill: { action: "request-change", plan: input.plan, billingPeriod: period(input.billingPeriod), ...(input.reason ? { reason: input.reason } : {}) },
        detail: { currentPlan: comparison.currentPlan, proposedPlan: comparison.proposedPlan, proposedAmount: comparison.proposedAmount, priceCurrency: comparison.priceCurrency, overages: comparison.overages, platformReview: true },
      };
    },
  },
});

// ─── governance.support_grant_decide (C) ──────────────────────────────────

const supportInput = z.strictObject({
  /** The request as the user described it (its reference, or words of its purpose); left out when only one waits. */
  request: z.string().trim().min(2).max(200).optional(),
  decision: z.enum(["APPROVE", "REJECT"]).optional(),
});
type SupportInput = z.infer<typeof supportInput>;
async function pendingGrant(ctx: CapabilityContext, input: SupportInput) {
  groupOwner(ctx);
  const rows = await prisma.supportGrant.findMany({ where: { schoolId: ctx.user.schoolId, status: "pending" }, select: { id: true, purpose: true, expiresAt: true, incident: { select: { reference: true, purpose: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PENDING_SUPPORT_REQUEST" });
  const wanted = input.request ? fold(input.request) : "";
  const found = wanted ? rows.filter(row => fold(row.incident.reference) === wanted || fold(`${row.purpose} ${row.incident.purpose}`).includes(wanted) || wanted.split(" ").filter(word => word.length > 3).every(word => fold(`${row.purpose} ${row.incident.purpose}`).includes(word))) : rows;
  if (found.length === 1) return found[0];
  throw new InputRequired([{ pointer: "/request", promptKey: "SUPPORT_REQUEST_CHOICE", options: (found.length ? found : rows).slice(0, 8).map(row => ({ value: row.incident.reference, label: `${row.incident.reference} · ${row.purpose.slice(0, 80)}` })) }]);
}

const SUPPORT_DECIDE = defineCapability<SupportInput>({
  key: "governance.support_grant_decide", version: 1, cluster: "C8", inventoryKeys: ["governance.support_grant_decide"], risk: "APPROVAL_DECISION", roles: GROUP, class: "C",
  input: supportInput, evidence: [],
  gates: groupGates(predicate("isInstitutionAuthority", isInstitutionAuthority, GROUP)), scope: { kind: "any-campus-of-school" },
  copy: c(
    ["Decide a support access request", "Open Approvals on SkooleeAI support's request to see your records. You check its purpose, scope and end time there and approve or reject it yourself with two-step sign-in.", "Skoolee support asked to see Model Town's fee setup — approve it for one day"],
    ["البت في طلب دخول الدعم", "يفتح الموافقات على طلب دعم SkooleeAI للاطلاع على سجلاتك؛ تراجع الغرض والنطاق وموعد الانتهاء وتوافق أو ترفض بنفسك بالتحقق الثنائي.", "طلب دعم Skoolee الاطلاع على إعداد رسوم فرع النخيل — وافق ليوم واحد"],
    ["سپورٹ رسائی کی درخواست کا فیصلہ", "SkooleeAI سپورٹ کی ریکارڈ دیکھنے کی درخواست پر منظوری کی اسکرین کھولیں۔ مقصد، دائرہ اور ختم ہونے کا وقت وہیں دیکھ کر آپ خود دو مرحلہ سائن اِن کے ساتھ منظور یا مسترد کریں۔", "اسکولی سپورٹ ماڈل ٹاؤن کی فیس سیٹ اپ دیکھنا چاہتی ہے — ایک دن کے لیے منظور کر دیں"],
  ),
  source: { route: "PATCH /api/super/support-grants", service: "src/app/api/super/support-grants/route.ts (decided on the screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const grant = await pendingGrant(ctx, input); return { ...input, request: grant.incident.reference }; },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const grant = await pendingGrant(ctx, input);
      return {
        kind: "DOMAIN_SCREEN", targetRoles: [], link: `${APPROVALS_LINK}&tab=support&grantId=${encodeURIComponent(grant.id)}`,
        prefill: { grantId: grant.id, ...(input.decision ? { decision: input.decision === "APPROVE" ? "approve" : "reject" } : {}) },
        detail: { reference: grant.incident.reference, expiresAt: grant.expiresAt.toISOString(), mfaRequired: true, mfaVerified: ctx.user.mfaVerified === true },
      };
    },
  },
});

export const GROUP_ENTRIES: readonly CapabilityEntry[] = [
  CAMPUS_CREATE, CAMPUS_UPDATE, POLICY_TEMPLATE, POLICY_DRAFT, POLICY_SUBMIT, IDENTITY_DOMAIN, LEADER_PREPARE,
  SUBSCRIPTION_PREVIEW, READINESS_VIEW,
  POLICY_REVIEW, POLICY_OVERRIDE, MEMBERSHIP_ACCESS, PLAN_CHANGE, STAFF_DEACTIVATE, SUPPORT_DECIDE, LEADER_SEND,
];
