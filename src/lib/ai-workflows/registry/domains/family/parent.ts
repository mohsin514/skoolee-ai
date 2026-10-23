import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { formatMoney, parseMoney, type Language } from "@/lib/locale/package";
import { explainClosed, EXPLAIN_WINDOW_DAYS } from "@/lib/attendance/rule";
import { guardianAbsences, submitExplanation } from "@/lib/attendance/register";
import { requestLeave } from "@/lib/family/leave";
import { bookMeeting, familyMeetings } from "@/lib/meetings/service";
import { notifyParty } from "@/lib/meetings/notify";
import { recordDietary, setSpendLimit } from "@/lib/campus-packages/service";
import { familyActivities, requestPlace } from "@/lib/activities/service";
import { notifyOfferedPlaces } from "@/lib/activities/offer-notice";
import { reconcileStatement, schoolToday as feeToday } from "@/lib/fees/statement";
import { installmentStates, type Installment } from "@/lib/fees/installments";
import { onlinePaymentAvailability } from "@/lib/fees/online-payment";
import { zonedInstant } from "@/lib/meetings/time";
import { defineCapability } from "../../define";
import { roles } from "../../gates";
import { InputRequired, WorkflowError, toWorkflowError, type RequiredField } from "../../../errors";
import { assertChild, childLabel, resolveChild, resolveChildren, type BoundChild } from "../../../resolve/children";
import type { CapabilityContext, CapabilityEntry, EntryCopy, L10n, Receipt } from "../../types";

/**
 * PARENT capabilities (Slice 4). A parent reaches only their own children, through verified guardian
 * links, and each entry checks the one right it needs on that link (resolve/children.ts) at resolve and
 * again at execute. Children are named in free text and bound on the server; the model never sees a list.
 *
 * - Every write is a family-owned request the family services already allow (an absence note, a leave
 *   request, a meeting booking, a canteen limit or dietary note, a place request). The receipt says it was
 *   sent to the school and is awaiting its decision; staff-owned records (register, marks, invoices,
 *   guardian links) are never written here.
 * - Identity and contact factors (phone, channel opt-out), office messages, pickup passes and payments are
 *   class C hand-offs to the parent's own screen (RT11, RT15): nothing is changed, sent or paid by the AI,
 *   and no identity field is prefilled.
 * - `parent.accept_invitation` and `family.trip_consent` are the parent's own native taps; no entry here.
 */
function c(en: [string, string, string], ar: [string, string, string], ur: [string, string, string]): EntryCopy {
  return { title: { en: en[0], ar: ar[0], ur: ur[0] }, whenToUse: { en: en[1], ar: ar[1], ur: ur[1] }, examples: { en: [en[2]], ar: [ar[2]], ur: [ur[2]] } };
}
const l = (en: string, ar: string, ur: string): L10n => ({ en, ar, ur });
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
const say = (ctx: CapabilityContext, text: L10n, params: Record<string, string | number> = {}) => fill(text[ctx.locale] ?? text.en, params);
const list = (ctx: CapabilityContext, items: string[]) => items.join(ctx.locale === "en" ? "; " : "؛ ");

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** The parent's words for the child ("Hamza", "میری بیٹی زینب"); optional when they have one child. */
const CHILD = z.string().trim().min(1).max(120);
/** Set only by the server from `child`; the planner drops a model-written value. */
const BOUND_ID = z.string().min(1).max(64).optional();
const isRealDay = (day: string) => { const at = new Date(`${day}T00:00:00Z`); return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === day; };
const dayOf = (day: string) => new Date(`${day}T00:00:00Z`);
const addDays = (day: string, n: number) => new Date(dayOf(day).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const fold = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[ً-ٰٟ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const domain = (error: unknown): never => { throw toWorkflowError(error); };
const ROLES = ["PARENT"] as const;
const GATES = [roles(ROLES)];
const at = (path: string, child?: { id: string } | null, extra = "") => `${path}${child ? `?student=${encodeURIComponent(child.id)}${extra}` : ""}`;

async function campusToday(ctx: CapabilityContext, campusId: string) {
  const { timezone } = await getLocalePackage(ctx.user.schoolId, campusId, ctx.now);
  return { timezone, today: calendarDateIn(timezone, ctx.now) };
}
async function moneyFor(ctx: CapabilityContext, campusId: string | null, currency?: string) {
  const policy = await getLocalePackage(ctx.user.schoolId, campusId, ctx.now, ctx.locale as Language);
  const code = currency ?? policy.currency;
  return { currency: code, toMinor: (amount: number) => parseMoney(String(amount), code).minor, show: (minor: number, other = code) => formatMoney({ minor, currency: other }, policy) };
}

const PENDING_REVIEW = l("Sent to the school · pending school review", "أُرسل إلى المدرسة · بانتظار مراجعة المدرسة", "اسکول کو بھیج دیا · اسکول کے جائزے کا انتظار");

// ─── read.parent.child_attendance ─────────────────────────────────────────

const READ_ATTENDANCE = defineCapability<{ child?: string }>({
  key: "read.parent.child_attendance", version: 1, cluster: "C5", inventoryKeys: ["read.parent.child_attendance"], risk: "READ", class: "A", roles: ROLES,
  copy: c(
    ["My child's attendance", "See your child's absences and late arrivals from the last 60 days, and which still need a reason from you.", "Was Hamza absent this month?"],
    ["حضور طفلي", "اعرف غيابات طفلك وتأخيراته في آخر 60 يوماً، وما يحتاج منك إلى سبب.", "هل غابت مريم هذا الشهر؟"],
    ["میرے بچے کی حاضری", "پچھلے 60 دنوں میں بچے کی غیر حاضریاں اور دیر سے آمد دیکھیں، اور کن کی وجہ آپ نے ابھی دینی ہے۔", "کیا اس مہینے احمد اسکول سے غیر حاضر رہا؟"],
  ),
  input: z.strictObject({ child: CHILD.optional() }), evidence: [],
  gates: GATES, scope: { kind: "own-child", permission: "attendance" }, idempotency: { mode: "convergent" },
  source: { route: "GET /api/parent/attendance", service: "src/lib/attendance/register.ts:guardianAbsences", reuse: "direct" },
  async execute(ctx, input): Promise<Receipt> {
    const children = await resolveChildren(ctx, input.child, "attendance");
    const rows = [];
    for (const child of children) {
      const days = await guardianAbsences(ctx.user, child.id).catch(domain);
      const unexplained = days.filter(day => !day.closed && (!day.explanation || day.explanation.status === "REJECTED"));
      rows.push({ studentId: child.id, name: child.fullName, absent: days.filter(day => day.status === "ABSENT").length, late: days.filter(day => day.status === "LATE").length,
        pendingReview: days.filter(day => day.explanation && ["PENDING", "CLARIFICATION"].includes(day.explanation.status)).length,
        unexplained: unexplained.map(day => day.date), days });
    }
    const text = rows.map(row => row.absent + row.late === 0
      ? say(ctx, l("{name}: no absences or late arrivals in the last 60 days.", "{name}: لا غياب ولا تأخير في آخر 60 يوماً.", "{name}: پچھلے 60 دنوں میں کوئی غیر حاضری یا دیر نہیں۔"), { name: row.name })
      : say(ctx, l("{name}: {absent} absent and {late} late in the last 60 days.", "{name}: {absent} غياب و{late} تأخير في آخر 60 يوماً.", "{name}: پچھلے 60 دنوں میں {absent} غیر حاضری اور {late} بار دیر۔"), { name: row.name, absent: row.absent, late: row.late })
        + (row.unexplained.length ? ` ${say(ctx, l("{n} still need a reason from you ({dates}).", "{n} بحاجة إلى سبب منك ({dates}).", "{n} کی وجہ آپ نے ابھی دینی ہے ({dates})۔"), { n: row.unexplained.length, dates: row.unexplained.join(", ") })}` : "")
        + (row.pendingReview ? ` ${say(ctx, l("{n} pending school review.", "{n} بانتظار مراجعة المدرسة.", "{n} اسکول کے جائزے میں۔"), { n: row.pendingReview })}` : "")).join(" ");
    return {
      kind: "read", capability: "read.parent.child_attendance", entities: children.map(child => ({ model: "student", id: child.id })),
      counts: { children: rows.length, absent: rows.reduce((sum, row) => sum + row.absent, 0), late: rows.reduce((sum, row) => sum + row.late, 0), unexplained: rows.reduce((sum, row) => sum + row.unexplained.length, 0) },
      link: at("/parent/attendance", children.length === 1 ? children[0] : null), replayed: false,
      detail: { children: rows.map(({ days: _days, ...row }) => row), text },
    };
  },
});

// ─── read.parent.dues ─────────────────────────────────────────────────────

/** One child's statement, computed as GET /api/fees/family-statement does (each currency on its own). */
async function childDues(ctx: CapabilityContext, child: BoundChild) {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: ctx.user.schoolId }, select: { timezone: true } });
  const today = feeToday(school.timezone, ctx.now);
  const invoices = await prisma.invoice.findMany({ where: { schoolId: ctx.user.schoolId, studentId: child.id }, orderBy: [{ dueDate: "desc" }, { id: "asc" }], take: 500, select: { id: true, status: true, currency: true, totalAmount: true, totalAmountPaid: true, balanceDue: true, dueDate: true } });
  const plans = invoices.length ? await prisma.paymentPlan.findMany({ where: { schoolId: ctx.user.schoolId, invoiceId: { in: invoices.map(invoice => invoice.id) }, status: "active" }, select: { invoiceId: true, installmentsJson: true, paidAtCreation: true } }) : [];
  const schedule = new Map(plans.map(plan => [plan.invoiceId!, plan]));
  return [...new Set(invoices.map(invoice => invoice.currency))].map(currency => {
    const rows = invoices.filter(invoice => invoice.currency === currency).map(invoice => {
      const plan = schedule.get(invoice.id);
      return { id: invoice.id, status: invoice.status, totalAmount: invoice.totalAmount, totalAmountPaid: invoice.totalAmountPaid, balanceDue: invoice.balanceDue, dueDate: invoice.dueDate.toISOString().slice(0, 10),
        ...(plan ? { installments: installmentStates(plan.installmentsJson as Installment[], invoice.totalAmountPaid - plan.paidAtCreation, today) } : {}) };
    });
    const summary = reconcileStatement(rows, today);
    return { currency, outstanding: summary.outstanding, overdue: summary.overdue, dueToday: summary.dueToday, notYetDue: summary.notYetDue, openInvoices: rows.filter(row => row.balanceDue > 0 && row.status !== "CANCELLED").length };
  });
}

const READ_DUES = defineCapability<{ child?: string }>({
  key: "read.parent.dues", version: 1, cluster: "C6", inventoryKeys: ["read.parent.dues"], risk: "READ", class: "A", roles: ROLES,
  copy: c(
    ["Fees due", "See how much is outstanding and overdue for your children, from the school's statement.", "How much fee is due for both kids?"],
    ["الرسوم المستحقة", "اعرف المبلغ المستحق والمتأخر لأطفالك من كشف المدرسة.", "كم الرسوم المستحقة على أولادي؟"],
    ["واجب الادا فیس", "اسکول کے گوشوارے سے دیکھیں کہ بچوں کی کتنی فیس باقی اور کتنی تاخیر سے ہے۔", "دونوں بچوں کی کتنی فیس باقی ہے؟"],
  ),
  input: z.strictObject({ child: CHILD.optional() }), evidence: [],
  gates: GATES, scope: { kind: "own-child", permission: "fees" }, idempotency: { mode: "convergent" },
  source: { route: "GET /api/fees/family-statement", service: "src/lib/fees/statement.ts:reconcileStatement", reuse: "direct" },
  async execute(ctx, input): Promise<Receipt> {
    const children = await resolveChildren(ctx, input.child, "fees");
    const rows = [];
    for (const child of children) rows.push({ studentId: child.id, name: child.fullName, campusId: child.campusId, currencies: await childDues(ctx, child) });
    const money = await moneyFor(ctx, children[0]?.campusId ?? null);
    const text = rows.map(row => {
      const owing = row.currencies.filter(entry => entry.outstanding > 0);
      if (!owing.length) return say(ctx, l("{name}: nothing outstanding.", "{name}: لا شيء مستحق.", "{name}: کوئی فیس باقی نہیں۔"), { name: row.name });
      return `${row.name}: ${owing.map(entry => say(ctx, l("{amount} outstanding", "{amount} مستحق", "{amount} باقی"), { amount: money.show(entry.outstanding, entry.currency) })
        + (entry.overdue ? ` (${say(ctx, l("{amount} overdue", "{amount} متأخر", "{amount} تاخیر سے"), { amount: money.show(entry.overdue, entry.currency) })})` : "")).join(", ")}.`;
    }).join(" ");
    return {
      kind: "read", capability: "read.parent.dues", entities: children.map(child => ({ model: "student", id: child.id })),
      counts: { children: rows.length, openInvoices: rows.reduce((sum, row) => sum + row.currencies.reduce((n, entry) => n + entry.openInvoices, 0), 0) },
      link: at("/parent/fees", children.length === 1 ? children[0] : null), replayed: false,
      detail: { children: rows.map(({ campusId: _campusId, ...row }) => row), text },
    };
  },
});

// ─── parent.explain_absence ───────────────────────────────────────────────

const explainInput = z.strictObject({
  child: CHILD.optional(),
  /** The school day that was marked absent or late. */
  date: DAY,
  /** The parent's own words ("she had fever"). The register does not change until staff accept it. */
  reason: z.string().trim().min(5).max(1000),
  /** EXCUSED: absent for a reason; LATE: came late (then `arrivalTime` is needed). */
  proposedStatus: z.enum(["EXCUSED", "LATE"]).default("EXCUSED"),
  arrivalTime: TIME.optional(),
  studentId: BOUND_ID,
  attendanceId: BOUND_ID,
});
type ExplainInput = z.output<typeof explainInput>;

async function markedDay(ctx: CapabilityContext, studentId: string, date: string) {
  return prisma.attendance.findFirst({ where: { schoolId: ctx.user.schoolId, studentId, date: dayOf(date) }, select: { id: true, status: true, date: true } });
}
/** This step's own earlier submission (created, or appended to a clarification), for replay. */
const ownPending = (ctx: CapabilityContext, attendanceId: string, reason: string) =>
  prisma.attendanceExplanation.findFirst({ where: { schoolId: ctx.user.schoolId, attendanceId, submittedById: ctx.user.userId, status: "PENDING", reason: { endsWith: reason } }, select: { id: true, status: true } });

const STATUS_LABEL: Record<string, L10n> = { ABSENT: l("Absent", "غائب", "غیر حاضر"), LATE: l("Late", "متأخر", "دیر سے") };

const EXPLAIN_ABSENCE = defineCapability<ExplainInput>({
  key: "parent.explain_absence", version: 1, cluster: "C3", inventoryKeys: ["parent.explain_absence"], risk: "CREATE", roles: ROLES, class: "B",
  input: explainInput, evidence: ["/date", "/reason"], humanFields: ["studentId", "attendanceId"],
  gates: GATES, scope: { kind: "own-child", permission: "attendance" },
  copy: c(
    ["Explain an absence", "Give the school a reason for a day your child was marked absent or late. The school reviews it; the register changes only if staff accept it.", "Sara was marked absent yesterday, she had fever"],
    ["توضيح غياب", "أرسل للمدرسة سبب يوم سُجّل فيه طفلك غائباً أو متأخراً. تراجعه المدرسة، ولا يتغير السجل إلا إذا قبله الموظفون.", "سُجّلت مريم غائبة أمس، كانت مريضة بالحمى"],
    ["غیر حاضری کی وجہ بتائیں", "جس دن بچہ غیر حاضر یا دیر سے لکھا گیا اس کی وجہ اسکول کو بھیجیں۔ اسکول جائزہ لے گا؛ رجسٹر تب ہی بدلے گا جب عملہ منظور کرے۔", "کل سارہ کی غیر حاضری لگی، اسے بخار تھا"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/parent/attendance", service: "src/lib/attendance/register.ts:submitExplanation", reuse: "direct" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "attendance");
    const unclear: RequiredField[] = [];
    if (!isRealDay(input.date)) unclear.push({ pointer: "/date", promptKey: "DATE_INVALID" });
    if (input.proposedStatus === "LATE" && !input.arrivalTime) unclear.push({ pointer: "/arrivalTime", promptKey: "ARRIVAL_TIME_NEEDED" });
    if (unclear.length) throw new InputRequired(unclear);
    const row = await markedDay(ctx, child.id, input.date);
    if (!row || !["ABSENT", "LATE"].includes(row.status)) {
      // Offer the days that can still be explained; never another child's.
      const open = (await guardianAbsences(ctx.user, child.id).catch(domain)).filter(day => !day.closed && (!day.explanation || day.explanation.status === "REJECTED"));
      throw new InputRequired([{ pointer: "/date", promptKey: open.length ? "ABSENCE_NOT_ON_DATE" : "NO_OPEN_ABSENCES", params: { count: open.length }, options: open.slice(0, 8).map(day => ({ value: day.date, label: `${day.date} · ${say(ctx, STATUS_LABEL[day.status] ?? STATUS_LABEL.ABSENT)}` })) }]);
    }
    if (explainClosed(row.date, ctx.now)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EXPLAIN_WINDOW_CLOSED", days: EXPLAIN_WINDOW_DAYS });
    const open = await prisma.attendanceExplanation.findFirst({ where: { schoolId: ctx.user.schoolId, attendanceId: row.id, status: "PENDING" }, select: { id: true } });
    if (open && !(await ownPending(ctx, row.id, input.reason))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "EXPLANATION_ALREADY_PENDING" });
    return { ...input, child: child.fullName, studentId: child.id, attendanceId: row.id };
  },
  async preview(ctx, input) {
    const child = await assertChild(ctx, input.studentId, "attendance");
    const row = input.attendanceId ? await prisma.attendance.findFirst({ where: { id: input.attendanceId, schoolId: ctx.user.schoolId, studentId: child.id }, select: { id: true, status: true, version: true } }) : null;
    if (!row) throw new WorkflowError("NOT_FOUND");
    const [existing, clarification] = await Promise.all([
      ownPending(ctx, row.id, input.reason),
      prisma.attendanceExplanation.findFirst({ where: { schoolId: ctx.user.schoolId, attendanceId: row.id, status: "CLARIFICATION" }, select: { id: true } }),
    ]);
    return {
      title: say(ctx, l("Absence note", "ملاحظة غياب", "غیر حاضری کا نوٹ")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("Day", "اليوم", "دن")), value: `${input.date} · ${say(ctx, STATUS_LABEL[row.status] ?? STATUS_LABEL.ABSENT)}` },
        { label: say(ctx, l("Reason", "السبب", "وجہ")), value: input.reason },
        { label: say(ctx, l("You are saying", "تقول إن", "آپ کہہ رہے ہیں")), value: input.proposedStatus === "LATE"
          ? say(ctx, l("Came late, at {time}", "وصل متأخراً، الساعة {time}", "دیر سے آیا، {time} بجے"), { time: input.arrivalTime ?? "" })
          : say(ctx, l("Absent for a reason", "غائب بعذر", "وجہ کے ساتھ غیر حاضر")) },
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: existing
          ? say(ctx, l("This note is already with the school; nothing new is sent.", "هذه الملاحظة لدى المدرسة؛ لن يُرسل شيء جديد.", "یہ نوٹ پہلے سے اسکول کے پاس ہے؛ کچھ نیا نہیں بھیجا جائے گا۔"))
          : `${say(ctx, PENDING_REVIEW)}. ${clarification
            ? say(ctx, l("It answers the school's question about this day.", "يجيب عن سؤال المدرسة حول هذا اليوم.", "یہ اس دن کے بارے میں اسکول کے سوال کا جواب ہے۔"))
            : say(ctx, l("The register stays as marked unless staff accept it.", "يبقى السجل كما هو ما لم يقبلها الموظفون.", "جب تک عملہ منظور نہ کرے رجسٹر ویسا ہی رہے گا۔"))}` },
      ],
      counts: { explanations: existing ? 0 : 1 },
      confirmLabel: say(ctx, l("Send absence note", "إرسال ملاحظة الغياب", "غیر حاضری کا نوٹ بھیجیں")),
      basis: { input, attendance: [row.id, row.status, row.version], existing: existing?.id ?? null, clarification: clarification?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "attendance");
    if (!input.attendanceId) throw new WorkflowError("INVALID_INPUT");
    const link = at("/parent/attendance", child);
    const existing = await ownPending(ctx, input.attendanceId, input.reason);
    if (existing) return { kind: "write", capability: "parent.explain_absence", entities: [{ model: "attendanceExplanation", id: existing.id }], counts: { explanations: 0 }, link, replayed: false, detail: { reconciled: true, status: existing.status, statusText: say(ctx, PENDING_REVIEW) } };
    const saved = await submitExplanation(ctx.user, { attendanceId: input.attendanceId, reason: input.reason, proposedStatus: input.proposedStatus, ...(input.arrivalTime ? { arrivalTime: input.arrivalTime } : {}) }).catch(domain);
    return { kind: "write", capability: "parent.explain_absence", entities: [{ model: "attendanceExplanation", id: saved.id }], counts: { explanations: 1 }, link, replayed: false, detail: { status: saved.status, statusText: say(ctx, PENDING_REVIEW), date: input.date } };
  },
});

// ─── family.request_leave ─────────────────────────────────────────────────

const leaveInput = z.strictObject({
  child: CHILD.optional(),
  from: DAY,
  /** Defaults to `from` (one day). */
  to: DAY.optional(),
  reason: z.string().trim().min(3).max(1000),
  studentId: BOUND_ID,
});
type LeaveInput = z.output<typeof leaveInput>;
const MAX_LEAVE_DAYS = 30;
const LEAVE_OPEN = ["PENDING", "CLARIFICATION", "APPROVED"];
const sameLeave = (ctx: CapabilityContext, studentId: string, input: LeaveInput) =>
  prisma.learnerLeaveRequest.findFirst({ where: { schoolId: ctx.user.schoolId, studentId, requestedById: ctx.user.userId, fromDate: dayOf(input.from), toDate: dayOf(input.to ?? input.from), status: { in: LEAVE_OPEN } }, select: { id: true, status: true } });

const REQUEST_LEAVE = defineCapability<LeaveInput>({
  key: "family.request_leave", version: 1, cluster: "C3", inventoryKeys: ["family.request_leave"], risk: "CREATE", roles: ROLES, class: "B",
  input: leaveInput, evidence: ["/from", "/reason"], humanFields: ["studentId"],
  gates: GATES, scope: { kind: "own-child", permission: "attendance" },
  copy: c(
    ["Tell the school my child will be away", "Ask for leave for your child on today or future days. The school decides; staff still mark the register.", "Hamza is absent tomorrow, he has a dentist appointment"],
    ["إبلاغ المدرسة بغياب طفلي", "اطلب إجازة لطفلك لليوم أو لأيام قادمة. القرار للمدرسة، والموظفون يسجّلون الحضور.", "مريم لن تحضر غداً، لديها موعد عند الطبيب"],
    ["اسکول کو بتائیں کہ بچہ نہیں آئے گا", "آج یا آنے والے دنوں کے لیے بچے کی چھٹی کی درخواست دیں۔ فیصلہ اسکول کا ہے؛ حاضری عملہ ہی لگائے گا۔", "کل احمد کی طبیعت خراب ہے، وہ اسکول نہیں آئے گا"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/family/leave", service: "src/lib/family/leave.ts:requestLeave", reuse: "direct" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "attendance");
    const to = input.to ?? input.from;
    const unclear: RequiredField[] = [];
    if (!isRealDay(input.from)) unclear.push({ pointer: "/from", promptKey: "DATE_INVALID" });
    if (!isRealDay(to)) unclear.push({ pointer: "/to", promptKey: "DATE_INVALID" });
    if (unclear.length) throw new InputRequired(unclear);
    const { today } = await campusToday(ctx, child.campusId);
    if (input.from < today) unclear.push({ pointer: "/from", promptKey: "LEAVE_IN_PAST_EXPLAIN_INSTEAD" });
    if (to < input.from) unclear.push({ pointer: "/to", promptKey: "LEAVE_TO_BEFORE_FROM" });
    else if ((dayOf(to).getTime() - dayOf(input.from).getTime()) / 86_400_000 + 1 > MAX_LEAVE_DAYS) unclear.push({ pointer: "/to", promptKey: "LEAVE_TOO_LONG", params: { max: MAX_LEAVE_DAYS } });
    if (unclear.length) throw new InputRequired(unclear);
    const bound = { ...input, to, child: child.fullName, studentId: child.id };
    const overlap = await prisma.learnerLeaveRequest.findFirst({ where: { schoolId: ctx.user.schoolId, studentId: child.id, status: { in: LEAVE_OPEN }, fromDate: { lte: dayOf(to) }, toDate: { gte: dayOf(input.from) } }, select: { id: true } });
    if (overlap && !(await sameLeave(ctx, child.id, bound))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "LEAVE_OVERLAP" });
    return bound;
  },
  async preview(ctx, input) {
    const child = await assertChild(ctx, input.studentId, "attendance");
    const to = input.to ?? input.from;
    const existing = await sameLeave(ctx, child.id, input);
    const days = (dayOf(to).getTime() - dayOf(input.from).getTime()) / 86_400_000 + 1;
    return {
      title: say(ctx, l("Leave request", "طلب إجازة", "چھٹی کی درخواست")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("From", "من", "سے")), value: input.from },
        { label: say(ctx, l("To", "إلى", "تک")), value: to },
        { label: say(ctx, l("School days asked", "الأيام المطلوبة", "دن")), value: String(days) },
        { label: say(ctx, l("Reason", "السبب", "وجہ")), value: input.reason },
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: existing
          ? say(ctx, l("This request is already with the school; nothing new is sent.", "هذا الطلب لدى المدرسة؛ لن يُرسل شيء جديد.", "یہ درخواست پہلے سے اسکول کے پاس ہے؛ کچھ نیا نہیں بھیجا جائے گا۔"))
          : `${say(ctx, PENDING_REVIEW)}. ${say(ctx, l("Staff still mark the register on those days.", "يسجّل الموظفون الحضور في تلك الأيام كالمعتاد.", "ان دنوں کی حاضری عملہ ہی لگائے گا۔"))}` },
      ],
      counts: { requests: existing ? 0 : 1, days },
      confirmLabel: say(ctx, l("Send leave request", "إرسال طلب الإجازة", "چھٹی کی درخواست بھیجیں")),
      basis: { input, existing: existing?.id ?? null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "attendance");
    const link = at("/parent/attendance", child);
    const existing = await sameLeave(ctx, child.id, input);
    if (existing) return { kind: "write", capability: "family.request_leave", entities: [{ model: "learnerLeaveRequest", id: existing.id }], counts: { requests: 0 }, link, replayed: false, detail: { reconciled: true, status: existing.status, statusText: say(ctx, PENDING_REVIEW) } };
    const saved = await requestLeave(ctx.user, { studentId: child.id, fromDate: input.from, toDate: input.to ?? input.from, reason: input.reason }).catch(domain);
    return { kind: "write", capability: "family.request_leave", entities: [{ model: "learnerLeaveRequest", id: saved.id }], counts: { requests: 1 }, link, replayed: false, detail: { status: saved.status, statusText: say(ctx, PENDING_REVIEW) } };
  },
});

// ─── family.meeting (book) ────────────────────────────────────────────────

const meetingInput = z.strictObject({
  child: CHILD.optional(),
  /** The parent's words for the teacher: a name, a subject ("maths teacher") or "class teacher". */
  teacher: z.string().trim().min(1).max(120).optional(),
  date: DAY.optional(),
  /** A preferred start time; otherwise the first free slot that matches. */
  time: TIME.optional(),
  partOfDay: z.enum(["MORNING", "AFTERNOON", "EVENING"]).optional(),
  mode: z.enum(["IN_PERSON", "REMOTE"]).optional(),
  agenda: z.string().trim().min(2).max(1000).optional(),
  studentId: BOUND_ID,
  teacherId: BOUND_ID,
  windowId: BOUND_ID,
  /** The chosen slot's instant; bound by the server from the teacher's open windows. */
  startsAt: z.string().min(10).max(40).optional(),
});
type MeetingInput = z.output<typeof meetingInput>;

type Desk = Awaited<ReturnType<typeof familyMeetings>>;
type Teacher = Desk["teachers"][number];
type Slot = { windowId: string; teacherId: string; date: string; start: string; end: string; startsAt: string; mode: string; location: string | null; cancellationPolicy: string | null };

const CLASS_TEACHER = /\b(class|form|homeroom)\s*teacher\b|کلاس\s*(ٹیچر|انچارج)|معلم(ة)?\s*ال(فصل|صف)|مربي(ة)?\s*ال(فصل|صف)/u;
const TEACHER_WORDS = new Set(["teacher", "sir", "miss", "ms", "mr", "mrs", "madam", "maam", "ma am", "ustad", "ustani", "the", "my", "of", "his", "her", "ٹیچر", "استاد", "استانی", "صاحب", "صاحبہ", "میڈم", "مس", "سر", "کی", "کے", "معلم", "معلمة", "الأستاذ", "الأستاذة", "أستاذ", "أستاذة", "مدرس", "مدرسة"]);
/** Subject words families use, folded to one key, so "maths", "ریاضی" and "الرياضيات" find a Mathematics teacher. */
const SUBJECTS: Array<[RegExp, RegExp]> = [
  [/^(maths?|mathematics|ریاضی|الرياضيات|رياضيات)$/u, /math|ریاضی|رياضيات/u],
  [/^(english|انگریزی|الإنجليزية|الانجليزية|انجليزي)$/u, /english|انگریزی|إنجليز|انجليز/u],
  [/^(science|سائنس|العلوم|علوم)$/u, /science|سائنس|علوم/u],
  [/^(urdu|اردو)$/u, /urdu|اردو/u],
  [/^(arabic|عربی|العربية|عربي)$/u, /arabic|عربی|عربي|العربية/u],
  [/^(islamiat|islamiyat|islamic|اسلامیات|الإسلامية|التربية)$/u, /islam|اسلامیات|إسلام/u],
  [/^(physics|فزکس|الفيزياء)$/u, /physic|فزکس|فيزياء/u],
  [/^(chemistry|کیمسٹری|الكيمياء)$/u, /chemi|کیمسٹری|كيمياء/u],
  [/^(biology|بیالوجی|الأحياء)$/u, /biolog|بیالوجی|أحياء/u],
  [/^(computer|computing|کمپیوٹر|الحاسوب|الحاسب)$/u, /comput|کمپیوٹر|حاسوب|حاسب/u],
];

function matchTeacher(teachers: readonly Teacher[], said: string): Teacher[] {
  if (CLASS_TEACHER.test(said.toLocaleLowerCase())) return teachers.filter(teacher => teacher.classTeacher);
  const words = fold(said).split(" ").filter(word => word && !TEACHER_WORDS.has(word));
  if (!words.length) return [];
  const byName = teachers.filter(teacher => { const name = fold(teacher.name).split(" "); return words.every(word => name.some(part => part.startsWith(word))); });
  if (byName.length) return byName;
  return teachers.filter(teacher => teacher.subjects.some(subject => {
    const folded = fold(subject);
    return words.some(word => folded.includes(word) || SUBJECTS.some(([alias, pattern]) => alias.test(word) && pattern.test(folded)));
  }));
}
const PARTS = { MORNING: [0, 12 * 60], AFTERNOON: [12 * 60, 17 * 60], EVENING: [17 * 60, 24 * 60] } as const;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const teacherLabel = (teacher: Teacher) => [teacher.name, teacher.subjects.join(", ")].filter(Boolean).join(" · ");

const MODE_LABEL: Record<"IN_PERSON" | "REMOTE", L10n> = { IN_PERSON: l("In person", "حضورياً", "بالمشافہ"), REMOTE: l("Remote", "عن بُعد", "آن لائن") };

async function bindMeeting(ctx: CapabilityContext, input: MeetingInput) {
  const child = await resolveChild(ctx, input.child, "communication");
  if (input.date && !isRealDay(input.date)) throw new InputRequired([{ pointer: "/date", promptKey: "DATE_INVALID" }]);
  const desk = await familyMeetings(ctx.user, child.id).catch(domain);
  const slots: Slot[] = desk.windows.flatMap(window => window.slots.map(slot => ({ windowId: window.id, teacherId: window.teacherId, date: window.localDate, start: slot.start, end: slot.end, startsAt: slot.startsAt, mode: window.mode, location: window.location, cancellationPolicy: window.cancellationPolicy })));
  const withSlots = desk.teachers.filter(teacher => slots.some(slot => slot.teacherId === teacher.id));
  if (!withSlots.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OPEN_MEETING_SLOT" });
  let teacher: Teacher;
  if (input.teacher) {
    const named = matchTeacher(desk.teachers, input.teacher);
    const open = named.filter(row => withSlots.includes(row));
    if (named.length && !open.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OPEN_MEETING_SLOT" });
    if (open.length !== 1) throw new InputRequired([{ pointer: "/teacher", promptKey: open.length ? "TEACHER_AMBIGUOUS" : "TEACHER_NOT_FOUND", params: { count: withSlots.length }, options: (open.length ? open : withSlots).slice(0, 8).map(row => ({ value: row.name, label: teacherLabel(row) })) }]);
    teacher = open[0];
  } else if (withSlots.length === 1) teacher = withSlots[0];
  else throw new InputRequired([{ pointer: "/teacher", promptKey: "TEACHER_CHOICE", params: { count: withSlots.length }, options: withSlots.slice(0, 8).map(row => ({ value: row.name, label: teacherLabel(row) })) }]);

  const mine = slots.filter(slot => slot.teacherId === teacher.id);
  const onDay = input.date ? mine.filter(slot => slot.date === input.date) : mine;
  if (!onDay.length) throw new InputRequired([{ pointer: "/date", promptKey: "MEETING_DATE_UNAVAILABLE", options: [...new Set(mine.map(slot => slot.date))].slice(0, 8).map(date => ({ value: date, label: date })) }]);
  const inPart = input.partOfDay ? onDay.filter(slot => minutesOf(slot.start) >= PARTS[input.partOfDay!][0] && minutesOf(slot.start) < PARTS[input.partOfDay!][1]) : onDay;
  const chosen = input.time ? inPart.find(slot => slot.start === input.time) : inPart[0];
  if (!chosen) throw new InputRequired([{ pointer: "/time", promptKey: "MEETING_TIME_UNAVAILABLE", options: onDay.slice(0, 8).map(slot => ({ value: slot.start, label: `${slot.date} ${slot.start}–${slot.end}` })) }]);
  const mode = chosen.mode === "EITHER" ? input.mode : chosen.mode as "IN_PERSON" | "REMOTE";
  if (!mode) throw new InputRequired([{ pointer: "/mode", promptKey: "MEETING_MODE_CHOICE", options: [{ value: "IN_PERSON", label: say(ctx, MODE_LABEL.IN_PERSON) }, { value: "REMOTE", label: say(ctx, MODE_LABEL.REMOTE) }] }]);
  return { child, teacher, slot: chosen, timezone: desk.timezone, bound: { ...input, child: child.fullName, teacher: teacher.name, date: chosen.date, time: chosen.start, mode, studentId: child.id, teacherId: teacher.id, windowId: chosen.windowId, startsAt: chosen.startsAt } };
}

const BOOK_MEETING = defineCapability<MeetingInput>({
  key: "family.meeting", version: 1, cluster: "C3", inventoryKeys: ["family.meeting", "meetings.family_book"], risk: "CREATE", roles: ROLES, class: "B",
  input: meetingInput, evidence: [], humanFields: ["studentId", "teacherId", "windowId", "startsAt"],
  gates: GATES, scope: { kind: "own-child", permission: "communication" },
  copy: c(
    ["Book a meeting with a teacher", "Book one of the free slots a teacher of your child has opened. The teacher is told; changes and cancelling stay on the meetings screen.", "Book a meeting with Ali's class teacher next week"],
    ["حجز موعد مع معلم", "احجز أحد المواعيد المتاحة التي فتحها معلم طفلك. يُبلَّغ المعلم، والتعديل والإلغاء من شاشة اللقاءات.", "أريد موعداً مع معلمة الرياضيات لابنتي مريم يوم الأحد بعد الظهر"],
    ["ٹیچر سے ملاقات بک کریں", "بچے کے ٹیچر کے کھولے گئے خالی اوقات میں سے ایک بک کریں۔ ٹیچر کو اطلاع جائے گی؛ تبدیلی یا منسوخی ملاقاتوں کی اسکرین سے ہوگی۔", "احمد کی کلاس ٹیچر سے اگلے ہفتے ملاقات کا وقت لے لیں"],
  ),
  idempotency: { mode: "native" }, source: { route: "POST /api/family/meetings", service: "src/lib/meetings/service.ts:bookMeeting + src/lib/meetings/notify.ts:notifyParty", reuse: "direct" },
  async resolve(ctx, input) {
    return (await bindMeeting(ctx, input)).bound;
  },
  async preview(ctx, input) {
    const { child, teacher, slot, timezone } = await bindMeeting(ctx, input);
    if (slot.windowId !== input.windowId || slot.startsAt !== input.startsAt) throw new WorkflowError("STALE_VERSION");
    return {
      title: say(ctx, l("Book a teacher meeting", "حجز لقاء مع المعلم", "ٹیچر سے ملاقات بک کریں")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("Teacher", "المعلم", "ٹیچر")), value: teacherLabel(teacher) },
        { label: say(ctx, l("When", "الموعد", "وقت")), value: `${slot.date} · ${slot.start}–${slot.end} (${timezone})` },
        { label: say(ctx, l("How", "الطريقة", "طریقہ")), value: say(ctx, MODE_LABEL[input.mode ?? "IN_PERSON"]) },
        ...(slot.location ? [{ label: say(ctx, l("Where", "المكان", "جگہ")), value: slot.location }] : []),
        ...(input.agenda ? [{ label: say(ctx, l("What about", "الموضوع", "موضوع")), value: input.agenda }] : []),
        ...(slot.cancellationPolicy ? [{ label: say(ctx, l("Cancellation", "الإلغاء", "منسوخی")), value: slot.cancellationPolicy }] : []),
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: say(ctx, l("The slot is booked and the teacher is told. You can change or cancel it on the meetings screen.", "يُحجز الموعد ويُبلَّغ المعلم. يمكنك تعديله أو إلغاؤه من شاشة اللقاءات.", "وقت بک ہو جائے گا اور ٹیچر کو اطلاع جائے گی۔ تبدیلی یا منسوخی ملاقاتوں کی اسکرین سے کریں۔")) },
      ],
      counts: { bookings: 1 },
      confirmLabel: `${say(ctx, l("Book meeting", "حجز اللقاء", "ملاقات بک کریں"))} · ${slot.date} ${slot.start}`,
      basis: { input, slot },
    };
  },
  async execute(ctx, input, { idempotencyKey }): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "communication");
    if (!input.windowId || !input.startsAt) throw new WorkflowError("INVALID_INPUT");
    // bookMeeting replays a request key it has seen (repeated: true) and rechecks the slot under a lock.
    const result = await bookMeeting(ctx.user, { studentId: child.id, windowId: input.windowId, startsAt: input.startsAt, mode: input.mode, agenda: input.agenda, requestKey: `aiwf-${idempotencyKey}`.slice(0, 120) }).catch(domain);
    // The route's notice to the teacher, sent once (never on a replay).
    if (!result.repeated) await notifyParty("MEETING_BOOKED", { schoolId: ctx.user.schoolId, actorId: ctx.user.userId, campusId: result.booking.campusId }, result.booking.teacherId, false);
    return {
      kind: "write", capability: "family.meeting", entities: [{ model: "meetingBooking", id: result.booking.id }], counts: { bookings: result.repeated ? 0 : 1 },
      link: at("/parent/meetings", child), replayed: false,
      detail: { reconciled: result.repeated, status: result.booking.status, startsAt: result.booking.startsAt.toISOString(), endsAt: result.booking.endsAt.toISOString(), version: result.booking.version },
    };
  },
});

// ─── canteen.set_spend_limit / canteen.record_dietary ─────────────────────

async function canteenFor(ctx: CapabilityContext, child: BoundChild) {
  const pkg = await prisma.campusPackage.findUnique({ where: { campusId_package: { campusId: child.campusId, package: "CANTEEN" } }, select: { schoolId: true, status: true } });
  // As the family canteen view: only a campus whose canteen is on (or paused) has limits and dietary notes.
  if (!pkg || pkg.schoolId !== ctx.user.schoolId || !["ENABLED", "DISABLED"].includes(pkg.status)) throw new WorkflowError("DOMAIN_REFUSED", { reason: "CANTEEN_NOT_OFFERED" });
  return pkg;
}

const limitInput = z.strictObject({
  child: CHILD.optional(),
  /** In the school's currency, as the parent says it ("300 a day"). 0 means no canteen spending. */
  dailyLimit: z.number().min(0).max(100_000),
  studentId: BOUND_ID,
});
type LimitInput = z.output<typeof limitInput>;

const SPEND_LIMIT = defineCapability<LimitInput>({
  key: "canteen.set_spend_limit", version: 1, cluster: "C6", inventoryKeys: ["canteen.set_spend_limit"], risk: "UPDATE", roles: ROLES, class: "B",
  input: limitInput, evidence: ["/dailyLimit"], humanFields: ["studentId"],
  gates: GATES, scope: { kind: "own-child", permission: "fees" },
  copy: c(
    ["Set a daily canteen limit", "Set how much your child may spend at the school canteen each day.", "Set Hamza's canteen limit to 300 a day"],
    ["تحديد حد يومي للمقصف", "حدّد المبلغ الذي يمكن لطفلك صرفه في مقصف المدرسة يومياً.", "اجعل حد مقصف مريم 10 ريالات في اليوم"],
    ["کینٹین کی روزانہ حد مقرر کریں", "بچہ روزانہ اسکول کینٹین پر کتنا خرچ کر سکتا ہے، یہ طے کریں۔", "احمد کی کینٹین کی حد 300 روپے روزانہ کر دیں"],
  ),
  idempotency: { mode: "convergent" }, source: { route: "POST /api/campus-packages (action=limit)", service: "src/lib/campus-packages/service.ts:setSpendLimit", reuse: "direct" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "fees");
    await canteenFor(ctx, child);
    return { ...input, child: child.fullName, studentId: child.id };
  },
  async preview(ctx, input) {
    const child = await assertChild(ctx, input.studentId, "fees");
    await canteenFor(ctx, child);
    const money = await moneyFor(ctx, child.campusId);
    const current = await prisma.canteenSpendLimit.findUnique({ where: { schoolId_studentId: { schoolId: ctx.user.schoolId, studentId: child.id } }, select: { dailyLimit: true, updatedAt: true } });
    const next = money.toMinor(input.dailyLimit);
    return {
      title: say(ctx, l("Daily canteen limit", "الحد اليومي للمقصف", "کینٹین کی روزانہ حد")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("Now", "الحالي", "ابھی")), value: current ? money.show(current.dailyLimit) : say(ctx, l("No limit set", "لا يوجد حد", "کوئی حد مقرر نہیں")) },
        { label: say(ctx, l("New limit", "الحد الجديد", "نئی حد")), value: `${money.show(next)} ${say(ctx, l("a day", "يومياً", "روزانہ"))}` },
      ],
      counts: { limits: current?.dailyLimit === next ? 0 : 1 },
      confirmLabel: `${say(ctx, l("Save limit", "حفظ الحد", "حد محفوظ کریں"))} · ${money.show(next)}`,
      basis: { input, current: current ? [current.dailyLimit, current.updatedAt.toISOString()] : null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "fees");
    await canteenFor(ctx, child);
    const money = await moneyFor(ctx, child.campusId);
    const saved = await setSpendLimit(ctx.user, { studentId: child.id, dailyLimit: money.toMinor(input.dailyLimit) }).catch(domain);
    return { kind: "write", capability: "canteen.set_spend_limit", entities: [{ model: "canteenSpendLimit", id: saved.id }], counts: { limits: 1 }, link: at("/parent/canteen", child), replayed: false, detail: { dailyLimit: saved.dailyLimit, currency: money.currency } };
  },
});

/** A fixed list (the parent never types health detail into a free field the model fills); stored lower-case as the canteen screen does. */
const ALLERGENS = {
  PEANUTS: l("peanuts", "الفول السوداني", "مونگ پھلی"), TREE_NUTS: l("tree nuts", "المكسرات", "خشک میوہ جات"), MILK: l("milk", "الحليب", "دودھ"), EGGS: l("eggs", "البيض", "انڈے"),
  GLUTEN: l("gluten", "الغلوتين", "گلوٹین"), SOY: l("soy", "الصويا", "سویا"), FISH: l("fish", "السمك", "مچھلی"), SHELLFISH: l("shellfish", "القشريات", "جھینگا وغیرہ"),
  SESAME: l("sesame", "السمسم", "تل"), MUSTARD: l("mustard", "الخردل", "رائی"), CELERY: l("celery", "الكرفس", "اجوائن کا پودا"), LUPIN: l("lupin", "الترمس", "لوپن"),
  MOLLUSCS: l("molluscs", "الرخويات", "گھونگھے وغیرہ"), SULPHITES: l("sulphites", "الكبريتيت", "سلفائٹس"),
} as const;
type Allergen = keyof typeof ALLERGENS;
const ALLERGEN_KEYS = Object.keys(ALLERGENS) as [Allergen, ...Allergen[]];

const dietaryInput = z.strictObject({
  child: CHILD.optional(),
  allergens: z.array(z.enum(ALLERGEN_KEYS)).min(1).max(14),
  /** Optional diet in the parent's words ("vegetarian", "halal only"). */
  diet: z.string().trim().min(2).max(120).optional(),
  studentId: BOUND_ID,
});
type DietaryInput = z.output<typeof dietaryInput>;
const allergenWords = (input: DietaryInput) => [...new Set(input.allergens)].map(key => ALLERGENS[key].en).sort();
const sameRecord = (row: { allergens: string[]; diet: string | null; source: string; status: string; recordedById: string | null } | null, ctx: CapabilityContext, input: DietaryInput) =>
  Boolean(row && row.status === "NEEDS_CONFIRMATION" && row.source === "GUARDIAN" && row.recordedById === ctx.user.userId && (row.diet ?? null) === (input.diet ?? null) && JSON.stringify([...row.allergens].sort()) === JSON.stringify(allergenWords(input)));

const RECORD_DIETARY = defineCapability<DietaryInput>({
  key: "canteen.record_dietary", version: 1, cluster: "C6", inventoryKeys: ["canteen.record_dietary"], risk: "CREATE", roles: ROLES, class: "B",
  input: dietaryInput, evidence: ["/allergens"], humanFields: ["studentId"],
  gates: GATES, scope: { kind: "own-child", permission: "fees" },
  copy: c(
    ["Tell the canteen about allergies", "Record your child's food allergies for the canteen. It is saved as needing confirmation; the canteen's dietary lead confirms it.", "Hamza is allergic to peanuts"],
    ["إبلاغ المقصف بالحساسية", "سجّل حساسية طفلك الغذائية للمقصف. تُحفظ بانتظار التأكيد، ويؤكدها مسؤول التغذية.", "مريم لديها حساسية من البيض"],
    ["کینٹین کو الرجی بتائیں", "بچے کی کھانے کی الرجی کینٹین کے لیے درج کریں۔ یہ تصدیق کے انتظار میں محفوظ ہوگی؛ کینٹین کا غذائی ذمہ دار تصدیق کرے گا۔", "احمد کو مونگ پھلی سے الرجی ہے"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/campus-packages (action=dietary)", service: "src/lib/campus-packages/service.ts:recordDietary", reuse: "direct" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "fees");
    await canteenFor(ctx, child);
    return { ...input, allergens: [...new Set(input.allergens)], child: child.fullName, studentId: child.id };
  },
  async preview(ctx, input) {
    const child = await assertChild(ctx, input.studentId, "fees");
    await canteenFor(ctx, child);
    const existing = await prisma.dietaryRecord.findUnique({ where: { schoolId_studentId: { schoolId: ctx.user.schoolId, studentId: child.id } }, select: { allergens: true, diet: true, source: true, status: true, recordedById: true, updatedAt: true } });
    const same = sameRecord(existing, ctx, input);
    return {
      title: say(ctx, l("Canteen allergies", "حساسية المقصف", "کینٹین الرجی")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("Allergic to", "حساسية من", "الرجی")), value: input.allergens.map(key => say(ctx, ALLERGENS[key])).join(ctx.locale === "en" ? ", " : "، ") },
        ...(input.diet ? [{ label: say(ctx, l("Diet", "النظام الغذائي", "غذا")), value: input.diet }] : []),
        ...(existing && !same ? [{ label: say(ctx, l("Replaces", "يحل محل", "پچھلا ریکارڈ")), value: existing.status === "CONFIRMED"
          ? say(ctx, l("The record the school confirmed. It needs confirming again.", "السجل الذي أكدته المدرسة، وسيحتاج إلى تأكيد جديد.", "اسکول کا تصدیق شدہ ریکارڈ؛ اسے دوبارہ تصدیق درکار ہوگی۔"))
          : say(ctx, l("The record on file.", "السجل الحالي.", "موجودہ ریکارڈ۔")) }] : []),
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: same
          ? say(ctx, l("This is already on file; nothing new is saved.", "هذا مسجل مسبقاً؛ لن يُحفظ شيء جديد.", "یہ پہلے سے درج ہے؛ کچھ نیا محفوظ نہیں ہوگا۔"))
          : say(ctx, l("Saved as needs confirmation. The dietary lead confirms it; until then items with allergens wait for them. This supports staff checks and is not a guarantee of allergen safety.", "يُحفظ بانتظار التأكيد. يؤكده مسؤول التغذية، وحتى ذلك تنتظر الأصناف التي فيها مسببات حساسية قراره. هذا يدعم تحقق الموظفين وليس ضماناً للسلامة.", "تصدیق کے انتظار میں محفوظ ہوگا۔ غذائی ذمہ دار تصدیق کرے گا؛ تب تک الرجی والی اشیاء ان کے فیصلے کا انتظار کریں گی۔ یہ عملے کی جانچ میں مدد ہے، الرجی سے حفاظت کی ضمانت نہیں۔")) },
      ],
      counts: { records: same ? 0 : 1 },
      confirmLabel: say(ctx, l("Send for confirmation", "إرسال للتأكيد", "تصدیق کے لیے بھیجیں")),
      basis: { input, existing: existing ? [existing.status, existing.updatedAt.toISOString()] : null },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "fees");
    await canteenFor(ctx, child);
    const link = at("/parent/canteen", child);
    const existing = await prisma.dietaryRecord.findUnique({ where: { schoolId_studentId: { schoolId: ctx.user.schoolId, studentId: child.id } } });
    if (existing && sameRecord(existing, ctx, input)) return { kind: "write", capability: "canteen.record_dietary", entities: [{ model: "dietaryRecord", id: existing.id }], counts: { records: 0 }, link, replayed: false, detail: { reconciled: true, status: existing.status } };
    const { today } = await campusToday(ctx, child.campusId);
    const saved = await recordDietary(ctx.user, { studentId: child.id, allergens: allergenWords(input), diet: input.diet ?? null, source: "GUARDIAN", sourceDate: today }).catch(domain);
    return { kind: "write", capability: "canteen.record_dietary", entities: [{ model: "dietaryRecord", id: saved.id }], counts: { records: 1 }, link, replayed: false, detail: { status: saved.status } };
  },
});

// ─── family_activities.request_place ──────────────────────────────────────

const placeInput = z.strictObject({
  child: CHILD.optional(),
  /** The parent's words for the club, sport or trip ("football club"). */
  activity: z.string().trim().min(2).max(160),
  studentId: BOUND_ID,
  activityId: BOUND_ID,
});
type PlaceInput = z.output<typeof placeInput>;
type FamilyActivity = Awaited<ReturnType<typeof familyActivities>>["activities"][number];
const ACTIVE_PLACE = ["WAITLIST", "OFFERED", "RESERVED", "CONFIRMED"];

function matchActivity(activities: readonly FamilyActivity[], said: string) {
  const wanted = fold(said).split(" ").filter(word => word.length > 1 && !["club", "the", "team", "trip", "کلب", "ٹیم", "نادي", "فريق"].includes(word));
  const exact = activities.filter(row => fold(row.title) === fold(said));
  if (exact.length) return exact;
  if (!wanted.length) return [];
  return activities.filter(row => { const title = fold(`${row.title} ${row.kind}`); return wanted.every(word => title.includes(word)); });
}

async function bindPlace(ctx: CapabilityContext, input: PlaceInput) {
  const child = await resolveChild(ctx, input.child, "communication");
  const { activities } = await familyActivities(ctx.user, child.id).catch(domain);
  const found = matchActivity(activities, input.activity);
  if (found.length !== 1) {
    const offer = (found.length ? found : activities.filter(row => !row.blocker)).slice(0, 8);
    if (!offer.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NO_OPEN_ACTIVITIES" });
    throw new InputRequired([{ pointer: "/activity", promptKey: found.length ? "ACTIVITY_AMBIGUOUS" : "ACTIVITY_NOT_FOUND", params: { count: offer.length }, options: offer.map(row => ({ value: row.title, label: `${row.title} · ${row.startsAt.toISOString().slice(0, 10)}` })) }]);
  }
  const activity = found[0];
  // A blocker (another class, a clash, finished) is explained by the activities screen; nothing is requested.
  if (activity.blocker && !(activity.place && ACTIVE_PLACE.includes(activity.place.status))) throw new WorkflowError("DOMAIN_REFUSED", { reason: "ACTIVITY_NOT_AVAILABLE" });
  return { child, activity, bound: { ...input, child: child.fullName, activity: activity.title, studentId: child.id, activityId: activity.id } };
}

const REQUEST_PLACE = defineCapability<PlaceInput>({
  key: "family_activities.request_place", version: 1, cluster: "C4", inventoryKeys: ["family_activities.request_place"], risk: "CREATE", roles: ROLES, class: "B",
  input: placeInput, evidence: ["/activity"], humanFields: ["studentId", "activityId"],
  gates: GATES, scope: { kind: "own-child", permission: "communication" },
  copy: c(
    ["Ask for a place in a club or trip", "Ask for a place for your child in a club, sport or trip. A free place is reserved, otherwise your child joins the waitlist; consent and fees are settled on the activities screen.", "Sign Fatima up for the football club"],
    ["طلب مكان في نادٍ أو رحلة", "اطلب مكاناً لطفلك في نادٍ أو رياضة أو رحلة. يُحجز المكان إن توفر، وإلا يُضاف إلى قائمة الانتظار؛ الموافقة والرسوم من شاشة الأنشطة.", "سجّل مريم في نادي الشطرنج"],
    ["کلب یا سفر میں جگہ مانگیں", "بچے کے لیے کلب، کھیل یا سفر میں جگہ مانگیں۔ جگہ خالی ہو تو محفوظ ہوگی ورنہ انتظار کی فہرست؛ اجازت اور فیس سرگرمیوں کی اسکرین پر۔", "فاطمہ کا نام فٹ بال کلب میں لکھوا دیں"],
  ),
  idempotency: { mode: "natural" }, source: { route: "POST /api/family/activities (action=request)", service: "src/lib/activities/service.ts:requestPlace + src/lib/activities/offer-notice.ts:notifyOfferedPlaces", reuse: "wrapper" },
  async resolve(ctx, input) {
    return (await bindPlace(ctx, input)).bound;
  },
  async preview(ctx, input) {
    const { child, activity } = await bindPlace(ctx, input);
    if (activity.id !== input.activityId) throw new WorkflowError("STALE_VERSION");
    const money = await moneyFor(ctx, child.campusId);
    const has = activity.place && ACTIVE_PLACE.includes(activity.place.status);
    return {
      title: say(ctx, l("Ask for a place", "طلب مكان", "جگہ کی درخواست")),
      lines: [
        { label: say(ctx, l("Child", "الطفل", "بچہ")), value: childLabel(child) },
        { label: say(ctx, l("Activity", "النشاط", "سرگرمی")), value: activity.title },
        { label: say(ctx, l("When", "الموعد", "وقت")), value: `${activity.startsAt.toISOString().slice(0, 10)} – ${activity.endsAt.toISOString().slice(0, 10)}` },
        { label: say(ctx, l("Places", "الأماكن", "جگہیں")), value: activity.placesLeft > 0 ? say(ctx, l("{n} left", "متبقٍ {n}", "{n} باقی"), { n: activity.placesLeft }) : say(ctx, l("Full: your child joins the waitlist", "مكتمل: ينضم طفلك إلى قائمة الانتظار", "بھر چکا: بچہ انتظار کی فہرست میں جائے گا")) },
        ...(activity.costAmount > 0 ? [{ label: say(ctx, l("Fee", "الرسوم", "فیس")), value: `${money.show(activity.costAmount, activity.costCurrency)} · ${say(ctx, l("settled with the school; nothing is paid now", "تُسدد مع المدرسة؛ لا دفع الآن", "اسکول کے ساتھ طے ہوگی؛ ابھی کچھ ادا نہیں ہوگا"))}` }] : []),
        { label: say(ctx, l("What happens next", "ماذا بعد", "آگے کیا ہوگا")), value: has
          ? say(ctx, l("Your child already has a place or waitlist spot; nothing new is requested.", "لطفلك مكان أو دور في الانتظار؛ لن يُطلب شيء جديد.", "بچے کی جگہ یا انتظار میں باری پہلے سے ہے؛ کچھ نیا نہیں مانگا جائے گا۔"))
          : say(ctx, l("A reserved place is confirmed once the school's consent and fee rules are met.", "يُؤكَّد المكان المحجوز عند استيفاء شروط الموافقة والرسوم.", "محفوظ جگہ اجازت اور فیس کی شرائط پوری ہونے پر پکی ہوگی۔")) },
      ],
      counts: { requests: has ? 0 : 1, placesLeft: activity.placesLeft },
      confirmLabel: say(ctx, l("Ask for a place", "طلب المكان", "جگہ مانگیں")),
      basis: { input, place: activity.place ? [activity.place.id, activity.place.status, activity.place.version] : null, placesLeft: activity.placesLeft },
    };
  },
  async execute(ctx, input): Promise<Receipt> {
    const child = await assertChild(ctx, input.studentId, "communication");
    if (!input.activityId) throw new WorkflowError("INVALID_INPUT");
    const result = await requestPlace(ctx.user, { studentId: child.id, activityId: input.activityId }).catch(domain);
    await notifyOfferedPlaces(ctx.user, result.offered);
    return {
      kind: "write", capability: "family_activities.request_place", entities: [{ model: "activityPlace", id: result.place.id }], counts: { requests: result.repeated ? 0 : 1 },
      link: at("/parent/activities", child), replayed: false, detail: { reconciled: result.repeated, status: result.place.status },
    };
  },
});

// ─── Class C hand-offs to the parent's own screens ────────────────────────

const PROFILE_LINK = "/parent?settings=profile";

const CHANGE_PHONE = defineCapability({
  key: "profile.change_phone", version: 1, cluster: "C2", inventoryKeys: ["profile.update_own"], risk: "ACCESS_GRANT", roles: ROLES, class: "C",
  input: z.strictObject({}), evidence: [],
  gates: GATES, scope: { kind: "self" },
  copy: c(
    ["Change my phone number", "Opens your profile, where you change your number yourself after a security check. The AI never changes contact details.", "Change my phone number"],
    ["تغيير رقم هاتفي", "يفتح ملفك الشخصي لتغيّر رقمك بنفسك بعد تحقق أمني. لا يغيّر الذكاء الاصطناعي بيانات الاتصال.", "أريد تغيير رقم جوالي"],
    ["میرا فون نمبر بدلیں", "آپ کا پروفائل کھلے گا جہاں سیکیورٹی تصدیق کے بعد نمبر آپ خود بدلیں گے۔ AI رابطے کی تفصیل کبھی نہیں بدلتا۔", "میرا موبائل نمبر بدلنا ہے"],
  ),
  source: { route: "PATCH /api/profile", service: "src/components/settings/ProfileSettingsSection.tsx (profile screen, step-up)", reuse: "handoff-only" },
  handoff: {
    kind: "DOMAIN_SCREEN",
    // RT15: a contact factor is changed only on the profile screen with step-up; RT11: nothing is prefilled.
    async prepare() { return { kind: "DOMAIN_SCREEN", targetRoles: [], link: PROFILE_LINK, prefill: { section: "profile", focus: "phone" }, detail: { identitySensitive: true, stepUp: true } }; },
  },
});

const channelInput = z.strictObject({ channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]) });
const CHANNEL_PREFERENCE = defineCapability<z.output<typeof channelInput>>({
  key: "communications.set_guardian_channel_preference", version: 1, cluster: "C5", inventoryKeys: ["communications.set_guardian_channel_preference"], risk: "ACCESS_GRANT", roles: ROLES, class: "C",
  input: channelInput, evidence: ["/channel"],
  gates: GATES, scope: { kind: "self" },
  copy: c(
    ["Stop school updates on a channel", "Opens your update preferences, where you turn off WhatsApp, SMS or email updates yourself. Turning one on is done by the school office with your consent.", "Stop sending me WhatsApp messages"],
    ["إيقاف تحديثات المدرسة على قناة", "يفتح تفضيلات التحديثات لتوقف رسائل واتساب أو الرسائل النصية أو البريد بنفسك. التفعيل يتم عبر مكتب المدرسة بموافقتك.", "أوقفوا رسائل واتساب"],
    ["کسی ذریعے سے اسکول کی اطلاعات بند کریں", "اطلاعات کی ترجیحات کھلیں گی جہاں واٹس ایپ، ایس ایم ایس یا ای میل آپ خود بند کریں گے۔ دوبارہ چالو کرنا اسکول دفتر آپ کی رضامندی سے کرے گا۔", "مجھے واٹس ایپ پیغامات بھیجنا بند کریں"],
  ),
  source: { route: "POST /api/communications/channel-preferences", service: "src/components/school-ai/announcement-preferences-panel.tsx (opt-out on the profile screen)", reuse: "handoff-only" },
  handoff: {
    kind: "DOMAIN_SCREEN",
    // A parent may only opt out (saveChannelPreference); the change itself is the parent's own tap there.
    async prepare(_ctx, input) { return { kind: "DOMAIN_SCREEN", targetRoles: [], link: PROFILE_LINK, prefill: { section: "profile", panel: "update-preferences", channel: input.channel, intent: "OPT_OUT" }, detail: { identitySensitive: true, optOutOnly: true } }; },
  },
});

const officeInput = z.strictObject({
  /** The parent's own words, shown in full in the compose box; nothing is sent until they press send. */
  message: z.string().trim().min(2).max(2000),
});
const MESSAGE_OFFICE = defineCapability<z.output<typeof officeInput>>({
  key: "chat.message_office", version: 1, cluster: "C5", inventoryKeys: ["chat.start_direct", "chat.send_message"], risk: "COMMUNICATION", roles: ROLES, class: "C",
  input: officeInput, evidence: ["/message"],
  gates: GATES, scope: { kind: "self" },
  copy: c(
    ["Write to the school office", "Opens a message to the school office with your words ready to send. You read it and press send yourself.", "Tell the office my son's name is spelled wrong on his card"],
    ["مراسلة مكتب المدرسة", "يفتح رسالة إلى مكتب المدرسة بكلماتك جاهزة. تقرؤها وترسلها بنفسك.", "أخبروا المكتب أن اسم ابني مكتوب خطأ في بطاقته"],
    ["اسکول دفتر کو لکھیں", "اسکول دفتر کے لیے آپ کے الفاظ کے ساتھ پیغام کھلے گا۔ آپ پڑھ کر خود بھیجیں گے۔", "دفتر کو بتائیں کہ میرے بیٹے کا نام کارڈ پر غلط لکھا ہے"],
  ),
  source: { route: "POST /api/chat/conversations", service: "src/app/messages/messages-workspace.tsx (compose to the office)", reuse: "handoff-only" },
  handoff: {
    kind: "DOMAIN_SCREEN",
    // Never sends: the draft opens in the parent's own compose box, addressed to the office (leadership is always reachable).
    async prepare(_ctx, input) { return { kind: "DOMAIN_SCREEN", targetRoles: [], link: "/messages", prefill: { to: "OFFICE", draft: input.message }, detail: { sends: false } }; },
  },
});

const pickupInput = z.strictObject({
  child: CHILD.optional(),
  date: DAY,
  from: TIME,
  until: TIME,
  studentId: BOUND_ID,
});
type PickupInput = z.output<typeof pickupInput>;
const PICKUP_PASS = defineCapability<PickupInput>({
  key: "pickup.issue_authorization", version: 1, cluster: "C3", inventoryKeys: ["pickup.issue_authorization"], risk: "ACCESS_GRANT", roles: ROLES, class: "C",
  input: pickupInput, evidence: ["/date", "/from", "/until"], humanFields: ["studentId"],
  gates: GATES, scope: { kind: "own-child", permission: "pickup" },
  copy: c(
    ["Let someone else collect my child", "Opens the pickup screen for a one-day pass (up to 12 hours, at most 14 days ahead). You name the person and issue the pass there; its code is shown only on that screen.", "My brother Bilal will pick up Hamza today at 1:30"],
    ["السماح لشخص آخر باستلام طفلي", "يفتح شاشة الاستلام لتصريح ليوم واحد (حتى 12 ساعة، وخلال 14 يوماً). تحدد الشخص وتصدر التصريح هناك، ولا يظهر الرمز إلا فيها.", "أخي سيستلم مريم اليوم الساعة الواحدة والنصف"],
    ["کسی اور کو بچہ لینے کی اجازت دیں", "ایک دن کے پاس کے لیے پک اپ اسکرین کھلے گی (زیادہ سے زیادہ 12 گھنٹے، 14 دن کے اندر)۔ وہاں آپ شخص کا نام لکھ کر پاس جاری کریں گے؛ کوڈ صرف وہیں نظر آئے گا۔", "آج میرا بھائی بلال ڈیڑھ بجے احمد کو لینے آئے گا"],
  ),
  source: { route: "POST /api/pickup", service: "src/components/pickup/pickup.tsx (day pass on the pickup screen)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "pickup");
    if (!isRealDay(input.date)) throw new InputRequired([{ pointer: "/date", promptKey: "DATE_INVALID" }]);
    // The day-pass rules issueAuthorization enforces, asked before the hand-off so the screen opens valid.
    const { timezone, today } = await campusToday(ctx, child.campusId);
    const validFrom = zonedInstant(input.date, input.from, timezone), validUntil = zonedInstant(input.date, input.until, timezone);
    if (validUntil <= validFrom) throw new InputRequired([{ pointer: "/until", promptKey: "PICKUP_END_BEFORE_START" }]);
    if (validUntil.getTime() - validFrom.getTime() > 12 * 3_600_000) throw new InputRequired([{ pointer: "/until", promptKey: "PICKUP_WINDOW_TOO_LONG", params: { hours: 12 } }]);
    if (validUntil <= ctx.now) throw new InputRequired([{ pointer: "/date", promptKey: "PICKUP_WINDOW_PASSED" }]);
    if (input.date > addDays(today, 14)) throw new InputRequired([{ pointer: "/date", promptKey: "PICKUP_TOO_FAR_AHEAD", params: { days: 14 } }]);
    return { ...input, child: child.fullName, studentId: child.id };
  },
  handoff: {
    kind: "DOMAIN_SCREEN",
    async prepare(ctx, input) {
      const child = await assertChild(ctx, input.studentId, "pickup");
      // RT11: the collector's name, relation and ID are typed on the pickup screen, never prefilled; the code never enters chat.
      return { kind: "DOMAIN_SCREEN", targetRoles: [], link: at("/parent/pickup", child), prefill: { studentId: child.id, date: input.date, from: input.from, until: input.until }, detail: { identitySensitive: true, dayPassOnly: true } };
    },
  },
});

const paymentInput = z.strictObject({
  child: CHILD.optional(),
  /** The invoice number as the parent says it; optional when only one invoice is open. */
  invoice: z.string().trim().min(1).max(60).optional(),
  studentId: BOUND_ID,
  invoiceId: BOUND_ID,
});
type PaymentInput = z.output<typeof paymentInput>;
const openInvoices = (ctx: CapabilityContext, studentId: string) =>
  prisma.invoice.findMany({ where: { schoolId: ctx.user.schoolId, studentId, balanceDue: { gt: 0 }, status: { notIn: ["PAID", "CANCELLED"] } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], select: { id: true, invoiceNumber: true, balanceDue: true, currency: true, dueDate: true } });

const START_PAYMENT = defineCapability<PaymentInput>({
  key: "fees.start_online_payment", version: 1, cluster: "C6", inventoryKeys: ["fees.start_online_payment"], risk: "FINANCIAL", roles: ROLES, class: "C",
  input: paymentInput, evidence: [], humanFields: ["studentId", "invoiceId"],
  gates: GATES, scope: { kind: "own-child", permission: "fees" },
  copy: c(
    ["Pay a fee online", "Opens the invoice on your fees screen, where you choose Pay now yourself. The AI never starts or completes a payment.", "Pay Ali's fee now"],
    ["دفع الرسوم إلكترونياً", "يفتح الفاتورة في شاشة الرسوم لتضغط «ادفع الآن» بنفسك. لا يبدأ الذكاء الاصطناعي الدفع ولا يكمله.", "أريد دفع رسوم مريم الآن"],
    ["فیس آن لائن ادا کریں", "فیس کی اسکرین پر انوائس کھلے گی جہاں آپ خود «ابھی ادا کریں» دبائیں گے۔ AI ادائیگی نہ شروع کرتا ہے نہ مکمل۔", "علی کی فیس ابھی ادا کرنی ہے"],
  ),
  source: { route: "POST /api/fees/pay-online", service: "src/components/fees/family-fee-statement.tsx (Pay now on the fees screen)", reuse: "handoff-only" },
  async resolve(ctx, input) {
    const child = await resolveChild(ctx, input.child, "fees");
    const open = await openInvoices(ctx, child.id);
    if (!open.length) throw new WorkflowError("DOMAIN_REFUSED", { reason: "NOTHING_DUE" });
    const money = await moneyFor(ctx, child.campusId);
    const said = input.invoice ? fold(input.invoice).replace(/\s+/g, "") : "";
    const found = said ? open.filter(row => row.invoiceNumber && fold(row.invoiceNumber).replace(/\s+/g, "").includes(said)) : open;
    if (found.length !== 1) throw new InputRequired([{ pointer: "/invoice", promptKey: found.length ? "INVOICE_CHOICE" : "INVOICE_NOT_FOUND", params: { count: open.length }, options: (found.length ? found : open).slice(0, 8).map(row => ({ value: row.invoiceNumber ?? row.id, label: `${row.invoiceNumber ?? ""} · ${money.show(row.balanceDue, row.currency)} · ${row.dueDate.toISOString().slice(0, 10)}` })) }]);
    return { ...input, child: child.fullName, invoice: found[0].invoiceNumber ?? undefined, studentId: child.id, invoiceId: found[0].id };
  },
  handoff: {
    kind: "DEEP_LINK",
    async prepare(ctx, input) {
      const child = await assertChild(ctx, input.studentId, "fees");
      const invoice = (await openInvoices(ctx, child.id)).find(row => row.id === input.invoiceId);
      if (!invoice) throw new WorkflowError("NOT_FOUND");
      // Money settles only through the provider's webhook after the parent's own Pay now; this link only opens the invoice.
      return { kind: "DEEP_LINK", targetRoles: [], link: at("/parent/fees", child, `&invoice=${encodeURIComponent(invoice.id)}`), prefill: { studentId: child.id, invoiceId: invoice.id }, detail: { balanceDue: invoice.balanceDue, currency: invoice.currency, onlineAvailable: onlinePaymentAvailability(invoice.currency).available, completesPayment: false } };
    },
  },
});

export const PARENT_ENTRIES: readonly CapabilityEntry[] = [
  READ_ATTENDANCE, READ_DUES,
  EXPLAIN_ABSENCE, REQUEST_LEAVE, BOOK_MEETING, SPEND_LIMIT, RECORD_DIETARY, REQUEST_PLACE,
  CHANGE_PHONE, CHANNEL_PREFERENCE, MESSAGE_OFFICE, PICKUP_PASS, START_PAYMENT,
];
