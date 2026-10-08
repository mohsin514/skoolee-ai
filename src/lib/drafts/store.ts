/** Device drafts live only in this tab, for at most 24 hours and one login session. */
export const DRAFT_PREFIX = "skoolee:draft:v1:";
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export type DraftValues = Record<string, unknown>;
export interface DraftRecord {
  schema: number;
  savedAt: number;
  expiresAt: number;
  baseline: DraftValues;
  values: DraftValues;
  section?: string;
}
export function draftKey(scope: string, record: string, schema: number) {
  return `${DRAFT_PREFIX}${encodeURIComponent(scope)}:${encodeURIComponent(record)}:${schema}`;
}
export function permittedValues(values: DraftValues, fields: readonly string[]): DraftValues {
  return Object.fromEntries(fields.filter(k => Object.hasOwn(values, k)).map(k => [k, values[k]]));
}
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Three-way comparison: a conflict requires both sides to change differently. */
export function conflictingFields(draft: DraftRecord, current: DraftValues) {
  return Object.keys(draft.values).filter(k => !sameValue(draft.values[k], draft.baseline[k]) &&
    !sameValue(current[k], draft.baseline[k]) && !sameValue(current[k], draft.values[k]));
}
export function mergeDraft(draft: DraftRecord, current: DraftValues, choices: Record<string, "draft" | "server">) {
  const conflicts = conflictingFields(draft, current);
  if (conflicts.some(k => !choices[k])) throw new Error("Resolve each conflicting field first.");
  const merged = { ...current };
  for (const k of Object.keys(draft.values)) {
    if (!sameValue(draft.values[k], draft.baseline[k]) && choices[k] !== "server") merged[k] = draft.values[k];
  }
  return merged;
}
export function readDraft(storage: Storage, key: string, schema: number, fields: readonly string[], now = Date.now()): DraftRecord | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftRecord;
    if (d.schema !== schema || !Number.isFinite(d.savedAt) || d.savedAt > now || d.expiresAt !== d.savedAt + DRAFT_TTL || d.expiresAt <= now ||
      !d.values || typeof d.values !== "object" || Array.isArray(d.values) || !d.baseline || typeof d.baseline !== "object") {
      storage.removeItem(key); return null;
    }
    return { ...d, values: permittedValues(d.values, fields), baseline: permittedValues(d.baseline, fields) };
  } catch { storage.removeItem(key); return null; }
}
export function clearDeviceDrafts() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event("skoolee:drafts-cleared"));
}
