import { z } from "zod";
import type { UserRole } from "@/lib/roles";
import { isStaffRole } from "@/lib/roles";
import { prisma } from "@/lib/db/prisma";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { getActiveAcademicYear } from "@/lib/academic/cycle";
import { getLeaveBalances, rangeTenths, tenthsToDays } from "@/lib/leave";
import { applyLeave, findOverlappingLeave } from "@/lib/leave/apply-command";
import { createWindow } from "@/lib/meetings/service";
import { minutes } from "@/lib/meetings/time";
import { prepareDigest, weekStartOf } from "@/lib/family/digests";
import { defineCapability } from "../../define";
import { CLASS_A_ALLOWLIST } from "../../floors";
import { ownCampus, predicate, roles } from "../../gates";
import { InputRequired, WorkflowError, type RequiredField } from "../../../errors";
import { assignedClass, assignedClassWhere, classLabel } from "../../../resolve/scope";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * Teacher STAFF/SELF capabilities: their own leave, family meeting windows, a request to the academic lead
 * to fix their readiness (class/subject assignment), and the weekly family digest. Every write calls the
 * same command the screen's route calls; decisions (leave approval, assignment changes, sending to
 * families) stay with the person and screen that already make them.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const say = (ctx: CapabilityContext, text: L10n) => text[ctx.locale] ?? text.en;
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };

/** The job's campus must be the actor's own (mirrors resolveCampusId for non-group roles). */
function ownCampusId(ctx: CapabilityContext) {
  if (!ctx.campusId || (ctx.user.role !== "SUPER_ADMIN" && ctx.campusId !== ctx.user.campusId)) throw new WorkflowError("SCOPE_DENIED");
  return ctx.campusId;
}
async function schoolToday(ctx: CapabilityContext) {
  const { timezone } = await getLocalePackage(ctx.user.schoolId, ctx.campusId);
  return { timezone, today: calendarDateIn(timezone, ctx.now) };
}

// ─── leave.apply ──────────────────────────────────────────────────────────

/** Every member of staff may apply (POST /api/leave: isStaffRole). */
const LEAVE_ROLES: readonly UserRole[] = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"];
const leaveInput = z.strictObject({
  /** The user's words ("sick", "casual leave"); bound to one of the campus's leave types in `resolve`. */
  leaveType: z.string().trim().min(1).max(80),
  from: DAY,
  to: DAY,
  reason: z.string().trim().min(2).max(2000),
  /** Bound by the server from `leaveType`; never taken from the model. */
  leaveTypeId: z.string().min(1).max(64).optional(),
});
type LeaveInput = z.infer<typeof leaveInput>;

/** The route's day normalisation (new Date(day) then local midnight), so overlap and balance agree with it. */
function leaveRange(input: Pick<LeaveInput, "from" | "to">) {
  const start = new Date(input.from); start.setHours(0, 0, 0, 0);
  const end = new Date(input.to); end.setHours(0, 0, 0, 0);
  return { start, end };
}
const norm = (text: string) => text.toLocaleLowerCase().replace(/\bleaves?\b/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function matchLeaveType<T extends { id: string; name: string }>(types: readonly T[], said: string): T[] {
  const wanted = norm(said);
  const exact = types.filter(type => type.name.toLocaleLowerCase() === said.toLocaleLowerCase() || norm(type.name) === wanted);
  if (exact.length || !wanted) return exact;
  return types.filter(type => { const name = norm(type.name); return Boolean(name) && (name.includes(wanted) || wanted.includes(name)); });
}

async function identicalLeave(campusId: string, userId: string, leaveTypeId: string, input: LeaveInput) {
  const { start, end } = leaveRange(input);
  return prisma.leaveRequest.findFirst({ where: { campusId, userId, leaveTypeId, fromDate: start, toDate: end, status: { in: ["PENDING", "APPROVED"] } }, select: { id: true, status: true } });
}

const leaveLink = (ctx: CapabilityContext) => ctx.user.role === "TEACHER" ? "/teacher/leave" : null;

const LEAVE_APPLY = defineCapability<LeaveInput>({
  key: "leave.apply", version: 1, cluster: "PERSONAL", inventoryKeys: ["leave.apply"], risk: "CREATE", roles: LEAVE_ROLES, class: "B",
  input: leaveInput, evidence: ["/from", "/to", "/reason"], humanFields: ["leaveTypeId"],
  gates: [predicate("isStaffRole", user => isStaffRole(user.role), LEAVE_ROLES), ownCampus()], scope: { kind: "self" },
  copy: c(
    ["Apply for leave", "Send your own leave request to your reviewer; the reviewer approves or declines it.", "Apply for sick leave on 3 and 4 November, I have a fever"],
    ["طلب إجازة", "إرسال طلب إجازتك إلى المراجع؛ القرار بالموافقة أو الرفض له.", "قدّم طلب إجازة مرضية يومي 3 و4 نوفمبر، عندي حمى"],
    ["چھٹی کی درخواست دیں", "اپنی چھٹی کی درخواست جائزہ لینے والے کو بھیجیں؛ منظوری یا انکار انہی کا فیصلہ ہے۔", "3 اور 4 نومبر کی بیماری کی چھٹی لگا دیں، مجھے بخار ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/leave", service: "src/lib/leave/apply-command.ts:applyLeave", reuse: "extracted" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    const unclear: RequiredField[] = [];
    if (!isRealDay(input.from)) unclear.push({ pointer: "/from", promptKey: "DATE_INVALID" });
    if (!isRealDay(input.to)) unclear.push({ pointer: "/to", promptKey: "DATE_INVALID" });
    if (!unclear.length && input.to < input.from) unclear.push({ pointer: "/to", promptKey: "LEAVE_TO_BEFORE_FROM" });
    const types = await prisma.leaveType.findMany({ where: { campusId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    if (!types.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_LEAVE_TYPES" });
    const matched = matchLeaveType(types, input.leaveType);
    if (matched.length !== 1) unclear.push({ pointer: "/leaveType", promptKey: matched.length ? "LEAVE_TYPE_AMBIGUOUS" : "LEAVE_TYPE_NOT_FOUND", params: { count: types.length }, options: (matched.length ? matched : types).slice(0, 8).map(type => ({ value: type.name, label: type.name })) });
    if (unclear.length) throw new InputRequired(unclear);
    const type = matched[0];
    const bound = { ...input, leaveType: type.name, leaveTypeId: type.id };
    // The route's overlap guard, asked before the preview: an identical request is this step's own replay
    // (reconciled in execute); any other overlapping request is refused.
    const { start, end } = leaveRange(input);
    const overlap = await findOverlappingLeave(campusId, ctx.user.userId, start, end);
    if (overlap && !(await identicalLeave(campusId, ctx.user.userId, type.id, bound))) {
      throw new WorkflowError("DOMAIN_REFUSED", { reason: "LEAVE_OVERLAP", status: overlap.status, from: overlap.fromDate.toISOString().slice(0, 10), to: overlap.toDate.toISOString().slice(0, 10) });
    }
    return bound;
  },
  async preview(ctx, input) {
    const campusId = ownCampusId(ctx);
    if (!input.leaveTypeId) throw new WorkflowError("INVALID_INPUT");
    const { start, end } = leaveRange(input);
    const requested = rangeTenths(start, end);
    const year = await getActiveAcademicYear(campusId);
    const balance = (await getLeaveBalances(campusId, ctx.user.userId, ctx.user.role, year)).find(row => row.leaveTypeId === input.leaveTypeId) ?? null;
    const existing = await identicalLeave(campusId, ctx.user.userId, input.leaveTypeId, input);
    const days = tenthsToDays(requested);
    const balanceLine = !balance || balance.allocated === 0
      ? say(ctx, l("No allowance is set for this leave type; your reviewer decides.", "لا يوجد رصيد محدد لهذا النوع؛ القرار للمراجع.", "اس قسم کی چھٹی کا کوٹہ مقرر نہیں؛ فیصلہ جائزہ لینے والے کا ہے۔"))
      : `${tenthsToDays(balance.remaining)} / ${tenthsToDays(balance.allocated)}${balance.pending ? ` · ${say(ctx, l("pending", "قيد الانتظار", "زیر التوا"))} ${tenthsToDays(balance.pending)}` : ""}${requested > balance.remaining ? ` · ${say(ctx, l("this request is more than your remaining balance", "هذا الطلب أكثر من رصيدك المتبقي", "یہ درخواست بقیہ کوٹے سے زیادہ ہے"))}` : ""}`;
    return {
      title: say(ctx, l("Apply for leave", "طلب إجازة", "چھٹی کی درخواست")),
      lines: [
        { label: say(ctx, l("Leave type", "نوع الإجازة", "چھٹی کی قسم")), value: input.leaveType },
        { label: say(ctx, l("From", "من", "سے")), value: input.from },
        { label: say(ctx, l("To", "إلى", "تک")), value: input.to },
        { label: say(ctx, l("Days", "الأيام", "دن")), value: String(days) },
        { label: say(ctx, l("Reason", "السبب", "وجہ")), value: input.reason },
        { label: say(ctx, l("Balance left", "الرصيد المتبقي", "بقیہ کوٹہ")), value: balanceLine },
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: existing
          ? say(ctx, l("This request is already on file; nothing new is sent.", "هذا الطلب مسجل مسبقاً؛ لن يُرسل شيء جديد.", "یہ درخواست پہلے سے درج ہے؛ کچھ نیا نہیں بھیجا جائے گا۔"))
          : say(ctx, l("Your reviewer is notified. Approval stays with the reviewer.", "يُبلَّغ المراجع. الموافقة تبقى قراره.", "جائزہ لینے والے کو اطلاع جائے گی۔ منظوری انہی کا فیصلہ ہے۔")) },
      ],
      counts: { requests: existing ? 0 : 1, dayTenths: requested },
      confirmLabel: `${say(ctx, l("Send leave request", "إرسال طلب الإجازة", "چھٹی کی درخواست بھیجیں"))} · ${days}`,
      basis: { input, balance, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const campusId = ownCampusId(ctx);
    if (!input.leaveTypeId) throw new WorkflowError("INVALID_INPUT");
    const existing = await identicalLeave(campusId, ctx.user.userId, input.leaveTypeId, input);
    if (existing) return { kind: "write", capability: "leave.apply", entities: [{ model: "leaveRequest", id: existing.id }], counts: { requests: 0 }, link: leaveLink(ctx), replayed: false, detail: { reconciled: true, status: existing.status } };
    const request = await applyLeave(ctx.user, { campusId, leaveTypeId: input.leaveTypeId, fromDate: input.from, toDate: input.to, reason: input.reason });
    return { kind: "write", capability: "leave.apply", entities: [{ model: "leaveRequest", id: request.id }], counts: { requests: 1, dayTenths: request.days }, link: leaveLink(ctx), replayed: false, detail: { status: request.status } };
  },
});

// ─── meetings.open_window ─────────────────────────────────────────────────

const windowInput = z.strictObject({
  date: DAY,
  start: TIME,
  end: TIME,
  slotMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
  /** The route's default is IN_PERSON. */
  mode: z.enum(["IN_PERSON", "REMOTE", "EITHER"]).default("IN_PERSON"),
  /** Required by the route unless the meetings are remote; no default. */
  location: z.string().trim().min(1).max(200).optional(),
  /** Required by the route; no default. */
  cancellationPolicy: z.string().trim().min(1).max(500).optional(),
  /** The route's default is 0. */
  bufferMinutes: z.number().int().min(0).max(60).optional(),
  /** The route's default is no limit. */
  maxBookings: z.number().int().min(1).max(200).optional(),
});
type WindowInput = z.infer<typeof windowInput>;

function slotStarts(input: { start: string; end: string; slotMinutes: number; bufferMinutes?: number }) {
  const out: number[] = [];
  for (let t = minutes(input.start); t + input.slotMinutes <= minutes(input.end); t += input.slotMinutes + (input.bufferMinutes ?? 0)) out.push(t);
  return out;
}
const isoWeekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;

/** The teacher's own OPEN windows that day whose time overlaps this one, other than one starting at the same time. */
async function overlappingWindow(ctx: CapabilityContext, input: WindowInput) {
  const windows = await prisma.meetingWindow.findMany({ where: { schoolId: ctx.user.schoolId, teacherId: ctx.user.userId, localDate: input.date, status: "OPEN" }, select: { id: true, startTime: true, endTime: true } });
  return windows.find(row => row.startTime !== input.start && minutes(row.startTime) < minutes(input.end) && minutes(input.start) < minutes(row.endTime)) ?? null;
}
const sameWindow = (ctx: CapabilityContext, input: WindowInput) =>
  prisma.meetingWindow.findFirst({ where: { schoolId: ctx.user.schoolId, teacherId: ctx.user.userId, localDate: input.date, startTime: input.start, status: "OPEN" }, select: { id: true, endTime: true, slotMinutes: true, bufferMinutes: true } });

const OPEN_WINDOW = defineCapability<WindowInput>({
  key: "meetings.open_window", version: 1, cluster: "PERSONAL", inventoryKeys: ["meetings.open_window"], risk: "CREATE", roles: ["TEACHER"], class: "B",
  input: windowInput, evidence: ["/date", "/start", "/end"],
  gates: [roles(["TEACHER"]), ownCampus()], scope: { kind: "self" },
  copy: c(
    ["Offer parent meeting slots", "Open a window of meeting times that families of your pupils can book.", "Open 15-minute parent meeting slots on Thursday from 2 to 4 in room 12"],
    ["إتاحة مواعيد لقاء أولياء الأمور", "فتح فترة مواعيد يحجزها أولياء أمور طلابك.", "افتح مواعيد لقاء مدتها 15 دقيقة يوم الخميس من 2 إلى 4 في القاعة 12"],
    ["والدین سے ملاقات کے اوقات دیں", "ملاقات کا وقت کھولیں جسے آپ کے طلبہ کے والدین بک کر سکیں۔", "جمعرات کو 2 سے 4 بجے کمرہ 12 میں 15 منٹ کی والدین ملاقاتیں کھول دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/meetings", service: "src/lib/meetings/service.ts:createWindow", reuse: "direct" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    const unclear: RequiredField[] = [];
    const { today } = await schoolToday(ctx);
    if (!isRealDay(input.date)) unclear.push({ pointer: "/date", promptKey: "DATE_INVALID" });
    else if (input.date < today) unclear.push({ pointer: "/date", promptKey: "MEETING_DATE_PAST" });
    if (minutes(input.end) <= minutes(input.start)) unclear.push({ pointer: "/end", promptKey: "MEETING_END_BEFORE_START" });
    else if (!slotStarts(input).length) unclear.push({ pointer: "/slotMinutes", promptKey: "MEETING_WINDOW_TOO_SHORT" });
    if (input.mode !== "REMOTE" && !input.location) unclear.push({ pointer: "/location", promptKey: "MEETING_LOCATION_NEEDED" });
    if (!input.cancellationPolicy) unclear.push({ pointer: "/cancellationPolicy", promptKey: "MEETING_CANCELLATION_POLICY_NEEDED" });
    if (unclear.length) throw new InputRequired(unclear);
    const overlap = await overlappingWindow(ctx, input);
    if (overlap) throw new WorkflowError("DOMAIN_REFUSED", { reason: "WINDOW_OVERLAP", start: overlap.startTime, end: overlap.endTime });
    return input;
  },
  async preview(ctx, input) {
    ownCampusId(ctx);
    const starts = slotStarts(input);
    const [lessons, leave, classes, existing] = await Promise.all([
      prisma.timetableSlot.findMany({ where: { schoolId: ctx.user.schoolId, teacherId: ctx.user.userId, slotType: "CLASS", dayOfWeek: isoWeekday(input.date), timetable: { status: "PUBLISHED" } }, select: { startTime: true, endTime: true } }),
      prisma.leaveRequest.count({ where: { schoolId: ctx.user.schoolId, userId: ctx.user.userId, status: "APPROVED", fromDate: { lte: new Date(`${input.date}T23:59:59Z`) }, toDate: { gte: new Date(`${input.date}T00:00:00Z`) } } }),
      prisma.class.count({ where: { schoolId: ctx.user.schoolId, campusId: ctx.campusId!, archivedAt: null, ...assignedClassWhere(ctx.user) } }),
      sameWindow(ctx, input),
    ]);
    // The same rule the meeting desk applies to each slot (src/lib/meetings/service.ts windowSlots): a slot
    // during a published lesson, or on a day of approved leave, is not offered to families.
    const busy = lessons.filter(row => /^\d{2}:\d{2}$/.test(row.startTime) && /^\d{2}:\d{2}$/.test(row.endTime));
    const blocked = leave ? starts.length : starts.filter(t => busy.some(row => minutes(row.startTime) < t + input.slotMinutes && t < minutes(row.endTime))).length;
    const modeLabel = { IN_PERSON: l("In person", "حضورياً", "بالمشافہ"), REMOTE: l("Remote", "عن بُعد", "آن لائن"), EITHER: l("In person or remote", "حضورياً أو عن بُعد", "بالمشافہ یا آن لائن") }[input.mode];
    return {
      title: say(ctx, l("Open parent meeting slots", "فتح مواعيد لقاء أولياء الأمور", "والدین کی ملاقات کے اوقات کھولیں")),
      lines: [
        { label: say(ctx, l("Date", "التاريخ", "تاریخ")), value: input.date },
        { label: say(ctx, l("Time", "الوقت", "وقت")), value: `${input.start} – ${input.end}` },
        { label: say(ctx, l("Slots", "المواعيد", "اوقات")), value: `${starts.length} × ${input.slotMinutes} ${say(ctx, l("min", "دقيقة", "منٹ"))}${blocked ? ` · ${blocked} ${say(ctx, l("hidden by your lessons or leave", "مخفية بسبب حصصك أو إجازتك", "آپ کی کلاسوں یا چھٹی کی وجہ سے چھپے رہیں گے"))}` : ""}` },
        { label: say(ctx, l("Mode", "الطريقة", "طریقہ")), value: say(ctx, modeLabel) },
        ...(input.location ? [{ label: say(ctx, l("Where", "المكان", "جگہ")), value: input.location }] : []),
        { label: say(ctx, l("Cancellation", "الإلغاء", "منسوخی")), value: input.cancellationPolicy ?? "" },
        { label: say(ctx, l("Who can book", "من يمكنه الحجز", "کون بک کر سکتا ہے")), value: `${say(ctx, l("Families of pupils in your classes", "أسر طلاب فصولك", "آپ کی کلاسوں کے طلبہ کے والدین"))} (${classes})` },
        ...(existing ? [{ label: say(ctx, l("Already open", "مفتوحة مسبقاً", "پہلے سے کھلا ہے")), value: say(ctx, l("A window starting at this time is already open; nothing new is created.", "توجد فترة تبدأ في هذا الوقت؛ لن يُنشأ شيء جديد.", "اس وقت شروع ہونے والا وقت پہلے سے کھلا ہے؛ کچھ نیا نہیں بنے گا۔")) }] : []),
      ],
      counts: { slots: starts.length, blocked, classes },
      confirmLabel: `${say(ctx, l("Open slots", "فتح المواعيد", "اوقات کھولیں"))} · ${starts.length}`,
      basis: { input, existing: existing?.id ?? null, blocked },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    ownCampusId(ctx);
    const existing = await sameWindow(ctx, input);
    if (existing) return { kind: "write", capability: "meetings.open_window", entities: [{ model: "meetingWindow", id: existing.id }], counts: { slots: slotStarts({ start: input.start, end: existing.endTime, slotMinutes: existing.slotMinutes, bufferMinutes: existing.bufferMinutes }).length }, link: "/teacher/calendar", replayed: false, detail: { reconciled: true } };
    const overlap = await overlappingWindow(ctx, input);
    if (overlap) throw new WorkflowError("DOMAIN_REFUSED", { reason: "WINDOW_OVERLAP", start: overlap.startTime, end: overlap.endTime });
    const window = await createWindow(ctx.user, { localDate: input.date, startTime: input.start, endTime: input.end, slotMinutes: input.slotMinutes, bufferMinutes: input.bufferMinutes ?? 0, maxBookings: input.maxBookings ?? null, mode: input.mode, location: input.location ?? null, cancellationPolicy: input.cancellationPolicy ?? null });
    return { kind: "write", capability: "meetings.open_window", entities: [{ model: "meetingWindow", id: window.id }], counts: { slots: slotStarts(input).length }, link: "/teacher/calendar", replayed: false };
  },
});

// ─── readiness.update_task ────────────────────────────────────────────────

/**
 * ReadinessTask rows are created and assigned only by the implementation lead (src/lib/readiness/service.ts
 * updateReadinessTask), so a teacher's request becomes a ROLE_TASK hand-off to the academic lead roles.
 * It names no owner: the lead decides who fixes it, and the teacher never assigns themself.
 */
const ACADEMIC_LEAD_ROLES: readonly UserRole[] = ["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"];
const readinessInput = z.strictObject({
  /** The user's own words: what is wrong with their set-up. */
  request: z.string().trim().min(5).max(500),
  topic: z.enum(["CLASS_ASSIGNMENT", "SUBJECT_ASSIGNMENT", "TIMETABLE", "OTHER"]).default("OTHER"),
  classId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
});
type ReadinessInput = z.infer<typeof readinessInput>;

const READINESS_TASK = defineCapability<ReadinessInput>({
  key: "readiness.update_task", version: 1, cluster: "PERSONAL", inventoryKeys: ["readiness.update_task"], risk: "UPDATE", roles: ["TEACHER"], class: "C",
  input: readinessInput, evidence: ["/request"],
  gates: [roles(["TEACHER"]), ownCampus()], scope: { kind: "self" },
  copy: c(
    ["Ask the academic lead to fix my set-up", "Send a task to the principal or campus admin to correct your class, subject or timetable assignment.", "Tell the principal I should be the class teacher of 7B, not 7A"],
    ["طلب تصحيح إعداداتي من القيادة الأكاديمية", "إرسال مهمة للمدير أو مسؤول الحرم لتصحيح فصلك أو مادتك أو جدولك.", "أبلغ المدير أنني يجب أن أكون معلمة فصل 7ب وليس 7أ"],
    ["تعلیمی سربراہ سے میری ترتیب درست کروائیں", "پرنسپل یا کیمپس ایڈمن کو اپنی کلاس، مضمون یا ٹائم ٹیبل کی تقرری درست کرنے کا کام بھیجیں۔", "پرنسپل کو بتائیں کہ میں 7اے نہیں بلکہ 7بی کی کلاس ٹیچر ہوں"],
  ),
  source: { route: "POST /api/readiness", service: "src/lib/ai-workflows/executor/step-runner.ts:openHandoff (ROLE_TASK)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const campusId = ownCampusId(ctx);
    // The class or subject named may be one the teacher is not (yet) assigned to, so it is checked against
    // the campus, not the teacher's assignments.
    if (input.classId && !(await prisma.class.findFirst({ where: { id: input.classId, schoolId: ctx.user.schoolId, campusId, archivedAt: null }, select: { id: true } }))) throw new WorkflowError("SCOPE_DENIED");
    if (input.subjectId && !(await prisma.subject.findFirst({ where: { id: input.subjectId, class: { schoolId: ctx.user.schoolId, campusId, archivedAt: null } }, select: { id: true } }))) throw new WorkflowError("SCOPE_DENIED");
    return input;
  },
  handoff: {
    kind: "ROLE_TASK",
    async prepare(ctx, input) {
      const campusId = ownCampusId(ctx);
      const [classes, subjects, seats] = await Promise.all([
        prisma.class.count({ where: { schoolId: ctx.user.schoolId, campusId, archivedAt: null, classTeacherId: ctx.user.userId } }),
        prisma.subject.count({ where: { teacherId: ctx.user.userId, class: { schoolId: ctx.user.schoolId, campusId, archivedAt: null } } }),
        ctx.seats(),
      ]);
      return {
        kind: "ROLE_TASK", targetRoles: ACADEMIC_LEAD_ROLES,
        link: seats.principal ? "/principal?view=teachers" : "/admin?view=teachers",
        prefill: { request: input.request, topic: input.topic, teacherId: ctx.user.userId, ...(input.classId ? { classId: input.classId } : {}), ...(input.subjectId ? { subjectId: input.subjectId } : {}) },
        detail: { currentClassTeacherOf: classes, currentSubjects: subjects },
      };
    },
  },
});

// ─── digests.prepare / digests.send ───────────────────────────────────────

const digestInput = z.strictObject({ classId: z.string().min(1), week: DAY.optional() });
type DigestInput = z.infer<typeof digestInput>;
const DIGEST_LINK = "/teacher/calendar#weekly-family-update";

async function digestWeek(ctx: CapabilityContext, input: DigestInput) {
  const week = input.week ?? (await schoolToday(ctx)).today;
  if (!isRealDay(week)) throw new InputRequired([{ pointer: "/week", promptKey: "DATE_INVALID" }]);
  const weekStart = weekStartOf(week);
  if (weekStart.getTime() > ctx.now.getTime()) throw new InputRequired([{ pointer: "/week", promptKey: "DIGEST_WEEK_NOT_STARTED" }]);
  return { week, weekStart };
}

/** Class A once "digests.prepare" is in CLASS_A_ALLOWLIST (a draft only; nothing is sent); class B until then. */
const DIGEST_PREPARE_CLASS = CLASS_A_ALLOWLIST["digests.prepare"] ? "A" : "B";

const DIGEST_PREPARE = defineCapability<DigestInput>({
  key: "digests.prepare", version: 1, cluster: "C4", inventoryKeys: ["digests.prepare"], risk: "CREATE", roles: ["TEACHER"], class: DIGEST_PREPARE_CLASS,
  classOverride: "Builds an unsent draft only from evidence already released to families; sending is a separate reviewed step.",
  input: digestInput, evidence: [],
  gates: [roles(["TEACHER"]), ownCampus()], scope: { kind: "assigned-class" },
  copy: c(
    ["Prepare this week's family update", "Draft the weekly family update for your class from feedback, report cards and attendance already released to families. Nothing is sent.", "Prepare this week's family update for 5A"],
    ["تحضير تحديث الأسر لهذا الأسبوع", "مسودة التحديث الأسبوعي لفصلك من الملاحظات والشهادات والحضور المُعلن للأسر. لا يُرسل شيء.", "حضّر تحديث الأسر لهذا الأسبوع للصف 5أ"],
    ["اس ہفتے کی والدین اپ ڈیٹ تیار کریں", "والدین کو پہلے سے جاری فیڈبیک، رپورٹ کارڈ اور حاضری سے اپنی کلاس کی ہفتہ وار اپ ڈیٹ کا مسودہ بنائیں۔ کچھ بھیجا نہیں جائے گا۔", "5اے کی اس ہفتے کی والدین اپ ڈیٹ تیار کر دیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/digests", service: "src/lib/family/digests.ts:prepareDigest", reuse: "direct" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    await assignedClass(ctx, input.classId);
    const { week } = await digestWeek(ctx, input);
    return { ...input, week };
  },
  async preview(ctx, input) {
    const klass = await assignedClass(ctx, input.classId);
    const { weekStart } = await digestWeek(ctx, input);
    const [pupils, existing] = await Promise.all([
      prisma.student.count({ where: { schoolId: ctx.user.schoolId, classId: klass.id, archivedAt: null, status: "active" } }),
      prisma.familyDigest.findUnique({ where: { classId_weekStart: { classId: klass.id, weekStart } }, select: { id: true, status: true, version: true } }),
    ]);
    return {
      title: say(ctx, l("Prepare the weekly family update", "تحضير التحديث الأسبوعي للأسر", "ہفتہ وار والدین اپ ڈیٹ تیار کریں")),
      lines: [
        { label: say(ctx, l("Class", "الفصل", "کلاس")), value: classLabel(klass) },
        { label: say(ctx, l("Week of", "أسبوع", "ہفتہ")), value: weekStart.toISOString().slice(0, 10) },
        { label: say(ctx, l("Pupils", "الطلاب", "طلبہ")), value: String(pupils) },
        { label: say(ctx, l("Built from", "المصدر", "ماخذ")), value: say(ctx, l("Only feedback, report cards and attendance already released to families. Pupils with nothing released are left out.", "فقط الملاحظات والشهادات والحضور المُعلن للأسر. يُستبعد من لا شيء مُعلن له.", "صرف والدین کو پہلے سے جاری فیڈبیک، رپورٹ کارڈ اور حاضری۔ جن طلبہ کا کچھ جاری نہیں وہ شامل نہیں ہوں گے۔")) },
        { label: say(ctx, l("Sending", "الإرسال", "بھیجنا")), value: existing
          ? say(ctx, l("A draft for this week already exists; it is reopened, not sent.", "توجد مسودة لهذا الأسبوع؛ تُفتح ولا تُرسل.", "اس ہفتے کا مسودہ پہلے سے موجود ہے؛ وہی کھلے گا، بھیجا نہیں جائے گا۔"))
          : say(ctx, l("Nothing is sent. You review and approve it on the family update screen.", "لا يُرسل شيء. تراجعه وتعتمده في شاشة التحديث.", "کچھ نہیں بھیجا جائے گا۔ آپ اسے اپ ڈیٹ اسکرین پر دیکھ کر منظور کریں گے۔")) },
      ],
      counts: { pupils },
      basis: { input, existing },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    ownCampusId(ctx);
    await assignedClass(ctx, input.classId);
    const { week } = await digestWeek(ctx, input);
    const digest = await prepareDigest(ctx.user, { classId: input.classId, week });
    const [entries, included] = await Promise.all([
      prisma.familyDigestEntry.count({ where: { digestId: digest.id, schoolId: ctx.user.schoolId } }),
      prisma.familyDigestEntry.count({ where: { digestId: digest.id, schoolId: ctx.user.schoolId, skipped: false } }),
    ]);
    return { kind: "draft", capability: "digests.prepare", entities: [{ model: "familyDigest", id: digest.id }], counts: { entries, included }, link: DIGEST_LINK, replayed: false, detail: { status: digest.status, version: digest.version, weekStart: digest.weekStart.toISOString().slice(0, 10) } };
  },
});

const DIGEST_SEND = defineCapability<DigestInput>({
  key: "digests.send", version: 1, cluster: "C4", inventoryKeys: ["digests.send"], risk: "COMMUNICATION", roles: ["TEACHER"], class: "C",
  input: digestInput, evidence: [],
  gates: [roles(["TEACHER"]), ownCampus()], scope: { kind: "assigned-class" },
  copy: c(
    ["Send the weekly family update", "Approving and sending the family update happens on its review screen, where you check each child's section.", "Send this week's family update for 5A"],
    ["إرسال التحديث الأسبوعي للأسر", "الاعتماد والإرسال يتمان في شاشة المراجعة حيث تتحقق من قسم كل طالب.", "أرسل تحديث الأسر لهذا الأسبوع للصف 5أ"],
    ["ہفتہ وار والدین اپ ڈیٹ بھیجیں", "منظوری اور بھیجنا جائزہ اسکرین پر ہوتا ہے جہاں آپ ہر بچے کا حصہ دیکھتے ہیں۔", "5اے کی اس ہفتے کی والدین اپ ڈیٹ بھیج دیں"],
  ),
  source: { route: "PATCH /api/digests/[id]", service: "src/lib/family/digests.ts:approveDigest/dispatchDigest", reuse: "handoff-only" },
  async resolve(ctx, input) {
    ownCampusId(ctx);
    await assignedClass(ctx, input.classId);
    const { week } = await digestWeek(ctx, input);
    return { ...input, week };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const klass = await assignedClass(ctx, input.classId);
      const { weekStart } = await digestWeek(ctx, input);
      const digest = await prisma.familyDigest.findFirst({ where: { schoolId: ctx.user.schoolId, classId: klass.id, weekStart }, select: { id: true, status: true, version: true } });
      if (!digest) throw new WorkflowError("NOT_FOUND");
      // The teacher's own review screen; no other person's inbox receives it.
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: DIGEST_LINK, prefill: { digestId: digest.id, classId: klass.id, weekStart: weekStart.toISOString().slice(0, 10), digestVersion: digest.version, status: digest.status } };
    },
  },
});

export const TEACHER_STAFF_ENTRIES: readonly CapabilityEntry[] = [LEAVE_APPLY, OPEN_WINDOW, READINESS_TASK, DIGEST_PREPARE, DIGEST_SEND];
