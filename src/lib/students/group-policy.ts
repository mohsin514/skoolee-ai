import { ApiError } from "@/lib/api/scope";

// SKAI-169: one rule set for student group writes (setup panel, admissions, bulk "Set group").
export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 240;

export type GroupFields = { name: string; description: string | null };

/** Collapses inner whitespace so "Transport  users" and "Transport users" are the same name. */
export function cleanGroupName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Validates a create (`partial` false) or an edit (`partial` true); returns only the fields sent. */
export function parseGroupInput(body: Record<string, unknown>, partial: boolean): Partial<GroupFields> {
  const out: Partial<GroupFields> = {};
  if (!partial || body.name !== undefined) {
    if (body.name !== undefined && body.name !== null && typeof body.name !== "string") throw new ApiError("Group name must be text", 400);
    const name = cleanGroupName(body.name);
    if (!name) throw new ApiError("Group name is required", 400);
    if (name.length > GROUP_NAME_MAX) throw new ApiError(`Group name must be ${GROUP_NAME_MAX} characters or fewer`, 400);
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    if (body.description != null && typeof body.description !== "string") throw new ApiError("Description must be text", 400);
    const description = body.description ? String(body.description).trim() : "";
    if (description.length > GROUP_DESCRIPTION_MAX) throw new ApiError(`Description must be ${GROUP_DESCRIPTION_MAX} characters or fewer`, 400);
    out.description = description || null;
  }
  return out;
}

/**
 * Stale-edit guard: the editor sends the values it loaded as `expected`; if another
 * admin changed the group since, the save is refused instead of overwriting it.
 */
export function assertGroupCurrent(expected: unknown, current: GroupFields) {
  if (!expected || typeof expected !== "object") return;
  const e = expected as Partial<Record<keyof GroupFields, unknown>>;
  const same =
    (e.name === undefined || e.name === current.name) &&
    (e.description === undefined || (e.description || null) === current.description);
  if (!same) throw new ApiError("This group was changed by someone else. Reload to see the latest version.", 409);
}
