// Audit writers have used both singular and table-style names over time
// ("student" and "students"). History filters work on these record types so
// one choice finds every spelling; unknown names stay filterable as-is.
export const AUDIT_CATEGORIES = {
  student: ["student", "students", "student_enrollments", "student_documents"],
  class: ["class", "classes"],
  subject: ["subject", "subjects"],
  invitation: ["invitation", "staff_invitations", "membership", "memberships"],
  marks: ["marks", "mark", "corrections"],
  fees: ["invoice", "invoices", "payment", "payments", "fee_structure", "fee_types", "fee_groups", "fee_discounts", "fee_assignments"],
  integrity: ["school_ai_exam_integrity_events"],
  exports: ["audit_log_exports"],
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

export function auditCategory(tableName: string): AuditCategory | null {
  for (const [category, tables] of Object.entries(AUDIT_CATEGORIES)) if ((tables as readonly string[]).includes(tableName)) return category as AuditCategory;
  return null;
}

/** Table names matched by a filter value: a known category expands, anything else is exact. */
export function auditTablesFor(filter: string): string[] {
  return filter in AUDIT_CATEGORIES ? [...AUDIT_CATEGORIES[filter as AuditCategory]] : [filter];
}
