import { createHash } from "node:crypto";
import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { canManageCampusOps, canManageFrontDesk } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { zonedInstant } from "@/lib/meetings/time";
import type { PermissionAction, PermissionModule } from "@/lib/permissions";
import { checkIn, checkOut, normalName } from "@/lib/front-desk/visitors";
import { actOnCallback, ownerCandidates } from "@/lib/front-desk/phone-calls";
import { logItem } from "@/lib/front-desk/postal";
import { intake, isLeader, visibleWhere } from "@/lib/front-desk/complaints";
import { KINDS, LANGUAGES, PAGE_SIZES, previewIssue, saveTemplate, usedVariables } from "@/lib/certificates/service";
import { createEnquiry, ENQUIRY_TABLE, updateEnquiry } from "@/lib/admissions/enquiries";
import { staffSaveAnswers, staffStart } from "@/lib/admissions/service";
import type { Answers, FormDefinition, IdentityField } from "@/lib/admissions/form-rules";
import { defineCapability } from "../../define";
import { ownCampus, permission, predicate, roles, seatVacantForOperator } from "../../gates";
import { InputRequired, WorkflowError, toWorkflowError } from "../../../errors";
import { mentionsCare } from "../../../pii/care-detector";
import { assignedClass, classLabel } from "../../../resolve/scope";
import { matchPupil, pupilLabel } from "../../../resolve/pupils";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * The receptionist's desk (Slice 6): visitors, post, callbacks, enquiries, applications, complaints and
 * documents. Every write calls the service its route calls (enquiries through the commands extracted from
 * /api/admission-queries). Operators (ADMIN, CAMPUS_ADMIN) hold the desk only while no receptionist is in post.
 *
 * - Names the user typed (visitors, callers, families, pupils, templates, colleagues) are matched here on the
 *   server. A namesake becomes a choice; the model never receives a register, a roster or a phone number list.
 * - A confidential complaint's receipt carries its reference code only: no names, no narrative, no entity id.
 *   Safeguarding concerns are never taken here; they belong to /care, typed by the person.
 * - Releasing a child, issuing a document, assigning a complaint and approving a template are class C: the AI
 *   opens the existing screen with the choice picked out and does nothing else.
 * - An enquiry has no idempotency key in its domain, so a replay reconciles only with an enquiry this same
 *   actor recorded (the audit CREATE the command writes in the same transaction), never a colleague's (RT17).
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (ctx: CapabilityContext, text: L10n, params: Record<string, string | number> = {}) => fill(text[ctx.locale] ?? text.en, params);
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const tail = (phone: string | null | undefined) => digits(phone).slice(-4);

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** A school-local day, or a day and time ("2026-10-26" or "2026-10-26T10:00"). */
const LOCAL = z.string().regex(/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/);
const NAME = z.string().trim().min(2).max(120);
const TEXT = (min: number, max: number) => z.string().trim().min(min).max(max);
const id = () => z.string().trim().min(1).max(64);

const DESK: readonly UserRole[] = ["RECEPTIONIST", "ADMIN", "CAMPUS_ADMIN"];
const LEADERS: readonly UserRole[] = ["CAMPUS_ADMIN", "ADMIN"];

/**
 * Front-desk routes: canManageFrontDesk (+ the module permission) on the actor's own campus. The role gate comes
 * first because canManageFrontDesk alone admits the principal and the super admin, who never hold this desk.
 */
const deskGates = (module: PermissionModule, action: PermissionAction) => [
  roles(DESK), predicate("canManageFrontDesk", canManageFrontDesk, DESK), permission(module, action), ownCampus(), seatVacantForOperator("receptionist", "RECEPTIONIST"),
];
/** Admissions routes: assertStaffRole + admissions.add/edit (the service adds canEdit). */
const admissionGates = (action: PermissionAction) => [roles(DESK), permission("admissions", action), ownCampus(), seatVacantForOperator("receptionist", "RECEPTIONIST")];
/** POST /api/pickup/gate: the service's isGate (campus operations or the receptionist); no module permission. */
const isGate = (user: AuthUser) => canManageCampusOps(user) || user.role === "RECEPTIONIST";
const gateGates = [roles(DESK), predicate("isGate", isGate, DESK), ownCampus(), seatVacantForOperator("receptionist", "RECEPTIONIST")];

function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}
const domain = (error: unknown): never => { throw toWorkflowError(error); };
/** Domain keys allow [A-Za-z0-9-]{8,80}; a longer engine key (questionnaire scope) is hashed, deterministically. */
const domainKey = (key: string) => /^[A-Za-z0-9-]{8,80}$/.test(key) ? key : `wf-${createHash("sha256").update(key).digest("hex").slice(0, 60)}`;

type Screen = "visitors" | "calls" | "post" | "complaints" | "certificates" | "pickup" | "enquiries" | "applications";
const RECEPTION: Record<Screen, string> = {
  visitors: "/receptionist?view=visitors", calls: "/receptionist?view=phone-calls", post: "/receptionist?view=postal", complaints: "/receptionist?view=complaints",
  certificates: "/receptionist?view=certificates", pickup: "/receptionist?view=pickup", enquiries: "/receptionist?view=admissions&tab=enquiries", applications: "/receptionist?view=admissions&tab=applications",
};
const OPERATOR: Record<Screen, string> = {
  visitors: "/admin?view=front-desk&tab=visitors", calls: "/admin?view=front-desk&tab=calls", post: "/admin?view=front-desk&tab=post", complaints: "/admin?view=front-desk&tab=complaints",
  certificates: "/admin?view=front-desk&tab=certificates", pickup: "/admin?view=pickup", enquiries: "/admin?view=admissions&tab=enquiries", applications: "/admin?view=admissions&tab=applications",
};
/** The existing screen in the console of whoever opens it. */
const link = (role: UserRole | null, screen: Screen) => (role === "RECEPTIONIST" ? RECEPTION : OPERATOR)[screen];

async function zoneOf(ctx: CapabilityContext) { return (await getLocalePackage(ctx.user.schoolId, ownCampusId(ctx))).timezone; }
const clock = (at: Date, timeZone: string) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
const localDay = (at: Date, timeZone: string) => calendarDateIn(timeZone, at);

/** Rows whose name the user said: exact (folded), then by word prefix. A "Name (detail)" answer narrows by detail. */
function byName<T>(rows: readonly T[], said: string, names: (row: T) => Array<string | null | undefined>, detail?: (row: T) => Array<string | null | undefined>): T[] {
  const narrowed = said.match(/^(.*?)\s*[(（]\s*(.+?)\s*[)）]\s*$/u);
  const text = narrowed ? narrowed[1] : said;
  const wanted = fold(text);
  if (!wanted) return [];
  const folded = (row: T) => names(row).filter((name): name is string => Boolean(name)).map(fold);
  let found = rows.filter(row => folded(row).includes(wanted));
  if (!found.length) {
    const parts = wanted.split(" ");
    found = rows.filter(row => folded(row).some(name => { const words = name.split(" "); return parts.every((part, index) => words[index]?.startsWith(part) || words.includes(part)); }));
  }
  if (narrowed && detail) {
    const hint = fold(narrowed[2]);
    const exact = found.filter(row => detail(row).some(value => value && fold(value) === hint));
    if (exact.length) return exact;
    const tailHint = digits(narrowed[2]);
    if (tailHint.length >= 3) { const byTail = found.filter(row => detail(row).some(value => value && digits(value).endsWith(tailHint))); if (byTail.length) return byTail; }
  }
  return found;
}
function one<T>(found: T[], pointer: string, notFound: string, ambiguous: string, option: (row: T) => { value: string; label: string }): T {
  if (found.length === 1) return found[0];
  throw new InputRequired([found.length
    ? { pointer, promptKey: ambiguous, params: { count: found.length }, options: found.slice(0, 8).map(option) }
    : { pointer, promptKey: notFound }]);
}

function write(capability: string, entities: Receipt["entities"], counts: Record<string, number>, link: string, detail: Record<string, unknown> = {}): Receipt {
  return { kind: "write", capability, entities, counts, link, replayed: false, detail };
}
const reconciledReceipt = (capability: string, entities: Receipt["entities"], link: string, detail: Record<string, unknown> = {}) => write(capability, entities, { created: 0 }, link, { reconciled: true, ...detail });

/** A colleague who may own front-office work on this campus (CAMPUS_ADMIN, ADMIN, RECEPTIONIST), by name. */
async function bindOwner(ctx: CapabilityContext, said: string, pointer: string) {
  const rows = await ownerCandidates(ctx.user, ownCampusId(ctx));
  return one(byName(rows, said, row => [row.fullName]), pointer, "OWNER_NOT_FOUND", "OWNER_AMBIGUOUS", row => ({ value: `${row.fullName} (${row.role})`, label: `${row.fullName} · ${row.role}` }));
}

// ─── front_desk.visitor_check_in ──────────────────────────────────────────

const checkInInput = z.strictObject({
  name: NAME,
  purpose: TEXT(2, 200),
  /** The host the visitor came to see ("the principal", "Mrs Siddiqui, Grade 3"). */
  toMeet: NAME,
  phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/).optional(),
  /** What tells two people of the same name apart: organisation or the last digits of an ID, never a full ID. */
  reference: z.string().trim().min(1).max(60).optional(),
  /** School-local arrival time today, when it was not just now. */
  arrivedAt: TIME.optional(),
});
type CheckInInput = z.infer<typeof checkInInput>;

async function onSiteNamesakes(ctx: CapabilityContext, name: string) {
  const rows = await prisma.visitorLog.findMany({ where: { schoolId: ctx.user.schoolId, campusId: ownCampusId(ctx), status: "ON_SITE" }, select: { id: true, name: true, phone: true, reference: true, toMeet: true, inTime: true } });
  return rows.filter(row => normalName(row.name) === normalName(name));
}

/** Mirrors checkIn's duplicate rules before anything is written: the same person twice is refused; a namesake asks. */
async function namesakeCheck(ctx: CapabilityContext, input: CheckInInput) {
  const same = await onSiteNamesakes(ctx, input.name);
  if (!same.length) return;
  const zone = await zoneOf(ctx);
  const label = (row: (typeof same)[number]) => `${row.name} · ${row.reference ?? "—"} · ${row.toMeet ?? "—"} · ${clock(row.inTime, zone)}`;
  // The answer names an on-site visit ("Ahmed Khan (Principal 10:30)"): that person is already here.
  if (input.reference && same.some(row => fold(label(row)) === fold(input.reference!) || fold(`${row.toMeet ?? ""} ${clock(row.inTime, zone)}`) === fold(input.reference!))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ALREADY_ON_SITE" });
  const identical = same.find(row => (input.phone && row.phone === input.phone) || (input.reference && row.reference && normalName(row.reference) === normalName(input.reference)));
  if (identical) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ALREADY_ON_SITE" });
  if (input.reference) return;
  // Another visitor of this name is on site and nothing tells them apart: is it one of these, or someone else?
  throw new InputRequired([{ pointer: "/reference", promptKey: "VISITOR_NAMESAKE", params: { count: same.length }, options: same.slice(0, 8).map(row => ({ value: `${row.toMeet ?? ""} ${clock(row.inTime, zone)}`.trim(), label: label(row) })) }]);
}

async function arrivalOf(ctx: CapabilityContext, arrivedAt: string | undefined) {
  if (!arrivedAt) return undefined;
  const zone = await zoneOf(ctx);
  return zonedInstant(localDay(ctx.now, zone), arrivedAt, zone);
}

const VISITOR_CHECK_IN = defineCapability<CheckInInput>({
  key: "front_desk.visitor_check_in", version: 1, cluster: "C7", inventoryKeys: ["front_desk.visitor_check_in"], risk: "CREATE", roles: DESK, class: "B",
  input: checkInInput, evidence: ["/name", "/purpose", "/toMeet"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Sign a visitor in", "Record a visitor arriving: who they are, why they came and whom they are seeing. A visitor record never allows collecting a child.", "Mr Khan is here to see the principal about his son's admission, sign him in"],
    ["تسجيل دخول زائر", "تسجيل وصول زائر: من هو ولماذا جاء ومن سيقابل. سجل الزائر لا يسمح أبداً باستلام طالب.", "السيد خان هنا لمقابلة المدير بخصوص قبول ابنه، سجّل دخوله"],
    ["مہمان کا اندراج", "آنے والے مہمان کا اندراج: کون ہے، کیوں آیا اور کس سے ملنا ہے۔ مہمان کا اندراج بچے کو لے جانے کی اجازت نہیں دیتا۔", "خان صاحب بیٹے کے داخلے کے سلسلے میں پرنسپل سے ملنے آئے ہیں، ان کا اندراج کر دیں"],
  ),
  idempotency: { mode: "native" }, source: { route: "POST /api/front-desk/visitors", service: "src/lib/front-desk/visitors.ts:checkIn", reuse: "direct" },
  async resolve(ctx, input) { ownCampusId(ctx); await namesakeCheck(ctx, input); return input; },
  async preview(ctx, input) {
    ownCampusId(ctx);
    const zone = await zoneOf(ctx);
    const arrival = (await arrivalOf(ctx, input.arrivedAt)) ?? ctx.now;
    return {
      title: say(ctx, l("Sign a visitor in", "تسجيل دخول زائر", "مہمان کا اندراج")),
      lines: [
        { label: say(ctx, l("Visitor", "الزائر", "مہمان")), value: input.reference ? `${input.name} · ${input.reference}` : input.name },
        { label: say(ctx, l("To meet", "لمقابلة", "ملاقات")), value: input.toMeet },
        { label: say(ctx, l("Purpose", "الغرض", "مقصد")), value: input.purpose },
        { label: say(ctx, l("Arrived", "الوصول", "آمد")), value: clock(arrival, zone) },
        ...(input.phone ? [{ label: say(ctx, l("Phone", "الهاتف", "فون")), value: `…${tail(input.phone)}` }] : []),
      ],
      counts: { visitors: 1 },
      confirmLabel: `${say(ctx, l("Sign in", "تسجيل الدخول", "اندراج کریں"))} · ${input.name}`,
      basis: { input },
    };
  },
  async execute(ctx, input, { idempotencyKey }) {
    const campusId = ownCampusId(ctx);
    // The service re-checks namesakes under its campus lock after its key replay; a namesake that arrived since
    // the preview is its 409 (STALE_VERSION), never a second admission.
    const inTime = await arrivalOf(ctx, input.arrivedAt);
    const { visit, replayed } = await checkIn(ctx.user, campusId, {
      action: "check-in", name: input.name, purpose: input.purpose, toMeet: input.toMeet, phone: input.phone, reference: input.reference,
      ...(inTime ? { inTime: inTime.toISOString() } : {}), idempotencyKey: domainKey(idempotencyKey),
    }).catch(domain);
    return write("front_desk.visitor_check_in", [{ model: "visitorLog", id: visit.id }], { visitors: replayed ? 0 : 1 }, link(ctx.user.role, "visitors"), { status: visit.status, ...(replayed ? { reconciled: true } : {}) });
  },
});

// ─── front_desk.visitor_check_out ─────────────────────────────────────────

const checkOutInput = z.strictObject({
  /** The visitor as the user named them; "Name (reference)" when the user picked one of two namesakes. */
  visitor: NAME,
  /** School-local departure time today ("he left at 11:30"); now when not said. */
  leftAt: TIME.optional(),
  visitId: id().optional(),
});
type CheckOutInput = z.infer<typeof checkOutInput>;

async function bindVisit(ctx: CapabilityContext, input: CheckOutInput) {
  const campusId = ownCampusId(ctx);
  if (input.visitId) {
    const bound = await prisma.visitorLog.findFirst({ where: { id: input.visitId, schoolId: ctx.user.schoolId, campusId }, select: { id: true, name: true, reference: true, toMeet: true, inTime: true, status: true } });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const zone = await zoneOf(ctx);
  const rows = await prisma.visitorLog.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "ON_SITE" }, select: { id: true, name: true, reference: true, toMeet: true, inTime: true, status: true }, orderBy: { inTime: "asc" } });
  return one(byName(rows, input.visitor, row => [row.name], row => [row.reference, row.toMeet, clock(row.inTime, zone)]), "/visitor", "VISITOR_NOT_FOUND", "VISITOR_AMBIGUOUS",
    row => ({ value: `${row.name} (${row.reference ?? row.toMeet ?? clock(row.inTime, zone)})`, label: `${row.name} · ${row.reference ?? "—"} · ${row.toMeet ?? "—"} · ${clock(row.inTime, zone)}` }));
}

const VISITOR_CHECK_OUT = defineCapability<CheckOutInput>({
  key: "front_desk.visitor_check_out", version: 1, cluster: "C7", inventoryKeys: ["front_desk.visitor_check_out"], risk: "UPDATE", roles: DESK, class: "B",
  input: checkOutInput, evidence: ["/visitor"], humanFields: ["visitId"],
  gates: deskGates("front-desk", "edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Sign a visitor out", "Record that a visitor on site has left, at the time the user said or now.", "Sign out the AC technician, he left at 11:30"],
    ["تسجيل خروج زائر", "تسجيل مغادرة زائر موجود في المدرسة، في الوقت المذكور أو الآن.", "سجّل خروج فني التكييف، غادر الساعة 11:30"],
    ["مہمان کی روانگی", "اسکول میں موجود مہمان کی روانگی درج کریں، بتائے گئے وقت پر یا ابھی۔", "اے سی والے ٹیکنیشن کی روانگی درج کریں، وہ ساڑھے گیارہ بجے چلے گئے"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "PATCH /api/front-desk/visitors", service: "src/lib/front-desk/visitors.ts:checkOut", reuse: "direct" },
  async resolve(ctx, input) { const visit = await bindVisit(ctx, input); return { ...input, visitId: visit.id }; },
  async preview(ctx, input) {
    const visit = await bindVisit(ctx, input);
    const zone = await zoneOf(ctx);
    const left = (await arrivalOf(ctx, input.leftAt)) ?? ctx.now;
    return {
      title: say(ctx, l("Sign a visitor out", "تسجيل خروج زائر", "مہمان کی روانگی")),
      lines: [
        { label: say(ctx, l("Visitor", "الزائر", "مہمان")), value: visit.reference ? `${visit.name} · ${visit.reference}` : visit.name },
        { label: say(ctx, l("Arrived", "الوصول", "آمد")), value: clock(visit.inTime, zone) },
        { label: say(ctx, l("Left", "المغادرة", "روانگی")), value: clock(left, zone) },
      ],
      counts: { visitors: 1 },
      confirmLabel: `${say(ctx, l("Sign out", "تسجيل الخروج", "روانگی درج کریں"))} · ${visit.name}`,
      basis: { input, visit: visit.id, status: visit.status },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const visit = await bindVisit(ctx, input);
    const outTime = await arrivalOf(ctx, input.leftAt);
    const result = await checkOut(ctx.user, campusId, visit.id, outTime?.toISOString()).catch(domain);
    return write("front_desk.visitor_check_out", [{ model: "visitorLog", id: visit.id }], { checkedOut: result.replayed ? 0 : 1 }, link(ctx.user.role, "visitors"), { status: result.visit.status, ...(result.replayed ? { reconciled: true } : {}) });
  },
});

// ─── front_desk.postal_log (A) ────────────────────────────────────────────

const postalInput = z.strictObject({
  direction: z.enum(["RECEIVE", "DISPATCH"]),
  /** The recipient (incoming) or addressee (outgoing), as said. */
  toName: NAME,
  fromName: z.string().trim().min(1).max(120).optional(),
  courier: z.string().trim().min(1).max(60).optional(),
  referenceNo: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  /** The day it arrived or was prepared; today when not said. */
  date: DAY.optional(),
  /** A front-office colleague to own it (CAMPUS_ADMIN, ADMIN or RECEPTIONIST), by name. */
  owner: NAME.optional(),
  ownerId: id().optional(),
});
type PostalInput = z.infer<typeof postalInput>;

const POSTAL_LOG = defineCapability<PostalInput>({
  key: "front_desk.postal_log", version: 1, cluster: "C7", inventoryKeys: ["front_desk.postal_log"], risk: "CREATE", roles: DESK, class: "A",
  classOverride: "Append-only post and parcel register entry keyed by the request; the domain refuses a second open item with the same courier reference, and handover, dispatch and delivery stay separate steps a person records.",
  input: postalInput, evidence: ["/toName"], humanFields: ["ownerId"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Log post or a parcel", "Record an incoming or outgoing letter or parcel in the post register. Handing it over or marking it delivered is done on the Post screen.", "A TCS parcel came for the principal, tracking 55120"],
    ["تسجيل بريد أو طرد", "تسجيل رسالة أو طرد وارد أو صادر في سجل البريد. التسليم أو تأكيد الوصول يتم في شاشة البريد.", "وصل طرد من أرامكس برقم 55120 لمكتب مدير الفرع"],
    ["ڈاک یا پارسل درج کریں", "آنے یا جانے والا خط یا پارسل ڈاک رجسٹر میں درج کریں۔ حوالگی یا ڈیلیوری ڈاک والی اسکرین پر ہوتی ہے۔", "پرنسپل صاحب کے لیے ٹی سی ایس کا پارسل آیا ہے، ٹریکنگ 55120"],
  ),
  idempotency: { mode: "native" }, source: { route: "POST /api/front-desk/postal", service: "src/lib/front-desk/postal.ts:logItem", reuse: "direct" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    if (!input.owner) return { ...input, ownerId: undefined };
    return { ...input, ownerId: (await bindOwner(ctx, input.owner, "/owner")).id };
  },
  async execute(ctx, input, { idempotencyKey }) {
    const campusId = ownCampusId(ctx);
    const owners = input.ownerId ? await ownerCandidates(ctx.user, campusId) : [];
    if (input.ownerId && !owners.some(row => row.id === input.ownerId)) throw new WorkflowError("SCOPE_DENIED");
    const date = input.date ?? localDay(ctx.now, await zoneOf(ctx));
    const { item, replayed } = await logItem(ctx.user, campusId, {
      direction: input.direction, date, toName: input.toName, fromName: input.fromName, courier: input.courier, referenceNo: input.referenceNo, note: input.note,
      ownerId: input.ownerId, idempotencyKey: domainKey(idempotencyKey),
    }).catch(domain);
    return write("front_desk.postal_log", [{ model: "postalRecord", id: item.id }], { items: replayed ? 0 : 1 }, link(ctx.user.role, "post"), { itemCode: item.itemCode, status: item.status, ...(replayed ? { reconciled: true } : {}) });
  },
});

// ─── callbacks ────────────────────────────────────────────────────────────

async function bindCallback(ctx: CapabilityContext, caller: string, callbackId: string | undefined) {
  const campusId = ownCampusId(ctx);
  const select = { id: true, status: true, dueAt: true, version: true, ownerId: true, outcome: true, completedById: true, owner: { select: { fullName: true } }, call: { select: { name: true } } } as const;
  if (callbackId) {
    const bound = await prisma.phoneCallback.findFirst({ where: { id: callbackId, schoolId: ctx.user.schoolId, campusId }, select });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const zone = await zoneOf(ctx);
  const rows = await prisma.phoneCallback.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: "OPEN" }, select, orderBy: { dueAt: "asc" } });
  const due = (row: (typeof rows)[number]) => `${localDay(row.dueAt, zone)} ${clock(row.dueAt, zone)}`;
  return one(byName(rows, caller, row => [row.call.name], row => [due(row), clock(row.dueAt, zone), row.owner?.fullName]), "/caller", "CALLBACK_NOT_FOUND", "CALLBACK_AMBIGUOUS",
    row => ({ value: `${row.call.name} (${due(row)})`, label: `${row.call.name} · ${due(row)} · ${row.owner?.fullName ?? "—"}` }));
}
const showLocal = (value: string) => value.replace("T", " ");

const completeInput = z.strictObject({
  /** The caller whose callback is done ("Mrs Siddiqui"); "Name (due)" after a choice. */
  caller: NAME,
  /** What came of the call, in the user's words. */
  outcome: TEXT(5, 1000),
  /** When a further call is owed: a school-local day or day and time. */
  nextDue: LOCAL.optional(),
  callbackId: id().optional(),
  version: z.number().int().positive().optional(),
});
type CompleteInput = z.infer<typeof completeInput>;

const CALLBACK_COMPLETE = defineCapability<CompleteInput>({
  key: "front_desk.callback_complete", version: 1, cluster: "C7", inventoryKeys: ["front_desk.callback_complete"], risk: "UPDATE", roles: DESK, class: "B",
  input: completeInput, evidence: ["/caller", "/outcome"], humanFields: ["callbackId", "version"],
  gates: deskGates("front-desk", "edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Complete a callback", "Record the outcome of a promised callback. A further call owed becomes a new callback linked to this one.", "The 2pm callback to Mrs Siddiqui is done, she needs a call again on Monday"],
    ["إتمام معاودة اتصال", "تسجيل نتيجة معاودة الاتصال الموعودة. أي اتصال آخر مطلوب يصبح معاودة جديدة مرتبطة بها.", "تم الاتصال بالسيدة صديقي الساعة 2، تحتاج اتصالاً آخر يوم الاثنين"],
    ["کال بیک مکمل کریں", "وعدہ کی گئی کال بیک کا نتیجہ درج کریں۔ مزید کال ہو تو وہ اسی سے جڑی نئی کال بیک بنتی ہے۔", "مسز صدیقی کو دو بجے والی کال ہو گئی، پیر کو دوبارہ کال کرنی ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "PATCH /api/front-desk/phone-calls", service: "src/lib/front-desk/phone-calls.ts:actOnCallback", reuse: "direct" },
  async resolve(ctx, input) {
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    return { ...input, callbackId: callback.id, version: callback.version };
  },
  async preview(ctx, input) {
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    const zone = await zoneOf(ctx);
    return {
      title: say(ctx, l("Complete a callback", "إتمام معاودة اتصال", "کال بیک مکمل کریں")),
      lines: [
        { label: say(ctx, l("Caller", "المتصل", "کال کرنے والا")), value: callback.call.name },
        { label: say(ctx, l("Was due", "الموعد", "مقررہ وقت")), value: `${localDay(callback.dueAt, zone)} ${clock(callback.dueAt, zone)}` },
        { label: say(ctx, l("Outcome", "النتيجة", "نتیجہ")), value: input.outcome },
        ...(input.nextDue ? [{ label: say(ctx, l("Next callback", "المعاودة التالية", "اگلی کال بیک")), value: showLocal(input.nextDue) }] : []),
      ],
      counts: { completed: 1, nextCallbacks: input.nextDue ? 1 : 0 },
      confirmLabel: `${say(ctx, l("Complete", "إتمام", "مکمل کریں"))} · ${callback.call.name}`,
      basis: { input, version: callback.version },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    // No key in the domain: this actor's own completion with the same outcome is the earlier run (RT17).
    if (callback.status === "DONE") {
      if (callback.completedById === ctx.user.userId && callback.outcome === input.outcome) return reconciledReceipt("front_desk.callback_complete", [{ model: "phoneCallback", id: callback.id }], link(ctx.user.role, "calls"));
      throw new WorkflowError("STALE_VERSION");
    }
    const updated = await actOnCallback(ctx.user, campusId, { id: callback.id, version: input.version ?? callback.version, action: "complete", outcome: input.outcome, ...(input.nextDue ? { nextDue: input.nextDue } : {}) }).catch(domain);
    return write("front_desk.callback_complete", [{ model: "phoneCallback", id: updated.id }], { completed: 1, nextCallbacks: input.nextDue ? 1 : 0 }, link(ctx.user.role, "calls"), { status: updated.status });
  },
});

const rescheduleInput = z.strictObject({
  caller: NAME,
  /** The new due day or day and time, school-local. */
  dueAt: LOCAL,
  note: TEXT(2, 1000).optional(),
  callbackId: id().optional(),
  version: z.number().int().positive().optional(),
});
type RescheduleInput = z.infer<typeof rescheduleInput>;
const instantOf = async (ctx: CapabilityContext, local: string) => { const zone = await zoneOf(ctx); const [day, time] = local.split("T"); return zonedInstant(day, time ?? "09:00", zone); };

const CALLBACK_RESCHEDULE = defineCapability<RescheduleInput>({
  key: "front_desk.callback_reschedule", version: 1, cluster: "C7", inventoryKeys: ["front_desk.callback_reschedule"], risk: "UPDATE", roles: DESK, class: "B",
  input: rescheduleInput, evidence: ["/caller", "/dueAt"], humanFields: ["callbackId", "version"],
  gates: deskGates("front-desk", "edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Move a callback", "Change when an open callback is due; it stays open with the same owner.", "Move Mr Ahmed's callback to tomorrow at 10"],
    ["تأجيل معاودة اتصال", "تغيير موعد معاودة اتصال مفتوحة؛ تبقى مفتوحة مع المسؤول نفسه.", "أجّل معاودة الاتصال بالسيد أحمد إلى الغد الساعة 10"],
    ["کال بیک کا وقت بدلیں", "کھلی کال بیک کا وقت بدلیں؛ وہ اسی ذمہ دار کے ساتھ کھلی رہتی ہے۔", "احمد صاحب کی کال بیک کل صبح دس بجے کر دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "PATCH /api/front-desk/phone-calls", service: "src/lib/front-desk/phone-calls.ts:actOnCallback", reuse: "direct" },
  async resolve(ctx, input) {
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    return { ...input, callbackId: callback.id, version: callback.version };
  },
  async preview(ctx, input) {
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    const zone = await zoneOf(ctx);
    return {
      title: say(ctx, l("Move a callback", "تأجيل معاودة اتصال", "کال بیک کا وقت بدلیں")),
      lines: [
        { label: say(ctx, l("Caller", "المتصل", "کال کرنے والا")), value: callback.call.name },
        { label: say(ctx, l("Was due", "الموعد السابق", "پہلے کا وقت")), value: `${localDay(callback.dueAt, zone)} ${clock(callback.dueAt, zone)}` },
        { label: say(ctx, l("New time", "الموعد الجديد", "نیا وقت")), value: showLocal(input.dueAt) },
      ],
      counts: { rescheduled: 1 },
      basis: { input, version: callback.version },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const callback = await bindCallback(ctx, input.caller, input.callbackId);
    const target = await instantOf(ctx, input.dueAt);
    // Already due at exactly that time (this run's earlier write): nothing to change.
    if (callback.status === "OPEN" && callback.dueAt.getTime() === target.getTime()) return reconciledReceipt("front_desk.callback_reschedule", [{ model: "phoneCallback", id: callback.id }], link(ctx.user.role, "calls"));
    const updated = await actOnCallback(ctx.user, campusId, { id: callback.id, version: input.version ?? callback.version, action: "reschedule", dueAt: input.dueAt, ...(input.note ? { note: input.note } : {}) }).catch(domain);
    return write("front_desk.callback_reschedule", [{ model: "phoneCallback", id: updated.id }], { rescheduled: 1 }, link(ctx.user.role, "calls"), { dueAt: updated.dueAt.toISOString() });
  },
});

// ─── enquiries ────────────────────────────────────────────────────────────

const SOURCES = ["WALK_IN", "PHONE", "WEBSITE", "REFERRAL", "ADVERT"] as const;
const enquiryCreateInput = z.strictObject({
  /** The parent or family name as said ("Mrs Farah Khan"). */
  name: NAME,
  phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/),
  email: z.string().trim().email().max(254).optional(),
  source: z.enum(SOURCES).default("WALK_IN"),
  /** The class the child would join, as a class handle. */
  classId: id().optional(),
  /** What the family said about the child and the visit. */
  note: TEXT(2, 2000).optional(),
});
type EnquiryCreateInput = z.infer<typeof enquiryCreateInput>;

/** An enquiry this same actor recorded on this campus in the last day with the same family name and phone (RT17). */
async function ownEnquiry(ctx: CapabilityContext, input: { name: string; phone: string }) {
  const campusId = ownCampusId(ctx);
  const mine = await prisma.auditLog.findMany({ where: { schoolId: ctx.user.schoolId, tableName: ENQUIRY_TABLE, userId: ctx.user.userId, createdAt: { gte: new Date(ctx.now.getTime() - 86_400_000) } }, select: { recordId: true }, take: 500, orderBy: { createdAt: "desc" } });
  if (!mine.length) return null;
  const rows = await prisma.admissionQuery.findMany({ where: { id: { in: mine.map(row => row.recordId) }, schoolId: ctx.user.schoolId, campusId }, select: { id: true, name: true, phone: true, status: true } });
  return rows.find(row => fold(row.name) === fold(input.name) && digits(row.phone) === digits(input.phone)) ?? null;
}

const ENQUIRY_CREATE = defineCapability<EnquiryCreateInput>({
  key: "enquiries.create", version: 1, cluster: "C7", inventoryKeys: ["enquiries.create"], risk: "CREATE", roles: DESK, class: "B",
  input: enquiryCreateInput, evidence: ["/name", "/phone"],
  gates: admissionGates("add"), scope: { kind: "own-campus" },
  copy: c(
    ["Log an admission enquiry", "Record a family asking about admission, with their phone and the class they want. An enquiry is never a pupil.", "New walk-in: parents want Grade 3 admission for their daughter, 0321-5550101"],
    ["تسجيل استفسار قبول", "تسجيل أسرة تسأل عن القبول مع هاتفها والصف المطلوب. الاستفسار ليس طالباً أبداً.", "زيارة جديدة: والدان يريدان قبول ابنتهما في الصف الثالث، 0501234567"],
    ["داخلے کی انکوائری درج کریں", "داخلے کے بارے میں پوچھنے والے خاندان کو فون اور مطلوبہ کلاس کے ساتھ درج کریں۔ انکوائری کبھی طالب علم نہیں ہوتی۔", "نئے والدین آئے ہیں، بیٹی کا تیسری جماعت میں داخلہ چاہتے ہیں، 0321-5550101"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/admission-queries", service: "src/lib/admissions/enquiries.ts:createEnquiry", reuse: "extracted" },
  async resolve(ctx, input) { ownCampusId(ctx); if (input.classId) await assignedClass(ctx, input.classId); return input; },
  async preview(ctx, input) {
    ownCampusId(ctx);
    const klass = input.classId ? await assignedClass(ctx, input.classId) : null;
    const existing = await ownEnquiry(ctx, input);
    return {
      title: say(ctx, l("Log an admission enquiry", "تسجيل استفسار قبول", "داخلے کی انکوائری")),
      lines: [
        { label: say(ctx, l("Family", "الأسرة", "خاندان")), value: input.name },
        { label: say(ctx, l("Phone", "الهاتف", "فون")), value: input.phone },
        ...(klass ? [{ label: say(ctx, l("Class wanted", "الصف المطلوب", "مطلوبہ کلاس")), value: classLabel(klass) }] : []),
        { label: say(ctx, l("Source", "المصدر", "ذریعہ")), value: input.source },
        ...(input.note ? [{ label: say(ctx, l("Note", "ملاحظة", "نوٹ")), value: input.note }] : []),
        ...(existing ? [{ label: say(ctx, l("Already recorded", "مسجل مسبقاً", "پہلے سے درج")), value: say(ctx, l("You recorded this family today; nothing new is created.", "سجّلت هذه الأسرة اليوم؛ لن يُنشأ شيء جديد.", "آپ آج یہ خاندان درج کر چکے ہیں؛ کچھ نیا نہیں بنے گا۔")) }] : []),
      ],
      counts: { enquiries: existing ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Log enquiry", "تسجيل الاستفسار", "انکوائری درج کریں"))} · ${input.name}`,
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input) {
    ownCampusId(ctx);
    if (input.classId) await assignedClass(ctx, input.classId);
    const existing = await ownEnquiry(ctx, input);
    if (existing) return reconciledReceipt("enquiries.create", [{ model: "admissionQuery", id: existing.id }], link(ctx.user.role, "enquiries"), { status: existing.status });
    const created = await createEnquiry(ctx.user, { name: input.name, phone: input.phone, email: input.email, source: input.source, classInterestedId: input.classId, note: input.note, status: "ACTIVE" }).catch(domain);
    return write("enquiries.create", [{ model: "admissionQuery", id: created.id }], { created: 1 }, link(ctx.user.role, "enquiries"), { status: created.status });
  },
});

/** Enquiries on this campus that are still open, matched by the family name or a linked application's child. */
async function bindEnquiry(ctx: CapabilityContext, said: string, enquiryId: string | undefined, pointer = "/enquiry") {
  const campusId = ownCampusId(ctx);
  const select = { id: true, name: true, phone: true, status: true, note: true, nextFollowUp: true, classInterestedId: true, createdAt: true, convertedStudentId: true, applications: { select: { childName: true } } } as const;
  if (enquiryId) {
    const bound = await prisma.admissionQuery.findFirst({ where: { id: enquiryId, schoolId: ctx.user.schoolId, campusId }, select });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const rows = await prisma.admissionQuery.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: { in: ["ACTIVE", "FOLLOW_UP", "LOST"] } }, select, orderBy: { createdAt: "desc" }, take: 500 });
  return one(byName(rows, said, row => [row.name, ...row.applications.map(app => app.childName)], row => [row.phone]), pointer, "ENQUIRY_NOT_FOUND", "ENQUIRY_AMBIGUOUS",
    row => ({ value: `${row.name} (…${tail(row.phone)})`, label: `${row.name} · …${tail(row.phone)} · ${row.createdAt.toISOString().slice(0, 10)} · ${row.status}` }));
}

const enquiryUpdateInput = z.strictObject({
  /** The family (or the child) as the user named them; "Name (…0101)" after a choice. */
  enquiry: NAME,
  status: z.enum(["ACTIVE", "FOLLOW_UP", "LOST"]).optional(),
  /** A follow-up contact that happened, in the user's words. */
  followUpNote: TEXT(2, 2000).optional(),
  /** When to contact the family next. */
  nextFollowUp: DAY.optional(),
  note: TEXT(2, 2000).optional(),
  classId: id().optional(),
  enquiryId: id().optional(),
}).refine(value => value.status !== undefined || value.followUpNote !== undefined || value.nextFollowUp !== undefined || value.note !== undefined || value.classId !== undefined, "Say what changes on the enquiry");
type EnquiryUpdateInput = z.infer<typeof enquiryUpdateInput>;

const STATUS_LABEL: Record<string, L10n> = {
  ACTIVE: l("Active", "نشط", "فعال"), FOLLOW_UP: l("Follow up", "متابعة", "پیروی"), LOST: l("Lost", "مفقود", "ختم"), CONVERTED: l("Enrolled", "مسجل", "داخل"),
};

async function ownFollowUp(ctx: CapabilityContext, enquiryId: string, note: string) {
  return prisma.admissionQueryFollowUp.findFirst({ where: { queryId: enquiryId, actorId: ctx.user.userId, note, date: { gte: new Date(ctx.now.getTime() - 86_400_000) } }, select: { id: true } });
}

const ENQUIRY_UPDATE = defineCapability<EnquiryUpdateInput>({
  key: "enquiries.update", version: 1, cluster: "C7", inventoryKeys: ["enquiries.update"], risk: "UPDATE", roles: DESK, class: "B",
  input: enquiryUpdateInput, evidence: ["/enquiry"], humanFields: ["enquiryId"],
  gates: admissionGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Update an enquiry", "Log a follow-up with a family, set the next contact date or mark an enquiry lost. Enrolment happens only from an accepted application.", "Called Mrs Khan, she will visit on Saturday; follow up again on the 30th"],
    ["تحديث استفسار", "تسجيل متابعة مع أسرة أو تحديد موعد التواصل التالي أو إغلاق الاستفسار. التسجيل يتم فقط من طلب مقبول.", "اتصلت بالسيدة خان، ستزور يوم السبت؛ تابع معها يوم 30"],
    ["انکوائری اپ ڈیٹ کریں", "خاندان سے رابطہ درج کریں، اگلی تاریخ رکھیں یا انکوائری بند کریں۔ داخلہ صرف منظور شدہ درخواست سے ہوتا ہے۔", "مسز خان کو فون کیا، ہفتے کو آئیں گی؛ تیس تاریخ کو دوبارہ رابطہ کریں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "PATCH /api/admission-queries", service: "src/lib/admissions/enquiries.ts:updateEnquiry", reuse: "extracted" },
  async resolve(ctx, input) {
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    if (enquiry.convertedStudentId) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ENQUIRY_CONVERTED" });
    if (input.classId) await assignedClass(ctx, input.classId);
    return { ...input, enquiryId: enquiry.id };
  },
  async preview(ctx, input) {
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    const klass = input.classId ? await assignedClass(ctx, input.classId) : null;
    return {
      title: say(ctx, l("Update an enquiry", "تحديث استفسار", "انکوائری اپ ڈیٹ")),
      lines: [
        { label: say(ctx, l("Family", "الأسرة", "خاندان")), value: `${enquiry.name} · …${tail(enquiry.phone)}` },
        ...(input.followUpNote ? [{ label: say(ctx, l("Follow-up", "المتابعة", "رابطہ")), value: input.followUpNote }] : []),
        ...(input.nextFollowUp ? [{ label: say(ctx, l("Next contact", "التواصل التالي", "اگلا رابطہ")), value: input.nextFollowUp }] : []),
        ...(input.status ? [{ label: say(ctx, l("Status", "الحالة", "حیثیت")), value: `${say(ctx, STATUS_LABEL[enquiry.status] ?? STATUS_LABEL.ACTIVE)} → ${say(ctx, STATUS_LABEL[input.status])}` }] : []),
        ...(klass ? [{ label: say(ctx, l("Class wanted", "الصف المطلوب", "مطلوبہ کلاس")), value: classLabel(klass) }] : []),
        ...(input.note ? [{ label: say(ctx, l("Note", "ملاحظة", "نوٹ")), value: input.note }] : []),
      ],
      counts: { enquiries: 1, followUps: input.followUpNote ? 1 : 0 },
      basis: { input, status: enquiry.status, nextFollowUp: enquiry.nextFollowUp?.toISOString() ?? null, note: enquiry.note },
    };
  },
  async execute(ctx, input) {
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    if (enquiry.convertedStudentId) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ENQUIRY_CONVERTED" });
    if (input.classId) await assignedClass(ctx, input.classId);
    const entities = [{ model: "admissionQuery", id: enquiry.id }];
    const next = input.nextFollowUp ? `${input.nextFollowUp}T00:00:00.000Z` : undefined;
    // The follow-up row has no key: this actor's own same note on this enquiry today is the earlier run (RT17).
    const followUpDone = input.followUpNote ? Boolean(await ownFollowUp(ctx, enquiry.id, input.followUpNote)) : true;
    const fields = {
      ...(input.status && input.status !== enquiry.status ? { status: input.status } : {}),
      ...(input.note !== undefined && input.note !== enquiry.note ? { note: input.note } : {}),
      ...(input.classId !== undefined && input.classId !== enquiry.classInterestedId ? { classInterestedId: input.classId } : {}),
      ...(next && enquiry.nextFollowUp?.toISOString() !== next ? { nextFollowUp: next } : {}),
    };
    if (followUpDone && !Object.keys(fields).length) return reconciledReceipt("enquiries.update", entities, link(ctx.user.role, "enquiries"), { status: enquiry.status });
    let followUps = 0;
    if (!followUpDone) {
      // The route's follow-up path moves the status itself; a status the user chose is applied after it.
      await updateEnquiry(ctx.user, { id: enquiry.id, followUp: { note: input.followUpNote, ...(next ? { nextDate: next } : {}) } }).catch(domain);
      followUps = 1;
    }
    const rest = followUps ? { ...(input.status ? { status: input.status } : {}), ...(fields.note ? { note: fields.note } : {}), ...(fields.classInterestedId ? { classInterestedId: fields.classInterestedId } : {}) } : fields;
    const updated = Object.keys(rest).length ? await updateEnquiry(ctx.user, { id: enquiry.id, ...rest }).catch(domain) : await prisma.admissionQuery.findUniqueOrThrow({ where: { id: enquiry.id } });
    return write("enquiries.update", entities, { updated: 1, followUps }, link(ctx.user.role, "enquiries"), { status: updated.status });
  },
});

// ─── admissions.start_application / admissions.save_answers ───────────────

async function bindForm(ctx: CapabilityContext, said: string | undefined, formId: string | undefined) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.admissionForm.findMany({ where: { schoolId: ctx.user.schoolId, campusId, currentVersion: { gt: 0 } }, select: { id: true, name: true } });
  if (formId) { const bound = rows.find(row => row.id === formId); if (!bound) throw new WorkflowError("SCOPE_DENIED"); return bound; }
  if (!rows.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_PUBLISHED_FORM", whoCan: LEADERS.join(",") });
  if (!said) return one(rows, "/form", "ADMISSION_FORM_NOT_FOUND", "ADMISSION_FORM_AMBIGUOUS", row => ({ value: row.name, label: row.name }));
  return one(byName(rows, said, row => [row.name]), "/form", "ADMISSION_FORM_NOT_FOUND", "ADMISSION_FORM_AMBIGUOUS", row => ({ value: row.name, label: row.name }));
}

const startInput = z.strictObject({
  /** The enquiry the application comes from: the family or child as named. */
  enquiry: NAME,
  /** The admission form by name, when the campus has several published. */
  form: NAME.optional(),
  enquiryId: id().optional(),
  formId: id().optional(),
});
type StartInput = z.infer<typeof startInput>;

const OPEN_APPLICATION = { notIn: ["WITHDRAWN", "REJECTED", "DECLINED"] };

const START_APPLICATION = defineCapability<StartInput>({
  key: "admissions.start_application", version: 1, cluster: "C7", inventoryKeys: ["admissions.start_application"], risk: "CREATE", roles: DESK, class: "B",
  input: startInput, evidence: ["/enquiry"], humanFields: ["enquiryId", "formId"],
  gates: admissionGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Start an application from an enquiry", "Open a draft admission application for an enquiry, prefilled with the family's name and phone. Offers and enrolment stay with your campus admin.", "Start an application for Mrs Khan's Grade 3 enquiry"],
    ["بدء طلب قبول من استفسار", "فتح مسودة طلب قبول لاستفسار، مع اسم الأسرة وهاتفها. العروض والتسجيل تبقى لمدير الفرع.", "ابدأ طلب قبول لاستفسار السيدة خان للصف الثالث"],
    ["انکوائری سے داخلہ درخواست شروع کریں", "انکوائری کے لیے مسودہ درخواست کھولیں، خاندان کا نام اور فون پہلے سے بھرا ہوگا۔ آفر اور داخلہ کیمپس ایڈمن کا کام ہے۔", "مسز خان کی تیسری جماعت والی انکوائری کی درخواست شروع کریں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/admissions", service: "src/lib/admissions/service.ts:staffStart", reuse: "direct" },
  async resolve(ctx, input) {
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    const form = await bindForm(ctx, input.form, input.formId);
    const open = await prisma.admissionApplication.findFirst({ where: { enquiryId: enquiry.id, status: OPEN_APPLICATION }, select: { ownerId: true, channel: true } });
    if (open && !(open.ownerId === ctx.user.userId && open.channel === "STAFF")) throw new WorkflowError("DOMAIN_REFUSED", { reason: "APPLICATION_EXISTS" });
    return { ...input, enquiryId: enquiry.id, formId: form.id };
  },
  async preview(ctx, input) {
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    const form = await bindForm(ctx, input.form, input.formId);
    return {
      title: say(ctx, l("Start an application", "بدء طلب قبول", "داخلہ درخواست شروع کریں")),
      lines: [
        { label: say(ctx, l("Enquiry", "الاستفسار", "انکوائری")), value: `${enquiry.name} · …${tail(enquiry.phone)}` },
        { label: say(ctx, l("Form", "النموذج", "فارم")), value: form.name },
        { label: say(ctx, l("Status", "الحالة", "حیثیت")), value: say(ctx, l("Draft: nothing is sent to the family or decided", "مسودة: لا يُرسل شيء للأسرة ولا يُقرر شيء", "مسودہ: خاندان کو کچھ نہیں جاتا، نہ فیصلہ ہوتا ہے")) },
      ],
      counts: { applications: 1 },
      basis: { input },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const enquiry = await bindEnquiry(ctx, input.enquiry, input.enquiryId);
    const form = await bindForm(ctx, input.form, input.formId);
    // No key in the domain: the open staff application this actor started from this enquiry is the earlier run.
    const mine = await prisma.admissionApplication.findFirst({ where: { enquiryId: enquiry.id, status: OPEN_APPLICATION, ownerId: ctx.user.userId, channel: "STAFF" }, select: { id: true, reference: true, status: true } });
    if (mine) return reconciledReceipt("admissions.start_application", [{ model: "admissionApplication", id: mine.id }], link(ctx.user.role, "applications"), { reference: mine.reference, status: mine.status });
    const created = await staffStart(ctx.user, campusId, { formId: form.id, enquiryId: enquiry.id }).catch(domain);
    return write("admissions.start_application", [{ model: "admissionApplication", id: created.id }], { created: 1 }, link(ctx.user.role, "applications"), { reference: created.reference, status: created.status });
  },
});

const ANSWER_FIELDS = ["childName", "dateOfBirth", "gender", "guardianName", "guardianPhone", "guardianEmail", "previousSchool"] as const satisfies readonly IdentityField[];
const FIELD_LABEL: Record<(typeof ANSWER_FIELDS)[number], L10n> = {
  childName: l("Child's name", "اسم الطفل", "بچے کا نام"), dateOfBirth: l("Date of birth", "تاريخ الميلاد", "تاریخ پیدائش"), gender: l("Gender", "الجنس", "جنس"),
  guardianName: l("Parent or guardian", "ولي الأمر", "سرپرست"), guardianPhone: l("Phone", "الهاتف", "فون"), guardianEmail: l("Email", "البريد", "ای میل"), previousSchool: l("Previous school", "المدرسة السابقة", "سابقہ اسکول"),
};
const saveAnswersInput = z.strictObject({
  /** The application: its APP- reference, the child's name, or the enquiry family's name. */
  application: NAME,
  answers: z.array(z.strictObject({
    field: z.enum(ANSWER_FIELDS),
    /** The answer: a date as YYYY-MM-DD, gender as FEMALE or MALE, anything else as said. */
    value: z.string().trim().min(1).max(200),
    /** The user's own words for this answer. */
    said: z.string().trim().min(1).max(200),
  })).min(1).max(ANSWER_FIELDS.length),
  applicationId: id().optional(),
}).refine(value => new Set(value.answers.map(answer => answer.field)).size === value.answers.length, "Each answer once");
type SaveAnswersInput = z.infer<typeof saveAnswersInput>;

async function bindApplication(ctx: CapabilityContext, said: string, applicationId: string | undefined) {
  const campusId = ownCampusId(ctx);
  const select = { id: true, reference: true, childName: true, status: true, channel: true, answers: true, version: true, formVersion: { select: { definition: true } }, enquiry: { select: { name: true } } } as const;
  if (applicationId) {
    const bound = await prisma.admissionApplication.findFirst({ where: { id: applicationId, schoolId: ctx.user.schoolId, campusId }, select });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const reference = said.trim().toUpperCase().match(/APP-[0-9A-F]{8}/)?.[0];
  const rows = await prisma.admissionApplication.findMany({ where: { schoolId: ctx.user.schoolId, campusId, status: { in: ["DRAFT", "INFO_REQUESTED"] }, channel: "STAFF", ...(reference ? { reference } : {}) }, select, orderBy: { createdAt: "desc" }, take: 300 });
  const found = reference ? rows : byName(rows, said, row => [row.childName, row.enquiry?.name], row => [row.reference]);
  return one(found, "/application", "APPLICATION_NOT_FOUND", "APPLICATION_AMBIGUOUS", row => ({ value: `${row.childName || row.enquiry?.name || ""} (${row.reference})`.trim(), label: `${row.reference} · ${row.childName || "—"} · ${row.enquiry?.name ?? "—"}` }));
}

/** The user's answers keyed by this form version's fields (by identity), merged over what the draft already holds. */
function mergedAnswers(definition: FormDefinition, current: Answers, input: SaveAnswersInput) {
  const merged: Answers = { ...current }, changed: Array<{ field: (typeof ANSWER_FIELDS)[number]; key: string; value: string }> = [], missing: number[] = [];
  input.answers.forEach((answer, index) => {
    const field = definition.fields.find(row => row.identity === answer.field);
    if (!field) { missing.push(index); return; }
    let value = answer.value;
    if (field.type === "select") value = field.options?.find(option => option.value.toUpperCase() === value.toUpperCase())?.value ?? value;
    if (merged[field.key] !== value) changed.push({ field: answer.field, key: field.key, value });
    merged[field.key] = value;
  });
  if (missing.length) throw new InputRequired(missing.map(index => ({ pointer: `/answers/${index}/field`, promptKey: "ADMISSION_FIELD_NOT_ON_FORM" })));
  return { merged, changed };
}

const SAVE_ANSWERS = defineCapability<SaveAnswersInput>({
  key: "admissions.save_answers", version: 1, cluster: "C7", inventoryKeys: ["admissions.save_answers"], risk: "UPDATE", roles: DESK, class: "B",
  input: saveAnswersInput, evidence: ["/application", "/answers/*/said"], humanFields: ["applicationId"],
  gates: admissionGates("edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Fill in an application", "Write what the family told you into a staff-entered draft application. Answers a family typed themselves are never changed.", "On Mrs Khan's application the child is Zara Khan, born 3 March 2019"],
    ["تعبئة طلب قبول", "كتابة ما قالته الأسرة في مسودة طلب أدخلها الموظفون. إجابات الأسرة نفسها لا تتغير أبداً.", "في طلب السيدة خان اسم الطفلة زارا خان، مواليد 3 مارس 2019"],
    ["درخواست میں معلومات بھریں", "خاندان نے جو بتایا وہ عملے کی بنائی مسودہ درخواست میں لکھیں۔ خاندان کے اپنے جوابات کبھی نہیں بدلتے۔", "مسز خان کی درخواست میں بچی کا نام زارا خان ہے، پیدائش 3 مارچ 2019"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/admissions", service: "src/lib/admissions/service.ts:staffSaveAnswers", reuse: "direct" },
  async resolve(ctx, input) {
    const application = await bindApplication(ctx, input.application, input.applicationId);
    mergedAnswers(application.formVersion.definition as unknown as FormDefinition, application.answers as Answers, input);
    return { ...input, applicationId: application.id };
  },
  async preview(ctx, input) {
    const application = await bindApplication(ctx, input.application, input.applicationId);
    const { changed } = mergedAnswers(application.formVersion.definition as unknown as FormDefinition, application.answers as Answers, input);
    return {
      title: say(ctx, l("Fill in an application", "تعبئة طلب قبول", "درخواست میں معلومات")),
      lines: [
        { label: say(ctx, l("Application", "الطلب", "درخواست")), value: application.reference },
        ...changed.map(row => ({ label: say(ctx, FIELD_LABEL[row.field]), value: row.value })),
      ],
      counts: { answers: changed.length },
      basis: { input, version: application.version },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const application = await bindApplication(ctx, input.application, input.applicationId);
    const { merged, changed } = mergedAnswers(application.formVersion.definition as unknown as FormDefinition, application.answers as Answers, input);
    const entities = [{ model: "admissionApplication", id: application.id }];
    if (!changed.length) return reconciledReceipt("admissions.save_answers", entities, link(ctx.user.role, "applications"), { reference: application.reference });
    const saved = await staffSaveAnswers(ctx.user, campusId, { id: application.id, answers: merged }).catch(domain);
    return write("admissions.save_answers", entities, { answers: changed.length }, link(ctx.user.role, "applications"), { reference: saved.reference, status: saved.status });
  },
});

// ─── front_desk.complaint_intake ──────────────────────────────────────────

const complaintInput = z.strictObject({
  /** Who complained, as said; "anonymous" when they would not give a name. */
  complainant: NAME,
  anonymous: z.boolean().optional(),
  /** The category in a word or two ("Canteen", "Transport", "Fees"). */
  type: TEXT(2, 60),
  /** What happened, in the user's words. */
  description: TEXT(10, 5000),
  phone: z.string().trim().regex(/^\+?[\d\s()-]{6,30}$/).optional(),
  /** Only campus leaders and the owner will see it. */
  confidential: z.boolean().optional(),
  /** The day it was received; today when not said. */
  date: DAY.optional(),
  /** When the family should hear back. */
  dueDate: DAY.optional(),
});
type ComplaintInput = z.infer<typeof complaintInput>;

const COMPLAINT_INTAKE = defineCapability<ComplaintInput>({
  key: "front_desk.complaint_intake", version: 1, cluster: "C7", inventoryKeys: ["front_desk.complaint_intake"], risk: "CREATE", roles: DESK, class: "B",
  input: complaintInput, evidence: ["/complainant", "/type", "/description"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Record a complaint", "Open a complaint case with a reference code. A confidential concern is seen only by campus leaders. Child-safety concerns go to Care, not here.", "A parent complained the canteen food was cold today, log it"],
    ["تسجيل شكوى", "فتح ملف شكوى برمز مرجعي. الشكوى السرية يراها قادة الفرع فقط. مخاوف سلامة الأطفال تذهب إلى الرعاية وليس هنا.", "اشتكى ولي أمر أن طعام المقصف كان بارداً اليوم، سجّلها"],
    ["شکایت درج کریں", "ریفرنس کوڈ کے ساتھ شکایت کا کیس کھولیں۔ خفیہ شکایت صرف کیمپس قیادت دیکھتی ہے۔ بچوں کی حفاظت کے معاملات یہاں نہیں، کیئر میں جاتے ہیں۔", "ایک والد نے شکایت کی کہ آج کینٹین کا کھانا ٹھنڈا تھا، درج کر دیں"],
  ),
  idempotency: { mode: "native" }, source: { route: "POST /api/front-desk/complaints", service: "src/lib/front-desk/complaints.ts:intake", reuse: "direct" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    // A safeguarding concern is never taken by the AI: nothing is stored; the person is shown the Care route.
    if (mentionsCare(`${input.type} ${input.description}`)) throw new WorkflowError("CARE_REFERRAL");
    return input;
  },
  async preview(ctx, input) {
    ownCampusId(ctx);
    const confidential = input.confidential === true;
    return {
      title: say(ctx, l("Record a complaint", "تسجيل شكوى", "شکایت درج کریں")),
      lines: [
        { label: say(ctx, l("Category", "الفئة", "قسم")), value: input.type },
        // A confidential concern's names and narrative are not repeated back; the person typed them.
        ...(confidential
          ? [{ label: say(ctx, l("Confidential", "سرية", "خفیہ")), value: say(ctx, l("Only campus leaders will see it. You get a reference code.", "يراها قادة الفرع فقط. ستحصل على رمز مرجعي.", "صرف کیمپس قیادت دیکھے گی۔ آپ کو ریفرنس کوڈ ملے گا۔")) }]
          : [
            { label: say(ctx, l("From", "من", "شکایت کنندہ")), value: input.anonymous ? say(ctx, l("Anonymous", "مجهول", "گمنام")) : input.complainant },
            { label: say(ctx, l("What happened", "ما حدث", "کیا ہوا")), value: input.description },
          ]),
        ...(input.dueDate ? [{ label: say(ctx, l("Reply due", "موعد الرد", "جواب کی تاریخ")), value: input.dueDate }] : []),
      ],
      counts: { complaints: 1 },
      // Bound by hash only, so a confidential concern's words are not kept in the preview either.
      basis: { input: createHash("sha256").update(JSON.stringify(input)).digest("hex") },
    };
  },
  async execute(ctx, input, { idempotencyKey }) {
    const campusId = ownCampusId(ctx);
    if (mentionsCare(`${input.type} ${input.description}`)) throw new WorkflowError("CARE_REFERRAL");
    const date = input.date ?? localDay(ctx.now, await zoneOf(ctx));
    const { complaint, replayed } = await intake(ctx.user, campusId, {
      complainantName: input.complainant, anonymous: input.anonymous === true, type: input.type, description: input.description, phone: input.phone,
      confidential: input.confidential === true, date, dueDate: input.dueDate, idempotencyKey: domainKey(idempotencyKey),
    }).catch(domain);
    const counts = { complaints: replayed ? 0 : 1 };
    // Reception gets a receipt for a confidential concern, never a handle to read it back: the code only.
    if (complaint.confidential && !(isLeader(ctx.user) || complaint.ownerId === ctx.user.userId)) {
      return { kind: "write", capability: "front_desk.complaint_intake", entities: [], counts, link: link(ctx.user.role, "complaints"), replayed: false, detail: { referenceCode: complaint.referenceCode, confidential: true } };
    }
    return write("front_desk.complaint_intake", [{ model: "complaint", id: complaint.id }], counts, link(ctx.user.role, "complaints"), { referenceCode: complaint.referenceCode, confidential: complaint.confidential, status: complaint.status, ...(replayed ? { reconciled: true } : {}) });
  },
});

// ─── certificates ─────────────────────────────────────────────────────────

async function bindTemplate(ctx: CapabilityContext, said: string, templateId: string | undefined, approvedOnly: boolean) {
  const campusId = ownCampusId(ctx);
  const rows = await prisma.certificateTemplate.findMany({ where: { schoolId: ctx.user.schoolId, campusId, ...(approvedOnly ? { currentVersion: { gt: 0 } } : {}) }, select: { id: true, name: true, kind: true, language: true, pageSize: true, requiresApproval: true, currentVersion: true, draftVersion: true, layoutJson: true } });
  if (templateId) { const bound = rows.find(row => row.id === templateId); if (!bound) throw new WorkflowError("SCOPE_DENIED"); return bound; }
  return one(byName(rows, said, row => [row.name], row => [row.language, row.kind]), "/template", "TEMPLATE_NOT_FOUND", "TEMPLATE_AMBIGUOUS", row => ({ value: `${row.name} (${row.language})`, label: `${row.name} · ${row.kind} · ${row.language}` }));
}

/** Active pupils of this campus (the certificate service's own scope), by name or roll number. */
async function bindPupil(ctx: CapabilityContext, said: string, studentId: string | undefined) {
  const campusId = ownCampusId(ctx);
  if (studentId) {
    const bound = await prisma.student.findFirst({ where: { id: studentId, schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true } });
    if (!bound) throw new WorkflowError("SCOPE_DENIED");
    return bound;
  }
  const roster = await prisma.student.findMany({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null, consolidatedIntoId: null }, select: { id: true, fullName: true, nameUr: true, rollNo: true }, orderBy: { fullName: "asc" } });
  return one(matchPupil(roster, said), "/student", "PUPIL_NOT_FOUND", "PUPIL_AMBIGUOUS", pupil => ({ value: pupil.rollNo, label: pupilLabel(pupil) }));
}

const documentInput = z.strictObject({
  /** The template by name ("Enrolment certificate"). */
  template: NAME,
  /** The pupil by name or roll number. */
  student: NAME,
  templateId: id().optional(),
  studentId: id().optional(),
});
type DocumentInput = z.infer<typeof documentInput>;

const CERTIFICATE_PREVIEW = defineCapability<DocumentInput>({
  key: "front_desk.certificate_preview", version: 1, cluster: "C7", inventoryKeys: ["front_desk.certificate_preview", "certificates.preview_issue"], risk: "READ", roles: DESK, class: "A",
  input: documentInput, evidence: [], humanFields: ["templateId", "studentId"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Check a certificate before issuing", "See what an approved certificate or ID card would say for a pupil and which record fields are missing. Nothing is stored.", "Can we issue an enrolment certificate for Hamza Ali?"],
    ["معاينة شهادة قبل إصدارها", "معرفة ما ستقوله الشهادة أو البطاقة المعتمدة لطالب، والحقول الناقصة في سجله. لا يُحفظ شيء.", "هل يمكن إصدار شهادة قيد لحمزة علي؟"],
    ["سرٹیفکیٹ جاری کرنے سے پہلے دیکھیں", "منظور شدہ سرٹیفکیٹ یا شناختی کارڈ طالب علم کے لیے کیا لکھے گا اور ریکارڈ میں کیا کمی ہے۔ کچھ محفوظ نہیں ہوتا۔", "کیا حمزہ علی کا داخلہ سرٹیفکیٹ بن سکتا ہے؟"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/front-desk/certificates (action=preview)", service: "src/lib/certificates/service.ts:previewIssue", reuse: "direct" },
  async resolve(ctx, input) {
    const template = await bindTemplate(ctx, input.template, input.templateId, true);
    const pupil = await bindPupil(ctx, input.student, input.studentId);
    return { ...input, templateId: template.id, studentId: pupil.id };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    const template = await bindTemplate(ctx, input.template, input.templateId, true);
    const pupil = await bindPupil(ctx, input.student, input.studentId);
    const preview = await previewIssue(ctx.user, campusId, { templateId: template.id, studentId: pupil.id }).catch(domain);
    // The rendered text holds the pupil's record (DOB, guardian): it stays on the Documents screen.
    return { kind: "read", capability: "front_desk.certificate_preview", entities: [{ model: "certificateTemplate", id: template.id }, { model: "student", id: pupil.id }], counts: { missing: preview.missing.length }, link: link(ctx.user.role, "certificates"), replayed: false,
      detail: { title: preview.title, kind: preview.kind, language: preview.language, templateVersion: preview.templateVersion, missing: preview.missing, requiresApproval: preview.requiresApproval, ready: preview.missing.length === 0 } };
  },
});

const templateInput = z.strictObject({
  /** The template's name ("Enrolment certificate"); an existing name edits that template's draft. */
  name: NAME,
  kind: z.enum(KINDS),
  language: z.enum(LANGUAGES).default("en"),
  pageSize: z.enum(PAGE_SIZES).optional(),
  title: TEXT(2, 120),
  /** The document text with {{variables}} (studentName, className, rollNo, issueDate, serial…). */
  body: TEXT(10, 4000),
  requiresApproval: z.boolean().optional(),
  templateId: id().optional(),
});
type TemplateInput = z.infer<typeof templateInput>;

const draftOf = (layout: unknown) => { const value = (layout ?? {}) as Record<string, unknown>; return { title: String(value.title ?? ""), body: String(value.body ?? "") }; };
const pageOf = (input: TemplateInput) => input.pageSize ?? (input.kind === "ID_CARD" ? "ID_CARD" : "A4");
const approvalOf = (input: TemplateInput) => input.kind === "ID_CARD" ? true : input.requiresApproval !== false;

async function existingTemplate(ctx: CapabilityContext, input: TemplateInput) {
  const campusId = ownCampusId(ctx);
  if (input.templateId) { const bound = await prisma.certificateTemplate.findFirst({ where: { id: input.templateId, schoolId: ctx.user.schoolId, campusId } }); if (!bound) throw new WorkflowError("SCOPE_DENIED"); return bound; }
  const rows = await prisma.certificateTemplate.findMany({ where: { schoolId: ctx.user.schoolId, campusId } });
  const found = rows.filter(row => fold(row.name) === fold(input.name));
  if (found.length > 1) throw new InputRequired([{ pointer: "/name", promptKey: "TEMPLATE_AMBIGUOUS", params: { count: found.length }, options: found.slice(0, 8).map(row => ({ value: row.name, label: `${row.name} · ${row.kind} · ${row.language}` })) }]);
  return found[0] ?? null;
}
const sameDraft = (row: NonNullable<Awaited<ReturnType<typeof existingTemplate>>>, input: TemplateInput) => {
  const draft = draftOf(row.layoutJson);
  return row.kind === input.kind && row.language === input.language && row.pageSize === pageOf(input) && row.requiresApproval === approvalOf(input) && row.name === input.name && draft.title === input.title && draft.body === input.body;
};
const variablesOk = (body: string) => { try { usedVariables(body); } catch { throw new WorkflowError("DOMAIN_REFUSED", { reason: "UNKNOWN_TEMPLATE_VARIABLE" }); } };

const CERTIFICATE_TEMPLATE_SAVE = defineCapability<TemplateInput>({
  key: "front_desk.certificate_template_save", version: 1, cluster: "C7", inventoryKeys: ["front_desk.certificate_template_save", "certificates.save_template"], risk: "CREATE", roles: DESK, class: "B",
  input: templateInput, evidence: ["/name"], humanFields: ["templateId"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Draft a certificate template", "Save the draft of a certificate or ID-card template. Nothing can be issued from it until your campus admin approves a version.", "Draft an enrolment certificate in Urdu that says the pupil studies in their class this year"],
    ["مسودة قالب شهادة", "حفظ مسودة قالب شهادة أو بطاقة هوية. لا يُصدر منه شيء حتى يعتمد مدير الفرع نسخة.", "اكتب مسودة شهادة قيد بالعربية تذكر أن الطالب يدرس في صفه هذا العام"],
    ["سرٹیفکیٹ کا مسودہ سانچہ", "سرٹیفکیٹ یا شناختی کارڈ کے سانچے کا مسودہ محفوظ کریں۔ کیمپس ایڈمن کی منظوری تک اس سے کچھ جاری نہیں ہوتا۔", "اردو میں داخلہ سرٹیفکیٹ کا مسودہ بنائیں کہ طالب علم اس سال اپنی کلاس میں پڑھ رہا ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/front-desk/certificates (action=save-template)", service: "src/lib/certificates/service.ts:saveTemplate", reuse: "direct" },
  async resolve(ctx, input) {
    variablesOk(input.body);
    const existing = await existingTemplate(ctx, input);
    return { ...input, templateId: existing?.id };
  },
  async preview(ctx, input) {
    const existing = await existingTemplate(ctx, input);
    return {
      title: say(ctx, existing ? l("Edit a template draft", "تعديل مسودة قالب", "سانچے کا مسودہ بدلیں") : l("Draft a certificate template", "مسودة قالب شهادة", "سرٹیفکیٹ کا مسودہ سانچہ")),
      lines: [
        { label: say(ctx, l("Name", "الاسم", "نام")), value: input.name },
        { label: say(ctx, l("Kind", "النوع", "قسم")), value: input.kind === "ID_CARD" ? say(ctx, l("ID card", "بطاقة هوية", "شناختی کارڈ")) : say(ctx, l("Certificate", "شهادة", "سرٹیفکیٹ")) },
        { label: say(ctx, l("Title", "العنوان", "عنوان")), value: input.title },
        { label: say(ctx, l("Text", "النص", "متن")), value: input.body },
        { label: say(ctx, l("Approval", "الاعتماد", "منظوری")), value: say(ctx, l("A draft: your campus admin approves it before anything is issued", "مسودة: يعتمدها مدير الفرع قبل أي إصدار", "مسودہ: جاری کرنے سے پہلے کیمپس ایڈمن منظوری دیں گے")) },
      ],
      counts: { templates: 1 },
      basis: { input, draftVersion: existing?.draftVersion ?? null },
    };
  },
  async execute(ctx, input) {
    const campusId = ownCampusId(ctx);
    variablesOk(input.body);
    const existing = await existingTemplate(ctx, input);
    // No key in the domain: the same draft already on file is this run's earlier save.
    if (existing && sameDraft(existing, input)) return reconciledReceipt("front_desk.certificate_template_save", [{ model: "certificateTemplate", id: existing.id }], link(ctx.user.role, "certificates"), { draftVersion: existing.draftVersion });
    const saved = await saveTemplate(ctx.user, campusId, { ...(existing ? { id: existing.id } : {}), kind: input.kind, name: input.name, language: input.language, pageSize: pageOf(input), title: input.title, body: input.body, requiresApproval: approvalOf(input) }).catch(domain);
    return { kind: "draft", capability: "front_desk.certificate_template_save", entities: [{ model: "certificateTemplate", id: saved.id }], counts: { created: existing ? 0 : 1, updated: existing ? 1 : 0 }, link: link(ctx.user.role, "certificates"), replayed: false, detail: { draftVersion: saved.draftVersion, approvedVersion: saved.currentVersion } };
  },
});

// ─── class C hand-offs ────────────────────────────────────────────────────

const CERTIFICATE_ISSUE = defineCapability<DocumentInput>({
  key: "front_desk.certificate_issue", version: 1, cluster: "C7", inventoryKeys: ["front_desk.certificate_issue", "certificates.issue"], risk: "CREATE", roles: DESK, class: "C",
  input: documentInput, evidence: ["/student"], humanFields: ["templateId", "studentId"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Issue a certificate", "Open Documents with the pupil and the approved template picked out, so you check the preview and issue it yourself. A template that needs approval goes to your campus admin.", "Issue an enrolment certificate for Hamza Ali, 7B"],
    ["إصدار شهادة", "فتح شاشة الوثائق مع الطالب والقالب المعتمد محددين، لتراجع المعاينة وتصدرها بنفسك. القالب الذي يحتاج اعتماداً يذهب لمدير الفرع.", "أصدر شهادة قيد لحمزة علي، 7ب"],
    ["سرٹیفکیٹ جاری کریں", "دستاویزات کی اسکرین طالب علم اور منظور شدہ سانچے کے ساتھ کھولیں تاکہ آپ دیکھ کر خود جاری کریں۔ منظوری والا سانچہ کیمپس ایڈمن کے پاس جاتا ہے۔", "حمزہ علی، 7بی کا داخلہ سرٹیفکیٹ جاری کر دیں"],
  ),
  source: { route: "POST /api/front-desk/certificates (action=issue)", service: "src/lib/certificates/service.ts:requestIssue (from the Documents screen)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const template = await bindTemplate(ctx, input.template, input.templateId, true);
    const pupil = await bindPupil(ctx, input.student, input.studentId);
    return { ...input, templateId: template.id, studentId: pupil.id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const template = await bindTemplate(ctx, input.template, input.templateId, true);
      const pupil = await bindPupil(ctx, input.student, input.studentId);
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: `${link(ctx.user.role, "certificates")}&template=${encodeURIComponent(template.id)}&student=${encodeURIComponent(pupil.id)}`, prefill: { templateId: template.id, studentId: pupil.id }, detail: { requiresApproval: template.requiresApproval && !isLeader(ctx.user) } };
    },
  },
});

const templateApproveInput = z.strictObject({ template: NAME, templateId: id().optional() });
type TemplateApproveInput = z.infer<typeof templateApproveInput>;

const CERTIFICATE_TEMPLATE_APPROVE = defineCapability<TemplateApproveInput>({
  key: "front_desk.request_template_approval", version: 1, cluster: "C7", inventoryKeys: ["front_desk.request_template_approval"], risk: "APPROVAL_DECISION", roles: DESK, class: "C",
  input: templateApproveInput, evidence: ["/template"], humanFields: ["templateId"],
  gates: deskGates("front-desk", "add"), scope: { kind: "own-campus" },
  copy: c(
    ["Send a template for approval", "Ask your campus admin to approve a certificate or ID-card template draft. Only they can approve it.", "Send the enrolment certificate template for approval"],
    ["إرسال قالب للاعتماد", "طلب اعتماد مسودة قالب شهادة أو بطاقة من مدير الفرع. هو وحده يعتمدها.", "أرسل قالب شهادة القيد للاعتماد"],
    ["سانچہ منظوری کے لیے بھیجیں", "کیمپس ایڈمن سے سرٹیفکیٹ یا کارڈ کے مسودہ سانچے کی منظوری مانگیں۔ منظوری صرف وہی دے سکتے ہیں۔", "داخلہ سرٹیفکیٹ کا سانچہ منظوری کے لیے بھیج دیں"],
  ),
  source: { route: "POST /api/front-desk/certificates (action=approve-template)", service: "src/lib/certificates/service.ts:approveTemplate (campus admin, Documents screen)", reuse: "handoff-only" },
  async resolve(ctx, input) { const template = await bindTemplate(ctx, input.template, input.templateId, false); return { ...input, templateId: template.id }; },
  handoff: {
    kind: "RECORD_APPROVAL",
    async prepare(ctx, input) {
      const template = await bindTemplate(ctx, input.template, input.templateId, false);
      return { kind: "RECORD_APPROVAL", targetRoles: LEADERS, link: `${OPERATOR.certificates}&template=${encodeURIComponent(template.id)}`, prefill: { recordId: template.id, version: template.draftVersion }, detail: { approvedVersion: template.currentVersion } };
    },
  },
});

const complaintAssignInput = z.strictObject({
  /** The case: its CMP- reference, or the category or complainant as named. */
  complaint: NAME,
  /** The colleague to own it, by name (CAMPUS_ADMIN, ADMIN or RECEPTIONIST). */
  owner: NAME.optional(),
  dueDate: DAY.optional(),
  complaintId: id().optional(),
  ownerId: id().optional(),
});
type ComplaintAssignInput = z.infer<typeof complaintAssignInput>;

async function bindComplaint(ctx: CapabilityContext, said: string, complaintId: string | undefined) {
  const campusId = ownCampusId(ctx);
  const where = { schoolId: ctx.user.schoolId, campusId, AND: [visibleWhere(ctx.user)] };
  const select = { id: true, referenceCode: true, type: true, complainantName: true, confidential: true, version: true, status: true } as const;
  if (complaintId) { const bound = await prisma.complaint.findFirst({ where: { ...where, id: complaintId }, select }); if (!bound) throw new WorkflowError("SCOPE_DENIED"); return bound; }
  const reference = said.trim().toUpperCase().match(/CMP-[0-9A-F]{8}/)?.[0];
  const rows = await prisma.complaint.findMany({ where: { ...where, status: { not: "RESOLVED" }, ...(reference ? { referenceCode: reference } : {}) }, select, orderBy: { date: "desc" }, take: 300 });
  const found = reference ? rows : byName(rows, said, row => [row.complainantName, row.type], row => [row.referenceCode]);
  return one(found, "/complaint", "COMPLAINT_NOT_FOUND", "COMPLAINT_AMBIGUOUS", row => ({ value: row.referenceCode ?? "", label: row.confidential ? `${row.referenceCode}` : `${row.referenceCode} · ${row.type} · ${row.complainantName}` }));
}

const COMPLAINT_ASSIGN = defineCapability<ComplaintAssignInput>({
  key: "front_desk.complaint_assign", version: 1, cluster: "C7", inventoryKeys: ["front_desk.complaint_assign"], risk: "UPDATE", roles: DESK, class: "C",
  input: complaintAssignInput, evidence: ["/complaint"], humanFields: ["complaintId", "ownerId"],
  gates: deskGates("front-desk", "edit"), scope: { kind: "own-campus" },
  copy: c(
    ["Assign a complaint", "Open the complaint with the owner and reply date picked out, so you assign it yourself. Confidential concerns are assigned by a campus leader.", "Give the canteen complaint to the admin, reply by Friday"],
    ["إسناد شكوى", "فتح الشكوى مع المسؤول وموعد الرد محددين لتسندها بنفسك. الشكاوى السرية يسندها قائد الفرع.", "أسند شكوى المقصف إلى الإدارة، والرد قبل الجمعة"],
    ["شکایت سپرد کریں", "شکایت ذمہ دار اور جواب کی تاریخ کے ساتھ کھولیں تاکہ آپ خود سپرد کریں۔ خفیہ شکایات کیمپس قیادت سپرد کرتی ہے۔", "کینٹین والی شکایت ایڈمن کو دے دیں، جمعہ تک جواب"],
  ),
  source: { route: "PATCH /api/front-desk/complaints", service: "src/lib/front-desk/complaints.ts:act assign (from the Complaints screen)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const complaint = await bindComplaint(ctx, input.complaint, input.complaintId);
    const owner = input.owner ? await bindOwner(ctx, input.owner, "/owner") : null;
    return { ...input, complaintId: complaint.id, ownerId: owner?.id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const complaint = await bindComplaint(ctx, input.complaint, input.complaintId);
      const owner = input.ownerId ? (await ownerCandidates(ctx.user, ownCampusId(ctx))).find(row => row.id === input.ownerId) : null;
      if (input.ownerId && !owner) throw new WorkflowError("SCOPE_DENIED");
      // A confidential case is assigned by a campus leader; reception never learns more than its code.
      const leaders = complaint.confidential && !isLeader(ctx.user);
      return { kind: "DOMAIN_SCREEN", targetRoles: leaders ? LEADERS : [], link: `${leaders ? OPERATOR.complaints : link(ctx.user.role, "complaints")}&id=${encodeURIComponent(complaint.id)}`,
        prefill: { recordId: complaint.id, version: complaint.version, action: "assign", ...(owner ? { ownerId: owner.id } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}) }, detail: { referenceCode: complaint.referenceCode } };
    },
  },
});

const gateInput = z.strictObject({});
type GateInput = z.infer<typeof gateInput>;

const PICKUP_GATE_RELEASE = defineCapability<GateInput>({
  key: "pickup.gate_release", version: 1, cluster: "C7", inventoryKeys: ["pickup.gate_release"], risk: "UPDATE", roles: DESK, class: "C",
  input: gateInput, evidence: [],
  gates: gateGates, scope: { kind: "own-campus" },
  copy: c(
    ["Release a child at the gate", "Opens Pickup at the gate. Releasing a child needs the code scanned and the collector's identity checked in person; the AI never releases a child.", "Ali's uncle is at the gate, let him take Ali"],
    ["تسليم طالب عند البوابة", "يفتح شاشة الاستلام عند البوابة. تسليم الطالب يتطلب مسح الرمز والتحقق من هوية المستلم شخصياً؛ الذكاء الاصطناعي لا يسلّم طالباً أبداً.", "عم علي عند البوابة، دعه يأخذ علي"],
    ["گیٹ پر بچے کی حوالگی", "گیٹ والی پک اپ اسکرین کھولتا ہے۔ بچے کی حوالگی کے لیے کوڈ اسکین اور لینے والے کی شناخت خود دیکھنا ضروری ہے؛ اے آئی کبھی بچہ حوالے نہیں کرتا۔", "علی کے چچا گیٹ پر ہیں، علی کو ان کے ساتھ بھیج دیں"],
  ),
  source: { route: "POST /api/pickup/gate (action=release)", service: "src/lib/pickup/service.ts:release (scan and identity check at the gate)", reuse: "handoff-only" },
  handoff: {
    kind: "DEEP_LINK",
    // Nothing about the child, the collector or a code enters the prefill: the gate screen scans and checks.
    async prepare(ctx) { ownCampusId(ctx); return { kind: "DEEP_LINK", targetRoles: [], link: link(ctx.user.role, "pickup"), prefill: {} }; },
  },
});

export const FRONT_DESK_ENTRIES: readonly CapabilityEntry[] = [
  POSTAL_LOG, CERTIFICATE_PREVIEW,
  VISITOR_CHECK_IN, VISITOR_CHECK_OUT, CALLBACK_COMPLETE, CALLBACK_RESCHEDULE, ENQUIRY_CREATE, ENQUIRY_UPDATE, START_APPLICATION, SAVE_ANSWERS, COMPLAINT_INTAKE, CERTIFICATE_TEMPLATE_SAVE,
  CERTIFICATE_ISSUE, COMPLAINT_ASSIGN, PICKUP_GATE_RELEASE, CERTIFICATE_TEMPLATE_APPROVE,
];

