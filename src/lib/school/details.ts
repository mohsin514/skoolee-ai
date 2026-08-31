// ─────────────────────────────────────────────────────────────────
// Shared validation for institution identity fields.
//
// The same School and Campus columns are written from three places —
// the onboarding wizard, Campus Control's add-campus form, and the edit
// dialogs. Keeping the rules here means a value that onboarding accepts
// cannot be rejected by the edit form, or vice versa.
// ─────────────────────────────────────────────────────────────────

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Roughly 1.5 MB of base64, matching what the upload controls accept. */
const MAX_LOGO_CHARS = 2_000_000;

/** Trimmed, or null when the field was left blank. */
export function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Required text, trimmed. Throws with a field-named message when empty. */
export function requiredText(value: unknown, field: string): string {
  const trimmed = optionalText(value);
  if (!trimmed) throw new Error(`${field} is required.`);
  return trimmed;
}

export function assertEmail(value: string | null, field: string) {
  if (value && !EMAIL_PATTERN.test(value)) throw new Error(`Enter a valid ${field}.`);
  return value;
}

/**
 * A real IANA zone, or null when the value is unusable.
 *
 * Returning null rather than throwing lets callers fall back to the stored
 * value (or the schema default) instead of failing a whole save because a
 * browser reported a zone we do not carry.
 */
export function safeTimezone(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Founding year as a number, or null. Throws when out of plausible range. */
export function parseEstablishedYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const year = Number(value);
  if (!Number.isFinite(year)) throw new Error("Please enter a valid established year.");
  if (year < 1800 || year > new Date().getFullYear() + 1) {
    throw new Error("Please enter a valid established year.");
  }
  return year;
}

/**
 * An http(s) URL or an inline data image, or null.
 *
 * Logos reach the server as data URLs from the file pickers, so the size cap
 * lives here rather than at the network layer — a multi-megabyte logo would
 * otherwise be written straight into the row and re-read on every dashboard.
 */
export function parseLogo(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^logos\/(school|campus)\/\S+$/i.test(trimmed)) return trimmed;
  if (trimmed.length > MAX_LOGO_CHARS) throw new Error("That logo image is too large — use one under 1.5 MB.");
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
  throw new Error("Use an uploaded image or a valid image URL for the logo.");
}

/** A date-only string as UTC midnight, or null. */
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
