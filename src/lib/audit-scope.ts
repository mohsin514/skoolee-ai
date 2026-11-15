// Tenant scope for the platform audit table (super_admin_audit_logs) as seen by one school.
// A school sees rows written by its own non-platform people, or rows about the school itself.
// Platform-owner (APP_OWNER) rows are excluded by actor: that user's record lives in one customer
// tenant, so matching on the actor's school would leak every cross-tenant platform action to it.
export function schoolAuditScope(schoolId: string) {
  return [
    { user: { schoolId, role: { not: "APP_OWNER" as const } } },
    { newValues: { path: ["schoolId"], equals: schoolId } },
    { targetType: "school", targetId: schoolId },
  ];
}
