/**
 * SKAI-1808 (DB-01 Phase 2): the allowed values of free-text status columns, one list per column.
 *
 * These lists are the single source for the database watch in
 * prisma/migrations/*_skai_1808_status_value_watch (a trigger records any other value in
 * `status_value_violations` without blocking the write) and, once that table stays empty for a release, for
 * CHECK constraints. Add a value here and in a migration in the same PR; tests/db/status-values.test.ts keeps
 * them equal.
 *
 * Casing differs by column on purpose: students.status has always been lower case.
 */
export const STATUS_VALUES = {
  exams: ["DRAFT", "ACTIVE", "MARKS_ENTRY", "LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"],
  students: ["active", "archived", "consolidated", "graduated", "inactive", "withdrawn"],
  classes: ["ACTIVE", "COMPLETED"],
  academic_cycles: ["DRAFT", "ACTIVE", "PAUSED", "ENDED"],
  guardian_relationships: ["DRAFT", "INVITED", "ACTIVE", "SUSPENDED", "REVOKED"],
  assignments: ["DRAFT", "RELEASED", "CLOSED"],
  leave_requests: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  admission_queries: ["ACTIVE", "FOLLOW_UP", "CONVERTED", "LOST"],
  admission_applications: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "OFFERED", "WAITLISTED", "REJECTED", "ACCEPTED", "DECLINED", "WITHDRAWN", "ENROLLED"],
  complaints: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
} as const satisfies Record<string, readonly string[]>;

export type StatusTable = keyof typeof STATUS_VALUES;
export type StatusValue<T extends StatusTable> = (typeof STATUS_VALUES)[T][number];

export function isKnownStatus<T extends StatusTable>(table: T, value: string): value is StatusValue<T> {
  return (STATUS_VALUES[table] as readonly string[]).includes(value);
}
