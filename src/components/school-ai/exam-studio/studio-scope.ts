import type { AiWorkspaceRecord, WorkspaceCapabilities } from "@/lib/school-ai/types";

/**
 * The studio scope: school, campus, class, subject, sitting (R21.1).
 *
 * The scope is the one piece of state the shell owns on behalf of all seven spaces, because every
 * record a space writes inherits it and R27.1/R27.2 bound every read to it. It is resolved from the
 * capabilities the server already returns — never invented on the client — so a campus a reader may
 * not see cannot be selected, and a campus that disappears between two loads is reported as refused
 * rather than silently kept (R24.7).
 *
 * The sitting is deliberately `null` until SKO-413's sitting records are read by the Control Room
 * in slice 3. R1.5 says an unmeasured figure renders as "not measured" rather than as a zero, and
 * the same honesty applies here: the banner says the sitting is not recorded yet instead of
 * inventing one.
 *
 * Directive-free: plain data and pure functions, so the shell, a space and a test all read the same
 * resolution.
 */
export interface StudioScopeSelection {
  schoolName: string | null;
  campusId: string | null;
  campusName: string | null;
  classId: string | null;
  className: string | null;
  subjectId: string | null;
  subjectName: string | null;
  sittingId: string | null;
}

export const EMPTY_STUDIO_SCOPE: StudioScopeSelection = {
  schoolName: null, campusId: null, campusName: null, classId: null, className: null, subjectId: null, subjectName: null, sittingId: null,
};

/** What the reader chose. Only identifiers are stored; every name is re-resolved from the server. */
export interface StudioScopeChoice {
  campusId: string;
  subjectId: string;
}

export const EMPTY_STUDIO_SCOPE_CHOICE: StudioScopeChoice = { campusId: "", subjectId: "" };

/**
 * Resolves a choice against the capabilities of the current request.
 *
 * A manager with no choice falls back to their own campus, which is what `getWorkspaceCapabilities`
 * already reports; a teacher with exactly one assigned subject falls into it, because asking a
 * single-subject teacher to pick from a list of one is noise. Anything the capabilities no longer
 * contain resolves to `null`, which is what makes `refusedScope` below able to name it.
 */
export function resolveStudioScope(capabilities: WorkspaceCapabilities, choice: StudioScopeChoice): StudioScopeSelection {
  const campusId = capabilities.campuses.some((campus) => campus.id === choice.campusId) ? choice.campusId : capabilities.campusId;
  const campus = capabilities.campuses.find((entry) => entry.id === campusId) ?? null;
  const inCampus = capabilities.subjects.filter((subject) => !campusId || subject.campusId === campusId);
  const subject = inCampus.find((entry) => entry.id === choice.subjectId) ?? (inCampus.length === 1 ? inCampus[0] : null);
  return {
    schoolName: capabilities.profile?.schoolName ?? null,
    campusId: campusId ?? null,
    campusName: campus?.name ?? null,
    classId: subject?.classId ?? null,
    className: subject?.className ?? null,
    subjectId: subject?.id ?? null,
    subjectName: subject?.name ?? null,
    // Slice 3 reads the sitting from SKO-413. Until then the banner says so rather than guessing.
    sittingId: null,
  };
}

/**
 * R24.7. Which parts of the reader's choice the server no longer recognizes, named so the recovery
 * state can list them instead of quietly resetting the scope under the reader.
 */
export function refusedScope(capabilities: WorkspaceCapabilities, choice: StudioScopeChoice): string[] {
  const refused: string[] = [];
  if (choice.campusId && !capabilities.campuses.some((campus) => campus.id === choice.campusId)) refused.push(choice.campusId);
  if (choice.subjectId && !capabilities.subjects.some((subject) => subject.id === choice.subjectId)) refused.push(choice.subjectId);
  return refused;
}

/**
 * The records a space should see. The server already bounds the page to the reader's school; this is
 * the in-scope narrowing the banner promises, so a teacher who switches subject does not keep
 * reading the previous subject's drafts.
 */
export function recordsInScope(records: readonly AiWorkspaceRecord[], scope: StudioScopeSelection): AiWorkspaceRecord[] {
  return records.filter((record) => {
    if (record.status === "ARCHIVED") return false;
    if (scope.campusId && record.campusId && record.campusId !== scope.campusId) return false;
    if (!scope.subjectId) return true;
    const recordSubject = record.data.subjectId;
    return typeof recordSubject !== "string" || recordSubject === scope.subjectId;
  });
}

/** Per-user, per-browser-session, so two accounts on one device never inherit each other's scope. */
export const studioScopeStorageKey = (userId: string) => `skoolee:exam-studio-scope:${userId}`;

/**
 * Reads the remembered choice. A browser that refuses session storage returns the empty choice:
 * losing a remembered scope is not worth a broken studio.
 */
export function readStudioScopeChoice(userId: string): StudioScopeChoice {
  try {
    const stored = window.sessionStorage.getItem(studioScopeStorageKey(userId));
    if (!stored) return EMPTY_STUDIO_SCOPE_CHOICE;
    const parsed = JSON.parse(stored) as Partial<StudioScopeChoice>;
    return { campusId: typeof parsed.campusId === "string" ? parsed.campusId : "", subjectId: typeof parsed.subjectId === "string" ? parsed.subjectId : "" };
  } catch {
    return EMPTY_STUDIO_SCOPE_CHOICE;
  }
}

/**
 * Remembers the choice on this device only, and says so by throwing on failure rather than
 * swallowing it. The shell turns that into the persistent `SAVE_FAILED` region of R24.8, which is
 * the honest message: the scope applies on this screen and will not survive a reload. Nothing here
 * ever reports "Saved", because nothing here reached a server.
 */
export function writeStudioScopeChoice(userId: string, choice: StudioScopeChoice): void {
  window.sessionStorage.setItem(studioScopeStorageKey(userId), JSON.stringify(choice));
}
