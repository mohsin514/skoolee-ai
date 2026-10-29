import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { isCampusOperator, isInstitutionAuthority } from "@/lib/auth/institution";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { z } from "zod";
import { auditTablesFor } from "@/lib/audit-categories";

/**
 * Who reads which activity log (G12):
 *  - the group admin (institution authority of a GROUP) reads the whole school and may pick one campus;
 *  - the standalone school admin (institution authority of a STANDALONE school) reads the school-level rows
 *    (identity, settings, memberships: `campusId` null) and their own campus, with no campus picker;
 *  - a campus operator (CAMPUS_ADMIN, or an ADMIN inside a group) reads their own campus only;
 *  - everyone else, the principal included, has no activity log.
 * Unknown legacy campus scope (`campusId` null) stays visible only to the institution authority.
 */
export function auditHistoryGroupWide(user: AuthUser): boolean {
  return isInstitutionAuthority(user) && user.role === "SUPER_ADMIN";
}
export function auditHistoryScope(user: AuthUser, campusId?: string): Prisma.AuditLogWhereInput {
  const authority = isInstitutionAuthority(user);
  if (!authority && !isCampusOperator(user)) throw new ApiError("Insufficient permissions", 403);
  if (auditHistoryGroupWide(user)) return { schoolId: user.schoolId, ...(campusId ? { campusId } : {}) };
  if (!user.campusId) throw new ApiError("An active campus assignment is required.", 403);
  if (campusId && campusId !== user.campusId) throw new ApiError("History unavailable in this scope.", 403);
  if (authority && !campusId) return { schoolId: user.schoolId, OR: [{ campusId: user.campusId }, { campusId: null }] };
  return { schoolId: user.schoolId, campusId: user.campusId };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
export const auditHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
  tableName: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/).optional(),
  campusId: z.string().min(1).max(128).optional(),
  from: day.optional(), to: day.optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, "The date range is invalid.");

export interface AuditHistoryEntry {
  id: string; tableName: string; recordId: string; campusId: string | null; createdAt: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actor: { id: string; fullName: string; role: string } | null;
  changes: Array<{ field: string; before: string | null; after: string | null }>;
}
export interface AuditHistoryPage {
  data: AuditHistoryEntry[]; nextCursor: string | null; selectedCampusId: string | null;
  schoolWide: boolean; campuses: Array<{ id: string; name: string }>;
}

const safeStates = new Set(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "ARCHIVED", "ACTIVE", "INACTIVE", "PENDING", "NOTED", "DISMISSED", "FOLLOW_UP", "SUBMITTED", "REVIEWED", "CANCELED", "CANCELLED", "COMPLETED", "FAILED", "DELETED", "active", "inactive", "archived"]);
function fields(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** School-facing history never serializes free text, contacts, tokens or entire source records. */
export function minimizedAuditChanges(oldValue: unknown, newValue: unknown): AuditHistoryEntry["changes"] {
  const before = fields(oldValue), after = fields(newValue);
  const safe = (field: string, value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (["version", "reviewVersion"].includes(field) && Number.isSafeInteger(value) && Number(value) >= 0) return String(value);
    if (["isActive", "published"].includes(field) && typeof value === "boolean") return String(value);
    if (["status", "decision"].includes(field) && typeof value === "string" && safeStates.has(value)) return value;
    return null;
  };
  return ["version", "reviewVersion", "status", "decision", "isActive", "published"].flatMap(field => {
    const a = safe(field, before[field]), b = safe(field, after[field]);
    return a !== b ? [{ field, before: a, after: b }] : [];
  });
}

export async function listAuditHistory(user: AuthUser, raw: unknown, db: TxClient = prisma, now = new Date()): Promise<AuditHistoryPage> {
  const input = auditHistoryQuery.parse(raw);
  const scope = auditHistoryScope(user, input.campusId);
  const groupWide = auditHistoryGroupWide(user);
  const campuses = await db.campus.findMany({ where: { schoolId: user.schoolId, ...(groupWide ? {} : { id: user.campusId! }) }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  if (input.campusId && !campuses.some(campus => campus.id === input.campusId)) throw new ApiError("History unavailable in this scope.", 403);
  const dates = input.from || input.to ? { createdAt: {
    ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}),
    ...(input.to ? { lt: new Date(Date.parse(`${input.to}T00:00:00Z`) + 86400000) } : {}),
  } } : {};
  // AND, not a spread: the standalone owner's scope carries its own OR (own campus or school-level rows).
  const where: Prisma.AuditLogWhereInput = { AND: [scope, dates, ...(input.tableName ? [{ tableName: { in: auditTablesFor(input.tableName) } }] : []), { OR: [{ retentionUntil: null }, { retentionUntil: { gt: now } }] }] };
  const anchor = input.cursor ? await db.auditLog.findFirst({ where: { AND: [where, { id: input.cursor }] }, select: { id: true, createdAt: true } }) : null;
  if (input.cursor && !anchor) throw new ApiError("This history page changed or expired. Refresh the history.", 409);
  const rows = await db.auditLog.findMany({ where: { AND: [where, ...(anchor ? [{ OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1 });
  const page = rows.slice(0, input.limit);
  const actors = await db.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(page.map(row => row.userId))] } }, select: { id: true, fullName: true, role: true } });
  return { nextCursor: rows.length > input.limit ? page[page.length - 1].id : null, selectedCampusId: input.campusId ?? (groupWide ? null : user.campusId), schoolWide: isInstitutionAuthority(user), campuses,
    data: page.map(row => ({ id: row.id, tableName: row.tableName, recordId: row.recordId, campusId: row.campusId, createdAt: row.createdAt.toISOString(), action: !row.oldValue ? "CREATE" : !row.newValue ? "DELETE" : "UPDATE", actor: actors.find(actor => actor.id === row.userId) ?? null, changes: minimizedAuditChanges(row.oldValue, row.newValue) })) };
}

// ─── Export ───────────────────────────────────────────────────────
const EXPORT_LIMIT = 5000;
const EXPORT_RECEIPT_TABLE = "audit_log_exports";
export const auditExportQuery = z.object({
  requestKey: z.string().uuid(),
  tableName: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/).optional(),
  campusId: z.string().min(1).max(128).optional(),
  from: day.optional(), to: day.optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, "The date range is invalid.");

/** Spreadsheet apps execute cells starting with these characters. */
function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * The same scope and minimization as the history list, as a dated CSV. The
 * export is itself an audit event keyed by the client's retry key, so a lost
 * response and a retry produce one receipt.
 */
export async function exportAuditHistory(user: AuthUser, raw: unknown, assertExport: (user: AuthUser) => Promise<unknown>, db: TxClient = prisma, now = new Date()) {
  const input = auditExportQuery.parse(raw);
  const scope = auditHistoryScope(user, input.campusId);
  await assertExport(user);
  const filters = { tableName: input.tableName ?? null, campusId: input.campusId ?? null, from: input.from ?? null, to: input.to ?? null };
  // SKAI-1065: a retry with the same requestKey replays the stored export byte for byte.
  const previous = await db.auditLog.findFirst({ where: { AND: [scope, { tableName: EXPORT_RECEIPT_TABLE, recordId: input.requestKey, userId: user.userId }] }, select: { id: true, newValue: true } });
  if (previous) {
    const stored = previous.newValue as { filters?: unknown; csv?: unknown; filename?: unknown; rows?: unknown; truncated?: unknown } | null;
    if (JSON.stringify(stored?.filters ?? null) !== JSON.stringify(filters)) throw new ApiError("This export request key was already used with different filters.", 409);
    if (typeof stored?.csv === "string" && typeof stored.filename === "string") {
      return { csv: stored.csv, rows: Number(stored.rows) || 0, truncated: stored.truncated === true, filename: stored.filename };
    }
  }
  const rows: AuditHistoryEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await listAuditHistory(user, { limit: 100, tableName: input.tableName, campusId: input.campusId, from: input.from, to: input.to, cursor }, db, now);
    // The export never lists its own receipts, so a retry cannot change its own output.
    rows.push(...page.data.filter(row => row.tableName !== EXPORT_RECEIPT_TABLE));
    cursor = page.nextCursor ?? undefined;
  } while (cursor && rows.length < EXPORT_LIMIT);
  const truncated = rows.length >= EXPORT_LIMIT && !!cursor;
  const header = ["time", "action", "category", "record", "campus", "actor", "actor_role", "changes"];
  const lines = rows.slice(0, EXPORT_LIMIT).map(row => [row.createdAt, row.action, row.tableName, row.recordId, row.campusId, row.actor?.fullName, row.actor?.role,
    row.changes.map(change => `${change.field}: ${change.before ?? "—"} → ${change.after ?? "—"}`).join("; ")].map(csvCell).join(","));
  const result = { csv: [header.join(","), ...lines].join("\r\n") + "\r\n", rows: Math.min(rows.length, EXPORT_LIMIT), truncated, filename: `activity-history-${now.toISOString().slice(0, 10)}.csv` };
  const receipt = { status: "COMPLETED", rows: result.rows, truncated, filters, filename: result.filename, csv: result.csv };
  if (previous) await db.auditLog.update({ where: { id: previous.id }, data: { newValue: receipt } });
  else await db.auditLog.create({ data: { schoolId: user.schoolId, campusId: typeof scope.campusId === "string" ? scope.campusId : null, tableName: EXPORT_RECEIPT_TABLE, recordId: input.requestKey, userId: user.userId, newValue: receipt } });
  return result;
}
