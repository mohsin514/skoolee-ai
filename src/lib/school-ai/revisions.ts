import type { WorkspaceKind, WorkspaceRevision, AiWorkspaceRecord } from "./types";

export interface WorkspaceRevisionView extends WorkspaceRevision { actorName: string | null }
export type WorkspaceRevisionSummary = Omit<WorkspaceRevisionView, "data">;
export interface WorkspaceRevisionPage { revisions: WorkspaceRevisionView[]; nextVersion: number | null }
export interface WorkspaceHistoryAccess { canRestore: boolean; canApprove: boolean }
export interface WorkspaceHistoryResponse {
  record: AiWorkspaceRecord;
  revisions: WorkspaceRevisionSummary[];
  nextVersion: number | null;
  historyAccess: WorkspaceHistoryAccess;
}
export interface RevisionDifference {
  path: (string | number)[];
  before: unknown;
  after: unknown;
  type: "added" | "removed" | "changed";
}

/** Storage routing is not document content. It is never included in the visual comparison. */
const hiddenKeys = new Set(["storageKey"]);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function revisionDifferences(before: unknown, after: unknown, path: (string | number)[] = []): RevisionDifference[] {
  if (Object.is(before, after)) return [];
  if (isObject(before) && isObject(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => hiddenKeys.has(key) ? [] : revisionDifferences(before[key], after[key], [...path, key]));
  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [], b = Array.isArray(after) ? after : [];
    if (a.length || b.length) return Array.from({ length: Math.max(a.length, b.length) }, (_, index) => revisionDifferences(a[index], b[index], [...path, index])).flat();
    if (Array.isArray(before) && Array.isArray(after)) return [];
  }
  if (before === undefined && isObject(after)) return Object.keys(after).filter(key => !hiddenKeys.has(key)).sort().flatMap(key => revisionDifferences(undefined, after[key], [...path, key]));
  if (after === undefined && isObject(before)) return Object.keys(before).filter(key => !hiddenKeys.has(key)).sort().flatMap(key => revisionDifferences(before[key], undefined, [...path, key]));
  return [{ path, before, after, type: before === undefined ? "added" : after === undefined ? "removed" : "changed" }];
}

/** Restore editable content through the normal CAS save; original-file metadata stays immutable. */
export function restoredRevisionData(kind: WorkspaceKind, current: Record<string, unknown>, snapshot: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(snapshot);
  if (kind === "SOURCE") for (const key of ["storageKey", "sha256", "extractionModel", "extractedAt", "sourceLanguage"]) {
    delete result[key];
    if (current[key] !== undefined) result[key] = current[key];
  }
  return result;
}
