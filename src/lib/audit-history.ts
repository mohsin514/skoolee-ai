import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { z } from "zod";

/** Unknown legacy campus scope is visible only to the school-wide administrator. */
export function auditHistoryScope(user: AuthUser, campusId?: string): Prisma.AuditLogWhereInput {
  if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
  if (user.role !== "SUPER_ADMIN" && !user.campusId) throw new ApiError("An active campus assignment is required.", 403);
  if (user.role !== "SUPER_ADMIN" && campusId && campusId !== user.campusId) throw new ApiError("History unavailable in this scope.", 403);
  const selected = user.role === "SUPER_ADMIN" ? campusId : user.campusId;
  return { schoolId: user.schoolId, ...(selected ? { campusId: selected } : {}) };
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
  const campuses = await db.campus.findMany({ where: { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { id: user.campusId! }) }, select: { id: true, name: true }, orderBy: { id: "asc" } });
  if (input.campusId && !campuses.some(campus => campus.id === input.campusId)) throw new ApiError("History unavailable in this scope.", 403);
  const dates = input.from || input.to ? { createdAt: {
    ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}),
    ...(input.to ? { lt: new Date(Date.parse(`${input.to}T00:00:00Z`) + 86400000) } : {}),
  } } : {};
  const where: Prisma.AuditLogWhereInput = { ...scope, ...dates, ...(input.tableName ? { tableName: input.tableName } : {}), OR: [{ retentionUntil: null }, { retentionUntil: { gt: now } }] };
  const anchor = input.cursor ? await db.auditLog.findFirst({ where: { AND: [where, { id: input.cursor }] }, select: { id: true, createdAt: true } }) : null;
  if (input.cursor && !anchor) throw new ApiError("This history page changed or expired. Refresh the history.", 409);
  const rows = await db.auditLog.findMany({ where: { AND: [where, ...(anchor ? [{ OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: input.limit + 1 });
  const page = rows.slice(0, input.limit);
  const actors = await db.user.findMany({ where: { schoolId: user.schoolId, id: { in: [...new Set(page.map(row => row.userId))] } }, select: { id: true, fullName: true, role: true } });
  return { nextCursor: rows.length > input.limit ? page[page.length - 1].id : null, selectedCampusId: input.campusId ?? (user.role === "SUPER_ADMIN" ? null : user.campusId), schoolWide: user.role === "SUPER_ADMIN", campuses,
    data: page.map(row => ({ id: row.id, tableName: row.tableName, recordId: row.recordId, campusId: row.campusId, createdAt: row.createdAt.toISOString(), action: !row.oldValue ? "CREATE" : !row.newValue ? "DELETE" : "UPDATE", actor: actors.find(actor => actor.id === row.userId) ?? null, changes: minimizedAuditChanges(row.oldValue, row.newValue) })) };
}
