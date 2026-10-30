import { ApiError } from "@/lib/api/scope";

// SKAI-168: one rule set for student category writes (setup panel, fee discounts, admissions).
export const CATEGORY_NAME_MAX = 60;
export const CATEGORY_DESCRIPTION_MAX = 240;

export type CategoryFields = { name: string; description: string | null; isActive: boolean };

/** Collapses inner whitespace so "Staff  child" and "Staff child" are the same name. */
export function cleanCategoryName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Validates a create (`partial` false) or an edit (`partial` true); returns only the fields sent. */
export function parseCategoryInput(body: Record<string, unknown>, partial: boolean): Partial<CategoryFields> {
  const out: Partial<CategoryFields> = {};
  if (!partial || body.name !== undefined) {
    const name = cleanCategoryName(body.name);
    if (!name) throw new ApiError("Category name is required", 400);
    if (name.length > CATEGORY_NAME_MAX) throw new ApiError(`Category name must be ${CATEGORY_NAME_MAX} characters or fewer`, 400);
    out.name = name;
  }
  if (!partial || body.description !== undefined) {
    const description = body.description ? String(body.description).trim() : "";
    if (description.length > CATEGORY_DESCRIPTION_MAX) throw new ApiError(`Description must be ${CATEGORY_DESCRIPTION_MAX} characters or fewer`, 400);
    out.description = description || null;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") throw new ApiError("isActive must be true or false", 400);
    out.isActive = body.isActive;
  } else if (!partial) {
    out.isActive = true;
  }
  return out;
}

/**
 * Stale-edit guard: the editor sends the values it loaded as `expected`; if another
 * admin changed the category since, the save is refused instead of overwriting it.
 */
export function assertCategoryCurrent(expected: unknown, current: CategoryFields) {
  if (!expected || typeof expected !== "object") return;
  const e = expected as Partial<Record<keyof CategoryFields, unknown>>;
  const same =
    (e.name === undefined || e.name === current.name) &&
    (e.description === undefined || (e.description || null) === current.description) &&
    (e.isActive === undefined || e.isActive === current.isActive);
  if (!same) throw new ApiError("This category was changed by someone else. Reload to see the latest version.", 409);
}

/** Names compare case-insensitively within a campus: "Scholarship" and "scholarship" are one category. */
export function sameCategoryName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}
