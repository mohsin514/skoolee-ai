/** Object keys are identifiers, never authorization. Bind them to the authorized record. */
export function matchesDocumentKey(key: string, kind: "student-docs" | "staff-docs", campusId: string, recordId: string): boolean {
  const parts = key.split("/");
  return parts.length === 4 && parts[0] === kind && parts[1] === campusId && parts[2] === recordId
    && !!parts[3] && parts[3] !== "." && parts[3] !== ".." && !/[\\\x00-\x1f]/.test(key);
}
