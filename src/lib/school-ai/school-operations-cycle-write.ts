import type { AuthUser } from "@/lib/auth";
import { ApiError, canLeadAcademics, canManageCampusOps } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { getYearClosureReport } from "@/lib/academic/year-closure";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot } from "./access";
import { schoolAiTransaction } from "./transaction";
import { assertNoOverlap, assertYearCurrent, holidaysOutside, nextYearDraft, parseYearRange } from "@/lib/academic/year-dates";

/** Existing academic-year controls coordinate with AI/exam/timetable writes. */
export async function writeAcademicCycle(user: AuthUser, campusId: string, body: { action?: unknown; cycleId?: unknown; label?: unknown; academicYear?: unknown; force?: unknown; reason?: unknown; startDate?: unknown; endDate?: unknown; expectedUpdatedAt?: unknown; confirm?: unknown }) {
  // Who may do what (resolved before the transaction; §0.3 rule 5 — the principal is academic on the server too):
  //  - create / activate / pause / resume a cycle = year logistics → campus operations (§2.2 #24: PR reads, G42);
  //  - end a year whose checklist is green → the campus operator (§2.3 #70) or the academic lead, who owns the
  //    principal's "Close year" (§4.4b; recorded as a decision in the P6 report);
  //  - force-close a year with outstanding work → the academic lead only (G35/G42 → canLeadAcademics).
  if (user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Forbidden", 403);
  const action = String(body.action || "");
  const campusOps = canManageCampusOps(user);
  const leadsAcademics = await canLeadAcademics(user, campusId);
  if (action === "end" ? !campusOps && !leadsAcademics : !campusOps) throw new ApiError(action === "end" ? "Forbidden" : "Your campus admin manages the academic year's dates and status.", 403);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, campusId);
    const scope = { schoolId: user.schoolId, campusId }, actor = await tx.user.findFirst({ where: { schoolId: user.schoolId, id: user.userId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
    if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Account access changed", 403);
    const grants = await loadWorkspacePermissionSnapshot(user, tx); await assertWorkspacePermission(user, "exams", "view", grants); await assertWorkspacePermission(user, "exams", "edit", grants); await assertSchoolOperational(user.schoolId, tx);
    const cycles = await tx.academicCycle.findMany({ where: scope });
    if (action === "create") {
      const academicYear = Number(body.academicYear), label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label || label.length > 180 || !Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100) throw new ApiError("Provide a valid academic year and label", 400);
      if (cycles.some(cycle => cycle.status === "ACTIVE" || cycle.academicYear === academicYear || cycle.academicYear < academicYear && cycle.status !== "ENDED")) throw new ApiError("Close earlier years and resolve the current active cycle first", 409);
      // SKAI-116: dates are optional here only for callers that date the year later (the AI roster tool).
      const range = parseYearRange(body, false);
      if (range) assertNoOverlap(range, cycles);
      const created = await tx.academicCycle.create({ data: { ...scope, label, academicYear, status: "DRAFT", startDate: range?.start ?? null, endDate: range?.end ?? null } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: created.id, userId: user.userId, newValue: { action, label, academicYear, startDate: body.startDate ?? null, endDate: body.endDate ?? null } } });
      return created;
    }
    const target = cycles.find(cycle => cycle.id === body.cycleId);
    if (!target) throw new ApiError("Academic cycle not found in this campus", 404);
    if (action === "update-dates") {
      if (target.status === "ENDED") throw new ApiError("An ended academic year keeps its dates for history.", 409);
      assertYearCurrent(body.expectedUpdatedAt, target.updatedAt);
      const range = parseYearRange(body, true)!;
      assertNoOverlap(range, cycles, target.id);
      // Recorded school days stay inside their year: attendance and date-sheet papers block a shrink outright.
      if (target.startDate && target.endDate) {
        const outside = { OR: [{ date: { lt: range.start } }, { date: { gt: range.end } }], AND: [{ date: { gte: target.startDate } }, { date: { lte: target.endDate } }] };
        const [attendance, papers] = await Promise.all([tx.attendance.count({ where: { ...scope, ...outside } }), tx.examSchedule.count({ where: { ...scope, ...outside, exam: { academicYear: target.academicYear } } })]);
        if (attendance || papers) throw new ApiError(`These dates would leave ${attendance} attendance records and ${papers} scheduled papers outside the year. Move the papers first; recorded attendance keeps the year's days.`, 409);
      }
      const holidays = holidaysOutside(range, await tx.holiday.findMany({ where: { ...scope, ...(target.startDate && target.endDate ? { fromDate: { lte: target.endDate }, toDate: { gte: target.startDate } } : {}) }, select: { name: true, fromDate: true, toDate: true } })).filter(holiday => !cycles.some(cycle => cycle.id !== target.id && cycle.startDate && cycle.endDate && cycle.startDate <= holiday.fromDate && cycle.endDate >= holiday.toDate));
      if (holidays.length && body.confirm !== true) throw new ApiError(`${holidays.length} holidays would fall outside the new dates (first: "${holidays[0].name}"). Confirm to save anyway, then move or remove them in the holiday calendar.`, 409, "CONFIRM_HOLIDAYS");
      const updated = await tx.academicCycle.update({ where: { id: target.id }, data: { startDate: range.start, endDate: range.end } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: target.id, userId: user.userId, oldValue: { startDate: target.startDate, endDate: target.endDate }, newValue: { startDate: range.start, endDate: range.end, holidaysOutside: holidays.length } } });
      return updated;
    }
    if (action === "rollover") {
      // Prepares next year's DRAFT beside the open year; activating it still needs this year ended.
      if (!["ACTIVE", "ENDED"].includes(target.status)) throw new ApiError("Roll over from the active or an ended academic year.", 409);
      const draft = nextYearDraft(target);
      if (cycles.some(cycle => cycle.academicYear === draft.academicYear)) throw new ApiError(`Academic year ${draft.academicYear} already exists on this campus.`, 409);
      if (draft.startDate && draft.endDate) assertNoOverlap({ start: draft.startDate, end: draft.endDate }, cycles);
      const created = await tx.academicCycle.create({ data: { ...scope, ...draft, status: "DRAFT" } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: created.id, userId: user.userId, newValue: { action, fromCycleId: target.id, label: draft.label, academicYear: draft.academicYear } } });
      return created;
    }
    if (!["activate", "pause", "resume", "end"].includes(action)) throw new ApiError("Unknown academic cycle action", 400);
    if (action === "activate" && target.status !== "DRAFT" || action === "pause" && target.status !== "ACTIVE" || action === "resume" && target.status !== "PAUSED" || action === "end" && !["ACTIVE", "PAUSED"].includes(target.status)) throw new ApiError("The academic cycle no longer permits this transition", 409);
    // SKAI-116: only a dated year can go live — holidays, the weekend preview and attendance read its bounds.
    if (action === "activate" && (!target.startDate || !target.endDate)) throw new ApiError("Set the year's start and end dates before activating it.", 409);
    if (["activate", "resume"].includes(action) && cycles.some(cycle => cycle.id !== target.id && (cycle.status === "ACTIVE" || cycle.academicYear < target.academicYear && cycle.status !== "ENDED"))) throw new ApiError("Close earlier years and resolve the current active cycle first", 409);
    let overrideReasons: string[] = [];
    if (action === "end") {
      const report = await getYearClosureReport(campusId, target.academicYear, tx);
      if (!report.canClose) { if (body.force !== true) throw new ApiError(report.blockingReasons.join(" "), 409); if (!leadsAcademics) throw new ApiError("Only the principal can close a year with outstanding work", 403); overrideReasons = report.blockingReasons; }
    }
    if (["pause", "end"].includes(action)) {
      const classes = await tx.class.findMany({ where: { ...scope, academicYear: target.academicYear }, select: { id: true } });
      if (await tx.schoolAiExamAttempt.count({ where: { ...scope, status: "IN_PROGRESS", assignment: { classId: { in: classes.map(cls => cls.id) } } } })) throw new ApiError("Finish active online exam attempts before stopping the academic year", 409);
      const slots = await tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, timetable: { ...scope, academicYear: target.academicYear } }, select: { id: true } });
      if (await tx.schoolAiSubstituteDuty.count({ where: { ...scope, timetableSlotId: { in: slots.map(slot => slot.id) }, status: "ASSIGNED", date: { gte: new Date(new Date().toISOString().slice(0, 10)) } } })) throw new ApiError("Cancel dated substitute duties before stopping the academic year", 409);
    }
    const status = action === "pause" ? "PAUSED" : action === "end" ? "ENDED" : "ACTIVE";
    const cycle = await tx.academicCycle.update({ where: { id: target.id }, data: { status, ...(action === "end" && !target.endDate ? { endDate: new Date() } : {}) } });
    // A force-close carries the academic lead's typed reason (§4.5.5) beside the checklist items it overrode.
    const overrideNote = overrideReasons.length && typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 1000) : undefined;
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: target.id, userId: user.userId, oldValue: { status: target.status }, newValue: { status, overrideReasons, ...(overrideNote ? { overrideNote } : {}) } } });
    return cycle;
  });
}
