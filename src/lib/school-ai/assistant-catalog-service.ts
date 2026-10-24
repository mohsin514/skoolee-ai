import type { AuthUser } from "@/lib/auth";
import { Pseudonymizer } from "@/lib/ai/pseudonymize";
import { assertApprovalRole, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { getTimetableSetupOptions } from "./timetable-setup-service";
import { getSchoolOperationsOptions, getLifecycleOptions, getPublicationOptions } from "./school-operations-service";
import { getRiskOptions, inspectRiskEvidence } from "./school-operations-risk-service";
import { getFeeInvoiceOptions } from "./fee-invoices-service";
import { getFinanceOperationsOptions } from "./finance-operations-service";
import { getExamSessionPlanOptions, getExamSeatingCandidates } from "./exam-session-plan-service";
import { getSchoolSetupOptions } from "./school-setup-service";
import { getAnnouncementOptions } from "./announcements-service";
import { workspaceRequestHash } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { assertConversationActor } from "./conversation-service";
import type { AssistantFocus } from "./assistant-focus";
import { assistantCatalogQuerySchema, assistantCatalogSelectionSchema, catalogOperationsForFocus, proposalCatalogReferences, type AssistantCatalog, type AssistantCatalogQuery, type AssistantCatalogSelection, type AssistantEntity, type AssistantEntityKind } from "./assistant-catalog";

function fail(message: string, status = 409): never { throw new SchoolAiError(message, status, "ASSISTANT_CATALOG_REVIEW"); }
export function assertCatalogFocus(domain: AssistantFocus["domain"] | undefined, query: AssistantCatalogQuery) {
  if (!domain || !catalogOperationsForFocus[domain]?.includes(query.operation)) fail("Choose the matching workflow before selecting school information.", 403);
}
/** Existing domain options remain the authority for roles, current access and campus scope. */
export async function getAssistantCatalog(user: AuthUser, requestedCampusId: string | null | undefined, raw: unknown, historical = false): Promise<AssistantCatalog> {
  const query = assistantCatalogQuerySchema.parse(raw);
  const campusId = await schoolAiTransaction(user, async tx => { await assertConversationActor(user, tx, "add"); assertApprovalRole(user, query.operation); const campus = await resolveWorkspaceCampus(user, requestedCampusId, tx); if (!campus) fail("Choose a campus.", 422); return campus!; });
  const entities: AssistantEntity[] = []; let truncated = false; const facts: Record<string, unknown> = {};
  const add = (kind: AssistantEntityKind, id: string, label: string, values: AssistantEntity["facts"] = {}) => entities.push({ kind, id, label, facts: values });
  const addClass = (row: { id: string; name: string; section?: string | null; academicYear: number }) => add("class", row.id, [row.name, row.section, row.academicYear].filter(Boolean).join(" · "), { academicYear: row.academicYear });
  const op = query.operation;
  if (op === "academics.setup_year") {
    await schoolAiTransaction(user, async tx => { const permissions = await loadWorkspacePermissionSnapshot(user, tx); await assertWorkspacePermission(user, "students", "view", permissions); await assertWorkspacePermission(user, "students", "add", permissions); });
  } else if (op === "timetable.create_draft" || op === "timetable.create_school_drafts") {
    const data = await getTimetableSetupOptions(user, campusId); data.classes.forEach(addClass);
    data.subjects.filter(row => !query.classId || row.classId === query.classId).forEach(row => add("subject", row.id, row.name, { classId: row.classId, teacherId: row.teacherId }));
    data.teachers.forEach(row => add("teacher", row.id, row.fullName)); data.rooms.forEach(row => add("room", row.id, row.roomNumber, { capacity: row.capacity })); facts.periods = data.periods; facts.weekendDays = data.weekendDays;
  } else if (op === "attendance.record_register" || op === "timetable.assign_substitutes") {
    const data = await getSchoolOperationsOptions(user, campusId, op, query.classId, query.date); data.classes.forEach(addClass);
    data.students.forEach(row => add("student", row.id, `${row.fullName} · ${row.rollNo}`, { previousStatus: row.previousStatus })); data.teachers.forEach(row => add("teacher", row.id, row.fullName));
    data.lessons.forEach(row => add("lesson", row.id, `${row.className} · ${row.subjectName} · ${row.teacherName} · ${row.startTime}–${row.endTime}`, { startTime: row.startTime, endTime: row.endTime, substituteId: row.substituteId, availableTeacherIds: row.availableTeacherIds }));
  } else if (op === "academics.transition_year" || op === "students.promote_enrollment") {
    const data = await getLifecycleOptions(user, campusId, op, query.classId); data.classes.forEach(addClass);
    data.cycles.forEach(row => add("cycle", row.id, `${row.label} · ${row.academicYear}`, { academicYear: row.academicYear, status: row.status, startDate: row.startDate, endDate: row.endDate }));
    data.students.forEach(row => { add("student", row.id, `${row.name} · ${row.rollNo}`, { enrollmentId: row.enrollmentId }); if (row.enrollmentId) add("enrollment", row.enrollmentId, `${row.name} · ${row.rollNo}`, { studentId: row.id }); });
  } else if (op === "timetable.publish_reviewed") {
    (await getPublicationOptions(user, campusId)).forEach(row => add("timetable", row.id, `${row.className} · ${row.academicYear} · ${row.term || ""}`, { academicYear: row.academicYear, lessons: row.lessons, term: row.term }));
  } else if (op === "operations.record_risk_decision") {
    const indicator = query.indicator ?? "ATTENDANCE_GAPS"; const data = await getRiskOptions(user, campusId, indicator);
    (indicator === "UNRELEASED_RESULTS" ? data.cycles : data.classes).forEach(row => add("riskScope", row.id, row.name)); data.owners.forEach(row => add("owner", row.id, row.name));
    if (query.scopeId && query.date && !historical) { const evidence = await inspectRiskEvidence(user, { campusId, indicator, scopeId: query.scopeId, date: query.date }); facts.evidence = { indicator, scopeId: evidence.scopeId, date: evidence.date, count: evidence.count, total: evidence.total, evidenceHash: evidence.evidenceHash }; }
  } else if (op === "fees.generate_invoices") {
    const data = await getFeeInvoiceOptions(user, campusId, query.classId); data.classes.forEach(addClass); data.students.forEach(row => add("student", row.id, `${row.name} · ${row.rollNo}`));
    data.groups.forEach(row => { add("feeGroup", row.id, row.name, { currency: row.currency, academicYear: row.academicYear }); row.lines.forEach(line => add("feeLine", line.id, line.name, { groupId: row.id, amount: line.amount, dueDate: line.dueDate })); });
  } else if (op === "finance.apply_operation") {
    const data = await getFinanceOperationsOptions(user, campusId); truncated = data.truncated; facts.academicYears = data.academicYears;
    for (const [kind, rows] of [["invoice", data.invoices], ["payment", data.payments], ["student", data.students], ["account", data.accounts], ["bank", data.banks], ["ledger", data.ledger]] as const) for (const row of rows) { const { id, label, ...values } = row; add(kind, id, label, values); }
  } else if (op === "exams.create_session_plan") {
    const data = await getExamSessionPlanOptions(user, campusId); data.classes.forEach(addClass); data.subjects.filter(row => !query.classId || row.classId === query.classId).forEach(row => add("subject", row.id, row.name, { classId: row.classId, totalMarks: row.totalMarks })); data.teachers.forEach(row => add("teacher", row.id, row.fullName)); data.rooms.forEach(row => add("room", row.id, row.roomNumber, { capacity: row.capacity, hasLayout: row.hasLayout })); data.periods.forEach(row => add("period", row.id, `${row.periodNumber} · ${row.startTime}–${row.endTime}`, { periodNumber: row.periodNumber, startTime: row.startTime, endTime: row.endTime }));
    if (query.classId) (await getExamSeatingCandidates(user, campusId, query.classId)).forEach(row => add("student", row.id, `${row.fullName} · ${row.rollNo}`));
  } else if (op === "setup.apply_changes") {
    const data = await getSchoolSetupOptions(user, campusId); truncated = data.truncated;
    data.classes.forEach(row => add("class", row.id, row.label, { teacherId: row.teacherId ?? null, teachingMode: row.teachingMode ?? null }));
    data.subjects.forEach(row => add("subject", row.id, row.label, { classId: row.classId, teacherId: row.teacherId })); data.teachers.forEach(row => add("teacher", row.id, row.label)); data.holidays.forEach(row => add("holiday", row.id, row.label, { fromDate: row.fromDate, toDate: row.toDate })); facts.academicYears = data.academicYears.map(row => Number(row.id)); data.students.forEach(row => add("student", row.id, row.label)); data.sources.forEach(row => add("source", row.id, row.label)); facts.canInviteStaff = data.canInviteStaff;
  } else if (op === "communications.queue_announcement") {
    const data = await getAnnouncementOptions(user, campusId); data.classes.forEach(addClass); facts.channels = data.channels;
    data.templates?.forEach(row => add("template", row.id, `${row.language} · ${row.subject}`, { language: row.language, subject: row.subject, body: row.body }));
  }
  if (query.classId && !entities.some(row => row.kind === "class" && row.id === query.classId)) fail("Choose a current class in this campus.", 403);
  if (query.scopeId && !entities.some(row => row.kind === "riskScope" && row.id === query.scopeId)) fail("Choose a current review scope.", 403);
  const unique = new Map<string, AssistantEntity>(); for (const row of entities) { const key = `${row.kind}:${row.id}`, prior = unique.get(key); if (prior && JSON.stringify(prior) !== JSON.stringify(row)) fail("Current options conflict. Refresh the workflow."); unique.set(key, row); } entities.splice(0, entities.length, ...unique.values());
  const people = entities.filter(row => row.kind === "teacher" || row.kind === "owner");
  if (people.length) { const labels = await schoolAiTransaction(user, tx => tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: people.map(row => row.id) }, isActive: true }, select: { id: true, staffProfile: { where: { schoolId: user.schoolId }, select: { employeeCode: true } }, specialization: true } })); for (const person of people) { const details = labels.find(row => row.id === person.id); person.label = [person.label, details?.staffProfile?.employeeCode, details?.specialization].filter(Boolean).join(" · "); } }
  const labels = new Map<string, number>(); for (const row of entities) { const key = `${row.kind}:${row.label}`; labels.set(key, (labels.get(key) ?? 0) + 1); }
  for (const row of entities) if ((labels.get(`${row.kind}:${row.label}`) ?? 0) > 1) row.facts.ambiguous = true;
  const counts = new Map<string, number>();
  const bounded = entities.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)).filter(row => { const count = counts.get(row.kind) ?? 0; counts.set(row.kind, count + 1); if (count >= 500) { truncated = true; return false; } return true; });
  return { query, entities: bounded, facts, truncated, snapshot: workspaceRequestHash(JSON.parse(JSON.stringify({ query, entities: bounded, facts, truncated }))) };
}
export function selectedCatalogEntities(catalog: AssistantCatalog, selection: AssistantCatalogSelection): AssistantEntity[] {
  const keys = new Set(selection.selected.map(row => `${row.kind}:${row.id}`));
  if (selection.query.classId) keys.add(`class:${selection.query.classId}`); if (selection.query.scopeId) keys.add(`riskScope:${selection.query.scopeId}`);
  for (const key of keys) if (!catalog.entities.some(row => `${row.kind}:${row.id}` === key)) fail("A chosen item is no longer available. Refresh your choices.");
  const rows = catalog.entities.filter(row => keys.has(`${row.kind}:${row.id}`));
  if (rows.some(row => row.facts.ambiguous)) fail("Matching names require a distinguishing staff code or record label before selection.", 422);
  for (const row of rows) if (row.kind === "student" && typeof row.facts.enrollmentId === "string") { const enrollment = catalog.entities.find(item => item.kind === "enrollment" && item.id === row.facts.enrollmentId); if (enrollment && !rows.includes(enrollment)) rows.push(enrollment); }
  return rows;
}
export async function resolveAssistantCatalog(user: AuthUser, campusId: string | null | undefined, raw: unknown, exact = true) {
  const selection = assistantCatalogSelectionSchema.parse(raw), catalog = await getAssistantCatalog(user, campusId, selection.query, !exact);
  if (exact && catalog.snapshot !== selection.snapshot) fail("School information changed. Refresh and review your choices before sending.");
  return { catalog, entities: selectedCatalogEntities(catalog, selection) };
}
export function maskAssistantCatalog(catalog: AssistantCatalog, entities: AssistantEntity[], masker: Pseudonymizer) {
  const selectedIds = new Set(entities.map(row => row.id));
  for (const row of entities) { masker.token(row.label, "PERSON"); for (const name of row.label.split(" · ").filter(value => value.trim().length > 2)) masker.token(name, "PERSON"); }
  return { operation: catalog.query.operation, query: catalog.query, entities: entities.map(row => ({ ...row, label: masker.mask(row.label), facts: Object.fromEntries(Object.entries(row.facts).filter(([key, value]) => !key.endsWith("Id") || typeof value !== "string" || selectedIds.has(value)).map(([key, value]) => [key, Array.isArray(value) ? value.filter(id => selectedIds.has(id)) : value])) })), facts: catalog.facts, partial: true, selectionRequired: true };
}
export function assertProposalCatalog(proposal: unknown, selection: AssistantCatalogSelection | undefined, entities: AssistantEntity[], catalog?: AssistantCatalog) {
  if (!proposal) return;
  if (!selection || !catalog || typeof proposal !== "object" || (proposal as { operation?: string }).operation !== selection.query.operation) fail("Choose the current school items for this workflow before preparing an actionable proposal.", 422);
  const refs = proposalCatalogReferences(proposal); const allowed = new Set(entities.map(row => `${row.kind}:${row.id}`));
  for (const row of refs) if (!allowed.has(`${row.kind}:${row.id}`)) fail("The proposal refers to an item you did not choose. Select the intended named item and ask again.", 422);
  const value = proposal as Record<string, unknown>;
  if (selection.query.date && "date" in value && value.date !== selection.query.date) fail("The proposal changed the selected date.", 422);
  if (selection.query.indicator && value.indicator !== selection.query.indicator) fail("The proposal changed the selected indicator.", 422);
  if (value.operation === "operations.record_risk_decision" && value.evidenceHash !== (catalog.facts.evidence as { evidenceHash?: string } | undefined)?.evidenceHash) fail("Review current risk evidence before preparing a decision.", 422);
  if (value.templateIds && typeof value.templateIds === "object") for (const id of Object.values(value.templateIds)) if (!allowed.has(`template:${id}`)) fail("Choose the approved message template for each language.", 422);
}
export async function canReadAssistantCatalog(user: AuthUser, campusId: string | null, raw: unknown) {
  if (raw == null) return true;
  try { await resolveAssistantCatalog(user, campusId, raw, false); return true; } catch (error) { if (error instanceof SchoolAiError && [403, 404, 409, 422].includes(error.status)) return false; throw error; }
}
